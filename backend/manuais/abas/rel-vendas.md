---
aba: Relatório de Vendas
rota: /relatorios/vendas
permissao: pedidos (view) — vendedor vê os próprios; admin vê todos
---

# Relatório de Vendas

## O que é

Relatório analítico de itens vendidos (não de pedidos, mas de linhas de produto). Cada linha representa um produto de um pedido, permitindo análise granular por produto, cidade, bairro, cliente, vendedor e condição de pagamento. Funciona como uma planilha: as colunas podem ser reordenadas, ocultadas e filtradas por valor (estilo Excel).

---

## O que dá pra fazer aqui

- Filtrar por **período da venda** e **período da criação** com o seletor de período em pílula (Hoje, Últimos 7/30 dias, Este mês, Este ano, Todo o período, Período personalizado; setas ‹ › pulam o período). Padrão: venda = todo o período, criação = este mês. O app lembra o tipo de período escolhido (não a data)
- Filtros em **múltipla escolha**: Cidade, Condição de pagamento, Categoria comercial e Tipo de pedido (Normal/Especial/Bonificação). Mais Vendedor, Situação e Bonificações (menus de escolha única)
- O menu de vendedor traz **também os vendedores inativos** (quem saiu da empresa), no fim da lista e marcados "(inativo)" — é assim que se levanta o que um ex-vendedor vendeu
- O relatório **atualiza sozinho** ao mudar qualquer filtro (e ao abrir a tela); o botão **Gerar** serve para recarregar. As opções dos menus já vêm preenchidas, sem precisar gerar antes
- Um selo **"N filtros ativos"** e o botão **Limpar** ficam no topo da barra de filtros; abaixo dela, **chips** mostram cada filtro aplicado (com X para tirar um por um). Os filtros escolhidos ficam salvos por usuário
- Cliente, produto, bairro e indicação se filtram pelo **funil no cabeçalho da coluna** (estilo Excel)
- O cartão **Total geral** mostra o número de pedidos, o valor e o **Ticket médio (por pedido)** (valor ÷ pedidos); o cartão **Média por item** mostra valor ÷ itens
- Ordenar qualquer coluna clicando no cabeçalho
- Filtrar por valor de coluna (dropdown estilo Excel) — clicando no ícone de filtro em cada coluna (Condição e Categoria também têm funil de coluna, que age só sobre o que já está na tela — separado dos filtros em múltipla escolha da barra de cima)
- Mostrar/ocultar colunas individualmente
- Reordenar colunas arrastando-as
- Agrupamento automático quando colunas de dimensão são ocultadas (ex: ocultar "Produto" soma quantidades)
- Ver o **preço de custo (Vl Custo)** e o **Custo Total** de cada produto — usa **exatamente o mesmo cálculo da tela da receita no PCP** (o "Custo por unidade"). O custo das matérias-primas vem do **custo médio do Conta Azul** (ou custo manual do produto), os **subprodutos (SUB)** são calculados pela própria receita de forma recursiva, e a **perda %** é aplicada (rendimento líquido = rendimento × (1 − perda%)). No modo agrupado, o **Vl Custo** mostra o custo por unidade do grupo (Custo Total ÷ quantidade). Produtos sem receita no PCP (ou com matérias-primas sem custo cadastrado) aparecem com "-"
- **Vl Unit = valor vendido ÷ quantidade** (no resumo agrupado é a média ponderada); **Vl Custo vem do custo da receita no PCP**. O rodapé da tabela e da impressão mostra o Vl Unit total (total vendido ÷ quantidade total) e o Vl Custo médio.
- Ver totais no rodapé: quantidade total, valor total, custo total
- Imprimir o relatório em formato A4 (fonte monoespaciada, compacto) — imprime direto na própria tela, sem abrir outra janela. A folha sai em **A4 paisagem** para caber todas as colunas (a letra é pequena de propósito)
- **No celular** o resultado aparece em **cartões** (um por linha) em vez de tabela; ordenar e filtrar por coluna ficam no computador/iPad. Aparecem 100 cartões por vez — toque em **Mostrar mais** para ver +100
- Exportar para CSV

---

## Como fazer (passo a passo real)

### Gerar o relatório
1. Abra a aba Relatório de Vendas — ela já carrega com os últimos filtros usados
2. Ajuste os períodos e os filtros (cidade, condição, categoria, tipo, vendedor, situação)
3. O relatório atualiza sozinho; se quiser recarregar, toque em **Gerar**
4. Aparecem os cartões de resumo, as colunas e a tabela (cartões no celular)

### Quando não aparece nada
- A tela mostra "Nenhuma venda encontrada" com o botão **Ver todo o período** (quando o período de criação não é "todo") ou **Limpar filtros**
- Se der erro ao gerar, a tela esvazia e mostra aviso com **Tentar de novo** — nunca fica mostrando dados antigos junto de filtros novos

### Limpar os filtros
- Toque em **Limpar** na barra de filtros, ou no X de um chip para tirar só aquele filtro

### Filtrar por valor de coluna (estilo Excel)
1. Clique no ícone de funil na coluna desejada (ex: "Cidade")
2. O dropdown lista todos os valores únicos daquela coluna
3. Marque/desmarque os valores que quer ver
4. Clique **OK** para aplicar (ou fora para cancelar sem aplicar)

### Ocultar uma coluna
- No cartão **Colunas**, toque na pílula da coluna para ocultar/mostrar (arraste para reordenar no computador)
- As colunas numéricas (Qtd, Valor) são agregadas automaticamente quando dimensões são ocultadas

### Imprimir
- Clique no botão **Imprimir** (só aparece com dados) — abre direto a impressão do aparelho

---

## Colunas disponíveis

| Coluna | Tipo | Filtrável |
|--------|------|-----------|
| Criação | Data | Não |
| Dt Venda | Data | Não |
| Cliente | Texto | Sim |
| Produto | Texto | Sim |
| Qtd | Número | Não |
| Vl Unit | Número | Não |
| Valor | Número | Não |
| Vl Custo | Número | Não |
| Custo Total | Número | Não |
| Condição | Texto | Sim |
| Categoria | Texto | Sim |
| Tipo | Texto | Sim |
| Cidade | Texto | Sim |
| Bairro | Texto | Sim |
| Vendedor | Texto | Sim |
| Tel Vendedor | Texto | Não |
| Indicação | Texto | Sim |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `pedidos` (view) | Acessa o relatório |
| `pedidos.clientes = "todos"` ou `admin` | Pode filtrar por vendedor |

---

## Depende de / Interfere em

- **Pedidos** — os dados vêm dos itens de pedido; somente leitura
- **Conta Azul** — o filtro "Situação CA" usa os dados sincronizados (padrão: FATURADO)
- **PCP (Receitas)** — as colunas Vl Custo / Custo Total usam a receita ativa do produto no PCP; só aparecem se o produto tiver receita com ingredientes que tenham custo unitário preenchido

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Relatorios/RelatorioVendas.jsx` | Componente completo com tabela, filtros por coluna, impressão e CSV |
| `backend/src/routes/pedidos.js` | Rota `GET /pedidos/relatorio-vendas` |

## Filtros no servidor e menus (atualização)
- O relatório aceita filtro por **cliente, cidade, tipo (Normal/Especial/Bonificação), condição de pagamento e categoria**, cada um com várias opções ao mesmo tempo. O filtro é aplicado no servidor, então os totais, o ticket médio por pedido e a média por item já refletem a seleção.
- Cidade ignora maiúsculas/acentos. Filtrar por categoria mostra só os itens daquela categoria (e só os pedidos que têm algum).
- Os menus de cidade, condição, categoria e tipo podem ser montados antes de gerar o relatório (`GET /pedidos/relatorio-vendas/opcoes`); vendedor sem "ver todos" só vê opções dos próprios pedidos.
