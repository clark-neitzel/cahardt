---
aba: Contabilidade
rota: /admin/contabilidade
permissao: Pode_Acessar_Contabilidade
---

# Contabilidade

## O que é
Área de CONSULTA com os relatórios que o escritório de contabilidade precisa — pensada para o contador ter um cadastro próprio no sistema com só esta permissão ligada. Tudo aqui é somente leitura e exportação: não existe botão de baixa, edição ou cadastro.

A área tem 5 abas: **Contas a Receber**, **Contas a Pagar**, **Extratos**, **Notas de Entrada** e **Pacote do Mês**. A aba escolhida fica salva por usuário.

## Aba Contas a Pagar
- **Três visões**: Contas (competência, pela data de emissão), Pagamentos (caixa — uma linha por baixa, com **juros, multa e desconto**) e **Por categoria (DRE)** — totais por categoria calculados SEMPRE pelo rateio da nota (matéria-prima × uso e consumo), com a classificação (Operacional/Financeiro/Fora da DRE) e o grupo da DRE.
- Conta com itens de categorias diferentes aparece como **RATEADA** e abre as linhas do rateio logo abaixo.
- **Por categoria (DRE) agora é uma árvore detalhada** — categoria → fornecedor → nota → produtos — para responder ao contador "esse total de Matéria Prima é de quem e de quê?". O período dessa visão é a **data de emissão** da nota/lançamento (os filtros de vencimento e pagamento não se aplicam a ela e ficam escondidos). O total de cada categoria é SEMPRE o valor do rateio gravado na conta; os produtos só detalham esse valor, e o que sobra (frete, seguro, IPI/ST, desconto da nota, arredondamento) aparece numa linha **"Frete e outros valores da nota"** (pode ser negativa quando houve desconto). Assim a soma dos produtos + essa linha fecha centavo a centavo com a categoria.
- **De onde vêm os produtos:** nota de entrada (NF-e) → itens da nota (descrição, código do fornecedor, NCM, CFOP, quantidade, unidade, valor unitário); despesa lançada à mão com produtos → os produtos da despesa (sem NCM/CFOP/código; diferença vira "Outros valores / diferença da despesa"); energia, salário, imposto, NFS-e e contas importadas do Conta Azul não têm produtos e saem em **uma linha por categoria**, com a descrição do lançamento. Quando a nota foi **vinculada depois** a uma parcela já lançada (caso típico das contas importadas do CA), os produtos ainda **não aparecem** — um aviso cinza informa quantos lançamentos estão nesse caso.
- **Pago e Em aberto por categoria** — "Pago (até hoje)" soma tudo que já foi pago das contas emitidas no período (não só o pago dentro do período); baixas estornadas não contam. Quando uma conta tem várias categorias ou produtos, **pago, desconto e juros/multa são rateados** na mesma proporção do valor (a soma sempre fecha). Em aberto = valor − pago − desconto.
- **Dados por nota** (nas linhas da árvore e no CSV): tipo do documento (NF-e, NFC-e, NFS-e, Importada (antiga), Sem documento — NFC-e é reconhecida pela chave de acesso, modelo 65), número, chave, emissão, "referente a" (mês de competência), parcelas pagas/total, vencimento(s), situação (Pago, Parcial, Vencido, Aberto — "Vencido" depende do dia em que o relatório é gerado), data(s) de pagamento, forma(s), banco(s), quem baixou, conciliado com o extrato (Sim/Não/Parcial), se tem anexo e o **total da nota (não somar)**.
- **Fora do resultado** — categorias classificadas como "Fora da DRE" no cadastro (ex.: Antecipação de Lucros, empréstimos, imobilizado) entram num bloco à parte, com subtotal próprio; o sistema não reclassifica nenhuma categoria sozinho.
- **Lançamentos sem nota fiscal** — linha informativa cinza com a quantidade e o valor (salários, impostos e contas de consumo entram aqui) e opção de ver só esses.
- **Abrir até** (Categoria / Fornecedor / Nota / Produto) controla a profundidade na tela e na impressão. **O CSV sai sempre com uma linha por produto** e todas as colunas (33), qualquer que seja o nível aberto; a coluna "Valor nesta categoria" é a única para somar no Excel (junto de Pago e Em aberto). Se o período for tão grande que o arquivo sairia incompleto (acima de 20.000 linhas), o sistema avisa e **bloqueia o CSV** — escolha um período menor.
- Coluna Documento: NF-e (produto), NFS-e (serviço), importada (antiga) ou sem nota; 📎 indica PDF anexado.
- Filtros: emissão/vencimento/pagamento (presets), fornecedor, documento, forma, banco do pagamento, status. Exporta CSV e imprime.

## Aba Extratos
- O extrato importado de cada conta (OFX dos bancos, Asaas) com a coluna **Identificação**: cada linha diz de qual pedido/cliente/nota/fornecedor veio, se é grupo (1 PIX pagando vários títulos, com a diferença e o motivo), transferência interna (não entra na DRE) ou ignorado (com o motivo).
- Exporta **CSV com conciliação** e **OFX** (formato que sistemas contábeis importam).

## Aba Notas de Entrada
- NF-e de produto e NFS-e de serviço dos fornecedores, com **as parcelas a pagar de cada nota** logo abaixo (vencimento, valor, situação e banco do pagamento). Três destinos: gerou contas a pagar, vinculada a parcelas já lançadas, ou entrada sem pagamento (bonificação/amostra/comodato).
- Baixa o **XML** de cada nota e o **ZIP** com todos os XMLs do período.

## Aba Pacote do Mês
- Um clique gera o **ZIP completo do mês** para mandar à contabilidade: títulos criados, recebimentos, contas a pagar com rateio DRE, pagamentos com juros/multa, extrato de cada conta com identificação, transferências/ajustes, devoluções com NF, e os XMLs de saída e de entrada.

## Aba Contas a Receber
- **Duas visões do Contas a Receber** (botão no topo dos filtros):
  - **Títulos (competência)** — uma linha por parcela, filtrada pela **data de criação** do título: responde "o que foi lançado no período".
  - **Recebimentos (caixa)** — uma linha por baixa (recebimento), filtrada pela data do pagamento: responde "o que entrou de dinheiro, por qual forma e em qual banco". Uma parcela paga metade em PIX e metade em dinheiro aparece em duas linhas, cada uma no banco certo.
- **Coluna "Nota fiscal"** — diz se o título tem NF-e antiga (importada), NF-e emitida pelo app, se é **Especial (sem nota)**, importado (antigo) ou sem NF registrada; mostra número e final da chave.
- **Escolher colunas** — pílulas acima da tabela ligam/desligam colunas (pedido, criação, cliente/CNPJ, vencimento, valor, recebido, desconto, forma, banco da baixa, data da baixa, baixado por, conciliado?, status, origem, condição, vendedor). Arrastar a pílula muda a ordem. A escolha fica salva por usuário.
- **Filtros** — período de criação, vencimento e pagamento (presets ‹ Este mês ›), cliente, documento fiscal, forma de recebimento, banco da baixa, status e origem. Ficam salvos por usuário.
- **Ordenar** — clique no cabeçalho da coluna (alterna crescente/decrescente).
- **Exportar CSV** — planilha para Excel com as colunas e filtros escolhidos.
- **Imprimir / PDF** — folha A4 paisagem impressa da própria página (funciona no iPad); "Salvar como PDF" na janela de impressão gera o arquivo para mandar por e-mail.
- **Cartões de resumo** — quantidade, valor total (ou recebido, na visão caixa), valor com nota fiscal e valor sem nota (especial).

## Perguntas comuns
- **"O total de Matéria Prima não bate com a soma dos produtos da nota"** → confira a linha "Frete e outros valores da nota": ela leva frete, impostos e descontos que não são produto. A soma dos produtos + essa linha é sempre igual ao total da categoria.
- **"Por que alguns lançamentos aparecem sem produtos?"** → energia, salário, imposto e serviços não têm produtos; e notas vinculadas depois a uma parcela já lançada ainda não trazem os produtos para este relatório.
- **"Como vejo tudo que foi criado num mês?"** → visão Títulos + período de criação no mês desejado.
- **"Como vejo o que entrou de dinheiro no mês, por banco?"** → visão Recebimentos + período de pagamento no mês; ligue as colunas Forma e Banco da baixa.
- **"Como sei se um recebimento é de nota fiscal ou de especial?"** → coluna Nota fiscal (o selo roxo "Especial — sem nota" indica venda sem NF).
- **"Conciliado?" significa o quê?** → a baixa foi casada com uma linha do extrato bancário na Conciliação Bancária (dinheiro conferido no banco).
- **O contador não encontra a tela** → o cadastro dele precisa da permissão "Contabilidade (consulta)" em Administração → Usuários → Permissões (grupo Financeiro).
- **O nome do escritório está aparecendo como vendedor (no Caixa, nos filtros de pedidos…)** → marque o cadastro dele como **Acesso externo** em Administração → Usuários (lápis na linha, caixinha "Acesso externo (contabilidade/parceiro)"). Ele continua entrando e vendo esta tela, mas some de todos os seletores de vendedor/motorista/equipe do app.

## O que esta tela NÃO faz
- Não dá baixa, não edita títulos, não emite nota — é só consulta/exportação.
- Não reclassifica categoria (ex.: o que é "Fora da DRE" vem do cadastro de categorias).
- Bonificações e pedidos excluídos/cancelados não aparecem (mesma regra da tela de Contas a Receber).
