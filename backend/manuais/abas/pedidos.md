---
aba: Pedidos
rota: /pedidos
permissao: pedidos (view)
---

# Pedidos

## O que é

Central de consulta e gerenciamento de todos os pedidos lançados no sistema. Aqui você vê, filtra, imprime e acompanha o ciclo de vida de cada pedido — desde que foi criado até o faturamento no Conta Azul.

> **Atenção:** criar um pedido novo **não começa aqui**. Começa na aba **Rota**, no card do cliente, clicando em "Novo Pedido". Esta tela é de gestão, não de criação.

---

## O que dá pra fazer aqui

- Visualizar todos os pedidos (Normal, Especial, Bonificação, Amostras, Devoluções)
- Filtrar por data de entrega, data de criação, vencimento, embarque, motorista e vendedor
- Buscar por cliente, cidade, número do pedido ou valor total
- Filtrar rapidamente por status (Aberto, Enviar, Sincronizando, Aprovado, Faturado, Erro)
- Ver pendências de envio ao Conta Azul em tempo real
- Imprimir pedido individual ou vários ao mesmo tempo (seleção em lote)
- Enviar comprovante do pedido via WhatsApp para o cliente
- Aprovar ou reverter pedidos Especiais e Bonificações (quem tem permissão)
- Consultar situação atualizada no Conta Azul (botão de sync individual)
- Buscar links de cobrança (PIX/Boleto) gerados no Conta Azul
- Reatribuir pedido para outro vendedor (quem tem permissão)
- Excluir pedidos (quem tem permissão específica por tipo)
- Avançar status de amostras (Solicitada → Preparação → Liberado)

---

## Como fazer (passo a passo real)

### Criar um pedido novo
1. Vá para a aba **Rota**
2. Localize o card do cliente desejado
3. Clique em **"Novo Pedido"** no card
4. O sistema abre `/pedidos/novo?clienteId=...` (tela `NovoPedido`)
5. Escolha o **tipo** (Pedido Normal, Especial ou Bonificação)
6. Selecione a **condição de pagamento** e a **data de entrega**
7. Adicione os produtos e quantidades
8. Clique em **Salvar** — o pedido é criado com status **ABERTO**

### Enviar pedido ao Conta Azul
- Pedidos com status **ABERTO** precisam ser marcados como **ENVIAR** (ou isso ocorre automaticamente via sincronização)
- Ao sincronizar (`/admin/sync`), pedidos com status ENVIAR são enviados ao CA
- Após o envio, o status muda para **RECEBIDO**

### Acompanhar pedidos pendentes
- O painel no topo da lista mostra alertas coloridos: quantos pedidos estão em **Enviar**, **Aprovados** e **Erro**
- Clique no alerta para ir direto àquele grupo

### Imprimir pedidos
- Para um pedido: clique no ícone de impressora ao lado do pedido → abre a tela de impressão
- Para vários: marque os pedidos com status **FATURADO** usando o checkbox (ou clique "Selecionar faturados") → clique **Imprimir N**

### Aprovar Pedido Especial ou Bonificação
1. Vá para a sub-aba **Especiais** ou **Bonificação**
2. Localize o pedido com status **ABERTO**
3. Clique em **Aprovar** (botão verde) — exige permissão `Pode_Aprovar_Especial` ou `Pode_Aprovar_Bonificacao`
4. O status muda para RECEBIDO e é faturado no CA

### Consultar situação no Conta Azul
- Clique no botão com ícone de reload (🔄) ao lado do pedido que já tem `idVendaContaAzul`
- O sistema consulta o CA e atualiza `situacaoCA` e `statusEnvio`

### Ver link de cobrança (PIX/Boleto)
- Clique no ícone de cifrão (💲) ao lado do pedido faturado
- O sistema busca as cobranças ativas no CA e exibe os links
- Há botão **Copiar** para copiar todos os links formatados

---

## Tipos de pedido

| Tipo | Prefixo | Descrição |
|------|---------|-----------|
| Normal | `#123` | Pedido padrão de venda |
| Especial | `ZZ#123` | Condições diferenciadas; requer aprovação |
| Bonificação | `BN#123` | Produto grátis/bonificado; requer aprovação |
| Encaixe | `#123` (flag) | Pedido urgente encaixado na rota |
| Amostra | `AM#123` | Produto enviado como amostra; sub-aba própria |
| Devolução | — | Sub-aba própria; visível para quem tem `Pode_Fazer_Devolucao` |

---

## Status do pedido

| Status | Significado |
|--------|-------------|
| ABERTO | Criado, ainda não enviado ao CA |
| ENVIAR | Marcado para envio na próxima sincronização |
| SINCRONIZANDO | Sendo processado pelo worker de sync |
| RECEBIDO | Enviado e aceito pelo CA |
| ERRO | Falha no envio; o motivo aparece em vermelho |
| FATURADO | Confirmado/faturado pelo CA |

---

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver a aba | `pedidos` (view) |
| Aprovar Especial | `Pode_Aprovar_Especial` ou admin |
| Reverter Especial | `Pode_Reverter_Especial` ou admin |
| Aprovar Bonificação | `Pode_Aprovar_Bonificacao` ou admin |
| Reverter Bonificação | `Pode_Reverter_Bonificacao` ou admin |
| Excluir pedido normal | `Pode_Excluir_Pedido` ou admin |
| Excluir pedido especial | `Pode_Excluir_Especial` ou admin |
| Excluir bonificação | `Pode_Excluir_Bonificacao` ou admin |
| Excluir amostra | `Pode_Excluir_Amostra` ou admin |
| Ver pedidos de todos os vendedores | `pedidos.clientes = "todos"` ou admin |
| Reatribuir vendedor | `Pode_Reatribuir_Vendedor` ou admin |
| Ver sub-aba Devoluções | `Pode_Fazer_Devolucao` ou admin |

---

## Depende de / Interfere em

- **Rota** — é onde pedidos novos são criados (botão "Novo Pedido" no card do cliente)
- **Conta Azul** — pedidos são enviados ao CA via sincronização; a situação volta para o app (`FATURADO`, `APROVADO`)
- **Embarque** — pedidos faturados são adicionados a embarques na aba Embarque
- **Entregas** — após o embarque, o status de entrega aparece no card do pedido
- **Contas a Receber** — faturamento no CA gera contas a receber; reverter especial cancela a conta no CA
- **Sincronizar** (`/admin/sync`) — executa o envio em lote dos pedidos ao CA

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Pedidos/ListaPedidos.jsx` | Tela principal da aba (listagem, filtros, ações) |
| `frontend/src/pages/Pedidos/NovoPedido.jsx` | Formulário de criação/edição de pedido |
| `frontend/src/pages/Pedidos/ImpressaoPedido.jsx` | Tela de impressão de 1 ou N pedidos |
| `frontend/src/pages/Pedidos/ListaDevolucoes.jsx` | Sub-aba de devoluções |
| `frontend/src/services/pedidoService.js` | Chamadas de API para pedidos |
| `frontend/src/services/amostraService.js` | Chamadas de API para amostras |
| `backend/src/routes/pedidos.js` | Rotas do backend para pedidos |
