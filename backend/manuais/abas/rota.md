---
aba: Rota
rota: /rota
permissao: todos (vendedor vê os próprios clientes e leads)
---

# Rota

## O que é

A tela central de trabalho do vendedor. É aqui que começa qualquer ação de vendas: registrar um atendimento, criar um pedido, adicionar uma amostra ou prospectar um lead. Os clientes e leads são exibidos em cards filtrando automaticamente pelo dia da semana de visita.

> **Esta é a aba mais importante para vendas.** Criar pedido, registrar atendimento e prospectar lead tudo começa aqui.

---

## O que dá pra fazer aqui

- Ver todos os clientes e leads da rota do dia (filtro automático por dia de venda)
- Registrar atendimento (visita, WhatsApp, ligação, amostra, retorno, financeiro)
- Criar novo pedido para o cliente (abre o formulário de pedido)
- Ver orientação de IA antes de atender (popup com análise do comportamento do cliente)
- Ver inadimplência do cliente em tempo real (click no ícone vermelho)
- Ver o último pedido e última compra do cliente
- Abrir mapa (GPS) do cliente
- Enviar WhatsApp diretamente do card
- Adicionar e prospectar leads (novos pontos de venda)
- Converter lead em cliente
- Ver e finalizar entregas pendentes (se o vendedor executa entregas)
- Filtrar por dia da semana, forma de atendimento, ou ver todos os clientes
- Ver banner de meta da cidade do dia

---

## Cenários de orientação de IA (antes do atendimento)

Antes de registrar um atendimento ou criar pedido, o sistema pode exibir um popup com a orientação gerada pela IA com base no histórico do cliente:

| Cenário | Significado |
|---------|-------------|
| Novo sem compra | Cliente sem histórico de compras |
| 1ª compra sem recompra | Fez apenas uma compra e não voltou |
| Regular no prazo | Comprando dentro do ciclo esperado |
| Em atenção | Compra está atrasando um pouco |
| Atrasado | Passou ~2 ciclos sem comprar |
| Parado | Inativo há muito tempo |
| Queda de ticket | Está comprando menos que o normal |
| Nega por WhatsApp | Vários atendimentos negativos recentes |
| Objeção recorrente | Devolveu + parou de comprar |

---

## Como fazer (passo a passo real)

### Registrar um atendimento
1. Localize o card do cliente na rota
2. Clique em **Atender**
3. Se houver orientação de IA, o popup aparece por 10 segundos — leia e clique "Confirmar leitura"
4. Selecione o tipo de atendimento (Visita, WhatsApp, etc.)
5. Escolha a ação e preencha a observação
6. Clique em Salvar

### Criar um pedido
1. Localize o card do cliente
2. Clique em **Novo Pedido**
3. Se houver orientação de IA, confirme a leitura
4. O app navega para `/pedidos/novo?clienteId=...`
5. Preencha o pedido normalmente

### Ver inadimplência do cliente
1. Clique no ícone vermelho de alerta no card
2. Um modal exibe: total vencido, parcelas em aberto e detalhes de cada nota

### Prospectar um lead
1. Clique no botão **+ Lead** (ou o botão flutuante de adição)
2. Preencha nome, endereço, telefone e informações do estabelecimento
3. O lead aparece na lista com etapa "NOVO"

### Filtrar a rota
- Use as abas de dia da semana (SEG, TER...) para ver clientes de outro dia
- Filtre por forma de atendimento (Presencial, WhatsApp, Telefone)
- "N/D" mostra clientes sem dia definido

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê a própria rota |
| `pedidos.clientes = "todos"` | Pode escolher o vendedor da rota a ver |
| `Pode_Usar_IA_Orientacao` | Vê o popup de orientação da IA |

---

## Depende de / Interfere em

- **Pedidos** — novo pedido criado aqui aparece na aba Pedidos
- **Atendimentos** — todos os registros desta tela aparecem no Painel de Atendimentos
- **Leads** — leads criados aqui aparecem na aba Leads
- **Análise IA** — as orientações geradas pela IA são logadas e visíveis na aba Análise IA
- **Clientes** — os dados de ciclo, última compra e inadimplência vêm do cadastro de clientes

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Rota/RotaLeads.jsx` | Componente principal com cards de clientes e leads |
| `frontend/src/pages/Rota/ModalAtendimento.jsx` | Modal de registro de atendimento |
| `frontend/src/pages/Rota/ModalNovoLead.jsx` | Modal de cadastro de lead |
| `frontend/src/pages/Rota/ClientePopup.jsx` | Popup de detalhes do cliente |
| `frontend/src/components/Rota/MetaCidadeHojeBanner.jsx` | Banner de meta da cidade |
| `frontend/src/services/leadService.js` | API de leads |
| `frontend/src/services/atendimentoService.js` | API de atendimentos |
