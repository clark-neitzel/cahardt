# Cobranças sob responsabilidade

**Rota:** `/financeiro/cobrancas-responsavel` · **Permissão:** `Pode_Acessar_Contas_Receber` (a mesma de Contas a Receber) · **Menu:** Financeiro → Cobranças sob responsabilidade

Mostra, agrupado por pessoa, **tudo que está em aberto no nome de cada vendedor e do escritório**. É a folha do **fechamento do dia 01**: é a partir daqui que se monta o vale de cada um. Antes desta tela o levantamento era feito na mão, título por título.

## De onde vem esse dado

Quando o motorista fecha a entrega e o cliente não paga, quem confere marca **"Vendedor responsável"** ou **"Escritório responsável"** na linha de pagamento. Essa marcação não é recebimento — é o registro de **quem ficou encarregado de cobrar** aquele valor. Esta tela lê exatamente essa marcação (não o nome da forma de pagamento), então título registrado como "Dinheiro" com a caixinha marcada também aparece aqui.

**Só entra o que está em aberto.** Parcela já baixada some da lista — o que foi pago não é mais cobrança de ninguém. Pedido cancelado/excluído no Conta Azul e bonificação também ficam de fora.

## Filtros e ordenação

- **Vencimento** — filtro de período no padrão do sistema (pílula com Hoje, Últimos 7 dias, Últimos 30 dias, Este mês, Este ano, Todo o período e Período personalizado). **Abre em "Todo o período" de propósito**: recortar por data esconderia a dívida velha, que é justamente a que precisa aparecer no fechamento. A escolha fica salva por usuário e volta ao reabrir a tela.
- **Ordenar por** — **Maior valor** (padrão), **Mais antigo** (quem tem o título mais velho na frente) ou **Nome**. Também fica salvo.
- **Atualizar** recarrega do servidor; **Expandir todos** / **Recolher todos** abrem e fecham todos os cards de uma vez.

No topo aparecem quatro números: **Saldo em aberto hoje**, **Responsáveis**, **Títulos** e a data do **Mais antigo** de todo o relatório.

> ⚠️ **O "Saldo em aberto hoje" NÃO é o mesmo número do "Total em aberto" da tela de Contas a
> Receber.** Aqui entra o que ainda **falta receber** de cada título (título com baixa parcial
> entra só pelo que sobrou); lá o indicador soma o **valor cheio** dos títulos pendentes e
> vencidos. Se houve qualquer baixa parcial, os dois divergem — e o número certo para o vale é
> o desta tela.
>
> **Títulos** conta **títulos diferentes**: parcela dividida entre duas pessoas conta 1, mesmo
> aparecendo nos dois cards.

## Os cards

Cada card é **uma pessoa**, com o selo **Vendedor** (azul), **Motorista** ou **Escritório** (âmbar), a quantidade de títulos, a data do mais antigo e o valor total à direita.

- **Vendedor e motorista são cards separados, mesmo sendo a mesma pessoa (19/08/2026).** O que o motorista assumiu ao fechar a entrega na rua vem no card **"Fulano (motorista)"**; o que o escritório pendurou no vendedor vem no card do vendedor. São dívidas de naturezas diferentes e nunca se somam num card só. Marcação feita **antes** dessa data continua no card de sempre (vendedor ou escritório), sem reclassificação.
- **O escritório é um balde só.** Não existe um card por pessoa do escritório: os pedidos foram lançados por gente diferente, então tudo cai num card "Escritório". O nome de quem lançou o pedido aparece na coluna **"Lançado por"** de cada título — é uma **pista de a quem perguntar, não a afirmação de que aquela pessoa é a responsável**.
- **Clique no card** para expandir e ver os títulos: cliente, pedido, vencimento, "Lançado por" (só no card do Escritório), dias de atraso (badge vermelho) e valor. No celular cada título vira um cartão em vez de linha de tabela.

## Os valores (leia com atenção)

- O valor mostrado é o **saldo em aberto HOJE** — é o que se cobra de fato.
- **Ninguém é cobrado por mais do que assumiu.** Se o pedido tem parte sem responsável (ex.:
  R$ 1.000 com "Dinheiro R$ 600" recebido na entrega, esperando a conferência do Caixa, mais
  "Vendedor responsável R$ 400"), o vale sai com **R$ 400**, não com os R$ 1.000 do título. Os
  R$ 600 em espécie não são cobrança de ninguém — são dinheiro que ainda vai ser conferido.
- Quando esse saldo for **diferente do que foi anotado na entrega** (porque houve baixa parcial ou devolução no meio do caminho), a tela mostra **os dois números**: "Anotado na entrega: R$ X — o saldo em aberto hoje é R$ Y". Se forem iguais, aparece só um.
- **Pedido parcelado:** cada linha é UMA parcela, e o "anotado na entrega" mostrado nela é a **parte daquela parcela** (o que foi anotado no pedido inteiro, dividido entre as parcelas na proporção do saldo de cada uma). Por isso um pedido parcelado sem baixa nenhuma **não** mostra os dois números — não há divergência. O total anotado no cabeçalho da pessoa é sempre a soma do que aparece nas linhas dela.
- **Título dividido entre dois responsáveis** (parte do vendedor, parte do escritório) aparece nos dois cards, cada um com a sua fatia, marcado como **"parte do título"**. Enquanto o saldo em aberto cobrir o que foi assumido, cada um aparece com exatamente a sua fatia; se já houve baixa parcial e o saldo ficou menor que a soma assumida, o que sobrou é dividido na proporção do que cada um assumiu, e as fatias fecham com o saldo do título centavo a centavo.
- **Aviso "Baixa parcial" (âmbar) na linha do título** — aparece quando aquela parcela já recebeu
  uma baixa parcial. O sistema **não guarda de quem era a dívida** na hora da baixa, então pode ser
  que a própria pessoa da linha já tenha pago a parte dela (ex.: o vendedor depositou antes da
  conferência do Caixa, ou num título dividido só um dos dois quitou). **Confira a quem pertence
  esse pagamento antes de descontar de alguém.** No cabeçalho da pessoa aparece o resumo
  "N título(s) com baixa parcial — conferir", para ver sem precisar expandir. Não confundir com o
  "anotado na entrega": aquele só compara o valor marcado com o saldo de hoje; este avisa que o
  responsável pelo que já foi pago é **desconhecido**. Os dois podem aparecer juntos na mesma linha.
- **Linha marcada para vendedor E escritório ao mesmo tempo** conta como do **vendedor** — mesma regra no relatório e no filtro de Contas a Receber.

## Imprimir

O botão **Imprimir** gera a folha **A4** com o cabeçalho, o período, os totais e, para cada responsável, a tabela dos títulos e uma **linha de assinatura ("Ciente / assinatura")** — é a folha que a pessoa assina ao receber o vale. Títulos divididos saem com `*` e a explicação no rodapé do grupo. Títulos com **baixa parcial** saem marcados com `‡ BAIXA PARCIAL` em negrito e fundo cinza (visível em preto e branco), com o aviso completo no rodapé do grupo e a contagem no cabeçalho da pessoa — assim quem assina a folha vê que aquele valor precisa ser conferido.

A impressão acontece **dentro do próprio app**, sem abrir aba nova (é o padrão do sistema, porque no iPad/PWA abrir aba tira o usuário do app). **No iPad, depois de imprimir ou cancelar, toque na tela uma vez para o app voltar ao normal.**

## Ligação com as outras telas

- **Contas a Receber** (`/financeiro/contas-receber/tabela`) — o link "Ver em Contas a Receber" no rodapé leva para a lista completa, onde dá para filtrar por responsável e **dar a baixa** quando o valor for descontado da pessoa. A baixa não acontece aqui: esta tela é só o levantamento.
- **Auditoria de Entregas** (`/admin/auditoria-entregas`) — é onde a marcação de responsável é corrigida (trocar de pessoa, tirar, ou passar do vendedor para o escritório).

## Quando a tela aparece vazia

"Nenhum título em aberto sob responsabilidade de alguém neste período" quer dizer uma destas coisas: ninguém está devendo nesse recorte, tudo já foi baixado, ou o período escolhido está apertado demais — volte para **Todo o período** antes de concluir que não há nada.
