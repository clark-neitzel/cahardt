---
aba: Estoque — Ajuste
rota: /estoque/ajuste
permissao: regras de estoque por categoria (admin tem acesso total)
---

# Estoque — Ajuste

## O que é

Painel de ajuste manual de estoque. Usado para registrar entradas (compras, devoluções de cliente, produção) e saídas (perdas, amostras, uso interno) de produtos. O usuário busca o produto pelo nome ou EAN (código de barras), seleciona e informa a quantidade.

---

## O que dá pra fazer aqui

- Ver todos os produtos em cards (com busca e filtro por categoria comercial)
- Ver "Lançados hoje" em cada card: saldo líquido do dia (+entrada / -saída)
- Escolher um produto clicando em "Escolher" no card
- Ver a posição atual do produto selecionado (total, reservado, disponível, mínimo)
- Registrar entrada de estoque
- Registrar saída de estoque
- Editar o estoque mínimo do produto (admin)
- Ir para o histórico de movimentações

---

## Como fazer (passo a passo real)

### Layout da tela

No **desktop**, a tela tem dois painéis lado a lado:
- **Esquerda**: lista de cards de produtos (busca + filtros de categoria + cards com estoque)
- **Direita**: formulário de ajuste (aparece ao selecionar um produto; placeholder cinza se nenhum produto selecionado)

No **mobile**, a lista de cards aparece primeiro. Ao clicar em "Escolher", a lista some e aparece o formulário. Um botão "Voltar à lista" permite voltar aos cards.

### Registrar uma entrada ou saída
1. Use a busca ou clique em uma categoria para filtrar os produtos
2. Clique em **Escolher** no card do produto desejado
3. O painel à direita (ou abaixo, no mobile) mostra o produto com o estoque atual
4. Informe a quantidade
5. Adicione uma observação (opcional)
6. Clique em **+ Entrada** ou **- Saída**
7. O estoque é atualizado imediatamente; o card na lista reflete o novo saldo

### Ler o "Lançados hoje" nos cards
- Cada card mostra o saldo líquido do dia: entradas menos saídas
- Verde com "+" = mais entrou do que saiu hoje
- Vermelho com "-" = mais saiu do que entrou hoje
- Se não aparecer: nenhum movimento hoje para esse produto

### Verificar se tem permissão
- O sistema carrega as regras de permissão de estoque do usuário ao abrir a tela
- Se o usuário só pode ajustar determinadas categorias, produtos fora das categorias permitidas não aparecem na lista
- Se o botão de entrada ou saída estiver bloqueado, o usuário não tem permissão para aquela ação naquela categoria

---

## Controle de permissões de estoque

O admin configura as regras em Configurações. Cada regra define:
- Qual categoria de produto pode ser ajustada
- Se pode adicionar (entrada), diminuir (saída) ou ambos

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso e ajuste total |
| Regra de estoque (categoria + pode adicionar/diminuir) | Acesso restrito às categorias configuradas |

---

## Depende de / Interfere em

- **Estoque — Posição** — os saldos são atualizados imediatamente após o ajuste
- **Estoque — Histórico** — cada ajuste fica registrado no histórico
- **Conta Azul** — o sistema tenta sincronizar o ajuste de estoque com o CA (campo `sincCA`)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Estoque/PainelEstoque.jsx` | Painel de ajuste |
| `frontend/src/services/estoqueService.js` | Chamadas de API |
| `backend/src/routes/estoque.js` | Rotas do backend |
