# Usuário-agente com token de API (PR1)

O agente de IA (ex.: "Luke") é um `Vendedor` com `agente = true` (coluna real; `acessoExterno = true`, `login`/`senha` nulos).
Entra na API com `Authorization: Bearer cah_ag_<32 bytes base64url>` — nunca por login/senha, nunca por query string (400 `TOKEN_NA_URL`).

- Banco: só o SHA-256 do token (`agente_tokens.hash`). O token em claro aparece UMA vez, na resposta de `POST /api/agentes/:id/tokens`. O AuditLog guarda só o prefixo.
- Revogar (`DELETE /api/agentes/:id/tokens/:tid`) vale na próxima chamada: o `authMiddleware` consulta o banco a cada requisição (sem cache). Expiração padrão 90 dias; limite padrão 120 req/min por token (429 com `retryAfterSeg`).
- Permissões vivas: lidas do banco a cada chamada (mesmo princípio do JWT).
- **Agente nunca é admin**: se alguém der `permissoes.admin = true` ao vendedor-agente (por exemplo, pela tela de Usuários), o `authMiddleware` passa a recusar o token (403 `AGENTE_ADMIN_PROIBIDO`). Não há como virar/deixar de ser agente pelas rotas de usuários: `agente` não está na lista de campos aceitos pelo `PUT /api/vendedores/:id`.
- JWT de vendedor-agente e `POST /api/auth/app-login` com esse usuário → 401.
- **Nega por padrão**: o agente só alcança o que está em `config/agenteAcesso.js` (`REGRAS_AGENTE`). Neste PR: `GET /api/auth/me` e `GET /api/agente/v1/*`. O resto → 403 `AGENTE_BLOQUEADO`. Liberar uma família de rotas = acrescentar uma regra lá (e espelhar a permissão do banco no agente).
- Rotas de gestão (`/api/agentes`, só admin humano): `POST /`, `GET /`, `POST /:id/tokens`, `DELETE /:id/tokens/:tid`.

## Logs: onde o token pode vazar (e o que controlamos)

- O token só vale no header `Authorization`. Se vier na URL, o backend responde 400 e o logger do `index.js` grava `cah_ag_***` (máscara em `utils/mascararUrlLog.js`, que decodifica a URL antes de mascarar: cobre `cah%5Fag%5F`, `CAH_AG_` e qualquer parâmetro).
- **Atenção:** o access log do proxy do EasyPanel (na frente do backend) também grava a query string e NÃO é controlável por este código. Por isso o token nunca deve ir na URL — quem integrar o agente deve usar sempre o header. Se um token aparecer numa URL, trate como vazado: revogue (`DELETE /api/agentes/:id/tokens/:tid`) e gere outro.
- Freio de falhas: 30 tokens `cah_ag_` inválidos por minuto por IP → 429 sem consultar o banco. Só conta quem manda `cah_ag_` inválido (JWT nunca conta); token que já autenticou nos últimos 5 min não é barrado pelo freio (mas continua sendo validado no banco a cada chamada).
