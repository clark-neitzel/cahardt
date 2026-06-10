---
aba: Clientes
rota: /clientes
permissao: clientes (view)
---

# Clientes

## O que é

Cadastro completo de clientes da empresa. Permite consultar, filtrar, editar dados de cada cliente e realizar ações em lote como reatribuir vendedor, mudar dia de entrega ou dia de venda. É também por aqui que se acessa o detalhe do cliente com todas as informações comerciais, fiscais e de contato.

---

## O que dá pra fazer aqui

- Listar clientes com filtros de busca (nome, CNPJ, cidade), dia de entrega, dia de venda, vendedor, condição de pagamento e condição permitida
- Alternar entre clientes Ativos e Inativos
- Selecionar clientes em lote e atualizar: vendedor, dia de entrega, dia de venda e formas de atendimento
- Abrir o popup de inadimplência do cliente (valores vencidos, parcelas em aberto)
- Entrar no detalhe do cliente para editar o cadastro completo
- Sincronizar dados do cliente com o Conta Azul

---

## Como fazer (passo a passo real)

### Buscar um cliente
1. Abra a aba Clientes
2. Use o campo de busca (por nome, cidade ou CNPJ)
3. Use os filtros de dia, vendedor ou condição para refinar

### Ver inadimplência
1. Localize o cliente na lista
2. Clique no ícone de alerta (triângulo vermelho) na linha do cliente
3. O modal abre com total vencido, parcelas e detalhes de cada nota

### Editar um cliente
1. Clique na linha do cliente para abrir o detalhe (`/clientes/:uuid`)
2. Navegue pelas sub-abas: Cadastro, Admin ou Histórico
3. Edite os campos desejados e clique em **Salvar Alterações**
4. Os dados são gravados e, se o cadastro tiver campos do Conta Azul (email, celular, IE), são sincronizados com o CA

### Alterar dados em lote
1. Marque o checkbox de um ou mais clientes
2. Um botão de "Ações em lote" aparece no topo
3. Escolha o campo para alterar: vendedor, dia de entrega, dia de venda ou formas de atendimento
4. Confirme — o sistema atualiza todos os selecionados de uma vez

---

## Filtros disponíveis

| Filtro | Descrição |
|--------|-----------|
| Busca | Nome fantasia, razão social, CNPJ ou cidade |
| Vendedor | Filtra por vendedor responsável |
| Dia de Entrega | Dia da semana em que o motorista entrega |
| Dia de Venda | Dia da semana em que o vendedor visita |
| Condição Padrão | Condição de pagamento padrão do cliente |
| Condição Permitida | Filtra por condição que o cliente tem autorizado |
| Ativos / Inativos | Aba de seleção no topo |

---

## Sub-abas (dentro do detalhe do cliente)

Ao abrir o detalhe de um cliente (`/clientes/:uuid`), há sub-abas internas.

### Cadastro (label: "✏️ Cadastro")
Aba padrão ao abrir o detalhe. Contém tudo que é editável pelo time comercial. Está dividida em seções (cards):

**Vendedor e Indicação**
- Vendedor responsável pelo cliente (select)
- Indicação: qual outro cliente indicou este (busca por nome)

**Logística**
- Dia de visita/venda (multi-seleção por dia da semana)
- Dia de entrega (multi-seleção por dia da semana)
- Localização GPS (lat,lng) — editar aqui atualiza o ponto usado pelo motorista no Maps

**Canais e Pagamento**
- Canais de atendimento preferenciais: Presencial, Whatsapp, Telefone
- Condição de pagamento padrão (pré-preenche no formulário de pedido)
- Condições permitidas — quais condições o vendedor pode oferecer a este cliente no App

**Inteligência Comercial**
- Categoria do cliente (segmento) — define ciclo de compra padrão
- Sobrescrever ciclo de compra (dias personalizados)
- Aviso comercial fixado — alerta que aparece ao criar pedido para este cliente
- Toggle: Insights Ativos (sugerir produtos na venda)
- Toggle: Recebe aviso de pedido via WhatsApp

**Contato / Fiscal** (campos sincronizados com o Conta Azul ao salvar)
- E-mail
- Celular (com DDD, só números)
- Inscrição Estadual (9 dígitos SC) + link para consultar Sintegra SC
- Indicador de IE (Contribuinte, Não Contribuinte, Isento)
- Telefone fixo (somente leitura, vem do CA)

**Observações Gerais**
- Campo de texto livre com anotações sobre o cliente

**Informações do Cadastro** (somente leitura — vêm do Conta Azul)
- Tipo de pessoa, código, perfis
- Endereço completo (logradouro, bairro, cidade, estado, CEP)
- Financeiro: atrasos de pagamento e recebimento, pagamentos e recebimentos do mês atual
- Auditoria: data de criação, última alteração e UUID

A barra de ações fica fixada no rodapé com os botões **Descartar** e **Salvar Alterações**.

### Admin (label: "⚙️ Admin")
Painel de debug do motor analítico (Inteligência Comercial). Exibe os dados calculados internamente para o cliente:

- Status de recompra (NO_PRAZO, ATENCAO, ATRASADO, CRITICO)
- Ciclo de referência e dias sem comprar
- Ticket médio base e recente, variação percentual
- Score de oportunidade (upsell)
- Score de risco (churn): devolução recente, visitas sem pedido
- Botão **Forçar Recálculo** — dispara novo cálculo do insight

> O vendedor não vê estes dados desta forma. Esta aba é para diagnóstico administrativo.

### Histórico
Linha do tempo unificada com todos os registros vinculados a este cliente, em ordem cronológica decrescente. Inclui:

- Atendimentos do cliente (registrados na Rota ou diretamente)
- Atendimentos feitos em leads que foram convertidos para este cliente
- Pedidos realizados
- Devoluções registradas

O contador no label mostra o total de itens combinados.

### Lead (aparece apenas se o cliente tem leads vinculados)
Exibe os leads que foram associados a este cliente — geralmente leads convertidos. Mostra número do lead, nome do estabelecimento e informações de prospecção.

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `clientes` (view) |
| Editar cadastro (campos CA) | `clientes.edit` ou `Pode_Editar_GPS` ou `admin` |
| Filtrar por vendedor (lote e lista) | `pedidos.clientes = "todos"` ou `admin` |
| Ver e editar todos os clientes | `admin` |

---

## Depende de / Interfere em

- **Rota** — os clientes desta lista aparecem nos cards da Rota com base no vendedor e dias de venda
- **Pedidos** — condição de pagamento padrão pré-preenche o formulário de pedido
- **Conta Azul** — email, celular e inscrição estadual são sincronizados com o CA ao salvar
- **Config: Categorias de Cliente** — as categorias definem ciclo padrão e regras de flex/desconto
- **Análise IA** — os insights do cliente são recalculados automaticamente e exibidos na sub-aba Admin

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Clientes/ListaClientes.jsx` | Lista principal com filtros e ações em lote |
| `frontend/src/pages/Clientes/DetalheCliente.jsx` | Tela de detalhe com sub-abas Cadastro, Admin, Histórico e Lead |
| `frontend/src/services/clienteService.js` | Chamadas de API para clientes |
| `frontend/src/services/clienteInsightService.js` | Chamadas de API para insights do cliente |
| `backend/src/routes/clientes.js` | Rotas do backend |
