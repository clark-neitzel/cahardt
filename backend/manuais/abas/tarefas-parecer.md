---
aba: Tarefas — Parecer do Dia
rota: /tarefas/parecer
permissao: Pode_Ver_Parecer_Tarefas (ou admin)
---

# Tarefas — Parecer do Dia

## O que é

Relatório diário de cumprimento das tarefas da equipe, para o administrador (ou quem tiver a permissão). Mostra, por funcionário, o que foi concluído no horário, com atraso, o que não foi feito e quantas vezes cada alerta foi adiado ("lembrar em 5 min").

---

## O que dá pra fazer aqui

- Escolher qualquer dia (passado ou atual) no seletor de data
- Ver os totais do dia: tarefas, concluídas no horário, com atraso e não concluídas
- Expandir cada funcionário para ver tarefa por tarefa: horário previsto, quem criou, situação e horário real da conclusão
- Ver quantas vezes o funcionário adiou o alerta de cada tarefa
- **Imprimir** o parecer (folha A4, funciona no iPad)

---

## Como a situação é calculada

| Situação | Regra |
|----------|-------|
| ✓ No horário | Concluída até 15 minutos depois do horário do alerta |
| ✓ Com atraso | Concluída mais de 15 minutos depois do horário |
| ✗ Não concluída | O horário passou e ninguém concluiu |
| Aguardando horário | O horário da tarefa ainda não chegou (só no dia de hoje) |

---

## Permissões

- **Pode_Ver_Parecer_Tarefas** (ou admin): acessa esta tela. Configurável em Administração → Usuários → Acessos e Permissões → "Tarefas da Equipe".
