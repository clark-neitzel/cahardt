# Relatório — Backend Etapa 1 "Entrada de Notas cria Produto de verdade"

Branch `feat/entrada-notas-produto`, worktree `~/Projetos/CA-Hardt-entrada-notas`. Segue
`docs/entrada-notas/plano-etapa1.md` (contrato backend, seções 1–5). **Nada foi commitado.**

## (a) Causa raiz

Não é correção de bug — é a implementação do plano aprovado: a conferência de nota criava
um `ItemPcp` solto (sem `Produto` por trás) pelo botão "+ Criar item PCP", o que gerava
insumos sem categoria, sem controle de estoque e sem forma de virar produto de verdade
(112 casos em produção, ver `proposta-entrada-notas-2026-09.html` seção 1).

## (b) Contrato REAL da API para o frontend

### 1. Produto

- **`backend/services/produtoService.js`** (novo) — `criar(dados, usuario, db = prisma)`.
  - Aceita: `nome` (obrigatório), `codigo?`, `ean?`, `ncm?`, `unidade`, `categoria`
    (**obrigatória** — precisa bater com um nome já cadastrado em `categorias_estoque`,
    canonizado por acento/caixa/espaço), `categoriaProdutoId?`, `controlaEstoque?`
    (`true`/`false`/omitido → segue a categoria), `valorVenda?`, `descricao?`,
    `nomeOrigemNota?`, `notaOrigemId?`.
  - Erros: `400` nome vazio / valor inválido / categoria vazia / categoria não encontrada
    (mensagem já indica "Cadastre-a em Configurações → Categorias de Estoque") / nome
    duplicado (case-insensitive); `502` se falhar ao criar na Conta Azul (só quando
    `CA_SOMENTE_LEITURA` for `false` — hoje é sempre `true`, então nunca acontece).
  - **⚠️ Mudança de contrato que afeta a tela existente Admin → Produtos → "Criar produto
    novo" (`ListaProdutos.jsx`)**: antes a categoria era opcional (`novoProduto.categoria`
    nasce `''`, placeholder "Sem categoria"). Agora **toda criação de produto passa a
    exigir categoria válida** — essa tela vai começar a devolver 400 se o usuário deixar
    a categoria vazia ou digitar algo que não bate com nenhuma `CategoriaEstoque`. O
    dev-frontend precisa trocar o campo livre por um `SelectBusca` das categorias
    cadastradas (obrigatório) antes de publicar.
  - `POST /api/produtos` (`produtoController.criar`) passou a delegar para este service —
    mesmo contrato de request/response de antes, só que agora com a validação de
    categoria acima.

- **`PUT /api/produtos/:id`** (`produtoController.atualizar`) — `ncm` e `ean` entraram na
  whitelist de campos editáveis (antes só existiam na criação/sync do CA). Aceitam texto
  livre; `ncm` vazio vira `null`, `ean` vazio vira `''` (mesmo padrão da criação).

- **`GET /api/produtos/:id`** (`produtoController.detalhar`) — resposta ganhou 3 campos
  novos (best-effort, nunca derruba a rota se falharem):
  ```json
  {
    "...campos existentes...": "...",
    "nomeOrigemNota": "string|null",
    "notaOrigemId": "string|null",
    "notaOrigem": { "numero": "string|null", "fornecedorNome": "string", "emissao": "date|null" } | null,
    "vinculosFornecedor": [
      { "fornecedorCnpj": "string", "fornecedorNome": "string|null", "codigoFornecedor": "string", "descricaoFornecedor": "string|null" }
    ]
  }
  ```

### 2. Conferência de nota (`backend/routes/notasEntrada.js`)

Rotas afetadas: `POST /:id/gerar-conta`, `POST /:id/registrar-entrada`,
`POST /:id/corrigir-entrada-estoque`.

- **`criarItemPcp` foi DESATIVADO.** Qualquer item do corpo com `criarItemPcp` recebe
  **400**: `{"ok":false,"error":"Criar item PCP direto da conferência não é mais
  permitido — crie um produto (categoria Matéria-Prima ou Embalagem vira insumo do PCP
  automaticamente)."}` — testado, confirmado.
- **`criarProduto` é o substituto**, no mesmo lugar do corpo (por item, ao lado de
  `vinculo`/`fatorConversao`):
  ```json
  { "itemId": "...", "criarProduto": {
      "nome": "string (obrigatório)",
      "categoria": "string (obrigatório, nome de CategoriaEstoque existente)",
      "categoriaProdutoId": "string|opcional",
      "controlaEstoque": "true|false|omitido",
      "unidade": "string (obrigatório)",
      "ean": "string|opcional (senão usa o EAN do XML)",
      "ncm": "string|opcional (senão usa o NCM do XML)"
  } }
  ```
  **Não aceita `codigo`** (fora do contrato do plano — se precisar, edite o produto
  depois). Validação prévia (antes de abrir a transação): nome/unidade/categoria não
  vazios e a categoria precisa existir em `categorias_estoque` — senão **400** com
  `{"ok":false,"error":"Categoria de estoque \"X\" não encontrada (item \"...\"). Cadastre-a
  em Configurações → Categorias de Estoque antes de usá-la."}`.
- Produto criado ganha `nomeOrigemNota` = descrição do item na nota (xProd) e
  `notaOrigemId` = id da nota. `ean`/`ncm` vêm do corpo se informados, senão do próprio
  item da nota.
- **Categoria "Matéria-Prima" ou "Embalagem"** (comparação sem acento/caixa/hífen, via
  `categoriaEstoqueService.tipoPcpDaCategoria`) → o produto ganha **também** um `ItemPcp`
  espelho (`MP`/`EMB`) via `pcpItemService.importar`, tudo na MESMA transação. O item da
  nota fica vinculado ao **`produtoId`** (não ao `itemPcpId` do espelho) — é o produto
  quem controla estoque/custo; o espelho no PCP existe só para receitas.
- **Retorno**: os 3 endpoints (`gerar-conta`, `registrar-entrada`,
  `corrigir-entrada-estoque`) agora incluem
  `"produtosCriados": [{ "id", "nome", "codigo", "categoria", "itemPcpId": "string|null" }]`
  — um item por produto criado nesta chamada (para o toast da tela).
- **`MOTIVOS_SEM_ESTOQUE` ganhou `IMOBILIZADO`**: agora é
  `['SERVICO','FRETE','IMPOSTO','CONSUMO_IMEDIATO','IMOBILIZADO','OUTRO']`. Só existe essa
  única lista no backend (`routes/notasEntrada.js`); o frontend
  (`NotasRecebidasPage.jsx`) tem o próprio mapa de rótulos e precisa acrescentar
  `IMOBILIZADO` lá para o novo motivo não aparecer sem legenda.

### D1 — entrada de estoque respeita a categoria do produto (`notaEstoqueService.js`)

`aplicarEstoqueNota` (destino `PROD`) agora chama
`estoqueService.produtoControlaEstoque(produto)` antes de somar:

- **Controla estoque** → comportamento de sempre (soma `estoqueTotal`/`estoqueDisponivel`,
  grava `MovimentacaoEstoque`, `CompraItem`, ledger `NotaEntradaEstoqueMov`, recalcula
  custo pela regra de compras válidas).
- **NÃO controla estoque** → não soma quantidade, não mexe em `custoManual`/custo médio,
  **não grava linha no ledger** (não houve movimento de estoque para registrar), mas
  **grava `CompraItem`** com o novo campo **`semEstoque: true`** (histórico de
  preço/fornecedor). O retorno do endpoint (`estoque: [...]`) marca esse item com
  `"semEstoque": true` também.
- Produto **sem categoria e sem override** (`controlaEstoque == null`) → tratado como
  "não controla" (comportamento já existente de `categoriaControlaEstoque`) e agora entra
  um aviso explícito em `estoqueAvisos`: `Produto "X" está sem categoria de estoque —
  tratado como "não controla estoque" nesta entrada (confira a categoria dele).`
- O **estorno por nota inteira** (`estornarEstoqueNota`) já marca TODO `CompraItem` da
  nota como estornado, `semEstoque` incluso — nenhuma mudança precisou ser feita ali.
- **Ajuste feito durante o teste**: `entradaLegado`/`estoqueAplicado` (usadas por
  `corrigir-entrada-estoque` e pela tela de correção) agora **excluem** `CompraItem` com
  `semEstoque: true` da leitura de "o que está aplicado hoje" — sem isso, uma nota cujo
  ledger ficasse vazio (ex.: só sobrou um item "sem estoque" depois de uma correção)
  cairia no fallback legado e a correção tentaria refazer custo médio de um produto que
  nunca teve custo médio tocado. Achei esse bug rodando o teste #2 do plano de verdade
  (ver evidências) e corrigi antes de reportar como pronto.

### 3. PCP — órfãos (D3) (`backend/services/pcpItemService.js` + `backend/routes/pcpItemRoutes.js`)

- **`POST /api/pcp/itens/:id/promover-produto`** — body
  `{ nome?, categoria, categoriaProdutoId?, controlaEstoque? }`. Só para item com
  `produtoId == null`. Roda em `$transaction({ timeout: 20000, maxWait: 10000 })`.
  - `404` item não encontrado; `400` já vinculado a produto; `400` SUB resultado de
    receita ativa ("é um subproduto de verdade, não dá para promover a produto").
  - Cria o Produto (ean/ncm do **último `NotaEntradaEstoqueMov` + `NotaEntradaItem`**
    ligados ao insumo — é a única fonte que guarda essa referência, já que
    `NotaEntradaItem` não tem `itemPcpId` direto); `nomeOrigemNota` = nome atual do item.
  - Categoria mapeia para **MP/EMB** (mesma regra da conferência): item **continua
    ativo**, vira o espelho (`tipo` ajustado, `codigo` mantido). Qualquer outra categoria:
    item **inativado** (`ativo: false`), `estoqueAtual` **NÃO** é somado ao produto — fica
    registrado no retorno.
  - Migra `FornecedorProdutoVinculo` (`itemPcpId` → `null`, `produtoId` → novo produto —
    nunca os dois setados, mesmo invariante da conferência).
  - Resposta: `{ produto, item, tornouEspelhoPcp: bool, estoqueNaoTransferido: number }`.
- **`PUT /api/pcp/itens/:id`** — item órfão (`produtoId == null`) agora aceita `tipo`
  (MP/SUB/PA/EMB) no corpo, **exceto** se for `SUB` resultado de receita ativa (`400`).
- **`DELETE /api/pcp/itens/:id`** (nova rota) — só remove órfão **sem nenhum uso**:
  receita (resultado ou ingrediente), ordem de produção/consumo, movimentação PCP, ledger
  de nota, `CompraItem` ou de-para de fornecedor. Senão **409** listando os motivos, ex.:
  `"Não dá para excluir: este item é resultado de uma receita, é ingrediente de uma
  receita. Use \"Inativar\" em vez de excluir."` — item vinculado a produto dá `409`
  diferente ("não é órfão"). Sucesso: `204`.
- **`GET /api/pcp/itens`** — cada linha ganhou `"podeExcluir": boolean` (só calculado para
  órfãos; item vinculado a produto sempre `false`) — a tela decide o botão sem bater uma
  rota por linha.

### 4. D4 — Categorias comerciais

`categoriaProdutoService.atualizar` (usado por `PUT /api/categorias-produto/:id`) agora
**ignora silenciosamente** `controlaEstoque` no corpo — nunca mais grava esse campo. Ele
continua no schema (`categorias_produto.controla_estoque`), só não é mais editável por
aqui. `criar`/`POST` não foi tocado (não estava no escopo do plano).

## (c) Arquivos alterados

- `backend/prisma/schema.prisma` — **só adições**: `Produto.nomeOrigemNota`,
  `Produto.notaOrigemId` (mapeiam `nome_origem_nota`/`nota_origem_id`, sem relation);
  `CompraItem.semEstoque` (`sem_estoque`, default `false`).
- `backend/services/produtoService.js` — **novo**. `criar()` extraído/generalizado de
  `produtoController.criar`.
- `backend/controllers/produtoController.js` — `criar` delega ao service; `atualizar`
  ganhou `ncm`/`ean` na whitelist + normalização; `detalhar` ganhou `notaOrigem` +
  `vinculosFornecedor`.
- `backend/routes/notasEntrada.js` — `criarItemPcp` recusado (400); `criarProduto` novo
  (validação + criação via `produtoService`/`pcpItemService`); `MOTIVOS_SEM_ESTOQUE` +
  `IMOBILIZADO`; `processarItensConferencia` devolve `{ vinculados, produtosCriados }`;
  `validarItensBody` ficou **assíncrona** (valida existência da categoria); 3 rotas
  (`gerar-conta`, `registrar-entrada`, `corrigir-entrada-estoque`) devolvem
  `produtosCriados` e propagam `error.status` quando o service lança erro tipado; removido
  helper morto `proximoCodigoItemPcp` (só existia para o `criarItemPcp` antigo).
- `backend/services/notaEstoqueService.js` — D1 no destino `PROD` de `aplicarEstoqueNota`
  (checa `produtoControlaEstoque`, pula estoque/custo, grava `CompraItem` `semEstoque`);
  `criarCompraItem` ganhou parâmetro `extra` (`semEstoque`); `entradaLegado` e
  `estoqueAplicado` passaram a excluir `semEstoque: true`.
- `backend/services/pcpItemService.js` — `importar` aceita `db` (tx) opcional;
  `atualizar` permite `tipo` em órfão (bloqueia SUB-resultado-de-receita-ativa);
  `promoverProduto` (novo); `excluir` (novo); `listar` ganhou `podeExcluir`.
- `backend/routes/pcpItemRoutes.js` — `POST /:id/promover-produto` (novo, com
  `$transaction` `{timeout:20000,maxWait:10000}`), `DELETE /:id` (novo), `PUT /:id`
  propaga `error.status`.
- `backend/services/categoriaEstoqueService.js` — `tipoPcpDaCategoria` (novo, exportado;
  usado por `notasEntrada.js` e `pcpItemService.js` — evita duplicar a normalização de
  nome em dois arquivos).
- `backend/services/categoriaProdutoService.js` — `atualizar` ignora `controlaEstoque`.

## (d) Diferente do plano, e por quê

1. **`processarItensConferencia` não seta `itemPcpId` no vínculo do item da nota quando
   cria o espelho MP/EMB.** O plano diz "o vínculo do item vira `produtoId`" — segui
   literalmente: `vinculados` e a memória `FornecedorProdutoVinculo` só recebem
   `produtoId`, nunca os dois ao mesmo tempo (é um invariante que já existia no código:
   "nunca deixar os dois setados"). O `ItemPcp` espelho é só registrado no retorno
   (`produtosCriados[].itemPcpId`) para a tela mostrar.
2. **"migra... `NotaEntradaItem.produtoId`" não existe no schema** — `NotaEntradaItem`
   nunca teve coluna `produtoId`/`itemPcpId` (o vínculo mora só em
   `NotaEntradaEstoqueMov`/`FornecedorProdutoVinculo`/`CompraItem`). Interpretei como
   "enriquecer o ledger/histórico de compras com o novo `produtoId`, mantendo
   `itemPcpId`" (que É um campo real nessas duas tabelas) — implementado em
   `promoverProduto` via `updateMany` em `notaEntradaEstoqueMov`/`compraItem` (só nas
   linhas que ainda não tinham `produtoId`). Isso preserva o histórico de compras do
   insumo antigo, visível agora também pela ficha do produto novo.
3. **`produtoService.criar` roda dentro da transação da conferência** (network para a
   Conta Azul dentro de `$transaction` é proibido pelas regras do projeto). Isso só é
   seguro porque `CA_SOMENTE_LEITURA` está sempre `true` neste código — o bloco de rede
   vira código morto. Documentei isso em comentário no próprio service e adicionei uma
   trava: se algum dia `CA_SOMENTE_LEITURA` virar `false`, chamar `criar()` passando uma
   transação (`db !== prisma`) lança erro explícito em vez de arriscar travar o banco numa
   chamada HTTP. **Risco residual**: se o dono religar o envio ao CA no futuro, esse
   caminho (conferência de nota + promoção de item PCP) vai quebrar com esse erro
   proposital — quem for mexer nisso precisa tirar a criação de produto de dentro da
   transação nesse cenário.
4. **Categoria "Matéria-Prima"/"Embalagem" tiveram que ser SEMEADAS no banco local**
   (não existiam em `hardt_local`, só em produção). Não é mudança de código — rodei
   `categoriaEstoqueService.salvar` uma vez via script, igual D2 pede ("localmente, criar
   se faltar"). Não commitei nada disso (é dado, não schema).
5. **`db push` não pôde rodar de verdade** — o `hardt_local` tem uma tabela
   (`pagamentos_apos_quitacao_avisos`, 2 linhas) que não existe em `schema.prisma` desta
   árvore, aparentemente de outra sessão/worktree trabalhando no mesmo banco
   compartilhado (feature "PIX QR vivo após baixa" mencionada na memória, ainda não
   commitada em lugar nenhum). Rodar `--accept-data-loss` apagaria essa tabela e talvez
   atrapalhasse outra sessão em andamento — **não fiz isso**. Em vez disso, apliquei só as
   3 colunas novas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (SQL direto) e confirmei
   com `prisma db push` (dry) que a ÚNICA divergência restante era aquela tabela alheia —
   ou seja, meu schema está 100% aplicado no banco local. **Isto precisa ser resolvido
   com `prisma db push --accept-data-loss` normal quando a Etapa 1 for de fato mesclada**
   (nesse ponto a tabela alheia já deve ter sido commitada ou descartada por quem a
   criou).

## (e) Evidências

- `node --check` em todos os arquivos `.js` tocados: **OK** (rodado várias vezes durante o
  trabalho, última vez depois do fix do item (d).
- `npx prisma validate`: **`The schema at prisma/schema.prisma is valid 🚀`**.
- `npx prisma db push`: aplica sem diffs meus (só acusa a tabela alheia — ver item (d.5));
  as 3 colunas novas foram confirmadas via `\d produtos` / `\d compras_itens` antes/depois.
- Servidor local subiu limpo (`PORT=3911`), `GET /api/admin-exec/ping` → `200`.
- **Testes do plano (seção 5), com curl real, IDs de teste no `hardt_local`** (dados
  removidos ao final):
  1. `criarProduto` categoria **Matéria-Prima** → Produto criado (`estoqueTotal: 10`,
     `custoManual: 5`) + `ItemPcp` `MP` espelho (`produtoId` setado) + ledger
     `NotaEntradaEstoqueMov` gravado.
  2. `criarProduto` categoria **Material de Uso e Consumo** (não controla estoque) →
     Produto criado com `estoqueTotal: 0`, `custoManual: null`; `CompraItem` gravado com
     `semEstoque: true`, `quantidade: 2`, `custoUnitario: 100`; **sem** linha no ledger.
  3. `criarProduto` categoria **Embalagem** → Produto + `ItemPcp` `EMB` espelho + estoque
     somado (`estoqueTotal: 5`).
  4. `criarItemPcp` no corpo → **400**, mensagem orientando a usar `criarProduto`.
  5. Promover órfão (`ItemPcp` criado na mão simulando os 112 órfãos reais) para
     **Material de Uso e Consumo** → item **inativado**, `estoqueAtual` preservado
     (**não** somado ao produto), retorno com `estoqueNaoTransferido: 3`.
  6. Promover órfão para **Embalagem** → item **continua ativo**, `tipo` virou `EMB`,
     `estoqueAtual` preservado no próprio item (`tornouEspelhoPcp: true`).
  7. Promover órfão que tinha `FornecedorProdutoVinculo` apontando pra ele → vínculo
     migrado (`itemPcpId: null`, `produtoId` do novo produto).
  8. `DELETE` de órfão **usado** (subproduto real de receita, `SUB-0009` "Recheio Palmito
     Mini Empada") → **409** com motivo (`"é resultado de uma receita, é ingrediente de
     uma receita"`) — **não apaguei o item real**, só testei o 409.
  9. `DELETE` de órfão **limpo** (criado só para o teste) → **204**.
  10. `PUT /api/pcp/itens/:id` mudando `tipo` de `MP` para `SUB` em órfão → **200**,
      persistiu.
  11. `criarProduto` com categoria que não existe → **400** com mensagem clara.
  12. Correção de nota (`corrigir-entrada-estoque`) misturando 1 item que controla
      estoque + 1 que não controla → `antes`/`depois`/`custos` da resposta **excluem** o
      item sem estoque (é o fix do item (d) validado na prática).
  13. `GET /api/produtos/:id` do produto criado pela nota → `notaOrigemId`,
      `nomeOrigemNota`, `notaOrigem` (numero/fornecedor/emissão) e `vinculosFornecedor`
      todos presentes e corretos.
  14. `PUT /api/produtos/:id` com `ncm`/`ean` novos → **200**, gravou.

## Riscos remanescentes / pendências

- **Frontend não foi tocado** (fora do escopo desta tarefa) — precisa: trocar
  `criarItemPcp` por `criarProduto` em `NotasRecebidasPage.jsx` (2 blocos: conferência e
  correção — plano já pede unificar num componente); adicionar rótulo do motivo
  `IMOBILIZADO`; tela de criar produto em `ListaProdutos.jsx` precisa exigir categoria
  (ver item (b), mudança de contrato); telas de PCP → Itens precisam dos botões "Enviar
  para Produtos" / "Mudar tipo" / "Excluir" (usando `podeExcluir` do `GET /api/pcp/itens`);
  remover o toggle "controla estoque" de Categorias comerciais.
- **`ItemPcp.codigo` pode colidir/ficar vazio** quando `criarProduto` não informa
  `codigo` (não é campo do contrato) — `pcpItemService.importar` já tinha essa lógica de
  colisão antes de eu mexer (sufixo `-MP`/`-EMB`), só fica mais visível agora porque
  produtos criados pela conferência tendem a nascer sem `codigo`. Não é regressão minha,
  mas vale o dono saber que vários itens PCP recém-espelhados podem ter `codigo` vazio ou
  sufixado — não travei nada porque o plano não pediu.
- **`prisma db push --accept-data-loss`** ainda precisa rodar (por quem for aplicar de
  verdade) para remover `pagamentos_apos_quitacao_avisos` do banco — não é problema desta
  entrega, mas quem for integrar as duas branches precisa saber que essa tabela está solta
  no `hardt_local` compartilhado.
- **Produção**: nada disso foi testado em produção nem atravessou deploy — é 100% schema
  (colunas novas, sem relation, sem índice) e lógica de aplicação; `prisma db push` real
  em produção precisa ser conferido separadamente antes/depois do deploy da Etapa 1
  completa (back + front).
- Não encontrei necessidade de "boy scout" em `$transaction` — todas as 7 ocorrências em
  `notasEntrada.js` já usavam `{ timeout: 20000, maxWait: 10000 }` e nenhuma tinha
  chamada de rede/log dentro.

## Manual/Clippy

**Não atualizado nesta entrega** — o contrato da API mudou, mas não há tela nova nem
mudança de rota/permissão visível ao usuário ainda (o frontend desta Etapa 1 fica para o
dev-frontend, que consome este contrato). Atualizar `backend/manuais/abas/notas-recebidas.md`,
`produtos.md`, `pcp-itens.md` (ou os slugs reais) faz mais sentido depois que a tela
existir de fato — se o dev-frontend não fizer isso no próprio commit dele, alguém precisa
lembrar.
