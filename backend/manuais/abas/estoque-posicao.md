---
aba: Estoque — Posição
rota: /estoque/posicao
permissao: admin ou regras de estoque por categoria
---

# Estoque — Posição

## O que é

Visão completa da posição atual de estoque de todos os produtos. Mostra o estoque total, reservado (pedidos não faturados) e disponível de cada produto, com alertas visuais para produtos abaixo do mínimo. Permite definir ou editar o estoque mínimo de cada produto diretamente na tabela.

---

## O que dá pra fazer aqui

- Ver posição de estoque de todos os produtos ativos
- Filtrar por categoria de produto (múltipla seleção) e por status de estoque
- Ordenar por nome, estoque disponível, mínimo ou reservado
- Ver alertas de estoque: triângulo âmbar = abaixo do mínimo; check verde = acima do mínimo
- Editar o estoque mínimo de um produto diretamente na linha (admin)
- Exportar a posição em CSV
- Navegar para os ajustes de estoque ou histórico pelos botões da tela

---

## Colunas da tabela

| Coluna | Significado |
|--------|-------------|
| Produto | Nome e categoria do produto |
| Disponível | Estoque disponível para venda (total - reservado) |
| Mínimo | Estoque mínimo configurado |
| Reservado | Quantidade reservada em pedidos não faturados |
| Total | Estoque total físico |

---

## Como fazer (passo a passo real)

### Ver quais produtos estão em falta
1. Abra a aba Estoque — Posição
2. Procure pelos ícones de triângulo âmbar na coluna da esquerda
3. Ou clique no cabeçalho "Disponível" para ordenar do menor para o maior

### Definir ou editar o estoque mínimo
1. Clique no ícone de lápis na coluna "Mínimo" do produto
2. O campo fica editável inline
3. Altere o valor e salve com o ícone de check (ou cancele com X)

### Filtrar por categoria
- Use o seletor de categorias no topo (multi-seleção)
- Apenas categorias com controle de estoque ativo aparecem (configurado em Config: Categorias Estoque)

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Visualiza tudo e edita mínimos |
| Regras de estoque por categoria | Define quais categorias o usuário pode ver/ajustar |

---

## Depende de / Interfere em

- **Estoque — Ajuste** — para entrada/saída manual, use aquela aba
- **Estoque — Histórico** — para ver todas as movimentações
- **Config: Categorias Estoque** — define quais categorias têm controle de estoque ativo
- **Pedidos** — pedidos faturados baixam o estoque automaticamente via sync com CA

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Estoque/PosicaoEstoque.jsx` | Tela de posição |
| `frontend/src/services/estoqueService.js` | Chamadas de API de estoque |
| `backend/src/routes/estoque.js` | Rotas do backend |
