# Separação de Carga — plano de implementação

Data: 18/11/2026 · Porte: **GRANDE** (tela nova + offline + permissão nova + schema + fila de impressão). Equipe completa: dev-backend e dev-frontend em paralelo (a costura é a seção 2) → qa-testador + revisor-codigo → gerente-entrega.

Fonte da verdade do desenho (aprovado em 18/11): `docs/propostas/proposta-separacao-carga.html`. A tela React reproduz o mock; este plano só diz COMO ligar a dados, offline e impressão.

---

## 0. Entendimento do pedido

Tela "Separação de Carga" (menu Logística) que substitui a folha de embarque na hora de separar mercadoria na câmara fria: letra grande (A−/A+ escala a tela inteira), botões grandes, três números por linha (SEPARAR / SEPAREI / FALTA), dois modos (Carga inteira = soma por produto; Por pedido = bolsa térmica, um pedido por vez), motivo da falta ("Vem depois" / "Não tem"), lista "Ficou faltando", "Concluir separação", ordem dos pedidos (Da carga / Por cidade / Eu escolho), bolsas + etiqueta por bolsa, e **funciona 100% offline** dentro da câmara. A falta só **fica registrada na separação**: não toca em pedido, nota, estoque nem fiscal.

Interpretações adotadas (onde o mock/briefing deixam folga):
- Os dois modos têm **estado separado**, como no mock (chaves `c:<produto>` e `p:<pedido>:<produto>`). Separar em "Carga inteira" NÃO preenche o "Por pedido". (Decisão D1 abaixo.)
- "Carga ainda não saída": o Embarque **não tem** campo de status de saída (confirmado em `backend/prisma/schema.prisma:1931`). Regra adotada: `dataSaida >= ontem (fuso Brasília)` **e** `conferenciaConcluidaEm IS NULL` (a conferência da doca é o último passo antes do caminhão sair). (D2.)
- Pedido `cancelado` ou `devolucaoFinalizada` **não entra** na separação (nada a separar). A folha atual (`GET /api/embarques/:id`, `embarques.js:218`) não filtra isso — divergência consciente.
- Amostras da carga (`embarque.amostras`) NÃO são linhas de separação na v1; a tela só avisa "esta carga tem N amostra(s), separar à parte" (D3).

---

## 1. Modelo de dados (Prisma, só ADITIVO — appendar no FIM de `schema.prisma`)

Nenhum model existente é alterado (sem relação nova em `Embarque`/`Pedido`/`Produto`): ids guardados como `String` + `@@index`. Isso evita tocar modelos compartilhados e não pode quebrar o `prisma db push`. Relações só entre os models novos (cascade).

```prisma
// Separação de carga na câmara fria (11/2026). A falta fica REGISTRADA aqui — não altera pedido/nota/estoque.
model SeparacaoCarga {
  id           String    @id @default(uuid())
  embarqueId   String    @unique @map("embarque_id")        // 1 separação por carga
  ordemRegra   String    @default("CARGA") @map("ordem_regra") // CARGA | CIDADE | MANUAL (ordem dos pedidos, guardada NA carga)
  ordemManual  Json?     @map("ordem_manual")               // ["pedidoId", ...] quando MANUAL (último toque vence, em bloco)
  ordemEm      DateTime? @map("ordem_em")                   // carimbo (relógio corrigido) da última mudança de regra/ordem
  criadoPorId  String?   @map("criado_por_id")
  criadoPorNome String?  @map("criado_por_nome")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  linhas       SeparacaoCargaLinha[]
  pedidos      SeparacaoCargaPedido[]
  conclusoes   SeparacaoCargaConclusao[]
  @@map("separacao_cargas")
}

// 1 linha = 1 produto na carga inteira OU 1 produto dentro de 1 pedido. `chave` espelha o mock.
model SeparacaoCargaLinha {
  id            String   @id @default(uuid())
  separacaoId   String   @map("separacao_id")
  separacao     SeparacaoCarga @relation(fields: [separacaoId], references: [id], onDelete: Cascade)
  chave         String   // "c:<produtoId>" | "p:<pedidoId>:<produtoId>" — a unicidade que torna o envio idempotente
  escopo        String   // CARGA | PEDIDO
  pedidoId      String?  @map("pedido_id")
  produtoId     String   @map("produto_id")
  quantidadeSeparada Decimal @default(0) @map("quantidade_separada") @db.Decimal(12, 3) // "SEPAREI" (valor absoluto, nunca delta)
  tocada        Boolean  @default(false)  // o usuário mexeu na linha (só linha tocada entra em "Ficou faltando")
  motivoFalta   String?  @map("motivo_falta") // VEM_DEPOIS | NAO_TEM | null
  carimboEm     DateTime @map("carimbo_em")   // quando o usuário tocou (relógio do aparelho corrigido) — decide "último toque vence"
  atualizadoPorId   String? @map("atualizado_por_id")
  atualizadoPorNome String? @map("atualizado_por_nome")
  updatedAt     DateTime @updatedAt @map("updated_at")
  @@unique([separacaoId, chave])
  @@index([separacaoId])
  @@index([pedidoId])
  @@map("separacao_carga_linhas")
}

// Por pedido: quantas bolsas deu. (A posição na ordem manual fica em SeparacaoCarga.ordemManual.)
model SeparacaoCargaPedido {
  id          String   @id @default(uuid())
  separacaoId String   @map("separacao_id")
  separacao   SeparacaoCarga @relation(fields: [separacaoId], references: [id], onDelete: Cascade)
  pedidoId    String   @map("pedido_id")
  bolsas      Int      @default(0)
  bolsasEm    DateTime? @map("bolsas_em")  // carimbo do último toque em bolsas
  atualizadoPorNome String? @map("atualizado_por_nome")
  updatedAt   DateTime @updatedAt @map("updated_at")
  @@unique([separacaoId, pedidoId])
  @@index([separacaoId])
  @@map("separacao_carga_pedidos")
}

// "Concluir separação" = evento (append-only). Pode concluir de novo depois; vale a última.
model SeparacaoCargaConclusao {
  id            String   @id @default(uuid())
  separacaoId   String   @map("separacao_id")
  separacao     SeparacaoCarga @relation(fields: [separacaoId], references: [id], onDelete: Cascade)
  requisicaoId  String   @unique @map("requisicao_id")   // gerado no aparelho → reenvio não duplica
  modo          String   // CARGA | PEDIDO (em qual aba o usuário concluiu)
  carimboEm     DateTime @map("carimbo_em")
  concluidaEm   DateTime @default(now()) @map("concluida_em") // relógio do servidor
  porId         String?  @map("por_id")
  porNome       String?  @map("por_nome")
  versaoEmbarque Int     @map("versao_embarque")
  resumo        Json     // { linhasTotal, completas, comFalta, naoTocadas, faltas:[{chave,produto,pedido,pedir,separado,falta,motivo}] }
  @@index([separacaoId])
  @@map("separacao_carga_conclusoes")
}
```

Notas: (a) Decimal(12,3) porque `PedidoItem.quantidade` é Decimal(12,3). (b) a separação **NÃO sobe `Embarque.versao`** (precedente: `POST /:id/impressao` e `/conferir`, `embarques.js:713`) — senão invalidaria a folha impressa/QR. (c) criação de `SeparacaoCarga` é por `upsert` por `embarqueId`; em `P2002` (corrida de dois aparelhos) re-ler.

---

## 2. Contrato de API (a costura backend ↔ frontend — qualquer mudança aqui avisa os dois devs)

Prefixo `/api/separacao-carga`, montado com `authMiddleware` (JWT). Todas as rotas passam por `exigirSeparacao`:
`const perms = req.user.permissoes || {}; if (perms.admin || perms.Pode_Separar_Carga === true) return next(); 403 { error: 'Você não possui permissão para separar cargas.' }`. (`authMiddleware` já devolve `permissoes` como OBJETO fresco do banco — `authMiddleware.js:28`.) Erros sempre `{ error: 'texto em português', codigo?: 'SIGLA' }`. Número = JSON number; data/hora = ISO 8601 com milissegundos; `dataSaida` = `'YYYY-MM-DD'` (fatiar o ISO, nunca passar por `new Date`).

### 2.1 `GET /cargas` — cargas disponíveis para separar
Filtro: `dataSaida >= início de ontem (Brasília, use utils/dataReferenciaBrasilia.js)` e `conferenciaConcluidaEm = null`; ordem `dataSaida asc, numero asc`; máx. 40.
```json
{ "agora": "2026-11-18T14:03:11.220Z",
  "cargas": [ { "id": "uuid", "numero": 482, "dataSaida": "2026-11-19", "motorista": "João",
                "versao": 7, "totalPedidos": 5,
                "separacao": { "iniciada": true, "concluidaEm": null, "concluidaPorNome": null } } ] }
```

### 2.2 `GET /cargas/:embarqueId/baixar` — "baixar a carga" (sem efeito colateral; não grava nada)
Pedidos: só `cancelado=false` e `devolucaoFinalizada=false`, na mesma ordem do `GET /api/embarques/:id` (cliente.NomeFantasia asc → vira `ordemCarga` 0..n). Itens do mesmo `produtoId` dentro do pedido são SOMADOS. `produtos` ordenado por `nome` (localeCompare pt-BR) = consolidado da folha (`DetalhesCargaModal.jsx:235`) mais `quantidadePorCaixa`.
```json
{ "agora": "ISO",
  "carga": {
    "id": "uuid", "numero": 482, "dataSaida": "2026-11-19", "motorista": "João",
    "versao": 7, "assinatura": "sha1-hex",
    "pedidos": [ { "id": "uuid", "numero": 904512, "etiqueta": "#904512",   // "ZZ#4827" especial, "BN#311" bonificação (mesma regra de fmtNumero)
                   "especial": false, "bonificacao": false,
                   "cliente": "Mercado Bom Preço", "cidade": "Pomerode", "ordemCarga": 0,
                   "itens": [ { "produtoId": "uuid", "nome": "Coxinha de Frango 1 kg", "unidade": "UN", "quantidade": 10 } ] } ],
    "produtos": [ { "produtoId": "uuid", "nome": "Coxinha de Frango 1 kg", "unidade": "UN", "quantidadePorCaixa": 12, "total": 26 } ],
    "amostras": { "total": 1 } },
  "estado": <Estado> }
```
`assinatura` = sha1 do JSON canônico `[{pedidoId, itens:[produtoId:quantidade ordenados]}]` ordenado por pedidoId (detecta pedido que entrou/saiu/mudou de item — a `versao` sozinha NÃO basta: editar item/cancelar pedido não sobe `Embarque.versao`).

`<Estado>` (mesmo formato em baixar e sincronizar; vazio se a separação ainda não existe):
```json
{ "ordem": { "regra": "CARGA", "manual": ["pedidoId"], "c": "ISO|null" },
  "linhas": { "c:<produtoId>": { "q": 26, "t": true, "m": null, "c": "ISO", "por": "Maria" },
              "p:<pedidoId>:<produtoId>": { "q": 2, "t": true, "m": "NAO_TEM", "c": "ISO", "por": "Maria" } },
  "pedidos": { "<pedidoId>": { "b": 2, "c": "ISO|null" } },
  "conclusao": { "id": "uuid", "modo": "CARGA", "em": "ISO", "porNome": "Maria", "resumo": { } } }   // ou null
```
Erros: 404 `CARGA_NAO_ENCONTRADA`.

### 2.3 `POST /cargas/:embarqueId/sincronizar` — o ÚNICO endpoint de escrita (envio offline + "puxar" o que os outros fizeram)
Corpo (≤ 300 ops por chamada; o front fatia; `ops: []` = só puxar o estado):
```json
{ "loteId": "uuid-do-aparelho (8..80, [A-Za-z0-9-])", "aparelho": "iPad cozinha (texto livre ≤60)",
  "ops": [
    { "t": "L", "k": "c:<produtoId>", "q": 8, "tocada": true, "m": "VEM_DEPOIS", "c": "2026-11-18T14:05:01.123Z" },
    { "t": "P", "p": "<pedidoId>", "b": 2, "c": "ISO" },
    { "t": "O", "regra": "MANUAL", "manual": ["<pedidoId>", "..."], "c": "ISO" },
    { "t": "X", "requisicaoId": "uuid", "modo": "PEDIDO", "c": "ISO" } ] }
```
Resposta 200:
```json
{ "ok": true, "agora": "ISO", "versao": 7, "assinatura": "sha1-hex",
  "aplicadas": 12,
  "ignoradas": [ { "ref": "c:<produtoId>", "motivo": "MAIS_NOVO_NO_SERVIDOR" | "IGUAL" | "FORA_DA_CARGA" | "CHAVE_INVALIDA" } ],
  "conclusaoRegistrada": { "id": "uuid", "em": "ISO" } | null,
  "estado": <Estado completo e atual> }
```
**Regras de sincronização (valem para os dois devs):**
1. **Valor absoluto, nunca delta.** Cada op diz o estado final da linha (`q`), então reenviar é seguro. Não existe "+1" na rede.
2. **Último toque por linha vence**, comparando `c` (carimbo): aplica só se `c` > carimbo gravado; igual ou menor → ignorada (`IGUAL` quando o valor é o mesmo = reenvio; `MAIS_NOVO_NO_SERVIDOR` quando perdeu). Pedido (`P`) e ordem (`O`) seguem a mesma regra, cada um como unidade. Implementação: `createMany({skipDuplicates})` + `updateMany({ where:{separacaoId, chave, carimboEm:{ lt: c }} })` por op — atômico por comando, **sem `$transaction`** (idempotente e imune a corrida entre dois aparelhos). Se usar `$transaction` por qualquer motivo: `{ timeout: 20000, maxWait: 10000 }`.
3. **Relógio do aparelho:** o aparelho calcula `desvio = agora_do_servidor − Date.now()` no `baixar`/`sincronizar` e carimba `c = Date.now() + desvio`. O servidor ainda limita: `c > agora + 5 min` → usa `agora`; `c` inválido → `CORPO_INVALIDO` 400 para o lote inteiro.
4. **Normalização no servidor** (o front adota o que voltar em `estado`): `tocada=false` ⇒ `q=0, m=null`; `q` limitado a `[0, quantidade pedida atual]` (3 casas); `q >= pedido` ⇒ `m=null`; `m` só `VEM_DEPOIS|NAO_TEM|null`; `b` limitado a `0..20` (teto de etiquetas da fila, `MAX_PAGINAS`); `manual` só aceita pedidos da carga atual (descarta os demais).
5. `k`/`p` que não existem mais na carga (pedido removido/cancelado, produto que saiu) → `ignoradas[].motivo = FORA_DA_CARGA` (não é erro; o front mostra "a carga mudou"). O servidor **não apaga** o que já gravou de pedido que saiu.
6. `X` (concluir) é processado **por último no lote**, depois das linhas, e monta o `resumo` a partir do banco já atualizado: `linhasTotal`, `completas`, `comFalta` (tocada e `q<pedir`), `naoTocadas`, `faltas[]`. Idempotente por `requisicaoId` (UNIQUE): reenviar devolve o mesmo registro, não cria outro. Grava `versaoEmbarque` atual.
7. Erros: 400 `CORPO_INVALIDO`; 403 sem permissão; 404 `CARGA_NAO_ENCONTRADA` (o front guarda os dados no aparelho, avisa e para de insistir — nunca descarta sozinho); 5xx/rede → o front mantém a fila e tenta de novo (backoff 5 s → 60 s).
8. A resposta traz sempre `assinatura`/`versao`: se diferirem do que o aparelho baixou, o front chama `baixar` de novo e mostra o aviso "A carga mudou" (seção 4.5).
9. Não grava em `embarque_versao_log`, não toca `Embarque`, `Pedido`, estoque, notas. Log só `console.log('[SeparacaoCarga] ...')`.

### 2.4 Impressão da bolsa — reaproveita `POST /api/impressao/etiquetas` com **origem nova `SEPARACAO`**
Motivo: `PEDIDO` exige permissão de Pedidos (`impressaoEtiquetasRoutes.js:46`) e quem separa pode não ter. Mudança no backend (2 linhas, aditiva — NÃO altera as outras origens):
- `ORIGENS.SEPARACAO = { tamanho: '100x120', linguagem: 'ZPL', tipo: 'ETIQUETA_PEDIDO', usaCopias: false, zplSequencia: true }` (reusa o tipo de fila, então `cancelar` e o agente continuam iguais).
- `podeOrigem`: `if (origem === 'SEPARACAO') return p.Pode_Separar_Carga === true;` (depois do `if (p.admin) return true`).

Chamada do front, **um POST por pedido** (≤ 20 bitmaps; a rasterização fecha em 1 passada de até 20): `{ origem:'SEPARACAO', requisicaoId, impressoraId?, referencia:{ tipo:'PEDIDO', id:<pedidoId>, rotulo:'Bolsas Carga #482 · #904512 — Mercado Bom Preço' }, bitmaps:[1..20 únicos], sequencia:[0,1,2] }`. Cada bolsa "i de N" é um bitmap diferente; `sequencia` = ordem 0..N-1. O servidor é idempotente por `requisicaoId` (reenvio devolve `repetido:true`, 200). Impressora: `GET /api/impressao/etiquetas/impressoras?origem=SEPARACAO` (1 ativa 100×120 → automática; >1 → escolhe com `SelectBusca` e lembra com `useFiltroSalvo('etiquetas:impressora:SEPARACAO')`, igual `ImprimirDireto.jsx:49`).

---

## 3. Arquivos — na ordem

### BACKEND (dev-backend)
1. `backend/prisma/schema.prisma` — **append no fim** dos 4 models da seção 1 (hunk único no fim do arquivo). Rodar `npx prisma validate` + `prisma generate` local.
2. `backend/services/separacaoCargaService.js` (NOVO) — `listarCargas()`, `montarCarga(embarqueId)` (pedidos/itens/produtos/assinatura), `lerEstado(embarqueId)`, `sincronizar({embarqueId, user, loteId, aparelho, ops})`, `montarResumoConclusao()`. Toda a regra aqui; a rota fica fina. Antes de escrever os `select`: **conferir cada campo no schema** (Cliente: `NomeFantasia`, `Nome`, `End_Cidade`; Produto: `nome`, `unidade`, `quantidadePorCaixa`; Pedido: `numero`, `especial`, `bonificacao`, `cancelado`, `devolucaoFinalizada`; Embarque: `dataSaida`, `versao`, `conferenciaConcluidaEm`, `responsavel.nome`) — campo inexistente em `select` derruba a rota.
3. `backend/routes/separacaoCarga.js` (NOVO) — `exigirSeparacao` + 3 rotas da seção 2. `module.exports = router`.
4. `backend/routes/impressaoEtiquetasRoutes.js` — 2 linhas (origem `SEPARACAO` + `podeOrigem`). Hunks: dentro de `ORIGENS` (~linha 28) e em `podeOrigem` (~linha 47).
5. `backend/index.js` — **só 2 linhas** (a outra sessão tem hunk não commitado perto da linha 145; estes ficam longe dele): 
   - require junto aos outros, logo depois da linha 36 (`embarquesMapaRoutes`): `const separacaoCargaRoutes = require('./routes/separacaoCarga'); // Separação de carga na câmara fria (offline)`
   - depois da linha 202 (`app.use('/api/embarques', embarqueRoutes)`): `app.use('/api/separacao-carga', authMiddleware, separacaoCargaRoutes); // Separação de Carga (Logística)`
   Commit **por hunk** (`git add -p backend/index.js`), nunca o arquivo inteiro.
6. `backend/manuais/abas/separacao-carga.md` (NOVO) + 1 linha no `README.md` (seção Logística) + 1 linha na tabela `ABAS` de `backend/services/copilotoService.js` (depois da linha 59, `embarque`): `{ slug: 'separacao-carga', nome: 'Separação de Carga', rota: '/separacao-carga', perm: 'Pode_Separar_Carga' }`.
7. Testar com curl (sem isso não vai pro QA): baixar; sincronizar com lote repetido (idempotência); dois "aparelhos" com carimbos trocados (último toque vence); pedido removido → `FORA_DA_CARGA`; usuário sem permissão → 403; `POST /impressao/etiquetas` origem `SEPARACAO` com usuário só-Pedidos → 403 e com `Pode_Separar_Carga` → 201; origem `PEDIDO` continua igual.

### FRONTEND (dev-frontend) — pode começar assim que a seção 2 estiver fechada, usando fixtures locais; só integra no fim
1. `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` — 3 hunks para `Pode_Separar_Carga`: default `false` (junto à linha 42), entrada no `BOOL_INDEX` (junto à linha 307, `sec:'logistica'`, nome "Separação de Carga", desc "Separar a carga na câmara fria (funciona sem internet)", `kw: 'separar separacao carga camara fria bolsa etiqueta'`), e `<MenuToggle ... toggleBool('Pode_Separar_Carga') />` (junto à linha 1185). Sem a entrada no `BOOL_INDEX` o dono não consegue ligar nem vê no histórico.
2. `frontend/src/services/separacaoCargaService.js` (NOVO) — `listar()`, `baixar(id)`, `sincronizar(id, corpo)`, `ping()` (reusa `GET /version`).
3. `frontend/src/pages/Logistica/SeparacaoCarga/` (pasta nova):
   - `separacaoCalculo.js` — funções PURAS (sem React): `chavesCarga`, `chavesPedido`, `pedir`, `classe`, `conta`, `ordenarPedidos(regra)`, `proximoPedido`, `mesclarEstado(local, servidor)` (por chave: vence o `c` maior), `diffCarga(antiga, nova)`, `faltas()`. Mesma lógica do mock (`conta`, `classe`, `proximo`, `ordenados`).
   - `separacaoStorage.js` — leitura/gravação em localStorage (chaves da seção 4), `listarCargasBaixadas()`, limpeza de cargas antigas.
   - `useSeparacaoCarga.js` — hook que orquestra: estado, toques, persistência, fila de envio, fila de etiquetas, `online/offline`, desvio de relógio, detecção de carga mudada.
   - `etiquetaBolsa.js` — `montarEtiquetaBolsa(dados)` (HTML+CSS do layout do mock `.etq`: faixa do topo "Hardt Salgados · Carga #482", "BOLSA", "1 de 3" grande, cliente grande, cidade, "Pedido … · Entrega dd/mm · Motorista …"; **sem lista de produtos e sem área preta cheia** — borda de 2px é ok, igual ao mock) e `prepararEtiquetasBolsas(dados, total)` → `{bitmaps, sequencia}` reusando `rasterizarEtiquetas` + `empacotarParaEnvio` de `PCP/etiquetaRaster` (padrão de `prepararEtiquetaPedido`, `etiquetaPedido.js:342`: 800×960, `seletorCelula:'.etq'`, `larguraMm:100, alturaMm:120`).
   - `SeparacaoCargaPage.jsx` (default export) + componentes: `BarraCarga.jsx` (cabeçalho fixo: barra encolhida + painel + faixa de internet/etiquetas + andamento), `LinhaSeparacao.jsx`, `ListaCargaInteira.jsx`, `ListaPorPedido.jsx` (lista + ordem + detalhe), `BolsasEtiquetas.jsx`, `FicouFaltando.jsx`, `AvisoCargaMudou.jsx`.
   - `separacaoCarga.css` — **CSS escopado em `.sepc`**, portado do mock (`.fixo/.cab/.prog/.it/.q/.acts/.mot/.pc/.dois/.bol…`). Motivo: o mock dimensiona tudo em `em` para o A+ escalar a tela inteira; classes Tailwind (`text-xl`, `p-3`) são em `rem` e NÃO acompanham o `font-size` do container. O tamanho da letra vai em `style={{fontSize: px}}` no container raiz. Cores = tokens do tema (`#00754A`, `#006241`, `#1E3932`, `#d4e9e2`). Mantém as `@container` queries (≤760px) do mock.
4. `frontend/src/App.jsx` — hunks exatos: (a) `const SeparacaoCarga = lazyComRetry(() => import('./pages/Logistica/SeparacaoCarga/SeparacaoCargaPage'));` junto à linha 44; (b) item de menu no grupo Logística, linha ~443-444: `hasPermission('Pode_Separar_Carga') && { to: '/separacao-carga', icon: ClipboardCheck, label: 'Separação de Carga' }` (`ClipboardCheck` já é importado e usado na linha 499); (c) filtro por perfil (~linha 333): acrescentar `|| s.items.some((i) => i.to === '/separacao-carga')` — senão o perfil "pcp"/"vendedor" esconde o grupo Logística quando sobra só 1 item; (d) rota junto à linha 996: `<Route path="/separacao-carga" element={<PrivateRoute tab="Pode_Separar_Carga"><SeparacaoCarga /></PrivateRoute>} />`. Nunca `React.lazy`.
5. **Guardas de offline em 3 arquivos compartilhados** (necessárias para "recarregar sem sinal não quebra"; ver 4.6): `frontend/src/contexts/AuthContext.jsx`, `frontend/src/utils/lazyComRetry.js`, `frontend/src/main.jsx`.
6. `frontend/public/novidade-separacao-carga.html` (NOVO, espelhar `novidade-tarefas.html`, accordions já abertos, mockups com pins, og:title/og:description SEM og:image, sem botão "Abrir o app") + entrada no TOPO de `frontend/public/novidades.json` (`slug:"separacao-carga"`).
7. `cd frontend && npm run build` limpo.

---

## 4. Estratégia offline (frontend)

### 4.1 O que fica no aparelho (localStorage; padrão do `InventarioEstoque.jsx`, com try/catch em toda leitura/escrita)
Duas chaves por (usuário, carga), para que o toque (pequeno) seja gravado NA HORA sem reescrever a carga inteira:
- `separacao_carga_v1:<userId>:<embarqueId>:carga` — o payload `carga` do `baixar` (+ `baixadoEm`, `desvioRelogioMs`). Gravado só ao baixar/atualizar.
- `separacao_carga_v1:<userId>:<embarqueId>:estado` — `{ estado:<Estado>, sujo:{ linhas:[chave], pedidos:[pedidoId], ordem:bool }, concluir:[{requisicaoId, modo, c}], etiquetas:[…], mudou: null|{…} }`. **Regravado a cada toque, de forma síncrona** (sem debounce — o requisito é "não se perde se a tela apagar/app fechar/bateria acabar"); ~30–60 KB.
- `separacao_carga_v1:<userId>:ultima` — `{ embarqueId }` para reabrir direto na carga em andamento (offline não há lista de cargas; a tela mostra as cargas baixadas via `listarCargasBaixadas()`).
- Preferências por usuário com `useFiltroSalvo`: `'separacao-carga:letra'` (px, padrão 17; A−/A+ de 2 em 2 — faixa do mock 15–23; ver D4) e `'separacao-carga:modo'` (`'carga'|'pedido'`). "Só o que falta" NÃO persiste (volta desligado). A regra de ordem NÃO é preferência: **fica na carga** (servidor), como diz o mock/legenda 10.
- Logout NÃO apaga essas chaves (nunca perder toque não enviado); limpeza só de carga concluída+enviada com `dataSaida` > 7 dias.
- `QuotaExceededError`: manter em memória e mostrar faixa vermelha "memória do aparelho cheia — envie agora".

### 4.2 Fluxo
1. Escolher carga (online): `listar()` → `baixar(id)` → grava `:carga` e mescla o `estado` do servidor no `:estado` local → **faixa verde "Carga baixada neste aparelho — pode entrar na câmara"**. Ao baixar, aquecer o cache (4.6).
2. Cada toque (`+`, `−`, "✓ Separei tudo", motivo, digitar, bolsas, ordem) → atualiza estado em memória, carimba `c = Date.now() + desvio`, marca `sujo`, grava `:estado` **antes** de qualquer rede.
3. Envio: single-flight. Dispara (a) ~1,5 s após o toque se online, (b) no evento `online`, (c) ao abrir a tela se há `sujo`, (d) `visibilitychange`→visible, (e) a cada 30 s com sujo ou, sem sujo, `ops:[]` como "puxar" dos outros aparelhos. Fatia em lotes de 200 ops; ordem do lote: `L`, `P`, `O`, por fim `X`. Ao receber 200: remove de `sujo` só o que tiver `c` ≤ o enviado (se a pessoa tocou de novo durante o voo, continua sujo), adota `estado` do servidor via `mesclarEstado`. Falha de rede/5xx → backoff 5→60 s, bolinha amarela, contador "N toques guardados". `navigator.onLine` mente em Wi-Fi sem internet: considerar offline também quando o último envio/ping falhou.
4. Bolinha/faixa de internet (mock `.net`): verde = online com carga baixada; amarelo = sem sinal ("tudo guardado no aparelho — N toque(s) guardado(s)"). Sem botão "Testar" no app real (era do mock).
5. **"A carga mudou"**: em toda resposta de `sincronizar`/`baixar`, se `assinatura` ≠ a baixada → `baixar` de novo, `diffCarga(antiga, nova)` → modal `AvisoCargaMudou` com: pedidos que ENTRARAM, que SAÍRAM, produtos com quantidade alterada (de→para) e "N toques seus eram de pedido que saiu e foram descartados". Só depois do OK do usuário a nova carga vira a ativa (`:carga` regravado). `estado` local é preservado para as chaves que continuam existindo (quantidade limitada ao novo pedido); chaves de pedido que saiu são escondidas da tela (o servidor guarda). Se o aparelho está offline, só detecta ao voltar o sinal (comportamento esperado do briefing).

### 4.3 Fila de etiquetas (bolsas)
- Item: `{ pedidoId, ordem, bolsas, requisicaoId, exigeToque, dados:{ etiqueta, cliente, cidade, cargaNumero, dataSaida, motorista }, status:'AGUARDANDO'|'ENVIANDO'|'ENVIADO' }` — guarda os **dados**, não o bitmap (o bitmap é gerado na hora de enviar, com sinal e fontes carregadas; evita guardar centenas de KB por etiqueta).
- Tocar "Imprimir N etiquetas": grava `bolsas` (op `P`) e cria/substitui o item AGUARDANDO daquele pedido (mantém a `ordem` original = ordem em que foi separado; novo `requisicaoId` só se ainda não foi enviado). Já `ENVIADO` + novo toque = reimpressão deliberada = item novo com `requisicaoId` novo.
- **Online**: o próprio toque é o ato do usuário → envia na hora (`exigeToque:false`); falha de rede → continua na fila e re-tenta com o MESMO `requisicaoId`.
- **Offline**: `exigeToque:true`; mostra faixa escura "🖨 N etiqueta(s) guardada(s) (M pedido(s)) — você imprime ao sair". Ao voltar o sinal a faixa vira amarela "N etiquetas esperando · **Imprimir agora**". **Nada sai sozinho**: só o toque em "Imprimir agora" dispara; ele envia pedido por pedido, **em sequência e na ordem de `ordem`** (a fila do servidor é FIFO por `pedido_em`, `impressaoService.js:204`), cada um: preparar bitmaps → POST (origem `SEPARACAO`) → remover da fila. Erro de um não trava o resto: marca erro e oferece "Tentar de novo".
- Fonte: precisa estar carregada antes de rasterizar (`carregarFontesFuncionario()` — mesmo passo de `prepararEtiquetaPedido`).

### 4.4 Cabeçalho fixo
`position: sticky; top: 0` no bloco `.fixo` (barra + andamento). **Atenção**: o scroll da página é o do layout do app (não o do `.app` do mock); conferir o `top` real contra a barra superior mobile do `App.jsx` (se ela for fixa, usar `top: <altura dela>` ou colocar a Separação em "tela cheia" sem o topo). Barra encolhida abre no toque; fecha ao escolher/tocar fora (listener em `document`, com `stopPropagation` no painel, igual ao mock). No celular com pedido aberto o nome do cliente vai na faixa de andamento com a seta `‹` (`.vt`).

### 4.5 Componentes obrigatórios do design system
`SelectBusca` (impressora), `CampoNumero` (digitar o SEPAREI — "tocando no número dá para digitar", legenda 4 do mock), tokens/tema Starbucks, botões pílula, alvos ≥ 44 px (o mock já usa ≥ 2.7em). Sem scroll horizontal da página em 320 px (o carrossel de cargas dentro do painel é um scroller interno — ok). Nada de `window.open`/iframe.

### 4.6 Recarregar sem sinal (RISCO REAL — leitura do código atual)
Hoje, abrir/recarregar o app sem internet **quebra** por três motivos confirmados:
1. `AuthContext.carregarUsuario` (`AuthContext.jsx:63`) chama `/auth/me` 3×; sem rede cai em `erroConexao` → `PrivateRoute` mostra `TelaSemConexao` (`App.jsx:161`).
2. `lazyComRetry` (`utils/lazyComRetry.js:40-48`) e `main.jsx:21-25`, ao falhar um chunk, **apagam TODOS os caches do service worker e recarregam** — sem rede isso destrói a casca offline.
3. `sw.js` só cacheia `/assets/` na 1ª busca real com o SW já controlando a página, e a casca `/` só quando navega para `/` com rede (`sw.js:86-100`).

Correções mínimas (todas aditivas, sem mudar o comportamento com internet):
- **AuthContext**: ao validar com sucesso, guardar `@HardtApp:userSnapshot` (o objeto do `/auth/me`); apagar no `limparSessao`. Se as 3 tentativas falharem E existir snapshot E `location.pathname` começa com `/separacao-carga` → `setUser(snapshot)` e **não** setar `erroConexao`. Se `navigator.onLine === false`, pular as pausas de retry (abre rápido). Ao voltar o sinal (`online`), revalidar **em silêncio** (fetch do `me` + `setUser`, SEM `setLoading(true)` — senão o `PrivateRoute` desmonta a tela no meio do envio). Qualquer outra rota continua com `TelaSemConexao` como hoje.
- **lazyComRetry / main.jsx**: se `navigator.onLine === false`, **não** apagar caches nem recarregar (repassar o erro). Ficam 1–2 linhas em cada.
- **Aquecimento no "baixar"**: depois de baixar a carga, a tela (a) faz `import()` explícito de `PCP/etiquetaRaster`, `etiquetaBolsa` e do que mais for lazy; (b) re-busca todos os `/assets/*` já carregados (`performance.getEntriesByType('resource')` + `link[rel=modulepreload]`) para o SW gravá-los; (c) se `navigator.serviceWorker.controller` for `null`, mostra aviso "feche e abra o app uma vez com sinal antes de entrar na câmara". `sw.js` **não muda** (então não precisa subir `VERSAO`).
- Navegação offline para `/separacao-carga`: o SW já cai em `cache.match('/')` (`sw.js:100`), que é a casca com os `/assets/` em cache → React sobe, `AuthContext` usa o snapshot, a tela lê a carga do localStorage. Se não houver carga baixada, a tela mostra "Sem internet e nenhuma carga baixada neste aparelho — abra a carga com sinal antes de entrar na câmara".

---

## 5. Riscos e o que pode quebrar em outras telas

| # | Risco | Mitigação |
|---|---|---|
| 1 | Mudar `AuthContext`/`lazyComRetry`/`main.jsx` afeta o app inteiro | Só caminhos de falha mudam; QA roda regressão (login, logout, token inválido→login, sem rede em outra rota→`TelaSemConexao`, deploy novo→recarrega 1×). |
| 2 | Duas pessoas na mesma carga / relógio do aparelho errado | Último toque por linha vence + desvio de relógio medido no servidor + clamp. Dois aparelhos NÃO se enxergam offline (só ao sincronizar). Perda do toque mais antigo é por desenho. |
| 3 | Toque perdido (limpou dados do site, iOS evicta, localStorage cheio) | Gravação síncrona por toque; faixa persistente "N toques ainda não enviados"; sem apagar no logout; aviso de quota. |
| 4 | `Embarque.versao` não sobe com edição de item/cancelamento | Detecção por `assinatura`, não por `versao`. |
| 5 | Sticky + shell do app + container queries + Tailwind `rem` | CSS escopado em `em`; conferir `top` do sticky com a barra mobile; testar 320/375/768/desktop e A+. |
| 6 | Etiqueta nova na Zebra 100×120 (borda, tamanho de fonte, FIFO entre pedidos) | Gerar o bitmap e conferir o PNG (padrão `docs/etiquetas-cozinha/evidencias-e3/`) antes; teste de 1 impressão real pelo dono. Não usar área preta cheia. |
| 7 | Mais de 1 impressora ativa 100×120 → servidor devolve 400 "informe impressoraId" | Seletor `SelectBusca` na faixa de etiquetas. |
| 8 | Origem `SEPARACAO` nova mexe em arquivo de impressão compartilhado | Só 2 linhas aditivas; QA reconfere que `PEDIDO`, `PRODUTO`, `KIT_FESTA`, `AMOSTRA` continuam respondendo igual (403/201 como antes). |
| 9 | Perfil de menu esconde o grupo Logística | Exceção no `filtrarSecoesPorPerfil` (App.jsx, item 3c). |
| 10 | Falta "registrada" que ninguém vê | Ver D5 — v1 só grava; a tela mostra a lista e o resumo da conclusão. Nada de WhatsApp (não é ato do cliente; regra do bot). |
| 11 | `db push` | Models 100% novos, índices declarados, nenhum campo removido. Rodar `prisma validate`. |
| 12 | Outra sessão no mesmo repo | Arquivos novos isolados; hunks em compartilhados listados acima (`backend/index.js` 2 linhas; `App.jsx` 4 hunks; `PermissoesModal.jsx` 3; `impressaoEtiquetasRoutes.js` 2; `copilotoService.js` 1; `README.md` 1; `novidades.json` topo; `schema.prisma` fim; `AuthContext.jsx`, `lazyComRetry.js`, `main.jsx`). `git add -p`; só a thread principal commita. |
| 13 | Quem NÃO tem `Pode_Acessar_Embarque` precisa separar | Rotas próprias (`/api/separacao-carga`) com permissão própria; nunca chamar `/api/embarques/:id` do front desta tela. |

---

## 6. Critérios de aceite (QA clica)

Permissão
1. Usuário sem `Pode_Separar_Carga` (não admin): item não aparece no menu; `/separacao-carga` mostra "Acesso Negado"; `GET /api/separacao-carga/cargas` = 403; `POST /api/impressao/etiquetas` origem `SEPARACAO` = 403. Com a permissão ligada no painel (aparece em "Logística"): tudo libera, **sem** precisar de `Pode_Acessar_Embarque`. Admin sempre entra. Check do front e do back dão o mesmo resultado nos 3 casos (sem, com, admin).

Fluxo online (desktop e 375 px)
2. Lista só cargas não conferidas com `dataSaida ≥ ontem`; escolher uma baixa e a faixa fica verde.
3. Carga inteira: produtos em ordem alfabética, SEPARAR = soma por produto (conferir 2 produtos contra o consolidado da folha em Embarque → Imprimir); "✓ Separei tudo" fecha a linha (verde, FALTA = ✓; toque de novo desfaz); − e + respeitam 0 e o pedido; digitar o número funciona; falta > 0 mostra "Vem depois"/"Não tem"; "Ficou faltando" lista só linhas tocadas com falta e o selo certo; "Só o que falta" esconde as prontas; % e "N de M produtos" batem.
4. Por pedido: lista com status (A separar/Separando/Com falta/Separado), ordem "Da carga"/"Por cidade"/"Eu escolho" (numerar 1º,2º…; tocar de novo tira; quem fica sem número vai depois; "Limpar ordem"); a regra e a ordem **continuam ao recarregar e em outro aparelho**; "Próximo pedido" segue a ordem e pula os prontos; dá para abrir qualquer pedido; no celular, nome do cliente na faixa fixa com `‹`.
5. Cabeçalho fixo: rolar uma carga grande — barra da carga e andamento não saem do topo; tocar na barra abre o painel (trocar carga, modo, letra, internet); escolher ou tocar fora fecha.
6. A−/A+ escala **a tela inteira** (textos, botões, cabeçalho) sem scroll horizontal e **fica lembrado** ao sair e voltar (e por usuário).
7. Bolsas: − / + (0–20), "Imprimir N etiquetas" gera N etiquetas "BOLSA i de N" na ordem, com cliente grande, cidade, pedido, carga, entrega e motorista, sem lista de produtos e sem fundo preto; abrir o PNG/bitmap gerado e conferir; impressão real de 1 pedido (2 bolsas) no rolo 100×120.
8. "Concluir separação": com linhas não tocadas pede confirmação ("N produtos ainda não foram tocados"); registra a conclusão (quem/quando); **pedido, nota, estoque e `Embarque.versao` ficam inalterados** (conferir no banco/na tela de Embarque que a folha não ficou "desatualizada").

Offline (Chrome DevTools → Network → Offline, e também modo avião no iPad)
9. Baixar carga online → ligar Offline → tocar em 10 linhas, mudar motivo, bolsas, ordem → faixa amarela "sem sinal · N guardados"; **recarregar a página (F5) ainda offline**: a tela abre na mesma carga, com todos os toques (sem `TelaSemConexao`, sem tela vermelha, sem apagar cache). Fechar e reabrir o app/aba: idem.
10. Desligar Offline → envia sozinho em poucos segundos; contador zera; conferir no banco (`separacao_carga_linhas`) os valores; reenviar o mesmo lote (curl) não duplica nem altera (`ignoradas: IGUAL`).
11. Etiquetas pedidas offline (2 pedidos, 2+3 bolsas): faixa escura "5 etiquetas guardadas (2 pedidos)"; ao voltar o sinal vira amarela "5 etiquetas esperando · Imprimir agora"; **nada imprime até o toque**; no toque saem 5 trabalhos na fila, pedido 1 antes do 2, depois da ordem em que foram pedidos; 2º toque não duplica.
12. Duas pessoas: aparelho A e B na mesma linha; B toca depois → B vence nos dois aparelhos após sincronizar; linhas diferentes → as duas mudanças se preservam.
13. Carga mudou: baixar → Offline → no escritório tirar um pedido da carga (e editar a quantidade de outro) → voltar o sinal → aparece o aviso "A carga mudou" listando o que entrou/saiu/mudou; após o OK a tela reflete a carga nova e os toques das linhas que ficaram foram mantidos.
14. Sem carga baixada e sem sinal: mensagem clara (não tela em branco/erro genérico). Outra rota qualquer sem sinal continua mostrando `TelaSemConexao` (regressão).
15. 401 no meio (token vencido): vai para o login e, depois de logar com o mesmo usuário, a fila ainda está lá e envia.

Regressão
16. Embarque (painel, folha, conferência por bipagem, versionamento/QR), Inventário de estoque, impressão de etiqueta de Pedido/Produto/Kit Festa, painel de permissões (histórico mostra a permissão nova), login/logout, deploy novo (`lazyComRetry` ainda recarrega online), menu por perfil (perfil pcp com só esse item ainda vê a Logística).

Verificações do revisor: nenhum `React.lazy`; nenhum `<select>` nativo; nenhum `window.open`/iframe; sem `!!perms.x` em chave-objeto (a permissão nova é booleana `=== true`); `$transaction`, se houver, com `{ timeout: 20000, maxWait: 10000 }`; nenhuma chamada em `embarques.js`/`pedidoController`/fiscal; `schema.prisma` só adiciona; todos os `select` com campos existentes; build do frontend limpo.

---

## 7. Checklist de fechamento
- [ ] Manual `backend/manuais/abas/separacao-carga.md` (cobrir: carga inteira, por pedido, ordem, motivo da falta, bolsas/etiquetas, sem internet — baixar antes, enviar ao sair, "Imprimir agora", "A carga mudou", A−/A+, permissão) + linha no `README.md` + entrada em `ABAS` no `copilotoService.js` (rota `/separacao-carga`, perm `Pode_Separar_Carga`). Revisar `embarque.md` com 1 frase apontando para a nova tela.
- [ ] Novidade `frontend/public/novidade-separacao-carga.html` (mockups das telas com pins; accordions abertos; og:title/og:description sem og:image; sem "Abrir o app") + entrada no topo de `novidades.json` (Clippy balança).
- [ ] Texto pronto para o grupo do WhatsApp (formatação `*negrito*`, curto) entregue ao dono.
- [ ] `cd frontend && npm run build` sem erro; backend sobe local; curls da seção 3 (backend, item 7) com saída anexada.
- [ ] Testar **em produção atravessando um deploy** (regra do projeto, mesmo sem upload de arquivo, porque depende de cache do SW e da fila de impressão real): baixar a carga → deploy/restart → reabrir offline → enviar.
- [ ] Avisar o dono: o que o Clippy/manual ganhou; que o `db push` cria 4 tabelas; que precisa ligar `Pode_Separar_Carga` para quem separa.

---

## 8. Divergências encontradas entre briefing/mock e o código real
1. **Não existe "carga saída"** no `Embarque` → regra criada (D2).
2. **Origem de impressão `PEDIDO` exige permissão de Pedidos** (`impressaoEtiquetasRoutes.js:46`) → origem nova `SEPARACAO`.
3. **Reabrir offline quebra hoje** (AuthContext, lazyComRetry, main.jsx, casca do SW) — o briefing pedia tratar; exige tocar 3 arquivos compartilhados (seção 4.6).
4. **`Embarque.versao` não sobe** em edição de item/cancelamento de pedido; só em incluir/remover pedido/amostra e editar data/motorista (`embarques.js:282-540`) → uso `assinatura`.
5. Briefing lista "regra de ordem" como preferência (`useFiltroSalvo`); o mock diz "a ordem fica guardada na carga" → guardada no servidor (compartilhada entre aparelhos); só letra e modo são preferência local.
6. O mock diz no toast de concluir "avisa o escritório das faltas"; o briefing diz que só registra → **não há aviso/notificação nenhuma**; o texto real do toast será "Separação concluída. As faltas ficaram registradas."
7. O mock tem botão "Testar: entrar/sair da câmara"; no app real a internet é detectada de verdade (sem botão de teste).
8. A folha de embarque (`GET /:id`) inclui pedido cancelado; a separação o exclui.

## 9. Pontos que precisam de decisão do dono
- **D1** "Carga inteira" e "Por pedido" são separados (como o mock) ou o que separo numa aba deve contar na outra? (Adotado: separados.)
- **D2** Regra de "carga ainda não saída": `dataSaida ≥ ontem` e sem conferência concluída. Serve?
- **D3** Amostras da carga: só aviso na v1 (adotado) ou entram como linhas a separar?
- **D4** Tamanho máximo da letra: o mock vai de 15 a 23 px; com a visão do dono, estender até 29 px?
- **D5** Quem enxerga as faltas registradas depois (hoje só quem separa vê na tela e fica em tabela)? Sugestão futura: selo "Separação concluída / N com falta" no painel de Embarque (fora desta entrega).
