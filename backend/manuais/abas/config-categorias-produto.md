---
aba: Config — Categorias de Produto (Comercial)
rota: /configuracoes/categorias-produto
permissao: admin
---

# Config — Categorias de Produto (Comercial)

## O que é

Cadastro das categorias comerciais de produto. Estas categorias são usadas para organizar produtos do ponto de vista de vendas (ex: "Linha Premium", "Festas", "Produtos Orgânicos") e para controlar o acesso de vendedores: um vendedor pode ter permissão para vender apenas certas categorias.

> **Atenção:** estas são categorias comerciais criadas no sistema, diferentes das categorias fiscais do Conta Azul.

---

## O que dá pra fazer aqui

- Listar todas as categorias de produto comerciais
- Criar nova categoria
- Editar uma categoria (nome, descrição, cor, ordem de exibição)
- Excluir uma categoria (somente se não estiver em uso)
- Ativar / desativar uma categoria
- Configurar se a categoria permite venda fracionada

---

## Como fazer (passo a passo real)

### Criar uma categoria nova
1. Clique em **+ Nova Categoria**
2. Preencha: nome, descrição, ordem de exibição e cor da tag
3. Marque se permite fração (ex: 0,5 unidades)
4. Salve

### Editar uma categoria
1. Clique no ícone de lápis na linha da categoria
2. Edite os campos
3. Salve

### Excluir
1. Clique no ícone de lixeira
2. Confirme — o sistema bloqueia se a categoria estiver associada a produtos

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total |

---

## Depende de / Interfere em

- **Produtos** — cada produto pode ter uma categoria comercial associada
- **Catálogo** — vendedores com restrição de categoria comercial veem apenas produtos das categorias permitidas
- **Vendedores** — a lista `categoriasComerciais` no perfil do vendedor usa os IDs dessas categorias
- **Delivery** — categorias comerciais são usadas na configuração do Delivery para definir quais pedidos entram no Kanban

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/CategoriasProduto.jsx` | Tela de gerenciamento |
| `frontend/src/services/categoriaProdutoService.js` | Chamadas de API |
| `backend/src/routes/categoriasProduto.js` | Rotas do backend |
