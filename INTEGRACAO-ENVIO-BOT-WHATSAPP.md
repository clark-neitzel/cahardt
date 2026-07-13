# CA-Hardt → bot da Ana: o que ainda falta para desligar o BotConversa

> **Para quem é este documento:** o projeto do bot (Ana / Z-API).
> **Escrito por:** lado CA-Hardt. **Rodada 2**, em resposta ao contrato **v1.1.0**.
> **Referência:** `integracao-envio-bot.md` v1.1.0 (repo do bot).

---

## 1. Onde estamos

O CA-Hardt vai **abandonar o BotConversa** e passar **todo** o WhatsApp pela API do bot.

A **v1.1.0 resolveu o caso mais crítico**: `primeiro_contato: true` destrava o **código de
verificação do login do site de Congelados**. Sem isso, o login do site pararia. Obrigado. 🎉

**Mas ainda não dá pra desligar o BotConversa:** o §2 da v1.1 restringe `primeiro_contato` a
"transacional **do site**" e diz explicitamente ⛔ "**nunca** para aviso de pedido comum".
Isso deixa **7 dos 8 fluxos** de fora.

---

## 2. Os oito fluxos, e onde cada um está na v1.1

| # | Fluxo | Destinatário | v1.1 resolve? |
|---|---|---|---|
| 1 | Confirmação de pedido (normal/especial) | Cliente B2B | ❌ `contato_sem_conversa` |
| 2 | Amostra | Cliente / lead | ❌ idem |
| 3 | Confirmação do Kit Festa | Cliente do site | 🟡 **ambíguo** — é ação do cliente no site, mas é "confirmação de pedido". **Precisamos de uma resposta clara.** |
| 4 | Delivery: em produção / saindo / entregue | Cliente **+ número interno da equipe** | ❌ idem (e o número interno nunca vai conversar) |
| 5 | Régua de cobrança | Cliente com parcela vencendo | ❌ idem + estoura o teto de 30/hora |
| 6 | Boleto Asaas emitido | Cliente | ❌ idem |
| 7 | **Código de verificação (site de Congelados)** | Cliente | ✅ **resolvido pela v1.1** |
| 8 | Relatório de meta agendado / retorno de currículo | Vendedor interno / candidato | ❌ idem |

---

## 3. ⚠️ Uma correção importante sobre o §2 (efeito dominó que não existe)

O §2 diz: *"se o contato não existe no bot, a conversa é criada"*.

Nós tínhamos assumido que isso abriria a janela de 90 dias para os outros avisos. **Não abre** — e a
própria v1.1 explica por quê: a trava do tipo A não é *ter conversa*, é
**`contato_nunca_escreveu`** ("a conversa existe, mas só nós falamos nela").

Ou seja: **mandar o código de verificação NÃO habilita os avisos de pedido daquele cliente.**
Só habilita se **ele responder**. Isso mata a saída "o login vira a porta de entrada que legaliza o
resto" que a gente tinha desenhado.

Se essa leitura estiver errada — se criar a conversa **conta** como contato válido para o tipo A —
avisem, porque muda bastante o desenho.

---

## 4. O pedido central: o critério não é "foi no site?", é "o cliente provocou?"

O §2 autoriza o primeiro contato porque **"quem puxou a mensagem foi o próprio cliente, segundos
antes"**. Concordamos 100% com esse princípio. **Ele só está sendo aplicado estreito demais.**

Quando o vendedor lança um pedido no app, **quem provocou a mensagem foi o cliente** — ele acabou de
comprar, olhando na cara do vendedor. É rigorosamente o mesmo consentimento do código de
verificação. A única diferença é que a ação dele aconteceu **na frente do vendedor** em vez de num
formulário do site. O cliente **espera** a confirmação; é a mensagem menos suspeita que existe.

O mesmo vale para: amostra que ele pediu, Kit Festa que ele comprou, entrega que ele está esperando,
boleto que ele mandou emitir, parcela que ele contratou e está vencendo.

**Proposta:** trocar o critério de `primeiro_contato` de
> "transacional **do site**"

para
> "transacional — **provocada por uma ação concreta e recente do cliente** (pedido feito, compra,
> código pedido, boleto emitido a pedido dele, parcela que ele contratou)"

Prospecção continua **proibida do mesmo jeito** e não vamos pedir isso nunca: promoção, lembrete de
recompra, "faz tempo que você não compra", boas-vindas em lote. Se a mensagem não tem do outro lado
um ato do cliente que a justifica, ela **não** é transacional. Esse é o compromisso, por escrito.

**Se preferirem granularidade em vez de confiar no critério**, funciona igual pra gente: um campo
`tipo` com valores fechados que o bot audita separadamente —
`verificacao` | `pedido` | `entrega` | `cobranca` | `interno` — cada um com seu contador. Aí vocês
veem no painel exatamente o que o CA-Hardt está mandando, e cortam um tipo específico se algo
cheirar mal. Nos diga qual formato preferem e a gente implementa.

---

## 5. Os três limites que ainda travam (independentes do §4)

### 5.1 Texto: 1000 caracteres é pouco para o resumo de pedido

O resumo de pedido lista **item a item** (nome do produto + `qtd un x R$ valor`). Cabeçalho ~230
caracteres, cada item ~45. Estoura os 1000 por volta de **17 itens** — e aí a mensagem é **recusada**
(`texto_longo`), o cliente não recebe **nada**. Vamos confirmar contra a produção quantos pedidos
reais passam disso, mas o risco é real.

**Pedido:** **2000** caracteres para o transacional.
**Se não der:** cortamos a lista e mandamos só total + quantidade de itens. Funciona, mas a
mensagem fica bem pior — o cliente usa esse resumo pra conferir o pedido.

### 5.2 Volume: 30/hora não cabe na régua de cobrança

A régua roda **de manhã, em lote** — pode ter 50–80 cobranças de uma vez. Com teto de 30/hora,
metade volta `429` e a cobrança do dia se arrasta por horas.

**Pedido:** teto separado para o transacional — algo como **200/hora**.
A **pausa de 5s entre envios pode continuar** (80 × 5s ≈ 7 minutos: aceitável para job de fundo).

De qualquer forma, o CA-Hardt vai implementar **fila com reagendamento**: `429` → tenta de novo mais
tarde **com a mesma `referencia`** (a idempotência de vocês protege contra duplicar). O teto maior
é pra cobrança sair no mesmo dia, não pra fazer rajada.

### 5.3 Número interno da equipe (fluxo 4, e também 8)

O Delivery avisa **um número interno da equipe** a cada mudança de etapa (`delivery_bot_phone`).
O relatório de meta vai pro **vendedor**. Esses números nunca "conversaram" com o bot e não faz
sentido pedir que conversem.

**Pedido:** **allowlist de números internos** no painel, isentos de todas as travas de contato
(continuam contando no volume, tudo bem).

---

## 6. Resumo — o que precisamos para desligar o BotConversa

| # | Pedido | Bloqueia a migração? |
|---|---|---|
| 1 | Ampliar `primeiro_contato` de "do site" para "provocada por ação do cliente" — **ou** um campo `tipo` fechado (§4) | **Sim** — sem isso, 6 fluxos param |
| 2 | Resposta clara sobre o **Kit Festa** (fluxo 3): entra no primeiro contato? | **Sim** |
| 3 | Allowlist de **números internos** (Delivery, vendedores) | **Sim**, para os fluxos 4 e 8 |
| 4 | Texto de **2000** caracteres no transacional | Não, mas degrada a confirmação de pedido |
| 5 | Teto de **~200/hora** no transacional | Não, mas a cobrança do dia demora horas |
| 6 | Confirmar a leitura do §3 (criar conversa **não** conta como contato válido) | Não — mas muda o desenho |

## 7. O que o CA-Hardt precisa receber de vocês

1. **Domínio exato do backend do bot** → vira `BOT_WHATSAPP_URL`.
2. **A chave da integração** (`x-api-key`) → vai como `BOT_WHATSAPP_API_KEY` na env do EasyPanel.
   **Nunca no repositório.**
3. Respostas da tabela do §6 — é o que decide se cortamos a lista de itens do pedido e como
   montamos a fila da cobrança.

## 8. O que NÃO vamos pedir (compromisso)

Mídia, disparo em massa, campanha, promoção, lembrete de recompra, boas-vindas em lote, forçar
envio pra quem não passou nas travas, mensagem para grupo. Se um dia a Hardt precisar de automação
proativa de verdade, a saída é a **API oficial (Meta Cloud)** — não é este assunto, e não vamos
tentar contornar por aqui.
