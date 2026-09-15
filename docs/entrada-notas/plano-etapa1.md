# Etapa 1 — Conferência de nota cria PRODUTO de verdade (plano aprovado pelo dono em 15/09/2026)

Proposta visual aprovada: `docs/entrada-notas/proposta-entrada-notas-2026-09.html` (ler antes de codificar).
Trabalho nesta árvore: `~/Projetos/CA-Hardt-entrada-notas` (worktree, branch `feat/entrada-notas-produto`).
`node_modules` são symlinks para `~/Projetos/CA-Hardt`. Banco local: `hardt_local` (`backend/.env`).

## Decisões do dono
- **D1** Entrada de estoque RESPEITA a categoria do produto (`CategoriaEstoque.controlaEstoque` via `Produto.categoria`, com override `Produto.controlaEstoque`). Ele já ligou Matéria-Prima no cadastro de produção.
- **D2** Categoria "Embalagem" já existe em produção (ele criou). Localmente, criar se faltar (seed idempotente por nome).
- **D3** Insumos do PCP sem produto (112 em produção) ficam como estão, mas passa a existir a opção de **"Enviar para Produtos"** (promover a Produto escolhendo categoria), **mudar a categoria/tipo** e **excluir** quando nunca foi usado.
- **D4** Remover da tela de Categorias comerciais (`CategoriaProduto`) o botão "controla estoque" (campo fica no schema, só some da tela e do PUT).
- **D5** Contabilidade fica para outra entrega. NÃO mexer.

## Regras de fundo (não quebrar)
- `pcpItemService.criar` só aceita SUB; MP/PA/EMB nascem de Produto via `pcpItemService.importar({produtoId, tipo})`. A conferência passa a obedecer isso.
- Estoque da nota continua via `notaEstoqueService.aplicarEstoqueNota` (ledger `NotaEntradaEstoqueMov` + `CompraItem`, idempotente, estornável). Regra de correção (`/corrigir`) reaproveita o mesmo núcleo.
- `$transaction` com `{ timeout: 20000, maxWait: 10000 }`; log/Drive/SEFAZ fora da transação.
- Schema: só ADICIONAR campos. Nunca remover.
- Frontend: SelectBusca (nunca `<select>`), pílulas, mobile, `useFiltrosSalvos` se houver filtro novo. Build antes de entregar.

## Contrato backend (dev-backend entrega e documenta o que de fato implementou)

### 1. Produto
- `schema.prisma` `Produto`: `nomeOrigemNota String? @map("nome_origem_nota")`, `notaOrigemId String? @map("nota_origem_id")` (id da NotaEntrada, sem relation para não mexer em NotaEntrada), `origemDescricao`? NÃO — só esses dois.
- Extrair a criação de produto de `produtoController.criar` para `backend/services/produtoService.js` `criar(dados, usuario)` reutilizável (controller passa a chamar o service). Aceitar na criação: `nome, codigo?, ean?, ncm?, unidade, categoria (nome da CategoriaEstoque, obrigatório), categoriaProdutoId?, controlaEstoque? (null|true|false), valorVenda?, descricao?, nomeOrigemNota?, notaOrigemId?`. Manter a trava de nome duplicado (case-insensitive) e o comportamento CA_SOMENTE_LEITURA.
- `PUT /produtos/:id`: permitir `ncm` e `ean` (hoje travados).
- `GET /produtos/:id` (ou o que a ficha usa): devolver `nomeOrigemNota`, `notaOrigemId` + `notaOrigem { numero, fornecedorNome, emissao }` (lookup simples) e `vinculosFornecedor: [{ fornecedorCnpj, fornecedorNome?, codigoFornecedor, descricaoFornecedor }]` de `FornecedorProdutoVinculo`.

### 2. Conferência (`backend/routes/notasEntrada.js`)
- Corpo do item aceita `criarProduto: { nome, categoria, categoriaProdutoId?, controlaEstoque?, unidade, ean?, ncm? }` no lugar de `criarItemPcp`. `criarItemPcp` passa a ser recusado com 400 e mensagem clara ("crie um produto"). Validar em `validarItensBody` (nome, categoria existente em CategoriaEstoque, unidade).
- `processarItensConferencia`: cria o Produto via `produtoService.criar` com `nomeOrigemNota = itemNota.descricao`, `notaOrigemId = nota.id`, `ean/ncm` do item quando não vierem no corpo; depois, se a categoria for **Matéria-Prima → `importar(tipo:'MP')`**, **Embalagem → `importar(tipo:'EMB')`** (mapa por nome, case/acento-insensível). O vínculo do item vira `produtoId` (e o de-para `FornecedorProdutoVinculo` grava `produtoId`).
- `MOTIVOS_SEM_ESTOQUE` ganha `IMOBILIZADO` (backend + todos os pontos que rotulam motivos: Central de Pendências, relatórios, etc. — grepar `CONSUMO_IMEDIATO`).
- **D1 no estoque**: em `notaEstoqueService.aplicarEstoqueNota` (e no replay/estorno), item vinculado a Produto cujo `produtoControlaEstoque()` é false → **não soma estoque nem mexe em custo médio**; ainda grava `CompraItem` (histórico de compra/preço) com marcação clara (`semEstoque: true` ou equivalente já existente — dev decide e documenta). Item vinculado a ItemPcp (espelho de MP/EMB ou SUB) continua como hoje. Conferir `Produto` sem categoria (3 em produção) → tratar como "não controla" e avisar no retorno.
- Retorno de `gerar-conta`/`registrar-entrada` inclui `produtosCriados: [{ id, nome, codigo, categoria, itemPcpId? }]` para o toast.

### 3. PCP — órfãos (D3) em `backend/routes/pcpItemRoutes` + `pcpItemService`
- `POST /api/pcp/itens/:id/promover-produto` body `{ nome?, categoria, categoriaProdutoId?, controlaEstoque? }`. Só para ItemPcp com `produtoId == null`. Cria Produto (ean/ncm do último `NotaEntradaItem` ligado ao item; `nomeOrigemNota` = nome atual do item), seta `itemPcp.produtoId`, migra `FornecedorProdutoVinculo` (itemPcpId → produtoId) e `NotaEntradaItem.produtoId` (mantendo `itemPcpId` para o ledger). Se categoria for MP/EMB: item continua ativo e vira o espelho (ajusta `tipo`, `codigo` mantido). Se não for de produção: item é **inativado** e o `estoqueAtual` dele NÃO é transferido (categoria sem estoque) — registrar no retorno. Não permitir promover SUB usado como resultado de receita ativa (é subproduto de verdade). Transação com timeout.
- `PUT /api/pcp/itens/:id` para órfão (`produtoId == null`) passa a permitir `tipo` (MP/SUB/EMB/PA) — exceto se for resultado de receita ativa (só SUB).
- `DELETE /api/pcp/itens/:id`: só órfão sem receita, ordem, movimentação PCP, `NotaEntradaItem`/`CompraItem`/ledger apontando para ele; senão 409 com o motivo. Fora isso, "inativar" continua sendo o caminho.
- `GET /api/pcp/itens` (listar): incluir `usadoEm: { receitas, ordens, notas }` contagens simples OU flag `podeExcluir`, para a tela decidir o botão.

### 4. D4 backend
- `PUT` de CategoriaProduto ignora `controlaEstoque` (não grava mais). Campo permanece no schema.

### 5. Testes que o dev-backend deve provar (curl na API local, hardt_local)
- Conferir nota com `criarProduto` categoria Matéria-Prima → Produto criado + ItemPcp MP espelho + estoque somado.
- Conferir com categoria "Material de Uso e Consumo" → Produto criado, sem estoque, CompraItem gravado.
- `criarItemPcp` → 400.
- Promover órfão (usar SUB-045 clonado localmente ou criar um) para Uso e Consumo → inativado, vínculo migrado.
- DELETE órfão usado → 409; órfão limpo → 200.
- `node --check` em tudo; `npx prisma validate`; `npx prisma db push` no hardt_local.

## Frontend (dev-frontend, depois do backend, usando o contrato REAL documentado por ele)
- `NotasRecebidasPage.jsx`: por item, três botões-pílula **Vincular a um produto / Criar produto novo / Não é estoque** (mock Tela 1). Some o grupo "Insumos (PCP)" do combo? NÃO — manter possível vincular a `PCP:` (subprodutos/espelhos existentes), mas rotulado claramente ("Insumo do PCP"). Some o campo "Tipo" do PCP. Modal "Criar produto a partir da nota" (Tela 2): nome editável pré-preenchido + "Na nota veio como", Categoria (SelectBusca das CategoriaEstoque, obrigatório, com dica "controla estoque / não controla"), Categoria comercial (opcional), EAN/NCM pré-preenchidos e editáveis, unidade + conversão, controle de estoque (Segue a categoria / Controlar sempre / Nunca). Label "Categoria da despesa (Contas a Pagar / DRE)". Motivo Imobilizado. Os DOIS blocos duplicados (conferência ~2810 e correção ~3495) viram um componente só. Toast lista produtos criados.
- Ficha do produto (Admin/Produtos): "Cadastrado a partir da NF-e X (fornecedor) em data como '…'" e "Fornecedores que já vieram com este produto" (Tela 3). NCM/EAN editáveis.
- PCP → Itens/Subprodutos: para item sem produto, botões **Enviar para Produtos** (modal com categoria etc.), **Mudar tipo**, **Excluir** (só quando o backend disser que pode). Mobile.
- Categorias comerciais: remover o toggle "controla estoque".
- Manuais do Clippy: `backend/manuais/abas/notas-recebidas.md` (ou o slug real), `produtos.md`, `pcp-itens.md`/subprodutos, categorias — atualizar. Novidade: `frontend/public/novidade-entrada-notas-produto.html` (com mockups e legendas, accordions abertos, sem og:image, sem botão abrir app) + entrada no topo de `frontend/public/novidades.json`.
- `cd frontend && npm run build` obrigatório.
