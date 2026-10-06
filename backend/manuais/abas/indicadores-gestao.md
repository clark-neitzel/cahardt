# Indicadores de Gestão

**Rota:** `/indicadores-gestao`
**Menu:** grupo **Financeiro** → "Indicadores de Gestão" (quem tem a permissão completa) e grupo **PCP** → "Indicadores" (quem tem a permissão completa **ou** a de produção).
**Permissões (duas, independentes):**
- `Pode_Ver_Indicadores_Gestao` — **visão completa** (Dono). Administrador também vê tudo.
- `Pode_Ver_Indicadores_Producao` — **só produção** (Gerente de produção). Não vê nada financeiro.
Quem não tem nenhuma das duas não vê o item no menu e, se abrir o endereço, aparece "Você não tem acesso".

## Para que serve

Uma página só para responder: **estamos ganhando dinheiro? o custo está subindo? onde agir primeiro?** Junta receita, custo do que foi vendido, margem, ponto de equilíbrio, preço dos insumos, entradas de mercadoria, produtos, alertas e clientes.

## As duas visões

No topo, quem tem a permissão completa escolhe **Dono** ou **Gerente de produção** (a escolha fica lembrada).

- **Dono** — tudo: KPIs financeiros, cascata de resultado, meta do mês (ponto de equilíbrio), curva de insumos, entradas da semana, tabela de produtos com preço/markup/margem (itens de revenda marcados), produção e estoque, alertas e clientes.
- **Gerente de produção** — foco em produção. Mostra **só produtos fabricados** (com ficha técnica vigente) e **os insumos que entram nessas receitas**: custo dos insumos, insumos em alta, fichas pedindo atenção, curva de insumos, entradas da semana, tabela de custo dos fabricados, produção e estoque, e alertas de produção. **Não aparece**: receita, margem, resultado, cascata, equilíbrio, preço de venda, clientes, produtos de revenda nem produtos sem ficha.

Quem tem **só** a permissão de produção abre direto nessa visão, sem o botão de alternar. O filtro é feito **no servidor** (o sistema nem envia preço, receita, margem ou cliente para essa pessoa), não só escondido na tela. O administrador, ao clicar em "Gerente de produção", vê exatamente o que a gerente vê.

## Filtros do topo

- **Período** (Hoje, 7 dias, 30 dias, Este mês, Este ano, personalizado, com setas). Fica lembrado por usuário.
- **Comparação automática:** não há filtro para escolher; tudo é comparado com o período anterior, do mesmo tamanho (mês cheio contra o mês anterior cheio; mês em andamento contra os mesmos dias do mês anterior).
- **⚙ (engrenagem)** — só **administrador**, só na visão Dono: define a **alíquota de imposto sobre a venda** (veja abaixo).

## Blocos da tela

1. **Faixa de avisos** (Dono): avisos do próprio cálculo, como "X% do custo vem de estimativa" e o alerta de que a matéria-prima pode estar contada duas vezes quando nenhuma categoria tem a marca **"Compra de estoque"**. Quando o aviso trata de categorias, há o link "Classificar agora" para Categorias de Despesa.
2. **KPIs** (cartões com seta, variação, mini-gráfico e **palavra do semáforo**): Receita líquida, Margem de contribuição, Resultado operacional e Custo médio dos insumos (Dono). Na visão de produção: Custo dos insumos, Insumos em alta (3+ altas seguidas), Produtos fabricados vendidos e Fichas pedindo atenção. O ícone **?** de cada cartão explica o indicador.
   - **Palavras do semáforo:** "no alvo", "subindo", "atenção", "agir" (ou só a seta quando não há histórico). Por enquanto, sem metas cadastradas, a régua é a **média dos 3 períodos anteriores**: pior que 2% = atenção; pior que 5% = agir.
3. **Cascata** (Dono): da receita bruta até o resultado — devoluções, impostos, receita líquida, CPV, CMV, lucro bruto, despesas variáveis, margem de contribuição, despesas fixas, resultado. Passar o mouse (ou tocar) mostra o valor e o % da receita líquida. Selos informam se o imposto é "por alíquota" ou "real pago" e se as despesas foram "proporcionais aos dias" (período que não é mês fechado).
4. **Meta do mês / Equilíbrio** (Dono): ponto de equilíbrio, quanto já foi vendido no mês, projeção de fechamento e margem de segurança. Se o mês ainda não tem despesa fixa lançada, usa o mês anterior como referência e avisa qual.
5. **Evolução do custo dos insumos** (ambas): 8 semanas, base 100 = 1ª semana, com o R$ no detalhe. Usa o **último preço pago** nas compras conferidas (entrada estornada não conta). Só mostra insumos de receitas de produtos fabricados.
6. **Entradas da semana** (ambas): compras conferidas na semana (atual ou passada) com fornecedor, quantidade, preço pago e variação contra a compra anterior; abaixo, o **efeito nas fichas técnicas** (quanto o custo de cada produto mudou por causa dessas entradas).
7. **Tabela de produtos** (ambas): na visão Dono — custo da ficha, preço médio, markup, MC por unidade, MC %, MC total e situação, com selo "revenda" nos itens comprados prontos e "sem ficha" nos ainda não classificados; ordenável. Na visão produção — produto, quantidade, custo da ficha por unidade, variação de custo em 4 semanas e se a ficha está desatualizada ou com custo faltando. No celular vira cards.
8. **Produção e estoque** (ambas): dias de estoque de produto acabado e de insumos. **Perda, custo real × padrão e rendimento por lote aparecem como "disponível na próxima fase"** — ainda não há dado confiável, o sistema não inventa número.
9. **Onde agir primeiro** (alertas): custo subindo com preço parado, insumo com 3 altas seguidas, ficha desatualizada ou sem custo, margem abaixo da média, cliente com margem baixa, categorias pendentes, pouca cobertura de custo real, produto vendido sem ficha e sem marca de revenda. A visão de produção só recebe os alertas de produção.
10. **Clientes** (Dono): os 6 que mais vendem, com receita, desconto médio, entregas, custo de entrega e margem. O **custo de entrega é estimado** (despesas do bloco "Veículos e entregas" divididas pelas entregas do período) e vem com selo.
11. **Guia de leitura** (no fim, já aberto): o mesmo texto do "?" dos cartões.

## Como ler cada indicador

- **Receita líquida** — pedidos faturados (mais os especiais) − devoluções ativas − impostos sobre a venda. É o dinheiro que sobra da venda para pagar o resto; toda porcentagem da tela é sobre ela.
- **CPV (custo dos produtos vendidos)** — quantidade vendida × custo da ficha técnica **na data da venda**. Produzir não é vender: o que está no estoque não entra.
- **CMV (custo das mercadorias vendidas)** — quantidade vendida × custo de compra, só para itens de revenda. Fica separado do CPV para não misturar o que fabricamos com o que compramos pronto. Produto sem ficha e sem marca de revenda entra no CMV como "sem classificação".
- **Lucro bruto / margem bruta** — receita líquida − CPV − CMV (e ÷ receita líquida). O que sobra antes de comissão, frete, aluguel e salários.
- **Margem de contribuição (MC)** — receita − custos − despesas variáveis (comissão, frete, embalagem de entrega, taxa de boleto). É o principal número para decidir desconto, pedido, cliente e produto: cada real de MC paga as despesas fixas, e o que passar é lucro.
- **Markup** — preço de venda ÷ custo da ficha. 2,0× = vende pelo dobro do custo = 50% sobre o preço. Markup e margem não são a mesma coisa.
- **Resultado operacional** — MC − despesas fixas (e ÷ receita líquida). Se a operação dá resultado, antes de juros e imposto sobre lucro.
- **Ponto de equilíbrio** — despesas fixas ÷ MC %. A receita mínima do mês para zerar; abaixo disso é prejuízo.
- **Margem de segurança** — (receita − equilíbrio) ÷ receita. Quanto as vendas podem cair antes do prejuízo; negativa = já está no prejuízo.
- **Custo dos insumos** — último preço pago de cada insumo, semana a semana, contra a 1ª semana. Linha subindo = o insumo está mais caro. É preço pago, não média.
- **Custo da ficha técnica** — soma dos insumos da receita (com perda e rendimento) ÷ unidades produzidas. "Δ 4 semanas" mostra se subiu; "ficha desatualizada" avisa que algum insumo está sem preço recente.

## Como o custo da venda é guardado (importante)

No momento em que o pedido sai do estoque (faturamento), o sistema **congela o custo do produto naquele dia** em cada item. Por isso mudar o custo de um produto depois **não altera** o resultado de vendas passadas. Vendas antigas, de antes dessa função, recebem um custo **estimado** (histórico mensal ou custo atual) — a faixa de avisos mostra a parte do custo que vem de estimativa. Um item sem nenhum custo conhecido conta como custo zero e é avisado.

## O que o dono precisa cadastrar

1. **Natureza fixa/variável** de todas as categorias de despesa (tela *Categorias de Despesa*). Sem isso a MC e o equilíbrio ficam incompletos.
2. **Marca "Compra de estoque"** nas categorias de compra de mercadoria (Matéria-prima, Embalagens, Materiais para revenda...). Veja [categorias-despesa.md](categorias-despesa.md). Sem a marca, a compra de insumo é contada duas vezes na margem.
3. **Alíquota de imposto sobre a venda** (⚙, só administrador, de 0 a 40%). O imposto incide só sobre o que tem nota (pedido especial não paga). **Alíquota vazia** = usa o que foi realmente pago no bloco "Impostos sobre vendas" das despesas (selo "imposto real pago"). **Com alíquota**, esse bloco deixa de entrar nas despesas, para não contar o imposto duas vezes (selo "imposto por alíquota").
4. **Ficha técnica vigente** nos produtos fabricados (*PCP → Receitas*) e a marca de **revenda** no produto comprado pronto — é o que decide se o item é "fabricado", "revenda" ou "sem classificação".

## Quem pode o quê

- Ver a visão Dono, KPIs financeiros, cascata, equilíbrio, clientes: `Pode_Ver_Indicadores_Gestao` (ou administrador).
- Ver só produção (fabricados e insumos): `Pode_Ver_Indicadores_Producao`.
- Mudar a alíquota (⚙): somente administrador.

## Relacionado

- [DRE — Resultado](dre.md) e [Categorias de Despesa](categorias-despesa.md): de onde vêm as despesas fixas/variáveis.
- [Margem por Produto](margem-produtos.md): custo e preço por produto, mês a mês.
- [PCP — Receitas](pcp-receitas.md) e [Notas Recebidas](notas-recebidas.md): fichas técnicas e entradas de mercadoria que alimentam o custo dos insumos.
