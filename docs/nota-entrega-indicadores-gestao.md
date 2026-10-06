# Nota de entrega — Indicadores de Gestão (Etapas 1 e 2)

Data: 06/10/2026 · Veredito do gerente de entrega: **LIBERADO COM PENDÊNCIA**
(pode publicar; o que só se prova em produção está listado em "O que fica pendente").

---

## O que mudou (para quem usa)

**1. Tela nova: Indicadores de Gestão** (`/indicadores-gestao`)
Uma página só que responde: estamos ganhando dinheiro? o custo está subindo? onde agir primeiro?
- Cartões com Receita líquida, Margem de contribuição, Resultado operacional e Custo dos insumos, cada um com seta, variação contra o período anterior e a palavra do semáforo ("no alvo", "atenção", "agir").
- "Passo a passo do dinheiro" (cascata): receita bruta → devoluções → impostos → receita líquida → custo do que foi vendido (CPV = fabricado, CMV = revenda) → lucro bruto → despesas variáveis → margem de contribuição → despesas fixas → resultado.
- Meta do mês: ponto de equilíbrio, quanto já foi vendido, projeção de fechamento e margem de segurança.
- Curva de 8 semanas do custo dos insumos (último preço pago nas compras conferidas).
- Entradas de mercadoria da semana (esta ou a passada) com fornecedor, preço pago, preço anterior e efeito nas fichas técnicas.
- Tabela de produtos com custo da ficha, preço médio, markup, margem por unidade e total; itens de revenda recebem selo roxo, produto sem ficha e sem marca de revenda aparece como "sem ficha".
- Produção e estoque (dias de cobertura). Perda e rendimento por lote aparecem como "disponível na próxima fase" — não há dado confiável ainda e a tela não inventa número.
- Lista "Onde agir primeiro": custo subindo com preço parado, insumo com 3 altas seguidas, ficha desatualizada ou sem custo, margem abaixo da média, categorias de despesa sem classificar, produto vendido sem ficha. Cada alerta tem um botão que leva à tela onde se resolve (só aparece se a pessoa tem permissão lá).
- Os 6 clientes que mais vendem, com desconto médio, entregas, custo de entrega (estimado, com selo) e margem.
- Guia de leitura no fim da página e um "?" em cada cartão explicando o cálculo.
- Filtro de período em pílula (Hoje, 7 dias, 30 dias, Este mês, Este ano, personalizado), lembrado por usuário. "Todo o período" não existe nesta tela de propósito (o cálculo vai até 13 meses).
- No celular as tabelas viram cartões; sem rolagem lateral.

**2. Duas visões: Dono × Gerente de produção**
- **Dono** vê tudo.
- **Gerente de produção** vê só o que é produção: produtos fabricados (com ficha técnica vigente) e os insumos dessas receitas. Não vê receita, margem, resultado, preço, clientes, revenda nem produto sem ficha.
- O corte é feito **no servidor**: quem só tem a permissão de produção nem recebe os números financeiros (não é um "esconder na tela"). Quem tem a permissão completa pode alternar pelo botão no topo para ver exatamente o que a gerente vê.

**3. Categorias de Despesa: botão "Compra de estoque"**
Cada categoria ganhou o botão "Compra de estoque" (fica âmbar com ✓). Serve para marcar Matéria-prima, Embalagens e Mercadoria para revenda: esse gasto já entra no custo do produto vendido, então sai das despesas dos Indicadores para não contar duas vezes. **Só afeta os Indicadores de Gestão — a DRE não muda.**

**4. Duas permissões novas** (Usuários → Permissões, seção Dashboard)
- "Indicadores de Gestão (completo)" — visão do Dono. Dado financeiro sensível.
- "Indicadores de Gestão (só produção)" — visão da gerente. O perfil pronto "Produção / PCP" já inclui essa.
- Administrador vê tudo sem precisar marcar nada.
- Menu: quem tem a completa vê "Indicadores de Gestão" no grupo Financeiro; quem tem só a de produção vê "Indicadores" no grupo PCP.

**5. Imposto sobre a venda (⚙, só administrador, na visão Dono)**
Alíquota única de 0 a 40%. Vazia (0) = a tela usa o imposto realmente pago no bloco "Impostos sobre vendas" das despesas (selo "imposto real pago"). Com alíquota, esse bloco sai das despesas para não contar duas vezes (selo "imposto por alíquota"). O imposto só incide sobre venda com nota (pedido especial não paga).

**6. Por baixo do capô (não aparece, mas é o que sustenta os números)**
- No momento em que o pedido sai do estoque (faturamento), o sistema **congela o custo daquele dia** em cada item. Mudar o custo de um produto depois não altera vendas passadas. Reverter/cancelar o pedido solta o custo; faturar de novo regrava com o custo do dia.
- Um job a cada 30 minutos completa itens que ficaram sem custo congelado (caso o servidor caia no meio).
- Vendas antigas, de antes desta função, recebem um custo **estimado** (rodado por mim depois do deploy, ver roteiro) e a tela mostra qual parte do custo vem de estimativa.
- Manual do Clippy: página nova "Indicadores de Gestão" e seção "Compra de estoque" no manual de Categorias de Despesa. Página de novidade para o grupo do WhatsApp criada e registrada (o Clippy vai balançar).

---

## O que foi testado e por quem

**Dev-backend (com saída de comando no relatório)**
- DRE e dashboards continuam dando o mesmo resultado, centavo por centavo, em 3 períodos (a DRE foi só reorganizada, não alterada).
- Custo da ficha nos Indicadores bate com o cálculo já existente na tela Margem & Custo (11 de 11 produtos).
- Snapshot idempotente: faturar duas vezes não sobrescreve; cancelar limpa; fica fora da transação e nunca derruba o faturamento.
- Backfill com `dry=1` não grava nada; idempotente; lotes de 500.
- Quem só tem produção recebe 403 nos endpoints financeiros e respostas sem preço/receita/margem.

**QA (clicando na tela, app local + navegador)** — PASSOU com ressalvas, todas resolvidas:
- Faturar → custo congelado; refaturar → custo antigo preservado; cancelar → custo limpo.
- Permissões por API e por tela, inclusive o perfil "Produção" (visão fixa, sem botão de alternar; menu do grupo PCP corrigido durante o teste).
- Celular 375px sem rolagem lateral; período sem vendas não mostra NaN; "Compra de estoque" e ⚙ gravam de verdade; telas vizinhas (Contas a Pagar, Categorias, DRE) sem regressão. Toque dos botões ajustado para 44px após a primeira rodada.

**Revisores (backend e frontend)** — aprovados com ressalvas; todos os achados graves corrigidos (imposto que incidia em pedido especial; 8 itens do frontend).

**Gerente de entrega (eu, por conta própria, 06/10 à noite)**
- `git status`: só os arquivos da entrega (lista exata abaixo). Arquivos soltos de outras sessões (`skills/`, `docs/proposta-*.html`, `docs/qr-site-congelados.jpg`) ficam FORA do commit.
- `cd frontend && npm run build` → ✓ built in 5.41s.
- `node --check` nos 12 arquivos JS do backend tocados → todos OK. `npx prisma validate` → válido.
- Schema: **só colunas novas** (5 em `pedido_itens`, 1 em `categorias_despesa`), nada removido; todas com default ou opcionais.
- `deployMarker` do `/ping` bumpado para `indicadores-etapa1-2026-10-06`.
- Subi o backend local e provei a API com `curl`: sem token → 401 em tudo; usuário sem permissão → 403 em tudo; usuário só-produção → 403 em resumo/cascata/equilíbrio/clientes/categorias-pendentes/config e 200 em insumos/entradas/produtos/produção/alertas, **sem nenhum campo de preço, receita, margem ou markup na resposta**; admin → 200 em tudo; admin com `foco=producao` → produtos sem campos financeiros; período invertido e período > 13 meses → 400 com mensagem; alíquota 50 → 400, alíquota 6 → grava e volta na leitura, 0 → volta a "real pago". `categorias-despesa` devolve o campo `compraDeEstoque`. (Dados de teste do banco local restaurados ao final.)
- Frontend: rota com `lazyComRetry`; menu e `PrivateRoute` com as duas permissões; `hasPermission` trata admin e booleano igual ao servidor; ⚙ só para admin e só na visão Dono; sem `<select>` nativo, sem `window.open`, grids com `grid-cols-2 lg:grid-cols-4`; tabelas com versão em cartão no celular; mock só em desenvolvimento e só quando a rota não existe (404).
- Novidade: registrada no topo de `novidades.json`; HTML com `og:title`/`og:description`, **sem** `og:image`, **sem** botão/link "Abrir o app", accordions abertos, 4 mockups de tela com legendas numeradas; sem número de teste (todos os valores são "—").
- Manual: `indicadores-gestao.md` criado, índice atualizado, entrada na tabela `ABAS` do Clippy com as duas permissões (o Clippy aceita lista de permissões); nenhum número do banco local no manual.
- Sem segredo no diff. `/api/ia-consulta` não foi tocado. Nenhuma transação nova; as que existem no arquivo tocado já têm timeout de 20s e o snapshot ficou fora delas.

---

## O que VOCÊ precisa fazer (depois do deploy)

1. **Dar a permissão à gerente de produção**: Usuários → Permissões → Dashboard → "Indicadores de Gestão (só produção)". (Para quem deve ver tudo: "(completo)". Você, como administrador, já vê tudo.)
2. **Categorias de Despesa → marcar "Compra de estoque"** em Matéria-prima, Embalagens, Mercadoria para revenda e parecidas; depois **Salvar**. Enquanto nenhuma estiver marcada, a tela avisa que a matéria-prima pode estar contada duas vezes.
3. **Classificar as categorias que estão como "A definir"** (Fixa ou Variável). Sem isso a margem de contribuição e o ponto de equilíbrio ficam incompletos — o alerta "Classificar agora" na tela leva direto lá.
4. **Alíquota de imposto (opcional)**: ⚙ no topo da tela, só administrador. Deixe vazia para usar o imposto realmente pago.
5. **Decidir sobre o milheiro** (achado fora do escopo, NÃO corrigido): há fichas técnicas com insumo em milheiro (MI/milh) cadastrado com quantidade 1 — o custo desses produtos sai **1000 vezes maior**, e isso já afetava a tela Margem & Custo que existe hoje. Caminhos: (a) corrigir a quantidade nessas fichas; (b) aviso na tela da ficha; (c) campo de unidade no item da receita com conversão automática. Me diga qual prefere; enquanto isso, os produtos afetados aparecem com custo absurdo nos Indicadores.

**Como conferir em 1 minuto:** abra Financeiro → Indicadores de Gestão, escolha "Este mês", passe o mouse na cascata e veja se a receita bate com a DRE do mês. Depois clique em "Gerente de produção" e confira que preço, margem e clientes somem.

---

## O que fica pendente (só se prova em produção)

- **Deploy e snapshot atravessando um deploy**: faturar um pedido em produção, publicar de novo e confirmar que o custo congelado continua lá (regra do projeto). Eu faço isso logo após o deploy (roteiro abaixo) e te aviso.
- **Backfill das vendas antigas em produção** (`dry=0`): não foi rodado de verdade em lugar nenhum ainda — só em modo diagnóstico. Fica para depois do deploy, fora do horário de pico.
- **iPad real**: QA testou em navegador simulando celular, não no aparelho. Se algo ficar estranho no iPad, me diga qual bloco.

---

## O que fica de fora / limitações desta etapa

- **Etapa 3 (não entregue)**: metas cadastradas (hoje o semáforo usa a média dos 3 períodos anteriores: pior que 2% = atenção, pior que 5% = agir), perda real e rendimento por lote, custo por entrega de verdade, alertas por WhatsApp.
- **Custo de bonificação fica fora do CPV** (bonificação não é receita; segue a mesma régua da DRE/comissão).
- **Pedido especial revertido** pode ter o custo re-congelado em até 30 minutos pelo job de segurança se ainda estiver como "recebido"; ao faturar de novo, regrava com o custo do dia.
- **Imposto só por alíquota global** (uma taxa para tudo) ou pelo valor pago; não há alíquota por produto.
- **Na visão produção, os KPIs são somados na tela** a partir das listas que o servidor já filtrou (o servidor não manda nada financeiro; a soma é só de custo e quantidade).
- Estimativas sempre vêm com selo: custo de entrega por cliente, custo de vendas antigas (backfill), despesas proporcionais aos dias quando o período não é mês fechado.

---

## Roteiro pós-deploy (quem executa: eu, com o acesso de admin do servidor)

1. Publicar **backend antes do frontend**. Conferir `GET /api/admin-exec/ping` → `deployMarker = indicadores-etapa1-2026-10-06`.
2. `GET /api/admin-exec/diag-indicadores-snapshot` → cobertura por mês (real / estimado / sem), categorias marcadas e alíquota.
3. Faturar um pedido real (ou aguardar o próximo da rota) → conferir no diag que o mês corrente ganhou 1 item "real". Publicar de novo (ou reiniciar) → conferir que continua lá.
4. Backfill: `POST /api/admin-exec/indicadores-backfill-snapshot?dry=1` (só diagnóstico; ler `porFonte` e `semCusto`) → se fizer sentido, `dry=0&limite=500` em lotes, **fora do pico**, repetindo até `restantes = 0`. Rodar o diag de novo.
5. Abrir a tela em produção com seu usuário e com o da gerente (ou o perfil "Produção") e repetir a conferência de 1 minuto.

---

## Arquivos para o `git add` (lista exata — nada além destes)

Modificados:
```
backend/index.js
backend/manuais/abas/README.md
backend/manuais/abas/categorias-despesa.md
backend/prisma/schema.prisma
backend/routes/adminExec.js
backend/routes/financeiroGerencial.js
backend/services/copilotoService.js
backend/services/estoqueService.js
backend/services/financeiroGerencialService.js
backend/workers/scheduler.js
frontend/public/novidades.json
frontend/src/App.jsx
frontend/src/components/FiltroPeriodo.jsx
frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx
frontend/src/pages/Financeiro/CategoriasDespesaPage.jsx
```
Novos:
```
backend/manuais/abas/indicadores-gestao.md
backend/routes/indicadoresGestao.js
backend/services/custoSnapshotService.js
backend/services/indicadoresConfigService.js
backend/services/indicadoresCustoService.js
backend/services/indicadoresGestaoService.js
frontend/public/novidade-indicadores-gestao.html
frontend/src/pages/Dashboard/IndicadoresGestao.jsx
frontend/src/pages/Dashboard/indicadores/
frontend/src/services/indicadoresGestaoApi.js
frontend/src/services/indicadoresGestaoMock.js
docs/nota-entrega-indicadores-gestao.md
```
**NÃO adicionar** (sobras de outras sessões, não fazem parte desta entrega): `skills/`, `docs/proposta-central-cobranca.html`, `docs/proposta-layout-mapa-entregas.html`, `docs/qr-site-congelados.jpg`. Há também um `stash@{0}: autostash` antigo (PIX QR de 21/09, já publicado no commit 46978897) que pode ser descartado quando convier.

---

## Texto pronto para o grupo do WhatsApp

📊 *Novidade no app: Indicadores de Gestão*

Uma tela só para saber se estamos ganhando dinheiro, se o custo dos insumos está subindo e onde agir primeiro: receita, margem, ponto de equilíbrio, custo das fichas, entradas de mercadoria e alertas.

👩‍🏭 A gerente de produção tem a visão dela: só produtos fabricados e insumos.

Veja como funciona, com as telas explicadas:
https://cahardt-github.xrqvlq.easypanel.host/novidade-indicadores-gestao.html

Para começar: toque em ↻ para atualizar o app. Dúvida? Pergunte ao Clippy.
