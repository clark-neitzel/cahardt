---
aba: Catálogo
rota: /catalogo
permissao: todos (filtrado por categorias comerciais permitidas ao vendedor)
---

# Catálogo

## O que é

Vitrine de consulta de produtos disponíveis para venda, no mesmo visual do site de congelados (pílulas de categoria, cards com foto e popup ao clicar). O vendedor usa para ver foto, preço, código, estoque e a ficha (tabela nutricional, ingredientes, modo de preparo) antes ou durante a visita. Não é possível criar pedido a partir daqui — o pedido começa na aba **Rota**.

---

## O que dá pra fazer aqui

- Buscar produto por nome ou código
- Filtrar por categoria usando as **pílulas de categoria** no topo (botão "Todos" + uma pílula por categoria comercial, com a cor da categoria)
- Ver os produtos organizados em **seções por categoria** (sem paginação — carrega tudo de uma vez)
- Ver card com foto, nome, preço, código e estoque disponível; etiqueta de status (Ativo / Sem Estoque / Baixo Estoque / Inativo)
- Clicar no produto para abrir um **popup** com: foto(s) em carrossel, preço, estoque, descrição e — quando o produto tem etiqueta cadastrada — a **tabela nutricional (padrão ANVISA)**, ingredientes/alérgenos, modo de preparo, validade e conservação
- Filtro automático por categorias de vendas configuradas no sistema e pelas categorias comerciais permitidas ao vendedor (regras mantidas; as pílulas filtram só dentro do que já é permitido)

---

## Como fazer (passo a passo real)

### Buscar um produto
1. Abra a aba Catálogo
2. Digite o nome ou código no campo de busca
3. A lista atualiza automaticamente (com debounce de 500ms)

### Filtrar por categoria
1. Toque numa pílula de categoria no topo (ex.: o nome da categoria comercial)
2. A lista mostra só os produtos daquela categoria; toque em "Todos" para voltar

### Ver detalhe / ficha de um produto
1. Clique no card do produto
2. Abre um popup com foto(s), preço, estoque e descrição
3. Se o produto tiver etiqueta cadastrada (em **PCP — Dados Etiquetas**), o popup também mostra a tabela nutricional, ingredientes, alérgenos, modo de preparo e validade
4. Feche no botão "Fechar" ou clicando fora do popup

> A ficha nutricional vem da mesma etiqueta usada no site de congelados (procura pela etiqueta vinculada ao produto e, se não houver, pelo código). Produto sem etiqueta mostra "Ficha técnica deste produto ainda não cadastrada".

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
- **Config: Categorias de Produto** — define as categorias comerciais usadas nas pílulas e no filtro
- **Config Gerais** — define quais categorias aparecem no catálogo de vendas (`categorias_vendas`)
- **PCP — Dados Etiquetas** (`/pcp/etiquetas/dados`) — origem da tabela nutricional, ingredientes e modo de preparo mostrados no popup

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Produtos/Catalogo.jsx` | Catálogo: busca, pílulas de categoria, seções por categoria, card e popup da ficha |
| `frontend/src/services/produtoService.js` | Chamadas de API para produtos (inclui `ficha(id)`) |
| `backend/controllers/produtoController.js` | `listar` (com filtros) e `ficha` (dados + etiqueta nutricional) |
| `backend/routes/produtoRoutes.js` | Rota `GET /produtos/:id/ficha` |

> A página antiga `frontend/src/pages/Produtos/DetalheProduto.jsx` continua existindo na rota `/produto/:id`, mas o catálogo agora abre o popup em vez de navegar para ela.
