---
aba: Contas a Receber
rota: /financeiro/contas-receber
permissao: admin ou Pode_Baixar_Contas_Receber (para baixar)
---

# Contas a Receber

## O que é

Gestão financeira de todas as contas a receber geradas pelos pedidos. Cada pedido faturado no Conta Azul gera uma conta com parcelas. Esta tela mostra o estado de cada parcela (pendente, pago, vencido), permite dar baixa manual, sincronizar situação com o CA e gerar relatórios de inadimplência.

---

## O que dá pra fazer aqui

- Ver todas as parcelas de contas a receber em formato de tabela
- Filtrar por: busca (cliente/pedido), status da conta, status da parcela, origem, vendedor, categoria de cliente, condição de pagamento, forma de pagamento e período de vencimento/pagamento
- Ordenar por qualquer coluna (clique no cabeçalho)
- Selecionar parcelas em lote e dar baixa coletiva
- Dar baixa em uma parcela individual (informando forma e data de pagamento)
- Sincronizar situação de uma conta ou de todas as contas com o Conta Azul
- Abrir popup do cliente para ver histórico e inadimplência
- Abrir popup do pedido para ver detalhes
- Gerar relatório de inadimplência agrupado por pedido, cliente ou vendedor
- Exportar a lista filtrada em CSV

---

## Status das parcelas

| Status | Cor | Significado |
|--------|-----|-------------|
| PENDENTE | Cinza | Aguardando vencimento |
| VENCIDO | Vermelho | Prazo expirado sem pagamento |
| PAGO | Verde | Pago e baixado |
| CANCELADO | Cinza claro | Parcela cancelada |

---

## Como fazer (passo a passo real)

### Ver contas em aberto
1. Abra a aba Contas a Receber
2. Por padrão, o filtro mostra apenas parcelas PENDENTES e VENCIDAS
3. Ordene por vencimento para ver as mais antigas primeiro

### Dar baixa em uma parcela
1. Localize a parcela na lista
2. Clique no ícone de "baixar" (cheque) na linha
3. Informe a forma de pagamento e a data de pagamento
4. Salve — a parcela muda para PAGO

### Dar baixa em lote
1. Marque os checkboxes das parcelas desejadas
2. Clique em **Baixa em Lote** (botão no topo)
3. Informe a forma de pagamento e data para todas
4. Confirme

### Sincronizar com o Conta Azul
- Clique no ícone de atualização (reload) em uma conta específica para atualizar só ela
- Ou clique em **Sync Todas** para atualizar todas as contas de uma vez (processo em segundo plano)

### Gerar relatório de inadimplência
1. Clique no botão **Relatório**
2. Filtre por período de vencimento e categoria de cliente
3. Escolha o agrupamento (por pedido, cliente, vendedor ou sem agrupamento)
4. Gere e veja os totais

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total |
| `Pode_Baixar_Contas_Receber` | Pode dar baixa nas parcelas |

---

## Depende de / Interfere em

- **Pedidos** — cada pedido faturado gera uma conta aqui
- **Conta Azul** — a situação das parcelas é sincronizada com o CA
- **Caixa Diário** — baixas feitas pelo motorista (entrega) também atualizam as parcelas
- **Clientes** — a inadimplência exibida na Rota vem dos dados desta tela

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Financeiro/ContasReceberTabela.jsx` | Tela completa com tabela, filtros e modais |
| `frontend/src/services/contasReceberService.js` | Chamadas de API |
| `backend/src/routes/contasReceber.js` | Rotas do backend |
