---
aba: Minhas Entregas
rota: /minhas-entregas
permissao: Pode_Executar_Entregas
---

# Minhas Entregas

## O que é

Tela exclusiva do motorista, usada no celular. Mostra o roteiro de entrega do dia e permite dar baixa em cada pedido entregue. É aqui que o motorista registra o que aconteceu em cada parada: entregou tudo, entregou parcialmente ou devolveu. Também registra o pagamento recebido na hora.

> Esta tela é voltada para celular — layout compacto, sem filtros avançados. Para ver e gerenciar os embarques, o responsável logístico usa a aba **Embarque** (`/admin/embarques`).

---

## O que dá pra fazer aqui

- Ver a lista de entregas pendentes do dia (pedidos faturados incluídos em um embarque para este motorista)
- Ver as entregas já concluídas do dia
- Marcar prioridade de entrega com estrela (ordena a sequência de visitas)
- Abrir o endereço do cliente no Google Maps (usa GPS cadastrado ou o endereço completo)
- Dar baixa na entrega via modal de checkout (informar status físico e pagamento recebido)

---

## Como fazer (passo a passo real)

### Ver entregas do dia
1. Acesse `/minhas-entregas`
2. O header mostra "Meu Roteiro" com a contagem de entregas restantes
3. A sub-aba **A Entregar** carrega automaticamente com as entregas pendentes

### Marcar prioridade de entrega
1. Na sub-aba "A Entregar", localize a entrega
2. Clique em **Prioridade** (ícone de estrela) — o backend calcula o número sequencial automaticamente
3. O card fica com borda âmbar e exibe o número de prioridade em destaque
4. Para remover: clique em **Tirar**
5. O total de entregas com prioridade aparece no header (badge âmbar)

### Abrir endereço no Google Maps
1. No card da entrega pendente, clique em **Maps** (botão azul)
2. Se o cliente tem GPS cadastrado (lat,lng), o Maps abre diretamente na coordenada
3. Se não tem GPS, o Maps abre com o endereço completo como busca de texto

### Dar baixa em uma entrega (Check-in)
1. Clique em **Fazer Check-in (Entregar)** no card da entrega pendente
2. O modal de checkout abre em tela cheia com 4 etapas:

**Etapa 1 — Status Físico**
Escolha o que aconteceu na entrega:
- **Entregue** (tudo entregue) → avança para o pagamento (ou direto ao GPS se for boleto)
- **Entregue Parcial** → avança para registrar devoluções
- **Devolvido** (100% devolvido) → avança para informar motivo

**Etapa 2 — Devoluções (apenas para Entregue Parcial)**
- Para cada produto, informe a quantidade devolvida (+ para aumentar, - para diminuir)
- Informe o motivo da devolução (campo de texto ou gravação de voz)
- Clique em avançar — o sistema calcula o saldo líquido a receber

**Etapa 3 — Caixa (pagamento recebido)**
- Não aparece para pedidos de boleto ou condições que não debitam caixa (esses pulam para o GPS)
- O valor já vem preenchido com o saldo calculado (total menos devoluções)
- Selecione a forma de pagamento (formas disponíveis dependem da condição de pagamento do pedido)
- Adicione mais de uma forma se o cliente pagou de formas diferentes
- Cada forma só pode aparecer uma vez; o total deve fechar exatamente (tolerância de R$ 0,05)
- Marque o toggle de divergência se percebeu diferença em relação ao combinado

**Etapa 4 — GPS e Conclusão**
- Clique em **Capturar GPS** para registrar a localização no momento da entrega
- O navegador pedirá permissão de localização
- Clique em **Finalizar** para confirmar — a entrega é salva, o caixa é atualizado e a entrega some da lista de pendentes

### Ver entregas já concluídas
1. Clique na sub-aba **Já Finalizadas**
2. A lista carrega do backend com as entregas concluídas
3. Cada card mostra:
   - Status físico: ENTREGUE (verde), PARCIAL (âmbar) ou DEVOLVIDO 100% (vermelho)
   - Se houve divergência de pagamento apontada
   - Horário e data do check-in

---

## Sub-abas

### A Entregar
Lista de entregas **pendentes** do motorista logado. Mostra apenas pedidos em embarques atribuídos a este motorista que ainda não foram baixados.

Cada card mostra:
- Nome fantasia do cliente (em destaque)
- Endereço completo
- Número do embarque (badge cinza)
- Badge de prioridade (número âmbar, se definido)
- Botão estrela para marcar/desmarcar prioridade
- Botões **Maps** e **Fazer Check-in (Entregar)**

### Já Finalizadas
Lista de entregas **concluídas** pelo motorista. Carregada do backend ao clicar na aba.

Cada card mostra:
- Nome fantasia do cliente
- Número do embarque
- Status físico da entrega (badge colorido)
- Aviso de divergência de pagamento (se houver)
- Horário e data da conclusão

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Executar_Entregas` |
| Dar baixa nas entregas | `Pode_Executar_Entregas` |
| Marcar prioridade | `Pode_Executar_Entregas` |
| Ver entregas de outro motorista | Não disponível nesta tela — use a aba Rota com `Pode_Ver_Todas_Entregas` |

---

## Depende de / Interfere em

- **Embarque** — as entregas desta tela vêm dos embarques criados na aba Embarque pelo responsável logístico
- **Caixa Diário** — cada check-in com pagamento registrado alimenta o caixa do motorista naquele dia
- **Rota** — a Rota também tem as sub-abas Entregas e Entregues para o motorista; o fluxo de checkout é idêntico
- **Contas a Receber** — o pagamento registrado no checkout gera/atualiza a baixa da parcela correspondente

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Motorista/Entregas/PainelMotorista.jsx` | Tela principal com sub-abas e cards de entrega |
| `frontend/src/pages/Motorista/Entregas/CheckoutEntregaModal.jsx` | Modal de checkout em 4 etapas (status, devolução, caixa, GPS) |
| `frontend/src/services/entregasService.js` | Chamadas de API para entregas do motorista |
