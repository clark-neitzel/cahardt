# Plano do Arquiteto — Etiquetas da Cozinha + impressão direta (fila + agente)

Data: 15/10/2026 · Proposta aprovada: `docs/mockups/etiquetas-cozinha.html` · Porte: **GRANDE** (infra nova + equipe completa; E1 mexe em ambiente externo ao servidor).

---

## 0. Entendimento do pedido

1. Aba **PCP → Etiquetas da Cozinha** (`/pcp/etiquetas/cozinha`, permissão `pcp.etiquetas`) para etiquetar recheio, massa e qualquer item sem receita: filtros por tipo, gaveta (fabricação, conservação, validade, peso, quantidade, tamanho, responsável), "Hoje na cozinha", lote `AAMMDD-NN`, reimprimir, histórico.
2. **Sem diálogo de impressão em nenhum aparelho.** O app não imprime mais "na página" para esta aba: grava um trabalho numa **fila no servidor**; um **agente no PC da cozinha** (`PRODUCAO`) busca e manda bytes crus (EPL2/ZPL) às duas Zebras por USB.
3. Fases 2 e 3 (OP, vence hoje, QR, cor do dia, confete, bip) **ficam de fora**. Favoritos entram porque o filtro "Favoritos" está no escopo (versão simples, ver 2.6).
4. Interpretação adotada (ambiguidade): a impressão atual do Kit Festa (`frontend/src/pages/KitFesta/etiquetasCaixas.js`) e da etiqueta de produto (`frontend/src/pages/PCP/EtiquetaImprimir.jsx`) **não muda** nesta entrega. A fila nasce pronta para elas migrarem depois (campo `tipo`), mas não é escopo.

## 1. Fatiamento (concordo com o corte E1/E2, com 2 ajustes)

| Entrega | Conteúdo | Pode ser publicada sozinha? |
|---|---|---|
| **E1 — Infra de impressão** | Schema (agente, impressora, fila) · rotas de cadastro/token/fila · rotas do agente · geradores EPL2/ZPL · **teste de impressão** · worker de expiração/limpeza · tela Configurações → Impressoras · **agente PowerShell + instalar.bat** | Sim. Valor: imprimir "teste" nas 2 Zebras do iPad. **Gate real: papel saindo certo nas duas impressoras.** |
| **E2 — Aba Etiquetas da Cozinha** | Campos novos em `ItemPcp` · tabela de lotes · rotas da cozinha · aba + gaveta + hoje/reimprimir · Itens PCP (2 prazos + grupo) · manual/Clippy/novidade | Só depois do E1 aprovado em produção. |

Ajustes ao corte sugerido:
- **E1 inclui o "layout real" no teste de impressão** (uma etiqueta fictícia "RECHEIO DE TESTE" nos dois tamanhos). Os geradores são escritos em E1, para a calibração (margens, gap, fonte, acento) acontecer **antes** de existir a aba. E2 só chama o gerador.
- **Campos novos de `ItemPcp` (validades, grupo, origem) entram no schema em E1** (migração aditiva, nullable). Assim o `prisma db push` do E2 não tem surpresa e o dono pode ir preenchendo os prazos em Itens PCP enquanto o E1 é testado. A tela de edição desses campos continua sendo E2.

### Paralelismo
- **E1:** `dev-backend` (schema + rotas + geradores + worker + script do agente) e `dev-frontend` (tela Impressoras) rodam em paralelo **depois** que o backend publicar o contrato (seção 2.4) — o front pode começar contra o contrato escrito aqui, com mocks. O **agente** (`.ps1`) é backend: escreve junto com as rotas do agente, porque o contrato muda os dois lados ao mesmo tempo. QA do agente exige o PC da cozinha (não dá para provar no Mac) — ver seção 6.
- **E2:** backend (campos + rotas cozinha) e frontend (aba) em paralelo depois do contrato 2.5. Costura (lição do projeto): QA tem de testar o caminho de erro (agente offline, impressora inativa) clicando.

---

## 2. Modelo de dados, endpoints e contratos

### 2.1 Mapa do código atual (lido)
- `backend/prisma/schema.prisma:2495` `ItemPcp` (tipo MP|SUB|PA|EMB, `unidade`, sem validade/grupo hoje). `validadeDias` existe só em `Produto` (linha 54) e `EtiquetaProduto` (2930) — **não** servem aos itens SUB.
- `backend/services/pcpItemService.js:75-100` `criar` (só SUB, código `SUB-NNNN` via `proximoCodigoSub`); `:159-185` `atualizar` — **atenção:** para item com `produtoId` só aceita `estoqueMinimo/custoUnitario/descricao`; os campos novos têm de ser aceitos nos DOIS ramos (órfão e importado).
- `backend/routes/pcpItemRoutes.js:73,132` POST/PUT (permissão `pcp` via `getPermsFromDB`).
- `backend/routes/pcpEtiquetaRoutes.js:10-17` padrão de permissão `perms.admin || perms.pcp?.etiquetas` — **copiar igual** nas rotas novas.
- `backend/index.js:205-215` montagem das rotas PCP; rotas públicas (sem `authMiddleware`) ficam acima de `// (Protegidas)` (ex.: `/api/ponto-publico`, linha ~138). O agente usa token próprio → monta junto das públicas.
- `backend/middlewares/authMiddleware.js` — JWT de usuário; **não** serve ao agente.
- `backend/workers/scheduler.js:6` `startSchedulers()` — padrão `setInterval`; o worker de expiração entra aqui.
- Config genérica em `app_configs` (`prisma.appConfig`, `backend/routes/configRoutes.js`) — usar só para parâmetros (ex.: `impressao_expira_min`); **cadastro de impressora não vai em app_configs** (tabela própria).
- `frontend/src/App.jsx:455-471` menu PCP (`canPcp('etiquetas')`), `:479-490` menu Configurações, `:917-936` rotas PCP, `:956-958` rotas `/config/*` com `<PrivateRoute tab="configuracoes">`.
- `backend/services/copilotoService.js:104-105` tabela `ABAS`; manual `backend/manuais/abas/pcp-etiquetas.md`.
- `frontend/src/pages/PCP/etiquetaModelos.js:67` `paginaImpressao` — a ZDesigner hoje imprime **paisagem 120×100 pelo driver** (etiqueta 100 de largura de cabeça × 120 de avanço, girada). Em RAW o driver não participa: a orientação passa a ser decidida pelo gerador ZPL (ver 3.3 e `rotacao`).
- `backend/tests/run.js` (`node --test`, Node 20) — onde entram os testes dos geradores.
- Fuso: `process.env.TZ = 'America/Sao_Paulo'` (`backend/index.js:1`); datas do módulo como **texto `YYYY-MM-DD`** (padrão Tarefas), nunca `DateTime` para "data de fabricação/validade".

### 2.2 Tabelas novas (todas `@@map` snake_case; nada existente é removido)

**`ImpressaoAgente` → `impressao_agentes`**
| Campo | Tipo | @map |
|---|---|---|
| id | String @id @default(uuid()) | |
| nome | String (ex.: "PC da cozinha") | |
| tokenHash | String @unique (SHA-256 hex) | `token_hash` |
| tokenPrefixo | String (8 primeiros chars, só p/ exibir) | `token_prefixo` |
| ativo | Boolean @default(true) | |
| hostname | String? | |
| versaoAgente | String? | `versao_agente` |
| ultimoContato | DateTime? | `ultimo_contato` |
| ultimoIp | String? | `ultimo_ip` |
| impressorasWindows | Json? (lista reportada: `[{nome, driver, porta, padrao, status}]`) | `impressoras_windows` |
| impressorasAtualizadasEm | DateTime? | `impressoras_atualizadas_em` |
| pedirImpressoras | Boolean @default(false) (botão "Atualizar lista") | `pedir_impressoras` |
| criadoPor | String? | `criado_por` |
| createdAt / updatedAt | | `created_at` / `updated_at` |
Rotacionar token = grava novo hash (o antigo morre na hora). Revogar = `ativo=false`.

**`Impressora` → `impressoras`**
| Campo | Tipo | @map |
|---|---|---|
| id | uuid | |
| nome | String ("Zebra pequena 40×25") | |
| agenteId | String FK → ImpressaoAgente | `agente_id` |
| nomeWindows | String (exatamente como o Windows lista) | `nome_windows` |
| linguagem | String: `EPL2` \| `ZPL` | |
| dpi | Int @default(203) | |
| tamanho | String: `40x25` \| `100x120` (o que a impressora atende) | |
| colunas | Int @default(1) (40×25 = 2) | |
| larguraRoloMm | Int? (84) | `largura_rolo_mm` |
| gapDots | Int @default(24) | `gap_dots` |
| rotacao | Int @default(0) (0/90/180/270) | |
| removerAcentos | Boolean @default(true) (EPL2 até validar code page) | `remover_acentos` |
| ajustes | Json? (`{densidade, velocidade, col1X, col2X, offsetX, offsetY}`) | |
| ativa | Boolean @default(true) | |
| createdAt / updatedAt | | |
Índices: `@@index([agenteId])`, `@@index([tamanho, ativa])`. Regra de negócio (rota, não banco): no máximo 1 impressora ativa por `tamanho` marcada como padrão da cozinha; se houver 2 ativas do mesmo tamanho a gaveta mostra seletor.

**`ImpressaoTrabalho` → `impressao_fila`**
| Campo | Tipo | @map |
|---|---|---|
| id | uuid | |
| impressoraId | String FK | `impressora_id` |
| tipo | String: `TESTE` \| `ETIQUETA_COZINHA` \| `OUTRO` | |
| chaveIdempotencia | String? @unique (clique duplo / retry do front) | `chave_idempotencia` |
| status | String: `PENDENTE` \| `ENVIANDO` \| `IMPRESSO` \| `ERRO` \| `EXPIRADO` \| `CANCELADO` | |
| conteudo | Bytes (bytes crus a enviar) | |
| conteudoBytes | Int | `conteudo_bytes` |
| copias | Int @default(1) (etiquetas físicas, informativo) | |
| tentativas | Int @default(0) | |
| maxTentativas | Int @default(3) | `max_tentativas` |
| erro | String? @db.Text | |
| loteId | String? FK → EtiquetaCozinhaLote (E2) | `lote_id` |
| solicitadoPorId | String? | `solicitado_por_id` |
| solicitadoPorNome | String? | `solicitado_por_nome` |
| pedidoEm | DateTime @default(now()) | `pedido_em` |
| expiraEm | DateTime | `expira_em` |
| enviadoAoAgenteEm | DateTime? | `enviado_ao_agente_em` |
| impressoEm | DateTime? | `impresso_em` |
| agenteId | String? | `agente_id` |
Índices: `@@index([status, pedidoEm])`, `@@index([impressoraId, status])`, `@@index([loteId])`.
`loteId` FK só é adicionada no E2; no E1 o campo existe como `String?` **sem relação** (relação entra no E2 junto da tabela de lotes — evita FK para tabela que não existe).

**`EtiquetaCozinhaLote` → `etiquetas_cozinha_lotes`** (E2)
| Campo | Tipo | @map |
|---|---|---|
| id | uuid | |
| requisicaoId | String @unique (uuid gerado pelo front ao abrir a gaveta → clique duplo não duplica lote) | `requisicao_id` |
| lote | String (`251015-03`) | |
| loteData | String (`YYYY-MM-DD`, dia do lote no fuso local) | `lote_data` |
| loteSeq | Int | `lote_seq` |
| itemPcpId | String FK → ItemPcp | `item_pcp_id` |
| nomeImpresso | String | `nome_impresso` |
| fabricacao | String (`YYYY-MM-DD`) | |
| validade | String (`YYYY-MM-DD`) | |
| validadeDias | Int | `validade_dias` |
| validadeAlterada | Boolean @default(false) (cozinha mudou o prazo sugerido) | `validade_alterada` |
| conservacao | String: `REFRIGERADO` \| `CONGELADO` | |
| pesoGramas | Int? (**banco em gramas, tela em kg** — mesma lição do peso do pacote) | `peso_gramas` |
| quantidade | Int | |
| tamanho | String | |
| impressoraId | String? | `impressora_id` |
| responsavelId / responsavelNome | String / String | `responsavel_id` / `responsavel_nome` |
| criadoPorId / criadoPorNome | String / String | `criado_por_id` / `criado_por_nome` |
| reimpressoes | Int @default(0) | |
| createdAt | DateTime @default(now()) | `created_at` |
Índices: `@@unique([loteData, loteSeq])`, `@@index([itemPcpId])`, `@@index([loteData])`, `@@index([criadoPorId, createdAt])`.
Número do lote: dentro de `$transaction(..., { timeout: 20000, maxWait: 10000 })`: `max(loteSeq)+1` do `loteData`; em colisão `P2002` repete até 3 vezes (a `@@unique` é a trava, não o `max`). Geração de bytes e **enfileiramento fora/depois** do lote? Não: lote + trabalhos são atômicos de verdade (se o lote existe sem trabalho, o "Hoje na cozinha" mostra etiqueta que nunca saiu). Gerar os bytes antes da transação (puro CPU), gravar lote + trabalho(s) juntos dentro dela.

**Campos novos em `ItemPcp`** (todos nullable/default → `db push` aditivo, entram no E1):
- `validadeRefrigeradoDias Int? @map("validade_refrigerado_dias")`
- `validadeCongeladoDias Int? @map("validade_congelado_dias")`
- `grupoCozinha String? @map("grupo_cozinha")` — `RECHEIO` | `MASSA` | `OUTRO` (hoje nada separa recheio de massa; é isto que alimenta os filtros)
- `origem String @default("CADASTRO")` — `CADASTRO` | `COZINHA` (item criado por "Digitar")
- `@@index([grupoCozinha])`

### 2.3 Endpoints do app (usuário logado, JWT)
Montagem em `backend/index.js` junto das outras: `app.use('/api/impressao', authMiddleware, require('./routes/impressaoRoutes'))`.

| Método e rota | Quem | Payload → resposta |
|---|---|---|
| `GET /api/impressao/agentes` | admin | → `[{id,nome,ativo,tokenPrefixo,hostname,versaoAgente,ultimoContato,online,estado('ONLINE'<20s \| 'INSTAVEL'<2min \| 'OFFLINE'), impressorasWindows[]}]` |
| `POST /api/impressao/agentes` | admin | `{nome}` → `{agente, token:'cahp_…'(UMA vez), instaladorBat:'<texto .bat>'}` |
| `POST /api/impressao/agentes/:id/rotacionar-token` | admin | → mesmo formato; o token anterior morre |
| `POST /api/impressao/agentes/:id/revogar` | admin | → `{ok}` |
| `POST /api/impressao/agentes/:id/atualizar-impressoras` | admin | marca `pedirImpressoras=true` → `{ok}` (a lista chega no próximo ciclo ≤ 5 s) |
| `GET /api/impressao/impressoras` | admin = tudo; `pcp.etiquetas` = só ativas, campos `{id,nome,tamanho,colunas,estadoAgente,estadoWindows}` | |
| `POST /api/impressao/impressoras` / `PUT /:id` | admin | campos da tabela. Ao escolher `nomeWindows` da lista reportada, o front sugere `linguagem` pelo `driver` (contém `EPL` → EPL2; contém `ZPL`/`ZDesigner`+`ZT`/`GK`/`ZD`/`ZM` → ZPL; `TLP 2844` → EPL2) — **sugestão, nunca automático** |
| `DELETE /api/impressao/impressoras/:id` | admin | soft: `ativa=false` (tem histórico) |
| `POST /api/impressao/impressoras/:id/teste` | admin | `{tipo:'TEXTO_EPL2'\|'TEXTO_ZPL'\|'ETIQUETA_EXEMPLO'}` → `{trabalhoId}` (ver 3.4) |
| `GET /api/impressao/fila?status=&limit=50` | admin | trabalhos recentes (sem `conteudo`) |
| `GET /api/impressao/trabalhos/:id` | admin ou `pcp.etiquetas` (só os próprios) | → `{id,status,erro,tentativas,agenteOnline}` — o front faz polling a cada 1,5 s |
| `POST /api/impressao/trabalhos/:id/reenviar` | admin | cria trabalho **novo** com a mesma carga (nunca reativa o ERRO/EXPIRADO) |
| `POST /api/impressao/trabalhos/:id/cancelar` | admin | só PENDENTE |

Token: `cahp_` + 32 bytes aleatórios hex (`crypto.randomBytes`); guardar só `sha256`; comparar com `crypto.timingSafeEqual`. Nunca logar o token. Nunca no repositório, nunca em `app_configs`.

### 2.4 Contrato agente ↔ backend (`/api/impressao-agente`, SEM `authMiddleware`, auth própria)
Montagem: `app.use('/api/impressao-agente', require('./routes/impressaoAgenteRoutes'))` junto das rotas públicas. Todas exigem header `x-agente-token`. Token inválido/revogado → `401` e **nenhuma** informação. Rate-limit simples por IP (ex.: 120 req/min; padrão do `loginRateLimit.js`). Corpo máximo pequeno (`express.json` já limita; resultados têm <2 KB).

1. **`POST /sincronizar`** (o "poll" **e** o heartbeat; a cada 3 s)
   Req: `{ versao:"1.0.0", hostname:"PRODUCAO", impressoras?:[{nome,driver,porta,padrao,status}], emAndamento?:["<jobId>"] }` — `impressoras` só no 1º ciclo, a cada 5 min e quando a resposta anterior trouxe `pedirImpressoras:true`.
   Resp: `{ ok:true, agora:"ISO", pedirImpressoras:bool, versaoServidor:"1.0.0", atualizar:bool, trabalhos:[{ id, impressora:{ id, nomeWindows, linguagem }, tipo, copias, tentativa, expiraEm, conteudoBase64 }] }`
   Servidor, em uma operação atômica: atualiza `ultimoContato/ultimoIp/versao/hostname` (a escrita de `ultimo_contato` só se passou >15 s da anterior, para não gravar a cada 3 s), e **reivindica** até 5 trabalhos `PENDENTE` das impressoras daquele agente e ainda não expirados: `UPDATE … SET status='ENVIANDO', tentativas=tentativas+1, enviado_ao_agente_em=now(), agente_id=$1 WHERE id IN (SELECT id … WHERE status='PENDENTE' AND expira_em>now() AND impressora_id IN (…) ORDER BY pedido_em LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING …` via `$queryRaw`.
2. **`POST /trabalhos/:id/resultado`** — Req: `{ status:"IMPRESSO"|"ERRO", erro?:string, ms?:number }`. Idempotente: se já `IMPRESSO` devolve `{ok:true}` sem mudar. `ERRO` com `tentativas < maxTentativas` e ainda não expirado volta a `PENDENTE` (reagenda); senão fica `ERRO`.
3. **`GET /script`** — devolve `agente.ps1` atual (arquivo em `backend/agente-impressao/agente.ps1`, lido do disco do servidor; **não** é upload, é código versionado no repo). Header `x-agente-versao`. Usado pelo instalador e pela autoatualização.
4. Nenhuma outra rota é acessível ao token do agente. Ele só enxerga trabalhos das impressoras do próprio `agenteId`.

**Anti-duplicata (ponto crítico):** se o agente imprimiu mas o `POST resultado` falhou (rede), o job ficaria `ENVIANDO` e seria reentregue → etiqueta em dobro. Duas travas: (a) o agente grava cada `id` impresso em `C:\CAHardtAgente\feitos.log` e, ao receber um `id` já feito, **não imprime** — só reenvia o resultado; (b) o worker do servidor só devolve `ENVIANDO` a `PENDENTE` quando o agente **também** não está em `emAndamento` e passaram >90 s; e nunca passa de `maxTentativas`.

### 2.5 Endpoints da cozinha (E2) — `app.use('/api/pcp/etiquetas-cozinha', authMiddleware, …)`, permissão `admin || pcp.etiquetas` (igual a `pcpEtiquetaRoutes.js:15`)
- `GET /itens?grupo=RECHEIO|MASSA|OUTRO|FAVORITOS|TODOS&busca=` → itens SUB ativos + os que têm `grupoCozinha` (não-SUB com grupo marcado também aparecem). Cada um: `{id,codigo,nome,tipo,unidade,grupoCozinha,validadeRefrigeradoDias,validadeCongeladoDias,ultimoTamanho,ultimaConservacao}` (últimos = último lote **desse usuário** para esse item → "bisnaga sempre pequena"). Contadores por aba no mesmo retorno.
- `GET /favoritos` → top 6 itens do usuário nos últimos 30 dias (`groupBy itemPcpId`, `count` em lotes `criadoPorId`). Fallback quando vazio: os 6 mais etiquetados por todos.
- `GET /equipe` → chips de responsável: vendedores ativos com `permissoes.pcp.etiquetas` verdadeiro (filtra em JS, o JSON é objeto — ver armadilha "permissões são objeto") + o usuário logado sempre primeiro.
- `GET /hoje?data=YYYY-MM-DD` → lotes do dia com `{lote,nomeImpresso,pesoGramas,conservacao,validade,responsavelNome,createdAt,quantidade,tamanho,statusImpressao}` e totais (etiquetas, lotes). Também aceita `?de=&ate=&itemPcpId=` (histórico).
- `POST /imprimir`
  `{ requisicaoId, itemPcpId? , nomeLivre? , fabricacao:'YYYY-MM-DD', conservacao, validadeDias | validade, pesoGramas?, quantidade(1..200), tamanho:'40x25'|'100x120', impressoraId?, responsavelId }`
  Validações: `fabricacao` entre hoje−7 e hoje; `validade ≥ fabricacao`; `validadeDias 1..730`; peso 1..2.000.000 g; `responsavelId` é vendedor ativo; impressora ativa do `tamanho` (se `impressoraId` ausente e houver >1 → 400 pedindo escolha; se nenhuma → 409 "nenhuma impressora configurada para 40×25"). `nomeLivre`: normaliza (trim, colapsa espaços, `localeCompare` sem acento) → busca item existente (nome igual, case/acento-insensitive) antes de criar; só então cria `ItemPcp` `tipo:'SUB'`, `origem:'COZINHA'`, `grupoCozinha:'OUTRO'`, `unidade:'KG'`, código via `pcpItemService.proximoCodigoSub()`. `validadeAlterada = validadeDias !== sugerida`. `requisicaoId` repetido → devolve o lote já criado (idempotente), **não** cria outro.
  Resp: `{ lote:{id,lote,…}, trabalho:{id,status}, agente:{estado}, aviso? }`. Se o agente está OFFLINE ainda enfileira (expira em 15 min) e devolve `aviso:"O computador da cozinha parece desligado. A etiqueta fica na fila por 15 minutos."`.
- `POST /lotes/:id/reimprimir` `{quantidade?, impressoraId?}` → novo trabalho, **mesmo lote**, `reimpressoes+1`, chave de idempotência nova (`reimp-<loteId>-<uuid>`).
- `GET /lotes/:id` → detalhe + trabalhos.
- Itens PCP: `PUT /api/pcp/itens/:id` passa a aceitar `validadeRefrigeradoDias`, `validadeCongeladoDias`, `grupoCozinha` (validação `1..730` / enum). Mudança em `pcpItemService.atualizar` **fora** do `if (item.produtoId)`.

### 2.6 Regras de negócio resumidas
- Validade sugerida: `conservacao==='CONGELADO' ? validadeCongeladoDias : validadeRefrigeradoDias`; se o item não tem prazo cadastrado, a gaveta **não inventa** (vazio + destaque "defina a validade") e os chips 3/7/30/90 ficam disponíveis; `validade_alterada=true` quando difere.
- Peso informativo apenas; **nada** toca `estoqueAtual`/`movimentacoes_pcp`.
- Quantidade ímpar em 40×25: última etiqueta sai sozinha (coluna vazia) — decisão do dono.
- Lote repetido em reimpressão; impressão nova = lote novo.

---

## 3. Geração de etiqueta no servidor

Arquivo: `backend/services/etiquetaCozinhaRender.js` (funções **puras**, sem banco): `renderEpl2Pequena(dados, impressora) → Buffer`, `renderZplGrande(dados, impressora) → Buffer`, `renderTeste(tipo, impressora) → Buffer`. Testes em `backend/tests/etiquetaCozinhaRender.test.js` (`node --test`): quantidade par/ímpar, nome curto/longo/50+ caracteres, acentos, nome com aspas/`^`/`~` (escape!), validade em virada de mês/ano.

Entrada comum: `{ nome, fabricacao, validade, conservacao, pesoGramas, lote, responsavelIniciais, responsavelNome, quantidade }`. Dia da semana calculado da string `YYYY-MM-DD` sem `new Date(str)` (que vira UTC e erra o dia): partir de `new Date(y, m-1, d)`.
Sanitização: maiúsculas no nome da pequena; remover caracteres de controle; EPL2 escapa `"` e `\` com `\`; ZPL troca `^`, `~`, `\` por espaço.

### 3.1 EPL2 — 40×25, 2 colunas, rolo 84×25 (203 dpi → 8 dots/mm)
Geometria: etiqueta = 320×200 dots; rolo = 672×200. Coluna 1 `ox=16` (2 mm de margem esquerda, igual ao CSS `padding-left:2mm` de `etiquetasCaixas.js`), coluna 2 `ox=16+320+16=352` (gap de 2 mm). Ambos configuráveis em `ajustes.col1X/col2X/offsetY`.

Cabeçalho de cada trabalho: `N` · `q672` · `Q200,<gapDots>` · `D<densidade, 8>` · `S<velocidade, 2>` · `ZT` · (se `removerAcentos=false`: `I8,A,055`/valor validado; **não ligar sem validar**).
Por "formulário" (par de etiquetas): `…elementos col1… …elementos col2… P1`. Para N etiquetas: `floor(N/2)` formulários iguais com um único `P<floor(N/2)>` + 1 formulário final com só a coluna 1 se N for ímpar.

Elementos de uma coluna (coordenadas relativas `ox`, `y` em dots):
| Elemento | Comando | Detalhe |
|---|---|---|
| Faixa do dia (esquerda) | `LO ox,0,48,200` | preto, 6 mm |
| Texto da faixa `QUA 15/10` | `A ox+14,~y,3,3,1,1,R,"QUA 15/10"` | fonte 3 (12×20), rotação 3 (270°, lê de baixo p/ cima), `R` = vídeo reverso sobre o preto. y centraliza: `(200+9*12)/2`. **Âncora de texto rotacionado: validar** |
| Nome (até 2 linhas) | `A ox+56,6,0,F,M,M,N,"LINHA1"` e linha 2 em `y+alturaFonte+2` | área útil 260 dots. Auto-ajuste: tenta (fonte 4 · 14×24 → 18 car/linha), (fonte 3 · 12×20 → 21), (fonte 2 · 10×16 → 26); escolhe a **maior** em que o nome quebra em ≤2 linhas por palavra; se ainda não cabe, usa fonte 2 e corta na 2ª linha. (Equivalente ao `useAutoFit` da tela.) |
| Caixa da validade | `X ox+56,72,3,ox+316,134` | retângulo 260×62, borda 3 |
| Texto da validade | `A ox+64,86,0,3,1,1,N,"VAL"` e `A ox+112,79,0,5,1,1,N,"18/10"` | fonte 5 (32×48): "18/10" = 5×32 = 160 dots, cabe com folga. **Se a validade cruzar de ano, imprimir `18/10/27`?** → decisão: pequena sempre `DD/MM` (mockup); o ano só na grande |
| Rodapé 1 | `A ox+56,142,0,2,1,1,N,"FAB 15/10  2,0kg"` | fonte 2 (10×16), ≤26 car; peso omitido se vazio |
| Rodapé 2 | `A ox+56,168,0,2,1,1,N,"REFRIG  L251015-03 MA"` | conservação escrita `REFRIG`/`CONGEL` (sem `°`, que é caractere fora do ASCII) |
**Margem de baixo:** 168+16 = 184 de 200 — 2 mm de respiro. Se na calibração a última linha cortar, subir `offsetY` em `ajustes`.

### 3.2 O que PRECISA ser validado na Zebra TLP 2844 real
1. Gap/sensor: `Q200,24` assume ~3 mm de gap; se pular etiqueta, calibrar (segurar o botão Feed na ligação, ou enviar `xa`) e ajustar `gapDots`.
2. Posição horizontal real das duas colunas (`col1X/col2X`) — comparar com o que o driver imprimia no Kit Festa.
3. Âncora do texto rotacionado (faixa do dia): em EPL2 a rotação 3 ancora no canto inferior esquerdo; se sair deslocado, ajustar a fórmula do `y`.
4. Acentos: começar com `removerAcentos=true` (ASCII). Só depois testar `I8,A,055` (Windows-1252) / `I8,1,055` (850) com um nome "AÇÚCAR REFINADO" e então liberar acento.
5. Densidade `D8` / velocidade `S2` — legibilidade do 5 grande (fonte 5) e do rodapé em fonte 2.
6. Peso/altura reais de cada fonte (1–5) conferidos contra régua; se divergir, ajustar a tabela de larguras do auto-ajuste.

### 3.3 ZPL — 100×120 (ZDesigner), assumindo 203 dpi (confirmar)
Dots: 800 (cabeça, 100 mm) × 960 (avanço, 120 mm). Se o `dpi` cadastrado for 300, todas as coordenadas são multiplicadas por `dpi/203` (função `px(n)`).
Cabeçalho: `^XA` `^CI28` (UTF-8, acentos nativos) `^PW800` `^LL960` `^LH0,0` `~SD<densidade>` e, se `rotacao=180`, `^POI`; `rotacao=90/270` ⇒ trocar para `^PW960 ^LL800` e usar `^FWR`/`^FWB` globais. `^PQ<quantidade>,0,1,N` antes do `^XZ`.
| Elemento | ZPL |
|---|---|
| Faixa do dia (topo, preta) | `^FO0,0^GB800,110,110^FS` |
| Dia por extenso + data | `^FO30,30^FR^A0N,56,56^FDQUARTA · 15/10^FS` (`^FR` = reverso sobre o preto) |
| Conservação (direita da faixa) | `^FO480,34^FR^A0N,40,40^FDREFRIGERADO 0-4 C^FS` |
| Nome grande | `^FO40,140^A0N,<h>,<h*0,55>^FB720,3,6,L^FD…^FS` — `h` auto-ajustado: parte de 120 e desce de 8 em 8 até 52, estimando largura média de caractere ≈ 0,52×h e exigindo ≤3 linhas; abaixo de 52 trunca |
| Fabricação | `^FO40,500^A0N,32,32^FDFabricação^FS` + `^FO40,540^A0N,64,64^FD15/10/2026^FS` |
| Caixa da validade | `^FO400,470^GB360,190,6^FS` + `^FO420,490^A0N,32,32^FDVALIDADE^FS` + `^FO420,540^A0N,84,84^FD18/10/2026^FS` (fonte cai p/ 72 se a data tiver 10 dígitos largos) |
| Peso | `^FO40,720^A0N,48,48^FDPeso: 2,0 kg^FS` (omitido se vazio) |
| Lote | `^FO40,790^A0N,48,48^FDLote: 251015-03^FS` |
| Responsável | `^FO40,860^A0N,36,36^FDResp.: Maria A.^FS` |
| Rodapé | `^FO40,915^A0N,28,28^FDHardt Salgados · PCP^FS` |
Reserva visual (sem imprimir nada agora) para o QR da fase 3: canto inferior direito 180×180.

### 3.4 O que PRECISA ser validado na ZDesigner real (modelo desconhecido)
1. **Linguagem**: o `driver` que o agente reporta já diz muito (`ZDesigner ZT230-203dpi ZPL`, `…TLP 2844 EPL`, `GK420`…). O botão **Teste de impressão** tem 3 variantes: `TEXTO_EPL2` (3 linhas simples), `TEXTO_ZPL` (3 linhas simples) e `ETIQUETA_EXEMPLO` (layout real com dados fictícios, na linguagem cadastrada). Impressora que recebe linguagem errada imprime lixo ASCII ou nada → o operador marca "qual saiu certa" e o cadastro fica `linguagem` correta. Isso é a descoberta empírica pedida.
2. DPI (203 vs 300) — medir a etiqueta de exemplo com régua: a caixa de validade deve ter 45,5 mm de largura.
3. **Orientação**: hoje o driver gira a página. Em RAW a impressora imprime como está calibrada: conferir se o topo da faixa preta sai no lado certo; corrigir pelo campo `rotacao` (0/90/180/270), não por código.
4. Largura de caractere do auto-ajuste da fonte 0 (`^A0`) — conferir nome longo real ("RECHEIO DE FRANGO COM CATUPIRY E REQUEIJÃO").
5. Acento com `^CI28` (UTF-8) e a fonte 0 padrão; se vier quadrado, trocar para `^CI27`/remover acentos (`removerAcentos=true`).
6. Margens (`^LH`) e se a impressora precisa de `^MNY`/`^MNW` (sensor de gap vs. marca preta) — comportamento do rolo 100×120.

---

## 4. Agente Windows

### 4.1 Decisão: **PowerShell puro (`agente.ps1`)**, sem Node
Motivos: Windows 10 Pro 22H2 já traz PowerShell 5.1 e .NET Framework 4.8 → **nada a instalar**, nada para o Defender implicar (`pkg`/SEA geram `.exe` não assinado que costuma ser colocado em quarentena); atualização = baixar um texto; um leigo não instala Node 20 num i3 de 2012. O custo (código P/Invoke para o spooler) é pequeno e conhecido. Alternativas descartadas: Node + NSSM (exige instalar Node + NSSM + manter versão); `copy /b arquivo \\PRODUCAO\impressora` (exige compartilhar a impressora, depende do nome do PC — que **vai mudar** para `PRODUCAO` — e não dá confirmação nem status).

### 4.2 Envio RAW ao spooler
`Add-Type` com C# inline chamando `winspool.drv`: `OpenPrinter` → `StartDocPrinter` (nível 1, `pDatatype = "RAW"`) → `StartPagePrinter` → `WritePrinter(bytes)` → `EndPagePrinter` → `EndDocPrinter` → `ClosePrinter`. Funciona com driver ZDesigner/"Generic/Text Only" (o RAW dispensa o driver interpretar o conteúdo).
Antes: consulta `Win32_Printer` (`WorkOffline`, `PrinterStatus`, `DetectedErrorState`); se offline/sem papel ⇒ `ERRO "Impressora offline ou sem papel"` **sem** gravar na fila do Windows (evita o falso "IMPRESSO" quando o spooler aceita e a impressora está desligada).
Depois: espera até 20 s o job sair da fila (`Win32_PrintJob` / `Get-PrintJob`); sumiu ⇒ `IMPRESSO`; ficou preso ⇒ `ERRO` com o status do job.

### 4.3 Comportamento
- Pasta `C:\CAHardtAgente\`: `agente.ps1`, `config.json` (`{url, token}`; ACL só SYSTEM e Administradores via `icacls`), `agente.log` (rotação ao passar de 1 MB, guarda 5), `feitos.log` (ids já impressos, últimos 500).
- Laço: `POST /sincronizar` a cada 3 s (timeout 15 s); em erro de rede, espera crescente 3→30 s e loga uma linha por mudança de estado (não por tentativa). TLS 1.2 forçado (`[Net.ServicePointManager]::SecurityProtocol`).
- Lista de impressoras (`Get-Printer` + `Get-CimInstance Win32_Printer`: Name, DriverName, PortName, Default, estado) enviada no 1º ciclo, a cada 5 min e quando `pedirImpressoras`.
- Instância única (mutex nomeado).
- **Autoatualização:** a resposta traz `atualizar:true` se `versaoServidor != versao`; o agente baixa `GET /script`, valida a sintaxe (`[System.Management.Automation.Language.Parser]::ParseFile`), troca o arquivo, inicia um novo `powershell` e sai.
- Nunca imprime trabalho expirado (`expiraEm` < agora) — responde `ERRO "expirado"`.

### 4.4 Instalação por leigo (`instalar.bat`)
O `.bat` é **gerado pelo backend** na hora de criar/rotacionar o token (vem em `instaladorBat`; o front oferece "Baixar instalador do PC da cozinha"); contém a URL e o token. Passos para o dono (escrever na tela, em português simples, com 4 passos numerados):
1. No PC da cozinha, abrir o app, ir em Configurações → Impressoras → "Baixar instalador".
2. Clicar com o botão direito no arquivo baixado → **Executar como administrador**.
3. Esperar a mensagem verde "Agente instalado e funcionando".
4. Voltar ao app: a bolinha do agente fica verde e as duas impressoras aparecem para cadastrar.

O que o `.bat` faz: cria `C:\CAHardtAgente`; grava `config.json`; baixa `agente.ps1` (`powershell -Command Invoke-WebRequest … -Headers @{ 'x-agente-token'=… }`); registra a tarefa agendada **`CAHardt Agente de Impressao`** (via `Register-ScheduledTask`): gatilhos *ao iniciar o Windows* **e** *repetir a cada 5 min* (`MultipleInstances=IgnoreNew` ⇒ vigia que ressuscita se travar), usuário `SYSTEM`, privilégios máximos, `-ExecutionPolicy Bypass -WindowStyle Hidden`, reiniciar em falha, sem limite de tempo, roda mesmo na bateria; inicia a tarefa; valida a conexão (`/sincronizar` de teste) e mostra o resultado. Não depende de login nem de o PC se chamar `PRODUCAO`.
Desinstalar: `desinstalar.bat` gerado junto (remove tarefa + pasta).
Outros requisitos do PC: desligar suspensão/hibernação (powercfg) e "Reiniciar após atualização" fora do horário — **o instalador executa** `powercfg /change standby-timeout-ac 0` e `hibernate-timeout-ac 0`.

### 4.5 Segurança
- Só HTTPS. Token com prefixo `cahp_`, 256 bits, hash no banco, mostrado uma vez; rotação/revogação na tela; o `.bat` baixado contém o token ⇒ avisar "apague depois de instalar" e o instalador oferece apagar-se.
- O token só autoriza as rotas do agente e só as impressoras do próprio agente. Vazou ⇒ **Rotacionar** (1 clique) e reinstalar.
- Conteúdo dos trabalhos é só texto de etiqueta (sem dado sensível de cliente).
- Registrar em `audit_logs` (se já houver helper no projeto, usar) criação/rotação/revogação de token.

---

## 5. Riscos e efeitos colaterais

Verificação feita (grep no repositório): nenhum código existente referencia `impressao_fila`, `impressoras` ou `pcp/etiquetas-cozinha`; as rotas `/api/impressao` e `/api/impressao-agente` não colidem com `/api/pcp-impressao` (`backend/index.js:215`, PDF de receita). Quem consome `ItemPcp`: `pcpEstoqueService.js:15`, `pcpReceitaService.js:115,241,697`, `pcpSugestaoService.js:20`, `financeiroGerencialService.js:810`, `indicadoresGestaoService.js:736`, `indicadoresAjustesService.js:57,59,114,125` — **todos usam `select` explícito ou filtro**, então colunas novas não quebram nenhum; porém:

1. **Item "Digitar" polui Estoque PCP e Itens.** `pcpEstoqueService.listar` lista todo `ItemPcp`. Item `origem='COZINHA'` apareceria no Estoque PCP com saldo 0. **Plano:** filtrar `origem != 'COZINHA'` em `pcpEstoqueService` (e conferir `pcpSugestaoService`: itens abaixo do mínimo — mínimo 0 não dispara). Em Itens PCP, selo "criado na cozinha" + filtro. Regra do projeto sobre `not` excluir null: `origem` tem default `"CADASTRO"`, não é null; mesmo assim usar `OR` explícito se houver registros antigos.
2. **Agente offline** (PC desligado, internet caiu, Windows atualizando): o clique enfileira; `expira_em = agora + 15 min` (parâmetro `impressao_expira_min` em `app_configs`); passou ⇒ `EXPIRADO` e a linha em "Hoje na cozinha" mostra "não saiu — reimprimir". Etiqueta velha **nunca** sai sozinha horas depois.
3. **Etiqueta em dobro** (resultado perdido na rede): coberto por `feitos.log` + `emAndamento` (2.4). Teste obrigatório: matar a rede do agente logo após imprimir.
4. **Falso "saiu"** (spooler aceita, impressora desligada): coberto pela checagem de estado + espera da fila (4.2). Mesmo assim, no iPad escrever "enviado à impressora" e só "saiu" quando `IMPRESSO` confirmado.
5. **Linguagem errada** na ZDesigner imprime lixo e gasta etiqueta: o cadastro nasce **sem** impressora ativa para a cozinha até o teste ser aprovado; `linguagem` é obrigatória e o teste é o caminho.
6. **Kit Festa e etiqueta de produto NÃO mudam.** Continuam via `imprimirNaPagina` + driver. O RAW usa a mesma fila do Windows, então os dois modos coexistem, mas **se alguém imprimir pelo navegador no PC da cozinha ao mesmo tempo** o spooler serializa — sem conflito, só espera.
7. **Renomear o PC para `PRODUCAO`:** o agente identifica-se por token, não por hostname; renomear só exige reiniciar (o `hostname` do cadastro atualiza sozinho). Se o PC for formatado: reinstalar com o `.bat` (rotacionar token).
8. **Token vazado:** rotação em 1 clique; endpoints do agente só leem/escrevem fila de impressão.
9. **Banco compartilhado lento:** `sincronizar` é chamado a cada 3 s, 24 h ⇒ ~29 mil chamadas/dia. Mitigação: um `SELECT` indexado `(status, pedido_em)` e **escrita de `ultimo_contato` só a cada ≥15 s**; sem `$transaction`; fila antiga limpa pelo worker (conteúdo `Bytes` apagado após 7 dias, linha após 90). Se a carga incomodar, trocar por long-poll de 20 s (mesmo contrato).
10. **`$transaction`:** lote+trabalhos em uma transação com `{ timeout: 20000, maxWait: 10000 }`; **bytes gerados e checagens antes**, log/auditoria depois, nada de rede dentro.
11. **Fuso/datas:** datas como `YYYY-MM-DD`; "hoje" calculado com `TZ` do processo; no front, cuidado com `new Date('YYYY-MM-DD')` (UTC) — usar parser local.
12. **PWA/iPad:** `POST /imprimir` precisa ser idempotente (`requisicaoId`) — o anti-clique-duplo do projeto não basta se a rede reenviar. A gaveta **não** usa `imprimirNaPagina` (não abrir diálogo); se o dono depois quiser um fallback "imprimir pelo navegador", é decisão à parte.
13. **Permissões:** a tela de Impressoras é **admin-only** (backend `perms.admin`, front `isAdmin`) — espelhar exatamente; a aba da cozinha usa `canPcp('etiquetas')` = `isAdmin || !!perms.pcp.etiquetas` no front e o mesmo no backend. Não criar permissão nova (evita o `BOOL_INDEX` do painel).
14. **Falha de deploy:** só campos novos nullable/default; nenhum `@unique` novo em tabela com dados existentes; tabelas novas começam vazias ⇒ `prisma db push` seguro.
15. **Nome do arquivo `agente.ps1` no servidor:** vive em `backend/agente-impressao/` (código, não upload) — **não** em `uploads/`. Conferir que o `Dockerfile` copia a pasta (`COPY . .` copia).

---

## 6. Critérios de aceite

### E1 — Infra de impressão
**Backend (curl, sem navegador):**
- Criar agente → resposta traz `token` e `instaladorBat` uma única vez; `GET /agentes` não devolve token nem hash.
- `/api/impressao-agente/sincronizar` sem token ou com token errado ⇒ 401; com token revogado ⇒ 401; com token de outro agente não vê a fila alheia.
- Criar trabalho de teste ⇒ aparece no `sincronizar` como `ENVIANDO` **uma única vez** (duas chamadas paralelas não duplicam: `SKIP LOCKED`); `resultado IMPRESSO` duas vezes ⇒ ok idempotente.
- Trabalho com `expira_em` no passado nunca é entregue e vira `EXPIRADO` no worker.
- Testes `node --test` dos geradores passam (par/ímpar, nome longo, escape de `^ ~ "`).
- Rota admin-only devolve 403 para usuário comum com `pcp.etiquetas`.
**Frontend (QA clicando, desktop + 375 px):** Configurações → Impressoras: criar agente, ver token uma vez, baixar `.bat`; bolinha vermelha com agente sem contato / verde com contato; cadastrar impressora **escolhendo da lista** reportada; botões de teste; fila com status; sem scroll horizontal; permissão (menu some para não-admin).
**EM PRODUÇÃO, com o PC e as duas Zebras de verdade** (regra do CLAUDE.md: depende de ambiente ⇒ só é pronto testado lá; o QA de desenvolvimento NÃO prova isto):
1. Quem clica: o dono/dev no PC `PRODUCAO` instala pelo `.bat`; depois o clique é feito **do iPad e do celular**, não do PC.
2. Bolinha verde em ≤10 s após instalar; as 2 impressoras aparecem na lista com driver.
3. Teste TEXTO na TLP 2844: sai texto legível (EPL2). Teste TEXTO na ZDesigner: o dono diz qual das duas variantes (EPL2/ZPL) saiu legível ⇒ cadastrar `linguagem`.
4. `ETIQUETA_EXEMPLO` 40×25: **duas colunas** (uma etiqueta em cada lado do rolo de 84), faixa preta com o dia à esquerda, validade em caixa, rodapé inteiro (nada cortado, sem pular etiqueta). Quantidade 3 ⇒ sai 1 par + 1 etiqueta sozinha, sem perder a seguinte.
5. `ETIQUETA_EXEMPLO` 100×120 na ZDesigner: faixa preta no topo, nome grande em ≤3 linhas, validade em caixa de 45,5 mm de largura (confere 203 dpi), orientação certa.
6. **Sem diálogo, sem OK, em nenhum aparelho.**
7. Reiniciar o PC (já com nome `PRODUCAO`) **sem logar** ⇒ em ≤2 min a bolinha volta a ficar verde (prova do início automático).
8. Desligar a internet do PC, clicar teste do iPad, religar em <15 min ⇒ imprime **uma** etiqueta; religar depois de 15 min ⇒ não imprime e a fila mostra "expirado".
9. Passar **um deploy do backend** no meio (regra "atravessar deploy"): agente reconecta sozinho e a fila volta a andar.
10. Kit Festa e etiqueta de produto continuam imprimindo como antes (prova de não-regressão).

### E2 — Aba Etiquetas da Cozinha
- `/pcp/etiquetas/cozinha` abre pelo menu PCP; só aparece/abre com `pcp.etiquetas` (usuário "Producao" com e sem a flag); front e back conferem a mesma regra.
- Filtros Favoritos/Recheios/Massas/Outros/Todos com contagem; escolha lembrada (`useFiltrosSalvos`, **não** a busca); busca acha por pedaço do nome; todos os `SelectBusca` com opções visíveis (helper devolvendo ARRAY, não Fragment — armadilha registrada).
- Gaveta: Hoje/Ontem/Outra; troca Refrigerado↔Congelado troca a validade sugerida e mostra a data final; chips de prazo; marcar `validadeAlterada` quando muda; peso opcional (kg na tela, gramas no banco); quantidade; tamanho lembrado por item; responsável (logado + chips + "outra pessoa").
- Imprimir: **toque único** ⇒ botão desabilita, mostra "Enviando… → Imprimindo… → Saiu ✓"; agente offline mostra o aviso e a linha fica "na fila"; erro da impressora mostra mensagem humana e botão "Tentar de novo" (que cria trabalho novo).
- Clique duplo / reenvio de rede ⇒ **um** lote e **uma** impressão.
- Lote `AAMMDD-NN` sequencial no dia (e reinicia no dia seguinte); 2 usuários clicando ao mesmo tempo não geram lote repetido.
- "Hoje na cozinha": totais, cor/estado, **Reimprimir** repete o mesmo lote e incrementa `reimpressoes`.
- "Digitar" cria item novo uma vez (nome repetido com outra caixa/acento reaproveita o existente), aparece em Outros, **não** aparece no Estoque PCP.
- Itens PCP: edita os dois prazos e o grupo (para SUB órfão e para item importado).
- Mobile 375 px e iPad: blocos ≥52 px, sem scroll horizontal, gaveta como bottom-sheet.
- **EM PRODUÇÃO:** o fluxo completo nas duas Zebras, a partir do iPad real: (a) recheio de frango 40×25 qtd 3; (b) massa 100×120 qtd 1; (c) reimprimir (mesmo lote); (d) texto com acento ("Açúcar"); (e) nome de 45 caracteres; (f) congelado 90 dias; (g) agente desligado ⇒ aviso.
- Manual `backend/manuais/abas/pcp-etiquetas-cozinha.md` + linha no `README.md` + entradas em `ABAS` (`copilotoService.js`) para a aba da cozinha **e** `configuracoes-impressoras`; `frontend/public/novidade-etiquetas-cozinha.html` (mockups das telas, accordions abertos, sem `og:image`, sem "Abrir o app") + entrada no topo de `frontend/public/novidades.json`; `deployMarker` do `/admin-exec/ping` bumpado nos dois deploys.

---

## 7. Arquivos e ordem

### E1 — dev-backend (ordem)
1. `backend/prisma/schema.prisma` — modelos `ImpressaoAgente`, `Impressora`, `ImpressaoTrabalho` (sem relação com lotes ainda) + 5 campos novos em `ItemPcp` (2.2). Validar com `npx prisma validate`; **nada removido**.
2. `backend/services/etiquetaCozinhaRender.js` + `backend/tests/etiquetaCozinhaRender.test.js` (3.1–3.4).
3. `backend/services/impressaoService.js` — token (gerar/hash/comparar), `estadoAgente`, `enfileirar({impressoraId,tipo,conteudo,…})`, `reivindicar(agenteId)`, `registrarResultado`, `expirarELimpar`, `gerarInstaladorBat`.
4. `backend/agente-impressao/agente.ps1` + `VERSAO` (constante em `impressaoService`) — escrito de acordo com 4.2–4.4.
5. `backend/routes/impressaoRoutes.js` (2.3) e `backend/routes/impressaoAgenteRoutes.js` (2.4); montar ambos em `backend/index.js` (a do agente junto das públicas, **sem** `authMiddleware`).
6. `backend/workers/scheduler.js` — `setInterval` 60 s: expira `PENDENTE` vencido; devolve `ENVIANDO` travado (>90 s e fora de `emAndamento`) respeitando `maxTentativas`; 1×/dia apaga `conteudo` >7 dias e linhas >90 dias.
7. `backend/routes/adminExec.js` — `deployMarker` + (opcional) rota `diag-impressao` (agentes, última fila) para diagnóstico em produção.
8. `backend/manuais/abas/configuracoes-impressoras.md`, `README.md` do índice, `ABAS` em `backend/services/copilotoService.js`.
9. `pcpItemService.atualizar/criar` aceitar os campos novos pode esperar o E2, mas **o schema não**.

### E1 — dev-frontend (em paralelo, contra o contrato 2.3)
1. `frontend/src/pages/Configuracoes/Impressoras.jsx` (+ subcomponentes se passar de ~400 linhas: `AgenteCard`, `ImpressoraForm`, `FilaImpressao`): cards no padrão do design system; token em modal "copie agora" + botão baixar `.bat` (Blob); lista de impressoras do Windows via `SelectBusca`; botões de teste; fila com `useFiltrosSalvos('impressoras:status', …)`; versão mobile (cards); auto-refresh a cada 5 s com a aba visível.
2. `frontend/src/App.jsx` — `lazyComRetry` da página; rota `/config/impressoras` com `<PrivateRoute tab="configuracoes">`; item "Impressoras" no menu Configurações (`showConfig` + admin, **o mesmo critério do backend**).
3. `cd frontend && npm run build` antes de entregar.

### E2 — dev-backend
1. `schema.prisma` — `EtiquetaCozinhaLote` + relação `ImpressaoTrabalho.loteId`; `@@unique` e índices (2.2).
2. `backend/services/pcpItemService.js` — aceitar `validadeRefrigeradoDias`, `validadeCongeladoDias`, `grupoCozinha` nos dois ramos de `atualizar`; `criarDaCozinha(nome)`; `backend/routes/pcpItemRoutes.js` validar enum/faixa.
3. `backend/services/pcpEstoqueService.js` — excluir `origem='COZINHA'`.
4. `backend/services/etiquetaCozinhaService.js` — `itens`, `favoritos`, `equipe`, `hoje`, `imprimir` (idempotência `requisicaoId`, lote com retry, transação), `reimprimir`.
5. `backend/routes/pcpEtiquetaCozinhaRoutes.js` (2.5) e montagem em `backend/index.js` junto de `/api/pcp/etiquetas` (montar **antes** dela — `/api/pcp/etiquetas/:id` capturaria `cozinha`; usar prefixo distinto `/api/pcp/etiquetas-cozinha` evita o problema, que é o que está no contrato).
6. Backfill opcional por rota admin `etiquetas-cozinha-classificar` (heurística por nome: começa com "recheio"→RECHEIO, "massa"→MASSA; **dry-run por padrão**, dono confirma antes de gravar).
7. Manual `pcp-etiquetas-cozinha.md`, README, `ABAS`; `deployMarker`.

### E2 — dev-frontend
1. `frontend/src/pages/PCP/EtiquetasCozinha.jsx` (aba) + `frontend/src/pages/PCP/cozinha/` : `BlocoItem.jsx`, `GavetaEtiqueta.jsx`, `PreviewEtiquetaCozinha.jsx` (CSS do mockup, **só visual**), `HojeNaCozinha.jsx`, `useEnvioEtiqueta.js` (POST + polling do trabalho + estados).
2. `frontend/src/pages/PCP/ItensPcp.jsx` e `ItemPcpForm.jsx` — campos "Validade refrigerado (dias)", "Validade congelado (dias)", "Grupo na cozinha"; selo "Criado na cozinha".
3. `frontend/src/App.jsx` — rota `/pcp/etiquetas/cozinha` (**antes** de `/pcp/etiquetas/:id/...` não há conflito, mas manter junto das demais) com `lazyComRetry`; menu PCP `canPcp('etiquetas') && { to:'/pcp/etiquetas/cozinha', icon: Tag/ChefHat, label:'Etiq. Cozinha' }`.
4. `frontend/public/novidade-etiquetas-cozinha.html` + `frontend/public/novidades.json`.
5. Build.

### Revisor: conferir
Sem `window.open`/iframe/`imprimirNaPagina` nesta aba; token nunca em log/`localStorage`; `$transaction` com timeout; `P2002` tratado; `select` do Prisma validado contra o schema (campo inexistente derruba a rota); permissões front=back; nada removido do schema; Kit Festa/`EtiquetaImprimir.jsx` sem diff.

---

## 8. O que NÃO fazer
1. **Não** usar `window.open`, iframe nem `imprimirNaPagina` na aba nova (o objetivo é justamente não abrir diálogo); e **não** mexer em `etiquetasCaixas.js`, `EtiquetaImprimir.jsx`, `imprimirNaPagina.js` nesta entrega.
2. **Não** guardar token do agente em repositório, `app_configs`, log, `localStorage` ou URL; nunca devolvê-lo depois da criação.
3. **Não** deixar etiqueta pendente imprimir tarde (expirar); **não** reentregar job `ENVIANDO` sem as travas de duplicata.
4. **Não** declarar "IMPRESSO" só porque o spooler aceitou.
5. **Não** ligar acento no EPL2 antes de validar; **não** assumir 203 dpi nem a linguagem da ZDesigner — o teste decide.
6. **Não** criar permissão nova; **não** deixar `Impressoras` visível a quem não é admin; checar `perms.pcp.etiquetas` como **objeto**, nunca `!!perms.pcp`.
7. **Não** mexer em estoque PCP com o peso; **não** deixar item "da cozinha" aparecer no Estoque PCP.
8. **Não** usar `new Date('YYYY-MM-DD')` para dia da semana/lote (UTC erra o dia à noite).
9. **Não** colocar chamada de rede/log dentro de `$transaction`; **não** esquecer `{ timeout: 20000, maxWait: 10000 }`.
10. **Não** remover/renomear nada do schema; **não** declarar o E1 pronto sem o teste em produção com as duas Zebras e um deploy no meio.
11. **Não** pôr o `agente.ps1` em `uploads/` nem exigir Node/`pkg` no PC da cozinha.
12. **Não** trocar o `<select>` por nativo; **não** usar `React.lazy` (usar `lazyComRetry`); **não** esquecer manual/Clippy/novidade ao final.

## 9. Pendências para o dono (não bloqueiam o E1)
- Modelo exato/dpi/linguagem da impressora grande (o teste responde).
- Quais itens atuais são Recheio e quais são Massa (definir `grupoCozinha`; o backfill por nome é só sugestão em dry-run).
- Validade refrigerado/congelado de cada item (preencher em Itens PCP).
- Confirmar suspensão/hibernação desligadas e janela de atualização do Windows no PC `PRODUCAO`.

Porte: **GRANDE** (E1 média-grande por causa do ambiente; E2 média).
