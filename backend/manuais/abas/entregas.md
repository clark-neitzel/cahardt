---
aba: Entregas
rota: /admin/entregas
permissao: admin
---

# Entregas

## O que é

Histórico gerencial de todas as entregas realizadas pelo sistema. Mostra cada baixa logística (pedido entregue, parcialmente entregue ou devolvido) com filtros por data, vendedor, motorista (entregador) e status. Permite abrir o detalhe de cada entrega para ver os pagamentos registrados pelo motorista.

---

## O que dá pra fazer aqui

- Listar todas as entregas com paginação
- Filtrar por: texto livre (cliente/CNPJ), período (data início/fim), vendedor, entregador e status de entrega
- Ver status de cada entrega: Entregue, Entregue Parcial, Devolvido, Pendente
- Abrir o detalhe de uma entrega para ver os pagamentos registrados, valor cobrado e observações

---

## Status de entrega

| Status | Significado |
|--------|-------------|
| PENDENTE | O motorista ainda não registrou a baixa |
| ENTREGUE | Entrega confirmada com pagamento registrado |
| ENTREGUE_PARCIAL | Parte dos itens foi entregue |
| DEVOLVIDO | O cliente devolveu o pedido |

---

## Como fazer (passo a passo real)

### Consultar entregas de um dia
1. Abra a aba Entregas
2. Informe a data de início e fim (ou deixe em branco para ver todas)
3. A lista mostra as entregas com status colorido

### Filtrar por motorista
- Selecione o nome do motorista no campo "Entregador"

### Ver detalhes de uma entrega
1. Clique na linha da entrega
2. O modal de detalhe abre com: cliente, pedido, valor, pagamentos registrados e observações

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total à aba |

---

## Depende de / Interfere em

- **Embarque** — as entregas são geradas quando um embarque é criado
- **Caixa Diário** — o motorista registra os pagamentos durante a entrega; eles aparecem no caixa
- **Auditoria de Entregas** — para corrigir pagamentos divergentes
- **Contas a Receber** — pagamentos registrados nas entregas podem dar baixa nas parcelas

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Embarques/ListaEntregasGerencial.jsx` | Tela principal com filtros e lista |
| `frontend/src/pages/Admin/Embarques/ModalDetalheEntrega.jsx` | Modal de detalhes da entrega |
| `frontend/src/services/entregasService.js` | Chamadas de API para entregas |
| `backend/src/routes/entregas.js` | Rotas do backend |
