---
aba: Caixa Diário
rota: /caixa
permissao: Pode_Acessar_Caixa
---

# Caixa Diário

## O que é

Resumo financeiro diário do motorista/vendedor. Mostra tudo que aconteceu em um dia: entregas realizadas, valores recebidos por forma de pagamento, amostras entregues, despesas registradas, adiantamento e o total a prestar de contas. O admin usa para conferir e fechar o caixa de cada vendedor.

---

## O que dá pra fazer aqui

- Ver resumo do dia selecionado: total entregue, total recebido por forma de pagamento, adiantamento
- Selecionar data e vendedor (admin pode ver qualquer um; usuário comum vê sempre o próprio)
- Ver lista de entregas do dia com status de cada uma (PENDENTE, ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO)
- Registrar baixa de pagamento no Conta Azul — seleção individual ou em lote por checkbox
- Marcar entregas como "conferidas" (assinatura verificada pelo admin)
- Registrar uma nova despesa do dia (combustível, pedágio, hotel, manutenção, etc.)
- Ver amostras entregues no dia
- Ver atendimentos do dia
- Ver e editar KM inicial do veículo do dia
- Ver o VALOR A PRESTAR — só aparece quando o dia está "certo"; senão mostra um checklist do que falta (KM final, entregas pendentes, clientes sem atendimento)
- Acessar ficha completa do veículo
- **Conferir o dinheiro do dia** (cartão "Conferência do Dinheiro"): quem recebe o dinheiro conta cédula por cédula na calculadora do app e assina — é o passo que libera o fechamento
- Fechar o caixa do dia (muda status para FECHADO) — **só depois do dinheiro conferido, e nunca por quem conferiu**
- Imprimir relatório do caixa (`/caixa/impressao`)
- Conferir o caixa (admin: após revisão, marca como CONFERIDO)
- Reverter a conferência (admin: volta CONFERIDO → FECHADO)
- Reabrir o caixa (admin: volta FECHADO → ABERTO)
- Registrar devolução a partir de uma entrega do caixa
- **Conferir devoluções fisicamente** (cartão "Conferência de Devoluções"): contar a mercadoria que voltou no caminhão, comparar com o que o motorista marcou como devolvido, registrar sobras e cobrar faltas do motorista
- **Autorizar desconsiderar falta de devolução** com senha do responsável (ex.: produto que não foi carregado de manhã)
- **Baixar as cobranças da rota** (cartão "Cobranças da Rota"): títulos que o motorista/vendedor cobrou na rua chegam como "Aberto"; marcar o box e baixar dá a baixa oficial na parcela
- **Ver os títulos recebidos** (cartão "Títulos Recebidos"): baixas em dinheiro/cheque feitas na tela de Contas a Receber com o seu login, que somam no valor a prestar

---

## Status do caixa

| Status | Significado |
|--------|-------------|
| ABERTO | Em andamento, ainda pode ser editado |
| A CONFERIR | A folha foi impressa (ou o dia virou) e o dinheiro está esperando alguém contar |
| A FECHAR | Dinheiro conferido e assinado; falta só o fechamento |
| FECHADO | Encerrado. **Não aceita mais lançamento nenhum** naquele dia (despesa, baixa, devolução, adiantamento) |
| CONFERIDO | Status antigo (conferência pós-fechamento). Fica só nos caixas antigos; hoje a conferência é antes de fechar |

> **A CONFERIR** e **A FECHAR** só aparecem com a regra da conferência do dinheiro ligada
> (Configurações → Caixa — conferência do dinheiro). Com ela desligada, o caixa se comporta como antes.

---

## Como fazer (passo a passo real)

### Ver o caixa de hoje
1. Abra a aba Caixa
2. O caixa do dia é carregado automaticamente com a data e vendedor padrão
3. O resumo mostra: total a receber, recebido por forma de pagamento, adiantamento e saldo

### Ver caixa de outro dia ou vendedor
- **Outro dia:** use o seletor de data (só habilitado para `Pode_Ver_Historico_Caixa` ou `admin`; sem essa permissão, o campo fica bloqueado no dia atual)
- **Outro vendedor:** só visível para `admin` ou `Pode_Editar_Caixa`; escolha no select de vendedor
- O seletor mostra **só vendedores ativos**. Um vendedor inativo aparece apenas nos dias em que teve movimento de caixa (marcado como "inativo · teve caixa") — o histórico não se perde

### Registrar baixa dos recebimentos (individual)
> Desde 23/07/2026 a baixa é registrada **nas parcelas do próprio app** (o Conta Azul virou somente leitura). O botão continua o mesmo.
1. Na lista de entregas, localize a entrega com pagamento em Dinheiro, PIX ou Cartão
2. Marque o checkbox na coluna "CA" daquela entrega
3. Clique em **Processar selecionada(s)** — o sistema registra o recebimento nas parcelas do pedido em Contas a Receber (com histórico de pagamento por forma: dinheiro, PIX, cartão)

### Registrar baixa em lote
1. Marque os checkboxes de várias entregas de uma vez
2. A barra azul "Baixa CA" aparece no topo da lista com o total selecionado
3. Clique em **Processar N selecionada(s)** — todas as baixas são registradas de uma vez

**Como a baixa local funciona:** dinheiro entra na conta "Caixinha", PIX Asaas entra na conta financeira do Asaas (alimenta o relatório Saldos por Conta). Se o valor acertado na entrega for menor que a parcela por causa de devolução de mercadoria, a diferença fecha como **desconto** ("Devolução de mercadoria — conferência do caixa"). Valores marcados como "Vendedor responsável"/"Escritório responsável" **não baixam** — a parcela fica em aberto para essa parte.

**Pagamentos "PIX Asaas":** o dinheiro desse PIX **não** fica com o motorista — não entra no valor a prestar.

**Pedido ESPECIAL (desde 08/2026):** o título do especial **não é mais quitado sozinho na entrega**. O motorista só registra o que recebeu; a baixa acontece **aqui**, quando alguém confere o caixa e clica em Processar. Por isso:
- o especial pago em dinheiro aparece **em aberto** na lista até a conferência — é justamente o que deve ser conferido;
- **o caixa não fecha** enquanto houver especial com dinheiro sem baixa (entra nas pendências do fechamento);
- quem faz a baixa fica gravado como responsável dela (aparece no histórico do cliente e no ledger da parcela);
- o dinheiro do especial entra na conta **Caixinha**; PIX Asaas entra na conta do Asaas;
- **recebeu menos que o título?** A parcela fica **PARCIAL** e o saldo continua em aberto para cobrança — o app não quita "por bondade" nem inventa desconto;
- a baixa respeita a **condição de pagamento liberada** para o pedido: forma que a condição não permite é recusada, com a mensagem dizendo o que fazer (corrigir o lançamento da entrega ou trocar a condição do pedido);
- clicar duas vezes não duplica: o que já foi baixado é ignorado.

**"Escritório/Vendedor responsável" — quem ficou responsável FICA DEVENDO (decisão do dono, 08/2026):**
- não é recebimento: **não baixa título** (nem aqui, nem na baixa manual de Contas a Receber), não gera histórico de pagamento e o título continua **em aberto no nome do responsável** — é assim que o dono vê a lista em Contas a Receber e dá baixa quando descontar da pessoa;
- **não entra mais no "a prestar" do motorista**: antes, "Vendedor responsável" era cobrado do motorista no fechamento do dia *e* deixava o título aberto — o mesmo valor em dois lugares. Agora o motorista presta só o dinheiro que realmente recebeu do cliente. **A equipe vai notar que o valor a prestar diminuiu** — é esperado;
- se a entrega só tiver valores de responsável, o resultado da baixa vem como **"Não quita: só há valor de responsável"**, e isso **não trava** o fechamento do caixa.

**Selo "A CONFERIR" na lista de entregas:** o especial entregue e ainda não baixado aparece marcado como **A CONFERIR** — é o aviso de que aquele dinheiro já foi recebido pelo motorista e falta a baixa. Some assim que a baixa é feita. **Pedido cuja devolução foi TOTAL não aparece mais como A CONFERIR nem oferece a caixinha de Baixa CA**: a conta ficou marcada como devolvida e não há mais nada a fazer nessa linha (antes ela voltava pedindo conferência e o Processar respondia "JÁ QUITADO"). Devolução **parcial** é diferente: sobrou saldo, então o título continua precisando de baixa e o selo permanece.

**Painel de resultado da Baixa CA:** depois de clicar em Processar, o resultado de cada pedido fica na tela até você fechar (não é um aviso que some sozinho). Cinco estados:

| Estado | O que significa | O que fazer |
|---|---|---|
| **BAIXADO** (verde) | O recebido cobriu o título — parcela quitada | Nada |
| **BAIXA PARCIAL** (âmbar) | Entrou parte do dinheiro; o saldo continua em aberto (o painel mostra quanto falta) | Cobrar o saldo — ele fica no Contas a Receber |
| **SEM BAIXA** (âmbar) | Nada foi baixado — só havia valor de "responsável" | O título fica no nome do responsável; a baixa sai quando o valor for descontado dele |
| **JÁ QUITADO** (cinza) | Aquele recebimento já tinha sido baixado antes | Nada — clicar duas vezes não duplica |
| **ERRO** (vermelho) | Não deu para baixar (ex.: forma não permitida pela condição) | Ler a mensagem: ela diz o que corrigir |

**Recebido a mais que o título:** se o dinheiro conferido passa do valor do título, a sobra **não é baixada em parcela nenhuma** — o painel mostra a linha "Sobra de R$ X — recebido a mais do que o título… Confira com o motorista e acerte com o cliente". Nada é lançado no chute.

**Pix comum e cartão no pedido especial:** quitam normalmente, junto com o dinheiro. Enquanto não houver conta financeira definida para essas formas, a baixa fica com a conta **"não informada"** em Saldos por Conta (o app não escolhe conta no chute) — o valor está registrado e o título fecha.

### Baixar as cobranças da rota (títulos cobrados na rua)
O cartão **Cobranças da Rota** aparece quando o motorista/vendedor registrou alguma cobrança de título naquele dia (seção **"Cobranças a fazer"**, na tela **Rota → Entregas**). Cada linha mostra o cliente, a parcela, quanto foi cobrado, a forma de pagamento e a carga de origem.

1. Cobrança registrada na rua chega com o badge azul **"Aberto"** — a parcela **ainda não foi baixada**. Isso é de propósito: a baixa oficial sai aqui, depois da conferência
2. Marque o box de cada cobrança conferida (ou **Todas**) e clique em **Baixar selecionadas** — o sistema registra o pagamento na parcela do Contas a Receber: valor cheio → **PAGO**, valor parcial → **PARCIAL** (o restante continua em aberto)
3. Fica gravado **quem cobrou na rua** e **quem baixou no caixa** (aparece no histórico do cliente e no ledger da parcela)
4. Cobrança marcada como **"não conseguiu cobrar"** aparece só como registro (sem box, riscada, com "Escritório resp." ou "Vendedor resp.") — o título continua em aberto e **não gera devolução**
5. O que foi cobrado em **dinheiro** entra na linha "+ Cobranças da rota (dinheiro)" do **valor a prestar**; PIX/cartão não passam pela mão do motorista e não somam
6. **O caixa não fecha** com cobrança de rota ainda em "Aberto" — baixe todas antes de fechar o dia
7. Clicar duas vezes não duplica: cobrança já baixada devolve "já estava baixada" e é ignorada

### Títulos recebidos (baixa manual do Contas a Receber)
O cartão **Títulos Recebidos** aparece quando alguém quitou um título **em dinheiro ou cheque** pela tela **Financeiro → Contas a Receber** usando o seu login. Como o valor ficou fisicamente com essa pessoa, ele entra no caixa dela **do dia em que a baixa foi feita**.

1. Cada linha mostra o cliente, o pedido/parcela e o valor recebido
2. O total soma na linha **"+ Títulos recebidos (Contas a Receber)"** do **valor a prestar** — a pessoa entrega esse dinheiro no fechamento, igual à cobrança da rota
3. A baixa manual só aceita **Dinheiro ou Cheque** e exige a permissão `Pode_Baixar_Contas_Receber_Manual`. Boleto/Pix/cartão/transferência não entram por ali — são baixados na **Conciliação Bancária**, quando o dinheiro aparece no extrato
4. Se o caixa do dia já estiver **fechado ou conferido**, a baixa é recusada até o caixa ser reaberto (senão o dinheiro entraria num dia já prestado)
5. Estornar o pagamento no Contas a Receber tira o valor do caixa automaticamente

### Registrar uma despesa
1. Clique em **+ Despesa** (botão no topo ou no card do veículo)
2. Escolha a categoria (combustível, pedágio, hotel, manutenção, outro)
3. Informe valor e descrição
4. Salve — a despesa é vinculada ao caixa do dia

### Definir adiantamento
1. No card de resumo, localize o campo **Adiantamento (R$)**
2. Digite o valor e clique em **Salvar** (visível para `Pode_Definir_Adiantamento`, `Pode_Editar_Caixa` ou `admin`)
3. O adiantamento é **somado** ao valor a prestar (é dinheiro que o motorista recebeu adiantado e deve devolver)
4. O caixa mostra **quem lançou e quando** ("Lançado por Fulano · dd/mm às hh:mm")

**Proteções (desde 07/2026, após um adiantamento de R$ 200 sumir sem rastro):**
- **Diminuir ou zerar** um adiantamento já lançado pede **confirmação** na tela ("Tem certeza que deseja EXCLUIR/DIMINUIR...?")
- Só pode alterar um adiantamento já lançado: **quem lançou**, `admin`, ou quem tiver a permissão **`Pode_Alterar_Adiantamento_Alheio`** ("Alterar Adiantamento de Outros", na aba Vendedores) — para os demais o sistema recusa dizendo quem foi o autor
- **Toda mudança fica no log de auditoria**: quem mudou, quando, de quanto → para quanto
- Caixa fechado/conferido não aceita mudança de adiantamento (reabra antes)

### Ver o VALOR A PRESTAR (só aparece com o dia "certo")
O valor a prestar de contas fica **escondido** enquanto o dia não estiver completo. No lugar do valor aparece um checklist laranja "Falta para fechar o dia" com o que ainda precisa ser feito. O valor volta a aparecer sozinho assim que tudo for resolvido. Escondem o valor (para todos, motorista e escritório):
- **KM final do veículo não informado** (quando o dia usou veículo/modo presencial) — o KM final é informado no fechamento do ponto/diário
- **Entregas ainda pendentes** — pedidos do embarque do dia que ainda não foram marcados como entregues/devolvidos
- **Clientes da rota sem atendimento** — clientes com venda marcada para o dia da semana que não tiveram atendimento, pedido nem entrega

Observação: devoluções e baixas de dinheiro **não** entram nesse checklist (são tratadas na parte financeira/fechar caixa, mais abaixo).

### Conferir o dinheiro (passo antes de fechar)

O caixa entra na fila de conferência **ao imprimir a folha** (a folha é a prestação de contas: ao clicar em Imprimir o app pergunta se é para enviar; "2ª via" não reenvia). Quem não imprimir entra sozinho **na virada do dia**, à meia-noite.

1. Quem tem `Pode_Conferir_Dinheiro_Caixa` abre o caixa daquela pessoa (pela agenda ou pelo seletor) e clica em **Conferir o dinheiro**
2. Abre a **calculadora**: digite quantas notas de R$ 200, 100, 50, 20, 10, 5 e 2 e quantas moedas de R$ 1,00 / 0,50 / 0,25 / 0,10 / 0,05. O total sai da contagem (não é digitado à mão). Cheque ou vale entram em "+ outro valor"
3. O app compara com o valor a prestar na hora:
   - **Bate certo** → confirme e pronto
   - **Diferença dentro da sua quebra de caixa** → você mesmo fecha, com **motivo obrigatório**
   - **Diferença acima da sua quebra** → precisa escolher quem autoriza e digitar a **senha** dessa pessoa
4. Caixa de **R$ 0,00** (dia sem movimento) também precisa de conferência — é um clique só ("Conferi: não havia dinheiro a receber")
5. Se houver diferença, o app oferece **criar uma tarefa na agenda** para cobrar a pessoa. O **vale não é lançado automaticamente**: se for descontar, lance à mão no Contas a Pagar
6. Fica gravado quem conferiu, quanto contou, a hora, a contagem nota a nota, a diferença, o motivo e quem autorizou — e isso sai também na folha impressa

**Regras que o app não deixa furar:**
- O dono do caixa **nunca** confere o próprio dinheiro
- **Quem conferiu não fecha** o mesmo caixa (o botão Fechar some para essa pessoa)
- Se o valor a prestar mudar depois da conferência (despesa lançada atrasada, baixa nova), a conferência **cai sozinha** e o caixa volta para "A conferir"
- Quem conferiu (ou o admin) pode **Desfazer conferência** enquanto o caixa não estiver fechado

### Fechar o caixa
1. Verifique as pendências — se houver, o botão fica desabilitado e as pendências aparecem listadas
2. Com a regra ligada, **"Dinheiro ainda não conferido"** é uma das pendências: sem a assinatura de quem contou, não fecha
3. Clique em **Fechar Caixa** — o sistema pode alertar sobre entregas sem conferência de assinatura (mas não bloqueia)
4. Confirme — o status muda para FECHADO e fica gravado **quem fechou**

> **Título devolvido não é pendência (corrigido em 08/2026).** Quando a devolução zera o título (a conta fica marcada como **devolvida**, ou cancelada), não existe mais dinheiro a prestar naquela linha — ela sai da lista de "baixas de recebimento pendentes" e **não trava mais o fechamento**. Antes disso, um pedido devolvido continuava contando como pendência e o botão Fechar Caixa ficava desabilitado sem que houvesse nada a fazer. **Especial com dinheiro de verdade ainda em aberto continua travando**, como sempre.

> **Baixa parcial não trava mais o fechamento (corrigido em 08/2026).** Quando o motorista traz menos do que o valor do especial e o caixa processa a Baixa CA, o título fica **parcial** (o saldo continua em aberto no Contas a Receber, para cobrar depois). Essa linha já foi baixada no caixa — não há mais dinheiro daquele dia a prestar — então ela **sai das pendências** e o botão Fechar Caixa continua liberado. Antes, o botão ficava desabilitado para sempre nesse caso, sem nenhuma ação possível na tela.

> **O que a tela mostra é o que o servidor aceita.** A contagem de **"baixa(s) de recebimento pendente(s)"** (nome novo — antes dizia "dinheiro", mas a conta sempre incluiu mais que dinheiro) usa exatamente a mesma regra do fechamento: entram as entregas com **dinheiro, PIX ou cartão** recebidos pelo motorista que ainda não foram baixados (Baixa CA / quitação do especial). **Não contam** como pendência: título já baixado, **baixa parcial** (o que falta vira cobrança normal, não prende o caixa), título devolvido ou cancelado, e a **linha de responsável pela cobrança** (escritório ou vendedor ficou de cobrar depois). A mensagem de recusa do servidor usa exatamente esse mesmo texto, para a tela e o toast não falarem duas línguas.

> **Caixa fechado não se altera.** Depois de fechado, aquele dia não aceita despesa, baixa, devolução nem mudança de adiantamento — nem para o admin. Para mexer, é preciso reabrir.

### Imprimir relatório do caixa
> **Atenção:** o botão **Imprimir** só aparece quando o dia está pronto — KM final informado, sem entregas pendentes e **conferência de devoluções confirmada**. Antes disso o botão fica escondido e a folha impressa não mostra o valor a prestar (evita imprimir sem conferir).
1. Clique em **Imprimir** (disponível com o caixa FECHADO ou CONFERIDO)
2. O sistema navega para `/caixa/impressao?data=...&vendedorId=...`
3. A tela de impressão abre; imprima normalmente

O relatório sai em **2 folhas A4**:
- **Folha 1 (conferência):** valor a prestar em destaque + campos para preencher à mão (Contado, Diferença, Conferido por) + todas as entregas do dia com checkbox e a coluna "Dinheiro" (soma do que deve estar no caixa, com subtotal) + assinaturas do motorista e do conferente. Cabe até ~52 entregas na folha 1; acima disso a lista continua numa folha extra.
- **Folha 2 (apoio):** veículo/KM/média/adiantamento, composição do valor a prestar (o que entra e o que não entra no caixa), despesas detalhadas, resumo das entregas, conferência de devoluções, amostras, **resumo** dos atendimentos/pedidos do dia (contagem por tipo + números dos pedidos; o detalhe de cada atendimento fica só na tela do caixa) e linhas para observações do conferente.

### Conferir o caixa (admin)
1. Selecione o vendedor e o dia desejado
2. Revise as entregas, assinaturas e pagamentos
3. Adicione uma observação administrativa se necessário
4. Clique em **Conferir Caixa** — o status muda para CONFERIDO

### Reverter conferência (admin)
- Clique em **Reverter Conferência** no caixa com status CONFERIDO
- O status volta para FECHADO

### Reabrir caixa (admin)
- Clique em **Reabrir Caixa** no caixa com status FECHADO
- Com a conferência do dinheiro ligada, o app **exige o motivo** da reabertura
- O status volta para ABERTO, os totais são recalculados ao fechar novamente e a **conferência do dinheiro é cancelada**: o caixa volta para a fila de quem confere, que precisa contar de novo antes de o caixa poder ser fechado

### Registrar devolução
- Na linha de uma entrega, clique no botão de devolução (ícone de retorno)
- O modal de devolução abre vinculado àquele pedido e àquele caixa
- Ao salvar, o app **emite a NF-e de devolução automaticamente** (pedido com nota; especial e bonificação não geram NF). Se a emissão falhar, a devolução fica registrada e dá para emitir depois em Pedidos → aba Devoluções
- Ao salvar, o app também **cancela no Asaas os boletos/PIX ainda pagáveis** do pedido — na devolução total porque o cliente não deve mais nada, e na parcial porque o boleto antigo cobra um valor que mudou (reemita o boleto pelo valor novo se o cliente for pagar assim)

> **É o registro da devolução aqui que encerra a cobrança — e ele não espera o caixa fechar.**
> No mesmo clique de salvar a devolução: as parcelas são canceladas (devolução total) ou
> reduzidas (parcial), os **boletos/PIX ainda pagáveis são cancelados no Asaas**, a mercadoria
> volta ao estoque e a NF-e de devolução é emitida. Marcar a entrega como "Devolvido" no
> celular do motorista **não** faz nada disso — é só o registro do que aconteceu na porta,
> justamente para o motorista poder pedir correção se marcou errado.

### Imprimir a NF de devolução (DANFE) no próprio Caixa
- Assim que a NF-e de devolução é **autorizada** pela SEFAZ (leva segundos), aparece na linha da entrega o botão verde **"🧾 NF dev. `<número>`"** — clique para abrir o PDF da DANFE, imprimir e arquivar junto com o caixa do dia
- Enquanto a nota ainda está na SEFAZ aparece "NF dev. emitindo…" — recarregue a tela em instantes
- O botão aparece para quem tem `Pode_Fazer_Devolucao` (ou acesso a Notas Fiscais)

### Conferir devoluções (mercadoria que voltou fisicamente)
O cartão **Conferência de Devoluções** aparece automaticamente quando o dia tem alguma devolução registrada nas entregas. Ele lista cada produto que **deveria voltar** no caminhão, com o número do pedido e o cliente de origem.

1. Quem tem a permissão `Pode_Conferir_Devolucao_Caixa` recebe a mercadoria e digita, produto por produto, **quanto voltou de verdade** (use 0 se nada voltou)
2. O sistema compara:
   - **Bateu** → linha verde "Confere ✓"
   - **Voltou a mais** → sobra, fica só registrada (não gera valor nem mexe em estoque)
   - **Voltou a menos** → falta: o sistema calcula o valor pela tabela de cobrança do motorista (configurada na aba Vendedores; padrão "À vista - Funcionário") e mostra "Cobrar X — R$ Y"
3. Produto que voltou **sem devolução registrada**: use "+ Adicionar produto que voltou sem devolução" (sobra avulsa, só registro)
4. Clique em **Confirmar conferência** — o total das faltas é **somado ao valor a prestar** do caixa como a linha "Faltas de devolução"
5. Depois de confirmada, a conferência fica travada (só consulta); ela aparece também no relatório impresso do caixa
6. **Importante:** se o dia teve devolução, o caixa **só fecha** depois da conferência confirmada
7. A conferência **não movimenta estoque** — o estoque retorna quando o faturamento emite a nota de devolução (fluxo normal)
8. Enquanto a conferência não estiver confirmada, o **VALOR A PRESTAR fica escondido** e o **botão Imprimir não aparece** (evita imprimir/prestar contas sem conferir)

### Desconsiderar falta — pedido de autorização à distância
Quando a falta não é culpa do motorista (ex.: o produto não foi carregado de manhã), a falta pode ser desconsiderada, mas só com autorização de um responsável. O fluxo NÃO usa mais a senha digitada na hora por quem confere — quem confere **manda um pedido** e o responsável autoriza no próprio aparelho:

1. Digite a contagem (quanto voltou). Na linha com falta, clique em **Pedir autorização**.
2. Escolha **quantas unidades** desconsiderar (pode ser só parte; o restante continua cobrado), o **motivo** e **quem vai autorizar** (só aparecem pessoas com `Pode_Autorizar_Desconsiderar_Devolucao`). Clique em **Enviar pedido**.
3. A linha fica **"Aguardando autorização de Fulano"** e a tela **atualiza sozinha a cada 10 segundos**. Dá para **Cancelar pedido**.
4. O responsável, ao abrir o app em qualquer tela, recebe um **pop-up** com o produto, a quantidade, o motivo e quem pediu. Ele digita a **própria senha** e **Autoriza**, ou **Rejeita** (pode escrever o motivo). Funciona no celular dele — hoje o combinado é avisar a pessoa para olhar o sistema (aviso por WhatsApp fica para depois).
5. Autorizado → a linha vira "X desconsiderada(s) · aut. Fulano ✓". Rejeitado → volta a ser cobrado, com opção **Pedir de novo**.
6. **Autorizar eu mesmo:** se quem está conferindo também tem a permissão de autorizar, o modal mostra a opção "Prefiro autorizar eu mesmo agora" (digita a própria senha na hora, sem pedir a ninguém).
7. Enquanto houver um pedido pendente, **não dá para confirmar a conferência** (espere a resposta ou cancele).
8. Fica registrado quem autorizou, quando e o motivo (visível no caixa, no relatório impresso e no log de auditoria).

### Reabrir conferência de devoluções
- Com o caixa ABERTO, quem tem `Pode_Reverter_Caixa` ou `admin` pode clicar em **Reabrir conferência** para corrigir uma conferência confirmada (a cobrança é recalculada ao confirmar de novo)

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Caixa` |
| Ver o próprio caixa | `Pode_Acessar_Caixa` (qualquer usuário com acesso) |
| Ver caixas de outros vendedores | `Pode_Editar_Caixa` ou `admin` |
| Ver caixas de outros dias | `Pode_Ver_Historico_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Registrar adiantamento | `Pode_Definir_Adiantamento` ou `Pode_Editar_Caixa` ou `admin` |
| Fechar caixa | `Pode_Fechar_Caixa` ou `Pode_Editar_Caixa` ou `admin` — **só com o dinheiro conferido, e nunca quem conferiu** |
| Conferir o dinheiro do caixa | `Pode_Conferir_Dinheiro_Caixa` ou `admin` (nunca no próprio caixa) |
| Fechar conferência com diferença até o limite | o próprio conferente, pela **quebra de caixa** definida no usuário (motivo obrigatório) |
| Autorizar diferença acima da quebra | `Pode_Autorizar_Diferenca_Caixa` ou `admin` — autoriza com a **própria senha** |
| Ligar/desligar a regra da conferência | `admin`, em Configurações → Caixa |
| Registrar baixa no Conta Azul | `Pode_Baixar_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Baixar cobranças da rota | `Pode_Baixar_Caixa` ou `Pode_Editar_Caixa` ou `admin` (com o caixa ABERTO) |
| Conferir e reverter conferência | `Pode_Reverter_Caixa` ou `admin` (reverter); `admin` ou `Pode_Editar_Caixa` (conferir) |
| Reabrir caixa fechado | `Pode_Reverter_Caixa` ou `admin` |
| Registrar devolução | `Pode_Fazer_Devolucao` ou `admin` |
| Digitar/confirmar a conferência de devoluções | `Pode_Conferir_Devolucao_Caixa` ou `admin` (demais usuários veem só consulta) |
| Pedir autorização para desconsiderar falta | `Pode_Conferir_Devolucao_Caixa` ou `admin` (envia o pedido) |
| Receber o pop-up e autorizar/rejeitar com senha | `Pode_Autorizar_Desconsiderar_Devolucao` ou `admin` (autoriza com a própria senha, no próprio app) |
| Reabrir conferência de devoluções | `Pode_Reverter_Caixa` ou `admin` (com o caixa ABERTO) |

---

## Depende de / Interfere em

- **Embarque / Entregas** — as entregas do caixa vêm dos embarques criados para aquele motorista
- **Despesas** — são acessíveis também pela aba própria (`/despesas`)
- **Contas a Receber** — a baixa registra o recebimento na parcela correspondente do app (dinheiro → Caixinha, PIX Asaas → conta Asaas; nada vai mais ao Conta Azul desde 23/07/2026). A baixa das **cobranças da rota** também sai daqui, na parcela que o motorista cobrou na rua
- **Minhas Entregas (aba Cobranças)** — as cobranças deste cartão vêm do que o motorista/vendedor registrou na rua
- **Embarque** — o escritório pendura os títulos a cobrar na carga (seção "Cobranças na Carga")
- **Veículos** — o KM inicial e a ficha do veículo do dia são acessíveis dentro do caixa

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Caixa/CaixaDiarioPage.jsx` | Tela principal do caixa com todos os fluxos |
| `frontend/src/pages/Caixa/NovaDespesaModal.jsx` | Modal de nova despesa |
| `frontend/src/pages/Caixa/ConferenciaDevolucaoCard.jsx` | Cartão de conferência de devoluções + modal de autorização com senha |
| `frontend/src/pages/Caixa/ConferenciaDinheiroCard.jsx` | Cartão da conferência do dinheiro + calculadora de cédulas e moedas |
| `frontend/src/pages/Tarefas/CaixasPendentesAgenda.jsx` | Blocos "Caixas a conferir", "Caixas a fechar" e "Conferi hoje" na agenda |
| `frontend/src/pages/Admin/Configuracoes/ConferenciaCaixaConfigCard.jsx` | Liga/desliga a regra da conferência e a regra de segunda a sexta |
| `backend/services/caixaConferenciaService.js` | Regras da conferência: valor esperado, contagem, quebra de caixa, filas |
| `backend/services/caixaConferenciaWorker.js` | Virada do dia (envia para conferência) e aviso de caixa atrasado no WhatsApp |
| `backend/config/caixaConferenciaConfig.js` | Chave que liga a exigência (e a regra de dias úteis) |
| `backend/utils/diasUteisCaixa.js` | Caixa só de segunda a sexta: sáb/dom entram no caixa da segunda |
| `frontend/src/pages/Caixa/CobrancasRotaCard.jsx` | Cartão "Cobranças da Rota" com seleção por box e baixa das parcelas |
| `frontend/src/pages/Pedidos/ModalDevolucao.jsx` | Modal de devolução acessível pelo caixa |
| `frontend/src/pages/Veiculos/VeiculoFicha.jsx` | Ficha do veículo embutida no caixa |
| `frontend/src/services/caixaService.js` | Chamadas de API do caixa |
| `backend/src/routes/caixa.js` | Rotas do backend |

## Selo GPS das entregas (novo — 07/2026)

Cada entrega listada na conferência do dia mostra um emoji ao lado do nome do cliente, dizendo ONDE o motorista concluiu a entrega em relação ao ponto GPS cadastrado:

- **📍✅** concluída no ponto do cliente;
- **📍❗** concluída LONGE do ponto cadastrado (tocar no emoji mostra a distância);
- **📍➖** o aparelho não informou GPS na conclusão;
- **📍❓** cliente sem ponto GPS cadastrado.

Cliente balcão não mostra selo. Tocar no emoji abre o detalhe com a distância. Entregas concluídas no ponto vão, com a repetição, gerando o selo "ponto confirmado" do cliente automaticamente.

---

## Caixa só de segunda a sexta (opcional, em Configurações)

Com a chave **"Caixa só de segunda a sexta"** ligada (Configurações → Caixa):

- Sábado e domingo **não abrem caixa**. Quem tentar abrir o caixa nesses dias é levado para a segunda seguinte, com aviso na tela
- O caixa de **segunda-feira soma sábado + domingo + segunda**: entregas, despesas e cobranças de rota do fim de semana entram nele
- O **registro** da entrega/despesa não muda: a data real continua sendo o sábado. Muda só **em qual caixa ela é prestada**
- Caixas de fim de semana que já existiam no banco continuam como estão (só leitura)

## Avisos automáticos da conferência

- **Agenda (aba Tarefas):** quem confere vê o bloco **"Caixas a conferir"** — o aviso nasce **no dia seguinte** ao do caixa (conferindo no mesmo dia, nunca vira cobrança). Quem fecha vê **"Caixas a fechar"** assim que o dinheiro é conferido. E **"Conferi hoje"** mostra o que a pessoa já conferiu
- **WhatsApp:** caixa parado sem conferir por N dias (padrão 2, configurável) gera **uma mensagem por dia** para quem confere, juntando todos os caixas atrasados. Mensagem interna, pelo bot da Ana
