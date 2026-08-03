# Funcionários (RH)

**Rota:** `/rh/funcionarios` · **Permissão:** `Pode_Ver_RH` (ver) / `Pode_Editar_RH` (editar)

Cadastro operacional de funcionários da empresa: ficha completa, documentos, exames, atestados, escala de trabalho, link de ponto e desempenho. É a base do módulo de **Ponto** (a aba Ponto usa os funcionários cadastrados aqui).

## Lista de funcionários
- Mostra cada funcionário com **cargo**, **status do dia** (Trabalhando desde HH:MM / Fora) e **alertas** (ex.: ASO vencendo ou vencido).
- Busca por nome, CPF ou cargo. Filtro Ativos / Inativos.
- Botões no topo: **Novo** (ativar funcionário), **Painel de ponto** e **Importar** (ponto via CSV).

## Novo funcionário (ativar a partir do cadastro de Cliente)
1. **Buscar a pessoa** no cadastro de Clientes (por nome ou CPF) — puxa nome, CPF, telefone e endereço automaticamente. Quem não está no cadastro pode ser digitado manualmente.
2. Preencher os **dados de RH**: cargo, admissão, salário e o **tipo de hora extra** (Banco de horas ou Hora extra paga).
3. Ao **Ativar como funcionário**, o sistema já cria uma **escala padrão** (seg–sex 07:30–11:30 / 13:00–17:48, sábado 07:30–11:30, domingo folga), que pode ser ajustada na ficha.

## Ficha do funcionário (abas)
- **Dados:** cargo, **salário mensal**, tipo de hora extra, **escala semanal** (entrada/saída por dia, com opção de **janela móvel** que desloca a saída mantendo a carga diária), ativar/inativar e o **link de ponto** pessoal (gerar, copiar, enviar por WhatsApp, gerar novo).
  - Bloco **Cálculo da folha:** **adicional de hora extra (%)** — 50% é o padrão da CLT; **divisor de horas do mês** — 220 para 44h semanais, 180 para 36h (valor da hora = salário ÷ divisor; valor do dia = salário ÷ 30); e a chave **"Falta faz perder o DSR da semana"** (ligada por padrão: além do dia da falta, desconta 1 dia de descanso semanal).
- **Documentos:** anexos em PDF/imagem por categoria (RG, CPF, CTPS, Residência, Contrato, Outro / pasta livre). Ver e excluir.
- **Exames (ASO):** admissional, periódico, demissional, retorno e mudança de função, com **data**, **validade**, **resultado** (Apto/Inapto) e anexo. Mostra **badge** de validade (válido / vence em X dias / vencido).
- **Atestados:** data de início, dias de afastamento, CID opcional e anexo.
- **Cartão de ponto:** espelho do período com **previsto × trabalhado**, **saldo (banco de horas)**, **hora extra** e faltas — e, embaixo, a **folha do período** (ver abaixo).
  - **Período:** filtro padrão do sistema (`[‹] Este mês ▾ [›]`), com Hoje / 7 dias / 30 dias / Este mês / Este ano / personalizado. A escolha fica salva por usuário.
  - **Todos os dias do período aparecem**, inclusive sábado e domingo. Dia útil sem batida vira **Falta**; **sábado** aparece como *Compensado* (jornada já distribuída na semana) e **domingo** como *Descanso* — nenhum dos dois conta falta. Dia de **feriado** cadastrado e dia com **atestado** entram como Feriado / Abonado.
  - Cada batida vira uma pílula com bolinha de tipo (verde = entrada, laranja = saída) e link de localização (mapa) quando houver. **Clicar na hora abre o editor da batida** — dá para **mudar a hora**, o **tipo** (entrada/saída) e o **motivo**, ou **excluir** a batida. Também há o botão **adicionar batida** para lançar uma batida manual (quando o funcionário esquece de bater). Ao adicionar ou editar, as batidas do dia **se reordenam sozinhas pelo horário**.
  - **Clicar no selo da coluna Situação** abre o marcador do dia: **Falta**, **Abonado**, **Feriado** ou **Folga/compensado**, com motivo opcional. A marcação à mão (marcada com ✎) manda no automático; **Voltar ao automático** desfaz.
  - **Falta não vira hora negativa** no banco de horas — ela é descontada em dinheiro na folha. A coluna Previsto continua mostrando as horas que o dia exigia.
  - Botão **Imprimir**: gera a folha A4 do cartão (cabeçalho da empresa, todos os dias, resumo, folha do período e assinaturas de funcionário e empregador). Imprime dentro do próprio app — funciona no iPad.
- **Folha do período** (no fim do Cartão de ponto): calcula sozinha o valor a pagar.
  - **Proventos:** salário base; **horas extras** (horas do período × valor da hora × adicional — só quando o funcionário está como "hora extra paga"; em "banco de horas" aparecem como não pagas); **DSR sobre horas extras** (valor das extras ÷ dias úteis × dias de descanso — domingos e feriados); e **outros proventos** digitados.
  - **Descontos:** **faltas** (dias × salário ÷ 30); **DSR perdido** (1 dia de descanso por semana que teve falta, se a chave estiver ligada na aba Dados); e **outros descontos** digitados (vale, adiantamento) com observação.
  - **Total a pagar** = proventos − descontos. É **valor bruto**: não inclui INSS, IRRF, FGTS nem vale-transporte (isso fica com a contabilidade).
  - Os campos *Outros proventos / Outros descontos / Observação* são salvos por funcionário e por período no botão **Salvar ajustes** — ao reabrir o mesmo período, eles voltam.
  - Se o período escolhido não fechar um mês inteiro, aparece um aviso: o salário base entra cheio mesmo assim.
- **Desempenho & Assiduidade:** nota média, número de atestados e avaliações; permite registrar avaliações (período + nota + observação).

## Observações
- O **link de ponto** é fixo por funcionário: ele salva nos favoritos e bate todos os dias pelo mesmo endereço.
- Os anexos ficam em `/uploads/funcionarios/<id>/` e aceitam PDF e imagens (até 15 MB).
- Funcionário pode ser ativado a partir de um Cliente (origem dos dados) e, opcionalmente, vinculado a um usuário do app.
