---
aba: Contas a Receber
rota: /financeiro/contas-receber/tabela
permissao: Pode_Acessar_Contas_Receber
---

# Contas a Receber

## O que é

Gestão financeira de todas as contas a receber. **Desde 23/07/2026 o app é o dono do financeiro** (o Conta Azul virou somente leitura): cada pedido finalizado gera a conta com parcelas aqui mesmo, e as baixas acontecem só no app. Esta tela mostra o estado de cada parcela (pendente, parcial, pago, vencido), permite dar baixa manual — total, parcial ou com desconto (inclusive 100%) — e gerar relatórios de inadimplência.

Também existem **contas importadas do Conta Azul** (origem IMPORTADO_CA): são cobranças antigas que viviam lá e foram trazidas para cá na migração — aparecem sem pedido vinculado, com a descrição original do CA.

---

## O que dá pra fazer aqui

- Ver todas as parcelas de contas a receber em formato de tabela
- Filtrar por: busca (cliente/pedido), status da conta, status da parcela, origem, vendedor, categoria de cliente, condição de pagamento, cobrança (boleto/pix/dinheiro/cartão), forma de pagamento de entrega, forma de pagamento da baixa e período de vencimento/pagamento
- Ordenar por qualquer coluna (clique no cabeçalho)
- Selecionar parcelas em lote e dar baixa coletiva (sempre pelo valor cheio de cada parcela) — precisa da permissão de baixa manual
- Dar baixa em uma parcela individual — pode ser o valor total, um valor parcial (o restante fica pendente como PARCIAL) e/ou um desconto (em R$ ou %, incluindo 100% do saldo, sem precisar receber nada)
- Ver o histórico de cada pagamento recebido numa parcela (data, valor, desconto, quem registrou) e estornar um pagamento específico sem mexer nos outros
- Sincronizar situação de uma conta específica ou de todas as contas com o Conta Azul
- Acompanhar progresso de sincronização em tempo real (log de sync)
- Abrir popup do cliente para ver histórico e inadimplência
- Abrir popup do pedido para ver detalhes
- Gerar relatório de inadimplência agrupado por pedido, cliente, vendedor ou sem agrupamento
- Exportar a lista filtrada em CSV
- Emitir e gerenciar **boletos via Asaas** por parcela (botão "Boletos Asaas" na conta expandida da visão resumo)

---

## Status das parcelas

| Status | Cor | Significado |
|--------|-----|-------------|
| PENDENTE | Cinza | Aguardando vencimento, nenhum valor recebido ainda |
| PARCIAL | Amarelo | Recebeu parte do valor (ou desconto parcial) — ainda tem saldo restante |
| VENCIDO | Vermelho | Prazo expirado sem pagamento |
| PAGO | Verde | Quitada — recebido + desconto cobrem o valor total |
| CANCELADO | Cinza claro | Parcela cancelada |

### Pedido devolvido: quem encerra a cobrança é a devolução registrada no Caixa
Marcar a entrega como "Devolvido" no celular do motorista **não** mexe no título — ele continua
em aberto até alguém **registrar a devolução na conferência do Caixa Diário**. Ao registrar:

- Devolução **total**: as parcelas em aberto são canceladas e a conta passa a **DEVOLVIDO**.
- Devolução **parcial**: as parcelas em aberto têm o valor reduzido proporcionalmente.
- Nos dois casos, os **boletos/PIX ainda pagáveis são cancelados no Asaas** — importante porque
  boleto vencido continua pagável no banco, e o cliente poderia pagar mercadoria que devolveu.
  Se a devolução foi parcial e o cliente for pagar por boleto, **emita um boleto novo** pelo
  valor que sobrou.

Enquanto a devolução não é registrada, o título continua cobrando normalmente — inclusive na
régua de cobrança.

---

## Como fazer (passo a passo real)

### Ver contas em aberto
1. Abra a aba Contas a Receber
2. Por padrão, o filtro mostra contas pendentes e vencidas
3. Ordene por vencimento para ver as mais antigas primeiro

### Filtrar contas
1. Clique no painel de filtros (ou use os filtros rápidos no topo)
2. **Todos os filtros aceitam mais de uma opção** (08/2026): cada caixa abre um menu com
   caixinhas de marcar, o menu **fica aberto** enquanto você marca (dá para escolher, por
   exemplo, Aberto **e** Quitado de uma vez) e fecha ao clicar fora. Dentro do menu há
   "Limpar seleção (N)" para desmarcar tudo daquela caixa; menus longos ganham um campo de
   busca no topo. A caixa mostra o nome da opção quando é uma só, ou "N selec." quando são
   várias. Marcar mais de uma opção na mesma caixa significa **ou** (Aberto ou Quitado);
   caixas diferentes se combinam com **e** (vendedor X **e** condição à vista).
   A lista se atualiza sozinha a cada marcação — não precisa clicar em Filtrar.
3. Filtros disponíveis:
   - **Cliente**: busca por texto (aperte Enter ou clique em Filtrar)
   - **Status da conta**: Aberto, Quitado, Cancelado
   - **Status da parcela**: Pendente, Parcial, Pago, Vencido, Cancelado
   - **Origem**: de onde a conta veio (Faturado CA, Especial)
   - **Vendedor**: filtra contas dos clientes de um ou mais vendedores. A lista traz **também os vendedores inativos** (quem saiu da empresa), no fim e marcados "(inativo)" — título antigo continua no nome de quem vendeu na época, então dá para cobrar/consultar a carteira de um ex-vendedor
   - **Categoria de cliente**: segmento do cliente
   - **Condição de pagamento**: a condição exata do pedido (ex: 14 dias - Boleto, À vista - Pix)
   - **Cobrança**: como o título é cobrado — Boleto, Pix, Dinheiro ou Cartão. Vem da condição do pedido, então **funciona com contas ainda em aberto** (ex.: Status Conta = Aberto + Cobrança = Boleto lista tudo que está para receber em boleto, sem precisar marcar uma a uma as condições "7 dias - Boleto", "14 dias - Boleto"...)
   - **Condição na Entrega**: forma registrada pelo motorista
   - **Forma Pgto (baixa)**: como a parcela foi quitada — só encontra parcela **já baixada** (parcela em aberto ainda não tem forma de pagamento). Para filtrar boleto em aberto, use o filtro **Cobrança**
   - **Responsável pela cobrança**: quem ficou encarregado de cobrar o título — cada vendedor que já foi marcado, mais a opção **Escritório**. O filtro olha a **marcação feita na entrega**, não o nome da forma de pagamento: título registrado como "Dinheiro" com a caixinha de responsável marcada também é encontrado (antes escapava). Dá para marcar **uma ou várias** pessoas de uma vez — o recorte é feito no servidor nos dois casos, então os indicadores do topo (total em aberto, vencidas etc.) também passam a ser só das pessoas escolhidas. Linha marcada para vendedor **e** escritório ao mesmo tempo conta como do **vendedor**, tanto no filtro quanto no relatório
   - **Baixado por**: quem registrou a baixa (usuário do app). Como só parcela baixada tem responsável, ao usar este filtro a tela passa a mostrar também as parcelas já pagas (não é preciso mudar Status Conta/Parcela). A lista traz só quem já deu baixa em alguma parcela. É o mesmo nome que aparece em "Baixado por" embaixo de cada linha
   - **Vencimento** e **Pagamento (baixa)**: filtro de período no padrão do sistema — uma pílula `‹ Todo o período ›` com os presets Hoje, Últimos 7 dias, Últimos 30 dias, Este mês, Este ano, Todo o período e Período personalizado (De/Até dentro do próprio menu). As setas pulam o período inteiro (mês anterior, mês seguinte...). Começa em "Todo o período" (sem recorte de data)
4. As escolhas ficam salvas por usuário e voltam ao reabrir a tela. Nos períodos o que fica salvo é o **preset** — "Este mês" salvo em julho abre agosto em agosto, ninguém fica preso numa data velha
5. **Limpar** zera todas as caixas e os dois períodos de uma vez

### De onde pode vir a baixa de um título (regra do dono, 08/2026)

Uma parcela só deve virar PAGA por um destes caminhos:

1. **Conciliação Bancária** — o dinheiro apareceu no extrato (boleto, Pix, transferência, cartão) ou o Asaas confirmou o pagamento. A baixa nasce do lançamento do banco, então o valor está conferido.
2. **Caixa** — quem recebeu (motorista na rua ou quem atende no balcão) põe no caixa dela; ao processar o caixa a parcela é baixada e o valor entra no **valor a prestar** dessa pessoa.
3. **Baixa manual aqui na tela** — é a **exceção**, e por isso:
   - exige a permissão **Pode_Baixar_Contas_Receber_Manual** (separada de "Dar Baixa em Parcelas"); sem ela os botões de baixa nem aparecem;
   - aceita **somente Dinheiro ou Cheque**. Boleto, Pix, cartão e transferência são recusados com a mensagem apontando a Conciliação Bancária — esses caem no extrato e é lá que o dinheiro é confrontado com o banco;
   - o valor **entra no caixa do dia de quem baixou**, somando no "a prestar" dela (aparece no card "Títulos Recebidos" da tela do Caixa). Quem baixa fica responsável por entregar o dinheiro no fechamento;
   - não existe mais o campo "Banco/caixa" com a opção "Não informar" — o sistema lança sozinho na conta em espécie (Caixinha);
   - se o caixa do dia já estiver **fechado ou conferido**, o app recusa a baixa e pede para reabrir o caixa (senão o lançamento entraria num dia já prestado).

Desconto sem dinheiro (perdoar saldo) continua na mesma permissão de desconto e **não** passa por caixa — não há valor a prestar.

**Especial entregue aparece na aba "Aberto":** desde 08/2026 a entrega não quita mais o título sozinha, então o especial entregue fica em **Aberto** até a baixa na conferência do Caixa. Se o cliente já pagou em dinheiro na entrega, ele **não** é tratado como devedor nesse intervalo (não bloqueia venda nova, não entra na régua nem na inadimplência das telas).

**Parcela PARCIAL:** quando entra só parte do valor, a parcela fica com o selo **Parcial** e mostra **"Recebido (+ desconto)"** e **"Falta receber"** — o saldo continua em aberto e é o que entra na cobrança. O histórico de pagamento traz cada recebimento (valor, forma, banco/caixa, data e quem baixou).

**"Escritório/Vendedor responsável" não quita:** essas formas não são recebimento — são o registro de quem ficou responsável por cobrar. A baixa manual com essa forma é **recusada** com a explicação; o título continua **em aberto no nome do responsável**, e é aqui que o dono confere e dá a baixa quando descontar o valor da pessoa.

### Quem ficou de cobrar o título (responsável)

Quando o motorista fecha a entrega e o cliente não paga, quem confere pode marcar **"Vendedor responsável"** ou **"Escritório responsável"** — é o registro de quem ficou encarregado de cobrar aquele valor. Isso já era gravado, mas o sistema não sabia usar: não mostrava o nome, não dava para filtrar por pessoa e não havia nenhum fechamento. O dono montava o relatório do dia 01 na mão.

A partir de 08/2026 o sistema entende essa marcação:

- **Selo com o nome, na linha do título.** Onde antes aparecia só "Escritório resp." ou "Vendedor resp.", agora vem o nome: o vendedor pelo nome dele, e o escritório como **"Escritório — lançado por Fulano"**. Esse "lançado por" é quem lançou o pedido — serve de **pista de a quem perguntar**, e **não** quer dizer que essa pessoa é a responsável pela cobrança. Título antigo, sem essa informação, continua mostrando o selo curto de antes.
- **Bloco "Responsável pela cobrança" no detalhe.** Ao abrir "Ver detalhes" de um título que tem responsável, aparece um bloco listando cada responsável com o nome e o valor pelo qual respondeu. Se o título tiver **mais de um** (parte do vendedor, parte do escritório), os dois aparecem, um em cada linha.
- **Filtro "Responsável pela cobrança"** nos filtros da tela (ver a lista de filtros acima).
- **Fechamento por responsável.** A tela **Financeiro → Cobranças sob responsabilidade** (`/financeiro/cobrancas-responsavel`, mesma permissão desta) agrupa tudo por pessoa: quantos títulos, quanto está em aberto, o mais antigo, a lista completa e uma folha A4 com linha de assinatura para o vale. Só entra o que está **em aberto** — o que já foi baixado não é mais cobrança de ninguém. Ver [cobrancas-sob-responsabilidade.md](cobrancas-sob-responsabilidade.md).
- **Corrigir o lançamento da entrega não apaga mais a marcação.** Antes, ao ajustar o valor de uma entrega na tela de auditoria, o responsável se perdia em silêncio e o título ficava sem dono. Vale também para a correção feita pela tela de **Rota**, que não fala de responsável.
- **Ninguém responde por mais do que assumiu.** Se só parte do pedido foi marcada (ex.: pedido de R$ 1.000 com R$ 600 em espécie esperando a conferência do Caixa e R$ 400 no nome do vendedor), o fechamento cobra os **R$ 400** — nunca o título inteiro.

A baixa continua sendo dada **aqui**, em Contas a Receber, quando o valor for descontado da pessoa — a tela de fechamento é só o levantamento.

**Título cobrado em boleto/Pix quitado em espécie:** é permitido (o cliente pode ter pago em dinheiro no balcão), mas o app **avisa** antes de confirmar — tanto na baixa individual quanto na em lote. Se o cliente pagou o boleto de verdade, não dê baixa aqui: ela vem sozinha pela Conciliação Bancária, e a baixa manual deixaria o crédito do banco sem par no extrato.

### Dar baixa em uma parcela (total, parcial ou com desconto)
1. Localize a parcela na tabela (ou abra "Ver detalhes" e clique em **Dar baixa**)
2. Clique no botão de baixa (ícone de cheque) na linha
3. O modal abre já com o **valor recebido** preenchido com o saldo restante — reduza esse valor para registrar um pagamento parcial
4. Opcionalmente marque **Aplicar desconto no saldo restante** (só aparece habilitado para quem tem a permissão `Pode_Dar_Desconto_Baixa`): escolha R$ ou % e informe o motivo (obrigatório). Um desconto de 100% do saldo quita a parcela sem receber nada
5. Informe a forma (**Dinheiro** ou **Cheque** — só essas), a data do pagamento e a observação (opcional). Não existe mais escolher o banco/caixa: o sistema lança na conta em espécie e um aviso mostra que o valor vai para o **seu caixa de hoje**
6. O modal mostra ao vivo se a parcela vai ficar **PARCIAL** (com o saldo que ainda falta) ou **PAGO** (quitada)
7. Confirme — cada baixa fica registrada no histórico de pagamentos da parcela (visível em "Ver detalhes"), permitindo estornar só aquele pagamento depois, sem afetar os demais

### Dar baixa em lote
1. Marque os checkboxes das parcelas desejadas (só aparecem parcelas ainda sem nenhum pagamento — Pendente/Vencido)
2. Clique em **Baixa em Lote** (botão no topo da tabela)
3. Informe a forma (**Dinheiro** ou **Cheque**) e a data para todas — o total vai para o **seu caixa de hoje** e some no seu valor a prestar
4. Confirme — todas as parcelas selecionadas são baixadas de uma vez pelo valor cheio (baixa em lote não aceita valor parcial nem desconto — para isso, use a baixa individual)

### Emitir boleto pelo app (Asaas)
1. Na visão resumo (acordeão), expanda a conta e clique em **Boletos Asaas** (aparece só se a integração Asaas estiver configurada no servidor)
2. No modal, emita o boleto de uma parcela específica ou de **todas as parcelas em aberto** de uma vez — o vencimento e o valor (saldo) vêm do nosso Contas a Receber
3. Para cada boleto emitido dá para: **Abrir o PDF**, **copiar a linha digitável**, **enviar por WhatsApp** ao cliente (mensagem pronta com link e linha digitável) e **cancelar** o boleto
4. Quando o cliente pagar, o Asaas avisa o sistema e a **baixa acontece sozinha** na parcela (lançada na conta financeira ASAAS). O modal mostra "Pago via Asaas"
5. O cliente precisa ter **CPF/CNPJ no cadastro** (exigência do boleto registrado); sem isso a emissão avisa o erro
6. A nota fiscal é emitida **pelo próprio app** (aba Notas Fiscais, via Focus NFe) — o Asaas cuida só da cobrança
7. **Se o vencimento da parcela mudar depois do boleto emitido**, o sistema **atualiza o boleto no Asaas sozinho** — ao abrir o modal de boletos ou ao imprimir — e o PDF e a linha digitável passam a valer a data nova. Se esse ajuste automático falhar, o modal mostra um aviso amarelo ("boleto com vencimento diferente da parcela"); nesse caso, cancele o boleto e emita de novo antes de enviar ao cliente
8. **Boleto que passou do vencimento** aparece com o badge vermelho **"Boleto vencido"** — ele **continua pagável** no banco do cliente (com juros/multa, se configurados), então o sistema **não emite outro sozinho** (evita duas cobranças vivas e pagamento em dobro). As ações (PDF, linha digitável, WhatsApp, cancelar) continuam disponíveis. Para gerar um boleto com vencimento novo, **cancele o vencido primeiro** e depois emita outro

### Sincronizar com o Conta Azul (transição — só contas antigas)
- O Conta Azul é **somente leitura** desde 23/07/2026: o app não registra mais nada lá
- O sync continua existindo apenas para **puxar** baixas de contas antigas (da era CA) que ainda sejam registradas por lá — pedidos novos não têm nada no CA
- Clique no ícone de atualização (reload) em uma conta específica, ou em **Sync Todas**

### Gerar relatório de inadimplência
1. Clique no botão **Relatório** (no topo)
2. Defina o período de vencimento e opcionalmente a categoria de cliente
3. Escolha o agrupamento: por pedido, por cliente, por vendedor ou sem agrupamento
4. O relatório é gerado na tela com totais por grupo

### Exportar em CSV
1. Aplique os filtros desejados
2. Clique em **Exportar CSV**
3. O arquivo é baixado com as parcelas visíveis na tabela

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Contas_Receber` |
| Ver a tela e estornar (tudo ou um pagamento específico) | `Pode_Baixar_Contas_Receber` ou `admin` |
| **Dar baixa manual** (individual ou em lote) — só dinheiro/cheque, entra no caixa do dia de quem baixou | `Pode_Baixar_Contas_Receber_Manual` ou `admin` (além de `Pode_Baixar_Contas_Receber`) |
| Aplicar desconto numa baixa (parcial ou 100%) | `Pode_Dar_Desconto_Baixa` ou `admin` (além de ter `Pode_Baixar_Contas_Receber`) |
| Sincronizar com o CA | `Pode_Acessar_Contas_Receber` (acesso à tela permite sync) |
| Ver contas de todos os vendedores | Qualquer usuário com acesso à tela (a tela não filtra por vendedor automaticamente) |

---

## Depende de / Interfere em

- **Pedidos** — cada pedido finalizado gera a conta com parcelas aqui (tudo no app; nada vai ao CA)
- **Conta Azul (legado)** — contas antigas da era CA foram importadas para cá (origem IMPORTADO_CA). Baixa dada **no Conta Azul** numa dessas contas importadas é espelhada no app sozinha (a cada 3 horas): a parcela é quitada com o banco/forma de lá e o crédito aparece na Conciliação Bancária e nos Saldos por Conta
- **Notas Fiscais** — a NF-e do pedido é emitida pelo app (Focus NFe)
- **Régua de Cobrança** — título de pedido **especial** (fiado local), **bonificação** e conta de origem ESPECIAL **nunca entram na cobrança automática** (decisão do dono, 08/2026): quem cobra especial é o escritório/vendedor, na mão. Amostra não gera título
- **Caixa Diário** — é a conferência do caixa que baixa as parcelas do que foi recebido na rua. Desde 08/2026 a entrega **não quita mais nenhum título sozinha** (nem de pedido especial): ela só registra o que o motorista recebeu, e o título fica **em aberto** aqui até a baixa no Caixa. Recebendo menos que o valor, a parcela fica **PARCIAL** e o saldo continua em aberto para cobrança
- **Clientes** — a inadimplência exibida na Rota e no detalhe do cliente vem dos dados desta tela

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Financeiro/ContasReceberTabela.jsx` | Tela completa com tabela, filtros, baixa, sync e relatório |
| `frontend/src/services/contasReceberService.js` | Chamadas de API para contas a receber |
| `backend/src/routes/contasReceber.js` | Rotas do backend |
