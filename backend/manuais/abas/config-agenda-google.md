---
aba: Config — Agenda Google
rota: /config/agenda-google
permissao: configuracoes (ver); admin ou configuracoes.edit (alterar)
---

# Config — Agenda Google

## O que é

A tela que liga o sistema à agenda **"Produção"** do Google Agenda. Depois de ligada, **os pedidos do quadro Delivery (com a etapa no título), o Kit Festa do site e as Amostras (desde a solicitação) aparecem sozinhos** na agenda, no dia certo, para a produção se organizar. Só quem é administrador ou tem permissão de editar Configurações consegue mexer aqui.

## Status da conexão

Mostra se o sistema está **conectado** (e o nome da agenda) ou **não conectado**, com o motivo:
- **Google ainda não conectado** — falta autorizar. Clique em **Reautorizar Google**.
- **Sem cliente web cadastrado** — falta uma configuração técnica feita uma única vez pelo suporte; sem ela o botão Reautorizar não funciona. Avise o suporte.
- **Falta o ID da agenda** — preencha o campo abaixo e salve.
- **Agenda não encontrada** — o ID está errado ou a agenda não pertence à conta autorizada; confira o ID.
- **Sem permissão para a agenda** — o Google ainda não liberou o acesso à agenda; clique em **Reautorizar Google**.
- **Erro / não foi possível verificar** — falha momentânea na consulta; tente de novo em instantes.

## ID da agenda

Campo onde se informa qual agenda usar. Para achar: no **Google Agenda** (computador), passe o mouse na agenda "Produção" → ⋮ → **Configurações e compartilhamento** → role até **Integrar agenda** → copie o **ID da agenda** (termina em `@group.calendar.google.com`). Cole e salve. Sem esse ID, nada é enviado.

## Reautorizar Google

Abre a tela de login do Google para a conta dona da agenda. Entre, aceite as permissões (Drive e Agenda) e o Google devolve você ao sistema (página `/google-oauth-callback`), que conclui a conexão sozinho. Ao terminar, o sistema já **envia para a agenda o que estava aprovado/em aberto** antes da conexão. O salvamento de XML e os backups no Drive continuam funcionando normalmente (passam a usar a mesma conexão).

## Sincronizar agenda agora

Manda para a agenda tudo que já existe e ainda vale: **pedidos do quadro Delivery** (em andamento, ou com data de hoje em diante), **Kit Festa aprovado** e **Amostras** (desde a solicitação, data de hoje em diante). Também **limpa a agenda**: apaga eventos de pedidos que não estão mais no quadro Delivery e de amostras canceladas. Pode clicar quantas vezes quiser — não duplica. A contagem mostra:
- **Criados** — eventos novos colocados na agenda agora;
- **Já existiam** — já estavam na agenda;
- **Removidos** — eventos apagados da agenda na limpeza;
- **Erros** — itens que não foi possível enviar (a lista curta mostra qual e o motivo). Se persistir, confira o status da conexão.

## O que acontece sozinho

- **Kit Festa:** ao ser **aprovado**, vira um evento no dia e hora do pedido. O título termina com o **status da aba Delivery**, que acompanha o Kanban: **A produzir** (etapa Pedido), **Em produção**, **Saiu para entrega**, **Entregue**; logo que vira pedido já aparece **A produzir**; **Aprovado** só enquanto ainda não virou pedido. Ex.: `🎉 Kit Festa #35 · Maria · Retirada 14:30 · 3 caixas · Em produção`. Ao mover o cartão no Delivery, o evento é atualizado na hora. A descrição tem o status, itens, telefone e endereço da entrega. Se for **recusado, cancelado, excluído** ou se o pedido vinculado for **cancelado** ou **excluído**, o evento é apagado.
- **Amostras:** entram na agenda **já na solicitação** e o evento acompanha o status: o título termina com **Solicitada**, **Em preparação**, **Liberada** ou **Entregue**. Amostra **cancelada**, sem data de entrega ou excluída sai da agenda.
- **Regra do horário (pedidos e Kit Festa do site):** quando há horário de entrega, o evento **termina na hora da entrega** e começa antes: **20 min fixos de preparo + 1,5 min por unidade** (soma das quantidades dos itens, arredondado para cima). Ex.: entrega 14:00, 12 un → 13:22–14:00; 10 min de itens → 13:30–14:00. O início é a hora de **começar a produzir** (a descrição traz `Entrega: 14:00 · Começar a produzir: 13:22`). Se o início cairia antes de 00:00, trava em 00:00. **Sem horário** continua evento de **dia inteiro** (`Entrega: dia inteiro`). Para o Kit Festa do site, o horário escolhido pelo cliente é o **fim** do evento (antes era o início, com 1 h). Amostras não mudam.
- **Pedidos do quadro Delivery:** é o mesmo critério da aba Delivery (faturado, com item de categoria de delivery ativa). Título `📦 Pedido #3969 · Cliente · 12 un · A produzir` (com horário: `… · 12 un · 14:00 · A produzir`) (`🎁 Bonificação BN#…`, `ZZ#…` para especial), no dia do pedido, com a etapa do quadro. Mudar a etapa só **troca o status** (Entregue também: o evento fica). O evento só sai se o pedido for **cancelado, excluído ou tiver devolução finalizada**. Pedido do site Kit Festa não duplica: vale o evento do Kit Festa. Pedido faturado que não tem item de delivery **não** entra. Uma conferência automática roda a cada 10 min.
- Se o Google estiver fora do ar ou desconectado, o pedido/amostra **funciona normalmente** — só não aparece na agenda; use **Sincronizar agenda agora** depois.
- Pedidos Kit Festa ainda **aguardando aprovação** não vão para a agenda.
