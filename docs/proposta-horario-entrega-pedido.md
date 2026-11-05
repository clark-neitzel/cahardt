# Proposta — Horário de entrega no pedido (05/11/2026)

**Pedido do dono:** na agenda Produção o pedido do Delivery entra como "dia inteiro". Ter um horário de entrega
opcional no pedido; quem quiser preenche, e isso vira o padrão para a agenda.

**Preview (computador e celular):** `docs/proposta-horario-entrega-pedido.html`

## O que já existe
- `Pedido.dataVenda` = data de entrega (sem hora; gravada às 12:00Z).
- Kit Festa do site já tem `horario` ('08:30') e o evento na agenda sai com hora (1h de duração).
- Hoje o horário aparece escondido em observações ("ENCAIXE DE ENTREGA / entregar as 08:30"), onde ninguém lê.
- `googleCalendarService.quandoEvento(dataYmd, horario)` já sabe montar evento com hora ou dia inteiro.

## Proposta
1. **Campo novo no pedido:** `horaEntrega` (texto "HH:MM", opcional). Nada é removido do schema.
2. **Onde preenche:**
   - Tela Novo Pedido / Editar: campo "Horário (opcional)" ao lado da data de entrega, com os atalhos 08:00 · 10:00 · 14:00 · 16:00 e hora livre. Sem trava: vazio continua valendo.
   - Quadro Delivery: ícone de relógio no cartão abre o mesmo campo (para a expedição acertar sem abrir o pedido).
   - Kit Festa do site convertido em pedido copia o `horario` do site para `horaEntrega` automaticamente.
3. **Onde aparece:**
   - Agenda Google: evento com hora (duração 1h, igual Kit Festa) em vez de dia inteiro; sem hora, continua dia inteiro.
   - Cartão do Delivery: pílula "06/11 · Amanhã · 08:30"; dentro do dia, cartões ordenados pelo horário (sem horário vão para o fim).
   - Impressão do pedido / romaneio: "Entrega: 06/11 08:30".
   - Lista de Pedidos (coluna Entrega) e detalhe do pedido.
4. **Regras:** só informativo (não bloqueia aprovação nem faturamento); formato validado; mudar o horário atualiza o evento na agenda na hora (gancho já existe para data/etapa).
5. **Opcional:** ao editar um pedido antigo cuja observação tem "às 08:30"/"as 8:30", sugerir "Usar 08:30 como horário?". Observações antigas não são convertidas sozinhas.

## Arquivos (porte médio, ~2 h da equipe)
- `backend/prisma/schema.prisma` (+1 campo) · `pedidoService.criar/editar` (aceitar/validar) · `kitFestaService` (copiar `horario` na conversão)
- `googleCalendarService.montarPedidoDelivery` (passar `horario`) · `deliveryService.listarPedidos` (ordem por hora)
- `NovoPedido.jsx` (campo) · `DeliveryKanban.jsx` (pílula + relógio) · `ImpressaoPedido.jsx` · `ListaPedidos.jsx`
- API da IA (`/api/ia-consulta/v1`): só ADICIONA `horaEntrega` na resposta e aceita no criar pedido (compatível).
- Manuais: pedidos.md, delivery.md, config-agenda-google.md · novidade + novidades.json

## Decisões que preciso do dono
1. Duração do evento com hora: 1 hora (igual Kit Festa) ou 30 min?
2. Quem preenche: qualquer vendedor no pedido, ou só escritório/expedição (no quadro)?
3. Atalhos de hora: 08:00 · 10:00 · 14:00 · 16:00 servem, ou prefere outros?

## Decisões do dono (05/11, tarde) — APROVADO
- Campo disponível em **todos** os pedidos (inclusive pela aba Atendimentos); opcional; importante para Kit Festa lançado pelo escritório.
- **Duração do evento varia com o pedido:** 20 min fixos de preparo + 1,5 min por unidade. O evento **termina na hora da entrega** e começa antes: entrega 14:00 com pedido de 10 min → 13:30–14:00 (o início é a hora de começar a produzir).
- Suposição assumida: "item" = unidade (soma das quantidades). Constantes em um lugar só (`PREPARO_MIN = 20`, `MIN_POR_UNIDADE = 1.5`).
- Mesma regra para o Kit Festa do site (horário escolhido pelo cliente = fim do evento).
