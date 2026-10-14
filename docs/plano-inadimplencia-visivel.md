# Plano de execução — Inadimplência visível (3 entregas)

Autor: arquiteto · Data: 14/10/2026 · Base: commit 8eac327e (main)
Contrato aprovado pelo dono: `docs/proposta-inadimplencia-visivel.html` + `docs/mockups/inadimplencia-telas.html` (telas 0 a 15).
Tudo abaixo foi confirmado lendo o código; o que NÃO deu para confirmar está na seção 9.

---

## 0. Leia primeiro — 6 achados que mudam ou limitam o mockup

1. **Não existe "aprovar" para pedido NORMAL.** Em `frontend/src/pages/Pedidos/ListaPedidos.jsx` (linhas ~1805-1915) os únicos botões de aprovação são para ESPECIAL ("Aprovar agora" l.1813, "Faturar" l.1854, "Converter em pedido c/ NF" l.1816/1838/1859) e BONIFICAÇÃO ("Aprovar" l.1877, "Faturar" l.1904). Pedido normal (ENVIAR) é enviado pelo worker sem clique de aprovação; a trava dele já é `pedidoController.criar` (l.~401-495). O mockup da Tela 2 desenha um pedido normal #3188 "Pendente de aprovação" — isso **não existe no código**. Interpretação adotada: a **faixa vermelha** aparece no modal de QUALQUER pedido; a **trava no botão** vale para as ações que existem (aprovar especial, faturar especial, converter especial, aprovar/faturar bonificação). Mesma lógica para a Tela 14 (ver 4.14). **Pergunta ao dono (P2, seção 8).**
2. **`criar()` hoje isenta especial e bonificação** (`!dadosPedido.especial && !dadosPedido.bonificacao`, pedidoController.js l.~403), mas o **front NovoPedido NÃO isenta** (NovoPedido.jsx l.1218 e 1871 só olham `inadimplenciaCliente.inadimplente`). Divergência que já existe: o vendedor é barrado na tela mesmo quando o servidor deixaria passar. Na Entrega 2 o front passa a espelhar o back (ver 4.4) — decisão P3.
3. **A régua AUTOMÁTICA nunca usou o Set de "espera"** para pedido normal: em `cobrancaService.montarGrupos` (l.274-283) o filtro só roda dentro de `if (incluirEspecial)` (painel e "Cobrar agora"). Logo a Entrega 1 **não** gera rajada de WhatsApp automático de cobrança; o que muda é o **painel de inadimplentes** e o **"Cobrar agora"**. Em compensação a régua automática hoje cobra quem está legitimamente em espera (Pix pago na rua) — a Entrega 1 passa a aplicar o Set sempre (corrige isso). Mesmo assim: conferir `global.ativo` da régua antes do deploy (ver riscos).
4. **Carência/valor mínimo: texto do mockup é ambíguo.** O resumo do mockup diz "Em atraso = depois de 3 dias de carência e se passar de R$ 50", mas a Tela 15 e a proposta (decisão 6) dizem que atraso menor "aparece mas não trava". Segui a orientação do gerente: **selo desde o 1º dia; carência e mínimo só para `bloqueiaVenda`**. O texto da Tela 15 e o resumo do mockup precisam ficar coerentes com isso (P1).
5. **Trava na aprovação do especial precisa ignorar a própria conta do pedido.** A parcela do especial "nasce vencida no dia da venda" (comentário em cobrancaService.js l.~232). `converterEspecial` roda em especial JÁ faturado, que já tem `ContaReceber` própria: sem `ignorarPedidoId` o pedido se bloquearia sozinho.
6. **`POST /api/config/:key` não tem checagem de admin** (configController.save grava qualquer chave para qualquer logado). Por isso a config nova ganha rota PRÓPRIA com admin; e a chave nova não pode depender dessa rota.

---

## 1. Decisões de arquitetura (valem para as 3 entregas)

### 1.1 Fonte única: `backend/services/inadimplenciaService.js` (NOVO)
Funções exportadas (assinaturas congeladas — o front e os outros services dependem delas):

```
carregarConfig({ fresh? })                       -> cfg  (de config/inadimplenciaConfig.js)
classificarConta(conta, cfg, hojeSP)             -> { destino, motivo }   // PURA, testável sem banco
   destino: 'DEVE' | 'A_CONFIRMAR' | 'EM_ESPERA' | 'FORA'
   motivo (quando FORA): 'FUNCIONARIO' | 'ESPECIAL_NAO_ENTREGUE' | 'TOLERANCIA'
situacaoPorClientes(clienteIds[], { ignorarPedidoId?, fresh? })
   -> Map<clienteId, Situacao>
Situacao = {
  inadimplente: bool,            // totalVencido > tolerância (R$ 1,00) — selo vermelho, sem carência
  totalVencido: number,          // Σ saldo das parcelas vencidas das contas DEVE
  parcelasVencidas: int,
  diasMaisAntiga: int|null,
  aConfirmar: { valor, dias, forma, parcelas } | null,   // selo amarelo
  bloqueiaVenda: bool            // inadimplente && Σ saldo das parcelas com atraso >= carência >= valorMinimoBloqueio
}
detalheCliente(clienteId, { ignorarPedidoId? })  -> { ...Situacao, contas:[...] }   // alimenta GET /clientes/:uuid/inadimplencia
idsContasForaDaInadimplencia({ clienteIds?, contaIds?, desdeDias? }) -> Set<contaId>
   // substitui idsContasEmEsperaDeConferencia/contasAguardandoConferencia nos agregados.
   // Set = contas que NÃO contam como "em atraso vermelho" (EM_ESPERA + A_CONFIRMAR + FORA).
clienteIdsEmAtraso({ somenteBloqueio? })         -> string[]   // filtro "Só clientes em atraso"
exigirResponsavel({ clienteId, permissoes, nomeUsuario, ignorarPedidoId, aVista? })
   -> { bloqueado:false, obs? } | { bloqueado:true, status:403, codigo:'CLIENTE_EM_ATRASO', mensagem }
classificarFormaRecebimento(nome, { cobrancaAsaasId })  -> 'DINHEIRO'|'PIX_ASAAS'|'PIX'|'CARTAO'|'OUTRA'
```

Regras de `classificarConta` (nesta ordem; tudo sobre contas `ABERTO|PARCIAL`, com o OR explícito `pedidoId null` / `pedido.statusEnvio != EXCLUIDO` / `situacaoCA null OR != CANCELADO` — **nunca `NOT`**, copiar de clienteController.js l.255-266):
1. Conta sem pedido (importada/avulsa) -> segue direto para o passo 5.
2. **Funcionário** (se `cfg.funcionarioFora`): `normalizar(pedido.nomeCondicaoPagamento)` OU qualquer `pagamentosReais.formaPagamentoNome` contém `funcionario` -> FORA/FUNCIONARIO. (Campo exato não confirmado — ver seção 9; o diag mostra qual bateu.)
3. **Especial não entregue**: `pedido.especial && statusEntrega ∉ {ENTREGUE, ENTREGUE_PARCIAL}` -> FORA/ESPECIAL_NAO_ENTREGUE. (`DEVOLVIDO` continua contando, como hoje.)
4. **Espera**: pedido ENTREGUE/ENTREGUE_PARCIAL e `elegivel` = Σ `pagamentosReais.valor` de linhas `valor>0`, `ehRecebimentoProprio` (não-responsável — reaproveitar de recebimentoEntregaService) e `classificarFormaRecebimento` ∈ {DINHEIRO, PIX_ASAAS, PIX, CARTAO}; PIX_ASAAS só vale se a `CobrancaAsaas` estiver `RECEBIDO` (mesma regra do caixa.js l.2898, que ignora cobrança estornada). Se `elegivel >= saldoAberto - R$ 1,00` -> EM_ESPERA; se a forma predominante é PIX ou CARTAO e `dias(hoje - dataEntrega, fallback createdAt do pagamento) > cfg.esperaPixDias` -> **A_CONFIRMAR** `{valor: min(saldo, elegivel), dias, forma}`. Pagou só parte: segue como DEVE pelo saldo todo (igual hoje: "só sai da cobrança quem pagou o saldo INTEIRO").
5. **DEVE**: parcelas `PENDENTE|PARCIAL|VENCIDO` com `dataVencimento < hoje(SP 00:00Z)`, saldo = valor - valorPago - valorDescontoTotal; **parcela com saldo <= R$ 1,00 é ignorada** (tolerância; mata o "devendo R$ 0,10").

`bloqueiaVenda` = `inadimplente` E `Σ saldo das parcelas com diasAtraso >= cfg.carenciaDias` >= `cfg.valorMinimoBloqueio`. (Fim de semana: NÃO usar `vencimentoEfetivo` da régua; contagem simples em dias corridos. Decisão simples, documentada.)

### 1.2 Como classificar a forma de pagamento (recomendação)
**Recomendo: lista fechada por NOME, centralizada numa função só (`classificarFormaRecebimento`), sem coluna nova.** Motivos, todos verificados:
- `PedidoPagamentoReal.formaPagamentoNome` é o snapshot gravado na hora; `formaPagamentoEntregaId` é nullable (schema l.1698-1730) e `FormaPagamentoEntrega` só tem `nome` (schema l.1684) — coluna `tipo` nova precisaria de backfill + tela de cadastro + e linhas antigas continuam sem tipo.
- O sistema inteiro já classifica por nome (`classificarBaixaPorForma` em recebimentoEntregaService.js l.76-88; `isFormaElegivel`/`mapMetodoPagamentoCA` em caixa.js l.2890-2910). Uma terceira regra divergente seria bug futuro.
- **Falha para o lado seguro:** nome desconhecido => 'OUTRA' => NÃO esconde a dívida. Coluna nula faria o contrário (esconder em silêncio).
Algoritmo: normalizar (minúsculo, sem acento). Se contém `boleto`, `dias`, `prazo`, `responsavel`, `funcionario` -> OUTRA. Senão `dinheiro|especie` -> DINHEIRO; `pix` -> PIX; `cartao` -> CARTAO. `cobrancaAsaasId` presente -> PIX_ASAAS. O diag lista todas as `formaPagamentoNome` distintas de produção com a classe resultante (para o dono ver se alguma forma ficou mal classificada). Evolução futura (fora de escopo): coluna `tipo` opcional que, se preenchida, vence o nome.

### 1.3 Config
- `backend/config/inadimplenciaConfig.js` (NOVO), espelho de `config/caixaConferenciaConfig.js`: `CHAVE='inadimplencia_config'` em `app_configs`, `PADRAO`, cache de 30 s, `get({fresh})`, `salvar(parcial, usuario)`, `limparCache`.
  `PADRAO = { carenciaDias:3, valorMinimoBloqueio:50, esperaPixDias:7, funcionarioFora:true, motoristaVeAtraso:true, siteExigeResponsavel:true }`. `siteExigeResponsavel` é TRAVADA: o `salvar` ignora tentativa de mudar (cadeado do mockup). Validação: inteiros 0-365, valor 0-100000, booleanos.
  Falha de leitura do banco -> devolve PADRAO (nunca derruba o selo).
  **`bloqueiaVenda` e `exigirResponsavel` chamam `get({ fresh: true })`** (a trava não pode usar cache de 30 s depois de o admin mexer); selo/lista pode usar cache.
- Rotas (`backend/routes/inadimplenciaRoutes.js`, NOVO, montado em `index.js` como `app.use('/api/inadimplencia', authMiddleware, inadimplenciaRoutes)`):
  - `GET /config` (qualquer logado — o checkout do motorista precisa de `motoristaVeAtraso`) -> cfg + `ultimaMudanca` por chave.
  - `PUT /config` (**só admin**: `req.user.permissoes.admin`, igual `caixa.js` l.292) -> grava parcial e devolve cfg.
  - `GET /config/historico` (só admin) -> últimas 100 mudanças.
  - `POST /lote` `{ ids:[...] }` (máx. 500; Entrega 2) -> `{ data: { [clienteId]: Situacao-resumida } }`.
- **Histórico de quem mudou**: padrão do projeto = `AuditLog` (schema l.1979; usado em caixa.js, configNotas.js). Uma linha por chave alterada: `acao:'CONFIG_INADIMPLENCIA'`, `entidade:'AppConfig'`, `entidadeId:'inadimplencia_config'`, `detalhes: JSON {chave, de, para}`, `usuarioId`, `usuarioNome`. Gravar **depois** do upsert, em `try/catch` próprio (log nunca desfaz a config). Não precisa `$transaction`.
- **Sem permissão nova** (reusa admin, `Pode_Vender_Inadimplente`, `Pode_Editar_Cobranca`) -> nada a registrar no `BOOL_INDEX` do painel de permissões.

### 1.4 Dados e performance
- Tudo é leitura; nenhuma migration; nenhum campo de schema muda (regra Prisma ok).
- Consulta em lote: UMA `contaReceber.findMany({ where:{clienteId:{in:ids}, status:{in:['ABERTO','PARCIAL']}, OR:[...]}, select:{ id, clienteId, parcelas:{select...}, pedido:{select:{especial,statusEntrega,dataEntrega,nomeCondicaoPagamento,pagamentosReais:{select:{valor,formaPagamentoNome,cobrancaAsaasId,createdAt,responsavelPapel,escritorioResponsavel,vendedorResponsavelId}}}} } })` + UMA consulta de `cobrancaAsaas` por ids coletados. Sem N+1.
- Para agregados globais (`idsContasForaDaInadimplencia` sem `clienteIds`): cache em memória de 60 s (só nesse caminho; selo/bloqueio nunca usam cache). Hoje essa mesma varredura roda 7 vezes por carregamento de dashboard (dashboards.js x3, adminDashboard x2, financeiroGerencial x2). O recorte `desdeDias:90` pode ser mantido nos agregados.
- `$transaction`: nenhuma nova. As travas de aprovação são checagens ANTES da transação existente (aprovarEspecial l.~742 já usa `$transaction`; ao tocar nesse arquivo conferir se as transações vizinhas têm `{timeout:20000,maxWait:10000}` — regra boy scout do CLAUDE.md).

---

## 2. ENTREGA 1 — Corrigir o cálculo (só backend)

### 2.1 Arquivos
**Criar**
- `backend/services/inadimplenciaService.js` (1.1)
- `backend/config/inadimplenciaConfig.js` (1.3)
- `backend/routes/inadimplenciaRoutes.js` — nesta entrega só `GET/PUT /config` e `GET /config/historico` (o `/lote` entra na Entrega 2)
- `backend/scripts/teste-inadimplencia.js` — script de teste contra `hardt_local` (padrão de `teste-baixa-especial-ledger.js`): cria clientes/pedidos/contas de cada caso da seção 2.5 e afirma o resultado.

**Alterar**
| Arquivo | O que muda |
|---|---|
| `backend/index.js` | monta `/api/inadimplencia` com authMiddleware |
| `backend/routes/adminExec.js` | `GET /diag-inadimplencia` (2.4) + bump do `deployMarker` (l.55) |
| `backend/controllers/clienteController.js` | `listar` (l.247-310): troca o bloco `delinqMap` por `situacaoPorClientes(clienteIds)`; resposta mantém `inadimplente`, `totalVencido` e ACRESCENTA `aConfirmar`, `diasMaisAntiga`, `bloqueiaVenda`. `obterInadimplencia` (l.1085-1190): usa `detalheCliente`; mantém `inadimplente,totalVencido,parcelasVencidas,contas[]` (contas -> parcelas -> `diasAtraso`, `status`, `baixadoPorNome`...) e ACRESCENTA no topo `aConfirmar,diasMaisAntiga,bloqueiaVenda` e por conta `situacao` ('EM_ATRASO'\|'A_CONFIRMAR'\|'EM_ESPERA'\|'FORA'\|'EM_DIA') e `foraMotivo` |
| `backend/controllers/pedidoController.js` | `criar` (l.~401-495): troca `buscarParcelasVencidas`/`contasAguardandoConferencia` por `exigirResponsavel`. **Preservar exatamente**: isenção de especial/bonificação; sync `sincronizarContasCliente` antes de bloquear (re-chama o service depois); escape "à vista" para quem não tem permissão; texto da observação "se responsabiliza". Só bloqueia se `bloqueiaVenda` (antes: qualquer centavo) |
| `backend/routes/cobrancasRota.js` | l.181-182: `idsContasForaDaInadimplencia({ contaIds })` (o service carrega os próprios campos — não depender dos `select` do chamador) |
| `backend/services/cobrancaService.js` | l.274-283: aplicar `idsContasForaDaInadimplencia()` **sempre** (não só com `incluirEspecial`); manter `emEsperaDeConferencia` na resposta do painel (campo existente usado por ReguaCobrancaPage l.200) |
| `backend/routes/dashboards.js` | l.29 e usos (l.243, l.850): troca `idsEmEsperaConferencia` por `idsContasForaDaInadimplencia({desdeDias:90})` |
| `backend/routes/adminDashboard.js` | idem (l.13, 244, 1047) |
| `backend/services/financeiroGerencialService.js` | idem (l.880, 181, 891) |
| `backend/services/iaClienteService.js` | `situacaoFinanceira` (l.323-324): trocar SÓ a origem do Set (`idsContasForaDaInadimplencia({clienteIds:[uuid]})`). O laço e TODOS os campos da resposta ficam como estão (contrato /v1 congelado). **Não mexer em `iaConsultaRoutes.js`.** |
| `backend/services/recebimentoEntregaService.js` | NÃO apagar `idsContasEmEsperaDeConferencia`/`contasAguardandoConferencia`: marcar `@deprecated` (o diag usa como "antigo" e `scripts/teste-baixa-especial-ledger.js` l.434-450, 980, 1389, 1531 ainda os testa). Remoção só depois de validar em produção |
| `backend/docs/ia-consulta-api.md` | nota: `inadimplente`/`valorVencido` da situação financeira passam a seguir a regra nova (sem mudança de formato) |

**Não tocar** em contas a receber `routes/contasReceber.js` l.881-897 (`totalVencidas` do KPI da tela de títulos): é a tela da verdade dos títulos, mostra tudo vencido. Vai divergir do selo por cliente (R$ 15,8 mil vs R$ 12,4 mil) — comportamento aceito, avisar o dono (P5).

### 2.2 Ordem de execução (dev-backend, sequencial)
1. `inadimplenciaConfig.js` + rotas de config + AuditLog.
2. `inadimplenciaService.js` com `classificarConta` pura + `teste-inadimplencia.js` (casos puros primeiro).
3. `diag-inadimplencia` (permite ao QA comparar antes de migrar consumidores).
4. Migrar consumidores nesta ordem (do menor risco ao maior): dashboards/adminDashboard/financeiroGerencial -> cobrancasRota -> cobrancaService -> clienteController.listar -> clienteController.obterInadimplencia -> iaClienteService -> pedidoController.criar (por último: é o que bloqueia venda).
5. Bump `deployMarker`, atualizar docs da API de IA.
Front: **nenhum trabalho** nesta entrega (campos acrescentados são ignorados pelas telas atuais; `inadimplente`/`totalVencido` mantêm nome). Única exceção a conferir: NovoPedido.jsx l.1218 continua bloqueando por `inadimplente` — passa a ser mais rígido que o servidor (carência/mínimo) até a Entrega 2; aceito, está no risco R4.

### 2.3 Contrato de dados (Entrega 1)
`GET /api/clientes` (cada item): `inadimplente`, `totalVencido` (existentes) + `diasMaisAntiga:int|null`, `aConfirmar:{valor,dias,forma,parcelas}|null`, `bloqueiaVenda:bool`.
`GET /api/clientes/:uuid/inadimplencia`: ver 2.1. `GET/PUT /api/inadimplencia/config`: `{carenciaDias, valorMinimoBloqueio, esperaPixDias, funcionarioFora, motoristaVeAtraso, siteExigeResponsavel, ultimaMudanca:{[chave]:{usuarioNome, em}}}`.
Erro 403 de trava (criar/aprovar): `{ error: '<mensagem>', codigo:'CLIENTE_EM_ATRASO', totalVencido, diasMaisAntiga }` (campos novos aditivos).

### 2.4 `GET /api/admin-exec/diag-inadimplencia?clienteId=<uuid>|q=<nome>[&formas=1]`
Devolve `{ novo: Situacao+contas com destino/motivo por conta, antigo: {inadimplente,totalVencido,parcelasVencidas, idsEmEspera}, diferenca, formas?: [{nome, classe, qtd}] }`. "Antigo" = cálculo legado reimplementado dentro do diag a partir de `idsContasEmEsperaDeConferencia` (por isso as funções antigas ficam). Sem `clienteId`: resumo global (quantos clientes/valores mudaram de status) — é o número que o dono quer ver (esperado ~R$ 15,8 mil vencidos; escondidos hoje R$ 11,1 mil).

### 2.5 Casos de teste (script + QA em produção via diag)
Gourmet Lanches (3 boletos, R$ 1.247,08) -> `inadimplente:true`, 57 dias, `bloqueiaVenda:true`. Panificadora Daiane e Jerry Adriano (Pix comum 18-63 dias) -> `aConfirmar` (não vermelho). Aquarius (Pix 12 d) -> `aConfirmar`. Cliente "À vista - Funcionário" -> fora. Especial não entregue com parcela vencida -> fora. Lucia Maria (R$ 0,10) -> fora. Elida Neves (126 d) -> vermelho. Boleto vencido há 2 dias, R$ 40 -> `inadimplente:true`, `bloqueiaVenda:false`. Pix de hoje cobrindo o saldo -> fora (espera). Pix + boleto misturados cobrindo só parte -> DEVE pelo saldo todo.

### 2.6 Riscos / o que pode quebrar (Entrega 1)
- R1 **Efeito operacional imediato**: vendedores voltam a ser bloqueados (criar) para ~21 clientes; painel de inadimplentes e "Cobrar agora" voltam a listá-los; KPIs de aging/vencido de dashboards SOBEM ~R$ 11 mil. Avisar o dono antes do deploy.
- R2 **WhatsApp**: nenhum envio novo automático para boletos (a régua automática já os cobrava — achado 3). Mas conferir `GET /api/cobranca` (config global `ativo`) antes e depois; "Cobrar agora" continua manual e transacional (`tipo` e `referencia` já definidos em cobrancaService l.505). Não criar caminho de envio novo.
- R3 **API de IA /v1**: `situacaoFinanceira` muda de valor, não de formato. Rodar `curl` em `/api/ia-consulta/v1/...situacao-financeira` (exemplos em `backend/docs/ia-consulta-api.md`) antes do commit. Nenhum aviso em `iaConsultaVersao.js` é necessário (campo não removido); avisar o time do bot que o `inadimplente` agora é o correto.
- R4 Tela NovoPedido mais rígida que o servidor entre as Entregas 1 e 2 (aceito; curto).
- R5 `desdeDias:90` nos agregados: `especial não entregue` não tem `dataEntrega` e entra sempre (o `OR dataEntrega null` já existe — manter, Prisma `gte` exclui null). Funcionário com entrega > 90 dias não entra no Set e volta a contar nos agregados; aceitável (ou remover o recorte; decidir no código, impacto pequeno).
- R6 Consumidores não migrados = número diferente entre telas. Fechar com o grep: `grep -rnE "idsContasEmEsperaDeConferencia|contasAguardandoConferencia|delinqMap" backend frontend/src` deve restar só no próprio `recebimentoEntregaService`, no diag e nos scripts de teste.
- R7 Peso: `listar` de clientes (limit 2000) passa a carregar `pagamentosReais` de todas as contas abertas. Medir o tempo antes/depois no diag; se passar de ~1 s, cortar o select para contas com parcela vencida (ou lazy só nelas).

### 2.7 Critérios de aceite (Entrega 1 — testáveis)
1. `diag-inadimplencia?clienteId=<Gourmet>` mostra `antigo.inadimplente=false` e `novo.inadimplente=true`, R$ 1.247,08, 3 parcelas, 57 dias.
2. Daiane/Jerry Adriano: `novo.aConfirmar` preenchido, `inadimplente=false`.
3. `diag-inadimplencia` sem cliente: soma de `totalVencido` nos clientes vermelhos ≈ R$ 12,4 mil/21 clientes (dados de produção de hoje podem variar; comparar com o antigo).
4. Na tela Clientes (sem alterar tela): Gourmet aparece com "Inad. R$ 1.247,08"; Rota idem; Novo Pedido com vendedor SEM permissão e condição a prazo -> 403 com a mensagem existente; com permissão -> passa e a observação ganha o "[Nome se responsabiliza...]".
5. Cliente com atraso R$ 40 há 2 dias: selo aparece, venda NÃO bloqueia.
6. Régua > aba Inadimplentes lista Gourmet; "Cobrar agora" envia 1 mensagem (ver `bot_whatsapp_envios`, tipo `cobranca`, referência única); 2º clique rápido não duplica.
7. Painéis (`/dashboards`, Financeiro > Visão geral) carregam sem erro e o "vencido" subiu.
8. `PUT /api/inadimplencia/config` como vendedor comum -> 403; como admin -> 200 e a linha aparece em `GET /config/historico`; `siteExigeResponsavel` não muda.
9. `node backend/scripts/teste-inadimplencia.js` e `teste-baixa-especial-ledger.js` passam.
10. `curl` da API de IA com o mesmo formato de antes.

### 2.8 Divisão
dev-backend faz tudo. dev-frontend: zero. QA: roda os critérios 1-10 (os de tela local + diag em produção depois do deploy; deploy conferido pelo `deployMarker` no `/admin-exec/ping`). Revisor: conferir os `grep` do R6, o OR explícito (nunca `NOT`/`notIn` com null), `select` de Prisma contra o schema (campo inexistente derruba a rota), e que `iaConsultaRoutes.js` não está no diff.

---

## 3. Contrato entre as entregas (a COSTURA)

| Produtor (back) | Consumidor (front) | Campo/endpoint | Nome exato |
|---|---|---|---|
| clienteController.listar | ListaClientes, RotaLeads, (Mapa via mapaClientesService) | item do cliente | `inadimplente, totalVencido, diasMaisAntiga, aConfirmar{valor,dias,forma,parcelas}, bloqueiaVenda` |
| clienteController.obterInadimplencia | PopupContasEmAberto, NovoPedido, DetalheCliente (faixa+aba), Checkout motorista | resposta | idem + `contas[].situacao`, `contas[].foraMotivo` |
| POST /api/inadimplencia/lote | `clienteService.inadimplenciaLote(ids)` + hook `useInadimplenciaLote` | `{data:{[id]:Situacao}}` | `Situacao-resumida` = `{inadimplente,totalVencido,diasMaisAntiga,aConfirmar,bloqueiaVenda}` |
| pedidoController.listar (paginado) | ListaPedidos | cada pedido | `pedido.inadimplencia` = Situacao-resumida do `pedido.clienteId` (ou `null`) |
| GET /api/inadimplencia/config | Configuracoes card, checkout motorista | cfg | `carenciaDias,valorMinimoBloqueio,esperaPixDias,funcionarioFora,motoristaVeAtraso,siteExigeResponsavel` |
| 403 de trava | NovoPedido, ListaPedidos, SiteAdmin, PainelPendencias | `error.response.data.codigo==='CLIENTE_EM_ATRASO'` | mostrar `error` em toast; NUNCA genérico |
| congeladosService.adminListarPedidos | SiteAdmin | cada pedido | `inadimplencia` (+ `bloqueiaVenda`) |
| pendenciasService | PainelPendencias | bloco novo `liberacao_inadimplente` | itens com `clienteId` |

Regra de ouro da costura: o front **nunca recalcula** inadimplência; só mostra o que o back mandou. O que bloqueia uma ação no front é o MESMO campo (`bloqueiaVenda`) que o back usa para devolver 403. Uma única fonte -> não há "front bloqueia, back deixa" nem o inverso.

---

## 4. ENTREGA 2 — Selo em todas as telas

### 4.1 Decisão: embutir ou lote?
- **Pedidos (lista):** EMBUTIR em `pedidoController.listar` (modo paginado `{items,...}`), porque (a) o controller já enriquece cada página com Asaas (l.84-107) — padrão existente; (b) o filtro "Só clientes em atraso" tem que ser **no servidor** (paginação 50 + "Carregar mais"; filtrar no navegador mostraria página meio vazia); (c) uma consulta em lote dos `clienteId` da página. **NÃO** embutir em `pedidoService.listar` (modo legado devolve array e é usado por Rota/HistoricoModal/DetalheCliente; custo sem ganho). Filtro: parâmetro `soEmAtraso=1` -> `where.clienteId in clienteIdsEmAtraso()` aplicado no `listar` do service depois do `whereBase`; os chips de contagem NÃO devem ser filtrados por ele (mesmo cuidado do `notaBonificacao`, pedidoService l.240-247).
- **Demais telas:** LOTE (`POST /api/inadimplencia/lote`) + hook `frontend/src/hooks/useInadimplenciaLote.js(ids)` com cache em memória por 30 s e deduplicação (uma chamada por render de lista). Embutir nas 7 rotas custaria 7 alterações de back e 7 chances de esquecer o campo; o hook custa 1 + 1 linha por tela. Exceções que já recebem pronto: Clientes (listar) e Rota (listar).
- Mapa: embutir no payload de `/api/mapa-clientes` (`mapaClientesService.js` do back), porque o filtro/colorir precisa de TODOS os clientes de uma vez (payload ~670 KB; acrescentar 3-4 campos curtos só nos devedores).

### 4.2 Arquivos a criar (front)
- `frontend/src/components/SeloInadimplencia.jsx` — props: `situacao`, `compacto`, `onClick`. 4 variantes (vermelho/amarelo × normal/compacto). Texto vermelho: `Em atraso R$ X · Nd`; compacto `R$ X · Nd`; amarelo `A confirmar R$ X · Pix Nd` (forma vem de `aConfirmar.forma`). Se `situacao` nulo ou nada a mostrar -> `null`. Clique faz `stopPropagation` (linhas de lista são clicáveis). Cores: tokens do tema; vermelho = `bg-red-600 text-white`, amarelo = `bg-amber-100 text-amber-800` (cores semânticas de badge NÃO mudam). `title` com texto longo para acessibilidade.
- `frontend/src/components/PopupContasEmAberto.jsx` — **extraído** do modal de `ListaClientes.jsx` (l.1154-1260) e do modal duplicado de `Rota/RotaLeads.jsx` (l.401-520). Os dois são cópias: os dois passam a usar o componente e o código antigo é APAGADO (reutilizar, não duplicar). Props `{clienteId, clienteNome, onClose}`; busca com `clienteService.obterInadimplencia`. Mostra as contas com `situacao`; vermelho para `EM_ATRASO`, amarelo para `A_CONFIRMAR`. Botões novos:
  - "Cobrar agora (WhatsApp)": só se `hasPermission('Pode_Editar_Cobranca')` (= back: `admin || Pode_Editar_Cobranca`, cobrancaRoutes.js l.31-38). Chama `cobrancaService.cobrarCliente(clienteId)` (já existe, `POST /api/cobranca/cobrar/:clienteId`). `disabled` enquanto envia (anti clique duplo) e toast com o resultado (`ok:false` mostra `motivo`). **Não** criar caminho de WhatsApp novo.
  - "Abrir no Contas a Receber": só se `hasPermission('Pode_Acessar_Contas_Receber')` (a rota é `/financeiro/contas-receber/tabela`, App.jsx l.895; o back exige o mesmo, contasReceber.js l.20-27). Navega para `/financeiro/contas-receber/tabela?clienteId=<uuid>&clienteNome=<nome>`.
  - Responsivo: no celular vira bottom-sheet (padrão existente do modal da Rota: `items-end md:items-center`), botões `min-h-[44px]`.
- `frontend/src/hooks/useInadimplenciaLote.js` e `clienteService.inadimplenciaLote(ids)` (em `frontend/src/services/clienteService.js`, ao lado de `obterInadimplencia` l.19) -> `POST /inadimplencia/lote`.
- `frontend/src/pages/Admin/Configuracoes/VendaInadimplenteConfigCard.jsx` (Tela 15) e `frontend/src/services/inadimplenciaService.js`.

### 4.3 Back da Entrega 2 (pequeno, dev-backend)
1. `inadimplenciaRoutes.js`: `POST /lote`.
2. `pedidoController.listar`: anexar `inadimplencia` por pedido (try/catch como o bloco do Asaas — falha segue sem o campo) + parâmetro `soEmAtraso`.
3. **Travas de aprovação (back de verdade — sem isso é só visual):** em `pedidoController.aprovarEspecial` (l.729), `converterEspecial` (l.907) e `aprovarBonificacao` (l.943), logo após a checagem de permissão existente e ANTES da transação: `exigirResponsavel({ clienteId: pedido.clienteId, permissoes, nomeUsuario, ignorarPedidoId: id })`. Se `bloqueado` -> `res.status(403).json({error, codigo:'CLIENTE_EM_ATRASO', ...})`. Se liberado por quem tem `Pode_Vender_Inadimplente`/admin -> acrescentar a linha "[Nome se responsabiliza pela aprovação — cliente com R$ X em atraso]" em `observacoes` (aprovarEspecial já carrega o pedido; incluir no `data` do `tx.pedido.update` existente, sem transação nova). `converterEspecial` delega a `pedidoConversaoService.converterManual` — pôr a checagem no controller, não no service (o service também é chamado pela conversão automática por PIX, que NÃO é aprovação humana e não pode ser travada).
   Estas rotas mantêm a checagem `Pode_Aprovar_Especial`/`Pode_Aprovar_Bonificacao` (permissão de APROVAR continua necessária; a de inadimplente é ADICIONAL).
4. **Site/Ana:** `congeladosService.adminAprovarPedido` (l.1424) — o `cId` do cliente já é resolvido ali (l.1428-1437). Inserir a checagem logo depois dele (antes da conversão), recebendo `permissoes` e nome do usuário do controller (`congeladosController.adminAprovarPedido` l.157 passa só `aprovadoPorId` hoje: acrescentar `permissoes: req.user.permissoes, aprovadoPorNome`). Sem escape "à vista" no site (chave travada `siteExigeResponsavel`; o mockup da Tela 3 não tem "mudar para à vista"). Cliente sem cadastro (`PENDENTE_CADASTRO`) não tem cálculo — o erro "Cliente sem cadastro" existente continua primeiro. Observação do pedido gerado recebe a linha de responsável (localizar onde o service monta `observacoes`, ~l.1541). **Não alterar `criarPedidoSite`, `iaConsultaRoutes`, mensagens da Ana nem `/ia-consulta`** (decisão do dono).
   `adminListarPedidos` (l.1286): anexar `inadimplencia` por pedido pendente (lote pelos `clienteUuid` já vinculados; `congeladosCliente.clienteUuid`).
5. Embutir `inadimplente/totalVencido/diasMaisAntiga/aConfirmar/bloqueiaVenda` no payload de `mapaClientesService.js` (backend) por cliente.
6. IDs que faltam nas listas (aditivos, só adicionar campo): `routes/caixa.js` linhas de entrega (`clienteNome` em l.555, 978, 2530, 2559) ganham `clienteId`; `routes/embarques.js` l.204 (`cliente.select`) ganha `UUID: true`; `pendenciasService` itens ganham `clienteId`.
7. **Central de Pendências (Tela 14):** novo bloco `liberacao_inadimplente` (registrar em `DEFINICOES`/`TITULOS`/`ROTAS_VER_TODOS` de pendenciasService, l.408-415) = (a) especial/bonificação aguardando aprovação (mesmo `where` de `blocoPedidosAprovar`, l.58-61) cujo cliente tem `bloqueiaVenda` + (b) `CongeladosPedido` em `AGUARDANDO|PENDENTE_CADASTRO` com cliente vinculado e `bloqueiaVenda`. Para NÃO contar duas vezes, `blocoPedidosAprovar` passa a EXCLUIR os pedidos de cliente bloqueado — e os itens do novo bloco NÃO levam `acao` (o botão de 1 clique "Aprovar" geraria 403 para quase todos; sem `acao` o front mostra "Abrir", PainelPendencias.jsx l.71). Os 4 cartões do topo passam a somar o bloco (ajustar o somatório em `listarPendencias`, l.440-476). `rotaVerTodos`: `/pedidos` (lista com `soEmAtraso` salvo — ver 4.1) e `/site-admin` para os do site. Atualizar `backend/docs/pendencias-api.md`.

### 4.4 Telas (dev-frontend) — arquivo, dado, permissão
| Tela | Arquivo | De onde vem | Comportamento |
|---|---|---|---|
| 0 Popup | `PopupContasEmAberto.jsx` | `GET /clientes/:uuid/inadimplencia` | extração; botões novos por permissão (acima) |
| 1 Pedidos lista | `pages/Pedidos/ListaPedidos.jsx` (nome do cliente nos cards ~l.1584; filtros de status no topo) | `pedido.inadimplencia` | selo compacto após o nome; fundo `bg-red-50` só se `inadimplente` (amarelo não); filtro "Só clientes em atraso" com `useFiltroSalvo('lista-pedidos:soEmAtraso', false)` -> param `soEmAtraso=1`; entra na contagem de "N filtros ativos" |
| 2 Modal do pedido | `ListaPedidos.jsx` bloco de ações (l.1805-1915) | `selectedPedido.inadimplencia` (o objeto da lista) | faixa vermelha no topo do modal para qualquer pedido de cliente em atraso (texto: "Cliente com R$ X em atraso — N parcelas, a mais antiga há Nd · ver contas" -> abre o popup). **Botões** (ver tabela de permissões em 5): usar `podeLiberarInadimplente = user.permissoes.admin \|\| user.permissoes.Pode_Vender_Inadimplente` (mesma expressão do back); se `inadimplencia.bloqueiaVenda && !podeLiberarInadimplente`: botões "Aprovar agora"/"Faturar"/"Converter"/"Aprovar bonificação" ficam `disabled` (cinza) com o texto vermelho "Só um responsável pode liberar este pedido."; se `bloqueiaVenda && podeLiberar`: rótulo vira "Assumir responsabilidade e aprovar" (laranja, como o aviso do NovoPedido) e `window.confirm` informando que o nome entra na observação. Importante: o botão hoje SOME para quem não tem `Pode_Aprovar_*` (l.181/183) — continua sumindo; só a trava de inadimplência desabilita. Os 5 handlers (`handleAprovarEspecial` l.432, `handleConverterEspecial` l.473, `handleAprovarBonificacao` l.490) tratam `codigo==='CLIENTE_EM_ATRASO'` mostrando a mensagem do servidor |
| 3 Pedidos Online | `pages/SiteAdmin/SiteAdmin.jsx` (lista l.~205-225; detalhe l.238; `AprovarModal` l.413; botão l.361-366) | `pedido.inadimplencia` | selo compacto + caixa vermelha "Aguardando liberação de um responsável" (mesmo lugar/estilo da caixa "Sem estoque suficiente"); "Aprovar e gerar pedido" desabilitado / vira "Assumir responsabilidade e aprovar" (mesma regra); amarelo não trava. O pedido continua na fila |
| 4 Novo Pedido | `pages/Pedidos/NovoPedido.jsx` (banner l.1870-1890; bloqueio l.1217-1230; carga l.534-538) | `obterInadimplencia` | trocar `inadimplenciaCliente.inadimplente` por `bloqueiaVenda` no BLOQUEIO e no banner vermelho/laranja; `inadimplente && !bloqueiaVenda` -> faixa amarela "dentro da carência/abaixo do mínimo" (informativo); `aConfirmar` -> faixa amarela nova do mockup ("Cliente com R$ X a confirmar — Pix apontado há N dias · não bloqueia"). Alinhar com o back: o bloqueio só vale para tipo Pedido (não Especial/Bonificação) — decisão P3 |
| 5 Clientes lista | `pages/Clientes/ListaClientes.jsx` (desktop l.791, cards l.928) | já vem de `listar` | usar `SeloInadimplencia`; variante amarela nova; linha vermelha só se `inadimplente` |
| 6 Ficha | `pages/Clientes/DetalheCliente.jsx` (abas l.537-553, `abaAtiva`; campos antigos l.1662-1663) | `obterInadimplencia(uuid)` | faixa fixa abaixo do cabeçalho em todas as abas (vermelha ou amarela); nova aba "Financeiro" (contador = `parcelasVencidas`) com as contas e os botões "Cobrar agora"/"Abrir no Contas a Receber"; REMOVER só `Atrasos Pag.` e `Atrasos Rec.` (l.1662-1663), manter `Pagamentos Mês`/`Recebimentos Mês`. A aba usa o mesmo estilo de pílula das outras |
| 7 Rota | `pages/Rota/RotaLeads.jsx` (faixa l.654-662) | já vem de `listar` | faixa vermelha atual vira `SeloInadimplencia` largo + amarela; manter fundo `bg-red-50/40` só para `inadimplente` |
| 8 Atendimentos | `pages/Atendimentos/PainelAtendimentos.jsx` (nome l.528-532 e cards l.748) | `useInadimplenciaLote(ids de a.clienteId)` | selo compacto ao lado do WhatsApp; só cliente (lead não tem conta) |
| 9 Contas a Receber | `pages/Financeiro/ContasReceberTabela.jsx` (clienteNome; `clienteId` já vem do back, l.368) | lote por `clienteId` | selo mostra o TOTAL do cliente, repetido em cada linha dele. **Query param:** a tela hoje NÃO lê URL (filtros em `useFiltrosSalvos('contas-receber-tabela-v2')` l.238); o back JÁ aceita `clienteId` (contasReceber.js l.725/738). Adicionar `useSearchParams`: se vier `clienteId`, aplicar como filtro **transitório** (não persistir no `useFiltrosSalvos`, senão o usuário fica preso nele), mostrar chip "Cliente: <nome> ✕" que limpa o param e entra na contagem de filtros ativos |
| 10 Caixa | `pages/Caixa/CaixaDiarioPage.jsx` (`e.clienteNome` l.1070/1170) | lote por `e.clienteId` (novo, 4.3-6) | selo "deve + R$ X" = `totalVencido` - valor deste pedido se o pedido ainda estiver na conta vencida; não altera botão de baixa nem conferência |
| 11 Expedição | `pages/Admin/Embarques/DetalhesCargaModal.jsx` (nome l.403) | lote por `p.cliente.UUID` (novo, 4.3-6) | selo compacto; não bloqueia carregar |
| 12 Motorista | `pages/Motorista/Entregas/CheckoutEntregaModal.jsx` (etapa 3 pagamentos) | `obterInadimplencia` + `GET /inadimplencia/config` | faixa amarela só se `config.motoristaVeAtraso` e `inadimplente`; informativa, sem bloqueio |
| 13 Mapa | `pages/Clientes/MapaClientes.jsx`, `mapaClientes/FiltrosMapa.jsx`, `coresMapa.js`, `LegendaMapa.jsx`, `DrawerCliente.jsx`, `useDadosMapa.js` | payload do mapa | filtro "Só em atraso" (em `FILTROS_PADRAO`, persistido pelo `useFiltrosSalvos` que a tela já usa), opção "Colorir por: Inadimplência" (vermelho/âmbar/verde + legenda), selo no painel/drawer |
| 14 Pendências | `pages/Pendencias/PainelPendencias.jsx` | bloco `liberacao_inadimplente` | renderização genérica (blocos vêm do back); conferir só o título/ícone/cor |
| 15 Configurações | `pages/Admin/Configuracoes/Configuracoes.jsx` (padrão `ConferenciaCaixaConfigCard`, montado em `isAdmin &&` l.777) + card novo | `GET/PUT /inadimplencia/config` | card só para admin (o back também exige admin no PUT); cada linha mostra "Última mudança: quem · quando"; salva por chave; `siteExigeResponsavel` com cadeado; textos de carência/mínimo dizem "para BLOQUEAR a venda" (achado 4) |

Convenções que o dev-frontend NÃO pode esquecer: `SelectBusca` para qualquer dropdown; `useFiltrosSalvos`/`useFiltroSalvo` para o filtro novo (nada de `useState`); mobile-first sem scroll horizontal; `hasPermission('Pode_Editar_Cobranca')` (AuthContext l.107 já trata admin e booleano); `lazyComRetry` só se criar rota (não cria); nada de `window.open` (Abrir no Contas a Receber usa `navigate`); `npm run build` antes de entregar; sem animar box-shadow.

### 4.5 Ordem
Back primeiro (itens 1-7 de 4.3; ~1 dia), front em paralelo assim que o contrato da seção 3 estiver publicado em `docs` (o dev-frontend começa pelos componentes `SeloInadimplencia`/`PopupContasEmAberto` e pelo hook, que só dependem de campos que a Entrega 1 já entrega). Sequência de telas no front: componentes + extração do popup (Clientes e Rota — **regressão alta, testar primeiro**) -> Pedidos lista/modal -> NovoPedido -> Ficha -> restantes -> Configurações -> Pendências -> SiteAdmin -> Mapa.

### 4.6 Riscos (Entrega 2)
- E1 **Extração do popup** mexe em duas telas que funcionam (Clientes e Rota). Qualquer divergência de props quebra o card da Rota que o vendedor usa em campo. QA obrigatório nas duas, desktop e celular, com cliente devedor e cliente com erro de rede (modal mostra erro, não tela branca).
- E2 `ListaPedidos.jsx` tem 2354 linhas e 5 blocos de ações duplicados: não refatorar; criar UM helper (`const bloqueioInad = ...`) e aplicar nos 7 botões listados. Conferir que NENHUM botão de aprovação ficou sem a trava (grep `handleAprovar|handleConverter` no diff).
- E3 Trava só no front = falha. Provar com `curl`/QA que `PUT /pedidos/:id/aprovar-especial` devolve 403 para vendedor sem `Pode_Vender_Inadimplente` mesmo chamando direto.
- E4 `converterEspecial` e `ignorarPedidoId` (achado 5): testar com especial faturado de cliente que tem outras dívidas e com especial cuja única dívida é a própria.
- E5 Pendências: `blocoPedidosAprovar` deixa de listar pedidos de cliente bloqueado — conferir que o contador total não "perde" pedidos (soma dos dois blocos = soma antiga).
- E6 Lote em listas grandes: limitar 500 ids; Atendimentos/Contas a Receber paginam — hook deduplica e só pede ids novos.
- E7 `pedidoController.listar` com `soEmAtraso`: `clienteIdsEmAtraso()` varre todas as contas abertas; usar a versão cacheada de 60 s? NÃO (é filtro de lista, tolera 60 s; a trava nunca usa cache). Decidir no código, mas nunca cachear `exigirResponsavel`.
- E8 Permissões: falta de espelhamento é o erro recorrente do projeto (3 vezes na mesma entrega no passado). Revisor confere linha a linha a tabela da seção 5.
- E9 Kit Festa também tem fila de pedidos do site (`kitFestaService`); NÃO verifiquei se aprova por outro caminho. Fora de escopo; se existir, fica sem trava (registrar como pendência).
- E10 `atualizar()` de pedido (pedidoController l.572) não reavalia inadimplência: vendedor pode criar à vista e editar para a prazo. Pré-existente, fora de escopo; registrar.

### 4.7 Critérios de aceite (Entrega 2 — QA clicando)
1. Pedidos: cliente Gourmet mostra selo vermelho; Aquarius amarelo; cliente em dia sem selo. Filtro "Só clientes em atraso" lista só devedores, persiste ao reabrir a tela, e "Carregar mais" continua correto.
2. Modal de pedido especial pendente de cliente devedor: usuário com `Pode_Aprovar_Especial` SEM `Pode_Vender_Inadimplente` vê "Aprovar agora"/"Faturar"/"Converter" desabilitados + texto; clicando via URL/curl recebe 403. Usuário com as duas permissões vê "Assumir responsabilidade e aprovar" e a observação do pedido recebe o nome. Admin idem. Usuário sem `Pode_Aprovar_Especial` continua sem botão nenhum.
3. Mesmo para bonificação pendente e para "Converter em pedido c/ NF" (especial já faturado, sem se auto-bloquear).
4. Pedidos Online: pedido de cliente devedor mostra selo + caixa vermelha; "Aprovar e gerar pedido" travado para sem permissão (e 403 no `POST /congelados/pedidos/:id/aprovar` direto); com permissão aprova e o pedido gerado leva a observação. A Ana continua criando pedidos como antes (nenhum arquivo de ia-consulta no diff).
5. Novo Pedido: devedor com mais de 3 dias e mais de R$ 50 -> mesmo comportamento de hoje; devedor de R$ 40 -> faixa amarela e consegue salvar; "a confirmar" -> faixa amarela.
6. Clientes e Rota: popup idêntico ao de hoje + botões novos; "Cobrar agora" só para quem tem `Pode_Editar_Cobranca`; um clique = uma mensagem; "Abrir no Contas a Receber" abre a tela já filtrada com o chip.
7. Ficha: faixa em todas as abas, aba Financeiro com contador, "Atrasos Pag./Rec." sumiram, mobile sem scroll horizontal.
8. Atendimentos, Contas a Receber, Caixa, Carga: selo ao lado do nome, clique abre o popup.
9. Motorista: faixa amarela aparece com a chave ligada e some com a chave desligada (admin muda na Tela 15 e a mudança vale em até 30 s ou no próximo reabrir).
10. Mapa: filtro e colorir por inadimplência com legenda; selo no painel; celular com folha inferior.
11. Pendências: bloco aparece com contador certo, sem botão "Aprovar" de 1 clique nos itens, cartões do topo somam.
12. Configurações: só admin vê/edita; mudança grava histórico; valores inválidos recusados.
13. `npm run build` passa; 375 px sem scroll horizontal em todas as telas tocadas.

### 4.8 Divisão
- dev-backend: 4.3 inteiro + testes de 403 com `curl`. dev-frontend: 4.2/4.4. Ponto de sincronização obrigatório: o back publica (em `docs/` ou na descrição do PR) um exemplo REAL de resposta de cada endpoint da seção 3 antes de o front ligar nos dados; QA testa o caminho de ERRO (403, rede) em cada tela, não só o feliz.

---

## 5. Permissões envolvidas — comportamento exato

| Permissão (back lê) | Onde | Comportamento |
|---|---|---|
| `admin` | todas | passa em qualquer trava; único que salva config (`PUT /inadimplencia/config`); vê o card da Tela 15 |
| `Pode_Vender_Inadimplente` | criar pedido, aprovar especial, faturar especial, converter especial, aprovar/faturar bonificação, aprovar pedido do site | libera a ação quando `bloqueiaVenda`; o nome entra na observação ("se responsabiliza"). Front: `user.permissoes.admin \|\| user.permissoes.Pode_Vender_Inadimplente` (NovoPedido.jsx já usa isso, l.1220/1873) |
| `Pode_Aprovar_Especial` (ou admin) | aprovarEspecial l.734, converterEspecial l.910 | continua EXIGIDA (ListaPedidos l.181). Sem ela o botão some. A de inadimplente é ADICIONAL, nunca substitui |
| `Pode_Aprovar_Bonificacao` (ou admin) | aprovarBonificacao l.948 | idem (ListaPedidos l.183) |
| `Pode_Editar_Cobranca` (ou admin) | `POST /api/cobranca/cobrar/:clienteId` (cobrancaRoutes `checkEdicao`) | habilita "Cobrar agora" no popup/ficha. Front: `hasPermission('Pode_Editar_Cobranca')`. `Pode_Acessar_Cobranca` (só ver) NÃO habilita o botão |
| `Pode_Acessar_Contas_Receber` (ou admin) | contasReceber.js `checkAcesso` | habilita "Abrir no Contas a Receber"; sem ela o botão não aparece |
| `kitFesta` (ou admin) | rotas do módulo Site (congeladosRoutes l.23-28) | quem vê/aprova na fila; a trava de inadimplente se soma |
| qualquer logado | `GET /inadimplencia/config`, `POST /inadimplencia/lote`, `GET /clientes/:uuid/inadimplencia` | já é assim hoje para o detalhe; o dado de atraso já está visível nas listas |

Botões, por perfil (cliente com `bloqueiaVenda`):
- Sem `Pode_Aprovar_*`: não vê botão de aprovação (como hoje).
- Com `Pode_Aprovar_*` e sem `Pode_Vender_Inadimplente`: botão desabilitado + "Só um responsável pode liberar este pedido."; servidor devolve 403 se forçar.
- Com `Pode_Aprovar_*` e com `Pode_Vender_Inadimplente`/admin: "Assumir responsabilidade e aprovar".
- Cliente só "a confirmar" ou dentro da carência/abaixo do mínimo: nenhum bloqueio, só selo.

---

## 6. ENTREGA 3 — Fechamento

Arquivos (todos de documentação/apresentação — nenhum código de regra):
1. Manuais do Clippy (`backend/manuais/abas/`), editar só o que mudou, sem remover itens: `pedidos.md` (selo, filtro, faixa, trava de aprovação), `pedidos-online.md`, `clientes.md` (selo, ficha, aba Financeiro, saída de "Atrasos Pag./Rec."), `mapa-clientes.md`, `atendimentos.md`, `contas-receber.md` (filtro por cliente vindo do popup), `caixa.md`, `embarque.md` (carga), `minhas-entregas.md` (faixa do motorista), `config-gerais.md` (card Venda a inadimplente, 6 chaves, cadeado, histórico), `pendencias.md` se existir (listar em `manuais/abas/README.md`; **confirmar o slug real**), manual da régua de cobrança (o "Cobrar agora" agora também sai do popup). Incluir no manual a regra nova de inadimplência em português simples (boleto apontado não é pago; Pix/cartão espera N dias; funcionário fora; especial só depois de entregue; carência e mínimo só para travar).
2. `backend/services/copilotoService.js` tabela `ABAS`: **nenhuma entrada nova** (não há tela/rota/permissão nova: o card é dentro de Configurações). Só se o dev decidir criar rota própria. Confirmar.
3. `frontend/public/novidade-inadimplencia.html` espelhando `novidade-tarefas.html`: accordions `class="acc aberto"`, seção "As telas do app" com mockups e legendas numeradas (reaproveitar o HTML de `docs/mockups/inadimplencia-telas.html`), og:title/og:description SEM og:image, sem botão "Abrir o app". E entrada NO TOPO de `frontend/public/novidades.json` (`slug:"inadimplencia"`, titulo curto, resumo, data). Texto pronto para o grupo do WhatsApp. NUNCA colocar número de teste do ambiente local no manual/novidade — números de exemplo só os do mockup aprovado ou nenhum.
4. `backend/docs/ia-consulta-api.md` (nota da Entrega 1) e `backend/docs/pendencias-api.md` (bloco novo) conferidos.
5. Limpeza: se o diag e os testes antigos já não precisarem, avaliar remover as funções `@deprecated` de `recebimentoEntregaService` (opcional; só após validação em produção e ajustando `teste-baixa-especial-ledger.js`).
6. Bump do `deployMarker`; `sw.js` NÃO precisa mudar (estratégia igual).
Divisão: dev-frontend (HTML/JSON da novidade) + dev-backend (manuais, docs). QA abre a página de novidade no celular e confere o Clippy responde sobre o assunto. Porte: pequena.

---

## 7. Riscos transversais e "O que NÃO fazer"

- NÃO alterar `iaConsultaRoutes.js`, nenhum campo de `/api/ia-consulta/v1`, nem mensagens da Ana. O `inadimplente` da IA muda de valor, não de formato.
- NÃO criar nenhum envio de WhatsApp novo. "Cobrar agora" reaproveita `POST /api/cobranca/cobrar/:id` (tipo `cobranca`, referência por aviso). Sem lembrete, sem lote, sem promoção.
- NÃO usar `NOT`/`notIn` do Prisma com campo que pode ser null (`situacaoCA`, `dataEntrega`): sempre `OR` explícito com `null`.
- NÃO remover/renomear campo existente de resposta (`inadimplente`, `totalVencido`, `parcelasVencidas`, `contas`). Só acrescentar.
- NÃO recalcular inadimplência no front. NÃO cachear a trava de venda. NÃO deixar a trava só no front.
- NÃO travar a conversão automática por PIX (`pedidoConversaoService`) nem o `criarPedidoSite` (o pedido TEM que entrar na fila).
- NÃO mudar o fluxo de NF-e de devolução, caixa, baixa, estorno (nenhum arquivo fiscal é tocado; `recebimentoEntregaService` só ganha `@deprecated` e continua exportando tudo — `aplicarRecebimentoEntrega`, `classificarBaixaPorForma` etc. intocados).
- NÃO persistir busca por texto nem o filtro transitório de cliente do Contas a Receber; NÃO usar `<select>` nativo; NÃO `window.open`.
- NÃO usar `React.lazy`; não há rota nova.
- NÃO colocar log/API externa dentro de `$transaction`. Não há transação nova; nas rotas de aprovação a checagem é antes da transação existente.
- Entre as entregas: **não juntar commits**. Entrega 1 em produção e validada (diag + critérios) ANTES de iniciar a 2.

## 8. Perguntas que o dono/gerente precisa responder (não bloqueiam a Entrega 1)
- P1 Carência e mínimo: confirmar que valem SÓ para travar (selo desde o 1º dia). Ajustar o texto do resumo do mockup e da Tela 15.
- P2 Tela 2/14: pedido normal não tem etapa de aprovação. Confirmar a interpretação (faixa em todos; trava em especial/bonificação/converter; bloco de Pendências = especial/bonificação + fila do site).
- P3 Bonificação e especial devem mesmo ser travados na aprovação (hoje o `criar` os isenta)? Recomendação: especial SIM; bonificação — o dono decide (é brinde, sem conta a receber). É uma linha em `exigirResponsavel`. E no NovoPedido: alinhar o front ao back (isentar especial/bonificação) ou travar também no back?
- P4 Dinheiro apontado e nunca conferido pelo Caixa fica "em espera" para sempre (regra aprovada vale só para Pix/cartão). Estender o prazo "a confirmar" ao dinheiro? Recomendo sim (mesma chave).
- P5 O KPI de títulos vencidos da tela Contas a Receber continua mostrando tudo (R$ 15,8 mil) enquanto o selo mostra R$ 12,4 mil: aceitar a diferença?

## 9. O que NÃO consegui confirmar lendo o código
- Qual campo identifica "À vista - Funcionário" (condição vs. nome da forma apontada); o diag mostra qual bateu e a lista de nomes reais de forma em produção.
- Os nomes reais de `formaPagamentoNome` em produção (só vi exemplos pelo documento: "7 dias - Boleto", "14 dias - Boleto", "7/14 dias", "Pix", "À vista - Funcionário").
- Se o `PedidoPagamentoReal.createdAt` muda ao editar a entrega (editar apaga e recria linhas?); por isso a idade do "a confirmar" usa `pedido.dataEntrega` primeiro.
- Se `CheckoutEntregaModal` já recebe `pedido.cliente.UUID`/`pedido.clienteId` (vi `pedido.cliente` com outros campos, não o UUID); se faltar, o endpoint do motorista precisa incluir.
- Quais linhas do payload do Caixa alimentam exatamente a tabela "Caixa do dia" (acrescentar `clienteId` nas quatro candidatas é seguro, só que pode haver uma quinta).
- Se Kit Festa aprova pedidos por caminho próprio (não li `kitFestaService`).
- Se `pedido.cancelado=true` sempre vem com `ContaReceber.status=CANCELADO` (o código atual não filtra `cancelado`; mantive igual).
- Comportamento exato do `sincronizarContasCliente` depois que o Conta Azul virou somente leitura (mantido como está em `criar`).
- Não executei nada (somente leitura): nenhum dado de produção foi consultado; os números R$ 15.851 / 11.149 / 12.443 vêm do documento aprovado.

## 10. Portes
Entrega 1: média-grande (service puro + 8 consumidores + diag + config; só backend). Entrega 2: grande (~15 telas, 2 extrações de código, travas de back em 4 rotas, bloco novo de Pendências). Entrega 3: pequena. Fluxo de cada uma: dev -> qa-testador + revisor-codigo (paralelo) -> gerente-entrega; Entrega 1 exige teste em produção via `diag-inadimplencia` antes de iniciar a 2.
