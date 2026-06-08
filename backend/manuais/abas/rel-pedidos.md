---
aba: Relatório de Pedidos
rota: /relatorios/pedidos
permissao: pedidos (view) — vendedor vê os próprios; admin vê todos
---

# Relatório de Pedidos

## O que é

Relatório detalhado de pedidos com filtros avançados. Diferente da aba Pedidos (que é operacional), esta tela é focada em análise: você define o período, filtra por situação, tipo e vendedor, e exporta os dados para CSV. Cada pedido é exibido com todos os seus itens em uma linha expansível.

---

## O que dá pra fazer aqui

- Filtrar pedidos por data de criação, data de venda, vendedor, status de envio, tipo (normal/especial), situação no Conta Azul e status de entrega
- Buscar por nome do cliente ou CNPJ/CPF
- Ver resumo quantitativo no topo: total de pedidos, itens, valor e flex
- Expandir um pedido para ver os itens com quantidade, valor unitário e total
- Exportar o resultado em arquivo CSV (com BOM para abrir corretamente no Excel)

---

## Como fazer (passo a passo real)

### Gerar um relatório
1. Abra a aba Relatório de Pedidos
2. O painel de filtros abre automaticamente
3. Ajuste as datas de criação (padrão: início do mês até hoje)
4. Aplique outros filtros opcionais (vendedor, status, tipo)
5. Clique em **Gerar Relatório**
6. Os pedidos aparecem em lista; o painel de filtros fecha

### Exportar para CSV
1. Gere o relatório
2. Clique no botão verde **CSV** no canto superior direito
3. O arquivo é baixado com separador `;` para funcionar no Excel brasileiro

### Expandir os itens de um pedido
- Clique na linha do pedido para expandir e ver os produtos, quantidades e valores

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
- **Entregas** — o campo "Status Entrega" vem da baixa logística

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Relatorios/RelatorioPedidos.jsx` | Componente completo da aba |
| `backend/src/routes/pedidos.js` | Rota `GET /pedidos/relatorio` |
