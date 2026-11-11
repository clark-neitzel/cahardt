# Plano — etiqueta 100×120 padrão para todo pedido (normal, especial, bonificação) e amostra (11/11/2026)

Pedido do dono: "Quero poder tirar etiqueta de todos os tipos de pedido: Pedido, Especial... Deixe como padrão.
Sempre deve entrar em uma etiqueta os produtos." Base: etiqueta da amostra (commits de3720a6 / 8db9ea36 / 46ed0b15).

## 1. Entendimento
Etiqueta única, mesmo desenho, para todo tipo de pedido e para a amostra. Muda a faixa do topo e o número.
Produtos nunca ficam de fora: se não couber, continua em outra etiqueta (1/2, 2/2).
Data de entrega do pedido = `Pedido.dataVenda` ("Data para entrega") + `horaEntrega` (igual `ImpressaoPedido.jsx:200`). Vendedor = `pedido.vendedor?.nome`.

## 2. Mapa do código
- `frontend/src/pages/Pedidos/etiquetaAmostra.js`: `dadosEtiquetaAmostra` (l.40), `montarEtiquetaAmostra` (l.78, conta de altura; corte "+N itens" nas l.97-112 → sai), `prepararEtiquetaAmostra` (l.169, `{bitmaps:[1]}` 800×960).
- `EtiquetaAmostraModal.jsx`: busca completa ao abrir; prévia escopada `prev-etq-amostra`; cópias 1-99; `ImprimirDireto origem="AMOSTRA"`; `onImpresso` avança SOLICITADA→PREPARACAO; `imprimirNavegador` com `@page 120mm 100mm`, `.pg` girada 90°.
- `ListaPedidos.jsx`: `fmtNumero` l.31; estado `etiquetaAmostra` l.253; `Tag` nos cards de amostra l.1374/1434; modal l.2374; card de pedido l.1480-1760 (linha 3 de botões ~l.1640; Imprimir via `handlePrintPedido` l.847); modal de detalhe l.1810+ (Imprimir no rodapé).
- Backend `backend/routes/impressaoEtiquetasRoutes.js`: `ORIGENS` l.21-27; `TIPOS_REFERENCIA` l.28 (já aceita 'PEDIDO'); `podeOrigem` l.39 (AMOSTRA = `pedidos.view===true || pedidos.edit===true`); `validarCorpo` l.82-104; `POST /` l.108+; l.187 tipos de trabalho consultáveis.
- `backend/services/etiquetaBitmapRender.js`: `renderZplImagem` l.104, `dividirEmTrabalhos` l.121, `MAX_FORMULARIOS_POR_TRABALHO=40`, `MAX_TRABALHOS=3`.
- `frontend/src/pages/PCP/ImprimirDireto.jsx`: `copias` só vai para PRODUTO/FUNCIONARIO_PASTA; `bloqueioTeto` para os demais. `useEnvioBitmap.js` (~l.108) repassa `copias`, `bitmaps`, `sequencia`.

## 3. ACHADO CRÍTICO
`validarCorpo` (l.91, `cfg.usaCopias`) exige exatamente 1 imagem para origem 100×120 ZPL e proíbe `sequencia`. Só o caminho das caixas (EPL2 40×25, `usaCopias:false`) aceita `bitmaps[]` + `sequencia`. Logo "N etiquetas por pedido" exige backend. Cópias ordenadas (1/2,2/2,1/2,2/2) não podem usar `^PQ` (repetiria a 1/2 inteira antes da 2/2).

## 4. Plano
### dev-backend (primeiro)
1. `ORIGENS.PEDIDO = { tamanho:'100x120', linguagem:'ZPL', tipo:'ETIQUETA_PEDIDO', usaCopias:false, zplSequencia:true }`; aceitar `ETIQUETA_PEDIDO` na lista da l.187.
2. `validarCorpo`: quando `cfg.zplSequencia`, exigir `bitmaps` (1..60) e `sequencia` (índices válidos, máx. ~120); recusar `copias != 1`. Ramos `usaCopias` e EPL2 intactos (PRODUTO, FUNCIONARIO_PASTA, AMOSTRA, caixas).
3. `POST /`: no ramo novo, conteúdo ZPL = um bloco `^XA…^XZ` por item da sequência (reaproveitar `renderZplImagem` com `copias:1`; `svc.compressaoGf` uma vez). Dividir em trabalhos de até 40 blocos (MAX_TRABALHOS=3 → 120 etiquetas), chave `etq-PEDIDO-<requisicaoId>-<n>` (idempotência). Conferir em `impressaoService.enfileirar`/agente se vários `^XA` num trabalho são aceitos (testar com agente real ou simulado); se não, 1 trabalho por bloco respeitando o teto.
4. `podeOrigem`: `if (origem === 'PEDIDO') return p.pedidos?.view === true || p.pedidos?.edit === true;` Front espelha. Nunca `!!p.pedidos`.
5. NÃO remover `AMOSTRA` do backend (PWA em cache com versão antiga).

### dev-frontend
6. Novo `frontend/src/pages/Pedidos/etiquetaPedido.js` generalizando `etiquetaAmostra.js`.
   - Formato normalizado `{ tipo, numeroTxt, nome, razao, endereco, cidade, telefone, lead, entrega, vendedor, obs, itens:[{nome,qtd,un}], semValor }`; `tipo` ∈ PEDIDO | ESPECIAL | BONIFICACAO | AMOSTRA.
   - Faixa: "PEDIDO" / "PEDIDO ESPECIAL" / "BONIFICAÇÃO" / "AMOSTRA". Número: `#N` / `ZZ#N` / `BN#N` / `AM#N` (regra de `fmtNumero`, exportada de um util, não copiada; rascunho = "(rascunho)").
   - `semValor` ("SEM VALOR COMERCIAL") só AMOSTRA e BONIFICACAO; pedido normal/especial: rodapé "HARDT DOCES E SALGADOS · data".
   - Adaptadores: `deAmostra(a)` = `dadosEtiquetaAmostra` atual + `tipo:'AMOSTRA'`; `dePedido(p)`: nome = `NomeFantasia || Nome`; razão/endereço/cidade/telefone como na amostra; `entrega` = `dataBr(dataVenda)` + `horaEntrega`; `vendedor` = `p.vendedor?.nome`; `obs` = `p.observacoes`; itens `nomeProduto || produto?.nome`, `quantidade`, `produto?.unidade`; prefixo "Amostra - " só sai em AMOSTRA. Rótulo do vendedor: um só ("VENDEDOR").
7. `montarEtiquetaPedido(dados, { pagina, total })` → `{estilos, corpo, dados, paginas}`. Paginação:
   - Reaproveitar a conta de altura. Etiqueta 1 = cabeçalho completo (faixa, destinatário, datas, obs). Etiquetas 2+ = cabeçalho reduzido (faixa com "2/2", nome em 1 linha, número), sem datas/obs.
   - Fonte 12pt → piso **8pt** (não 6pt: ilegível a 203 dpi); só então quebra. 2 colunas acima de 8 itens.
   - Calcular capacidade da página 1 e das seguintes à fonte mínima; distribuir sem cortar item. Nome longo continua com reticências em 1 linha; quantidade sempre aparece.
   - Faixa mostra "1/2". **Remover** `itensOcultos`/"+ N itens". Obs longa: `height:10mm` + overflow; se cortar, modal avisa (`cortou`).
   - **Sem área preta cheia** (ribbon da Zebra) — comentário no topo repetindo a regra.
8. `prepararEtiquetaPedido(dados)`: rasteriza todas as páginas → `{ bitmaps:[b1..bN] }` (800×960 cada, validados). Modal monta `sequencia` = `[0..N-1]` repetido `copias` vezes (2 páginas × 3 cópias = `[0,1,0,1,0,1]`); `preparar` devolve `{bitmaps, sequencia}` (`useEnvioBitmap` repassa). `rasterizarEtiquetas({itens:[...]})` já aceita N (`etiquetaRaster.js:368`); confirmar seletor `.etq`. MAX_BITMAPS=60.
9. `EtiquetaAmostraModal.jsx` → `EtiquetaPedidoModal.jsx` genérico, props `{ pedido?, amostra?, onClose, onStatus }`.
   - Abertura: amostra → `amostraService.buscarPorId`; pedido → `pedidoService.buscarPorId(id)` (l.50). Sempre busca o completo.
   - `ImprimirDireto origem="PEDIDO"` (amostra também migra para PEDIDO); `copias` vai embutido na `sequencia`; `total={paginas*copias}`; `referencia={{ tipo:'PEDIDO', id, rotulo }}`.
   - Aviso âmbar "Esta impressão sai em N etiquetas" quando `paginas>1`; mostra "N etiquetas × C cópias = T".
   - Prévia: N páginas empilhadas no mesmo scale; CSS escopado por id/classe.
   - Navegador: `.pg` por etiqueta, `qtd × paginas` na ordem 1,2,1,2; manter `@page 120mm 100mm`, rotação 90°, `print()` síncrono.
   - `aoImprimir`: só avança status se for amostra SOLICITADA; pedido não chama nada.
10. `ListaPedidos.jsx`: estado `etiquetaPedido`; botão `Tag` "Etiqueta" em TODO card de pedido (normal, especial, bonificação, inclusive cancelado), ao lado do Imprimir, `min-h-[44px] min-w-[44px]` no mobile, `title="Etiqueta (100 × 120)"`, `data-etiqueta-pedido`; mesmo botão no rodapé do modal de detalhe. Render do modal junto do de amostra. **Não tocar** `handlePrintPedido`, `ImpressaoPedido`, `imprimirSelecionados`. Permissão espelha o backend (`pedidos.view === true || edit === true`).
11. Sem `window.open`/iframe; `imprimirNaPagina` cobre o iPad.
12. Docs: `frontend/public/novidade-etiqueta-pedido.html` (hero, mock da etiqueta em 2 versões, mock do card com o ícone, pins, accordions `aberto`, sem `og:image`, sem "Abrir o app"); entrada no topo de `novidades.json`; `backend/manuais/abas/pedidos.md` (seção Amostras l.242-247 + botão em todos os cards + várias etiquetas + "SEM VALOR COMERCIAL"). `ABAS` não muda.

## 5. Riscos
- Backend item 3 é o mais arriscado: agente pode tratar vários `^XA` num trabalho como uma etiqueta só. Testar impressão real antes de dizer pronto.
- Origem `AMOSTRA` em cache (PWA): manter no backend por um ciclo.
- Dupla impressão: `ImprimirDireto` bloqueia 2º clique; chave `etq-PEDIDO-<req>-<n>` idempotente.
- `GET /pedidos/:id` precisa de `cliente` (End_*, telefones), `vendedor.nome`, `itens[].produto.unidade` — **conferir `produto.unidade`** antes de assumir.
- Pedido sem endereço/telefone: linha some (como hoje).
- Antes de renomear: `grep -rn "etiquetaAmostra\|EtiquetaAmostraModal\|dadosEtiquetaAmostra\|nomeItemAmostra" frontend/src` (inclui import dinâmico).
- `carregarFontesFuncionario()` antes de rasterizar.

## 6. Não fazer
Tarja/fundo preto; esconder itens ou "+N itens" em qualquer tipo; `^PQ` para conjunto paginado; mexer em `ImpressaoPedido`, "Imprimir selecionados", NF-e, WhatsApp; gravar `impressoEm`; `window.open`/iframe/`<select>` nativo; permissão front ≠ back.

## 7. Roteiro de QA (clicar; Zebra via fila local sem impressora)
1. Pedido normal 3 itens: `Tag` no card (desktop) e mobile 375px (44px, sem scroll horizontal). Prévia: "PEDIDO", `#N`, entrega data+hora, vendedor, 3 itens, rodapé SEM "SEM VALOR COMERCIAL". 1 etiqueta.
2. Especial 25 itens: "PEDIDO ESPECIAL", `ZZ#N`; modal "sai em N etiquetas" (≥2); prévia 1/2 e 2/2 com cabeçalho repetido; todos os 25 itens, nenhum "+N". Cópias=2 → total 2N.
3. Bonificação: "BONIFICAÇÃO", `BN#N`, rodapé "SEM VALOR COMERCIAL".
4. Amostra (regressão): desenho igual, "AMOSTRA"/`AM#N`; imprimir (navegador e Zebra) leva SOLICITADA→PREPARACAO; PREPARACAO não muda; pedido normal nunca chama status.
5. Muitos itens com nomes longos: quantidade nunca cortada.
6. Zebra via fila: "Imprimir na Zebra" → 201 + trabalho na fila, `tipo='ETIQUETA_PEDIDO'`, conteúdo com N blocos `^XA`. 2º clique durante `fila` bloqueado. 403 via curl sem `pedidos.view` e botão ausente para ele.
7. Navegador: 120×100 paisagem; N páginas na ordem 1,2,1,2.
8. Build do frontend sem erro.

## 8. Checklist do revisor
Ramos antigos de `validarCorpo` intactos; ramo novo valida índices/limites/`copias`. Permissão front = back (objeto, `=== true`). Nenhum "+N itens"; nenhuma área preta. `onImpresso` só avança amostra; falha não derruba impressão. Sem `window.open`/iframe; `print()` síncrono; restauração. Opcionais protegidos (sem "undefined"). Manual, `novidades.json` e novidade atualizados; sem `og:image`. Mobile 375px; 44px.

## 9. Aceite
Todo card de pedido (normal, especial, bonificação) e de amostra abre a etiqueta; pedido grande sai em várias etiquetas sem perder item; cópias em ordem; amostra igual e avança status; Zebra e navegador OK; permissões iguais; build passa; anúncio e manual publicados.

## 10. Decisões assumidas (dono pode mudar)
Pedido cancelado imprime etiqueta (sim, sem bloquear); piso de fonte 8pt; amostra e bonificação levam "SEM VALOR COMERCIAL".
