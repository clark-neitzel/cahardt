# Plano — Dashboard de Indicadores de Gestão

Data: 06/10/2026 · Autor: arquiteto · Mock aprovado: `docs/mockups/dashboard-indicadores-gestao.html`
Porte: **GRANDE** (financeiro + permissão + schema + tela nova). Equipe completa (dev-backend, dev-frontend, qa-testador, revisor-codigo, gerente-entrega).

---

## 0. Entendimento do pedido

O dono aprovou a tela do mock: uma página só com **KPIs**, **cascata** (receita → resultado), **ponto de equilíbrio**, **curva semanal dos insumos**, **entradas de mercadoria da semana**, **tabela de produtos**, **produção**, **alertas** e **clientes**, com botão **Dono × Gerente de produção**.

Requisito novo (06/10): a visão **Gerente de produção** só mostra o que é **produção**: produtos **fabricados** (têm ficha técnica/receita vigente) e os **insumos** (ItemPcp) que entram nessas receitas. Revenda e produto sem ficha **não aparecem** para ela. Na visão **Dono** aparece tudo, com revenda marcada.

Interpretação adotada (ambiguidades):
- "Visão produção" é aplicada **no servidor**, não só escondida na tela: quem tem só `Pode_Ver_Indicadores_Producao` nunca recebe preço, receita, margem, resultado nem cliente. Quem tem a permissão completa e clica em "Gerente de produção" vê a mesma tela filtrada (para conferir o que ela vê).
- "Semáforo em palavra" na Etapa 2 usa a **média dos 3 meses anteriores** como régua (porque metas só entram na Etapa 3). Sem histórico suficiente: só seta, sem palavra.
- "Imposto" só incide sobre o que tem nota (ver 1c).

---

## 1. Mapa do código atual (confirmado lendo o código)

### Onde o pedido "vira venda" (ponto de gravação do snapshot)
Há **dois momentos** distintos, e isso importa:
1. **Sai do estoque** (`statusEnvio = 'RECEBIDO'`): faturamento local em `backend/services/syncPedidosService.js:102` (pedido normal; o worker, ao ver RECEBIDO, chama `estoqueService.faturarPedido` em `syncPedidosService.js:59`); aprovação de especial `backend/controllers/pedidoController.js:748-786`; aprovação de bonificação `pedidoController.js:958-968`; legado CA em `pedidoController.js:1778-1779` (consultarCA) e `services/contaAzulService.js:1290` e `:1559`.
2. **Entra na receita** (`situacaoCA = 'FATURADO'` ou `especial=true`, regra `WHERE_PEDIDO_RECEITA` em `services/projecaoVendasService.js:26`): pedido normal só vira FATURADO quando a **NF-e é autorizada em produção** (`services/focusNfeEmissaoService.js:578 marcarPedidoFaturado`); especial entra por `especial=true`.

Os **5 caminhos do momento 1 passam todos por `estoqueService.faturarPedido`** (`backend/services/estoqueService.js:219`). É o **ponto único** da gravação do snapshot. O momento 2 (NF autorizada) não precisa gravar nada: o custo "na hora da venda" é o custo na saída do estoque, que já está gravado. A NF só decide se o pedido entra na receita.

Armadilhas confirmadas:
- `faturarPedido` só mexe em estoque para produto que controla estoque, mas o snapshot de custo vale para **todo item** (inclusive os que não controlam).
- A chamada no worker é fire-and-forget (`.catch`) — se o processo cair, o snapshot não é gravado. Por isso há rede de segurança (worker, 1a-5).
- Reverter aprovação de especial/BN chama `cancelarPedido` (`estoqueService.js:~293`); ao reaprovar, `faturarPedido` roda de novo. O snapshot antigo não pode ficar preso (1a-4).

### Custo
- Produto: `Produto.custoManual` Decimal(12,**2**) (média ponderada das compras — `notaEstoqueService.aplicarEstoqueNota`, `custoMedioPonderado` linha 69), `Produto.custoMedio` (CA, fallback), `ItemPcp.custoUnitario` (Decimal 12,4). `prisma/schema.prisma:40-46`.
- Hierarquia FICHA > COMPRA > CA: `services/produtoMargemService.js:71 custoAtualDeProdutos` (1 consulta por produto — **não usar em lote grande**) e `services/financeiroGerencialService.js:710 montarMargemProdutos` (FICHA > COMPRA, sem CA).
- Ficha: `services/pcpReceitaService.js:475 calcularCusto` (recursivo; ingrediente = `Produto.custoManual` se > 0, senão `ItemPcp.custoUnitario`; SUB = custo da receita ativa; custo/un = custoTotal ÷ rendimentoBase×(1−perda%)). Vigência: `pcpReceitaService.js:451 buscarReceitaAtiva` (status `ativa` + datas). **Produto fabricado = `ItemPcp` ativo com `produtoId` = produto e `buscarReceitaAtiva` devolvendo receita.**
- Histórico mensal: `ProdutoCustoHistorico` (`schema.prisma:115`, unique produto+mês), gravado só por `produtoMargemService.capturarMes` (scheduler diário, `workers/scheduler.js:247-264`) e backfill. **Não existe histórico de ItemPcp (insumo).**
- Compras: `CompraItem` (`schema.prisma:3873`): `dataCompra`, `itemPcpId`|`produtoId`, `fornecedorNome`, `custoUnitario` (Decimal 12,6), `quantidade`, `unidade`, `custoAnterior/custoPosterior`, `estornado`, `semEstoque`. É a fonte do histórico de preço. Estorno marca `estornado=true` (filtrar sempre).

### Receita (vendas) e DRE
- Receita: `Σ PedidoItem.valor × quantidade` dos pedidos `WHERE_PEDIDO_RECEITA`, por `data_venda` em fuso SP (`financeiroGerencialService.js:395-407`), menos `Devolucao` `status='ATIVA'` por `dataDevolucao` (`:409-416`, `DevolucaoItem` tem `produtoId`, `quantidade`, mas **não** liga ao item original).
- `Devolucao.tipo`: `ESPECIAL` | `CONTA_AZUL` (CONTA_AZUL = pedido com nota).
- DRE: `financeiroGerencialService.dre(deMes, ateMes)` `:388`; despesas por **competência** (`competenciaConta` `:374`) com rateio; `CategoriaDespesa.natureza` FIXA|VARIAVEL|A_DEFINIR (`schema.prisma:3610`); `montarDre` `:255` calcula `fixoVariavel.margemContribuicao` com A_DEFINIR **fora**.
- ⚠ **DRE e CPV vão contar a matéria-prima duas vezes.** O manual `backend/manuais/abas/categorias-despesa.md` manda marcar matéria-prima e embalagens como **Variável**. Hoje a MC da DRE já "come" a compra de insumo. Se o indicador somar CPV (consumo) **e** essas despesas variáveis, o custo aparece em dobro. A regra 2 do mock ("não descontar duas vezes") exige tratar isso — ver 1d-2.
- Projeção do mês: padrão em `routes/dashboards.js:189-220` (`projecaoVendasService.projecoesMes(mes)` + fallback ritmo linear). Reusar.
- `Pedido.valorFrete` (Decimal), `PedidoItem.valorBase` vs `valor` (desconto), `PedidoItem` **não tem custo** (`schema.prisma:586`).

### Impostos
Não existe alíquota. O bloco "Impostos sobre vendas" da DRE (`CategoriaDespesa` agrupada) hoje entra como despesa paga por Contas a Pagar.

### Telas / permissão / menu
- `frontend/src/pages/Dashboard/DashboardGeral.jsx` (aba Resultado & Margem, `AbaResultado` linha 595) ← `routes/dashboards.js:707 /geral/resultado` com `checkGestor` (`:77`: admin | Pode_Ver_Dashboard_Admin | isClark). **Não será alterado.**
- Componentes de UI existentes: `frontend/src/pages/Dashboard/dashUi.jsx` (`Card`, `Kpi`, `Carregando`, `fmtBR/fmtRS/fmtK`, `BarrasVerticais`, `Gauge` em SVG). `PageHeader`, `FiltroPeriodo` + `usePeriodoSalvo` (`components/FiltroPeriodo.jsx:90`), `useFiltrosSalvos`, `SelectBusca`, `EstadoVazio`.
- **Biblioteca de gráfico: NÃO existe** (`frontend/package.json` não tem recharts/chart.js/d3). → SVG puro como no mock, **sem dependência nova**.
- Permissões: `frontend/src/contexts/AuthContext.jsx:107 hasPermission` (admin = true; chave booleana = o valor). Backend lê `Vendedor.permissoes` Json (padrão `routes/dashboards.js:64 getPerms`). Painel: `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` — `DEFAULT_PERMISSIONS` (linha 24), `BOOL_INDEX` (linha 238), preset `producao` (linha 387, lista `chaves`), seção `secaoDashboard` (linha 802).
- Menu: grupos em `frontend/src/App.jsx` (~linhas 410-470; grupo "Financeiro" e "PCP"); `GRUPOS_POR_PERFIL` (linha 305) — perfil `pcp` só vê "PCP" e "Produção / Estoque" (por isso o item da gerente precisa estar no grupo PCP). Rotas lazy: `lazyComRetry` (`App.jsx:28`), rotas protegidas por `PrivateRoute tab=` (`App.jsx:140`, `:896`).
- Manual do Clippy: `backend/manuais/abas/<slug>.md` + tabela `ABAS` em `backend/services/copilotoService.js:32` (suporta `perm` em array, ex.: `entregas`).
- PCP: `services/pcpOrdemService.js:169 finalizar` (consumo = `OrdemConsumo.quantidadeReal` ou prevista; **sem custo, sem perda real**). `OrdemProducao` `schema.prisma:2575`.

---

## 2. Decisões que precisam do dono (máximo 5)

| # | Decisão | Recomendação |
|---|---|---|
| D1 | **Imposto sobre a venda**: usar uma alíquota fixa (ex.: 6%) ou o valor realmente pago no bloco "Impostos sobre vendas" do Contas a Pagar? | Alíquota única cadastrada em tela. Enquanto estiver **vazia (0)**, a tela usa o que foi pago no bloco "Impostos sobre vendas" e mostra o selo "imposto real pago". Ao cadastrar alíquota, o bloco sai das despesas (senão conta duas vezes). |
| D2 | **Compra de matéria-prima/embalagem/revenda já está nas despesas "variáveis"**. Marcar quais categorias de despesa são "compra de estoque" (ficam fora das despesas, porque entram como custo do produto vendido)? | Sim. Nova marca "Compra de estoque (já está no custo do produto)" na tela Categorias de Despesa; o dono marca Matéria Prima, Embalagens, Mercadoria p/ revenda. **Sem essa marcação a margem de contribuição da tela fica errada** — o alerta do dashboard cobra isso. |
| D3 | **Produto vendido sem ficha e sem marca de revenda** (ex.: produto de catálogo antigo): em qual linha cai? | Cai em **CMV**, marcado "sem classificação", e gera alerta "N produtos vendidos sem ficha e sem marca de revenda". Na visão da gerente **não aparece**. |
| D4 | **Custo de entrega por cliente** (tabela Clientes): não existe custo por entrega no sistema. | Estimar = (despesas do bloco "Veículos e entregas" do mês ÷ nº de entregas do mês) × entregas do cliente, sempre com selo "estimado". Alternativa: deixar a coluna fora da Etapa 2. |
| D5 | **Faixas do semáforo antes de existir meta** (Etapa 2): quanto pior que a média dos 3 meses é "atenção" e quanto é "agir"? | Pior que 2% (relativo) = atenção; pior que 5% = agir; dentro disso = no alvo. Valores fixos no código na Etapa 2, substituídos pela meta cadastrada na Etapa 3. |

(Classificar as categorias A_DEFINIR e marcar D2 é **tarefa de cadastro do dono**, na tela que já existe; o código só conta e alerta.)

---

## 3. ETAPA 1 — dado confiável (backend)

### 3.1 Schema (somente colunas/tabelas novas; nada removido)

Arquivo: `backend/prisma/schema.prisma`

```prisma
model PedidoItem {
  // ... campos atuais intactos ...
  custoUnitarioSnapshot Decimal?  @map("custo_unitario_snapshot") @db.Decimal(12, 4) // custo/un na hora da venda
  fonteCustoSnapshot    String?   @map("fonte_custo_snapshot")  // FICHA | COMPRA | CA | HIST_MENSAL | ATUAL | SEM_CUSTO
  classeCustoSnapshot   String?   @map("classe_custo_snapshot") // FABRICADO | REVENDA | SEM_CLASSE (congela CPV x CMV)
  custoSnapshotEstimado Boolean   @default(false) @map("custo_snapshot_estimado") // true = backfill retroativo
  custoSnapshotEm       DateTime? @map("custo_snapshot_em")
}

model CategoriaDespesa {
  // ... campos atuais intactos ...
  compraDeEstoque Boolean @default(false) @map("compra_de_estoque") // D2: já está no CPV/CMV; fica fora das despesas dos indicadores
}
```
Sem índice novo (consultas por `pedido_id`/`pedido.data_venda` já existem). Coluna nullable / boolean com default = metadado, rápido em Postgres. **Não** mexer em `ProdutoCustoHistorico` (decisão 1b).

Chaves em `app_configs` (sem tabela nova): `indicadores_aliquota_imposto_venda` → `{ "aliquota": 6.0 }` (percentual decimal; 0/ausente = usar imposto real pago).

### 3.2 Tarefas, em ordem

**B1 — Schema** (acima). `prisma db push` roda no deploy; confirmar localmente com `npx prisma validate`.

**B2 — `backend/services/indicadoresCustoService.js` (novo): classificação e custo, em lote, sem N+1**
- `carregarFichasVigentes()` → 1 consulta: todas as `Receita` `status='ativa'` com vigência hoje + `itens` + `ItemPcp` (tipo, custoUnitario, produtoId, `produto.custoManual`). Devolve `Map<itemPcpId, receita>` e `Map<produtoId, itemPcpId>` (via `ItemPcp.produtoId`, `ativo=true`, tipo PA).
- `custoFicha(receitaId, resolver)` — **pura**, recursiva (SUB), mesma regra do `calcularCusto` (ingrediente: `custoManual>0` senão `ItemPcp.custoUnitario`; perda/rendimento; proteção de ciclo). O `resolver(itemPcpId, dataRef)` é injetável (custo atual ou custo na data da compra). Teste de paridade obrigatório: para 5 produtos, `custoFicha` com resolver "atual" == `pcpReceitaService.calcularCusto().custoPorUnidade`.
- `classificarProdutos(produtoIds)` → `Map<produtoId, 'FABRICADO'|'REVENDA'|'SEM_CLASSE'>`. Regra (decisão 1d):
  1. tem receita vigente via ItemPcp → **FABRICADO** (mesmo se `nfeRevenda=true`; nesse caso vai para a lista de inconsistências do alerta);
  2. senão `Produto.nfeRevenda=true` → **REVENDA**;
  3. senão → **SEM_CLASSE** (D3: conta no CMV, marcado, alertado, oculto da visão produção).
- `custoAgora(produtoIds)` → `Map<produtoId, {custo, fonte}>`: ficha > `custoManual` > `custoMedio` > SEM_CUSTO (mesma hierarquia de `produtoMargemService.custoAtualDeProdutos`, mas em lote).
- `custoNaData(produtoId, data)` (backfill, 1a-3): cascata — (a) FABRICADO: recompõe a ficha com o resolver "último `CompraItem` do insumo com `dataCompra ≤ data`" (não estornado, `semEstoque=false`); (b) REVENDA/SEM_CLASSE: último `CompraItem.custoUnitario` do `produtoId` com `dataCompra ≤ data`; (c) `ProdutoCustoHistorico` do mês (`estimado` herdado); (d) custo atual. Sempre grava `fonteCustoSnapshot` com o degrau usado e `custoSnapshotEstimado=true`.

**B3 — Snapshot no item do pedido (1a)**
Arquivo novo `backend/services/custoSnapshotService.js`:
- `gravarSnapshotPedido(pedidoId, { db = prisma } = {})` — idempotente: só itens com `custoUnitarioSnapshot IS NULL`; usa `classificarProdutos` + `custoAgora`; um `updateMany` por grupo (ou `$executeRaw` em lote) — **fora de `$transaction`**; **nunca lança** (try/catch interno, log `[CustoSnapshot]`), devolve `{ gravados, semCusto }`.
- `limparSnapshotPedido(pedidoId)` — zera os campos (reversão).
Pontos de integração em `backend/services/estoqueService.js`:
  1. `faturarPedido` (linha 219): **depois** do `$transaction` de estoque (linha ~286), antes do `return resultados`: `await custoSnapshotService.gravarSnapshotPedido(pedidoId).catch(() => {})`. É **fora** da transação de estoque (log/secundário). **Não alterar a lógica de baixa de estoque.**
  2. `cancelarPedido` (linha ~293), quando `opts.motivo` indica reversão de aprovação (especial/BN revertida): chamar `limparSnapshotPedido` para o próximo `faturarPedido` regravar o custo do dia. Cancelamento por CA/exclusão: também limpar (pedido sai da receita).
  3. Rede de segurança: em `backend/workers/scheduler.js` um job a cada 30 min `completarSnapshotsPendentes()` (em `custoSnapshotService`) — pega `PedidoItem` com snapshot nulo cujo pedido está `statusEnvio='RECEBIDO'` ou em `WHERE_PEDIDO_RECEITA`, dos últimos 7 dias, `take: 500`. Segue o padrão `scheduleSnapshotCusto` (`scheduler.js:252`). Evita buracos quando o processo cai entre o RECEBIDO e o `faturarPedido`.

Não tocar: `marcarPedidoFaturado` (NF-e), `aprovarEspecial`/`aprovarBonificacao` (já chamam `faturarPedido`), nada do fluxo de NF/devolução.

**B4 — Backfill retroativo (1a)**
Rota admin em `backend/routes/adminExec.js` (padrão das outras): `POST /api/admin-exec/indicadores-backfill-snapshot?de=YYYY-MM-DD&ate=YYYY-MM-DD&dry=1&limite=2000` (header `x-admin-secret`).
- Idempotente (só itens sem snapshot), em lotes de ~500 itens, **sem `$transaction` gigante** (update por lote), devolve `{ itensAnalisados, gravados, porFonte:{FICHA,COMPRA,HIST_MENSAL,ATUAL,SEM_CUSTO}, semCusto:[produtos top 20] }`.
- `dry=1` não grava (é o diagnóstico para o dono ver a cobertura antes). Rota irmã `GET /api/admin-exec/diag-indicadores-snapshot` → cobertura por mês: % itens com snapshot real / estimado / sem.
- Depois do deploy: rodar dry → conferir → rodar valendo. **Gravar só em itens de pedidos que já estão em `WHERE_PEDIDO_RECEITA`.**

**B5 — Curva semanal de custo (1b) — decisão: DERIVAR DE `CompraItem` NA LEITURA, sem novo ponto gravado**
Justificativa: (1) `CompraItem` já é o ledger por entrada, com fornecedor, data e `estornado` — gravar de novo em `ProdutoCustoHistorico` duplica e **desanda quando uma entrada é estornada/corrigida** (`estornarEstoqueNota`, `corrigirEstoqueNota` em `notaEstoqueService.js`); derivar na leitura se corrige sozinho. (2) `ProdutoCustoHistorico` tem unique `(produtoId, mesReferencia)` — um ponto por mês; mudar isso é migração mexendo em índice e em quem usa `produtoId_mesReferencia` (`produtoMargemService.js:537`). (3) Insumo (`ItemPcp`) não tem histórico, e um histórico novo só enxergaria o futuro; `CompraItem` enxerga o passado inteiro. `ProdutoCustoHistorico` **continua mensal e intocado** (tela Margem & Custo).
Implementação em `indicadoresCustoService`:
- `serieSemanalInsumos({ semanas = 8, itemPcpIds? })`: semanas começam na segunda, fuso SP; para cada insumo (ItemPcp tipo MP/EMB que aparece em receita vigente de produto fabricado; `produtoId` do ItemPcp também casa `CompraItem.produtoId`), valor da semana = último `CompraItem.custoUnitario` com `dataCompra ≤ fim da semana` (degrau). Antes da 1ª compra conhecida: repete a 1ª e marca `estimado:true`. **Último preço pago** (é o que a gerente quer ver: "quanto paguei"); o custo médio ponderado atual vai ao lado no detalhe.
- `serieSemanalFicha(produtoId, semanas)`: recompõe `custoFicha` por semana com o resolver "preço do insumo na semana" (mesma composição **atual** da ficha; selo "composição atual" no detalhe). Cache em memória por 10 min (chave semanas+foco).
- Cache e limite: máx. 40 insumos e 60 produtos fabricados por chamada.
O Δ de 4 semanas do produto na tabela vem de `serieSemanalFicha`.

**B6 — Alíquota de imposto (1c)**
- Em `backend/services/indicadoresConfigService.js` (novo): `getAliquota()` / `setAliquota(pct)` sobre `appConfig` (`key: 'indicadores_aliquota_imposto_venda'`), validação 0–40, 1 casa. Rota `GET/PUT /api/indicadores-gestao/config`, **PUT só admin**.
- Regra: `imposto = aliquota% × (faturado com nota − devoluções tipo CONTA_AZUL)`. Pedido **especial** (sem nota) **não** paga imposto. `receitaLiquida = receitaBruta − devoluções − imposto`.
- Aliquota vazia/0: `imposto` = soma das despesas das categorias do bloco "Impostos sobre vendas" (nome do `GrupoDre`) na competência, selo `impostoOrigem: 'PAGO'`; com alíquota: `impostoOrigem: 'ALIQUOTA'` e esse bloco **sai** de `despesasVariaveis`.
- UI mínima: ícone ⚙ no `PageHeader` (só admin) abre modal com 1 campo "Imposto sobre a venda (%)" e o texto explicativo de D1. Sem novo item de menu.

**B7 — CPV × CMV, despesas e categorias pendentes (1d, 1e)**
- Em `financeiroGerencialService.js`: **extrair** (sem mudar comportamento) o miolo que carrega despesas + classificação de `dre()` (`:419-476`) para `carregarDespesasClassificadas(gte, lte)` e fazer `dre()` chamá-la. Aceite: JSON de `GET /api/financeiro-gerencial/dre` antes × depois **idêntico** (diff por curl em 3 períodos). Se o dev preferir não tocar `dre()`, duplicar só a leitura (**somente leitura**, com comentário "manter igual ao dre()") — mas a extração é a recomendação.
- `CategoriaDespesa.compraDeEstoque`: o `PUT` de classificação que alimenta `CategoriasDespesaPage` (`salvarCategoriasDespesa`, rota em `routes/financeiroGerencial.js`) passa a aceitar o campo opcional `compraDeEstoque` (ausente = não muda). **Frontend dessa tela**: 1 chip/toggle "Compra de estoque" por linha (tarefa F0 abaixo).
- Cálculo (em `indicadoresGestaoService.calcularPeriodo`):
  - `cpv = Σ qtd × custoUnitarioSnapshot` dos itens `classeCustoSnapshot='FABRICADO'`; `cmv` = REVENDA + SEM_CLASSE (SEM_CLASSE reportado à parte em `cmvSemClasse`). Item sem snapshot: cai no custo atual (`custoAgora`) e conta em `cobertura.itensSemSnapshot`.
  - `devolução do custo`: para cada `DevolucaoItem` ATIVA no período, abate `qtd × custo médio do snapshot do produto nos itens do pedido original` (fallback custo atual) — mesma classe. (Devolução volta a mercadoria ao estoque.)
  - `despesasVariaveis` = categorias `natureza=VARIAVEL` **menos** `compraDeEstoque=true` (e menos bloco Impostos se há alíquota). `despesasFixas` = `FIXA`. `A_DEFINIR` fica fora e vira `semNatureza`.
  - `lucroBruto = receitaLiquida − cpv − cmv`; `MC = lucroBruto − despesasVariaveis`; `resultado = MC − despesasFixas`.
  - Despesa é por **competência mensal**; para período que não é mês fechado, rateio proporcional aos dias (`despesasProporcionais: true`, selo na tela).
- `contarCategoriasPendentes()`: `{ semNatureza: n, semMarcaCompraEstoque: n, categorias: [{ id, nome, natureza, valorUltimos3Meses }] }`. Alimenta o alerta "N categorias sem natureza".

**B8 — Serviço, rota e contrato** (3.3 abaixo)
- `backend/services/indicadoresGestaoService.js` (novo): `resumo`, `cascata`, `equilibrio`, `insumosSemanal`, `entradasSemana`, `produtos`, `producao`, `alertas`, `clientes`, `categoriasPendentes`. Cache em memória TTL 60 s por (rota, de, ate, foco). Prisma `select` sempre explícito e conferido contra o schema (regra do projeto: campo inexistente passa no `node --check` e derruba a rota). SQL cru só com `Prisma.sql` parametrizado.
- `backend/routes/indicadoresGestao.js` (novo) + `backend/index.js`: `app.use('/api/indicadores-gestao', indicadoresGestaoRoutes)` (junto da linha 196).
- **Permissão por endpoint**, lida do banco a cada chamada (padrão `routes/dashboards.js:64`):
  - `nivelCompleto = perms.admin || perms.Pode_Ver_Indicadores_Gestao`
  - `nivelProducao = nivelCompleto || perms.Pode_Ver_Indicadores_Producao`
  - Endpoints `resumo, cascata, equilibrio, clientes, categorias-pendentes, config(PUT)` exigem **completo**. `insumos-semanal, entradas-semana, produtos, producao, alertas` exigem **produção**; quando o usuário **não** é completo (ou manda `foco=producao`) o servidor filtra para fabricados+insumos e **remove** campos financeiros (`preco*`, `receita*`, `margem*`, `mc*`, `markup`, `cliente*`). **Não** usar `isClark` (o front não espelha; o dono é admin).
  - Espelho no frontend (exato): completo = `hasPermission('Pode_Ver_Indicadores_Gestao')` (admin = true); produção = completo **ou** `hasPermission('Pode_Ver_Indicadores_Producao')`.

**B9 — Permissões (back+front nesta etapa, pequeno)**: chaves e `BOOL_INDEX` (ver 4.4) — entram já na Etapa 1 para o QA poder testar perfis.

### 3.3 Contrato JSON (base `/api/indicadores-gestao`) — congelar antes de codar

Convenções: datas `YYYY-MM-DD` (SP); dinheiro em reais `number` com 2 casas; percentuais em **pontos** (`33.0` = 33,0%) com 1 casa; markup 2 casas; custo unitário 4 casas; ausente/indeterminado = `null` (nunca `0` enganando). Todos aceitam `?de=&ate=` (default mês corrente até hoje) e `?foco=todos|producao` (default `todos`). Erros: `{ error: string }` com 400/403/500. Todos devolvem `periodo`:
```
periodo: { de, ate, dias, anterior: { de, ate } }   // anterior = mesmo tamanho; mês cheio -> mês anterior cheio
```

**GET /resumo** (completo)
```
{ periodo,
  cobertura: { itensTotal:int, itensSnapshotReal:int, itensSnapshotEstimado:int, itensSemSnapshot:int,
               pctReal:number, avisos:[string] },            // "X% do custo vem de estimativa"
  kpis: {
    receitaLiquida:       { valor, anterior, variacaoPct, semaforo },
    margemContribuicao:   { valor, pct, anterior, pctAnterior, deltaPt, media3mPct, semaforo },
    resultadoOperacional: { valor, pct, anterior, pctAnterior, deltaPt, media3mPct, semaforo },
    custoInsumos:         { variacaoPct, semanas:8, destaques:[{ itemPcpId, nome, variacaoPct }], semaforo }
  },
  sparks: { receitaLiquida:[number], mcPct:[number], resultadoPct:[number], custoInsumosIdx:[number] } }  // 6-8 pontos
semaforo = { status:'ok'|'atencao'|'agir'|'sem_dado', palavra:string, base:'media3m'|'meta'|'nenhuma' }
```
**GET /cascata** (completo)
```
{ periodo, impostoOrigem:'ALIQUOTA'|'PAGO', despesasProporcionais:boolean,
  linhas:[ { chave:'receitaBruta'|'devolucoes'|'impostos'|'receitaLiquida'|'cpv'|'cmv'|'lucroBruto'|
                  'despesasVariaveis'|'margemContribuicao'|'despesasFixas'|'resultado',
             rotulo:string, valor:number /* deduções negativas */, tipo:'total'|'deducao'|'resultado',
             pctReceitaLiquida:number|null } ],
  alertas:{ semNatureza:{ qtd:int, valor:number }, cmvSemClasse:number } }
```
**GET /equilibrio?mes=YYYY-MM** (completo; default mês atual)
```
{ mes, fixos:number, mcPct:number|null, pontoEquilibrio:number|null, margemSegurancaPct:number|null,
  acumulado:number, diasUteisDecorridos:int, diasUteisTotais:int,
  projecaoFechamento:number, projecaoMetodo:'dias_trabalho'|'ritmo_linear',
  mesFechado:boolean, mesReferenciaEquilibrio:string /* ex 'set/26' quando mes atual ainda sem fixos */ }
```
**GET /insumos-semanal?semanas=8** (produção)
```
{ semanas:[{ inicio:'YYYY-MM-DD', rotulo:'10/08' }],
  insumos:[ { itemPcpId, nome, unidade, tipo:'MP'|'EMB', pesoCpvPct:number|null /* só completo */,
              valores:[number|null], estimados:[boolean], indice:[number] /* base 100 */,
              variacaoPct:number, altasSeguidas:int, custoMedioAtual:number|null } ] }   // top 6 por peso/variação
```
(`pesoCpvPct` é omitido para quem não é completo, pois depende de volume de venda.)
**GET /entradas-semana?semanaOffset=0** (produção) — semanaOffset 0 = semana corrente, -1 anterior
```
{ semana:{ de, ate }, notas:int,
  entradas:[ { compraItemId, itemPcpId|null, produtoId|null, nome, fornecedor, dataCompra, quantidade, unidade,
               custoPago, custoAnterior:number|null, variacaoPct:number|null } ],
  efeitoFichas:[ { produtoId, nome, deltaCustoUn:number } ] }   // recomposição das fichas por causa das entradas
```
Só insumos de receita de fabricado na visão produção (`foco=producao`); nas demais, mostra tudo com `eFabricacao:boolean`.
**GET /produtos** (produção — **forma reduzida** se não for completo ou `foco=producao`)
```
{ periodo, foco, resumo:{ qtdProdutos:int, semCusto:int },
  linhas:[ { produtoId, nome, categoria|null, classe:'FABRICADO'|'REVENDA'|'SEM_CLASSE', unidade,
             quantidadeVendida:number,
             custoFichaUn:number|null, custoFonte:'FICHA'|'COMPRA'|'CA'|'SEM_CUSTO',
             variacaoCusto4sPct:number|null, temCustoFaltando:boolean, fichaDesatualizada:boolean,
             // --- só nivelCompleto e foco=todos ---
             precoMedio?:number|null, custoVariavelUn?:number|null, markup?:number|null,
             mcUn?:number|null, mcPct?:number|null, mcTotal?:number|null,
             situacao?:{ status:'ok'|'atencao'|'agir'|'sem_dado', rotulo:string } } ] }
```
Ordenação default `mcTotal` desc (completo) ou `quantidadeVendida` desc (produção); `?ordem=` aceito. Visão produção devolve só `classe='FABRICADO'`. `custoVariavelUn` = custo da ficha + (comissão+frete+taxa) rateados (Etapa 2: igual ao custoFichaUn + `variavelRateioUn` quando houver; senão `null` e a coluna mostra "—").
**GET /producao** (produção)
```
{ periodo,
  estoque:{ diasEstoqueProdutoAcabado:number|null, diasEstoqueInsumos:number|null },
  perdas:{ disponivel:boolean /* false até a Etapa 3 */, valorMes:number|null, pctCpv:number|null, metaPct:number|null,
           semanal:[{ inicio, pct }] },
  custoRealXPadrao:{ disponivel:boolean, desvioPct:number|null },
  rendimentoLote:{ disponivel:boolean, realPct:number|null, fichaPct:number|null } }
```
**GET /alertas** (produção; completo vê todos, produção só `escopo:'producao'`)
```
{ itens:[ { id:string, nivel:'urgente'|'atencao'|'info', escopo:'producao'|'dono',
            titulo:string, texto:string, acao:{ rotulo:string, rota:string }|null } ] }
```
Regras: custo do produto subiu >5% em 3-4 semanas com preço parado (dono); insumo com 3 altas seguidas (produção); ficha desatualizada/`temCustoFaltando` (produção); MC abaixo da média 3 meses (dono); cliente com MC% < 25% (dono); `N categorias sem natureza` e `N sem marca compra de estoque` (dono, `acao.rota='/financeiro/categorias-despesa'`); `cobertura.pctReal < 80%` (dono); produto vendido sem classe (dono).
**GET /clientes?limite=6** (completo)
```
{ periodo, custoEntregaOrigem:'ESTIMADO'|'INDISPONIVEL',
  linhas:[ { clienteId /* UUID */, nome, receita, descontoMedioPct:number|null, entregas:int,
             custoEntrega:number|null, mcPct:number|null, mcTotal:number|null } ] }
```
Desconto = `1 − Σ(valor×qtd)/Σ(valorBase×qtd)`. MC do cliente = receita − custo (snapshot) − comissão rateada quando houver (Etapa 2: custo + custoEntrega, só).
**GET /categorias-pendentes** (completo) → `{ semNatureza:int, semMarcaCompraEstoque:int, categorias:[{ id, nome, natureza, compraDeEstoque, valorUltimos3Meses }] }`
**GET /config** (completo) / **PUT /config** (admin) → `{ aliquotaImpostoVenda:number|null }`

### 3.4 Riscos (Etapa 1)
- **Dupla contagem de matéria-prima** (CPV + despesas variáveis): coberto por D2 + `compraDeEstoque`; sem a marcação do dono a MC fica errada → alerta persistente no topo da tela, e `cobertura.avisos`.
- **Hook em `faturarPedido`**: roda em 5 caminhos de faturamento; a chamada nova **nunca pode lançar** nem atrasar a baixa de estoque (fica depois do `$transaction`, em try/catch). Teste: faturar pedido com produto sem custo → pedido fatura, estoque baixa, snapshot `SEM_CUSTO`.
- **Reversão**: se não limpar o snapshot na reversão de especial/BN, reaprovação mantém custo velho → coberto por `limparSnapshotPedido`.
- **Extração de `dre()`** pode alterar a DRE e a aba Resultado & Margem (`dashboards.js:707`), comissão e meta não são afetadas (não usam despesas); testar com diff de JSON.
- **Regra de receita** (`WHERE_PEDIDO_RECEITA`) **não é alterada**; copiar a condição, não reescrever (existe também em SQL em `financeiroGerencialService.js:403`, `dashboards.js:98`, `adminExec.js:2920`). Qualquer divergência aqui quebra o "mesmo número" da comissão/meta/dashboard.
- `Produto.custoManual` é Decimal(12,**2**): custo de embalagem de centavos arredonda. Não corrigir aqui (fora do escopo); registrar como limitação e usar `ItemPcp.custoUnitario` (4 casas) quando existir.
- Custo `SEM_CUSTO` em item vendido: não vira zero silencioso — entra em `cobertura` e no alerta.
- Backfill pesado em horário de pico: rodar fora do horário comercial, lotes de 500, `dry=1` primeiro.
- Fuso: agrupar semanas/meses em `America/Sao_Paulo` (`data_venda` é UTC no banco).

### 3.5 Critérios de aceite (Etapa 1) — verificáveis por curl/SQL pelo QA e revisor
1. `npx prisma validate` e subir o backend local sem erro; `GET /api/financeiro-gerencial/dre` idêntico ao de antes (diff vazio).
2. Faturar localmente um pedido novo (normal, depois especial): todos os `pedido_itens` ganham `custo_unitario_snapshot`, `fonte_custo_snapshot`, `classe_custo_snapshot`, `custo_snapshot_estimado=false`; o estoque baixa **igual a antes**; refaturar não duplica.
3. Reverter o especial → snapshot zerado; reaprovar → regravado com o custo do dia.
4. Mudar o custo do produto e faturar outro pedido: o pedido antigo mantém o custo antigo (prova do snapshot).
5. `dry=1` do backfill devolve cobertura; valendo, `porFonte` soma = itens gravados; rodar de novo grava 0.
6. `/resumo`, `/cascata`, `/equilibrio` com usuário **sem** permissão → 403; só `Pode_Ver_Indicadores_Producao` → 403 em resumo/cascata/equilibrio/clientes e 200 em insumos/entradas/produtos/producao/alertas **sem** nenhum campo `preco*`/`mc*`/`margem*`/`receita*`.
7. Cascata: `receitaBruta − devolucoes − impostos = receitaLiquida` e `receitaLiquida − cpv − cmv = lucroBruto` e `lucroBruto − despesasVariaveis = MC` e `MC − despesasFixas = resultado` (centavos).
8. Produto com ficha vigente → `classe=FABRICADO`; `nfeRevenda` sem ficha → `REVENDA`; nenhum dos dois → `SEM_CLASSE`.
9. `/insumos-semanal`: a série de um insumo bate com os `CompraItem` não estornados (estornar uma entrada de teste muda a curva).
10. `/categorias-pendentes` bate com a tela Categorias de Despesa.
11. Nenhum campo existente de `/api/ia-consulta/v1`, comissão, meta, DRE ou Margem & Custo muda (grep dos consumidores abaixo).

### 3.6 O que fica fora (Etapa 1)
Custo real de produção; metas; tela; cálculo de custo da bonificação/amostra (BN não entra no CPV — registrar como pendente); mexer em `ProdutoCustoHistorico`; trocar `Produto.custoManual` para mais casas; qualquer toque na emissão de NF-e, devolução automática, WhatsApp ou `/api/ia-consulta/v1`.

---

## 4. ETAPA 2 — a tela (frontend)

### 4.1 Arquivos (criar/alterar)
- **Criar** `frontend/src/pages/Dashboard/IndicadoresGestao.jsx` (página; usa `PageHeader icon={Gauge} cor="red"` — módulo Dashboard é vermelho).
- **Criar** `frontend/src/pages/Dashboard/indicadores/` com componentes SVG puros: `Cascata.jsx`, `Equilibrio.jsx`, `CurvaInsumos.jsx`, `Sparkline.jsx`, `BarrasPerda.jsx`, `SemaforoPalavra.jsx`, `TabelaProdutos.jsx`, `TabelaClientes.jsx`, `EntradasSemana.jsx`, `Alertas.jsx`, `GuiaLeitura.jsx` e `useTooltip.js` (hover/toque; portar a lógica do `#tip` do mock). Sem lib nova (confirmado: não há recharts/chart.js).
- **Alterar** `frontend/src/App.jsx`: (a) `const IndicadoresGestao = lazyComRetry(() => import('./pages/Dashboard/IndicadoresGestao'));` (linha ~28; **nunca `React.lazy`**); (b) rota `/indicadores-gestao` com `PrivateRoute tab={['Pode_Ver_Indicadores_Gestao','Pode_Ver_Indicadores_Producao']}` (junto da linha ~896); (c) item de menu **"Indicadores de Gestão"** (ícone `Gauge` do lucide — importar) no grupo **Financeiro** com `hasPermission('Pode_Ver_Indicadores_Gestao')`, e o mesmo item no grupo **PCP** com `hasPermission('Pode_Ver_Indicadores_Gestao') || hasPermission('Pode_Ver_Indicadores_Producao')` (o perfil "pcp" só vê esse grupo — `GRUPOS_POR_PERFIL`); conferir também o menu **mobile** (`MobileMenuSection`) e a lista de favoritos (`ROTAS_ANTIGAS_PARA_NOVA` não precisa). Cuidado: o filtro `PrivateRoute` usa `hasPermission(t,'view')`; para chave booleana isso devolve o valor — ok.
- **Alterar** `frontend/src/pages/Financeiro/CategoriasDespesaPage.jsx`: tarefa F0 — chip/toggle "Compra de estoque" por linha (e incluir `compraDeEstoque` no payload de `salvarCategoriasDespesa`, `frontend/src/services/financeiroGerencialService.js`), contagem de pendências inclui "sem marca". Usar tokens do tema, nada de `<select>` nativo.
- **Alterar** `frontend/src/services/` — criar `indicadoresGestaoService.js` (um método por endpoint do contrato 3.3).
- **Alterar** `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` (ver 4.4).

### 4.2 Estrutura da tela (espelha o mock)
Topo (`PageHeader` + `FiltroPeriodo` via `usePeriodoSalvo('indicadores-gestao')` preset padrão `'mes'` + `SelectBusca` "Comparar: mês anterior/ano anterior" + toggle **Dono | Gerente de produção** + ⚙ config do imposto, só admin). Persistir com `useFiltrosSalvos('indicadores-gestao', { visao: 'dono' })`; visão padrão de quem só tem produção = `'producao'` e **sem o toggle** (não existe visão dono para ela).

Blocos, na ordem do mock:
1. **Faixa de aviso** de cobertura/ pendências (D2): "X% do custo vem de estimativa" / "N categorias de despesa sem natureza" (dono).
2. **KPIs** (grid `grid-cols-2 md:grid-cols-4`): Receita líquida, MC, Resultado operacional (dono) e Custo médio dos insumos (também produção). Cada um com seta, delta, sparkline e **palavra do semáforo** ("no alvo/atenção/agir/subindo") + ícone `?` com o texto do "Guia de leitura" (mesmo texto do mock e do manual do Clippy). `sem_dado` = só seta.
3. **Cascata** (dono) — SVG horizontal como no mock; hover mostra valor e % da receita líquida.
4. **Meta/equilíbrio** (dono) — bullet SVG com equilíbrio, acumulado e projeção hachurada; 4 mini-números.
5. **Curva de insumos** (ambas) — 8 semanas, base 100, crosshair e tooltip com R$/un; rótulos finais sem colisão (algoritmo do mock).
6. **Entradas da semana** (ambas) — tabela (desktop) / cards (mobile) + linha "Efeito nas fichas técnicas". Seletor semana atual/anterior.
7. **Tabela de produtos** — colunas completas no dono (com selo "revenda"); no produção só Produto · Qtde · Custo ficha/un · Δ4 sem · situação. Ordenação por `SelectBusca`. **Mobile: cards** (`md:hidden`) e tabela `hidden md:block`.
8. **Produção e estoque** (ambas) — dias de estoque; perdas/custo real × padrão/rendimento aparecem com selo "disponível na próxima fase" enquanto `disponivel:false` (nunca número inventado).
9. **Onde agir primeiro** (alertas; produção vê só `escopo:'producao'`).
10. **Clientes** (dono) — top 6; mobile em cards; selo "estimado" no custo de entrega.
11. **Guia de leitura** colapsável (accordion) — textos do mock, **abertos por padrão** (regra do projeto).

### 4.3 Regras de implementação
- **FOCO produção (obrigatório):** o front **não filtra sozinho** — pede `?foco=producao` quando a visão é a da gerente e confia no servidor; a lista de produtos da visão produção traz **só `classe='FABRICADO'`**; insumos só os que estão em ficha de fabricado. Teste explícito: um produto de revenda e um sem ficha **não aparecem** na visão produção e **aparecem** (com selo) na visão dono.
- Espelhar permissão exatamente (4.4). Se a chamada de um bloco der 403, o bloco some sem derrubar a página (cada bloco carrega independente com `Promise.allSettled`).
- `useFiltrosSalvos`/`usePeriodoSalvo`; **não** persistir datas absolutas nem a navegação de setas.
- Dinheiro `fmtRS/fmtK` do `dashUi.jsx`; **nunca interpolar campo opcional sem guarda** (`null` → "—").
- Mobile ≥320px sem scroll horizontal (`max-w-full overflow-x-hidden`, `p-3 md:p-6`); gráficos SVG com `viewBox` + `preserveAspectRatio` e largura 100%; hover no desktop **e toque** no mobile (tap abre tooltip); alvo de toque ≥44px.
- Animação só `opacity/transform`; sem `box-shadow` animado; sem `position:absolute` negativo em grid.
- Estado vazio com `EstadoVazio`; erro com mensagem do servidor + botão "Tentar de novo"; carregando com `Carregando`.
- Tema Starbucks: tokens (`bg-primary`, `bg-mint`, `house`), cores semânticas de status inalteradas (verde/âmbar/vermelho). Gráfico usa a paleta do mock (`--s1..s4`).
- PWA: nada novo no service worker.

### 4.4 Permissões (nova chave booleana, 2 níveis)
- `Pode_Ver_Indicadores_Gestao` (completo) e `Pode_Ver_Indicadores_Producao` (só produção).
- `PermissoesModal.jsx`: `DEFAULT_PERMISSIONS` (linha 24, junto de `Pode_Ver_Dashboard_Admin`) = `false`; **`BOOL_INDEX`** (linha 238, sec `'dashboard'`) com as duas entradas (nome, desc, `kw: 'indicadores gestao cpv cmv margem custo insumos producao'`; a de completo com `danger: true` pois é dado financeiro sensível); toggles na `secaoDashboard` (linha 802); preset **`producao`** (linha 387) ganha `'Pode_Ver_Indicadores_Producao'` (a de completo **não** entra em preset nenhum). Sem entrada no `BOOL_INDEX` a chave não aparece em busca/perfil/lote/histórico (regra do painel).
- Backend valida (3.2 B8). Atenção aos 3 erros já vistos: `!!perms.x` onde `x` é objeto; checar chave **booleana** com `=== true` no front e truthy no back; testar com o perfil "Producao".

### 4.5 Riscos (Etapa 2)
- Menu: item duplicado em dois grupos (Financeiro/PCP) — garantir que nunca aparece 2× para o mesmo usuário (completo vê no Financeiro; no PCP só quem **não** é completo, ou aceitar os dois).
- `DashboardGeral` e `ProdutosMargemCusto` ficam **iguais**; a nova tela não substitui nenhuma (decisão futura do dono).
- Carga: 8-9 chamadas em paralelo — o cache TTL 60 s do servidor e `allSettled` seguram; não usar polling.
- Bundle: lazy + SVG puro, sem lib → peso pequeno; rodar `cd frontend && npm run build`.
- Texto "o que dizer ao dono": números de teste do QA **nunca** vão para manual/novidade.

### 4.6 Critérios de aceite (QA clicando, desktop e 375px)
1. Admin vê o item "Indicadores de Gestão" no menu e abre a tela; usuário sem nenhuma das duas chaves **não vê o item** e `/indicadores-gestao` mostra "Acesso Negado".
2. Usuário só com `Pode_Ver_Indicadores_Producao` (perfil "Producao"): vê item no grupo PCP, abre direto na visão produção, **sem toggle**, sem KPI de receita/MC/resultado, sem cascata/equilíbrio/clientes; abrir no DevTools as respostas não contém campos financeiros.
3. Admin alterna Dono ↔ Gerente: na visão Gerente a tabela só tem fabricados; revenda/sem ficha somem; voltando ao Dono reaparecem com selo "revenda".
4. Trocar período no `FiltroPeriodo` (Este mês, Últimos 30 dias, mês anterior, personalizado) refaz todos os blocos; fechar e reabrir a tela lembra visão e preset.
5. Hover (desktop) e toque (mobile) nos gráficos mostram o detalhe; nada de scroll horizontal em 375px; tabelas viram cards.
6. Valores da cascata batem com os do `/cascata` (DevTools) e com o cálculo manual de um período pequeno.
7. Erro: derrubar o backend/derrubar 1 endpoint → só o bloco afetado mostra erro com "Tentar de novo"; 403 de 1 bloco não quebra a página.
8. Admin abre ⚙, grava alíquota 6% → KPIs recalculam, selo "imposto por alíquota"; valor inválido (-1, 99) é recusado.
9. Tela Categorias de Despesa: marcar "Compra de estoque" persiste; o alerta de pendências muda.
10. `npm run build` passa.

### 4.7 O que fica fora (Etapa 2)
Perda real, custo real×padrão e rendimento por ordem (mostrar "próxima fase"); metas e semáforo por meta; exportar PDF/impressão; drill-down por produto; substituir/remover telas atuais; notificações.

---

## 5. ETAPA 3 — produção real e metas

### 5.1 Schema (somente aditivo)
```prisma
model OrdemProducao {
  // ... atuais intactos ...
  custoPadraoTotal        Decimal? @map("custo_padrao_total")        @db.Decimal(12, 2) // Σ qtdPrevista × custo do insumo
  custoRealizadoTotal     Decimal? @map("custo_realizado_total")     @db.Decimal(12, 2) // Σ qtdReal(ou prevista) × custo do insumo
  rendimentoRealPct       Decimal? @map("rendimento_real_pct")       @db.Decimal(6, 2)  // produzida ÷ planejada × 100
  perdaRealPct            Decimal? @map("perda_real_pct")            @db.Decimal(6, 2)  // max(0, 100 − rendimentoRealPct)
  perdaInsumoValor        Decimal? @map("perda_insumo_valor")        @db.Decimal(12, 2) // Σ max(0, real − previsto) × custo
  custoApuradoEm          DateTime? @map("custo_apurado_em")
}
model IndicadorMeta {            // tabela nova (preferida a app_configs: tem histórico e valida por indicador)
  id         String   @id @default(uuid())
  indicador  String   @unique    // MC_PCT | RESULTADO_PCT | CPV_PCT | CMV_PCT | PERDA_PCT | CUSTO_INSUMOS_VAR_PCT | DIAS_ESTOQUE_PA | MARKUP_MIN ...
  alvo       Decimal  @db.Decimal(10, 2)
  sentido    String   @default("MAIOR_MELHOR") // MAIOR_MELHOR | MENOR_MELHOR
  toleranciaAmarelaPct Decimal @default(5) @map("tolerancia_amarela_pct") @db.Decimal(6, 2)
  atualizadoPorId String? @map("atualizado_por_id")
  atualizadoEm    DateTime @default(now()) @updatedAt @map("atualizado_em")
  @@map("indicadores_metas")
}
```
### 5.2 Tarefas
- **B10** `pcpOrdemService.finalizar` (`:169`): **depois** do `$transaction` e do bridge de estoque comercial, em `try/catch` próprio (não pode falhar nem atrasar a finalização), `apurarCustoOrdem(ordemId)` em `indicadoresCustoService`: custo dos insumos pelo `resolver` atual (`custoManual>0` senão `custoUnitario`), grava os campos acima. Backfill das ordens FINALIZADAS antigas por rota admin (`indicadores-backfill-ordens`, idempotente por `custoApuradoEm IS NULL`, `selo estimado` implícito: custo atual). **Não** mudar a baixa de consumo nem a entrada do PA.
- **B11** `GET /producao` passa a devolver `perdas`, `custoRealXPadrao`, `rendimentoLote` reais (`disponivel:true`); `GET /alertas` ganha "perda acima da meta".
- **B12** Metas: `GET/PUT /api/indicadores-gestao/metas` (GET produção-ou-completo para os próprios indicadores visíveis; PUT admin). `semaforo` passa a `base:'meta'` quando houver meta (verde ≤ alvo; amarelo até `tolerancia`; vermelho além) e continua `base:'media3m'` sem meta; cada KPI devolve também `media3m` e `delta vs media3m`. Margem de segurança já vem do `/equilibrio`.
- **F10** tela de metas (modal "Metas" a partir do ⚙, só admin): 1 linha por indicador com alvo e sentido; selo no card ("meta 1,5%"). **F11** blocos Produção e alertas passam a mostrar os números reais.
- **P1** permissão: nada novo (reaproveita as duas chaves).

### 5.3 Riscos / aceite / fora
- Risco: `quantidadePlanejada` é a quantidade de **saída** alvo; se a equipe usa de outro jeito, a perda % fica distorcida → validar com 3 ordens reais com a gerente antes do dono ver. Risco: finalizar ordem lenta se o cálculo ficar dentro da transação → mantido fora (regra do projeto, `$transaction` com `{timeout:20000, maxWait:10000}` nas existentes).
- Aceite: finalizar ordem de teste preenche os 6 campos; perda real = (planejada−produzida)/planejada; ordem sem consumo real usa o previsto e fica marcada; bloco Produção deixa de mostrar "próxima fase"; meta de MC 35% com MC 33% → "atenção" amarelo, 28% → vermelho; sem meta → seta e palavra por média.
- Fora: PCP por lote de insumo (rastreio de lote), apontamento de perda por motivo, comissão por produto.

---

## 6. Manual do Clippy, novidade e docs (checklist final — pedido do dono)

- **Criar** `backend/manuais/abas/indicadores-gestao.md` (cobrir: o que é cada bloco, visão Dono × Gerente, como ler (textos do "Guia de leitura"), as 4 regras, alíquota, marca "Compra de estoque", o que significa estimado, permissões, como a gerente de produção vê só fabricados). Linha no índice `backend/manuais/abas/README.md`.
- **Alterar** `backend/services/copilotoService.js` tabela `ABAS` (linha 32): `{ slug: 'indicadores-gestao', nome: 'Indicadores de Gestão', rota: '/indicadores-gestao', perm: ['Pode_Ver_Indicadores_Gestao', 'Pode_Ver_Indicadores_Producao'] }` (a lista com `perm` array já é suportada, ver `entregas`).
- **Atualizar** `backend/manuais/abas/categorias-despesa.md` (nova marca "Compra de estoque" e por que Matéria-prima/Embalagens agora se marcam assim) e, se mudar a explicação de variável, `dre.md`. `pcp-dashboard.md` ganha uma linha apontando para Indicadores. Manual dos Perfis/Permissões, se existir, lista as 2 chaves novas.
- **Novidade**: `frontend/public/novidade-indicadores-gestao.html` espelhando `novidade-tarefas.html` + `novidade-cadastro-clientes.html` (hero verde-escuro, **accordions já abertos**, seção "As telas do app" com mocks em HTML/CSS e **legendas numeradas** (pins dourados) das telas: Dono, Gerente de produção, Categorias de Despesa (Compra de estoque), Configurar imposto; meta Open Graph **sem** `og:image`; **sem botão "Abrir o app"**). Entrada **no topo** de `frontend/public/novidades.json` (`{ slug: 'indicadores-gestao', titulo, resumo, data }`). Entregar link + texto pronto para o WhatsApp. **Só publicar a novidade depois de dados reais conferidos** (nunca números de teste).
- Atualizar `docs/mockups/dashboard-indicadores-gestao.html`? **Não** (é a proposta); `design-system.html` só se surgir componente novo reutilizável.

---

## 7. Divisão de trabalho e ordem global
1. Dono responde D1–D5 (pode ser em paralelo com B1–B3; só D2 trava o aceite de B7).
2. **dev-backend**: B1 → B2 → B3 → B9 → B5 → B6 → B7 → B8 → B4 (backfill) → manuais.
3. **dev-frontend** (em paralelo, a partir do contrato 3.3): F0 (Categorias) e permissões do modal → serviço `indicadoresGestaoService.js` com dados mockados do contrato → componentes SVG → página → menu/rotas. Integra com o backend quando B8 estiver no ar.
4. **qa-testador** + **revisor-codigo** em paralelo (Etapa 1 só backend: curl e SQL; Etapa 2 clicando, incluindo o perfil só-produção e 375px) → **gerente-entrega**.
5. Publicar backend antes do frontend; **rodar o backfill em produção depois do deploy** e conferir `diag-indicadores-snapshot` antes de mostrar ao dono. Etapa 1 grava no servidor sem arquivo; o teste "gravar → deploy → ler" da regra de produção vale para o **snapshot** (faturar um pedido, publicar de novo, conferir que continua gravado) e o backfill.

## 8. Armadilhas (o que NÃO fazer)
- **Não** alterar `WHERE_PEDIDO_RECEITA`, comissão, meta, a aba Resultado & Margem nem a DRE (exceto a extração sem mudança de comportamento).
- **Não** gravar snapshot dentro de `$transaction` nem deixar o erro dele bloquear faturamento/estoque; **não** chamar API externa ali.
- **Não** remover/renomear campo de `/api/ia-consulta/v1` (esta feature não deve tocar esse router; grep abaixo).
- **Não** mexer em NF-e (emissão, devolução automática, `marcarPedidoFaturado`) nem em WhatsApp.
- **Não** apagar `ProdutoCustoHistorico` nem mudar sua unique; **não** remover coluna alguma do schema.
- **Não** somar CPV e as despesas de compra de estoque juntas (dupla contagem); **não** descontar imposto e depois somar o bloco de impostos pago.
- **Não** inventar número quando o dado falta (`null` + selo); **não** esconder produção/dono só no CSS — o servidor decide.
- **Não** usar `React.lazy`, `<select>` nativo, `window.open`, datas absolutas persistidas, `grid-cols-4` sem `md:`.
- **Não** usar `isClark` na permissão nova; checar o mesmo critério front e back.
- Grepar consumidores antes de mudar retorno de qualquer service existente: `grep -rn "financeiroGerencialService\|produtoMargemService\|pcpReceitaService\|estoqueService.faturarPedido" backend frontend --include=*.js --include=*.jsx` (inclui import dinâmico). Consumidores já confirmados de `financeiroGerencialService.dre`: `routes/financeiroGerencial.js`, `routes/dashboards.js:707`.
