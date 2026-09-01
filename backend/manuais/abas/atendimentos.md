---
aba: Atendimentos
rota: /atendimentos
permissao: todos (admin vê todos os vendedores; vendedor vê os próprios)
---

# Atendimentos

## O que é

Painel de consulta e auditoria de todos os atendimentos registrados no sistema. Um atendimento é qualquer contato feito com um cliente ou lead: visita, WhatsApp, ligação, pedido, amostra, retorno ou financeiro. A tela permite filtrar por período, tipo, vendedor e outras dimensões, e visualizar os detalhes de cada registro.

**A tela mostra DUAS coisas na mesma linha do tempo:**

1. **Atendimentos registrados à mão** — o que o vendedor lançou no modal de atendimento da Rota (ou no modal de lead).
2. **Os PEDIDOS do período** — toda venda vira uma linha automaticamente, porque ao criar o pedido o
   vendedor já informa o **Tipo de Atendimento** que gerou a venda (Visita Presencial / Ligação /
   WhatsApp / Outros). Antes disso, quem vendia direto pelo app não aparecia no painel e o dia dele
   ficava com "0 com pedido".

A linha de pedido tem fundo verde, o selo **PEDIDO** ao lado do tipo, o número da venda na coluna Ação
(`Pedido #920`, `ZZ#` para especial, `BN#` para bonificação) e o valor na coluna Observação. Ela **não
é um lançamento de atendimento**: não pode ser excluída pelo painel (para tirá-la, é o pedido que
precisa ser cancelado/excluído).

---

## O que dá pra fazer aqui

- Ver todos os atendimentos e todos os pedidos do período, misturados por hora (50 por vez)
- Filtrar por: data (período), tipo de atendimento, vendedor, cidade, ação e filtros especiais
- Filtrar **"Só pedidos"** no menu de tipo (ou clicar no cartão **Pedidos**) para ver apenas as vendas
- Filtrar por canal (ex.: WhatsApp) — traz os atendimentos **e** os pedidos feitos por aquele canal
- Navegar entre períodos com as setas (avança/recua o mesmo número de dias)
- Buscar por nome do cliente ou texto nas observações
- Expandir uma linha para ver todos os detalhes (na linha de pedido: valor, condição de pagamento,
  canal informado na venda, status de envio e GPS de onde o pedido foi feito)
- Abrir o popup do cliente diretamente do atendimento
- **Clicar na pílula verde `Pedido #NNNN` (coluna Ação) e ver o pedido inteiro sem sair do painel**,
  com a linha do tempo de tudo o que aconteceu com ele (seção abaixo)
- Excluir um atendimento (admin) — **não vale para linha de pedido**
- Ver resumo: total, por tipo, por vendedor, pedidos, com/sem pedido, lead
- Exportar CSV (inclui as colunas Pedido e Valor)
- Ver o **selo de WhatsApp** do cliente na própria linha, quando a chave estiver ligada (seção abaixo)

---

## Selo de WhatsApp na linha (novo — 08/2026)

Quando a chave **"Mostrar selo nas listas"** (Clientes → Pendências de WhatsApp) está ligada, cada
linha de cliente mostra, ao lado do nome, se aquele cliente **tem número de WhatsApp no cadastro** e
se **já saiu mensagem nossa** para esse número — sem precisar abrir a ficha.

> **O que o selo NÃO é.** O sistema **não confere** se o número é do cliente nem se ele está certo.
> Verde quer dizer "já mandamos mensagem para esse número", **não** "número conferido". Na dúvida,
> confirme o número com o cliente do mesmo jeito.

| Na tela | O que quer dizer |
|---|---|
| **Ícone verde** | Já saiu mensagem do sistema para esse número nos últimos 180 dias. Quer dizer que **a mensagem saiu daqui** — não que tenha chegado, não que o cliente leu. |
| **Ícone cinza** | Tem número no cadastro, mas ainda não saiu mensagem para ele. **Não é problema** — só falta histórico. |
| **Chip âmbar "Sem WhatsApp"** | O cadastro do cliente está sem número nenhum. |
| **Chip vermelho "WhatsApp com problema"** | O número está no cadastro, mas o WhatsApp da empresa tentou mandar e o número foi recusado. |

Abaixo da barra de abas aparece uma **legenda** explicando as cores e lembrando que a informação é
**atualizada de madrugada** (o recálculo roda às 04:20).

São **essas quatro marcas e mais nenhuma**. Não existe marca de "dispensado": cliente com
justificativa registrada e sem número mostra o mesmo chip âmbar "Sem WhatsApp" que qualquer outro —
a justificativa serve para destravar o ENVIAR do pedido, não para sumir da lista de quem ainda
precisa dar o número. Quem está dispensado aparece separado na tela **Pendências de WhatsApp**.

**Aqui os chips são só leitura.** Diferente da **Rota** — onde o chip âmbar "Sem WhatsApp" é um botão
que abre o cadastro do número na hora —, neste painel **nenhum chip é clicável**: esta é uma tela de
consulta. Para acertar o número de um cliente visto aqui, abra o cadastro dele (ou faça pela Rota, na
próxima visita). O chip vermelho "com problema" não é clicável em tela nenhuma: o número existe e foi
recusado, então redigitar o mesmo número não resolve — é caso para o escritório apurar com o cliente.

Vale igual para as **duas espécies de linha** do painel: o atendimento registrado pelo vendedor e a
linha da venda (pedido). Linha de **lead** não tem selo — lead ainda não é cliente cadastrado.

A chave vem **desligada de fábrica** e é **independente** da chave "Exigir WhatsApp": ligar o selo
**não** trava o envio de pedido nem torna o número obrigatório no cadastro.

---

## Tipos de atendimento

A lista de tipos é **configurável** em Configurações → Gerais, então o menu do filtro mostra a lista
fixa mais os tipos que realmente aparecem nos dados (hoje o cadastro usa PRESENCIAL e TELEFONE).

| Tipo | Cor | Quando usar |
|------|-----|-------------|
| PRESENCIAL / VISITA | Roxo | Visita presencial ao cliente |
| WHATSAPP | Verde | Contato via WhatsApp |
| LIGACAO / TELEFONE | Azul | Ligação telefônica |
| PEDIDO | Azul claro | Venda cujo canal não foi informado; no filtro, "Só pedidos" |
| SITE | Verde-água | Pedido nascido no site (Kit Festa / Congelados) |
| AMOSTRA | Âmbar | Envio de amostra |
| RETORNO | Índigo | Retorno agendado cumprido |
| FINANCEIRO | Cinza | Cobrança ou assunto financeiro (fica escondido por padrão) |

O tipo da linha de pedido vem do canal informado na venda: Visita Presencial → PRESENCIAL,
WhatsApp → WHATSAPP, Ligação → TELEFONE, Kit Festa/site → SITE.

---

## Cartões de resumo

| Cartão | O que conta |
|--------|-------------|
| **Pedidos** | Quantas vendas foram feitas no período (clicar filtra só elas) |
| **Com Pedido** | Linhas ligadas a venda: os próprios pedidos + atendimentos de cliente que comprou no período |
| **Sem Pedido** | Atendimentos de cliente que não comprou no período |
| **Lead** | Atendimentos de lead (ainda não é cliente) |

---

## Como fazer (passo a passo real)

### Consultar atendimentos do dia
1. Abra a aba Atendimentos
2. O filtro padrão já está com a data de hoje
3. A lista mostra todos os atendimentos registrados no dia

### Mudar o período
- Use as setas `<` e `>` ao lado do período para navegar
- Ou altere diretamente os campos de data início e fim

### Filtrar por vendedor (admin)
- Selecione o vendedor no filtro de vendedores
- A lista atualiza para mostrar apenas os atendimentos daquele vendedor

### Ver detalhes de um atendimento
- Clique na linha do atendimento para expandir
- Você vê: hora, observações, ação registrada, data de retorno (se houver) e dados do cliente
- Na linha de **pedido**: número, valor, condição de pagamento, tipo de atendimento informado na
  venda, status de envio ao Conta Azul e GPS de onde a venda foi lançada

### Abrir a ficha do cliente (barra lateral)
- Clique no **nome do cliente** na linha (no celular, botão **Ver detalhes do cliente**)
- Abre a **mesma ficha da Rota**, com o cadastro completo: razão social, nome fantasia, CNPJ/CPF,
  telefone, celular, e-mail, endereço completo (com botões Copiar e Ver no Google Maps), dias de
  venda e de entrega, condição de pagamento, ponto GPS, observações e situação no Serasa
- O ponto GPS só pode ser alterado por quem tem a permissão de GPS (ou de editar clientes); quem
  não tem apenas vê o ponto
- A ficha busca o cadastro completo na hora de abrir. Enquanto isso, mostra marcas de
  **carregando** — ela nunca afirma que um campo está vazio antes de ter carregado o cadastro
- Se a internet falhar, aparece um **aviso amarelo** com o botão **Tentar de novo**, e o botão do
  mapa não é oferecido (sem saber o ponto atual, marcar um ponto novo apagaria o que já existe)
- Linha de **lead** abre a mesma ficha em modo lead. A lista de atendimentos manda só o nome do
  lead, então a ficha **busca o cadastro do lead** ao abrir e só depois mostra os campos:
  responsável, WhatsApp, dias de visita, horário, próxima visita, etapa, observações e ponto GPS.
  Enquanto não carregar (ou se falhar), a seção **Visita** avisa que os dados não vieram, o campo
  de coordenadas não aparece e **não dá para salvar ponto** — no lead o ponto antigo seria
  sobrescrito sem histórico para desfazer
- O rótulo do documento segue o tipo de pessoa do cadastro: pessoa física aparece como
  **Pessoa Física / CPF**, jurídica como **Razão Social / CNPJ**
- Abrindo **outro cliente com a ficha já aberta** (inclusive pelo teclado, com Tab + Enter no nome
  da linha de trás), a ficha **recomeça do zero** no cadastro novo: nada do cliente anterior fica na
  tela — nem o ponto GPS, nem o histórico do ponto, nem os avisos

### Ver os detalhes do pedido sem sair do painel (novo — 08/2026)

Na coluna **Ação**, a pílula verde `Pedido #920` (ou `ZZ#`/`BN#`) agora é **clicável**. No celular,
a mesma pílula aparece no cartão do pedido e, quando o cartão está expandido, também há o botão
**Ver detalhes do pedido**. Linha que não é pedido (ex.: "Sem resposta / Ausente", "Atendido sem
pedido") continua sem clique.

Abre uma popup **só de consulta**: ela **mostra** o pedido, mas **não age** sobre ele. De propósito,
NÃO tem botão de cancelar, aprovar, converter especial, emitir boleto/PIX, mandar WhatsApp nem
imprimir — só leitura e o botão Fechar. Para agir sobre o pedido, continue usando a aba **Pedidos**,
que tem a popup completa com todos esses botões.

**O que a popup mostra:**
- Cabeçalho: número do pedido, cliente, e o selo **Consulta**. O número sai com o mesmo prefixo
  da lista (`#`, `ZZ#` para especial, `BN#` para bonificação); pedido que ainda **não tem número**
  aparece como **"(sem número)"**, exatamente como na pílula do painel
- Situação: status de envio, situação no Conta Azul, e os selos ESPECIAL / BONIFICAÇÃO / CANCELADO
- Faixa vermelha quando o pedido foi cancelado (quem cancelou, quando e o motivo)
- Faixa âmbar quando o pedido nasceu especial e foi convertido em pedido com nota
- Dados do pedido: data de entrega, data de emissão, condição de pagamento, vendedor, quem
  registrou e o tipo de atendimento informado na venda
- Itens (produto, quantidade, preço unitário e total da linha), frete e **Total geral** no rodapé
- Observações do pedido
- **Recebimento**: parcela a parcela — vencimento, situação (Pago / Parcial / Vencido / Em aberto /
  Cancelado), valor, quanto já foi baixado no total, forma e a data da última baixa — e o total
  recebido até agora. Logo abaixo, **"Na entrega, o motorista registrou"** separa em até quatro
  linhas o que foi lançado na entrega, porque essas coisas NÃO são a mesma. São **cinco rótulos
  possíveis**: os quatro primeiros são uma linha cada, e a última linha sai com um de dois rótulos,
  conforme o que veio registrado:
  - **Registrado como pago na hora (dinheiro/PIX/cartão)** — a entrega foi fechada com uma forma
    que traz valor no ato. A popup diz que **foi registrado assim**, e só. Ela **não** diz quem
    ficou com o dinheiro nem o que entra na conferência do Caixa: isso quem decide é a marcação
    **"debita caixa"** da condição de pagamento, que a tela de Caixa tem e esta popup não recebe.
    Para saber o que o motorista tem a prestar, use o **Caixa**;
  - **Pago por PIX Asaas — caiu direto na conta da empresa** — o cliente leu o QR na frente do
    motorista e o banco confirmou a cobrança gerada pelo app. Fica em linha própria porque o
    Caixa também separa esse valor (ele vai para "Outros");
  - **Ficou a cobrar — ninguém pagou** — a entrega foi marcada com um responsável pela cobrança
    (Vendedor / Escritório / Motorista responsável). É o marcador de que **ninguém pagou** e
    alguém ficou de cobrar;
  - **Registrado sem dinheiro na hora** — boleto, prazo, bonificação: forma registrada na entrega
    que **não** traz dinheiro no ato;
  - **Linha sem forma registrada — o app não sabe se houve dinheiro** — é o **5º rótulo**, e ele não
    é uma 5ª linha: **substitui o texto da linha acima** quando **todo** o valor dela veio de
    registro sem forma de pagamento nenhuma (o campo da forma ficou com um texto de responsável,
    sobra do checkout antigo). Sem forma gravada, o app não afirma nem que houve dinheiro no ato nem
    quem ficou de cobrar — ele só diz o que de fato está registrado. Se naquele pedido houver
    também linha com forma de verdade, o rótulo volta a ser "Registrado sem dinheiro na hora" e o
    parêntese lista as formas, inclusive a que veio só como texto.
  O rodapé desse quadro fala só do que existe naquele pedido, e é montado em três partes.
  **Abertura**, em duas versões: quando **alguma** linha traz forma de pagamento de verdade, ele diz
  que estas linhas são o que ficou registrado no fechamento da entrega, **"com a forma que o
  motorista informou"**; quando **nenhuma** linha trouxe forma, ele troca esse final por
  **"Nenhuma delas veio com forma de pagamento."** — antes o rodapé prometia uma forma que não
  existia no registro. **Meio**, só quando há PIX Asaas confirmado: lembra que aquele valor é
  cobrança do app confirmada pelo banco e caiu direto na conta da empresa. **Fecho**, em três
  versões, conforme o título: quando **há** conta a receber, ele lembra que registrar na entrega não
  é dar baixa (por isso "Recebido até agora" pode ser **R$ 0,00** mesmo com valores lançados na
  entrega); quando é **bonificação**, ele diz que não existe título nem para abater nem para cobrar
  depois; e quando a conta a receber ainda não foi criada, ele diz isso — nunca afirma dívida que
  não existe.
- **Nota fiscal**: as NF-e emitidas pelo app (número, série e situação) e, quando existir, a nota
  emitida no Conta Azul com a chave de acesso
- **Entrega**: situação, data/hora, carga e motorista, observação do motorista, motivo da devolução
  e o botão **Ver no mapa onde foi entregue** (quando o GPS foi registrado)
- **Devoluções** do pedido: número, tipo, escopo, valor, itens devolvidos e motivo
- **Atendimentos deste pedido**, quando algum atendimento foi amarrado a ele

**A linha do tempo ("Tudo o que aconteceu com este pedido")** junta, em ordem de data e hora, tudo
o que o sistema registrou com data — quando existe, também mostra quem fez:
criação do pedido (quem registrou, vendedor e canal de origem) · conta a receber criada ·
**aprovação** de pedido especial ou de bonificação · conversão de pedido especial · NF-e enviada
para a SEFAZ e depois "consta como autorizada / recusada / cancelada" · boleto/PIX do Asaas gerado
e pago · baixa de cada parcela ("Parcela N quitada" ou "com baixa parcial") · baixa registrada no
Conta Azul pela conferência do Caixa · o que o motorista registrou na entrega, em cinco rótulos
diferentes (**"Registrado como pago na hora"**, **"PIX Asaas confirmado pelo banco"**,
**"Ficou a cobrar na entrega"**, **"Registrado sem dinheiro na hora"**; e, quando a linha veio sem
forma nenhuma, **"Linha sem forma registrada"** — aí o app não afirma nem que houve dinheiro nem
quem ficou de cobrar) · impressão do pedido · conferência de carga por bipagem (quem bipou e
se foi leitor ou digitado) · saída da carga (número do embarque e motorista) · entrega · devolução
e reversão de devolução · cancelamento do pedido · atendimentos ligados ao pedido.

**Eventos sem hora.** Alguns campos do sistema guardam **só o dia**, não a hora: a saída da carga e a
baixa da parcela. (A **devolução não** é um deles: a data da devolução é gravada com hora de
verdade, no momento em que ela é registrada.) Nesses eventos a linha do tempo escreve só a data, com
a marca **"sem hora registrada"** — antes ela mostrava uma hora que ninguém tinha registrado (12:00,
09:00, ou até o dia anterior às 21:00), o que fazia aparecer sequência impossível como "entregue
11:44" acima de "saiu na carga 12:00". A marca é decidida **campo a campo, pelo valor gravado**:
quando a saída da carga tem hora de verdade, ela aparece com a hora — na seção Entrega e na linha do
tempo, com o mesmo texto nos dois lugares.

Como o evento não tem hora, a linha do tempo o encaixa dentro do **dia em que ele foi gravado** — e
o evento **nunca muda de dia; essa regra vem antes de todas as outras**. Dentro daquele dia, a saída
da carga é colocada **o mais cedo possível**, logo depois do que o app já registrou com hora **no
mesmo dia** (criação do pedido, conta a receber, impressão, conferência da carga na doca), e sem
passar de "Entregue"; a baixa da parcela fica depois de "Pedido criado".

**Quando esses limites se contradizem ou caem em outro dia, são eles que cedem — nunca o dia do
evento** — e aí a ordem na tela sai diferente dessa descrição. São poucos pedidos, sempre por um de
dois motivos: o passo foi registrado em outro dia (pedido #21, impresso em 26/03 com a carga saindo
em 24/03) ou o pedido foi **impresso depois de entregue** no mesmo dia (ZZ#74, entregue 10:58 e
impresso 21:12). É de propósito: nesses casos quem está errada é a **data lançada**, e mexer no
evento esconderia o erro em vez de corrigi-lo. Nada disso inventa hora.

**O que a linha do tempo NÃO mostra (e por quê):**
- **Estorno de baixa** — o extrato completo de pagamentos e estornos de uma parcela fica em
  **Contas a Receber**; a popup só enxerga a última baixa gravada na parcela
- **Detalhe da conversa com a SEFAZ** (mensagem de erro, chave da nota do app) — fica em
  **Notas Fiscais**
- **Data de emissão da NF-e emitida no Conta Azul** — o app guarda a chave e o número dessa nota,
  mas não a data em que ela foi emitida; por isso ela aparece na seção Nota fiscal e não na linha
  do tempo
- **A data em que o pedido virou FATURADO** — o app grava a *situação* (o selo "CA: FATURADO"), mas
  não o momento em que ela mudou. Quando o pedido está faturado sem essa data, a linha do tempo
  avisa isso no rodapé em vez de inventar um evento. Só pedido **especial** e **bonificação** têm
  data própria, que é a da **aprovação dentro do app** (e nem um nem outro vai ao Conta Azul)
- **A hora exata da autorização da NF-e** — o evento usa a data da última mudança daquele registro
  no app; por isso o texto diz "consta como autorizada", e não "foi autorizada às tantas horas"

**Se o pedido não carregar** (internet, pedido excluído ou falta de permissão), a popup mostra um
aviso amarelo explicando o motivo e um botão **Tentar de novo** — nunca uma tela quebrada.

**Para fechar a popup:** o botão **Fechar** do rodapé, o **X** do canto, a tecla **Esc** (no
computador) ou um toque no **fundo escuro** ao redor da janela.

### Ver só as vendas do dia
1. Clique no cartão **Pedidos** (ou escolha "Só pedidos" no menu de tipo)
2. A lista fica só com as vendas do período, na ordem em que foram feitas
3. Clique de novo no cartão para voltar a ver tudo

### Exportar (download)
- O botão de download (ícone) exporta os atendimentos filtrados em CSV, com as colunas Pedido e Valor

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê os próprios atendimentos |
| `admin` | Vê todos os vendedores, pode excluir atendimentos |

---

## Depende de / Interfere em

- **Rota** — os atendimentos registrados à mão são criados pela Rota (modal de atendimento)
- **Pedidos** — toda venda do período vira linha aqui; o canal vem do campo "Tipo de Atendimento"
  preenchido na tela de Novo Pedido (é obrigatório para enviar o pedido). A popup de consulta do
  pedido lê o MESMO detalhe da aba Pedidos (`GET /api/pedidos/:id`), mas sem nenhum botão de ação
- **Leads** — atendimentos de leads também aparecem aqui
- **Configurações → Gerais** — a lista de tipos de atendimento sai de lá
- **Dashboard** — o número de atendimentos do dia é usado em análises de desempenho
- **Análise IA** — cada atendimento pode disparar uma análise da IA

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Atendimentos/PainelAtendimentos.jsx` | Componente principal |
| `frontend/src/pages/Atendimentos/ModalPedidoConsulta.jsx` | Popup SÓ DE CONSULTA do pedido (leitura + linha do tempo). A popup COMPLETA, com as ações, continua embutida em `frontend/src/pages/Pedidos/ListaPedidos.jsx` — são duas telas de detalhe do pedido, decisão do dono em 08/2026 |
| `frontend/src/pages/Atendimentos/linhaDoTempoPedido.js` | Regras da popup de consulta: monta a linha do tempo, classifica o que a entrega registrou (pago na hora / PIX Asaas confirmado / a cobrar / sem dinheiro na hora) e escreve os avisos de rodapé. **É aqui que mora a regra financeira** — as regras são cópia declarada do backend (`routes/caixa.js` e `services/recebimentoEntregaService.js`); mudou lá, muda aqui |
| `frontend/src/services/atendimentoService.js` | Chamadas de API |
| `backend/routes/atendimentoRoutes.js` + `controllers/atendimentoController.js` | Rotas do backend |
| `backend/services/atendimentoService.js` (`listarComFiltros`) | Junta atendimentos + pedidos na mesma lista |
