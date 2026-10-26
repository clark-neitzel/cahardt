# Proposta de revisão da rota, atendimentos e leads

**Versão para discussão — 23/10/2026.** Análise do código disponível no workspace, referência Git `d64366d5`. Nenhuma regra de produção foi alterada.

**Decisão já confirmada:** quem fez pedido nos dois dias anteriores **continua na fila**, com aviso de pedido recente. Não haverá baixa automática, retirada da rota ou dispensa automática por esse motivo.

**Objetivo:** o vendedor entender rapidamente quem precisa de atenção e o que fazer; a gestão enxergar clientes em risco e compromissos descumpridos, sem precisar interpretar centenas de registros repetidos.

**Contexto trazido pela imagem da Letícia:** ela pede uma opção para o cliente que fez o pedido no dia anterior, fora do dia da rota, **mantendo a entrega no dia habitual**. Esse é o primeiro caso a resolver. Não significa que ela pediu para abandonar clientes, mudar entregas ou eliminar toda a cobrança de acompanhamento.

**Leitura rápida dos dados de produção:** 108 dos 136 leads estão atribuídos ao Jociel; 92 seguem NOVO, dos quais 90 não têm atendimento vinculado ao lead. Há oito cadastros “Merc carmim” com mesmo GPS, criados em aproximadamente 13 minutos e sem foto. Há também registros da Letícia descrevendo “pedido ontem”, inclusive sob “Atendido sem pedido”. Os detalhes, critérios e limites estão no [diagnóstico de dados](diagnostico-atendimento-dados-2026-10-23.md).

Os desenhos abaixo são **wireframes de proposta**, não capturas do aplicativo funcionando. Nomes, números e datas dos exemplos são fictícios. Preservam a direção visual existente: fundo claro, verde para ações, texto legível e uso prioritário no celular.

## 1. Diagnóstico principal

Hoje três coisas diferentes estão misturadas:

1. **Contato:** alguém visitou, ligou, enviou mensagem ou tentou falar.
2. **Resultado comercial:** houve pedido, recusa, estoque suficiente, problema ou interesse futuro.
3. **Próxima obrigação:** quem precisa fazer o quê e quando.

Um contato pode encerrar o item de hoje sem resolver a necessidade futura. Um pedido de ontem é contexto importante, mas não prova que o cliente foi atendido hoje. Um cliente que pediu uma pausa precisa continuar acompanhado, sem voltar toda semana como uma obrigação de contato.

**A mudança central proposta é transformar cada pendência em uma ação com motivo, responsável e prazo.** O histórico continua disponível; a tela principal mostra apenas o necessário para a decisão atual.

### O que foi verificado e o que ainda não foi

- Foram inspecionados rota, atendidos, bloqueio de pendências, formulários de atendimento e lead, conversão, APIs, modelos de dados, pedidos, dashboards, metas e inteligência comercial.
- As regras foram analisadas no código; os dados e configurações foram conferidos pela API administrativa da instalação no EasyPanel, somente por consultas. Não houve teste navegando no aplicativo nem medição do tempo gasto pelos usuários.
- A coleta principal foi feita em **23/10/2026 às 08:56, horário de São Paulo**: 136 leads, 8.911 atendimentos, 5.029 pedidos, 1.265 clientes, 15 usuários/vendedores e 5 amostras. São os registros existentes na coleta, não uma reconstrução de registros excluídos.
- Há evidências de cadastros repetidos e de pouca utilização do acompanhamento de leads. **Responsável atual não comprova autor da criação; falta de registro não comprova falta de contato real.** Não há conclusão sobre conduta individual.
- Foram conferidas as configurações reais de tipos e ações. Elas incluem “Sem Visita” e códigos internos cujo significado não corresponde mais ao nome exibido; a seção 8 detalha esse problema.

## 2. Como o sistema funciona hoje

| Parte | Comportamento encontrado | Consequência prática |
|---|---|---|
| Rota → Atendimento | Junta clientes e leads; aplica dia e canal; retira quem tem atendimento comercial ou pedido identificado hoje | Pedido de ontem ou anteontem não resolve a falta de contexto de hoje |
| Rota → Atendidos | Considera atendimento de qualquer vendedor; pedidos são carregados conforme o vendedor consultado e as permissões | Contato por outro vendedor e pedido por outro vendedor não têm cobertura equivalente |
| Pedido criado hoje | A rota verifica a data de criação; a consulta usada não aplica uma regra comercial única de validade | Um pedido em aberto ou cancelado pode ser interpretado como atendimento do dia |
| Pendências de rota | Bloqueia o app para não administradores e não isentos de ponto, cobrando clientes ativos do dia útil anterior | O vendedor precisa lançar algo para continuar usando o aplicativo |
| Compensação de pendência | Procura atendimento não financeiro ou pedido desde o início do dia anterior considerado até o fim de hoje | Não consulta os dois dias anteriores à visita; na segunda a janela começa na sexta |
| Lead na rota | Entra se não estiver vinculado a cliente e não for FINALIZADO/CONVERTIDO | Leads continuam recorrendo sem exigir qualificação ou uma próxima ação concreta |
| Próxima visita | Para lead, grava data e interfere na prioridade se for hoje; filtros de dia/canal continuam sendo aplicados antes | Uma data futura não suspende a recorrência; um retorno de hoje pode ficar oculto por outro filtro |
| Atendimento de cliente | Pode guardar próxima visita no registro, mas essa data não governa a fila de clientes | Agendar não equivale a criar uma agenda operacional confiável |
| Retorno | Existem `proximaVisita`, `dataRetorno`, alertas e transferências com regras diferentes | O vendedor precisa entender vários mecanismos para organizar uma próxima ação |
| Avaliação | Painel, dashboard, metas e insights usam definições diferentes de atendimento, venda e período | Os números não são diretamente comparáveis |

### Falhas prioritárias confirmadas no código

**A. O bloqueio favorece preenchimento para liberar o app.** A mensagem exige finalizar todos os clientes antes de usar o sistema. O atendimento lançado na compensação recebe a data atual, sem distinguir claramente a data da visita pendente. Isso pode contaminar a interpretação do trabalho de hoje. É um risco do desenho; não comprova que vendedores estejam lançando dados falsos.

**B. “Abrir pedido” é tratado como resolução local antes de salvar.** No bloqueio, clicar em Pedido já marca o cliente como resolvido no estado da tela e abre uma nova aba. Se o pedido não for salvo, a pendência pode reaparecer na conferência seguinte.

**C. O modal de atendimento pode ficar atrás do bloqueio.** O bloqueio usa camada `z-[200]`; o modal usado nele usa `z-50`. Há um conflito aparente de empilhamento que precisa ser reproduzido no navegador antes de qualquer correção.

**D. Não existe pausa comercial estruturada.** Cliente ativo, rotina semanal e situação comercial acabam sendo tratados como a mesma coisa. Desativar o cliente não é uma boa solução geral: o cadastro pode continuar necessário para pedidos, recebimentos e histórico.

**E. “Sem potencial” não significa automaticamente encerrar o lead.** A ação e a etapa são campos separados. Na edição de lead, a ação selecionada ainda é gravada como `tipo` de atendimento e mantém a etapa anterior. Pode registrar uma ação administrativa como se fosse contato, sem resolver a permanência na rota.

**F. Exigências de cadastro não impedem duplicidade.** O formulário pede cidade, categoria, origem, dia, canal, foto e GPS, mas o serviço de criação não consulta leads/clientes semelhantes. Ter muitos campos obrigatórios não garante oportunidade comercial real.

**G. A foto é enviada depois da criação do lead.** Se o upload falhar, o cadastro já existe, mas a interface informa erro ao criar. Uma nova tentativa pode gerar outro lead. Não há mecanismo de idempotência nesse fluxo.

**H. Há uma segunda origem de leads.** A API de WhatsApp/IA cria leads com origem `WHATSAPP_IA`, sem responsável, foto, GPS ou rotina no fluxo inspecionado. Não se deve atribuir todo volume de leads à criação manual por vendedores.

**Conferência nos dados:** nenhum dos 136 leads existentes na coleta tem origem WHATSAPP_IA. Essa entrada existe no código, mas não explica o volume observado nessa base.

**I. A autoria do lead não está separada do responsável.** O modelo guarda `idVendedor`, que pode ser alterado. Isso permite identificar a carteira atual, mas não comprovar quem criou originalmente o lead. Atendimentos já possuem um campo separado de usuário que registrou, que pode ser aproveitado como referência de desenho.

**J. Retorno vencido não possui encerramento próprio.** Os dashboards consultam datas antigas de retorno sem um estado específico de resolvido/cancelado/reagendado. Marcar alerta como visto ou fazer novo atendimento não é uma baixa inequívoca desse compromisso.

**K. “Atendidos” e indicadores não representam sempre a mesma unidade.** O painel soma eventos manuais e pedidos; a aba de atendimentos do dashboard conta registros de atendimento e usa `pedidoId` para identificar conversão. O modal normal de atendimento não preenche esse vínculo ao criar um pedido em outro fluxo.

**L. A análise pode transformar ausência de pedido em recusa.** O insight conta contatos sem pedido no mesmo dia; a classificação `NEGA_WHATSAPP` é acionada a partir de três contatos sem pedido em 30 dias, sem exigir canal WhatsApp ou motivo de recusa. Um pedido antecipado seguido de contato de rotina pode contribuir para esse diagnóstico indevido.

**M. O filtro do painel pode induzir leitura incompleta.** Busca textual, cidade, ação e “com/sem pedido” filtram apenas a página carregada. O CSV também exporta essa lista local. A consulta limita cada fonte a 3.000 registros sem sinalizar truncamento na resposta. Uma análise ampla pode parecer completa sem ser.

**N. Há incoerência de etapas nos indicadores.** A rota exclui FINALIZADO e CONVERTIDO; um indicador do dashboard antigo exclui CONVERTIDO e PERDIDO. Assim, um finalizado pode continuar entrando naquela contagem de ativos.

**O. A rota carrega dados demais.** Busca até 2.000 clientes e carrega pedidos com vários relacionamentos, sem período, para filtrar “hoje” no navegador. Em carteira grande isso pode pesar no celular e deixar clientes fora do limite consultado.

**P. O GPS bloqueia inclusive contato remoto.** O modal exige localização para salvar qualquer tipo. Já a edição de lead registra uma ação sem essa exigência. A política é inconsistente entre entradas.

**Q. “Qualidade do Atendimento” é um nome enganoso no pedido.** O campo escolhe Visita, Ligação, WhatsApp ou Outros. Ele informa o canal, não a qualidade. Proposta: chamar **“Como este pedido foi recebido?”**.

**R. Encaixe e antecedência são coisas diferentes.** No formulário de pedido, encaixe decorre do dia de entrega e é incluído no texto das observações. O aviso de pedido recente deve se basear no pedido e na data de criação, sem depender da palavra “encaixe”. Uma compra antecipada pode estar no dia normal de entrega.

**S. “Sem Visita” está sendo contado junto com atendimentos.** A configuração real contém esse tipo e há 742 registros no histórico. A regra da rota exclui FINANCEIRO e PEDIDO, mas não SEM_VISITA. É preciso distinguir decisão administrativa, tentativa e contato efetivo para não chamar tudo de cliente atendido.

**T. Os códigos das ações perderam o significado.** Em produção, “Atendido sem pedido” usa `NOVO`, “Reagendado” usa `MANDAR_WHATSAPP` e “Enviar vendedor” usa `SEM_POTENCIAL`. Qualquer automação baseada apenas no código pode interpretar a ação de forma errada. A correção precisa preservar o significado histórico de cada registro.

## 3. Regras propostas

### 3.1 Pedido recente: visível sem retirar da fila

O cartão apresenta: **“Pedido feito ontem · #1234 · R$ 480”**, com a entrega prevista e acesso ao pedido. Quando houver mais de um: “2 pedidos recentes”, abrindo a lista.

- O cliente permanece na fila e mantém as ações de atendimento e novo pedido.
- Não cria atendimento fictício, não aumenta a quantidade atendida hoje e não remove pendência automaticamente.
- Usar `createdAt` para “feito em” e a data de entrega para “entrega prevista”. Mostrar as duas separadamente.
- Consultar pedidos do cliente nos canais e responsáveis autorizados, não apenas os lançados pelo vendedor que abriu a rota. Exibir quem lançou, respeitando permissões.
- Proposta inicial de janela: hoje e os dois dias de calendário anteriores, no fuso de São Paulo. Rotular “hoje”, “ontem” e “há 2 dias”. Confirmar depois se a intenção é 48 horas corridas ou dois dias úteis; não misturar silenciosamente essas definições.
- Pedido aberto aparece como **“Pedido em elaboração”**; erro de envio, como **“Pedido com erro — conferir”**. Não afirmar que o cliente está abastecido ou que houve venda confirmada.
- Cancelamento e devolução total não sustentam a afirmação de compra válida. Bonificação e amostra têm rótulos próprios. Devolução parcial deve continuar visível como contexto.
- Um retorno combinado ou problema urgente continua destacado mesmo com pedido recente.
- Se a consulta falhar, informar “Não foi possível consultar pedidos recentes”; ausência de resposta não significa ausência de pedido.

**Ponto para discussão posterior, ajustado à crítica enviada:** oferecer **“Pedido antecipado — entrega mantida”**, vinculado ao pedido existente. O cliente continua na fila até uma decisão explícita. Ao registrar essa decisão, não criar visita ou conversa fictícia, não duplicar a venda e não mudar a data de entrega. Se houve contato real hoje, registrá-lo separadamente. O efeito dessa opção na pendência do dia ainda precisa ser combinado; não está aprovado como dispensa automática.

### 3.2 Resultado do dia e situação do relacionamento

| O que aconteceu | Consequência proposta para hoje | Próximo acompanhamento |
|---|---|---|
| Fez pedido | Pedido salvo aparece no histórico; não pedir registro duplicado | Próximo ciclo; compromissos específicos continuam abertos |
| Está abastecido / não precisa agora | Registrar esse motivo em um toque, após contato real | Próxima rota ou data combinada |
| Não respondeu / responsável ausente | Registrar tentativa, sem chamar de recusa | Uma próxima tentativa definida; repetição vira revisão, não retorno infinito |
| Pediu para falar em outra data | Encerrar a ação de hoje e criar retorno | Voltar na data combinada, com responsável |
| Problema de produto, preço ou entrega | Registrar motivo e encaminhar | Responsável e prazo; contato simples não encerra o problema |
| Não quer comprar por enquanto | Sugerir pausa comercial com revisão | Data de revisão; cadastro continua disponível |
| Não quer mais contato | Registrar preferência explicitamente | Retirar da abordagem comercial; manter histórico e tratamento operacional necessário |
| Estabelecimento fechou | Sinalizar para conferência administrativa | Encerrar rotina após confirmação; preservar histórico |
| Vendedor não atende mais a região | Solicitar redistribuição | Cliente segue com responsável ou na fila visível da gestão |
| Cadastro duplicado | Enviar para revisão/vinculação | Preservar pedidos, histórico e autoria; não excluir automaticamente |

Não confundir “não quer comprar hoje” com “não quer ser contatado”. Não permitir que “não passo mais lá” simplesmente abandone um cliente sem responsável.

### 3.3 Uma próxima ação

Substituir, na experiência do vendedor, a competição entre Próxima visita, Data de retorno e Assunto do retorno por:

**Próxima ação: o que fazer · quando · quem fará.**

Os campos antigos podem continuar preservados para compatibilidade. A nova tarefa precisa ter estado: aberta, concluída, reagendada ou cancelada, com histórico da mudança. “Visto” confirma leitura; não encerra compromisso.

Uma ação comercial principal aberta por cliente/objetivo evita duplicação. Problemas independentes, como uma reclamação e uma visita, podem coexistir. Uma compra não resolve automaticamente uma reclamação, cobrança ou amostra pendente.

### 3.4 Pendências sem bloquear o trabalho

Recomendo substituir o bloqueio geral por uma seção **“Revisar pendências”** e um resumo do fim do dia. A mudança precisa ser discutida antes da implantação.

- O vendedor pode continuar vendendo e atendendo.
- Cliente sem contato e sem próximo passo continua visível na revisão.
- Reagendamento guarda motivo, autor e data; adiamentos sucessivos aparecem para a gestão.
- Registros tardios distinguem **quando ocorreu** de **quando foi lançado**.
- Pendências antigas não desaparecem apenas porque passaram do “dia útil anterior”.
- Gestão recebe uma lista curta de exceções por responsável, com idade e próxima ação.
- Exceções operacionais precisam considerar feriado, ausência e redistribuição de carteira, sem interpretar tudo como falha do vendedor.

## 4. Telas propostas

### Tela 1 — Rota / Hoje

Manter as funções de Entregas e Entregues, mas concentrar a experiência comercial em **Hoje**, **Atividade** e **Agenda**. A nomenclatura final pode preservar “Atendimento” se isso facilitar a adoção.

```text
ROTA                              Buscar
Hoje          Atividade          Agenda
Sexta, 23/10 · Minha carteira

12 para atender · 3 retornos combinados
Revisar 2 pendências anteriores        >

Mercado Exemplo
Retorno combinado para hoje
Pedido ontem · #1234 · R$ 480
Entrega prevista: hoje
[Atender]             [Novo pedido]

Padaria Exemplo
Rota de sexta · Presencial
Sem comprar há 16 dias · ciclo de 7
[Atender]             [Novo pedido]

Prospecção prevista hoje · 2           >
```

**O que aparece:** nome, razão de estar na fila, um contexto comercial relevante e ações. Pedido recente é informação de primeira linha, não escondida no histórico. Retornos vencidos e combinados hoje têm prioridade; o alerta explica essa prioridade.

**O que vai para os detalhes:** cadastro completo, todos os horários, coordenadas, histórico extenso, orientações longas e detalhes financeiros. Um alerta financeiro ou operacional importante pode permanecer resumido no cartão.

**Busca:** encontra também pausados e fora da rota, indicando sua situação. Não reativa nem muda a agenda ao consultar. Filtros ativos ficam visíveis; se ocultarem tarefas vencidas, deve haver indicação e atalho para vê-las.

### Tela 2 — Registrar contato

Quando houver pedido recente, apresentar antes do formulário um caminho específico:

```text
PEDIDO ANTECIPADO
Pedido #1234 feito ontem
Entrega prevista: sexta, 23/10

[Registrar pedido antecipado]
[Fazer novo contato]
```

“Registrar pedido antecipado” abre a confirmação do pedido relacionado e informa “A data de entrega será mantida”. Na proposta, essa ação entra como **revisão da rota**, separada de contato real. A gestão precisa decidir se essa revisão encerra a obrigação do dia ou apenas registra o contexto. O aviso sozinho nunca retira o cliente da fila.

```text
MERCADO EXEMPLO                    Fechar
Pedido ontem · #1234 · R$ 480

Como você falou com o cliente?
[Presencial] [WhatsApp] [Ligação]

Qual foi o resultado?
[Já está abastecido]
[Não respondeu / ausente]
[Combinou retorno]
[Problema a resolver]
[Rever atendimento deste cliente]

Observação opcional
[Salvar contato]
```

Ao escolher retorno, abrir somente data e assunto. Ao escolher problema, abrir motivo, responsável e prazo. “Rever atendimento” abre a tela 4. Novo pedido continua disponível pelo fluxo de pedidos, evitando uma falsa venda registrada apenas como resultado textual.

Canal pode vir sugerido pelo cadastro, mas precisa ser confirmado se diferente do contato real. GPS é evidência de visita, não prova de contato por WhatsApp; propor política específica para presencial e alternativa explícita quando a localização falhar. Não coletar coordenada remota apenas para destravar o botão.

Salvar deve mostrar o efeito: “Contato registrado. Retorno em 30/10”. Em falha de rede, manter o que foi preenchido e permitir tentar novamente sem duplicar.

### Tela 3 — Atividade do dia, evolução de “Atendidos”

```text
ATIVIDADE                         Hoje
8 clientes · 5 com pedido hoje
2 retornos agendados · 1 tentativa

Mercado Exemplo                    10:20
Contato por WhatsApp · já abastecido
Pedido anterior: ontem, #1234
Próximo contato: próxima sexta
Ver histórico                         >

Padaria Exemplo                    09:40
Pedido #1235 · R$ 350
Lançado por Ana · responsável: Jociel
Ver pedido                            >
```

Uma linha por cliente no resumo, com eventos expansíveis. Contato, pedido e decisão administrativa têm rótulos diferentes. O exemplo de autoria demonstra a separação proposta, não dados reais desses usuários.

Registrar “retorno agendado” não deve aparecer como venda nem como contato efetivo se houve apenas organização administrativa. Permitir corrigir registro com trilha de alteração, sem exclusão silenciosa.

### Tela 4 — Rever atendimento do cliente

```text
REVER ATENDIMENTO
Mercado Exemplo

O que mudou?
( ) Pediu uma pausa
( ) Não quer mais contato comercial
( ) Estabelecimento fechou
( ) Precisa de outro vendedor
( ) Possível cadastro duplicado

Pausa: revisar em [data]
Motivo: [selecionar]

O cadastro e o histórico serão mantidos.
[Salvar revisão]
```

Pausa temporária exige uma revisão futura. Transferência exige destinatário ou fila de gestão. Encerramento e duplicidade exigem tratamento administrativo conforme a permissão definida. A solicitação deve poder ser feita na rua em poucos toques, sem formulário longo.

O cliente continua pesquisável. Pausa comercial não apaga dívida, pedido, entrega, reclamação ou obrigação operacional. Solicitação explícita de não contato tem tratamento próprio e não volta automaticamente como visita na data de revisão.

### Tela 5 — Agenda e pendências

```text
AGENDA
[Atrasados 2] [Hoje 3] [Próximos]

Padaria Exemplo · vencido há 2 dias
Confirmar interesse após amostra
Responsável: vendedor da carteira
[Registrar resultado]   [Reagendar]

Mercado Exemplo · hoje, à tarde
Falar com a responsável pelas compras
[Registrar resultado]   [Reagendar]

Pausas para revisar nesta semana       >
```

Ao concluir, registrar resultado e fechar a tarefa correspondente. Reagendar atualiza o compromisso e preserva a data anterior. Tarefas já resolvidas deixam de aparecer como vencidas.

Evitar notificações para cada evento. Concentrar alertas em compromissos vencidos, prioridade de hoje e problemas sem responsável. Não disparar mensagens externas automaticamente nesta proposta.

### Tela 6 — Nova oportunidade

```text
NOVA OPORTUNIDADE
Nome do estabelecimento [__________]
WhatsApp ou localização [__________]

Encontramos um possível cadastro:
Mercado Exemplo · mesma cidade
[Abrir cadastro] [É outro estabelecimento]

Como surgiu? [Visita / indicação / ...]
O que ficou combinado? [____________]
Próxima ação [________]  Data [_____]

[Salvar oportunidade]
```

Buscar leads e clientes, inclusive pausados, antes de criar. Documento e telefone normalizado são sinais fortes quando disponíveis; nome/cidade/endereço ajudam na sugestão. Telefone compartilhado e GPS próximo são indícios, não autorização para fundir cadastros automaticamente.

Uma pesquisa ou um ponto avistado pode entrar como **“A qualificar”**, fora da recorrência semanal automática. Depois de contato e próximo passo real, vira oportunidade em acompanhamento. Cliente antigo deve ter caminho de **reativação no cadastro existente**.

Campos por contexto: oportunidade presencial pode ter foto/GPS; indicação ou WhatsApp precisa de identificação e contato utilizável, sem exigir fachada naquele momento. Foto incompleta deve poder ser anexada ao mesmo registro depois, sem repetir a criação.

### Tela 7 — Oportunidades / Gestão de leads

```text
OPORTUNIDADES
[A qualificar] [Em acompanhamento]
[Pausadas] [Encerradas] [Convertidas]

Filtros: responsável · origem · idade
Revisar possíveis duplicados           >

Mercado Exemplo
Origem: indicação · criado há 8 dias
Responsável: Jociel
Próxima ação: apresentar tabela em 27/10
[Abrir]                     [Registrar]
```

Substituir etapas pouco conclusivas, como “VISITA” e “PEDIDO”, por estados claros. A migração não pode deduzir que “PEDIDO” significa compra efetiva: conferir o vínculo com cliente e os pedidos válidos.

“Convertido” significa cadastro vinculado; **primeira compra** e **recompra** são resultados separados. Encerrar oportunidade exige motivo; não exige apagar. Revisões em lote podem ser usadas pela gestão depois de conferir candidatos, nunca como limpeza automática de tudo que é antigo.

### Tela 8 — Gestão comercial por exceção

```text
ACOMPANHAMENTO COMERCIAL
Período: esta semana · Todos os vendedores

Clientes sem próxima ação       6
Compromissos vencidos           4
Clientes fora do ciclo          9
Oportunidades a qualificar      7

PRECISAM DE DECISÃO
Cliente com 3 adiamentos               >
Cliente sem responsável                >
Oportunidade sem contato registrado    >
Possível duplicidade                   >

Vendedores · ver carteira e resultados >
Histórico detalhado / exportação       >
```

Os números são ilustrativos. Cada número abre a lista que o compõe. O gestor vê a causa e a próxima ação, sem precisar abrir cada observação. No computador, lista comparável; no celular, itens empilhados com o mesmo conteúdo e sem rolagem horizontal.

## 5. Avaliação: o que medir e como interpretar

**Não recomendar avaliação por quantidade bruta de registros ou leads criados.** Isso pode incentivar atividade de preenchimento sem avanço comercial. Também não usar o indicador atual de conversão como evidência isolada de desempenho enquanto as definições divergirem.

| Indicador proposto | Definição | Cuidado necessário |
|---|---|---|
| Cobertura da rota | Clientes previstos com contato efetivo / clientes previstos elegíveis | Tentativa, pausa, pedido anterior e organização administrativa aparecem separados |
| Pendências sem destino | Ações vencidas sem resolução, reagendamento válido ou responsável | Não confundir “visto” com resolvido |
| Clientes compradores | Clientes únicos com pedido comercial válido no período | Dois pedidos do mesmo cliente não são dois clientes |
| Conversão de contatos | Clientes com contato efetivo e compra atribuível na janela acordada / clientes com contato efetivo | Não atribuir causalidade só porque houve compra no mesmo mês; se não houver vínculo, chamar de associação |
| Retenção | Clientes que voltaram a comprar dentro do ciclo esperado | Considerar categoria e ciclo individual; não exigir a mesma frequência de todos |
| Qualidade da prospecção | Oportunidades qualificadas, primeira compra e recompra por grupo de criação | Vincular cadastro não é vender; oportunidades novas precisam de tempo para amadurecer |
| Recuperação de carteira | Clientes reativados com nova compra válida | Mostrar também quem recaiu sem recompra |
| Retrabalho | Cadastros duplicados confirmados, correções e retornos sem resultado | Duplicidade suspeita não deve punir vendedor antes de revisão |

Separar **pedido registrado**, **pedido confirmado**, **faturamento** e **entrega**. Cada um responde a uma pergunta. Centralizar o critério de validade e informar a unidade e o período na tela.

No resumo do vendedor, manter poucos números acionáveis. A análise detalhada fica com a gestão. Comparações entre vendedores devem considerar carteira, canal, região, período trabalhado e maturidade das oportunidades.

## 6. Informações existentes que podem ser mais úteis

| Informação já existente | Uso proposto |
|---|---|
| Ciclo por categoria/cliente | Priorizar atraso real, em vez de insistir igualmente em toda a carteira |
| Última compra e pedidos recentes | Evitar abordagem desinformada e distinguir compra recente de cliente esquecido |
| Primeira compra sem recompra | Criar acompanhamento de experiência e reposição no momento adequado |
| Queda de ticket e produto ausente | Mostrar uma sugestão curta, apoiada no histórico, quando for pertinente |
| Amostras | Criar retorno após entrega efetiva e medir avanço até primeira compra |
| Motivos estruturados | Identificar estoque suficiente, preço, qualidade, falta de resposta e mudança de comprador |
| Transferências | Encaminhar problema com responsável e prazo, encerrando o compromisso de forma rastreável |
| Origem do lead | Comparar canais que geram primeira compra e recompra |
| Usuário real que registrou | Separar ajuda do escritório, ação do vendedor e automação |
| Preferência de canal/horário | Reduzir tentativas improdutivas sem presumir que WhatsApp é pior que visita |

IA deve resumir **fatos úteis** e sugerir próximo passo, com data do cálculo. Não deve bloquear o fluxo nem chamar “sem pedido” de recusa. O popup atual tem contagem de 10 segundos e confirma automaticamente ao terminar; isso não comprova leitura. Proponho orientação opcional de uma frase no cartão e detalhes sob demanda.

## 7. Ajustes técnicos necessários para sustentar a simplicidade

Esta seção é para implementação posterior; não deve aparecer para o vendedor.

1. **Uma regra compartilhada de fila.** Rota, revisão de pendências e indicadores devem consultar a mesma classificação, com motivo, data de referência, pedido recente e próxima ação. Não reconstruir versões diferentes no navegador e em cada dashboard.
2. **Uma política explícita de pedidos.** Tratar cancelamento, exclusão, devolução, bonificação, rascunho, erro, especial e canais externos. Presença de pedido e receita realizada são estados diferentes.
3. **Um modelo de próxima ação.** Vinculado a cliente ou lead; motivo, prazo, responsável, status, origem, conclusão e histórico. Deduplicação por objetivo; tarefas independentes não devem ser fundidas.
4. **Situação comercial separada de cadastro ativo.** Em acompanhamento, pausado até revisão, não contatar, encerramento em revisão e transferência. Preservar integrações e rotinas financeiras.
5. **Autoria e histórico.** Guardar criador do lead, origem técnica, responsável atual e alterações de responsável. Dados legados sem autoria ficam “não identificado”; não presumir criador pela carteira atual.
6. **Cadastro resistente a repetição.** Chave de idempotência, deduplicação consultiva, retomada do envio de foto e resposta indicando o cadastro já criado. Não fundir por nome sozinho.
7. **Validação no servidor.** Validar canal, resultado, datas, vínculo cliente/lead, responsável e regras de transição. A API atual aceita muitos desses dados do corpo da requisição sem refletir as exigências da tela. Atualização da etapa e gravação do atendimento devem ser atômicas.
8. **Escopo por permissão.** Aplicar a carteira autorizada no backend, não só nos filtros da interface. As rotas inspecionadas usam autenticação, mas vários métodos de leads/atendimentos não restringem leitura e alteração por proprietário. Não inferir exploração; corrigir o contrato de acesso.
9. **Datas uniformes.** Usar São Paulo nas fronteiras dos dias; separar instante do registro, data do contato, entrega prevista e prazo de tarefa. Testar virada de dia e fim de semana.
10. **Consulta enxuta de rota.** Filtrar carteira, período e status no servidor; devolver apenas resumo dos pedidos recentes. Paginar sem perder clientes ou retornos; evitar baixar todo o histórico de pedidos.
11. **Painel e exportação completos.** Aplicar filtros antes de paginar; exportar o conjunto filtrado ou informar explicitamente “página atual”. Informar limites e evitar indicadores silenciosamente truncados.
12. **Vocabulário único.** Normalizar VISITA/PRESENCIAL, LIGACAO/TELEFONE, ação e etapa. Preservar valores legados e explicar a migração.

## 8. Investigação dos dados reais e dos leads do Jociel

**Conclusão:** existe acúmulo de leads sem acompanhamento registrado e há grupos fortes de possível duplicidade. A hipótese de repetição por falha no upload merece prioridade antes de atribuir o problema ao vendedor.

| Responsável atual | Total de leads | Não convertidos/finalizados | Sem atendimento vinculado, entre os ativos | Sem próxima visita, entre os ativos |
|---|---:|---:|---:|---:|
| Jociel | 108 | 92 | 90 | 91 |
| Laudenor | 16 | 14 | 0 | 14 |
| Edilson | 12 | 10 | 2 | 10 |

Nos 108 atribuídos ao Jociel, 16 estão convertidos e 92 continuam NOVO. Os 108 têm origem VISITA_VENDEDOR. Há 75 criados nos 90 dias anteriores à coleta e 11 nos 30 dias anteriores. **Não há novos leads em outubro na base coletada**; o mais recente é de 24/09. A situação observada é principalmente carteira acumulada, não crescimento diário comprovado no mês atual.

### Casos concretos para revisão

- **Merc carmim, leads #136 a #143:** oito registros no dia 24/09, mesma cidade, mesmo GPS, todos sem foto; intervalo total de 12min56s. Padrão compatível com repetir “Criar” depois de falhar o upload. A causa precisa de log ou confirmação, mas a proteção contra repetição é necessária independentemente da causa.
- **Mercado Santo Antônio, #32, #33 e #34, atribuídos ao Laudenor:** mesmo nome, telefone e GPS, criados em cerca de 13 minutos; só um tem foto. Mostra que o problema não se limita à carteira do Jociel.
- **Panif. Santa Barbara, #58 e #93, atribuídos ao Jociel:** mesmo nome normalizado e cidade, em datas diferentes e com GPS diferente. É candidato à conferência, não duplicidade confirmada.
- **15 leads não vinculados têm coincidência exata de nome normalizado ou telefone com clientes**, 10 deles atribuídos ao Jociel. São candidatos; nome genérico ou telefone compartilhado pode produzir falso positivo. Exemplo forte: Top de Linha (#114) coincide por nome e telefone. Não vincular automaticamente.

Entre os 16 convertidos atribuídos ao Jociel, 14 têm cliente associado com pelo menos um pedido elegível pelo critério exploratório do diagnóstico; 11 têm ao menos dois. Isso mostra que há resultado comercial na carteira e reforça que o problema não pode ser resumido a “leads sem valor”. Não é taxa de conversão causal nem receita apurada.

### A reclamação aparece no histórico

Há observações da Letícia como “fez pedido ontem” sob a ação “Atendido sem pedido”. No cruzamento com pedidos, foram encontrados **420 registros não financeiros**, em 419 pares cliente/dia, com pedido nos dois dias anteriores e nenhum pedido elegível no dia do registro. Desses, 139 estão como “Atendido sem pedido” e 119 como “Sem resposta / Ausente”. Isso identifica contexto que a tela precisa mostrar; não prova que todo contato foi dispensável.

### Avaliação e uso dos campos

- Dos 8.911 registros de atendimento, 3.930 são FINANCEIRO; 4.981 são de outros tipos, incluindo 742 SEM_VISITA.
- **Nenhum dos 4.981 registros não financeiros possui `pedidoId`.** Existem 3.927 vínculos, todos em registros FINANCEIRO. A aba de atendimentos do dashboard inspecionada inclui esses registros e usa o vínculo para contar “viraram pedido”: o resultado mistura movimentação financeira com conversão comercial. Aplicando a regra aos registros de outubro coletados, seriam 459/1.140 = 40,26%, sendo todos os 459 registros vinculados do tipo FINANCEIRO. Isso é reprodução do cálculo com os dados, não uma leitura visual do dashboard publicado.
- Nos registros não financeiros, há 1.743 com Próxima visita e apenas 8 com Data de retorno. O campo usado com mais frequência não governa de forma consistente a agenda da rota.
- Os códigos de ação reais estão desalinhados: NOVO = Atendido sem pedido; VISITAR = Sem resposta/Ausente; MANDAR_WHATSAPP = Reagendado; LIGAR = Pendência/Problema; LEVAR_AMOSTRA = Manda para WhatsApp; AGUARDO_RETORNO = Amostra pedido; SEM_POTENCIAL = Enviar vendedor.

### Complemento de investigação, somente leitura

O levantamento inicial foi feito. Para fechar a causa e decidir o tratamento dos casos, conferir logs e histórico de mudanças quando disponíveis:

| Pergunta | Evidência necessária |
|---|---|
| O volume cresceu quando? | Leads criados por semana, responsável atual, origem e histórico de atribuições quando existir |
| Foram criados pelo Jociel? | Logs/autoria disponíveis; responsável atual isolado não responde |
| Quantos já eram clientes? | Cruzamento de telefone normalizado, documento quando existir, nome, cidade e endereço; revisão humana dos candidatos |
| Quantos são repetidos? | Grupos de candidatos, horários próximos, mesma identificação e falhas de upload/reenvio nos logs |
| Quantos têm perspectiva? | Contato real, resultado, compromisso, amostra entregue e próxima ação |
| Quantos viraram venda? | Vínculo com cliente, primeira compra válida e recompra; não apenas etapa CONVERTIDO |
| Quantos ficam voltando sem avanço? | Idade do lead, tentativas, resultados e visitas recorrentes sem mudança |
| Há contribuição de automações? | Origem WHATSAPP_IA, logs da integração e atribuições posteriores |

Os totais e a lista inicial estão no diagnóstico anexo. A próxima etapa é revisar os candidatos e, se necessário, comparar carteiras semelhantes. Não excluir ou encerrar automaticamente nenhum cadastro nessa investigação.

**Limite importante:** sem log histórico de criação/atribuição, parte da autoria pode ser irrecuperável. A proposta corrige a rastreabilidade futura, mas não deve fabricar certeza sobre o passado.

## 9. Ordem de implantação recomendada

| Etapa | Entrega | Condição para avançar |
|---|---|---|
| 0 — Conferir a operação | Coleta inicial e configurações verificadas; confirmar casos suspeitos e medir tempo de uso | Relatório de dados e exemplos conferidos com a gestão |
| 1 — Contexto imediato | Aviso de pedido recente, mantendo o cliente na fila; nome correto do canal no pedido | Casos reais de ontem/anteontem, outros canais, cancelamentos e erro conferidos |
| 2 — Menos preenchimento | Resultado simples, próxima ação única e revisão de pendências; substituir o bloqueio após decisão | Piloto sem perda de compromissos e sem aumento de clientes esquecidos |
| 3 — Carteira e prospecção | Pausa/revisão, transferência e cadastro com deduplicação/idempotência | Responsáveis, permissões e migração validados |
| 4 — Gestão confiável | Unificar indicadores, corrigir filtros/exportação e aproveitar insights | Números reconciliados com os registros que os compõem |

O aviso recente pode ser a primeira entrega isolada. As mudanças de pausa, bloqueio e avaliação precisam amadurecer juntas para que aliviar a tela não esconda clientes.

**Piloto sugerido:** uma carteira por cerca de duas semanas, com avaliação diária curta da gestão e opção de voltar à interface anterior. O prazo é sugestão de observação, não promessa de desenvolvimento. Definir duração de implementação após conferir dados, migração e configurações reais.

**Medir antes e durante:** tempo para registrar contato, repetição de pendências, clientes fora do ciclo, retornos cumpridos, duplicidades confirmadas e recompra. Sucesso não é apenas reduzir o tamanho da fila; é reduzir trabalho improdutivo mantendo a cobertura da carteira.

## 10. Casos de aceitação antes de publicar

| Cenário | Resultado esperado |
|---|---|
| Compra ontem; rota hoje | Cliente continua na fila com aviso e acesso ao pedido |
| Compra anteontem perto da meia-noite | Janela aplicada no fuso e definição aprovados |
| Pedido feito pelo escritório | Aviso visível ao responsável autorizado, com autoria correta |
| Pedido cancelado, rascunho, erro ou bonificação | Rótulo próprio; não afirmar compra comercial concluída |
| Compra recente com reclamação aberta | Reclamação continua pendente |
| Abre formulário de pedido e abandona | Nenhuma resolução fictícia |
| Retorno hoje em dia diferente da rota | Retorno aparece e explica sua prioridade |
| Pausa até uma data futura | Sai da obrigação recorrente conforme regra aprovada e entra na revisão prevista |
| Cliente não quer contato | Não volta automaticamente à abordagem comercial |
| Vendedor deixa a região | Carteira mantém responsável ou fica explicitamente para redistribuição |
| Conclui/reagenda retorno | Compromisso anterior deixa de contar como vencido; histórico preservado |
| Lead sem perspectiva | Encerramento com motivo; histórico e busca preservados |
| Falha no upload da foto e tenta de novo | Mesmo lead, sem nova criação |
| Mesmo telefone em dois estabelecimentos | Sugestão para revisão, sem fusão automática |
| Atendimento seguido de pedido | Eventos preservados; cliente contado uma vez na cobertura |
| Três contatos sem pedido | Não classificar automaticamente como recusa por WhatsApp |
| Pesquisa/CSV com mais de uma página | Resultado corresponde ao universo filtrado e informa limites |
| Usuário tenta acessar outra carteira | Backend aplica o escopo permitido |
| Rede lenta ou falha de consulta | Tela não conclui que não há pedido/tarefa; mantém formulário e permite recuperação |

## 11. Decisões para nossa próxima conversa

**Já decidido:** manter o cliente na fila com aviso de pedido recente.

Deixar para discutir quando houver disponibilidade:

1. Os dois dias significam dias de calendário, 48 horas ou dias úteis?
2. A opção sugerida pela reclamação, “Pedido antecipado — entrega mantida”, pode encerrar a pendência do dia por decisão explícita ou deve apenas registrar contexto?
3. Podemos substituir o bloqueio geral pela revisão de pendências com acompanhamento da gestão?
4. Quem pode pausar contato, encerrar oportunidade e solicitar/confirmar redistribuição de carteira?
5. Qual prazo de revisão faz sentido para pausa, falta de resposta e oportunidade ainda não qualificada?
6. Quando você fala em “avaliação”, há alguma tela ou cobrança de desempenho além dos painéis analisados?
7. Como tratar os candidatos já identificados: Merc carmim, Mercado Santo Antônio, Santa Barbara e leads que coincidem com clientes? Conferir primeiro se são o mesmo estabelecimento e qual histórico preservar.

Minha recomendação é começar pelo aviso de pedido recente e pela conferência dos indicadores; depois atacar a obrigação de “finalizar” substituindo-a por resultado e próximo passo claros.

## 12. Referências para implementação

As referências são relativas à raiz deste repositório; os números de linha correspondem à análise desta versão.

| Arquivo | Evidência principal |
|---|---|
| [RotaLeads.jsx](../frontend/src/pages/Rota/RotaLeads.jsx) | Linhas 148–208: atendido hoje; 233: orientação com timer; 1697: carregamento; 1875: alertas; 2013: fila; 2092: atendidos |
| [PendenciaRotaGateway.jsx](../frontend/src/components/PendenciaRotaGateway.jsx) | Bloqueio geral, isenções, resolução local ao abrir pedido e camadas do modal |
| [ModalAtendimento.jsx](../frontend/src/pages/Rota/ModalAtendimento.jsx) | Tipos/ações, linha 231: validações/GPS; duas datas; resultado e etapa independentes |
| [ModalNovoLead.jsx](../frontend/src/pages/Rota/ModalNovoLead.jsx) | Linha 190: validações; criação seguida de upload |
| [ModalEditarLead.jsx](../frontend/src/pages/Leads/ModalEditarLead.jsx) | `handleSalvar`: ação usada como tipo de atendimento, preservando etapa |
| [ListaLeads.jsx](../frontend/src/pages/Leads/ListaLeads.jsx) | Etapas atuais, filtros e histórico |
| [NovoPedido.jsx](../frontend/src/pages/Pedidos/NovoPedido.jsx) | Linha 941: encaixe nas observações; 1765: “Qualidade” usada para canal |
| [atendimentoService.js](../backend/services/atendimentoService.js) | Linha 79: gravação; 241: alertas; 336: pendências; 452: painel e agregações |
| [leadService.js](../backend/services/leadService.js) | Linha 49: fila; 83: criação; 136: finalização; 146: conversão |
| [iaClienteService.js](../backend/services/iaClienteService.js) | `criarLead`: entrada WhatsApp/IA |
| [leadController.js](../backend/controllers/leadController.js) | Criação, edição e escopo de permissões |
| [atendimentoController.js](../backend/controllers/atendimentoController.js) | Entrada de dados, usuário registrador e consultas |
| [schema.prisma](../backend/prisma/schema.prisma) | Pedido, Lead e Atendimento; ausência de ciclo de vida próprio para retorno |
| [PainelAtendimentos.jsx](../frontend/src/pages/Atendimentos/PainelAtendimentos.jsx) | Linha 217: filtros locais; 258: exportação da lista carregada |
| [dashboards.js](../backend/routes/dashboards.js) | Aba `/geral/atendimentos`, conversão por `pedidoId`, retorno vencido por data |
| [adminDashboard.js](../backend/routes/adminDashboard.js) | Outras contagens de venda/contato; etapas de lead divergentes |
| [clienteInsightService.js](../backend/services/clienteInsightService.js) | Ciclo, pedidos válidos e contagem de contatos sem pedido no mesmo dia |
| [orientacaoService.js](../backend/services/orientacaoService.js) | `classificarCenario`: três contatos sem pedido → NEGA_WHATSAPP |
| [metaService.js](../backend/services/metaService.js) | Metas por data de venda/entrega e filtro próprio de validade |
| [pedidoService.js](../backend/services/pedidoService.js) | Consulta legada sem paginação e filtros da listagem |
| [clienteController.js](../backend/controllers/clienteController.js) | Clientes ativos por padrão, carteira e limite de listagem |

### Nota de manutenção documental, fora do escopo comercial

A ferramenta de design identificou que `PRODUCT.md` usa um formato antigo; a atualização de contexto (`init`) pode ser tratada separadamente, se desejado. Também há uma versão mais recente da skill Impeccable; nenhuma atualização de ferramenta ou documento de contexto foi executada.
