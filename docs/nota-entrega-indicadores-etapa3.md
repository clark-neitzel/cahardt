# Nota de entrega — Indicadores de Gestão, Etapa 3 + Rodada 2 (ajustes de dados)

Data: 07/10/2026 (madrugada) · Veredito do gerente de entrega: **LIBERADO COM PENDÊNCIA**
(pode publicar; o que só se prova em produção e o que depende de você está em "O que você precisa decidir/fazer" e "O que fica pendente").

---

## O que mudou (para quem usa)

**1. Metas nos Indicadores (botão alvo no topo, só administrador)**
- Você define a meta de cada indicador: margem de contribuição, resultado operacional, variação do custo dos insumos, perda além da ficha, rendimento do lote, custo real acima do padrão e dias de estoque de produto acabado. Para cada um: a meta, "atenção acima de" e "agir acima de" (em pontos percentuais ou dias).
- Com meta cadastrada, **o semáforo passa a seguir a meta** ("vs meta 35%") e o cartão mostra a diferença para a meta e para a média de 3 meses. Sem meta, tudo continua como antes (média dos 3 períodos anteriores).
- Botão "Sugerir pela média" preenche com a média dos 3 meses fechados — só sugere, não grava. Quem não é administrador vê a meta e o semáforo, mas não edita; a gerente de produção só vê as metas de produção.
- Cada alteração vira uma versão nova (o histórico fica guardado); a meta nova vale na hora.

**2. Produção por ordem (bloco "Produção e estoque")**
- Ao **finalizar uma ordem no PCP**, o sistema calcula e guarda na própria ordem: custo dos insumos (previsto × realmente baixado), custo por unidade, rendimento (produzido ÷ planejado) e a **perda além do que a ficha já prevê**, em quantidade e em R$. Isso roda em segundo plano, depois da finalização — se falhar, a ordem continua finalizada e uma rotina de 30 em 30 minutos refaz.
- O bloco deixou de mostrar "disponível na próxima fase": agora traz perda no período (R$ e % do consumo), custo real × padrão, rendimento do lote (e o que a ficha prevê), gráfico de 8 semanas, e avisos quando há ordens estimadas ou com insumo sem preço. Sem ordem finalizada no período, escreve isso — não inventa número.
- Alertas novos em "Onde agir primeiro" **só quando há meta**: "Perda de produção acima da meta" e "Custo real de produção acima do padrão".

**3. Custo de referência (tela Margem & Custo dos Produtos)**
- Produto **sem ficha técnica** pode usar a ficha de **outro produto fabricado × um fator** (ex.: 2-FR-G-COXINHA usa a ficha do 1-G-COXINHA; H22 de 2 kg usa a ficha do 4-MINI de 1,5 kg com fator 1,333). Abre o produto na tela, aparece "Custo de referência": escolhe o produto com ficha, o fator e Salvar. Para desfazer, "Remover referência".
- O produto passa a ter custo nas duas telas (Margem & Custo e Indicadores) com o selo **"ficha de referência"**. Travas: só para produto sem ficha própria, produto de revenda não aceita, não pode referenciar a si mesmo nem um produto sem ficha vigente.

**4. Custo de entrega por parada (tabela de clientes dos Indicadores)**
- As despesas de "Veículos e entregas" agora são divididas pelas **paradas** (um cliente numa saída/embarque, mesmo com vários pedidos na mesma carga), não mais por pedido. Pedido de retirada/balcão não recebe custo de entrega. Se o período tiver poucos embarques marcados no app, volta a dividir por pedido e a tela diz qual método usou. Continua sendo estimativa, com selo.

**5. Ajustes de dados (rota administrativa, não é tela)** — correções apontadas na análise de setembro, que eu rodo em produção depois do deploy:
- `compra-estoque`: marca "Compra de estoque" em Matéria Prima, Embalagens e Materiais para Revenda (tira a dupla contagem da matéria-prima).
- `agua`: a compra de água mineral que estava ligada ao insumo "Água" (torneira) vai para o produto "Agua Mineral s/gás"; recalcula os custos.
- `milheiro`: corrige os itens em milheiro (EMB-003, 000083, 118-001, EMB-002: unidade UN, custo ÷ 1000, estoque × 1000 onde cabe). Nenhuma quantidade de ficha muda.
- `referencias`: aplica sozinho só os pares de referência **exatos** (nome igual); os prováveis ficam para você decidir.
- `reestimar-snapshots`: regrava o custo congelado dos itens **estimados** (nunca os reais) com os custos corrigidos. Não apaga custo que já existia.
- Tudo com modo de conferência (`dry=1`, padrão): mostra antes/depois sem gravar nada.

**6. Manuais do Clippy** atualizados: Indicadores de Gestão (metas, produção por ordem, parada), Margem & Custo (custo de referência), PCP Ordens e PCP Painel (o que a finalização passa a calcular e como preencher para a perda ser confiável). Página de novidade criada e registrada (o Clippy vai balançar após o deploy).

---

## O que foi testado e por quem

**Dev-backend (com saída de comando):** finalização de ordem intocada (gancho fora da transação, sem `await`, nunca lança); metas com validação, 403 e escopo; DRE idêntica antes/depois; cobertura de embarque de 98,7% nos pedidos (por isso o rateio por parada vale); na **cópia** de produção o resultado de setembro saiu de -35,2% para -2,6% só com os ajustes de dados.

**Revisor backend:** aprovado com 6 correções, todas aplicadas (milheiro lê o estoque dentro da transação e corrige o vínculo do fornecedor; água move todas as compras e recalcula; referências só com tamanho explícito no nome; reestimar não apaga custo existente; meta vazia dá erro 400; revenda não aceita referência). **Revisor frontend:** aprovado com 3 correções, aplicadas.

**QA (clicando, app local):** PASSOU — ordem real finalizada pela tela com os campos gravados em segundos, metas, permissões, celular, regressão das telas vizinhas.

**Gerente de entrega (eu, por conta própria, 06→07/10 de madrugada):**
- `git status`: só os arquivos da entrega (lista exata abaixo). `cd frontend && npm run build` → ✓ built in 5.42s. `node --check` nos 12 arquivos JS do backend → todos OK. `npx prisma validate` → válido. Schema **só aditivo** (2 colunas em `produtos`, 12 em `ordens_producao` + índice em `data_fim`, tabela nova `indicadores_metas`); nenhuma linha removida. `deployMarker` = `indicadores-etapa3-2026-10-07`.
- Novidade: JSON válido com a entrada no topo; HTML sem `og:image`, sem "Abrir o app", 4 accordions já abertos, mockups com legendas numeradas; nenhum número real (nem de produção nem do banco local) na novidade nem nos 4 manuais. Nenhum segredo no diff.
- Backend local no ar e provado com `curl`: `/metas` sem token → 401; sem permissão → 403; **só-produção → 200 com apenas os 5 indicadores de produção e `podeEditar:false`** (nada de margem/resultado); completo não-admin → lê tudo mas `PUT` → 403; admin: alvo vazio → 400, tolerância invertida → 400, alvo 150 → 400, válido → 200 gravando versão nova (duas edições = 2 linhas, só a última vigente); `/metas/sugestao` → 403 para não-admin. `/producao` com token só-produção **sem `pctCpv`** (null), com admin traz tudo; com meta de perda 1% e perda de 6% nas ordens do QA → semáforo "agir" e alerta "Perda de produção acima da meta" só na visão produção. `/insumos-semanal` traz o KPI do servidor. `/clientes` traz `paradas` e o método. `/financeiro-gerencial/dre` → 200. `diag-indicadores-ordens` e `indicadores-backfill-ordens?dry=1` respondem.
- **Rota de ajustes:** sem o segredo → 401; passo inválido → 400 com a lista válida; `POST` padrão (dry) → 200 com os 5 passos e antes/depois; **impressão digital do banco** (categorias, itens PCP, compras, produtos, custo congelado, vínculos + contagem de `movimentacoes_pcp` = 57) **idêntica antes e depois** → nada gravado. Repetido com `passos=milheiro` → idem.
- **Custo de referência:** revenda → 400; auto-referência → 400; referência sem ficha → 400; produto com ficha própria → 400; fator 0 → 400; sem permissão → 403; válido com fator "1,333" → 200, detalhe e listagem com `FICHA_REF`, e o custo aparece nos Indicadores como FABRICADO/`FICHA_REF`; remover → volta a null.
- **Tela Margem & Custo no Chrome (puppeteer):** como admin, produto sem custo abre com o controle "Custo de referência"; escolhi o produto com ficha no menu, fator 1,333, Salvar → toast "Custo de referência salvo.", linha ganha o selo **"ficha de referência"** com custo e margem; ao reabrir mostra "Hoje usa a ficha de … × 1,333"; "Remover referência" → toast e a linha volta a "sem custo". Em 375 px o controle empilha, botões de 44 px, **sem rolagem lateral** (largura 375/375) e sem erro de console. Capturas em 1280 e 375 no scratchpad da sessão.
- Dados de teste do banco local restaurados (usuário temporário apagado, metas encerradas, referência removida, produto de revenda de teste revertido).

---

## O que EU (gerente de projeto) vou rodar em produção depois do deploy

1. Publicar **backend antes do frontend**; conferir `GET /api/admin-exec/ping` → `deployMarker = indicadores-etapa3-2026-10-07`.
2. `GET /api/admin-exec/diag-indicadores-ordens` (rota nova no ar, não 404) e `GET /api/admin-exec/indicadores-backfill-ordens?dry=1` — na produção deve vir **vazio** (não há ordens finalizadas antigas com quantidade produzida sem apuração; se vier algo, leio a amostra antes de gravar).
3. Ajustes de dados, **fora do pico**, um passo por vez, sempre `dry=1` primeiro e, batendo com a análise, `dry=0`, nesta ordem:
   `compra-estoque` → `agua` → `milheiro` → `referencias` → `reestimar-snapshots`
   (`POST /api/admin-exec/indicadores-ajustes-dados?passos=<passo>&dry=1` e depois `dry=0`). Guardo a resposta de cada um.
4. `GET /api/admin-exec/diag-indicadores-snapshot` de novo e abro a tela: a cascata de setembro deve ficar perto do que a cópia mostrou (resultado de -35% para perto de -3%).
5. Finalizar/aguardar a próxima ordem real e conferir no diag que ela foi apurada; publicar de novo e confirmar que continua (regra do projeto: gravação só é "pronta" atravessando um deploy).

---

## O que VOCÊ precisa decidir ou fazer

1. **13 pares de referência "prováveis"** (nome parecido, não idêntico — inclui os "-HF", que supõem mini do mesmo tamanho): eu te mando a lista que a rota devolver em `paraODono`; você confirma quais aplicar e com qual fator (na tela Margem & Custo, em cada produto).
2. **Fichas técnicas das tortinhas e da empada de palmito** (não têm irmão com ficha; continuam "sem custo" até ganharem ficha em PCP → Receitas).
3. **Antecipação de Lucros → "Fora do resultado"** (retirada de sócio não é despesa) — confirmar com o contador; empréstimos e parcelamento do Simples (separar juros de principal) vêm depois.
4. **Copa e Cozinha**: ~73% é ingrediente; mover para Matéria Prima na nota/conta.
5. **Estoque de combustível e gás** (diesel, gasolina, GLP só entram, nunca saem): desligar o controle de estoque desses produtos ou lançar a saída por consumo.
6. **EMB-003 (etiqueta couché 40×40)**: fazer a contagem física e lançar em unidades (a correção do milheiro acerta unidade e custo, não sabe quantas existem de verdade).
7. **Caldo de carne sem preço**: dar entrada/preço do insumo, senão as ordens que o usam ficam com "insumo sem preço".
8. **Gerente de produção valida 3 ordens reais** (planejada, produzida, perda calculada) antes de você usar o número — era condição do plano. **Atenção:** a novidade já está registrada no `novidades.json`; ao publicar o frontend, o Clippy avisa a equipe. Se preferir que a gerente valide antes, me diga e eu tiro a entrada do JSON deste commit (a página fica no ar, mas sem aviso) e registro depois.
9. **Metas na mão**: a sugestão pela média usa meses em que a matéria-prima ainda estava contada em dobro (a média sai ruim). Depois dos ajustes, defina as metas digitando (ex.: MC 35 com agir a partir de 5).

**Como conferir em 1 minuto:** Indicadores → botão alvo → ponha meta de margem 35 → Salvar → o cartão "Margem de contribuição" muda para "vs meta 35%". Depois Financeiro → Margem & Custo → "Todos" → abra um produto "sem custo": tem que aparecer "Custo de referência".

---

## O que fica pendente / limitações

- **Custo real × padrão repete a perda** enquanto o consumo real dos ingredientes não for apontado na ordem (o painel preenche o real com o previsto). O sinal confiável hoje é o **rendimento** (produzido ÷ planejado). Manual e guia da tela dizem isso.
- **`reestimar-snapshots` deixa tudo como "estimado"**: as vendas antigas continuam com selo de estimativa; só vendas faturadas de agora em diante têm custo "real".
- **Bloco D (alerta semanal no WhatsApp) não foi feito** — era opcional no plano; fica para outra etapa, nascendo desligado.
- Custo de entrega continua **estimado** (só mudou o denominador para paradas; não há custo por km/veículo).
- Tudo que grava em produção (ajustes, backfill, apuração de ordem) só se prova **lá**, depois do deploy — roteiro acima.
- iPad real não foi testado (QA e eu usamos o Chrome simulando 375 px).

---

## Arquivos para o `git add` (lista exata — nada além destes)

Modificados:
```
backend/manuais/abas/indicadores-gestao.md
backend/manuais/abas/margem-produtos.md
backend/manuais/abas/pcp-ordens.md
backend/manuais/abas/pcp-painel.md
backend/prisma/schema.prisma
backend/routes/adminExec.js
backend/routes/indicadoresGestao.js
backend/routes/produtoMargem.js
backend/services/custoSnapshotService.js
backend/services/indicadoresCustoService.js
backend/services/indicadoresGestaoService.js
backend/services/pcpOrdemService.js
backend/services/produtoMargemService.js
backend/workers/scheduler.js
frontend/public/novidades.json
frontend/src/pages/Dashboard/IndicadoresGestao.jsx
frontend/src/pages/Dashboard/indicadores/BarrasPerda.jsx
frontend/src/pages/Dashboard/indicadores/KpiCard.jsx
frontend/src/pages/Dashboard/indicadores/ProducaoEstoque.jsx
frontend/src/pages/Dashboard/indicadores/TabelaClientes.jsx
frontend/src/pages/Dashboard/indicadores/TabelaProdutos.jsx
frontend/src/pages/Dashboard/indicadores/guia.js
frontend/src/pages/Produtos/ProdutosMargemCusto.jsx
frontend/src/services/indicadoresGestaoApi.js
frontend/src/services/indicadoresGestaoMock.js
```
Novos:
```
backend/services/indicadoresAjustesService.js
backend/services/indicadoresMetasService.js
backend/services/ordemCustoService.js
frontend/public/novidade-indicadores-metas.html
frontend/src/pages/Dashboard/indicadores/MetasModal.jsx
docs/analise-setembro-2026.md
docs/plano-indicadores-etapa3.md
docs/nota-entrega-indicadores-etapa3.md
```
**NÃO adicionar** (sobras de outras sessões): `skills/`, `docs/proposta-central-cobranca.html`, `docs/proposta-layout-mapa-entregas.html`, `docs/qr-site-congelados.jpg`. O `stash@{0}: autostash` antigo continua lá e pode ser descartado quando convier.

---

## Texto pronto para o grupo do WhatsApp

🎯 *Novidade no app: metas nos Indicadores de Gestão*

Agora dá para definir a meta de cada indicador (margem, resultado, perda, rendimento…) e o semáforo passa a seguir a meta.

🏭 Ao finalizar uma ordem no PCP, o sistema já calcula o custo, o rendimento e a perda daquela ordem — por isso é importante informar a *quantidade produzida real* ao finalizar.

🔗 Produto sem ficha pode usar a ficha de outro produto como referência de custo (tela Margem & Custo).

Veja como funciona, com as telas explicadas:
https://cahardt-github.xrqvlq.easypanel.host/novidade-indicadores-metas.html

Para começar: toque em ↻ para atualizar o app. Dúvida? Pergunte ao Clippy.
