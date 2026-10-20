---
aba: Painel Como Fazer
rota: /rh/como-fazer
permissao: Pode_Ver_Painel_Como_Fazer (editar exige Pode_Editar_Como_Fazer)
---

# Painel Como Fazer

## O que é

A tela da gestão para acompanhar o **Como Fazer**: quem já foi treinado, quais rotinas foram feitas ou deram problema, e onde se cria e publica o conteúdo. Fica no grupo **RH** do menu.

---

## Abas

**Treinamentos** — quadro com uma linha por funcionário do setor e uma coluna por conteúdo publicado:
- ✅ treinado, 🟡 falta aprender ou aguardando a confirmação do encarregado, ⏳ treinamento vencendo.
- Indicadores no topo: treinamentos faltando e rotinas com desvio.
- Selo **novo** para quem entrou nos últimos 30 dias, e avisos "sem usuário" (a pessoa não tem login no app) e "sem senha de 4 números" (não consegue entrar no tablet), com atalho para a ficha do funcionário.
- Botão **Lembrar**: cria uma tarefa de aviso para o usuário daquela pessoa. Se ela não tem usuário no app, o sistema avisa para lembrar pelo tablet.
- A tela também avisa quem está **sem setor** e os encarregados que **não têm funcionário ligado** (sem isso eles não conseguem confirmar treinamento no tablet).

**Rotinas** — as respostas das listas de conferência, por período, com filtro de situação: **Desvio**, **Não feita** e **OK**. Mostra quem fez, quando, o que ficou fora do esperado e as fotos. Uma rotina é "não feita" quando o horário passou (com uma tolerância de 1 hora no dia de hoje) e ninguém preencheu.

**Conteúdos** — lista de tudo que existe (com código, versão atual, se tem rascunho e quantos passos estão sem foto). Quem tem permissão de editar cria e edita aqui; sem a permissão a aba é só de leitura.

**Aparelhos** — libera o tablet de cada setor (veja abaixo).

---

## Criar e publicar um conteúdo

1. **Novo conteúdo**: escolha o tipo, o título, o setor e (para Rotina) os horários, a repetição e o **encarregado** que recebe os avisos.
2. Monte os passos: foto, frase curta (até 140 letras), detalhe opcional, marca de perigo. Dá para preencher também "Para que serve", "O que precisa", "O que NÃO fazer" e a tabela "Se der errado". Nas Rotinas, cada passo pode ter uma pergunta (número com mínimo e máximo, sim/não ou foto). Nas Dosagens, a lista de itens com foto da medida.
3. O que você escreve é salvo como **rascunho** e nenhum tablet vê o rascunho.
4. **Publicar**: o sistema confere o que falta (frase vazia, rotina sem pergunta, rotina com horário sem encarregado, máquina sem passos em Montar/Usar/Limpar) e só publica se estiver tudo certo. Passos sem foto não impedem a publicação, só aparecem como aviso.
5. Ao publicar, **todo mundo precisa treinar de novo**. Se foi só uma correção de texto, marque a opção "foi só correção de texto, ninguém precisa treinar de novo".
6. Publicar uma Rotina cria as tarefas na agenda do encarregado; trocar o horário ou o encarregado atualiza a agenda sozinho (as tarefas antigas são desativadas, não apagadas). Se a agenda der erro, aparece o botão **Refazer agenda**.
7. **Arquivar** tira o conteúdo dos tablets e desativa as tarefas da rotina.

---

## Liberar o tablet (aba Aparelhos)

O tablet só mostra as fotos da equipe depois de ser liberado, para o nome e a foto dos funcionários não ficarem abertos para qualquer pessoa na internet.
1. Na aba **Aparelhos**, toque em **Liberar** no setor. O sistema mostra um **link**, uma única vez.
2. Abra esse link no tablet. Ele guarda a liberação e passa a mostrar a grade de fotos.
3. Gerar o link de novo **desliga o tablet anterior** do mesmo setor. Se o setor for **desativado** em Configurações → Setores, o tablet dele sai do ar ("setor desativado") até ser reativado; renomear o setor não desliga o tablet. Se o tablet mostrar "aparelho não liberado", gere um link novo.

---

## Cadastro do funcionário (RH)

Na ficha do funcionário (RH → Funcionários) ficam os dados que o tablet usa:
- **Setor** (a lista vem de Configurações → Setores; setor desativado não aparece para escolher);
- **Foto** (aparece na grade do tablet);
- **Senha**: para entrar no tablet, precisa ser de **exatamente 4 números**. Senhas antigas com letras continuam servindo para o ponto, mas a pessoa não aparece no tablet até o RH definir uma senha de 4 números.

---

## Relatório para a Vigilância

Botão que monta uma folha para imprimir com o conteúdo, a versão publicada, a lista de quem foi treinado (data, quem confirmou, versão) e as execuções do período.

---

## Permissões

| Permissão | O que libera |
|-----------|--------------|
| Pode_Ver_Painel_Como_Fazer | Ver o painel, os quadros e o relatório |
| Pode_Editar_Como_Fazer | Criar, editar, publicar, arquivar, liberar tablets e usar o botão Lembrar |
| Pode_Confirmar_Treinamento | Confirmar treinamentos no tablet (não abre o painel) |
| admin | Tudo |
