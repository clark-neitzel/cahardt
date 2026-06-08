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

- Buscar produto por nome ou EAN (código de barras)
- Ver a posição atual do produto selecionado (total, reservado, disponível, mínimo)
- Registrar entrada de estoque
- Registrar saída de estoque
- Editar o estoque mínimo do produto (admin)
- Ver histórico de ajustes do produto selecionado

---

## Como fazer (passo a passo real)

### Registrar uma entrada
1. Digite o nome ou escaneie o EAN do produto
2. A lista de sugestões aparece — clique no produto correto
3. O painel do produto abre com o estoque atual
4. Clique no botão **+ Entrada**
5. Informe a quantidade e uma observação (opcional)
6. Confirme — o estoque é atualizado imediatamente

### Registrar uma saída
1. Selecione o produto (mesma forma que acima)
2. Clique no botão **- Saída**
3. Informe a quantidade
4. Confirme

### Verificar se tem permissão
- O sistema carrega as regras de permissão de estoque do usuário ao abrir a tela
- Se o usuário só pode ajustar determinadas categorias, produtos fora das categorias permitidas não aparecem na busca
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
