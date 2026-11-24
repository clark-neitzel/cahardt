# Regras de WHATSAPP — CA-Hardt (envio pelo bot da Ana)

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## Integração WhatsApp — bot da Ana (NÃO ESQUECER)

**O BotConversa foi desligado em 07/2026.** Todo envio de WhatsApp do sistema (confirmação de pedido, amostra, Kit Festa, delivery, cobrança, boleto/PIX do Asaas, código de verificação do site, avisos internos) passa pelo **bot da Ana** — o mesmo número que atende os clientes, via Z-API.

- **Transporte:** `backend/services/botWhatsappService.js` (cliente HTTP + fila de reenvio).
- **Montagem das mensagens:** `backend/services/webhookService.js` (nomes de função preservados da era BotConversa).
- **Contrato completo:** `INTEGRACAO-ENVIO-BOT-WHATSAPP.md` na raiz (espelha o `integracao-envio-bot.md` v2.0.0 do repo do bot).
- **Credenciais:** `BOT_WHATSAPP_URL` e `BOT_WHATSAPP_API_KEY` na **env do EasyPanel**. **Nunca no repositório, nunca no banco.** Sem elas, nenhuma mensagem sai (fica tudo na fila).

### Toda mensagem DEVE declarar `tipo` e `referencia`

```js
await bot.enviar({ telefone, texto, tipo, origem, referencia });
```

- **`tipo`** — valores fechados: `verificacao` | `pedido` | `entrega` | `cobranca` | `interno` | `outro`. O bot **audita por tipo**: se um fluxo destoar do combinado, o dono corta só aquele. Valor inválido cai em `outro` (marcado como não-classificado lá).
- **`referencia`** — única por mensagem. É a **idempotência**: repetir a mesma `origem`+`referencia` **não reenvia** (devolve `duplicado`). Daí duas regras opostas:
  - **Retry usa a MESMA referencia** — é o que impede duplicar a cobrança.
  - **Reenvio manual (botão) e 2º código de verificação precisam de referencia NOVA** (`bot.referenciaUnica(base)`) — senão o bot bloqueia como duplicata e o cliente **nunca recebe o segundo código**, ficando travado fora do site.
- **Máx. 2000 caracteres.** Acima disso o bot recusa (`texto_longo`) e o cliente não recebe **nada** — por isso `botWhatsappService` corta antes de mandar.
- O carimbo `🤖 *Mensagem automática*` é aplicado **pelo bot**. Não mandar.

### ⛔ A regra que sustenta a integração

O número já foi **banido uma vez** por automação em massa. O bot só liberou o primeiro contato (mandar pra quem nunca escreveu) porque o CA-Hardt se comprometeu, por escrito, a mandar **apenas mensagem transacional provocada por um ato concreto e recente do cliente**.

**Nunca** usar esta integração para promoção, lembrete de recompra, boas-vindas em lote ou lista fria — nem como `outro`. Isso derruba o WhatsApp da empresa inteira. Se surgir necessidade de automação proativa, a saída é a API oficial (Meta Cloud), não contornar aqui.

### Volume — o teto e a fila são do BOT (decisão do dono em 24/11/2026)

- **Teto: 30 mensagens por hora** — confirmado pelo dono em 24/11/2026 ("o limite é 30"). Pelo comentário de `cobrancaService.js`, o teto é do total (pedidos, códigos e entregas contam junto com a cobrança) e vem de uma decisão de segurança dele de 07/2026; a resposta anterior dele, de 200, foi corrigida no mesmo dia. O número vive na configuração do bot (`integracao_limite_hora`, no painel dele) e se confere com `botWhatsappService.status()`. **Código novo ou tocado nunca escreve o número fixo**: vale o que o bot responde.
- **Tempo:** o bot espaça os envios (pausa de 5 s entre uma mensagem e outra, `integracao_intervalo_seg`). **Fila:** no máximo 10 esperando; passou disso ele devolve `429 fila_cheia`. O CA-Hardt respeita os dois: nada de disparo em rajada nem em paralelo; `429` → fila de reenvio daqui, com a MESMA `referencia`.
- **A API para saber o que está acontecendo no bot já existe:** `GET /api/integracao/status` (lida por `botWhatsappService.status()` e mostrada em Configurações → Notificação WhatsApp). Devolve `limitePorHora`, `intervaloSegundos`, `enviadasUltimaHora`, `enviadasUltimaHoraPorTipo` e `exigeConversaPrevia`. **Regra para código novo ou tocado:** envio em lote consulta o status antes e dosa pelo que ele devolve. (O `/status` não informa quantas mensagens estão esperando na fila do bot — só as enviadas na última hora.)
- **A régua de cobrança** (`backend/services/cobrancaService.js`, `INTERVALO_ENTRE_ENVIOS_MS` = 150 s ≈ 24 cobranças por hora) foi calculada para esse teto de 30 (está escrito no comentário do código). Não mexer no intervalo sem pedido do dono.

### Fila de reenvio (`bot_whatsapp_envios`)

Falha reagendável (`429` do teto por hora ou da fila do bot, `502` da Z-API, rede, ou `403` do **modo de emergência** do bot) **não perde a mensagem**: ela entra na tabela como `PENDENTE` e o worker (`workers/scheduler.js`, a cada 5 min) reenvia com backoff (5min → 6h, até 6 tentativas). Nesses casos `enviar()` devolve `{ ok: false, reagendado: true }` — o chamador trata como "vai sair depois", não como erro.

### Diagnóstico quando "a mensagem não chega"

1. **Configurações → Notificação WhatsApp** mostra o status da conexão com o bot, quantas saíram na última hora e o tamanho da fila.
2. O toggle dessa tela (`whatsapp_ativo`) pausa **só o aviso de pedido**. Código de verificação, Kit Festa e cobrança são transacionais e **sempre saem**.
3. Tabela `bot_whatsapp_envios`: `status` (`ENVIADO`/`DUPLICADO`/`PENDENTE`/`ERRO`), `codigoErro` e `ultimoErro` de cada tentativa. Logs no servidor: `[BotWhatsapp]`.
4. `DUPLICADO` **não é falha** — significa que aquela mensagem já tinha saído (idempotência).
5. Se `exigeConversaPrevia: true` no status, o dono ligou o **modo de emergência** no painel do bot: só entrega para quem já conversou; o resto fica na fila até religar.
6. Kit Festa, reenviar: `POST /api/admin-exec/kitfesta-reenviar-whatsapp/:numero` (header `x-admin-secret`).
