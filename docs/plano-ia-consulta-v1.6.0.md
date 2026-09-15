# Plano de implementação — API de consulta para IA `/api/ia-consulta/v1` → **1.6.0**

> Pedido do bot da Ana: `backend/docs/pedido-bot-ana-v1.6.0.md` (8 itens). Dono pediu **todos os 8** + sugestões de dados extras.
> Plano desenhado pelo arquiteto em 10/09/2026. **Porte: grande** (contrato congelado com consumidor externo + criação de pedido + financeiro) — arquiteto → `dev-backend` → `qa-testador` + `revisor-codigo` → `gerente-entrega`.
> Executor: **só `dev-backend`**. Não há tela nova (nada para `dev-frontend`).

---

## 0. Objetivo (o que o dono quer)

A Ana vai tirar o pedido semanal de clientes recorrentes de congelados (piloto com 5 clientes, modo assistido — o pedido continua nascendo `AGUARDANDO` na fila do Site Congelados, quem aprova é o faturamento). Para isso ela precisa enxergar o cliente como a vendedora: o que ele compra (com itens), se já tem pedido na semana, promoção vigente, o que está em falta, hora de corte, se o pedido chegou — e um **objeto de produto único** em todos os endpoints (hoje o bot tenta 6 nomes de campo para achar preço).

**Regra que governa tudo:** `/v1` é contrato congelado. **Nada é removido, renomeado ou muda de tipo.** Tudo aqui é adição de campo/endpoint. Onde o bot pediu algo que colidiria com um campo existente (ex.: `ultimoPedido`, `grupo`, `embalagem`), o campo novo entra com **outro nome** e o antigo fica intacto.

---

## 1. Mapa do código atual (confirmado lendo os arquivos)

| Ponto | Onde | O que foi confirmado |
|---|---|---|
| Rotas `/v1` | `backend/routes/iaConsultaRoutes.js:15-77` | `verificarChaveIA` + `envelopeVersao` (meta/dados). Controllers: `kitFestaController`, `congeladosController`, `iaClienteController`. |
| Versão/avisos | `backend/config/iaConsultaVersao.js:20` | `VERSAO_API = '1.5.1'`; array `AVISOS` já tem 1 aviso informativo (cidade). |
| Reconhecimento geral | `backend/services/iaClienteService.js:63-83` `reconhecerPorTelefone` | devolve `cliente{nome,documento,cidade,vendedor}`, `diasEntrega`, `diasVenda`, `condicaoPagamento{nome,valorMinimo}`. **Não tem `ultimoPedido`.** |
| Histórico | `iaClienteService.js:90-130` `historicoPedidos(telefone, limite, comItens)` | **`comItens` já existe desde a 1.4** (`itens[{produtoId,nome,quantidade,unidade,precoUnit}]`). Lê **só `Pedido`** (`statusEnvio != EXCLUIDO`, ordem `dataVenda desc`). Pedidos da fila (`congelados_pedidos` AGUARDANDO) **não entram**. Não filtra `cancelado`. |
| Reconhecimento congelados | `backend/services/congeladosService.js:600-627` `catalogoPorTelefone` | devolve `catalogo[]` (com `preco` do cliente, `comprado`) e **`ultimoPedido` = ARRAY de itens** (`_ultimoPedidoCliente`, linha 545). Não pode virar objeto. |
| Serializer de produto (site) | `congeladosService.js:74-93` `produtoSitePublico(cp)` | campos: `id`(=congeladosProdutoId), `produtoId`, `codigo`, `nome`(nomeSite‖nome), `descricao`, `unidade`, `unidades`, **`embalagem` (STRING, ex. "caixa")**, **`grupo` (= ID da categoria)**, `grupoNome`, `preco`, `destaque`, `ordem`, `imagem`, `imagens`. `catalogoPublico` (linha 380) soma `preparo` (rótulo livre da config `categoriasNomes[cat].preparo`, ex. "Para fritar") e `indisponivel` (= `estoqueDisponivel <= 0`, função `produtoIndisponivel` linha 68). |
| Preço | `congeladosService.js:99-108` `precoVendedor`, `:152-176` `contextoPreco` | `valorBase = base × (1+acréscimo% da condição)`; `valor = último preço real do cliente ou valorBase`, com piso do flex. Visitante usa a tabela "Site". |
| Criar pedido (site + IA) | `congeladosService.js:665-807` `criarPedidoSite`, `:814-843` `criarPedidoIA` | IA já prefixa `observacoes` com **`[WhatsApp IA]`** (linha 823). Itens gravados em `congelados_pedido_itens` (`nomeProduto, quantidade, unidadesPorCaixa, precoUnitario`) — **sem coluna de promoção**. `CongeladosPedido` **não tem `origem` nem `observacaoInterna`**. Idempotência por `idempotencyKey` (linha 819). |
| Aprovação da fila | `congeladosService.js:1029-1113` `adminAprovarPedido` | `pedidoService.criar({... observacoes: \`Site Congelados #N · ${cp.observacoes}\`, canalOrigem: 'SITE_CONGELADOS' ...})`. **Tudo que está em `observacoes` da fila vai parar em `Pedido.observacoes`.** |
| `Pedido.observacoes` vaza para fora | `backend/services/focusNfeEmissaoService.js:250` (infCpl da NF-e), `reciboEspecialPdf.js:284`, `frontend/.../ImpressaoPedido.jsx:154,224` | ⚠️ Texto interno colocado em `observacoes` **sairia na nota fiscal e no recibo do cliente**. |
| Site do cliente lê observações cruas | `congeladosService.js:868-874` `meusPedidos` | devolve a linha inteira de `congelados_pedidos` (com `observacoes`) para o cliente logado no site. |
| Fila no admin | `frontend/src/pages/SiteAdmin/SiteAdmin.jsx:288` | mostra `p.observacoes` num bloco "Obs:" — é onde a Leticia lerá a observação interna. |
| Promoções | `backend/prisma/schema.prisma:1359-1410` `Promocao`/`PromocaoCondicaoGrupo`/`PromocaoCondicao`; `backend/services/promocaoService.js` | `tipo` = `SIMPLES` ‖ `CONDICIONAL`; `precoPromocional` (preço **base, sem acréscimo da tabela** — `NovoPedido.jsx:1238` mostra `precoPromocional × (1+acréscimo/100)`); `dataInicio/dataFim`; `status ATIVA/ENCERRADA`; condições `PRODUTO_QUANTIDADE` (produtoId+quantidadeMinima) e `VALOR_TOTAL` (valorMinimo); grupos = OU, condições = E (`avaliarLiberada`, linha 44). **Não há vínculo com tabela de preço** (vale para todas). **Não existe "leve X pague Y".** `pedidoService.criar` (linha 401-427) reavalia sozinho a promoção ao criar o Pedido real (só afeta `emPromocao`/flex, não o preço). |
| Disponibilidade | `Produto.estoqueDisponivel` (`schema.prisma:26`), `Produto.ativo`, `CongeladosProduto.ativo` | única fonte. **Não existe "previsão de retorno" em lugar nenhum.** |
| Hora de corte | grep `horaCorte|hora_corte|horaLimite` em todo o backend | **não existe** em cliente, rota, config ou schema. |
| Entrega realizada | `Pedido.statusEntrega` (PENDENTE/ENTREGUE/ENTREGUE_PARCIAL/DEVOLVIDO), `Pedido.dataEntrega` gravado com `new Date()` **no momento da entrega** (`backend/routes/entregas.js:712`), `Pedido.embarque.responsavel.nome` (motorista — `schema.prisma:1580`) | `entregueEm` = `Pedido.dataEntrega`; `entregador` = nome do responsável do embarque. ⚠️ O campo `dataEntrega` que o histórico já devolve é **a hora real da entrega**, não a data prevista — o bot vinha lendo como "data de entrega prevista". |
| Inadimplência (referência) | `backend/controllers/clienteController.js:236-275` (arquivo sujo — **só ler, não editar**) | `ContaReceber.status IN (ABERTO, PARCIAL)` + parcelas `status IN (PENDENTE,PARCIAL,VENCIDO)` e `dataVencimento < hoje` (hoje = meia-noite em `America/Sao_Paulo`), excluindo pedido EXCLUIDO/CA CANCELADO por **OR explícito** (nunca `NOT`), e descartando contas em `idsContasEmEsperaDeConferencia` (`backend/services/recebimentoEntregaService.js:476`). Saldo = `valor − valorPago − valorDescontoTotal`. |
| Número do pedido NÃO é único | `hardt_local`: 203 números repetidos em `pedidos`, cada um em 2 clientes diferentes | `GET /cliente/pedido/:numero` **tem que filtrar por cliente** e pegar o mais recente. |
| Padrão do nome do produto | `hardt_local`: `2-FR-M-COXINHA FRANGO C/AIPIM C/30 60GR`, `1-GG-COXINHA FRANGO C/10 170GR`, `2-FR-RISOLES DE CARNE C/10` | Formato `<dígito>-[FR-][P|M|G|GG-]<NOME> C/<un> <peso>GR`. `codigo` é numérico (5023, 3065…) — **não** é `FR-M-COX-AIP` como o bot imaginou. O que dá para derivar com segurança: `tamanho` (token exato P/M/G/GG antes do nome), `unidades` (`C/30`), `pesoUnidadeG` (`60GR`). O significado de `1-`/`2-` e `FR` **não está documentado em lugar nenhum** → não derivar `preparo`/`linha` disso (ver pergunta ao dono). |
| Etiqueta (peso) | `EtiquetaProduto` (`schema.prisma:2850`): `pesoUnitario` (g), `quantidadeEmbalagem`, `pesoPacote` (g), `codigoProduto`, `produtoId?`, `ativo` | mesma busca do `fichaPublico` (linha 440-441): por `produtoId`, senão por `codigoProduto`. No `hardt_local` não há etiquetas nem `congelados_produtos` (banco parcial). |
| Config chave/valor | `AppConfig` (`schema.prisma:993`), molde `backend/config/canhotoConfig.js:44-73` | padrão de leitura com cache 30 s e `PADRAO` mesclado. |
| Manual do Clippy | `backend/manuais/abas/site-congelados.md:50` | já explica o prefixo `[WhatsApp IA]` na fila. Arquivo limpo no git. |

**Ambiente local:** `backend/.env` tem `DATABASE_URL` (hardt_local) e `PORT=3000`, mas **não tem `IA_WHATSAPP_API_KEY`** → sem ela toda rota responde 503. O `hardt_local` não tem `congelados_produtos`, `congelados_pedidos` nem `promocoes` vigentes (as 5 "Abril 2026" estão ATIVAS mas com `dataFim` 31/05) — QA precisa semear (ver §7).

---

## 2. Decisões de contrato (nomes e formas — fechar antes de codificar)

1. **`ultimoPedido` continua ARRAY** em `congelados/reconhecer-telefone`. O objeto de pedido pedido pelo bot entra como **`ultimoPedidoDetalhe`** (mesmo nome nos dois reconhecimentos: `/cliente/reconhecer-telefone` e `/congelados/reconhecer-telefone`).
2. **Um objeto de PEDIDO** (`pedidoParaIA`) usado em: `historico-pedidos`, `ultimoPedidoDetalhe`, `pedidosEmAberto`, `GET /cliente/pedido/:numero`. Campos existentes do histórico (`numero, data, dataEntrega, statusEntrega, tipo, total, itens[]`) mantêm nome, tipo e semântica.
3. **Um objeto de PRODUTO** (`produtoParaIA`) **somado** aos objetos existentes (nunca substituindo): no catálogo e no reconhecimento os campos novos entram **no mesmo nível** do item (o item do catálogo continua tendo `id, produtoId, preco, unidades, embalagem, grupo…`); nos **itens de pedido** (histórico, produtos-comprados, pedido criado, promoções) entra como sub-objeto **`produto`**.
4. Colisões resolvidas com nome novo: bot pediu `grupo` = nome → já existe **`grupoNome`** (o `grupo` atual é o ID e fica); bot pediu `embalagem` = objeto → o `embalagem` atual é string, o objeto entra como **`embalagemInfo`**; bot pediu `preparo` = enum → o `preparo` atual é rótulo livre, o enum entra como **`preparoTipo`**; bot pediu `nome` curto → `nome` atual (nomeSite‖nome) fica, entra **`nomeCurto`** (derivado), **`nomeSite`** e **`nomeCompleto`**.
5. **Fila na lista de pedidos**: entradas de `congelados_pedidos` em `AGUARDANDO`/`PENDENTE_CADASTRO` entram no `historico-pedidos` **sempre, no topo, fora do `limite`**, marcadas com **`fonte: "FILA"`** (as de `Pedido` levam `fonte: "PEDIDO"`). Pedido da fila já `CONVERTIDO` **não** entra (o Pedido real correspondente entra com `numeroFila`). Registrar em `AVISOS` como **aviso informativo** (igual à 1.5.1): "a lista passa a incluir pedidos ainda na fila; use `fonte` para distinguir".
6. **`numero` da entrada de fila** = `CongeladosPedido.numero` — é o **mesmo número** que o bot já recebe no `POST /congelados/pedido` (`{numero,status:'AGUARDANDO'}`), então ele já lida com essa numeração. `GET /cliente/pedido/:numero` aceita `fonte=FILA` para consultar por esse número.
7. **Sem alteração de `schema.prisma`** (outra sessão está editando o schema — NF de bonificação). `origem`, `observacaoInterna` e promoção aplicada vivem **dentro de `observacoes` com marcadores** (ver §3.4) e são removidos antes de virar `Pedido.observacoes`. Isso é uma limitação assumida — ver Riscos R1.
8. **`horaCorte`** vem de `app_configs` chave **`ia_consulta_config`** (`{ "horaCorte": "17:00" }`), valor único da empresa, `null` se não configurado. **Sem tela agora.**
9. **Promoções**: `tipo` exposto = `PRECO` (nossa `SIMPLES`) ‖ `CONDICIONAL` (nossa `CONDICIONAL`, com `condicao` em texto + `condicoes` estruturadas). `LEVE_MAIS` **não existe** neste sistema. `tabelas` = sempre `["*"]`. `precoPromo` = `precoPromocional × (1 + acréscimo% da condição do contexto)` — mesma conta da tela de pedido (`NovoPedido.jsx:1238`).
10. **Preço nunca vem do bot**: `itens[].promocaoId` é só referência; o servidor valida a promoção e **recalcula**. `precoUnit` no body é ignorado (não documentar como aceito).
11. **Segurança** inalterada: tudo em `/cliente/*` e `/congelados/reconhecer-telefone` só com telefone batendo; `situacao` e `ficha`/`buscar` são **só painel** (nunca tool da IA); `GET /cliente/pedido/:numero` **exige `telefone`** e só devolve pedido daquele cliente.

---

## 3. Plano de execução (ordem para o `dev-backend`)

### Arquivos (nenhum está na lista de mudanças não commitadas da outra sessão — conferido com `git status`)

| Ação | Arquivo |
|---|---|
| **criar** | `backend/services/iaProdutoSerializer.js` — `produtoParaIA`, `promocaoParaIA`, `carregarExtrasProdutos`, derivações do nome |
| **criar** | `backend/config/iaConsultaConfig.js` — leitura de `app_configs.ia_consulta_config` (molde `canhotoConfig.js`) |
| alterar | `backend/services/promocaoService.js` — `+ listarVigentes({ produtoIds? })`, `+ buscarVigentePorId(id)`, `+ descreverCondicao(promo, nomesProduto)` (aditivo; `buscarAtivaPorProduto`/`avaliarLiberada`/`calcularFlexComPromocao` intocados) |
| alterar | `backend/services/congeladosService.js` — `catalogoPorTelefone`, `catalogoVisitante` (só no caminho da IA), `criarPedidoSite`, `criarPedidoIA`, `adminAprovarPedido`, `meusPedidos`, `+ promocoesVigentes`, `+ indisponiveis`, `+ pedidoParaIA` (ou em módulo próprio, ver abaixo) |
| alterar | `backend/controllers/congeladosController.js` — `+ catalogoIA`, `+ promocoes`, `+ indisponiveis` |
| alterar | `backend/services/iaClienteService.js` — `reconhecerPorTelefone`, `historicoPedidos`, `+ produtosComprados`, `+ situacaoFinanceira`, `+ pedidoPorNumero`, `fichaPorDocumento` (+ `horaCorte`) |
| alterar | `backend/controllers/iaClienteController.js` — `+ produtosComprados`, `+ situacao`, `+ pedidoPorNumero` |
| alterar | `backend/routes/iaConsultaRoutes.js` — 5 rotas novas + `catalogo` apontando para `catalogoIA` |
| alterar | `backend/config/iaConsultaVersao.js` — `VERSAO_API = '1.6.0'` + comentário de histórico + 1 aviso informativo |
| alterar | `backend/docs/ia-consulta-api.md` — tabela, seção "1.6.0", curls, histórico |
| alterar | `backend/manuais/abas/site-congelados.md` — parágrafo da linha 50: `[Interno]` e `[Promoção]` na fila |

**Não tocar** (sujos na outra sessão): `schema.prisma`, `pedidoService.js`, `pedidoController.js`, `clienteController.js`, `pedidoRoutes.js`, `adminExec.js`, `notasFiscaisRoutes.js`, `focusNfeEmissaoService.js`, `canhotoService.js`, `impressaoLoteService.js`, `reciboEspecialPdf.js`, `asaasService.js`, `caixa.js`, `contasReceber.js`, `manuais/abas/pedidos.md`, `manuais/abas/caixa.md`, `manuais/abas/entregas.md`, `manuais/abas/notas-fiscais.md`, todo o `frontend/`.

**Onde mora `pedidoParaIA`:** ele precisa do serializer de produto e de dados de `Pedido`/`CongeladosPedido`; `iaClienteService` e `congeladosService` vão usar. Para não criar dependência circular (congeladosService já é importado por vários), colocar **`pedidoParaIA` e as consultas de pedido reutilizáveis** em `iaProdutoSerializer.js`? Não — separar por assunto: criar o serializer de produto em `iaProdutoSerializer.js` e um segundo módulo **`backend/services/iaPedidoService.js`** (criar) com `pedidoParaIA`, `listarPedidosDoCliente({clienteUuid, limite, comItens, incluirFila})`, `ultimoPedidoDetalhe`, `pedidosEmAberto`, `pedidoPorNumero`. Os dois services existentes só chamam esse módulo. Ele importa `prisma`, `promocaoService`, `iaProdutoSerializer` e **nada de** `congeladosService`/`iaClienteService`.

> Lista final de arquivos a criar: `iaProdutoSerializer.js`, `iaPedidoService.js`, `iaConsultaConfig.js`.

### Passo 1 — `backend/config/iaConsultaConfig.js` (item 7a)

- `CHAVE = 'ia_consulta_config'`, `PADRAO = { horaCorte: null }`, cache 30 s, `get()` tolerante a banco fora (devolve PADRAO). Valida `horaCorte` com `/^([01]\d|2[0-3]):[0-5]\d$/`; inválido → `null`.
- **Não** gravar nada na primeira leitura (diferente do canhotoConfig — aqui não há "linha de partida").
- Como configurar em produção enquanto não há tela: `INSERT INTO app_configs(key,value) VALUES ('ia_consulta_config','{"horaCorte":"17:00"}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;` via TablePlus/psql no banco de produção (o `adminExec.js` está sujo; a rota de admin fica para quando a outra sessão commitar). Documentar isso no `ia-consulta-api.md` e dizer ao bot que **`horaCorte` pode vir `null`**.

### Passo 2 — `backend/services/iaProdutoSerializer.js` (item 8 + 6 + parte do 3)

```js
// carregarExtrasProdutos(produtoIds) → { etiquetas: Map<produtoId, EtiquetaProduto>, promos: Map<produtoId, Promocao(com grupos.condicoes)> }
//   etiquetas: 1 query por produtoId (ativo) + 1 por codigoProduto (mesma regra do fichaPublico)
//   promos: promocaoService.listarVigentes({ produtoIds })
// produtoParaIA({ produto, cp, etiqueta, promo, preparoLabel, acrescimoPct, precoCliente }) → objeto abaixo
```

Mapeamento campo → coluna real (o que não existe vem `null` e está marcado):

| Campo | Fonte | Observação |
|---|---|---|
| `id` | `CongeladosProduto.id` | `null` se o produto não está no site (item de histórico antigo). É o que vai em `itens[].id` ao criar pedido. |
| `produtoId` | `Produto.id` | |
| `codigo` | `Produto.codigo` | numérico no cadastro real (ex. `5023`) |
| `nome` | `cp.nomeSite ‖ Produto.nome` | **existente**, inalterado |
| `nomeSite` | `CongeladosProduto.nomeSite` | `null` se não preenchido |
| `nomeCompleto` | `Produto.nome` | ex. `2-FR-M-COXINHA FRANGO C/AIPIM C/30 60GR` |
| `nomeCurto` | derivado de `Produto.nome`: remove `^\d-([A-Z]{2}-)?(P|M|G|GG)-`, remove ` C/\d+`, remove ` \d+ ?GR\b`, `trim` | se nada casar = `nomeCompleto`. Ex.: `COXINHA FRANGO C/AIPIM` |
| `linha` | `'CONGELADOS'` quando há `cp`, senão `null` | não existe coluna de linha |
| `grupo` | `CategoriaProduto.id` | **existente** (é o ID — avisar o bot) |
| `grupoNome` | `CategoriaProduto.nome` | **existente** — é o "grupo" humano |
| `tamanho` | regex `^\d-(?:[A-Z]{2}-)?(P|M|G|GG)-` em `Produto.nome` | só se o token estiver exatamente nessa posição; senão `null` |
| `pesoUnidadeG` | `EtiquetaProduto.pesoUnitario` (g) → senão regex `(\d+)\s*GR\b` no nome → senão `null` | `Produto.pesoLiquido` **não** serve (no banco `1.200` para "C/30 60GR" = 1,8 kg — não bate) |
| `embalagemInfo` | `{ rotulo: cp.embalagem, unidade: Produto.unidade, unidadesPorEmbalagem, pesoG }` | `unidadesPorEmbalagem` = `cp.unidadesPorCaixa` (>0) → `Produto.quantidadePorCaixa` → regex `C/(\d+)` → `null`; `pesoG` = `EtiquetaProduto.pesoPacote` → `unidades × pesoUnidadeG` → `null` |
| `embalagem`, `unidades`, `unidade` | **existentes** | inalterados |
| `preparo` | **existente** (rótulo livre da config `categoriasNomes[categoriaId].preparo`) | inalterado |
| `preparoTipo` | normalização do rótulo: `/frit/i`→`FRITO`, `/assa|forn/i`→`ASSADO`, `/pronto/i`→`PRONTO`, `/cru/i`→`CRU`, senão `null` | vem da categoria, não do produto |
| `precoTabela` | `precoVendedor({ base, acrescimoPct })` **sem** `ultimoPreco` (= `valorBase` da condição do contexto) | no catálogo público = tabela "Site" |
| `precoCliente` | `preco` do contexto do cliente (reconhecimento) | `null` no catálogo público |
| `preco` | **existente** | inalterado |
| `minimoPorItem` | constante `1` | não existe no cadastro |
| `ativo` | `Produto.ativo !== false && cp.ativo` | |
| `disponivel` | `ativo && Number(estoqueDisponivel) > 0` | mesma regra do `indisponivel` do site |
| `indisponivel` | **existente** | inalterado |
| `previsaoRetorno` | sempre `null` | não existe coluna — dizer isso no doc |
| `promocao` | `promocaoParaIA(promo, ctx)` ou `null` | ver Passo 3 |
| `imagem` | **existente** (`imagemPrincipal`) | |

**Onde `produtoParaIA` entra (sempre somando):**

| Endpoint | Como |
|---|---|
| `GET /congelados/catalogo` | novo `congeladosCtrl.catalogoIA` → `svc.catalogoVisitante({ paraIA: true })` — os campos novos são mesclados em cada item. **A rota pública do site (`congeladosPublicRoutes.js:31`) continua chamando `catalogo` sem enriquecimento** (site não precisa e não deve receber promoção/etiqueta em massa). |
| `POST /congelados/reconhecer-telefone` | `catalogo[]` enriquecido (com `precoCliente` = `preco`); cada item de `ultimoPedido[]` ganha sub-objeto `produto`. |
| `GET /congelados/meu-catalogo` (IA, com token) | mesmo enriquecimento via parâmetro `paraIA` em `meuCatalogo` — o controller da IA passa `true`; a rota pública do site não. |
| `POST /cliente/historico-pedidos` (`comItens`) | `itens[].produto` |
| `POST /cliente/produtos-comprados` | `produtos[].produto` |
| `POST /congelados/pedido` (resposta) | `itens[].produto` |
| `GET /congelados/promocoes` | `promocoes[].produto` |
| `GET /cliente/pedido/:numero` | `itens[].produto` |
| `GET /congelados/indisponiveis` | `produtos[].produto` |

### Passo 3 — Promoções (itens 3 e 4)

**3a. `promocaoService.js` (aditivo):**
- `listarVigentes({ produtoIds = null })`: `status:'ATIVA'`, `dataInicio <= agora <= dataFim`, `include: { grupos: { include: { condicoes: true } } }`. Uma promoção por produto (se houver mais de uma vigente, pegar a de `criadoEm` mais recente — mesma escolha implícita do `findFirst` de `buscarAtivaPorProduto`).
- `buscarVigentePorId(id)`: idem por id (usado na criação de pedido).
- `descreverCondicao(promo, nomePorProdutoId)`: `SIMPLES` → `null`; `CONDICIONAL` → grupos unidos por `" ou "`, condições por `" e "`: `PRODUTO_QUANTIDADE` → `"a partir de 5 un de COXINHA…"`, `VALOR_TOTAL` → `"pedido a partir de R$ 300,00"`.

**3b. `promocaoParaIA(promo, { acrescimoPct, precoTabela, nomePorProdutoId })`:**
```json
{ "id": "<uuid>", "nome": "Abril 2026", "tipo": "PRECO|CONDICIONAL", "tipoSistema": "SIMPLES|CONDICIONAL",
  "produtoId": "...", "precoPromo": 9.90, "precoPromoBase": 9.00, "precoNormal": 10.80,
  "condicao": "a partir de 5 un de …" , "condicoes": [[{ "tipo":"PRODUTO_QUANTIDADE","produtoId":"…","produtoNome":"…","quantidadeMinima":5 }]],
  "validoDe": "2026-04-15", "validoAte": "2026-05-31", "tabelas": ["*"] }
```
`precoNormal` = `precoTabela` do contexto (não o `precoCliente`, que pode ser negociado abaixo).

**3c. `GET /congelados/promocoes`** (`congeladosCtrl.promocoes` → `svc.promocoesVigentes()`): contexto = tabela "Site" (`contextoPreco(null)`); só produtos com `CongeladosProduto` ativo (o bot só vende o que está no site); resposta `{ promocoes: [ { ...promocaoParaIA, id_site: <cp.id>, nome: <nome do item>, produto: produtoParaIA(...) } ] }`. Observação no doc: **no reconhecimento por telefone, `catalogo[].promocao.precoPromo` já vem com o acréscimo da condição do cliente** — é esse que a Ana deve falar.

**3d. `POST /congelados/pedido` — `promocaoId`, `observacaoInterna`, `origem`:**
- `criarPedidoIA` aceita `itens[].promocaoId`, `observacaoInterna` (string, cortar em 500 caracteres, `\r?\n` → espaço), `origem` (aceito e **ignorado**: neste endpoint é sempre `WHATSAPP_IA`; a resposta ecoa `origem: "WHATSAPP_IA"`).
- Montagem de `observacoes` (fila): `"[WhatsApp IA] <observacoes do cliente>"` + `"\n[Interno] <observacaoInterna>"` (se houver) + `"\n[Promoção] <nome do produto>: <nome da promoção> (R$ 9,90/un)"` por item promocional (montado **no servidor**, depois da validação). O bloco interno é **sempre as últimas linhas**, começando por `\n[Interno]` ou `\n[Promoção]`.
- Helper único `separarObservacoes(obs)` → `{ cliente, interno }` (regex `/\n\[(Interno|Promoção)\][^]*$/`) usado em três pontos: `adminAprovarPedido` (grava em `Pedido.observacoes` **só a parte `cliente`** — obrigatório: `Pedido.observacoes` vai para a NF-e e o recibo), `meusPedidos` (site do cliente recebe só `cliente`), `pedidoParaIA` (campo `observacoes` = `cliente`; `observacaoInterna` = `interno`).
- `criarPedidoSite` ganha parâmetro interno **`permitirPromocao = false`**; só `criarPedidoIA` passa `true`. Com ele, para cada item com `promocaoId`:
  1. `promocaoService.buscarVigentePorId(id)`; não achou / fora do período / `status != ATIVA` → `Error('Promoção <id> não está vigente.')` com `e.code = 'PROMOCAO_INVALIDA'`;
  2. `promo.produtoId !== cp.produtoId` → `Error('Promoção não é deste produto.')` (`PROMOCAO_INVALIDA`);
  3. `avaliarLiberada(promo, itensCarrinho, subtotalNormal)` onde `itensCarrinho = [{ produtoId: cp.produtoId, quantidade }]` de **todo o carrinho** e `subtotalNormal` = soma a preços normais (primeira passada); não liberada → `Error('Promoção exige: <descreverCondicao>')` (`PROMOCAO_NAO_LIBERADA`);
  4. preço do item = `round(precoPromocional × (1 + acrescimoPct/100), 2)` — **ignora `ultimoPreco` e o piso do flex** (promoção é preço sancionado).
- O controller devolve `400 { error, code }` — hoje o `erro()` de `congeladosController.js:3` devolve só `{ error }`: acrescentar `code: e.code` quando existir (aditivo; o `VISITANTE_SEM_CPF` já existe como `e.code` mas nunca chegava ao bot).
- Resposta de criação (inclusive no caminho idempotente, que hoje devolve só `{id,numero,status,total}`): `{ id, numero, status, total, origem: "WHATSAPP_IA", itens: [{ id, produtoId, nome, quantidade, unidade, precoUnit, precoTotal, promocaoId, produto }] }`. Para o caminho idempotente, recarregar o pedido com `include: { itens: { include: { congeladosProduto: { include: { produto: … } } } } }`. `promocaoId` nos itens do caminho idempotente vem `null` (não há coluna — só o texto `[Promoção]`); documentar.
- **Mínimo da condição** continua sendo checado sobre o subtotal final (com promoção).

### Passo 4 — `backend/services/iaPedidoService.js` (itens 1a, 1b, 7b)

**`pedidoParaIA(fonte, registro, { comItens, extras })`** — objeto único:

| Campo | `fonte: "PEDIDO"` (`Pedido`) | `fonte: "FILA"` (`CongeladosPedido`) |
|---|---|---|
| `fonte` | `"PEDIDO"` | `"FILA"` |
| `id` | `Pedido.id` | `CongeladosPedido.id` |
| `numero` | `Pedido.numero` (**existente**) | `CongeladosPedido.numero` |
| `numeroFila` | `congeladosPedido?.numero` (relação `Pedido.congeladosPedido`) ou `null` | `= numero` |
| `data` | `dataVenda` (**existente**, mantido) | `createdAt` |
| `criadoEm` | `createdAt` | `createdAt` |
| `dataPrevista` | `dataVenda` (comentário do schema: "Data para entrega (vendedor escolhe)") | `dataEntrega` escolhida (pode ser `null`) |
| `dataEntrega` | `Pedido.dataEntrega` (**existente** — é a hora REAL da entrega, `entregas.js:712`) | `null` |
| `entregueEm` | `Pedido.dataEntrega` se `statusEntrega ∈ {ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO}`, senão `null` | `null` |
| `entregador` | `embarque?.responsavel?.nome ‖ null` | `null` |
| `status` | `cancelado ? "CANCELADO" : "APROVADO"` | `status` da fila (`AGUARDANDO` ‖ `PENDENTE_CADASTRO`) |
| `statusEntrega` | coluna (**existente**) | `"PENDENTE"` |
| `emAberto` | `!cancelado && statusEntrega === 'PENDENTE' && dataVenda >= hoje(SP)` | `true` |
| `tipo` | **existente** (`BONIFICACAO`/`ESPECIAL`/`NORMAL`) | `null` (o faturamento decide na aprovação) |
| `total` | **existente** (soma `valor × quantidade` dos itens) | `total` |
| `modo` | `null` | `modo` (`entrega`/`retirada`) |
| `origem` | `canalOrigem === 'SITE_CONGELADOS'` → (`congeladosPedido.observacoes` começa com `[WhatsApp IA]` ? `"WHATSAPP_IA"` : `"SITE"`); `'KIT_FESTA'` → `"KIT_FESTA"`; senão `"APP"` | `observacoes` começa com `[WhatsApp IA]` ? `"WHATSAPP_IA"` : `"SITE"` |
| `canalOrigem` | coluna crua (`VISITA`/`WHATSAPP`/`LIGACAO`/`SITE_CONGELADOS`/`KIT_FESTA`/`null`) | `null` |
| `observacoes` | `Pedido.observacoes` | parte `cliente` de `separarObservacoes` (sem `[WhatsApp IA]` e sem bloco interno) |
| `observacaoInterna` | `null` | parte `interno` (ou `null`) |
| `nfeNumero` | `Pedido.nfeNumero ‖ null` | `null` |
| `itens[]` (só `comItens`) | `{ produtoId, nome, quantidade, unidade, precoUnit }` **existentes** + `id` (cp.id ‖ null), `precoTotal`, `promocaoId` (`PedidoItem.promocaoId`), `produto` | `{ produtoId: congeladosProduto.produtoId, nome: nomeProduto, quantidade, unidade: produto.unidade, precoUnit: precoUnitario, id: congeladosProdutoId, precoTotal, promocaoId: null, produto }` |

Datas: manter o formato que o histórico já devolve hoje (`Date` serializado em ISO). Campos novos de data também em ISO; `vencidoDesde`/`ultimaCompra`/`validoAte` (datas sem hora) em `YYYY-MM-DD`.

**`listarPedidosDoCliente({ cliente, limite, comItens })`:**
1. Fila: `congeladosPedido.findMany({ where: { status: { in: ['AGUARDANDO','PENDENTE_CADASTRO'] }, OR: [{ congeladosCliente: { clienteUuid: cliente.UUID } }, { documentoCliente: normalizarDoc(cliente.Documento) }] }, include: { itens: { include: { congeladosProduto: { include: { produto: {include: imagens, categoriaProduto, congeladosProduto…} } } } } }, orderBy: { createdAt: 'desc' } })` — o OR pelo documento cobre conta do site ainda sem `clienteUuid`. Se `cliente.Documento` for nulo, só o primeiro ramo.
2. Pedidos: a query atual de `historicoPedidos` (`iaClienteService.js:98`) + `include: { congeladosPedido: { select: { numero, observacoes } }, embarque: { select: { responsavel: { select: { nome } } } } }` + `cancelado`, `canalOrigem`, `nfeNumero`, `createdAt`, `observacoes`; itens com `promocaoId` e `produto` completo (imagens, categoriaProduto, congeladosProduto).
3. Concatena `[...fila, ...pedidos]` (fila no topo, `limite` só vale para os Pedidos — documentar).
4. `carregarExtrasProdutos` uma vez com todos os `produtoId` do lote; `preparoLabel` via `congeladosConfig.categoriasNomes` (1 query).

**`ultimoPedidoDetalhe(cliente)`** = primeiro `Pedido` com `bonificacao: false`, `cancelado: false`, `statusEnvio != 'EXCLUIDO'`, `orderBy createdAt desc` (mesma regra do `_ultimoPedidoCliente`), com itens, ou `null`.
**`pedidosEmAberto(cliente)`** = entradas de fila + Pedidos com `emAberto` (máx. 5, com itens).
**`pedidoPorNumero({ cliente, numero, fonte })`**: `fonte==='FILA'` → `congeladosPedido.findFirst({ where: { numero, OR:[…mesmo do item 1] } })`; senão `pedido.findFirst({ where: { numero, clienteId: cliente.UUID, statusEnvio: { not: 'EXCLUIDO' } }, orderBy: { createdAt: 'desc' } })` (203 números repetidos no banco — o filtro por cliente e o `orderBy` são obrigatórios). Sem `fonte`, tenta `PEDIDO` e, não achando, `FILA`. Retorno: `{ reconhecido: true, encontrado: bool, pedido }`.

### Passo 5 — `iaClienteService.js` + controller + rotas (itens 1, 2, 5, 7)

- **`reconhecerPorTelefone`** (+): `ultimoPedidoDetalhe`, `pedidosEmAberto`, `horaCorte`, `proximasEntregas` (próximas 2 datas `YYYY-MM-DD` a partir de amanhã cujo dia da semana está em `Dia_de_entrega` — reaproveitar a lógica de `diasEntregaNums`), `ultimaCompraEm` + `diasSemComprar` (do `ultimoPedidoDetalhe.data`), `condicaoPagamento` ganha `id, prazoDias (parcelasDias), parcelas (qtdParcelas), tipoPagamento, permiteEspecial`, `vendedor` continua string e entra `vendedorInfo: { nome, nomeBot: nomeVendedorBotHardt, ativo }` (mesma regra do site: só se `vendedor.ativo !== false`), `endereco: { logradouro, numero, complemento, bairro, cidade, uf, cep }` (`End_*`).
- **`historicoPedidos`** → delega a `iaPedidoService.listarPedidosDoCliente`. Sem `comItens` a resposta continua sendo a mesma **mais** os campos novos e as entradas de fila.
- **`produtosComprados(telefone, { meses = 12 (máx 24) })`**: `pedido.findMany({ where: { clienteId, bonificacao: false, cancelado: false, statusEnvio: { not: 'EXCLUIDO' }, dataVenda: { gte: hoje − meses } }, select: { id, dataVenda, itens: { select: { produtoId, quantidade, valor } } } })`; agrega por `produtoId`: `vezes` (pedidos distintos), `qtdTotal`, `qtdMedia = round(qtdTotal/vezes, 1)`, `ultimaCompra`, `primeiraCompra`, `ultimoPreco` (item do pedido mais recente), `semanasDesdeUltima`; ordena por `ultimaCompra desc`. Devoluções **não** são descontadas (documentar; é agregado de tendência, não de faturamento). Resposta: `{ reconhecido, janelaMeses, resumo: { totalPedidos, primeiroPedido, ultimoPedido, intervaloMedioDias }, produtos: [{ produtoId, id, nome, unidade, ultimaCompra, vezes, qtdMedia, qtdTotal, ultimoPreco, noSite, produto }] }`. `nome` aqui = `nomeSite ‖ Produto.nome` (mesma regra do catálogo).
- **`situacaoFinanceira(telefone)`** (só painel): reproduzir a consulta de `clienteController.js:236-262` restrita a `clienteId: cliente.UUID` (copiar o **OR explícito**, nunca `NOT`), descartar `idsContasEmEsperaDeConferencia({ clienteIds: [cliente.UUID] })`, `hoje` = meia-noite em `America/Sao_Paulo` (`clienteController.js:236-237`). Resposta `{ reconhecido, inadimplente, titulosVencidos, valorVencido, vencidoDesde, diasAtraso, titulosAbertos, valorAberto }` (`titulosAbertos/valorAberto` = parcelas em aberto ainda não vencidas — extra barato). Valores com 2 casas; `vencidoDesde` `YYYY-MM-DD` ou `null`.
- **`fichaPorDocumento`** (+ `horaCorte`) — só isso, para o painel ter a mesma informação.
- **Controller**: `produtosComprados`, `situacao`, `pedidoPorNumero` (`req.params.numero`, `req.query.telefone`, `req.query.fonte`; `numero` inválido → 400).
- **Rotas** (`iaConsultaRoutes.js`):
  ```js
  v1.get('/congelados/catalogo', congeladosCtrl.catalogoIA);        // troca do handler (mesma URL, resposta = antiga + campos)
  v1.get('/congelados/promocoes', congeladosCtrl.promocoes);
  v1.get('/congelados/indisponiveis', congeladosCtrl.indisponiveis);
  v1.post('/cliente/produtos-comprados', iaClienteCtrl.produtosComprados);
  v1.post('/cliente/situacao', iaClienteCtrl.situacao);             // SÓ PAINEL — comentar igual a buscar/ficha
  v1.get('/cliente/pedido/:numero', iaClienteCtrl.pedidoPorNumero); // exige ?telefone=
  ```
  `meu-catalogo` da IA passa a chamar `svc.meuCatalogo(id, { paraIA: true })` (controller `meuCatalogo` lê `req.iaConsulta === true`, que o router `v1` seta num middleware de 1 linha — ou criar `meuCatalogoIA`; escolher a segunda, é mais explícita).

### Passo 6 — `congeladosService.js` (ajustes finos)

- `catalogoVisitante({ paraIA } = {})` / `meuCatalogo(id, { paraIA })` / `catalogoPorTelefone`: quando `paraIA`, chamar `enriquecerCatalogoParaIA(lista, ctx)` (`carregarExtrasProdutos` + `produtoParaIA` por item, `Object.assign` no item existente). Em `catalogoPorTelefone`, além disso: `ultimoPedido[]` (array, intocado) ganha `produto` em cada item; entram `ultimoPedidoDetalhe`, `pedidosEmAberto`, `horaCorte`, `proximasEntregas`, `vendedorInfo`, `condicaoPadrao` ganha `prazoDias/parcelas/tipoPagamento` (é objeto já existente: só somar chaves).
- `configPublico()` ganha `horaCorte` (a rota pública do site também passa a devolver — inofensivo).
- `promocoesVigentes()`, `indisponiveis()` (= `catalogoPublico().filter(p => p.indisponivel)` enriquecido; `previsaoRetorno: null`).
- `criarPedidoSite`/`criarPedidoIA`/`adminAprovarPedido`/`meusPedidos` conforme Passo 3d.
- **Regra boy-scout de `$transaction`:** `congeladosService.js` **não** tem `$transaction` (conferido) — nada a ajustar. `iaClienteService.js` idem. Nenhuma operação nova precisa de transação (leituras; a criação já era um único `create` aninhado).

### Passo 7 — Versão, docs, manual

- `iaConsultaVersao.js`: `VERSAO_API = '1.6.0'`; comentário de histórico; `AVISOS` += aviso informativo (sem prazo): "`POST /cliente/historico-pedidos` passa a incluir, no topo, pedidos ainda na fila de aprovação (`fonte: 'FILA'`, `status: AGUARDANDO/PENDENTE_CADASTRO`, `numero` = número da fila). Nenhum campo foi removido; entradas antigas continuam com `fonte: 'PEDIDO'`. Note também que `dataEntrega` sempre foi a hora REAL da entrega — a data prevista está em `dataPrevista`."
- `backend/docs/ia-consulta-api.md`: linhas da tabela (6 rotas novas/ajustadas), seção **"v1.6.0 — dados para a Ana tirar o pedido semanal"** com: objeto de produto (tabela campo→significado, o que vem `null`), objeto de pedido (`fonte`, `emAberto`, semântica de `dataEntrega`×`dataPrevista`×`entregueEm`), promoções (tipos existentes, `tabelas:['*']`, `precoPromo` por contexto), criação com `promocaoId`/`observacaoInterna`/`origem` e os códigos de erro (`PROMOCAO_INVALIDA`, `PROMOCAO_NAO_LIBERADA`, `VISITANTE_SEM_CPF`), `situacao` 🔒 só painel, `horaCorte` (config, pode ser `null`, SQL de configuração), `GET /cliente/pedido/:numero` (exige `telefone`, `fonte`), curls; item no "Histórico de versões". Corrigir a frase antiga "`ultimoPedido:[…]`" acrescentando "`ultimoPedidoDetalhe` (objeto) desde a 1.6".
- `backend/manuais/abas/site-congelados.md:50`: acrescentar que o pedido da Ana pode trazer, no fim das observações, `[Interno] …` (combinado da Ana com o cliente, **não vai para o pedido/nota**) e `[Promoção] …` (promoção aplicada no preço do item) — e que ao aprovar só a observação do cliente vai para o pedido. Nenhuma outra tela muda; **tabela `ABAS` do `copilotoService.js` não muda**.

### Passo 8 — Teste local com curl (antes do commit), depois commit

Ver §6. `IA_WHATSAPP_API_KEY=teste-local node index.js` na pasta `backend`.

---

## 4. Riscos e efeitos colaterais

| # | Risco | Mitigação / decisão |
|---|---|---|
| R1 | **Sem coluna** para `origem`, `observacaoInterna` e `promocaoId` na fila → tudo vive como texto em `observacoes`. Se alguém editar a observação na mão, o marcador some. `promocaoId` do item não sobrevive ao caminho idempotente. | Aceito para não tocar o schema agora. **Recomendação ao dono:** depois que a outra sessão commitar o schema, criar `CongeladosPedido.origem`, `CongeladosPedido.observacaoInterna` e `CongeladosPedidoItem.promocaoId` (aditivos) e migrar os marcadores — 1.6.1, sem mudar o contrato (os campos da API já existirão). |
| R2 | `Pedido.observacoes` vai para a **NF-e** (`focusNfeEmissaoService.js:250`) e para o **recibo** (`reciboEspecialPdf.js:284`, `ImpressaoPedido.jsx`). Se o bloco `[Interno]` não for removido em `adminAprovarPedido`, o combinado interno da Ana sai impresso para o cliente. | `separarObservacoes` obrigatório em `adminAprovarPedido` e `meusPedidos`. Revisor confere; QA aprova um pedido da Ana e abre o Pedido gerado. |
| R3 | `historico-pedidos` passa a ter entradas de fila mesmo para quem não pediu — um consumidor antigo que lê `pedidos[0].numero` como "último pedido real" pode pegar um número de fila. | O bot pediu exatamente isso; `fonte` distingue; aviso em `AVISOS`; doc. Alternativa (se o dono preferir): flag `incluirFila` default `true` — mesma coisa, só dá botão de desligar. |
| R4 | `Pedido.numero` **não é único** (203 repetidos). | `GET /cliente/pedido/:numero` filtra por cliente + `orderBy createdAt desc`. Nunca `findUnique`. |
| R5 | `criarPedidoSite` é compartilhado com o site público (`congeladosPublicRoutes.js:38`). Se `promocaoId` for aceito sem a trava, o site passa a aplicar promoção via JSON. | Parâmetro `permitirPromocao` só ligado pelo `criarPedidoIA`. |
| R6 | Enriquecer o catálogo público do site (`/api/congelados-publico/catalogo`) com etiqueta+promoção aumentaria payload e exporia promoção/preço-tabela no JSON do site. | Enriquecimento só nas rotas da IA (`catalogoIA`, `meuCatalogoIA`, `catalogoPorTelefone`). O site continua igual. |
| R7 | Semântica de `precoPromocional`: `NovoPedido.jsx:1238` aplica o acréscimo da tabela; `pedidoCalculos.js:47` usa o valor cru para o flex. Inconsistência **pré-existente** — não é desta tarefa. | Seguir a tela (com acréscimo). Ao aprovar, `pedidoService.criar` reavalia a promoção e pode dar flex ≠ 0 nesse item — é o mesmo que acontece com um pedido do vendedor hoje. Registrar na nota de entrega para o dono saber. |
| R8 | Mais 4-6 queries em cada reconhecimento (etiquetas, promoções, fila, último pedido, em aberto, config). O reconhecimento já carrega todos os clientes (`_clientePorTelefone`) — pré-existente. | Tudo em lote por `produtoId`; sem N+1. Medir com `time curl` no QA (meta: < 1,5 s local). |
| R9 | `horaCorte` `null` até alguém gravar em produção. | Documentado; o bot já lida com `null`. Sem tela agora (pedido do dono). |
| R10 | `avaliarLiberada` com `VALOR_TOTAL` usa o subtotal **a preços normais** (primeira passada). Uma promoção "acima de R$ X" pode ficar liberada e, depois do desconto, o total cair abaixo de X. | Mesmo comportamento da tela do vendedor (estimativa antes do desconto). Documentar. |
| R11 | Consumidores das funções alteradas (grep feito): `catalogoVisitante` ← `congeladosController.catalogo` (site + IA); `meuCatalogo` ← site + IA; `criarPedidoSite` ← site + `criarPedidoIA`; `historicoPedidos` ← só a rota da IA; `_ultimoPedidoCliente` ← `meuCatalogo` + `catalogoPorTelefone`; `adminAprovarPedido` ← `congeladosRoutes` (admin). Kit Festa tem serializer **próprio** (`kitFestaService.js:62`) — não é tocado. | Todas as mudanças são aditivas ou atrás de parâmetro opcional. |
| R12 | Banco local não tem produtos de congelados/promoções/etiquetas. | QA semeia (§6) ou roda `backend/scripts/sync-from-production.js` (obs.: esse script tem **login/senha de produção em texto puro nas linhas 10-11** — fora do escopo, mas vale avisar o dono). |
| R13 | Arquivos sujos da outra sessão: nenhum é editado por este plano. Se o `pedidoService.criar` mudar de assinatura lá, `adminAprovarPedido` (nossa alteração) continua chamando do mesmo jeito — combinar o `pull --rebase` antes do push. | Revisor confere o diff só nos arquivos listados em §3. |

---

## 5. O que NÃO fazer

- **Não** mudar tipo/nome de nenhum campo de `/v1` (em especial: `ultimoPedido` continua array; `grupo` continua ID; `embalagem` continua string; `dataEntrega` continua a hora real da entrega).
- **Não** aceitar `precoUnit`/`valor` vindo do bot — nem "se preferirem".
- **Não** expor `situacao` como tool da IA nem devolver cobrança em nenhum endpoint de conversa.
- **Não** liberar nada por CPF/CNPJ sozinho; `GET /cliente/pedido/:numero` sem `telefone` = 400.
- **Não** editar `schema.prisma` nem os outros 14 arquivos sujos.
- **Não** gravar o bloco `[Interno]` em `Pedido.observacoes` (NF-e/recibo).
- **Não** enriquecer o catálogo do site público.
- **Não** criar tela de `horaCorte` agora.
- **Não** usar `NOT`/`notIn` em campo nullable nas queries de inadimplência (`situacaoCA`) — OR explícito (memória "Prisma not exclui null").
- **Não** mandar WhatsApp nenhum a partir destes endpoints (só leitura + criação na fila).
- **Não** derivar `preparo`/`linha` do prefixo `1-`/`2-`/`FR` do nome (significado não confirmado).

---

## 6. Critérios de aceite — curls que o QA roda (backend local, `IA_WHATSAPP_API_KEY=teste-local`, `PORT=3000`)

Preparação (uma vez, no `hardt_local`): escolher um cliente ativo com telefone e pedidos (`select "UUID","Nome","Telefone_Celular" from clientes c where "Ativo" and "Telefone_Celular" is not null and exists (select 1 from pedidos p where p.cliente_id=c."UUID") limit 3;`); vincular 3 produtos dele ao site (`insert into congelados_produtos(id,produto_id,unidades_por_caixa,embalagem,ativo,created_at,updated_at) …` ou pela tela Site → Produtos); criar 1 promoção `SIMPLES` vigente e 1 `CONDICIONAL` (tela Produtos → Promoção) num produto do site; garantir 1 parcela vencida em aberto para esse cliente (ou escolher um que já tenha); gravar `INSERT INTO app_configs … ia_consulta_config`.

```bash
H='-H x-ia-api-key:teste-local -H content-type:application/json'; B=http://localhost:3000/api/ia-consulta/v1; T=5547XXXXXXXX
# A. versão
curl -s $H $B/status | jq .meta                       # versaoApi == "1.6.0", avisos contém o aviso da fila
# B. catálogo IA: campos novos + antigos preservados
curl -s $H $B/congelados/catalogo | jq '.dados[0] | {id,produtoId,preco,precoTabela,precoCliente,grupo,grupoNome,embalagem,embalagemInfo,tamanho,pesoUnidadeG,preparo,preparoTipo,disponivel,previsaoRetorno,promocao,nomeCompleto,nomeCurto}'
#    esperado: preco número (como antes), precoCliente null, embalagem string, embalagemInfo objeto, previsaoRetorno null, promocao objeto no produto promovido
# B2. catálogo PÚBLICO do site NÃO ganhou os campos
curl -s http://localhost:3000/api/congelados-publico/catalogo | jq '.[0] | has("precoTabela")'   # false
# C. reconhecimento congelados
curl -s $H -X POST -d "{\"telefone\":\"$T\"}" $B/congelados/reconhecer-telefone | jq '.dados | {reconhecido, tipoUltimo: (.ultimoPedido|type), detalhe: .ultimoPedidoDetalhe.numero, itens: (.ultimoPedidoDetalhe.itens|length), emAberto: (.pedidosEmAberto|length), horaCorte, proximasEntregas, vendedorInfo, condicaoPadrao}'
#    esperado: tipoUltimo == "array" (INALTERADO); ultimoPedidoDetalhe objeto com itens[].produto; horaCorte "17:00"
# D. reconhecimento geral
curl -s $H -X POST -d "{\"telefone\":\"$T\"}" $B/cliente/reconhecer-telefone | jq '.dados | {reconhecido, cliente, diasEntrega, condicaoPagamento, ultimoPedidoDetalhe: .ultimoPedidoDetalhe.numero, horaCorte, endereco, ultimaCompraEm, diasSemComprar}'
# E. histórico sem comItens = campos antigos intactos + novos; com comItens = itens[].produto
curl -s $H -X POST -d "{\"telefone\":\"$T\",\"limite\":3}" $B/cliente/historico-pedidos | jq '.dados.pedidos[] | {fonte,numero,numeroFila,data,dataPrevista,dataEntrega,entregueEm,entregador,status,statusEntrega,emAberto,tipo,total,origem,itens}'
#    esperado: sem `itens`; ordem: FILA primeiro (se houver) depois PEDIDO por dataVenda desc
curl -s $H -X POST -d "{\"telefone\":\"$T\",\"limite\":2,\"comItens\":true}" $B/cliente/historico-pedidos | jq '.dados.pedidos[0].itens[0] | {produtoId,nome,quantidade,unidade,precoUnit,id,precoTotal,promocaoId,produto: (.produto|keys)}'
# F. produtos comprados
curl -s $H -X POST -d "{\"telefone\":\"$T\"}" $B/cliente/produtos-comprados | jq '.dados | {reconhecido, janelaMeses, resumo, n: (.produtos|length), p0: .produtos[0]}'
#    esperado: ordenado por ultimaCompra desc; vezes/qtdMedia coerentes com `select produto_id,count(distinct pedido_id),sum(quantidade) from pedido_itens …`
# G. promoções
curl -s $H $B/congelados/promocoes | jq '.dados.promocoes[] | {tipo,tipoSistema,precoPromo,precoPromoBase,precoNormal,condicao,validoAte,tabelas,produtoId,id_site}'
#    esperado: SIMPLES→"PRECO" com condicao null; CONDICIONAL com texto; promoção com dataFim passada NÃO aparece
# H. criar pedido com promoção válida (idempotencyKey nova)
curl -s $H -X POST -d "{\"telefone\":\"$T\",\"itens\":[{\"id\":\"<cpId>\",\"quantidade\":2,\"promocaoId\":\"<promoId>\"}],\"observacoes\":\"sem cebola\",\"observacaoInterna\":\"aceitou promo\",\"origem\":\"WHATSAPP_IA\",\"idempotencyKey\":\"qa-1\"}" $B/congelados/pedido | jq .dados
#    esperado: status AGUARDANDO, origem WHATSAPP_IA, itens[0].precoUnit == round(precoPromocional×(1+acréscimo/100),2), itens[0].produto presente
#    conferir no banco: observacoes = "[WhatsApp IA] sem cebola\n[Interno] aceitou promo\n[Promoção] …"
# H2. repetir o mesmo idempotencyKey → mesmo numero, itens presentes, sem pedido novo
# H3. promoção de outro produto / encerrada / condicional não atendida → 400 {error, code: PROMOCAO_INVALIDA | PROMOCAO_NAO_LIBERADA}, nada gravado
# H4. precoUnit no body é ignorado (mandar 1.00 e conferir precoUnit da resposta)
# I. fila e aprovação (tela Site → Pedidos, logado): card mostra "[Interno] aceitou promo" na Obs; aprovar → Pedido.observacoes == "Site Congelados #N · sem cebola" (SEM [Interno]/[Promoção]); ImpressaoPedido sem o interno
# J. depois de aprovado: histórico traz o Pedido real com fonte PEDIDO, numeroFila == N, origem WHATSAPP_IA; a entrada FILA sumiu (sem duplicar)
# K. situação (só painel)
curl -s $H -X POST -d "{\"telefone\":\"$T\"}" $B/cliente/situacao | jq .dados
#    esperado: inadimplente true/false coerente com o selo do cadastro do cliente no app; valorVencido = soma dos saldos; vencidoDesde YYYY-MM-DD
# L. pedido por número
curl -s $H "$B/cliente/pedido/<numeroPedido>?telefone=$T" | jq '.dados | {encontrado, p: (.pedido|{fonte,numero,statusEntrega,entregueEm,entregador,nfeNumero})}'
curl -s $H "$B/cliente/pedido/<numeroFila>?telefone=$T&fonte=FILA" | jq '.dados.pedido.fonte'      # "FILA"
curl -s $H "$B/cliente/pedido/<numeroPedido>" -o /dev/null -w '%{http_code}\n'                     # 400 (sem telefone)
curl -s $H "$B/cliente/pedido/<numeroDeOutroCliente>?telefone=$T" | jq '.dados.encontrado'        # false
# M. indisponíveis: zerar estoque_disponivel de um produto do site → aparece em /congelados/indisponiveis e disponivel:false no catálogo; criar pedido com ele → erro "indisponível" (comportamento já existente)
# N. sem chave → 401; chave errada → 401 (inalterado)
# O. site público continua igual: POST /api/congelados-publico/pedido com promocaoId no item → promoção IGNORADA (preço normal)
```

**Revisor confere além disso:** nenhum campo antigo removido/renomeado (diff das funções `produtoSitePublico`, `historicoPedidos`, `catalogoPorTelefone`, `criarPedidoIA`); `separarObservacoes` nos 3 pontos; `permitirPromocao` default `false`; OR explícito na inadimplência; sem `$transaction` novo sem timeout; sem `select` de campo inexistente no Prisma (memória "validar select"); doc e versão no mesmo commit; nenhum arquivo sujo tocado.

**Produção (depois do deploy):** rodar A, B, C, D, G com a chave real; gravar `ia_consulta_config`; mandar os curls para o time da Ana.

---

## 7. Perguntas ao dono (não bloqueiam o início; bloqueiam só o campo)

1. **Prefixo do nome do produto** (`1-`/`2-` e `FR`): o que significam? Se `FR` = "frito" e `1-`/`2-` = linha, dá para preencher `preparoTipo`/`linha` por produto na 1.6.1. Hoje `preparoTipo` vem só da categoria.
2. **`ultimoPedidoDetalhe`** = último pedido **real** (Pedido, não bonificação). Se ele quiser que um pedido ainda na fila conte como "último", é só olhar `pedidosEmAberto` — confirmar que é isso.
3. **Promoção após aprovação**: o Pedido real vai ter `emPromocao` reavaliado pelo `pedidoService` (regra atual do vendedor). OK?
4. Criar os 3 campos no schema (R1) numa 1.6.1 assim que o schema estiver livre?

---

## 8. Sugestões extras de dados para a Ana (além dos 8 itens)

**Já incluídas neste plano (baratas, mesma regra de segurança — só com telefone batendo):**
- `pedidosEmAberto[]` nos dois reconhecimentos ("já tem pedido esta semana" sem chamar o histórico).
- `proximasEntregas[]` (próximas 2 datas de entrega pelo `Dia_de_entrega`) — a Ana fala "chega terça, dia 16".
- `ultimaCompraEm` / `diasSemComprar` — "faz 3 semanas que você não pede".
- `condicaoPagamento`/`condicaoPadrao` com `prazoDias`, `parcelas`, `tipoPagamento` — "boleto 28 dias, mínimo R$ 400".
- `vendedorInfo { nome, nomeBot, ativo }` — para o handoff `[Vendedor Hardt: Nome]` que o site já faz.
- `endereco` do cadastro — "entrega no mesmo endereço da Rua X?".
- `produtos-comprados.resumo.intervaloMedioDias` — cadência real do cliente (semanal/quinzenal).
- `nfeNumero` no pedido — "sua nota é a 85.140".
- `titulosAbertos/valorAberto` em `situacao` (painel) — o financeiro vê o total em aberto, não só o vencido.
- `GET /congelados/indisponiveis` (opção b do item 6) além do `disponivel` embutido.

**Para o dono decidir (não incluídas):**
- `observacaoComercialFixa` do cliente (nota fixa do vendedor) em `/cliente/ficha` (só painel) — pode conter juízo sobre o cliente; expor só se ele quiser.
- `ticketMedio`/`totalUltimos12m` em `/cliente/ficha` (painel) — contexto para a Leticia priorizar.
- Sugestão de "comprados juntos" (cross-sell, item D da Fase 2) — exige análise de cesta; fica para depois.
- Callback de mudança de status (pedido aprovado/recusado/entregue → bot) — hoje o bot precisaria consultar; um webhook de saída é assunto de outra tarefa (e depende do bot expor endpoint).

---

## 9. Porte e equipe

**Grande.** Só backend. Ordem: `dev-backend` (Passos 1→8, um commit) → `qa-testador` (§6, com o backend local e a tela Site → Pedidos para I) + `revisor-codigo` (diff restrito aos arquivos de §3) → `gerente-entrega`. Nota de entrega deve incluir: os curls de produção rodados, o SQL do `ia_consulta_config`, a lista de campos que vêm `null` (`previsaoRetorno`, `tamanho`/`pesoUnidadeG` quando o nome não segue o padrão, `preparoTipo` sem rótulo na categoria, `horaCorte` sem config) e a recomendação R1 (schema na 1.6.1).
