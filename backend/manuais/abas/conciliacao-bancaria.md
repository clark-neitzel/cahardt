# Conciliação Bancária

**Rota:** `/financeiro/conciliacao` · **Permissão:** `Pode_Acessar_Financeiro_Gerencial` (ou admin)

Confere o **extrato do banco** contra o que o app registrou: cada entrada/saída do extrato deve ter uma baixa correspondente no app (contas a receber ou a pagar). É o que transforma o saldo de "fé" em fato conferido.

## Fluxo de uso

1. **Exportar o extrato do banco em OFX** — todo internet banking tem essa opção (às vezes chamada "Money/OFX" ou "Extensão .ofx"), geralmente em Extrato → Exportar/Salvar como.
2. Na tela, **escolher o banco/caixa** (menu no topo — mesmas contas do Conta Azul usadas nas baixas) e clicar **Importar OFX**.
   - Importar o mesmo arquivo (ou períodos sobrepostos) de novo **não duplica**: cada lançamento do banco tem uma identidade (FITID) e só entra uma vez.
3. Clicar **"Conciliar automático"** — o sistema fecha sozinho todo lançamento que tem **exatamente uma** baixa do app com o mesmo valor (±R$ 0,01) e data próxima (±3 dias) na mesma conta.
4. Revisar os **pendentes** restantes:
   - Se houver sugestões, escolher a certa (quando há mais de uma, aparece um menu) e clicar **Conciliar**.
   - **Um PIX que pagou várias notas** (ou o contrário): clicar **"Várias…"** — abre o modal de **conciliação em grupo**, onde se marca os lançamentos do extrato de um lado e as baixas do app do outro; o rodapé mostra a soma dos dois lados ao vivo e o botão só libera quando **a soma bate** (±R$ 0,01). Funciona nos dois sentidos: 1 PIX ↔ 3 baixas, 2 PIX ↔ 1 baixa etc.
   - Se for tarifa bancária, transferência entre contas etc. (coisas que não são baixa de conta), clicar **Ignorar** (pede o motivo).
5. **Desfazer** (ícone de seta) volta qualquer conciliado/ignorado para pendente. Em um lançamento conciliado **em grupo**, o desfazer **dissolve o grupo inteiro** (todos os lançamentos do grupo voltam a pendente e as baixas ficam livres).

## O que a tela mostra

- **KPIs**: Pendentes (com valor a conferir), Conciliados (valor batido), Ignorados, e **"Só no app"** — baixas registradas no app nesta conta que não bateram com nenhum lançamento do extrato.
- **Filtros**: conta (obrigatório), período (chips: este mês, 30/60/90 dias) e status.
- **Lista do extrato**: data, descrição do banco, valor (verde = entrou, vermelho = saiu), status (Pendente amarelo / Conciliado verde / Ignorado cinza) e a coluna de conciliação com as sugestões. Conciliação automática aparece com 🪄.
- **Card "Baixas do app sem par no extrato"** (expansível): lista as baixas órfãs — pode ser data/valor errado na baixa, conta errada escolhida na hora da baixa, ou extrato ainda não importado daquele período.

## Regras do matching (como o sistema sugere)

- Mesma conta financeira da baixa (`contaFinanceiraCaId` — por isso é importante escolher o banco certo na hora de dar baixa).
- Entrada do extrato (crédito) ↔ recebimento de contas a receber; saída (débito) ↔ pagamento de contas a pagar (o valor comparado inclui juros/multa quando houve).
- Valor igual (tolerância de R$ 0,01) e data até 3 dias de diferença.
- Uma baixa do app só concilia com **um** lançamento do extrato (e vice-versa).

## Situações comuns

- **Lançamento sem sugestão**: a baixa pode ter sido registrada em outra conta, com outro valor (desconto/juros), fora da janela de 3 dias — ou nem foi registrada. Registre a baixa no módulo certo e clique em Atualizar.
- **Vários pagamentos num PIX só** (um lançamento no banco, várias baixas no app): usar **"Várias…"** (conciliação em grupo) e marcar todas as baixas que o PIX cobriu — a soma precisa bater.
- **PIX que pagou só parte de uma nota**: primeiro registre a **baixa parcial** com esse valor em Contas a Receber/Pagar; depois concilie normal (1↔1 ou dentro de um grupo). A conciliação nunca "divide" uma baixa — ela espelha o que foi registrado.
- **Um pagamento feito em 2 PIX**: no modal de grupo dá para marcar os **dois lançamentos do extrato** e a baixa única do app.
- **Tarifas e rendimentos**: não são contas a pagar/receber do app — marcar como Ignorado (o motivo fica registrado).
