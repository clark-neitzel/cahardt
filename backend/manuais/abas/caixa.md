---
aba: Caixa Diário
rota: /caixa
permissao: todos (vendedor vê o próprio; admin vê todos)
---

# Caixa Diário

## O que é

Resumo financeiro diário do motorista/vendedor. Mostra tudo que aconteceu em um dia: entregas realizadas, valores recebidos por forma de pagamento, amostras entregues, despesas registradas, adiantamento e o total a prestar de contas. O admin usa para conferir e fechar o caixa de cada vendedor.

---

## O que dá pra fazer aqui

- Ver resumo do dia selecionado: total entregue, total recebido por forma de pagamento, adiantamento
- Ver lista de entregas do dia com status de cada uma
- Registrar baixa de pagamento no Conta Azul (botão de baixa CA para dinheiro/pix/cartão)
- Marcar entregas como "conferidas" (assinatura verificada)
- Registrar uma nova despesa do dia (combustível, pedágio, hotel, etc.)
- Ver amostras entregues no dia
- Ver atendimentos do dia
- Fechar o caixa do dia (somente quando as baixas pendentes estiverem resolvidas)
- Conferir o caixa (admin: após revisão, marca como CONFERIDO)
- Reverter a conferência (admin: volta para FECHADO)
- Reabrir o caixa (admin: volta para ABERTO)
- Ver a ficha do veículo do dia
- Registrar devolução a partir do caixa

---

## Status do caixa

| Status | Significado |
|--------|-------------|
| ABERTO | Em andamento, ainda pode ser editado |
| FECHADO | Encerrado pelo motorista/vendedor |
| CONFERIDO | Revisado e confirmado pelo admin |

---

## Como fazer (passo a passo real)

### Ver o caixa de hoje
1. Abra a aba Caixa
2. O caixa do dia é carregado automaticamente
3. O resumo mostra: total a receber, recebido, adiantamento e saldo

### Registrar baixa no Conta Azul
1. Na lista de entregas, localize entregas com pagamento em dinheiro/pix/cartão
2. Clique no botão de baixa CA (ícone de cifrão) na entrega
3. O sistema registra o recebimento no Conta Azul

### Registrar uma despesa
1. Clique em **+ Despesa** (ou no botão de despesa no topo)
2. Escolha a categoria (combustível, pedágio, hotel, manutenção, outro)
3. Informe valor e descrição
4. Salve — a despesa é vinculada ao caixa do dia

### Fechar o caixa
1. Resolva todas as baixas pendentes de dinheiro/pix/cartão
2. Clique em **Fechar Caixa**
3. Se houver entregas sem conferência de assinatura, o sistema alerta (mas não bloqueia)
4. O status muda para FECHADO

### Conferir o caixa (admin)
1. Selecione o vendedor e o dia desejado
2. Revise as entregas e pagamentos
3. Adicione uma observação se necessário
4. Clique em **Conferir** — o status muda para CONFERIDO

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê o próprio caixa |
| `admin` ou `Pode_Editar_Caixa` | Vê caixas de todos, pode fechar e conferir |
| `Pode_Definir_Adiantamento` | Pode registrar adiantamento |
| `Pode_Ver_Historico_Caixa` | Pode ver caixas de outros dias |
| `Pode_Fechar_Caixa` | Pode fechar o caixa |
| `Pode_Baixar_Caixa` | Pode registrar baixa no CA |
| `Pode_Reverter_Caixa` | Pode reabrir um caixa fechado |
| `Pode_Fazer_Devolucao` | Pode registrar devolução pelo caixa |

---

## Depende de / Interfere em

- **Embarque / Entregas** — as entregas do caixa vêm dos embarques criados para aquele motorista
- **Despesas** — são acessíveis também pela aba própria (`/caixa/despesas`)
- **Contas a Receber** — a baixa CA registra o recebimento na parcela correspondente
- **Conta Azul** — a baixa é enviada diretamente para o CA via API

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Caixa/CaixaDiarioPage.jsx` | Tela principal do caixa |
| `frontend/src/pages/Caixa/NovaDespesaModal.jsx` | Modal de nova despesa |
| `frontend/src/services/caixaService.js` | Chamadas de API do caixa |
| `backend/src/routes/caixa.js` | Rotas do backend |
