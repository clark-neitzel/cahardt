# Plano de construção — Painel Carteira, ETAPA 1 (arquiteto, 11/11/2026)

Caminhos relativos à raiz do repo; `backend/...` e `frontend/src/...` por extenso. "não confirmado" = não verificado no código/banco.
STATUS: plano. Nada implementado. Parte de `docs/plano-fila-resgate-ana.md` (Revisões 5 a 8) e do protótipo `docs/painel-carteira-proposta.html`.

## 0. MUDANÇA DE ESCOPO (dono, 11/11): o painel SUBSTITUI a aba "Recorrência" do Dashboard Gerencial
Não há tela nova nem item novo de menu. Nome da aba proposto: **"Carteira"** (ícone `Users`, já importado; chave `carteira`).

### 0.1 Onde está hoje (confirmado)
| Peça | Local |
|---|---|
| Página (6 abas, Gestão vê `DashboardGeral` na home `/`) | `frontend/src/pages/Dashboard/DashboardGeral.jsx` (691 linhas); `DashboardHome.jsx:10,20` |
| Lista de abas / chave `recorrencia` | `DashboardGeral.jsx:24-30` (`ABAS`), sets `ABAS_COM_CATEGORIA`/`ABAS_COM_MES` em `:35-37` |
| Render da aba | `DashboardGeral.jsx:206-209` (com aviso "não muda por mês") e componente `AbaRecorrencia` `:427-522` |
| Busca de dados | `buscarAba` `DashboardGeral.jsx:84-100`: `GET /dashboards/geral/<chave>` (chave = nome da aba) |
| Rota backend atual | `backend/routes/dashboards.js:528-641` (`GET /geral/recorrencia`), montada em `/api/dashboards` (`backend/index.js:208`) |
| Permissão backend | `checkGestor` `backend/routes/dashboards.js:76-87`: `admin || Pode_Ver_Dashboard_Admin || isClark` |
| Permissão frontend (espelho) | `frontend/src/hooks/usePerfil.js:23-27` (`gestor`): mesmo trio. Já espelha. |
| Referências à aba por nome | `DashboardGeral.jsx:280` (link "ver Recorrência →" na Visão Geral), `:557` (texto na aba Atendimentos "cruze com a aba Recorrência") |
| Consumidores externos da rota `/geral/recorrencia` | grep em `frontend/src`: nenhum fora do `DashboardGeral.jsx` (a chamada é dinâmica pelo nome da aba). Manual: `backend/manuais/abas/dashboard.md` |

### 0.2 Permissão
**Sem permissão nova.** O Dashboard Gerencial já tem `Pode_Ver_Dashboard_Admin` (+ admin + Clark), checada igual nos dois lados. Quem vê a aba hoje é quem verá a Carteira; criar `Pode_Ver_Carteira` fragmentaria o acesso (aba dentro de uma tela que já exige gestor). Os endpoints de gravação "Já sei" usam o MESMO `checkGestor` (extrair para export reutilizável ou duplicar a função em `dashboards.js` — ver tarefa BK-2). Se o dono quiser depois que vendedor veja a própria carteira (T3 da Revisão 6), aí cria-se permissão. `BOOL_INDEX` (`PermissoesModal.jsx:252`) NÃO muda.

### 0.3 Semana/Mês × seletor de mês do dashboard
- Hoje o cabeçalho mostra navegador de mês + seletor de categoria em TODA aba exceto IA (`DashboardGeral.jsx:152-175`), mas a recorrência ignora o mês (`ABAS_COM_MES` não a inclui).
- **Decisão:** na aba Carteira o navegador de mês e o seletor de categoria ficam ESCONDIDOS (adicionar `carteira` a um set `ABAS_SEM_FILTRO_CABECALHO`), e o subtítulo vira "foto de hoje · dd/mm". O controle **Semana | Mês** da aba é independente e ancorado em HOJE: Semana = semana corrente (seg a dom, America/Sao_Paulo) até hoje × a anterior até o mesmo dia da semana; Mês = mês corrente do dia 1 até hoje × mês anterior do dia 1 até o mesmo dia do mês. Nunca usa a variável `mes` do cabeçalho. O banner "vendo <mês> (mês fechado)" (`:177-184`) não aparece nesta aba.
- Motivo: misturar os dois seletores geraria duas respostas para "qual período?". Quem quer um mês fechado usa Vendas & Pedidos (continua com o seletor).
- Persistir só a escolha Semana/Mês, vendedor e lista curta/completa via `useFiltrosSalvos('dashboard-geral', {...})` (campos novos `carteiraPeriodo`, `carteiraVendedor`, `carteiraLista`; objeto salvo é mesclado). `filtros.aba` salvo como `'recorrencia'` por usuários hoje: o código `:61` já cai para `visao` se a chave não existir; acrescentar mapeamento `recorrencia → carteira` para não perder o hábito.

### 0.4 Sobreposição com Atendimentos e Vendas & Pedidos (confirmado no código)
| Bloco do protótipo | Já existe? | Decisão |
|---|---|---|
| Gráfico das últimas semanas | SIM: Vendas & Pedidos, "Vendas por semana" (`serieSemanal`, 12 semanas, líquido de devolução; `dashboards.js:310+`, `DashboardGeral.jsx:337`) | NÃO duplicar. No modo Semana: link "Série semanal em Vendas & Pedidos →". No modo Mês: barras dos últimos 6 meses (isso não existe em lugar nenhum) |
| Projeção do mês × meta (geral e por vendedor) | SIM: Visão Geral (gauge, projeção, `:228-260`) e Vendas (tabela "Vendedores × meta", `:344-392`), ambas via `projecaoVendasService` | NÃO construir o bloco "Para onde o mês está indo". Só UMA frase no resumo do topo ("projeção R$ X, Y% da meta") + link "detalhe em Vendas & Pedidos →". Fonte: `projecoesMes(mes)` (`projecaoVendasService.js:155`) |
| O que a equipe fez (pedidos + registros por tipo) | SIM, quase todo: Atendimentos (`porTipo`, `porVendedor` com conversão e retornos vencidos, `dashboards.js:646-700`) e Vendas (R$ por vendedor) | NÃO duplicar. Fora do painel; atalho "Ver Atendimentos →". Só uma linha por vendedor DENTRO da tabela "Carteira por vendedor": registros sem pedido (WhatsApp / presencial / sem visita) do período, porque é o contexto da lista de clientes parados |
| Motivos por palavra-chave | PARCIAL: Atendimentos tem "Por que não vendeu" por `acaoLabel` (`:679`), estruturado | NÃO duplicar na etapa 1. Atalho para Atendimentos. A leitura por palavra-chave da observação (88 "semana que vem", 45 "não precisa"...) fica como melhoria futura DENTRO da aba Atendimentos (follow-up) |
| Seis números comparados (R$, clientes que compraram, ticket, novos, voltaram, pararam) | Parcial: Visão Geral tem vendas/ticket/pedidos do mês; "novos" e "reativados" na Recorrência atual | CONSTRUIR (comparação e "pararam" são novos) |
| Carteira por vendedor, clientes que pedem atenção, 20 maiores, quem caiu/subiu, por tipo de cliente, por grupo de produto, Já sei, decisões | NÃO existem (Vendas tem produtos em queda e cidades, não clientes/tipos/grupos) | CONSTRUIR |
| Resumo do topo | não existe | CONSTRUIR (template) |

### 0.5 O que a aba Recorrência atual tem e o painel precisa manter (nada se perde em silêncio)
| Item atual (`DashboardGeral.jsx` / `dashboards.js`) | Destino na Carteira |
|---|---|
| Funil No prazo / Atenção / Atrasado / Crítico (`:431-436`) | Substituído pelos buckets da Carteira por vendedor (no ritmo, atraso leve, parado Ana, parado visita, inativar). NÃO manter os 4 degraus (a régua deles é a defeituosa: ciclo 7, conta cancelado). Registrar no manual que a leitura mudou |
| "N clientes em atrasado+crítico compravam R$ X/mês" (`:437-440`) | MANTER como `valorEmRiscoMes` (soma do ticket médio × frequência dos buckets parado + atenção), recalculado com o ritmo real |
| Tabela "Clientes críticos — agir primeiro" (15, ordenados por venda em risco, link para cliente) (`:442-499`) | Vira "Clientes que pedem atenção" (mesma ordenação por valor em risco, lista curta 5 / completa), com link `/clientes/:id` |
| "Sinais de enfraquecimento" (ticket caiu ≥15% + produto que sumiu, 8 itens) (`:501-514`) | MANTER como aba "Enfraquecendo" dentro de "pedem atenção" (campo `enfraquecendo[]`), sem reescrever a regra de ticket (usa `variacaoTicketPct` e `produtoAusenteId` do insight; ver risco R6) |
| "Movimento da carteira": novos, reativados, sem compra +90d, 1ª compra sem recompra (`:515-521`) | MANTER: novos/voltaram entram nos 6 números; **"sem compra +90d" e "1ª compra sem recompra" mantidos num cartão pequeno "Movimento da carteira"** (campo `movimento`) |
| "Carteira ativa acompanhada: N clientes" | MANTER (`carteira.totalAtivos`) |
| Texto/atalhos: Visão Geral `:280` e Atendimentos `:557` mencionam "Recorrência" | Trocar por "Carteira" (BK/FE) |
| Rota `GET /geral/recorrencia` | NÃO remover agora (contrato com quem tenha a aba aberta durante o deploy; `lazyComRetry` só cobre JS). Fica sem uso; remover numa etapa futura |
| Alerta da Visão Geral `alertas.recompraCritica` (`dashboards.js` visao-geral, `ItemAlerta` em `DashboardGeral.jsx:~275`) | Continua com a régua antiga (ainda mostra Renato como crítico). Etapa 1 NÃO mexe; só o link passa a abrir a aba Carteira. Registrar como pendência para o dono (ver §9) |

## 1. Entendimento do pedido
Construir o Painel Carteira como a aba "Carteira" do Dashboard Gerencial, calculado só por regra (sem IA), com ritmo real do cliente, cadastros do mesmo cliente unidos, cadastro inativo que compra enxergado, alerta dos 20 maiores, e o botão "Já sei" (vínculo + silêncio). Mais E0 (desligar IA noturna 23:30 e tirar a análise de IA dos cards da Rota). Interpretação adotada: "Suas decisões" mostra só o que existe sem o bot (grande com pedido faltando, parece o mesmo cliente, sem vendedor, para inativar).

## 2. Mapa do código atual (réguas a reaproveitar)
| Régua | Fonte | Observação |
|---|---|---|
| Venda = faturado/especial, sem bonificação | `WHERE_PEDIDO_RECEITA` `backend/services/projecaoVendasService.js:21-27` (exportado `:248`) | base de R$ |
| Devolução ativa desconta no dia registrado | `devolucoesPorVendedorDia` `projecaoVendasService.js:41-62`; mesma regra em `dashboards.js:310+` | reaproveitar a regra; a Carteira precisa também por CLIENTE, então query própria (devolucao → `pedidoOriginal.clienteId`) |
| Projeção do mês | `projecoesMes(mesReferencia)` `projecaoVendasService.js:155-231` → Map(vendedorId → `{valorProjetado,totalVendidoMes,...}`) | só para a frase do resumo |
| Meta | `MetaMensalVendedor.valorMensal` (`schema.prisma:2260-2267`) | soma por mês |
| Semana seg-dom / fuso SP | helpers locais `isoNowTZ`, `inicioDiaSP`, `fimDiaSP`, `somaDiasISO`, `segundaDaSemana` em `dashboards.js:35-58` (NÃO exportados) | extrair para `backend/utils/dataSP.js` (mover sem mudar comportamento) e fazer `dashboards.js` importar de lá; ou copiar. Preferência: extrair (boy scout, risco baixo) |
| Ciclo do cadastro | `clienteInsightService.js:21-30`: personalizado > `categoriaCliente.cicloPadraoDias` > 7 | reaproveitar a mesma precedência |
| Insight conta cancelado | `clienteInsightService.js:36-43` filtra `statusEnvio in (ENVIAR,RECEBIDO)`, SEM `cancelado=false`, e usa `createdAt` | confirmado; por isso o painel NÃO lê `diasSemComprar`/`statusRecompra` do insight |
| Pausa de visita | `ClientePausa` `schema.prisma:292-301`; `FILTRO_NAO_PAUSADO` `atendimentoService.js:136` (não confirmado se exportado) | ler `pausadoAte > now` direto |
| Cliente sem tipo/vendedor/dia de venda | `Cliente.categoriaClienteId`, `idVendedor`, `Dia_de_venda` (`schema.prisma:203,217,235`) | |
| Grupo de produto | `Produto.categoria` (String, `schema.prisma:~33`) — mesmo campo do filtro de categoria do dashboard | "9 grupos" do dono = categoria comercial; **não confirmado** que o campo certo é `categoria` e não outro; dev-backend confere no banco |
| Atendimento | `Atendimento` `schema.prisma:1549-1597` (`tipo`, `acaoKey`, `acaoLabel`, `pedidoId`, `clienteId`, `idVendedor`, `criadoEm`); tipos de UI em `ModalAtendimento.jsx:19` (`ATENDIDO_SEM_PEDIDO`...) e agrupamento de tipo `atendimentoService.js:39` (`WHATSAPP`). Mapeamento exato "WhatsApp / presencial / sem visita" não confirmado: dev-backend lê os valores reais de `tipo`/`acaoKey` no banco antes de codar |
| Inadimplência em lote | `inadimplenciaService.clienteIdsEmAtraso` `:367` | NÃO usar na etapa 1 (só serviria para o resgate) |

## 3. Definições de cálculo (sem ambiguidade)
Fuso: tudo em America/Sao_Paulo. Datas de pedido = `dataVenda` (a mesma do dashboard/comissão), nunca `createdAt` (diferença com o insight, confirmada acima; documentar).
| Termo | Definição |
|---|---|
| **Pedido válido** | `WHERE_PEDIDO_RECEITA` (`bonificacao=false` e (`situacaoCA='FATURADO'` ou `especial=true`)) **E `cancelado=false`**. Se `WHERE_PEDIDO_RECEITA` já exclui cancelado, o filtro extra é inofensivo (não confirmado; manter de qualquer forma). Pedido na fila/aberto/ERRO não conta |
| **Valor do pedido** | soma `quantidade*valor` dos itens (+ `flexTotal`? NÃO: usar só itens, igual `valorItens` `projecaoVendasService.js:35`) menos devoluções ativas do pedido |
| **Cliente (unido)** | cadastros ligados por `cliente_mesmo_que` formam UMA entidade: id canônico = o "atual". Histórico, ritmo, ticket, último pedido, tipo, vendedor e dia de venda vêm do cadastro atual; pedidos de todos os cadastros do grupo valem. Cadastro INATIVO entra no cálculo de vendas e de ritmo (só não aparece como linha própria se foi unido) |
| **Ritmo (dias)** | `max(ciclo do cadastro, mediana?)`: usar **média dos intervalos (dias) entre os últimos 6 pedidos válidos** (precisa ≥3 pedidos; senão cai no ciclo do cadastro) e `ritmo = max(cicloCadastro, intervaloMédio)`. Decisão da Revisão 5 (maior entre os dois). Arredondar para 1 casa. Dias entre pedidos contados no mesmo dia = 0 (pedidos no mesmo dia colapsam em 1 para o cálculo de intervalo) |
| **Dias sem comprar** | `hoje(SP) − data do último pedido válido do grupo` em dias corridos |
| **No ritmo** | `diasSemComprar ≤ 1,5 × ritmo` |
| **Atraso leve** | `1,5×ritmo < diasSemComprar < 2×ritmo` OU `< 21` dias (o que for MAIOR limite): ou seja, atraso leve = passou de 1,5× e ainda não é parado, ou está parado pelo ritmo mas há menos de 21 dias |
| **Parado** | `diasSemComprar ≥ 21` E `≥ 2 × ritmo`, com ≥3 pedidos válidos, e `≤ 180` dias |
| **Parado → destino** | "Ana" se tem celular/WhatsApp utilizável (`Telefone_Celular` ou `cliente_whatsapps`) E não tem 2+ registros "sem resposta" no WhatsApp nos últimos 30 dias; "visita" caso contrário. Na etapa 1 é só rótulo ("Ana vai chamar" / "Visita presencial"); nada é disparado |
| **Para inativar** | `diasSemComprar > 180` (com pedidos) ou cadastro com observação "fechou" (palavra-chave) nos últimos 60 dias; botão "Já sei → não compra mais" |
| **Novo** | 1 a 2 pedidos válidos no grupo; não entra em parado (vendedor cuida). Contador "novos" nos 6 números = primeiro pedido válido do grupo dentro do período |
| **Nunca pediu no app / sem vendedor** | 0 pedidos válidos; sem `idVendedor` → lista "sem vendedor" (decisões) |
| **Sazonal / Fora** | tipo de cliente `Balcão-Kit Festa` e `Funcionários/Terceirizados`: por NOME de categoria fixo na etapa 1 (constante no serviço, sem campo novo): Kit Festa = sazonal (nunca parado, só aparece no bucket "sazonal"), Funcionários = fora (somem). Não confirmado que os nomes no banco são exatamente esses; conferir `categorias_cliente.nome` |
| **Voltaram** | compraram no período e o pedido anterior a esse era de há 35+ dias (definição já usada na Revisão 6, "35+ dias"); **Pararam** = compraram no período anterior e não compraram no período atual (e seguem sem comprar até hoje) |
| **Clientes que compraram** | nº de entidades unidas com ≥1 pedido válido no período |
| **Ticket** | R$ líquido do período ÷ nº de pedidos válidos do período |
| **Período comparado** | Semana: seg(hoje)..hoje × seg(hoje−7)..(hoje−7) (mesmo dia da semana). Mês: dia 1..hoje × dia 1..mesmo dia do mês anterior (se o dia não existe no mês anterior, usa o último dia). R$ de devolução entra no dia em que foi registrada |
| **Top 20** | os 20 maiores por R$ líquido dos últimos 90 dias (unidos, inclui cadastro inativo). Alerta "faltou pedido": `diasSemComprar > 1,5 × ritmo` (ritmo igual ao acima, mas com piso: ritmo mínimo 3 dias para não alertar cliente diário no fim de semana) |
| **Gerente (texto)** | frase por regra a partir de: bucket, ritmo, dias, ticket recente × base (`variacaoTicketPct` do insight pode ser usada, ver R6), último atendimento (tipo e data), dia de venda, pausa. Tabela de ~8 modelos de frase no serviço; sem IA, sem texto livre do cliente |
| **Resumo do topo (template)** | 3 a 4 frases montadas de números: (1) vendas do período vs anterior (+x%), (2) clientes que compraram vs anterior, (3) quantos parados/atraso/top 20 faltando, (4) projeção do mês e % da meta |
| **Por tipo de cliente / grupo de produto** | R$ líquido do período × anterior, por `categoriaCliente.nome` / `Produto.categoria`; top 6 + "outros" |
| **Quem mais caiu / subiu** | diferença de R$ entre período atual e anterior, por entidade unida; 5 maiores quedas e 5 maiores altas; entidade com par vinculado já está somada (evita falso "Renato caiu") |

## 4. Contrato da rota — REAL (implementado pelo dev-backend em 12/11/2026; PREVALECE sobre o rascunho anterior)
Exemplo completo gerado do banco local: `docs/exemplo-resposta-carteira.json` (listas cortadas em 3 itens só no arquivo de exemplo).
`GET /api/dashboards/geral/carteira?periodo=semana|mes&vendedorId=<uuid|todos|sem-vendedor>&fresh=1` (vendedorId desconhecido = **400** `{error:"Vendedor inválido."}`; com `sem-vendedor` o bloco `projecao` vem `null`) — `verificarAuth` + `checkGestor` (403 `{error}` sem permissão). `fresh=1` ignora o cache (botão atualizar). Valores em R$ como número (2 casas); datas `YYYY-MM-DD`; listas nunca `null`. **Cada bloco pode vir `null`** se o cálculo dele falhar (a rota não cai): o front deve tratar `null` escondendo o bloco. Cache em memória 10 min (a carga; o resultado por periodo+vendedor), invalidado ao gravar "Já sei". Lista curta/completa é do FRONT (corta 5); o back devolve até 50 por lista, com `total` da contagem completa. Vendedor inexistente = listas vazias (200). "Hoje" = data de São Paulo.
Quando há `vendedorId`, TUDO é filtrado pelo vendedor da carteira do cliente (cadastro atual), exceto `equipe` e `projecao.porVendedor`, que usam o vendedor do pedido/atendimento.

```jsonc
{
  "hoje": "2026-11-12", "periodo": "mes", "vendedorId": "todos",
  "janela": { "atual": {"de":"2026-11-01","ate":"2026-11-12"}, "anterior": {"de":"2026-10-01","ate":"2026-10-12"} },
  "geradoEm": "2026-11-12T06:50:56.286Z", "cacheIdadeSegundos": 0,   // só na resposta HTTP
  "vendedores": [ {"id":"uuid","nome":"Leticia Piske"} ],            // vendedores ativos com carteira (seletor)
  "resumo": {                                                         // template, sem IA
    "frases": ["Em novembro até o dia 12 as vendas somam R$ 105.054, 16% acima de outubro no mesmo período (R$ 90.599), com 244 clientes comprando (contra 217).", "...", "...", "No ritmo atual novembro fecha em ..."],
    "rotulo": "novembro até o dia 12",
    "parcial": "novembro até o dia 12: R$ 105.054, contra R$ 90.599 no mesmo período anterior.",
    "projecao": { "valorProjetado": 285000, "meta": 338000, "pctMeta": 84.3 }   // pode ser null
  },
  "projecao": {                                                       // "Para onde o mês está indo" (sempre o mês corrente, nos dois modos)
    "mes":"2026-05","mesRotulo":"maio","diaHoje":20,
    "jaEntrou":115027.77,"fechaNoRitmo":117543.39,"meta":318300,    // meta 0 = sem meta cadastrada
    "pctMeta":36.93,"pctRealizado":36.14,                            // null sem meta
    "mesAnteriorTotal":267507.18,"variacaoVsMesAnteriorPct":-56.06,   // fecha vs mês anterior inteiro
    "diasTrabalho":{"total":20,"passados":13,"restantes":7},          // união dos dias de trabalho das metas
    "faltaParaMeta":203272.23,"porDiaNecessario":29038.89,"porDiaAteAgora":8848.29,  // null quando não há dias
    "metodo":"dias_trabalho|ritmo_linear",
    "frase":"No ritmo atual maio fecha em R$ 117.543, 56% abaixo de abril ... Para bater a meta faltam ...",
    "porVendedor":[{"vendedorId":"..","nome":"..","meta":0,"realizado":0,"projecao":0,"pctMeta":null,"pctRealizado":null,"metodo":"dias_trabalho|ritmo_linear"}]
  },
  "numeros": {   // cada um {atual, anterior, variacaoPct (null se anterior = 0)}; novos/voltaram/pararam só {atual, anterior}
    "pedidosReais":{...},      // R$ LÍQUIDO (já desconta devolução do dia registrado) — o nome é do contrato antigo
    "qtdPedidos":{...}, "clientesCompraram":{...}, "ticket":{...},
    "novos":{"atual":18,"anterior":207}, "voltaram":{...}, "pararam":{...}   // pararam = passaram a PARADO dentro da janela
  },
  "grafico": { "tipo":"semanal|mensal", "titulo":"Últimas 9 semanas|Últimos 6 meses",
               "itens":[ {"rotulo":"18/05|maio","de":"2026-05-18","valor":123.45,"parcial":true} ] },   // último item = período corrente (parcial:true)
  "decisoes": [   // sempre 4 itens, nesta ordem; qtd = total, itens <= 50, cada item (menos MESMO_CLIENTE) tem link "/clientes/<id>"
    {"tipo":"GRANDE_FALTOU","titulo":"...","qtd":2,"itens":[{"clienteId":"","nome":"","detalhe":"87 dias sem pedir e costuma pedir a cada 26","link":""}]},
    {"tipo":"MESMO_CLIENTE","titulo":"...","qtd":1,"itens":[{"sugestaoId":"antigo:atual","antigoId":"","antigoNome":"","atualId":"","atualNome":"","motivo":"mesmo celular|mesmo endereço|mesmo celular e mesmo endereço","antigoUltimoPedido":"2026-08-17","atualPrimeiroPedido":"2026-08-18","reais90d":552}]},
    {"tipo":"SEM_VENDEDOR","titulo":"...","qtd":5,"total":824,"itens":[até 5 {"clienteId":"","nome":"","pedidosNoApp":6,"link":""}]},   // qtd = no máximo 5 (conta no cabeçalho); total = backlog real; quem já pediu primeiro; vazio com filtro de vendedor
    {"tipo":"INATIVAR","titulo":"...","qtd":260,"itens":[{"clienteId":"","nome":"","diasSemComprar":233,"motivo":"Mais de 180 dias sem comprar","avisos":[],"link":""}]}
  ],   // TODOS os itens de decisoes ganharam "total" (= contagem real); só SEM_VENDEDOR tem qtd diferente de total
  "decisoesPendentes": 15,                          // soma dos qtd (SEM_VENDEDOR conta no máximo 5) = número do cabeçalho
  "semVendedor": { "total": 776, "hoje": [{"clienteId":"","nome":"","pedidosNoApp":6}] },   // até 5, quem já pediu primeiro (mesmo conteúdo de decisoes[SEM_VENDEDOR])
  "resultadoDecisoes": {"aprovados":0,"responderam":0,"voltaram":0,"reais":0},   // sempre zeros na etapa 1 (estado vazio)
  "top20": { "janela":{"de":"","ate":""}, "somaReais":4265.3, "pctDaVenda90d":38.18, "faltando":2,
    "itens":[ {"clienteId":"","nome":"","vendedor":"nome|null","vendedorId":"|null","reais90d":0,"ritmoDias":7,"diasSemComprar":8,
               "status":"EM_DIA|FALTANDO","silenciadoAte":null,"cadastrosUnidos":["nome"],"textoGerente":"string só quando FALTANDO, senão null"} ] },
  "carteiraPorVendedor": [ {"vendedorId":"uuid|null","nome":"Sem vendedor|..","total":133,"noRitmo":55,"atrasoLeve":21,"paradoAna":2,"paradoVisita":2,"inativar":0,"novos":38,"sazonal":0,"silenciados":0,
                            "valorEmRiscoMes":32799.47,"registrosSemPedido":{"whatsapp":25,"presencial":54,"semVisita":9,"outros":0,"total":88,"atendidoSemPedido":36,"semResposta":9}} ],   // registrosSemPedido = janela ATUAL
  "atencao": {   // abas de "Clientes que pedem atenção"; itens ordenados por valorEmRiscoMes desc; silenciados NÃO entram
    "paradoAna":{"total":0,"itens":[CLIENTE_ATENCAO]}, "paradoVisita":{...}, "atrasoLeve":{...}, "inativar":{...},
    "enfraquecendo":{"total":0,"itens":[{...CLIENTE_ATENCAO,"variacaoTicketPct":-30,"produtoAusente":"nome|null"}]}   // regra herdada da Recorrência (ticket caiu >=15%, vem do insight)
  },
  "equipe": { "janela":{...}, "nota":"...",     // "O que a equipe fez": por vendedor do PEDIDO/atendimento
    "porVendedor":[ {"vendedorId":"","nome":"","atual":EQ,"anterior":EQ} ] },
    // EQ = {"pedidos":121,"reais":54142.51,"clientes":81,"semPedido":{"whatsapp":25,"presencial":54,"semVisita":9,"outros":0,"total":88,"atendidoSemPedido":36,"semResposta":9}}
    //  semPedido = atendimento sem pedido, exceto FINANCEIRO, classificado pelo TIPO (exclusivos): SEM_VISITA = semVisita; PRESENCIAL/VISITA/AMOSTRA = presencial; WHATSAPP = whatsapp (inclui "sem resposta" por WhatsApp); TELEFONE/LIGACAO/qualquer outro = outros. atendidoSemPedido e semResposta contam pelo acaoLabel, independente do tipo (não somam com os baldes)
  "motivos": { "janela":{"de":"","ate":""}, "totalRegistros":644, "aproximado":true, "aviso":"texto para exibir",   // últimos 30 dias, sem pedido, ignora o período do painel
    "itens":[ {"motivo":"Estoque cheio","qtd":78}, ..., {"motivo":"Sem motivo claro","qtd":486,"semMotivo":true} ],     // palavra-chave na observação; "Sem motivo claro" sempre por último
    "porAcao":[ {"label":"Atendido sem pedido","qtd":297} ] },                                                          // por acaoLabel (estruturado)
  "quemMudou": { "cairam":[Q], "subiram":[Q] },   // até 5 cada; Q = {"clienteId","nome","vendedor","tipo","atual","anterior","diferenca","cadastrosUnidos"}
  "porTipoCliente": [ {"tipo":"Padaria","atual":0,"anterior":0,"diferenca":0} ],   // top 6 + "Outros"; "Sem tipo" quando sem categoria
  "porGrupoProduto": [ {"grupo":"Mini Salgados para Fritar","atual":0,"anterior":0,"diferenca":0} ],   // top 8 + "Outros"; grupo = CategoriaProduto (cai em Produto.categoria quando sem grupo)
  "movimento": {"semCompra90d":266,"primeiraCompraSemRecompra":6,"totalAtivos":1140},
  "valorEmRiscoMes": 1354.62,                       // soma do valor em risco (parados + atraso leve)
  "atalhos": {"vendas":"Vendas & Pedidos","atendimentos":"Atendimentos"}
}
// CLIENTE_ATENCAO: {"clienteId","nome","cidade|null","vendedor|null","vendedorId|null","tipo|null","ritmoDias":26.2,"origemRitmo":"INTERVALO_REAL|CICLO_CADASTRO",
//   "diasSemComprar":87,"pedidosValidos":6,"ultimoPedido":"2026-08-17","ticketMedio":544.04,"valorEmRiscoMes":622.95,
//   "destino":"ANA|VISITA|ATRASO_LEVE|INATIVAR","textoGerente":"frase por regra","cadastrosUnidos":["nome"],"silenciadoAte":"YYYY-MM-DD|null","pausadoAte":"YYYY-MM-DD|null","avisos":["VENDEDOR_ANOTOU_FECHOU"]}   // avisos NÃO muda o bucket: anotação de vendedor com "fechou" (ignora "fechou pedido/venda") nos últimos 60 dias; mostrar como selo/alerta
```
Regras que o front precisa saber: (a) "pedidosReais" pode ser negativo quando só há devolução; (b) `ritmoDias` é número com 1 casa (arredondar na tela); (c) Kit Festa (sazonal) conta só no `sazonal`; Funcionários nunca aparece em listas; (d) "silenciados" saem das listas e dos buckets de problema mas contam no `total`; (e) em "Semana" o gráfico é de 9 semanas (último parcial), em "Mês" de 6 meses; (f) `projecao` independe do período escolhido.

### 4.1 Rotas "Já sei" (REAIS; todas `verificarAuth` + `checkGestor`; erro = `{error:"mensagem"}`; gravam AuditLog fora de transação; invalidam o cache)
| Método e caminho (prefixo `/api/dashboards/geral/carteira`) | Corpo | Resposta 200 | Erros |
|---|---|---|---|
| `POST /mesmo-cliente` | `{antigoId, atualId, origem:"MANUAL"|"SUGESTAO"}` | `{ok:true, id, atualFinalId}`; mesmo par de novo = `{ok:true, id, duplicado:true}` | 400 faltou id / mesmo id / ciclo; 404 cadastro inexistente; 409 antigo já ligado a OUTRO cliente (desfazer antes); 403 |
| `DELETE /mesmo-cliente/:id` (id do vínculo) | — | `{ok:true}` | 404 vínculo inexistente |
| `POST /sugestao-dispensar` ("Não é o mesmo") | `{antigoId, atualId}` | `{ok:true, id}` (grava vínculo com `ignorado=true`; a sugestão não volta; desfazer = `DELETE /mesmo-cliente/:id`) | 400; 404; 409 se já ligado de verdade |
| `POST /silencio` ("não avisar") | `{clienteId, dias:30|90}` | `{ok:true, ate:"YYYY-MM-DD"}` (regrava se já existir) | 400 dias; 404 cliente |
| `DELETE /silencio/:clienteId` | — | `{ok:true}` (idempotente) | — |
| `GET /buscar-clientes?q=` (busca para o "mesmo cliente") | — (query `q`, mínimo 3 caracteres) | `{ "data": [ {"id","nome","fantasia|null","cidade|null","ativo":true|false} ] }` até 20; busca nome, fantasia e documento, NÃO filtra ativo (cadastro inativo aparece com `ativo:false`) | 400 `Digite ao menos 3 caracteres.`; 403 |
| "Não compra mais" | NÃO há rota nova: o front abre `/clientes/:id` (cadastro) — não foi criada rota enxuta de inativar | — | — |
Observações: o `id` do vínculo criado volta no POST (guardar para o "Desfazer" do toast). Ao juntar, a lista `decisoes[MESMO_CLIENTE]` perde o item e o cliente passa a aparecer uma vez só (com `cadastrosUnidos`). `?fresh=1` não é necessário depois de gravar: o backend já invalida.

### 4.2 Ficha do cliente (painel lateral da Carteira) — REAL (13/11/2026)
Ambas `verificarAuth` + `checkGestor`; erro = `{error, codigo?}`. `:id` = UUID do cadastro (pode ser um cadastro "unido": os números são da entidade unida, `unidoA` aponta o principal). Sem coluna nova: tudo vem de `clientes`, `cliente_whatsapps`, `cliente_silencio`, `cliente_mesmo_que`, pedidos e atendimentos.

`GET /api/dashboards/geral/carteira/cliente/:id` -> 200:
```jsonc
{ "clienteId":"", "nome":"razão social", "fantasia":"|null", "cidade":"|null", "ativo":true,
  "vendedor":{"id":"","nome":""} /*|null*/, "categoria":{"id":"","nome":""} /*|null*/,
  "diaVenda":"SEG, QUA" /* "" = sem dia */, "diasVenda":["SEG","QUA"],
  "cicloPersonalizadoDias":15 /*|null*/, "cicloEfetivoDias":15 /* personalizado, senão da categoria, senão 7 */,
  "celular":"47999990001|null", "whatsapps":["47988887777"], "observacaoComercial":"|null",
  "unidoA":{"clienteId":"","nome":""} /*|null*/, "cadastrosUnidos":["nome"] /* os OUTROS cadastros da entidade (sem o aberto), em Title Case */,
  "numeros": { "situacao":"NO_RITMO|ATRASO_LEVE|PARADO|INATIVAR|NOVO|SEM_PEDIDO|SAZONAL", "destino":"ANA|VISITA|ATRASO_LEVE|INATIVAR|null",
      "diasSemComprar":41, "ritmoDias":30, "origemRitmo":"INTERVALO_REAL|CICLO_CADASTRO", "ticketMedio":125.46, "totalPedidos":20,
      "ultimoPedido":"2026-10-02", "valorEmRiscoMes":125.46, "textoGerente":"frase", "avisos":[], "silenciadoAte":"YYYY-MM-DD|null", "pausadoAte":"YYYY-MM-DD|null" } /* null se o cadastro é novo demais p/ o cache: tratar */,
  "ultimosPedidos":[{"id","numero":123|null,"data":"YYYY-MM-DD","valor":444,"status":"FATURADO|ESPECIAL","clienteId"}],   // até 5, válidos (sem cancelado/bonificação), data <= hoje
  "ultimosAtendimentos":[{"id","data":"YYYY-MM-DD","tipo":"WHATSAPP","acao":"|null","observacao":"|null","quem":"nome|null"}],   // até 6
  "jaSei":{ "silencios":[{"clienteId","ate":"YYYY-MM-DD"}],            // desfazer: DELETE /silencio/:clienteId
            "vinculos":[{"id","antigoId","antigoNome","atualId","atualNome","origem"}] },   // desfazer: DELETE /mesmo-cliente/:id
  "podeEditar":{"vendedor":true,"categoria":true,"diaVenda":true,"ciclo":true,"observacao":true,"ativo":false,"celular":false,"whatsapps":false},
  "opcoes":{"vendedores":[{"id","nome"}],"categorias":[{"id","nome","cicloPadraoDias"}],"dias":["SEG","TER","QUA","QUI","SEX","SAB","DOM","N/D"]},
  "cacheIdadeSegundos":0 }
```
`PATCH /api/dashboards/geral/carteira/cliente/:id` — corpo com SÓ os campos que mudaram (campo ausente = não mexe; qualquer chave fora desta lista é ignorada): `vendedorId` (uuid|null), `ativo` (boolean), `categoriaId` (uuid|null), `diaVenda` (lista `["SEG","QUA"]` ou texto `"SEG, QUA"`; `""` limpa), `cicloDias` (inteiro 1-365|null), `celular` (dígitos, 10 ou 11; texto sem nenhum dígito = 400; `""` limpa), `whatsapps` (lista; o cadastro normaliza), `observacaoComercial` (texto|null, máx. 2000). Resposta 200 = a ficha atualizada (mesmo formato do GET). Valor igual ao atual é ignorado (não grava nem audita). Vendedor INATIVO só é aceito se já foi o vendedor do cliente por troca feita na ficha (desfazer); senão 400 "Esse vendedor está inativo.". O cache da Carteira é invalidado sempre que houve tentativa de gravar (inclusive se o cadastro respondeu erro depois de gravar parte).
Regra da Carteira (muda `numeros.destino` e as listas): cadastro com `ativo=false` só conta na Carteira se estiver unido (vínculo) ou com situação NO_RITMO/ATRASO_LEVE; os demais inativos saem das listas, top 20, decisões e `destino` (= null). Totais de venda não mudam.
Erros: 400 vendedor/tipo inexistente ou vendedor inativo, dia fora de SEG..N/D, ciclo fora de 1-365, `ativo` não booleano, celular/WhatsApp inválido (mensagem do cadastro), `codigo:"WHATSAPP_NAO_EXISTE"` (celular novo sem WhatsApp, só com o módulo ligado); 403 campo sem permissão (mensagem "Sem permissão para alterar X"); 404 cliente inexistente. Ao salvar: reaproveita `clienteController.atualizar` (mesma validação, tabela `cliente_whatsapps`, conferência do número no bot, AuditLog `CLIENTE_ALTERADO` com `origem:"CARTEIRA"`), grava AuditLog `CARTEIRA_FICHA_ALTERADA` (antes/depois) e invalida o cache da Carteira.
Permissões (espelham o cadastro): vendedor, tipo, dia de venda, ciclo e observação não exigem permissão própria (o cadastro também não); `ativo` e `whatsapps` exigem `admin` / `clientes.edit` / `Pode_Editar_GPS`; `celular` idem, ou `pedidos.edit` quando o cliente ainda não tem celular válido. Inativar não tem confirmação no servidor (só um `confirm` na tela do cadastro): a ficha deve pedir confirmação.

## 5. Desempenho (banco compartilhado e lento)
Princípio: o universo é PEQUENO (≈1.208 ativos + inativos que compram; ≈5,4 mil pedidos no total — contagem por canal da Revisão 3 somada; não confirmado se há pedidos fora desses canais). Então carregar e calcular em Node, sem N+1.
| # | Consulta | Custo |
|---|---|---|
| 1 | `cliente.findMany` com `select` explícito (UUID, Nome, NomeFantasia, Ativo, idVendedor, Dia_de_venda, categoriaClienteId, cicloCompraPersonalizadoDias, Telefone_Celular, End_Logradouro, End_Numero, End_CEP, End_Cidade) de TODOS que tenham ao menos 1 pedido válido OU sejam Ativo | ~1,5 mil linhas |
| 2 | SQL cru (`$queryRaw`): pedidos válidos 24 meses `(id, cliente_id, vendedor_id, data_venda, especial, SUM(qtd*valor))` com `GROUP BY` e filtro `bonificacao=false AND cancelado=false AND (situacao_ca='FATURADO' OR especial)` | ~5 mil linhas, 1 consulta |
| 3 | SQL cru: itens por grupo (`produtos.categoria`) só nos dois períodos da janela | 1 consulta agregada |
| 4 | `devolucao.findMany` ATIVA, 24 meses, com `pedidoOriginal.{clienteId,vendedorId}` | centenas |
| 5 | `atendimento.findMany` últimos 60 dias (clienteId, tipo, acaoKey, acaoLabel, idVendedor, criadoEm, pedidoId) — usa índice `clienteId`/`idVendedor` | milhares |
| 6 | `clientePausa` vigentes; `clienteInsight` (variacaoTicketPct, produtoAusenteId, só para "enfraquecendo"); `categoriaCliente`; `vendedor` ativos | tabelas pequenas |
| 7 | `cliente_mesmo_que`, `cliente_silencio` (tabelas novas, minúsculas) | |
| 8 | `projecoesMes(mes)` + `metaMensalVendedor` | ~6 consultas, só se `periodo` ou hoje precisar (a frase do resumo precisa SEMPRE; cachear) |
| 9 | Sugestão de vínculo: calculada em memória a partir de #1 (mesmo celular normalizado/mesmo logradouro+número+CEP) e #2 (primeiro/último pedido) — zero consultas extras |
Total ≈ 12 a 16 consultas por requisição fria, todas independentes → `Promise.all` em 2 ondas. **Cache em memória 10 min** por chave `(periodo)`; o cálculo pesado (clientes/buckets) é UM só e filtrado por vendedor depois, então a chave do cache é só o conjunto do dia; "Já sei" e silêncio **invalidam o cache**. Botão atualizar do dashboard (`setTick`) manda `?fresh=1` para ignorar o cache. Estimativa: 1,5 a 4 s fria no banco lento (não medido: dev-backend mede com `console.time` e registra no relatório), <50 ms quente. Índices existentes cobrem: `pedidos(data_venda)`, `(cliente_id)`, `(vendedor_id)` (`schema.prisma:~600-640`). Não adicionar índice em `pedidos` (tabela grande, deploy `db push`); só nos novos.
Nada de `clienteIdsEmAtraso`, nada por cliente em laço, nada de chamar IA, nada de chamar `recalcularCliente`.

## 6. Schema Prisma (SÓ ADICIONA; 2 modelos; nenhuma coluna em `clientes`)
```prisma
// "Já sei": este cadastro (antigo) é o mesmo cliente de outro cadastro (atual).
model ClienteMesmoQue {
  id         String   @id @default(uuid())
  antigoId   String   @unique @map("antigo_id")      // um cadastro só aponta para UM atual
  atualId    String   @map("atual_id")
  origem     String   @default("MANUAL")             // MANUAL | SUGESTAO
  ignorado   Boolean  @default(false)                // true = "não é o mesmo": suprime a sugestão
  criadoPorId String? @map("criado_por_id")          // snapshot solto, sem relation (padrão do projeto)
  createdAt  DateTime @default(now()) @map("created_at")

  antigo Cliente @relation("MesmoQueAntigo", fields: [antigoId], references: [UUID], onDelete: Cascade)
  atual  Cliente @relation("MesmoQueAtual",  fields: [atualId],  references: [UUID], onDelete: Cascade)

  @@index([atualId])
  @@map("cliente_mesmo_que")
}

// "Já sei" — não me avise deste cliente até a data.
model ClienteSilencio {
  clienteUuid  String   @id @map("cliente_uuid")
  silenciarAte DateTime @map("silenciar_ate")
  criadoPorId  String?  @map("criado_por_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  cliente Cliente @relation(fields: [clienteUuid], references: [UUID], onDelete: Cascade)

  @@index([silenciarAte])
  @@map("cliente_silencio")
}
```
- Para as relações, `model Cliente` ganha só **campos de relação** (sem coluna física): `mesmoQueComoAntigo ClienteMesmoQue? @relation("MesmoQueAntigo")`, `mesmoQueComoAtual ClienteMesmoQue[] @relation("MesmoQueAtual")`, `silencioCarteira ClienteSilencio?` (mesmo truque de `enderecoLogs ClienteEnderecoLog[]`, `schema.prisma:257`; `ClientePausa` idem). O comentário do teto de colunas fala de colunas, não de relações — **não confirmado** que o limite do Postgres/Prisma não seja afetado por relações (não são colunas, não são). Alternativa mais segura: sem `@relation` e sem FK (snapshot solto, como `criadoPorId`), validando existência no código; reduz acoplamento com a tabela grande. **Recomendação: SEM relation** (dev-backend decide; ambas só adicionam).
- Semântica de `ignorado`: "Parece o mesmo cliente? Não é" grava linha com `ignorado=true` (o serviço filtra `ignorado` fora do cálculo e fora da sugestão futura). Encadeamento A→B→C: resolver até o final no código (limite 5 saltos, protege ciclo).
- Deploy usa `prisma db push` sem `--accept-data-loss` (CLAUDE.md): só tabelas novas, nenhum campo removido ou alterado → seguro. Confirmado que nada existente é tocado.
- Sugestão automática (SEM tabela): par (A,B) com B ≠ A, mesmo `Telefone_Celular` normalizado OU mesmo (logradouro+número+CEP), onde último pedido válido de A ≤ primeiro pedido válido de B + 14 dias E primeiro pedido de B > último de A − 14 dias ("um parando quando o outro começa"). Exclui pares já vinculados/ignorados. Máx. 50 sugestões. Normalização de telefone: reaproveitar o utilitário existente de celular (`numeroValido` citado em `schema.prisma:347-370`; localizar no `whatsappClienteService.js`; não confirmado o nome da função exportada).

## 7. Divisão em tarefas
Ordem: **BK-1 (schema) → BK-2/3 (serviço + rotas) em paralelo com FE-1 (contra mock do contrato §4) → integração → E0 independente em qualquer momento.**

### BK — dev-backend (A + B)
| # | Entrega | Arquivos | Prova |
|---|---|---|---|
| BK-1 | 2 modelos §6 (+ relações opcionais); `npx prisma validate`; `prisma db push` no banco LOCAL (`hardt_local`) | `backend/prisma/schema.prisma` | `prisma validate` ok; `\d cliente_mesmo_que`, `\d cliente_silencio` |
| BK-2 | `backend/utils/dataSP.js` (extrair helpers de data SP; `dashboards.js` passa a importar; comportamento idêntico) e export do `checkGestor` ou cópia local | `backend/utils/dataSP.js`, `backend/routes/dashboards.js:35-58,76-87` | `GET /geral/vendas` e `/geral/visao-geral` com o mesmo JSON de antes (diff) |
| BK-3 | `backend/services/carteiraService.js`: carga (§5), união de cadastros, ritmo, buckets, top 20, números comparados, quem mudou, tipo, grupo, textos por regra, resumo template, sugestão de vínculo, cache 10 min com `invalidar()`; funções puras separadas (`calcularRitmo`, `classificar`, `periodos`) para teste | novo | script `node -e` de teste das funções puras com casos reais: Requinte (3 pedidos, intervalo 69d, 64d sem comprar → NÃO parado), Renato+Maria Fernanda (unidos: não parado, ativo=false enxergado), cliente com último pedido cancelado, semana em virada de mês, dia 31→mês anterior de 30 dias |
| BK-4 | rotas `GET /geral/carteira`, POST/DELETE mesmo-cliente e silêncio (§4), AuditLog fora de transação, validações | `backend/routes/dashboards.js` (bloco novo ao lado de `/geral/recorrencia`; NÃO remover esta) | `curl` autenticado 200 com cada bloco do contrato; 403 com usuário comum; POST duplicado = `duplicado:true`; DELETE desfaz; cache invalida |
| BK-5 | Manuais/Clippy (§8) | `backend/manuais/abas/dashboard.md` | texto cobre a aba Carteira, Já sei, o que mudou da Recorrência |
Regras: sem `$transaction` necessário (uma escrita por chamada; se usar, `{timeout:20000,maxWait:10000}`); relatório de tempo das consultas.

### FE — dev-frontend (C)
| # | Entrega | Arquivos | Prova |
|---|---|---|---|
| FE-1 | Trocar aba `recorrencia` por `carteira` (label "Carteira", ícone `Users`), sets de abas, mapeamento do filtro salvo `recorrencia→carteira`, esconder navegador de mês/categoria e banner de mês fechado nesta aba, subtítulo "foto de hoje"; trocar os dois textos "Recorrência" (`:280`, `:557`) | `frontend/src/pages/Dashboard/DashboardGeral.jsx` | build ok; abas mostram "Carteira" |
| FE-2 | Componente novo `frontend/src/pages/Dashboard/AbaCarteira.jsx` (arquivo separado: `DashboardGeral.jsx` já tem 691 linhas). Fiel ao protótipo: controles Semana/Mês (pílulas), `SelectBusca` de vendedor (opção "Todos"), Lista curta (5) / Completa, resumo, 6 números com variação, barras mensais (modo mês) e link para Vendas no modo semana, Suas decisões (4 linhas + estado vazio de "o que deram as suas decisões"), tabela Carteira por vendedor (cards no mobile), abas de atenção com texto do gerente ao tocar, 20 maiores, quem caiu/subiu, por tipo, por grupo, cartão Movimento da carteira, atalhos para Vendas e Atendimentos. Reusar `Card`, `Kpi`, `LinhaBarra`, `BarraMeta`, `BadgeRecompra` etc. de `dashUi.jsx` | novo | build; telas a 375 e 1280 px |
| FE-3 | Botão "Já sei" em cada cliente: 3 respostas (mesmo cliente → escolher cadastro com busca; não avisar 30/90 dias; não compra mais → abre `/clientes/:id`/rota de inativar). "Juntar" na linha MESMO_CLIENTE (um toque) e "Desfazer" (toast com desfazer) | idem + `frontend/src/services/` (chamadas) | clicar e ver o item sair e voltar |
| FE-4 | Filtros com `useFiltrosSalvos` (chave `dashboard-geral`, campos novos); dropdowns com `SelectBusca`; sem `<select>`; sem scroll horizontal; tap targets ≥44px; `useAtualizaAoVoltar`/`tick` reaproveitados | | |
Nenhuma tela nova no `App.jsx`; **não há `lazyComRetry` novo a criar** (a aba vive dentro de `DashboardGeral`, que já é carregado via `DashboardHome`). Se o dono insistir em carregamento sob demanda do `AbaCarteira`, usar `lazyComRetry`, nunca `React.lazy` — não necessário.

### E0 — dev-backend (bloco 6) + dev-frontend (cards da Rota), tarefas pequenas e independentes
| Parte | O que | Onde | Prova |
|---|---|---|---|
| E0-a (backend) | Remover/desligar o agendamento `scheduleIANoturna()` (bloco 6, `backend/workers/scheduler.js:183-237`; chamada final em `:237`). NÃO tocar o recálculo das 03:00 (`:160-181`) nem `gerarOrientacaoIA` pós-atendimento (`atendimentoService.js:252-262`). Deixar comentário datado explicando o desligamento; remover os requires só usados ali (`orientacaoService`, `prismaIA`, `DIAS_SIGLA_IA`) se não forem usados em outro ponto do arquivo (conferir) | scheduler.js | log do boot sem "Agendando IA Noturna"; às 23:30 nenhum `[IA Noturna]` |
| E0-b (frontend) | Tirar a análise de IA dos cards da Rota: bloco de IA do `CardCliente` (`RotaLeads.jsx:355-356` estados, `:375-400` efeitos/handler, `:581-608` render do painel e botão "Analisar"), `podeUsarIAOrientacao` (`:1682`) e a prop `podeUsarIA` (`:2318`). **Cuidado: `insightPrincipalResumo` (texto por regra) e o `OrientacaoPopup` (`:276+`) são usados pelo fluxo do atendimento (`:375,384,409`)**: o dev confirma o que é "análise de IA" (`orientacaoIaJson`/botão "Analisar com IA") e remove só isso; a orientação por regra permanece. Escopo exato do que sai: **confirmar com a leitura do componente; não confirmado aqui** | RotaLeads.jsx | build; abrir a Rota: cards sem bloco/botão de IA; "Registrar atendimento" continua funcionando |
Nota do arquiteto: o botão manual de IA na ficha do cliente (decisão do dono: IA após atendimento CONTINUA) não é tocado.

## 8. Manuais, Clippy, novidade, permissões
- `backend/manuais/abas/dashboard.md`: reescrever a seção da aba Recorrência como "Carteira" (o que cada bloco mostra, regras de ritmo/parado, Já sei, o que mudou; Semana/Mês; atalhos). Cobrir TODAS as abas do dashboard permanecendo.
- `backend/manuais/abas/README.md:29`: ajustar a linha do Dashboard (menciona abas).
- `backend/services/copilotoService.js:40` (tabela `ABAS`, slug `dashboard`, `rota:'/'`, `perm:null`): rota/permissão não mudam → **sem alteração** na tabela; só o manual. (Conferir se a `perm:null` já era assim: confirmado `:40`.)
- Manual do Rota (`backend/manuais/abas/` slug de Rota; nome do arquivo não confirmado): remover menção à análise de IA nos cards e à IA noturna (E0).
- Novidade: `frontend/public/novidade-carteira.html` (espelhar `novidade-tarefas.html`: hero verde-escuro, accordions já abertos, seção "As telas do app" com mockups e pins numerados, SEM `og:image`, SEM botão "Abrir o app") + entrada no topo de `frontend/public/novidades.json` (`slug:"carteira"`). Texto pronto para o grupo.
- Permissões: nenhuma nova (§0.2). `BOOL_INDEX` intocado.

## 9. Perguntas ao dono
Nenhuma bloqueante. Padrões escolhidos (registrados): (1) aba "Carteira" sem permissão nova; (2) Kit Festa = sazonal e Funcionários = fora por nome da categoria; (3) gráfico semanal fica em Vendas (atalho); (4) motivos por palavra-chave ficam como follow-up dentro de Atendimentos; (5) o alerta "Recompra crítica" da Visão Geral continua com a régua antiga na etapa 1 — **pergunta não bloqueante ao dono**: quer que o próximo passo troque esse alerta para a régua nova, para não aparecerem dois números diferentes na mesma tela?

## 10. Riscos e efeitos colaterais
| # | Risco | Tratamento |
|---|---|---|
| R1 | Dois números diferentes para "clientes em atraso": Visão Geral (régua do insight) × Carteira (ritmo real). Confunde | Texto de nota na aba; pergunta §9; follow-up |
| R2 | Quem está com `filtros.aba = 'recorrencia'` salvo | mapeamento `recorrencia→carteira` (FE-1) |
| R3 | Deploy: frontend novo chama `/geral/carteira` antes do backend subir (ou o contrário) | backend primeiro; manter `/geral/recorrencia` no ar; `useVersionCheck` já avisa |
| R4 | Cache em memória serve dado velho após "Já sei" | invalidar no POST/DELETE; `?fresh=1` no atualizar |
| R5 | União de cadastros mal feita some com cliente de verdade ou soma errado | só vínculo explícito (manual ou sugestão aceita); desfazer sempre disponível; AuditLog; grupo mostra `cadastrosUnidos` |
| R6 | `enfraquecendo` herda `variacaoTicketPct`/`produtoAusenteId` do insight (que conta cancelado e usa createdAt) | aceito na etapa 1 (correção do insight está FORA do escopo); marcar no manual |
| R7 | Consulta lenta em horário de pico | cache, 2 ondas paralelas, `select` explícito; medir antes de entregar; se >5 s fria, reduzir janela de pedidos para 18 meses |
| R8 | Nome de categoria (Kit Festa/Funcionários) diferente no banco | conferir e usar constante; se divergir, listar como "sem tipo" e ajustar |
| R9 | Mexer em `dashboards.js` (extração dos helpers) quebra Vendas/Visão Geral | só mover, diff do JSON antes/depois |
| R10 | E0-b remover demais do `RotaLeads.jsx` (arquivo gigante, `:2318` etc.) e quebrar o atendimento | grep dos símbolos antes; QA clica no fluxo de atendimento |
| R11 | Contrato `/api/ia-consulta/v1`, WhatsApp, NF-e, Prisma existente | NÃO tocados nesta etapa (confirmar no diff do revisor: nenhum arquivo dessas áreas) |
| R12 | Datas: virada de semana/mês, fuso, mês anterior com menos dias | helpers `dataSP` + testes de BK-3 |
| R13 | `clientes` no teto de colunas | nenhuma coluna; tabelas laterais |

## 11. O que NÃO fazer
- Não alterar `clienteInsightService` nem o cálculo do insight (rota depende dele).
- Não remover `/geral/recorrencia`, nem campos de outras rotas do dashboard.
- Não usar `diasSemComprar`/`statusRecompra` do insight para classificar.
- Não duplicar gráfico semanal, projeção/meta por vendedor, "o que a equipe fez" e motivos (já existem).
- Não chamar IA, não enviar WhatsApp, não criar fila/aprovação de resgate, não expor telefone.
- Não usar `<select>` nativo, `React.lazy`, `window.open` para imprimir; não persistir datas absolutas.
- Não remover campo do schema; não adicionar coluna em `clientes`; não pôr `$transaction` sem `{timeout:20000,maxWait:10000}`.
- Não commitar sem build do frontend; não testar só local (ver §13).

## 12. Critérios de aceite (testáveis) e roteiro do QA
1. Aba "Carteira" aparece no lugar de "Recorrência"; a aba antiga não existe mais; Visão Geral e Atendimentos apontam para "Carteira".
2. Usuário sem `Pode_Ver_Dashboard_Admin`: `curl` na rota nova = 403; com permissão = 200 (front e back concordam; testar o trio admin/permissão/Clark).
3. Na aba, o navegador de mês e o seletor de categoria NÃO aparecem; nas outras abas continuam.
4. Requinte (3 pedidos, intervalo ~69d, 64d): NÃO aparece como parado. Renato Festas + Maria Fernanda unidos (após "Já sei → mesmo cliente"): um só no top 20, não parado; antes de unir, aparece em "Decisões → parece o mesmo cliente" (mesmo celular/endereço, um parando quando o outro começa — **depende de os dados existirem no banco local; senão testar contra dump/produção**).
5. Pedido cancelado não conta como compra (cliente com último pedido cancelado mostra a data do último válido).
6. Cadastro inativo que comprou aparece nos totais e no top 20.
7. "Já sei → não avisar 30 dias": cliente sai das listas; reaparece após a data (testar mudando `silenciar_ate` no banco local). "Desfazer" devolve. "Juntar" e "Desfazer" refletem na hora (cache invalidado).
8. Semana e Mês trocam os 6 números; soma da semana do painel bate com `Vendas por semana` da aba Vendas para a mesma semana (mesma régua; tolerar 0 de diferença); R$ do mês até hoje bate com `vendas.liquida` da Visão Geral.
9. Filtro de vendedor reduz todas as listas e números; "Lista completa" mostra todos; lista curta mostra 5; filtros lembrados ao reabrir.
10. A 375 px: sem scroll horizontal, tabelas viram cards, toque ≥44px.
11. "O que deram as suas decisões" mostra estado vazio.
12. Itens da §0.5 todos presentes (funil substituído, valor em risco, atenção com link do cliente, enfraquecendo, movimento da carteira, total ativos).
13. E0: boot sem agendar IA noturna; Rota sem análise de IA no card; registrar atendimento ainda funciona e continua gerando orientação IA após o atendimento.
14. Build do frontend passa; `prisma validate` passa; nenhuma regressão nas abas Visão Geral/Vendas/Atendimentos/Resultado (JSON idêntico).
15. Tempo da rota fria registrado (meta: <5 s); quente <200 ms.

QA clica: cada aba do Dashboard; Carteira nos dois modos e com cada vendedor; abrir cliente (link) e voltar; "Já sei" nas 3 respostas e "Desfazer"; "Juntar" numa sugestão; lista curta/completa; recarregar a página (filtros lembrados); celular 375 px; usuário sem permissão; Rota (card de cliente, registrar atendimento).

## 13. Teste em produção após o deploy
- Backend primeiro: confirmar que o deploy aplicou o `db push` (as 2 tabelas existem) — rota `/geral/carteira` responde 200 (não 404/500); **medir tempo real da rota fria no banco de produção** (a lentidão do banco compartilhado só aparece lá).
- Conferir contra produção os casos reais (Renato/Maria Fernanda, Requinte, top 20 com 41%, soma da semana igual à de Vendas).
- Gravar um "Já sei" de teste num cliente descartável, desfazer, e conferir `AuditLog`. Reiniciar/redeploy e ver que o vínculo persiste (é banco, não arquivo; nenhum upload nesta etapa).
- Frontend: conferir o chunk novo por marcador (`reference_verificar_deploy_frontend`: hash local nunca bate); abrir com um usuário que tinha `aba='recorrencia'` salvo.
- E0: no dia seguinte, log das 23:30 sem `[IA Noturna]`; o recálculo das 03:00 rodou.

## 14. Porte
Etapa 1 inteira: **grande** (cálculo novo + schema + tela rica + rota que lê muito). Equipe completa: arquiteto (este plano) → dev-backend e dev-frontend em paralelo → qa-testador + revisor-codigo → gerente-entrega. E0: pequena (dev → revisor).

---

# ADENDO DO GERENTE DE PROJETO (11/11/2026, 18h) — PREVALECE SOBRE O RESTO DESTE ARQUIVO

Decisão do dono: **"eu quero o que você me mandou no html que aprovei"**. A aba Carteira deve conter TODOS os blocos do protótipo `docs/painel-carteira-proposta.html`, na mesma ordem. Onde este plano manda trocar um bloco por atalho para outra aba, IGNORAR e construir o bloco dentro da Carteira:

1. Resumo do gerente (por template, sem IA) com o período.
2. **Para onde o mês está indo** (já entrou, projeção, meta, barra, frase do que falta por dia, linha por vendedor). Reusar `projecaoVendasService`/`metaService`; não recalcular por conta própria.
3. Seis números comparados (semana e mês).
4. **Gráfico** das últimas 9 semanas / últimos meses.
5. Suas decisões de hoje (só o que existe sem o bot: cliente grande com pedido faltando, parece o mesmo cliente, sem vendedor, para inativar).
6. Sugestões do gerente: FICA FORA da etapa 1 (depende de IA). Não mostrar o bloco.
7. O que deram as suas decisões: estado vazio, como no protótipo.
8. Os 20 maiores clientes.
9. Carteira por vendedor.
10. Clientes que pedem atenção (abas, lista curta/completa, abrir cliente, "Já sei").
11. **O que a equipe fez** (pedidos, R$, clientes; registros sem pedido por WhatsApp / presencial / sem visita; comparação com o período anterior). Pode reaproveitar as consultas da aba Atendimentos, mas o bloco aparece na Carteira.
12. **Por que não compraram** (motivos; usar `acaoLabel` quando existir e palavra-chave na observação como complemento, com o aviso de que é aproximado).
13. Quem mais caiu e quem mais subiu.
14. Por tipo de cliente e por grupo de produto.

Controles como no protótipo: Semana | Mês, vendedor, Lista curta | Completa. O que a aba Recorrência atual tem e o protótipo não tem (valor em risco por mês, "enfraquecendo", movimento da carteira) pode ficar como blocos extras NO FIM da aba, sem tirar nada do protótipo.
Permissão: a do Dashboard Gerencial (confirmado pelo dono). O contrato JSON do §4 deve ganhar os blocos 2, 4, 11 e 12; o dev-backend define os campos e avisa o dev-frontend por este arquivo antes de codar.
