---
aba: Notas Recebidas
rota: /notas-recebidas
permissao: Pode_Acessar_Notas_Recebidas
---

# Notas Recebidas

## O que é

Caixa de entrada das **notas fiscais que os fornecedores emitem contra o CNPJ da empresa** — tanto **NF-e (mercadorias)** quanto **NFS-e (serviços tomados**: contador, manutenção, fretes de serviço etc.**)**. O sistema busca essas notas **automaticamente a cada 1 hora** (usando o certificado digital A1 instalado nas Configurações) — sem precisar digitar nada:

- **NF-e** → consultada na **SEFAZ** (Distribuição DF-e)
- **NFS-e** → consultada no **Ambiente de Dados Nacional da NFS-e** (nfse.gov.br), com o mesmo certificado

De cada nota dá para gerar a **conta a pagar** com um clique, já com as parcelas sugeridas pelas duplicatas da própria nota (NF-e) ou com a data de emissão (NFS-e, que não tem duplicata).

---

## Como a captura funciona (por trás)

### NF-e (mercadorias — SEFAZ)
1. A cada hora, um robô consulta a SEFAZ perguntando "tem nota nova emitida contra o nosso CNPJ?".
2. A SEFAZ primeiro devolve um **resumo** da nota (fornecedor, valor, data) → a nota aparece com status **AGUARDANDO XML**.
3. O sistema então registra automaticamente a **Ciência da Operação** (manifestação do destinatário) — é isso que libera o XML completo.
4. Na consulta seguinte vem o **XML completo** (itens, quantidades, duplicatas) → a nota vira **NOVA** e está pronta para conferência.
5. Se o fornecedor **cancelar** a nota depois, ela muda sozinha para **CANCELADA PELO EMITENTE**.
6. Fornecedor que ainda não existe no app é **criado automaticamente** pelo CNPJ da nota (origem NFE, sem enviar ao Conta Azul).

> A manifestação de "Ciência da Operação" é neutra: só diz à SEFAZ "estou sabendo da nota". Não é aceite comercial.

### NFS-e (serviços tomados — Ambiente Nacional)
1. A cada hora (defasado da NF-e), o robô consulta o ambiente nacional da NFS-e com o mesmo certificado A1, buscando notas de serviço onde somos o **tomador**.
2. A NFS-e chega **completa de uma vez** (não tem etapa de resumo nem manifestação) → já entra como **NOVA**.
3. O valor da nota é o **valor líquido** (serviço − retenções); quando há retenção, o detalhamento aparece nas observações da nota.
4. Cancelamento da NFS-e pelo prestador → **CANCELADA PELO EMITENTE** (igual à NF-e).
5. Prestador novo é criado automaticamente como fornecedor (origem NFSE).

> **Importante:** só chegam NFS-e de **municípios já integrados ao sistema nacional** (nfse.gov.br). Prefeituras com sistema próprio não compartilhado **não aparecem aqui automaticamente** — nesses casos use **Importar XML** (se você tiver o arquivo) ou **Lançar manualmente** (veja "O que dá pra fazer aqui").

---

## Status das notas

| Status | Significado |
|--------|-------------|
| AGUARDANDO_XML | (só NF-e) Só o resumo chegou; o XML completo vem na próxima consulta (após a ciência) |
| NOVA | XML completo baixado — pronta para conferir e gerar a conta a pagar (NFS-e já nasce NOVA) |
| CONFERIDA | Já virou conta a pagar (fica vinculada à conta) |
| VINCULADA | Foi **anexada a parcela(s) de despesa que já existiam** (a nota chegou depois do lançamento) — **não** criou despesa nova |
| ENTRADA_REGISTRADA | **Entrada sem pagamento**: a mercadoria entrou no CNPJ (bonificação, amostra grátis, remessa/troca, comodato, outro) mas **não gera conta a pagar** — a nota fica registrada com o motivo, e os itens vinculados **somam no estoque sem custo** (ver seção própria) |
| IGNORADA | Marcada para ignorar (ex.: nota que não gera conta) — dá para reativar |
| CANCELADA_EMITENTE | O fornecedor/prestador cancelou a nota |

---

## O que dá pra fazer aqui

- Ver todas as notas capturadas (NF-e e NFS-e, com etiqueta do tipo) com fornecedor, número, emissão, valor e status
- **Buscar uma nota** pelo campo de busca acima das abas: procura por **nome do fornecedor, CNPJ, produto da nota (descrição, código ou código de barras), número da nota ou chave de acesso**. A busca vale em **todas as abas** (Novas, Despesa gerada, Ignoradas e Todas). Observação: a busca por produto só encontra notas que já têm o **XML completo** (as "Aguardando XML" ainda não têm a lista de itens)
- **Filtrar por tipo de nota**: alternar entre **Todas / NF-e (produto) / NFS-e (serviço)**
- **Filtrar por período de emissão**: seletor único em pílula (padrão do sistema, estilo Conta Azul) com presets **Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Este ano · Todo o período · Período personalizado** (De/Até dentro do próprio menu). As **setas ‹ ›** ao lado pulam o período inteiro (mês anterior/seguinte etc.); em "Todo o período" ficam desligadas
- **Todos os filtros ficam lembrados por usuário** (situação, tipo e período): ao reabrir a tela, voltam do jeito que você deixou. No período o que fica salvo é o **preset** ("Últimos 30 dias" recalcula a partir de hoje — você não fica preso numa data velha); só o personalizado guarda as datas exatas. A navegação pelas setas não é salva
- A **data de emissão** aparece em **destaque** (etiqueta verde) em cada nota da lista
- A lista carrega **50 notas por vez** e mostra um botão **Carregar mais** no fim (com "Mostrando X de Y") — deixa a tela leve e rápida. A aba (situação), a busca, o tipo e o período continuam valendo sobre **todas** as notas, não só as que já apareceram
- Ver o **status da captura**: NF-e (ligada/desligada, última consulta à SEFAZ) e NFS-e (última consulta ao ambiente nacional), além de quantas notas novas aguardam conferência
- **Consultar agora**: dispara uma busca imediata (SEFAZ **e** ambiente nacional) sem esperar a próxima hora
- **Importar XML** (botão no topo): quando uma nota **não chegou sozinha** na captura automática, anexe o **arquivo XML** dela (NF-e ou NFS-e do padrão nacional) e ela entra na lista como **NOVA**, igual às automáticas — pronta para conferir. Aceita **vários arquivos** de uma vez e **não duplica** (se a nota já existir, só completa/atualiza o XML). Recusa XML de nota que a **própria empresa emitiu** (só entram notas recebidas de fornecedores)
- **Buscar pela chave** (aba dentro de "Importar XML"): sem ter o arquivo, cole a **chave de acesso (44 posições)** de uma **NF-e** e o sistema **busca a nota direto na SEFAZ** (a chave pode conter **letras** quando o fornecedor tem o CNPJ alfanumérico novo — cole como está na DANFE) (pela chave — não pelo número, que a SEFAZ não permite consultar). Se vier só o resumo, o sistema já envia a **Ciência da Operação** e traz o XML completo na sequência (senão chega na próxima consulta). Vale **só para NF-e** e **só onde a empresa é a destinatária** da nota. A chave está na DANFE, no boleto ou no e-mail da nota
  - **Busca agendável:** se a SEFAZ estiver no **intervalo entre consultas** na hora, em vez de dar erro aparece o botão **"Agendar — buscar sozinho ao liberar"**. O sistema fica com a chave na fila e busca automaticamente quando a SEFAZ liberar; a nota aparece sozinha na lista, sem precisar voltar à tela
- **Lançar manualmente** (aba dentro de "Importar XML"): para notas **sem XML legível** — caso típico é **NFS-e de prefeitura fora do padrão nacional**, que nunca chega automaticamente. Você informa **tipo, fornecedor, CNPJ (opcional), número, data de emissão e valor**, e a nota entra como **NOVA** para conferir e gerar a despesa. Fica marcada com a etiqueta **"lançada manual"**
- Abrir o **detalhe da nota**: itens (código do fornecedor, EAN, descrição, quantidade, valores), **informações adicionais de cada item** (infAdProd — lote, validade etc.), duplicatas (vencimentos) e as **observações da nota**. Na NFS-e o detalhe mostra a **discriminação do serviço** e o valor
- **Baixar o XML** completo da nota
- **Imprimir a DANFE** (NF-e: visão em folha com emitente, chave, itens com NCM/CFOP, totais, duplicatas) ou o **DANFSE** (NFS-e: espelho com prestador, tomador, discriminação do serviço, valores e retenções) — impressos na própria página, funciona no iPad/PWA
- **Ignorar** uma nota (e **reativar** depois, se mudar de ideia)
- **Registrar entrada (sem pagamento)** — para nota de **bonificação, amostra grátis, simples remessa/troca, comodato ou outro** motivo que entra no CNPJ mas **não gera dívida** (ver seção própria abaixo). O motivo já vem **sugerido automaticamente** pela natureza da operação e pelos CFOPs da nota
- **Gerar a conta a pagar** a partir da nota:
  - As **parcelas vêm sugeridas pelas duplicatas** da nota (pode ajustar; a soma precisa bater com o total da nota). Quando a nota **não tem boleto/duplicata no XML** (compra à vista e toda NFS-e), a parcela já vem com a **data de emissão da nota** (não a data de hoje), para a despesa aparecer no Conta Azul com a data certa.
  - **Parcelamento manual inteligente** (para notas **sem** boleto no XML): ao clicar **"+ Adicionar parcela"**, o valor é **dividido igualmente** entre todas (a 1ª absorve os centavos) e as datas entram em **sequência**; o campo **"a cada N dias"** define o intervalo entre as parcelas (ex.: 30 → 08/07, 07/08, 06/09). Ao **digitar um valor** numa parcela, o **saldo se redistribui automaticamente** nas parcelas seguintes. Qualquer **data** pode ser editada manualmente. **Notas que já têm parcelas no XML continuam vindo do XML** (sem redividir).
  - **Forma de pagamento e banco (registro local).** Ao marcar "Registrar forma de pagamento e banco", você escolhe a **forma de pagamento** (Pix, dinheiro, boleto, cartão etc.) e o **banco/caixa** (o padrão já vem pré-selecionado) — usado nos **Saldos por conta** do app. *(A despesa fica só no app; desde 07/2026 não é mais enviada ao Conta Azul.)*
  - **Observações vão para a descrição da despesa.** O que você digitar no campo **Observações** é anexado à **descrição** da despesa (fica `NF-e 123 — Fornecedor — sua observação`), mantendo o número da nota e o fornecedor na frente.
  - **"Ainda vou pagar" ou "Já paguei"**:
    - **Ainda vou pagar** — a despesa entra **em aberto**, já com a forma/banco definidos, para pagar depois.
    - **Já paguei** — para compras à vista (PIX, dinheiro, transferência etc.). Além da forma/banco, você informa **a data do pagamento** (vem preenchida com a emissão da nota). A despesa entra **já quitada** (o app registra a baixa no banco/caixa escolhido).
  - **Conciliação (não duplica)**: se você **já tinha lançado essa mesma nota manualmente** no Conta Azul (inclusive como "Compra de produto"), ao gerar a conta o sistema **procura pelo número da nota + valor** e, se encontrar, **vincula à despesa que já existe** lá em vez de criar outra. **Não depende do cadastro do fornecedor** — funciona mesmo que a Conta Azul tenha o fornecedor com nome/CNPJ duplicado ou desatualizado.
  - **Categoria de despesa por item** (do Conta Azul): pode escolher uma **categoria padrão** para a nota inteira e, se quiser, uma **categoria diferente item a item**. Itens sem categoria própria usam a padrão.
  - Quando a nota tem **mais de uma categoria**, o sistema faz o **rateio automático** — divide o total da nota entre as categorias, **proporcional ao valor dos itens** de cada uma (o último grupo absorve os centavos para a soma bater exatamente com o total da nota). A conta a pagar fica com categoria "Vários" e guarda o rateio.
  - Cada categoria usada deve estar cadastrada em **Categorias de Despesa** (é o que classifica a despesa na DRE).
  - **(Só NF-e) Vincular cada item da nota ao "nosso produto"** com fator de conversão — a busca de "Nosso produto" procura no **catálogo de Produtos** (sincronizado do Conta Azul). O sistema **lembra o vínculo** nas próximas notas do mesmo fornecedor (de-para automático por fornecedor + código do produto na nota, e código de barras quando houver).
  - O sistema também **lembra a categoria escolhida por produto do fornecedor** (e por prestador, na NFS-e), mesmo sem vínculo de produto — na próxima nota do mesmo fornecedor a categoria já vem sugerida
  - Se o insumo ainda não existe, dá para **criar um item PCP na hora** (nome, tipo e unidade) pelo botão "Criar produto novo…"
  - **NFS-e tem conferência simplificada**: serviço não vira estoque, então não há vínculo de produto nem conversão — é só conferir a categoria, as parcelas e enviar ao Conta Azul.
  - A nota vira **CONFERIDA** e fica ligada à conta criada
  - **O XML é salvo automaticamente no Google Drive da Contabilidade** (ver seção abaixo)
- **Cancelar entrada e refazer** (nota CONFERIDA): cancela a conta a pagar gerada e devolve a nota para conferência (se a despesa já chegou ao Conta Azul, o app avisa para excluí-la lá manualmente; com baixa registrada, é preciso estornar antes)
- **TODA nota conferida SOMA no estoque** (decisão do dono, 07/2026): ao gerar a conta, cada item com vínculo dá **ENTRADA automática no estoque** (do Produto do catálogo ou do insumo PCP, já na quantidade convertida pelo fator) e o **custo é atualizado por média ponderada** com o estoque anterior (Produto → custo manual; insumo → custo unitário usado nas receitas). A compra também entra no **histórico de compras** do produto (fornecedor, nota, quantidade, custo). A movimentação aparece no Histórico de Estoque como "Entrada NF-e {número} — {fornecedor}". **Item sem vínculo (ou sem fator de conversão) não soma** — a tela avisa; vincule para o estoque entrar.
- **Cancelar entrada e refazer** também **estorna o estoque** (saída na mesma quantidade, na mesma operação) e **restaura o custo para o valor anterior à entrada** — a menos que o custo tenha sido alterado por outra operação no meio tempo (aí a quantidade sai, o custo fica e o app avisa para conferir)

---

## Corrigir produto/conversão de uma nota JÁ lançada (sem mexer no pagamento)

**O problema que isto resolve:** se a conferência foi feita com o **produto errado** ou a **conversão errada** (ex.: 1 caixa lançada como 1 kg em vez de 10 kg), o **custo do produto sai errado** — porque o custo é sempre *valor do item ÷ quantidade convertida*. Até 08/2026 o único conserto era "Cancelar entrada e refazer", que exige **estornar a baixa, cancelar a despesa e refazer o pagamento**. Aconteceu em julho/2026 e travou a correção do custo.

**Onde fica:** abra a nota (status **Despesa gerada** ou **Entrada registrada**) → ao lado do selo verde **"Estoque somado ✓"** aparece o botão **"Corrigir produto/conversão"**.

**O que a correção faz:**
- Deixa você trocar o **produto vinculado** e a **conversão de quantidade** de cada item (inclusive vincular um item que não tinha entrado, ou desvincular um que entrou errado).
- Mostra, item a item, **como está hoje** (produto, quantidade e custo) e **como vai ficar**, além da diferença que entra ou sai do estoque.
- Ao confirmar: retira do estoque o lançamento errado, lança o certo e **recalcula o custo pelo histórico de compras válidas** do produto (as compras posteriores continuam valendo — não é um simples "volta ao custo anterior").
- A diferença de quantidade entra (ou sai) do **estoque de hoje**, com movimentação registrada no Histórico de Estoque ("Correção da entrada NF-e ..." e "Correção — retirada do lançamento errado ...").
- A **memória do de-para** do fornecedor é atualizada junto: a próxima nota daquele fornecedor já vem com a conversão certa.

**O que a correção NÃO faz (de propósito):**
- **Não altera o valor da nota nem da despesa.** O valor de cada item vem do XML; o formulário só diz *para onde* vai e *em que conversão*. Por isso o custo apenas se espalha pela quantidade certa.
- **Não mexe** na conta a pagar, nas parcelas, nas baixas/pagamentos nem no envio ao Conta Azul.
- **Não muda a categoria de despesa** (isso alteraria o rateio e a DRE) — para trocar categoria, o caminho continua sendo "Cancelar entrada e refazer".
- Não vale para **NFS-e** (serviço não movimenta estoque) nem para nota **sem estoque aplicado** (nenhum item vinculado a produto/insumo).

**O custo cai ou sobe?** Depende do erro: se a conversão errada lançou **quantidade a menos**, o custo estava inflado e **cai** ao corrigir; se lançou **quantidade a mais**, o custo estava baixo demais e **sobe**. O total pago é sempre o mesmo.

**Notas antigas (conferidas antes de 27/07/2026)** também podem ser corrigidas (liberado em 08/2026). Elas foram lançadas por um registro mais velho do app e, por isso, não mostravam o selo "Estoque somado ✓" nem o botão. Agora o app lê esse registro antigo, o selo aparece e a correção funciona igual — a tela mostra um aviso em cinza explicando que a **conversão exibida foi reconstituída** pela quantidade que está somada hoje no estoque (confira item a item antes de confirmar). Depois de corrigida, a nota passa a usar o registro novo.

**Permissão:** exige **Pode_Corrigir_Entrada_Estoque** (permissão própria, separada de "Operar Contas a Pagar") — porque mexe em custo e estoque de mês já fechado.

### Nota que nunca somou estoque → "Lançar entrada de estoque"

Quando a conferência foi feita **sem vincular nenhum item** a produto/insumo, a nota vira só despesa e **não soma nada no estoque**. Nesse caso a nota mostra o selo cinza **"Sem entrada no estoque"** e o botão **"Lançar entrada de estoque"** (mesma permissão, mesma tela do corrigir, em modo de lançamento):

- Você vincula os itens que forem de estoque, informa a conversão e confirma; itens sem vínculo simplesmente não entram.
- A conversão vem pré-preenchida pela **memória do de-para** do fornecedor, quando existir.
- A quantidade entra no **estoque de hoje** e o custo do produto passa a considerar essa compra. Despesa, parcelas e baixas continuam intocadas.
- Sem vincular nada, o app recusa (não existe "lançar entrada vazia").
- **Não aparece** em NFS-e (serviço não movimenta estoque). Em nota de despesa pura (combustível, material elétrico) o botão aparece, mas normalmente não há o que lançar.

---

## Quando a nota chega DEPOIS da despesa já lançada (Vincular a parcela existente)

Caso típico: um **contrato de serviço** (advogado, contador, manutenção) com **várias parcelas já lançadas na mão** em Contas a Pagar. A nota fiscal de cada mês só chega **depois** — às vezes depois de a parcela já ter sido paga. Se você "gerar a despesa" dessa nota, a dívida fica **duplicada**.

Para esse caso existe o caminho **"Vincular a parcela já lançada"** (em vez de "Gerar conta a pagar"):

- Você diz **de qual parcela** aquela nota é, e o sistema **anexa os dados fiscais NAQUELA parcela**. **Nenhuma despesa nova é criada** e o pagamento/baixa **não é mexido**.
- **Dá para vincular em parcela já PAGA** — é exatamente o caso de a nota chegar depois do pagamento.
- **Uma nota pode cobrir VÁRIAS parcelas**: você escolhe as parcelas e informa **quanto daquela nota vai em cada uma** (valor vinculado por parcela).
- A tela sugere as parcelas **do mesmo fornecedor da nota** (inclusive as pagas). Se o CNPJ não bater (fornecedor cadastrado diferente), use a **busca** — ela procura parcelas de **qualquer fornecedor** por descrição da despesa, número da nota ou nome do fornecedor.
- Cada parcela mostra o **saldo ainda disponível**: se outra nota já foi vinculada nela, só sobra a diferença. Não é possível vincular mais do que esse saldo, nem somar mais do que o valor da nota (vincular **menos** é permitido — vínculo parcial).
- A nota fica com status **VINCULADA** e continua sendo **documento fiscal completo** (XML, chave, valores) para o relatório de notas da contabilidade — nada é perdido nem escondido.

### Quando o valor não fecha (nota ≠ soma das parcelas)

O sistema **pergunta o que fazer** e só registra a sua escolha:

| Escolha | O que acontece |
|---------|----------------|
| **Nenhuma ação** | Só anexa a nota; a diferença fica **registrada** no vínculo, sem mexer em nada |
| **Ajustar a parcela** | O valor das parcelas **ainda não pagas** passa a ser o valor vinculado que você informou; o total da despesa e o status dela são recalculados. **Parcela já paga não é alterada** — o sistema avisa quais ficaram de fora |
| **Desconto** / **Acréscimo** | Só registra a **natureza** da diferença (mais a observação que você escrever), sem alterar valores |

> **Nada disso vai para a Conta Azul.** O vínculo e o eventual ajuste valem **só dentro do app**.

### Desvincular

Dá para **remover o vínculo** de uma parcela específica ou de todas. Removendo todas, a nota volta para **NOVA** (ou AGUARDANDO XML, se o XML ainda não tiver chegado) e pode seguir por qualquer caminho de novo.
**Atenção:** desvincular **não desfaz** o ajuste de valor que já tiver sido aplicado numa parcela — se precisar, corrija a parcela em **Contas a Pagar**.

> Enquanto a nota estiver vinculada a alguma parcela, o botão de **gerar despesa nova fica bloqueado** (é justamente o que evitaria a duplicidade). Desvincule antes, se for o caso.

---

## Registrar entrada (sem pagamento) — o TERCEIRO caminho da nota

Nem toda nota recebida representa uma dívida. Fornecedor manda **bonificação**, **amostra grátis**, **simples remessa/troca** ou material em **comodato** — a mercadoria entra no CNPJ, a nota precisa ficar guardada para a contabilidade, mas **não existe nada a pagar**. Para esses casos existe o botão **"Registrar entrada (sem pagamento)"** (nota com status NOVA), o terceiro caminho ao lado de "Gerar conta a pagar" e "Vincular a parcela já lançada".

**Quando usar cada motivo:**

| Motivo | Quando usar |
|--------|-------------|
| **Bonificação** | Mercadoria dada de graça pelo fornecedor (bonificação, brinde, doação) — CFOP 5910/6910 |
| **Amostra grátis** | Amostras para degustação/teste — CFOP 5911/6911 |
| **Simples remessa / troca** | Mercadoria em trânsito sem venda: remessa, troca, substituição em garantia, conserto — CFOP 5915/5916/6915/6916 |
| **Comodato** | Equipamento emprestado pelo fornecedor (freezer, máquina de café…) — CFOP 5908/6908 |
| **Outro** | Qualquer outra entrada que não gere pagamento |

**Detecção automática do motivo:** o sistema lê a **natureza da operação** da nota (ex.: "REMESSA EM BONIFICACAO") e os **CFOPs dos itens** e já **sugere o motivo** certo na tela (`motivoSugerido`). Se a natureza e o CFOP apontarem motivos diferentes, vale o que a **natureza** diz. Nota de venda/compra normal não recebe sugestão nenhuma.

**O que acontece ao registrar:**
- A nota vira **ENTRADA_REGISTRADA**, guardando o **motivo**, a **observação** (opcional), **quem** registrou e **quando**.
- **NÃO cria conta a pagar**, mas os itens **vinculados a um produto/insumo SOMAM no estoque** (decisão do dono, 07/2026): a mercadoria entrou de verdade, então a quantidade entra — **sem custo** (bonificação/amostra entra a custo zero; o custo do produto **não muda**, já que nada foi pago). O vínculo e o fator de conversão são os mesmos do "gerar conta" e ficam memorizados por fornecedor para as próximas notas. Item sem vínculo não soma.
- O **XML é salvo no Google Drive da Contabilidade** (pasta do mês), igual ao "gerar conta".
- Com o registro feito, **"Gerar conta a pagar" e "Vincular a parcela" ficam bloqueados** para essa nota (o app avisa o motivo e pede para desfazer antes, se for o caso).

**Desfazer:** o botão **"Desfazer registro"** volta a nota para **NOVA** (ou AGUARDANDO XML, se o XML ainda não chegou), limpa motivo/observação e **estorna do estoque o que a entrada tinha somado** — daí ela pode seguir por qualquer caminho de novo.

> Diferença para **Ignorar**: a nota ignorada é "não é nossa / não interessa". A entrada registrada é "**é nossa e entrou de verdade**, só não tem pagamento" — por isso ela ganha motivo, autor e data, e o XML vai para a pasta normal do mês na contabilidade (não para "Ignoradas").

---

## Salvamento automático do XML na Contabilidade (Google Drive)

Ao **dar entrada** numa nota (gerar a conta a pagar), **registrá-la como entrada sem pagamento** ou **ignorá-la**, o sistema **salva o XML sozinho no Google Drive**, na pasta da contabilidade organizada por mês — sem precisar baixar e arrastar nada. Vale para **NF-e e NFS-e**.

**Como organiza (pela data de EMISSÃO da nota):**

```
Envio Contabilidade
  └── "Julho 2026"            ← pasta do mês (criada sozinha se ainda não existir)
        └── "XML de Julho"     ← subpasta de XML (reaproveita a existente ou cria)
              ├── {chave} - Nota {número} - {Fornecedor}.xml   ← nota dada entrada
              └── Ignoradas/    ← XML das notas ignoradas
```

- **Nome do arquivo:** chave de acesso + número da nota + nome do fornecedor.
- **Nota ignorada** → o XML vai para a subpasta **"Ignoradas"** dentro da pasta de XML do mês.
- **Não duplica:** se o mesmo XML já estiver lá, o sistema não sobe de novo.
- **Nunca trava a operação:** se o Drive estiver fora do ar ou a nota não tiver XML, a entrada acontece normalmente e o problema fica só no log (`[GoogleDrive] ...`).
- Os arquivos ficam **na conta Google do dono** (autorização OAuth feita uma vez), no Drive dele.

**Configuração:** as credenciais do Google ficam em `app_configs` (chave `gdrive_config`: `ativo`, `clientId`, `clientSecret`, `refreshToken`, `envioContabilidadeId`). Para desligar temporariamente, basta `ativo: false`.

---

## Configuração da captura

- **Configurações → Notas Fiscais**: instalar o certificado digital A1 (obrigatório) e ligar/desligar **separadamente** a captura de **NF-e (SEFAZ)** e a de **NFS-e (Ambiente Nacional)** — as duas usam o mesmo certificado
- Sem certificado instalado ou com a captura desligada, o robô simplesmente não consulta (nada quebra)
- **Cadência das consultas automáticas:** o robô consulta a cada **3 horas** por padrão (configurável em `app_configs.sefaz_intervalo_horas`, mínimo ~1h). A SEFAZ só permite ~1 consulta por hora — consultar demais causa o bloqueio de 1h15 (cStat 656). Por isso o sistema tem uma **trava de segurança**: nunca consulta (nem o robô, nem os botões) antes de passar o intervalo, o que **evita o bloqueio** e deixa **folga para as consultas manuais** (Consultar agora / Buscar pela chave). No topo da tela aparece a **"Próxima consulta automática: HH:MM"**
- "Consultar agora" e "Buscar pela chave" usam o piso de ~1h (forçam a consulta se a SEFAZ já liberou); se ainda estiver no intervalo, mostram até quando esperar (e a busca por chave permite **agendar**)
- Se mesmo assim a SEFAZ bloquear (erro 656) ou o ambiente nacional pedir pausa (HTTP 429), o sistema pausa sozinho por 1h15 e mostra até quando

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Notas_Recebidas` | Ver a caixa de entrada, detalhes e XML |
| `Pode_Baixar_Contas_Pagar` | Gerar conta, **vincular/desvincular a parcela já lançada**, **registrar/desfazer entrada sem pagamento**, ignorar/reativar, cancelar entrada e "Consultar agora" |
| `Pode_Corrigir_Entrada_Estoque` | **Corrigir produto/conversão de nota já lançada** — ajusta estoque e custo sem mexer na despesa, nas parcelas nem nos pagamentos |
| `configuracoes.edit` | Ligar/desligar as capturas e instalar o certificado |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Configurações → Certificado Digital** — sem certificado A1 válido não há captura (nem NF-e nem NFS-e)
- **Contas a Pagar** — a conta gerada aparece lá com origem NF-e/NFS-e (e pode ir ao Conta Azul)
- **Fornecedores** — fornecedores/prestadores novos são criados automaticamente pelo CNPJ da nota
- **Produtos** e **PCP → Itens** — o de-para liga itens da NF-e aos produtos do catálogo ou a itens PCP criados na hora; é ele que faz a nota **somar no estoque** ao ser conferida (com custo no "gerar conta"; sem custo no "registrar entrada")
- **Estoque → Histórico** e **PCP → Estoque** — cada entrada/estorno de nota aparece lá como movimentação ("Entrada NF-e ..." / "Estorno entrada NF-e ..."); a correção de produto/conversão aparece como "Correção — retirada do lançamento errado ..." seguida de "Correção da entrada NF-e ..."

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/services/sefazDfeService.js` | Robô de captura de NF-e na SEFAZ (Distribuição DF-e + manifestação 210210) + busca pontual por chave de acesso (`buscarPorChave`) |
| `backend/services/nfseAdnService.js` | Robô de captura de NFS-e no Ambiente de Dados Nacional (ADN) + espelho DANFSE |
| `backend/routes/notasEntrada.js` | Rotas da API (listar com filtro de tipo/período, detalhar, XML, DANFE/DANFSE, gerar conta com categoria por item + rateio, **parcelas-compativeis / vincular-parcelas / desvincular-parcelas**, **registrar-entrada / desfazer-entrada** (entrada sem pagamento), ignorar, consultar agora, **importar-xml** e **lancar-manual**) — dispara o salvamento do XML no Drive ao dar entrada/registrar/ignorar |
| `backend/services/googleDriveService.js` | Salva o XML da nota no Google Drive da Contabilidade (pasta do mês por emissão; subpasta "Ignoradas"); credenciais OAuth em `app_configs.gdrive_config` |
| `backend/services/danfeHtmlService.js` | Monta o HTML da DANFE simplificada (função pura) a partir do XML da NF-e |
| `backend/routes/configNotas.js` | Certificado digital + liga/desliga das capturas (NF-e e NFS-e) |
| `frontend/src/pages/Financeiro/NotasRecebidas*` | Telas do módulo |
