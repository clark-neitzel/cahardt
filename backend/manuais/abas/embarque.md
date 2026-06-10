---
aba: Embarque
rota: /admin/embarques
permissao: Pode_Acessar_Embarque
---

# Embarque

## O que é

Painel de expedição logística. Aqui são criados os "embarques" (cargas), que são romaneios de entrega: um conjunto de pedidos faturados que serão entregues juntos por um motorista em uma data. Após criar o embarque, o motorista acessa sua lista de entregas pelo celular e registra a baixa de cada entrega.

---

## O que dá pra fazer aqui

- Ver todos os embarques criados (número, data, motorista, quantidade de pedidos)
- Montar uma nova carga: escolher data de saída e motorista responsável
- Abrir o detalhe de uma carga para:
  - Ver os pedidos e amostras incluídos
  - Adicionar mais pedidos à carga (modal `AdicionarPedidosModal`)
  - Remover pedidos ou amostras da carga (desde que a entrega ainda não foi realizada)
  - Editar data e motorista do embarque (quem tem `Pode_Editar_Embarque`)
  - Ver o status de entrega de cada pedido (PENDENTE, ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO)
  - Imprimir o romaneio completo (roteiro de entrega + consolidado de produtos + rastreabilidade)

---

## Como fazer (passo a passo real)

### Montar uma nova carga
1. Clique em **Montar Nova Carga** (botão azul no canto superior)
2. O modal abre com dois campos:
   - **Data Programada de Saída** — padrão é hoje
   - **Motorista / Responsável** — lista apenas usuários com `Pode_Executar_Entregas` ou `admin`
3. Clique em **Montar Carga** — o embarque é criado com número sequencial
4. O embarque aparece na lista; clique nele para abrir o detalhe e adicionar pedidos

### Adicionar pedidos ao embarque
1. Clique no embarque desejado (desktop: botão "Analisar / Imprimir"; mobile: toque no card)
2. No modal de detalhes, clique em **+ Adicionar Pedidos** (ou equivalente)
3. O modal `AdicionarPedidosModal` abre com a lista de pedidos FATURADOS disponíveis
4. Selecione os pedidos e confirme — eles entram na carga

### Remover pedido da carga
1. Abra o detalhe do embarque
2. Localize o pedido na lista
3. Clique no ícone de remover (lixeira) ao lado do pedido
4. Confirme — o pedido é retirado da carga
5. **Bloqueio:** pedidos com statusEntrega diferente de PENDENTE (já foram entregues, parciais ou devolvidos) não podem ser removidos; é necessário primeiro desfazer a entrega no sistema

### Editar data ou motorista do embarque
1. Abra o detalhe do embarque
2. Clique no botão de edição (lápis) — visível apenas para `Pode_Editar_Embarque` ou `admin`
3. Altere a data de saída e/ou o motorista responsável
4. Clique em Salvar

### Imprimir romaneio
1. Abra o detalhe do embarque
2. Clique em **Imprimir / Pré-visualizar** (ícone de impressora)
3. Uma tela de pré-visualização abre em tela cheia com formato A4
4. O romaneio é dividido em páginas automáticas com 55 itens por página:
   - **Roteiro de Entrega**: lista de pedidos com cliente, cidade e status
   - **Amostras na Carga** (se houver)
   - **Consolidado de Produtos**: quantidade total de cada produto somado de todos os pedidos
   - **Rastreabilidade**: produto → quantidade → quais pedidos o contém
5. Clique em **Imprimir** para enviar para impressora

---

## Quem aparece como motorista

Apenas usuários com a permissão `Pode_Executar_Entregas` ou `admin` e com status ativo aparecem na lista de motoristas ao montar ou editar uma carga.

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Embarque` |
| Criar embarque | `Pode_Acessar_Embarque` (acesso à tela implica criação) |
| Editar data/motorista do embarque | `Pode_Editar_Embarque` ou `admin` |
| Adicionar/remover pedidos da carga | `Pode_Acessar_Embarque` (acesso à tela implica gestão da carga) |
| Aparecer como motorista disponível | `Pode_Executar_Entregas` ou `admin` |

---

## Depende de / Interfere em

- **Pedidos** — somente pedidos com `situacaoCA = FATURADO` podem ser incluídos em um embarque
- **Entregas (Rota e Minhas Entregas)** — após criado, cada pedido do embarque se torna uma entrega pendente para o motorista
- **Caixa Diário** — as baixas de entrega (pagamentos recebidos) registradas pelo motorista alimentam o caixa do dia
- **Auditoria de Entregas** — permite revisar e corrigir pagamentos registrados pelo motorista
- **Veículos** — o veículo não é selecionado no formulário atual de criação (apenas motorista e data); veículo pode estar vinculado via backend

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx` | Lista de embarques e botão de nova carga |
| `frontend/src/pages/Admin/Embarques/NovaCargaModal.jsx` | Modal de criação (data + motorista) |
| `frontend/src/pages/Admin/Embarques/DetalhesCargaModal.jsx` | Modal de detalhes, edição, remoção e impressão do romaneio |
| `frontend/src/pages/Admin/Embarques/AdicionarPedidosModal.jsx` | Modal de seleção de pedidos FATURADOS para adicionar à carga |
| `frontend/src/services/embarqueService.js` | Chamadas de API para embarques |
| `backend/src/routes/embarques.js` | Rotas do backend |
