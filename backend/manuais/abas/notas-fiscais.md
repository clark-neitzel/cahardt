# Notas Fiscais (emissão de NF-e)

**Rota:** `/notas-fiscais` · **Menu:** Financeiro → Notas Fiscais
**Permissões:** `Pode_Acessar_Notas_Fiscais` (ver a tela, incluindo a aba Canhotos) · `Pode_Emitir_NF` (emitir/reemitir) · `Pode_Excluir_Pedido` (botão "Cancelar pedido") · `Pode_Configurar_NF` (existe no cadastro, mas **nenhuma tela usa** esta permissão hoje)

**Abas da tela:** A emitir · Emitidas · **Canhotos** · Todas. As três primeiras tratam de *emitir* a nota; a aba **Canhotos** trata do *papel assinado que volta com o motorista* (seção própria no fim deste manual). As abas A emitir, Emitidas e Canhotos mostram a contagem do período no próprio rótulo.

**Cada aba lembra o próprio período.** As abas de emissão (A emitir · Emitidas · Todas) abrem em **Hoje**, porque emitir nota é tarefa do dia. A aba **Canhotos** abre em **Este mês**, porque o arquivo de canhotos é organizado por mês, igual à pasta física. O seletor de período é um só na tela — ele troca junto com a aba —, e mexer no período de uma aba **não altera** o da outra.

## O que é

Desde 23/07/2026 a NF-e de venda é emitida **pelo próprio app**, via Focus NFe (a emissão pelo Conta Azul foi descontinuada — o CA bloqueou o acesso). A nota continua sendo autorizada pela SEFAZ normalmente, com a mesma numeração de sempre (série 1, continuando da última nota do CA, 84843 → 84844 em diante), os mesmos impostos (Simples Nacional) e a mesma DANFE.

## A tela (fila de emissão)

- **Cartões no topo:** Sem nota · Processando · Autorizadas · Com erro (contagens do período filtrado).
- **Filtro de período** (pílula "Hoje", com presets) e **filtro de status**: "A emitir" (sem nota + com erro + processando), "Emitidas" (autorizadas pelo app + as antigas "Emitida no CA" — o número da aba conta as duas), "Todas". Os filtros ficam salvos por usuário — a tela reabre do jeito que a pessoa deixou. Padrão: Hoje + A emitir.
- A lista mostra **todos os pedidos do período** (um mês inteiro cabe com folga). Só num período gigante (ex.: "Todo o período" com milhares de pedidos) a tela corta nos mais recentes — e nesse caso aparece um **aviso amarelo** pedindo para escolher um período menor.
- **Lista de pedidos** com cliente (badge CPF/CNPJ), valor e status da nota:
  - **Sem nota** (cinza) — ainda não emitida; botão "Emitir NF-e" (e, ao lado, **"Cancelar pedido"** para quem tem permissão de excluir pedido).
  - **⏳ Processando** (azul) — enviada, aguardando a SEFAZ (segundos); a tela atualiza sozinha a cada 10s; botão "Atualizar" força a consulta.
  - **✓ NF 84xxx** (verde) — autorizada; botões **DANFE** (PDF) e **XML**.
  - **✕ Rejeitada** (vermelho) — a SEFAZ recusou; o motivo oficial aparece embaixo, com o link **"O que fazer?"** ao lado (ver seção própria). Corrigiu a causa → clicar "Reemitir NF-e" (não duplica). Se a nota **nunca vai passar** (CNPJ baixado, por exemplo), use **"Cancelar pedido"** para tirar o pedido da fila.
  - **Emitida no CA** (cinza) — nota antiga da era Conta Azul; sem ações aqui (imprime pela tela de Pedidos).

## Como emitir

1. **Uma nota:** botão "Emitir NF-e" na linha do pedido.
2. **Várias:** marcar os **checkboxes** dos pedidos desejados → botão do topo vira "Emitir selecionadas (N)". O checkbox do cabeçalho marca/desmarca todas as elegíveis.
3. **Todas:** sem nada marcado, o botão do topo é "Emitir todas (N)" — emite uma a uma, mostrando o progresso.

Quando a nota é **autorizada**, o pedido correspondente vira **FATURADO** na aba Pedidos automaticamente — e lá o botão DANFE já imprime a nota nova (o mesmo fluxo de impressão de sempre).

## Proteções automáticas (importante)

- **Nunca emite em dobro:** pedido com nota já autorizada (do app ou do CA) é bloqueado. Para pedidos antigos da era CA sem registro local, o app **confere no Conta Azul antes** de emitir.
- **Pedido especial e bonificação não aparecem** na fila (não geram nota).
- **Pedido cancelado não aparece** na fila e a emissão é recusada ("Pedido cancelado — não é possível emitir NF-e"). Vale tanto para o cancelamento feito pelo app quanto para pedidos **cancelados/excluídos na época do Conta Azul** — venda que não aconteceu não gera nota.
- Nota rejeitada pode ser reenviada à vontade — a referência única na Focus impede duplicidade.
- Pedido faturado pelo app fica **imune ao sync do Conta Azul** (o status FATURADO não é revertido).
- **Venda para outro estado (interestadual):** o app ajusta a nota sozinho pela UF do cliente — usa **CFOP 6101/6102** e marca a operação como **interestadual** (dentro de SC continua 5101/5102). Para sair certa, o cliente precisa estar cadastrado com a **UF correta** e, se for contribuinte de ICMS, com a **Inscrição Estadual** preenchida. Os impostos do Simples (CSOSN 101 + crédito) e os demais campos são os mesmos da venda interna.

- **Crédito de ICMS do Simples (`pCredSN`):** o percentual que o cliente CNPJ aproveita de crédito sai da configuração em **Configurações → Emissão de NF-e — Simples Nacional** (padrão 3,82%). Ele muda conforme a faixa do Simples da empresa; quem alterar deve confirmar o valor com a contabilidade. O mesmo lugar define o **NCM padrão** (usado só quando o produto não tem NCM próprio) e os **textos legais** das Informações Complementares. Vale para a próxima nota emitida — notas já autorizadas não mudam.

## Nota rejeitada: o link "O que fazer?"

Toda linha **✕ Rejeitada** mostra a mensagem oficial da SEFAZ e, logo abaixo, o link **"O que fazer?"**. Ao abrir, aparece a orientação prática para aquele motivo específico: se o problema é do cadastro do cliente, do nosso cadastro, dos valores do pedido, ou se é caso de chamar o suporte. Se a SEFAZ mandar um motivo que o app ainda não conhece, aparece a orientação geral — nunca fica sem saída.

Quando o motivo tem a ver com o cadastro do cliente (documento, inscrição estadual, cliente bloqueado), aparece também o botão **"Conferir na Receita/SEFAZ"**: ele consulta na hora a situação real do CNPJ na Receita Federal e da inscrição estadual na SEFAZ, e mostra o resultado ali mesmo — sem precisar sair da tela nem pedir para o suporte.

- **CNPJ "BAIXADA"/inapto ou IE "não habilitado"** → a empresa do cliente foi encerrada ou está bloqueada. **Não adianta reemitir**: é preciso o CNPJ novo do cliente, ou faturar no CPF dele (aí o cadastro passa a ser pessoa física, não contribuinte). Quem decide isso é a direção/contabilidade, não o app. Enquanto isso, o pedido pode ser **cancelado** (botão "Cancelar pedido" na linha) para parar de cobrar faturamento — ele sai da fila, devolve o estoque, cancela a conta a receber e nunca mais tenta emitir nota.
- **Consulta mostra tudo regular** → é bloqueio interno da SEFAZ do estado do cliente; só o contador do cliente resolve.

## Erros comuns e o que fazer

- **"Cliente ... sem CPF/CNPJ"** ou **"cadastro incompleto: falta CEP/rua/número..."** → completar o cadastro do cliente (aba Clientes) e emitir de novo.
- **"IE do destinatário não informada"** → cliente PJ contribuinte sem inscrição estadual no cadastro; preencher a IE do cliente (ou rodar o sync do CA que puxa a IE) e reemitir.
- **"Destinatário bloqueado na UF"** (rejeição 305) → **não é falta de IE nem erro de UF**; o cadastro do cliente está bloqueado na SEFAZ do estado dele. Usar o botão "Conferir na Receita/SEFAZ" (acima) para ver se o CNPJ foi baixado.
- **Nota presa em "Processando"** por mais de alguns minutos → o sistema já consulta sozinho, a cada 5 minutos, toda nota parada nesse status, e destrava assim que a SEFAZ responde (não é preciso ficar clicando). O botão "Atualizar" serve para conferir na hora. Se passar de ~1 hora assim, a nota está travada do lado da SEFAZ/Focus, não do app: avisar o suporte informando o número do pedido.

## XMLs para a contabilidade

Botão **"XMLs (contabilidade)"** na barra de filtros da fila: baixa um **ZIP com todos os XMLs do período** filtrado (notas de venda e devolução emitidas pelo app + notas antigas do CA disponíveis), com nomes amigáveis (`nfe-84844-venda-pedido-2269.xml`). Requer período com início e fim (ex.: "Este mês"). Se algum XML não puder ser incluído, vai um `_avisos.txt` dentro do ZIP explicando.

**O botão não aparece na aba Canhotos** — e é de propósito. Ele exporta o período das abas de emissão (que abrem em "Hoje"), enquanto na aba Canhotos o período visível na tela é o dela (que abre no mês). Se o botão ficasse ali, você veria "Este mês" na tela e receberia o ZIP de **um dia só**, mandando um mês incompleto para a contabilidade sem nada denunciar. Para exportar os XMLs, mude para **A emitir**, **Emitidas** ou **Todas**, confira o período e baixe por lá.

## Notas antigas (era Conta Azul)

Continuam disponíveis: a DANFE sai pela aba Pedidos (botão DANFE) como sempre. Os XMLs estão sendo copiados para dentro do app em segundo plano — impressão não depende mais do CA depois disso.

## NF-e de DEVOLUÇÃO de venda

Na aba **Pedidos → Devoluções**, ao expandir uma devolução de pedido **com nota** (tipo Conta Azul/normal), aparece o bloco verde da NF de devolução:
- Botão **"Emitir NF de devolução"** (permissão `Pode_Emitir_NF`) — o app monta tudo sozinho: itens e valores da devolução registrada, cliente, e a **referência à NF-e original da venda** (exigência da SEFAZ). CFOP 1201 (produção própria) / 1202 (revenda) dentro de SC — ou **2201/2202** quando a devolução é de cliente de outro estado (ajuste automático pela UF), sem pagamento.
- Status igual ao da venda: Processando → ✓ Autorizada (com botão **DANFE**) ou ✕ Rejeitada (motivo + "Emitir novamente").
- **Devolução de pedido ESPECIAL não gera nota** (pedido sem nota) — o botão nem aparece; o fluxo especial segue como sempre.
- Devolução que já teve nota emitida pelo CA (campo "Nota Devolução" preenchido) também não emite de novo.

---

# Aba CANHOTOS — o arquivo do mês

**Onde fica:** Notas Fiscais → aba **Canhotos** (mesma rota `/notas-fiscais`, mesma permissão `Pode_Acessar_Notas_Fiscais`).

## Para que serve

O canhoto é o pedaço da nota que o cliente assina na entrega. **É a prova de que a mercadoria chegou** — sem ele não dá para protestar um título nem para se defender numa discussão com o cliente.

Antes, ninguém sabia quais canhotos tinham voltado: a conferência era no olho, folha por folha, e a falta só aparecia semanas depois, quando o financeiro ia procurar o comprovante. Nesta aba você **bipa o código de barras da DANFE** e o sistema mostra, na hora, quais notas assinadas já estão no arquivo e quais faltam.

> **Esta aba não trava nada.** Ela serve para enxergar e organizar: nenhum caixa deixa de fechar, nenhum pedido deixa de andar por causa de canhoto. Não existe trava de fechamento por canhoto conferido — e ela **não está planejada**.

## O mutirão — como colocar um mês em dia

É assim que se resolve o passado. Leva uma sessão e o mês inteiro fica em ordem:

1. **Confira o mês** no filtro de período no topo. A aba já abre no **mês corrente**, que é o caso normal — se você quer arrumar um mês passado, troque ali. Nesta aba o preset **"Todo o período" não aparece** de propósito: o arquivo é organizado por mês, igual à pasta física, e sem mês definido não há maço para bipar.
2. Clique em **"Colocar o mês em dia"**. Isso traz para o controle todas as notas já emitidas naquele mês. Elas entram como **"? Estado desconhecido"** — o sistema ainda não sabe onde o papel está.
3. **Pegue a pasta física** daquele mês (ex.: *Notas Emitidas Agosto 2026*) e vá **bipando o maço inteiro**, folha por folha.
4. **O que não riscar é o que falta.** Cada folha bipada risca a linha e vira "Arquivado". No fim, o que continuar sem riscar são exatamente as notas cujo papel não está na pasta.

A barra de progresso no topo (*"X de Y no arquivo"*) mostra o quanto já foi. Os chips coloridos abaixo do campo de bipe são também **filtros**: clique em "⏳ Na rua" para ver só as que faltam.

> **"Colocar o mês em dia" pode ser clicado quantas vezes quiser** — não duplica nada. Se o mês já estiver em dia, aparece *"O mês já estava em dia — nenhuma nota nova para trazer."*

## Bipar a mesma folha de novo não faz mal nenhum

**Esta é a dúvida nº 1 de quem usa.** Pode bipar a mesma nota dez vezes: não duplica, não estraga, não dá erro vermelho. O sistema só responde **"já estava"** em azul, com o aviso *"Esta já constava no arquivo. Pode seguir para a próxima folha."*

Isso é proposital: num maço de 30 folhas é normal repetir alguma. Se repetir desse erro, ninguém confiaria no mutirão.

O sistema também **ignora sozinho** a leitura repetida do leitor a laser quando o gatilho fica preso e ele dispara duas ou três vezes seguidas.

## As duas formas de bipar (e a terceira, digitando)

- **Leitor de mesa USB** (no computador) — é o jeito rápido, o que rende num maço grande. O leitor funciona como teclado: você aponta, ele "digita" o código no campo e já marca sozinho. Não precisa instalar nada. O campo **se re-foca sozinho** depois de cada leitura, então a mão não sai do maço.
- **Câmera do celular** — botão **"Ler pelo celular"**. Abre a câmera dentro do próprio app, sem instalar nada. Serve bem para uma nota avulsa ou para conferir no galpão. Para um maço de 30, o leitor de mesa ganha fácil (o código da DANFE é comprido e fininho, exige luz boa e mão parada).
- **Digitar o número da nota** — se o código de barras estiver **rasgado, sujo ou apagado**, é só digitar o número da nota (ex.: `85142`) no mesmo campo e apertar Enter.

Cada leitura dá um **som e uma vibração** diferentes para acerto, repetição e erro — dá para ir bipando sem olhar a tela. As últimas leituras ficam listadas abaixo do campo para conferir depois.

## Os estados de uma nota

| Estado | O que significa na prática |
|---|---|
| **⏳ Na rua** | A nota de venda foi emitida e o canhoto assinado ainda não voltou para o escritório. Quando o pedido já tinha embarque, a linha mostra também **com qual motorista** ela saiu; quando não tinha, a nota continua pendente do mesmo jeito, só sem o nome. É o que você quer ver diminuir. |
| **✓ Recebido** | Estado intermediário: o canhoto chegou ao escritório, mas ainda não foi para a pasta. Tem o botão **Arquivar**. O bipe da aba **não cria** este estado — ele arquiva direto. |
| **🗄 Arquivado** | Guardado na pasta do mês. **É o estado final** — a linha aparece riscada. |
| **✎ Sem assinatura** | O papel está no arquivo, mas o canhoto veio **em branco**. Ver a seção abaixo. |
| **✕ Sem canhoto** | A nota foi liberada com justificativa: o papel não vai voltar. *(O sistema entende este estado, mas **nenhuma tela o cria** — na prática você não vai vê-lo.)* |
| **? Estado desconhecido** | O sistema não sabe onde o papel está. É como nasce tudo que já tinha sido emitido antes do controle existir — e também como nasce toda **nota de devolução**, que não sai com motorista. Some conforme você bipa o maço. |

**Quem bipa na aba vai direto para "Arquivado"** (o papel está na pasta, na sua mão) — é o único caminho de bipe que existe. Os estados "✓ Recebido" e "✕ Sem canhoto" fazem parte do sistema, mas nenhuma tela os cria hoje.

## "Veio sem assinatura"

Botão em cada linha. Use quando **o papel voltou, mas o cliente não assinou** — canhoto em branco.

A nota conta como arquivada (o documento está aqui, você não precisa mais procurar por ele), **mas não serve de prova de entrega**. Ela passa a mostrar o selo **"✎ Sem assinatura"** e entra no chip de mesmo nome — clicando nele você vê, de uma vez, todas as notas do mês que estão nessa situação.

**Quem age com essa lista é o escritório.** O vendedor não enxerga esta tela (ela exige a permissão de Notas Fiscais), então não adianta mandá-lo consultar aqui: abra o chip "Sem assinatura" e avise o vendedor quais clientes têm canhoto em branco, para ele recolher a assinatura na próxima visita.

## Errou? O "Desfazer" volta um passo

Bipou a folha errada, bipou uma cujo canhoto estava em branco, ou clicou em **"Veio sem assinatura"** na linha de baixo? O **Desfazer** conserta na hora, sem precisar chamar ninguém: devolve a nota ao **estado em que ela estava imediatamente antes** daquele clique.

**Onde está o botão.** Em dois lugares, para os dois momentos em que o erro é percebido:

- **Logo depois de bipar**, em "Últimas leituras" (abaixo do campo de bipe): cada leitura que mudou alguma coisa ganha um **Desfazer** ao lado. É o caminho do "bipei a folha errada agora" — não precisa procurar a nota na lista, e o cursor volta sozinho para o campo, então o maço continua no ritmo.
- **Na linha da nota**, na lista do período (e no card, no celular): botão discreto, escrito em cinza, **só nas notas que têm o que desfazer** — nas demais ele nem aparece. O rótulo diz o destino ("Desfazer · volta para Arquivado"), então você sabe o que vai acontecer antes de clicar.

**Ele não pergunta "tem certeza?".** Diferente do "Veio sem assinatura" (que cria um fato e por isso pergunta), o Desfazer só desmancha um passo de quem já percebeu o próprio erro — uma pergunta ali só atrapalharia. É por isso que ele é discreto, sem cor de botão: para não ser clicado sem querer no meio do maço. Desfez sem querer? Dê o passo de novo: se você desfez um **bipe**, bipe a folha outra vez; se desfez um **"Veio sem assinatura"**, clique nele outra vez. Bipar não serve para tudo — veja a exceção no fim desta seção.

- Desfazendo um **bipe do mutirão**: a nota sai de "🗄 Arquivado" e volta para onde estava (em geral "? Estado desconhecido" ou "⏳ Na rua"), e o registro de **quem recebeu e quando some junto** — a linha não fica dizendo que foi recebida por alguém e, ao mesmo tempo, que não foi bipada.
- Desfazendo o **"Veio sem assinatura"**: **não existe destino fixo** — a nota volta para onde ela estava antes daquele clique. Se ela **já estava arquivada**, volta para "🗄 Arquivado": continua conferida, só perde o selo de canhoto em branco. Se ela **ainda não tinha sido bipada** (o caso do "cliquei na linha errada", que é o mais comum), volta a ficar pendente — "? Estado desconhecido" ou "⏳ Na rua". Os dois acontecem no dia a dia, porque o botão "Veio sem assinatura" aparece em **qualquer** linha que ainda não tenha esse selo. O rótulo do botão Desfazer diz o destino daquela nota.
- Desfazendo um **Arquivar**: volta para "✓ Recebido", mantendo o registro do bipe.

**Ele volta um passo só, e sempre o último.** Não é um histórico: depois de desfazer, clicar em Desfazer de novo **não** faz a nota andar mais uma casa para trás — o sistema responde *"Não há o que desfazer nesta nota"*. Na maioria das vezes, para corrigir outra vez basta **bipar a folha de novo**: isso conta como passo novo e o Desfazer fica disponível de novo.

> **Uma exceção que vale conhecer:** se você desfez o *"Veio sem assinatura"* de uma nota que **já estava arquivada**, ela voltou para "🗄 Arquivado" e o Desfazer dela **já foi gasto**. Dali em diante, bipar de novo **não muda nada** — bipar o que já está no arquivo nunca altera nada, e é justamente isso que deixa o mutirão seguro. Ou seja: **não dá para tirar essa nota do arquivo pela tela**. Se você bipar a folha outra vez para tentar, **o app avisa isso na hora** — em vez do "pode seguir para a próxima folha" de sempre, que ali seria o oposto do que você quer. **Não existe nenhuma forma de tirar uma nota do arquivo pela tela**, e isso **não está planejado**: o Desfazer foi feito para o erro percebido na hora, que é o caso do dia a dia.

**Quem pode:** as mesmas pessoas que já bipam e arquivam — quem entra no Caixa ou nas Notas Fiscais. Não há permissão nova. Quem desfez e quando fica **registrado** na própria nota e no histórico de auditoria do sistema.

**Notas bipadas antes de este botão existir** (o mutirão de agosto/2026) não têm o passo anterior guardado. Nelas o Desfazer devolve a nota ao **estado de origem**: nota de venda do mês corrente que saiu com o motorista volta para "⏳ Na rua"; o resto — mês passado, nota antiga do Conta Azul e **toda devolução** — volta para "? Estado desconhecido", que é a verdade (ninguém sabe onde o papel está). Nesses casos o aviso na tela explica isso com todas as letras.

> O Desfazer também **não** mexe no estado "✕ Sem canhoto" (nota liberada com justificativa). Como nenhuma tela cria esse estado, na prática isso não aparece no seu dia a dia.

## A pasta física sai sozinha

Você **nunca digita** o nome da pasta. O sistema o monta a partir do **mês em que a nota foi emitida**, no formato **"Notas Emitidas Agosto 2026"**, e mostra na linha de cada nota.

O mês vem de dentro do próprio código de barras da nota, que é a informação mais confiável que existe. Por isso ele acerta em dois casos que enganariam qualquer outro critério:

- nota **emitida em 31/07** para **entregar em 01/08** → vai para a pasta de **Julho** (o papel foi impresso e guardado em julho);
- nota **recusada em 31/07 e reemitida em 01/08** → vai para a pasta do mês em que a nota que vale foi realmente emitida.

Se o período escolhido no filtro **cruzar mais de um mês**, o topo avisa que são várias pastas e não inventa um nome só — cada linha continua mostrando a pasta correta dela.

## Alerta de nota parada na rua

Uma tarja vermelha lista as notas de venda que estão **"Na rua" há mais de 3 dias** (o prazo é configurável), com número, cliente e quantos dias. Quando o pedido tinha embarque, aparece também **com qual motorista** a nota saiu — se não tinha, a nota entra na lista do mesmo jeito, só sem esse dado. São as que precisam ser cobradas antes que o papel se perca.

**Nota de devolução nunca entra nesta tarja.** Ela não pede assinatura de ninguém (a DANFE é impressa no escritório), então cobrar "não voltou há 3 dias" não faria sentido. A pendência dela é outra e tem lugar próprio: o chip **"🖨 Devolução a reimprimir"**.

O **chip vermelho com os dias** ao lado da situação aparece **só nas notas "Na rua"**. Nas de "Estado desconhecido" ele não aparece — como o mutirão nasce com o mês inteiro nesse estado, todas ficariam vermelhas sem nada de errado, e vermelho em tudo faz a equipe parar de enxergar o vermelho que importa.

## Notas de DEVOLUÇÃO — botão "Reimprimir DANFE"

A NF-e de devolução **não precisa de assinatura de ninguém**, mas o papel dela também tem que estar na pasta do mês. Elas aparecem na lista com a pílula roxa **"devolução"** e entram no chip **"🖨 Devolução a reimprimir"**.

Se a DANFE da devolução não estiver no arquivo, use o botão **"Reimprimir DANFE"** na linha: ele gera o PDF na hora, você imprime e guarda junto.

**Por que o botão não aparece em algumas notas:** ele só existe nas notas emitidas **pelo próprio app**. Nas notas antigas da era **Conta Azul**, o app não gera a DANFE — nesses casos, baixe pela aba **Emitidas**. O rodapé da tela avisa isso quando há devoluções pendentes.

## As mensagens que você pode ver

| Mensagem | O que fazer |
|---|---|
| **"NF 85.142 · Cliente — já estava"** (azul) | Nada. Essa folha já constava no arquivo. Siga para a próxima. |
| **"Arquivada em Notas Emitidas Agosto 2026"** (verde) | Nada — deu certo. |
| **"Código inválido — o dígito verificador não confere"** | A leitura saiu torta. **Passe o leitor de novo, mais devagar.** Não é defeito do sistema nem nota errada. |
| **"Não reconheci esse código"** | O que entrou no campo não é um código de nota. Bipe o código de barras da DANFE ou digite só o número da nota. |
| **"Essa nota é de outro mês"** (amarelo) — *"A nota 85142 é de maio/2026. Troque o período para bipá-la."* | Não é erro seu: a nota **existe** e está tudo certo com ela, só não é do mês aberto. Troque o mês no filtro do topo e bipe de novo. *(Bipando pelo código de barras ela é aceita de qualquer mês; só a busca pelo número olha o mês escolhido.)* |
| **"Não encontrei essa nota"** (vermelho) — *"Nota X não encontrada no sistema"* | Aí a nota realmente não existe no controle. Confira o número. Se for nota de pedido especial ou bonificação, ela **não entra** aqui mesmo (veja abaixo). |
| **"Número X está repetido"** | Há mais de uma nota com esse número em períodos diferentes. **Bipe o código de barras** para não errar, ou escolha na lista que aparece. |
| **"Falha de conexão"** | Problema de internet/servidor. Confira a conexão e bipe de novo — nada foi perdido. |

## O que NÃO entra nesta aba

- **Pedido especial** — não gera nota fiscal, então não tem canhoto.
- **Pedido bonificação** — idem.
- **Pedido cancelado** (no app ou na era do Conta Azul) — venda que não aconteceu.
- Notas de **teste/homologação** — só notas de produção entram.

Se você bipar uma nota desse tipo, a resposta é *"não encontrada no sistema"* — está correto, ela não deveria estar aqui. **Guarde o papel na pasta do mesmo jeito**: ele só não é cobrado por esta lista.

## Notas que aparecem sozinhas

Não é preciso ficar clicando em "Colocar o mês em dia" toda hora: **toda NF-e autorizada entra no controle automaticamente** assim que é emitida — a de **venda** como "Na rua" (o canhoto ainda tem que voltar) e a de **devolução** como "Estado desconhecido" (ninguém sabe se a DANFE já foi para a pasta). O botão do mutirão serve para o **passado** — o que foi emitido antes de o controle existir — e como rede de segurança caso alguma nota escape.
