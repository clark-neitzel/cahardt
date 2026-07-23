# Conciliação Bancária

**Rota:** `/financeiro/conciliacao` · **Permissão:** `Pode_Acessar_Financeiro_Gerencial` (ou admin)

Confere o **extrato do banco** contra o que o app registrou: cada entrada/saída do extrato deve corresponder a algo no sistema (boleto do Contas a Pagar, recebimento do Contas a Receber, tarifa…). É o que transforma o saldo de "fé" em fato conferido.

A lógica da tela é uma pergunta só: **"este lançamento do banco é O QUÊ no sistema?"** Cada linha pendente tem no máximo **dois botões**:

- **Conciliar** — aparece quando o sistema encontrou algo com **data E valor batendo exatos**: uma baixa já registrada (aí só amarra) **ou um boleto em aberto do Contas a Pagar** (aí a baixa é criada na hora, com a data e o banco do extrato, e vai para o Conta Azul). Os dados do boleto/nota (fornecedor, NF, parcela, vencimento) aparecem antes de confirmar.
- **Buscar…** — para todo o resto. Abre a janela única de busca (ver abaixo).

> **Entradas (crédito) também dão baixa por aqui** desde 07/2026: o Buscar… de um crédito lista as **contas a receber em aberto** e a baixa é criada na conta do próprio extrato, já conciliada (ver seção da janela Buscar…). O que pagou na **entrega** continua baixando pelo Caixa ("Baixa CA"), como sempre.

## Conta Asaas: o extrato entra SOZINHO (sem OFX)

Para a conta do **Asaas** (onde caem os PIX da entrega e os boletos emitidos pelo app), **não é preciso importar arquivo nenhum**: o sistema busca o extrato direto no Asaas **a cada 30 minutos** (janela dos últimos 7 dias, sem duplicar) e **já roda a conciliação automática** em seguida. Ao selecionar essa conta na tela:

- Aparece o botão **"Buscar do Asaas"** no topo (contorno verde) — busca o extrato na hora, para quem não quer esperar os 30 minutos. O aviso abaixo dos filtros mostra a data/hora da última busca.
- O restante do fluxo é idêntico ao de qualquer banco (conciliar, buscar, ignorar).
- Se o botão não aparece, a integração Asaas não está configurada no servidor ou a conta financeira do Asaas não foi vinculada (falar com o administrador).

## Fluxo de uso (demais bancos — via arquivo OFX ou PDF)

1. **Exportar o extrato do banco em OFX** — todo internet banking tem essa opção (às vezes "Money/OFX" ou "Extensão .ofx"), geralmente em Extrato → Exportar/Salvar como.
   - **Conta PJ do Conta Azul:** o extrato dela **entra sozinho** (desde 07/2026): o sistema gera as linhas a cada 3 horas a partir dos movimentos sincronizados do Conta Azul (recebimentos, pagamentos e transferências) e elas já nascem **conciliadas** (vinculadas às baixas) ou com etiqueta **transferência** — não precisa importar arquivo. O PDF do extrato ("Extrato Conta Azul") continua aceito para conferência/histórico antigo: o sistema lê as linhas do PDF original (não scan) e **não duplica** com as linhas automáticas (mesmo valor/sentido em ±2 dias é reconhecido).
2. Na tela, **escolher o banco/caixa** (mesmas contas do Conta Azul usadas nas baixas) e clicar **Importar OFX/PDF**.
   - Importar o mesmo arquivo (ou períodos sobrepostos) de novo **não duplica** (identidade FITID; no PDF, uma identidade estável calculada de data+descrição+valor); só **atualiza a descrição** das linhas que já existiam.
3. Clicar **"Conciliar automático"** — fecha sozinho todo lançamento com **exatamente uma** baixa já registrada de mesmo valor (±R$ 0,01) e data próxima (±3 dias) na mesma conta. (O automático **não** cria baixa em boleto aberto — isso sempre pede um clique seu no Conciliar da linha.)
   - **Conta do Asaas (desde 07/2026):** os créditos "Cobrança recebida" trazem o código da cobrança (`pay_...`), e o automático usa esse código para achar a baixa **exata** do boleto/PIX — funciona mesmo quando: o cliente pagou **com juros/multa** (a diferença fica registrada no grupo como "Juros/multa recebidos", aceita até 10% do crédito); o dinheiro caiu **mais de 3 dias** depois do pagamento (fim de semana); ou há **dois boletos de mesmo valor** no mesmo dia (cada código acha o seu). Crédito MENOR que a baixa ou juros acima do teto continuam pendentes para análise manual.
4. Revisar os pendentes: **Conciliar** quando a sugestão está certa; **Buscar…** para escolher manualmente.
5. **Desfazer** (ícone de seta) volta qualquer conciliado/ignorado para pendente. Num lançamento conciliado **em grupo**, o desfazer **dissolve o grupo inteiro** (a baixa criada na conciliação NÃO é estornada — se preciso, estorne no Contas a Pagar).

## A janela "Buscar…" (o que é este lançamento?)

Modelo do Conta Azul. Mostra, para o lançamento clicado:

- **Janela de período**: boletos com vencimento até **±15 dias** da data do débito (padrão), ajustável para ±30, ±60 ou Tudo.
- **Busca** por fornecedor, descrição ou nº da nota — vale para as duas listas.
- **Boletos em aberto no Contas a Pagar** (só para saídas): TODOS os não conciliados do período, com fornecedor, NF, parcela, vencimento e saldo. Os que fecham com o valor do extrato ganham a etiqueta verde **"valor bate"** e vêm primeiro. Dá para marcar **um ou mais** (um débito pagando vários boletos).
- **Contas a receber em aberto** (só para ENTRADAS/créditos): espelho do de cima. Quando o dinheiro caiu no banco/Asaas (PIX na chave da empresa, transferência, PIX gerado no escritório), a janela lista as contas a receber em aberto do período (cliente, pedido, parcela, vencimento, saldo), com **"valor bate"** nas que fecham. Marque a do cliente, escolha a **forma de pagamento** e **Conciliar** — a **baixa é dada ali mesmo, na conta do próprio extrato**, e o crédito já fica conciliado (um passo só; não precisa ir ao Contas a Receber antes). Se o valor do extrato for menor, a última fica **parcial**; se sobrar, o excedente vira **diferença** com motivo.
- **Pagamentos/recebimentos já baixados sem par no extrato**: baixas registradas que ainda não foram amarradas — para o caso de a baixa já existir com data/valor um pouco diferentes.
- **"+ Somar outro lançamento do banco"**: o caso raro de 2 PIX pagarem 1 boleto — marca-se os dois lançamentos.
- Ao marcar boleto em aberto: **forma de pagamento** (o sistema sugere pela descrição: PIX/TED/boleto) e campos de **juros, multa e desconto** — o extrato traz o total que saiu, o sistema separa. O rodapé mostra a conta fechando ao vivo: quita tudo, fica **parcial** no último boleto (mostra quanto sobra) ou aponta o que não fecha.
- **Diferença de valor** (quando só há baixas registradas marcadas e não fecha): dá para conciliar mesmo assim, mas é **obrigatório dizer o que é** (tarifa do banco, juros pagos a mais, desconto, arredondamento, erro de lançamento, outro+descrição). A diferença e o motivo ficam gravados e aparecem em âmbar na linha conciliada — nunca somem.
- No rodapé da janela: **"Cadastrar despesa"** (a saída nunca foi lançada no sistema — ver seção abaixo), **"Transferência entre contas"** (ver seção abaixo) e **"Ignorar"** (tarifa; pede o motivo).

## Créditos IDENTIFICADOS (Venda NNNN = pedido NNNN) — certeza, não sugestão

No extrato da Conta PJ do CA (PDF), as linhas "Recebimento de cobrança - **Venda 1557** - 1/1" trazem o número da venda — e a numeração é **compartilhada** com o app (Venda 1557 = pedido 1557). O sistema usa isso como **identificação com certeza**:

- A linha mostra um painel **verde**: **"✓ Venda 1557 · parcela 1/1 · Conciliado no CA"** + pedido, cliente e a baixa correspondente. O botão vira **"Confirmar"** (não é palpite por valor).
- Se a baixa é R$ 1,50 maior que o crédito, é o **boleto com tarifa**: ao confirmar, a diferença fica registrada e a **despesa da tarifa é gerada** automaticamente.
- Se a venda foi identificada mas o **valor não fecha** (nem com a tarifa), o painel fica **âmbar** com o motivo — nada é conciliado sem conferência.
- O selo **"Conciliado no CA" / "Não conciliado no CA"** é o status da conciliação DO Conta Azul (contexto: lá já estava pronto ou não).
- Botão **"Confirmar identificadas (N)"** no topo: confirma de uma vez todas as identificadas que fecham (exato ou com tarifa) — um clique do usuário; as que não fecham ficam para análise. Nada roda sozinho.
- Sem identificação (ex.: PIX de cliente, sem nº de venda), vale a **sugestão** por valor/data como sempre — claramente separada das identificadas.
- Se os lançamentos foram importados antes desse recurso, **reimporte o mesmo PDF** (não duplica) — a identificação é preenchida nas linhas existentes.

## Diferença composta (juros E tarifa juntos) — decompor

Quando o crédito não fecha com a baixa por **mais de um motivo** (ex.: cliente pagou boleto com **juros de R$ 16,64** e o CA descontou a **tarifa de R$ 1,50** → diferença de R$ 15,14), use o quadro **"Decompor a diferença"** no Buscar…: campos **Tarifa / Juros-multa / Desconto**, com atalho **"+ Tarifa do boleto CA (R$ 1,50)"**. Ao digitar a tarifa, o app **recalcula o restante** e oferece **"usar R$ X como juros/multa"** com um clique. Fecha quando `banco = baixa + juros − tarifa − desconto`; a tarifa decomposta **gera a despesa automaticamente**. O motivo composto fica registrado na linha ("Juros/multa R$ 16,64 · Tarifa R$ 1,50"). Para diferença de motivo único, o seletor simples continua disponível.

## Débitos "Nome não encontrado" — identificar no CA

Os pagamentos de boleto na Conta PJ vêm sem nome ("Pagamento de Boleto para Nome não encontrado (Do…"). O botão **"Identificar débitos no CA (N)"** varre as contas a pagar do Conta Azul e descobre, pelo par exato **data + valor da baixa nesta conta**, de quem é cada débito — preenchendo **fornecedor, descrição da despesa e nº da nota** nas linhas (aí a busca por fornecedor funciona). Roda em segundo plano (~1–2 min; recarregue a tela). Só grava quando o match é **único** — ambíguo fica de fora, sem chute.

## Baixa no banco errado — ver e corrigir sem ir ao CA

Se uma baixa foi lançada em **outra conta** (ex.: despesa baixada "no Sicoob" mas o dinheiro saiu da Conta PJ), ela não aparece na conciliação da conta certa. Ao **buscar** no Buscar… (fornecedor, valor, pedido…), o app mostra a seção âmbar **"Achadas em OUTRAS contas (banco errado?)"** com o banco onde a baixa está. O botão **"Corrigir para esta conta (app + CA)"** move a baixa para a conta do extrato **no app e no Conta Azul** (quando a baixa tem vínculo lá — senão corrige só no app e avisa para conferir no CA). Depois é só marcar a baixa e Conciliar. Não precisa estornar na mão.

## Lançar tarifas em lote (várias despesas de uma vez) e já conciliar

Para **tarifas repetidas** — taxa de boleto, taxa de PIX do Asaas, cada uma com seu número de fatura — não precisa cadastrar uma por uma:

- Todo lançamento **pendente** (entrada ou saída) tem uma **caixinha de seleção** (há um "selecionar todos" no cabeçalho). Com linhas marcadas, a barra verde oferece: **Conciliar com o par (N)** — fecha as que têm identificação ou sugestão; **Lançar despesas (N)** — só as saídas, vira despesa paga+conciliada (tarifas repetidas); **Ignorar (N)** — pede UM motivo e aplica em todas.
- Aparece a barra **"N saída(s) selecionada(s)"** → botão **"Lançar despesas e conciliar"**.
- No pop-up, escolha **uma vez só**: o **fornecedor** (ex.: Asaas), a **categoria da DRE** (ex.: Tarifas de Boletos) e a **forma de pagamento** (ex.: Depósito bancário). A prévia lista todas as linhas com valor e total.
- Ao confirmar, **cada linha vira sua própria despesa** já **paga e conciliada**, no banco deste extrato — mantendo a descrição e o nº do documento do banco (cada tarifa fica identificável) — e vai para o Conta Azul. Não precisa clicar em "Conciliar" depois.
- Se alguma falhar (ex.: já tinha sido tratada), as demais são lançadas normalmente e o pop-up mostra a lista das que não deram certo. Máximo de 200 por vez.
- Só **saídas pendentes** entram no lote (as entradas/"cobranças recebidas" não têm caixinha).

## Transferência entre contas (dinheiro movido entre os bancos da empresa)

Para lançamentos que são dinheiro **da própria empresa trocando de conta** (ex.: "PIX RECEBIDO - OUTRA IF - MESMA TIT.", TED entre os bancos da casa) — **não é receita nem despesa** e não deve ser conciliado com boleto nenhum:

- **Buscar… → "Transferência entre contas"**: escolha **de qual conta veio** (se o dinheiro entrou) ou **para qual conta foi** (se saiu). Se a outra conta não estiver cadastrada, escolha **"Conta fora do sistema"**. Observação é opcional.
- A linha sai dos pendentes com a etiqueta roxa **"Transferência"** (mostra de/para qual conta) e pode ser **desfeita** pela setinha — desfazer apaga a transferência junto.
- A transferência aparece na tela **Saldos por Conta**: coluna própria **"Transf. ±"** por conta (entra no Resultado) e linha roxa **"transferência"** no extrato da conta — separada de recebimentos e pagamentos, do jeito que a contabilidade espera.
- Linhas pendentes cujo texto do banco indica transferência ("MESMA TIT.", "TRANSF") mostram uma dica roxa apontando esse botão.
- Filtro de status da tela tem a opção **"Transferências"**; o cartão do topo mostra **Ignorados / Transf.**
- Nada disso é enviado ao Conta Azul — vale só para os relatórios do app.

Ao confirmar com boleto em aberto marcado: a baixa é criada com a **data e o banco do próprio extrato**, entra na fila de envio ao Conta Azul (igual ao botão "Baixar" do Contas a Pagar) e o lançamento já fica conciliado. **Exceção:** despesa **importada do CA** não tem para onde empurrar a baixa — fica só no app (a tela avisa antes).

## Cadastrar despesa (a saída nunca foi lançada)

Acessível pelo rodapé da janela Buscar…. O pop-up vem preenchido com o que o banco mandou (data, valor, beneficiário quando houver, nº do documento) e pede: **fornecedor** (escolher ou cadastrar na hora), **descrição**, categoria da DRE, **forma de pagamento**, vencimento, nº da nota e **juros/multa** (o sistema separa do total). A despesa é criada **já paga** no banco do extrato e vai para o Conta Azul; a linha volta com a baixa como sugestão — é só clicar em Conciliar.

## O que a tela mostra

- **KPIs**: Pendentes (com valor a conferir), Conciliados (valor batido), Ignorados, e **"Só no app"** — baixas registradas nesta conta que não bateram com nenhum lançamento do extrato.
- **Filtros**: conta (obrigatório), período e status. O período usa o seletor único em pílula padrão do sistema (estilo Conta Azul), com presets **Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Este ano · Período personalizado** (De/Até dentro do menu) e **setas ‹ ›** que pulam o período inteiro. Aqui **não existe "Todo o período"** (o extrato sempre precisa de um intervalo de datas). Fica lembrado por usuário o **preset** escolhido (recalculado a partir de hoje a cada abertura); padrão: Últimos 30 dias.
- **Lista do extrato**: data, descrição do banco, valor (verde = entrou, vermelho = saiu), status e a coluna de conciliação. Conciliação automática aparece com 🪄.
- **"De quem é esse lançamento?"** — abaixo da descrição, tudo o que dá para saber:
  - **Beneficiário e nº do documento**, quando o arquivo do banco traz (nem todo banco traz).
  - **CNPJ/CPF achado no texto** (comum no PIX) cruzado com o cadastro de fornecedores → nome da empresa. CPF mascarado pelo banco (***.851.799-**) vira "Provavelmente Fulano (CPF parcial)" quando bate um único cadastro.
  - **"Mesmo valor de: FORNECEDOR (vence dd/mm)"** — boletos em aberto com o valor exato mas vencimento em OUTRA data (os com data E valor exatos já viram sugestão com botão Conciliar). "DÉB.TIT.COMPE EFETIVADO" é o texto padrão do banco para boleto pago por compensação e **não diz quem recebeu** — quando o banco não manda o beneficiário, a pista é o valor.
- **Card "Baixas do app sem par no extrato"** (expansível): baixas órfãs — data/valor errado na baixa, conta errada, ou extrato ainda não importado.

## Regras do matching (como o sistema sugere)

- **Baixa já registrada**: mesma conta financeira, valor igual (±R$ 0,01, juros e multa incluídos) e data até 3 dias de diferença.
- **Boleto em aberto** (só saída): valor igual (±R$ 0,01) **e vencimento no MESMO dia** do débito — regra estrita de propósito; vencimento em outro dia não vira sugestão, vai para a janela Buscar….
- Uma baixa do app só concilia com **um** lançamento do extrato (e vice-versa).

## Situações comuns

- **Boleto pago com juros**: o extrato mostra o total (boleto + juros + multa). Se a baixa já foi registrada com juros, concilia normal. Se o boleto está em aberto, use Buscar… → marque o boleto → informe os juros — a conta fecha e a baixa nasce certa.
- **Um débito pagando vários boletos**: Buscar… → marcar os boletos (a soma aparece ao vivo). Todos menos o último precisam ser cobertos por inteiro; o último pode ficar parcial ou ser quitado com desconto.
- **2 PIX pagando 1 boleto**: Buscar… → "+ Somar outro lançamento do banco".
- **Tarifas e rendimentos**: não são contas do sistema — Buscar… → Ignorar (o motivo fica registrado).
- **Boleto da Conta PJ do Conta Azul (crédito líquido da tarifa de R$ 1,50)**: o crédito no extrato vem R$ 1,50 menor que a baixa (tarifa do CA descontada). A conciliação **reconhece sozinha** esse padrão: a sugestão aparece com o aviso da tarifa e, ao **Conciliar**, o sistema registra a diferença como "Tarifa/taxa do banco" **e gera automaticamente a despesa da tarifa** (R$ 1,50, fornecedor Conta Azul, categoria Tarifas de Boletos, já paga na Conta PJ, **só no app** — não vai ao CA, onde o crédito já entra líquido). **Desfazer** a conciliação cancela a despesa da tarifa junto.
- **Dinheiro movido entre as contas da empresa** (mesma titularidade): Buscar… → **Transferência entre contas** (não usar Ignorar — assim o movimento aparece em Saldos por Conta).
- **Nada aparece na janela**: aumente a janela de período (±30/±60/Tudo) ou confira se a despesa foi lançada; se nunca foi, "Cadastrar despesa" ali mesmo.
