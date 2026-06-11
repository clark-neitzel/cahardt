---
aba: Rota
rota: /rota
permissao: pedidos (view)
---

# Rota

## O que é

A tela central de trabalho do vendedor. É aqui que começa qualquer ação de vendas: registrar um atendimento, criar um pedido, adicionar uma amostra ou prospectar um lead. Os clientes e leads são exibidos em cards filtrando automaticamente pelo dia da semana de visita.

> **Esta é a aba mais importante para vendas.** Criar pedido, registrar atendimento e prospectar lead — tudo começa aqui.

---

## O que dá pra fazer aqui

- Ver todos os clientes e leads da rota do dia (filtro automático por dia de venda)
- Registrar atendimento (visita, WhatsApp, ligação, amostra, retorno, financeiro)
- Criar novo pedido para o cliente (abre o formulário de pedido)
- Ver orientação de IA antes de atender (popup com análise do comportamento do cliente)
- Ver inadimplência do cliente em tempo real (clique no ícone vermelho)
- Ver o último pedido e última compra do cliente
- Abrir mapa (GPS) do cliente
- Enviar WhatsApp diretamente do card
- Adicionar e prospectar leads (novos pontos de venda)
- Converter lead em cliente
- Ver e finalizar entregas pendentes — sub-abas Entregas e Entregues (visível se o usuário tem `Pode_Executar_Entregas`)
- Organizar rota de entrega com roteirizador (calcula sequência e ETA por GPS)
- Filtrar por dia da semana, forma de atendimento ou ver todos os clientes
- Ver banner de meta da cidade do dia

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

> **Layout da tela de pedido:** os passos são os mesmos no celular e no computador (cliente → tipo → condição de pagamento → data → qualidade do atendimento → produtos). No **computador (tela larga)** a tela mostra duas colunas: à esquerda o formulário e a lista de produtos; à direita um painel fixo **"Itens do Pedido"** com cada item (com botões de +/− e Remover), Subtotal, Frete, Flex e Total sempre visíveis, além do botão **Fechar pedido**. No **celular** o layout é em coluna única, com o botão de fechar fixo no rodapé (igual a antes). Em promoções **CONDICIONAIS**, cada condição mostra um **✓ verde** quando já foi atingida.

### Ver inadimplência do cliente
1. Clique no ícone vermelho de alerta no card
2. Um modal exibe: total vencido, parcelas em aberto e detalhes de cada nota

### Prospectar um lead
1. Clique no botão flutuante laranja **+** no canto inferior direito
2. Preencha nome, endereço, telefone e informações do estabelecimento
3. O lead aparece na lista com etapa "NOVO"

### Filtrar a rota
- Use os botões de dia da semana (DOM, SEG, TER...) para ver clientes de outro dia
- Clique no dia ativo para remover o filtro e ver todos os dias
- Filtre por forma de atendimento (Presencial, WhatsApp, Telefone) pelo dropdown
- O filtro de forma de atendimento é salvo no localStorage por usuário

### Organizar rota de entrega (roteirizador)
1. Na sub-aba **Entregas**, clique em **Organizar Rota**
2. Configure horário de saída e tempo por entrega
3. Clique em **Capturar GPS e Gerar Rota** — o navegador pedirá permissão de localização
4. O sistema calcula a sequência ótima e exibe o número de paradas, distância e duração
5. Cada card de entrega passa a mostrar o número de sequência e o ETA estimado
6. Para limpar a rota organizada, clique no X ao lado do resumo

---

## Sub-abas

A tela Rota possui 4 sub-abas internas acessíveis pela barra no topo da tela.

### Atendimento (fila de visitas)
Lista de clientes e leads que **ainda não foram atendidos hoje** pelo vendedor logado (ou pelo vendedor filtrado, para quem pode escolher). É a fila de trabalho principal do dia.

- Mostra o banner de meta da cidade/do dia no topo
- Filtros de dia da semana e forma de atendimento ficam visíveis nesta sub-aba
- Cards com botões de **Atender** e **Novo Pedido**
- Clientes com alerta de inadimplência exibem ícone vermelho clicável
- Leads mostram a etapa atual (NOVO, PROSPECÇÃO, etc.)

### Atendidos (concluídos hoje)
Lista de clientes e leads que **já receberam pelo menos um atendimento hoje** pelo vendedor. O cliente some da aba Atendimento e aparece aqui logo após o atendimento ser salvo.

- Filtros de dia da semana e forma de atendimento também ficam visíveis aqui
- Os cards continuam com opção de registrar novo atendimento ou pedido
- Útil para consultar o que já foi feito no dia

### Entregas (pendentes do motorista)
Visível apenas para usuários com `Pode_Executar_Entregas` ou `admin`.

Lista de pedidos faturados em embarques que ainda precisam ser entregues fisicamente. Cada card mostra:

- Nome fantasia do cliente e endereço
- Número do embarque
- Botão de estrela para marcar prioridade (o backend calcula o número sequencial)
- ETA estimado e sequência de entrega (quando a rota está organizada)
- Botão **Maps** — abre Google Maps com a localização do cliente (usa GPS cadastrado ou endereço)
- Botão **Fazer Check-in (Entregar)** — abre o modal de checkout para registrar a baixa

Para organizar a sequência de entrega, há o botão **Organizar Rota** (roteirizador por GPS).

### Entregues (concluídas pelo motorista)
Visível apenas para usuários com `Pode_Executar_Entregas` ou `admin`.

Lista de pedidos cujo check-in de entrega já foi realizado. Cada card mostra:

- Status físico da entrega: ENTREGUE, PARCIAL ou DEVOLVIDO
- Se houve divergência de pagamento apontada
- Horário e data do check-in

---

## Cenários de orientação de IA (antes do atendimento)

Antes de registrar um atendimento ou criar pedido, o sistema pode exibir um popup com orientação gerada pela IA com base no histórico do cliente (requer `Pode_Usar_IA_Orientacao`):

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

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `pedidos` (view) |
| Ver entregas e entregues | `Pode_Executar_Entregas` ou `admin` |
| Filtrar por vendedor | `pedidos.clientes = "todos"` ou `admin` |
| Organizar rota de outro motorista | `pedidos.clientes = "todos"` ou `admin` |
| Ver popup de orientação de IA | `Pode_Usar_IA_Orientacao` ou `admin` |
| Ajustar entrega concluída | `Pode_Ajustar_Entregas` ou `admin` |
| Ver todas as entregas (de todos) | `Pode_Ver_Todas_Entregas` ou `admin` |

---

## Depende de / Interfere em

- **Pedidos** — novo pedido criado aqui aparece na aba Pedidos
- **Atendimentos** — todos os registros desta tela aparecem no Painel de Atendimentos
- **Leads** — leads criados aqui aparecem na aba Leads
- **Análise IA** — as orientações geradas pela IA são logadas e visíveis na aba Análise IA
- **Clientes** — os dados de ciclo, última compra e inadimplência vêm do cadastro de clientes
- **Embarque** — as entregas exibidas nas sub-abas Entregas e Entregues vêm dos embarques criados

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Rota/RotaLeads.jsx` | Componente principal com cards, sub-abas e filtros |
| `frontend/src/pages/Rota/ModalAtendimento.jsx` | Modal de registro de atendimento |
| `frontend/src/pages/Rota/ModalNovoLead.jsx` | Modal de cadastro de lead |
| `frontend/src/pages/Rota/ClientePopup.jsx` | Popup de detalhes do cliente |
| `frontend/src/components/Rota/MetaCidadeHojeBanner.jsx` | Banner de meta da cidade |
| `frontend/src/services/leadService.js` | API de leads |
| `frontend/src/services/atendimentoService.js` | API de atendimentos |
| `frontend/src/services/roteirizacaoService.js` | API de roteirização (ETA) |
