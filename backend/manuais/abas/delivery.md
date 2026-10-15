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
- **Antes de mandar, o sistema mostra uma prévia** com exatamente o texto que vai sair, o nome e o telefone do cliente (indicando se é o celular ou o telefone fixo cadastrado) — dá pra conferir antes de confirmar o envio
  - Etapa **Pedido Criado**: a prévia mostra a mensagem "Recebemos seu pedido ✅" com o resumo do pedido — diferente das demais etapas, aqui dá pra mandar manualmente mesmo sem ter saído nada automático (a confirmação automática de pedido continua sendo a de sempre, fora do Delivery)
  - Se a prévia indicar que não é possível enviar (ver motivos abaixo), o botão de confirmar fica bloqueado e mostra o motivo
- Cada clique de confirmação gera uma mensagem NOVA (referência própria) — não é bloqueado como duplicata do envio automático nem de um reenvio anterior
- Se o cliente não tem celular cadastrado, o sistema tenta o telefone fixo antes de desistir
- O sistema avisa exatamente o que aconteceu, sem dar "reenviada" quando nada saiu de fato:
  - **"Mensagem reenviada"** — o WhatsApp saiu
  - **"Entrou na fila — será enviada em breve"** — o bot está temporariamente indisponível (limite de envios, instabilidade); a mensagem sai sozinha em minutos/horas
  - **"Cliente sem WhatsApp cadastrado (nem celular nem telefone)"** — não há para onde mandar
  - **"Cliente optou por não receber avisos"** — o cadastro do cliente está marcado para não receber
  - **"Card com WhatsApp silenciado"** — o sino desse pedido está desligado
  - Qualquer outro erro do bot aparece com o motivo relatado por ele
- **Importante:** a mensagem automática (disparada sozinha ao mover o card) continua sem enviar nada ao cliente na etapa "Pedido Criado" — a confirmação do pedido já saiu na criação. Isso só muda quando alguém aperta reenviar manualmente nessa etapa.
- O texto de "Taxa de entrega" (quando o pedido tem frete) aparece só nas mensagens de Delivery para o cliente — não é a mesma coisa que o "Frete" mostrado em outras telas do sistema.

### Imprimir etiquetas das caixas (Kit Festa)
Cada card tem um **ícone de impressora** (ao lado do ícone de WhatsApp). Clicar imprime, na impressora de etiquetas **Zebra TLP 2844** (rolo de 40 × 25 mm, 2 colunas), **1 etiqueta por caixa** com o nome do sabor em uma linha, o QR code da página do Kit Festa e, ao lado do QR, **PEDIDO / #número / quantidade de unidades**; e **a cada 4 caixas, 1 etiqueta do pedido** com número, cliente e ENTREGA/RETIRADA data · horário em destaque. As opções (a cada quantas caixas, tirar o "C/25-HF", rolo de 2 colunas) são as mesmas salvas na aba **Kit Festa** do Pedidos Online. Pedido que nasceu no site do Kit Festa sai com o horário e as unidades por caixa do site; pedido que não nasceu no site sai com a data de entrega, sem horário, e com a quantidade de cada item como número de caixas. Na janela de impressão: escolher a TLP 2844, margem 0, escala 100% (tamanho de papel do driver: 84 × 25 mm).

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

### Como liberar o Delivery para um usuário (passo a passo)

A liberação do Delivery **não fica no painel de permissões de Usuários** (Admin → Usuários). Ela é feita dentro do próprio Delivery, e só um administrador consegue:

1. Abrir **Delivery** no menu lateral.
2. Clicar no botão **Configurar** (ícone de engrenagem, no topo do Kanban — só aparece para administrador).
3. Abrir a aba **Permissões**. Aparece uma linha para cada usuário interno ativo.
4. Marcar **Pode ver** na linha do usuário → o Delivery passa a aparecer no menu dele.
5. Marcar as colunas das etapas que ele pode movimentar (**Pedido**, **Produção**, **Saindo**, **Entregue**). Sem nenhuma marcada, ele só vê os cards.
6. Clicar em **Salvar** na linha (o botão aparece quando há alteração).

O usuário liberado precisa **sair e entrar de novo** (ou atualizar a página) para o item Delivery aparecer no menu. Para tirar o acesso, desmarcar **Pode ver** e salvar.

Exemplo em uso: o usuário **Produção** foi liberado em 15/10/2026 para ver a tela e mover para Produção, Saindo e Entregue (não devolve card para Pedido).

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


## Pedido grande: mensagens em várias partes (novo — 10/2026)

Nas etapas **Em Produção** (cliente e número interno da equipe) e no reenvio de **Pedido Criado**, o resumo lista todos os itens. Quando o pedido é grande, a mensagem sai **dividida em partes numeradas** ("*(1/2)*", "*(2/2)*"), com o total e as observações perto do fim. A observação sai **sempre inteira** (nunca resumida): se for enorme, o rodapé vai em mensagem(ns) própria(s) e a observação é repartida entre elas sem partir palavras. **Saindo para Entrega** e **Entregue** são sempre uma mensagem curta. A prévia da mensagem na tela continua mostrando o texto completo numa só peça. O reenvio manual de pedido grande pode demorar alguns segundos a mais.
