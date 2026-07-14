# Conciliação Bancária

**Rota:** `/financeiro/conciliacao` · **Permissão:** `Pode_Acessar_Financeiro_Gerencial` (ou admin)

Confere o **extrato do banco** contra o que o app registrou: cada entrada/saída do extrato deve ter uma baixa correspondente no app (contas a receber ou a pagar). É o que transforma o saldo de "fé" em fato conferido.

> **O botão "Conciliar" não dá baixa em nada** — ele apenas *amarra* a linha do extrato a uma baixa **que já existe** no app ("confere, bateu"). Para uma **saída** que ainda não tem baixa, a tela tem dois botões que resolvem sem sair daqui:
> - **"Dar baixa…"** — a conta a pagar **já está lançada e em aberto**: baixa ela (no app e no Conta Azul) e concilia de uma vez.
> - **"Criar despesa"** — a despesa **nunca foi lançada**: cadastra já paga e concilia em seguida.
>
> Do lado das **entradas** (contas a receber), a conciliação **nunca** dá baixa: recebimento de cliente continua sendo baixado no Contas a Receber / "Baixa CA" do Caixa (evita baixa em dobro no CA).

## Fluxo de uso

1. **Exportar o extrato do banco em OFX** — todo internet banking tem essa opção (às vezes chamada "Money/OFX" ou "Extensão .ofx"), geralmente em Extrato → Exportar/Salvar como.
2. Na tela, **escolher o banco/caixa** (menu no topo — mesmas contas do Conta Azul usadas nas baixas) e clicar **Importar OFX**.
   - Importar o mesmo arquivo (ou períodos sobrepostos) de novo **não duplica**: cada lançamento do banco tem uma identidade (FITID) e só entra uma vez.
3. Clicar **"Conciliar automático"** — o sistema fecha sozinho todo lançamento que tem **exatamente uma** baixa do app com o mesmo valor (±R$ 0,01) e data próxima (±3 dias) na mesma conta.
4. Revisar os **pendentes** restantes:
   - Se houver sugestões, escolher a certa (quando há mais de uma, aparece um menu) e clicar **Conciliar**.
   - **Saída sem baixa no app** (o boleto foi pago no banco, mas ninguém lançou a despesa): clicar **"Criar despesa"** — ver a seção abaixo.
   - **Um PIX que pagou várias notas** (ou o contrário): clicar **"Várias…"** — abre o modal de **conciliação em grupo**, onde se marca os lançamentos do extrato de um lado e as baixas do app do outro; o rodapé mostra a soma dos dois lados ao vivo e o botão só libera quando **a soma bate** (±R$ 0,01). Funciona nos dois sentidos: 1 PIX ↔ 3 baixas, 2 PIX ↔ 1 baixa etc.
   - Se for tarifa bancária, transferência entre contas etc. (coisas que não são baixa de conta), clicar **Ignorar** (pede o motivo).
5. **Desfazer** (ícone de seta) volta qualquer conciliado/ignorado para pendente. Em um lançamento conciliado **em grupo**, o desfazer **dissolve o grupo inteiro** (todos os lançamentos do grupo voltam a pendente e as baixas ficam livres).

## O que a tela mostra

- **KPIs**: Pendentes (com valor a conferir), Conciliados (valor batido), Ignorados, e **"Só no app"** — baixas registradas no app nesta conta que não bateram com nenhum lançamento do extrato.
- **Filtros**: conta (obrigatório), período (chips: este mês, 30/60/90 dias) e status.
- **Lista do extrato**: data, descrição do banco, valor (verde = entrou, vermelho = saiu), status (Pendente amarelo / Conciliado verde / Ignorado cinza) e a coluna de conciliação com as sugestões. Conciliação automática aparece com 🪄.
- **"De quem é esse lançamento?"** — abaixo da descrição a tela mostra tudo o que dá para saber:
  - **Beneficiário e nº do documento**, quando o arquivo do banco traz (nem todo banco traz).
  - **CNPJ/CPF achado no texto** (comum no PIX: "Pagamento Pix 02.118.562 0001-60") **cruzado com o cadastro de fornecedores** → aparece o nome da empresa. Se o documento não estiver cadastrado, mostra o número mesmo.
  - **"Mesmo valor de: FORNECEDOR (vence dd/mm)"** — contas a pagar **em aberto** com o valor exato da saída. É a pista para o caso do boleto: "DÉB.TIT.COMPE EFETIVADO" é o texto padrão do banco para *boleto pago por compensação* e **não diz quem recebeu** — nenhum sistema consegue extrair o beneficiário se o banco não mandou. O que bate é o valor.
- Reimportar o extrato **atualiza a descrição** das linhas já existentes (sem duplicar e sem desfazer conciliação).
- **Card "Baixas do app sem par no extrato"** (expansível): lista as baixas órfãs — pode ser data/valor errado na baixa, conta errada escolhida na hora da baixa, ou extrato ainda não importado daquele período.

## Botão "Dar baixa…" (a conta está lançada, mas em aberto)

Aparece nas **saídas pendentes**. É o caso "o boleto está no app, foi pago pelo banco, mas ninguém deu baixa". Abre a lista das **contas a pagar em aberto** — as que fecham **exatamente com o valor do extrato** vêm primeiro, com a etiqueta verde **"valor bate"** — e tem busca por fornecedor, descrição ou nº da nota.

Escolhida a conta, informa-se a forma de pagamento e, se houver, **juros/multa** (o extrato traz o total que saiu; o sistema separa) ou **desconto**. O rodapé avisa antes de confirmar se a baixa **quita** a parcela ou fica **parcial** (e quanto sobra).

Ao confirmar: a baixa é criada com a **data e o banco do próprio extrato**, entra na fila de envio ao Conta Azul (igual ao botão "Baixar" do Contas a Pagar) e o lançamento **já fica conciliado** — não precisa clicar em "Conciliar" depois.

**Exceção:** despesa **importada do CA** (que não foi criada pelo app) não tem para onde empurrar a baixa — ela fica **só no app**, e a tela avisa isso na linha e no rodapé antes de confirmar.

**Entradas (crédito) não têm esse botão**: a baixa de recebimento continua no Contas a Receber / "Baixa CA" do Caixa, para não baixar duas vezes o mesmo dinheiro no Conta Azul.

## Botão "Criar despesa" (saída do extrato sem despesa lançada)

Aparece nas linhas de **saída (débito) pendentes** — é a ação principal quando a linha diz "Sem baixa parecida no app". Serve para o caso mais comum dos pendentes: o boleto foi pago pelo banco, mas a despesa nunca foi lançada no sistema, então **não existe baixa nenhuma para conciliar**.

O pop-up já vem preenchido com o que o banco mandou (data, valor, beneficiário quando disponível, nº do documento) e pede:

- **Fornecedor** (obrigatório — dá para escolher um já cadastrado ou cadastrar um novo na hora, digitando o nome).
- **Descrição** (obrigatória), **categoria da DRE**, **forma de pagamento** (obrigatória), **vencimento do boleto** e **nº da nota/documento**.
- **Juros e multa** (opcionais): o extrato traz o **total que saiu do banco**. Informando juros/multa, o sistema separa: valor da despesa = total − juros − multa, e os juros/multa entram nos campos próprios da baixa. O rodapé do pop-up mostra a conta fechando ao vivo.

Ao salvar, a despesa é criada **já paga**, com a data e o banco do próprio lançamento do extrato, e entra na fila de envio ao **Conta Azul** (a despesa e depois a baixa). O pop-up fecha, a tela continua na conciliação e a linha volta com a baixa recém-criada como sugestão — **é só clicar em "Conciliar"**.

**Não** aparece em entradas (crédito): recebimento de cliente deve ser registrado no Contas a Receber.

## Regras do matching (como o sistema sugere)

- Mesma conta financeira da baixa (`contaFinanceiraCaId` — por isso é importante escolher o banco certo na hora de dar baixa).
- Entrada do extrato (crédito) ↔ recebimento de contas a receber; saída (débito) ↔ pagamento de contas a pagar (o valor comparado inclui juros/multa quando houve).
- Valor igual (tolerância de R$ 0,01) e data até 3 dias de diferença.
- Uma baixa do app só concilia com **um** lançamento do extrato (e vice-versa).

## Situações comuns

- **Lançamento sem sugestão**: a baixa pode ter sido registrada em outra conta, com outro valor (desconto/juros), fora da janela de 3 dias — ou nem foi registrada. Se for uma **saída** que nunca foi lançada, use **"Criar despesa"** ali mesmo. Nos demais casos, corrija/registre a baixa no módulo certo e clique em Atualizar.
- **Boleto pago com juros**: o extrato mostra o **total** que saiu (boleto + juros + multa). O matching já soma juros e multa da baixa, então concilia normal — **desde que a baixa tenha sido registrada com os juros**. Se a baixa foi lançada só com o valor do boleto, os valores não batem e a linha fica sem sugestão: estorne e refaça a baixa com juros/multa (ou lance pelo "Criar despesa", que tem os campos).
- **Vários pagamentos num PIX só** (um lançamento no banco, várias baixas no app): usar **"Várias…"** (conciliação em grupo) e marcar todas as baixas que o PIX cobriu — a soma precisa bater.
- **PIX que pagou só parte de uma nota**: primeiro registre a **baixa parcial** com esse valor em Contas a Receber/Pagar; depois concilie normal (1↔1 ou dentro de um grupo). A conciliação nunca "divide" uma baixa — ela espelha o que foi registrado.
- **Um pagamento feito em 2 PIX**: no modal de grupo dá para marcar os **dois lançamentos do extrato** e a baixa única do app.
- **Tarifas e rendimentos**: não são contas a pagar/receber do app — marcar como Ignorado (o motivo fica registrado).
