# Pendências de WhatsApp (clientes)

**Onde fica:** Clientes → botão "💬 Pendências de WhatsApp" (rota `/clientes/pendencias-whatsapp`). Visível para quem pode cadastrar clientes (permissão **Clientes — editar** ou admin).

**Para que serve:** mostrar, vendedor por vendedor, quais clientes estão **sem o WhatsApp no cadastro** — e cobrar o preenchimento. É o número do campo **Telefone Celular** do cadastro do cliente: é por ele que sai a confirmação do pedido, o boleto/PIX e a cobrança. Quando o vendedor falta, é o único jeito de o escritório falar com a carteira dele.

## O que a tela mostra

1. **Placar (KPIs):**
   - **Clientes ativos** — total considerado (só clientes ativos entram na conta).
   - **Sem número** — cadastro sem número de WhatsApp em formato aproveitável (10 ou 11 dígitos com DDD) e sem justificativa dentro da validade.
   - **Dispensados** — sem número, mas com justificativa registrada e ainda válida (60 dias).
   - **Com problema** — o WhatsApp da empresa já tentou mandar mensagem e o número foi recusado.
   - **Verificados** — números para os quais o WhatsApp respondeu que **existe uma conta**. Diz que o número tem WhatsApp; **não** diz que o número é do cliente.
2. **Interruptor "Exigir WhatsApp":** é a chave que liga a exigência inteira, e vale para **duas coisas ao mesmo tempo**:
   - pedido de cliente sem WhatsApp (e sem justificativa válida) **não pode ser ENVIADO** — só salvo como aberto;
   - **cadastro de cliente novo** não salva sem o número.

   Vem **desligado de fábrica** — enquanto estiver assim, cadastro e envio de pedido funcionam como sempre funcionaram. Ligue depois de baixar a lista de pendências **e de avisar a equipe**, porque os dois efeitos começam no mesmo instante. Só quem tem permissão de editar clientes (ou admin) liga/desliga.
3. **Interruptor "Mostrar selo nas listas":** liga o **selo de WhatsApp na linha das listas de campo** — Rota (Atendimento, Atendidos, Entregas e Entregues) e Painel de Atendimentos. Quem está na rua enxerga na própria linha se o cliente **tem número no cadastro** e se **já saiu mensagem nossa** para ele, sem abrir a ficha. Vem **desligado de fábrica**. Mesma permissão do outro interruptor.
4. **Lista por vendedor:** cada vendedor com quantos clientes estão sem número e quantos estão dispensados, e a relação dos clientes (nome, CNPJ/CPF, cidade e a situação).

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

**Atenção — nas listas NÃO existe marca de "dispensado".** São só essas quatro. O KPI **Dispensados** e a coluna de situação existem **nesta tela**; nas listas de campo, um cliente dispensado e sem número mostra o mesmo chip âmbar "Sem WhatsApp" que qualquer outro. É de propósito: a justificativa destrava o **ENVIAR do pedido**, mas não tira o cliente da fila de quem ainda precisa dar o número — na rua o vendedor deve continuar tentando pegar. Se alguém relatar "dispensei e o chip continua aparecendo", **é o comportamento correto**, não é falha.

**Amostra de lead não tem selo:** lead ainda não é cliente cadastrado, então não há campo de WhatsApp para o sistema olhar. Linha de amostra de lead sem ícone nenhum é o esperado, não é falha.

## As três situações de um cliente

| Situação | O que quer dizer |
|---|---|
| **Sem número** | O cadastro não tem WhatsApp. É o que precisa ser resolvido. |
| **Dispensado** | Alguém registrou o motivo de o cliente seguir sem número. Vale **60 dias**; passou disso, volta a aparecer como "sem número". |
| **Com problema** | O número está no cadastro, mas o WhatsApp da empresa tentou mandar mensagem e o número foi recusado (número não existe / inválido). Conferir com o cliente. |

## Os selos do WhatsApp (no cadastro do cliente)

- **Em uso** — já saiu mensagem do sistema para esse número nos últimos 180 dias. É o sinal mais forte que o sistema tem, mas **não é conferência**: quer dizer que **a mensagem saiu daqui** — não que tenha chegado, não que o cliente leu, e não que alguém confirmou que o número é dele.
- **Com problema** — o WhatsApp recusou o envio por causa do número.
- **Sem selo** — ainda não houve envio suficiente para dizer nada. Falha nossa (internet, WhatsApp fora do ar, teto de envios) **nunca** marca o cliente como problema.

O selo é recalculado sozinho **uma vez por dia, de madrugada**.

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
- **"O selo mudou no meio do dia?"** — Não muda. O selo é recalculado uma vez por dia, de madrugada (ou quando alguém clica em recalcular nesta tela). O que muda na hora é o chip âmbar "Sem WhatsApp": cadastrou o número, ele some da linha imediatamente.
- **"Cliquei no chip 'Sem WhatsApp' no Painel de Atendimentos e não abriu nada"** — Está certo. Lá o chip é só leitura; quem abre o cadastro do número na hora é o chip da **Rota**. Pelo Painel, abra o cadastro do cliente.
- **"Cliquei no chip vermelho 'WhatsApp com problema' e não abriu"** — Ele nunca é clicável, em tela nenhuma. Ali o número existe e foi recusado — digitar o mesmo número de novo não resolveria. É caso para o escritório apurar com o cliente.
- **"Verde quer dizer que o número está conferido?"** — Não. Verde quer dizer que **já saiu mensagem nossa** para aquele número. O sistema nunca confere se o número é do cliente. Continue confirmando com ele.
