---
aba: Delivery
rota: /delivery
permissao: delivery (view + etapas por permissão)
---

# Delivery

## O que é

Kanban de acompanhamento de pedidos de entrega (Kit Festa). Os pedidos faturados no Conta Azul são organizados em colunas (etapas) e avançados manualmente conforme o fluxo de produção e entrega. O sistema também envia mensagens automáticas via WhatsApp ao cliente quando o pedido avança de etapa.

> **Atenção:** apenas pedidos já **FATURADOS** no Conta Azul aparecem no Kanban e podem ser movidos entre etapas. Pedido **cancelado**, **excluído** ou com **devolução finalizada** nunca aparece aqui, mesmo que já tenha entrado no fluxo antes — some assim que qualquer uma dessas situações acontece (regra reforçada em 17/09/2026).

---

## O que dá pra fazer aqui

- Ver todos os pedidos de entrega organizados em 4 colunas: Pedido, Produção, Saindo e Entregue
- Mover um pedido de uma etapa para outra (apenas para frente, exceto retroceder com permissão)
- Buscar pedido por cliente ou número
- Filtrar por data de entrega
- Reenviar mensagem de WhatsApp manualmente para o cliente
- Silenciar o WhatsApp de um pedido específico (não envia mais notificações automáticas)
- Ver o detalhe do pedido clicando no card
- Atualização automática a cada 30 segundos

---

## Etapas do Kanban

| Etapa | Cor | Significado |
|-------|-----|-------------|
| PEDIDO | Azul | Pedido faturado, aguardando produção |
| PRODUCAO | Âmbar | Em produção / preparação |
| SAINDO | Roxo | Saiu para entrega |
| ENTREGUE | Verde | Entregue ao cliente |

---

## Como fazer (passo a passo real)

### Mover um pedido de etapa
1. Localize o card na coluna atual
2. Clique no botão de avançar (seta) no card
3. Selecione a etapa destino
4. O sistema verifica se o pedido está faturado no CA — se não estiver, bloqueia
5. Uma mensagem de WhatsApp é enviada automaticamente ao cliente (salvo se silenciado)

### Silenciar WhatsApp de um pedido
- Clique no ícone de sino no card do pedido
- O ícone muda para "silenciado" — nenhuma mensagem será mais enviada para esse pedido
- Clique novamente para reativar

### Reenviar mensagem manualmente
- Clique no ícone de mensagem no card
- Cada clique gera uma mensagem NOVA (referência própria) — não é bloqueado como duplicata do envio automático nem de um reenvio anterior
- Se o cliente não tem celular cadastrado, o sistema tenta o telefone fixo antes de desistir
- O sistema avisa exatamente o que aconteceu, sem dar "reenviada" quando nada saiu de fato:
  - **"Mensagem reenviada"** — o WhatsApp saiu
  - **"Entrou na fila — será enviada em breve"** — o bot está temporariamente indisponível (limite de envios, instabilidade); a mensagem sai sozinha em minutos/horas
  - **"Cliente sem WhatsApp cadastrado (nem celular nem telefone)"** — não há para onde mandar
  - **"Cliente optou por não receber avisos"** — o cadastro do cliente está marcado para não receber
  - **"Card com WhatsApp silenciado"** — o sino desse pedido está desligado
  - **"Nesta etapa não há mensagem de WhatsApp para o cliente..."** — na etapa "Pedido Criado" não existe mensagem própria (a confirmação já saiu na criação do pedido); reenviar aqui não faz nada
  - Qualquer outro erro do bot aparece com o motivo relatado por ele

### Buscar / filtrar
- Use a caixa de busca para encontrar por nome do cliente ou número do pedido
- Use o campo de data para filtrar pedidos com entrega em um dia específico

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `delivery` (view) | Ver o Kanban |
| `etapasPermitidas` (configurado no delivery) | Quais etapas o usuário pode movimentar |
| `admin` | Acesso total + botão de Configurar |

---

## Configuração do Delivery (`/delivery/config`)

A tela de configuração (admin) tem duas abas:
- **Categorias**: define quais categorias de produto (ou categorias comerciais) aparecem no Kanban. Apenas pedidos com itens dessas categorias entram no Delivery.
- **Permissões**: define quais usuários podem mover pedidos em quais etapas.

---

## Depende de / Interfere em

- **Pedidos** — somente pedidos FATURADOS no CA aparecem aqui
- **WhatsApp** — a movimentação de etapa dispara envio automático de mensagem
- **Config: Categorias de Produto** — determina quais pedidos entram no Kanban

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Delivery/DeliveryKanban.jsx` | Tela principal do Kanban |
| `frontend/src/pages/Delivery/DeliveryConfig.jsx` | Configurações de categorias e permissões |
| `frontend/src/services/deliveryService.js` | Chamadas de API do delivery |
| `backend/src/routes/delivery.js` | Rotas do backend |
