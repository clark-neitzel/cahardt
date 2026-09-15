# Relatório — Frontend Etapa 1 "Entrada de Notas cria Produto de verdade"

Branch `feat/entrada-notas-produto`, worktree `~/Projetos/CA-Hardt-entrada-notas`. Consome o
contrato documentado em `docs/entrada-notas/relatorio-backend.md` (fonte de verdade — o plano
original foi ajustado onde o backend divergiu). **Nada foi commitado.**

## Arquivos alterados

### `frontend/src/pages/Financeiro/NotasRecebidasPage.jsx` (principal)
- `MOTIVOS_SEM_ESTOQUE` ganhou `IMOBILIZADO` (rótulo "Imobilizado").
- `grupoDaOpcao()` (label do combo "Nosso produto") passou a rotular o grupo do PCP como
  **"Insumo do PCP (subproduto/espelho)"** em vez de "Insumos (PCP)", para não confundir com
  produto de verdade.
- Novo componente **`ModalCriarProdutoNota`** (Tela 2 do mock): nome pré-preenchido com o texto
  do item + "Na nota veio como…", categoria (`SelectBusca` das `CategoriaEstoque`, obrigatória,
  com dica dinâmica "controla estoque"/"não controla" quando a categoria está na lista carregada),
  categoria comercial (`SelectBusca` opcional das `CategoriaProduto`), EAN/NCM pré-preenchidos e
  editáveis, unidade + conversão, controle de estoque em 3 pílulas (Segue a categoria / Controlar
  sempre / Nunca controlar). Usado tanto na conferência quanto na correção — é o único lugar que
  monta o objeto que vira `criarProduto` no payload; a criação de verdade só acontece no POST de
  conferência/correção (nada de rota separada).
- **Conferência (`ConferenciaNota`) e Correção (`PainelCorrigirEntrada`)**: os dois blocos
  duplicados de "Nosso produto" viraram três **pílulas de destino** (🔗 Vincular a um produto /
  ➕ Criar produto novo / 🚫 Não é estoque, seguindo a Tela 1 do mock), reaproveitando o mesmo
  `ModalCriarProdutoNota` e a mesma função `criarProdutoNovo(idx, dados)` (adaptada em cada bloco
  ao shape local de `vinculos`, já que os dois componentes têm state independente). **Removido
  por completo**: o campo "Tipo" do PCP (`TIPOS_ITEM_PCP` continua existindo só para rotular
  itens PCP já criados, não para criar novos) e qualquer envio de `criarItemPcp`.
- `montarItensBase()` (conferência) e o payload de `corrigir()` (correção) passaram a mandar
  **`criarProduto: { nome, categoria, categoriaProdutoId, controlaEstoque, unidade, ean, ncm }`**
  em vez de `criarItemPcp`.
- Label do campo de categoria por item: **"Categoria da despesa (Contas a Pagar / DRE)"** + ajuda
  "Segue a categoria padrão da nota. Troque só se este item for de outra natureza." (para não
  confundir com a categoria do produto, escolhida dentro do modal).
- Nova função `toastProdutosCriados(produtosCriados)` — toast "N produto(s) criado(s): nome1,
  nome2…" — chamada nos 3 call sites (`gerar-conta`, `registrar-entrada`,
  `corrigir-entrada-estoque`) ao lado do `toastEstoque` já existente.
- Novos imports: `categoriaProdutoService`, `api` (para `GET /categorias-estoque`), ícone `Plus`.

### `frontend/src/services/notasEntradaService.js`
- Comentários dos 3 endpoints (`gerarConta`, `registrarEntrada`, `corrigirEntradaEstoque`)
  atualizados de `criarItemPcp` para `criarProduto`, e a lista de motivos ganhou `IMOBILIZADO`.
  (Nenhuma mudança de código — o payload já é um objeto livre repassado pelo chamador.)

### `frontend/src/pages/Admin/Produtos/ListaProdutos.jsx`
- Modal "Novo produto": campo Categoria trocado de `ComboBusca` (texto livre) para **`SelectBusca`
  obrigatório** das categorias já cadastradas (`opcoesCategorias`, que já existia na tela) +
  validação no cliente ("Escolha a categoria do produto — é obrigatória.") antes de chamar
  `produtoService.criar`, espelhando a exigência nova do backend.
- Import de `SelectBusca` adicionado.

### `frontend/src/pages/Admin/Produtos/GerenciarProduto.jsx`
- **EAN e NCM viraram editáveis** (antes só apareciam como texto, "somente leitura") nos dois
  layouts (cards "Dados do Produto" mobile e desktop) — inputs ligados a `formData.ean`/`ncm`,
  visíveis só quando `podeEditar`; texto de ajuda ajustado ("Nome, código e peso vêm do cadastro
  original — somente leitura. EAN e NCM são editáveis.").
- `handleSaveComercial` passou a enviar `ncm` e `ean` no `produtoService.atualizar(...)`.
- Nova seção "📄 Cadastrado a partir da NF-e {número} ({fornecedor}) em {data} como '{nome na
  nota}'" e "🏷️ Fornecedores que já vieram com este produto: …" (Tela 3 do mock), lida de
  `produto.notaOrigem` / `produto.nomeOrigemNota` / `produto.vinculosFornecedor` (campos novos do
  `GET /api/produtos/:id`) — **campos opcionais guardados antes de interpolar** (`produto?.notaOrigem`,
  `notaOrigem?.numero`, `notaOrigem?.emissao` podem vir `null`), aparece só quando existir.

### `frontend/src/services/pcpItemService.js`
- Novas chamadas `promoverProduto(id, dados)` (`POST /pcp/itens/:id/promover-produto`) e
  `excluir(id)` (`DELETE /pcp/itens/:id`).

### `frontend/src/pages/PCP/ItensPcp.jsx` (reescrita)
- Filtro de **tipo** virou seletor (`SelectBusca`, padrão `SUB` preservado via `useFiltroSalvo`)
  em vez de fixo em `tipo: 'SUB'` — necessário porque órfãos de MP/PA/EMB (que também precisam
  dos botões novos) não apareciam na listagem antiga, restrita a subprodutos.
  `useFiltroSalvo('itens-pcp:tipoFiltro', 'SUB')`.
- Coluna/selo **"Produto"**: "sem produto" (âmbar, quando `produtoId` é `null` — item órfão) ou
  "produto ✓" (verde).
- Item órfão ganha três ações novas: **Enviar para Produtos** (abre `ModalPromoverProduto`,
  chama `promoverProduto`), **Mudar tipo** (modal simples, `PUT /pcp/itens/:id` com `tipo`, erro
  400 do backend — ex. "é um subproduto de verdade" — mostrado no toast), **Excluir** (só
  habilitado quando `item.podeExcluir` do `GET /pcp/itens`; ao confirmar, `DELETE`; erro 409 do
  backend mostrado no toast com o motivo).
- `ModalPromoverProduto`: nome, categoria (`SelectBusca` das `CategoriaEstoque`, obrigatória, com
  dica se é de produção — MP/Embalagem — ou não), categoria comercial opcional, controle de
  estoque em 3 pílulas. Ao confirmar com categoria fora de produção, `window.confirm` extra
  avisando que o item PCP será inativado e o estoque não é transferido sozinho (efeito colateral
  visível, exigido pelo plano).
- Tela reorganizada em **cards mobile** (`md:hidden`) + **tabela desktop** (`hidden md:block`),
  botões com `min-h-[44px]`, título/topbar compacto no mobile (`p-3 md:p-6`-equivalente).

### `frontend/src/pages/Configuracoes/CategoriasProduto.jsx`
- **Nenhuma mudança necessária** — o toggle "Controla Estoque" já tinha sido removido em trabalho
  anterior (comentário no próprio arquivo, linha ~249, datado 08/2026), confirmado por grep.

### `frontend/public/novidade-entrada-notas-produto.html` (novo)
- Página standalone no padrão de `novidade-tarefas.html`/`novidade-cadastro-clientes.html`: hero
  verde-escuro, 5 accordions **já abertos**, seção "As telas do app" com 3 mockups HTML/CSS (Telas
  1/2/3 do mock aprovado) com pins dourados numerados e legendas, seção "Para usar" em passos.
  Open Graph `og:title`/`og:description` **sem** `og:image`. **Sem** botão "abrir o app".

### `frontend/public/novidades.json`
- Nova entrada no **topo** (`slug: "entrada-notas-produto"`, `data: "2026-09-15"`), entradas
  existentes preservadas abaixo. JSON validado com `node -e "JSON.parse(...)"`.

### Manuais do Clippy (`backend/manuais/abas/`)
- `notas-recebidas.md`: seção da conferência reescrita para descrever os **três destinos** (com
  a lista completa de motivos "não é estoque", incluindo Imobilizado), o rótulo novo da categoria
  da despesa, o modal "Criar produto novo" e a regra D1 (estoque respeita a categoria do produto).
  Linha da correção/lançamento ganhou menção ao mesmo modal.
- `produtos.md`: categoria obrigatória na criação, EAN/NCM editáveis, nova seção sobre produto
  nascido de nota (origem + fornecedores na ficha).
- `pcp-itens.md`: filtro de tipo deixou de ser só SUB, seção nova sobre item "órfão" e os três
  botões (Enviar para Produtos / Mudar tipo / Excluir).
- `config-categorias-produto.md`: conferido — nenhuma menção ao toggle morto, nada a corrigir.
- Não achei necessidade de mexer na tabela `ABAS` de `backend/services/copilotoService.js` — rota
  e permissão de nenhuma das 4 telas mudaram, só o comportamento dentro delas.

## Diferente do plano/mock, e por quê

1. **Não criei um arquivo `ItemNotaDestino.jsx` separado.** O plano sugeria isso ou "o que for
   mais direto dado o tamanho do arquivo". Dado que `ConferenciaNota` e `PainelCorrigirEntrada`
   têm state (`vinculos`) com shapes ligeiramente diferentes e várias dependências locais
   (`itensPcp`, `entradaAberta`, custo/entrada convertida só na conferência), optei por manter as
   três pílulas **inline** nos dois blocos (ainda são poucas linhas cada) e concentrar a
   duplicação real — o modal de criar produto, a lógica de montar o payload, os labels — no
   componente `ModalCriarProdutoNota` e nas funções `criarProdutoNovo`, que são compartilhadas.
   A duplicação que sobrou é só JSX de apresentação (os 3 botões), não lógica de negócio.
2. **Badge "🔗 Vinculado" com nome+categoria do mock** não foi replicado 1:1 no cabeçalho do
   card — mantive o badge existente "destino definido ✓"/"vinculado" na conferência (funciona
   igual, só o texto do mock não foi copiado literalmente). O card do "Nosso produto" quando
   `v.novo` está preenchido, esse sim, ganhou o chip verde/mint como no mock.
3. **PCP → Itens/Subprodutos**: o plano cita `ItemPcpForm.jsx` como possível lugar para os botões
   novos, mas os coloquei na **listagem** (`ItensPcp.jsx`), não no formulário de edição — é onde
   o usuário já vê vários itens de uma vez e decide o que promover/excluir; abrir o formulário só
   para ter acesso a um botão de ação em massa pareceu pior. `ItemPcpForm.jsx` não foi tocado.
4. **Categoria "não está na lista carregada"** (ex.: texto legado fora do cadastro de
   `CategoriaEstoque`): o modal simplesmente não mostra a dica dinâmica (nem erro) — o campo é
   sempre um `SelectBusca` das categorias existentes, então esse caso só ocorreria se a lista
   falhar ao carregar, e aí a dica também fica em branco (comportamento pedido explicitamente:
   "senão apenas mostre a categoria sem a dica dinâmica").

## Resultado do build

```
cd frontend && npm run build
```
Rodado 3 vezes (após cada leva de mudanças) — a última, completa, terminou assim:
```
✓ built in 5.25s
```
(com o aviso padrão de chunk > 500kB do `index-*.js`, que já existia antes desta tarefa e não
tem relação com os arquivos alterados). Nenhum erro de import, variável ou JSX malformado.

## Verificação local (sem login completo)

- Subi o backend local (`node index.js`, `PORT=3000` do `.env`, `JWT_SECRET` **temporário só de
  ambiente**, nunca gravado em arquivo, só para o processo de teste) — subiu limpo:
  `Servidor rodando na porta 3000`. O único erro no log é a renovação do token da Conta Azul
  (`invalid_grant`), esperado neste ambiente e sem relação com esta entrega.
- `curl` nas rotas tocadas, sem sessão (esperando 401, não 404/500 — prova que as rotas existem
  e carregam sem quebrar):
  - `GET /api/categorias-estoque` → 401
  - `GET /api/notas-entrada` → 401
  - `GET /api/pcp/itens` → 401
- Subi o frontend (`npm run dev -- --port 5183`) e pedi ao Vite os módulos alterados — todos
  responderam 200 (compilam/transformam sem erro):
  - `/src/pages/Financeiro/NotasRecebidasPage.jsx` → 200
  - `/src/pages/PCP/ItensPcp.jsx` → 200
  - `/src/pages/Admin/Produtos/ListaProdutos.jsx` → 200
  - `/src/pages/Admin/Produtos/GerenciarProduto.jsx` → 200
  - `/novidade-entrada-notas-produto.html` → 200
  - `/novidades.json` → 200
- Log do Vite sem nenhum erro de transformação/import depois dessas requisições.
- **Não fiz login e não cliquei na tela de verdade** (sem usuário/senha de teste à mão nesta
  sessão) — então não vi o layout renderizado no navegador, só confirmei que compila e serve.
- Processos de teste (backend na 3000, frontend na 5183) foram **encerrados** ao final.

## Como fica no mobile (conferido lendo as classes, não visualmente)

- Todos os elementos novos usam o padrão do projeto: botões-pílula com `min-h-[44px]`, `p-3
  md:p-6`/`p-4 md:p-5` nos containers, `grid-cols-1 md:grid-cols-2`/`md:grid-cols-3` nos
  formulários, `flex-wrap` nas linhas de pílulas (3 destinos, motivos, controle de estoque).
- `ModalCriarProdutoNota` e o modal de PCP: `fixed inset-0`, folha desce do rodapé no mobile
  (`rounded-t-2xl md:rounded-2xl`, `items-end md:items-center`), `max-h-[92vh] overflow-y-auto`.
- `ItensPcp.jsx`: cards (`md:hidden`) para telas estreitas, tabela (`hidden md:block`) com
  `overflow-x-auto` no desktop — sem scroll horizontal forçado no mobile.
- **Não testei em dispositivo real nem em viewport 375px no navegador** — a conferência foi só
  pela leitura das classes Tailwind contra o checklist do `CLAUDE.md`.

## Riscos remanescentes

- A remoção completa do fluxo antigo (`criarItemPcp`) depende do backend já ter o 400 ativo — já
  confirmado no relatório do backend (testado com curl). Se por algum motivo uma versão antiga do
  frontend em cache tentar mandar `criarItemPcp`, o backend recusa com mensagem clara — não quebra
  silenciosamente.
- `ModalCriarProdutoNota` busca `GET /categorias-estoque` e `categoriaProdutoService.listar()`
  **toda vez que abre** (não cacheado entre itens da mesma nota) — funcionalmente correto, mas
  gera uma chamada extra por abertura; não é um problema de UX perceptível (listas pequenas), mas
  vale saber caso a nota tenha muitos itens sendo criados em sequência.
- Não testei o caminho de erro 409 do `DELETE /pcp/itens/:id` nem o 400 de "SUB resultado de
  receita ativa" clicando de verdade — só confirmei que o código trata `e.response?.data?.error`
  genericamente em ambos (toast com a mensagem do backend).
- `ItemPcpForm.jsx` não foi tocado — se o dono preferir os botões novos também dentro do
  formulário de edição do item, é um ajuste à parte.

## O que só dá para confirmar num teste manual completo

- Clicar de verdade nos três destinos de um item de nota real, confirmar que o payload chega
  como `criarProduto` (não `criarItemPcp`) e que o toast final lista os produtos criados.
- Abrir o modal "Criar produto a partir da nota" com uma categoria que controla estoque e outra
  que não controla, conferir a dica dinâmica junto com uma nota real trazendo EAN/NCM do XML.
- Promover um item órfão de verdade em `PCP → Itens` (categoria de produção e categoria fora de
  produção) e conferir o aviso de estoque não transferido.
- Testar em iPad/iPhone reais (375px) a rolagem, o toque nos botões-pílula e a abertura dos
  modais em tela cheia no mobile.
- Conferir visualmente a ficha do produto (`GerenciarProduto.jsx`) com um produto real nascido de
  nota, para validar o texto "Cadastrado a partir da NF-e…" com dados reais (número, fornecedor,
  data, nome na nota).

## Novidade e manual

- Criado `frontend/public/novidade-entrada-notas-produto.html` e registrado no topo de
  `frontend/public/novidades.json` (slug `entrada-notas-produto`, data 2026-09-15).
- Atualizados `backend/manuais/abas/notas-recebidas.md`, `produtos.md` e `pcp-itens.md` com o
  comportamento real implementado (sem números de teste/ambiente local). `config-categorias-
  produto.md` conferido, sem necessidade de mudança. Tabela `ABAS` de `copilotoService.js` não
  precisou de alteração (rotas e permissões das 4 telas não mudaram).
