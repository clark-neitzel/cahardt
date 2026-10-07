# Plano — Indicadores de Gestão, ETAPA 3 (metas, perda real, custo por ordem, entrega por parada, alerta semanal)

Data: 06/10/2026 · Autor: arquiteto · Base: `docs/plano-dashboard-indicadores.md` (seção 5 e contrato 3.3) + código das etapas 1 e 2 já publicado (commit `9d333bd7`).
Porte: **GRANDE** (schema + PCP em uso diário + semáforo da tela do dono + WhatsApp). Equipe completa. Os devs executam sem o arquiteto: tudo que precisa de decisão já está decidido aqui (seção 0).

---

## 0. Entendimento e decisões tomadas (o dev NÃO precisa perguntar)

Pedido: fechar a Etapa 3 do dashboard — (A) metas por indicador mandando no semáforo, (B) perda real e custo realizado por ordem de produção alimentando o bloco "Produção e estoque", (C) custo de entrega por cliente mais realista, (D) alerta semanal interno no WhatsApp dos admins (opcional).

Decisões do arquiteto (com motivo):

| # | Decisão | Motivo |
|---|---|---|
| E1 | Metas numa **tabela nova `indicadores_metas`** com vigência (uma linha por versão da meta), NÃO em `app_configs`. | `app_configs` guarda 1 JSON sem histórico nem validação; aqui o dono vai mudar meta e queremos saber "a meta valia quanto em agosto". A tabela é pequena (≤ 7 indicadores × poucas versões). |
| E2 | Tolerâncias em **unidade do indicador** (pontos para %, dias para estoque), não relativas. | "MC 33% contra meta 35%" é 2 pontos — é assim que o dono fala. |
| E3 | PUT de metas **só admin** (mesmo critério do ⚙ do imposto: `perms.admin` no back, `user.permissoes.admin` no front). Quem tem a chave completa (não admin) e a gerente de produção **veem** o selo "meta X" e o semáforo, mas não editam. | Meta mexe no que "está vermelho" para a empresa toda; dono/admin decide. |
| E4 | Cálculo de custo da ordem num serviço **novo** `backend/services/ordemCustoService.js`, chamado de `pcpOrdemService.finalizar` **depois** de tudo, em `try/catch`, **sem `await`** (promessa solta com `.catch`). Rede de segurança no scheduler + rota de backfill. | O plano antigo falava em pôr em `indicadoresCustoService`; um arquivo novo isola o risco e o `require` pode ser lazy (se o arquivo tiver erro de sintaxe, a finalização continua funcionando). |
| E5 | **Perda real = "além do que a ficha já prevê"**. A ficha técnica já embute `perdaPercentual` no custo por unidade (`indicadoresCustoService.custoFicha`, linhas ~173-178: `liquido = base × (1 − perda/100)`). Logo a perda normal JÁ está no CPV; só o excesso é "perda nova". O total (normal + excesso) também é gravado, como informativo. | Evita contar a perda da ficha duas vezes e responde a pergunta certa: "perdemos mais do que o previsto?". |
| E6 | Base do rendimento = **quantidade planejada da ordem** (`quantidadePlanejada`, que é saída-alvo: `pcpOrdemService.criar` calcula `fator = planejada / rendimentoBase`). Validar com 3 ordens reais antes de mostrar ao dono (aceite B-8). | É o dado que existe. Limitação documentada na seção B.6. |
| E7 | Custo de entrega (C): **continua "estimado"**; só muda o denominador de "pedidos" para **paradas** (cliente × embarque entregue). Custo real por km/veículo **não** cabe numa noite (explicação em C). | Pedido pode ter vários pedidos na mesma parada; pedido de retirada/balcão hoje recebe custo de entrega que não existiu. |
| E8 | Alerta semanal (D): **opcional, "só se sobrar tempo"**, nasce **DESLIGADO** (chave em `app_configs`), admins apenas, `tipo: 'interno'`. | Regra do CLAUDE.md sobre WhatsApp; o dono liga quando quiser. |

Nada aqui toca: NF-e, devolução automática, `/api/ia-consulta/v1`, `WHERE_PEDIDO_RECEITA`, DRE, comissão, baixa de estoque/entrada de PA do PCP.

---

## 1. Mapa do código atual (confirmado lendo os arquivos)

**Backend (Etapas 1-2, publicado)**
- `backend/routes/indicadoresGestao.js`: `exigir('completo'|'producao'|'admin')` (linhas 24-39), `rota()` (41-49), `foco`/`completoEfetivo` (51-54). `/producao` hoje: `gestao.producao(req.query)` (linha ~70) — **não recebe o nível do usuário**. `/config` GET completo / PUT admin (linhas 77-86) e chama `custo.limparCache()` — é o molde do PUT de metas.
- `backend/services/indicadoresGestaoService.js`:
  - `semaforo(valor, media, melhorSeMaior)` (linha ~288): faixas fixas 2%/5% da média, devolve `{status, palavra, base:'media3m'|'nenhuma'}`. Usado em `resumo()` (linhas ~358-383) para receitaLiquida, margemContribuicao, resultadoOperacional; o de `custoInsumos` é montado à mão (`semCustoIns`, base `'nenhuma'`, faixas 2/5). `semaforo` é exportado (linha ~858) — **nenhum outro arquivo do backend o consome** (grep feito); manter a assinatura e **só adicionar** parâmetro.
  - `producao({de,ate})` (linhas ~681-720): calcula dias de estoque e devolve `perdas/custoRealXPadrao/rendimentoLote` com `disponivel:false` fixos (comentário "Etapa 3").
  - `alertas({de,ate,completo,foco})` (linhas ~810-855): lista itens `{id,nivel,escopo,titulo,texto,acao}`; ordena urgente > atenção > info.
  - `calcularPeriodo` (230) → `mcPct`, `resultadoPct`, `cpv`; `clientesTodos(de,ate)` (722-760) faz o rateio de entrega: `custoPorEntrega = desp.entregas ÷ totalEntregas`, onde `totalEntregas` = **pedidos** FATURADO/especial do período (query `COUNT(DISTINCT p.id)`); `desp.entregas` = despesas do grupo DRE "veiculos e entregas" (`carregarDespesas`, linha ~180).
- `backend/services/indicadoresCustoService.js`: `carregarFichasVigentes` (79), `resolverAtual` (128), `custoFicha` (142), `explodirFicha` (182), `carregarCompras` (256), `criarResolverNaData` (300), `custoNaDataLote` (322), `listarSemanas` (390), `segundaDe`/`somaDias`/`ymdSP` (exportados), `comCache`/`comCacheCompras`/`limparCache`.
- `backend/services/pcpOrdemService.js`: **`finalizar(id,{quantidadeProduzida,criadoPorId})` linha 169** — `$transaction` (timeout 20000/maxWait 10000) baixa cada `OrdemConsumo` (`quantidadeReal > 0 ? real : prevista`, via `pcpEstoqueService.ajustar` motivo `PRODUCAO_CONSUMO`, `ordemProducaoId`), dá entrada do PA (`PRODUCAO_ENTRADA`) e marca `FINALIZADA` com `quantidadeProduzida` e `dataFim`; depois, fora da transação, o bridge de estoque comercial (`estoqueService.ajustar`, try/catch); por fim devolve a ordem. Único chamador: `backend/routes/pcpOrdemRoutes.js:119` (`PATCH /:id/finalizar`). Front: `frontend/src/pages/PCP/PainelOperacional.jsx:122` (modal de finalizar, `qtdProduzida`).
- Fato importante: `PainelOperacional.jsx:95` ao apontar consumo grava `quantidadeReal = digitado || quantidadePrevista` — ou seja, **na prática real = previsto** a não ser que a gerente edite. Por isso a "perda de insumo" por consumo vai ser quase sempre ~0; **o sinal confiável de perda é o rendimento** (produzido × planejado). Documentado em B.6.
- Schema (`backend/prisma/schema.prisma`): `OrdemProducao` (linha 2582), `OrdemConsumo` (2609), `MovimentacaoPcp` (2642, `motivo PRODUCAO_CONSUMO`, `ordemProducaoId`), `Receita` (2525, `perdaPercentual Decimal(5,2)?`, `rendimentoBase`). `receitaSnapshot` (Json da ordem) tem `rendimentoBase` mas **não** `perdaPercentual`.
- `backend/routes/adminExec.js:12295` — molde de rota admin de diagnóstico (`diag-indicadores-snapshot`). Scheduler: `backend/workers/scheduler.js` — snapshot de custo (linhas ~252-264) e alerta do certificado (~366-385) são os moldes.
- Aviso a admins por WhatsApp: `backend/services/certificadoService.js` linhas ~225-253 (`prisma.vendedor.findMany({ativo:true, telefone:{not:null}})` filtrando `permissoes.admin === true`; `webhookService.enviarMensagemCustom(tel, nome, msg, {tipo:'interno', origem, referencia})`).

**Frontend (Etapa 2, publicado)**
- `frontend/src/pages/Dashboard/IndicadoresGestao.jsx`: ⚙ do imposto só `ehAdmin && dono` (linha ~215); `kpiInsumosDerivado` (linhas ~33-52) **calcula o semáforo do custo dos insumos NO FRONT** para a visão produção (faixas 2/5, `base:'faixa'`) — precisa passar a vir do servidor (F-3); `ProducaoEstoque` recebe `producao.dados`.
- `indicadores/ProducaoEstoque.jsx`: já sabe desenhar `perdas.disponivel:true` (valorMes, pctCpv, metaPct, semanal) e hoje mostra selo "disponível na próxima fase". `indicadores/BarrasPerda.jsx` já pronta (tooltip diz "Perda X% **do consumo**"). `indicadores/KpiCard.jsx:9`: `BASE_SEMAFORO = { media3m, meta, faixa }` — `meta` já existe ("vs meta"). `ConfigImpostoModal.jsx` = molde do modal de metas. `services/indicadoresGestaoApi.js` + `indicadoresGestaoMock.js` (mock só em DEV e só em 404).
- Manuais: `backend/manuais/abas/indicadores-gestao.md` (existe), `pcp-ordens.md`, `pcp-painel.md`; tabela `ABAS` em `backend/services/copilotoService.js:82` já tem `indicadores-gestao` (não muda).

---

## 2. BLOCO A — Metas por indicador

### A.1 Schema (aditivo; tabela nova)
```prisma
// Metas dos Indicadores de Gestão. Cada PUT cria uma NOVA linha (a anterior recebe vigenciaFim) => histórico grátis.
model IndicadorMeta {
  id                  String    @id @default(uuid())
  indicador           String    // MC_PCT | RESULTADO_PCT | CUSTO_INSUMOS_VAR_PCT | PERDA_PCT | RENDIMENTO_PCT | DESVIO_CUSTO_PCT | DIAS_ESTOQUE_PA
  alvo                Decimal   @db.Decimal(12, 2)
  sentido             String    @default("MAIOR_MELHOR") // MAIOR_MELHOR | MENOR_MELHOR
  toleranciaAtencao   Decimal   @default(0) @map("tolerancia_atencao") @db.Decimal(10, 2) // até quanto PIOR que o alvo ainda é "no alvo"
  toleranciaAgir      Decimal   @map("tolerancia_agir") @db.Decimal(10, 2)                // pior que isso => "agir"
  vigenciaInicio      DateTime  @default(now()) @map("vigencia_inicio")
  vigenciaFim         DateTime? @map("vigencia_fim")                                      // null = vigente
  atualizadoPorId     String?   @map("atualizado_por_id")
  atualizadoPorNome   String?   @map("atualizado_por_nome")
  createdAt           DateTime  @default(now()) @map("created_at")

  @@index([indicador, vigenciaFim])
  @@map("indicadores_metas")
}
```
Remover meta = fechar a vigência (`vigenciaFim = agora`) sem criar linha nova. **Meta vigente** de um indicador = linha com `vigenciaFim = null` (no máximo 1; o PUT garante dentro da `$transaction`).

### A.2 Catálogo no código (fonte única de rótulo/unidade/escopo/padrões)
Arquivo novo `backend/services/indicadoresMetasService.js`, constante `CATALOGO`:

| indicador | rótulo | unidade | sentido padrão | escopo | tolAtenção | tolAgir | onde aparece |
|---|---|---|---|---|---|---|---|
| `MC_PCT` | Margem de contribuição | `pct` (pontos) | MAIOR_MELHOR | completo | 0 | 5 | KPI MC |
| `RESULTADO_PCT` | Resultado operacional | `pct` | MAIOR_MELHOR | completo | 0 | 5 | KPI Resultado |
| `CUSTO_INSUMOS_VAR_PCT` | Variação do custo dos insumos (8 sem.) | `pct` | MENOR_MELHOR | producao | 0 | 3 | KPI custo insumos |
| `PERDA_PCT` | Perda além da ficha (% do consumo) | `pct` | MENOR_MELHOR | producao | 0 | 1.5 | bloco Produção |
| `RENDIMENTO_PCT` | Rendimento do lote | `pct` | MAIOR_MELHOR | producao | 0 | 3 | bloco Produção |
| `DESVIO_CUSTO_PCT` | Custo real acima do padrão | `pct` | MENOR_MELHOR | producao | 0 | 3 | bloco Produção |
| `DIAS_ESTOQUE_PA` | Dias de estoque (produto acabado) | `dias` | MENOR_MELHOR | producao | 0 | 5 | bloco Produção |

`escopo:'producao'` = visível também para a gerente de produção; `'completo'` = só quem tem a chave completa. O catálogo é **fechado**: PUT com indicador fora da lista → 400. Receita líquida **não** tem meta (depende do tamanho do período) — continua `media3m`.

Funções do serviço:
- `listarVigentes()` → `Map<indicador, linha>` (1 query `findMany({where:{vigenciaFim:null}})`).
- `salvarLote(itens, {userId, userNome})` — valida e grava (A.4).
- `avaliar(indicador, valor, meta)` → semáforo (A.3).
- `sugerirPelaMedia()` (A.5).

### A.3 Semáforo com meta (regra exata)
```
dif = sentido==='MAIOR_MELHOR' ? (alvo - valor) : (valor - alvo)     // positivo = pior que o alvo
dif <= toleranciaAtencao                  -> { status:'ok',      palavra:'no alvo' }
dif <= toleranciaAgir                     -> { status:'atencao', palavra:'atenção' }
senão                                     -> { status:'agir',    palavra:'agir'    }
valor == null                             -> { status:'sem_dado', palavra:'', base:'nenhuma' }
```
Devolve `{ status, palavra, base:'meta', meta:{ alvo, sentido, unidade }, delta: valor - alvo }` (**campos novos `meta` e `delta` são aditivos**; `status/palavra/base` mantêm o contrato). Exemplo do aceite: MC alvo 35, tolAgir 5: 33% → dif 2 → **atenção**; 28% → dif 7 → **agir**; 36% → ok.

Em `indicadoresGestaoService.js`:
1. `semaforo(valor, media, melhorSeMaior = true, meta = null)`: se `meta` vier, delega a `avaliar`; senão o comportamento atual **idêntico** (média 3 meses, 2%/5%). Assinatura antiga continua válida.
2. `resumo()`: **dentro** da função cacheada, `const metas = await metasService.listarVigentes()` e passar `metas.get('MC_PCT')` etc. ao `semaforo`. KPI `custoInsumos`: se existir meta `CUSTO_INSUMOS_VAR_PCT`, `semaforo = avaliar(varMedia, meta)` (substitui `semCustoIns`); senão mantém o atual.
3. Campos aditivos em cada KPI de `/resumo`: `media3mPct` já existe para MC/Resultado → adicionar `deltaMedia3mPt` (= pct − media3mPct, 1 casa, null se faltar) e, em `receitaLiquida`, `media3m` e `deltaMedia3mPct`; em todos, `meta:{alvo,sentido,unidade}|null`.
4. **Cache**: `resumo` tem TTL 60 s e `PUT /metas` chama `custo.limparCache()` (como o PUT de `/config`) — a meta nova vale na hora.
5. `insumosSemanal` (visão produção) devolve campo aditivo `kpi: { variacaoPct, semanas, semaforo, destaques:[{itemPcpId,nome,variacaoPct}] }` calculado no servidor com a **mesma** função (meta se houver, senão faixas 2/5 com `base:'faixa'`). Isso permite **apagar o semáforo derivado no front** (F-3) — hoje a gerente poderia ver verde no front e o servidor mandar outra coisa quando a meta existir.

### A.4 Rotas (todas em `routes/indicadoresGestao.js`; **registrar `/metas/sugestao` antes de `/metas`** só por clareza)
- `GET /metas` — `exigir('producao')`. Completo vê os 7; produção-only vê só `escopo:'producao'` (**filtro no servidor**). Resposta:
```
{ podeEditar: boolean /* admin */,
  metas: [ { indicador, rotulo, unidade:'pct'|'dias', escopo, sentido,
             alvo:number|null,                       // null = sem meta
             toleranciaAtencao:number, toleranciaAgir:number,
             padroes:{ sentido, toleranciaAtencao, toleranciaAgir },
             vigenciaInicio:string|null, atualizadoPorNome:string|null } ] }
```
(Sem meta cadastrada: `alvo:null` e tolerâncias = padrões do catálogo, para o formulário já abrir preenchido.)
- `PUT /metas` — `exigir('admin')`. Body: `{ metas: [ { indicador, alvo:number|null, toleranciaAtencao?:number, toleranciaAgir?:number } ] }` (`alvo:null` = remover). Validações (400 com mensagem amigável): indicador no catálogo; `alvo` número finito; percentuais 0–100 (`pct`), dias 0–365; `0 ≤ toleranciaAtencao ≤ toleranciaAgir`; `sentido` **não** vem do cliente (usa o do catálogo). Grava numa `$transaction(..., { timeout: 20000, maxWait: 10000 })`: para cada item, `updateMany({where:{indicador, vigenciaFim:null}, data:{vigenciaFim:agora}})` e, se `alvo != null`, `create`. **Só banco dentro da transação.** Depois da transação: `custo.limparCache()`. Idempotência: reenviar o mesmo lote cria nova versão idêntica — inofensivo (não é operação financeira); mesmo assim, se alvo/tolerâncias forem iguais à vigente, **pular** (não criar linha).
- `GET /metas/sugestao` — `exigir('admin')`. Resposta `{ baseMeses:['2026-07','2026-08','2026-09'], sugestoes:[ { indicador, alvoSugerido:number|null, base:'media3m'|'sem_base', observacao:string } ] }`.

### A.5 "Sugerir pela média" (`sugerirPelaMedia`)
Últimos **3 meses fechados** (não conta o mês corrente), cada um via `calcularPeriodo(1º dia, último dia)` (já cacheado):
- `MC_PCT`, `RESULTADO_PCT`: média simples dos `mcPct`/`resultadoPct` não nulos; precisa de ≥ 2 meses, senão `sem_base`.
- `PERDA_PCT`, `RENDIMENTO_PCT`, `DESVIO_CUSTO_PCT`: agregação das ordens finalizadas nesses 3 meses (mesma agregação do B.5); precisa de ≥ 3 ordens apuradas, senão `sem_base`.
- `CUSTO_INSUMOS_VAR_PCT`, `DIAS_ESTOQUE_PA`: **`sem_base`** (não existe série histórica confiável) com `observacao: 'preencha manualmente'`. **Não inventar número.**
- A sugestão **só preenche o formulário**; nada é gravado até o admin clicar em Salvar.

### A.6 Frontend (A)
- **F-1 `frontend/src/pages/Dashboard/indicadores/MetasModal.jsx`** (molde: `ConfigImpostoModal.jsx`; bottom-sheet no mobile, `rounded-t-2xl sm:rounded-2xl`, botões `min-h-[44px]`). Abre por um botão novo no `PageHeader` (ícone `Target` do lucide — **importar**, o build pega), visível `ehAdmin` em ambas as visões (na visão produção lista só os `escopo:'producao'`; na visão dono, todos). Uma linha (card no mobile) por indicador: rótulo, "quanto maior/menor, melhor" (texto fixo), campo **Meta** (`inputMode="decimal"`, aceita vírgula), **Atenção a partir de** e **Agir a partir de** (com a unidade ao lado: `pt` ou `dias`), botão "Remover meta". Botão do topo "Sugerir pela média" (chama `GET /metas/sugestao`, preenche só campos vazios ou com confirmação "substituir as metas digitadas?"; indicadores `sem_base` mostram a observação). Rodapé: Cancelar / Salvar → `PUT /metas` com **só as linhas alteradas**; toast de sucesso/erro; ao salvar chama `resumo.recarregar(); producao.recarregar(); insumos.recarregar(); alertas.recarregar()`.
- **F-2** `services/indicadoresGestaoApi.js`: `salvarMetas(lista)`; `buscarIndicador('metas')`/`('metas/sugestao')` já servem (a função aceita qualquer rota). Adicionar ao `indicadoresGestaoMock.js` o formato de `/metas`, `/metas/sugestao` e os novos campos (só DEV).
- **F-3** `IndicadoresGestao.jsx`: apagar `kpiInsumosDerivado`; o cartão de insumos da visão produção passa a ler `insumos.dados.kpi` (`variacaoPct`, `semanas`, `semaforo`, `destaques`; o `spark` continua calculado a partir de `insumos.dados.insumos[].indice` como hoje). Se `kpi` vier ausente (backend antigo), cai no "—" sem selo — **não** recalcular no front.
- **F-4** `KpiCard.jsx`: quando `semaforo.meta` existir, mostrar ao lado do selo o texto `meta 35%` (ou `meta ≤ 1,5%`, conforme `sentido`; dias: `meta ≤ 20 dias`) em `text-[11px] text-gray-500`; **não** mexer em `BASE_SEMAFORO` (a chave `meta` já existe). Mostrar também `deltaMedia3mPt` quando houver, em texto simples ("−1,2 pt vs média de 3 meses").
- Persistência de filtros: nada novo (modal não tem filtro).

### A.7 Permissões (A)
Nenhuma chave nova. Espelho exato: backend `exigir('admin')` ⇔ front `!!user?.permissoes?.admin` (mesmo do ⚙ imposto); leitura `exigir('producao')` ⇔ `hasPermission('Pode_Ver_Indicadores_Gestao') || hasPermission('Pode_Ver_Indicadores_Producao')`. **Não usar `isClark`.**

### A.8 Riscos (A)
- Esquecer de pôr a leitura das metas **dentro** da função cacheada → meta nova só vale após 60 s sem limpar cache. Mitigação: `limparCache()` no PUT + leitura dentro do cache.
- Tolerância invertida (agir < atenção) → semáforo errado. Validar no PUT e no formulário.
- Meta com `sentido` errado → catálogo manda; cliente não envia sentido.
- Produção-only não pode receber meta de `MC_PCT`/`RESULTADO_PCT` (dado financeiro): filtro por `escopo` no GET, **no servidor**.

### A.9 Aceite clicável (A)
1. Admin abre Indicadores → botão Metas (alvo) → "Sugerir pela média" preenche MC/Resultado com a média dos 3 meses fechados; os `sem_base` mostram "preencha manualmente"; nada salva sem clicar Salvar.
2. Salvar MC alvo 35 (padrões 0/5) com MC atual 33% → cartão MC mostra **atenção** com "vs meta · meta 35%". Mudar para alvo 40 → **agir**. Remover a meta → volta para "vs média de 3 meses" (seta/palavra da média).
3. Sem nenhuma meta cadastrada a tela fica **idêntica** à Etapa 2 (regressão zero).
4. Usuário não-admin com chave completa: não vê o botão Metas; `curl PUT /metas` com o token dele → 403.
5. Gerente de produção (só chave de produção): `curl GET /metas` devolve só os 4 indicadores `escopo:'producao'`; nenhum `MC_PCT`/`RESULTADO_PCT`.
6. Duas edições seguidas → `SELECT * FROM indicadores_metas WHERE indicador='MC_PCT'` mostra 2 linhas, só a última com `vigencia_fim IS NULL`.
7. 375 px: modal sem scroll horizontal, campos tocáveis.

---

## 3. BLOCO B — Perda real e custo realizado por ordem de produção

### B.1 Schema (aditivo — **todas** colunas novas, nenhuma removida)
```prisma
model OrdemProducao {
  // ... campos atuais intactos ...
  // Indicadores de Gestão (Etapa 3): apuração gravada ao finalizar. Tudo opcional; ordem antiga fica null até o backfill.
  custoPadraoTotal            Decimal?  @map("custo_padrao_total")            @db.Decimal(12, 2) // Σ quantidade PREVISTA × custo do insumo na data
  custoRealizadoTotal         Decimal?  @map("custo_realizado_total")         @db.Decimal(12, 2) // Σ quantidade REAL baixada × custo do insumo na data
  custoUnitarioPadrao         Decimal?  @map("custo_unitario_padrao")         @db.Decimal(12, 4) // custoPadraoTotal ÷ (planejada × rendimentoFicha)
  custoUnitarioReal           Decimal?  @map("custo_unitario_real")           @db.Decimal(12, 4) // custoRealizadoTotal ÷ produzida
  rendimentoRealPct           Decimal?  @map("rendimento_real_pct")           @db.Decimal(7, 2)  // produzida ÷ planejada × 100 (pode passar de 100)
  rendimentoFichaPct          Decimal?  @map("rendimento_ficha_pct")          @db.Decimal(7, 2)  // 100 − perdaPercentual da receita
  perdaRealPct                Decimal?  @map("perda_real_pct")                @db.Decimal(7, 2)  // max(0, 100 − rendimentoReal) — TOTAL (informativo)
  quantidadePerdida           Decimal?  @map("quantidade_perdida")            @db.Decimal(12, 3) // max(0, planejada × rendimentoFicha − produzida) — ALÉM da ficha
  perdaValor                  Decimal?  @map("perda_valor")                   @db.Decimal(12, 2) // quantidadePerdida × custoUnitarioPadrao
  insumosSemPreco             Int?      @map("insumos_sem_preco")                                 // nº de insumos sem custo conhecido (custo parcial)
  custoApuradoEstimado        Boolean   @default(false) @map("custo_apurado_estimado")            // true no backfill de ordens antigas
  custoApuradoEm              DateTime? @map("custo_apurado_em")

  @@index([dataFim])
}
```
Correspondência com os nomes do pedido: `custoPadrao`→`custoPadraoTotal`, `custoRealizado`→`custoRealizadoTotal`, `rendimentoPct`→`rendimentoRealPct`, `perdaPct`→`perdaRealPct`, `quantidadePerdida` igual. (Os 6 nomes da seção 5.1 do plano antigo ficam **substituídos** por esta lista; nenhuma coluna foi criada ainda, não há conflito.) O `@@index([dataFim])` **tem que estar no schema** (índice criado só no SQL é derrubado pelo `db push`).

Também (aditivo, JSON): em `pcpOrdemService.criar`, no `snapshot` acrescentar `perdaPercentual: receita.perdaPercentual != null ? Number(receita.perdaPercentual) : 0` (o `select`/`include` de `criar` já traz o `receita` inteiro — conferir; `Receita.perdaPercentual` é coluna escalar, vem junto). Para ordens antigas (sem esse campo) o cálculo usa `ordem.receita.perdaPercentual` atual como fallback.

### B.2 Serviço novo `backend/services/ordemCustoService.js`
Funções:
- **`apurarCustoOrdem(ordemId, { estimado = false, force = false } = {})`** — NUNCA lança (try/catch interno, devolve `{ok:false, erro}` em falha, log `[OrdemCusto]`). Passos:
  1. Carrega ordem + `itensConsumo(itemPcp{id,tipo,custoUnitario,produto{custoManual}})` + `receita{perdaPercentual, rendimentoBase}`. Sai se `status !== 'FINALIZADA'`, se `quantidadeProduzida <= 0` ou se `custoApuradoEm` já preenchido e `!force` (**idempotente**).
  2. Quantidade REAL por insumo = **`Σ MovimentacaoPcp` `tipo:'SAIDA', motivo:'PRODUCAO_CONSUMO', ordemProducaoId`** por `itemPcpId` (é o que de fato saiu do estoque); se não houver movimentação para um item (ordem muito antiga), cair em `quantidadeReal > 0 ? real : prevista` do `OrdemConsumo`. Quantidade PREVISTA = `OrdemConsumo.quantidadePrevista`.
  3. Custo do insumo **na data** (`dataFim`): `carregarCompras({ itemPcpIds, ate: dataFim })` + `criarResolverNaData(idx)` (cai no `resolverAtual` se não há compra até a data). Para insumo `tipo === 'SUB'`: custo/un = `custoFicha(receitaDaSub, ctx, resolver, dataFim).custoPorUnidade` com `ctx = carregarFichasVigentes()`; se a sub não tem receita vigente, usa `itemPcp.custoUnitario`; se nada, conta em `insumosSemPreco`. **Não** inventar custo 0 silencioso: insumo sem preço fica fora da soma e incrementa `insumosSemPreco`.
  4. Calcula (arredondar só na gravação): `custoPadraoTotal`, `custoRealizadoTotal`, `rendimentoFichaPct = 100 − (perdaPercentual||0)`, `esperada = planejada × rendimentoFichaPct/100`, `custoUnitarioPadrao = custoPadraoTotal ÷ esperada` (null se `esperada ≤ 0`), `custoUnitarioReal = custoRealizadoTotal ÷ produzida`, `rendimentoRealPct = produzida ÷ planejada × 100`, `perdaRealPct = max(0, 100 − rendimentoRealPct)`, `quantidadePerdida = max(0, esperada − produzida)`, `perdaValor = quantidadePerdida × custoUnitarioPadrao`.
  5. `prisma.ordemProducao.update` (uma escrita, **sem `$transaction`**) com os campos + `custoApuradoEm = new Date()` + `custoApuradoEstimado = estimado`. Depois `require('./indicadoresCustoService').limparCache()` (o `producao()` tem cache de 60 s).
- **`apurarPendentes({ limite = 50, diasAtras = 30 } = {})`** — `findMany({ where:{ status:'FINALIZADA', custoApuradoEm:null, dataFim:{ gte: agora − diasAtras } }, take: limite })` e chama `apurarCustoOrdem` em série. **Cuidado Prisma**: `custoApuradoEm: null` é filtro direto (ok); não usar `not`/`notIn` em campo anulável sem `OR` (armadilha conhecida do projeto).
- **`backfill({ limite, dry })`** — mesmas ordens FINALIZADAS **sem** janela de dias, `estimado:true`; `dry:true` só conta e devolve amostra de 5 ordens com o que seria gravado.

### B.3 Onde pendurar (e o que NÃO mudar)
1. `pcpOrdemService.finalizar` (linha 169): inserir **depois** do bloco "4. Bridge" e **antes** do `return prisma.ordemProducao.findUnique(...)`:
```js
// Indicadores de Gestão: apura custo/perda da ordem. Fora da transação, sem await, nunca derruba a finalização.
try {
    require('./ordemCustoService').apurarCustoOrdem(id).catch((e) => console.error('[OrdemCusto] falha ao apurar OP', id, e.message));
} catch (e) { console.error('[OrdemCusto] indisponível:', e.message); }
```
   (o `require` dentro do `try` garante que erro de carregamento do arquivo também não afeta a finalização.) **Não** mexer na `$transaction` existente, nas baixas de consumo, na entrada do PA nem no bridge.
2. `criar`: só o campo extra do snapshot (B.1).
3. Scheduler (`workers/scheduler.js`): job de segurança a cada 30 min chamando `ordemCustoService.apurarPendentes()` com `.catch` (molde: bloco do snapshot de custo, ~linhas 252-264, mas com `setInterval`). Cobre processo que caiu entre a finalização e a apuração.
4. Rota admin `GET /api/admin-exec/indicadores-backfill-ordens?dry=1&limite=200` (em `routes/adminExec.js`, molde `diag-indicadores-snapshot` linha 12295) e `GET /api/admin-exec/diag-indicadores-ordens` (só leitura: nº de ordens FINALIZADAS, quantas apuradas/sem apuração, 5 últimas com os campos). **Rodar o backfill em produção só depois do deploy e do `dry=1` conferido com a gerente.**
5. Boy scout (regra do CLAUDE.md): `pcpOrdemService.js` já usa `$transaction` com `{ timeout: 20000, maxWait: 10000 }` em todos os usos (conferido) — nada a ajustar; **não** introduzir transação nova.

### B.4 `GET /producao` — contrato (SÓ adições; `disponivel` passa a `true` quando há dado)
O router passa a chamar `gestao.producao({ ...req.query, completo: req._nivelIndicadores.completo })`; `producao()` lê as metas **dentro** do cache e a chave de cache inclui `completo`.
```
perdas: { disponivel:boolean, motivo?:string,            // motivo quando false: 'Nenhuma ordem finalizada e apurada no período.'
          valorMes:number|null,                          // Σ perdaValor (R$) das ordens com dataFim (SP) em [de..ate]   -- nome legado, vale para o período
          pctCpv:number|null,                            // perdaValor ÷ CPV do período (SÓ visão completa; null para produção-only)
          pctProduzido:number|null,                      // NOVO: perdaValor ÷ Σ custoRealizadoTotal × 100 (a base da meta PERDA_PCT)
          perdaTotalValor:number|null,                   // NOVO: inclui a perda normal da ficha (informativo)
          metaPct:number|null,                           // meta PERDA_PCT quando existir
          semaforo:{status,palavra,base,meta?,delta?},   // NOVO (avaliar(pctProduzido))
          ordens:int, ordensSemPreco:int,                // NOVO: ordens apuradas no período / com insumo sem preço
          semanal:[{ inicio:'YYYY-MM-DD', pct:number, valor:number, ordens:int }] }  // 8 semanas terminando em `ate`; pct = perdaValor ÷ custoRealizado da semana (casa com o tooltip "do consumo")
custoRealXPadrao: { disponivel, desvioPct, valorDesvio:number|null, semaforo, ordens }
   // desvioPct = Σ custoRealizadoTotal ÷ Σ(custoUnitarioPadrao × produzida) − 1, em %. valorDesvio = o numerador menos o denominador, R$.
rendimentoLote:   { disponivel, realPct, fichaPct, semaforo, ordens }
   // realPct = Σ produzida ÷ Σ planejada × 100 (ponderado); fichaPct = Σ(planejada × rendimentoFichaPct) ÷ Σ planejada
```
- `estoque` e `periodo` inalterados. Semana = `segundaDe(ymd dataFim em SP)` (função exportada do `indicadoresCustoService`). Considera só ordens `status='FINALIZADA'` **e** `custoApuradoEm IS NOT NULL`.
- Aviso aditivo opcional `ordensPendentesApuracao:int` (FINALIZADAS no período sem apuração) para a tela dizer "N ordens ainda sem custo apurado".
- Visão produção-only: recebe R$ de perda e custo (é custo de insumo, não resultado financeiro) mas **não** recebe `pctCpv` (null).

### B.5 Alerta novo (em `alertas()`)
Se `perdas.semaforo.status` ∈ {atencao, agir} (só existe com meta): item `{ id:'perda-acima-meta', nivel: agir?'urgente':'atencao', escopo:'producao', titulo:'Perda de produção acima da meta', texto:\`Perda de ${pct}% do consumo contra meta de ${meta}% (${ordens} ordens no período).\`, acao:{ rotulo:'Ver ordens', rota:'/pcp/ordens', permissao:'pcp.ordens' } }`. Idem `custoRealXPadrao` → `id:'custo-real-acima-padrao'`. Sem meta: **nenhum** alerta novo (não inventar limite).

### B.6 Limitações que o dev e o QA precisam saber (e o manual precisa dizer)
1. **Consumo real = previsto na prática**: o painel preenche o real com o previsto quando a gerente não edita (`PainelOperacional.jsx:95`). Então `custoRealizado ≈ custoPadrão` e o desvio quase sempre dá ~0% até a equipe passar a apontar o consumo de verdade. O sinal confiável é o **rendimento**. A tela deve dizer isso no "Guia de leitura" (F-6).
2. **Rendimento depende da quantidade planejada** ser a saída-alvo (E6). Se a equipe planeja X e produz de propósito menos (falta de massa), aparece "perda". Validar com 3 ordens reais (B-8).
3. A perda normal da ficha já está no custo; por isso o número principal é "além da ficha".
4. Backfill das ordens antigas usa custo do insumo "na data" com fallback atual → marcado `custoApuradoEstimado = true`; a tela mostra selo "inclui ordens estimadas" quando houver alguma no período (campo aditivo `perdas.ordensEstimadas:int`).

### B.7 Frontend (B)
- **F-5 `ProducaoEstoque.jsx`**: trocar `<Prox/>` por: se `disponivel:false` e `motivo` → texto cinza "sem ordens finalizadas no período" (não "próxima fase"); com `disponivel:true` mostrar valor, `pctProduzido` (rótulo "do consumo"), `Selo` vindo de `perdas.semaforo` (**apagar** o `stPerda` calculado no front, linhas ~15-17) e "meta ≤ X%". "Perdas do mês" → "Perdas no período". Custo real × padrão: `±x,x%` + R$ (`valorDesvio`) + selo. Rendimento: `realPct` e "ficha prevê `fichaPct`" + selo. Chip "inclui N ordens estimadas" quando `ordensEstimadas > 0`. `BarrasPerda` já pronto (recebe `metaPct`).
- **F-6 `guia.js`/`GuiaLeitura.jsx`**: acrescentar 3 textos curtos (perda além da ficha; custo real × padrão; rendimento do lote) e a ressalva B.6-1.
- Mobile: o bloco já é `grid-cols-2`; conferir em 375 px que números com selo não estouram (usar `break-words`).

### B.8 Aceite clicável (B)
**Local (hardt_local) — não finalizar ordem em produção para testar (mexe em estoque real):**
1. Criar ordem de uma receita com perda da ficha 5% e rendimento base 10 kg, planejada 100 kg → finalizar com produzida 90 → em ≤ 5 s a linha de `ordens_producao` tem os campos preenchidos: `rendimento_real_pct = 90,00`, `rendimento_ficha_pct = 95,00`, `perda_real_pct = 10,00`, `quantidade_perdida = 5,000`, `perda_valor = 5 × custo_unitario_padrao`, `custo_apurado_em` preenchido.
2. Produzida 98 → `quantidade_perdida = 0`, `perda_real_pct = 2,00`, rendimento 98.
3. Ordem com insumo sem preço → `insumos_sem_preco ≥ 1` e a finalização **funcionou normalmente**.
4. Forçar erro (renomear temporariamente a função apurar para lançar) → a ordem finaliza, estoque do insumo baixa, PA entra, resposta 200. Depois o job `apurarPendentes` (ou o backfill) preenche.
5. Finalizar duas vezes seguidas (duplo clique): o segundo recebe o erro de status que já existe hoje e `custoApuradoEm` não muda (idempotente).
6. `GET /producao?de&ate` (token completo): `perdas.disponivel:true`, `semanal` com até 8 itens; com token só-produção `pctCpv:null`; sem ordens no período `disponivel:false` + `motivo`.
7. Tela: bloco "Produção e estoque" deixou de mostrar "próxima fase"; com meta PERDA_PCT = 1 e perda 4% → selo **agir**; alerta "Perda de produção acima da meta" aparece em "Onde agir primeiro".
**Produção (depois do deploy):** `diag-indicadores-ordens` responde (rota nova no ar, não 404); `indicadores-backfill-ordens?dry=1` mostra amostra coerente; rodar o backfill; **a gerente confere 3 ordens reais** (planejada, produzida, perda calculada) **antes de o dono ver** e antes de qualquer novidade ser publicada.

### B.9 Riscos (B) — o que pode quebrar no PCP
- **Finalização de ordem é fluxo diário da fábrica.** Regras: nada dentro da `$transaction`; chamada sem `await` e em `try/catch`; `require` lazy; função nunca lança. O revisor confere linha a linha que o diff de `finalizar` só **acrescenta** o bloco acima.
- Listagens do PCP (`listar`, `buscarPorId`) retornam a ordem inteira → ganham os campos novos (Decimal vira string no JSON). Aditivo; grep dos consumidores: `grep -rn "ordensProducao\|ordemProducao\|pcpOrdemService" backend frontend --include=*.js --include=*.jsx` (o revisor roda) — nenhum consumidor usa `Object.keys`/spread estrito conhecido; conferir.
- `prisma db push` em produção cria colunas anuláveis e a tabela nova sem perda; **não** renomear nem remover nada. Subir backend antes do front.
- Cálculo com `Decimal` do Prisma: converter com `Number()`; dividir só se denominador > 0 (senão `null`, nunca `Infinity`/`NaN` — `round` de NaN grava lixo).
- Ordem finalizada com `quantidadePlanejada` 0 ou receita sem `rendimentoBase`: campos ficam `null`, sem erro.
- Desempenho: backfill em lote com `carregarCompras` por ordem pode pesar — processar de 20 em 20 e reaproveitar `ctx`.

---

## 4. BLOCO C — Custo de entrega por cliente (decisão: refinar o rateio, continua "estimado")

**O que existe para ratear (confirmado no schema):** `Pedido.embarqueId` + `Pedido.statusEntrega` (`PENDENTE|ENTREGUE|ENTREGUE_PARCIAL|DEVOLVIDO`) + `Embarque.dataSaida`/`responsavelId`; `Veiculo`; `DiarioVendedor` (km inicial/final por vendedor e dia, `veiculoId`); `Despesa` do app (combustível/pedágio por `veiculoId`); e as despesas do grupo DRE "Veículos e entregas" (Contas a Pagar), que é o numerador atual.

**O que NÃO dá numa noite (e por quê):** custo **real** por entrega exigiria somar km por embarque (`DiarioVendedor.kmFinal−kmInicial` é por vendedor/dia, não por carga) e separar o que é entrega do que é visita de vendas; além disso a tabela `Despesa` do app e as contas a pagar de combustível podem ser a **mesma** despesa lançada duas vezes (risco de dupla contagem que ainda ninguém verificou). Fica documentado como evolução futura; **o selo continua `ESTIMADO`**.

**O que se faz (pequeno e seguro), em `indicadoresGestaoService.clientesTodos` (linhas ~722-760):**
1. Trocar o denominador por **paradas**: `COUNT(DISTINCT (p.embarque_id, p.cliente_id))` de pedidos com `p.embarque_id IS NOT NULL AND p.status_entrega <> 'PENDENTE'` e `embarques.data_saida` no período (JOIN `embarques e ON e.id = p.embarque_id`); pedido **sem embarque** (retirada/balcão/site-retirada) = **0 paradas** (hoje recebe custo de entrega que não houve).
2. `custoPorParada = desp.entregas ÷ totalParadas` (se `totalParadas > 0` e `desp.entregas > 0`, senão `null`/`INDISPONIVEL` como hoje).
3. `custoEntrega` do cliente = `custoPorParada × paradasDoCliente`; `mcTotal`/`mcPct` já usam `custoEntrega` — nada mais muda no cálculo.
4. **Contrato (só adições):** cada linha ganha `paradas:int`; a resposta ganha `custoEntregaMetodo:'POR_PARADA'|'INDISPONIVEL'` e `custoPorParada:number|null`. `entregas:int` **continua existindo com o mesmo significado de hoje (nº de pedidos)**; `custoEntregaOrigem` continua `'ESTIMADO'|'INDISPONIVEL'`.
5. **Fallback seguro:** se `totalParadas = 0` (período sem embarques registrados, ex.: antes de adotarem o módulo), cai no método antigo por pedido e devolve `custoEntregaMetodo:'POR_PEDIDO'` (valor novo do enum, aditivo) — a coluna da tela não some.
6. Frontend (F-7, `TabelaClientes.jsx`): coluna "Entregas" passa a mostrar `paradas` quando existir (rótulo "Paradas"), com o selo "estimado" que já existe; tooltip: "custo de veículos e entregas do período ÷ paradas realizadas, sem separar por km". Se `paradas` ausente (backend antigo), mostra `entregas` como hoje.
7. Aceite: cliente com 3 pedidos entregues na mesma carga = **1** parada; cliente só de retirada = 0 paradas e custo de entrega 0/—; soma de `custoEntrega` de todos os clientes ≈ `desp.entregas` do período (diferença só de clientes fora do top/limite); alerta de MC<25% continua funcionando (usa `clientesTodos`).
8. Riscos: `statusEntrega` desatualizado (motorista não marca) subconta paradas e **encarece** cada parada — mostrar no aviso da tabela "depende de a entrega ser marcada no app". Dependência: confirmar com consulta ao dump de 15 min (nota `reference_consultar_prod_pelo_dump_15min`) quantos pedidos faturados do último mês têm `embarque_id` — se < 50%, **não** ativar o método novo (manter `POR_PEDIDO`) e avisar o dono.

---

## 5. BLOCO D — Alerta semanal no WhatsApp interno (OPCIONAL — só se sobrar tempo)

**Regras do CLAUDE.md que valem aqui (inegociáveis):** só `tipo: 'interno'`, destino **apenas admins** (nunca cliente, nem vendedor comum); toda mensagem com `tipo` e `referencia`; retry usa a mesma referência; ≤ 2000 caracteres; nada promocional.

- **Arquivo novo** `backend/services/indicadoresAlertaSemanalService.js`, função `enviarResumoSemanal({ forcar = false, dry = false } = {})` (molde literal: `certificadoService.alertarValidadeCertificado`, linhas ~205-253):
  1. Trava de ligado/desligado: `app_configs` chave `indicadores_alerta_semanal_ativo` (`{ativo:boolean}`), **padrão desligado**; se desligado e `!forcar` → `{ok:true, motivo:'desligado'}`. **Trava de ambiente local**: reaproveitar `ambienteLocal()` de `backupService.js:170` (exportar se ainda não for) — backend local nunca envia.
  2. Dedupe: `app_configs` `indicadores_alerta_semanal_ultimo` = `{ semana:'YYYY-MM-DD' (segunda) }`; já enviado nesta segunda → não repete.
  3. Conteúdo: `gestao.alertas({ de:<1º do mês>, ate:hoje, completo:true, foco:'todos' })` → pega os **3 primeiros** (já vêm ordenados urgente > atenção > info), **ignora** itens cujo id começa com `cliente-mc-` (não expor nome de cliente por WhatsApp). Texto: `📊 *Indicadores — resumo da semana*` + 3 linhas `• título — texto` + "Veja no sistema: Indicadores de Gestão." Sem alertas → **não envia nada** (não mandar "tudo certo" — é ruído).
  4. Destino: `prisma.vendedor.findMany({ where:{ ativo:true, telefone:{not:null} } })` filtrando `permissoes.admin === true` (igual ao certificado).
  5. Envio: `webhookService.enviarMensagemCustom(a.telefone, a.nome, msg, { tipo:'interno', origem:'indicadores-semanal', referencia:\`indicadores-semanal-${segundaISO}-${a.telefone}\` })`. Retry (fila do bot) reaproveita a mesma referência automaticamente; **não** há botão de reenvio manual. Resposta `reagendado:true` conta como "vai sair depois", não erro.
  6. `dry:true` devolve o texto e os destinatários sem enviar.
- **Scheduler** (`workers/scheduler.js`): segunda-feira 07:30 (molde `scheduleCertAlerta`, mas calculando a próxima segunda), isolado em `.catch`.
- **Rotas admin-exec** (header `x-admin-secret`): `GET /api/admin-exec/indicadores-alerta-semanal?dry=1` (prévia, não envia) e `.../indicadores-alerta-semanal?enviar=1` (força). **Ligar/desligar**: `POST /api/admin-exec/indicadores-alerta-semanal-config {ativo}` — sem tela nova nesta etapa; o dono pede e a gente liga.
- **Aceite:** `dry=1` mostra texto com ≤ 3 itens, sem nome de cliente, < 2000 caracteres; desligado → nenhuma linha nova em `bot_whatsapp_envios`; ligado e forçado para 1 admin → 1 linha `tipo=interno`, `origem=indicadores-semanal`, referência com a segunda-feira; chamar de novo na mesma semana → `DUPLICADO`/"já enviado"; usuário não-admin com telefone **não** recebe.
- **Riscos:** vazar dado financeiro para quem não é admin (filtro `admin === true` idêntico ao certificado); backend local disparando mensagem (trava de ambiente + sem credenciais do bot no local); duplicar por dois processos (dedupe por semana + referência idempotente do bot).

---

## 6. Ordem de execução (backend e frontend em paralelo)

**dev-backend**
1. **B1** Schema: `OrdemProducao` (colunas B.1 + `@@index([dataFim])`) e `IndicadorMeta` (A.1). `node -e` / `npx prisma validate` + `prisma generate` local. (Nada de remover campo.)
2. **B2** `ordemCustoService.js` (B.2) com teste local por script (ordem fictícia no `hardt_local`).
3. **B3** Pendurar em `pcpOrdemService.finalizar` e `criar` (B.3-1/2) — **diff mínimo, só acréscimo**.
4. **B4** Scheduler `apurarPendentes` + rotas admin `diag-indicadores-ordens` / `indicadores-backfill-ordens` (B.3-3/4).
5. **B5** `indicadoresMetasService.js` (catálogo, `avaliar`, `salvarLote`, `sugerirPelaMedia`) + rotas `GET/PUT /metas`, `GET /metas/sugestao` (A.4).
6. **B6** `indicadoresGestaoService`: `semaforo(..., meta)`, `resumo` (metas + `deltaMedia3mPt`/`meta`), `insumosSemanal.kpi`, `producao()` real (B.4) e `alertas` (B.5); router passa `completo` a `producao`.
7. **B7** Bloco C no `clientesTodos`.
8. **B8** Manuais (seção 7). **B9** (opcional, por último) Bloco D.
9. Teste local por `curl` de **todos** os endpoints novos e de regressão dos antigos (`/resumo`, `/producao`, `/alertas`, `/clientes`) com e sem meta; `node --check` em cada arquivo; validar `select` do Prisma contra o schema (armadilha registrada: campo inexistente passa no `node --check`).

**dev-frontend** (a partir do contrato acima, com mock DEV)
1. **F-3** apagar `kpiInsumosDerivado` e usar `insumos.dados.kpi`.
2. **F-5/F-6** `ProducaoEstoque.jsx`, `guia.js`.
3. **F-4** `KpiCard.jsx` (selo "meta X" + delta vs média).
4. **F-1/F-2** `MetasModal.jsx`, botão `Target` no `PageHeader`, `salvarMetas`, mock.
5. **F-7** `TabelaClientes.jsx` (paradas).
6. `cd frontend && npm run build` **antes de entregar**. Conferir em 375 px.

**Depois:** `qa-testador` (clicando, local) + `revisor-codigo` em paralelo → `gerente-entrega`. Publicar **backend antes do frontend**. Em produção: rodar `diag-indicadores-ordens`, `backfill dry=1`, backfill, conferência da gerente com 3 ordens, só então anúncio.

---

## 7. Manual do Clippy, novidade e docs (checklist final)

- `backend/manuais/abas/indicadores-gestao.md`: seção **Metas** (quem edita, os 7 indicadores, como funcionam atenção/agir com exemplo MC 35%, "sugerir pela média", remover meta, histórico), seção **Produção e estoque** (perda **além da ficha** x perda normal já no custo; custo real × padrão; rendimento do lote; ressalva de que o consumo real hoje costuma igualar o previsto; selo "estimado" do backfill), seção **Clientes** (paradas em vez de pedidos; continua estimado), seção **Alerta semanal** só se o bloco D for entregue (e que nasce desligado).
- `backend/manuais/abas/pcp-ordens.md` e `pcp-painel.md`: ao **finalizar** a ordem o sistema calcula e guarda o custo dos insumos, o rendimento e a perda; **para a perda ser confiável, informar a quantidade produzida real** e, se possível, apontar o consumo real; planejar a quantidade que de fato espera produzir.
- `backend/manuais/abas/README.md`: sem linha nova (não há tela nova). `copilotoService.js` `ABAS`: **sem mudança** (mesma rota e permissões).
- **Novidade**: `frontend/public/novidade-indicadores-metas.html` (espelho de `novidade-tarefas.html`; accordions já abertos; mockups HTML/CSS com legendas numeradas das telas: Metas, cartão com "meta 35%", bloco Produção com perda real; OG sem `og:image`; **sem** botão "Abrir o app") + entrada no **topo** de `frontend/public/novidades.json` (`{ slug:'indicadores-metas', titulo, resumo, data }`). **Só publicar depois de dados reais conferidos** (nunca número de teste/local nos mocks nem nos manuais). Entregar ao dono o link e o texto pronto para o grupo.
- Avisar o dono, no fim, o que foi atualizado no manual/Clippy.

---

## 8. O que NÃO fazer (armadilhas desta etapa)
- **Não** colocar a apuração de custo dentro da `$transaction` de `finalizar`, nem dar `await` nela, nem deixar o erro dela subir. **Não** alterar baixa de consumo, entrada do PA nem o bridge de estoque.
- **Não** finalizar ordem em produção para "testar": mexe em estoque real. Testar local; em produção só pelas rotas de diagnóstico/backfill e pelas ordens reais.
- **Não** remover/renomear coluna ou campo de contrato; `semaforo.status/palavra/base`, `perdas.*` existentes, `entregas` e `custoEntregaOrigem` ficam como estão — só adicionar.
- **Não** calcular semáforo/meta no front (nem manter `kpiInsumosDerivado`); o servidor decide, o front só desenha.
- **Não** dar a produção-only meta ou valor de MC/Resultado, nem `pctCpv`; filtrar no servidor.
- **Não** contar a perda normal da ficha como perda (já está no CPV). **Não** inventar número quando o dado falta (`null` + "sem base"/"sem ordens").
- **Não** usar `isClark` em permissão; **não** `React.lazy`, `<select>` nativo (usar `SelectBusca`), `window.open`, `grid-cols-4` sem `md:`.
- **Não** mandar WhatsApp para cliente, vendedor comum ou lista; **não** reenvio manual com referência nova no bloco D; **não** chamar o bot a partir do ambiente local.
- **Não** usar `not`/`notIn` do Prisma em campo anulável sem `OR` explícito; **não** esquecer `Number()` nos `Decimal`.
- Antes de commitar: `cd frontend && npm run build`; `node --check` nos arquivos do backend; revisor roda o grep de consumidores citado em B.9 e confirma que `/api/ia-consulta/v1` não foi tocado.

---

## 9. Critérios de aceite globais (resumo para o gerente-entrega)
1. Tela sem nenhuma meta cadastrada = idêntica à Etapa 2 (regressão zero), e finalizar ordem continua funcionando mesmo com a apuração quebrada.
2. Meta MC 35%: 33% → atenção, 28% → agir; remover meta volta para média de 3 meses.
3. Finalizar ordem local preenche os campos de custo/perda em segundos; duplo clique não duplica.
4. Bloco "Produção e estoque" mostra números reais (ou "sem ordens no período"), nunca "próxima fase".
5. Produção-only: nenhuma informação financeira nova; `pctCpv` null; metas só de produção.
6. Clientes: paradas no lugar de pedidos, com selo "estimado".
7. Manuais atualizados; `npm run build` verde; evidência (curl/SQL/captura) anexada pelos testadores.

**Porte sugerido: GRANDE** (A+B obrigatórios ≈ 1 noite com dois devs; C pequeno; D só se sobrar tempo).
