# Margem por Produto

**Rota:** `/financeiro/margem-produtos` · **Permissão:** `Pode_Acessar_Financeiro_Gerencial` (ou admin)

Relatório gerencial que responde **"qual produto dá dinheiro e qual dá prejuízo"**: cruza o que foi vendido no período (quantidade e receita) com o custo de produção/compra de cada produto, mostrando a margem em R$ e em %.

## O que a tela mostra

### Chips de período
Este mês · Últimos 30 dias · Últimos 90 dias · Este ano. Trocar o chip recarrega o relatório.

### Cartões (KPIs)
- **Receita no período** — soma das vendas de todos os produtos listados
- **Custo dos vendidos** — custo unitário × quantidade vendida, somando só os produtos com custo conhecido
- **Margem bruta** — receita − custo (dos produtos com custo conhecido)
- **Margem %** — margem ÷ receita; o rodapé avisa quantos produtos estão **sem custo**

### Filtros
- **Busca** por nome do produto
- **Categoria** (menu com busca)

### Tabela (no celular vira cards)
Colunas: Produto, Qtd vendida, Receita, Preço médio praticado, Custo unitário, **Fonte do custo**, Margem R$ e Margem %. Clique no título da coluna para ordenar. A Margem % é colorida: **vermelho** = negativa (prejuízo), **âmbar** = abaixo de 15%, **verde** = saudável.

### Botão Exportar CSV
Baixa a tabela filtrada (desktop).

## De onde vem cada número

- **Vendas**: pedidos com venda no período (mesma regra da DRE — exclui bonificações e considera pedidos faturados no Conta Azul ou especiais). Devoluções **não** são descontadas por produto.
- **Custo unitário**, por prioridade:
  1. **Ficha técnica** (badge verde) — custo por unidade da receita ativa do item no PCP. Como as notas de compra atualizam o custo dos insumos automaticamente, esse custo acompanha a realidade sozinho.
  2. **Compras** (badge azul) — média ponderada das notas de entrada do produto (produto revendido, sem receita).
  3. **Conta Azul** (badge cinza) — custo médio sincronizado do CA.
  4. **Sem custo** (badge âmbar) — nenhuma fonte disponível; o produto aparece na receita, mas fica fora dos totais de custo/margem.

## Como melhorar um produto "Sem custo"
- Se ele é **produzido**: criar/ativar a receita dele em **PCP → Receitas** (e garantir que os insumos têm custo).
- Se ele é **revendido**: dar entrada de uma nota de compra vinculando o item ao produto (Notas Recebidas), ou preencher o custo no cadastro do produto.

## Dicas de leitura
- Margem % **negativa** = o produto é vendido abaixo do custo — revisar preço ou receita.
- Preço médio praticado menor que o preço de tabela indica desconto/Flex frequente naquele produto.
