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

## Criar o agente "Luke" + token SEM sessão de admin no navegador: `POST /api/admin-exec/agente-criar`

Rota de manutenção (header `x-admin-secret`, como as demais do admin-exec). Mesma lógica do roteiro de console `docs/criar-luke-console.js`, no servidor. Idempotente.

Corpo JSON: `copiarPermissoesDe` (**obrigatório**: nome exato ou id de um administrador humano ativo; recusa se não achar, se houver 2+ com o mesmo nome, se for agente ou se não tiver `admin`), `nome` (padrão `Luke (agente)`), `tokenNome` (padrão `luke-bpo`), `validadeDias` (padrão 90, máx. 365), `novoToken` (padrão false), `sobrescrever` (padrão false).

- **Sem `?confirmar=1` = DRY-RUN**: não grava nada e não devolve segredo. Mostra origem, se o agente já existe, quantas permissões seriam copiadas, quais chaves ficam ligadas, token ativo existente e avisos.
- **Com `?confirmar=1`**: cria (ou reaproveita, ignorando maiúsculas/espaços) o agente; permissões = todas as chaves da origem **exceto `admin` e `Usuario_Externo`**, **mais `Isento_Ponto: true`** (grava também a linha em `vendedor_permissoes_historico`, autor `admin-exec`); se o agente já tem permissões diferentes elas são **mantidas** (aviso) a menos que `sobrescrever:true`; gera o token só se não houver um ativo com o mesmo nome (ou se `novoToken:true`). Agente existente **inativo** → 409. Se o token falhar depois das permissões, a resposta 500 diz isso e repetir a chamada reaproveita tudo (não duplica).
- O token (`cah_ag_…`) aparece **só nessa resposta** (`"token"`; `null` se não gerou agora). Nunca vai para log, AuditLog nem dry-run. AuditLog: `AGENTE_CRIADO`, `AGENTE_TOKEN_CRIADO`, `AGENTE_CRIAR_ADMIN_EXEC` (usuarioId `admin-exec`; só ids, prefixo e quantidades).

```bash
# 1) simulação (não grava nada)
curl -s -X POST "$URL/api/admin-exec/agente-criar" -H "x-admin-secret: $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"copiarPermissoesDe":"NOME EXATO DO ADMIN"}'

# 2) executar: a resposta vai para um arquivo temporário protegido (nunca para o terminal/chat)
umask 077
TMP=$(mktemp -d)                       # pasta temporária (modo 700)
ALVO=/caminho/luke.token               # destino final do token
curl -s -X POST "$URL/api/admin-exec/agente-criar?confirmar=1" -H "x-admin-secret: $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"copiarPermissoesDe":"NOME EXATO DO ADMIN"}' > "$TMP/resp.json"

# 3) grava o token SÓ se veio um (flag 'wx' = nunca sobrescreve arquivo existente) e imprime só o resumo, sem token
ALVO="$ALVO" RESP="$TMP/resp.json" node -e '
const fs = require("fs");
let r; try { r = JSON.parse(fs.readFileSync(process.env.RESP, "utf8")); } catch { console.log("Resposta ilegível/vazia — nada gravado."); process.exit(1); }
let tokenArquivo = "não (sem token novo)";
if (r.token) {
  try { fs.writeFileSync(process.env.ALVO, r.token, { mode: 0o600, flag: "wx" }); tokenArquivo = "sim: " + process.env.ALVO; }
  catch (e) { tokenArquivo = "NÃO GRAVADO (" + e.code + ") — o arquivo de destino já existe? O token novo ficou só na resposta temporária: guarde-o ANTES de apagá-la."; process.exitCode = 2; }
}
console.log(JSON.stringify({ ok: r.ok === true, erro: r.error || null, agenteId: r.agente?.id || r.agenteId || null,
  permissoesCopiadas: r.permissoes?.copiadas ?? null, tokenGerado: !!r.token, prefixo: r.tokenPrefixo || null,
  expiraEm: r.expiraEm || null, tokenArquivo, avisos: r.avisos || [] }, null, 2));
'
chmod 600 "$ALVO" 2>/dev/null
# 4) só apague a resposta depois de confirmar acima que o token foi gravado (ou que não havia token novo)
rm -P "$TMP/resp.json"; rmdir "$TMP"
```

Atenção:

1. **Reexecutar sem `novoToken` NÃO devolve o token** (`token: null`, só o prefixo do existente). O token em claro existe uma única vez, na resposta da criação.
2. **Se a resposta se perder depois da gravação** (rede caiu, `curl` interrompido), o token novo já está ativo no banco mas ninguém o tem (token órfão). Gere outro com `"novoToken": true` e revogue o órfão (pelo prefixo mostrado na listagem `GET /api/agentes`) com `DELETE /api/agentes/:id/tokens/:tid`.
3. A resposta temporária contém o token: deixe-a só na pasta temporária (`mktemp -d`) e apague com `rm -P` (macOS; no Linux, `shred -u`) assim que o token estiver no arquivo definitivo.
4. Limitação conhecida: a trava contra dois "confirmar" simultâneos é em memória (vale para uma instância do backend, que é o caso do EasyPanel); não há advisory lock no banco.

## Revogar e rotacionar o token SEM sessão de admin: `agente-token-revogar` e `agente-token-rotacionar`

Duas rotas de manutenção (header `x-admin-secret`), no mesmo padrão do `agente-criar`: **sem `?confirmar=1` (valor exatamente `1`) é DRY-RUN** — não grava nada e nunca devolve token nem hash. `?confirmar=true`, `=0`, repetido etc. NÃO executam. Resposta com `Cache-Control: no-store`. O corpo vai no POST (nunca o token na URL). AuditLog (`usuarioId: admin-exec`, só ids e prefixo): `AGENTE_TOKEN_REVOGADO`, `AGENTE_TOKEN_CRIADO`.

O **prefixo** é o identificador de 8 caracteres de cada token (aparece no dry-run, em `tokenPrefixo` e em `GET /api/agente/v1/meu-acesso`); diferencia maiúscula de minúscula.

### 1) Interruptor de emergência — `POST /api/admin-exec/agente-token-revogar`

Corpo: `agente` (nome exato, sem diferenciar caixa/espaços, ou id; **obrigatório**), `tokens` (**obrigatório**: `"todos"` ou lista de prefixos), `motivo` (opcional, até 200 caracteres; vai para o AuditLog). Vale mesmo com o agente inativo. Já revogado = ignorado com aviso (idempotente). Prefixo que não existe → 404 listando os prefixos ativos (e nada é revogado). Agente inexistente → 404; nome duplicado → 409.

```bash
# dry-run: mostra os tokens ATIVOS (prefixo, nome, criadoEm, expiraEm, ultimoUsoEm, ultimoUsoIp, totalUsos)
curl -s -X POST "$URL/api/admin-exec/agente-token-revogar" -H "x-admin-secret: $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"agente":"Luke (agente)","tokens":"todos"}'

# revogar de verdade (vale na próxima chamada do agente)
curl -s -X POST "$URL/api/admin-exec/agente-token-revogar?confirmar=1" -H "x-admin-secret: $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"agente":"Luke (agente)","tokens":"todos","motivo":"token apareceu em chat"}'
```

### 2) Rotação — `POST /api/admin-exec/agente-token-rotacionar`

Corpo: `agente` (obrigatório), `revogarAnteriores` (padrão `true`: revoga **todos** os tokens ativos do agente), `tokenNome` (padrão `luke-bpo`, até 80), `validadeDias` (padrão 90, 1–365), `limitePorMinuto` (opcional, 1–600; padrão do serviço, 120). Agente inativo → 409.

- Ordem no `?confirmar=1`: **primeiro revoga os anteriores, depois cria o novo** (um token vazado cai antes de o novo existir). Se a criação falhar, os antigos JÁ estão revogados — a resposta 500 diz isso, com mensagem fixa (sem repassar erro do banco) — e **repetir é seguro**: não revoga de novo o que já foi e gera 1 token novo.
- Dois `confirmar` simultâneos: o 2º recebe 409 (trava em memória; vale para 1 instância do backend, que é o caso do EasyPanel).
- Resposta: `{ ok, agente, revogados:[prefixos], token:"cah_ag_…" (SÓ aqui, uma vez), tokenPrefixo, expiraEm, avisos }`.

```bash
# dry-run: quem seria revogado + o que seria gerado (sem segredo)
curl -s -X POST "$URL/api/admin-exec/agente-token-rotacionar" -H "x-admin-secret: $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"agente":"Luke (agente)"}'

# rotacionar: a resposta vai para arquivo temporário protegido (nunca para terminal/chat)
umask 077
TMP=$(mktemp -d)
ALVO=/caminho/luke.token
# ATENÇÃO (flag 'wx' não sobrescreve): o arquivo do token ANTIGO precisa sair do caminho ANTES —
# ele já foi revogado e não serve mais. Mova ou apague agora:
[ -e "$ALVO" ] && mv "$ALVO" "$ALVO.revogado"     # (ou rm -P "$ALVO"; no Linux, shred -u)
curl -s -X POST "$URL/api/admin-exec/agente-token-rotacionar?confirmar=1" -H "x-admin-secret: $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"agente":"Luke (agente)"}' > "$TMP/resp.json"

# grava o token SÓ se veio um (flag 'wx' = nunca sobrescreve) e imprime só o resumo, sem token
ALVO="$ALVO" RESP="$TMP/resp.json" node -e '
const fs = require("fs");
let r; try { r = JSON.parse(fs.readFileSync(process.env.RESP, "utf8")); } catch { console.log("Resposta ilegível/vazia — nada gravado."); process.exit(1); }
let tokenArquivo = "não (sem token novo)";
if (r.token) {
  try { fs.writeFileSync(process.env.ALVO, r.token, { mode: 0o600, flag: "wx" }); tokenArquivo = "sim: " + process.env.ALVO; }
  catch (e) { tokenArquivo = "NÃO GRAVADO (" + e.code + ") — o arquivo de destino já existe? O token novo ficou só na resposta temporária: guarde-o ANTES de apagá-la."; process.exitCode = 2; }
}
console.log(JSON.stringify({ ok: r.ok === true, erro: r.error || null, agenteId: r.agente?.id || r.agenteId || null,
  revogados: r.revogados || [], tokenGerado: !!r.token, prefixo: r.tokenPrefixo || null,
  expiraEm: r.expiraEm || null, tokenArquivo, avisos: r.avisos || [] }, null, 2));
'
chmod 600 "$ALVO" 2>/dev/null
rm -P "$TMP/resp.json"; rmdir "$TMP"   # só depois de confirmar acima que o token foi gravado
```

Se a resposta se perder depois do `confirmar`, o token novo já está ativo e ninguém o tem: rode `agente-token-rotacionar?confirmar=1` outra vez (revoga o órfão e gera outro).

### Quando rotacionar (o token vence em 90 dias)

- **Rotacione a cada 60–80 dias**, sem esperar vencer (token vencido = agente fora do ar).
- O próprio agente enxerga o prazo: `GET /api/agente/v1/meu-acesso` devolve `token: { prefixo, expiraEm, diasRestantes }` (sem segredo). **Quando `diasRestantes` ≤ 14, avise o dono** para rotacionar. `diasRestantes` é `null` se o token não tem validade.
- Suspeitou de vazamento (token em chat, URL, log, print)? Não espere: `agente-token-revogar` com `"tokens":"todos"` e depois rotacione.
- Antes de qualquer uso real: o deploy precisa ter subido (`GET /api/admin-exec/ping` com `deployMarker: "agente-token-rotacao-2026-11-27"`).
