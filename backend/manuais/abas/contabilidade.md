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
- Coluna Documento: NF-e (produto), NFS-e (serviço), importada do CA ou sem nota; 📎 indica PDF anexado.
- Filtros: emissão/vencimento/pagamento (presets), fornecedor, documento, forma, banco do pagamento, status. Exporta CSV e imprime.

## Aba Extratos
- O extrato importado de cada conta (OFX dos bancos, Asaas, Conta Azul) com a coluna **Identificação**: cada linha diz de qual pedido/cliente/nota/fornecedor veio, se é grupo (1 PIX pagando vários títulos, com a diferença e o motivo), transferência interna (não entra na DRE) ou ignorado (com o motivo).
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
- **Coluna "Nota fiscal"** — diz se o título tem NF-e do Conta Azul, NF-e emitida pelo app, se é **Especial (sem nota)**, importado do CA ou sem NF registrada; mostra número e final da chave.
- **Escolher colunas** — pílulas acima da tabela ligam/desligam colunas (pedido, criação, cliente/CNPJ, vencimento, valor, recebido, desconto, forma, banco da baixa, data da baixa, baixado por, conciliado?, status, origem, condição, vendedor). Arrastar a pílula muda a ordem. A escolha fica salva por usuário.
- **Filtros** — período de criação, vencimento e pagamento (presets ‹ Este mês ›), cliente, documento fiscal, forma de recebimento, banco da baixa, status e origem. Ficam salvos por usuário.
- **Ordenar** — clique no cabeçalho da coluna (alterna crescente/decrescente).
- **Exportar CSV** — planilha para Excel com as colunas e filtros escolhidos.
- **Imprimir / PDF** — folha A4 paisagem impressa da própria página (funciona no iPad); "Salvar como PDF" na janela de impressão gera o arquivo para mandar por e-mail.
- **Cartões de resumo** — quantidade, valor total (ou recebido, na visão caixa), valor com nota fiscal e valor sem nota (especial).

## Perguntas comuns
- **"Como vejo tudo que foi criado num mês?"** → visão Títulos + período de criação no mês desejado.
- **"Como vejo o que entrou de dinheiro no mês, por banco?"** → visão Recebimentos + período de pagamento no mês; ligue as colunas Forma e Banco da baixa.
- **"Como sei se um recebimento é de nota fiscal ou de especial?"** → coluna Nota fiscal (o selo roxo "Especial — sem nota" indica venda sem NF).
- **"Conciliado?" significa o quê?** → a baixa foi casada com uma linha do extrato bancário na Conciliação Bancária (dinheiro conferido no banco).
- **O contador não encontra a tela** → o cadastro dele precisa da permissão "Contabilidade (consulta)" em Administração → Usuários → Permissões (grupo Financeiro).
- **O nome do escritório está aparecendo como vendedor (no Caixa, nos filtros de pedidos…)** → marque o cadastro dele como **Acesso externo** em Administração → Usuários (lápis na linha, caixinha "Acesso externo (contabilidade/parceiro)"). Ele continua entrando e vendo esta tela, mas some de todos os seletores de vendedor/motorista/equipe do app.

## O que esta tela NÃO faz
- Não dá baixa, não edita títulos, não emite nota — é só consulta/exportação.
- Bonificações e pedidos excluídos/cancelados não aparecem (mesma regra da tela de Contas a Receber).
