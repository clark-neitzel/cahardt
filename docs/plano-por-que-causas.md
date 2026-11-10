# Plano — "Por quê?" nível 2 (causas)

Gerado pelo arquiteto em 10/11/2026. Proposta visual: docs/proposta-por-que-causas.html

PLANO — "Por quê?" nível 2 (causas) · porte: MÉDIA/GRANDE (financeiro/margem, só leitura, sem schema, sem mexer em contrato de IA). Fluxo: dev-backend + dev-frontend em paralelo -> qa-testador + revisor -> gerente-entrega.

## 0. Entendimento e mapa do código (confirmado lendo o código)
- Selo abre `PorQueSituacao.jsx` (portal, `md:max-w-lg`), que só recebe `linha`. O período já está em `linha.situacao.detalhe.atual.{de,ate}` e `.anterior.{de,ate}` (montarDetalheSituacao, `backend/services/indicadoresGestaoService.js:630`). Não precisa prop nova: o front chama a rota com `de/ate = detalhe.atual.de/ate`; o backend recalcula o anterior com o mesmo `resolverPeriodo` (`:65`), então bate com o painel.
- `produtos()` `:678`: preço = receita/qtd, custoVariavelUn = custoEf/qtd (fallback `custoFichaUn` se custo<=0); anterior via `carregarVendas(periodo.anterior)` (`:90`, cache 60 s, SQL agrupado). A regra de venda: `bonificacao=false AND (situacao_ca='FATURADO' OR especial=true)`, por `data_venda` entre `inicioDia/fimDia` (fuso -03:00). **Devoluções NÃO são descontadas no nível do item** (só no resumo/DRE): o nível 2 segue igual ao painel (bruto) para os números baterem; avisar no rodapé do volume ("sem descontar devoluções").
- Custo: `backend/services/indicadoresCustoService.js` — `carregarFichasVigentes` (ctx.receitaPorItemPcp, itemPcpPorProduto), `fichaEfetiva(ctx,produtoId)` `:145` (própria ou de referência com `fator`), `explodirFicha(receita,ctx,fator)` `:212` (Map itemPcpId -> qtd por unidade final, já com perda/rendimento e SUB explodido), `custoFicha(receita,ctx,resolver,dataRef)` `:172`, `carregarCompras({itemPcpIds,produtoIds})` `:291`, `ultimoPrecoAte(lista,t)` `:313`, `listaDoInsumo` `:325`, `criarResolverNaData(idx)` `:335`, `classificarProdutos`, `custoAgora`. Padrão de referência para "custo da ficha em duas datas": o trecho de `entradasSemana` `:600-620` (resolver + custoFicha com tIni/tFim).
- Schema: `CompraItem` (`schema.prisma:4123`) tem `numeroNota`, `fornecedorNome`, `dataCompra`, `custoUnitario`, `estornado`, `semEstoque`. `PedidoItem` `:647`: `valor` (praticado), `valorBase` (tabela), `flexGerado` (= (valor-valorBase)*qtd, TOTAL do item, negativo = desconto dentro da regra de flex; vem 0 se a regra do vendedor não permite flex — `contaAzulService.js:1595`, `adminExec.js:5535`), `custoUnitarioSnapshot`/`custoSnapshotEm`/`fonteCustoSnapshot`. `Pedido`: `numero`, `bonificacao`, `especial`, `cancelado`, `clienteId`, `vendedorId`, `dataVenda`. Cliente: `UUID`, `Nome`, `NomeFantasia` (usar `NomeFantasia || Nome`, como `clientesTodos` `:870`). Vendedor: `nome`. Rótulo de número (copiar de `ListaPedidos.jsx:29`): `BN#n` se bonificacao, `ZZ#n` se especial, senão `#n`.
- Permissão: `routes/indicadoresGestao.js` — `exigir('completo')` = admin OU `Pode_Ver_Indicadores_Gestao===true` (lido do banco). O selo clicável só existe na visão Dono/`completa` (`TabelaProdutos.jsx`), logo a rota nova é **`exigir('completo')`** (traz preço, cliente, vendedor; NÃO usar `producao`).
- Links: ficha = `/pcp/receitas/:id` (App.jsx:965; `:id` é o id da **Receita**, `ReceitaDetalhe` usa `buscarPorId(id)`); menu usa `canPcp('receitas')` (`pcpPerms.receitas` ou admin, App.jsx:418-420). **Não existe filtro por produto na lista de pedidos** (`ListaPedidos.jsx` não lê query string) -> `links.pedidos = null` e o botão "Ver pedidos do produto" é OMITIDO nesta versão (conforme o dono: "se houver filtro; senão omitir").

## 1. CONTRATO JSON — `GET /api/indicadores-gestao/produtos/:produtoId/causas?de=YYYY-MM-DD&ate=YYYY-MM-DD`
Auth: `verificarAuth, exigir('completo')`. `de/ate` obrigatórios no mesmo formato do `/produtos`. Erros: 400 (período inválido, via `resolverPeriodo`), 403 (sem permissão), 404 `{error:'Produto não encontrado.'}`, 500 genérico. Moeda: R$ com 2 casas (round2); custo unitário/insumo com 4 casas (round4); pp com 1 casa; % com 1 casa; quantidades com 2 casas (round2); datas `YYYY-MM-DD` (fuso SP). Campos "number|null" = null quando não calculável (nunca 0 no lugar de desconhecido, nunca string "undefined").

```jsonc
{
  "produtoId": "uuid",
  "nome": "string",
  "classe": "FABRICADO|REVENDA|SEM_CLASSE",
  "unidade": "string",
  "periodo":  { "de": "YYYY-MM-DD", "ate": "YYYY-MM-DD" },
  "anterior": { "de": "YYYY-MM-DD", "ate": "YYYY-MM-DD" },        // = resolverPeriodo().anterior

  "decomposicao": {
    "comparavel": true,                  // bool: false se faltou venda/custo num dos períodos
    "motivoSemComparacao": null,         // string|null (texto pronto em pt-BR quando comparavel=false)
    "mcPctAntes": 84.0, "mcPctAgora": 81.3,   // number|null (1 casa) — iguais aos do painel
    "variacaoMcPp": -2.7,                // number|null = mcPctAgora - mcPctAntes (pp, 1 casa)
    "interacaoPp": -0.1,                 // number|null = variacaoMcPp - (custo.ppMargem + preco.ppMargem) (resíduo; front só mostra se |x|>=0.1)
    "mcTotalAntes": 0.0, "mcTotalAgora": 0.0, "variacaoMcTotal": 0.0,   // number|null, R$ (2 casas)
    "custo":  { "antes": 5.15, "agora": 5.91, "variacaoPct": 14.8, "ppMargem": -2.3, "impactoMcTotal": -33.44 },
    "preco":  { "antes": 32.16, "agora": 31.59, "variacaoPct": -1.8, "ppMargem": -0.4, "impactoMcTotal": -25.08 },
    "volume": { "antes": 119.00, "agora": 44.00, "variacaoPct": -63.0, "ppMargem": 0.0, "impactoMcTotal": -1900.00 },
    //  antes/agora/variacaoPct/ppMargem/impactoMcTotal: number|null cada. custo.* = custoVariavelUn (R$/un, 2 casas aqui; mesmos valores da tabela); preco.* = preço médio R$/un; volume.* = unidades.
    //  variacaoPct = (agora-antes)/antes*100 (1 casa); null se antes<=0.
    //  Os 3 impactoMcTotal (R$) SOMAM exatamente variacaoMcTotal.
    "maiorCausa": "custo"                // "custo"|"preco"|"volume"|null
  },

  "insumos": [                           // [] se não houver ficha nem compra; ordenar por |impactoUn| desc (nulls por último), depois nome
    {
      "itemPcpId": "uuid|null",          // null na linha única de revenda
      "nome": "string", "unidade": "string",
      "qtdPorUn": 0.45,                  // number (4 casas): qtd do insumo por UNIDADE do produto (explodirFicha: já com perda e SUB explodido; × fator se ficha de referência). Revenda: 1
      "custoAntes": 14.9,                // number|null (4 casas) último preço de compra ATÉ fim do período anterior
      "custoAgora": 18.4,                // number|null (4 casas) último preço ATÉ fim do período atual (limitado a hoje)
      "antesEstimado": false,            // true se não havia compra antes da data (usou a 1ª compra/preço gravado)
      "variacaoPct": 23.5,               // number|null (1 casa)
      "impactoUn": 1.5750,               // number|null (4 casas) = (custoAgora-custoAntes)*qtdPorUn
      "mudouEm": {                       // null quando não houve compra nova entre os dois cortes
        "numeroNota": "48213|null", "fornecedor": "string", "data": "YYYY-MM-DD",
        "compraAnterior": { "fornecedor": "string", "custo": 14.9, "numeroNota": "string|null", "data": "YYYY-MM-DD" } | null
      },
      "semCompra": false                 // true = nenhuma compra registrada (custo vem do preço gravado no cadastro)
    }
  ],
  "custoFichaAtual": 5.91,               // number|null (4 casas) ficha com ÚLTIMOS PREÇOS DE COMPRA até fim do período atual (revenda: último preço de compra)
  "custoFichaAnterior": 5.15,            // number|null idem até fim do período anterior (fecha com a soma dos impactoUn)
  "custoMedioGravado": 5.15,             // number|null custo gravado hoje (custoAgora(): FICHA -> custoManual -> CA); é o "custoFichaUn" da tabela
  "classe": "FABRICADO",                 // repetido de propósito (rodapé)
  "fichaDeReferencia": false,            // bool (true: ficha de outro produto × fator)

  "precoClientes": {
    "itens": [                           // TODOS os clientes que compraram no período (ordem: abaixo da tabela primeiro por perdidoRS desc, depois resto por qtd desc)
      {
        "clienteId": "uuid", "cliente": "string",
        "vendedorId": "string|null", "vendedor": "string|null",
        "qtd": 12.00,                     // total no período (2 casas)
        "qtdAbaixo": 12.00,               // unidades com praticado < tabela - 0,005
        "precoTabela": 32.16,             // médio ponderado (2 casas) = Σ(valorBase*q)/Σq
        "precoPraticado": 29.90,          // médio ponderado = Σ(valor*q)/Σq
        "diferencaPct": -7.0,             // number|null (1 casa) = (praticado-tabela)/tabela*100
        "perdidoRS": 27.12,               // Σ (valorBase-valor)*q só dos itens abaixo (2 casas; 0 se nenhum)
        "como": "flex|desconto_manual|abaixo_custo|tabela",
        "flexRS": 27.12, "manualRS": 0.00, // decomposição do perdido pela ORIGEM (flexRS+manualRS = perdidoRS)
        "abaixoCustoQtd": 0.00,           // unidades com praticado < custoVariavelUn do item (>0 só se custo conhecido)
        "pedidos": [ { "id": "uuid", "numero": 2041, "rotulo": "#2041" } ]  // pedidos com item abaixo; se o cliente não tem item abaixo, TODOS os seus pedidos do período
      }
    ],
    "resumo": { "qtdAbaixo": 24.00, "qtdTotal": 44.00, "perdidoRS": 95.40, "flexRS": 27.12, "manualRS": 68.28, "abaixoCustoQtd": 4.00 }
  },

  "bonificacoes": {
    "itens": [                           // 1 linha por pedido BN# (ordem: sem_retorno > dentro_prazo > comprou, depois data desc)
      {
        "pedidoId": "uuid", "numero": 118, "rotulo": "BN#118", "data": "YYYY-MM-DD",
        "clienteId": "uuid", "cliente": "string", "vendedorId": "string|null", "vendedor": "string|null",
        "qtd": 6.00,
        "custoRS": 35.46,                 // Σ qtd × custo do item (snapshot; sem snapshot -> custoAgora; sem custo -> 0 e semCusto=true)
        "semCusto": false,
        "comprouDepoisRS": 0.00,          // R$ do MESMO produto comprado pelo cliente em (data, data+30] (receita rule, valor*qtd)
        "comprouDepoisQtd": 0.00,
        "prazoAte": "YYYY-MM-DD",         // data + 30 dias
        "dentroPrazo": false,             // hoje(SP) < data+30
        "retorno": "sem_retorno|comprou|dentro_prazo"
      }
    ],
    "resumo": { "pedidos": 3, "qtd": 10.00, "custoRS": 59.10, "custoSemRetornoRS": 35.46 }   // custoSemRetornoRS = Σ custoRS dos 'sem_retorno'
  },

  "volumeClientes": {
    "itens": [                           // clientes com qtd>0 em qualquer dos 2 períodos (ordem: diferenca asc, i.e. maior queda primeiro)
      {
        "clienteId": "uuid", "cliente": "string", "vendedorId": "string|null", "vendedor": "string|null",
        "qtdAnterior": 40.00, "qtdAtual": 8.00, "diferenca": -32.00,   // atual - anterior (2 casas)
        "variacaoPct": -80.0,            // number|null (null se anterior=0)
        "ultimoPedido": { "id": "uuid", "numero": 2058, "rotulo": "#2058", "data": "YYYY-MM-DD" } | null,
        "diasSemComprar": null,          // int|null: só preenchido quando situacao='parou' = hoje(SP) - data do último pedido
        "situacao": "parou|reduziu|cresceu|estavel|novo"
      }
    ],
    "resumo": { "qtdAnterior": 119.00, "qtdAtual": 44.00, "unidadesAMenos": 75.00, "clientesQueda": 3, "unidadesQueda": 75.00 }
    //  unidadesAMenos = qtdAnterior - qtdAtual (pode ser <=0 -> front esconde a frase)
    //  clientesQueda/unidadesQueda = nº de clientes com situacao parou|reduziu e a soma das suas quedas (|diferenca|)
    //  frase: "{clientesQueda} clientes explicam {unidadesQueda} das {unidadesAMenos} unidades a menos"
  },

  "links": {
    "fichaTecnica": "/pcp/receitas/<receitaId>",   // string|null (null para revenda/sem ficha). Ficha de referência: a receita do produto de referência + fichaDeReferencia=true
    "pedidos": null                                // null nesta versão (não há filtro por produto na lista); front omite o botão
  }
}
```
Regras de borda do contrato: arrays sempre presentes (`[]`), objetos `resumo` sempre presentes com zeros; `decomposicao` sempre presente (campos numéricos null quando `comparavel=false`; `volume` continua calculado se houver qtd nos dois períodos). Nenhum campo novo no `/produtos` existente (não alterar).

## 2. FÓRMULAS (sem ambiguidade)
Seja P=preço médio, C=custoVariavelUn, q=qtd; a = anterior, n = atual (agora). P=receita/q; C=custoEf/q (mesma regra de `produtos()`: atual com fallback `custoFichaUn` se custoEf<=0; anterior só se `ant.custo>0`, igual `montarDetalheSituacao`). mc(P,C)=(P−C)/P*100 (null se P<=0). `comparavel` = qa>0, Pa>0, Ca>0 e mcAgora != null.
- **ppMargem custo** = mc(Pa, Cn) − mc(Pa, Ca) (preço fixo no anterior).
- **ppMargem preço** = mc(Pn, Ca) − mc(Pa, Ca) (custo fixo no anterior).
- **ppMargem volume** = 0 (volume não muda MC%).
- `interacaoPp` = (mcAgora − mcAntes) − (ppCusto + ppPreco).
- **impactoMcTotal (R$)**: volume = (qn−qa)·(Pa−Ca); preço = (Pn−Pa)·qn; custo = −(Cn−Ca)·qn. Soma = (Pn−Cn)·qn − (Pa−Ca)·qa exatamente.
- **maiorCausa**: entre custo e preço, o de menor ppMargem se ≤ −0,1; senão "volume" se volume.impactoMcTotal < 0; senão null. (Se `comparavel=false` -> null.)
- **Insumo**: cortes tA=fimDia(anterior.ate), tN=min(fimDia(periodo.ate), agora). custo na data = `ultimoPrecoAte(listaDoInsumo(idx, ip), t)` (se nenhuma compra: `resolverAtual(ip)` e `semCompra=true`; `antesEstimado=true` quando `estimado`). impactoUn=(custoAgora−custoAntes)·qtdPorUn. `custoFichaAtual/Anterior` = `custoFicha(receita, ctx, criarResolverNaData(idx), tN|tA).custoPorUnidade` × fator da ficha de referência. Soma dos impactoUn ≈ custoFichaAtual−custoFichaAnterior (ok divergir centavos de SUB com custo próprio). `mudouEm` = a compra (reg) escolhida para tN quando `reg.id != reg escolhido para tA`; senão null.
- **Como (por item, depois por cliente)**: item abaixo se `valor < valorBase − 0,005`. `abaixoCusto` = custo do item >0 e `valor < custoUnitario`. Origem do desconto: `flexGerado < 0` -> flex; senão -> manual. Perdido = (valorBase−valor)·q (só itens abaixo). Cliente: `como` = 'abaixo_custo' se abaixoCustoQtd>0; senão a origem com maior R$ (flexRS vs manualRS); senão 'tabela'. Abaixo do custo = só custo variável (decisão do dono; sem frete).
- **Retorno da bonificação**: janela = pedidos da regra de receita, mesmo produto, mesmo cliente, `ymd(data_venda) > ymd(BN)` e `<= ymd(BN)+30`. comprouDepois = Σ(valor·q) e Σq. `retorno`: Σq>0 -> 'comprou'; senão `hoje < BN+30` -> 'dentro_prazo'; senão 'sem_retorno'. `dentroPrazo` é independente do retorno. Janelas de BNs do mesmo cliente podem se sobrepor (aceito; documentar).
- **Situação do volume** (v=(qa'−qa)/qa): qa=0 & qn>0 -> 'novo'; qa>0 & qn=0 -> 'parou' (+diasSemComprar); v<=−0,20 -> 'reduziu'; v>=+0,05 -> 'cresceu'; senão 'estavel'. "reduziu X%" = |variacaoPct| arredondado a inteiro no texto. `ultimoPedido` = pedido mais recente (data_venda) do cliente na janela [anterior.de, periodo.ate]; vendedor do cliente = vendedor desse pedido.

## 3. PLANO BACKEND (dev-backend)
Arquivos: `backend/services/indicadoresGestaoService.js`, `backend/routes/indicadoresGestao.js`, `backend/services/indicadoresCustoService.js` (mudança aditiva mínima), manual do Clippy.
1. **Custo service (aditivo, não quebra consumidores)**: (a) `carregarCompras({..., comOrigem:true})` -> inclui `numeroNota` e `fornecedorNome` em cada reg só quando pedido (default igual hoje; chamado por entradasSemana, produtos, serieSemana... — **grepar TODO o repo** antes de tocar); (b) `ultimoPrecoAte` devolver também `compra: lista[achou]` (campo extra; quem ignora não quebra). Não mudar nenhum retorno existente.
2. **Service**: nova `async function causasProduto({ produtoId, de, ate })` exportada no `module.exports`. Estrutura: `resolverPeriodo` -> `custo.comCacheCompras('causas:'+id+':'+de+':'+ate, TTL, ...)`. Extrair helper `agregarProduto(rows)` (qtd/receita/custo) para decomposição bater com `produtos()` — **não reescrever a regra de venda**: reutilizar `carregarVendas()` (já em cache) para qa/qn/receita/custo agregados do produto (período atual e anterior) e `custo.custoAgora([id])` para o fallback do custo.
   Consultas (todas filtradas por `produto_id` = 1 produto, sem N+1):
   - Q1 `$queryRaw` itens do produto na regra de receita, `data_venda` em [inicioDia(anterior.de), fimDia(min(ate+30d, hoje))]: i.id, p.id, p.numero, p.especial, p.cliente_id, p.vendedor_id, p.data_venda, i.quantidade, i.valor, i.valor_base, i.flex_gerado, i.custo_unitario_snapshot, i.custo_snapshot_em, i.fonte_custo_snapshot. Particiona em JS: atual / anterior / pós-janela (bonificação). Preço-clientes e volume saem daqui. (Mesma condição `bonificacao=false AND (situacao_ca='FATURADO' OR especial=true)`; copiar o texto do `carregarVendas`.)
   - Q2 `$queryRaw` itens de pedidos `bonificacao=true AND cancelado=false` do produto em [de, ate]: idem campos. Custo da BN: snapshot se `custo_snapshot_em` não nulo, senão `custoAgora`, senão 0 + `semCusto`.
   - Q3 `cliente.findMany`/`vendedor.findMany` com `in` dos ids coletados (nome).
   - Compras: `classificarProdutos([id], ctx)` + `fichaEfetiva`; FABRICADO: `explodirFicha(receita, ctx, fator)` -> ids dos insumos -> `itemPcpPorId` -> `carregarCompras({itemPcpIds, produtoIds: ip.produtoId's, comOrigem:true})` (1 consulta); REVENDA/SEM_CLASSE: `carregarCompras({produtoIds:[id], comOrigem:true})` e UMA linha de insumo (o próprio produto, qtdPorUn=1, itemPcpId=null). Sem compra nenhuma na revenda -> `insumos: []`, `custoFichaAtual: null`.
   - `receitaId` do link = `ctx.receitaPorItemPcp.get(ipId).id`.
3. **Rota**: `router.get('/produtos/:produtoId/causas', verificarAuth, exigir('completo'), rota((req)=>gestao.causasProduto({produtoId:req.params.produtoId, de:req.query.de, ate:req.query.ate})))`. Ajustar o wrapper `rota` (routes `:41`) para também devolver `e.status===404` (hoje só 400) — aditivo; lançar `Error` com `status=404` quando o produto não existir (`prisma.produto.findUnique`).
4. **Casos**: sem ficha (revenda) -> ver acima; sem período anterior/sem venda -> `decomposicao.comparavel=false` + motivo (reaproveitar os textos de `montarDetalheSituacao`), cartões custo/preço/volume com `antes` null; blocos 3-5 continuam (volume: todos 'novo'); produto sem venda nenhuma no período -> arrays vazios, 200 (não 404). Sem snapshot e sem custoAgora -> custo null, `abaixoCustoQtd=0`.
5. Sem `$transaction`, sem escrita, sem mexer em schema. Round: usar `round2/round4/round1` do arquivo; `numOuNull` para null-safe.
6. **Manual/Clippy** (regra do CLAUDE.md): atualizar `backend/manuais/abas/indicadores-gestao.md` (nível 2 do selo; só quem tem Pode_Ver_Indicadores_Gestao). Não precisa mexer na tabela ABAS (rota/permissão da tela não mudam).
7. Teste: `node --check`, `curl` autenticado com o produto real (ver critérios) e com um produto REVENDA, um sem venda, `de>ate` (400), usuário só-produção (403).

## 4. PLANO FRONTEND (dev-frontend)
Arquivos: `frontend/src/pages/Dashboard/indicadores/PorQueSituacao.jsx` (edit), novo `CausasNivel2.jsx` (+ subcomponentes no mesmo arquivo ou `causas/*.jsx`), `frontend/src/services/indicadoresGestaoMock.js` (edit).
1. **Carga ao abrir, sem travar o nível 1**: dentro do `PorQueSituacao`, `const causas = useIndicador(\`produtos/${linha.produtoId}/causas\`, { de: atual?.de, ate: atual?.ate }, !!(atual?.de && atual?.ate));` (hook existente, `useIndicador.js`; 403 -> `proibido` -> nível 2 some em silêncio; erro -> bloco com mensagem + "tentar de novo" via `recarregar`; carregando -> skeleton/spinner só na área do nível 2). O nível 1 (frase + tabela + motivos) renderiza imediatamente como hoje. Passar `de/ate` do `detalhe.atual` (nunca recalcular datas no front).
2. **Layout**: o painel passa de `md:max-w-lg` para `md:max-w-4xl` (nível 2 tem tabelas largas); manter `max-h-[90vh] overflow-y-auto`, sticky header, Esc, portal. Ordem (como a proposta HTML `docs/proposta-por-que-causas.html`): frase-resumo -> tabela atual -> 3 cartões -> blocos 1-4 numerados -> ações -> regra no rodapé. Cartão "maior causa" = `decomposicao.maiorCausa`; `ppMargem` negativo em vermelho; volume mostra "não muda a MC %, mas a MC total caiu R$ x" (usar `impactoMcTotal`); mostrar `interacaoPp` só se |x|>=0,1 (nota discreta). Se `comparavel=false`: mostrar `motivoSemComparacao` no lugar dos cartões e seguir com os blocos.
3. **Blocos** (usar `fmtNum/fmtRS/fmtPct/fmtPctSinal/fmtData` de `formatos.js`; sempre `temValor` antes de interpolar — regra de template string; badges só com as cores do design system: sem_retorno/abaixo_custo/parou vermelho, flex azul, desconto_manual amarelo/âmbar, comprou/cresceu verde, dentro_prazo/estavel cinza, novo azul, reduziu âmbar):
   - Custo: tabela de insumos (qtdPorUn, custoAntes, custoAgora, variação, impactoUn, "onde mudou" = `NF {numeroNota} · {fornecedor} · {dd/mm}` + linha menor "compra anterior: {fornecedor} R$"); `semCompra` -> "sem compra registrada"; rodapé "Custo da ficha hoje {custoFichaAtual} · custo médio gravado {custoMedioGravado}" (+ anterior). Revenda: título "Compra do produto" e a linha única. Botão "Abrir ficha técnica" só se `links.fichaTecnica` **e** `canPcp('receitas')` equivalente (`isAdmin || user.permissoes.pcp.receitas` — espelhar App.jsx:418-420 exatamente); usa `navigate(links.fichaTecnica)` (mesma aba/PWA, nunca window.open); fechar o painel antes.
   - Preço, Bonificações, Volume: componente genérico `ListaCorte` (estado local `todos`), mostra `itens.slice(0,10)` e botão "Mostrar todos (N)" / "Mostrar menos" quando `itens.length > 10` (padrão do `TabelaProdutos.jsx`: `px-5 py-2.5 min-h-[44px]` pílula outline). Backend manda tudo; front corta. Resumos/rodapés vêm do `resumo` (nunca recalcular sobre a lista cortada).
   - **Mobile**: cada tabela vira cards `md:hidden` (cliente + badge + 3-4 pares dt/dd em `grid-cols-2 gap-x-3 gap-y-1.5`, como `TabelaProdutos`), tabela `hidden md:block overflow-x-auto`; sem scroll horizontal em 375px; alvos de toque >=44px; sem `absolute` negativo.
   - Sem botão "Mandar para o vendedor", sem "Registrar atendimento", sem "Ver pedidos do produto" (links.pedidos=null).
4. **Mock** (`mockIndicador` só roda em DEV quando a API dá 404): acrescentar no início de `mockIndicador` um ramo `if (/^produtos\/[^/]+\/causas$/.test(rota))` devolvendo o JSON do contrato com os números do HTML da proposta (3 cartões, 4 insumos, 4 clientes de preço incl. flex/manual/abaixo_custo/tabela, 3 BN: sem_retorno/comprou/dentro_prazo, 4 clientes de volume: parou/reduziu/reduziu/cresceu) + um caso com 12+ linhas em cada lista (para exercitar "Mostrar todos"). `buscarIndicador(rota,params)` já aceita rota com barras (BASE + '/' + rota).
5. Sem `useFiltrosSalvos` (não há filtro novo), sem `<select>`. Build obrigatório: `cd frontend && npm run build`. Entrega visível: página `novidade-<slug>.html` + entrada no topo de `frontend/public/novidades.json` (regra do CLAUDE.md, com mockups numerados, sem og:image) — coordenar com o gerente.

## 5. COSTURA back <-> front (os erros clássicos desta equipe — conferir um por um)
- Nomes EXATOS do bloco do item 1; `como`/`retorno`/`situacao`/`maiorCausa` com os valores literais listados (snake_case sem acento: `desconto_manual`, `abaixo_custo`, `sem_retorno`, `dentro_prazo`, `estavel`).
- Unidades: `diferencaPct`, `variacaoPct` em PONTOS PERCENTUAIS já ×100 (ex.: −7.0, não −0.07). `ppMargem` em pp. Front NÃO multiplica.
- `qtdPorUn` e custos de insumo têm 4 casas -> front formata com `fmtNum(x, 3|4)`; R$ de linha de cliente com 2.
- Datas `YYYY-MM-DD` -> `fmtData` (dd/mm).
- `periodo` enviado pelo front = `detalhe.atual.de/ate`; backend ecoa `periodo`/`anterior` — front pode conferir que `anterior` bate com `detalhe.anterior`.
- 403 = silêncio; 404/500 = mensagem com retry; mock só em DEV.

## 6. RISCOS / EFEITOS COLATERAIS
- `carregarCompras` e `ultimoPrecoAte` têm vários consumidores (indicadoresGestaoService produtos/entradasSemana/insumos, serieSemanal*, custoNaDataLote): só mudanças aditivas e opt-in; grepar o repo inteiro (inclusive import dinâmico) no PR.
- Divergência de números: o card "custo" usa `custoVariavelUn` (snapshot do custo na venda) e a tabela de insumos usa preços de COMPRA; podem não fechar (ex.: ficha desatualizada). Por isso o contrato traz `custoFichaAnterior/Atual/MedioGravado` e o rodapé explica. Não "forçar" que somem.
- Devolução não descontada no nível de item (igual ao painel) -> o volume/preço por cliente pode estar um pouco acima do líquido; avisar em nota de rodapé.
- Pedido ZZ# (especial) entra no preço/volume (regra de receita) — rótulo `ZZ#` correto. BN cancelada (`cancelado=true`) fora.
- `flexGerado` pode vir 0 em item abaixo da tabela (regra do vendedor não permite flex) -> cai em 'desconto_manual' (correto por definição).
- Performance: 4-5 consultas por abertura; cache 60 s com versão de compras; periodo máx. 13 meses (limite do resolverPeriodo) -> Q1 de 1 produto em ~14 meses de janela é pequena. Banco compartilhado lento: nada de loop com query.
- Janelas de bonificação sobrepostas do mesmo cliente contam a mesma compra duas vezes (documentado).
- Segurança: rota `completo` (dados de preço e cliente); não expor a visão de produção. Contrato `/api/ia-consulta/v1` NÃO é tocado.
- O que NÃO fazer: não alterar o retorno do `/produtos`; não reescrever a regra de receita (copiar a condição); não usar `window.open` para a ficha; não persistir nada; não criar `<select>` nativo; não pôr botão "Mandar para o vendedor"; não recalcular resumo no front sobre a lista cortada; não deixar "undefined" em texto; não gravar nada no banco.

## 7. CRITÉRIOS DE ACEITE / QA (clicando de verdade, desktop + 375px)
Pré-requisito: achar em `hardt_local` (ou dump) um produto que tenha cada situação; se faltar, o QA cria pedidos de teste no banco local (nunca produção). Lembrar: "local não é produção" — não reprovar por produto ausente, e sim criar o cenário.
1. Abrir Indicadores -> aba Dono -> clicar no selo de um produto com `agir/atenção`: nível 1 aparece na hora; nível 2 mostra spinner e depois carrega; derrubar a API (nível 2 dá erro) -> nível 1 continua, aparece mensagem + "tentar de novo".
2. Os valores dos 3 cartões batem com a tabela do nível 1 (custo/un e preço médio idênticos); soma dos `impactoMcTotal` = variação da MC total; só UM cartão com "maior causa".
3. **Caso flex**: cliente com item `flex_gerado<0` aparece com `como=flex`, `flexRS` = |Σ flex_gerado|, pedidos listados com `#n`/`ZZ#n`.
4. **Caso desconto manual**: item com `valor < valor_base` e `flex_gerado=0` -> `desconto_manual`; `perdidoRS` = (base−valor)·q; rodapé "flex + manual = perdido".
5. **Caso abaixo do custo**: `valor < custo_unitario_snapshot` -> badge `abaixo_custo`.
6. **BN sem retorno**: BN# com data > 30 dias atrás e sem compra do produto pelo cliente -> `sem_retorno` e entra em `custoSemRetornoRS`; BN recente sem compra -> "ainda dentro dos 30 d"; BN com compra do produto no intervalo -> "comprou N un" + R$. Conferir que compra de OUTRO produto não conta, e que BN cancelada não aparece.
7. **Cliente que parou**: cliente com venda no anterior e nenhuma no atual -> `parou` com "N d sem comprar" e último pedido; cliente com queda >=20% -> `reduziu X%`; com alta -> `cresceu`; frase "N clientes explicam X das Y unidades a menos" bate com a soma.
8. Fabricado: insumo cujo preço de compra mudou no período mostra NF/fornecedor/data e `impactoUn = Δpreço × qtdPorUn`; insumo sem compra nova mostra "sem compra nova"; rodapé mostra ficha hoje × custo médio gravado. Revenda: mostra só a compra do produto; produto sem ficha nem compra: bloco com estado vazio, sem erro.
9. Listas 3, 4, 5 com >10 linhas mostram 10 + "Mostrar todos (N)" e voltam com "Mostrar menos"; com <=10, sem botão.
10. Produto sem venda no período anterior: cartões trocam por aviso "não dá para comparar"; blocos 3-5 continuam funcionando.
11. Permissão: usuário só com `Pode_Ver_Indicadores_Producao` não vê selo clicável (e `curl` na rota -> 403); usuário com Gestão vê tudo; "Abrir ficha técnica" some para quem não tem `pcp.receitas`; link abre `/pcp/receitas/:id` dentro do app.
12. Mobile 375px: tabelas viram cards, sem scroll horizontal, botões >=44px, painel sobe de baixo (`rounded-t-2xl`). `npm run build` passa; `node --check` do service/rota; revisor confere que nada do `/produtos` mudou e que `carregarCompras`/`ultimoPrecoAte` seguem compatíveis com todos os consumidores.

Arquivos de referência (absolutos, no repo de trabalho `~/Projetos/CA-Hardt`): backend/services/indicadoresGestaoService.js, backend/services/indicadoresCustoService.js, backend/routes/indicadoresGestao.js, backend/prisma/schema.prisma (PedidoItem :647, Pedido :500, CompraItem :4123), frontend/src/pages/Dashboard/indicadores/PorQueSituacao.jsx, TabelaProdutos.jsx, formatos.js, Bloco.jsx, useIndicador.js, frontend/src/services/indicadoresGestaoApi.js, indicadoresGestaoMock.js, frontend/src/pages/Pedidos/ListaPedidos.jsx (:29 rótulo), docs/proposta-por-que-causas.html, backend/manuais/abas/indicadores-gestao.md.
