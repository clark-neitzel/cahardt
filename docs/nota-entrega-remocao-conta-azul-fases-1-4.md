# Nota de entrega — Saída do Conta Azul, fases 1 a 4

> Conferido pelo gerente de entrega em 15/09/2026. Código ainda **não commitado**.
> Plano completo: `docs/plano-remocao-conta-azul.md`.

**Veredito: LIBERADO COM PENDÊNCIA** — pode publicar. A pendência é só a conferência
em produção depois do deploy (seção "O que você precisa conferir").

---

## O que mudou (para quem usa o app)

O Conta Azul deixa de ser consultado ou alimentado pelo app no dia a dia. Nada do
que você já fazia no app muda de lugar; o que sai é o que dependia do CA:

- **Menu Admin → "Sincronizar" sumiu.** A tela de conectar/sincronizar com o Conta
  Azul não existe mais (nem a permissão "Sincronizar" no cadastro de usuários).
- **Fornecedores:** o botão "Importar da Conta Azul", a coluna "Conta Azul" e o selo
  "Sincronizado/Enviando" saíram. O aviso agora diz só "O cadastro de fornecedores é
  feito aqui no app." Ao criar fornecedor, o toast diz "Fornecedor criado!" (antes
  prometia "enviando para a Conta Azul").
- **Contas a Pagar:** o botão "Importar do CA" (o CSV exportado do Conta Azul) saiu.
- **Notas Recebidas (conferência da nota):** as mensagens que falavam em "enviar para
  a Conta Azul" agora falam em "registrar forma de pagamento e banco" — é o que de fato
  acontece (a despesa nasce só no app).
- **Saldos por Conta:** o botão "Saldo atual no Conta Azul" saiu. O saldo mostrado é
  sempre o calculado pelo app.
- **Régua de Cobrança:** antes de mandar cada cobrança, o sistema **não consulta mais
  o Conta Azul**; confere só no app se a parcela ainda está em aberto (você confirmou
  que essa checagem no CA "nunca funcionou").
- **Robôs desligados (rodavam sozinhos em segundo plano):**
  - sincronização de produtos com o CA a cada 1 hora;
  - busca de pedidos alterados/excluídos no CA a cada 15 minutos;
  - importação automática do extrato do CA (transferências, despesas, recebimentos e
    linhas da Conta PJ na Conciliação) a cada 3 horas, e as 5 rotas administrativas
    correspondentes.
- **Faturamento de pedidos:** continua igual para quem usa — o pedido ganha número e
  fica faturado no próprio app. Por baixo, foi apagado o código antigo que montava a
  venda para o Conta Azul (estava morto desde 23/07/2026).
- **O que continua ligado de propósito (fases 5 a 7):** conferência das baixas de
  títulos antigos que ainda vivem no CA (a cada 30 min), o "keep-alive" do token, a
  tela de conexão OAuth, o XML/DANFE de notas antigas, "Identificar débitos no CA" na
  Conciliação e o assistente de devolução de boleto antigo do CA.
- **O que NÃO mudou:** o upload manual de extrato (OFX/PDF) na Conciliação Bancária —
  é a única coisa do CA que você disse usar, e ficou como está.

## O que foi testado, e por quem

| O quê | Quem | Evidência |
|---|---|---|
| Build do frontend | gerente de entrega (repetido 2×, a 2ª após os acertos de texto) | `npm run build` → "✓ built in 5.26s", sem erro |
| Sintaxe dos arquivos de backend alterados | gerente de entrega (repetido após os acertos) | `node --check` OK em todos |
| Textos da Régua de Cobrança e manuais (Régua, Conciliação) sem promessa de consulta ao CA | gerente de entrega | diff conferido: 2 frases da tela, linha 12 do manual da Régua, item da Conta PJ no manual da Conciliação |
| Backend sobe com o código novo | gerente de entrega | subiu na porta 3005 em 2s; log mostra "Worker de Pedidos (Faturamento local)", sem "Auto-Sync", sem "Extrato CA"; keep-alive só avisa 1 linha "token indisponível" |
| Rotas removidas respondem 404 | gerente de entrega | `/api/sync`, `/api/sync/tudo`, `/api/sync/pedidos`, `/api/fornecedores/importar-ca`, `/api/contas-pagar/importar-ca` → **404**; `/api/fornecedores`, `/api/contas-pagar`, `/api/financeiro-gerencial/por-conta` → 401 (existem, pedem login); `/api/auth/status` → 200 |
| Rotas `ca-extrato-*` do admin-exec | gerente de entrega | 5 rotas removidas no diff; `grep ca-extrato` no código não acha nenhuma (no local o admin-exec devolve 503 sem `ADMIN_SECRET`, então a prova é pelo código) |
| Faturamento local de pedido | gerente de entrega (refeito) | pedido de teste criado com `ENVIAR` no banco local → **8 segundos** depois estava `RECEBIDO` com número **9990020**, sem erro (registro de teste apagado em seguida) |
| Tela de Fornecedores | QA (clicando) | 12/12: sem botão/coluna/selo do CA, banner novo, 4 colunas alinhadas, vazio com colSpan 4, mobile 375px sem scroll, criar fornecedor → "Fornecedor criado!", importar-ca → 404, console limpo |
| Demais telas (Contas a Pagar, Saldos por Conta, Notas Recebidas, Produtos, Permissões, menu Admin) | QA (clicando) | PASSOU |
| Revisão do código | revisor | APROVADO; achados (syncProdutos pós-fatura, permissão "sync" órfã) já corrigidos |
| Segredos no repositório | gerente de entrega | nenhum token/senha no diff |
| Área protegida (NF-e de devolução, ModalDevolucao, Wizard do boleto CA) | gerente de entrega | arquivos intocados |
| Schema Prisma | gerente de entrega | esta entrega não mexe no schema (nenhuma coluna removida) |

## O que você precisa conferir em produção (1 minuto, depois do deploy)

1. Abra o app → menu **Admin**: o item "Sincronizar" **não** deve aparecer.
2. **Financeiro → Fornecedores**: sem botão "Importar da Conta Azul"; cadastre um
   fornecedor de teste e veja o toast "Fornecedor criado!".
3. **Financeiro → Saldos por Conta**: sem o botão "Saldo atual no Conta Azul"; a
   tabela carrega normal.
4. Fature um pedido normal: ele deve ganhar número e ficar faturado como sempre.
5. **Conciliação Bancária → Importar OFX/PDF** continua funcionando (é o que você usa).

Se qualquer um desses falhar, avise — é um problema de deploy, não de código
(tudo isso foi provado no local).

## O que ficou de fora (fases 5 a 7) — com os números do diagnóstico em produção

O diagnóstico rodado em produção mostrou que **o token do Conta Azul já está morto**
(o refresh falha). Ou seja, tudo abaixo que "depende do CA" já não funciona hoje de
qualquer jeito — o que existe ainda é código e dado antigo:

- **3.057 XMLs de notas antigas** já estão salvos no disco do servidor (backup feito).
- **622 notas antigas sem vínculo com pedido**: o XML existe, mas o app não sabe de qual
  pedido é. Sem o CA, a DANFE desses pedidos só abre se esse vínculo for feito.
- **195 parcelas importadas do CA ainda em aberto**: títulos antigos que só existiam no
  CA. O robô de 30 min que conferia se foram pagos lá **não consegue mais** (token
  morto) — se o cliente pagou no CA, aqui continua aparecendo em aberto.
- **Pedido 3172**: o diagnóstico achou um pedido com data de venda de **hoje** mas com o
  título marcado como "faturado no Conta Azul" (`FATURADO_CA`) e **1 devolução pendente
  com título em aberto de R$ 346,47**. O mais provável é rótulo herdado (o pedido nasceu
  no app, mas ganhou a marca antiga) — precisa confirmar com a equipe antes de mexer.

### Decisões que só você pode tomar

1. **Os 622 XMLs sem vínculo** — vale o trabalho de vincular ao pedido (para a DANFE
   antiga abrir pelo app), ou basta manter os arquivos guardados e, se precisar, buscar
   à mão?
2. **As 195 parcelas antigas em aberto** — quer que a equipe (a) baixe à mão as que já
   foram pagas, (b) marque todas como "controle fora do app", ou (c) deixe como estão?
   Enquanto isso a régua de cobrança pode cobrar alguém que pagou no CA.
3. **Pedido 3172** — confirmar com a equipe se ele é mesmo do app (rótulo herdado) e
   o que fazer com a devolução pendente de R$ 346,47; entra na fase 5.
4. **Quando desligar o resto** (fase 6): a tela de conexão OAuth, o keep-alive e a
   tabela do token só saem depois de resolvidos os itens 1 e 2. Nenhuma coluna do
   banco será removida em nenhuma fase.

## Ressalvas menores (não bloqueiam, ficam registradas)

- No manual de Saldos por Conta, a frase "Recebimentos: vêm da sincronização do Conta
  Azul" (linha antiga, anterior a esta entrega) já não descreve a realidade — ajustar
  quando a fase 5 mexer nessa tela.
- Página de novidade **não** foi criada, de propósito: é remoção de coisas que já não
  funcionavam; os manuais das abas (Clippy) foram atualizados.

## Para o gerente de projeto — separação dos hunks e commit

- **Já está separado pelo index (staged):** os hunks desta entrega em
  `frontend/src/App.jsx` (3 linhas removidas: import do `PainelSync`, item do menu,
  rota `/admin/sync`) e em `backend/routes/adminExec.js` (1 hunk, −106 linhas, a
  partir da linha 6156: as 5 rotas `ca-extrato-*`) estão **no stage**. Os hunks da
  outra sessão nesses dois arquivos (+5 em `App.jsx`: `AlertaPagamentoAposQuitacao`;
  +158 em `adminExec.js` a partir da linha 1848: `asaas-cancelar-qr-pedido-quitado` e
  `diag-asaas-qr-vivos`) estão **só no working tree**. Basta não dar `git add` nesses
  dois arquivos antes do commit desta entrega.
- Arquivos desta entrega ainda **não** staged (dar `git add` explícito, um a um):
  backend `config/contaAzulModo.js`, `controllers/authController.js`, `index.js`,
  `routes/contasPagar.js`, `routes/fornecedores.js`, `routes/adminReset.js`,
  `services/cobrancaService.js`, `services/contasPagarCaSyncService.js`,
  `services/copilotoService.js`, `services/syncPedidosService.js`,
  `workers/scheduler.js`, `manuais/abas/{README.md, contas-a-pagar.md, pedidos.md,
  saldos-por-conta.md, fornecedores.md}`; removidos `controllers/syncController.js`,
  `routes/syncRoutes.js`, `manuais/abas/sincronizar.md`. Frontend
  `pages/Admin/Produtos/ListaProdutos.jsx`, `pages/Admin/Vendedores/PermissoesModal.jsx`,
  `pages/Financeiro/{FornecedoresPage,NotasRecebidasPage,ContasBancosPage,ContasPagarPage}.jsx`,
  `services/{contasPagarService,fornecedorService}.js`; removidos
  `pages/Admin/Sync/PainelSync.jsx`, `pages/Financeiro/ImportarCaModal.jsx`,
  `services/syncService.js`.
- **NÃO são desta entrega** (outra sessão): `backend/controllers/pedidoController.js`,
  `backend/manuais/abas/{caixa,entregas}.md`, `backend/prisma/schema.prisma`,
  `backend/routes/{caixa,contasReceber,pedidoRoutes}.js`,
  `backend/services/{asaasService,pedidoService}.js`,
  `frontend/src/pages/Atendimentos/linhaDoTempoPedido.js`,
  `frontend/src/pages/Financeiro/BoletosAsaasModal.jsx`,
  `frontend/src/pages/Motorista/Entregas/PixAsaasModal.jsx`,
  `frontend/src/services/pedidoService.js` e os arquivos novos não rastreados.
- Acertos da 2ª rodada, já conferidos e também desta entrega (dar `git add`):
  `frontend/src/pages/Financeiro/ReguaCobrancaPage.jsx` (2 frases),
  `backend/manuais/abas/regua-cobranca.md`, `backend/manuais/abas/conciliacao-bancaria.md`,
  comentário do bloco #2 em `backend/workers/scheduler.js`, limpeza de
  `_resolverIndicadorIE` em `backend/services/syncPedidosService.js`.
- `deployMarker` do `/admin-exec/ping` = `remocao-ca-fases-1-4-2026-09-15`
  (`backend/routes/adminExec.js` linha 63, hunk já staged junto com a remoção das rotas
  `ca-extrato-*`). Depois do deploy, `GET /api/admin-exec/ping` com o `x-admin-secret`
  tem que devolver esse marcador — é a prova de que a versão nova está no ar.
