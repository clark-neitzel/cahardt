---
aba: Contas a Receber
rota: /financeiro/contas-receber/tabela
permissao: Pode_Acessar_Contas_Receber
---

# Contas a Receber

## O que é

Gestão financeira de todas as contas a receber geradas pelos pedidos. Cada pedido faturado no Conta Azul gera uma conta com parcelas. Esta tela mostra o estado de cada parcela (pendente, parcial, pago, vencido), permite dar baixa manual — total, parcial ou com desconto (inclusive 100%) —, sincronizar situação com o CA e gerar relatórios de inadimplência.

---

## O que dá pra fazer aqui

- Ver todas as parcelas de contas a receber em formato de tabela
- Filtrar por: busca (cliente/pedido), status da conta, status da parcela, origem, vendedor, categoria de cliente, condição de pagamento, forma de pagamento de entrega, forma de pagamento da baixa e período de vencimento/pagamento
- Ordenar por qualquer coluna (clique no cabeçalho)
- Selecionar parcelas em lote e dar baixa coletiva (sempre pelo valor cheio de cada parcela)
- Dar baixa em uma parcela individual — pode ser o valor total, um valor parcial (o restante fica pendente como PARCIAL) e/ou um desconto (em R$ ou %, incluindo 100% do saldo, sem precisar receber nada)
- Ver o histórico de cada pagamento recebido numa parcela (data, valor, desconto, quem registrou) e estornar um pagamento específico sem mexer nos outros
- Sincronizar situação de uma conta específica ou de todas as contas com o Conta Azul
- Acompanhar progresso de sincronização em tempo real (log de sync)
- Abrir popup do cliente para ver histórico e inadimplência
- Abrir popup do pedido para ver detalhes
- Gerar relatório de inadimplência agrupado por pedido, cliente, vendedor ou sem agrupamento
- Exportar a lista filtrada em CSV
- Emitir e gerenciar **boletos via Asaas** por parcela (botão "Boletos Asaas" na conta expandida da visão resumo)

---

## Status das parcelas

| Status | Cor | Significado |
|--------|-----|-------------|
| PENDENTE | Cinza | Aguardando vencimento, nenhum valor recebido ainda |
| PARCIAL | Amarelo | Recebeu parte do valor (ou desconto parcial) — ainda tem saldo restante |
| VENCIDO | Vermelho | Prazo expirado sem pagamento |
| PAGO | Verde | Quitada — recebido + desconto cobrem o valor total |
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

### Dar baixa em uma parcela (total, parcial ou com desconto)
1. Localize a parcela na tabela (ou abra "Ver detalhes" e clique em **Dar baixa**)
2. Clique no botão de baixa (ícone de cheque) na linha
3. O modal abre já com o **valor recebido** preenchido com o saldo restante — reduza esse valor para registrar um pagamento parcial
4. Opcionalmente marque **Aplicar desconto no saldo restante** (só aparece habilitado para quem tem a permissão `Pode_Dar_Desconto_Baixa`): escolha R$ ou % e informe o motivo (obrigatório). Um desconto de 100% do saldo quita a parcela sem receber nada
5. Informe forma de pagamento, data, o **banco/caixa** em que o dinheiro entrou (vem pré-selecionado com a conta padrão; alimenta o relatório "Saldos por Conta") e observação (opcionais além do valor)
6. O modal mostra ao vivo se a parcela vai ficar **PARCIAL** (com o saldo que ainda falta) ou **PAGO** (quitada)
7. Confirme — cada baixa fica registrada no histórico de pagamentos da parcela (visível em "Ver detalhes"), permitindo estornar só aquele pagamento depois, sem afetar os demais

### Dar baixa em lote
1. Marque os checkboxes das parcelas desejadas (só aparecem parcelas ainda sem nenhum pagamento — Pendente/Vencido)
2. Clique em **Baixa em Lote** (botão no topo da tabela)
3. Informe a forma de pagamento, a data e o **banco/caixa** em que o dinheiro entrou (vem pré-selecionado com a conta padrão; alimenta o relatório "Saldos por Conta") para todas
4. Confirme — todas as parcelas selecionadas são baixadas de uma vez pelo valor cheio (baixa em lote não aceita valor parcial nem desconto — para isso, use a baixa individual)

### Emitir boleto pelo app (Asaas)
1. Na visão resumo (acordeão), expanda a conta e clique em **Boletos Asaas** (aparece só se a integração Asaas estiver configurada no servidor)
2. No modal, emita o boleto de uma parcela específica ou de **todas as parcelas em aberto** de uma vez — o vencimento e o valor (saldo) vêm do nosso Contas a Receber
3. Para cada boleto emitido dá para: **Abrir o PDF**, **copiar a linha digitável**, **enviar por WhatsApp** ao cliente (mensagem pronta com link e linha digitável) e **cancelar** o boleto
4. Quando o cliente pagar, o Asaas avisa o sistema e a **baixa acontece sozinha** — na parcela local E no Conta Azul (lançada na conta financeira ASAAS). O modal mostra "Pago via Asaas" com o status das duas baixas
5. O cliente precisa ter **CPF/CNPJ no cadastro** (exigência do boleto registrado); sem isso a emissão avisa o erro
6. A nota fiscal continua sendo emitida no Conta Azul, como sempre — o Asaas cuida só da cobrança

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
| Dar baixa (individual ou em lote), estornar (tudo ou um pagamento específico) | `Pode_Baixar_Contas_Receber` ou `admin` |
| Aplicar desconto numa baixa (parcial ou 100%) | `Pode_Dar_Desconto_Baixa` ou `admin` (além de ter `Pode_Baixar_Contas_Receber`) |
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
