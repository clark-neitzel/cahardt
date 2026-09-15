# Plano de remoção da integração Conta Azul (CA)

> Investigação de arquitetura (arquiteto, somente leitura) — 15/09/2026.
> Pedido do dono: *"Não existe mais Conta Azul, tem que tirar isso do projeto. A única coisa que eu faço é importar o extrato do CA para o sistema."*

---

## ACHADO PRINCIPAL — a frase do dono cobre DUAS coisas diferentes no código

Antes de qualquer remoção, isto precisa ser resolvido, porque muda o plano inteiro:

Existem **dois mecanismos completamente distintos** que hoje se chamam de "extrato do CA":

1. **Upload manual de OFX/PDF** — `frontend/src/pages/Financeiro/ConciliacaoBancariaPage.jsx` (botão "Importar OFX/PDF", linha ~1689) → `backend/routes/conciliacaoBancaria.js:52`. O usuário baixa o extrato do banco (OFX) ou, para a conta PJ que só existe dentro do painel do Conta Azul (que não gera OFX), baixa o **PDF do extrato** de dentro do CA e sobe esse arquivo aqui. **Não usa token/API do CA** — é só parsing de arquivo enviado por humano. Isso bate com "a única coisa que eu faço" (é uma ação manual do dono/escritório).

2. **Sincronização automática via API do CA** — `backend/services/caExtratoService.js` (4 funções: `sincronizarTransferencias`, `sincronizarDespesas`, `sincronizarRecebimentos`, `sincronizarExtratoConciliacao`), disparada sozinha a cada 3h pelo worker `#11` do `backend/workers/scheduler.js:446-465`, e por 4 rotas manuais em `backend/routes/adminExec.js:6317-6395`. Estas SIM dependem do token OAuth do CA (`contaAzulService._axiosGet`, via `ContaAzulConfig`) — ninguém "faz" isso, o sistema faz sozinho.

**Pergunta 1 ao dono**, antes de qualquer fase: quando você diz "eu importo o extrato do CA", é o botão de upload de PDF/OFX na Conciliação Bancária (mecanismo 1)? Se sim, o mecanismo 2 (automático, via token) pode ser desligado inteiro sem afetar o que você faz manualmente — e aí o token OAuth do CA também fica livre para morrer, **exceto** pelos outros consumidores do token listados abaixo (DANFE/XML de nota antiga, conciliação de débitos antigos, régua de cobrança), que precisam de decisão à parte.

---

## 1. Inventário completo

### 1.1 Núcleo de autenticação/sync (backend)

| Arquivo | O que faz | Roda em produção? | Depende do token OAuth? |
|---|---|---|---|
| `backend/config/contaAzulModo.js` | Chave `CA_SOMENTE_LEITURA=true` — trava central que já bloqueia toda escrita de vendas/faturamento no CA desde 23/07/2026 | Sim, lida em vários pontos | Não (é só a chave) |
| `backend/services/contaAzulService.js` (2304 linhas) | Módulo central: `getAccessToken` (refresh do token), `_axiosGet`/`_axiosRequest`, sync de produtos/clientes/vendedores/pedidos, leitura de NF-e/boleto/parcela, escrita de baixa/parcela | Sim — usado por quase tudo abaixo | Sim, base de tudo |
| `backend/controllers/authController.js` + `backend/routes/authRoutes.js` | OAuth do CA: `GET /auth/contaazul/url`, `GET /auth/callback` (grava `ContaAzulConfig`), `GET /auth/status`, `GET /auth/debug`. Montado em `backend/index.js:142` (`/api/auth`, público) | Sim, rota pública ainda ativa esperando callback | É a fonte do token |
| `backend/prisma/schema.prisma:626` `model ContaAzulConfig` | Tabela com o `accessToken`/`refreshToken` (1 linha) | Sim | — |
| `backend/workers/scheduler.js` bloco `#1 KEEP-ALIVE` (linhas 6-23) | `setInterval` 45min chamando `getAccessToken()` para o token nunca expirar | Sim | Sim |
| `backend/workers/scheduler.js` bloco `#2 AUTO-SYNC (Dados)` (25-39) | `syncProdutos()` a cada 1h — hoje só sync de leitura (preço/custo não sobrescrevem produto do app, protegidos por `precoLocal`/`custoCaZerado`) | Sim | Sim |
| `backend/workers/scheduler.js` bloco `#3 AUTO-SYNC PEDIDOS` (41-55) | `syncPedidosModificados()` a cada 15min — detecta pedido alterado/excluído no CA e importa pedido "órfão" criado direto no CA | Sim | Sim |
| `backend/workers/scheduler.js` bloco `#4` (58-64) | `syncPedidosService.processarFila()` a cada 30s — hoje só faz **faturamento local** (ver 1.2) | Sim | Não hoje (código de envio é morto) |

### 1.2 Pedidos/vendas (fluxo de faturamento)

- `backend/services/syncPedidosService.js` (396 linhas): `processarFila` → `enviarPedidoContaAzul` (linha 114) checa `CA_SOMENTE_LEITURA` logo na entrada (121); como está `true` hoje, o pedido é **faturado só localmente** (número reservado, status `RECEBIDO`) e **nunca chama `contaAzulService.enviarPedido`**. Todo o bloco de montagem de payload/envio (linhas ~146-392) é **código morto em produção hoje**.
- **Classificação: (C) REMOVER** o bloco de envio morto, mantendo só a parte de faturamento local que o `processarFila` de fato usa.

### 1.3 Painel de Sincronização (tela dedicada)

- `frontend/src/pages/Admin/Sync/PainelSync.jsx` — rota `/admin/sync` (`App.jsx:11,944`), linkada em `ListaProdutos.jsx`. Botões: "Conectar/Reconectar" (OAuth do CA, URL hardcoded nas linhas 23-27), "Sync Geral" (→ `/sync/tudo`, hoje só sincroniza produtos), "Sync Pedidos" (→ `/sync/pedidos`), tabela de `SyncLog`.
- `backend/controllers/syncController.js` (71 linhas) + `backend/routes/syncRoutes.js`, montada em `backend/index.js:143` (`/api/sync`).
- **Classificação: (C) REMOVER tela inteira** — é a única tela dedicada 100% ao CA, funcional mas sem propósito se a integração for cortada.

### 1.4 Contas a Pagar / Fornecedores ↔ CA

- `backend/services/contasPagarCaSyncService.js` (1471 linhas):
  - `processarFilaFornecedores` (370), `_enviarDespesasPendentes` (696), `_empurrarBaixasPendentes` (1037) — **hoje já são no-op**: os 3 checam `CA_SOMENTE_LEITURA` (linhas 376, 700, 1041) e "drenam" a fila sem enviar nada ao CA. **Isto contradiz o comentário em `contaAzulModo.js:10-11`**, que diz que Contas a Pagar/DDA "não passa por essa chave" — está desatualizado, o código de fato passa.
  - `conferirBaixasCA` (1135, roda a cada 30min) e `sincronizarContasFinanceiras` (1225, a cada 6h) — **leitura ativa**, ainda trazem baixas feitas no CA (DDA/digital) e nomes de banco.
  - `_consultarProtocolosPendentes` (911) — segue processando despesas que ficaram `AGUARDANDO_PROTOCOLO` de antes do corte.
- **Telas com texto enganoso**: `frontend/src/pages/Financeiro/FornecedoresPage.jsx` (linhas 127, 211-212, 302: "importados da Conta Azul e mantidos em sincronia", "enviado para a Conta Azul na hora") e `frontend/src/pages/Financeiro/NotasRecebidasPage.jsx` (linhas ~2180-2496, 3768: "enviar para a Conta Azul") — **o texto promete um envio que já não acontece** desde que `CA_SOMENTE_LEITURA` passou a valer para Contas a Pagar também. Isso é um bug de UX independente da decisão de remoção — vale corrigir cedo.
- `frontend/src/pages/Financeiro/ImportarCaModal.jsx` (187 linhas) — modal de import de **CSV de Contas a Pagar** exportado do CA (backfill histórico, não é extrato bancário), usado em `ContasPagarPage.jsx:854` → `contasPagarService.importarCa`. Diferente do que o dono descreveu.
- **Classificação**: envio de fornecedor/despesa/baixa → **(C) REMOVER** (já morto); leitura (`conferirBaixasCA`, `sincronizarContasFinanceiras`) → **(A) MANTER** só se ainda houver títulos antigos pendentes no CA (ver Pergunta 4); `ImportarCaModal` → depende da Pergunta 3.

### 1.5 Contas a Receber (baixas antigas)

- `backend/services/contasReceberSyncService.js` (370 linhas): `sincronizarTodasAbertas`/`sincronizarConta` — busca no CA parcelas vinculadas a `pedido.idVendaContaAzul` e replica baixa (status PAGO) para o app. Roda no scheduler bloco `#4.1` (linhas 66-81, 1x/hora).
- **Não é resquício morto**: enquanto existir `ContaReceber`/`Parcela` `ABERTO`/`PARCIAL` com `idVendaContaAzul` preenchido (pedido faturado no CA antes de 23/07/2026), esse worker é o único jeito de saber que o cliente pagou lá.
- Também é chamado **em tempo real** por `backend/services/cobrancaService.js:656-677` (`conferirNoCA`, dentro da Régua de Cobrança) antes de mandar WhatsApp de cobrança — para não cobrar quem já pagou por fora. Tem fallback silencioso se o CA estiver fora, mas hoje é uma checagem real, não decorativa.
- **Classificação: (A) MANTER até zerar** — antes de desligar, contar quantas `Parcela`/`ContaReceber` ainda estão `ABERTO`/`PARCIAL` com `idVendaContaAzul` não nulo (rota de diagnóstico já existe: `diag-parcela-ca`/`diag-parcela-ca-baixas` em `adminExec.js`).

### 1.6 Devolução — Wizard de boleto no CA

- `frontend/src/pages/Pedidos/WizardProcessarCA.jsx` (323 linhas), acionado dentro de `ModalDevolucao.jsx:381-393` quando `isBoleto` é `true`. `isBoleto` (linha 23) exige `isCA && !!entrega.idVendaContaAzul && condicaoPagamento contém 'boleto'` — ou seja, **só aparece para pedidos antigos faturados no CA com boleto** (o próprio comentário do código, linha 22, diz: "boleto local (Asaas) não tem o que processar lá"). Chama `devolucaoService.processarCA` → `POST /devolucoes/:id/processar-ca` (`backend/routes/devolucaoRoutes.js:394`), rota existe e é chamada.
- Commit recente (`6dcc8193`, git log) já fez devolução cancelar boleto/PIX **do Asaas** automaticamente — ou seja, o caminho novo (pedido local) não passa mais por este wizard; ele só serve para o estoque decrescente de pedidos velhos com boleto no CA.
- **Classificação: (A) MANTER até zerar** — mesmo cuidado da seção 1.5: só aposentar quando não houver mais pedido com boleto vivo no CA para devolver. **Área sensível (devolução/NF-e) — qualquer mudança aqui exige teste real antes do push, conforme CLAUDE.md.**

### 1.7 Produtos

- `backend/controllers/produtoController.js:247-318` (`criar`): já está preparado — com `CA_SOMENTE_LEITURA=true`, gera um `contaAzulId` fake local (`app-<uuid>`, linha 274) e **nunca chama a API do CA**. `criarProdutoCA` (em `contaAzulService.js:2092`) só roda se a chave for desligada.
- `backend/services/contaAzulService.js` `syncProdutos` (314) segue puxando produtos do CA a cada 1h (scheduler `#2`) — leitura, sem sobrescrever preço/custo dos produtos já migrados (`precoLocal`/`custoCaZerado`).
- **Classificação: (B) DESLIGAR** o worker de sync de produtos é seguro **se** não existir mais nenhum produto cuja origem/estoque ainda dependa do CA — checar com o dono (Pergunta 5).

### 1.8 XML/DANFE de notas antigas — a dependência mais frágil encontrada

- `backend/services/xmlNfeService.js:43-50` (`obterXmlNotaCA`): tenta o arquivo local (`backend/uploads/xml-nfe`) primeiro; **se não tiver, chama a API do CA na hora** (`contaAzulService.buscarXmlNotaFiscal`). Não é só um cache morto — é uma dependência viva.
- Chamada em produção por: `backend/routes/notasFiscaisRoutes.js:204` (ZIP de XMLs p/ contabilidade), `backend/controllers/pedidoController.js:1929` (DANFE de pedido antigo), `backend/services/impressaoLoteService.js:66` (impressão em lote), `backend/services/focusNfeEmissaoService.js:906` (emissão de NF-e de devolução busca `nItem` na nota de origem — **área protegida do CLAUDE.md, "NF devolução automática"**).
- `backend/routes/pedidoRoutes.js:102` → `pedidoController.baixarDanfe` (1916-1943): para pedido antigo sem `nfeChave` em cache, chama `_localizarNotaFiscal` (1860-1893), que faz **busca ao vivo `contaAzulService.listarNotasFiscais`** antes mesmo de buscar o XML. **Esta é a rota mais exposta**: sem CA no ar, qualquer pedido antigo cujo `nfeChave` não esteja cacheado perde a DANFE.
- Existe backup em lote: `xmlNfeService.backupXmlsCA(meses)` (linha 111), disparável via `adminExec.js` (`nfe-backup-ca-xml`, ~1108/1117) — baixa XMLs antigos em janelas de 7 dias e grava local.
- **Classificação: (D) NÃO DESLIGAR o token sem antes rodar o backup completo.** Antes de qualquer corte de OAuth: rodar `backupXmlsCA` cobrindo 100% do histórico (todas as notas desde que o CA emitia), e idealmente também popular `nfeChave`/`nfeNumero` em todo `Pedido` antigo (via `vincularXmlsBaixados`, linha 96) para a busca ao vivo em `pedidoController.js` nunca mais ser necessária.

### 1.9 Conciliação Bancária — débitos antigos do CA

- `backend/services/conciliacaoBancariaService.js`: `identificarDebitosCA` (rota `POST /identificar-debitos-ca`, `backend/routes/conciliacaoBancaria.js:184`) casa lançamento do extrato com baixa antiga de Contas a Pagar que só existe no CA — chamada ativa (`_axiosGet`/`buscarParcelaDetalhe`).
- `corrigir-conta-baixa` (linhas ~1998-2013): se a baixa tem `idBaixaCA`, **tenta atualizar no CA primeiro e só depois no app** ("CA primeiro: se falhar, nada muda").
- Usado por `frontend/src/pages/Financeiro/ConciliacaoBancariaPage.jsx` (o mesmo lugar do upload manual de extrato — a tela mistura os dois mecanismos, ver Achado Principal).
- **Classificação: (A) MANTER até zerar** — só serve para lançamentos antigos com baixa registrada no CA; contar quantos ainda existem sem conciliar antes de decidir.

### 1.10 Saldos por Conta

- `frontend/src/pages/Financeiro/ContasBancosPage.jsx`: o saldo principal (`financeiroGerencialService.saldosPorConta`, `backend/services/financeiroGerencialService.js:495`) já é **calculado localmente** a partir do ledger do app — não depende do CA por padrão.
- Só o botão opcional "Saldo atual no Conta Azul" (linha 207-215 do `.jsx`) chama `financeiroGerencialService.porConta(..., comSaldoCA=true)` → `contaAzulService.buscarSaldoContaFinanceira` (`financeiroGerencialService.js:570-571`) para comparação ao vivo.
- **Classificação: (C) REMOVER só o botão/coluna comparativa** — o resto da tela não depende do CA.

### 1.11 Campos legados no schema.prisma — NUNCA remover, só marcar

Regra inegociável do CLAUDE.md: nenhum campo que já é coluna no banco de produção pode sair do `schema.prisma` (quebraria `prisma db push`). Levantamento (`backend/prisma/schema.prisma`):

| Campo | Modelo:linha | Veredito |
|---|---|---|
| `situacaoCA` | Pedido:464 | **NÃO É "coisa do CA"** — é o status geral de faturamento do pedido hoje (`FATURADO`/`EM_ABERTO`/...), lido/escrito por `pedidoService.js`, `metaService.js`, `financeiroGerencialService.js`, `focusNfeEmissaoService.js` (grava `FATURADO` ao emitir NF-e própria!), `cobrancaService.js`, `embarques.js`, `deliveryService.js`, `canhotoService.js`, e várias telas de frontend. **Renomear é uma tarefa própria e arriscada, fora do escopo desta remoção** — não mexer agora só porque o nome é "CA".
| `contaFinanceiraCaId` (Parcela, PagamentoParcela, ContaPagar, PagamentoParcelaPagar, AjusteSaldoConta, ExtratoImportacao, ExtratoLancamento, ConciliacaoGrupo) | várias | **Coração do financeiro por conta** — apesar do nome, é o FK real para `ContaFinanceira` (banco/caixa interno). Usado em toda baixa do Caixa (`caixa.js:2698,2713,3413,3465`) e Contas a Receber (`contasReceber.js:1193,1204,1369,1385`). **Não remover nunca**; o "Ca" no nome é histórico (a conta nasceu com o ID vindo do CA), não é dependência funcional do CA.
| `Produto.contaAzulId`, `Fornecedor.contaAzulId` | Produto:15, Fornecedor:3421 | Campo único/obrigatório — legado técnico (produto novo já ganha `app-<uuid>` local). Marcar comentário `// legado` quando o sync for desligado.
| `Cliente.contaAzulUpdatedAt` | Cliente:201 | Sync automático já desligado desde 07/2026 — legado morto, só marcar comentário.
| `Produto.origem` (default "CA"), `Fornecedor.origem`, `ContaPagar.origem`/`IMPORTADO_CA`, `PagamentoParcelaPagar.origem`, `ContaReceber.origem`/`FATURADO_CA`, `NotaFiscalApp.origem`/`CA`, `CanhotoNota.origem` | vários | Discriminador histórico (`APP` vs `CA`) — dado passivo de registros antigos, mantém como está, nunca precisa mudar.
| `model ContaAzulConfig` (linha 626) | — | Guarda o token OAuth (1 linha). Só cogitar dropar a tabela via SQL manual depois que TODAS as dependências vivas (1.8, 1.9, 1.5, 1.6) estiverem zeradas — remover do `schema.prisma` faria `db push` tentar um `DROP TABLE`.

### 1.12 Scripts, rotas de diagnóstico e páginas de dev/debug

- `backend/scripts/*` (26 arquivos com menção a CA, incluindo toda a pasta `dev-tools/`) — nenhum é chamado por rota/worker do app; são scripts avulsos rodados manualmente uma vez. **Classificação: (C) REMOVER/arquivar** sem risco, mas sem pressa (não incomodam ninguém rodando).
- `backend/routes/adminExec.js` (12200+ linhas) tem dezenas de rotas `diag-*`/`ca-*` ligadas ao CA (backup XML, diag conciliação, diag parcela, diag PIX, `ca-extrato-*`, `ca-receber-importar*`). Nenhuma tem botão dedicado no frontend — são chamadas manualmente via curl/admin-secret. **Classificação: (C) REMOVER as que dependem de funções já removidas** (efeito colateral automático de remover `contaAzulService`), **manter as de diagnóstico enquanto durar a fase de transição** (elas ajudam a provar quando "zerou").

---

## 2. Classificação resumida

**(A) MANTER (extrato + dependências vivas que ainda têm trabalho a fazer):**
`conciliacaoBancaria.js` (upload manual OFX/PDF) · `contasReceberSyncService` (baixas antigas) · `cobrancaService.conferirNoCA` · `WizardProcessarCA`/`processarCA` (devolução de boleto CA antigo) · `xmlNfeService.obterXmlNotaCA` + backup · `conciliacaoBancariaService.identificarDebitosCA` · `contasPagarCaSyncService.conferirBaixasCA`/`sincronizarContasFinanceiras` (leitura) · OAuth (`authController`/`ContaAzulConfig`) enquanto qualquer um dos itens acima precisar do token.

**(B) DESLIGAR AGORA, risco baixo (workers/rotas que já não fazem nada de novo ou só duplicam leitura opcional):**
`scheduler #3` (`syncPedidosModificados`, sync bidirecional de pedido — zero pedido novo é criado no CA desde 23/07) · `scheduler #2` (`syncProdutos`, se confirmado que nenhum produto novo nasce mais no CA) · botão "Saldo atual no Conta Azul" em `ContasBancosPage.jsx` · os 3 blocos de envio em `contasPagarCaSyncService` (fornecedor/despesa/baixa — já são no-op pela chave `CA_SOMENTE_LEITURA`).

**(C) REMOVER (código morto ou tela sem propósito):**
`PainelSync.jsx` + `syncController.js` + `syncRoutes.js` · bloco de envio morto em `syncPedidosService.js` (linhas ~146-392) · textos enganosos em `FornecedoresPage.jsx`/`NotasRecebidasPage.jsx` ("enviado para a Conta Azul na hora") · scripts avulsos em `backend/scripts/` · rotas `diag-*`/`ca-*` de `adminExec.js` que dependerem de função removida.

**(D) NÃO REMOVER DO SCHEMA (marcar como legado quando o consumidor for desligado):**
`situacaoCA` (Pedido) — na verdade nem é legado, é campo ativo com outro propósito, não mexer · `contaFinanceiraCaId` (várias tabelas) — idem, é infraestrutura financeira · `contaAzulId` (Produto, Fornecedor) · `contaAzulUpdatedAt` (Cliente, Produto, Pedido) · todos os `origem`/`IMPORTADO_CA`/`FATURADO_CA` · `model ContaAzulConfig` (só via SQL manual, nunca via `schema.prisma`, e só depois de tudo em (A) zerar).

---

## 3. Riscos identificados (grep de consumidores feito antes de classificar)

1. **`situacaoCA` não é "coisa do CA"** — é o status de faturamento usado pelo sistema inteiro (financeiro, comissão, meta, embarque, delivery, cobrança). Confundir isso com "resquício do CA" e tentar limpar quebraria o app inteiro. **Não faz parte desta remoção.**
2. **`contaFinanceiraCaId` também não é "coisa do CA"** — é o FK real da conta bancária/caixa interna (`ContaFinanceira`), usado em toda baixa. Mesmo aviso do item 1.
3. **DANFE/XML de pedido antigo pode quebrar de verdade** se o token morrer antes do backup (`backupXmlsCA`) cobrir 100% do histórico — usuário perde acesso a nota fiscal de venda antiga. Este é o risco mais concreto de "cortar cedo demais".
4. **Régua de Cobrança muda de comportamento** se `conferirNoCA` for desligado sem substituto — risco de cobrar cliente que já pagou por fora (no CA), incomodando quem já quitou. Tem fallback silencioso hoje (não quebra), mas o comportamento piora.
5. **Devolução de pedido antigo com boleto no CA** (`WizardProcessarCA`) é a única forma de processar a devolução financeira desses pedidos — removê-lo sem substituto trava o fluxo de quem ainda tem boleto CA em aberto. **Área sensível do CLAUDE.md.**
6. **Conciliação Bancária mistura os dois mecanismos na mesma tela** (upload manual + `identificarDebitosCA`) — remover a função errada sem separar visualmente pode confundir quem opera a tela hoje.
7. **Comentário desatualizado em `contaAzulModo.js`** diz que Contas a Pagar/DDA "não passa pela chave" — não é verdade, o código já trava. Isso é uma prova de que a documentação interna já está defasada; o plano de remoção precisa também atualizar comentários, não só código.
8. **`ImportarCaModal.jsx` (CSV de Contas a Pagar) é diferente do "extrato" que o dono descreveu** — risco de remover algo que ele ainda usa achando que é a mesma coisa, ou vice-versa.

---

## 4. Plano faseado

Cada fase é publicável isoladamente. Porte estimado = nº de arquivos tocados (não conta scripts avulsos).

### FASE 0 — Perguntas ao dono (sem código)
Ver seção 5. Bloqueia as fases 3+.

### FASE 1 — Limpeza de código morto e texto enganoso (baixo risco, pequena, ~4-6 arquivos)
- Remover bloco de envio morto em `backend/services/syncPedidosService.js` (linhas ~146-392), mantendo só o faturamento local.
- Remover os 3 blocos de envio já drenados em `backend/services/contasPagarCaSyncService.js` (fornecedor/despesa/baixa), mantendo `conferirBaixasCA`/`sincronizarContasFinanceiras`.
- Corrigir texto de `FornecedoresPage.jsx` e `NotasRecebidasPage.jsx` que promete envio ao CA que não acontece mais.
- Atualizar o comentário desatualizado em `backend/config/contaAzulModo.js` (Contas a Pagar/DDA JÁ passa pela chave).
- **Critério de aceite**: build do frontend passa; Contas a Pagar continua criando/baixando despesa normalmente (só local); nenhum texto de tela promete envio ao CA.
- **QA**: criar fornecedor novo, criar despesa, dar baixa — conferir que nada tenta chamar o CA e que a tela não mostra mais "enviado ao Conta Azul".

### FASE 2 — Desligar Painel de Sincronização (pequena/média, ~5 arquivos)
- Remover `frontend/src/pages/Admin/Sync/PainelSync.jsx`, rota `/admin/sync`, link em `ListaProdutos.jsx`.
- Remover `backend/controllers/syncController.js`, `backend/routes/syncRoutes.js`, desmontar de `backend/index.js`.
- **Critério de aceite**: build passa; rota `/admin/sync` não existe mais (404 esperado); nenhum outro lugar do app referenciava essas rotas (grep já confirmou que não).
- **QA**: navegar no menu Admin e confirmar que o item de sync sumiu sem quebrar o resto do menu.

### FASE 3 — Desligar workers automáticos sem propósito atual (pequena, ~1 arquivo: `scheduler.js`)
Depende da resposta às Perguntas 4 e 5.
- Desligar bloco `#3` (`syncPedidosModificados`, 15min) — confirmar antes que zero pedido novo nasce no CA.
- Desligar bloco `#2` (`syncProdutos`, 1h) — confirmar antes que nenhum produto ainda depende do CA como fonte.
- Remover botão "Saldo atual no Conta Azul" de `ContasBancosPage.jsx`.
- **Critério de aceite**: produtos e pedidos continuam funcionando 100% local; nenhum log de erro novo relacionado a sync no scheduler.
- **QA**: criar pedido novo, criar produto novo, conferir Saldos por Conta — tudo funcionando sem o CA.

### FASE 4 — Extrato: decidir e implementar conforme a resposta da Pergunta 1 (média, ~2-4 arquivos)
- Se o dono confirma que só usa o upload manual (mecanismo 1): desligar o worker `#11` (`caExtratoService`, scheduler.js:446-465) e as 4 rotas `ca-extrato-*` de `adminExec.js`. Manter só `conciliacaoBancaria.js` (upload).
- Se o dono também quer manter a sincronização automática (mecanismo 2): não mexer nesta fase, documentar a decisão.
- **Critério de aceite**: extrato bancário continua importável via upload manual; se o worker automático foi desligado, confirmar que a Conciliação Bancária não perdeu nenhuma fonte de dado que o dono usa de verdade.
- **QA**: subir um OFX/PDF de teste e conferir que concilia normalmente.

### FASE 5 — Aposentar dependências que servem só pedidos/contas antigas (média/grande, condicional — só quando "zerar")
Depende de contagem prévia (rotas de diagnóstico já existentes: `diag-parcela-ca`, `diag-parcela-ca-baixas`, `diag-conciliacao-asaas-causas`, contagem manual de `Parcela`/`ContaReceber` com `idVendaContaAzul` aberto).
- Quando não houver mais `Parcela`/`ContaReceber` `ABERTO`/`PARCIAL` com `idVendaContaAzul`: desligar `contasReceberSyncService` (scheduler `#4.1`) e `cobrancaService.conferirNoCA`.
- Quando não houver mais devolução pendente de pedido com boleto CA: remover `WizardProcessarCA.jsx` e a rota `processar-ca`.
- Quando não houver mais lançamento de Conciliação Bancária pendente contra débito do CA: remover `identificarDebitosCA`.
- **Critério de aceite**: contagem = zero antes de cada remoção (evidência, não suposição); QA confirma que devolução/cobrança/conciliação continuam funcionando para pedidos 100% locais.

### FASE 6 — Backup final de XML/DANFE antigo e corte do OAuth (grande, cuidado extra)
- Rodar `xmlNfeService.backupXmlsCA` até cobrir 100% do histórico de notas do CA.
- Rodar `vincularXmlsBaixados` para preencher `nfeChave`/`nfeNumero` em todo `Pedido` antigo.
- Só depois: desligar `authController`/`authRoutes` (rota `/api/auth/callback` pública), o keep-alive do scheduler (`#1`), e cogitar dropar a tabela `ContaAzulConfig` via SQL manual (nunca via `schema.prisma`).
- **Critério de aceite**: abrir DANFE de 10-20 pedidos antigos aleatórios (antes e depois do corte) e confirmar que continuam abrindo sem chamar o CA.
- **QA obrigatório com evidência**: prints/URLs de DANFE de pedidos antigos funcionando pós-corte.

### FASE 7 — Limpeza final (pequena, cosmética)
- Remover/arquivar os 26 scripts de `backend/scripts/` que mencionam CA (incluindo `dev-tools/`).
- Remover rotas `diag-*`/`ca-*` de `adminExec.js` que dependerem de função já removida.
- Marcar campos legados no `schema.prisma` com comentário `// legado — CA descontinuado` (sem remover nenhum).
- Atualizar `CLAUDE.md` (seção que hoje descreve o modo CA_SOMENTE_LEITURA) e os manuais de aba afetados (Financeiro, Sync, Devoluções) — checklist do Clippy já exige isso.

---

## 5. Perguntas que só o dono responde

1. **Extrato**: "importar o extrato do CA" é o upload manual de PDF/OFX na Conciliação Bancária, ou você também considera útil a sincronização automática (transferências/despesas/recebimentos a cada 3h)? Isso decide a Fase 4 inteira.
2. **`ImportarCaModal.jsx`** (CSV de Contas a Pagar exportado do CA): ainda usa esse botão, ou já foi só um backfill único que não se repete mais? Se não usa mais, entra na Fase 1/7.
3. **Notas antigas do CA**: ainda existe necessidade de abrir DANFE/XML de pedidos faturados no CA (antes de 23/07/2026)? Se sim, a Fase 6 (backup completo antes de cortar o token) é obrigatória, não opcional.
4. **Pedidos/contas antigas do CA**: sabe se ainda há pedido com boleto no CA aguardando devolução, ou conta a receber antiga ainda em aberto vinculada ao CA? (posso pedir para o dev-backend rodar as rotas de diagnóstico e trazer o número exato antes da Fase 5).
5. **Produtos**: algum produto ainda "mora" no CA como fonte (estoque, preço, estrutura) ou desde a Fase 6 de julho/2026 todos já nasceram/migraram para o app? Decide se o worker de sync de produtos (scheduler `#2`) pode ser desligado na Fase 3.
6. **Régua de Cobrança**: aceita que ela pare de checar o CA antes de cobrar (risco pequeno de cobrar quem já pagou por fora), ou prefere manter essa checagem enquanto o token existir?

---

## 6. Tamanho e observações finais

- **Fases 1-3**: pequenas, risco baixo, publicáveis em sequência rápida (~10-12 arquivos no total).
- **Fase 4**: depende só da Pergunta 1 — pode ser rápida também.
- **Fases 5-6**: **grandes e condicionais** — não têm data certa, dependem de "zerar" pendências antigas (contagem real, não estimativa). Fase 6 mexe em NF-e/DANFE — área sensível, exige teste real com pedido de verdade antes do push, conforme regra do projeto.
- **Fase 7**: cosmética, pode rodar a qualquer momento depois das anteriores.
- Nenhuma fase remove coluna do `schema.prisma` — só marca comentário. A única exceção possível (`ContaAzulConfig`) é uma decisão separada, via SQL manual, não faz parte deste plano de código.
