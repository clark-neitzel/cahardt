# Conciliação Bancária

**Rota:** `/financeiro/conciliacao` · **Permissão:** `Pode_Acessar_Financeiro_Gerencial` (ou admin)

Confere o **extrato do banco** contra o que o app registrou: cada entrada/saída do extrato deve ter uma baixa correspondente no app (contas a receber ou a pagar). É o que transforma o saldo de "fé" em fato conferido.

> **Conciliar não dá baixa em nada.** Conciliar apenas *amarra* a linha do extrato a uma baixa **que já existe** no app — é um "confere, bateu". Não paga parcela, não cria despesa e não manda nada para o Conta Azul. Quem dá baixa é o Contas a Pagar/Receber (ou, para uma saída sem despesa lançada, o botão **"Criar despesa"** desta tela — ver abaixo).

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
- **Detalhes do banco**: abaixo da descrição aparece o **beneficiário** e o **nº do documento**, quando o arquivo do banco trouxer. Descrições como "DÉB.TIT.COMPE EFETIVADO" são o texto padrão do banco para *boleto pago por compensação* e não dizem quem recebeu — quando o beneficiário não vem no arquivo, a única forma de saber do que se trata é pelo lançamento no app (valor + data). Reimportar o extrato **atualiza a descrição** das linhas já existentes (sem duplicar e sem desfazer conciliação).
- **Card "Baixas do app sem par no extrato"** (expansível): lista as baixas órfãs — pode ser data/valor errado na baixa, conta errada escolhida na hora da baixa, ou extrato ainda não importado daquele período.

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
