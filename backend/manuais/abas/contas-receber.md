---
aba: Contas a Receber
rota: /financeiro/contas-receber/tabela
permissao: Pode_Acessar_Contas_Receber
---

# Contas a Receber

## O que é

Gestão financeira de todas as contas a receber geradas pelos pedidos. Cada pedido faturado no Conta Azul gera uma conta com parcelas. Esta tela mostra o estado de cada parcela (pendente, pago, vencido), permite dar baixa manual, sincronizar situação com o CA e gerar relatórios de inadimplência.

---

## O que dá pra fazer aqui

- Ver todas as parcelas de contas a receber em formato de tabela
- Filtrar por: busca (cliente/pedido), status da conta, status da parcela, origem, vendedor, categoria de cliente, condição de pagamento, forma de pagamento de entrega, forma de pagamento da baixa e período de vencimento/pagamento
- Ordenar por qualquer coluna (clique no cabeçalho)
- Selecionar parcelas em lote e dar baixa coletiva
- Dar baixa em uma parcela individual (informando forma e data de pagamento)
- Sincronizar situação de uma conta específica ou de todas as contas com o Conta Azul
- Acompanhar progresso de sincronização em tempo real (log de sync)
- Abrir popup do cliente para ver histórico e inadimplência
- Abrir popup do pedido para ver detalhes
- Gerar relatório de inadimplência agrupado por pedido, cliente, vendedor ou sem agrupamento
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
2. Por padrão, o filtro mostra contas pendentes e vencidas
3. Ordene por vencimento para ver as mais antigas primeiro

### Filtrar contas
1. Clique no painel de filtros (ou use os filtros rápidos no topo)
2. Escolha um ou mais dos filtros disponíveis:
   - **Status da conta**: Aberto, Fechado, Cancelado
   - **Status da parcela**: Pendente, Vencido, Pago, Cancelado
   - **Origem**: de onde a conta veio (ex: pedido normal, especial)
   - **Vendedor**: filtra contas dos clientes de um vendedor
   - **Categoria de cliente**: segmento do cliente
   - **Condição de pagamento**: tipo de condição (ex: 30 dias, boleto)
   - **Forma de pagamento entrega**: forma registrada pelo motorista
   - **Forma de pagamento da baixa**: como foi quitado
   - **Período de vencimento / período de pagamento**
3. Os filtros são salvos no localStorage por usuário

### Dar baixa em uma parcela
1. Localize a parcela na tabela
2. Clique no botão de baixa (ícone de cheque) na linha
3. O modal abre — informe a forma de pagamento e a data de pagamento
4. Salve — a parcela muda para PAGO

### Dar baixa em lote
1. Marque os checkboxes das parcelas desejadas
2. Clique em **Baixa em Lote** (botão no topo da tabela)
3. Informe a forma de pagamento e data para todas
4. Confirme — todas as parcelas selecionadas são baixadas de uma vez

### Sincronizar com o Conta Azul
- Clique no ícone de atualização (reload) em uma conta específica para atualizar só aquela
- Ou clique em **Sync Todas** para atualizar todas as contas — o sistema exibe um log de progresso em tempo real mostrando quantas foram processadas e quais alterações foram aplicadas

### Gerar relatório de inadimplência
1. Clique no botão **Relatório** (no topo)
2. Defina o período de vencimento e opcionalmente a categoria de cliente
3. Escolha o agrupamento: por pedido, por cliente, por vendedor ou sem agrupamento
4. O relatório é gerado na tela com totais por grupo

### Exportar em CSV
1. Aplique os filtros desejados
2. Clique em **Exportar CSV**
3. O arquivo é baixado com as parcelas visíveis na tabela

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Contas_Receber` |
| Dar baixa (individual ou em lote) | `Pode_Baixar_Contas_Receber` ou `admin` |
| Sincronizar com o CA | `Pode_Acessar_Contas_Receber` (acesso à tela permite sync) |
| Ver contas de todos os vendedores | Qualquer usuário com acesso à tela (a tela não filtra por vendedor automaticamente) |

---

## Depende de / Interfere em

- **Pedidos** — cada pedido faturado no CA gera uma conta aqui
- **Conta Azul** — a situação das parcelas é sincronizada com o CA (baixas, cancelamentos)
- **Caixa Diário** — baixas feitas pelo motorista na entrega também atualizam as parcelas aqui
- **Clientes** — a inadimplência exibida na Rota e no detalhe do cliente vem dos dados desta tela

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Financeiro/ContasReceberTabela.jsx` | Tela completa com tabela, filtros, baixa, sync e relatório |
| `frontend/src/services/contasReceberService.js` | Chamadas de API para contas a receber |
| `backend/src/routes/contasReceber.js` | Rotas do backend |
