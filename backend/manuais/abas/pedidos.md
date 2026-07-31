---
aba: Pedidos
rota: /pedidos
permissao: pedidos (view)
---

# Pedidos

## O que é

Central de consulta e gerenciamento de todos os pedidos lançados no sistema. Aqui você vê, filtra, imprime e acompanha o ciclo de vida de cada pedido — desde que foi criado até o faturamento. **Desde 23/07/2026 o faturamento é feito pelo próprio app** (numeração da venda, conta a receber, estoque e NF-e via Focus NFe) — nada mais é enviado ao Conta Azul.

> **Atenção:** criar um pedido novo **não começa aqui**. Começa na aba **Rota**, no card do cliente, clicando em "Novo Pedido". Esta tela é de gestão, não de criação.

---

## O que dá pra fazer aqui

- Visualizar pedidos separados por tipo (sub-abas: Pedidos | Especiais | Bonificação | Amostras | Devoluções)
- Filtrar por data de entrega, data de criação, vencimento, embarque, motorista e vendedor
- Buscar por cliente, cidade, vendedor, documento ou número do pedido
- Filtrar rapidamente por status (Aberto, Enviar, Sincronizando, Aprovado, Faturado, Erro — e, na aba Pedidos, **Convertidos**: só os que nasceram especiais)
- Ver de longe o que ainda não faturou: **pílula dourada NOVO** na linha de todo pedido ainda não faturado (some sozinha quando fatura; vale para pedidos, especiais e bonificações)
- Identificar pedido que nasceu especial: selo âmbar **"⚡ Especial convertido · era ZZ#"** na linha (permanente, mesmo depois de faturar)
- Clicar no pedido e ver **tudo num lugar só**: recebimento parcela a parcela (pago/em aberto, forma e data), entrega (motorista, data/hora, GPS no mapa, observação) e a linha do tempo completa do pedido — sem precisar abrir Contas a Receber
- **Converter pedido especial em pedido com NF** manualmente (quem aprova especial), em qualquer situação — em aberto, faturado, pago em qualquer forma ou ainda sem pagamento
- Carregar a lista aos poucos: mostra os 50 primeiros e um botão **Carregar mais** (deixa a tela leve e rápida)
- Ver pendências de faturamento em tempo real
- Imprimir pedido individual ou vários ao mesmo tempo (seleção em lote)
- Enviar comprovante do pedido via WhatsApp para o cliente
- Aprovar ou reverter pedidos Especiais e Bonificações (quem tem permissão)
- Consultar situação atualizada no Conta Azul (pílula **Sync CA**) — também atualiza o check do boleto do CA
- Pílula **CA** (ícone do Conta Azul): cobranças/boletos gerados no CA. **Check verde ✓** = tem boleto no CA (cinza = já pago). O boleto do CA só é gerado manualmente dentro do Conta Azul
- Pílula **Asaas**: gerar/gerenciar **boleto pelo Asaas** (por parcela, com envio por WhatsApp). **Check verde ✓** = boleto emitido (cinza = pago). Só em pedido a prazo faturado; não aparece em especial, bonificação nem à vista
- Pílula **PIX Asaas** (pedidos à vista e especiais): gerar cobrança PIX / link de pagamento
- Baixar a **DANFE (PDF da NF-e)** de pedido faturado (ícone de recibo) — o app busca o XML autorizado na API do Conta Azul e gera o PDF na hora, sem precisar entrar no CA
- Reatribuir pedido para outro vendedor (quem tem permissão)
- Excluir pedidos (quem tem permissão específica por tipo)
- Avançar status de amostras (Solicitada → Preparação → Liberado)

---

## Como a lista carrega (rápido e leve)

- A lista mostra **50 pedidos por vez**, do mais novo para o mais antigo. Para ver mais, clique em **Carregar mais** no fim da lista (o rodapé mostra "Mostrando X de Y").
- A **busca** e o **filtro rápido de status** (Aberto/Enviar/Faturado…) valem sobre **todos os pedidos**, não só os que já apareceram na tela — o sistema busca no servidor. As contagens ao lado de cada status também são o total real.
- Os filtros de data (**Entrega**, **Criação** e **Vencimento**) usam a pílula de período `[‹] [Este mês ▾] [›]`: clique no meio para escolher um período pronto (Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Este ano · Todo o período · Período personalizado com De/Até) e use as setas **‹ ›** para pular o período inteiro (um dia, uma semana, um mês…). Os três começam em **Todo o período** (sem limite). A escolha fica **lembrada** para a próxima vez que abrir a tela — sempre recalculada (ex.: "Hoje" salvo ontem abre mostrando o dia de hoje). Quando um filtro está diferente do padrão, a pílula fica com **borda verde**. O botão **Limpar** zera todos os filtros (inclusive os períodos) e volta ao normal.
- A busca por texto encontra por **cliente, cidade, vendedor, documento ou número** (ex.: `123`, `ZZ#45`, `BN#7`). Não busca mais pelo valor total do pedido.
- **A tela lembra as suas escolhas** (por usuário, no aparelho em que você usa): a **sub-aba** em que você estava (Pedidos/Especiais/Bonificação/Amostras/Devoluções), o **filtro rápido de status**, os três **períodos** (pelo preset, recalculado a cada abertura), **Embarque**, **Vendedor**, **Motorista** e até se o **painel de filtros avançados** estava aberto ou fechado. Ao sair para outra tela e voltar (ou fechar e reabrir o app), tudo volta como você deixou. Só a **busca por texto** começa sempre vazia, de propósito. Quando há filtro avançado ativo com o painel fechado, o botão do funil fica **verde com um pontinho vermelho** piscando — é o aviso de que a lista está filtrada. **Limpar** volta tudo ao padrão.

---

## Como fazer (passo a passo real)

### Criar um pedido novo
1. Vá para a aba **Rota**
2. Localize o card do cliente desejado
3. Clique em **"Novo Pedido"** no card
4. O sistema abre `/pedidos/novo?clienteId=...` (tela `NovoPedido`)
5. Escolha o **tipo** (Pedido Normal, Especial ou Bonificação)
6. Selecione a **condição de pagamento** e a **data de entrega**
   - Só aparecem (e só são aceitas) as condições **liberadas para o cliente** — a lista "Condições de pagamento permitidas" do cadastro do cliente (ou, se vazia, apenas a condição padrão dele). O backend também valida: escolher condição fora da lista dá erro "condição não liberada para este cliente". Para liberar outra condição, ajuste o cadastro do cliente
   - Ao **editar** um pedido cuja condição atual não está liberada (ex.: pedido vindo do Site Congelados com a condição "Site"), a tela pede para escolher uma condição liberada antes de salvar
7. Adicione os produtos e quantidades
8. Clique em **Salvar** — o pedido é criado com status **ABERTO**

### Bloqueio de venda sem estoque (por usuário)
- Se o interruptor **Bloquear Venda Sem Estoque** estiver ligado nas permissões do usuário (aba Usuários → Permissões → seção Vendas), o sistema **não deixa ENVIAR** pedido pedindo mais do que o **estoque disponível** de qualquer produto — o estoque não fica negativo.
- **Salvar o pedido (ABERTO) continua permitido**: o vendedor guarda o pedido e envia quando o estoque for reposto.
- Na tela de pedido, **cada item que passa do disponível avisa na hora** (toast + som + selo vermelho "Sem estoque p/ enviar" no card do produto e no carrinho). O botão **Salvar fica piscando** em âmbar e o botão "Fechar pedido" vira um alerta vermelho piscante — clicar nele abre o **popup de erro** do sistema (com som de erro) listando produto por produto: quantidade pedida × disponível.
- É uma **restrição** por usuário e vale **até para admin** (o interruptor é explícito). Com ele desligado (padrão), nada muda — o usuário vende mesmo com estoque zerado/negativo.
- Vale para pedido normal, especial e bonificação (tudo que reserva estoque). Produtos que **não controlam estoque** não entram na conta.
- Na **edição**, a quantidade que o próprio pedido já reservou volta ao disponível antes da comparação — reeditar um pedido sem mudar quantidades nunca é bloqueado.
- "Disponível" = estoque total menos o que os outros pedidos em aberto já reservaram (o mesmo número "Est:" que aparece na tela de pedido).

### Lembrete de pedidos salvos sem enviar (popup a cada 30 min)
- Quem tem pedido **ABERTO** (salvo e ainda não enviado) recebe um **popup com som a cada 30 minutos**, em qualquer tela do app (menos dentro da própria tela de criação de pedido), listando os pedidos e a data de entrega de cada um.
- Botões: **"Ver pedidos"** (vai para a lista) e **"Lembrar em 30 min"** (fecha e volta a avisar depois). O aviso considera os pedidos em que a pessoa é o vendedor **ou** foi quem lançou.

### Data de entrega nunca no passado
- Ao criar pedido, a **data de entrega não pode ser anterior a hoje** (vale para todos, inclusive admin). O campo de data já impede escolher datas passadas e o servidor valida de novo.
- Rascunho antigo com data já passada abre **sem data** — o vendedor escolhe de novo.
- Na **edição**, manter a data que o pedido já tinha é permitido (pedidos antigos têm datas antigas); só não dá para **mudar** para uma data passada.

### Faturar pedido (antes: "enviar ao Conta Azul")
- Pedidos com status **ABERTO** precisam ser marcados como **ENVIAR** (fluxo igual ao de sempre)
- O worker fatura sozinho em até ~1 minuto: gera o **número da venda no próprio app** (continua a sequência), muda o status para **RECEBIDO** e baixa o estoque — nada é enviado ao Conta Azul (somente leitura desde 23/07/2026)
- A NF-e é emitida pelo app na aba **Notas Fiscais**

### Acompanhar pedidos pendentes
- O painel no topo da lista mostra alertas coloridos: quantos pedidos estão em **Enviar**, **Aprovados** e **Erro**
- Clique no alerta para ir direto àquele grupo

### Imprimir em lote (DANFEs + boletos / recibos)
1. Marque os pedidos pelos checkboxes (ou clique **"Selecionar faturados"**) → clique **Imprimir N**
2. Na janela, escolha: **2 vias de cada documento** (uma p/ assinatura, outra p/ cliente) e **boleto logo após as vias** (sai na sequência, pronto p/ grampear)
3. **Imprime boleto do Conta Azul E do Asaas** — ao clicar em Imprimir, o app consulta o CA de cada pedido; se achar boleto lá, baixa o PDF e inclui na sequência (junto com os do Asaas). Condição com 2 parcelas = 2 boletos, na ordem
4. **Boleto já quitado NÃO é impresso** (não faz sentido). Se precisar imprimir um boleto pago (p/ o cliente conferir), faça pelo **Contas a Receber**
5. Avisos automáticos: pedidos **a prazo sem boleto (nem no CA, nem no Asaas)** aparecem em destaque com o botão **"Gerar boletos agora"** (gera no Asaas — o do CA só é gerado manualmente lá dentro); pedidos **sem NF-e emitida** são pulados (emita a nota no CA primeiro); pedidos **à vista** saem sem boleto (não há o que cobrar)
6. Pedido **ESPECIAL (ZZ#)** e **BONIFICAÇÃO (BN#)** saem no **recibo de conferência** (modelo sem a marca da Hardt, com itens, total e linha de assinatura) — eles só imprimem pelo lote. Bonificação também é selecionável pelo checkbox quando faturada
7. **AMOSTRAS (AM#)**: na aba Amostras também há checkboxes (e o "Selecionar todas") — saem no **recibo de conferência sem valores** (produto e quantidade + faixa "AMOSTRA — SEM VALOR COMERCIAL"); amostra não passa pela conferência de boletos
8. Sai **um único PDF** com as folhas na ordem certa; as opções ficam lembradas para a próxima
- O botão de imprimir o pedido individual foi **removido** — a DANFE substitui; para mandar um pedido a alguém, use um print da tela

### Gerar PIX de um pedido (cobrança à vista / link de pagamento)
1. Na pílula **PIX** do pedido (aparece em pedidos à vista e especiais), escolha o valor e a **validade** (hoje / amanhã / 3 dias / 7 dias — o QR e o link valem até o fim do dia escolhido)
2. Mostre o QR, **copie o código PIX** ou **envie o link por WhatsApp** ao cliente
3. Quando pagar: **baixa automática** na parcela do app (conta financeira ASAAS); check verde ✓ aparece na pílula
4. **Pedido ESPECIAL + PIX = conversão**: antes de gerar aparece um aviso vermelho destacado — ao receber qualquer valor via PIX (parcial ou total), o pedido especial é **convertido automaticamente em pedido normal**: ganha número novo na sequência e a **NF-e deve ser emitida** pelo faturamento (aba Notas Fiscais do app)
5. Quem fatura recebe um **popup a cada 5 minutos** ("Pedido convertido — emitir NF-e") até dar ciência; quem recebe esse aviso é escolhido na aba **Usuários** (ícone de setas circulares laranja)

### Aprovar Pedido Especial ou Bonificação
1. Vá para a sub-aba **Especiais** ou **Bonificação**
2. Localize o pedido com status **ABERTO**
3. Clique em **Aprovar** (botão verde) — exige permissão `Pode_Aprovar_Especial` ou `Pode_Aprovar_Bonificacao`
4. O status muda para RECEBIDO e o pedido é faturado
5. **A aprovação dá baixa no estoque automaticamente** (desde jul/2026) — os itens saem do estoque do sistema no momento da aprovação, igual acontece com pedidos normais no faturamento. Se a aprovação for **revertida**, os itens voltam ao estoque sozinhos. A baixa tem trava contra duplicidade: aprovar/faturar duas vezes o mesmo pedido não desconta em dobro.

### Converter pedido especial em pedido com NF (manual)
1. Vá para a sub-aba **Especiais** e clique no pedido para abrir os detalhes
2. Clique em **Converter em pedido c/ NF** (botão verde com raio ⚡) — aparece tanto no especial **em aberto** quanto no **já faturado**; exige `Pode_Aprovar_Especial` ou `admin`
3. Confirme o aviso: o pedido ganha **número novo na sequência oficial**, sai da aba Especiais e entra na aba **Pedidos**, indo para a fila de faturamento/emissão da NF-e
4. **Nada duplica e nada se perde**: é o MESMO registro que muda de aba — entrega, carga, devoluções e tudo que já foi recebido (dinheiro, PIX, boleto) continuam no pedido, visíveis nos detalhes
5. Serve para o caso do cliente que **exige a NF** de um pedido especial, pago em qualquer forma. **Não dá para desfazer**
6. Após converter, o pedido leva o selo âmbar **"⚡ Especial convertido · era ZZ#"** e o mesmo popup do faturamento ("Pedido convertido — emitir NF-e") avisa quem emite a nota
- A conversão **automática** continua igual: pedido especial que recebe **PIX Asaas** converte sozinho (ver seção do PIX acima)

### Detalhes do pedido (clicar no pedido) — tudo num lugar só
Ao clicar em qualquer pedido, além dos itens e valores, o app mostra (desde jul/2026):
- **Recebimento**: cada parcela com status (Pago / Parcial / Em aberto / Vencido / Cancelado), valor, vencimento e — se paga — valor recebido, forma e data. No rodapé, o total recebido até agora. É a mesma informação do Contas a Receber, sem sair do pedido
- **Entrega**: status (Entregue / Parcial / Devolvido), data e hora, número da carga (embarque) e motorista, link **"Ver GPS da entrega no mapa"** (abre o ponto exato no Google Maps) e a observação do motorista
- **O que aconteceu com este pedido**: linha do tempo completa — criação (e por quem), faturamento, saída na carga, entrega, pagamentos (PIX/boleto/parcelas), conversão de especial (bolinhas douradas), devoluções e NF-e emitidas
- Se o pedido nasceu especial, uma **faixa âmbar** no topo mostra o ZZ# de origem, quando foi convertido e quanto já tinha sido recebido

### Consultar situação no Conta Azul
- Clique no botão de reload ao lado do pedido que já tem `idVendaContaAzul`
- O sistema consulta o CA e atualiza `situacaoCA` e `statusEnvio`

### Ver link de cobrança (PIX/Boleto)
- Clique no ícone de cifrão ao lado do pedido faturado
- O sistema busca as cobranças ativas no CA e exibe os links
- Há botão **Copiar** para copiar todos os links formatados

---

## Sub-abas

A tela Pedidos possui 5 sub-abas internas (6 contando Devoluções para quem tem permissão).

### Pedidos (aba principal)
Lista todos os pedidos normais (`especial = false`, `bonificacao = false`). Inclui pedidos de Encaixe (marcados como encaixe mas do tipo normal). É a aba padrão ao abrir a tela.

- Filtros por data de entrega, criação, vencimento, embarque e motorista
- Filtros por status rápido clicáveis no painel de pendências
- Seleção em lote para impressão (pedidos FATURADO)

### Especiais
Lista pedidos do tipo **Especial** (`ZZ#`). São pedidos com condições diferenciadas de preço ou prazo, que requerem aprovação antes de ir ao CA.

- Exibe botão **Aprovar** (para aprovadores) e **Reverter** (para quem pode reverter)
- Após aprovação, o status muda e o pedido é faturado no CA automaticamente
- Botão **Converter em pedido c/ NF** (⚡, para quem aprova especial): transforma o especial em pedido normal com nota — em aberto ou já faturado, pago em qualquer forma. O pedido sai desta aba e vai para a aba Pedidos com o selo "Especial convertido" (ver seção própria acima)

### Bonificação
Lista pedidos do tipo **Bonificação** (`BN#`). Produtos enviados de graça para o cliente. Também requerem aprovação.

- Mesma lógica de aprovação e reversão dos Especiais
- Permissões separadas: `Pode_Aprovar_Bonificacao` e `Pode_Reverter_Bonificacao`

### Amostras
Lista pedidos do tipo **Amostra** (`AM#`). Produtos enviados como amostra com fluxo de status próprio.

Status possíveis: `SOLICITADA → PREPARACAO → LIBERADO → ENTREGUE`

- Botão de avançar status: muda para o próximo estado
- Botão de excluir amostra (quem tem `Pode_Excluir_Amostra`)
- Controle de amostras por produto

### Devoluções
Visível apenas para quem tem `Pode_Fazer_Devolucao` ou `admin`. Renderiza o componente `ListaDevolucoes`.

Mostra todas as devoluções registradas (parciais ou totais) com motivo, motorista, data, valor e status (ATIVA ou REVERTIDA).

Desde 23/07/2026 o acerto financeiro da devolução acontece **nas parcelas do próprio app**: o valor devolvido vira **desconto** nas parcelas em aberto do pedido (histórico "Devolução TOTAL/PARCIAL #N") — nada é ajustado no Conta Azul. Se as parcelas já estiverem pagas, o app avisa que o acerto precisa ser manual em Contas a Receber (estorno + desconto).

---

## Tipos de pedido

| Tipo | Prefixo | Descrição |
|------|---------|-----------|
| Normal | `#123` | Pedido padrão de venda |
| Especial | `ZZ#123` | Condições diferenciadas; requer aprovação |
| Bonificação | `BN#123` | Produto grátis/bonificado; requer aprovação |
| Encaixe | `#123` (flag) | Pedido urgente encaixado na rota |
| Amostra | `AM#123` | Produto enviado como amostra; sub-aba própria |
| Devolução | — | Sub-aba própria; visível para quem tem `Pode_Fazer_Devolucao` |

---

## Status do pedido

| Status | Significado |
|--------|-------------|
| ABERTO | Criado, ainda não enviado ao CA |
| ENVIAR | Marcado para envio na próxima sincronização |
| SINCRONIZANDO | Sendo processado pelo worker de sync |
| RECEBIDO | Faturado — número de venda gerado pelo app (até 23/07/2026 significava "aceito pelo CA") |
| ERRO | Falha no envio; o motivo aparece em vermelho |
| FATURADO | Confirmado/faturado pelo CA |

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a aba | `pedidos` (view) |
| Aprovar Especial | `Pode_Aprovar_Especial` ou `admin` |
| Reverter Especial | `Pode_Reverter_Especial` ou `admin` |
| Aprovar Bonificação | `Pode_Aprovar_Bonificacao` ou `admin` |
| Reverter Bonificação | `Pode_Reverter_Bonificacao` ou `admin` |
| Excluir pedido normal | `Pode_Excluir_Pedido` ou `admin` |
| Excluir pedido especial | `Pode_Excluir_Especial` ou `admin` |
| Excluir bonificação | `Pode_Excluir_Bonificacao` ou `admin` |
| Excluir amostra | `Pode_Excluir_Amostra` ou `admin` |
| Ver pedidos de todos os vendedores | `pedidos.clientes = "todos"` ou `admin` |
| Reatribuir vendedor | `Pode_Reatribuir_Vendedor` ou `admin` |
| Ver sub-aba Devoluções | `Pode_Fazer_Devolucao` ou `admin` |
| Enviar pedido além do estoque disponível | **Bloqueado** se `Bloqueio_Venda_Sem_Estoque` estiver ligado (salvar como ABERTO pode; restrição, vale até para admin) |

---

## Depende de / Interfere em

- **Rota** — é onde pedidos novos são criados (botão "Novo Pedido" no card do cliente)
- **Conta Azul (legado)** — pedidos antigos (era CA) ainda têm venda lá; pedidos novos são 100% do app. A NF-e do app é quem marca FATURADO
- **Embarque** — pedidos faturados são adicionados a embarques na aba Embarque
- **Entregas** — após o embarque, o status de entrega aparece no card do pedido
- **Contas a Receber** — faturamento no CA gera contas a receber; reverter especial cancela a conta no CA
- **Sincronizar** (`/admin/sync`) — histórico de execuções dos robôs (o envio de pedidos ao CA foi desligado em 23/07/2026)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Pedidos/ListaPedidos.jsx` | Tela principal da aba (listagem, filtros, sub-abas, ações) |
| `frontend/src/pages/Pedidos/NovoPedido.jsx` | Formulário de criação/edição de pedido |
| `frontend/src/pages/Pedidos/ImpressaoPedido.jsx` | Tela de impressão de 1 ou N pedidos |
| `frontend/src/pages/Pedidos/ListaDevolucoes.jsx` | Sub-aba de devoluções |
| `frontend/src/services/pedidoService.js` | Chamadas de API para pedidos |
| `frontend/src/services/amostraService.js` | Chamadas de API para amostras |
| `backend/src/routes/pedidos.js` | Rotas do backend para pedidos |

## Bloqueio de pedido sem ponto GPS (novo — 07/2026)

Quando o interruptor "Exigir ponto GPS para ENVIAR pedido" está LIGADO (tela Saúde dos Pontos GPS), pedido de cliente **sem ponto GPS e que não é Cliente Balcão** não pode ser ENVIADO — aparece um aviso com o botão **"Definir ponto agora"**, que abre o mapa; depois de salvar o ponto, o pedido é enviado automaticamente. Salvar o pedido como ABERTO continua permitido (igual ao bloqueio de estoque). Cliente Balcão (compra e retira na empresa) é dispensado da exigência.
