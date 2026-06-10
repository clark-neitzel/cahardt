---
aba: Config — Controle de Estoque por Categoria
rota: /configuracoes/categorias-estoque
permissao: admin
---

# Config — Controle de Estoque por Categoria

## O que é

Define quais categorias de produto têm controle de estoque ativo no sistema. Somente produtos das categorias ativadas aqui terão os campos de estoque calculados (reservado, disponível). Categorias desativadas não movimentam estoque.

---

## O que dá pra fazer aqui

- Ver todas as categorias do Conta Azul detectadas nos produtos cadastrados
- Ativar/desativar controle de **Estoque** por categoria (toggle verde)
- Ativar/desativar **Flex** por categoria (toggle roxo) — se desativado, produtos dessa categoria são excluídos do cálculo de flex
- Ver quais categorias ainda não foram configuradas (detectadas nos produtos mas sem configuração salva)

---

## Como fazer (passo a passo real)

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

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/CategoriasEstoque.jsx` | Tela de toggle por categoria |
| `backend/src/routes/categoriasEstoque.js` | Rotas do backend |
