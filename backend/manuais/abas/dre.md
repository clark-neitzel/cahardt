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
| (−) Blocos de despesa | **Contas a Pagar** por competência (data da nota; sem ela, o 1º vencimento), agrupadas nos **blocos da DRE** (Impostos sobre vendas, Custos variáveis, Pessoal, Veículos e entregas, Administrativas, Financeiras, Sócios — e os que o usuário criar). Cada bloco mostra o **subtotal** e **abre ao clicar**, revelando as categorias (ordenadas da maior para a menor, com etiqueta **V**=variável, **F**=fixa, **?**=sem definição). O rateio da nota divide sozinho quando a nota tem mais de uma categoria |
| (−) Sem bloco | Categorias que entram na DRE mas ainda **sem bloco definido** (fundo âmbar) — classificar em Categorias de Despesa |
| = Total de despesas | Soma dos blocos (só o que **entra na DRE**) |
| = Resultado | Receita líquida − despesas (verde = lucro, vermelho = prejuízo) |
| Margem | Resultado ÷ receita líquida |
| Fora da DRE (não é resultado) | Linha **informativa** (cinza, itálico) com o que saiu do caixa mas **não é despesa de resultado**: retirada de lucros, empréstimos, compra de bens. Não entra no resultado |

## Quadro Fixo × Variável — Margem de Contribuição

Abaixo da matriz principal (desktop) há um segundo quadro que separa as despesas pela **natureza** definida em Categorias de Despesa:

| Linha | Significado |
|-------|-------------|
| Receita líquida | Mesma da matriz principal |
| (−) Despesas variáveis | Tudo marcado como **Variável** (cresce junto com a venda: matéria-prima, embalagem, comissão, frete...) |
| = Margem de contribuição | O que sobra da venda para pagar a estrutura (+ linha com o **% da receita**) |
| (−) Despesas fixas | Tudo marcado como **Fixa** (custo de existir: salários, contador, aluguel...) |
| (−) Sem definição | Categorias ainda sem fixa/variável (aparece só se houver) |
| = Resultado | Igual ao da matriz principal |

No celular, a linha **Margem de contribuição** aparece dentro do cartão do mês. No topo da tela há um KPI dedicado à margem de contribuição do período.

## Blocos e classificação das categorias

Cada categoria de despesa tem **bloco** e **natureza (fixa/variável)**, definidos na tela **[Categorias de Despesa](categorias-despesa.md)** (botão **"Blocos e categorias"** no topo da DRE):

- Categorias com bloco → aparecem agrupadas com subtotal, na **ordem dos blocos** definida lá.
- **Fora da DRE** (retirada de lucros, empréstimos, compra de veículos/móveis/computadores) → **não** entra no resultado; aparece só na linha informativa "Fora da DRE".
- Categoria **sem bloco ou sem fixa/variável** → conta na DRE (grupo "Sem bloco" / linha "Sem definição") e a tela mostra um **aviso** com link para classificar.

Isso evita que a DRE mostre "prejuízo" falso por causa de retiradas de lucro ou parcelas de empréstimo contadas como despesa.

## O que dá pra fazer aqui

- Escolher o período: **ano atual**, **últimos 12 meses** ou **ano passado**
- Ver os 4 indicadores do período: receita líquida, **margem de contribuição**, resultado e margem
- **Clicar num bloco** para abrir/fechar as categorias dele (desktop e celular)
- Ir direto para **Categorias de Despesa** pelo botão "Blocos e categorias" no topo
- **Desktop**: matriz completa mês a mês + coluna Total + quadro Fixo × Variável
- **Celular**: um mês por vez, escolhido pelos chips (blocos expansíveis por toque)

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
