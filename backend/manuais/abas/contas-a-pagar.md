---
aba: Contas a Pagar
rota: /contas-pagar
permissao: Pode_Acessar_Contas_Pagar
---

# Contas a Pagar

## O que é

Gestão das despesas da empresa (contas a pagar): lançamento manual de contas com parcelas e **baixa dentro do próprio app**. Desde 07/2026 o **app é o dono do financeiro** — as despesas **não são mais enviadas para o Conta Azul**; tudo (lançar, pagar, estornar) acontece aqui. O Conta Azul continua sendo **lido** só para o histórico: despesas antigas que ainda vivem lá e forem pagas no CA (ex.: DDA/conexão bancária) têm a baixa detectada e refletida aqui automaticamente, e o histórico do CA pode ser importado (ver mais abaixo).

---

## O que dá pra fazer aqui

- Ver todas as contas a pagar do mês com KPIs no topo:
  - **Vencidas** (todas as parcelas em aberto já vencidas, independente do mês)
  - **Próximos 7 dias** (o que vence na semana)
  - **Em aberto no mês** e **Pago no mês**
- Filtrar por busca (descrição, nota, fornecedor), status da conta, categoria e período de vencimento — a lista mostra **só as parcelas que vencem dentro do período escolhido** (uma conta parcelada aparece apenas com as parcelas daquele período). **Os filtros ficam salvos por usuário**: ao sair da tela e voltar, continuam aplicados (guardados no próprio navegador/dispositivo). Quando há filtro ativo, aparece uma etiqueta **"N filtros ativos"**; o botão **"Limpar filtros"** volta tudo ao padrão (Este mês, sem busca/status/categoria)
- **Cancelados não aparecem por padrão:** com o filtro em "Status: Todos", as parcelas canceladas ficam escondidas. Para vê-las, escolha no filtro de status **"Cancelado"** (só as canceladas) ou **"Todos (com cancelados)"** (tudo junto)
- **Filtro de período (novo formato, estilo Conta Azul):** um controle só, com **setas ‹ ›** dos lados e o período no meio. Clicando no meio abre o menu com os atalhos **Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Este ano · Todo o período · Período personalizado** (neste último, escolha De/Até dentro do próprio menu e toque em Aplicar). As **setas pulam o período inteiro** (ex.: em "Este mês" voltam/avançam mês a mês; em "7 dias", de 7 em 7). O que fica salvo é o **atalho escolhido** — quem deixa "Este mês" sempre abre a tela no mês corrente, nunca preso numa data velha; a navegação com as setas é só um passeio (ao reabrir, volta ao atalho salvo)
- **Clicar em qualquer despesa abre os detalhes completos**: descrição, categoria, observação, todas as parcelas com o histórico de pagamentos — cada pagamento mostra **valor, data, forma de pagamento (Boleto bancário, PIX, Dinheiro…) e o banco/caixa de onde saiu** (quando informado na baixa) — e — quando a conta veio de uma NF-e — os **itens/produtos da nota** (o que foi comprado: descrição, quantidade, unidade, valor unitário e total de cada item), qual produto do estoque cada item alimentou, e as observações da própria nota fiscal. Serve para tirar dúvida do tipo "essa despesa é de quê?" sem sair da tela
- **Imprimir Recibo (folha A4):** nos detalhes da despesa, cada parcela tem o botão **"Recibo"** — imprime um recibo no padrão da empresa (logo e dados da Hardt), com o valor em destaque e **por extenso**, dizendo **a que se refere** (descrição da despesa, nota, categoria, nº da parcela e vencimento), a data por extenso e a linha de assinatura com o **nome e CNPJ/CPF do fornecedor**. Funciona no iPad/PWA (imprime na própria página)
- **Imprimir vários recibos de uma vez (um por folha):** marque as caixinhas das parcelas **já pagas** na lista (dá para usar o "selecionar todas" do cabeçalho) e clique em **"Imprimir N recibos"** na barra verde do topo — sai **um recibo por folha A4**, na ordem da lista. Ideal para imprimir de uma vez os recibos do mês (salários, benefícios etc.). A mesma seleção mostra **"Quitar selecionadas"** para as parcelas que ainda estão em aberto.
- **Duplicar despesa:** nos detalhes da despesa há o botão **"Duplicar"** — abre a Nova Despesa **já preenchida** com fornecedor, descrição, categoria, observações e as parcelas (datas e valores, todas em aberto), sem número de nota. Ideal para relançar contas recorrentes (aluguel, seguro, assinatura) sem digitar tudo de novo — é só ajustar as datas e salvar
- Criar uma conta a pagar: fornecedor, descrição, categoria de despesa, número da nota, competência, observações e parcelas (valor + vencimento de cada uma). **A conta fica só no app** (não é mais enviada ao Conta Azul)
- **Gerar várias parcelas de uma vez (assinatura/seguro):** na seção Parcelas da Nova Despesa há o botão **"⚡ Gerar várias"** — informe o **nº de parcelas**, o **valor de cada**, a **data da 1ª** e a **recorrência** (**Todo mês no mesmo dia** = dia fixo, com o dia 31 caindo no último dia dos meses menores; ou **A cada N dias**). O sistema cria todas de uma vez (substituindo as em aberto) e mostra o total; cada parcela ainda pode ser ajustada depois. Evita adicionar dezenas de parcelas uma a uma
- **Forma de pagamento e banco/caixa (registro local):** ao marcar **"Registrar forma de pagamento e banco"** na Nova Despesa, escolha a **forma de pagamento** (Pix, **Dinheiro**, transferência, boleto, cartão…) e o **banco/caixa** (ex.: o **caixinha**) — isso é usado para os **Saldos por conta** do app. Escolha também:
  - **Ainda vou pagar** — a despesa entra **em aberto** (para pagar depois);
  - **Já paguei** — para o que já saiu (ex.: **dinheiro do caixinha**): informe a **data do pagamento** e a despesa entra **já quitada** (o app registra a baixa no banco/caixa escolhido).
- **Lançar os produtos da compra junto com a despesa manual (opcional)**: na tela de Nova Despesa (entre as Observações e as Parcelas) há a seção **"Produtos comprados"** — clique em "Lançar os produtos desta compra", busque o produto **do catálogo de produtos** (insumos do PCP não aparecem nessa busca, igual ao de-para das Notas Recebidas) e informe a **quantidade** (na nossa unidade) e o **valor unitário OU o valor total** — preenchendo um, o outro é calculado sozinho. Fornecedor, categoria e produto usam **busca com filtro** (combobox digitável, não lista gigante). Ao criar a despesa, cada produto:
  - dá **entrada no estoque** (motivo COMPRA) — produto que não controla estoque só atualiza o custo;
  - atualiza o **custo** por média ponderada com o estoque anterior (produto → custo manual; insumo PCP → custo unitário das receitas);
  - entra no **histórico de compras** do produto (fornecedor, quantidade, custo).
  É o mesmo efeito da conferência de uma NF-e, mas para compras sem nota capturada (ex.: compra no mercado, pagamento por PIX sem NF-e). Os produtos aparecem depois nos detalhes da despesa ("Produtos da despesa"). **Cancelar a despesa devolve o estoque** (estorna as entradas); o custo não é revertido. Só dá para lançar produtos ao CRIAR a despesa (não na edição).
- **Anexar o documento em PDF (boleto, nota, contrato, recibo)**: cada despesa guarda **um** arquivo PDF (máx. **30 MB**). Dá para anexar em três momentos: (1) na **Nova Despesa**, no campo "Documento (PDF opcional)" ao final do formulário — o arquivo sobe junto quando a despesa é criada; (2) **depois**, abrindo a despesa na lista, na seção **"Documento (PDF)"** ("Clique para anexar PDF"); (3) ao **editar** a despesa (substitui o anexo anterior). Onde ele aparece depois:
  - a despesa ganha um **selo "PDF"** na lista (dá para ver quais têm documento);
  - nos **detalhes**, o nome do arquivo com botões de **abrir** e **remover** (remover pede confirmação; anexar um novo substitui o antigo);
  - **na hora de dar a baixa da parcela**, uma faixa âmbar no topo do modal de pagamento mostra o documento com o botão **"Ver documento"** — a pessoa confere o boleto e paga sem sair da tela. É o principal motivo do anexo: conferência na hora do pagamento e consulta futura.
  O PDF fica **só no app**.
- Contas também **chegam sozinhas via NF-e** (origem NFE): a aba **Notas Recebidas** captura as notas dos fornecedores na SEFAZ e gera a conta a pagar já com número da nota, chave da NF-e, fornecedor e parcelas das duplicatas (ver manual [notas-recebidas.md](notas-recebidas.md)). Lá a nota tem **três caminhos**: gerar a conta a pagar, vincular a parcela já lançada, ou **registrar como entrada sem pagamento** (bonificação, amostra grátis, remessa/troca, comodato — a mercadoria entra no CNPJ mas **não gera despesa aqui**)
- **Importar do Conta Azul** (botão no topo): traz o histórico de despesas que só existe no Conta Azul (salário, combustível, imposto, pedágio, empréstimo...) a partir do **CSV exportado** lá (Financeiro → Contas a pagar → Exportar). Serve para a **DRE e o Fluxo de Caixa** terem os meses passados.
  - Ao subir o arquivo, aparece uma **prévia** (quantas contas, quanto já pago, categorias novas) antes de confirmar.
  - As contas importadas nascem com origem **IMPORTADO_CA** e **não são reenviadas ao Conta Azul** (já existem lá — não duplica).
  - O próprio arquivo diz se cada conta foi **paga ou não** (não precisa consultar o CA de novo para o histórico).
  - **Reimportar o mesmo mês não duplica**: cada conta tem uma chave (vencimento + fornecedor + descrição). Se algo que estava em aberto passou a pago, a reimportação registra a baixa.
  - As **categorias** vistas na importação viram itens na tela **Categorias de Despesa** (para classificar o que entra ou não na DRE).
- **Despesas lançadas direto no Conta Azul chegam sozinhas** (desde 07/2026): o app confere o Conta Azul a cada 3 horas e importa automaticamente qualquer despesa criada lá (folha, DAS, tarifa, boleto digitado pela contadora...) — sem precisar do CSV para o dia a dia. Elas nascem com origem **IMPORTADO_CA**, **não são reenviadas ao CA** e as **baixas** (com o banco/caixa de onde saiu o dinheiro) são puxadas junto pelo sincronismo de 30 minutos. Se a mesma despesa já existia no app (criada aqui ou vinda do CSV), o sync **vincula em vez de duplicar**. O CSV continua útil só para trazer **histórico antigo** de uma vez.
- **Categoria "Vários" / rateio:** uma conta pode ter **mais de uma categoria** de despesa quando vem de uma NF-e com itens de categorias diferentes. Nesse caso a categoria aparece como **"Vários"** e a conta guarda o **rateio** (quanto do valor foi para cada categoria) — é o que alimenta a DRE por categoria
- Editar uma conta (campos e parcelas ainda não pagas — bloqueado se quitada/cancelada): edição livre (adicionar/remover parcela, mudar valor e vencimento). *(Contas antigas que ainda vivem no Conta Azul — status ENVIADO, de antes de 07/2026 — têm edição restrita às parcelas em aberto, para não desencontrar do CA.)*
- Dar **baixa manual** numa parcela: no campo **"Valor pago"** digite o **total que saiu do banco** — o app faz a conta sozinho, sem precisar calcular nada:
  - **Pagou a mais que o saldo** (boleto vencido, por exemplo): o modal pergunta se a diferença é **juros** ou **multa** e preenche o campo escolhido. Precisando dividir entre os dois, é só digitar nos campos na mão.
  - **Pagou a menos que o saldo**: o modal pergunta se a diferença é **desconto** (a parcela fica **quitada**) ou **pagamento parcial** (a parcela fica **PARCIAL**, com saldo restante em aberto).
  - Um resumo embaixo mostra quanto abate da parcela e se ela fica quitada ou parcial antes de confirmar. Também dá para informar banco/caixa e forma de pagamento.
- **Quitar várias de uma vez (baixa em lote)**: marque as caixinhas das parcelas em aberto (há um "selecionar todas" no cabeçalho da tabela) e clique em **"Quitar selecionadas"**. Informe **uma vez só** a data, a forma de pagamento e o banco/caixa — todas as marcadas são quitadas pelo **saldo restante** com essa condição (registro só no app). Útil quando um único PIX/dinheiro pagou várias notas (ex.: nota de serviço + nota de peça).
- **Estornar** um pagamento específico. Baixa feita no app estorna direto. *(Baixa antiga que veio do Conta Azul — "Baixado via DDA" — o app exclui a baixa lá no CA primeiro e depois estorna aqui; se o CA recusar porque ela já está conciliada com o extrato lá, desfaça a conciliação no CA e tente de novo.)*
- Cancelar uma conta (só se não tiver pagamento registrado; estorne antes se precisar). Se a despesa manual tinha **produtos lançados**, o cancelamento **devolve o estoque** automaticamente

---

## Relação com o Conta Azul (desde 07/2026: só leitura)

O **envio de contas a pagar para o Conta Azul foi desligado** — o app é o dono do financeiro. Toda despesa nova (manual ou vinda de NF-e) nasce **só no app** e é paga aqui. O Conta Azul continua sendo **lido** em dois pontos, para o histórico não se perder:

1. **Baixa de títulos antigos que ainda vivem no CA:** a cada 30 minutos o app confere se uma parcela **de antes do corte** (que já tinha vínculo com o CA) foi paga lá (ex.: DDA/conexão bancária) — se foi, a baixa aparece aqui automaticamente, com a marca "baixado via CA". Para despesas novas isso não se aplica (elas não existem no CA).
2. **Importação do histórico do CA:** despesas que só existem no Conta Azul (folha, DAS, tarifa, boleto digitado pela contadora) continuam chegando — por importação de CSV e pela sincronização automática de 3h — para a DRE e o Fluxo de Caixa terem os meses passados. Elas nascem com origem **IMPORTADO_CA** e nunca voltam ao CA.

> Contas que ficaram "presas" tentando enviar ao CA (na fila ou com erro) foram automaticamente convertidas para **"só no app"** ao desligar o envio — nenhuma despesa fica travada.

---

## Status das parcelas e da conta

| Status | Significado |
|--------|-------------|
| PENDENTE | Nada pago ainda |
| PARCIAL | Pagamento parcial registrado |
| PAGO | Parcela quitada (manual ou via CA) |
| CANCELADO | Parcela cancelada |

A conta fica ABERTO / PARCIAL / QUITADO / CANCELADO conforme o conjunto das parcelas.

---

## Nota fiscal vinculada a uma parcela

Uma parcela **já lançada aqui** pode ter **uma ou mais notas fiscais vinculadas** — é o caminho usado quando a despesa foi lançada primeiro (ex.: contrato de serviço parcelado) e a **NF só chegou depois**, às vezes depois do pagamento. O vínculo é feito lá em **Notas Recebidas** ("vincular a parcela já lançada"), **não** cria despesa nova aqui e **não mexe na baixa** da parcela.

- Uma nota pode ser dividida entre **várias parcelas** (com valor vinculado em cada uma) e uma parcela pode receber **mais de uma nota**, até o limite do valor dela.
- Se, ao vincular, for escolhida a ação **"ajustar a parcela"**, o **valor das parcelas ainda não pagas** passa a ser o valor vinculado, e o **total e o status da despesa são recalculados** automaticamente. Parcela **já paga nunca é alterada**.
- Esse ajuste vale **só no app** — nada é refletido na Conta Azul.
- Desvincular a nota **não desfaz** um ajuste de valor já aplicado: se precisar voltar, edite a parcela aqui.

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Contas_Pagar` | Ver a tela, as contas e os KPIs |
| `Pode_Baixar_Contas_Pagar` | Criar, editar, baixar, estornar e cancelar |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Fornecedores** — cada despesa costuma ter um fornecedor cadastrado no app (os fornecedores também não são mais enviados ao CA)
- **Saldos por conta** — a forma de pagamento e o banco/caixa informados na baixa alimentam os saldos por conta do app
- **Conta Azul** — usado só para **leitura**: importação do histórico de despesas e baixa de títulos antigos que ainda vivem lá
- **Notas Recebidas** — a captura automática de NF-e na SEFAZ (com o certificado digital instalado nas Configurações) gera contas a pagar com origem NFE a partir das notas dos fornecedores; e uma nota que chega **depois** pode ser **vinculada a uma parcela que já existe aqui** (sem criar despesa nova)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/routes/contasPagar.js` | Rotas da API (listar, criar, editar, baixar, estornar, cancelar, **detalhe com itens da nota**, produtos-opcoes) |
| `backend/services/contasPagarCaSyncService.js` | Robôs do CA: envio **desligado** por `CA_SOMENTE_LEITURA` (drena filas p/ "só no app"); mantém a **leitura** de baixas de títulos antigos |
| `backend/config/contaAzulModo.js` | Chave `CA_SOMENTE_LEITURA` que desliga o envio ao Conta Azul (app dono do financeiro) |
| `backend/services/compraEstoqueService.js` | Entrada de estoque/custo/histórico das compras (nota conferida e despesa manual com produtos) |
| `frontend/src/pages/Financeiro/ContasPagar*` | Telas do módulo |
