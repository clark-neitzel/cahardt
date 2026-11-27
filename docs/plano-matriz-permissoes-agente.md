# Plano — Matriz de permissões da API (módulo × ação) do usuário-agente

Código lido em `/Users/clarksonneitzel/Projetos/CA-Hardt-wt-forn` (commit `23af0330`, árvore limpa). Nada foi alterado.

## Dois avisos antes do plano

1. **Não gravei `docs/plano-matriz-permissoes-agente.md`.** Minha ficha de arquiteto é somente leitura e proíbe criar arquivo no projeto, e ela vale mais que o pedido da tarefa. O plano completo está abaixo, pronto para o gerente ou um dev salvar nesse caminho sem editar.
2. **`docs/agente-classificacao-escrita.md` não existe no worktree `-wt-forn`.** Ele está só em `/Users/clarksonneitzel/Projetos/CA-Hardt/docs/` (não versionado), junto de `docs/pacote-luke/` e `docs/criar-luke-console.js`. Li de lá. Precisa ser commitado, porque o D1 depende dele como fonte da classificação.

---

## 1. Objetivo

O dono controla, numa tela do cadastro do usuário, o que cada conexão por API pode fazer: módulo × ação, com NÃO / PEDE AUTORIZAÇÃO / SIM. A API obedece. Em código ficam só os bloqueios fixos e as guardas de segurança.

Interpretação adotada: "mora no cadastro do usuário" é onde o dono mexe (a tela), não a coluna do banco onde o dado é guardado.

## 2. Mapa do código atual

| O quê | Onde |
|---|---|
| Autenticação do agente e do ticket; decisão LIBERADO/PEDE/BLOQUEADO | `backend/middlewares/authMiddleware.js:69` (`autenticarTicket`), `:121` (`autenticarAgente`) |
| Bloqueios fixos, seed de leitura, exceções de GET | `backend/config/agentePoliticaPadrao.js:16` (`BLOQUEIO_PREFIXOS`), `:53` (`FAMILIAS_LEITURA`), `:69` (`EXCECOES_LEITURA`), `:87` (`nivelSeed`) |
| Resolução e cache de overrides (TTL 15 s) | `backend/services/agentePoliticaService.js:69` (`resolverEntrada`), `:93` (`avaliar`), `:25` (`montarMapas`) |
| Trava "escrita não pode ser LIBERADA" | `agentePoliticaService.js:76` e `:216` (422) |
| Catálogo de rotas (`METHOD /api/caminho/:p`, família) | `backend/services/agenteCatalogoRotas.js` |
| Fila PEDE, loopback, ticket | `backend/services/agenteSolicitacaoService.js:448` (já envia `Idempotency-Key: sol-<id>`, que nenhuma rota lê; aviso em `:40`) |
| Foto "antes" do alvo | `backend/config/agenteAntes.js` (só 4 funções de contas a pagar) |
| Defesa em profundidade | `backend/utils/agenteContexto.js` (`assertNaoAgente`) |
| Tabela de exceções | `backend/prisma/schema.prisma:1107` (`AgentePolitica`: `escopo` e `nivel` são String livres) |
| Rotas de gestão, só admin humano | `backend/routes/agenteRoutes.js:15-21`; política em `:134-175` |
| `meu-acesso` do agente | `backend/routes/agenteApiV1Routes.js:37` |
| Criação do Luke e cópia de permissões | `backend/services/agenteCriarService.js:12`, `:244`; `backend/routes/adminExec.js:13404` |
| Criação de agente pela tela | `backend/services/agenteTokenService.js:104-110` (nasce com `permissoes: {}`) |
| Cadastro de usuários | `frontend/src/pages/Admin/Vendedores/ListaVendedores.jsx`, `PermissoesModal.jsx` (`BOOL_INDEX` em `:257`), `NovoUsuarioModal.jsx` |
| Tela de agentes | `frontend/src/pages/Admin/Agentes/AgentesIA.jsx`, `TokenModal.jsx`, `ModalBase.jsx`, `SolicitacoesAgente.jsx`; rotas em `frontend/src/App.jsx:1065-1066` |
| Testes | `backend/tests/agentePolitica.test.js` (42 casos), `agenteSolicitacoes.test.js`, `tests/helpers/testApp.js`, `scripts/dump-catalogo-agente.js` |

Fatos confirmados no código que mudam o desenho:

- **O Luke já aparece na lista de Usuários.** `frontend/src/services/vendedorService.js:26` chama `incluirExternos=true`, o agente nasce com `acessoExterno: true`, e `vendedorController.listar` (`:13-19`) não filtra `agente`. Hoje dá para abrir o `PermissoesModal` dele.
- **Os efeitos externos já estão cortados para o agente.** `assertNaoAgente` está em `botWhatsappService` (318/366/413), `focusNfeService`, `focusNfeEmissaoService`, `sefazDfeService` (474/636/824/975/1046), `asaasService` (9 pontos), `googleDriveService:129`, `emailService`, `googleCalendarService` e `consultaCnpjService:145`.
- **No `gerar-conta` do agente, a operação principal sobrevive.** A manifestação SEFAZ cai no `catch` de `confirmarOperacaoAuto` (`routes/notasEntrada.js:336-366`) e vira aviso; o Drive cai no `.catch` (`:2233`).
- **Efeito real a vigiar:** numa baixa de contas a receber feita pelo agente, o cancelamento do boleto/PIX no Asaas é recusado (`asaasService.js:436`) e só logado (`contasReceber.js:1254`, `:1428`). O QR fica vivo até o worker de faxina passar.

## 3. Crítica da proposta inicial

**3.1 Não guardar a matriz em `Vendedor.permissoes.api`.** Há três caminhos confirmados que apagam essa chave sem erro:

- `PermissoesModal.jsx:509`, "copiar permissões de outro usuário": `{...DEFAULT_PERMISSIONS, ...sourcePerms}` descarta o que a origem não tem.
- `PermissoesModal.jsx:668`, "restaurar versão".
- `agenteCriarService.js:244`: reexecutar `agente-criar` grava `permissoes: permsNovas` por cima de tudo.

Além disso, o PUT `/vendedores/:id` substitui o JSON inteiro, e `permissoes` é lido por dezenas de checks no padrão frágil `!!perms.x`.

**Recomendado: reusar `agente_politicas` com escopo novo `MODULO`**, chave `modulo.acao` (ex.: `contas_pagar.criar`) e `nivel` no vocabulário que já existe (LIBERADO/PEDE/BLOQUEADO; a API e a tela traduzem para SIM/PEDE/NÃO). Vantagens:

- Zero mudança de schema para a matriz.
- Reaproveita cache, invalidação, `atualizadoPor*` e auditoria.
- O código antigo ignora escopo desconhecido (`montarMapas:29-30` só aceita FUNCAO e FAMILIA), então o rollback de código é seguro.
- As exceções por função (`escopo FUNCAO`) já são o `extras` da proposta.

**3.2 Um arquivo de classificação, não dois.** `backend/config/agenteModulos.js` traz módulos, rótulos, famílias, ações aplicáveis e permissões-base. `backend/config/agenteClassificacao.js` traz chave → `{acao, flags}` só para as escritas. GET não é listado um a um: GET de família mapeada vale `ver`, com `EXCECOES_LEITURA` continuando como exceção.

**3.3 Rota nova não classificada: nasce em PEDE, nunca em SIM.**

- Escrita não classificada em família mapeada: PEDE se a célula `editar` do módulo não for NÃO; senão NÃO.
- GET novo em família mapeada: herda `ver` (é o comportamento de hoje).
- Família sem módulo: BLOQUEADO (como hoje).
- Teste automático falha listando as chaves de escrita sem classificação, para o dev classificar no mesmo PR.

Assim uma função nova não fica morta para o agente (o dono autoriza caso a caso) e nunca ganha autonomia sozinha.

**3.4 Guarda que falha rebaixa SIM para PEDE, não devolve erro.** Um `confirmarDuplicata: true` enviado por um agente não protege nada. Suspeita de duplicata, `pago:true`, categoria fora da DRE, lote grande ou `forcar=true` fazem a chamada virar solicitação, com o motivo no resumo, e o dono decide.

## 4. Estrutura de dados

- **Matriz:** linhas em `agente_politicas` com `escopo='MODULO'`, `chave='<modulo>.<acao>'`, `nivel` LIBERADO/PEDE/BLOQUEADO. `ver` só aceita LIBERADO ou BLOQUEADO (validado no PUT).
- **Marcador de ativação:** linha `escopo='MATRIZ'`, `chave='ativa'`, `nivel='LIBERADO'`. Sem o marcador, o agente resolve pela política atual, linha por linha como hoje. É o que garante que publicar o D1 não muda nada no Luke até o seed.
- **Exceções por função:** as linhas `FUNCAO` atuais, com precedência sobre a célula. Linhas `FAMILIA` são ignoradas com a matriz ativa (o dry-run do seed lista quantas existem).
- **Idempotência:** tabela nova `agente_idempotencia` (`id`, `vendedorId`, `chave`, `funcao`, `corpoHash`, `status` EM_ANDAMENTO|CONCLUIDA, `respostaStatus`, `resposta Json?`, `criadoEm`; `@@unique([vendedorId, chave])`, `@@index([criadoEm])`). Tabela nova é segura no `prisma db push`. Limpeza de linhas com mais de 30 dias no `workers/scheduler.js`.
- **Ordem de decisão:**
  1. caminho tortuoso → BLOQUEADO
  2. bloqueio fixo → 403 `AGENTE_BLOQUEADO` (`fixo:true`)
  3. sempre liberado
  4. rota complexa ou desconhecida → BLOQUEADO
  5. flag `SO_ADMIN` → 403 `AGENTE_SO_ADMIN`
  6. exceção FUNCAO
  7. classificação → célula da matriz: NÃO → 403 `AGENTE_SEM_PERMISSAO` com `{modulo, acao}`; PEDE → fila 202; SIM → guardas (rebaixam para PEDE) → idempotência → executa
  
  URL que casa com várias funções continua valendo a mais restritiva.

## 5. Módulos e ações

Ações: `ver`, `criar`, `editar`, `excluir`, `estornar`, `baixar`. O rótulo de `baixar` muda por módulo.

Mapa a partir do doc de classificação: CRIAR → criar; MODIFICAR → editar; EXCLUIR → excluir; ESTORNAR → estornar; BAIXAR_FATURAR e CONCILIAR → baixar; PREVIA sem chamada externa → ver; ENVIO_EXTERNO e PREVIA com chamada externa → bloqueio fixo por chave; OUTRO → editar (exceto `estoque/produto/:p/recalcular`, que é SO_ADMIN, e `clientes/sync`, rota morta, bloqueada).

| Módulo (chave) | Famílias | Rótulo de "baixar" |
|---|---|---|
| `contas_pagar` | `/api/contas-pagar`, `/api/anexos` | Dar baixa |
| `notas_recebidas` | `/api/notas-entrada` | Vincular a parcelas |
| `contas_receber` | `/api/contas-receber` | Dar baixa |
| `caixa` | `/api/caixa` | Fechar / conferir / baixar |
| `conciliacao` | `/api/conciliacao-bancaria`, `/api/contas-financeiras` | Conciliar / baixar |
| `dre_categorias` | `/api/financeiro-gerencial` | não se aplica |
| `contabilidade` | `/api/contabilidade` | só `ver` |
| `indicadores` | `/api/indicadores-gestao`, `/api/dashboards` | não se aplica |
| `cadastros` (clientes e fornecedores, um só) | `/api/clientes`, `/api/fornecedores` | não se aplica |
| `produtos` | `/api/produtos`, `/api/categorias-estoque` | não se aplica |
| `estoque` | `/api/estoque`, `/api/pcp/estoque` | não se aplica |
| `pcp` (receitas e insumos) | `/api/pcp/itens`, `/api/pcp/receitas` | não se aplica |
| `pedidos` | `/api/pedidos` | Aprovar / faturar |
| `expedicao` | `/api/embarques`, `/api/entregas` | Concluir entrega / conferência |

Célula sem nenhuma rota fica como "não se aplica": aparece como "—" na tela e não é gravável.

**Bloqueios fixos (não aparecem como liberáveis).** Separar em duas constantes:

- `FIXO_DURO`, as cinco categorias do dono: `/api/agentes`, `/api/admin*`, `/api/vendedores`, `/api/auth` (exceto `GET /me`), `/api/migrations`, `/api/config*` (guarda senhas e chaves), `/api/notas-fiscais`, as 4 rotas SEFAZ de notas-entrada, `/api/asaas`, `/api/whatsapp-clientes`, `/api/mensagens-agendadas`, `/api/cobranca`, mais as rotas de envio externo por chave (seção 7).
- `FORA_DE_ESCOPO`, que continuam bloqueados como hoje, sem afrouxar nada neste trabalho: `rh`, `ponto`, `curriculos`, `funcionarios`, `comissoes`, `ia-uso`, `ia-logs`, `visitors`, `diarios`, `gps-clientes`, `impressao`, `copiloto`, `cobrancas-rota`. São candidatos a virar módulo depois (decisão 5).

## 6. Matriz inicial do Luke

| Módulo | ver | criar | editar | excluir | estornar | baixar |
|---|---|---|---|---|---|---|
| contas_pagar | SIM | SIM | PEDE | PEDE | PEDE | PEDE |
| notas_recebidas | SIM | SIM | PEDE | PEDE | PEDE | PEDE |
| cadastros | SIM | SIM | PEDE | PEDE | PEDE | — |
| produtos | SIM | SIM | PEDE | PEDE | — | — |
| pcp | SIM | SIM | PEDE | PEDE | — | — |
| conciliacao | SIM | SIM | PEDE | PEDE | PEDE | PEDE |
| dre_categorias | SIM | SIM | PEDE | PEDE | — | — |
| contas_receber | SIM | — | — | PEDE | PEDE | PEDE |
| estoque | SIM | — | PEDE | — | — | — |
| caixa | SIM | PEDE | PEDE | PEDE | PEDE | PEDE |
| pedidos | SIM | PEDE | PEDE | PEDE | PEDE | PEDE |
| expedicao | SIM | PEDE | PEDE | PEDE | PEDE | PEDE |
| indicadores | SIM | PEDE | PEDE | PEDE | — | — |
| contabilidade | SIM | — | — | — | — | — |

> Ajuste do D1 (conferido contra o catálogo real): em `contas_receber`, `criar` e `editar` são "—". A única criação da família é `admin/sincronizar` (só de administrador) e não existe função de editar.

Segue a regra do dono (criar = SIM; o resto = PEDE; ver = SIM), com um desvio que vira decisão dele: `criar` fica PEDE em pedidos, caixa, expedição, contas a receber e indicadores (decisão 1).

Mesmo com `criar = SIM`, o servidor rebaixa para PEDE nestes casos:

- `pago:true` ou `dataPagamento` em `POST /contas-pagar` e `gerar-conta` (é baixa).
- `registrar-entrada` (classificar errado esconde uma dívida).
- `despesas-lote` e lotes acima de 20 itens.
- `por-conta/ajuste` e `grupos-dre` (fabricam saldo ou mexem na estrutura da DRE).
- Produto com `estoqueInicial`.
- Receita que não seja rascunho.
- `forcar=true` na importação de extrato.
- Categoria fora da DRE ou criada por texto livre.
- Suspeita de duplicata.

## 7. Rotas com efeito externo

**Bloqueio fixo por chave (13):**

- `POST /api/contas-pagar/:p/reenviar-ca`
- `POST /api/conciliacao-bancaria/sincronizar-asaas`
- `POST /api/conciliacao-bancaria/identificar-debitos-ca`
- `POST /api/contas-receber/:p/sync-ca`
- `POST /api/contas-receber/sync-ca/todas`
- `POST /api/estoque/sync-produto/:p`
- `POST /api/pedidos/:p/enviar-whatsapp`
- `POST /api/pedidos/:p/consultar-ca`
- `POST /api/pedidos/imprimir-lote`
- `POST /api/pedidos/imprimir-lote/checar`
- `POST /api/pedidos/imprimir-lote/checar-pedido`
- `POST /api/embarques/sugerir-divisao`
- `POST /api/embarques/estimar-rotas`

**Ficam na matriz, com flag `EFEITO_EXTERNO`.** O efeito já é cortado pelo `assertNaoAgente`; o D1 precisa de teste provando que a operação principal não quebra:

| Rota | Efeito externo |
|---|---|
| `notas-entrada/:p/gerar-conta`, `vincular-parcelas`, `registrar-entrada` | Manifestação SEFAZ + XML no Drive |
| `notas-entrada/:p/ignorar` | Drive |
| `contas-receber/:p/baixa`, `baixa-lote` | Cancelamento do boleto/PIX no Asaas |
| `caixa/quitar-ca`, `caixa/cobrancas-rota/baixar` | Conta Azul / Asaas |
| `entregas/:p/concluir`, `entregas/:p/editar` | Asaas |
| `POST /api/pedidos` com `statusEnvio=ENVIAR` | WhatsApp ao cliente + faturamento |
| `pedidos/:p/converter-especial` | NF-e |
| `POST /api/clientes` | Consulta do número na Z-API |
| `clientes/:p/atualizar-regime` | Receita / BrasilAPI |
| `contas-pagar/:p/parcelas/:p/estorno`, `conciliacao-bancaria/corrigir-conta-baixa` | Conta Azul |
| `POST /api/fornecedores` | Enfileira envio ao Conta Azul (inócuo com o CA somente leitura) |

A resposta ao agente ganha o campo aditivo `avisosAgente: ['Confirmação na SEFAZ não foi feita — precisa ser feita por uma pessoa na tela']`.

## 8. Rotas "só admin" e permissões sem interruptor

**A) Só passam com `admin`** (o agente nunca é admin, então o pedido autorizado volta 403):

| Rota | Check |
|---|---|
| `PUT /api/caixa/conferencia-dinheiro/config` | `routes/caixa.js:298` |
| `POST /api/caixa/reabrir-pendentes` | `routes/caixa.js:1641` |
| `POST /api/contas-receber/admin/sincronizar` | `routes/contasReceber.js:1756` |
| `POST /api/estoque/produto/:p/recalcular` | `routes/estoqueRoutes.js:376` |
| `PATCH /api/categorias-estoque/:p` | `routes/categoriaEstoqueRoutes.js:44` |
| `PUT /api/indicadores-gestao/config` e `PUT /metas` | `routes/indicadoresGestao.js:78`, `:92` |
| `POST /api/pedidos/avisos-pagamento-apos-quitacao/:p/ciente` | `controllers/pedidoController.js:368` |
| config do local de entrega (`POST …/config`) | `routes/localEntrega.js:192` |
| `DELETE /api/anexos/:p` de anexo alheio | `routes/anexos.js:198` (autor ou admin) |

Também são só admin, mas fora das famílias de hoje: `checklistAvisosRoutes.js:7`, `canhotoRoutes.js:119`, `formasPagamentoEntrega.js` (4 pontos), `veiculos.js` (3), `deliveryController.js` (3), e a exclusão de pedido em `congeladosController.js:185` e `kitFestaController.js:243`.

**B) Permissão que o backend exige e não tem interruptor no `PermissoesModal`:**

- `Pode_Reverter_Cancelamento_CR` (`contasReceber.js:1627`): hoje só admin consegue reverter o cancelamento de conta a receber.
- `Pode_Liberar_Nota_Sem_Canhoto` (`services/canhotoService.js:1155`).
- `Pode_Ver_Todos_Clientes` (`routes/roteirizacao.js:48, 410, 453, 473, 508`).
- `Pode_Editar_Fornecedores` (`fornecedores.js:37`): legado, já resolvido no commit `23af0330` (quem tem `clientes.edit` grava).

**C) Outros achados:**

- `routes/categoriasCliente.js:29-50`: POST/PUT/DELETE sem nenhum check de permissão (qualquer logado grava).
- `POST /api/fornecedores/:p/cadastro-pessoa` (`fornecedores.js:274`): escreve com check de leitura.
- `agenteTokenService.js:110`: agente criado pela tela nasce com `permissoes: {}`, e toda rota devolve 403 pelo próprio check.

**Solução recomendada:**

1. **Não fazer a matriz satisfazer o check da rota de forma genérica.** Os checks são inline e variados, e `admin` dentro do handler destrava mais coisa (ver dados de todos, pular travas de data, limites). Descartado.
2. **Grupo A vira `SO_ADMIN` na classificação:** fora da matriz, 403 `AGENTE_SO_ADMIN` na hora, sem criar solicitação que vai falhar. São configurações e manutenção, não trabalho de lançamento.
3. **Grupo B:** criar os 3 interruptores no `BOOL_INDEX` (D2), com o check do frontend espelhando o do backend.
4. **Permissões-base:** cada módulo declara em `agenteModulos.js` as chaves humanas necessárias (`contas_pagar` → `Pode_Acessar_Contas_Pagar`, `Pode_Baixar_Contas_Pagar`…). O `GET /api/agentes/:id/matriz` devolve `prontidao` por célula ("falta a permissão X"), e existe `POST /api/agentes/:id/permissoes-base/sincronizar`, que recopia do admin logado com `montarPermissoesDoAgente` (sem `admin` nem `Usuario_Externo`). Agente novo criado pela tela já nasce com essa cópia.
5. Corrigir C no D1: `checkEscrita` em `cadastro-pessoa` e check em `categoriasCliente`. Avisar o dono que é escopo extra pequeno.

## 9. Fatias

### D1 — Backend (porte grande; invisível até o seed)

Arquivos novos:

- `backend/config/agenteModulos.js`
- `backend/config/agenteClassificacao.js`
- `backend/config/agenteGuardas.js`
- `backend/services/agenteMatrizService.js`
- `backend/services/agenteIdempotenciaService.js`
- `backend/services/agenteMatrizSeedService.js`
- `backend/tests/agenteMatriz.test.js`
- `backend/tests/agenteClassificacao.test.js`
- `backend/tests/agenteIdempotencia.test.js`

Arquivos alterados:

- `backend/config/agentePoliticaPadrao.js` (separar `FIXO_DURO` e `FORA_DE_ESCOPO`; bloqueio por chave)
- `backend/services/agentePoliticaService.js` (`montarMapas` lê MODULO e MATRIZ; `resolverEntrada` consulta a matriz quando ativa; relaxar `:76` e `:216` só para função classificada como liberável)
- `backend/middlewares/authMiddleware.js` (códigos novos, guardas, idempotência)
- `backend/routes/agenteRoutes.js`
- `backend/routes/agenteApiV1Routes.js` (`matriz` aditiva no `meu-acesso`)
- `backend/routes/adminExec.js`
- `backend/prisma/schema.prisma` (só a tabela nova)
- `backend/workers/scheduler.js`
- `backend/config/agenteAntes.js` (ampliar para contas a receber e fornecedor)
- `backend/docs/agente-token.md`
- `backend/routes/fornecedores.js:274` e `backend/routes/categoriasCliente.js`
- commitar `docs/agente-classificacao-escrita.md`

Ordem:

1. Classificação e testes dela.
2. Matriz no serviço de política, com o marcador de ativação.
3. Rotas `GET /api/agentes/:id/matriz`, `PUT /api/agentes/:id/matriz` (lote em `$transaction` com `{ timeout: 20000, maxWait: 10000 }`; AuditLog `AGENTE_MATRIZ_ALTERADA` depois, em `try/catch` próprio) e `GET /api/agentes/:id/matriz/funcoes?modulo=&acao=`.
4. Guardas.
5. Idempotência: para o agente em SIM com ação `criar`, `Idempotency-Key` obrigatória (400 `AGENTE_IDEMPOTENCIA_OBRIGATORIA`). Mesma chave e mesmo corpo → repete a resposta guardada com `Idempotent-Replay: true`. Mesma chave e corpo diferente → 422. Em andamento → 409. Upload multipart usa a chave mais o `content-length`.
6. `POST /api/admin-exec/agente-matriz-seed[?confirmar=1]` (dry-run por padrão: mostra a matriz, as exceções FUNCAO mantidas e as FAMILIA ignoradas) e `POST /api/admin-exec/agente-matriz-desligar`.

Critérios de aceite:

- (a) `npm test` passa, e o teste de classificação falha quando se adiciona um `router.post` não classificado.
- (b) Sem marcador, os 42 casos de `agentePolitica.test.js` passam sem alteração.
- (c) Depois do seed em produção: `GET /api/contas-pagar` → 200; `POST /api/contas-pagar` sem `Idempotency-Key` → 400; com a chave → 201, e repetido → mesma resposta sem segunda despesa; com `pago:true` → 202; `PUT /api/contas-pagar/:id` → 202; `POST /api/pedidos/:id/enviar-whatsapp` → 403 fixo; `PUT /api/indicadores-gestao/config` → 403 `AGENTE_SO_ADMIN`.
- (d) Trocar a célula pelo PUT muda a resposta em até 15 s.
- (e) `gerar-conta` pelo agente cria a conta, não manifesta na SEFAZ e devolve `avisosAgente`.
- (f) O fluxo PEDE → autorizar → loopback continua igual (repetir o teste provado hoje).
- (g) Baixa de contas a receber autorizada: conferir que o worker de faxina tira o boleto do Asaas.

Rollback: `agente-matriz-desligar` apaga o marcador e o agente volta à política atual sem deploy. Código antigo ignora linhas MODULO. A tabela nova pode ficar vazia.

### D2 — Tela (porte médio)

Arquivos:

- novo `frontend/src/pages/Admin/Agentes/MatrizApiModal.jsx` (sobre `ModalBase.jsx`)
- `frontend/src/pages/Admin/Vendedores/ListaVendedores.jsx` (selo "Conexão por API" e botão "Permissões da API" na linha do agente)
- `frontend/src/pages/Admin/Agentes/AgentesIA.jsx` (mesmo botão no cartão)
- `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` (3 interruptores novos no `BOOL_INDEX`; faixa de aviso quando o usuário é agente)
- manuais em `backend/manuais/abas/` e tabela `ABAS` em `backend/services/copilotoService.js`
- `frontend/public/novidade-<slug>.html` e `frontend/public/novidades.json`

Desenho:

- Desktop: tabela módulo × ação, cada célula com controle de 3 botões em pílula (NÃO cinza, PEDE âmbar, SIM verde). Na coluna "ver", só NÃO e SIM.
- Mobile: um card por módulo, uma linha por ação, toque de 44 px, sem scroll horizontal.
- Atalhos: "Aplicar regra padrão", coluna inteira, linha inteira.
- Clicar no número de funções da célula abre a lista do que há dentro.
- Bloco fixo "Sempre bloqueado", só leitura, com o motivo.
- Aviso de prontidão e botão "Sincronizar permissões de base".
- Salvar só com alteração pendente; confirmação ao trocar para SIM em `baixar`, `estornar` ou `excluir`.
- Sem `<select>` nativo; `npm run build` antes do commit.

Critérios de aceite:

- Só admin vê e salva (o backend já exige admin humano).
- A matriz salva reflete na API (reexecutar o item (c) do D1 depois de trocar uma célula pela tela).
- Funciona em 375 px.
- "Copiar permissões" e "restaurar versão" não alteram a matriz.
- QA clica em cada estado e confere a linha no AuditLog.

Rollback: reverter o frontend; a matriz continua valendo.

### D3 — Kit de conexão e tipo "Conexão por API" (porte médio)

Arquivos:

- novo `backend/services/agenteKitService.js`
- `backend/routes/agenteRoutes.js` (`GET /api/agentes/:id/kit`)
- `backend/routes/agenteApiV1Routes.js` (`GET /api/agente/v1/openapi.json`, gerado do catálogo, da classificação e da matriz, sem o que é NÃO ou fixo)
- novo `backend/config/agenteExemplos.js` (corpo de exemplo das ~15 funções principais)
- `frontend/src/pages/Admin/Vendedores/NovoUsuarioModal.jsx` (escolha "Pessoa / Conexão por API", que chama o `POST /api/agentes` existente)
- novo `frontend/src/pages/Admin/Agentes/KitConexaoModal.jsx` (Copiar e Baixar .md)
- `backend/services/agenteTokenService.js:104` (criação com as permissões-base)
- docs, manual e novidade

O kit nunca contém o token (ele aparece uma vez no `TokenModal`). Contém: endereço base, como autenticar, matriz atual, lista de funções, códigos de resposta (202, 403, 429), regra da `Idempotency-Key` e exemplos em curl.

Critérios de aceite:

- Criar uma conexão pela tela, gerar o token, baixar o kit e, só com o kit e o token, fazer `GET /api/agente/v1/meu-acesso` e uma leitura em produção.
- O `openapi.json` não lista nenhuma rota fixa nem NÃO.
- Nenhum segredo no kit (grep por `cah_ag_`).

Rollback: reverter; nada persiste além do agente criado.

## 10. Riscos

- **Quebrar o Luke em produção.** Mitigado pelo marcador de ativação e pelo dry-run do seed. Conferir antes quantas linhas ele tem em `agente_politicas`.
- **Troca de `codigo` no 403 não fixo** (`AGENTE_BLOQUEADO` → `AGENTE_SEM_PERMISSAO`): muda o contrato para o cliente do Luke. Manter `nivel:'BLOQUEADO'` no corpo e avisar no kit.
- **Idempotência genérica** intercepta `res.json`/`res.send`: download e stream ficam fora. Aplicar só na chamada direta do agente no D1; o caminho do ticket, que está provado, fica para depois.
- **`pedidos.criar = SIM`** criaria venda real: o WhatsApp é cortado, mas o pedido segue para o faturamento. Por isso PEDE no seed.
- **Consumidores de `resolverEntrada`, `avaliar`, `listar` e `resumoCurto`:** `authMiddleware`, `agenteRoutes`, `agenteApiV1Routes`, `agenteSolicitacaoService.recalcularPolitica` (`:558`) e os testes. Todos precisam continuar recebendo `{nivel, chave, familia, fixo, origem}`; os campos novos são aditivos.
- **Áreas sensíveis tocadas:** permissões (frontend espelha backend) e financeiro (idempotência). NF-e, WhatsApp e `/api/ia-consulta/v1` não são tocados.

## 11. O que NÃO fazer

- Não dar `admin` ao agente nem simular admin dentro do handler.
- Não guardar a matriz em `Vendedor.permissoes`.
- Não remover `assertNaoAgente` de nenhum serviço, nem "desligar" efeito externo tirando a chamada da rota (humanos dependem dela).
- Não afrouxar `BLOQUEIO_PREFIXOS` neste trabalho.
- Não aceitar PEDE em `ver`.
- Não pôr token no kit, no repositório nem em log.
- Não remover coluna do schema.
- Não pôr auditoria dentro da `$transaction`.
- Não mexer em `/api/ia-consulta/v1`.

## 12. Decisões que precisam do dono (sigo o padrão se ele não objetar)

1. **Criar com autonomia em tudo, ou só no trabalho do Luke?** Padrão: SIM em contas a pagar, notas recebidas, cadastros, produtos, receitas, conciliação e categorias; PEDE em pedidos, caixa, expedição, contas a receber e indicadores. Ele muda com um clique na tela.
2. **Conta lançada já como paga.** Padrão: vira pedido de autorização, porque pagar é "baixar".
3. **Funções que só o administrador faz** (regra do caixa, metas, recálculo de estoque, reabrir caixas em massa). Padrão: o Luke não faz nem pedindo. A alternativa seria deixar a autorização do dono valer como admin naquela chamada, com risco maior.
4. **Confirmação da nota na SEFAZ quando o Luke dá entrada.** Padrão: o Luke lança, a confirmação não sai e fica para uma pessoa clicar "Confirmar operação" na nota. Vale o mesmo para a cópia do XML no Drive.
5. **RH, ponto, folha, comissões, currículos.** Padrão: continuam fechados e fora da matriz por terem dado pessoal. Se quiser, viram módulo numa etapa futura.

Porte geral: **grande** (permissões + financeiro) — equipe completa em cada fatia, D1 → D2 → D3.