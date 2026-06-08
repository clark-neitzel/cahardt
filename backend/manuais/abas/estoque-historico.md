---
aba: Estoque — Histórico
rota: /estoque/historico
permissao: admin ou acesso ao módulo de estoque
---

# Estoque — Histórico

## O que é

Registro completo de todas as movimentações de estoque (entradas e saídas), com seus motivos, responsáveis e quantidades antes/depois. Permite auditoria completa do que aconteceu com o estoque de qualquer produto.

---

## O que dá pra fazer aqui

- Ver todas as movimentações de estoque em ordem cronológica
- Filtrar por: tipo (entrada/saída), motivo, período (data início/fim) e nome do produto
- Ver para cada movimentação: produto, tipo, quantidade, responsável, motivo, data, estoque antes/depois e status de sync com CA
- Carregar mais registros (paginação infinita — 60 por vez)

---

## Motivos de movimentação

| Motivo | Quando ocorre |
|--------|---------------|
| AJUSTE_MANUAL | Ajuste feito manualmente na tela de Estoque |
| PEDIDO_ESPECIAL | Baixa de estoque por pedido especial aprovado |
| PEDIDO_BONIFICACAO | Baixa por bonificação |
| FATURAMENTO | Baixa automática ao faturar pedido no CA |
| DEVOLUCAO | Entrada por devolução de cliente |
| REVERSAO_DEVOLUCAO | Estorno de devolução |
| CANCELAMENTO | Estoque liberado por cancelamento de pedido |
| EXCLUSAO | Estoque liberado por exclusão de pedido |

---

## Como fazer (passo a passo real)

### Ver movimentações de um produto
1. Digite o nome do produto no campo de busca
2. A lista filtra para mostrar apenas movimentações daquele produto

### Filtrar por período
1. Clique em **Filtros**
2. Defina data início e data fim
3. Clique em **Aplicar**

### Carregar mais registros
- Clique em **Carregar mais** no rodapé da lista
- Os próximos 60 registros são adicionados

---

## Informações de cada movimentação

| Campo | Significado |
|-------|-------------|
| Produto | Nome do produto |
| Tipo | ENTRADA (verde +) ou SAÍDA (vermelho -) |
| Quantidade | Quantidade movimentada |
| Motivo | Por que aconteceu (ver tabela acima) |
| Responsável | Usuário que fez a movimentação |
| Data | Data e hora do registro |
| Antes → Depois | Estoque antes e depois da movimentação |
| CA | Verde = sincronizado com CA; Âmbar = pendente |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total ao histórico |

---

## Depende de / Interfere em

- **Estoque — Ajuste** — todas as movimentações manuais aparecem aqui
- **Pedidos / Conta Azul** — movimentações automáticas por faturamento também são registradas

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Estoque/HistoricoEstoque.jsx` | Tela de histórico |
| `frontend/src/services/estoqueService.js` | Chamadas de API |
| `backend/src/routes/estoque.js` | Rota de histórico |
