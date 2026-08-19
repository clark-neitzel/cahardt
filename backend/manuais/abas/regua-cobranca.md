# Régua de Cobrança

**Rota:** `/financeiro/cobranca` · **Permissão:** ver = `Pode_Acessar_Cobranca` · editar = `Pode_Editar_Cobranca` (ou admin) · **Menu:** Financeiro → Régua de Cobrança

**Dois níveis de acesso:** quem tem só "Régua de Cobrança" (ver) enxerga tudo — inadimplentes, configurações, canais e histórico — mas **não altera nada** (a tela mostra o selo "Somente visualização"; botões de executar/cobrar/salvar ficam ocultos e os campos bloqueados). Quem tem também "Editar Régua de Cobrança" pode ligar/desligar, configurar, executar e cobrar. Quem não tem nenhuma das duas não vê a tela no menu.

Cobra automaticamente os clientes inadimplentes por **WhatsApp** (bot), **e-mail** e **SMS**, seguindo uma régua configurável por **forma de recebimento** (condição de pagamento). Quando o WhatsApp falha (cliente sem celular cadastrado ou que nunca conversou com o bot), o sistema **cria uma tarefa automática** (aba Tarefas, com alerta sonoro) para a pessoa responsável resolver.

## Como os envios saem (fila e proteções)

- Os envios saem em **fila, 1 mensagem por minuto** — proteção para o número de WhatsApp não ser bloqueado por rajada.
- **Antes de cada envio o sistema confere no Conta Azul** se a dívida ainda está em aberto (sincroniza as baixas feitas lá). Se o cliente já pagou no CA, o envio é pulado e o painel se atualiza.
- A régua só roda nos **dias da semana marcados** (padrão: segunda a sexta — não cobra em fim de semana).
- **Vencimento que cai em sábado/domingo** conta como vencido só na segunda (opção "prorrogar fim de semana", ligada por padrão). Ex.: venceu sábado + 1 dia de carência → 1º aviso sai na terça.
- Horários são sempre no **horário de São Paulo**.

## Aba Inadimplentes

- **Liga/desliga geral** da cobrança automática + **horário geral do disparo diário** (padrão 08:30) + **dias da semana de envio** + regra de fim de semana + botão **Executar agora** (inicia a fila na hora; um aviso azul mostra o progresso "X/Y" enquanto a fila roda).
- **Indicadores:** valor total vencido, nº de clientes, envios com erro, clientes sem celular.
- **Lista de clientes com parcelas vencidas** mostrando: forma de recebimento, valor vencido, dias de atraso, último envio (canal/resultado/erro), situação na régua (aguardando 1º aviso, aguardando repetição, limite de avisos atingido, sem régua configurada) e se existe **tarefa aberta** para o caso.
- **Cobrar agora** (por cliente): envia a cobrança imediatamente pelos canais da régua, ignorando o calendário. Se o WhatsApp falhar, a tarefa é criada na hora.
- Olho (👁) mostra as parcelas vencidas do cliente (valor, vencimento, dias de atraso, pedido).

## Aba Régua (configuração por forma de recebimento)

Um cartão por forma de recebimento (ex.: Boleto 28 dias, PIX à vista). A linha **PADRÃO** vale para qualquer forma sem régua própria (inclusive contas importadas do Conta Azul sem pedido). Em cada cartão:

- **1º aviso**: quantos dias **após o vencimento** sai a primeira mensagem.
- **Horário de envio próprio** (opcional): cada forma pode disparar num horário diferente; vazio usa o horário geral.
- **Repetir a cada X dias** e **máximo de avisos** por dívida (o contador zera quando a dívida antiga é paga).
- **Cobrar faturas vencidas** (liga/desliga) e **lembrete antes de vencer** (X dias antes, opcional, com mensagem própria).
- **Canais**: WhatsApp, E-mail, SMS (pode combinar).
- **Responsável pela tarefa**: quem recebe a tarefa automática quando o envio de WhatsApp falha. Obrigatório quando o canal WhatsApp está ligado.
- **Mensagens**: cada mensagem tem uma **faixa de dias de atraso** ("de X a Y dias" — "a" vazio = em diante) e o sistema escolhe a que encaixa no atraso do cliente. Ao adicionar, dá para partir de um **modelo pronto** (Aviso 1 leve, Aviso 2 educada, Aviso 3 firme, Aviso final, Lembrete) e editar. Variáveis: `{nome}`, `{valor_total}`, `{parcelas}`, `{qtd_parcelas}`, `{dias_atraso}`, `{vencimento}`. Sem mensagem própria, usa o texto padrão do sistema. O olho (👁) mostra **como o cliente recebe** (preview estilo WhatsApp com dados de exemplo).

## Aba Canais

- **WhatsApp:** sai pelo WhatsApp da Hardt (o mesmo número que a Ana atende), igual aos avisos de pedido. Entrega para qualquer cliente com celular cadastrado — **não** é preciso que ele já tenha conversado com a gente. Se o envio falhar por limite de volume ou instabilidade, a mensagem **não se perde**: entra numa fila e é reenviada sozinha (sem risco de cobrar o mesmo cliente duas vezes). A tarefa automática só é gerada quando o envio realmente não tem como acontecer (ex.: cliente sem celular cadastrado).
- **E-mail (SMTP):** servidor, porta, usuário, senha e nome do remetente + botão **Testar conexão** (pode mandar um e-mail de teste). O e-mail sai com tabela das parcelas.
- **SMS (Twilio):** exige contratar o provedor Twilio (paga por mensagem). Campos: Account SID, Auth Token e número remetente.

## Aba Histórico

Todos os envios (automáticos, lembretes e manuais) com data, cliente, canal, tipo (aviso nº / lembrete / manual), valor e resultado (enviado ou erro com o motivo). Filtros por canal e resultado; paginação.

## Como funciona a tarefa automática de falha

1. A régua tenta enviar WhatsApp e falha (sem celular, ou o bot recusou porque o cliente nunca conversou com ele).
2. O sistema cria uma **tarefa com alerta** para o responsável configurado na forma: cadastrar o celular do cliente, iniciar a conversa no bot e enviar a mensagem de cobrança (o texto vai dentro da tarefa), com link direto para o cadastro do cliente.
3. Enquanto a tarefa estiver pendente, não é criada outra igual. Se a pessoa concluir a tarefa mas o problema continuar (o próximo envio falhar de novo), **uma nova tarefa é gerada**.

## Perguntas frequentes

- **A cobrança não saiu:** confira se a régua geral está LIGADA (aba Inadimplentes), se a forma de recebimento tem régua ativa, se o cliente já atingiu os dias do 1º aviso e se não bateu o limite de avisos.
- **Cliente recebeu no WhatsApp mas não no e-mail:** o canal E-mail precisa estar ligado na régua da forma E o SMTP configurado na aba Canais E o cliente precisa ter e-mail no cadastro.
- **Não quero cobrar um cliente:** hoje a régua cobra todos os inadimplentes da forma configurada; para pausar um caso específico, desative a régua da forma ou trate manualmente (o limite de avisos também para os envios).
- **Quem pode acessar:** no grupo Financeiro do modal de permissões do usuário (Admin → Usuários → Acessos): "Régua de Cobrança" libera **ver**; o toggle extra "Editar Régua de Cobrança" (aparece ao ligar o primeiro) libera **alterar/executar/cobrar**. Desligar o "ver" desliga o "editar" junto.
- **Consigo abrir a tela mas os botões sumiram / campos bloqueados:** você tem acesso somente de visualização — peça ao administrador a permissão "Editar Régua de Cobrança".

## Quem a régua NUNCA cobra (desde 08/2026)

- **Pedido especial** (e qualquer conta com origem ESPECIAL, mesmo sem pedido vinculado) — é fiado local: a cobrança é do escritório/vendedor, feita na mão. A parcela do especial nasce vencida no dia da venda e só é baixada na conferência do Caixa; sem essa trava, cliente que pagou em dinheiro na entrega receberia cobrança no dia seguinte
- **Pedido bonificação** — não é venda
- **Amostra** — não gera título nenhum (não tem conta a receber)
- Pedido excluído/cancelado no Conta Azul (regra que já existia)

**O painel e o botão "Cobrar agora" continuam enxergando o especial.** A trava vale só para o **envio automático** da régua: no painel de inadimplentes o escritório vê tudo, e pode disparar a cobrança na mão quando decidir.

**Uma exceção, mesmo no painel e no "Cobrar agora": quem já pagou não é cobrado.** Pedido especial entregue, já pago em dinheiro na rua e esperando só a conferência do Caixa **não aparece** no painel e **não recebe** cobrança nem quando alguém clica em "Cobrar agora" — o cliente pagou, o que falta é o caixa conferir. Essas parcelas não somem sem aviso: o painel mostra quantas ficaram de fora no campo **"aguardando conferência"** dos totais. Especial fiado de verdade (nada recebido, ou só valor de "vendedor/escritório responsável") continua no painel e continua cobrável.

### O que o painel enxerga (corrigido em 08/2026)

O painel de inadimplentes e o botão **"Cobrar agora"** enxergam **todos** os títulos em aberto do cliente — inclusive de **pedido especial**, de propósito, porque é o escritório que cobra o especial na mão. Só o **envio automático** da régua é que nunca cobra especial, bonificação nem amostra.

Até 08/2026 um defeito escondia do painel os títulos de **pedido faturado direto no app** (que ainda não tinha situação registrada no Conta Azul): eles não apareciam na lista de inadimplentes nem entravam na régua. Corrigido — esses títulos voltaram a ser enxergados. Efeito prático: podem aparecer no painel alguns clientes que antes não apareciam, e eles passam a receber **lembrete de vencimento** normalmente.
