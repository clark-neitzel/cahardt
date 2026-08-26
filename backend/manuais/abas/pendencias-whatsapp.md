# Pendências de WhatsApp (clientes)

**Onde fica:** Clientes → botão "💬 Pendências de WhatsApp" (rota `/clientes/pendencias-whatsapp`). Visível para quem pode cadastrar clientes (permissão **Clientes — editar** ou admin).

**Para que serve:** mostrar, vendedor por vendedor, quais clientes estão **sem o WhatsApp no cadastro** — e cobrar o preenchimento. É o número do campo **Telefone Celular** do cadastro do cliente: é por ele que sai a confirmação do pedido, o boleto/PIX e a cobrança. Quando o vendedor falta, é o único jeito de o escritório falar com a carteira dele.

## O que a tela mostra

1. **Placar (KPIs):**
   - **Clientes ativos** — total considerado (só clientes ativos entram na conta).
   - **Sem número** — cadastro sem WhatsApp válido e sem justificativa dentro da validade.
   - **Dispensados** — sem número, mas com justificativa registrada e ainda válida (60 dias).
   - **Com problema** — o WhatsApp da empresa já tentou mandar mensagem e o número foi recusado.
   - **Verificados** — números que o WhatsApp confirmou que existem.
2. **Interruptor "Exigir WhatsApp":** é a chave que liga a exigência inteira, e vale para **duas coisas ao mesmo tempo**:
   - pedido de cliente sem WhatsApp (e sem justificativa válida) **não pode ser ENVIADO** — só salvo como aberto;
   - **cadastro de cliente novo** não salva sem o número.

   Vem **desligado de fábrica** — enquanto estiver assim, cadastro e envio de pedido funcionam como sempre funcionaram. Ligue depois de baixar a lista de pendências **e de avisar a equipe**, porque os dois efeitos começam no mesmo instante. Só quem tem permissão de editar clientes (ou admin) liga/desliga.
3. **Lista por vendedor:** cada vendedor com quantos clientes estão sem número e quantos estão dispensados, e a relação dos clientes (nome, CNPJ/CPF, cidade e a situação).

## As três situações de um cliente

| Situação | O que quer dizer |
|---|---|
| **Sem número** | O cadastro não tem WhatsApp. É o que precisa ser resolvido. |
| **Dispensado** | Alguém registrou o motivo de o cliente seguir sem número. Vale **60 dias**; passou disso, volta a aparecer como "sem número". |
| **Com problema** | O número está no cadastro, mas o WhatsApp da empresa tentou mandar mensagem e o número foi recusado (número não existe / inválido). Conferir com o cliente. |

## Os selos do WhatsApp (no cadastro do cliente)

- **Em uso** — já saiu mensagem do sistema para esse número nos últimos 180 dias. É a prova mais forte de que o número está certo. Atenção: quer dizer que **a mensagem saiu**, não que o cliente leu.
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
- **"Onde vejo a situação de um cliente só?"** — No próprio cadastro do cliente, ao lado do campo de WhatsApp.
