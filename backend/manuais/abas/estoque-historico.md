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
| PEDIDO_ESPECIAL | Baixa automática ao aprovar pedido especial (desde jul/2026) |
| PEDIDO_BONIFICACAO | Baixa automática ao aprovar bonificação (desde jul/2026) |
| FATURAMENTO | Baixa automática ao faturar pedido no CA |
| PRODUCAO | Entrada de produto acabado vinda da produção (PCP) |
| COMPRA | Entrada por nota de compra recebida |
| ESTORNO_COMPRA | Saída quando uma entrada de compra é cancelada |
| DEVOLUCAO | Entrada por devolução de cliente |
| REVERSAO_DEVOLUCAO | Estorno de devolução |
| CANCELAMENTO | Estorno quando a aprovação de especial/bonificação é revertida |
| CANCELAMENTO_CA | Estorno quando o pedido faturado é cancelado/excluído no Conta Azul |
| EXCLUSAO | Estoque liberado por exclusão de pedido |

**Trava contra duplicidade (jul/2026):** a baixa por pedido é idempotente — se duas rotinas tentarem faturar o mesmo pedido, a segunda não desconta de novo. Antes disso alguns pedidos baixavam em dobro; os casos antigos foram corrigidos com movimentações marcadas "Correção de baixa em dobro" / "Baixa retroativa".

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
