---
aba: Produtos (Admin)
rota: /admin/produtos
permissao: admin
---

# Produtos (Admin)

## O que é

Gestão completa do cadastro de produtos da empresa. Permite criar, editar, ativar/desativar produtos e sincronizar o catálogo com o Conta Azul. Os produtos cadastrados aqui aparecem no Catálogo de vendas e podem ser adicionados aos pedidos.

---

## O que dá pra fazer aqui

- Listar produtos com filtro por nome, código, EAN, status (ativo/inativo/todos) e categorias
- Filtrar por categoria de produto (interna) e por categoria comercial
- Acessar o detalhe de cada produto para editar dados completos
- Ver imagem do produto
- Ativar ou desativar um produto
- Navegar para a tela de Sincronização para importar produtos do Conta Azul

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
3. Campos que vêm do Conta Azul (nome, código, preço, custo médio, categoria fiscal, EAN, NCM, peso, descrição) são **somente leitura** — não dá para editar no app, pois são sincronizados do CA
4. Campos editáveis no app: **unidade de medida**, categoria comercial, produto substituto, prioridade de recomendação, permitir sugestão e imagens
5. Clique em **Salvar** (botão da seção roxa "Inteligência Comercial") para gravar as alterações

### Alterar a unidade de medida
1. Abra o detalhe do produto
2. No bloco "Valores e Classificação", o campo **Unidade** está editável (ex.: UN, KG, CX)
3. Digite a unidade desejada e clique em **Salvar** na seção roxa abaixo
4. Importante: a unidade é gerenciada **somente no app** — ela **não** é importada nem sobrescrita pela sincronização com o Conta Azul. Os outros valores (preço, custo, estoque) continuam vindo do CA normalmente.

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
