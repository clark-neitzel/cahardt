---
aba: Caixa Diário
rota: /caixa
permissao: Pode_Acessar_Caixa
---

# Caixa Diário

## O que é

Resumo financeiro diário do motorista/vendedor. Mostra tudo que aconteceu em um dia: entregas realizadas, valores recebidos por forma de pagamento, amostras entregues, despesas registradas, adiantamento e o total a prestar de contas. O admin usa para conferir e fechar o caixa de cada vendedor.

---

## O que dá pra fazer aqui

- Ver resumo do dia selecionado: total entregue, total recebido por forma de pagamento, adiantamento
- Selecionar data e vendedor (admin pode ver qualquer um; usuário comum vê sempre o próprio)
- Ver lista de entregas do dia com status de cada uma (PENDENTE, ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO)
- Registrar baixa de pagamento no Conta Azul — seleção individual ou em lote por checkbox
- Marcar entregas como "conferidas" (assinatura verificada pelo admin)
- Registrar uma nova despesa do dia (combustível, pedágio, hotel, manutenção, etc.)
- Ver amostras entregues no dia
- Ver atendimentos do dia
- Ver e editar KM inicial do veículo do dia
- Acessar ficha completa do veículo
- Fechar o caixa do dia (muda status para FECHADO)
- Imprimir relatório do caixa (`/caixa/impressao`)
- Conferir o caixa (admin: após revisão, marca como CONFERIDO)
- Reverter a conferência (admin: volta CONFERIDO → FECHADO)
- Reabrir o caixa (admin: volta FECHADO → ABERTO)
- Registrar devolução a partir de uma entrega do caixa

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
2. O caixa do dia é carregado automaticamente com a data e vendedor padrão
3. O resumo mostra: total a receber, recebido por forma de pagamento, adiantamento e saldo

### Ver caixa de outro dia ou vendedor
- **Outro dia:** use o seletor de data (só habilitado para `Pode_Ver_Historico_Caixa` ou `admin`; sem essa permissão, o campo fica bloqueado no dia atual)
- **Outro vendedor:** só visível para `admin` ou `Pode_Editar_Caixa`; escolha no select de vendedor

### Registrar baixa no Conta Azul (individual)
1. Na lista de entregas, localize a entrega com pagamento em Dinheiro, PIX ou Cartão
2. Marque o checkbox na coluna "CA" daquela entrega
3. Clique em **Processar selecionada(s)** — o sistema registra o recebimento no Conta Azul

### Registrar baixa em lote
1. Marque os checkboxes de várias entregas de uma vez
2. A barra azul "Baixa CA" aparece no topo da lista com o total selecionado
3. Clique em **Processar N selecionada(s)** — todas as baixas são enviadas ao CA de uma vez

### Registrar uma despesa
1. Clique em **+ Despesa** (botão no topo ou no card do veículo)
2. Escolha a categoria (combustível, pedágio, hotel, manutenção, outro)
3. Informe valor e descrição
4. Salve — a despesa é vinculada ao caixa do dia

### Definir adiantamento
1. No card de resumo, localize o campo **Adiantamento (R$)**
2. Digite o valor e clique em **Salvar** (visível para `Pode_Definir_Adiantamento` ou `admin`)
3. O adiantamento é descontado do total a prestar de contas

### Fechar o caixa
1. Verifique as pendências — se houver, o botão fica desabilitado e as pendências aparecem listadas
2. Clique em **Fechar Caixa** — o sistema pode alertar sobre entregas sem conferência de assinatura (mas não bloqueia)
3. Confirme — o status muda para FECHADO

### Imprimir relatório do caixa
1. Clique em **Imprimir** (disponível com o caixa FECHADO ou CONFERIDO)
2. O sistema navega para `/caixa/impressao?data=...&vendedorId=...`
3. A tela de impressão abre; imprima normalmente

### Conferir o caixa (admin)
1. Selecione o vendedor e o dia desejado
2. Revise as entregas, assinaturas e pagamentos
3. Adicione uma observação administrativa se necessário
4. Clique em **Conferir Caixa** — o status muda para CONFERIDO

### Reverter conferência (admin)
- Clique em **Reverter Conferência** no caixa com status CONFERIDO
- O status volta para FECHADO

### Reabrir caixa (admin)
- Clique em **Reabrir Caixa** no caixa com status FECHADO
- O status volta para ABERTO e os totais são recalculados ao fechar novamente

### Registrar devolução
- Na linha de uma entrega, clique no botão de devolução (ícone de retorno)
- O modal de devolução abre vinculado àquele pedido e àquele caixa

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Caixa` |
| Ver o próprio caixa | `Pode_Acessar_Caixa` (qualquer usuário com acesso) |
| Ver caixas de outros vendedores | `Pode_Editar_Caixa` ou `admin` |
| Ver caixas de outros dias | `Pode_Ver_Historico_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Registrar adiantamento | `Pode_Definir_Adiantamento` ou `Pode_Editar_Caixa` ou `admin` |
| Fechar caixa | `Pode_Fechar_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Registrar baixa no Conta Azul | `Pode_Baixar_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Conferir e reverter conferência | `Pode_Reverter_Caixa` ou `admin` (reverter); `admin` ou `Pode_Editar_Caixa` (conferir) |
| Reabrir caixa fechado | `Pode_Reverter_Caixa` ou `admin` |
| Registrar devolução | `Pode_Fazer_Devolucao` ou `admin` |

---

## Depende de / Interfere em

- **Embarque / Entregas** — as entregas do caixa vêm dos embarques criados para aquele motorista
- **Despesas** — são acessíveis também pela aba própria (`/despesas`)
- **Contas a Receber** — a baixa CA registra o recebimento na parcela correspondente no Conta Azul
- **Conta Azul** — a baixa é enviada diretamente para o CA via API
- **Veículos** — o KM inicial e a ficha do veículo do dia são acessíveis dentro do caixa

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Caixa/CaixaDiarioPage.jsx` | Tela principal do caixa com todos os fluxos |
| `frontend/src/pages/Caixa/NovaDespesaModal.jsx` | Modal de nova despesa |
| `frontend/src/pages/Pedidos/ModalDevolucao.jsx` | Modal de devolução acessível pelo caixa |
| `frontend/src/pages/Veiculos/VeiculoFicha.jsx` | Ficha do veículo embutida no caixa |
| `frontend/src/services/caixaService.js` | Chamadas de API do caixa |
| `backend/src/routes/caixa.js` | Rotas do backend |
