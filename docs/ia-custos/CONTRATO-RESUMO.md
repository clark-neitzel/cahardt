# Contrato: GET /api/ia-uso/resumo (feito pelo dev-backend, local)

Query: `?dias=30` (máx 90) ou `?de=YYYY-MM-DD&ate=YYYY-MM-DD`. Só admin (`permissoes.admin === true`), senão 403 `{error}`.

```json
{
 "periodo": {"de":"2026-09-24","ate":"2026-10-23","hoje":"2026-10-23","fuso":"America/Sao_Paulo"},
 "kpis": {
  "hoje": {"custoUsd":0,"custoBrl":0,"chamadas":0},
  "ultimos7dias": {"custoUsd":3.0864,"custoBrl":16.9752,"chamadas":17},
  "ultimos30dias": {"custoUsd":3.1064,"custoBrl":17.0852,"chamadas":19},
  "periodo": {"custoUsd":3.1064,"custoBrl":17.0852,"chamadas":19,"tokens":20100,"falhas":0,"percentualFalhas":0,"custoEstimadoUsd":0.0144},
  "semPreco": 0,
  "cotacaoBrl": 5.5,
  "desde": "2026-05-13",
  "retroativoAte": "2026-10-14"
 },
 "porDia": [
  {"dia":"2026-10-20","custoUsd":2.0264,"custoBrl":11.1452,"chamadas":6,"automatico":1,"manual":5,"automaticoCustoUsd":0.002,"manualCustoUsd":2.0244}
 ],
 "porOrigem": [
  {"origem":"CLIPPY","rotulo":"Clippy (assistente de ajuda)","custoUsd":0.08,"custoBrl":0.44,"chamadas":8,"diasAtivos":8,"ultimoUso":"2026-10-22T08:35:15.115Z","classe":"RECORRENTE","estimado":false}
 ],
 "porUsuario": [
  {"usuarioId":"teste-ia-comum","nome":"teste-ia-comum","custoUsd":0.08,"custoBrl":0.44,"chamadas":8,"origemPrincipal":"CLIPPY","origemPrincipalRotulo":"Clippy (assistente de ajuda)"},
  {"usuarioId":null,"nome":"Sistema (automático)","custoUsd":0.012,"custoBrl":0.066,"chamadas":6,"origemPrincipal":"ORIENTACAO_CLIENTE","origemPrincipalRotulo":"Orientação de atendimento por cliente"}
 ],
 "classificacao": {
  "janelaDias": 30,
  "regra": {"recorrenteDiasMin":5,"ocasionalDiasMin":3,"pontualDiasMax":2},
  "coberturaDias": 9,
  "poucosDados": false,
  "itens": [
   {"origem":"ORIENTACAO_CLIENTE","gatilho":"AUTOMATICO_NOTURNO","rotulo":"Orientação de atendimento por cliente (automático da noite)","diasAtivos":6,"classe":"RECORRENTE","chamadas":6,"custoUsd":0.012,"custoBrl":0.066}
  ],
  "totais": {
   "RECORRENTE": {"itens":2,"chamadas":14,"custoUsd":0.092,"custoBrl":0.506},
   "OCASIONAL": {"itens":0,"chamadas":0,"custoUsd":0,"custoBrl":0},
   "PONTUAL": {"itens":3,"chamadas":5,"custoUsd":3.0144,"custoBrl":16.5792},
   "POUCOS_DADOS": {"itens":0,"chamadas":0,"custoUsd":0,"custoBrl":0}
  }
 },
 "rotulos": {"CLIPPY":"Clippy (assistente de ajuda)","OUTRO":"Sem identificação"}
}
```

## Regras para o front
- `porDia` traz TODOS os dias do período (zeros nos dias sem uso), `dia` = YYYY-MM-DD em horário de São Paulo.
- `custoBrl` e `kpis.cotacaoBrl` são `null` sem cotação cadastrada → mostrar só USD. NUNCA mostrar 0 como grátis; sem preço → "—"/aviso.
- `kpis.hoje/ultimos7dias/ultimos30dias` são janelas FIXAS (ignoram o período escolhido). `kpis.periodo`, `porDia`, `porOrigem`, `porUsuario` seguem o período. `classificacao` usa SEMPRE os últimos 30 dias.
- `classe`: `RECORRENTE` | `OCASIONAL` | `PONTUAL` | `POUCOS_DADOS` (cobertura < 5 dias) | `SEM_USO` (sem uso nos últimos 30 dias, mas com uso no período).
- `classificacao.itens`: ORIENTACAO_CLIENTE vem separada por `gatilho` (AUTOMATICO_NOTURNO / AUTOMATICO_ATENDIMENTO / MANUAL); nas demais origens `gatilho` é null.
- `estimado:true` = parte do custo recalculada com o preço atual (linha sem custo gravado).
- **Sem preço (campo `semPreco`)**: `kpis.hoje/ultimos7dias/ultimos30dias/periodo`, `porDia[]`, `porOrigem[]`, `porUsuario[]`, `classificacao.itens[]` e `classificacao.totais.*` trazem `semPreco` = nº de chamadas sem custo calculável. Se há `semPreco` > 0 e NENHUMA chamada do item com custo, `custoUsd`/`custoBrl` vêm `null` (mostrar "—", nunca 0); se parcial, o valor soma só as precificadas e `semPreco` > 0 sinaliza (`classificacao.totais.*` fica sempre numérico). Falha (`ok=false`) sem tokens é custo real zero e NÃO conta como sem preço.
- `porUsuario`: todos os usuários apagados (id sem nome) viram UMA linha `{"usuarioId":null,"nome":"Usuário removido"}` somada.
- `kpis.semPreco` > 0 → faixa âmbar "N chamadas sem preço — cadastre em Configurações → IA".
- `kpis.desde`/`retroativoAte` → faixa "histórico parcial: dados até DD/MM reconstruídos de registros antigos; Clippy e cupom de despesa contam só do dia da publicação".
- `porUsuario.usuarioId == null` = "Sistema (automático)" ou "Sem identificação".
- Erros: 403 `{error}` (não admin), 500 `{error}`.

## Dados de teste no banco local (hardt_local)
- Usuários `teste-ia-admin` (admin), `teste-ia-comum`, `teste-ia-dashadmin` (só Pode_Ver_Dashboard_Admin).
- Tokens JWT (2h) em `/tmp/claude-501/iat/tokens.json`; para gerar de novo: `node /tmp/claude-501/iat/setup.js`.
- Linhas de teste em `ia_uso_logs` (`referencia` começando por `TESTE-IAUSO`) + 30 retroativas. Preço em `app_configs` key `ia_precos`.
- Limpeza ao final: `delete from ia_uso_logs; delete from app_configs where key='ia_precos'; delete from vendedores where id like 'teste-ia-%';`

## Atualização: preço e cotação AUTOMÁTICOS (23/10)
- **Preço**: override do admin (`ia_precos`) > tabela padrão embutida (`backend/services/iaPrecosPadrao.js`: gpt-6-luna 0.10/0.50, gpt-6-sol 2/10, gpt-6-astra 10/50, gpt-5.6-luna 0.20/1.20; gpt-4o-mini/4o/4.1/4.1-mini só p/ histórico) > null ("sem preço"). Nome do modelo casa com sufixo de data/versão (`gpt-6-luna-2026-10-01` -> `gpt-6-luna`), nunca entre luna/sol/astra. Fonte dos preços novos: sites comparadores (eesel.ai, anotherwrapper.com) em out/2026, não a página oficial.
- **Cotação**: manual (`cotacaoBrl` em ia_precos) > automática (AwesomeAPI USDBRL.bid, timeout 4s, cache 6h em memória + AppConfig `ia_cotacao_auto`) > 5.0 com `kpis.cotacaoEstimada:true`. `kpis.cotacaoBrl` agora quase nunca é null.
- Campos NOVOS (aditivos): `kpis.cotacaoFonte` (manual|automatica|estimada), `kpis.cotacaoEstimada`, `kpis.cotacaoAtualizadaEm`; `periodo.encurtado`, `periodo.deOriginal`, `periodo.ateOriginal` (quando o servidor reduz o período a 90 dias, ancorado em `ate` limitado a hoje).
- `kpis.semPreco` > 0 só para modelo realmente desconhecido. Faixa "sem cotação cadastrada" não se aplica mais (a menos que `cotacaoEstimada`).
- `classificacao.poucosDados` = há chamadas no período E algum item POUCOS_DADOS; a cobertura de cada item é POR ORIGEM (primeiro dia de uso da origem). `coberturaDias` segue global (informativo).
- Datas inexistentes (`de=2026-02-31`) caem no padrão de 30 dias (sem 500). Nomes de usuário vêm do cadastro (`vendedores`) na leitura; "Usuário removido" só para id inexistente.
- `GET /api/config/ia` (configGet): novos `precosPadrao` e `cotacaoAutomatica`; `precos` continua só com o cadastrado.
- Rota admin-exec `POST /ia-uso-recalcular-custos`: preenche custo nulo com o preço resolvido (idempotente).

## Atualização rodada 3 (23/10)
- `periodo`: primeiro `ate` é limitado a HOJE; só depois, se o intervalo passar de 90 dias, corta a 90 (ancorado em hoje) e devolve `encurtado:true` + `deOriginal`/`ateOriginal`. `de=2026-10-01&ate=2027-12-01` => 2026-10-01..hoje, `encurtado:false`. `dias=90` sem de/ate não é "encurtado" (o front trata o preset "Todo o período").
- `classificacao.itensPoucosDados` (novo, nº de itens POUCOS_DADOS); `coberturaDias` global continua. A cobertura de CLIPPY/CUPOM_DESPESA/OUTRO conta desde o 1º registro NÃO retroativo global do painel; origens com retroativo contam desde o 1º uso da própria origem.
- Cotação: não tenta de novo a rede por ~10 min depois de uma falha (um fetch + um log por falha, não por chamada).
- Configurações → IA: `PUT` descarta preço de entrada/saída <= 0 e cotação <= 0 (sem erro; o modelo volta ao automático). `GET /api/config/ia`: `cotacaoAutomatica.estimada` (boolean) sempre presente. `GET /api/config/ia/uso`: `usos[].custoUsd` é calculado na leitura quando não gravado, com `usos[].custoEstimado:true`; `resumo.custoUsd` soma o estimado, `resumo.custoEstimadoUsd` (novo) e `resumo.usosSemPreco` só conta modelo realmente sem preço.
