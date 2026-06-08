---
aba: Embarque
rota: /admin/embarques
permissao: admin ou Pode_Executar_Entregas (para visualizar e montar cargas)
---

# Embarque

## O que é

Painel de expedição logística. Aqui são criados os "embarques" (cargas), que são romaneios de entrega: um conjunto de pedidos faturados que serão entregues juntos por um motorista em uma data. Após criar o embarque, o motorista acessa sua lista de entregas pelo celular e registra a baixa de cada entrega.

---

## O que dá pra fazer aqui

- Ver todos os embarques criados (número, data, motorista, quantidade de pedidos)
- Montar uma nova carga (criar embarque): selecionar pedidos faturados, motorista e veículo
- Abrir o detalhe de uma carga para analisar os pedidos incluídos, imprimir o romaneio e acompanhar o status de entrega de cada um

---

## Como fazer (passo a passo real)

### Montar uma nova carga
1. Clique em **Montar Nova Carga**
2. O modal de nova carga abre
3. Selecione a data de saída, o motorista (responsável) e o veículo
4. Adicione os pedidos que irão na carga (apenas pedidos FATURADOS)
5. Salve — o embarque é criado com número sequencial

### Ver detalhes / imprimir romaneio
1. Clique em **Analisar / Imprimir** na linha do embarque (desktop) ou no card (mobile)
2. O modal de detalhe abre mostrando todos os pedidos e o status de entrega de cada um
3. Há botão de impressão do romaneio

### Trocar motorista ou veículo
- No detalhe do embarque, é possível editar motorista e veículo antes de confirmar a saída

---

## Quem aparece como motorista

Apenas usuários com a permissão `Pode_Executar_Entregas` ou `admin` aparecem na lista de motoristas ao montar uma carga.

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total |
| `Pode_Executar_Entregas` | Aparece como motorista disponível; acessa suas próprias entregas |

---

## Depende de / Interfere em

- **Pedidos** — somente pedidos FATURADOS podem ser incluídos em um embarque
- **Entregas** — após criado, cada item do embarque se torna uma entrega pendente para o motorista
- **Caixa Diário** — as baixas de entrega (pagamentos recebidos) aparecem no caixa do motorista
- **Auditoria de Entregas** — permite revisar e corrigir pagamentos registrados pelo motorista
- **Veículos** — o veículo associado ao embarque alimenta a ficha do veículo

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx` | Lista de embarques e botão de nova carga |
| `frontend/src/pages/Admin/Embarques/NovaCargaModal.jsx` | Modal de criação da carga |
| `frontend/src/pages/Admin/Embarques/DetalhesCargaModal.jsx` | Modal de detalhes e impressão |
| `frontend/src/services/embarqueService.js` | Chamadas de API para embarques |
| `backend/src/routes/embarques.js` | Rotas do backend |
