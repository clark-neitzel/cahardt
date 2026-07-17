# Margem & Custo dos Produtos

**Rota:** `/financeiro/margem-produtos` · **Permissão:** `Pode_Acessar_Financeiro_Gerencial` (ou admin)

Tela para acompanhar a **rentabilidade de cada produto** — custo, preço, markup, margem —, com foco em **produção própria** (os que têm ficha técnica no PCP). Mostra também **como o custo variou ao longo do tempo** e a **composição do custo** (quais ingredientes mais pesam). Responde: "esse produto ainda dá a margem que eu quero? o custo dele está subindo?".

## O que a tela mostra

### Filtros (no topo)
- **Categoria** (menu com busca) — padrão **Produto Acabado**.
- **Período** — últimos 3, 6 ou 12 meses (define a janela da variação de custo).
- **Produção própria / Revenda / Todos** — porque o custo de um vem da ficha técnica e do outro da compra.

### Cartões (KPIs)
- **Margem média** e **Markup médio** (preço ÷ custo) dos produtos filtrados.
- **Produção própria** — quantos têm ficha técnica.
- **Sem custo cadastrado** — não entram na margem (precisam de custo).
- **Margem em queda** — produtos cujo custo subiu no período.

### Tabela (no celular vira cards)
Colunas: Produto, **Origem** (própria/revenda/sem custo), **Custo unitário**, **Preço**, **Markup**, **Margem %** e **tendência do custo** (mini-linha dos últimos meses). A Margem % é colorida: verde ≥ 50%, amarelo 35–49%, vermelho abaixo de 35%. A tendência fica **vermelha quando o custo sobe** e verde quando cai.

### Detalhe do produto (toque na linha)
Abre no lugar, com:
- **Gráfico preço praticado × custo** mês a mês — mostra na hora quando a margem está sendo espremida.
- **Composição do custo** — os ingredientes que mais pesam, em R$ e %, vindos da ficha técnica ativa do PCP (só produção própria).
- Alerta automático ("o custo subiu X%, a margem caiu Y pontos").

### Destaques (embaixo)
- **Margem espremida** — custo subindo e preço parado.
- **Custo que mais subiu no período**.

## De onde vem cada número

- **Custo unitário**, por prioridade:
  1. **Ficha técnica** (produção própria) — custo por unidade da receita ativa do item no PCP; acompanha as compras de insumo sozinho.
  2. **Compras** (revenda) — média das notas de entrada do produto.
  3. **Conta Azul** — custo médio sincronizado do CA.
  4. **Sem custo** — nenhuma fonte; fica fora da margem, marcado para cadastrar.
- **Margem = (preço − custo) ÷ preço** · **Markup = preço ÷ custo**. Preço = preço de venda do cadastro.
- **Preço praticado por mês** (no gráfico) vem das vendas reais (FATURADO ou especial, sem bonificação).

## Variação de custo no tempo (importante)

O sistema grava um **retrato do custo de cada produto todo mês**. Os meses **anteriores** ao início da captura aparecem com o custo atual (estimado) — a partir de agora, cada mês guarda o **custo real**, e o gráfico se enche sozinho com o tempo. O preço praticado do passado já é real desde o início.

## Como melhorar um produto "Sem custo"
- **Produzido**: criar/ativar a receita dele em **PCP → Receitas** (com os insumos custeados).
- **Revendido**: dar entrada de nota de compra vinculando o item ao produto, ou preencher o custo no cadastro.
