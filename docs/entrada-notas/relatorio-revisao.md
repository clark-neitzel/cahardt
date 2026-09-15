# Revisão de código — Etapa 1 "Entrada de Notas cria Produto de verdade"

Revisado em `~/Projetos/CA-Hardt-entrada-notas`, branch `feat/entrada-notas-produto`, contra
`docs/entrada-notas/plano-etapa1.md` (D1–D5) e os relatórios de backend/frontend. Li o diff
completo (`git diff main` + arquivos novos) e o código ao redor das mudanças, não só as linhas
trocadas.

## Veredito: **APROVADO COM RESSALVAS**

A implementação em si (D1–D4, contrato backend↔frontend, schema, transações) está sólida e
corresponde ao que os dois relatórios afirmam — verifiquei código, não só a narrativa. O único
problema realmente sério não é um bug de lógica: é que **a branch está desatualizada em relação
ao `main` atual**, e isso precisa ser resolvido antes de mesclar.

---

## Achado 1 (BLOQUEIA a mesclagem, não bloqueia a entrega desta etapa) — branch desatualizada, conflita com a remoção do Conta Azul feita em paralelo

`git merge-base HEAD main` = `9f5d0292`, mas `main` já tem **3 commits a mais** que esta branch
não tem, incluindo `9b184900 refactor(conta-azul): fases 1-4 da remoção` — que **apagou**
`frontend/src/pages/Admin/Sync/PainelSync.jsx`, `frontend/src/pages/Financeiro/ImportarCaModal.jsx`,
e enxugou fortemente `backend/routes/adminExec.js`, `backend/services/contasPagarCaSyncService.js`,
`backend/services/syncPedidosService.js`, `backend/workers/scheduler.js`. Essa refatoração mexeu
**nos mesmos arquivos que esta Etapa 1 mexeu pesado**: `NotasRecebidasPage.jsx` e `ListaProdutos.jsx`.

Confirmei comparando contra o merge-base (não contra o `main` atual, para não confundir "código do
dev" com "avanço do main"):
- `frontend/src/pages/Admin/Produtos/ListaProdutos.jsx` já tinha, no ponto em que a branch nasceu, o
  link `<Link to="/admin/sync">ir para Sincronização</Link>` (linha ~211) — **não foi o dev-frontend
  que criou isso**, mas ao mesclar com o `main` atual esse link vai apontar para uma rota/tela que
  **não existe mais** (`PainelSync.jsx` foi apagado).
- `frontend/src/pages/PCP/ItensPcp.jsx`: o commit `1581978f` do `main` ("busca de Subprodutos fica
  salva por usuário") trocou `useState('')` por `useFiltroSalvo('itens-pcp:search', '')` para o campo
  de busca — mudança que **não existe** nesta branch (ela ainda usa `useState('')`, herdado do ponto
  em que forkou). O manual `backend/manuais/abas/pcp-itens.md` desta branch também **removeu** a
  frase "Os filtros ficam salvos por usuário" porque, do ponto de vista do código desta árvore, isso
  nunca existiu — mas existe no `main` de verdade. Confirmei com `git show 9f5d0292:…ItensPcp.jsx`
  que a branch nasceu ANTES dessa feature, então **não é regressão do dev**, é atraso de branch.
- `NotasRecebidasPage.jsx` também tem trechos que o `main` atual mudou de forma independente (textos
  sobre "Registrar forma de pagamento e banco" / envio à Conta Azul) — ver Achado 2, que É um problema
  real dentro do que o dev tocou.

**Recomendação:** antes de mesclar esta branch, rebasear/mesclar com o `main` atual e resolver os
conflitos manualmente prestando atenção especial a: `NotasRecebidasPage.jsx`, `ListaProdutos.jsx`,
`ItensPcp.jsx` (reincorporar a busca lembrada por usuário), e qualquer coisa que dependa de
`PainelSync.jsx`/`ImportarCaModal.jsx`/rotas de sync que o `main` já removeu. Isto é sobre
**integração**, não sobre a qualidade do código desta etapa — por isso o veredito é "com ressalvas"
e não "reprovado": o trabalho pedido está correto, só não pode ser mesclado como está.

---

## Achado 2 (deve corrigir) — texto da mensagem de erro não bate com o rótulo real do checkbox

`frontend/src/pages/Financeiro/NotasRecebidasPage.jsx:2744` (dentro de `ConferenciaNota`):

```js
toast.error(`A categoria "${semCa.categoria || 'sem categoria'}" não existe na Conta Azul. Escolha uma categoria da lista ou desmarque "Enviar para a Conta Azul".`);
```

O checkbox que esse toast manda desmarcar continua rotulado, na tela, como **"Registrar forma de
pagamento e banco"** (linha 3318 — não foi tocado neste diff). Não existe nenhum controle com o texto
literal "Enviar para a Conta Azul" na tela. Isso não é herdado do `main` nem do merge-base: no
merge-base (`9f5d0292`) o toast já dizia algo diferente ("não está na lista de categorias... desmarque
'Registrar forma de pagamento e banco'"), então foi o dev-frontend quem trocou o texto do toast nesta
tarefa (fora do escopo do plano) sem alinhar com o rótulo real do checkbox. Efeito prático: usuário
recebe o erro, procura um botão/checkbox chamado "Enviar para a Conta Azul" na tela e não encontra —
o único controle visível é "Registrar forma de pagamento e banco".

Mesma inconsistência pontual em `notasEntrada.js`? Não — é só no frontend, textos de UI.

**Correção sugerida:** usar o mesmo texto do rótulo em ambos os lugares (ou reverter o toast para
citar "Registrar forma de pagamento e banco", que é o que está na tela).

---

## O que foi conferido e está correto

### Schema (`backend/prisma/schema.prisma`)
Só ADIÇÃO: `Produto.nomeOrigemNota`, `Produto.notaOrigemId` (sem relation, como o plano pediu) e
`CompraItem.semEstoque` (`Boolean @default(false)`). Nenhum campo removido, nenhuma migração
destrutiva.

### `$transaction`
Todas as 7 ocorrências em `backend/routes/notasEntrada.js` — incluindo as 3 tocadas nesta etapa
(`gerar-conta`, `registrar-entrada`, `corrigir-entrada-estoque`) — usam `{ timeout: 20000, maxWait:
10000 }`. `promover-produto` (rota nova) também: `backend/routes/pcpItemRoutes.js` linha ~150-158,
`{ timeout: 20000, maxWait: 10000 }`.

`produtoService.criar` e `pcpItemService.importar` passaram a rodar **dentro** da transação de
conferência (`backend/routes/notasEntrada.js`, `processarItensConferencia`). Isso é chamada de rede
em potencial (criação no Conta Azul) dentro de `$transaction`, o que a regra do projeto proíbe — mas
o próprio `produtoService.js` (linhas 90-100) tem uma trava explícita: com `CA_SOMENTE_LEITURA` (hoje
sempre `true`) o bloco de rede nunca roda; se algum dia isso mudar, chamar `criar()` com uma `tx`
(`db !== prisma`) lança erro em vez de arriscar travar o banco numa chamada HTTP dentro da transação.
Documentado no comentário do arquivo e no relatório do backend como risco residual conhecido. Não é
uma violação ativa da regra hoje, mas é o tipo de coisa que precisa ser lembrada se `CA_SOMENTE_LEITURA`
for desligado no futuro — sugiro anotar isso na memória do projeto, não só no comentário do arquivo.

### `select`/`include`
Os campos novos consultados (`nomeOrigemNota`, `notaOrigemId`, `semEstoque`, `controlaEstoque`,
`categoria` em `produto.findUnique`) existem todos no schema. `fornecedorProdutoVinculo`,
`notaEntrada.findUnique` (numero/fornecedorNome/emissao) e `fornecedor.findMany`
(cnpjCpf/razaoSocial) em `produtoController.detalhar` batem com os campos reais do schema.

### `not`/`notIn` excluindo `null`
Não encontrei nenhum uso de `not`/`notIn` na parte tocada; os filtros novos (`podeExcluir` em
`pcpItemService.listar`, `semEstoque: false` em `notaEstoqueService`) usam campos booleanos com
default, não haveria armadilha de `null`.

### SelectBusca / helper de opções
Todo dropdown novo usa `SelectBusca` (nunca `<select>` nativo): `ModalCriarProdutoNota`,
`ModalPromoverProduto`, filtro de tipo em `ItensPcp.jsx`, campo Categoria em `ListaProdutos.jsx`.
Não há helper de opções devolvendo `<>…</>` (Fragment) — todas as listas de `<option>` vêm de
`.map()` direto dentro do `SelectBusca`, que devolve array.

### D1 — estoque respeita a categoria do produto
`notaEstoqueService.aplicarEstoqueNota` consulta `estoqueService.produtoControlaEstoque(p, tx)` antes
de somar quantidade; se `false`, grava só `CompraItem` com `semEstoque: true` (sem linha no ledger) e
avisa quando o produto está sem categoria. `estoqueAplicado`, `entradaAplicada`/`entradaLegado` e
`estornarEstoqueNota`/`estornarEstoqueLegado` foram todos ajustados coerentemente:
- Nota com item controlado + item `semEstoque` misturados: o item sem estoque nunca aparece no ledger
  nem na resposta de "antes/depois" da correção — confere com o teste 12 do relatório backend.
- Nota com **só** itens `semEstoque` (sem nenhuma linha de ledger) cai no fallback `entradaLegado`, que
  filtra `semEstoque: false` — resultado correto (vazio), mas por uma coincidência de reaproveitar o
  caminho "nota antiga sem ledger". Funciona, mas é um pouco frágil conceitualmente (mistura "nota
  legada" com "nota nova só com itens sem estoque"); não é bug, é só um ponto para ficar de olho se
  esse trecho for mexido de novo.
- Estorno (`estornarEstoqueNota`) marca **todo** `CompraItem` não estornado da nota como estornado
  (inclusive os `semEstoque: true`), sem depender do ledger — correto.

### D2 — categoria Embalagem local
Não é mudança de schema/código (a categoria já existe em produção); o relatório backend documenta que
rodou o seed localmente via script, sem commitar dado. Conferido: não há necessidade de seed
automático no código, e não achei nada quebrado por causa disso.

### D3 — PCP órfãos
`pcpItemService.promoverProduto`, `atualizar` (mudar tipo) e `excluir` implementados como descrito:
- Bloqueia promover/mudar tipo de SUB que é resultado de receita ativa.
- Migra `FornecedorProdutoVinculo` e enriquece `notaEntradaEstoqueMov`/`compraItem` com `produtoId`
  **sem apagar** `itemPcpId` — nunca deixa os dois nulos nem os dois setados de forma inconsistente
  (mantém o invariante pedido no plano).
- `excluir` só permite quando não há receita (resultado/ingrediente), ordem, movimentação PCP, ledger
  de nota, `CompraItem` ou vínculo de fornecedor — 409 com o motivo, senão 200/204.
- `GET /api/pcp/itens` calcula `podeExcluir` em lote (`Promise.all` de `groupBy`), só para órfãos —
  evita N+1 óbvio.
- Rotas novas (`POST /:id/promover-produto`, `DELETE /:id`) usam a mesma checagem de permissão
  (`temPermissaoPcp`) das rotas existentes — front e back usam o mesmo `permissoes.pcp?.itens`
  (objeto, não booleano solto — bate com a regra "permissões são objeto").
- Frontend (`ItensPcp.jsx`) tem os três botões (Enviar para Produtos / Mudar tipo / Excluir) só para
  itens órfãos, em mobile (cards, `md:hidden`) e desktop (tabela, `hidden md:block`), com
  `min-h-[44px]` nos botões — confirmei lendo o JSX, não só o relatório.

### D4 — remover "controla estoque" de Categorias comerciais
`categoriaProdutoService.atualizar` agora descarta `controlaEstoque` do corpo antes do
`prisma.categoriaProduto.update` — campo continua no schema, só não é mais gravável por ali.
`CategoriasProduto.jsx` não foi tocado nesta branch porque, segundo o relatório, o toggle já tinha
sido removido em trabalho anterior — conferi com grep e não achei o toggle no arquivo atual.

### Contrato backend↔frontend (`criarProduto`)
Conferi os 3 pontos de envio (`ConferenciaNota.montarItensBase`, `PainelCorrigirEntrada.salvar`,
`PainelRegistrarEntrada`) contra o que `validarItensBody`/`processarItensConferencia` esperam: mesmo
shape (`nome, categoria, categoriaProdutoId, controlaEstoque, unidade, ean, ncm`), `criarItemPcp`
nunca mais é enviado (recusado com 400 pelo backend caso um cliente antigo em cache mande). Resposta
`produtosCriados` é lida e tostada nos 3 call sites (`gerar-conta`, `registrar-entrada`,
`corrigir-entrada-estoque`).

### `GET /api/produtos/:id` — campos novos
`notaOrigem`, `nomeOrigemNota`, `vinculosFornecedor` são todos opcionais no front
(`GerenciarProduto.jsx`) — guardados com `?.` antes de interpolar (`produto?.notaOrigem`,
`notaOrigem?.numero`, `notaOrigem?.emissao`), aparecem só quando existem. Sem `"undefined"` visível.

### Efeitos colaterais / quem mais consome
- `produtoController.criar` só tem um caller HTTP (`POST /api/produtos`, usado por
  `ListaProdutos.jsx`) — categoria obrigatória nova está espelhada lá (`SelectBusca` + validação no
  cliente antes de chamar o service).
- `produtoService` só é importado por `produtoController.js`, `notasEntrada.js` e
  `pcpItemService.js` — nenhum outro consumidor (IA API, sync, importações) passa por ele.
- API de IA (`iaConsultaRoutes.js`) não foi tocada; os campos novos em `Produto`/`CompraItem` são
  só adição, não quebram contrato nenhum de `/v1`.
- Fluxo protegido de devolução/NF-e (`ModalDevolucao`, `focusNfeEmissaoService`) e Contabilidade (D5):
  **não tocados** — confirmado por `git diff` vazio nesses arquivos.

### Manuais / novidade
`notas-recebidas.md`, `produtos.md`, `pcp-itens.md` descrevem o comportamento real implementado, sem
números de ambiente de teste. `novidade-entrada-notas-produto.html`: accordions todos `class="acc
aberto"`, sem `og:image`, sem botão "abrir o app". `novidades.json` tem a entrada nova no topo,
formato correto.

---

## Itens do checklist não aplicáveis nesta entrega
- WhatsApp (`tipo`/`referencia`): não tocado.
- Barras de progresso / cor por %: não se aplica.
- Upload em `path.join(__dirname, '../uploads/...')`: não se aplica (sem upload novo).
- Impressão: não se aplica (sem tela de impressão nova).

## Sugestões menores (não bloqueiam)
- `pcpItemService.atualizar` aceita `data.tipo` de órfão sem validar contra `['MP','SUB','PA','EMB']`
  (o schema tem `tipo` como `String` solto) — hoje só é alcançável pela UI, que já restringe via
  `SelectBusca`, mas uma validação de whitelist no service seria mais defensiva.
- Vale considerar mover a validação `ehProducao` (regex duplicada em `ModalPromoverProduto.jsx` e
  em `categoriaEstoqueService.tipoPcpDaCategoria`) para uma função compartilhada/exportada consumível
  pelo frontend, para não haver duas implementações da mesma regra de negócio podendo divergir no
  futuro (hoje estão de acordo, mas é lógica de negócio duplicada em front e back).
