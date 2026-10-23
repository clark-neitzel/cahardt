# Uso da IA no Dashboard do Admin — plano (arquiteto, 23/10/2026)

Pedido do dono: no dashboard do ADMIN mostrar custo da IA por dia, QUEM usou, ONDE gastou, e se o gasto é
PONTUAL (uma vez) ou RECORRENTE (todo dia). Maquete aprovada: `docs/ia-custos/preview-uso-ia.html`.

## Achados
- `backend/services/aiProvider.js` é o ÚNICO ponto que chama IA (OpenAI/Gemini): `gerarTexto` (~231), `gerarTextoStream` (~256), `analisarImagem` (~177). Todos já têm `usage` na mão e nada é gravado.
- Já existe histórico em: `ia_analise_logs` (IaAnaliseLog, schema ~2967), `como_fazer_ia_usos` (ComoFazerIaUso, ~4822), `checklist_veiculo_fotos` (`ia_modelo`, `ia_tokens` só total, ~1710). Sem histórico: Clippy e cupom de despesa.
- Preço/cotação JÁ existem: AppConfig `ia_precos` = `{ "<modelo>": {entradaUsdPorM, saidaUsdPorM}, cotacaoBrl }`, funções `lerPrecos()`/`custoUsd()` em `comoFazerIaService.js` (~60, ~152), editadas em Configurações → IA. NÃO criar outra tabela de preço; extrair para `backend/services/iaCustoService.js` e o comoFazer importa de lá SEM mudar comportamento.
- Provável vilão recorrente: orientação de IA por cliente — `workers/scheduler.js:187-235` (23:30 diário) e `atendimentoService.js:195-212` (após cada atendimento).

## Chamadores (7 chamadas, 5 arquivos — nenhuma fora do aiProvider)
| Origem | Onde | Quem |
|---|---|---|
| CLIPPY | `copilotoService.js:326`, rota `routes/copiloto.js` POST /chat | `req.user.id` (hoje NÃO é passado a `responderAjuda`) |
| ORIENTACAO_CLIENTE | `orientacaoService.js:287` em `gerarOrientacaoIA`; gatilhos ATENDIMENTO (atendimentoService:201), NOTURNO (scheduler:225), MANUAL_UI (`controllers/clienteInsightController.js:95`), MANUAL (`routes/adminExec.js:4014`) | `disparadoPor` + `usuarioId` já existem |
| COMO_FAZER_MONTAR | `comoFazerIaService.js:444` (stream) | `cf.vendedorId` |
| COMO_FAZER_REPARO | `comoFazerIaService.js:470` | idem |
| COMO_FAZER_AJUSTE | `comoFazerIaService.js:542` | idem |
| COMO_FAZER_SUGESTAO | `comoFazerIaService.js:596` | idem |
| CHECKLIST_FOTO | `checklistVeiculoIaService.js:309` ← `checklistVeiculoService.js:446` (1 por foto, inclusive refeitas) | motorista (passar usuário até `analisarFoto`) |
| CUPOM_DESPESA | `cupomDespesaService.js:187` (`lerComIa`) ← `analisarArquivo` :316 / `analisarRascunho` :344 (já tem `vendedorId`) | motorista/escritório |

## Tabela nova `IaUsoLog` (`@@map("ia_uso_logs")`) — SÓ ADICIONA, não remove nada
`id` uuid, `criadoEm`, `origem` (chaves acima + `OUTRO`), `gatilho?` (AUTOMATICO_NOTURNO | AUTOMATICO_ATENDIMENTO | MANUAL), `automatico` Boolean, `provedor`, `modelo`, `tokensPrompt?`, `tokensResposta?`, `tokensRaciocinio?` (informativo — JÁ está dentro de completion_tokens, NÃO somar), `tokensTotal?`, `custoUsd` Decimal(10,6)? , `custoBrl` Decimal(10,4)?, `usuarioId?`, `usuarioNome?` (snapshot, SEM FK), `referencia?`, `retroativo` Boolean default false, `refRetro` String? @unique (idempotência do backfill, ex. `ia_analise_logs:123`), `ok` Boolean, `erroCodigo?`, `duracaoMs?`.
Índices NO SCHEMA: `[criadoEm]`, `[origem, criadoEm]`, `[usuarioId, criadoEm]`. NÃO gravar prompt/resposta.

## Gravação (único ponto: aiProvider.js)
- `registrarUso()` chamado ao fim de `gerarTexto`, `gerarTextoStream`, `analisarImagem`.
- Fire-and-forget (`.catch(console.error)`, log `[IaUso]`), NUNCA await no caminho da IA, NUNCA lançar, NUNCA dentro de `$transaction`. Tabela indisponível ⇒ IA segue igual.
- Parâmetro OPCIONAL novo `uso: { origem, gatilho?, usuarioId?, usuarioNome?, referencia? }`. Retorno NÃO muda. Sem `uso` ⇒ origem `OUTRO` ("Sem identificação" — alarme de chamada esquecida).
- Registrar também erro que gastou token (`e.usage` já existe em gerarTextoOpenAI ~91 e stream ~298); em `analisarImagem` (~206) acrescentar `e.usage` ao erro (só adiciona propriedade). Falha de rede/abort: `ok=false`, tokens null.
- Reasoning: `resp.usage.completion_tokens_details.reasoning_tokens`.
- Custo: `prompt*entradaUsdPorM + resposta*saidaUsdPorM` /1e6. Congelar `custoUsd` na gravação. Sem preço ⇒ null (NUNCA mostrar 0 como grátis); na leitura, linhas null recalculadas com preço atual e marcadas "estimado".
- Gatilho automático ⇒ `automatico=true` mesmo com `usuarioId` (ATENDIMENTO usa quem registrou o atendimento). `automatico && sem usuário` ⇒ "Sistema (automático)".
- Como Fazer continua escrevendo `como_fazer_ia_usos` como hoje (tela Config → IA depende) — log novo é paralelo; o painel lê SÓ `ia_uso_logs` (não duplicar).

## API (só admin)
`backend/routes/iaUso.js` montado em `backend/index.js` (perto de `/api/ia-logs`, ~242) + `backend/services/iaUsoService.js` (agregação em SQL `$queryRaw`, Decimal→Number).
Permissão: `req.user.permissoes.admin === true` → senão 403 (modelo `routes/iaLogs.js:7-12`, SEM o `|| Pode_Ver_Analise_IA`). `Pode_Ver_Dashboard_Admin`/`gestor` NÃO libera.
`GET /api/ia-uso/resumo?dias=30` (default 30, máx 90; `de`/`ate` opcionais) devolve:
- `kpis`: custo hoje/7d/30d (USD e BRL), chamadas, % falhas, tokens, `semPreco` (qtd), `desde`, `retroativoAte`.
- `porDia`: `[{dia, custoUsd, custoBrl, chamadas, automatico, manual}]` — dia em America/Sao_Paulo: `date_trunc('day', ("criado_em" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')`.
- `porOrigem`: `[{origem, rotulo, custoUsd, chamadas, diasAtivos, ultimoUso, classe}]`.
- `porUsuario`: `[{usuarioId, nome, custoUsd, chamadas, origemPrincipal}]` + "Sistema (automático)".
- `classificacao`: itens de porOrigem (e origem+gatilho para ORIENTACAO_CLIENTE) com `diasAtivos`, `classe`, custo, e totais por grupo.
Classificação (constantes no topo do service): janela 30 dias; `diasAtivos` = dias distintos (SP) com ≥1 chamada. RECORRENTE ≥5 dias; PONTUAL 1–2; OCASIONAL 3–4. Poucos dados (logo após deploy) ⇒ "poucos dados" em vez de classificar errado.
Rótulos em português num mapa único no backend.

## Backfill (idempotente, `retroativo=true`, `refRetro` único)
Script/rota admin-exec `ia-uso-backfill` (header x-admin-secret): importa de `ia_analise_logs` (exato; NÃO selecionar `prompt_enviado`/JSONs grandes), `como_fazer_ia_usos` (exato), `checklist_veiculo_fotos` (só total; custo estimado ~85% entrada/15% saída, marcado "estimado"). Nunca importar linha do período em que o log novo já existe. Rodar primeiro SÓ NO LOCAL. Em produção SÓ com autorização do dono.

## Tela
Nova aba "IA" em `frontend/src/pages/Dashboard/DashboardGeral.jsx` (array `ABAS` ~22), só se `!!user?.permissoes?.admin`. Componente novo `AbaUsoIA.jsx` com seu próprio fetch (NÃO usar `buscarAba` ~71; esconder seletor mês/categoria quando aba==='ia'). Período: `FiltroPeriodo` + `usePeriodoSalvo('dashboard-ia')` (padrão 30 dias); demais filtros `useFiltrosSalvos`; dropdown = `SelectBusca`. Componentes de `dashUi.jsx` (Card, Kpi, LinhaBarra, BarrasVerticais...). Ordem: aviso âmbar (sem preço / histórico parcial) → KPIs `grid-cols-2 md:grid-cols-4` → quadro "TODO DIA × UMA VEZ" (destaque) → custo por dia (automático × manual) → ranking por serviço → ranking por usuário → tabela/cartões das últimas chamadas é opcional (não exigida). Mobile 375px sem scroll horizontal, toque ≥44px, EstadoVazio, erro com tentar de novo. Texto sem jargão ("tokens" só em tooltip). Linha: "mostra só o que o CA-Hardt chamou; não é a fatura da OpenAI". Maquete: `docs/ia-custos/preview-uso-ia.html`.

## Ordem
1 schema+iaCustoService → 2 registrarUso/aiProvider → 3 propagar `uso` nos 5 arquivos → 4 iaUsoService+rota+backfill (local) → 5 frontend → 6 manuais/Clippy → 7 QA + revisor → gerente-entrega.

## Manual/Clippy/novidade
`backend/manuais/abas/dashboard.md` (aba IA, "visível só para administrador", regra recorrente×pontual), `backend/manuais/abas/config-ia.md` (preço alimenta o painel). Sem rota nova no front ⇒ tabela ABAS do copilotoService não muda. Página de novidade: sugerido NÃO anunciar no grupo (aba só do admin) — decisão do dono.

## NÃO fazer
Não colocar registro em `$transaction` nem com await; não renomear/remover `como_fazer_ia_usos`/`ia_analise_logs` nem campo algum; não gravar prompt/resposta; não criar 2ª tabela de preço; não somar reasoning; não duplicar Como Fazer; aba/rota não podem ser liberadas por `gestor`; não tocar `/api/ia-consulta/v1`, WhatsApp, fiscal; não afirmar que bate com a fatura; não rodar backfill em produção nem fazer deploy sem gerente-entrega + ok do dono; não commitar (dev não commita).

## Critérios de aceite
1 cada origem gera 1 linha em `ia_uso_logs` (origem, usuário, tokens, custo se houver preço); 2 IA responde igual com a tabela de log indisponível e sem aumento de tempo; 3 `/resumo` admin=200, vendedor comum e só-`Pode_Ver_Dashboard_Admin`=403; 4 aba só para admin, sem scroll horizontal a 375px, estados vazio/erro/sem-preço; 5 totais batem com `SUM(custo_usd)` e 23:30 SP cai no dia certo; 6 classificação testada (1 dia = PONTUAL, 8 dias = RECORRENTE); 7 backfill 2× sem duplicar; 8 `npm run build` passa, `node --check`, campos Prisma conferidos contra o schema; 9 manuais atualizados; 10 testar com perfil admin e perfil "Producao".
