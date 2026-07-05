---
aba: DRE — Resultado
rota: /financeiro/dre
permissao: Pode_Acessar_Financeiro_Gerencial
---

# DRE — Demonstração de Resultado

## O que é

A **demonstração de resultado** mês a mês: faturamento − custos e despesas por categoria = **resultado (lucro/prejuízo)** e **margem %**. Usa regime de **competência** (mês em que a venda/despesa aconteceu, não em que foi paga — para caixa, use o Fluxo de Caixa).

## Como é montada (linha a linha)

| Linha | Fonte |
|-------|-------|
| Vendas faturadas | Pedidos **FATURADOS** no Conta Azul (soma dos itens, sem bonificação) — mesma regra do Dashboard |
| Vendas especiais (sem NF) | Pedidos **especiais** (que não vão ao CA), sem bonificação |
| (−) Devoluções | Devoluções **ativas** pela data da devolução |
| = Receita líquida | Soma das linhas acima |
| Categorias de despesa | **Contas a Pagar** por competência (data da nota; sem ela, o 1º vencimento), separadas pelas **categorias do Conta Azul** — o rateio da nota divide sozinho quando a nota tem mais de uma categoria. Ordenadas da maior para a menor |
| = Total de despesas | Soma das categorias |
| = Resultado | Receita líquida − despesas (verde = lucro, vermelho = prejuízo) |
| Margem | Resultado ÷ receita líquida |

## O que dá pra fazer aqui

- Escolher o período: **ano atual**, **últimos 12 meses** ou **ano passado**
- Ver os 4 indicadores do período: receita líquida, despesas, resultado e margem
- **Desktop**: matriz completa mês a mês + coluna Total (rola de lado se precisar)
- **Celular**: um mês por vez, escolhido pelos chips

## Limitações honestas (importante ao interpretar)

- Despesa que **não está no app** (lançada só no Conta Azul e nunca importada) **não aparece** — quanto mais contas entrarem pelo app (notas capturadas, despesas manuais), mais completa a DRE
- Despesa sem categoria aparece como **"Sem categoria"** — vale voltar na conta e classificar
- Impostos sobre venda não são destacados em linha própria (entram como categoria de despesa, se lançados)

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Financeiro_Gerencial` | Ver DRE e Fluxo de Caixa |
| `admin` | Sempre vê |

## Depende de / Interfere em

- **Pedidos** (faturamento) e **Devoluções** — receita
- **Contas a Pagar** (com categorias/rateio do Conta Azul) — despesas
- **Fluxo de Caixa** — visão complementar (caixa, não competência)

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/services/financeiroGerencialService.js` | Consultas e montagem da matriz (funções puras) |
| `backend/routes/financeiroGerencial.js` | Rota GET /dre |
| `frontend/src/pages/Financeiro/DrePage.jsx` | Tela |
