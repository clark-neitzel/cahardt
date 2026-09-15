# Padronização de cidades — andamento

| Fase | O quê | Estado | Commit |
|---|---|---|---|
| 0 | `GET /api/admin-exec/diag-cidades` — diagnóstico (só leitura), helpers `utils/cidade.js` + `utils/cidadeNomeFinal.js` | no ar | 87fe99a3 |
| 1 | Toda entrada de cidade grava o nome oficial (`normalizarCidade`), dicionário `CIDADES_CANONICAS` aprovado pelo dono | no ar | 6d34938f |
| 2 | Backfill dos dados antigos com snapshot de reversão (`services/backfillCidadesService.js`) | no ar desde 27/08 (fbab2258); **contrato estendido em 13/09/2026, sem commit ainda** | — |
| 3 | Rodar o backfill em produção (dry-run → aprovação do dono → real) | pendente — depende do dono | — |
| 4 | Espelho `frontend/src/utils/cidade.js` + dropdowns de cidade (`CampoCidade` com "Usar …") | no ar 13/09 | — |
| 5 | **Cadastro oficial** (`docs/cidades/PLANO-CADASTRO.md`) — backend (tabela `cidades`, rotas §4, blindagem, semente) | em desenvolvimento (dev-backend, 14/09) | — |
| 5 | **Cadastro oficial — pacote FRONTEND** (§5 itens 9–17) | **pronto, sem commit (14/09)** — build OK; QA/revisor pendentes; depende do backend §4 no ar + semente | — |

## Fase 2 — rotas (header `x-admin-secret`)

`POST /api/admin-exec/backfill-cidades`
```json
{ "dryRun": true, "aprovado": [ { "chave": "garuva", "nomeFinal": "Garuva" } ],
  "apelidos": { "joinvile": "joinville" }, "regraMeta": "somar" }
```
- `dryRun` (padrão `true`): devolve por tabela (Cliente.End_Cidade, Lead.cidade, Fornecedor.cidade + uf,
  KitFestaBairro.cidade, CatalogoPersonalizado.clienteCidade "Cidade · UF", MetaCidade.cidade) o que vira o quê,
  contagens e ids. Nada é gravado. (`confirmar: true` da rota antiga continua valendo como `dryRun: false`.)
- Aprovado por padrão: chave no dicionário `CIDADES_CANONICAS` (a lista que o dono já aprovou) e "só espaço sobrando".
- `aprovado`: libera grupo fora do dicionário. O `nomeFinal` tem de ser o que `normalizarCidade` produz —
  se divergir, não aplica e sai em `aprovadoDivergente` (gravar outro nome faria a Fase 1 re-sujar o dado).
- `apelidos`: erro de digitação → chave certa (resolvido pelo dicionário, com acento). Só vale na chamada.
- `regraMeta: "somar"`: colisão em `meta_cidades` (mesma meta, mesmo nome final) = soma dos valores + união dos
  `diasSemana` numa linha, a outra apagada (guardada no snapshot). **Sem** `regraMeta` a colisão não é tocada e
  sai em `metaCidades.pendentes`.
- Snapshot em `backend/uploads/backfill-cidades/backfill-cidades-<timestamp>.json` gravado ANTES de escrever
  (seções estruturadas para a reversão + lista plana `registros[] {id, tabela, campo, valorAntes, valorDepois}`).
- Escrita: uma `$transaction` (callback, `timeout 20000 / maxWait 10000`) por tabela; `updateMany` por
  `id IN (...) AND campo = valorAntigo`; fusão de meta em transação própria por meta.
- Idempotente: 2ª chamada devolve `aplicado: false, motivo: "nada a fazer"`.

`POST /api/admin-exec/backfill-cidades/reverter` `{ "arquivo": "backfill-cidades-....json" }` — restaura
`valorAntes` de cada registro (linha alterada depois do backfill é pulada e listada); meta apagada é recriada
com o mesmo id. Snapshot já revertido é recusado. (`/backfill-cidades-reverter` com `confirmar` continua existindo.)

`GET /api/admin-exec/backfill-cidades-snapshots` — lista os snapshots do volume (sonda de deploy).
`deployMarker` do `/ping`: `backfill-cidades-2026-09-13`.

## Teste local (13/09/2026, banco hardt_local)
Sujados 3 clientes ("JOINVILLE", "joinville ", "Joinvile"), 2 leads ("ITAPOA", "GARUVA") e 1 meta extra
("JOINVILLE" 100 SEG colidindo com "Joinville" 2452,08 N/D).
- dry-run sem opções: 29 linhas; GARUVA em `mudancasSemAprovacao`; colisão de meta em `pendentes` (proposta 2552,08 / SEG,N/D).
- dry-run com `aprovado` divergente (`Garúva`): não aplica, sai em `aprovadoDivergente`.
- real com `regraMeta:somar` + apelido + aprovado: 32 linhas, `previsto == efeitos`, `conferenciaDepois.idempotente: true`.
- 2ª real: `aplicado: false` ("nada a fazer").
- reverter pelo arquivo: tudo de volta (3+24+2+1 uf, 1 fusão desfeita, 1 meta recriada), `pulados: []`; 2ª reversão recusada.
- O que foi sujado foi limpo à mão depois; snapshot de teste apagado.

## Cadastro de cidades (tabela `cidades`) — pacote BACKEND implementado em 14/09/2026 (sem commit)

Plano: `PLANO-CADASTRO.md`. Estado: **código pronto e testado localmente (banco hardt_local); não commitado; não publicado.**

| Item do plano | Arquivo | Estado |
|---|---|---|
| 1. Schema `Cidade` + `CidadePendente` (nada removido) | `backend/prisma/schema.prisma` (fim do arquivo) | `prisma db push` OK no hardt_local: tabelas `cidades` e `cidades_pendentes` criadas |
| 2. UF embutida | `backend/utils/ufPorCidade.js` (novo) — 295 municípios de SC + PR/SP/RJ/MG/RS/BA já vistos; `ufDe`, `ehAmbiguo`, `UFS` | pronto |
| 3. Service | `backend/services/cidadeService.js` (novo) — `resolver` (estrito/tolerante + pendência), `sugerir` (Levenshtein ≤ 2 + prefixo/contém), CRUD, `fundir`, `pendentes`, `resolverPendente`, cache 60 s | pronto |
| 4. Rotas §4 | `backend/routes/cidades.js` (reescrito; `GET /` mantém `{ok,total,cidades[],detalhe[{cidade,registros}]}` e acrescenta `detalhe[].id/uf/ativo/uso`, `foraDoCadastro`, `permissoes{criar,gerir}`) | pronto |
| 5. 11 pontos de escrita | estrito: `clienteController` (criar + PATCH só quando `End_Cidade` veio), `leadService`/`leadController`, `routes/fornecedores.js`, `kitFestaService` (+ `kitFestaController.erro` repassa `codigo/sugestoes`), `metaService`/`metaController` (resolve ANTES de gravar). Tolerante + pendência: `contaAzulService` (3 pontos, `CA_SYNC`), `contasPagarCaSyncService` (`CA_FORNECEDOR`), `iaClienteService` → `leadService.criar(dados,{modo:'tolerante',origem:'IA_LEAD'})`. `catalogoPersonalizadoService` usa `cidades.uf` quando `End_Estado` está vazio. `mapaClientesService` faceta `cidades[]` ganha `uf` | pronto |
| 6. Motor de fusão | `backfillCidadesService.js`: `nomeFinalDe` consulta a tabela (apelidos da chamada → tabela → dicionário → Title Case; `viaCadastro` conta como aprovado), opção `somenteChaves` (meta inclui a chave destino para enxergar a colisão), `fundirCidade({deNome,paraNome,dryRun,usuarioId,tipo})`, snapshot com `tipo`+`fusao{de,para,usuarioId}` | pronto |
| 7. Semente | `POST /api/admin-exec/cidades-semente {dryRun}` (idempotente; exclui "Sem cidade" e só-UF; `semUf[]` = ambíguas/fora da lista). `deployMarker` do `/ping` → `cidades-cadastro-2026-09-14` | pronto |
| 8. Clippy | `manuais/abas/config-cidades.md` (novo), `README.md`, `ABAS` em `copilotoService.js` (`/config/cidades`, perm `configuracoes`); `clientes.md`, `leads.md`, `rota.md`, `config-metas.md`, `mapa-clientes.md` atualizados; `docs/ia-consulta-api.md` nota aditiva (v1 intacta) | pronto |

### Permissões implementadas (o frontend espelha)
- criar cidade (`POST /api/cidades`): `admin || clientes.edit || rota.edit`
- gerir (PUT, inativar, reativar, fundir, pendentes): `admin || configuracoes === true || configuracoes.edit === true`
  (`configuracoes` é objeto — só `.view` NÃO libera). `GET /api/cidades` devolve `permissoes: { criar, gerir }`.

### Teste local (14/09/2026, hardt_local, instância própria na porta 3077)
- Semente dry-run: 58 candidatas (58 grafias → 58 chaves; 3 sem UF: Cafelândia, Campo Alegre, Lajeado); real: 58 criadas; 2ª vez: 0 criadas, 58 `jaExistiam`.
- `GET /api/cidades`: `cidades[]` string[] + `detalhe` com id/uf/uso; `foraDoCadastro: []`.
- `/resolver`: `ITAPOA` → Itapoá; `Joinvile` (apelido) → Joinville; `Itapua` → `existe:false` + sugestões [Itapoá, Itapema], `ufSugerida: SC`.
- `POST /api/cidades`: "Itapoa" → 409 `CIDADE_JA_EXISTE`; "Itapua" → 409 `CIDADE_PARECIDA`; com `confirmarParecida` → 201; UF "XX" → 400 `UF_INVALIDA`; usuário sem permissão → 403 no POST, PUT e `/pendentes`.
- `POST /clientes` com "Xyzabc" → 400 `CIDADE_NAO_CADASTRADA` (sugestões []); "Itapoaa" → 400 com sugestão Itapoá; "JOINVILLE" → grava Joinville; PATCH "Joinvile" → Joinville; PATCH sem `End_Cidade` não valida.
- `POST /leads` "Garuvaa" → 400 com sugestão Garuva; "GARUVA" → Garuva. Fornecedor "Curitibaa", bairro Kit Festa "Joinvillex", meta "Garuvaa" → 400 com sugestões.
- IA `POST /ia-consulta/v1/cliente/criar-lead` cidade "  CIDADE DA ANA  " → 200 `{id,numero,etapa}` (igual), lead gravado "Cidade da Ana", 1 linha em `cidades_pendentes` (`IA_LEAD`, `nomeBruto` cru, `exemplo: leads:<id>`).
- `resolver` tolerante `CA_SYNC` direto no service: grava normalizado, pendência com `ocorrencias` 2 na 2ª chamada; "Sem cidade" → null (tolerante) / 400 (estrito).
- Fusão Itapua → Itapoá (1 cliente, 1 lead, meta Itapua 10 SEG + Itapoá 5 QUI na mesma meta): dry-run lista as linhas e a fusão de meta; real: `previsto == efeitos`, meta vira Itapoá 15 SEG,QUI, origem `ativo=false, fundidaEmId`; `resolver('Itapua')` → Itapoá. Snapshot `tipo: fusao` com `{de, para, usuarioId}` em `uploads/backfill-cidades/`. Reversão pelo arquivo: tudo de volta (meta recriada), 2ª reversão recusada.
- PUT renomear Itapua → Itapuã: linha renomeada + 3 registros reescritos com snapshot; renomear para nome existente → 409; só UF não reescreve. Inativar cidade em uso → 400 `CIDADE_EM_USO` com uso por tabela.
- Resolver pendência apontando para Garuva: lead reescrito, pendência `resolvidoEm`.
- Dados de teste e snapshots de teste apagados; as 58 cidades da semente ficaram no hardt_local (servem ao frontend).

### Pendências / o que só se prova em produção
- **Só provado em produção depois de**: publicar backend → `/ping` com `cidades-cadastro-2026-09-14` → `cidades-semente` dry-run → real → dono completa `semUf` → **publicar de novo** e `GET /backfill-cidades-snapshots` ainda listar (volume) → só então publicar o frontend.
- Sync do Conta Azul e worker de fornecedores só foram exercitados pelo `resolver` tolerante (sem token do CA local).
- Frontend (itens 9–17 do plano) é pacote paralelo.

## Pendências / riscos
- Só provado em produção depois de: publicar → rodar dry-run → aplicar → **publicar de novo** → `GET /backfill-cidades-snapshots` ainda listar o arquivo.
- `aprovado` NÃO restringe o dicionário (o dicionário já é a aprovação do dono); é aditivo.
- Mutex de processo (uma instância). Não protege duas réplicas do backend.

## Fase 5 — pacote frontend (14/09/2026, dev-frontend)

Implementado contra o contrato do §4 do plano (backend em paralelo — na hora do build as rotas novas ainda
não existiam; `GET /cidades` antigo continua funcionando porque o front cai em `cidades[]` quando `detalhe[]`
não traz `id`/`uf`).

- `frontend/src/services/cidadeService.js` (novo): `listar/resolver/sugestoes/criar/editar/inativar/reativar/fundir/pendentes/resolverPendente`,
  cache da lista (5 min, `invalidarCacheCidades`), `resolverCidadeDaReceita`, `erroCidadeNaoCadastrada`,
  `podeCriarCidade` (= `admin || clientes.edit || rota.edit`), `podeGerirCidades` (= `admin || configuracoes`), `UFS`.
- `components/ModalNovaCidade.jsx` (novo): nome + UF (`SelectBusca`), "Você quis dizer…?" (GET `/cidades/sugestoes`,
  "Usar esta" não cria), 409 `CIDADE_JA_EXISTE` → usa a existente (inativa → oferece reativar), 409 `CIDADE_PARECIDA`
  → "Cadastrar mesmo assim" (`confirmarParecida:true`); sem permissão → aviso "peça ao escritório", só escolhe.
- `components/CampoCidade.jsx`: **sem `permitirNovo`**; lista da tabela com UF como subtítulo; rodapé
  "Cadastrar nova cidade…" (leva o texto digitado); lista falhou → aviso + tentar de novo (nunca texto livre);
  `value` fora do cadastro → borda âmbar + dica; props novas `ufSugerida`, `abrirCadastroCom` ({nome,n}), `onCidadeCriada`.
- `components/ComboBusca.jsx`: `extraAction.onClick(queryDigitada)` (aditivo) e Enter sem match dispara o extraAction.
- `components/ModalCidadeReceita.jsx` (novo): "A Receita informou X / UF. Cadastrar ou escolher outra?" com sugestões,
  "Cadastrar" (ModalNovaCidade), "Escolher outra" (CampoCidade inline), "Deixar em branco".
- `NovoCliente.jsx` / `DetalheCliente.jsx`: consulta de CNPJ passa por `resolverCidadeDaReceita` (cidade nunca entra
  fora da lista; resto do form entra normal; campo marcado enquanto não resolve); 400 `CIDADE_NAO_CADASTRADA` ao salvar
  → alerta + abre o cadastro com o nome.
- Inputs livres migrados para `CampoCidade`: `Financeiro/FornecedoresPage.jsx`, `KitFesta/AbaBairros.jsx`,
  `Configuracoes/Metas/MetaFormModal.jsx` (duplicidade local por `chaveBusca`).
- 400 `CIDADE_NAO_CADASTRADA` tratado nas 7 telas (cliente novo/ficha, lead novo/editar, fornecedor, bairro, meta).
- `pages/Configuracoes/Cidades.jsx` (novo) em `/config/cidades` (`PrivateRoute tab="configuracoes"`, `lazyComRetry`,
  item "Cidades" no menu Configurações): lista com busca sem acento, filtro "mostrar inativas" e aba salvos por
  `useFiltroSalvo`, editar nome/UF (aviso de N registros), inativar/reativar, fundir A→B com Simular (dry-run,
  renderização tolerante do plano + colisões de meta) e confirmação, aba Pendências (Cadastrar / Apontar para…).
  Mobile: cards.
- `mapaClientes/FiltrosMapa.jsx`: faceta de cidade mostra "Cidade · UF" quando o backend devolver `uf`.
- `public/novidade-cidades.html` reescrita (5 telas com pins) + `novidades.json` (entrada `cidades` atualizada).

Pendências do pacote frontend:
- Backend §4 no ar + semente em produção ANTES de publicar este front (sem semente o campo fica sem opções).
- RESOLVIDO (14/09): "Mostrar inativas" já funciona — `GET /api/cidades?todas=1` inclui `ativo=false` desde
  o `router.get('/')` atual; o front (`cidadeService.js`) chamava com `?incluirInativas=1`, um nome diferente
  do que o backend aceitava, então o filtro não mostrava nada a mais. Backend passou a aceitar os dois nomes
  (`todas` OU `incluirInativas`) sem mexer no front. Confirmado batendo em `GET /api/cidades?incluirInativas=1`
  (servidor local, cidade de teste inativa temporária): sem o parâmetro ela não aparece, com ele aparece.
- Formato exato do plano de fusão (dry-run) não estava fechado: `PlanoFusao` renderiza de forma tolerante
  (números por tabela, chaves com "colis/pendent" em âmbar); ajustar quando o backend definir.
- Manual `backend/manuais/abas/config-cidades.md` + `ABAS` do Clippy: item 8 do plano, pacote backend.
