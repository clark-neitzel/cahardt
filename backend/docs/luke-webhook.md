# Webhook de Saída para o Luke (`luke_webhook_eventos`)

Serviço de entrega assíncrona (`backend/services/lukeWebhookService.js`) que notifica o endpoint externo do Luke quando:
- uma solicitação de autorização do agente chega a um **estado final** (`AUTORIZADA`, `RECUSADA`, `ERRO`, `ERRO_INDETERMINADO`, `EXPIRADA`) → evento `solicitacao.atualizada`;
- um usuário envia uma mensagem no chat do Luke → evento `chat.mensagem`.

## Segurança e privacidade (evento magro)

1. **Corpo magro:** o webhook envia apenas identificadores (`eventoId`, `tipo`, `enviadoEm`, `solicitacao` ou `conversaId`/`mensagemId`/`assunto`/`qtdAnexos`). Nome do usuário, texto da mensagem, resumo do pedido e arquivos **nunca** saem no POST externo — o Luke busca tudo dentro da API autenticada (`/api/agente/v1/chat/...` e `/api/agente/v1/solicitacoes/:id`).
2. **Apenas `https://`:** `LUKE_WEBHOOK_URL` com `http://` ou credenciais embutidas é ignorada e o webhook permanece desligado (`DESLIGADO`).
3. **Sem redirecionamento:** `redirect: 'error'` e timeout de `10 s`. Redirecionamento vira `FALHA` imediata sem reenvio automático.
4. **Segredo protegido:** `LUKE_WEBHOOK_SECRET` nunca é gravado em banco, log, resposta de API nem `AuditLog`. Qualquer aparição acidental na mensagem de erro é mascarada.

## Variáveis de ambiente (EasyPanel — backend)

| Variável | Padrão | Descrição |
|---|---|---|
| `LUKE_WEBHOOK_URL` | *(vazio)* | URL `https://` de destino. Vazio = eventos nascem `DESLIGADO`. |
| `LUKE_WEBHOOK_SECRET` | *(vazio)* | Segredo para assinar (`hmac`) ou autenticar (`bearer`). |
| `LUKE_WEBHOOK_AUTH` | `hmac` | `hmac` (`X-Hub-Signature-256: sha256=<hex>`) ou `bearer` (`Authorization: Bearer <segredo>`). |

## Headers enviados

- `Content-Type: application/json; charset=utf-8`
- `X-Luke-Event`: `solicitacao.atualizada` ou `chat.mensagem`
- `X-Luke-Delivery`: `<eventoId>` (estável em todos os reenvios; use para deduplicar)
- `X-Luke-Timestamp`: epoch em segundos
- `User-Agent: CA-Hardt-Webhook/1`
- `X-Hub-Signature-256` (modo `hmac`, calculado sobre o corpo JSON cru) **ou** `Authorization: Bearer ...` (modo `bearer`)

## Fila, retentativas e marco inicial

- **Marco de ativação (`AppConfig` `luke_webhook_inicio`):** gravado na primeira varredura para não disparar histórico antigo de solicitações no primeiro deploy.
- **Retentativas:** até 6 tentativas totais com espera progressiva (`15 s`, `1 min`, `5 min`, `30 min`, `2 h`, com jitter de ±20% e respeito a `Retry-After` até 5 min) para erros de rede, timeout, `429` e `5xx`. Demais `4xx` viram `FALHA` sem laço.
- **Operação administrativa (somente admin humano):**
  - `GET /api/agentes-webhook/eventos?status=&tipo=&solicitacaoId=&conversaId=&page=&limit=`
  - `POST /api/agentes-webhook/eventos/:id/reenviar` (mantém o mesmo `eventoId` e registra `LUKE_WEBHOOK_REENVIADO` no `AuditLog`).
