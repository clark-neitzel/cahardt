# API do Chat do Luke (`/api/chat-luke` e `/api/agente/v1/chat`)

Canal interno de conversa contínua por usuário com o Luke (BPO financeiro), com suporte a texto, fotos (`JPG`, `PNG`, `WebP`) e `PDF`, limites diários por usuário e vínculo com solicitações de autorização.

## 1. Rotas do usuário humano (`/api/chat-luke` — JWT)

Exigem `Pode_Usar_Chat_Luke === true` ou `admin === true` (token de agente é sempre bloqueado com `403 AGENTE_BLOQUEADO`).

- `GET /api/chat-luke/resumo` — contador do mascote (`{ ativo, conectado, naoLidas, pendentesAutorizacao }`). Responde `200` mesmo se `ativo=false`.
- `GET /api/chat-luke/conversa` — abre/cria a conversa do usuário logado + últimas mensagens + `saldo` diário.
- `GET /api/chat-luke/mensagens?antesDe=<ISO>&depoisDe=<ISO>&limit=` — paginação de histórico (`antesDe`) ou polling incremental (`depoisDe` por `atualizadoEm`, cobrindo mudanças de estado de solicitações).
- `POST /api/chat-luke/mensagens` — `multipart/form-data` (`texto`, `assunto` opcional, `arquivos[]` até 5 arquivos de 10 MB cada) ou JSON. Aceita header `Idempotency-Key` para evitar duplicação em rede instável.
- `POST /api/chat-luke/lida` — `{ ate? }` marca mensagens como lidas.
- `GET /api/chat-luke/nao-lidas` — `{ naoLidas }`.
- `GET /api/chat-luke/anexos/:id` — binário do anexo (`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`), restrito exclusivamente ao dono da conversa (`routes/anexos.js` bloqueia `CHAT_LUKE` para todos, inclusive admin).

### Rotas de configuração (somente administrador humano)
- `GET /api/chat-luke/config` e `PUT /api/chat-luke/config` (`{ agenteId, ativo, limites: { pedidosDia, anexosDia, duvidasDia } }`)
- `GET /api/chat-luke/limites`, `PUT /api/chat-luke/limites/:usuarioId` e `DELETE /api/chat-luke/limites/:usuarioId`

## 2. Rotas do agente Luke (`/api/agente/v1/chat` — Bearer token de agente)

Exigem token válido **e** que `req.user.id === AppConfig['chat_luke'].agenteId` (outro agente recebe `403 AGENTE_CHAT_NAO_HABILITADO`; JWT humano recebe `403 SOMENTE_AGENTE`).

- `GET /api/agente/v1/chat/conversas?atualizadasDepois=<ISO>&limit=`
- `GET /api/agente/v1/chat/conversas/:id`
- `GET /api/agente/v1/chat/conversas/:id/mensagens?depoisDe=<ISO>&antesDe=<ISO>&limit=`
- `GET /api/agente/v1/chat/anexos/:id` — binário com token no header `Authorization` (nunca na URL).
- `POST /api/agente/v1/chat/conversas/:id/mensagens` — `{ texto, solicitacaoIds?, respondeA?, status? }` + header `Idempotency-Key`. Regra exata liberada em `REGRAS_SEMPRE_LIBERADO`; **não** gera evento de webhook (evita laço).

## 3. Vínculo com solicitações (`202 AGENTE_PEDE_AUTORIZACAO`)

- Quando o Luke executa uma chamada que cai na fila (`202`), pode enviar os headers `X-Origem-Conversa` e `X-Origem-Mensagem`: o servidor cria o vínculo em `chat_luke_mensagem_solicitacoes` fora da transação (IDs inválidos apenas geram aviso no log, sem impedir o pedido financeiro).
- Na resposta do chat (`POST .../mensagens`), o Luke também pode informar `solicitacaoIds` (validados como pertencentes ao próprio agente).
- O estado exibido no cartão da bolha é **derivado na leitura** a partir de `agente_solicitacoes`.

## 4. Ligar/desligar sem login (`/api/admin-exec/chat-luke-config`)

Para deixar o chat já ligado no deploy (ou desligar em emergência) sem sessão de admin humano. Protegido pelo `x-admin-secret` do router. **Dry-run por padrão**: só `?confirmar=1` (exatamente `1`) grava.

- Corpo: `{ agenteId?, agenteNome?, ativo? }` (ao menos um). `agenteNome` = nome exato de um agente (`agente: true`) **ativo**; 0 achados = `404`, mais de 1 = `409` (use `agenteId`). `agenteId` tem prioridade.
- Dry-run devolve `{ dryRun: true, gravado: false, atual, novo, agente?, webhook }`; com confirmar chama `salvarConfig` (mesma validação e auditoria `CHAT_LUKE_CONFIG_ALTERADA` do `PUT /api/chat-luke/config`, ator `admin-exec`) e devolve `{ gravado: true, atual, novo, ... }`. Nunca devolve segredo (`webhook` só traz booleanos/modo).

```bash
# 1) simular
curl -s -X POST "https://<host>/api/admin-exec/chat-luke-config" \
  -H "x-admin-secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"agenteNome":"Luke (agente)","ativo":true}'
# 2) aplicar
curl -s -X POST "https://<host>/api/admin-exec/chat-luke-config?confirmar=1" \
  -H "x-admin-secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"agenteNome":"Luke (agente)","ativo":true}'
```
