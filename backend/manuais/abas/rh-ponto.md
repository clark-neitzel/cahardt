# Ponto

**Rota:** `/rh/ponto` · **Permissão:** `Pode_Ver_RH` (ver) / `Pode_Editar_RH` (ajustar/importar)

Controle de ponto eletrônico da equipe. O funcionário bate o ponto por um **link pessoal** (sem login) e o RH acompanha tudo aqui. Trabalha junto com a aba **Funcionários** (cadastro, escala e cartão de ponto).

## Como o funcionário bate o ponto (link público)
- Cada funcionário tem um **link fixo** (`/ponto/<token>`), gerado na ficha dele em Funcionários → aba Dados.
- O acesso exige **senha** (definida pelo RH na ficha → aba Dados → "Senha de acesso ao ponto"). Sem senha definida, o link mostra "acesso ainda não liberado". A sessão fica salva no aparelho por alguns dias para não pedir a senha toda vez.
- **Bloquear acesso:** na ficha → aba Dados, desmarque **"Acesso liberado"** (campo `ativo`) quando a pessoa deixar de ser funcionário/prestador — o link recusa o login na hora.
- Ao entrar, o funcionário vê o relógio ao vivo, o status (Fora / Trabalhando) e **DOIS botões: ENTRADA e SAÍDA** — ele escolhe o que está fazendo. O botão que o sistema espera vem em destaque (maior, em cima), mas o outro está sempre disponível.
  - **Por que dois botões:** antes o app decidia pelo número de batidas do dia (1ª = entrada, 2ª = saída…). Bastava **esquecer uma batida** para **todas as seguintes do dia ficarem invertidas** (a saída gravada como entrada). Agora o tipo é o que a pessoa escolheu — esquecer uma batida não contamina o resto do dia.
- **Confirmação depois de bater:** tela grande com o tipo, o horário, se estava na empresa e o **total de horas do dia**. Nos **primeiros 10 minutos** aparece **"Não era isso? Registrar como saída/entrada"**, que troca o tipo da última batida — o próprio funcionário conserta o toque errado, sem pedir nada a ninguém. Passados os 10 min, só por pedido de acerto.
- **Trava de toque repetido:** bater o **mesmo tipo** duas vezes em menos de 2 minutos é recusado, com aviso de que já foi registrado.
- **Aviso "Confere o seu dia":** a tela avisa na hora quando o dia está estranho — entrada sem saída há mais de 6h, **duas entradas (ou duas saídas) seguidas**, ou duas batidas em menos de 2 minutos. O erro aparece no mesmo dia, não no fechamento.
- O funcionário vê **somente o dia de hoje** (batidas + total). Espelho do mês, saldo, banco de horas e faltas **não aparecem** para ele — isso é só do escritório.
- Cada batida registra a **localização (GPS)**. Tocando no horário de uma batida, abre o **mapa** do local.
- **Geofence:** se houver ponto da empresa configurado, o ponto só pode ser batido dentro do **raio** definido (ex.: 10 m). Fora da área, o registro é bloqueado com aviso da distância.

## Configurar a área da empresa (geofence) e o link
- No Painel de Ponto → **Configurar** (`/rh/ponto/config`): define a **latitude/longitude** da empresa e o **raio em metros**. Há o botão **Usar minha localização atual** (captura o GPS do aparelho) e um **mapa** de prévia.
- **Domínio do link de ponto:** define o início do link enviado ao funcionário (ex.: domínio da hardtsalgados). Em branco, usa o domínio em que o app está aberto.
- A opção **Bloquear batida fora da área** liga/desliga o bloqueio. Sem localização configurada, o ponto é registrado sem checagem de área.

## Feriados da empresa
- Na mesma tela **Configurar** (`/rh/ponto/config`), o bloco **Feriados da empresa**: adicione a **data** + um **nome** (ex.: "Aniversário da cidade"). Cada inclusão/exclusão já é gravada na hora.
- Efeito no cartão de ponto de **todos** os funcionários: quem não vem no feriado **não fica com falta** (o dia aparece com o nome do feriado), e o feriado entra como **dia de descanso** no cálculo do DSR sobre as horas extras.

## Painel de Ponto (admin)
- KPIs do dia: **trabalhando agora**, total de ativos e fora.
- Tabela com as **batidas de hoje** de cada funcionário, com link do mapa em cada horário e status (Trabalhando / Fora).
- Botão **Ajustar** leva à ficha do funcionário (aba Cartão de ponto) para corrigir/adicionar batidas.

## Pedido de acerto — "Esqueci de bater" (o funcionário pede, o RH aprova)
- Na tela do link, o botão **"Esqueci de bater — pedir acerto"** abre um formulário onde o funcionário lança **vários horários num pedido só**: cada linha é hora + se era Entrada ou Saída, com "**+ Adicionar outro horário**" (até 20) e um **motivo** que vale para o pedido inteiro.
- **Por padrão só dá para pedir acerto do dia de hoje.** Para abrir dias anteriores, grave a chave `ponto_acerto` em AppConfig com `{ "diasParaTras": 7 }` — aí o campo **Dia** aparece no formulário, limitado a esse número de dias.
- Enquanto não respondem, a tela dele mostra **"Aguardando o RH"** e o botão de pedir some (um pedido pendente por vez).
- **No app:** *Painel de Ponto* mostra o cartão **Pedidos de acerto** com o nome, o motivo e a lista de horários. O RH pode **Aprovar todos**, **desmarcar alguns e aprovar só os marcados** (escrevendo o **motivo da recusa**, que o funcionário vê) ou **Recusar tudo**. Exige `Pode_Editar_Ponto`.
- Cada horário aprovado vira uma **batida** no cartão, com origem manual, guardando **quem pediu, o motivo, quem aprovou e quando**. Horário que já existia no minuto exato não é duplicado.
- **A resposta espera pelo funcionário:** aprovado hoje ou daqui a três dias, na próxima vez que ele abrir o ponto aparece no topo da tela — *"Seu pedido foi aprovado"* (ou *"1 de 2 aprovados"*, com o motivo da recusa), listando cada horário com ✅/❌. O aviso só some quando ele toca em **"OK, entendi"** — e essa confirmação de leitura fica registrada.

## Ajustar / adicionar batida (pelo escritório)
- Na ficha do funcionário → **Cartão de ponto** → **Adicionar batida**: informa data, hora, tipo (Entrada/Saída) e motivo. Fica marcada como **ajuste manual** (registra quem ajustou). Útil para corrigir dias antigos, fora do fluxo de pedido.

## Importar ponto do relógio (CSV)
- Em **Funcionários → Importar** (ou no Painel de Ponto → Importar): sobe a planilha **CSV** exportada pelo relógio de ponto físico.
- Passos: **enviar o arquivo** → **mapear as colunas** (CPF/matrícula, data, hora e, opcionalmente, tipo) → **conferir a prévia** → **importar**.
- O sistema casa cada batida pelo **CPF/matrícula** com o funcionário cadastrado, **ignora duplicadas** (mesma pessoa, dia e hora) e alterna Entrada/Saída quando não há coluna de tipo.
- Batidas importadas entram **sem GPS** e marcadas como origem **CSV** (diferente das batidas pelo link, que têm localização).

## Cartão de ponto / regras
- A **carga diária** vem da escala do funcionário. Com **janela móvel**, se entrar antes, a saída esperada desloca mantendo a mesma carga; só o que passar disso vira **banco de horas** ou **hora extra paga** (conforme o tipo configurado por funcionário).
- O espelho mostra **todos os dias do período escolhido** (inclusive fim de semana), com batidas, previsto, trabalhado, saldo e a **situação** do dia; e no resumo: total trabalhado, previsto, saldo do banco, hora extra e faltas.
- **Dia útil já fechado e sem batida = falta.** O **dia de hoje** (e os dias futuros do período) aparece como *A cumprir* e não conta falta. Sábado sem carga aparece como *Compensado* e domingo como *Descanso* (não são falta). Atestado entra como **abonado**; feriado cadastrado entra como **feriado**.
- Qualquer dia pode ser **marcado à mão** (Falta / Abonado / Feriado / Folga) clicando no selo da coluna Situação — a marcação manda no automático.
- Abaixo do espelho, a **folha do período** apura salário, horas extras (+ DSR), descontos de falta e DSR perdido, e o **total a pagar** (valor bruto) — **só na tela**. Detalhes no manual de **Funcionários (RH)**.
- O botão **Imprimir ponto** gera a folha de ponto para assinatura (só horas, sem valores), com o mês inteiro em **uma folha A4**.
