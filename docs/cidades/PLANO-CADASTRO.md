# Plano — Cadastro oficial de cidades (tabela `cidades`)

**Arquiteto, 14/09/2026.** Pedido do dono: *"não quero cidades repetidas, isso bagunça tudo. Se a Receita Federal
trouxer alguma cidade nova, perguntar para cadastrar antes; se trouxer nome diferente, perguntar para cadastrar ou
escolher outra."* Supera a decisão de agosto (sem tabela). **Porte: GRANDE** (permissões, sync do CA, API da IA v1,
backfill em produção) → arquiteto → dev-backend + dev-frontend em paralelo → QA + revisor → gerente-entrega.

## 1. Objetivo (interpretação adotada)

- Existe UMA lista oficial de cidades (`cidades`). Todo campo Cidade do app só aceita item dessa lista.
- Cidade nova entra por um passo explícito ("Cadastrar nova cidade…" com nome + UF), com aviso de parecidas antes de
  confirmar ("Você quis dizer Itapoá?").
- Consulta de CNPJ nunca preenche cidade fora da lista: se a Receita trouxer nome desconhecido, modal pergunta
  "cadastrar" ou "escolher outra".
- As 6 tabelas continuam com cidade como TEXTO (sem FK — `clientes` está no teto de colunas); o texto gravado passa a
  ser sempre `cidades.nome` da linha ativa. Backend blinda; frontend espelha.
- Entradas automáticas (sync do CA, IA externa) não podem quebrar: gravam normalizado e viram **pendência** para o
  admin resolver na tela Cidades.

## 2. Mapa do código atual (lido, não deduzido)

| Ponto | Arquivo:linha | Hoje |
|---|---|---|
| Helpers de grafia | `backend/utils/cidade.js` (`chaveCidade`, `normalizarCidade`, `CIDADES_CANONICAS` 12 oficiais + 6 apelidos + sentinela `'sem cidade'`), espelho `frontend/src/utils/cidade.js:325` | dicionário fixo no código |
| Lista para dropdown | `backend/routes/cidades.js` GET `/api/cidades` (distinct de clientes+leads+meta_cidades; resposta `{ok,total,cidades[],detalhe[{cidade,registros}]}`), montada em `backend/index.js:159` com `authMiddleware` | derivada dos dados, não é cadastro |
| Campo Cidade | `frontend/src/components/CampoCidade.jsx` (cache 5 min, `permitirNovo` → "Usar 'X'" grava texto livre normalizado) sobre `ComboBusca.jsx` (`extraAction`, `permitirNovo`, busca sem acento) | aceita cidade nova sem confirmação |
| Usos do CampoCidade | `NovoCliente.jsx:419`, `DetalheCliente.jsx:1508`, `Rota/ModalNovoLead.jsx:313`, `Leads/ModalEditarLead.jsx:268` | 4 telas |
| Inputs de cidade ainda LIVRES | `Financeiro/FornecedoresPage.jsx:343`, `KitFesta/AbaBairros.jsx:59`, `Configuracoes/Metas/MetaFormModal.jsx:711` (`novaCidade`) | `<input>` texto |
| CNPJ → cidade | `backend/services/consultaCnpjService.js:57,80` (`normalizarCidade` do município da BrasilAPI/CNPJá); `NovoCliente.jsx:129` e `DetalheCliente.jsx:359` gravam direto no form | preenche sem conferir a lista |
| Escrita blindada (fase 1) — 11 pontos | `clienteController.js:44` (espelho p/ fornecedor), `:560` criar, `:838` atualizar (PATCH); `leadService.js:103` criar, `:131` atualizar; `fornecedores.js:98,144`; `kitFestaService.js:916` bairro; `metaService.js:57` via `utils/metaCidadeMerge.js:73`; `contaAzulService.js:656,1023,1671`; `contasPagarCaSyncService.js:321`; `iaClienteService.js:439` (`POST /api/ia-consulta/v1/cliente/criar-lead`, `iaConsultaRoutes.js:75`); `catalogoPersonalizadoService.js:92` (lê do cliente, monta "Cidade · UF") | só normaliza, não valida |
| Permissões | criar cliente = `perms.admin || perms.clientes?.edit` (`clienteController.js:447-451`); criar lead **sem check nenhum** (`leadController.js:47-54`, qualquer logado); editar lead = `admin || Pode_Editar_Lead` (`:59-61`); Configurações = tab `configuracoes` (`App.jsx:398,947-955`) | — |
| Backfill | `backend/services/backfillCidadesService.js`: `ALVOS` (:88, as 6 tabelas), `nomeFinalDe` (:135, apelidos → dicionário → `normalizarCidade`), `montarPlano` (:240), `aplicar`/`reverter` com snapshot em `../uploads/backfill-cidades` | fonte dos nomes = dicionário |
| Diagnóstico | `adminExec.js:11196` `GET /diag-cidades` + `utils/cidadeNomeFinal.js` (`decidirNomeFinal`) — produção 13/09: 123 grafias → 104 cidades | — |
| Sync do CA | `workers/scheduler.js:47` chama `contaAzulService.syncPedidosModificados` (:1340), que **cria cliente** com cidade do CA (:1671); `config/contaAzulModo.js` = `CA_SOMENTE_LEITURA: true` (leitura do CA continua) | roda sozinho |
| Mapa / catálogo | `mapaClientesService.js:152-165` (facetas `cidades`), `Site/ListaPersonalizada.jsx:91` mostra `clienteCidade` | sem UF |
| Clippy | `copilotoService.js:32` tabela `ABAS` (ex.: `:118` config-categorias-cliente); manuais `backend/manuais/abas/{clientes,leads,rota,config-metas,mapa-clientes}.md` | — |

## 3. Schema (Prisma) — tabelas NOVAS, seguras para `db push`

```prisma
// Cadastro oficial de cidades. As 6 tabelas continuam gravando TEXTO (= `nome` da linha ativa);
// NÃO há FK de propósito (clientes está no teto de colunas). A unicidade é pela chave normalizada.
model Cidade {
  id           String    @id @default(uuid())
  nome         String                       // nome oficial: "Itapoá", "Jaraguá do Sul" (== normalizarCidade(nome))
  uf           String?   @db.VarChar(2)     // "SC"; null só quando o nome é ambíguo e o dono ainda não escolheu
  chave        String    @unique            // chaveCidade(nome): "itapoa" — é o que impede a repetição
  ibge         String?                      // código IBGE, opcional
  ativo        Boolean   @default(true)
  fundidaEmId  String?   @map("fundida_em_id") // preenchido quando esta cidade foi fundida em outra (histórico)
  criadoEm     DateTime  @default(now()) @map("criado_em")
  criadoPor    String?   @map("criado_por")   // id do usuário; null = semente/automático
  atualizadoEm DateTime  @updatedAt @map("atualizado_em")
  @@index([ativo])
  @@map("cidades")
}

// Cidade que chegou por entrada AUTOMÁTICA (sync do CA, IA externa) e não existe na lista.
// Gravou normalizada no registro de origem e ficou aqui para o admin decidir (cadastrar ou apontar).
model CidadePendente {
  id          String    @id @default(uuid())
  chave       String    @unique            // uma pendência por grafia
  nomeBruto   String    @map("nome_bruto")  // como veio
  nomeGravado String    @map("nome_gravado")// o que foi gravado (normalizarCidade)
  uf          String?   @db.VarChar(2)
  origem      String                        // CA_SYNC | IA_LEAD | CA_FORNECEDOR
  ocorrencias Int       @default(1)
  exemplo     String?                       // "clientes:UUID" do 1º registro
  resolvidoEm DateTime? @map("resolvido_em")
  cidadeId    String?   @map("cidade_id")   // para onde foi resolvida
  criadoEm    DateTime  @default(now()) @map("criado_em")
  @@map("cidades_pendentes")
}
```

Regra: `nome` deve satisfazer `normalizarCidade(nome) === nome` (senão a fase 1 re-suja). A chave é só do nome
(sem UF): as 6 tabelas guardam só o nome, então dois municípios homônimos em UFs diferentes não podem coexistir —
limitação assumida; se um dia surgir, o 2º entra com nome desambiguado (decisão do dono na hora).

## 4. Contrato das rotas (`/api/cidades`, `authMiddleware`) — FECHADO para os dois devs

| Rota | Quem pode | Corpo / resposta |
|---|---|---|
| `GET /` | qualquer logado | **mantém** `{ok,total,cidades:string[],detalhe:[{cidade,registros}]}` e ACRESCENTA `detalhe[].uf`, `detalhe[].id`. Só `ativo=true`. Fonte: tabela (não mais o distinct). |
| `GET /resolver?nome=X&uf=SC` | qualquer logado | `{ existe:true, cidade:{id,nome,uf} }` ou `{ existe:false, nomeSugerido:"X normalizado", sugestoes:[{id,nome,uf,distancia}] }` |
| `GET /sugestoes?nome=X` | qualquer logado | `{ sugestoes:[…] }` (Levenshtein ≤ 2 sobre `chave`, mais prefixo/contém; máx. 5) |
| `POST /` | `admin` **ou** `clientes.edit` **ou** `rota.edit` (ver §6) | `{nome, uf, ibge?, confirmarParecida?:true}` → `201 {cidade}`; `409 {codigo:'CIDADE_JA_EXISTE', cidade}` se a chave existe (inclusive inativa → devolve e o front oferece reativar); `409 {codigo:'CIDADE_PARECIDA', sugestoes}` quando há parecida e `confirmarParecida` não veio; `400` UF inválida |
| `PUT /:id` | `admin` ou tab `configuracoes` | `{nome?, uf?, ibge?}` — renomear reescreve o texto nas 6 tabelas (usa o mesmo motor da fusão, com snapshot) |
| `POST /:id/inativar` / `/:id/reativar` | idem | 400 se houver registro usando a cidade (inativar exige fundir antes) |
| `POST /:id/fundir` | idem | `{destinoId, dryRun:true}` → plano (linhas por tabela, colisões de meta); `dryRun:false` → aplica, snapshot, origem vira `ativo=false, fundidaEmId` |
| `GET /pendentes` | idem | lista `CidadePendente` não resolvidas |
| `POST /pendentes/:id/resolver` | idem | `{cidadeId}` (aponta p/ existente → reescreve os registros com aquela grafia via fusão) ou `{criar:{nome,uf}}` |

Erro padrão de gravação nas rotas de negócio (cliente, lead, fornecedor, bairro, meta):
`400 { codigo:'CIDADE_NAO_CADASTRADA', cidade:'X', sugestoes:[{id,nome,uf}] }`. O front trata esse `codigo` em toda
tela que grava cidade (toast + reabrir o campo).

## 5. Plano numerado

### Pacote BACKEND (dev-backend)
1. **Schema**: adicionar `Cidade` e `CidadePendente` em `backend/prisma/schema.prisma` (§3). Nada removido.
2. **`backend/utils/ufPorCidade.js`** (novo): lista embutida dos 295 municípios de SC + municípios de PR/RS/SP que
   já aparecem no diagnóstico, no formato `{ chave → uf }`; exporta `ufDe(chave)` → `'SC' | null` e
   `ehAmbiguo(chave)` (nome que existe em mais de uma UF, ex.: "Bom Jesus"). Só para a semente e para sugerir UF
   no modal.
3. **`backend/services/cidadeService.js`** (novo) — o coração:
   - cache em memória `Map<chave, Cidade>` (TTL 60 s, invalidado por toda escrita do próprio service; com 2 réplicas
     o TTL cobre).
   - `resolver(nomeBruto, { modo:'estrito'|'tolerante', origem, exemplo })`:
     - vazio → `null` (cidade em branco continua permitida onde já era);
     - acha por `chaveCidade` (também via `CIDADES_CANONICAS` como apelido: "Joinvile" → chave "joinville") → devolve
       `cidade.nome` (ativa) ou, se inativa com `fundidaEmId`, o nome do destino;
     - não acha + estrito → `throw` `{status:400, codigo:'CIDADE_NAO_CADASTRADA', cidade, sugestoes}`;
     - não acha + tolerante → devolve `normalizarCidade(nomeBruto)` e faz `upsert` em `CidadePendente` (fora de
       transação, em try/catch próprio, nunca derruba a origem).
   - `sugerir(nome)` (Levenshtein ≤ 2 + prefixo/contém, sobre `chave` das ativas), `criar`, `editar`, `inativar`,
     `reativar`, `listar`, `pendentes`, `resolverPendente`.
   - `fundir(origemId, destinoId, { dryRun, usuarioId })` → delega a `backfillCidadesService` (item 6).
4. **`backend/routes/cidades.js`**: implementar §4. `GET /` mantém o formato (o `CampoCidade` atual e qualquer outra
   tela que leia `cidades[]` continuam funcionando durante o deploy). Verificação de permissão lendo
   `req.user.permissoes` como em `clienteController.js:447` (string JSON **ou** objeto — tratar os dois).
5. **Blindar os pontos de escrita** (trocar `normalizarCidade(x)` por `await cidadeService.resolver(x, {...})`):
   - **estrito**: `clienteController.js:560` (criar) e `:838` (PATCH — só quando `End_Cidade !== undefined`),
     `:44` (espelho fornecedor — usa o nome já resolvido); `leadService.js:103,131` recebendo `opcoes` do controller
     (`leadController.js:49,63` → estrito); `fornecedores.js:98,144`; `kitFestaService.js:916`;
     `metaService.js:57` — resolver cada `metasCidades[].cidade` ANTES de `deduplicarMetasCidades` (estrito).
     Erro vira `res.status(err.status||500).json({ codigo, cidade, sugestoes, error })`.
   - **tolerante**: `contaAzulService.js:656,1023,1671` (origem `CA_SYNC`), `contasPagarCaSyncService.js:321`
     (`CA_FORNECEDOR`), `iaClienteService.js:432-441` (`IA_LEAD` — chamar `leadService.criar(dados, {modo:'tolerante'})`;
     **resposta `{id,numero,etapa}` não muda**; documentar em `backend/docs/ia-consulta-api.md` que cidade
     desconhecida vira pendência, sem erro). `catalogoPersonalizadoService.js:92`: manter, e usar `cidade.uf` da
     tabela quando `End_Estado` estiver vazio.
   - Atenção `$transaction`: o `resolver` consulta banco/cache — chamar **antes** de abrir a transação em
     `clienteController.criar` e `metaService` (regra do CLAUDE.md: nada secundário dentro; e boy-scout nas
     transações vizinhas desses arquivos).
6. **Backfill como motor de fusão** (`backfillCidadesService.js`):
   - `nomeFinalDe` passa a consultar a tabela primeiro (chave → `nome`; inativa com `fundidaEmId` → nome do destino),
     depois apelidos, depois dicionário. `aprovado`/`apelidos` continuam aditivos.
   - nova função exportada `fundirCidade({ deNome, paraNome, dryRun, usuarioId })`: monta plano só com
     `apelidos:{[chaveDe]: paraNome}`, `aprovado:[{chave:chaveDe, nomeFinal:paraNome}]`, `regraMeta:'somar'`,
     restringindo as variantes à `chaveDe`; reaproveita snapshot + uma `$transaction` por tabela
     (`timeout 20000 / maxWait 10000`) + reversão. Registrar no snapshot `{tipo:'fusao', de, para, usuarioId}`.
   - `CatalogoPersonalizado.clienteCidade` (composto) já é tratado por `decomporComposto`.
7. **Semente** — rota `POST /api/admin-exec/cidades-semente` `{dryRun:true}` (header `x-admin-secret`), em
   `adminExec.js` ao lado de `diag-cidades`: distinct das 6 tabelas → `decidirNomeFinal` (o mesmo do diagnóstico,
   104 nomes) + os 12 oficiais do dicionário → para cada chave inexistente cria `Cidade{nome, uf: ufDe(chave),
   criadoPor:null}`; **exclui** a sentinela `'sem cidade'` e valores só-UF. Resposta: `criadas[]`, `jaExistiam[]`,
   `semUf[]` (ambíguas ou fora da lista — o dono completa na tela). Idempotente. `deployMarker` do `/ping` →
   `cidades-cadastro-2026-09-14`.
8. **Clippy**: `ABAS` em `copilotoService.js` ganha `{slug:'config-cidades', nome:'Configurações — Cidades',
   rota:'/config/cidades', perm:'configuracoes'}`; manual novo `backend/manuais/abas/config-cidades.md` + linha no
   `README.md`; atualizar `clientes.md`, `leads.md`, `rota.md`, `config-metas.md`, `mapa-clientes.md` (campo só
   aceita da lista; "Cadastrar nova cidade…"; modal da Receita).

### Pacote FRONTEND (dev-frontend) — em paralelo, contrato do §4
9. **`frontend/src/services/cidadeService.js`** (novo): `listar`, `resolver(nome, uf)`, `sugestoes`, `criar`,
   `editar`, `inativar`, `reativar`, `fundir`, `pendentes`, `resolverPendente`. Reexportar `invalidarCacheCidades`.
10. **`components/ModalNovaCidade.jsx`** (novo): nome (pré-preenchido com o que foi digitado / o que a Receita
    trouxe), UF (`SelectBusca` com as 27, padrão `SC` ou a UF da Receita), ao abrir chama `sugestoes` e mostra
    "Você quis dizer **Itapoá**?" com botão "Usar esta" (não cria) e "Cadastrar mesmo assim" (envia
    `confirmarParecida:true`). 409 `CIDADE_JA_EXISTE` → seleciona a existente (oferece reativar se inativa).
    Sem permissão de criar → mostra o aviso "Peça ao escritório para cadastrar" e só permite escolher.
11. **`CampoCidade.jsx`**: options da tabela com `sub = uf`; **remover `permitirNovo`**; `extraAction`
    `"Cadastrar nova cidade…"` abre o `ModalNovaCidade` com a busca digitada; ao criar → `invalidarCacheCidades()` +
    `onChange(nome)`. Lista falhou (rede) → mensagem "Não foi possível carregar as cidades" + botão tentar de novo;
    **não** volta a texto livre (o backend recusaria de qualquer jeito). Prop `value` fora da lista (dado antigo
    ainda não fundido) continua exibido, mas com borda âmbar e dica "cidade fora do cadastro — escolha da lista".
12. **`components/ModalCidadeReceita.jsx`** (novo) + util `resolverCidadeDaReceita({cidade, uf})` usado em
    `NovoCliente.jsx:129` e `DetalheCliente.jsx:359`: antes de pôr `End_Cidade` no form chama `resolver`; existe →
    grava `cidade.nome`; não existe → abre o modal "A Receita informou **X / UF**. Cadastrar esta cidade ou escolher
    outra?" com sugestões clicáveis, botão "Cadastrar" (ModalNovaCidade) e "Escolher outra" (CampoCidade inline).
    Enquanto não resolver, `End_Cidade` fica vazio e o campo marcado `invalido`. Os demais campos da Receita entram
    normalmente (não travar o resto do preenchimento).
13. Trocar os 3 inputs livres por `CampoCidade`: `FornecedoresPage.jsx:343`, `KitFesta/AbaBairros.jsx:59`,
    `MetaFormModal.jsx:711` (a checagem local `:189` passa a comparar por `chaveBusca`).
14. Tratamento do `400 CIDADE_NAO_CADASTRADA` nas 7 telas que gravam cidade (toast "A cidade 'X' não está no
    cadastro" + sugestões + foco no campo). Espelhar a permissão de criar exatamente como o backend (§6).
15. **Tela `pages/Configuracoes/Cidades.jsx`** (rota `/config/cidades`, `PrivateRoute tab="configuracoes"`, card
    na `Admin/Configuracoes/Configuracoes.jsx` e no menu onde ficam os outros `/config/*`; `lazyComRetry`):
    - lista (nome, UF, registros por tabela, ativo) com busca sem acento; filtro salvo via `useFiltroSalvo`;
    - editar nome/UF (aviso: "renomear reescreve N registros"), inativar/reativar;
    - **Fundir**: escolher A → B, botão "Simular" (mostra linhas por tabela e colisões de meta) → "Fundir" com
      confirmação; resultado com o nome do snapshot;
    - aba **Pendências**: cidades vindas do CA/IA; para cada uma "Cadastrar" ou "Apontar para…" (CampoCidade).
    - Mobile: tabela vira cards (padrão do CLAUDE.md).
16. **UF onde ajuda**: `MapaClientes.jsx` facetas de cidade mostram "Cidade · UF" (backend `mapaClientesService`
    devolve `uf` junto na faceta — só ADICIONA campo); `ListaPersonalizada.jsx:91` já exibe o composto.
17. `novidade-cadastro-cidades.html` + entrada no topo de `novidades.json` (mockups: campo com "Cadastrar nova
    cidade…", modal da Receita, tela Cidades com fusão, pendências). `npm run build` antes de entregar.

### Ordem / dependências
Backend 1→3→4 primeiro (contrato no ar) enquanto o front faz 9→12 contra o contrato; 5 e 6 podem seguir depois de 4;
7 (semente) roda em produção ANTES de publicar o front que remove "Usar 'X'" — senão o campo fica sem opções. Sequência
de publicação: **deploy backend → semente (dry-run → real) → dono completa UFs ambíguas → deploy frontend → backfill
(fase 3) com a tabela como fonte.**

## 6. Permissões (conferido no código)

- Criar cliente exige `admin || clientes.edit` (`clienteController.js:447`). **Criar lead não exige nada**
  (`leadController.js:47`) — vendedor de campo cadastra lead na Rota. Se "cadastrar cidade" exigir só
  `clientes.edit`, o vendedor que só tem `rota.edit` trava ao prospectar cidade nova.
- **Proposta**: `POST /api/cidades` = `admin || clientes.edit || rota.edit` (quem pode abrir cadastro pode abrir
  cidade; a checagem de parecidas segura a bagunça). Gerir (editar, inativar, fundir, pendências) = `admin ||
  configuracoes` (tab de Configurações). Frontend espelha exatamente essas expressões.
- Se o dono preferir restringir a criação ao escritório, o modal já prevê o estado "sem permissão" (item 10).
- Não é preciso permissão nova no `BOOL_INDEX` (`PermissoesModal.jsx:239`) — reusa as existentes.

## 7. Riscos e efeitos colaterais

1. **Sync do CA** (`syncPedidosModificados`, scheduler a cada ciclo, cria cliente em `:1671`): jamais estrito —
   cairia em exceção dentro do sync inteiro. Tolerante + pendência. Mesmo para `contasPagarCaSyncService`.
2. **IA v1** (`/cliente/criar-lead`): contrato congelado — nenhum campo muda; cidade desconhecida vira pendência,
   nunca 400. Testar com `curl` (exemplo em `backend/docs/ia-consulta-api.md`) antes do commit.
3. **Janela de deploy / PWA antigo**: app velho ainda manda "Usar 'X'" (texto livre) → backend responde 400 com
   mensagem clara; `useVersionCheck` pede atualização. Publicar backend e semente ANTES do front.
4. **Semente incompleta**: se uma cidade em uso não entrar na tabela, todo PATCH desse cliente que envie `End_Cidade`
   dá 400. Mitigação: semente parte do distinct real das 6 tabelas (não só do dicionário); `DetalheCliente` só envia
   `End_Cidade` quando o usuário mexeu no campo (conferir `:838` — já é `undefined` quando não vem).
5. **Dado antigo com grafia velha** (backfill da fase 3 ainda não rodou): `resolver` casa por chave + apelidos do
   dicionário, então "JOINVILLE" resolve para "Joinville" sem erro; só grafia realmente desconhecida barra.
6. **`meta_cidades` `@@unique(metaMensalVendedorId, cidade)`**: fusão pode colidir — usar `regraMeta:'somar'`
   (já existe) e mostrar a colisão no dry-run da tela.
7. **Offline do vendedor**: `Rota/ClientePopup.jsx:657` tem caminho offline, mas não grava cidade; `ModalNovoLead`
   não tem fila offline (POST direto). Lista de cidades em cache de 5 min no `CampoCidade` — sem rede e sem cache,
   o campo mostra "tentar de novo"; o lead já não salvaria offline hoje, então não é regressão.
8. **Cache em memória com 2 réplicas**: TTL 60 s; cidade criada numa réplica aparece na outra em até 1 min (o
   `GET /` lê do banco, sem cache — só o `resolver` usa cache).
9. **Renomear cidade** reescreve texto em 6 tabelas: sempre com snapshot e dry-run; nunca em lote silencioso.
10. **Sentinela "Sem cidade"** (`CIDADES_CANONICAS`, `mensagemAgendadaService.js:75`): não vai para a tabela;
    `resolver('Sem cidade')` → `null` em modo tolerante e 400 em estrito (ninguém digita isso de propósito).
11. **Rota duplicada**: já existe `/api/cidades` só-leitura; substituir o arquivo, não criar um segundo router.

## 8. Critérios de aceite (QA clica; revisor confere)

Backend (curl / Prisma Studio):
- [ ] `prisma db push` cria `cidades` e `cidades_pendentes`; nenhuma coluna removida.
- [ ] Semente dry-run lista ~104 + dicionário; real cria; 2ª chamada não duplica; "Sem cidade" e "SC" não entram.
- [ ] `POST /clientes` com `End_Cidade:"Xyzabc"` → 400 `CIDADE_NAO_CADASTRADA` com `sugestoes`; com "JOINVILLE" →
      grava "Joinville"; com "Joinvile" (apelido) → "Joinville".
- [ ] `POST /cidades` "Itapoa" quando existe "Itapoá" → 409 `CIDADE_JA_EXISTE`; "Itapua" → 409 `CIDADE_PARECIDA`
      (sugere Itapoá); com `confirmarParecida:true` → 201.
- [ ] Sem `clientes.edit`/`rota.edit` → 403 no POST; sem `configuracoes` → 403 em PUT/fundir/pendentes.
- [ ] Fusão dry-run mostra linhas por tabela; real reescreve as 6 tabelas, cria snapshot em `../uploads/backfill-cidades`,
      origem fica `ativo=false, fundidaEmId`; reverter pelo arquivo restaura; meta colidida soma.
- [ ] `curl` em `/api/ia-consulta/v1/cliente/criar-lead` com cidade desconhecida → 200 igual ao de hoje + 1 linha em
      `cidades_pendentes`. Sync do CA (ou simulação) com cidade desconhecida → cliente gravado + pendência, sem erro no log.
- [ ] `GET /api/cidades` continua devolvendo `cidades[]` (string[]) — o front antigo não quebra.

Frontend (desktop e 375 px):
- [ ] Novo Cliente → Cidade: digitar "xyz" → NÃO aparece "Usar"; aparece "Cadastrar nova cidade…" → modal com UF,
      sugestão de parecida quando houver, cria e seleciona.
- [ ] CNPJ de cidade conhecida preenche direto; CNPJ de cidade desconhecida abre o modal da Receita com as 2 saídas;
      cancelar deixa o campo vazio e marcado; o resto do formulário ficou preenchido.
- [ ] Mesmo comportamento na ficha do cliente (botão CNPJ), novo lead (Rota), editar lead, fornecedor, bairro do
      Kit Festa e meta por cidade.
- [ ] Usuário sem permissão de criar vê o aviso e só escolhe.
- [ ] Configurações → Cidades: listar/buscar sem acento, editar UF, inativar cidade em uso é recusado, fundir com
      simulação e confirmação, aba Pendências resolve por "Cadastrar" e "Apontar".
- [ ] Mapa de Clientes mostra "Cidade · UF" na faceta.
- [ ] `npm run build` passa; novidade sem `og:image`, accordions abertos, com mockups; `novidades.json` atualizado.

Produção (gerente): publicar backend → `/ping` com o `deployMarker` novo → semente dry-run → real → publicar de novo →
`GET /backfill-cidades-snapshots` ainda lista (volume) → só então publicar o frontend.

## 9. O que NÃO fazer

- Não criar FK/coluna nova em `clientes` (teto de colunas) nem em nenhuma das 6 tabelas; não remover campo do schema.
- Não tornar estrito o sync do CA, o worker de fornecedores do CA nem a IA v1; não mudar nenhum campo de resposta da v1.
- Não gravar `chave` (sem acento) como nome em lugar nenhum; `nome` tem de ser `normalizarCidade(nome)`.
- Não chamar `resolver`/API dentro de `$transaction`; não deixar transação sem `timeout 20000 / maxWait 10000`.
- Não apagar `CIDADES_CANONICAS`: continua como apelidos (erros de digitação) atrás da tabela.
- Não deixar `permitirNovo` no `CampoCidade` (é a porta da bagunça); e não voltar a texto livre quando a lista falha.
- Não fundir/renomear sem dry-run + snapshot; não rodar a fusão em duas réplicas ao mesmo tempo (mutex de processo já existe).
- Não publicar o frontend antes de a semente rodar em produção.
