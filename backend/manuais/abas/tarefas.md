---
aba: Tarefas da Equipe
rota: /tarefas
permissao: todos (funções extras exigem permissões específicas)
---

# Tarefas da Equipe

## O que é

Agenda de tarefas com alerta sonoro, estilo Google Agenda, para toda a equipe. Cada tarefa tem data e horário; quando o horário chega, um pop-up com som aparece por cima de qualquer tela do sistema para o responsável, e insiste a cada 5 minutos até a tarefa ser concluída (a não ser que a opção "insistir" esteja desligada na tarefa). É o primeiro item do menu lateral.

---

## O que dá pra fazer aqui

- Ver a própria agenda em três visões: **Semana** (grade tipo Google Agenda, só desktop), **Dia** e **Lista** (próximos 30 dias)
- Criar tarefa para si mesmo (todos podem)
- Criar tarefa para colegas — exige a permissão **Pode criar tarefas para outros**; escolhendo várias pessoas, cada uma recebe a própria cópia da tarefa
- Ao **editar** também dá para escolher várias pessoas: a tarefa continua com uma delas e as demais recebem uma cópia (com os anexos); cada pessoa conclui a sua
- Ver a agenda de um colega ou de toda a equipe — exige **Pode ver a agenda dos colegas** (ou admin)
- Marcar tarefa como **concluída** (pelo pop-up ou abrindo a tarefa na agenda)
- Editar/excluir tarefa — só quem criou (ou o admin)
- Anexar **material de ajuda**: links, imagens (JPG/PNG/WebP) e PDF — as imagens aparecem como **miniatura** no alerta e no detalhe da tarefa (tocar amplia na própria tela, sem sair do app); PDFs aparecem como cartão "toque para abrir"
- Repetição: não repete, todo dia, dias úteis (seg a sex), **dias da semana escolhidos** (ex.: seg/qua/sex — botões de Dom a Sáb no formulário), toda semana ou todo mês — com data final opcional
- Clicar num horário vazio da grade semanal cria tarefa já naquele dia/hora
- Abrir o **Parecer do dia** (botão no topo) — exige **Pode ver o parecer do dia**

---

## Como funciona o alerta (pop-up)

- No horário da tarefa, aparece um pop-up com som (3 toques curtos) por cima de qualquer tela, para o responsável
- **Concluir tarefa** → registra o horário da conclusão e o aviso não volta mais
- **Lembrar em 5 min** (ou fechar no X) → o aviso some e volta sozinho em 5 minutos; cada adiamento fica registrado e aparece no parecer
- Se **outra tarefa** chegar no horário, o aviso da nova toma o lugar; as anteriores continuam pendentes (contador no rodapé do pop-up e sino na agenda)
- Tarefa com "insistir" **desligado** avisa uma vez só
- O alerta funciona com o app aberto (em qualquer tela); ao abrir o app, tarefas do dia que já venceram e não foram concluídas tocam na hora

---

## Cores na agenda

| Cor | Significado |
|-----|-------------|
| Verde-claro (mint) | Tarefa criada pela própria pessoa |
| Verde-escuro com 🔒 | Tarefa criada pelo Admin — só ele edita/exclui; o responsável apenas conclui |
| Borda dourada | Tarefa criada por um colega — quem criou (e o admin) edita/exclui |
| Piscando | Tarefa cujo horário chegou e ainda não foi concluída |

---

## Quem pode editar/excluir

| Situação | Quem edita/exclui |
|----------|-------------------|
| Tarefa criada pelo Admin | Só o Admin (responsável apenas conclui) |
| Tarefa criada pelo próprio funcionário | Ele mesmo e o Admin |
| Tarefa criada por um colega | Quem criou e o Admin |

Excluir uma tarefa recorrente apaga **todas** as repetições.

---

## Permissões

| Permissão | O que libera |
|-----------|--------------|
| (nenhuma) | Ver a aba, criar tarefas para si, concluir as próprias |
| Pode_Criar_Tarefas_Para_Outros | Escolher outros responsáveis ao criar tarefa |
| Pode_Ver_Agenda_Colegas | Filtro de agenda por colega / toda a equipe (somente leitura) |
| Pode_Ver_Parecer_Tarefas | Acessar o Parecer do dia (/tarefas/parecer) |
| admin | Tudo acima + editar/excluir qualquer tarefa |

As permissões são configuradas em Administração → Vendedores → escudo (Acessos e Permissões) → seção "Tarefas da Equipe".
