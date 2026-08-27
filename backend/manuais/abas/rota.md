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
- Copiar o endereço do cliente ou abri-lo direto no Google Maps (botões na seção Endereço do popup do cliente)
- Enviar WhatsApp diretamente do card
- Adicionar e prospectar leads (novos pontos de venda)
- Converter lead em cliente
- Ver e finalizar entregas pendentes — sub-abas Entregas e Entregues (visível se o usuário tem `Pode_Executar_Entregas`)
- **Cobrar títulos em aberto na rua** — seção "Cobranças a fazer" dentro da sub-aba Entregas (visível se o usuário tem `Pode_Cobrar_Titulo_Rota`)
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

**Se a expedição mexer na sua carga depois que você organizou a rota** (Mapa das
Entregas → Confirmar), o app marca a rota como desatualizada e pede para tocar em
**Organizar Rota** de novo:

- **Onde o aviso aparece:** logo abaixo do resumo da rota (a tarja azul com
  “N paradas · km · min est.”), na própria sub-aba Entregas, numa faixa amarela:
  *“⚠️ A expedição mudou sua carga — km e tempo acima são da rota anterior.
  Organize a rota de novo para atualizar.”* Os números continuam à vista; o aviso
  só diz que eles envelheceram.
- O **número de paradas atualiza na hora**; a **parada que saiu da sua carga some**
  da lista imediatamente, e a **parada que entrou só aparece** depois que você
  organizar de novo.
- Os números de **km e duração continuam sendo os da rota antiga** — de propósito.
  O sistema **não** recalcula esse total sozinho porque a conta sairia **menor que
  a verdade** (o caminho de volta à empresa não fica guardado em cada parada). Só o
  **Organizar Rota** dá o número certo.
- **Recalcular horários** (roda sozinho toda vez que você abre a sub-aba Entregas)
  mexe **apenas** nos horários previstos de cada parada, recontando a partir de
  agora, tira da lista o que já foi entregue e renumera a sequência. Ele **não**
  altera os totais de **km e duração** e **não** tira o aviso — o aviso sai quando
  você organiza a rota de novo.

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
- **Selo de WhatsApp** ao lado do nome do cliente, quando a chave "Mostrar selo nas listas" estiver ligada (ver seção própria abaixo)

### Atendidos (concluídos hoje)
Lista de clientes e leads que **já receberam pelo menos um atendimento hoje** pelo vendedor. O cliente some da aba Atendimento e aparece aqui logo após o atendimento ser salvo.

- Filtros de dia da semana e forma de atendimento também ficam visíveis aqui
- Os cards continuam com opção de registrar novo atendimento ou pedido
- Útil para consultar o que já foi feito no dia
- **Selo de WhatsApp** ao lado do nome do cliente, quando a chave "Mostrar selo nas listas" estiver ligada (ver seção própria abaixo)

### Cobrança em Rota (dentro da sub-aba Entregas)
Quem tem `Pode_Cobrar_Titulo_Rota` vê, no topo da sub-aba **Entregas**, a seção **"Cobranças a fazer"** — títulos em aberto para cobrar do cliente na mesma visita da entrega.

1. **Cobranças que o escritório mandou** aparecem como cards junto das entregas, com cliente, parcela, vencimento e saldo. Botão **Cobrar**
2. **Cliente quer pagar uma conta na hora?** Clique em **Cobrar um título** / **Buscar título**, digite o nome do cliente e cobre — não precisa estar na carga
3. No modal: **Total** ou **Parcial** (digita quanto recebeu, o resto continua em aberto) + forma (Dinheiro, Pix, Cartão, Outro)
4. **Não consegui cobrar**: marca **escritório** ou **vendedor** responsável. É só registro — **não gera devolução** e o título continua em aberto
5. **Nada é baixado na rua.** A cobrança entra no Caixa Diário do dia como "Aberto" e a baixa oficial da parcela sai lá, no cartão "Cobranças da Rota"
6. **Registradas hoje** lista o que já foi feito; a seta **↺** desfaz um registro errado (só antes de o caixa baixar)
7. Dinheiro cobrado **soma no valor a prestar** do dia; Pix/cartão não passam pela mão do motorista e não somam
8. Quando o escritório está olhando a rota de outro motorista (filtro de vendedor), a seção fica **somente leitura** — quem registra é quem está na rua

### Entregas (pendentes do motorista)
Visível apenas para usuários com `Pode_Executar_Entregas` ou `admin`.

Lista de pedidos faturados em embarques que ainda precisam ser entregues fisicamente. Cada card mostra:

- Nome fantasia do cliente e endereço
- Número do embarque
- Botão de estrela para marcar prioridade (o backend calcula o número sequencial)
- ETA estimado e sequência de entrega (quando a rota está organizada)
- Botão **Maps** — abre Google Maps com a localização do cliente (usa GPS cadastrado ou endereço)
- Botão **Fazer Check-in (Entregar)** — abre o modal de checkout para registrar a baixa
- **Selo GPS × endereço** (aparece depois de organizar a rota) — compara o ponto GPS cadastrado com o endereço escrito e mostra no card: verde "GPS no endereço", âmbar "GPS a ~X do endereço", vermelho "GPS longe do endereço (~X)" (ver seção própria abaixo)
- **Selo de WhatsApp** ao lado do nome do cliente, quando a chave "Mostrar selo nas listas" estiver ligada (ver seção própria abaixo) — vale também para as **amostras de cliente cadastrado** que estão na carga; **amostra de lead não tem selo**

Para organizar a sequência de entrega, há o botão **Organizar Rota** (roteirizador por GPS).

Ao lado dele fica o botão verde **Conferir Folha** (ícone de QR): abre a câmera dentro do app para escanear o QR no cabeçalho do romaneio impresso e conferir se aquela folha ainda é a versão atual da carga — **verde** = folha confere (versão atual); **amarelo** = a carga mudou depois da impressão (a tela mostra o que mudou; reimprimir/pedir a folha nova). O resultado vale para qualquer pessoa que escaneie (motorista, separação ou conferência); se a carga for de outro motorista, aparece um aviso complementar dizendo de quem ela é. Se o motorista tem duas cargas, escaneia uma folha de cada vez.

### Entregues (concluídas pelo motorista)
Visível apenas para usuários com `Pode_Executar_Entregas` ou `admin`.

Lista de pedidos cujo check-in de entrega já foi realizado. Cada card mostra:

- Status físico da entrega: ENTREGUE, PARCIAL ou DEVOLVIDO
- Se houve divergência de pagamento apontada
- Horário e data do check-in
- **Selo de WhatsApp** ao lado do nome do cliente, quando a chave "Mostrar selo nas listas" estiver ligada (ver seção própria abaixo)

---

## Selo de WhatsApp nas listas (novo — 08/2026)

**Para que serve:** quem está em campo saber, **olhando a própria linha da lista**, se aquele cliente **tem número de WhatsApp no cadastro** e se **já saiu mensagem nossa** para esse número — sem precisar abrir a ficha. Aparece nas quatro sub-abas da Rota: **Atendimento**, **Atendidos**, **Entregas** e **Entregues**.

> **O que o selo NÃO é.** O sistema **não confere** se o número é do cliente nem se ele está certo. Tudo o que o selo sabe é: tem número cadastrado? já saiu mensagem nossa para lá? o WhatsApp da empresa recusou o número em alguma tentativa? Verde **não** quer dizer "número conferido", quer dizer "já mandamos mensagem para cá". Na dúvida, **confirme o número com o cliente do mesmo jeito**.

**O que cada cor quer dizer** (é o mesmo selo da tela de Pendências de WhatsApp, não há regra nova):

| Na tela | O que quer dizer | Clicável? |
|---|---|---|
| **Ícone verde** | Já saiu mensagem do sistema para esse número nos últimos 180 dias. Quer dizer que **a mensagem saiu daqui** — não que tenha chegado, não que o cliente leu, não que o número foi conferido. | Não |
| **Ícone cinza** | Tem número no cadastro, mas **ainda não saiu mensagem** para ele — o sistema não tem histórico para dizer nada. **Não é problema**: falha nossa (internet, WhatsApp fora do ar, teto de envios) nunca marca o cliente. | Não |
| **Chip âmbar "Sem WhatsApp"** | O cadastro do cliente está **sem número** nenhum. | **Sim, na Rota** — ver abaixo |
| **Chip vermelho "WhatsApp com problema"** | O número está no cadastro, mas o WhatsApp da empresa tentou mandar e o número foi recusado. Confira o DDD e o dígito 9 com o cliente. | Não — ver abaixo |

São **essas quatro marcas e mais nenhuma**. Em particular, **a lista não tem estado "dispensado"**: cliente com justificativa registrada e sem número mostra o mesmo chip âmbar "Sem WhatsApp" que qualquer outro. É de propósito — a justificativa serve para **destravar o ENVIAR do pedido**, não para tirar o cliente da fila de quem ainda precisa dar o número. Na rua, o recado continua sendo "falta o número, pegue agora". Quem quiser ver quem está dispensado usa a tela **Pendências de WhatsApp**, que separa isso.

### O chip âmbar "Sem WhatsApp" é um botão (aqui na Rota)

Achou um cliente sem número **durante a visita**? Toque no chip âmbar: abre o modal para **cadastrar o número na hora**, sem sair da lista e sem abrir a ficha do cliente. Salvou, o chip some da linha na mesma hora.

- Só é clicável para quem tem **permissão de gravar o cadastro do cliente**. Sem essa permissão o chip aparece do mesmo jeito, mas só como informação.
- Esse modal **não oferece a opção "não consegui agora"** (a justificativa/dispensa). Aqui ninguém está travado — o objetivo é **pegar o número**; se não der, é só fechar e seguir. A dispensa continua existindo onde ela resolve alguma coisa: no bloqueio do ENVIAR do pedido.
- **No Painel de Atendimentos o chip NÃO é clicável** — aquela tela é de consulta, não de cadastro. Para corrigir o número a partir de lá, abra o cadastro do cliente.
- O chip vermelho **"WhatsApp com problema" nunca é clicável**, em tela nenhuma: ali o número existe e foi recusado, então digitar de novo o mesmo número não resolve. É caso para o escritório apurar com o cliente.

### A legenda das cores

Logo abaixo da barra de sub-abas aparece uma **legenda** explicando o que é cada cor, para ninguém precisar decorar. Ela também lembra que a informação é **atualizada de madrugada**.

**Como ligar/desligar:** Clientes → **Pendências de WhatsApp** → chave **"Mostrar selo nas listas"**. Vem **desligada de fábrica**.

> Essa chave é **independente** da chave "Exigir WhatsApp". Ligar os selos **não** liga o bloqueio do ENVIAR do pedido nem torna o WhatsApp obrigatório no cadastro — só mostra o ícone nas listas. Dá para ver a situação da carteira antes de decidir se vai exigir.

O selo é recalculado sozinho **uma vez por dia, às 04:20** — por isso a legenda diz "atualizado de madrugada". Ele **não muda no meio da rota**: cadastrou o número agora, o chip âmbar some na hora, mas o ícone verde de "já saiu mensagem" só aparece depois que sair mensagem e o recálculo rodar.

### Amostra de lead não tem selo (não é bug)

Nas sub-abas **Entregas** e **Entregues** o selo vale para os pedidos e para as amostras **de cliente cadastrado**. **Amostra de lead nunca mostra selo** — o lead ainda não é cliente, não tem cadastro e portanto não tem campo de WhatsApp para o sistema olhar. Linha de amostra de lead sem nenhum ícone é o comportamento esperado.

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
| Cobrar títulos em rota (seção dentro de Entregas) | `Pode_Cobrar_Titulo_Rota` ou `admin` |

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

## Endereço no popup do cliente — copiar e abrir no Google Maps (novo — 07/2026)

No popup de detalhes do cliente (abre ao tocar no nome do cliente no card da rota ou da entrega), a seção **Endereço** tem dois botões logo abaixo do endereço:

- **Copiar** — copia o endereço completo (rua, número, bairro, cidade - estado e CEP) para a área de transferência, pronto para colar em qualquer app.
- **Ver no Google Maps** — abre o Google Maps buscando pelo **endereço escrito** (não pelo ponto GPS). É o caminho quando o cliente **não tem GPS cadastrado ou o GPS está errado**: o motorista consulta o endereço direto no Maps sem precisar copiar e colar à mão.

O botão **Google Maps** que já existia na seção "Localização GPS" continua igual — esse abre pelo ponto GPS cadastrado. São duas coisas diferentes: um vai pelo endereço, o outro pela coordenada.

## Selo GPS × endereço nos cards de entrega (novo — 07/2026)

Ao **organizar a rota** (botão Organizar Rota, ou quando já existe uma rota organizada salva do dia), o sistema compara automaticamente, para cada entrega, o **ponto GPS cadastrado** do cliente com o **endereço escrito** (localizado num serviço de mapas gratuito) e mostra um selo colorido no card, abaixo do endereço:

- 🟢 Verde **"GPS no endereço"** — os dois batem; pode confiar no GPS.
- 🟡 Âmbar **"GPS a ~X do endereço"** — divergência moderada; vale conferir.
- 🔴 Vermelho **"GPS longe do endereço (~X)"** — divergência grande: ou o ponto GPS está errado, ou o endereço escrito está desatualizado. O motorista já sai sabendo que precisa confirmar antes de ir.
- **Sem GPS** continua como já era: o aviso âmbar "N entregas sem GPS no cadastro" e os cards listados ao final.

Detalhes:
- Os selos aparecem **aos poucos** logo após organizar a rota (a localização dos endereços é consultada em lotes). Na primeira vez do dia pode levar alguns segundos; depois fica em cache.
- A distância é **aproximada** — quando o endereço só foi localizado pelo CEP, o selo mostra um `*` e os limites de cor são mais folgados.
- Se o serviço de mapas estiver fora do ar ou o cliente não tiver endereço, o card simplesmente fica sem selo (não é erro).
- O selo **não corrige nada sozinho** — para corrigir o ponto, usar "Ajustar ponto no mapa" no popup do cliente (ou a tela Saúde GPS).
- **Se as entregas já começaram sem organizar a rota** (alguma entrega concluída e nenhuma rota do dia), aparece um aviso azul na aba Entregas pedindo para tocar em **Organizar Rota** — é ele que calcula a sequência e os selos.

## Ponto GPS pelo mapa (novo — 07/2026)

No popup do cliente, o botão de GPS mudou: em vez de gravar "onde estou", abre um **mapa com alfinete** — arrasta-se o mapa até a porta do cliente e salva (dá para marcar o lugar certo mesmo estando longe dele). O botão "Usar minha posição atual" continua existindo dentro do mapa. Valem as travas: ponto repetido/na empresa não salva; perto de outro cliente só com autorização da logística. Para **leads** o fluxo antigo (capturar posição atual) continua — a validação acontece quando o lead vira cliente.

**Endereço do cliente no mapa (novo — 07/2026):** o mapa localiza o **endereço escrito do cadastro** e marca com uma **bolinha laranja** ("Endereço do cadastro (aproximado)"). Quando o cliente **ainda não tem ponto GPS**, o mapa **já abre centrado no endereço** (em vez da posição de quem está mexendo). Se o endereço só foi localizado pelo CEP, aparece um aviso de posição aproximada; se não deu para localizar (ou está sem internet), o botão avisa e o fluxo de arrastar o mapa continua normal.

**Atalhos de navegação no mapa (novo — 07/2026):** três botões acima do "Salvar este ponto" centralizam o mapa em cada referência, para conferir tudo antes de salvar:
- **Endereço** — vai até o endereço escrito do cadastro (bolinha laranja);
- **Ponto salvo** — vai até o ponto GPS cadastrado (bolinha cinza). Se o cliente **não tem ponto**, o botão fica **cinza, desabilitado**, com o texto "Sem ponto";
- **Minha posição** — vai até onde a pessoa está agora (bolinha azul).

Assim dá para comparar endereço × ponto salvo × posição atual sem sair do mapa.

### Últimas alterações do ponto (novo — 07/2026)

Abaixo do botão "Ajustar ponto no mapa", a seção **"Últimas alterações do ponto"** mostra as **5 mudanças mais recentes** do ponto GPS daquele cliente: **quem fez** (nome), **o que fez** (definiu o primeiro ponto, moveu o ponto X metros, removeu o ponto, marcou/tirou de balcão) e **quando** (data e hora). Aparece para todo mundo que abre a ficha (inclusive quem não pode editar o GPS). O histórico completo, com o botão Desfazer, continua na tela **Clientes → Saúde GPS**.

- **Edição manual vale na hora** (decisão de 07/2026): o ponto ajustado por vendedor/motorista é aplicado imediatamente, sem aprovação. Registros antigos que ficaram aguardando aprovação aparecem com o selo âmbar **"AGUARDA APROVAÇÃO"** (a logística ainda pode decidi-los na Saúde GPS); rejeitados e desfeitos também aparecem, com o selo correspondente.
- Cliente com ponto mas **sem nenhum registro**: o ponto foi cadastrado **antes do histórico existir** (o log de auditoria nasceu em 07/2026) — a lista avisa isso. A partir da primeira mudança nova, tudo fica registrado.
- Ponto salvo **sem internet** (fila offline) só entra no histórico quando o aparelho envia a mudança ao voltar o sinal.
- Salvar o alfinete **no mesmo lugar** do ponto já cadastrado (menos de 5 m) **não conta como mudança**: nada é gravado nem entra no histórico, e o app avisa "nada foi alterado". Para registrar uma mudança de verdade, mova o alfinete.
