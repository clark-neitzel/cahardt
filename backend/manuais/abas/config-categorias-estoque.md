---
aba: Config — Controle de Estoque por Categoria
rota: /configuracoes/categorias-estoque
permissao: admin
---

# Config — Controle de Estoque por Categoria

## O que é

Tela **"Categorias de Estoque"** (o título mudou em 08/2026 — antes se chamava "Categorias de Produto", que era o nome de outra tela e confundia quem procurava onde marcar o imobilizado). Controla as categorias dos produtos (desde 08/2026 elas são do app — o Conta Azul não manda mais categoria) e define, por categoria, três chaves: se **controla estoque**, se **conta no flex** e se **vende**. Somente produtos das categorias com Estoque ativado terão os campos de estoque calculados (reservado, disponível).

No rodapé da tela há o card **"O que cada chave faz"** — uma legenda curta explicando as três chaves, para não precisar abrir este manual na hora de decidir.

---

## O que dá pra fazer aqui

- **Criar categoria nova** pelo botão "Nova categoria" (ela já aparece para escolher no detalhe de cada produto, em Produtos Admin)
- Ver todas as categorias em uso, detectadas nos produtos cadastrados
- Ativar/desativar controle de **Estoque** por categoria (toggle verde)
- Ativar/desativar **Flex** por categoria (toggle roxo) — se desativado, produtos dessa categoria são excluídos do cálculo de flex
- Ativar/desativar **Vende** por categoria (toggle) — **novo em 08/2026**. Desligado, os produtos dessa categoria **somem das listas de venda** (catálogo, novo pedido, amostra, escolha do catálogo personalizado, Margem/Custo), mas **continuam no estoque e no inventário**. É assim que se controla o **imobilizado** (freezer, painel LED, móveis): o bem tem estoque e custo, e o vendedor não o encontra para vender. Toda categoria já existente nasce com **Vende ligado** — nada muda até alguém desligar
- Ver o card **"O que cada chave faz"** no rodapé — legenda das três chaves (Estoque, Flex, Vende)
- Ver quais categorias ainda não foram configuradas (detectadas nos produtos mas sem configuração salva)

### Como uma categoria "existe"
Uma categoria existe quando foi criada aqui **ou** quando algum produto a usa. Para colocar produtos numa categoria, abra o produto em Produtos (Admin) e troque o campo Categoria (lá também dá para criar categoria nova na hora). Categoria sem nenhum produto e sem configuração não some — fica listada aqui se foi criada pelo botão.

---

## Como fazer (passo a passo real)

### Criar uma categoria nova
1. Abra Config — Cat. Estoque (tela "Categorias de Produto")
2. Clique no botão verde **"Nova categoria"**
3. Digite o nome (ex.: "Bebidas") e confirme
4. Ela já aparece na lista e no campo Categoria do detalhe dos produtos

### Marcar uma categoria como "não vende" (imobilizado)
1. Abra Config — Cat. Estoque
2. Crie (ou localize) a categoria do bem — ex.: "Imobilizado"
3. Deixe o toggle **Estoque** ligado (o bem precisa ter saldo para o inventário)
4. **Desligue** o toggle **Vende**
5. Em Produtos (Admin), coloque o freezer/painel/móvel nessa categoria
6. Pronto: o bem some do catálogo e da tela de pedido, e continua aparecendo no Inventário e na Posição de Estoque

### Ativar controle de estoque para uma categoria
1. Abra a aba Config — Categorias Estoque
2. Localize a categoria desejada (ex: "Produto Acabado")
3. Clique no toggle verde/cinza ao lado da categoria
4. O controle de estoque é ativado — a mudança é salva automaticamente

### Desativar
- Clique novamente no toggle para desativar
- Produtos dessa categoria deixarão de ter estoque gerenciado

---

## Impacto de cada estado

| Toggle | Estado | Efeito |
|--------|--------|--------|
| Estoque | Ativado | Estoque é reservado quando pedido é criado; é baixado quando faturado |
| Estoque | Desativado | Produtos da categoria não têm estoque gerenciado |
| Flex | Ativado (padrão) | Itens da categoria entram no cálculo de flex normalmente |
| Flex | Desativado | Itens da categoria são excluídos do flex — ex: produtos internos vendidos a funcionários |
| Vende | Ativado (padrão) | Produtos aparecem normalmente para venda (catálogo, pedido, amostra, Margem/Custo) |
| Vende | Desativado | Produtos somem das listas de venda e do relatório de Margem/Custo. Continuam em Estoque — Posição, Inventário, Histórico e na Lista de Produtos (Admin) para edição. Uso: imobilizado (freezer, painel LED, móveis, equipamentos) |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total |

---

## Depende de / Interfere em

- **Estoque — Posição** — apenas categorias ativas aparecem no filtro de posição
- **Estoque — Ajuste** — apenas produtos de categorias ativas têm ajuste de estoque
- **Pedidos** — ao criar um pedido, o sistema reserva estoque apenas para produtos de categorias ativas
- **Catálogo / Novo Pedido / Amostra** — não mostram produtos de categoria com **Vende** desligado
- **Catálogo Personalizado** — o produto não entra na lista quando ela é montada **e** também não aparece na página pública (`/lista/:token`) de uma lista salva antes da regra: o link é público e iria parar na mão do cliente. Some **só o item**; preço, condição e os demais itens do snapshot continuam iguais
- **Produtos — Margem, Custo & Markup** — ignora as categorias com **Vende** desligado (inclusive na captura diária do histórico de custo)
- **Estoque — Posição / Inventário / Histórico** — continuam mostrando esses produtos (é o ponto do imobilizado)

---

## Até onde a trava do "Vende" vai (leia antes de confiar nela)

O filtro é **do servidor**, não da tela: é a própria lista de produtos que o app devolve que já vem sem esses itens. Não adianta o usuário estar numa versão antiga da tela — a lista chega filtrada do mesmo jeito. Por isso o vendedor **não tem como achar** o bem para colocar num pedido.

O que **ainda não existe**: uma checagem no momento de **gravar** o pedido. Quem já estivesse com a tela de pedido aberta **antes** de a categoria ser marcada como "não vende" continua com a lista velha carregada na memória do aparelho e, em tese, conseguiria concluir aquele pedido — basta **recarregar a tela** para a lista nova valer. É uma janela curta e conhecida; a validação na criação do pedido está prevista para uma próxima etapa. Enquanto isso, ao desligar o "Vende" de uma categoria, avise a equipe para recarregar o app.

**Nome digitado torto não escapa da trava.** O casamento produto↔categoria é por texto exato, então "imobilizado" ou "Imobilizado " (com espaço) seriam, em tese, categorias diferentes de "Imobilizado" — e o bem escaparia. O servidor resolve isso sozinho: ao salvar o produto, se o nome bater com uma categoria cadastrada **ignorando maiúsculas/minúsculas e espaços nas pontas**, ele grava a grafia oficial da tabela. E o campo Categoria do cadastro de produto **já oferece as categorias recém-criadas**, mesmo as que ainda não têm nenhum produto — não é preciso digitar à mão.

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/CategoriasEstoque.jsx` | Tela de toggle por categoria |
| `backend/routes/categoriaEstoqueRoutes.js` | Rotas do backend (GET lista, PATCH `controlaEstoque` / `contabilizaFlex` / `vendavel`) |
| `backend/services/categoriaEstoqueService.js` | Salva os toggles e responde quais categorias são "não vende" |
