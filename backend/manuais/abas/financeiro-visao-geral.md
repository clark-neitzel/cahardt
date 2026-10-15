# Financeiro — Visão Geral (Dashboard)

**Rota:** `/financeiro/dashboard` · **Permissão:** `Pode_Acessar_Financeiro_Gerencial` (ou admin)

Painel de abertura do financeiro: reúne numa tela só o essencial dos relatórios gerenciais (Fluxo de Caixa, Saldos por Conta, DRE, Margem por Produto e Conciliação Bancária), cada bloco com atalho para a tela completa.

## Cartões do topo (KPIs)

- **A receber em aberto** — total das parcelas de contas a receber não pagas; o rodapé mostra quanto disso já está **vencido**.
- **A pagar em aberto** — mesmo raciocínio para contas a pagar.
- **Resultado do mês** — lucro/prejuízo do mês corrente pela DRE (receita líquida − despesas), com a margem %.
- **Margem dos produtos** — margem bruta média dos produtos vendidos no mês (da tela Margem por Produto); avisa se há produtos sem custo.

Se houver **categorias de despesa sem classificação**, aparece um aviso âmbar logo abaixo dos cartões — clique leva à tela de Categorias de Despesa (o resultado do mês pode mudar após classificar).

## Blocos

1. **Próximos 30 dias (previsto)** — gráfico de barras diário: verde = contas a receber que vencem, vermelho = contas a pagar que vencem; no rodapé o **saldo previsto** do período. Atalho para o Fluxo de Caixa completo.
2. **Recebíveis por idade (inadimplência)** — as parcelas em aberto agrupadas por atraso: A vencer, 1–7, 8–30, 31–60 e mais de 60 dias, com valor e quantidade em cada faixa (barra verde → vermelha conforme envelhece) e o **total vencido**. Atalho para Contas a Receber.
3. **Movimento por conta (últimos 30 dias)** — entradas, saídas e resultado por banco/caixa (top 6 contas). Atalho para Saldos por Conta.
4. **Atenção do mês** — os **3 produtos com pior margem** no mês (vermelho = prejuízo) e o contador de **lançamentos pendentes de conciliação bancária**, com atalhos.

## Observações

- Tudo é calculado na hora, sem gravar nada — pode atualizar à vontade (botão no topo).
- Os números seguem as mesmas regras das telas de origem (ex.: bonificações fora da receita, baixas por conta, DRE por competência) — os valores batem entre as telas.

## Regra de inadimplência nos números (atualizada em 10/2026)

O **vencido** do rodapé de "A receber" e as faixas de **Recebíveis por idade** usam a mesma regra de inadimplência do app:

- **Boleto ou venda a prazo (ex.: "7 dias - Boleto", "7/14 dias") apontado na entrega NUNCA esconde a dívida.** Apontar o boleto na entrega não é pagamento: se vencer e ninguém pagar, o cliente aparece **em atraso** (selo vermelho) em todas as telas, com o mesmo valor.
- **Dinheiro, Pix, cartão e Pix Asaas apontados na entrega** cobrindo o saldo todo ficam **"em espera"** — o cliente já pagou, só falta o Caixa/Conciliação confirmar; não é devedor. Se **passar de 7 dias** sem ninguém confirmar, vira **"a confirmar"** (selo **amarelo**): é uma **pendência do escritório**, **não bloqueia venda**, mas não fica escondida para sempre. Pagou só uma parte? O saldo todo continua como dívida.
- **Pedido especial** só conta como dívida **depois de entregue**; antes disso não aparece como atraso.
- **Compra de funcionário** (ex.: "À vista - Funcionário") fica **fora** da inadimplência.
- **Tolerância de R$ 1,00:** saldo de até R$ 1,00 (por parcela ou somando a conta) não é dívida — "devendo R$ 0,10" não vira selo nem cobrança.
- **O selo vermelho aparece desde o 1º dia de atraso.** Já a **trava da venda a prazo** só vale com **3 dias de carência** (a partir do 3º dia de atraso) **e** pelo menos **R$ 50,00** em atraso — atraso menor aparece mas não trava. Os 3 dias e os R$ 50 são ajustáveis.
- **Quem tem a permissão `Pode_Vender_Inadimplente` (ou é admin)** libera a venda e fica registrado como **responsável** na observação do pedido ("se responsabiliza pela venda"). Quem não tem só consegue vender **à vista** (também fica como responsável). Especial e bonificação não são barrados ao criar.
- **Onde ajustar:** só o administrador ajusta essas regras (carência, valor mínimo, prazo do "a confirmar", funcionário fora, aviso ao motorista), e fica registrado quem mudou e quando. O administrador ajusta em Configurações › card "Venda a inadimplente", com registro de quem mudou e quando.
- A mesma regra alimenta o selo da lista de Clientes, a ficha/popup, a trava de venda, a Régua de Cobrança e a Cobrança em Rota.
- Os dashboards e o aging usam a mesma regra de classificação, mas somam todos os títulos vencidos (inclusive de pedidos excluídos/cancelados e sem a tolerância de R$ 1), por isso o total deles pode ser maior que a soma dos selos por cliente.
