# Padronização de cidades — andamento

| Fase | O quê | Estado | Commit |
|---|---|---|---|
| 0 | `GET /api/admin-exec/diag-cidades` — diagnóstico (só leitura), helpers `utils/cidade.js` + `utils/cidadeNomeFinal.js` | no ar | 87fe99a3 |
| 1 | Toda entrada de cidade grava o nome oficial (`normalizarCidade`), dicionário `CIDADES_CANONICAS` aprovado pelo dono | no ar | 6d34938f |
| 2 | Backfill dos dados antigos com snapshot de reversão (`services/backfillCidadesService.js`) | no ar desde 27/08 (fbab2258); **contrato estendido em 13/09/2026, sem commit ainda** | — |
| 3 | Rodar o backfill em produção (dry-run → aprovação do dono → real) | pendente — depende do dono | — |
| 4 | Espelho `frontend/src/utils/cidade.js` + dropdowns de cidade | não iniciada | — |

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

## Pendências / riscos
- Só provado em produção depois de: publicar → rodar dry-run → aplicar → **publicar de novo** → `GET /backfill-cidades-snapshots` ainda listar o arquivo.
- `aprovado` NÃO restringe o dicionário (o dicionário já é a aprovação do dono); é aditivo.
- Mutex de processo (uma instância). Não protege duas réplicas do backend.
