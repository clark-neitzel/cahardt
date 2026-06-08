---
aba: PCP — Subprodutos
rota: /pcp/itens
permissao: admin ou acesso ao módulo PCP
---

# PCP — Subprodutos

## O que é

Cadastro de subprodutos (itens intermediários de produção). Subprodutos são componentes que precisam ser fabricados antes de entrar em outro produto final. Por exemplo: uma massa que é feita primeiro e depois usada em vários produtos. Matérias-primas (MP), produtos acabados (PA) e embalagens (EMB) vêm do cadastro de Produtos; somente subprodutos (SUB) são gerenciados aqui.

---

## O que dá pra fazer aqui

- Listar subprodutos ativos (ou inativos/todos)
- Buscar por nome ou código
- Ver estoque atual e estoque mínimo de cada subproduto
- Identificar subprodutos abaixo do estoque mínimo (destaque vermelho)
- Criar novo subproduto
- Editar um subproduto existente
- Ativar ou desativar um subproduto

---

## Tipos de item no PCP

| Tipo | Origem | Descrição |
|------|--------|-----------|
| MP | Cadastro de Produtos | Matéria-prima (ex: farinha, açúcar) |
| SUB | Esta aba | Subproduto intermediário (ex: massa pronta) |
| PA | Cadastro de Produtos | Produto Acabado (ex: bolo pronto) |
| EMB | Cadastro de Produtos | Embalagem (ex: caixa, saco) |

---

## Como fazer (passo a passo real)

### Criar um subproduto
1. Clique em **+ Novo Subproduto**
2. Preencha: código, nome, unidade de medida, estoque mínimo
3. Salve — o subproduto fica disponível para ser usado nas Receitas

### Editar um subproduto
1. Clique no ícone de lápis na linha do item
2. A tela de edição abre
3. Edite os campos e salve

### Ativar/desativar
- Clique no ícone de toggle na linha do item
- Itens inativos ficam com opacidade reduzida e não aparecem nas seleções de receita

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Gerencia subprodutos |

---

## Depende de / Interfere em

- **PCP — Receitas** — subprodutos são usados como componentes nas receitas de produção
- **PCP — Estoque** — o estoque dos subprodutos é gerenciado naquele painel
- **PCP — Sugestões** — quando o subproduto fica abaixo do mínimo, o sistema sugere produção

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/ItensPcp.jsx` | Lista de subprodutos |
| `frontend/src/services/pcpItemService.js` | Chamadas de API |
| `backend/src/routes/pcp/itens.js` | Rotas do backend |
