---
aba: Relatório de Pedidos
rota: /relatorios/pedidos
permissao: pedidos (view) — vendedor vê os próprios; admin vê todos
---

# Relatório de Pedidos

## O que é

Relatório detalhado de pedidos com filtros avançados. Diferente da aba Pedidos (que é operacional), esta tela é focada em análise: você define o período, filtra por situação, tipo e vendedor, e exporta os dados para CSV. Cada pedido é exibido em uma linha expansível com todos os itens, flex por item, pagamentos na entrega e observações.

---

## O que dá pra fazer aqui

- Filtrar pedidos por data de criação, data de venda, vendedor, status de envio, tipo (normal/especial), situação no Conta Azul, status de entrega e **flex (positivo/negativo/sem flex)**
- Buscar por nome do cliente ou CNPJ/CPF
- Ver resumo quantitativo no topo: total de pedidos, itens, valor e ticket médio
- Expandir um pedido para ver:
  - Dados gerais (condição, situação CA, canal, conta a receber, entrega)
  - Data de entrega (quando houver)
  - Pagamentos registrados na entrega (forma + valor)
  - Observações do pedido e da entrega
  - **Tabela de itens** com valor base, valor praticado e **flex gerado por item**
- Exportar o resultado em arquivo CSV (com BOM para abrir corretamente no Excel)

---

## Como fazer (passo a passo real)

### Gerar um relatório
1. Abra a aba Relatório de Pedidos
2. O painel de filtros abre automaticamente
3. Ajuste as datas de criação (padrão: início do mês até hoje)
4. Aplique outros filtros opcionais (vendedor, status, tipo, flex)
5. Clique em **Gerar Relatório**
6. Os pedidos aparecem em lista; o painel de filtros fecha

### Filtrar por flex
- No filtro **Flex**, escolha:
  - "Flex Negativo" → pedidos onde o vendedor deu desconto
  - "Flex Positivo" → pedidos com acréscimo
  - "Sem Flex" → pedidos com flex = 0

### Exportar para CSV
1. Gere o relatório
2. Clique no botão verde **CSV** no canto superior direito
3. O arquivo é baixado com separador `;` para funcionar no Excel brasileiro

### Ver os itens de um pedido com flex
- Clique na linha do pedido para expandir
- Na seção "Itens do Pedido" você vê valor base, valor praticado e flex gerado por cada item

---

## Colunas do CSV

| Coluna | Descrição |
|--------|-----------|
| Nº | Número do pedido (com prefixo ZZ se especial) |
| Data Criação / Venda | Datas do pedido |
| Cliente, CNPJ/CPF | Identificação do cliente |
| Vendedor | Nome do vendedor |
| Tipo | Normal ou Especial |
| Status | Status de envio |
| Situação CA | Situação no Conta Azul |
| Entrega | Status de entrega |
| Data Entrega | Data real da entrega (se registrada) |
| Condição Pgto | Condição de pagamento usada |
| Qtd Itens, Valor Total, Flex Total | Totais do pedido |
| Canal, Observações | Dados complementares |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `pedidos` (view) | Acessa o relatório |
| `pedidos.clientes = "todos"` ou `admin` | Pode filtrar por vendedor e ver pedidos de toda a equipe |

---

## Depende de / Interfere em

- **Pedidos** — os dados vêm da mesma base; este relatório é somente leitura
- **Conta Azul** — o campo "Situação CA" é atualizado pela sincronização
- **Entregas** — o campo "Status Entrega" e "Pagamentos na Entrega" vêm da baixa logística

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Relatorios/RelatorioPedidos.jsx` | Componente completo da aba |
| `backend/routes/pedidoRoutes.js` | Rota `GET /pedidos/relatorio` |
| `backend/controllers/pedidoController.js` | Função `relatorio` |
