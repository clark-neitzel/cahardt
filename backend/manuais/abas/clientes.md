---
aba: Clientes
rota: /clientes
permissao: clientes (view)
---

# Clientes

## O que é

Cadastro completo de clientes da empresa — **o cadastro agora é 100% do app** (desde 07/2026 os dados de cliente NÃO vêm mais do Conta Azul nem são enviados para lá). Permite cadastrar cliente novo com busca automática de dados pelo CNPJ, consultar, filtrar, editar todos os dados de cada cliente e realizar ações em lote como reatribuir vendedor, mudar dia de entrega ou dia de venda.

---

## O que dá pra fazer aqui

- **Cadastrar cliente novo** (botão "Novo Cliente" no topo da lista): digitando o CNPJ, o app busca automaticamente razão social, nome fantasia, endereço, telefone e e-mail na Receita Federal e a **Inscrição Estadual na SEFAZ** (via certificado digital do app). Tudo pode ser conferido/editado antes de salvar
- Listar clientes com filtros de busca (nome, CNPJ, cidade), dia de entrega, dia de venda, vendedor, condição de pagamento e condição permitida
- Alternar entre clientes Ativos e Inativos
- Selecionar clientes em lote e atualizar: vendedor, dia de entrega, dia de venda e formas de atendimento
- Abrir o popup de inadimplência do cliente (valores vencidos, parcelas em aberto)
- Entrar no detalhe do cliente para editar o cadastro completo (inclusive razão social, CNPJ e endereço)

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

> **Corrigido em 08/2026 — o selo estava escondendo devedor.** O selo de inadimplente da lista e o popup ignoravam os títulos de pedidos **faturados aqui no app** (que são a maioria hoje): o cliente devia e aparecia limpo, e a venda a prazo não era barrada. Agora esses títulos contam, então **mais clientes aparecem marcados** — e o mesmo número passa a valer no bloqueio de venda (aba Pedidos). Continuam **fora** da conta: pedido cancelado/excluído no Conta Azul e especial já pago em dinheiro na entrega que só aguarda a conferência do Caixa.

### Cadastrar um cliente novo (ou fornecedor)
1. Na lista de clientes, clique em **Novo Cliente** (botão verde no topo — precisa da permissão `clientes.edit` ou admin)
2. Escolha o tipo de cadastro: **Cliente**, **Fornecedor** ou **Cliente + Fornecedor**. Fornecedor vai para a lista de Fornecedores (usada no Contas a Pagar e Notas de Entrada); "Cliente + Fornecedor" grava nos dois lugares
3. Digite o CNPJ. Assim que ele fica completo e válido, o app consulta a Receita Federal e a SEFAZ e preenche razão social, fantasia, endereço, telefone, e-mail e Inscrição Estadual automaticamente
4. Confira/edite os campos (todos são editáveis). Endereço completo é obrigatório para emitir NF-e depois. CNPJ/CPF é **obrigatório** e o dígito verificador é validado
4b. **WhatsApp (campo Celular)** — vira **campo obrigatório em cadastro de cliente quando a exigência estiver LIGADA** na tela Pendências de WhatsApp (é o mesmo interruptor do bloqueio de envio de pedido; ele vem desligado de fábrica). **Enquanto estiver desligado, o cadastro continua salvando sem o número, como sempre foi.** É por esse número que sai a confirmação do pedido, o boleto/PIX e a cobrança, e é como o escritório fala com o cliente quando o vendedor falta. Com a exigência ligada, antes de salvar o app ainda **pergunta ao WhatsApp da empresa se o número existe** (é uma consulta — **nenhuma mensagem é enviada ao cliente**): se a resposta for que não existe, o cadastro é recusado com "Esse número não tem WhatsApp. Confira com o cliente."; se não der para perguntar na hora (WhatsApp da empresa fora do ar), **o cadastro salva normalmente** e fica marcado como "não deu para verificar". Cadastro que é **só fornecedor** nunca pede WhatsApp
5. Clique em **Cadastrar**. Para cliente, o código sequencial é gerado automaticamente e a tela abre no detalhe; fornecedor puro leva à tela de Fornecedores
6. Também funciona com CPF (pessoa física), mas aí não há busca automática — preencha manualmente
7. **Não duplica**: se o documento já existir (como cliente ou como fornecedor), o app avisa e oferece abrir o cadastro existente

### Editar um cliente
1. Clique na linha do cliente para abrir o detalhe (`/clientes/:uuid`)
2. Navegue pelas sub-abas: Cadastro, Admin ou Histórico
3. Edite os campos desejados e clique em **Salvar Alterações** — tudo fica gravado só no app (nada vai para o Conta Azul)
4. No card "Informações do Cadastro" há o botão **Atualizar pela Receita/SEFAZ**: re-consulta o CNPJ e preenche o formulário com os dados atuais (endereço novo, IE etc.) — nada é salvo até clicar em Salvar

### Alterar dados em lote
1. Marque o checkbox de um ou mais clientes
2. Um botão de "Ações em lote" aparece no topo
3. Escolha o campo para alterar: **É cliente** (Sim/Não — desativa/reativa o lado cliente), **É fornecedor** (Sim/Não — liga/desliga o espelho na lista de Fornecedores; exige CNPJ/CPF no cadastro), vendedor, dia de entrega, dia de venda ou formas de atendimento
4. Confirme — o sistema atualiza todos os selecionados de uma vez ("Não alterar" mantém como está)

### Desativar / reativar clientes em lote
1. Filtre quem quer desligar (ex.: Tempo sem Vendas "de 180 até em branco" ou "Nunca comprou") e marque os checkboxes (o "selecionar todos" pega a página atual — aumente o "Exibir por página" para pegar mais de uma vez)
2. Na barra de seleção, clique em **Desativar** (vermelho) e confirme
3. Só o LADO CLIENTE é desligado: o cadastro continua no sistema (e como fornecedor, quando for o caso), histórico e cobranças em aberto preservados; eles somem das listas de venda, rota e dashboards
4. Para voltar atrás: aba **"Apenas Inativos"** → selecionar → botão **Reativar** (verde)
5. Exige a mesma permissão de edição de cadastro (`clientes.edit`/admin)

---

## Filtros disponíveis

| Filtro | Descrição |
|--------|-----------|
| Busca | Nome fantasia, razão social, CNPJ ou cidade |
| Vendedor | Filtra por vendedor responsável. A lista traz também os **vendedores inativos** (quem saiu da empresa), no fim, marcados com "(inativo)" — assim dá para achar os clientes que ficaram no nome dele. Já a reatribuição em lote ("Novo Vendedor") só oferece vendedor ativo |
| Dia de Entrega | Dia da semana em que o motorista entrega |
| Dia de Venda | Dia da semana em que o vendedor visita |
| Condição Padrão | Condição de pagamento padrão do cliente |
| Condição Permitida | Filtra por condição que o cliente tem autorizado |
| Tempo sem Vendas | Duas opções: **"Sem comprar de… até… (dias)"** — faixa livre (ex.: de 30 até 180 dias sem comprar; quem NUNCA comprou não entra na faixa) — e **"Nunca comprou"** (nenhum pedido válido, opção separada de propósito para não poluir a faixa). Bonificações e pedidos cancelados/excluídos não contam como venda. Com o filtro ativo, cada cliente mostra o chip "Xd sem comprar" |
| Perfil | Todos os cadastros · Só cliente (não é fornecedor) · Também é fornecedor |
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

**Contato / Fiscal**
- E-mail
- Celular (com DDD, só números) — **é o WhatsApp do cliente**: o único número que o sistema usa para mandar confirmação de pedido, boleto/PIX e cobrança. Ao lado dele aparece a situação do número:
  - **Em uso** — já saiu mensagem do sistema para esse número nos últimos 180 dias (é a prova mais forte de que está certo; quer dizer que a mensagem **saiu**, não que o cliente leu)
  - **Com problema** — o WhatsApp recusou o envio por causa do número; confira com o cliente
  - **Verificado** — o WhatsApp confirmou que o número existe (conferido no cadastro)
  - **Dispensado até DD/MM** — cliente sem número, com justificativa registrada (vale 60 dias)

  Na **edição** o campo **nunca** é obrigatório (várias telas alteram um campo só), com a exigência ligada ou desligada. Se o número **for trocado**, o app confere no WhatsApp igual ao cadastro novo — e, como lá, a recusa por "esse número não tem WhatsApp" só acontece com a exigência **ligada**. A cobrança do número dos clientes antigos acontece na tela **Pendências de WhatsApp** e na hora de enviar o pedido
- Inscrição Estadual (em SC: 9 dígitos) + link para consultar Sintegra SC
- Indicador de IE (Contribuinte, Não Contribuinte, Isento)
- Telefone fixo (editável)
- **WhatsApps do cliente** (lista): números de WhatsApp extras vinculados ao cadastro (sócio, comprador, caixa...), além do celular/fixo. Digita-se o número com DDD e clica em "Adicionar"; cada número vira um chip com X para remover. O **atendimento automático da empresa (bot de WhatsApp)** reconhece o cliente por qualquer número desta lista — quando um desses números manda mensagem, o painel de atendimento já mostra a ficha certa do cliente sem ninguém precisar vincular na mão. O mesmo campo existe no cadastro novo (seção Contato)

**Observações Gerais**
- Campo de texto livre com anotações sobre o cliente

**Informações do Cadastro** (editável por quem tem `clientes.edit`/`Pode_Editar_GPS`/admin)
- Razão social, nome fantasia e CNPJ/CPF (editáveis)
- Toggle **"É cliente"**: liga/desliga o lado cliente do cadastro. Desligado, o cadastro some de TODAS as telas de venda (lista de clientes ativos, Rota, Novo Pedido, Catálogo, dashboards, metas do dia) — mas o histórico (pedidos, financeiro, atendimentos) fica preservado na ficha e dá para religar a qualquer momento
- Toggle **"Também é fornecedor"**: liga/desliga o espelho deste cadastro na lista de Fornecedores (Contas a Pagar / Notas de Entrada)
- **Combinações dos dois toggles**: os dois ligados = cadastro completo; só "fornecedor" = vira **SÓ FORNECEDOR** (selo âmbar no topo da ficha — caso do cliente que parou de comprar mas continua nos vendendo); só "cliente" = cliente normal; os dois desligados = cadastro **INATIVO** por completo (o app pede confirmação antes de salvar assim)
- O selo no topo da ficha mostra o estado: **ATIVO** (verde), **SÓ FORNECEDOR** (âmbar) ou **INATIVO** (vermelho)
- Endereço completo editável (logradouro, número, complemento, bairro, cidade, UF, CEP) — obrigatório para emitir NF-e
- Botão **Atualizar pela Receita/SEFAZ** (re-consulta o CNPJ e preenche o formulário; salva só ao clicar em Salvar)
- Tipo de pessoa, código e perfis (somente leitura)
- Financeiro: atrasos de pagamento e recebimento (histórico da época do Conta Azul)
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
| Cadastrar cliente novo | `clientes.edit` ou `admin` |
| Editar cadastro (identificação, contato, fiscal, endereço) | `clientes.edit` ou `Pode_Editar_GPS` ou `admin` |
| Filtrar por vendedor (lote e lista) | `pedidos.clientes = "todos"` ou `admin` |
| Ver e editar todos os clientes | `admin` |

---

## Depende de / Interfere em

- **Rota** — os clientes desta lista aparecem nos cards da Rota com base no vendedor e dias de venda
- **Pedidos** — condição de pagamento padrão pré-preenche o formulário de pedido
- **Emissão de NF-e (Focus NFe)** — a nota usa a Inscrição Estadual e o endereço do cadastro do cliente; IE errada/faltando é a causa da rejeição "IE do destinatário não informada"
- **Config: Categorias de Cliente** — as categorias definem ciclo padrão e regras de flex/desconto
- **Análise IA** — os insights do cliente são recalculados automaticamente e exibidos na sub-aba Admin

> **Conta Azul:** a sincronização de clientes com o CA foi **desativada em 07/2026**. Nada é puxado nem enviado — o app é a fonte única do cadastro de clientes.

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Clientes/ListaClientes.jsx` | Lista principal com filtros e ações em lote |
| `frontend/src/pages/Clientes/DetalheCliente.jsx` | Tela de detalhe com sub-abas Cadastro, Admin, Histórico e Lead |
| `frontend/src/services/clienteService.js` | Chamadas de API para clientes |
| `frontend/src/services/clienteInsightService.js` | Chamadas de API para insights do cliente |
| `backend/src/routes/clientes.js` | Rotas do backend |

## Ponto GPS e Cliente Balcão (novo — 07/2026)

- O ponto GPS do cliente agora é definido **num mapa com alfinete** (botão "Mapa" no card Logística do cadastro, ou "Definir ponto no mapa" no popup da Rota) — arrasta-se o mapa até a porta do cliente e salva. A bolinha azul mostra onde o celular está agora.
- **Validações automáticas ao salvar:** ponto idêntico ao de outro cliente ou dentro da empresa é bloqueado; ponto a menos de 30 m de outro cliente exige autorização por senha de quem tem a permissão "Autorizar Ponto GPS (Logística)"; mover um ponto confirmado (📍✅) para longe vira pendência de aprovação.
- **Selo de confiança** no cadastro: 📍✅ confirmado (entregas reais acontecem ali) ou 📍⚠️ suspeito (entregas acontecem longe — o mapa abre já com a sugestão de correção).
- **Cliente Balcão** (checkbox no cadastro, permissão "Liberar Cliente Balcão"): cliente que compra e retira na empresa — dispensado de ponto GPS. No cadastro novo: ou define o ponto no mapa, ou marca balcão.
- Sem internet, a correção de ponto fica guardada no aparelho e é enviada sozinha quando o sinal volta.
- Visão geral e faxina dos pontos: tela **Saúde dos Pontos GPS** (`/clientes/saude-gps`).

## WhatsApp do cliente obrigatório (novo — 08/2026)

> **Tudo nesta seção só vale depois que a exigência for LIGADA** no interruptor da tela Pendências de WhatsApp. Ele vem **desligado de fábrica**, e enquanto estiver assim nada muda no dia a dia: cadastro e envio de pedido seguem funcionando como sempre.

- **Cadastro novo:** o campo **Celular** virou o "WhatsApp do cliente". Com a exigência **ligada**, não há como cadastrar um cliente sem ele; com ela **desligada**, o cadastro salva sem o número normalmente. Estando ligada, antes de salvar o app **consulta** o WhatsApp da empresa para saber se o número existe — é uma pergunta, **nunca um envio de mensagem para o cliente**. Número que o WhatsApp diz não existir é recusado; WhatsApp da empresa fora do ar **não impede** o cadastro.
- **Edição:** o campo não é obrigatório (para não travar telas que mudam um campo só), mas trocar o número dispara a mesma conferência.
- **Ao ENVIAR pedido:** com o interruptor ligado, cliente sem WhatsApp não envia pedido — o vendedor informa o número na hora ou registra uma justificativa (**Cliente não tem WhatsApp**, **Cliente não quis informar**, **Vou pegar o número depois**), que fica gravada com autor e data e vale **60 dias**. Rascunho (pedido salvo como aberto) nunca é bloqueado.
- **Selo pelo uso real:** uma vez por dia o sistema cruza os envios que já saíram pelo WhatsApp da empresa com o cadastro e marca **Em uso** ou **Com problema**. Falha nossa (internet, teto de envios, WhatsApp fora do ar) nunca marca o cliente como problema, e cliente que optou por não receber aviso de pedido nunca é marcado como "com problema".
- Cobrança e acompanhamento por vendedor: tela **Pendências de WhatsApp** (`/clientes/pendencias-whatsapp`).
