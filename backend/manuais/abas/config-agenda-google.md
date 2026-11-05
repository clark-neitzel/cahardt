---
aba: Config — Agenda Google
rota: /config/agenda-google
permissao: configuracoes (ver); admin ou configuracoes.edit (alterar)
---

# Config — Agenda Google

## O que é

A tela que liga o sistema à agenda **"Produção"** do Google Agenda. Depois de ligada, **Kit Festa (com o status da aba Delivery) e Amostras (desde a solicitação) aparecem sozinhos** na agenda, no dia certo, para a produção se organizar. Só quem é administrador ou tem permissão de editar Configurações consegue mexer aqui.

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

Manda para a agenda tudo que já existe e ainda vale: **Kit Festa aprovado** e **Amostras** (desde a solicitação), todos com data de hoje em diante. Também **limpa a agenda**: apaga eventos de pedidos de entrega que foram enviados por engano numa versão anterior e de amostras canceladas. Pode clicar quantas vezes quiser — não duplica. A contagem mostra:
- **Criados** — eventos novos colocados na agenda agora;
- **Já existiam** — já estavam na agenda;
- **Removidos** — eventos apagados da agenda na limpeza;
- **Erros** — itens que não foi possível enviar (a lista curta mostra qual e o motivo). Se persistir, confira o status da conexão.

## O que acontece sozinho

- **Kit Festa:** ao ser **aprovado**, vira um evento no dia e hora do pedido. O título termina com o **status da aba Delivery**, que acompanha o Kanban: **A produzir** (etapa Pedido), **Em produção**, **Saiu para entrega**, **Entregue**; logo que vira pedido já aparece **A produzir**; **Aprovado** só enquanto ainda não virou pedido. Ex.: `🎉 Kit Festa #35 · Maria · Retirada 14:30 · 3 caixas · Em produção`. Ao mover o cartão no Delivery, o evento é atualizado na hora. A descrição tem o status, itens, telefone e endereço da entrega. Se for **recusado, cancelado, excluído** ou se o pedido vinculado for **cancelado** ou **excluído**, o evento é apagado.
- **Amostras:** entram na agenda **já na solicitação** e o evento acompanha o status: o título termina com **Solicitada**, **Em preparação**, **Liberada** ou **Entregue**. Amostra **cancelada**, sem data de entrega ou excluída sai da agenda.
- **Pedidos de entrega comuns NÃO vão para a agenda** — só Kit Festa e amostras.
- Se o Google estiver fora do ar ou desconectado, o pedido/amostra **funciona normalmente** — só não aparece na agenda; use **Sincronizar agenda agora** depois.
- Pedidos Kit Festa ainda **aguardando aprovação** não vão para a agenda.
