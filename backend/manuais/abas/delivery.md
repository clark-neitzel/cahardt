---
aba: Delivery
rota: /delivery
permissao: delivery (view + etapas por permissão)
---

# Delivery

## O que é

Kanban de acompanhamento de pedidos de entrega (Kit Festa). Os pedidos faturados são organizados em colunas (etapas) e avançados manualmente conforme o fluxo de produção e entrega. O sistema também envia mensagens automáticas via WhatsApp ao cliente quando o pedido avança de etapa.

> **Atenção:** apenas pedidos já **FATURADOS** aparecem no Kanban e podem ser movidos entre etapas. Pedido **cancelado**, **excluído** ou com **devolução finalizada** nunca aparece aqui, mesmo que já tenha entrado no fluxo antes — some assim que qualquer uma dessas situações acontece (regra reforçada em 17/09/2026).

---

## O que dá pra fazer aqui

- Ver os pedidos de entrega organizados em 4 etapas: Pedido, Produção, Saindo e Entregue. No **celular** (e no iPad em pé) ficam **4 botões no topo** (Pedido · Produção · Saindo · Entregue), cada um com a **contagem** de pedidos (zero fica apagado) — toque num botão e aparece só a lista daquela etapa, sem rolar a tela. No computador (tela larga) as 4 colunas ficam lado a lado e a página inteira rola (a coluna não tem rolagem própria)
- Ver **onde entregar** em cada card: bloco **"Entregar em"** logo abaixo do cliente (veja a seção abaixo)
- Mover um pedido de uma etapa para outra pela **janela "Mover pedido"** (avançar, pular ou voltar), escolhendo na hora se avisa o cliente no WhatsApp
- Buscar pedido por cliente ou número
- Filtrar pelo **período da entrega** (seletor de período, que olha para a frente — veja a seção abaixo)
- Reenviar mensagem de WhatsApp manualmente para o cliente
- Silenciar o WhatsApp de um pedido específico (não envia mais notificações automáticas)
- Definir/ajustar o **horário de entrega** do pedido pelo **ícone de relógio** no cartão (sem abrir o pedido; vazio = sem horário). Quem pode ver o quadro pode ajustar
- Dentro do mesmo dia, os cartões ficam **ordenados pelo horário de entrega** (mais cedo primeiro); sem horário vão para o fim do dia
- Ver o detalhe do pedido clicando no card
- Atualização automática a cada 30 segundos

---

## Etapas do Kanban

| Etapa | Cor | Significado |
|-------|-----|-------------|
| PEDIDO | Azul | Pedido faturado, aguardando produção |
| PRODUCAO | Âmbar | Em produção / preparação |
| SAINDO | Roxo | Saiu para entrega |
| ENTREGUE | Verde | Entregue ao cliente |

---

## Como fazer (passo a passo real)

### Mover um pedido de etapa
1. Localize o card (no celular, toque primeiro no botão da etapa no topo)
2. Toque no **botão verde grande** do card, que traz o **próximo passo escrito** ("▶ Iniciar produção", "🚚 Saiu para entrega" ou "✔ Marcar entregue"), ou no botão **"…"** (voltar ou pular uma etapa). Também dá para abrir o card (detalhe) e usar o botão do rodapé fixo. Card já Entregue mantém só o "…" (para poder voltar)
3. Abre a janela **"Mover pedido"** por cima de tudo (no celular sobe de baixo; no computador fica no centro). Ela lista as **outras 3 etapas** com o subtítulo "próximo passo", "pular etapa" ou "voltar". **A próxima etapa já vem marcada** (se você tiver permissão). Etapa sem permissão aparece apagada e não dá para escolher
4. A janela **sempre pergunta se avisa o cliente**, com dois botões do mesmo tamanho e peso: **"Mover e avisar o cliente"** (verde) ou **"Mover sem avisar"** (cinza-escuro), sob o quadro laranja "Avisar o cliente no WhatsApp?" (não existe padrão escondido). Se o pedido está com o **WhatsApp silenciado**, a janela mostra "WhatsApp silenciado neste pedido" e destaca o "Mover sem avisar"; escolher "Mover e avisar" manda o aviso mesmo com o WhatsApp silenciado (a escolha na hora vale mais que o ícone de balão de mensagem). Ao mover **para a etapa Pedido** o sistema não manda mensagem ao cliente: nesse caso o quadro laranja "Avisar o cliente no WhatsApp?" **não aparece** (só o quadro azul avisando que nessa etapa não há mensagem ao cliente) e os dois botões continuam disponíveis. A **equipe interna continua sendo avisada** nos dois casos
5. O sistema verifica se o pedido está faturado — se **não** estiver, só aparece o aviso de bloqueio e a janela nem abre
6. Se der erro (rede, etapa inválida), a janela **fica aberta**, mostra o motivo e libera os botões para tentar de novo; o card só muda de coluna **depois** de dar certo. Os botões ficam travados durante o envio (um duplo clique não move duas vezes)
7. O aviso na tela diz "→ Etapa · aviso ao cliente solicitado" ou "→ Etapa · sem aviso ao cliente" (ao mover para Pedido: "nesta etapa não há mensagem ao cliente") — o WhatsApp sai em segundo plano e pode ser pulado (cliente sem WhatsApp, optou por não receber), então a tela não afirma que o cliente "foi avisado". Se o pedido já estava na etapa escolhida (alguém moveu antes), o aviso é "Pedido já estava nesta etapa" e nada é enviado
8. A atualização automática (30 s) não atrapalha: a janela sempre mostra o estado atual do pedido; se o pedido sair da lista enquanto ela está aberta, ela fecha com um aviso

### Entregar em (onde entregar o pedido)
Cada card e o detalhe do pedido têm o bloco **"Entregar em"**:
- **Verde, com a etiqueta "Endereço do pedido":** pedido que veio do **Kit Festa** com **entrega** — mostra o endereço que o cliente digitou no pedido (pode ser diferente do cadastro: empresa num dia, casa no outro)
- **Aviso amarelo "Diferente do cadastro: …":** aparece **só** quando o endereço do pedido é diferente do endereço do cadastro do cliente (quando é igual, não aparece)
- **Cinza "Retirada na loja":** Kit Festa de retirada (não há entrega)
- **Etiqueta "Endereço do cadastro":** pedido comum (que não veio do Kit Festa) ou Kit Festa sem endereço próprio — usa o endereço cadastrado do cliente, sem aviso
- **Sem endereço nenhum:** mostra "Endereço não informado"
- **Abrir no mapa:** botão que abre o Google Maps (fora do app) já nesse endereço
No **detalhe do pedido** (toque no card) o "Entregar em" é o **primeiro bloco** e o botão de avançar fica num **rodapé fixo** (o corpo rola, o botão fica à vista).

### Silenciar WhatsApp de um pedido
- Clique no ícone de balão de mensagem no card do pedido
- O ícone muda para "silenciado" — nenhuma mensagem será mais enviada para esse pedido
- Clique novamente para reativar

### Reenviar mensagem manualmente
- Clique no ícone de mensagem no card
- **Antes de mandar, o sistema mostra uma prévia** com exatamente o texto que vai sair, o nome e o telefone do cliente (indicando se é o celular ou o telefone fixo cadastrado) — dá pra conferir antes de confirmar o envio
  - Etapa **Pedido Criado**: a prévia mostra a mensagem "Recebemos seu pedido ✅" com o resumo do pedido — diferente das demais etapas, aqui dá pra mandar manualmente mesmo sem ter saído nada automático (a confirmação automática de pedido continua sendo a de sempre, fora do Delivery)
  - Se a prévia indicar que não é possível enviar (ver motivos abaixo), o botão de confirmar fica bloqueado e mostra o motivo
- Cada clique de confirmação gera uma mensagem NOVA (referência própria) — não é bloqueado como duplicata do envio automático nem de um reenvio anterior
- Se o cliente não tem celular cadastrado, o sistema tenta o telefone fixo antes de desistir
- O sistema avisa exatamente o que aconteceu, sem dar "reenviada" quando nada saiu de fato:
  - **"Mensagem reenviada"** — o WhatsApp saiu
  - **"Entrou na fila — será enviada em breve"** — o bot está temporariamente indisponível (limite de envios, instabilidade); a mensagem sai sozinha em minutos/horas
  - **"Cliente sem WhatsApp cadastrado (nem celular nem telefone)"** — não há para onde mandar
  - **"Cliente optou por não receber avisos"** — o cadastro do cliente está marcado para não receber
  - **"Card com WhatsApp silenciado"** — o ícone de balão de mensagem desse pedido está desligado (silenciado)
  - Qualquer outro erro do bot aparece com o motivo relatado por ele
- **Importante:** a mensagem automática (disparada sozinha ao mover o card) continua sem enviar nada ao cliente na etapa "Pedido Criado" — a confirmação do pedido já saiu na criação. Isso só muda quando alguém aperta reenviar manualmente nessa etapa.
- O texto de "Taxa de entrega" (quando o pedido tem frete) aparece só nas mensagens de Delivery para o cliente — não é a mesma coisa que o "Frete" mostrado em outras telas do sistema.

### Imprimir etiquetas das caixas (Kit Festa)
Cada card tem um **ícone de impressora** (primeiro ícone da linha, antes do de silenciar WhatsApp). Clicar abre o **mesmo painel de opções da aba Kit Festa** (frase nas caixas, a cada quantas caixas, tirar o sufixo do nome, rolo de 2 colunas) e o botão **Imprimir etiquetas** imprime, na impressora de etiquetas **Zebra TLP 2844** (rolo de 40 × 25 mm, 2 colunas), **1 etiqueta por caixa** (estilo "Caseira") com o nome do sabor em uma linha, o QR code da página do Kit Festa, **Pedido #número**, as unidades e uma **frase de agradecimento diferente em cada caixa**; e **a cada 4 caixas, 1 etiqueta do pedido** (estilo "Clássica", sem borda) com "Feito com carinho para", cliente, entrega/retirada com data e horário e "Pedido #N · caixas X–Y de Z". As opções (a cada quantas caixas, tirar o "C/25-HF", rolo de 2 colunas) são as mesmas salvas na aba **Kit Festa** do Pedidos Online. Pedido que nasceu no site do Kit Festa sai com o horário e as unidades por caixa do site; pedido que não nasceu no site sai com a data de entrega, sem horário, e com a quantidade de cada item como número de caixas. Na janela de impressão: escolher a TLP 2844, margem 0, escala 100% (tamanho de papel do driver: 84 × 25 mm). **(10/2026)** O painel tem também o botão verde **Imprimir na Zebra**: envia pela fila direto para a Zebra pequena da cozinha, sem janela de impressão (o **Imprimir pelo navegador** é o caminho de antes). Mostra o estado da impressora (online / instável / PC desligado — a etiqueta espera 15 minutos na fila) e os passos Preparando → Na fila → Imprimindo → Saiu; com erro, **Tentar de novo** ou **Cancelar e imprimir pelo navegador**. Quem tem acesso à tela Delivery pode imprimir pela Zebra por aqui, mesmo sem a permissão do Kit Festa.

### Buscar / filtrar
- Use a caixa de busca para encontrar por nome do cliente ou número do pedido (a busca vale por cima do período)
- Use o **seletor de período da entrega** (estilo Conta Azul, com setas para pular o período): **Hoje · Amanhã · Próximos 7 dias · Próximos 30 dias · Este mês · Todo o período · Período personalizado** (De/Até). Vale para as 4 etapas, inclusive Entregue. O sistema **abre em "Hoje"** e **lembra a última escolha** de cada usuário; se a tela ficar aberta de um dia para o outro, o "Hoje" acompanha a virada do dia
- **Pedido atrasado nunca some:** se a data de entrega já passou e o pedido ainda não foi entregue, ele aparece sempre (em vermelho), mesmo fora do período. Aparece também o selo **"⚠ N atrasados"**
- A linha **"+N em outras datas · ver"** avisa quantos pedidos (que passam na busca) estão fora do período; tocar nela mostra **todas as datas só nesta visita** (nada é gravado como preferência) e aparece o botão **"Mostrando todas as datas · Voltar ao período"**; mexer no seletor de período também volta ao período
- As contagens dos botões de etapa seguem exatamente o que a lista mostra (período + busca + atrasados)
- A etapa **Entregue** mostra até os **50** pedidos entregues mais recentes
- "Limpar filtros" volta a busca e o período ao padrão (Hoje)

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `delivery` (view) | Ver o Kanban |
| `etapasPermitidas` (configurado no delivery) | Quais etapas o usuário pode movimentar |
| `admin` | Acesso total + botão de Configurar |

---

## Configuração do Delivery (`/delivery/config`)

A tela de configuração (admin) tem duas abas:
- **Categorias**: define quais categorias de produto (ou categorias comerciais) aparecem no Kanban. Apenas pedidos com itens dessas categorias entram no Delivery.
- **Permissões**: define quais usuários podem mover pedidos em quais etapas.

### Como liberar o Delivery para um usuário (passo a passo)

A liberação do Delivery **não fica no painel de permissões de Usuários** (Admin → Usuários). Ela é feita dentro do próprio Delivery, e só um administrador consegue:

1. Abrir **Delivery** no menu lateral.
2. Clicar no botão **Configurar** (ícone de engrenagem, no topo do Kanban — só aparece para administrador).
3. Abrir a aba **Permissões**. Aparece uma linha para cada usuário interno ativo.
4. Marcar **Pode ver** na linha do usuário → o Delivery passa a aparecer no menu dele.
5. Marcar as colunas das etapas que ele pode movimentar (**Pedido**, **Produção**, **Saindo**, **Entregue**). Sem nenhuma marcada, ele só vê os cards.
6. Clicar em **Salvar** na linha (o botão aparece quando há alteração).

O usuário liberado precisa **sair e entrar de novo** (ou atualizar a página) para o item Delivery aparecer no menu. Para tirar o acesso, desmarcar **Pode ver** e salvar.

Exemplo em uso: o usuário **Produção** foi liberado em 15/10/2026 para ver a tela e mover para Produção, Saindo e Entregue (não devolve card para Pedido).

---

## Depende de / Interfere em

- **Pedidos** — somente pedidos FATURADOS aparecem aqui
- **WhatsApp** — a movimentação de etapa dispara envio automático de mensagem
- **Config: Categorias de Produto** — determina quais pedidos entram no Kanban

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Delivery/DeliveryKanban.jsx` | Tela principal do Kanban |
| `frontend/src/pages/Delivery/DeliveryConfig.jsx` | Configurações de categorias e permissões |
| `frontend/src/services/deliveryService.js` | Chamadas de API do delivery |
| `frontend/src/pages/Delivery/JanelaMoverEtapa.jsx` | Janela "Mover pedido" (escolha da etapa + avisar ou não o cliente) |
| `frontend/src/components/EntregarEm.jsx` | Bloco "Entregar em" (usado no Delivery e em Pedidos) |
| `frontend/src/components/FiltroPeriodo.jsx` | Seletor de período (presets "para a frente": Amanhã, Próximos 7/30 dias) |
| `backend/routes/deliveryRoutes.js` e `backend/services/deliveryService.js` | Rotas e regras do backend |


## Pedido grande: mensagens em várias partes (novo — 10/2026)

Nas etapas **Em Produção** (cliente e número interno da equipe) e no reenvio de **Pedido Criado**, o resumo lista todos os itens. Quando o pedido é grande, a mensagem sai **dividida em partes numeradas** ("*(1/2)*", "*(2/2)*"), com o total e as observações perto do fim. A observação sai **sempre inteira** (nunca resumida): se for enorme, o rodapé vai em mensagem(ns) própria(s) e a observação é repartida entre elas sem partir palavras. **Saindo para Entrega** e **Entregue** são sempre uma mensagem curta. A prévia da mensagem na tela continua mostrando o texto completo numa só peça. O reenvio manual de pedido grande pode demorar alguns segundos a mais.

## Agenda Google "Produção" (pedidos do quadro)

**Todo pedido que aparece no quadro Delivery** (faturado, com item de categoria de delivery) vai para a agenda Produção do Google, no dia do pedido, com a **etapa do Kanban no título**: Pedido → "A produzir", Em Produção → "Em produção", Saindo para Entrega → "Saiu para entrega", Entregue → "Entregue". **Mover o cartão de etapa atualiza o evento na agenda** na hora (inclusive Entregue: o evento **fica**, só troca o status). O evento só sai quando o pedido sai do quadro: **cancelado, excluído ou com devolução finalizada**. Pedido que veio do site Kit Festa aparece pelo evento do Kit Festa (sem evento duplicado). Quando o pedido tem **horário de entrega**, o evento deixa de ser "dia inteiro": ele **termina no horário** e começa 20 min + 1,5 min por unidade antes (ex.: 12 un, entrega 14:00 → 13:22–14:00). Título: `📦 Pedido #3969 · Cliente · 12 un · 14:00 · A produzir` (sem horário, fica `… · 12 un · A produzir`); a descrição traz `Entrega: 14:00 · Começar a produzir: 13:22`. Mudar o horário no cartão atualiza o evento. Prefixos: `🎁 Bonificação BN#` para bonificação, `ZZ#` para especial. Pedido que veio do Kit Festa do site segue o horário do pedido (o do site só vale se o pedido ficar sem horário). O pedido entra na agenda quando entra no quadro (ao ser faturado); uma conferência automática a cada 10 min corrige qualquer diferença. Configuração em Configurações → Agenda Google.
