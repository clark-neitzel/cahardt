---
aba: Relatório de Vendas
rota: /relatorios/vendas
permissao: pedidos (view) — vendedor vê os próprios; admin vê todos
---

# Relatório de Vendas

## O que é

Relatório analítico de itens vendidos (não de pedidos, mas de linhas de produto). Cada linha representa um produto de um pedido, permitindo análise granular por produto, cidade, bairro, cliente, vendedor e condição de pagamento. Funciona como uma planilha: as colunas podem ser reordenadas, ocultadas e filtradas por valor (estilo Excel).

---

## O que dá pra fazer aqui

- Filtrar por data de venda, data de criação, vendedor, situação no Conta Azul e tipo de pedido (excluindo bonificações)
- **Filtrar por Condição de Pagamento (múltipla escolha)** direto no painel principal — escolha uma ou várias condições e o card "Filtrado" mostra na hora quantos itens e o valor total venderam naquelas condições
- **Filtrar por Categoria Comercial (múltipla escolha)** direto no painel principal — escolha uma ou várias categorias de produto. As opções dos dois filtros vêm dos dados já carregados (precisa Gerar o relatório primeiro)
- Ordenar qualquer coluna clicando no cabeçalho
- Filtrar por valor de coluna (dropdown estilo Excel) — clicando no ícone de filtro em cada coluna (Condição e Categoria também têm o filtro de coluna, sincronizado com os do painel)
- Mostrar/ocultar colunas individualmente
- Reordenar colunas arrastando-as
- Agrupamento automático quando colunas de dimensão são ocultadas (ex: ocultar "Produto" soma quantidades)
- Ver o **preço de custo (Vl Custo)** e o **Custo Total** de cada produto — o custo é calculado a partir da **receita ativa cadastrada no PCP** (soma do custo dos ingredientes × quantidade, aplicando a perda %, dividido pelo rendimento). Quando um ingrediente é um **subproduto (SUB)**, o custo dele é calculado pela própria receita, de forma recursiva, até chegar nas matérias-primas. Para o custo aparecer, as **matérias-primas (MP) precisam ter "custo unitário" preenchido no PCP**. Produtos sem receita (ou com matérias-primas sem custo) aparecem com "-"
- Ver totais no rodapé: quantidade total, valor total, custo total
- Imprimir o relatório em formato A4 (fonte monoespaciada, compacto)
- Exportar para CSV
- Os filtros aplicados são salvos no navegador (localStorage) e restaurados na próxima visita

---

## Como fazer (passo a passo real)

### Gerar o relatório
1. Abra a aba Relatório de Vendas
2. O painel de filtros abre com os últimos filtros usados
3. Ajuste as datas e demais filtros desejados
4. Clique em **Gerar**
5. A tabela aparece com uma linha por item vendido

### Filtrar por Condição de Pagamento ou Categoria Comercial (painel principal)
1. Gere o relatório uma vez (os filtros usam os dados carregados)
2. Abra o painel de filtros (botão **Filtros**)
3. Em **Condição de Pagamento** ou **Categoria Comercial**, abra a lista e marque uma ou mais opções (há busca e "Selecionar todas")
4. O resultado é aplicado na hora — o card **Filtrado** mostra quantos itens e o valor total das opções escolhidas

### Filtrar por valor de coluna (estilo Excel)
1. Clique no ícone de funil na coluna desejada (ex: "Cidade")
2. O dropdown lista todos os valores únicos daquela coluna
3. Marque/desmarque os valores que quer ver
4. Clique **OK** para aplicar (ou fora para cancelar sem aplicar)

### Ocultar uma coluna
- Clique no botão de colunas (ícone de lista) no topo
- Desmarque as colunas que não quer ver
- As colunas numéricas (Qtd, Valor) são agregadas automaticamente quando dimensões são ocultadas

### Imprimir
- Clique no botão de impressora
- Uma prévia em fonte monoespaciada é exibida; use Ctrl+P para imprimir

---

## Colunas disponíveis

| Coluna | Tipo | Filtrável |
|--------|------|-----------|
| Criação | Data | Não |
| Dt Venda | Data | Não |
| Cliente | Texto | Sim |
| Produto | Texto | Sim |
| Qtd | Número | Não |
| Vl Unit | Número | Não |
| Valor | Número | Não |
| Vl Custo | Número | Não |
| Custo Total | Número | Não |
| Condição | Texto | Sim |
| Categoria | Texto | Sim |
| Tipo | Texto | Sim |
| Cidade | Texto | Sim |
| Bairro | Texto | Sim |
| Vendedor | Texto | Sim |
| Tel Vendedor | Texto | Não |
| Indicação | Texto | Sim |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `pedidos` (view) | Acessa o relatório |
| `pedidos.clientes = "todos"` ou `admin` | Pode filtrar por vendedor |

---

## Depende de / Interfere em

- **Pedidos** — os dados vêm dos itens de pedido; somente leitura
- **Conta Azul** — o filtro "Situação CA" usa os dados sincronizados (padrão: FATURADO)
- **PCP (Receitas)** — as colunas Vl Custo / Custo Total usam a receita ativa do produto no PCP; só aparecem se o produto tiver receita com ingredientes que tenham custo unitário preenchido

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Relatorios/RelatorioVendas.jsx` | Componente completo com tabela, filtros por coluna, impressão e CSV |
| `backend/src/routes/pedidos.js` | Rota `GET /pedidos/relatorio-vendas` |
