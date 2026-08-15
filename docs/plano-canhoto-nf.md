# Plano de implementação — Módulo "Canhoto da Nota Fiscal"

> Proposta aprovada pelo dono (mockups e decisões): `docs/proposta-canhoto-nf.html`
> Plano desenhado pelo arquiteto em 14/08/2026. **Porte: grande** — equipe completa, 3 pedaços separados.

## Objetivo

Toda NF-e de venda autorizada nasce esperando o canhoto assinado. O escritório bipa o código de barras
da DANFE na volta do motorista (leitor USB ou câmera); enquanto faltar canhoto o caixa do dia não fecha
(depois do modo aviso); nota sem canhoto sai da fila com motivo fechado + senha e fica marcada como
"sem documento" em Pedidos e Contas a Receber. Ao ligar, o mês inteiro entra como "desconhecido" e a
equipe bipa a pasta física uma vez (mutirão).

---

## 1. Mapa do código atual (confirmado lendo os arquivos)

| Ponto | Onde | O que foi descoberto |
|---|---|---|
| Nota do app | `backend/prisma/schema.prisma:756` — `NotaFiscalApp` | `chave` é **nullable e NÃO única**; `ref` é a única. `tipo` VENDA/DEVOLUCAO. |
| Nota antiga do CA | `schema.prisma:380` — `Pedido.nfeChave` / `nfeNumero` | Notas do Conta Azul **não existem** em `NotaFiscalApp`. Metade do universo mora aqui. |
| Onde a nota vira AUTORIZADA | `backend/services/focusNfeEmissaoService.js:286`, `:300`, `:338`, `consultarPresas` em `:372` | **4 caminhos**, todos chamando `marcarPedidoFaturado(atualizada)` logo em seguida. É o gancho natural. |
| Auto-cura já existente | `focusNfeEmissaoService.js:309-328` | Reconciliação de faturados desalinhados — molde para a auto-cura do canhoto. |
| Fila de NF (tela atual) | `backend/routes/notasFiscaisRoutes.js:56` | **Pesada**: `sincronizarEventos()` a cada carga + até **2000 pedidos** com `itens` e `notasFiscaisApp`. Não pendurar a aba Canhotos nela. |
| Entregas do caixa | `backend/routes/caixa.js:366-371` (idêntico em `:1112` e `caixaConferenciaService.js:59-67`) | `dataEntrega` no intervalo + `statusEntrega IN (ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO)` + `embarque.responsavelId`. É a definição de "notas do dia daquele motorista". |
| Pendências / trava | `backend/routes/caixa.js:885-893` (`pendencias.podeFechar`) e `:1083-1210` (`POST /fechar`) | O front lê `pendencias.podeFechar`; o backend revalida no `/fechar`. Os dois precisam do item novo. |
| Chave liga/desliga (molde) | `backend/config/caixaConferenciaConfig.js` | `ativo`, `desde`, `instaladoEm`, cache 30s e **`catch` devolvendo o padrão** quando o banco falha (banco fora do ar nunca vira trava). |
| Permissão + senha (molde) | `backend/routes/caixa.js:1839-1886` (`/conferencia-devolucao/autorizar`) | Valida permissão do `req._perms`, recarrega o usuário, `bcrypt.compare` e só então aplica. |
| Helpers de permissão | `backend/services/caixaConferenciaService.js:37-39` | `podeConferir` / `podeFechar` / `podeAutorizarDiferenca`. |
| Card de conferência (molde front) | `frontend/src/pages/Caixa/ConferenciaDevolucaoCard.jsx` + montagem em `CaixaDiarioPage.jsx:936-943` | Props `data`, `vendedorId`, `caixaStatus`, `podeReverter`, `onChanged={fetchResumo}`. |
| Botão Fechar caixa | `frontend/src/pages/Caixa/CaixaDiarioPage.jsx:1320-1371` | Bloco "pendências" + `disabled={!podeFechar}`. |
| Abas de Notas Fiscais | `frontend/src/pages/Financeiro/NotasFiscais.jsx:516-541` | `FiltroPeriodo` + `usePeriodoSalvo('notas-fiscais','hoje')` + `useFiltroSalvo('notas-fiscais:status','a-emitir')` e o array `[['a-emitir',…],['emitidas',…],['todas',…]]`. |
| Selo da NF em Pedidos | `frontend/src/pages/Pedidos/ListaPedidos.jsx:29-32` (`notaFiscalViva`) | Já lê `p.nfeChave` e `p.notasFiscaisApp`. |
| Contas a Receber | `backend/routes/contasReceber.js:229` + `frontend/src/pages/Financeiro/ContasReceberTabela.jsx:266` | Cada linha já carrega `pedidoId` — o vínculo com o canhoto é por aí. |
| Câmera (molde front) | `frontend/src/pages/Motorista/Entregas/ConferirFolhaModal.jsx:80-115` | `getUserMedia({facingMode:'environment'})` + `await import('jsqr')` dinâmico + `pararCamera()` no unmount. |
| Permissões | `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx:235` (`BOOL_INDEX`), padrões `:51-58`, perfil financeiro `:380`, toggles da seção Caixa `:1204-1218` | Permissão nova precisa de entrada no `BOOL_INDEX` **e** do default `false`. |
| Manual/Clippy | `backend/manuais/abas/notas-fiscais.md`, `caixa.md`, `contas-receber.md`; tabela `ABAS` em `backend/services/copilotoService.js:59-69` | Já existem — atualizar, não criar. |

> **Descoberta que muda o desenho:** **não existe evento "o embarque saiu"**. `backend/routes/embarques.js` só
> tem criar/editar/adicionar pedido/imprimir — `dataSaida` é campo, não ato. Portanto **"Na rua" é estado
> derivado**: `AGUARDANDO` + o pedido tem embarque com `dataSaida` já passada. Não é preciso mexer em
> `embarques.js` no Pedaço 1.

---

## 2. Modelo de dados

### Por que tabela nova (e não campos no `Pedido` ou no `NotaFiscalApp`)

1. **A identidade do bipe é a chave de 44 dígitos e ela precisa ser `@unique`** — é o que torna bipar duas
   vezes idempotente por construção do banco, não por `if` no código. `NotaFiscalApp.chave` é nullable e
   não-única (a nota nasce em `PROCESSANDO` sem chave), então não serve de âncora.
2. **As notas antigas do CA não estão em `NotaFiscalApp`** — vivem em `Pedido.nfeChave`. Se o estado morasse
   na `NotaFiscalApp`, metade do arquivo do mês ficaria de fora do mutirão.
3. **`Pedido` já tem ~60 colunas** e um pedido pode ter mais de uma nota (venda + devolução).
4. Tabela própria permite índice por `(competencia, status)` — é o que faz a aba Canhotos responder sem
   varrer `pedidos`.

### Schema proposto (nada removido — só acréscimo)

```prisma
// CANHOTO DA NOTA FISCAL (08/2026)
// O canhoto assinado é a prova de entrega — sem ele não há protesto. Cada NF-e de
// venda autorizada nasce aqui com status AGUARDANDO; o escritório bipa o código de
// barras da DANFE na volta do motorista e a nota vira RECEBIDO → ARQUIVADO.
// A `chave` é @unique DE PROPÓSITO: é ela que torna o bipe repetido do mutirão
// idempotente no banco, não no código.
model CanhotoNota {
  id     String @id @default(uuid())
  chave  String @unique                      // 44 dígitos da chave de acesso
  numero Int?                                // nNF (posições 25..33 da chave)
  serie  Int?

  origem String @default("APP")              // APP (Focus) | CA (nota antiga do Conta Azul)
  tipo   String @default("VENDA")            // VENDA | DEVOLUCAO — devolução só arquiva, nunca pede assinatura

  pedidoId  String  @map("pedido_id")
  pedido    Pedido  @relation(fields: [pedidoId], references: [id])
  notaAppId String? @unique @map("nota_app_id")
  notaApp   NotaFiscalApp? @relation(fields: [notaAppId], references: [id])

  // ⏳ Na rua | ✓ Recebido | 🗄 Arquivado | ✎ Sem assinatura | ✕ Sem canhoto | ? Desconhecido (mutirão)
  status String @default("AGUARDANDO")
  // AGUARDANDO | DESCONHECIDO | RECEBIDO | ARQUIVADO | SEM_ASSINATURA | SEM_CANHOTO

  // Snapshots — a aba Canhotos lista SEM join (é o que a mantém rápida)
  clienteNome String?  @map("cliente_nome")
  valorTotal  Decimal? @map("valor_total") @db.Decimal(12, 2)
  emitidaEm   DateTime @map("emitida_em")
  competencia String   @map("competencia")    // "2026-08" — filtro do mês
  pastaFisica String   @map("pasta_fisica")   // "Notas Emitidas Agosto 2026" (preenchido sozinho)

  // Quem levou (snapshot no momento do registro; "na rua" é derivado disto)
  embarqueId    String?   @map("embarque_id")
  motoristaId   String?   @map("motorista_id")
  motoristaNome String?   @map("motorista_nome")
  saiuEm        DateTime? @map("saiu_em")      // embarque.dataSaida — base do alerta de 3 dias

  // Bipe
  recebidoPorId   String?   @map("recebido_por_id")
  recebidoPorNome String?   @map("recebido_por_nome")
  recebidoEm      DateTime? @map("recebido_em")
  recebidoOrigem  String?   @map("recebido_origem")  // LEITOR | CAMERA | NUMERO | MUTIRAO
  caixaDiarioId   String?   @map("caixa_diario_id")  // em qual caixa o bipe aconteceu (auditoria)
  caixaDiario     CaixaDiario? @relation(fields: [caixaDiarioId], references: [id])

  // Arquivamento
  arquivadoPorId   String?   @map("arquivado_por_id")
  arquivadoPorNome String?   @map("arquivado_por_nome")
  arquivadoEm      DateTime? @map("arquivado_em")

  // Liberação sem canhoto (motivo FECHADO + senha)
  motivoLiberacao  String?   @map("motivo_liberacao")
  liberadoPorId    String?   @map("liberado_por_id")
  liberadoPorNome  String?   @map("liberado_por_nome")
  liberadoEm       DateTime? @map("liberado_em")
  // "Volta amanhã": libera o caixa de hoje mas a nota CONTINUA na fila de pendências
  voltaAmanha      Boolean   @default(false) @map("volta_amanha")

  observacao String? @db.Text

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([status])
  @@index([competencia, status])
  @@index([pedidoId])
  @@index([numero])
  @@index([motoristaId, saiuEm])
  @@map("canhotos_nota")
}
```

Relações inversas a acrescentar (só linhas novas, nada removido):

- `Pedido` (`schema.prisma:452`, junto de `notasFiscaisApp`): `canhotos CanhotoNota[]`
- `NotaFiscalApp` (`schema.prisma:776`): `canhoto CanhotoNota?`
- `CaixaDiario` (`schema.prisma:1602`): `canhotosBipados CanhotoNota[]`

**Sem tabela de eventos.** As transições que importam já têm quem/quando em coluna; a liberação sem canhoto
(única ação de risco) grava também em `AuditLog` (`schema.prisma:1722`, `acao: 'LIBERAR_NOTA_SEM_CANHOTO'`,
`entidade: 'CanhotoNota'`) — **fora da transação**, em `try/catch` próprio.

---

## 3. Parsing da chave — util compartilhado

Criar **dois arquivos espelhados** (padrão já usado em `backend/utils/documento.js` + `frontend/src/utils/documento.js`):

- `backend/utils/chaveNfe.js`
- `frontend/src/utils/chaveNfe.js`

Funções:

- `limpar(txt)` — tira tudo que não é dígito e o prefixo `NFe` (o webhook da Focus manda assim; `focusNfeEmissaoService.js:221` faz o mesmo `replace(/\D/g,'')`).
- `ehChave(txt)` — exatamente 44 dígitos.
- `numeroDaChave(chave)` — `Number(chave.slice(25, 34))` (layout: cUF 2 · AAMM 4 · CNPJ 14 · mod 2 · série 3 · **nNF 9** · tpEmis 1 · cNF 8 · DV 1 = 44).
- `serieDaChave(chave)` — `Number(chave.slice(22, 25))`.
- `dvValido(chave)` — módulo 11 sobre os 43 primeiros dígitos. **Rejeita leitura torta do leitor a laser** antes de ir ao banco.
- `interpretarBipe(txt)` → `{ tipo: 'chave' | 'numero' | 'invalido', chave?, numero? }`. Até 9 dígitos = número da nota digitado (código rasgado); 44 dígitos com DV bom = chave.

**A validação vale no backend, sempre.** O front usa o mesmo util só para retorno instantâneo, nunca como autoridade.

---

## 4. Leitura por câmera

- **Caminho 1 (rápido):** `BarcodeDetector` nativo, quando `'BarcodeDetector' in window` **e**
  `await BarcodeDetector.getSupportedFormats()` incluir `code_128`. Cobre Chrome no Android. Custo zero de bundle.
- **Caminho 2 (fallback iOS/Safari):** `@zxing/library` (decodifica Code-128), carregado **sob demanda** com
  `await import('@zxing/library')` só quando o usuário toca "Ler pelo celular". Instalar como dependência npm
  (**nada de CDN**). Conferir a licença (`npm view @zxing/library license`) antes de commitar; se não for
  permissiva, alternativa é `quagga2`.
- **`jsqr` que já está no projeto NÃO serve** — lê só QR, e o código da DANFE é Code-128C.
- **Permissão de câmera no PWA:** já funciona hoje (`ConferirFolhaModal.jsx`). Reusar `facingMode:'environment'`,
  `<video playsInline muted>`, parar todos os tracks no unmount, tela de erro amigável com o campo de
  digitação sempre disponível como saída.

---

## 5. Quais notas entram no caixa do dia

1. **Universo do caixa de vendedor V no dia D** = exatamente o mesmo `where` que `/resumo` já usa
   (`caixa.js:366-371`). Zero regra nova, zero divergência com o resto do caixa.
2. **Só `ENTREGUE` e `ENTREGUE_PARCIAL` exigem canhoto.** `DEVOLVIDO` aparece na lista (o papel tem que
   voltar) mas **não trava**.
3. **Faturamento atrasado:** a nota só entra na trava do caixa D se `emitidaEm <= fim do dia D`. Nota
   autorizada depois **não trava o caixa de D**; fica pendente na aba Canhotos e é cobrada no **próximo
   caixa aberto do mesmo motorista**.
4. **Nada é pré-vinculado.** O card do caixa monta a lista por consulta. `caixaDiarioId` só é gravado no
   bipe, para auditoria.

---

## 6. Arquivos afetados

### Criar — backend

| Arquivo | Por quê |
|---|---|
| `backend/config/canhotoConfig.js` | Chave liga/desliga em `app_configs` (`canhoto_nota`): `{ modo: 'AVISO'\|'TRAVA'\|'OFF', desde, instaladoEm, diasAlerta: 3 }`, cache 30s e **`catch` devolvendo o padrão**. Nasce em `AVISO`. |
| `backend/services/canhotoService.js` | `registrarDeNotaApp(nota)`, `registrarDeNotaCA(pedido)`, `bipar({texto, usuario, contexto})`, `arquivar`, `marcarSemAssinatura`, `liberarSemCanhoto`, `resumoDoCaixa(vendedorId, data)`, `listarPeriodo`, `backfill({de, ate})`, `podeLiberarSemCanhoto(perms)`. |
| `backend/routes/canhotoRoutes.js` | Rotas do módulo, montadas em `/api/canhotos`. |
| `backend/utils/chaveNfe.js` | Parsing/DV da chave (seção 3). |
| `backend/manuais/abas/canhotos.md` | Manual da aba nova (fonte do Clippy). |

### Alterar — backend

| Arquivo | O que muda |
|---|---|
| `backend/prisma/schema.prisma` | Model `CanhotoNota` + 3 relações inversas. **Nada removido.** |
| `backend/services/focusNfeEmissaoService.js` | 4 chamadas **best-effort** a `canhotoService.registrarDeNotaApp(atualizada)` depois de cada `marcarPedidoFaturado(...)` (linhas 287, 301, 339 e dentro de `consultarPresas`). Cada uma em `try/catch` que só loga. |
| `backend/routes/caixa.js` | (a) `/resumo` (~885-893): bloco `canhotos` no payload + `pendencias.canhotosPendentes` + entrada no `podeFechar`; (b) `/fechar` (~1178-1201): mesma checagem antes de gravar. Ambas **em `try/catch` que degrada para "sem pendência"**. |
| `backend/index.js` | Montar `/api/canhotos`. |
| `backend/routes/contasReceber.js` | `GET /` devolve `canhoto: { status, pastaFisica, motivoLiberacao }` por linha — **uma consulta só** (`findMany` por `pedidoId IN (...)`). Filtro novo `canhoto=com\|sem\|pendente`. |
| `backend/routes/pedidoRoutes.js` | Incluir `canhotos: { select: { status, pastaFisica } }` no `include` da listagem. |
| `backend/routes/adminExec.js` | `POST /canhotos-backfill` e `GET /canhotos-diag`. |
| `backend/services/copilotoService.js` | Linha nova na tabela `ABAS`. |
| `backend/manuais/abas/notas-fiscais.md`, `caixa.md`, `contas-receber.md` | Aba nova, card novo no caixa, coluna nova. |

### Criar — frontend

| Arquivo | Por quê |
|---|---|
| `frontend/src/utils/chaveNfe.js` | Espelho do util do backend. |
| `frontend/src/services/canhotoService.js` | Cliente HTTP do módulo. |
| `frontend/src/components/BipeCanhoto.jsx` | **Peça reutilizada nas 3 telas**: campo de bipe sempre focado + botão "Ler pelo celular". Trata Enter do leitor USB, debounce, refoco, som/vibração e a lista das últimas leituras. |
| `frontend/src/components/LeitorCodigoBarras.jsx` | Modal de câmera (BarcodeDetector → fallback `@zxing/library` por `import()` dinâmico). |
| `frontend/src/pages/Financeiro/CanhotosTab.jsx` | Conteúdo da aba Canhotos (mutirão + contadores + alerta de 3 dias + lista). |
| `frontend/src/pages/Caixa/CanhotosNotasCard.jsx` | Card do caixa do dia (Tela 1). |
| `frontend/src/pages/Caixa/ModalSemCanhoto.jsx` | Justificativa com motivo fechado + senha (Tela 3). |
| `frontend/public/novidade-canhoto-nf.html` + entrada em `novidades.json` | Anúncio para o grupo. |

### Alterar — frontend

| Arquivo | O que muda |
|---|---|
| `frontend/src/pages/Financeiro/NotasFiscais.jsx` | Entrada `['canhotos', …]` no array de abas (`:518-521`) e `if (filtroStatus === 'canhotos') return <CanhotosTab periodo={periodo} …/>` acima da lista. |
| `frontend/src/pages/Caixa/CaixaDiarioPage.jsx` | Montar `CanhotosNotasCard` abaixo de `ConferenciaDevolucaoCard` (`:936`) com `onChanged={fetchResumo}`; linha nova de pendência no bloco `:1320-1345`. |
| `frontend/src/pages/Pedidos/ListaPedidos.jsx` | Pílula do canhoto ao lado do selo da NF + filtro `Canhoto` com `useFiltrosSalvos`. |
| `frontend/src/pages/Financeiro/ContasReceberTabela.jsx` | Coluna "NF assinada" + filtro "só com canhoto" (`SelectBusca`), versão card no mobile. |
| `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` | Permissão nova: default `false`, entrada no `BOOL_INDEX` (seção `caixa`), perfil financeiro, toggle da seção Caixa. |
| Configurações → Caixa (onde vive `/conferencia-dinheiro/config`) | Chave liga/desliga do canhoto com os 3 modos. |

---

## 7. Contrato das rotas

Todas em `/api/canhotos`, atrás de `authMiddleware`.

| Método · caminho | Entrada | Saída | Permissão |
|---|---|---|---|
| `GET /config` | — | `{ modo, desde, instaladoEm, diasAlerta }` | qualquer autenticado |
| `PUT /config` | `{ modo, diasAlerta }` | config salva | `admin` |
| `GET /caixa?vendedorId=&data=YYYY-MM-DD` | — | `{ exigido, modo, total, recebidos, pendentes, notas:[{chave,numero,clienteNome,valor,status,statusEntrega,recebidoPorNome,recebidoEm,motivoLiberacao,diasNaRua}], podeLiberar }` | `Pode_Acessar_Caixa` |
| `POST /bipar` | `{ texto, contexto:'CAIXA'\|'MUTIRAO', vendedorId?, data?, origem:'LEITOR'\|'CAMERA'\|'NUMERO' }` | `{ ok:true, jaEstava:bool, canhoto:{…}, aviso? }` | `Pode_Acessar_Caixa` **ou** `Pode_Acessar_Notas_Fiscais` |
| `POST /arquivar` | `{ chaves:[…] }` | `{ arquivadas, ignoradas }` | idem |
| `POST /sem-assinatura` | `{ chave }` | `{ ok, canhoto }` | idem |
| `POST /liberar` | `{ chave, motivo, voltaAmanha, senha }` | `{ ok, canhoto }` | `podeLiberarSemCanhoto` **+ `bcrypt.compare` da senha do próprio usuário** |
| `GET /periodo?de=&ate=&status=&busca=` | — | `{ contadores:{…}, alerta3Dias:[…], itens:[…], pastaFisica }` | `Pode_Acessar_Notas_Fiscais` |
| `POST /backfill` | `{ de, ate }` | `{ criados, jaExistiam }` | `Pode_Acessar_Notas_Fiscais` |
| `POST /api/admin-exec/canhotos-backfill` · `GET /api/admin-exec/canhotos-diag` | `{ mes }` | idem | `x-admin-secret` |

**Regras transversais das rotas de escrita:**

- `POST /bipar` é **idempotente**: `upsert` pela `chave`. Nota já `RECEBIDO`/`ARQUIVADO` devolve
  `200 { ok:true, jaEstava:true }` — **nunca erro**. É o comportamento normal do mutirão.
- Bipe que não acha a chave → `200` com `{ ok:false, motivo:'NAO_ENCONTRADA' }`. Nunca 500.
- `POST /liberar` usa `$transaction` com `{ timeout: 20000, maxWait: 10000 }`; o `AuditLog` vai **depois**,
  em `try/catch` próprio.
- Motivos fechados (constante no service, espelhada no front): `CLIENTE_FICOU_COM_VIA`,
  `SEM_QUEM_ASSINASSE`, `EXTRAVIADO_DANIFICADO`, `VOLTA_AMANHA`.

**Permissão nova:** `Pode_Liberar_Nota_Sem_Canhoto`, seção `caixa`.

```
podeLiberarSemCanhoto(perms) =
  perms.admin
  || perms.Pode_Liberar_Nota_Sem_Canhoto
  || perms.Pode_Conferir_Dinheiro_Caixa      // "quem confere o caixa também libera"
  || perms.Pode_Conferir_Devolucao_Caixa
```

O front usa **exatamente esta mesma expressão** (regra de espelhamento do CLAUDE.md). Bipar/arquivar
**não** ganha permissão nova — quem já entra no Caixa ou em Notas Fiscais bipa.

---

## 8. Ordem de execução — 3 pedaços

### Pedaço 1 — Aba "Canhotos" + mutirão + backfill *(entrega valor sozinho)*

Resolve o passado: a equipe pega a pasta "Notas Emitidas Agosto 2026", passa o leitor no maço e vê na hora
o que falta. Nada trava, nada muda no caixa.

1. `schema.prisma`: `CanhotoNota` + relações inversas → `npx prisma generate`.
2. `backend/utils/chaveNfe.js` + `frontend/src/utils/chaveNfe.js`.
3. `backend/config/canhotoConfig.js` (nasce em `AVISO`).
4. `backend/services/canhotoService.js`: registro, bipe idempotente, arquivar, sem-assinatura, listar período, backfill.
5. Gancho best-effort nos 4 pontos de `focusNfeEmissaoService.js` + auto-cura no `listarPeriodo` (períodos ≤ 62 dias).
6. `backend/routes/canhotoRoutes.js` + montagem no `index.js` + `adminExec.js`.
7. Front: `canhotoService.js`, `chaveNfe.js`, `BipeCanhoto.jsx`, `LeitorCodigoBarras.jsx`, `CanhotosTab.jsx`, entrada da aba em `NotasFiscais.jsx`.
8. `cd frontend && npm run build`.

### Pedaço 2 — Card no Caixa + trava + justificativa com senha

Sai em modo **AVISO**; a virada para **TRAVA** é um clique em Configurações.

9. Permissão `Pode_Liberar_Nota_Sem_Canhoto` (backend + `PermissoesModal.jsx`).
10. `canhotoService.resumoDoCaixa` + `liberarSemCanhoto` (transação com timeout, `AuditLog` fora).
11. `caixa.js`: `/resumo` e `/fechar` — **em `try/catch` que degrada para zero pendência**.
12. Front: `CanhotosNotasCard.jsx`, `ModalSemCanhoto.jsx`, montagem e bloco de pendências em `CaixaDiarioPage.jsx`.
13. Chave liga/desliga na tela de Configurações → Caixa.
14. Build.

### Pedaço 3 — Selo em Pedidos + coluna em Contas a Receber

15. `pedidoRoutes.js` (include) + selo/filtro em `ListaPedidos.jsx`.
16. `contasReceber.js` (`GET /` + filtro `canhoto=`) + coluna/filtro/card mobile em `ContasReceberTabela.jsx`.
17. Build.

### Fechamento (obrigatório)

18. `backend/manuais/abas/canhotos.md` + atualizar `notas-fiscais.md`, `caixa.md`, `contas-receber.md` +
    linha na tabela `ABAS` do `copilotoService.js`.
19. `frontend/public/novidade-canhoto-nf.html` (accordions **já abertos**, mockups com pins dourados
    numerados, OG sem `og:image`, **sem** botão "Abrir o app") + entrada no topo de `novidades.json` +
    texto pronto para o grupo.

---

## 9. Riscos e o que pode quebrar

**A trava do caixa não pode impedir o fechamento por bug.** Quatro camadas:

1. O cálculo de pendência no `/resumo` e no `/fechar` fica em `try/catch` isolado — **qualquer exceção vira
   "sem pendência"** e loga `[Canhoto]`. Padrão já existente em `caixaConferenciaConfig.js:57-61`.
2. Nasce em `modo: 'AVISO'` — o card aparece e conta, mas **não entra no `podeFechar`**.
3. `desde` protege o passado: caixa anterior à virada nunca trava retroativamente.
4. A justificativa com senha é a válvula.

**A tela de Notas Fiscais não pode ficar lenta.** A aba Canhotos **não usa `/fila`** (que chama
`sincronizarEventos()` e traz 2000 pedidos). Endpoint próprio lendo só `canhotos_nota`, com
`clienteNome`/`valorTotal`/`numero` em snapshot na própria linha (zero join no caminho quente), contadores
por `groupBy` e índice `(competencia, status)`. Auto-cura só em período ≤ 62 dias.

**Nada pode quebrar a emissão de NF-e que já roda em produção.** O gancho é **best-effort e nunca lança**:
fora de qualquer `$transaction`, em `try/catch` próprio, e **depois** de `marcarPedidoFaturado`. Se falhar,
o registro é criado depois pelo backfill/auto-cura. Nenhuma linha da montagem ou do envio à Focus é alterada.
As travas do CLAUDE.md continuam intactas.

**Outros riscos:**

- *Nota em dobro na tabela* — impossível: `chave @unique` + `upsert`.
- *Enter do leitor USB disparando outro botão* — o campo fica dentro de `<form onSubmit={…}>` com
  `preventDefault`, e o botão "Fechar caixa" nunca é `type="submit"`. **Ponto explícito para o revisor.**
- *Leitura torta do laser* — o DV módulo 11 barra antes de ir ao banco.
- *Bipe duplo por leitor rápido* — debounce por chave (~800 ms) no `BipeCanhoto` + idempotência no servidor.
- *iOS sem `BarcodeDetector`* — fallback `@zxing/library`; se falhar, o campo de digitação continua funcionando.
- *Peso do bundle* — `@zxing/library` só por `import()` dinâmico; conferir no build que saiu em chunk separado.
- *Escopo* — `especial`, `bonificacao`, `cancelado` e `statusEnvio: 'EXCLUIDO'` **nunca** geram canhoto.
  Homologação (`ambiente !== 'producao'`) também não.
- *Prisma* — só acréscimo; nenhum campo removido; nenhum `$transaction` novo sem
  `{ timeout: 20000, maxWait: 10000 }`. Boy-scout: ao tocar `caixa.js`, conferir as transações vizinhas.
- *Trava dupla* — não ligar `TRAVA` do canhoto na mesma semana da conferência de dinheiro.

---

## 10. Critérios de aceite (do jeito que o QA vai clicar)

### Pedaço 1

1. Notas Fiscais → aba **Canhotos** aparece ao lado de "A emitir / Emitidas / Todas" e o `FiltroPeriodo`
   continua funcionando nas outras abas.
2. Clicar "Colocar o mês em dia" → contadores saem de zero e as notas do mês aparecem como **Desconhecido**.
   Clicar **de novo** → `criados: 0`, nenhuma linha duplicada.
3. Colar/digitar uma chave de 44 dígitos de uma nota do mês → a linha risca e vira **Arquivado**; a pasta
   mostra "Notas Emitidas Agosto 2026" sem ninguém digitar.
4. **Bipar a mesma nota outra vez** → mensagem "já estava arquivada", **sem erro vermelho** e sem linha nova.
5. Digitar só o número da nota (ex.: `85142`) → acha a mesma nota.
6. Digitar 44 dígitos com um dígito trocado → recusa com "código inválido, tente de novo".
7. "Ler pelo celular" no Android → câmera abre, lê a DANFE, a lista atualiza. No iPhone → câmera abre pelo
   fallback; se não ler, o campo de digitação resolve.
8. Emitir uma NF-e de venda → a nota aparece na aba como **Na rua** em segundos, sem nenhum erro na emissão.
9. Pedido especial e bonificação **não** aparecem na aba.
10. Nota emitida há mais de 3 dias e ainda na rua → linha **vermelha** e listada no alerta.
11. Em 375px: sem scroll horizontal, lista vira cards, campo de bipe confortável para o dedo.

### Pedaço 2

12. Caixa do dia de um motorista com entregas com nota → card **"Canhotos das notas"** abaixo da conferência
    de devolução, com "X de Y recebidos".
13. Com a chave em **AVISO**: faltando canhoto, o card mostra a pendência e **"Fechar caixa" continua funcionando**.
14. Virando para **TRAVA**: "Fechar caixa" fica cinza, a lista de pendências cita os canhotos, e chamar
    `POST /caixa/fechar` direto pela API também é recusado.
15. "Não voltou" → modal com os 4 motivos e senha. Senha errada → 401, nota inalterada. Senha certa → nota
    vira **Sem canhoto**, o contador zera e o caixa fecha.
16. Usuário **sem** `Pode_Liberar_Nota_Sem_Canhoto` mas **com** `Pode_Conferir_Dinheiro_Caixa` **consegue**
    liberar. Usuário sem nenhuma das duas **não vê o botão** e o backend recusa a rota chamada na mão.
17. Motivo "Volta amanhã" → o caixa de hoje fecha, mas a nota continua na aba Canhotos como pendente.
18. Nota emitida **depois** que o caixa foi fechado → não reabre pendência no caixa de ontem; aparece no próximo.
19. Entrega `DEVOLVIDO` → aparece na lista, **não trava**.
20. Desligar a chave (`OFF`) → o card some e o caixa fecha como sempre foi.
21. Registrar uma devolução na conferência do Caixa → **a NF-e de devolução continua saindo automática no
    mesmo clique** (regressão obrigatória do CLAUDE.md).

### Pedaço 3

22. Lista de Pedidos: pílula do canhoto ao lado do selo da NF, nos 4 estados; o filtro **Canhoto** lembra a
    escolha ao sair e voltar da tela.
23. Contas a Receber: coluna **"NF assinada"** com ✓ arquivada / ✕ com o motivo / ⏳ na rua; filtro "só com
    canhoto" reduz a lista; a versão mobile mostra a informação no card.
24. Tempo de carga de Contas a Receber e da lista de Pedidos **não piora** de forma perceptível.
25. Notas Fiscais → aba "A emitir" continua com o mesmo tempo de carga de antes.

---

## 11. Pontos decididos por padrão (dono ainda não confirmou)

1. **NF de devolução** — não pede assinatura, mas precisa estar arquivada; se não estiver, o sistema oferece
   reimprimir a DANFE. *(Única regra sem aval explícito do dono.)*
2. **Pedido entregue como `DEVOLVIDO` por inteiro** — entra na lista para arquivar, **não trava**.
3. **Faturamento atrasado** — cai no próximo caixa aberto do mesmo motorista; nunca reabre pendência em caixa
   já fechado.
4. **Quem pode bipar** — sem permissão nova: quem acessa Caixa ou Notas Fiscais bipa.
5. **Nota "sem canhoto" liberada** — só medir (ranking por motorista), sem cobrança em dinheiro.
