# Pendências de WhatsApp (clientes)

**Onde fica:** Clientes → botão "💬 Pendências de WhatsApp" (rota `/clientes/pendencias-whatsapp`). Visível para quem pode cadastrar clientes (permissão **Clientes — editar** ou admin).

**Para que serve:** mostrar, vendedor por vendedor, quais clientes estão **sem o WhatsApp no cadastro** — e cobrar o preenchimento. É o número do campo **Telefone Celular** do cadastro do cliente: é por ele que sai a confirmação do pedido, o boleto/PIX e a cobrança. Quando o vendedor falta, é o único jeito de o escritório falar com a carteira dele.

## O que a tela mostra

1. **Placar (cartões de KPI)** — quatro cartões, mais um quinto quando o selo já está disponível:
   - **Sem número** — cadastro sem número de WhatsApp em formato aproveitável (10 ou 11 dígitos com DDD) e sem justificativa dentro da validade.
   - **Dispensados** — sem número, mas com justificativa registrada e ainda válida (60 dias).
   - **Com problema** — o WhatsApp da empresa já tentou mandar mensagem e o número foi recusado.
   - **Verificados** — números para os quais o WhatsApp respondeu que **existe uma conta**. Diz que o número tem WhatsApp; **não** diz que o número é do cliente.
   - **Em uso** — quantos clientes estão com o **selo verde**: já saiu mensagem do sistema para o número deles nos últimos 180 dias. É o placar que mostra se o selo está funcionando.

   O número de cada cartão fica **cinza quando é zero** e ganha cor quando há algo a resolver (vermelho em "Sem número" e "Com problema", âmbar em "Dispensados", verde em "Verificados" e "Em uso").
2. **Total de clientes ativos:** não é um cartão do placar — é a **pílula azul** logo abaixo dele, escrita **"⟨total⟩ clientes ativos"**. Ao lado dela aparece a pílula cinza **"⟨n⟩ filtros ativos · limpar"** quando algum filtro está aplicado.
3. **Linha cinza pequena entre o placar e a pílula azul** (só aparece depois que o selo passa a ser calculado). Traz duas informações emendadas na mesma frase:
   - **"Selo atualizado hoje às ⟨hora:minuto:segundo⟩."** — quando a **conta do selo rodou** pela última vez, tenha ela mudado o selo de alguém ou não. Se a última conta não foi de hoje, a frase vira **"Selo atualizado ontem às ⟨hora⟩"** ou **"Selo atualizado em ⟨dd/mm/aaaa⟩ às ⟨hora⟩"**. A hora vem **com os segundos de propósito**: é o que faz o carimbo **mudar visivelmente a cada clique** em "Recalcular agora" — inclusive em dois cliques seguidos dentro do mesmo minuto, e mesmo quando ninguém troca de selo. É assim que se enxerga que o cálculo realmente aconteceu. Enquanto a conta nunca tiver rodado, o começo da frase é **"Selo ainda não calculado — roda sozinho às 04:20, ou use o botão abaixo."**, substituído pela data assim que a primeira conta terminar.
   - **"O selo só existe para quem tem número no campo Celular/WhatsApp — hoje ⟨N⟩ de ⟨total⟩ clientes ativos têm."** — o tamanho real da base que pode receber selo. É a explicação de por que o "Em uso" costuma ser baixo no começo (veja a seção adiante).
4. **Interruptor "Exigir WhatsApp":** é a chave que liga a exigência inteira, e vale para **duas coisas ao mesmo tempo**:
   - pedido de cliente sem WhatsApp (e sem justificativa válida) **não pode ser ENVIADO** — só salvo como aberto;
   - **cadastro de cliente novo** não salva sem o número.

   Vem **desligado de fábrica** — enquanto estiver assim, cadastro e envio de pedido funcionam como sempre funcionaram. Ligue depois de baixar a lista de pendências **e de avisar a equipe**, porque os dois efeitos começam no mesmo instante. Só quem tem permissão de editar clientes (ou admin) liga/desliga.
5. **Interruptor "Mostrar selo nas listas":** liga o **selo de WhatsApp na linha das listas de campo** — Rota (Atendimento, Atendidos, Entregas e Entregues) e Painel de Atendimentos. Quem está na rua enxerga na própria linha se o cliente **tem número no cadastro** e se **já saiu mensagem nossa** para ele, sem abrir a ficha. Vem **desligado de fábrica**. Mesma permissão do outro interruptor.
6. **Lista por vendedor:** cada vendedor com quantos clientes estão sem número e quantos estão dispensados, e a relação dos clientes (nome, CNPJ/CPF, cidade e a situação).

### As duas chaves são independentes (importante)

São **dois interruptores separados**, e um não liga o outro:

| Chave | O que faz | O que **não** faz |
|---|---|---|
| **Exigir WhatsApp** | Trava o ENVIAR do pedido de cliente sem número e torna o WhatsApp obrigatório no cadastro de cliente novo | Não mostra selo nenhum nas listas |
| **Mostrar selo nas listas** | Mostra o ícone de WhatsApp na linha das listas de Rota e Atendimentos | **Não** trava pedido, **não** torna campo obrigatório, **não** manda mensagem para ninguém |

Foi feito assim de propósito: dá para **enxergar** a situação da carteira inteira antes de decidir se vai **exigir**. Ligar o selo não muda nada no fluxo de trabalho — é só informação na tela.

### O que a equipe vê quando o selo está ligado

Na linha de cada cliente, ao lado do nome, aparece uma destas quatro marcas — e, embaixo da barra de abas, uma **legenda** explicando as cores e lembrando que a informação é **atualizada de madrugada**:

| Na tela | O que quer dizer | Clicável? |
|---|---|---|
| **Ícone verde** | Já saiu mensagem do sistema para esse número nos últimos 180 dias | Não |
| **Ícone cinza** | Tem número no cadastro, mas ainda não saiu mensagem para ele | Não |
| **Chip âmbar "Sem WhatsApp"** | O cadastro está sem número nenhum | **Só na Rota** — abre o modal para cadastrar o número na hora, para quem tem permissão de gravar o cadastro. No Painel de Atendimentos é **só leitura** |
| **Chip vermelho "WhatsApp com problema"** | O número existe no cadastro e foi recusado pelo WhatsApp | **Nunca** — redigitar o mesmo número não resolve; é caso para o escritório apurar |

> **Cuidado com o que o verde promete.** O sistema **não confere** se o número é do cliente nem se está certo — ele só sabe que **saiu mensagem nossa para lá**. Verde não é "número conferido". A equipe deve continuar confirmando o número com o cliente.

**Atenção — nas listas NÃO existe marca de "dispensado".** São só essas quatro. O KPI **Dispensados** e o chip âmbar **"Dispensado"** existem **nesta tela**; nas listas de campo, um cliente dispensado e sem número mostra o mesmo chip âmbar "Sem WhatsApp" que qualquer outro. É de propósito: a justificativa destrava o **ENVIAR do pedido**, mas não tira o cliente da fila de quem ainda precisa dar o número — na rua o vendedor deve continuar tentando pegar. Se alguém relatar "dispensei e o chip continua aparecendo", **é o comportamento correto**, não é falha.

**Amostra de lead não tem selo:** lead ainda não é cliente cadastrado, então não há campo de WhatsApp para o sistema olhar. Linha de amostra de lead sem ícone nenhum é o esperado, não é falha.

## As três situações de um cliente

Na linha de cada cliente da lista, a situação aparece como um chip colorido:

| Chip na lista | Cor | O que quer dizer |
|---|---|---|
| **Sem número** | Cinza | O cadastro não tem WhatsApp. É o que precisa ser resolvido. |
| **Dispensado** | Âmbar | Alguém registrou o motivo de o cliente seguir sem número. Vale **60 dias**; passou disso, volta a aparecer como "sem número". |
| **Número com problema** | Vermelho | O número está no cadastro, mas o WhatsApp da empresa tentou mandar mensagem e o número foi recusado (número não existe / inválido). Conferir com o cliente. |

> **Não confunda o cinza daqui com o âmbar das listas de campo.** Nesta tela, "Sem número" é **cinza** e o **âmbar** é do "Dispensado". Na Rota e no Painel de Atendimentos é ao contrário: lá o cliente sem número é que ganha um chip **âmbar** escrito "Sem WhatsApp", e dispensa não tem marca nenhuma. São telas diferentes, com propósitos diferentes.

O filtro de situação no topo da lista usa exatamente esses três nomes: **Sem número**, **Dispensado** e **Número com problema**.

## Os selos do WhatsApp (no cadastro do cliente)

No cadastro do cliente, logo abaixo do campo de celular, podem aparecer:

- **Pílula verde "WhatsApp em uso"** — já saiu mensagem do sistema para esse número nos últimos 180 dias. É o sinal mais forte que o sistema tem, mas **não é conferência**: quer dizer que **a mensagem saiu daqui** — não que tenha chegado, não que o cliente leu, e não que alguém confirmou que o número é dele.
- **Pílula vermelha "Número com problema"** — o WhatsApp recusou o envio por causa do número. Logo abaixo dela o sistema escreve, em vermelho, o motivo registrado.
- **Texto cinza "Número verificado"** — não é pílula, é uma observação ao lado: o WhatsApp respondeu que existe uma conta nesse número. Pode aparecer junto com uma das pílulas acima.
- **Nenhuma marca** — ainda não houve envio suficiente para dizer nada. Falha nossa (internet, WhatsApp fora do ar, teto de envios) **nunca** marca o cliente como problema.

O selo é recalculado sozinho **uma vez por dia, de madrugada (04:20)**.

### O botão "Recalcular agora"

Fica no cartão **"Selos de WhatsApp"**, e só aparece para quem pode editar clientes (ou admin). Serve para não esperar a madrugada — depois de preencher vários números, por exemplo.

Ao terminar, o aviso diz **quantos clientes estão com WhatsApp em uso**, no formato abaixo (os símbolos ⟨ ⟩ marcam onde entram os números da sua base — **este manual não sabe quanto é**; quem responde isso é a própria tela):

> *"⟨N⟩ cliente(s) com WhatsApp em uso e ⟨M⟩ com problema (⟨K⟩ mudaram nesta rodada)."*

- **⟨N⟩** é o que interessa: **quantos selos verdes existem** naquele momento. É o mesmo número do placar **"Em uso"**.
- **⟨M⟩** é quantos estão com o número recusado pelo WhatsApp.
- **⟨K⟩** — **"mudaram nesta rodada"** — é quantos clientes **trocaram de selo** naquela passada. **Costuma vir zero, e isso está certo:** a conta automática das 04:20 já tinha rodado, então o sistema olhou todo mundo e não encontrou nada para mudar. Zero ali **não é erro** e não quer dizer que o recálculo falhou.
- Se ninguém acendeu (⟨N⟩ e ⟨M⟩ vierem zero), o aviso troca de forma: em vez de um número seco, mostra o tamanho da base que foi considerada — **quantas tentativas de envio** havia na janela e **quantas dessas realmente saíram**, quantos números distintos e quantos clientes ativos — e recomenda rodar o diagnóstico do selo. Ele **não chuta o motivo**; quem apura a causa é o diagnóstico.
  > Repare na diferença entre "tentativas" e "saíram": mensagem que ficou na fila de reenvio (WhatsApp da empresa fora do ar, teto de envios atingido, modo de emergência ligado) conta como tentativa mas **não saiu** — e mensagem que não saiu não acende selo de ninguém. Se as duas contagens estiverem muito distantes, o problema é a fila travada, não o cadastro dos clientes.
- Se alguém já tiver clicado e a conta ainda estiver rodando, o segundo clique **entra na mesma rodada** (não abre outra) e mostra o resultado dela quando terminar.
- O aviso aparece **no rodapé da tela**, de propósito: no canto de cima ele ficava por cima do próprio placar "Em uso" que a frase manda conferir.
- **Como conferir que rodou mesmo:** olhe a linha cinza **"Selo atualizado hoje às ⟨hora⟩"** logo abaixo do placar. Ela mostra **os segundos**, então muda a cada clique — se você clicar duas vezes seguidas, o horário tem que ficar diferente. Se ficar igual, aí sim é caso de avisar. Já os números do placar **podem continuar iguais**, e isso é normal: quer dizer que nada mudou de selo.

### O selo só pode existir para quem tem o número no cadastro

O selo nasce do cruzamento entre **as mensagens que já saíram** do sistema e o campo **Telefone Celular** do cliente. Duas consequências que evitam susto:

- Cliente **sem Telefone Celular nunca fica verde** — o sistema nunca mandou mensagem para ele, porque não tinha para onde mandar. Ele aparece nesta tela com o chip **cinza "Sem número"** (e, nas listas de campo, com o chip âmbar "Sem WhatsApp"), que é justamente o que esta tela existe para resolver.
- **Telefone fixo/comercial não conta.** Muitos cadastros antigos têm o número só no campo **Telefone**, e o WhatsApp do sistema não usa esse campo — nem para mandar mensagem, nem para o selo. Enquanto o número não for passado para o campo **Telefone Celular**, aquele cliente continua contando como "Sem número".

Por isso, **é normal quase não haver selo verde no começo**: o placar "Sem número" mostra o tamanho real do trabalho de cadastro que falta. O verde vai aparecendo à medida que os números forem preenchidos e o sistema começar a mandar mensagem para eles.

## Cadastro novo: WhatsApp obrigatório (quando a exigência estiver ligada)

O **mesmo interruptor** que trava o envio de pedido governa o cadastro de cliente novo — não são duas chaves, é uma só.

- **Exigência DESLIGADA** (como vem de fábrica): o cadastro salva sem o WhatsApp, exatamente como sempre foi. Nada muda no dia a dia.
- **Exigência LIGADA:** o WhatsApp vira **campo obrigatório** no cadastro de cliente novo — não há como salvar sem ele.

Com a exigência ligada, o sistema ainda **pergunta ao WhatsApp da empresa se aquele número existe**:

- Se o WhatsApp responder que **o número não existe**, o cadastro é recusado com a mensagem "Esse número não tem WhatsApp. Confira com o cliente."
- Se **não der para perguntar** na hora (WhatsApp da empresa fora do ar), o cadastro **salva normalmente** — a conferência fica marcada como "não deu para verificar". Problema nosso nunca impede o vendedor de cadastrar cliente.
- Essa conferência é uma **consulta**: o sistema **não manda mensagem** para o cliente para testar o número.

Cadastro que é **só fornecedor** não precisa de WhatsApp (fornecedor não recebe aviso de pedido).

## Cliente antigo: a justificativa (dispensa)

Na edição de um cadastro antigo o campo **não** é obrigatório — várias telas alteram só um campo e passariam a travar. A cobrança acontece **na hora de enviar o pedido**, quando o interruptor está ligado: o vendedor informa o número na hora ou registra um motivo:

- **Cliente não tem WhatsApp**
- **Cliente não quis informar**
- **Vou pegar o número depois**

Fica gravado **quem** registrou e **quando**. A justificativa vale **60 dias** — depois disso o cliente volta a pedir o número. Não existe "dispensar para sempre".

## Perguntas comuns

- **"Por que o pedido não envia?"** — O interruptor "Exigir WhatsApp" está ligado e esse cliente está sem número (ou a justificativa venceu). Informe o WhatsApp no cadastro do cliente ou registre o motivo.
- **"Cadastrei o número certo e o sistema recusou"** — O WhatsApp respondeu que aquele número não tem conta. Confira o DDD e o dígito 9 com o cliente.
- **"O cliente pediu para não receber aviso de pedido"** — Isso não some com a obrigação do número (cobrança e boleto continuam saindo por ali), mas esse cliente **nunca** é marcado como "com problema".
- **"Onde vejo a situação de um cliente só?"** — No próprio cadastro do cliente, ao lado do campo de WhatsApp. E, com a chave "Mostrar selo nas listas" ligada, também na linha das listas da **Rota** (Atendimento, Atendidos, Entregas, Entregues) e do **Painel de Atendimentos**.
- **"Liguei o selo nas listas e o pedido parou de enviar"** — Não foi o selo. As duas chaves são independentes: quem trava o envio é "Exigir WhatsApp". Confira se ela também está ligada.
- **"O aviso do recálculo terminou com '(0 mudaram nesta rodada)' — deu errado?"** — Não. Isso é o esperado. O aviso traz **dois números que medem coisas diferentes**: o primeiro (*"⟨N⟩ cliente(s) com WhatsApp em uso"*) é **quantos selos verdes existem**; o que vem entre parênteses é apenas **quantos clientes trocaram de selo naquela passada**. Como a conta roda sozinha todo dia às 04:20, ao clicar no botão o sistema quase sempre não encontra nada para mudar — daí o zero. **Zero ali não é erro.** Para saber como está o selo, olhe o **primeiro** número do aviso ou o placar **"Em uso"** — nunca este manual, que não conhece os números da sua base.
- **"Recalculei e nenhum cliente ficou verde"** — Quase sempre é o cadastro, não o cálculo. Verde exige as duas coisas ao mesmo tempo: o cliente ter **Telefone Celular** preenchido **e** o sistema já ter mandado alguma mensagem para esse número nos últimos 180 dias. Se o placar "Sem número" está alto, a maior parte da base sequer tem para onde receber mensagem — o verde só começa a aparecer depois que os números forem preenchidos. Vale lembrar que boa parte das mensagens que o sistema manda **não vai para cliente** (aviso interno para a equipe, código do site, Kit Festa) e essas nunca acendem selo de ninguém.
- **"Liguei a chave e continuo sem ver selo"** — Confira **qual** chave você ligou. Quem mostra o selo nas listas é **"Mostrar selo nas listas"**; "Exigir WhatsApp" trava o envio do pedido e não mostra selo nenhum. As duas são independentes.
- **"O selo mudou no meio do dia?"** — Não muda. O selo é recalculado uma vez por dia, de madrugada (ou quando alguém clica em recalcular nesta tela). O que muda na hora é o chip âmbar "Sem WhatsApp": cadastrou o número, ele some da linha imediatamente.
- **"Cliquei no chip 'Sem WhatsApp' no Painel de Atendimentos e não abriu nada"** — Está certo. Lá o chip é só leitura; quem abre o cadastro do número na hora é o chip da **Rota**. Pelo Painel, abra o cadastro do cliente.
- **"Cliquei no chip vermelho 'WhatsApp com problema' e não abriu"** — Ele nunca é clicável, em tela nenhuma. Ali o número existe e foi recusado — digitar o mesmo número de novo não resolveria. É caso para o escritório apurar com o cliente.
- **"Verde quer dizer que o número está conferido?"** — Não. Verde quer dizer que **já saiu mensagem nossa** para aquele número. O sistema nunca confere se o número é do cliente. Continue confirmando com ele.
