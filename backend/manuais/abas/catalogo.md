---
aba: Catálogo
rota: /catalogo
permissao: todos (filtrado por categorias comerciais permitidas ao vendedor)
---

# Catálogo

## O que é

Vitrine de consulta de produtos disponíveis para venda. O vendedor usa para ver foto, preço, código e detalhes dos produtos antes ou durante a visita. Não é possível criar pedido a partir daqui — o pedido começa na aba **Rota**.

---

## O que dá pra fazer aqui

- Buscar produto por nome ou código
- Navegar pelos produtos com paginação (12 por página)
- Ver card com foto, nome, preço e código do produto
- Clicar no produto para ver detalhes completos (foto em tamanho maior, EAN, NCM, peso, descrição, estoque)
- Filtro automático por categorias de vendas configuradas no sistema e pelas categorias comerciais permitidas ao vendedor

---

## Como fazer (passo a passo real)

### Buscar um produto
1. Abra a aba Catálogo
2. Digite o nome ou código no campo de busca
3. A lista atualiza automaticamente (com debounce de 500ms)

### Ver detalhe de um produto
1. Clique no card do produto na listagem
2. A tela de detalhe mostra: imagens, preço de venda, custo médio, unidade, categoria, EAN, NCM, peso e descrição
3. Use o botão "Voltar" para retornar à lista na mesma posição

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Acessa o catálogo |
| `permissoes.categoriasComerciais` (array no perfil) | Restringe quais produtos o vendedor vê |

Se o vendedor tiver categorias comerciais definidas no seu cadastro, ele só vê produtos dessas categorias. Sem restrição = vê tudo.

---

## Depende de / Interfere em

- **Produtos** (`/admin/produtos`) — o cadastro e as fotos dos produtos vêm de lá
- **Config: Categorias de Produto** — define as categorias comerciais usadas para filtro
- **Config Gerais** — define quais categorias aparecem no catálogo de vendas (`categorias_vendas`)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Produtos/Catalogo.jsx` | Lista do catálogo com busca e paginação |
| `frontend/src/pages/Produtos/DetalheProduto.jsx` | Tela de detalhe do produto |
| `frontend/src/components/ProductCard.jsx` | Card do produto na listagem |
| `frontend/src/services/produtoService.js` | Chamadas de API para produtos |
