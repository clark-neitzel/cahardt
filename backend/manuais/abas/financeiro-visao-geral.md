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
