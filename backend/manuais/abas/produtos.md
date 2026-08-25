---
aba: Produtos (Admin)
rota: /admin/produtos
permissao: admin
---

# Produtos (Admin)

## O que é

Gestão completa do cadastro de produtos da empresa. Permite criar, editar, ativar/inativar produtos e controlar as categorias. Desde 08/2026 o cadastro é **100% do app**: a categoria e o status (ativo/inativo) são editados aqui e **não são mais sobrescritos pela sincronização com o Conta Azul**. Os produtos cadastrados aqui aparecem no Catálogo de vendas, no site de congelados e podem ser adicionados aos pedidos.

---

## O que dá pra fazer aqui

- Listar produtos com filtro por nome, código, EAN, status (ativo/inativo/todos) e categorias
- Filtrar por categoria de produto (interna) e por categoria comercial
- Acessar o detalhe de cada produto para editar dados completos
- Ver imagem do produto
- **Ativar ou inativar um produto direto na tela de detalhe** (badge Ativo/Inativo no topo — clique nela ou no link "Inativar/Ativar produto"). Produto inativo some do site de congelados, dos catálogos de venda e das listas; o histórico é mantido e dá para reativar quando quiser. Na lista, produtos inativos aparecem com o selo vermelho "Inativo"
- **Editar a Categoria do produto** (campo "Categoria" no cartão Dados do Produto, marcado como EDITÁVEL): escolha uma categoria existente ou use "+ Criar categoria nova…" para digitar um nome novo. A categoria agrupa estoque, relatórios, margem e flex — desde 08/2026 ela é controlada no app (o sync do CA não a sobrescreve mais)
- Navegar para a tela de Sincronização (legado — o CA é somente leitura e não manda mais categoria nem status)
- **(Fase 6) Criar produto novo** pelo botão "Novo produto" (nome, código SKU, EAN, unidade, valor de venda e categoria) — desde 23/07/2026 o produto nasce **só no app** (o Conta Azul virou somente leitura e não recebe mais cadastros)
- **(Fase 6) Aba "Compras"** no detalhe do produto: histórico de compras vindo das Notas Recebidas (data, fornecedor, nota, quantidade na nota × entrada convertida, custo unitário e total). O **custo manual** do produto é atualizado por média ponderada a cada compra conferida
- **(Fase 6) Controle de estoque por produto**: no detalhe do produto (campo "Controle de estoque") escolha entre **Seguir a categoria** (padrão — vale a configuração de Categorias de Estoque), **Controlar SEMPRE** ou **NÃO controlar**. Produto que não controla estoque **continua recebendo custo e histórico de preços a cada compra** — só não movimenta quantidade (ex.: combustível, gás)
- **(08/2026) Bens do imobilizado (freezer, painel LED, móveis)**: cadastre o bem como produto normal e coloque-o numa **categoria com o toggle "Vende" desligado** (tela Categorias de Estoque). Ele passa a ter estoque e custo como qualquer produto, e **some das listas de venda** — catálogo, novo pedido e amostra recebem do servidor uma lista que já não o contém, então o vendedor não tem como encontrá-lo. *(O que ainda não existe é uma checagem na hora de gravar o pedido: quem estiver com a tela de pedido aberta desde antes da mudança precisa recarregar. Ver "Até onde a trava vai" no manual de Categorias de Estoque.)* Nesta tela de Produtos e no Histórico de Estoque ele **continua aparecendo** (é por aqui que você edita o bem) — o app pede a lista com `?incluirNaoVendaveis=1`
- **Chip "Não vendável"** na lista de produtos: o bem do imobilizado aparece com esse selo, para você distinguir de relance quem está fora da venda sem precisar abrir o produto ou conferir a categoria
- **O estoque não é mais importado do Conta Azul**: produto novo que chega pelo sync entra com estoque zerado; o saldo é formado pelas compras conferidas, ajustes manuais e saídas de faturamento — tudo dentro do app

---

## Como fazer (passo a passo real)

### Buscar um produto
1. Abra a aba Produtos (Admin)
2. Use a busca para filtrar por nome, código ou EAN
3. Use as abas Ativo / Inativo / Todos para filtrar por status
4. Use os filtros de categoria para refinar ainda mais

### Editar um produto
1. Clique no nome ou na linha do produto
2. A tela de detalhe abre
3. Campos do cadastro original (nome, código, preço, custo médio, EAN, NCM, peso, descrição) são **somente leitura**
4. Campos editáveis no app: **categoria**, **status (ativo/inativo)**, **unidade de medida**, **custo manual**, categoria comercial, produto substituto, prioridade de recomendação, permitir sugestão e imagens
5. Clique em **Salvar** (botão da seção roxa "Inteligência Comercial") para gravar as alterações — exceto o ativar/inativar, que salva na hora ao confirmar

### Ativar ou inativar um produto
1. Abra o detalhe do produto
2. No topo, clique na badge **Ativo/Inativo** (ou no link "Inativar produto"/"Ativar produto" ao lado)
3. Confirme na mensagem — a mudança salva na hora, sem precisar clicar em Salvar
4. Inativo = some do site de congelados, dos catálogos e das listas de venda; nada do histórico é apagado

### Trocar ou criar a categoria de um produto
1. Abra o detalhe do produto
2. No cartão "Dados do Produto", clique no campo **Categoria** (tem a tag EDITÁVEL)
3. Escolha uma categoria da lista (dá para buscar digitando) ou clique em **"+ Criar categoria nova…"** e digite o nome
4. Clique em **Salvar e Voltar** para confirmar
5. A categoria também pode ser escolhida (ou criada) já no cadastro pelo botão "Novo produto"

### Custo do produto (Receita × Custo Médio CA × Custo Manual)
- **Custo pela Receita (PCP)**: se o produto está vinculado a um item do PCP com **receita ativa**, o custo exibido no detalhe do produto é o **custo calculado pela receita** (ingredientes + perda ÷ rendimento) — ele **substitui qualquer outro custo** na tela e é o usado no cálculo da margem. O cartão de custo passa a mostrar "Custo (Receita)".
- **Custo Médio CA**: vem do Conta Azul, somente leitura. Vale quando o produto **não tem receita ativa**. É também o custo usado dentro do cálculo das receitas do PCP (custo dos ingredientes).
- **Custo Manual**: campo editável no app, usado como **reserva** — só entra no lugar do custo do CA **quando o CA ainda não tem custo** para aquele produto. Assim que o Conta Azul passar a ter um custo, ele assume automaticamente e o manual fica de reserva.
- Use o Custo Manual para produtos que ainda não têm custo no CA, para que o custo das receitas que usam esse produto não fique incompleto.
- **Zerar custo do CA (botão)**: no detalhe do produto, abaixo do campo Custo Manual, quando o produto **tem custo do CA e não tem receita ativa** aparece o botão **"Zerar custo do CA — usar o Custo Manual"**. Ele descarta o custo vindo do Conta Azul (útil quando o custo do CA está errado e não dá mais para corrigir lá): o app passa a valer o **Custo Manual**, que é atualizado automaticamente por média ponderada a cada **entrada de compra** conferida no app. A sincronização com o CA **não traz o custo antigo de volta**. O cartão de custo passa a mostrar "Custo (App)". Dá para desfazer pelo botão "Voltar a usar o custo do CA" (o custo do CA retorna no próximo sync). Produto com receita ativa não mostra o botão — o custo da receita já prevalece.

### Alterar a unidade de medida
1. Abra o detalhe do produto
2. No bloco "Valores e Classificação", o campo **Unidade** está editável (ex.: UN, KG, CX)
3. Digite a unidade desejada e clique em **Salvar** na seção roxa abaixo
4. Importante: a unidade é gerenciada **somente no app** — ela **não** é importada nem sobrescrita pela sincronização com o Conta Azul. Preço de venda e custo médio continuam vindo do CA; **o ESTOQUE não é mais importado do CA** — o controle de quantidade é 100% do app (entradas pelas compras das Notas Recebidas e ajustes manuais, saídas pelo faturamento).

### Adicionar/trocar imagem
- Na tela de detalhe, há a seção de imagens
- Clique no ícone de câmera para enviar nova foto
- O produto passa a ter imagem no catálogo e nos cards da Rota

### Sincronizar com o Conta Azul
- Clique no link "ir para Sincronização" no topo da lista
- Na tela de Sync, importe os produtos do CA para o sistema

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total ao gerenciamento de produtos |

---

## Depende de / Interfere em

- **Catálogo** — os produtos ativos aparecem no catálogo de vendas
- **Pedidos** — produtos cadastrados aqui são usados nos pedidos
- **Conta Azul** — códigos e dados fiscais vêm da sincronização com o CA
- **Config: Categorias de Produto** — as categorias comerciais usadas para filtrar no catálogo
- **PCP** — os produtos de tipo PA (produto acabado) são gerenciados nas receitas do PCP
- **Estoque** — o controle de estoque por categoria afeta quais produtos têm saldo gerenciado

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Produtos/ListaProdutos.jsx` | Lista com filtros e paginação |
| `frontend/src/pages/Produtos/DetalheProduto.jsx` | Tela de detalhe e edição |
| `frontend/src/pages/Admin/Produtos/GerenciarProduto.jsx` | Formulário completo de criação/edição (admin) |
| `frontend/src/services/produtoService.js` | Chamadas de API para produtos |
| `backend/src/routes/produtos.js` | Rotas do backend |
