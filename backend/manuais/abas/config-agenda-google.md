---
aba: Config — Agenda Google
rota: /config/agenda-google
permissao: configuracoes (ver); admin ou configuracoes.edit (alterar)
---

# Config — Agenda Google

## O que é

A tela que liga o sistema à agenda **"Produção"** do Google Agenda. Depois de ligada, **Kit Festa aprovado e Amostras aparecem sozinhos** na agenda, no dia certo, para a produção se organizar. Só quem é administrador ou tem permissão de editar Configurações consegue mexer aqui.

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

Manda para a agenda tudo que já existe e ainda vale: **Kit Festa aprovado**, **Amostras não entregues/não canceladas** e **Pedidos de entrega** (veja a regra abaixo), todos com data de hoje em diante. Pode clicar quantas vezes quiser — não duplica. A contagem mostra:
- **Criados** — eventos novos colocados na agenda agora;
- **Já existiam** — já estavam na agenda (apenas atualizados, se algo mudou);
- **Erros** — itens que não foi possível enviar (a lista curta mostra qual e o motivo). Se persistir, confira o status da conexão.

## O que acontece sozinho

- **Kit Festa:** ao ser **aprovado**, vira um evento no dia e hora do pedido (título com número, cliente, retirada/entrega e caixas; descrição com itens, telefone e endereço da entrega). Se for **recusado, cancelado ou excluído**, o evento é apagado.
- **Amostras:** ao ser **criada**, vira um evento no dia da entrega (título com AM#, cliente/lead e vendedor). Se for **cancelada ou excluída**, o evento é apagado.
- **Pedidos (delivery):** cada pedido de entrega vira um evento de **dia inteiro** na data de entrega (a data que o vendedor escolheu), com título `📦 Pedido #número · cliente · N un` (especial: `ZZ#`; bonificação: `🎁 Bonificação BN#`). A descrição traz os itens, telefone, endereço, vendedor e as **observações do pedido** (é lá que costuma estar o horário combinado, ex.: "entregar às 08:30").
  - **Entra quando a venda está firme:** pedido normal **faturado**; pedido **especial** e **bonificação** assim que são lançados (já têm número).
  - **Não entra:** pedido **cancelado**, com **devolução total**, de **cliente balcão** (retira na empresa) e os que vieram do **Kit Festa** (esses já têm o evento do Kit Festa).
  - O evento é **atualizado** se a data de entrega mudar e **apagado** ao cancelar, excluir ou fazer devolução total (devolução parcial não mexe; se a devolução total for revertida, o evento volta). Pedidos com data de entrega já passada não são criados.
  - Além dos avisos na hora, o sistema confere a cada ~10 minutos os pedidos alterados, para pegar qualquer mudança que escapou.
- Se o Google estiver fora do ar ou desconectado, o pedido/amostra **funciona normalmente** — só não aparece na agenda; use **Sincronizar agenda agora** depois.
- Pedidos Kit Festa ainda **aguardando aprovação** não vão para a agenda. Pedido normal ainda **não faturado** também não.
