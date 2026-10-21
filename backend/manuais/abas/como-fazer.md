---
aba: Como Fazer
rota: /como-fazer
permissao: todos (confirmar treinamento e editar exigem permissões específicas)
---

# Como Fazer

## O que é

A biblioteca do "jeito certo" de fazer as coisas na empresa, pensada para quem não gosta de ler: cada coisa tem **foto, frase curta e um botão Ouvir** que lê em voz alta. Hoje está sendo usada na **Cozinha**. Os **setores** (Cozinha, Estoque, Expedição, Motorista e os que o RH criar) vêm do cadastro em Configurações → Setores: renomear muda o nome na hora, em todas as telas e no tablet. Existem quatro tipos de conteúdo:

- **Regra** (ex.: Higiene e uniforme): o que pode e o que não pode.
- **Máquina** (ex.: Fritadeira): como montar, como usar, como limpar e o que fazer quando dá problema.
- **Rotina** (ex.: Temperatura dos freezers): uma lista de conferência que a pessoa preenche em horários combinados.
- **Dosagem**: quanto de cada coisa usar, com a foto da medida.

---

## Como a equipe entra

**No tablet da cozinha** a pessoa toca na **própria foto** e digita a **senha de 4 números** (a mesma senha do ponto, desde que tenha exatamente 4 números). Depois de uns 2 minutos sem tocar na tela, o tablet volta sozinho para as fotos, para ninguém ficar logado no nome do outro.
- Errou o número 3 vezes? A tela pede para chamar o encarregado e espera um pouco antes de deixar tentar de novo.
- Se a foto da pessoa não aparece, é porque ela ainda não tem senha de 4 números (ou não tem setor) no cadastro do RH.
- Se aparecer "Este aparelho ainda não foi liberado", o tablet precisa ser liberado de novo pelo RH (veja o manual do Painel Como Fazer).

**No app (celular ou computador)**, quem tem login entra pelo menu **Como Fazer**, logo abaixo de Tarefas. Para treinar pelo app, o usuário precisa estar ligado a um cadastro de funcionário no RH. **Quem não tem ficha de funcionário (e não é da gestão do Como Fazer nem administrador) não vê conteúdo nenhum** — a tela avisa que o usuário ainda não está ligado a um funcionário; peça ao RH para fazer a ligação.

---

## A lista de conteúdos

- Quem **ainda não aprendeu** aparece primeiro, com selo amarelo "Você não treinou". Quem já sabe aparece com ✅.
- Cada cartão mostra o tipo, o código e a versão (ex.: HIG-001 · v3).
- Quando um conteúdo recebe versão nova que exige treinar de novo, ele volta para o amarelo.
- Na **Rotina**, o botão **Fazer agora** aparece quando chegou a hora de preencher.
- Só aparece o que vale para o seu setor e cargo.

---

## Treinar (Regra e Máquina)

1. Abra o conteúdo e veja os passos. Em cada passo tem a foto, a frase e o botão **Ouvir**.
2. No fim, toque em **Aprendi**. Isso fica registrado com o dia e a hora.
3. Regras e Máquinas pedem ainda a **confirmação do encarregado**: ele escolhe a própria foto e digita a senha de 4 números dele. Só quem tem a permissão de confirmar treinamento aparece na lista, e **ninguém confirma o próprio treinamento**.
4. Rotina e Dosagem não precisam de confirmação: basta "Li e entendi".

Enquanto a confirmação não é feita, o treinamento continua amarelo ("aguardando confirmação").

---

## Máquinas

A tela mostra o aviso de perigo (em vermelho, lido em voz alta), e quatro atalhos: **Montar, Usar, Limpar e Deu problema**. Em "Deu problema" a pessoa escolhe a situação e vê o que fazer. O botão **Chamar o encarregado** cria na hora uma tarefa para o encarregado da máquina (não manda WhatsApp). Só dá para chamar uma vez a cada 2 minutos, para não encher a agenda dele.

---

## Rotinas (lista de conferência)

- A rotina cria **tarefas na agenda** do encarregado nos horários combinados. No lugar de "Concluir", o botão da tarefa vira **Fazer agora** e abre a lista de conferência.
- A pessoa responde cada pergunta: um **número** (ex.: temperatura), **sim ou não**, ou uma **foto**. O botão **Pronto** só libera quando tudo que é obrigatório estiver respondido.
- Se uma resposta estiver **fora do esperado** (ex.: freezer mais quente que o limite, ou a porta que não fecha), o sistema marca como **desvio**, mostra o aviso na hora e cria uma tarefa para o encarregado. Quem decide o que é desvio é o sistema, não a pessoa.
- Ao terminar, a tarefa do horário é concluída para o encarregado e o alarme para de insistir.
- Se a internet falhar na hora de enviar, as respostas ficam na tela e dá para tentar de novo sem duplicar o registro.
- A rotina também pode ser feita direto no tablet pelo botão **Fazer agora** da lista.

---

## Permissões

| Permissão | O que libera |
|-----------|--------------|
| (nenhuma) | Ver e treinar nos conteúdos do seu setor, preencher rotinas |
| Pode_Confirmar_Treinamento | Aparecer na lista de encarregados e confirmar o treinamento dos colegas com a senha |
| Pode_Ver_Painel_Como_Fazer | Abrir o Painel Como Fazer (ver [rh-como-fazer-painel.md](rh-como-fazer-painel.md)) |
| Pode_Editar_Como_Fazer | Criar, editar, publicar conteúdos e liberar tablets |
| admin | Tudo acima |

As permissões são configuradas em Administração → Usuários → escudo (Acessos e Permissões) → seção "Como Fazer".
