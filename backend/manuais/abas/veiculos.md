---
aba: Veículos
rota: /admin/veiculos
permissao: todos visualizam; admin ou Pode_Editar_Veiculos para editar
---

# Veículos

## O que é

Cadastro e controle da frota de veículos da empresa. Permite registrar carros/caminhões, associá-los às rotas de entrega e gerenciar manutenções preventivas com alertas por quilometragem ou data. Durante o uso diário, o motorista seleciona o veículo ao abrir o caixa, e a ficha do veículo registra KM percorrido.

---

## O que dá pra fazer aqui

- Listar todos os veículos com placa, modelo, tipo de combustível e status
- Cadastrar novo veículo
- Editar dados do veículo (placa, modelo, combustível, documento)
- Ativar/desativar um veículo
- Ver a ficha do veículo (KM por data, histórico de uso nas rotas)
- Gerenciar manutenções: criar alertas de manutenção preventiva por KM ou data
- Marcar um alerta de manutenção como concluído
- Ver quantos alertas pendentes cada veículo tem (badge vermelho)
- Definir o **Tipo** do veículo (Carga, Passeio ou Particular): é ele que decide quais fotos o motorista tira no checklist de saída
- Cadastrar as **fotos modelo** do veículo (aba "Fotos modelo" da ficha): o motorista vê a foto modelo na tela "Tire assim"
- Conferir na aba **Checklists** da ficha o que cada motorista fotografou na saída

---

## Como fazer (passo a passo real)

### Cadastrar um veículo
1. Clique no botão **+ Novo Veículo** (admin ou com permissão)
2. Preencha: placa, modelo, **tipo do veículo** (Carga, Passeio ou Particular; o padrão é Carga), tipo de combustível, URL do documento (opcional)
3. Salve

### Registrar alerta de manutenção
1. Clique no ícone de chave inglesa (manutenção) no veículo
2. Preencha: tipo (revisão, pneu, óleo, etc.), descrição, KM alerta e/ou data alerta
3. Salve — o badge de alertas pendentes atualiza

### Marcar manutenção como feita
1. Abra o painel de manutenção do veículo
2. Clique no ícone de check no alerta pendente
3. O alerta some da lista de pendentes

### Ponto diário do motorista: Presencial ou Home Office (e "Pegar veículo" depois)

Ao abrir o app, todo usuário sem a permissão "Isento de Ponto" (e que não é admin) passa pelo **Ponto Diário** e escolhe como trabalha hoje:
- **Presencial (Rota)**: escolhe a placa, informa o KM inicial (o app sugere o último KM registrado do carro e não aceita valor menor) e marca o checklist de segurança obrigatório (pneus, luzes, óleo/água, combustível, CNH/CRLV, limpeza). Veículo já escolhido por outro motorista hoje aparece bloqueado com o nome dele.
- **Home Office**: sem veículo. Se mais tarde a pessoa sair com o carro, usa o botão **"Pegar veículo"** (no celular fica no topo ao lado do menu; no computador, na barra lateral acima do nome). Ele abre o mesmo formulário (placa, KM, checklist) e converte o dia para Presencial — o registro guarda a observação "Começou em Home Office — pegou o veículo às HH:MM". O botão só aparece para quem está em Home Office no dia; só é possível um veículo por dia (para trocar de carro é preciso encerrar o expediente antes).
- **Finalizar**: quem está Presencial vê o botão vermelho "Finalizar" (mesmo lugar do "Pegar veículo") para informar o KM de chegada. Se não informar, no dia seguinte o app cobra o KM final antes de liberar qualquer tela.
- Admin pode ajustar o KM inicial ou apagar o ponto do dia (ex.: modo escolhido errado) pela ficha do veículo.
- **Pendências de Rota (desde 09/2026):** além da trava de KM acima, iniciar o dia também é recusado se o vendedor deixou cliente(s) da rota do **dia útil anterior** (ontem, ou sexta se hoje é segunda) sem nenhum atendimento registrado nem pedido criado. A mensagem mostra quantos clientes e a data ("Você tem N cliente(s) da rota de DD/MM sem atendimento..."); a tela cheia com a lista (registrar atendimento ou abrir pedido para cada um) é o `PendenciaRotaGateway`. Vale a mesma isenção: `admin` ou `Isento_Ponto` pulam a trava. A regra é reforçada nos dois lados — o app já bloqueia a tela (frontend) e o backend também recusa `POST /api/diarios/iniciar` (código `PENDENCIA_ROTA`) se alguém tentar contornar chamando a API direto. Não conta domingo/sábado (o motorista não deveria estar trabalhando) e só vale a partir de 15/04/2026. **A partir de 09/10/2026, a tela de pendências exige justificativa escrita** (campo Observação com no mínimo 10 caracteres) em todo atendimento, inclusive "Sem visita"; o app não deixa salvar sem ela e o servidor também recusa (erro 400, código `JUSTIFICATIVA_OBRIGATORIA`) quando o pedido vem dessa tela. Além disso, enquanto o cliente estiver na lista de pendência de ontem, qualquer atendimento dele registrado pelo próprio vendedor (inclusive pela tela Rota) também exige a justificativa. Administrador, quem tem Isento de Ponto e o escritório registrando em nome do vendedor não entram nessa regra.
  - **Rechecagem automática (desde 09/2026):** como o app fica dias abertos no celular (PWA), a checagem de pendência não é feita só na abertura — ela repete sozinha ao voltar para o app (trocar de aba/app e voltar) no máximo 1x a cada 5 minutos (banco compartilhado lento no pico), e sempre que o dia local virar (mesmo com o celular ligado e o app aberto a noite toda) — nesse caso a rechecagem é imediata, sem esperar os 5 minutos. O mesmo vale para o status do Ponto (`DiarioContext`): se o dia virar com o app aberto, a trava de "iniciar o dia" volta a aparecer sozinha, sem precisar fechar e abrir o app. Se o backend recusar `POST /api/diarios/iniciar` com `PENDENCIA_ROTA` (alguém contornou a checagem do frontend), o app já dispara a rechecagem na hora — a tela cheia de pendências aparece em vez de só um aviso confuso. Se a checagem de pendências falhar por rede (3 tentativas), o app **não libera silenciosamente**: mostra a tela "Não foi possível conferir suas pendências de rota" com botão "Tentar novamente" — o usuário continua logado, só não usa o app até confirmar.

### Checklist de saída por foto (modo teste, desde 20/10/2026)

No lugar das 6 caixinhas, o motorista que sai **Presencial** (ou usa "Pegar veículo") tira **fotos** do veículo, conforme o tipo:
- **Carga**: frente com placa, lateral direita, lateral esquerda, traseira com placa, painel, água do radiador, baú por dentro e a vareta de óleo.
- **Passeio**: igual, trocando o baú por porta-malas.
- **Particular**: só a foto do painel.
- A **vareta de óleo** só é obrigatória às **segundas e quintas** ou quando o motorista marca "luz de óleo acesa". Nos outros dias é opcional.
- Cada foto é enviada na hora e analisada por uma IA, que lê placa, KM do painel, luzes de aviso e níveis, e aponta problemas (pneu murcho, óleo ou água baixos, luz grave acesa...). A IA **não reprova foto por estar escura**: se faltar algo, ela diz o que mostrar. Se a foto não serve, o motorista vê o motivo e tira de novo. **No máximo 2 pedidos de "refazer" por foto**: na 3ª tentativa a IA não pede mais para refazer; avalia o que dá e, se não der, pergunta "Você conferiu e está ok?" (a foto fica como atenção até o motorista responder). O limite técnico de tentativas por ângulo continua 6.
- O sistema também confere: a **placa** lida precisa ser a do veículo escolhido e o **KM do painel** precisa bater com o KM digitado (até 30 km de diferença é normal; de 31 a 1.000 vira atenção "Painel marca X. Confere o KM que você digitou."; acima de 1.000 é reprovação).
- **O carro é tratado como parado no pátio** (chave ligada, freio de mão puxado, porta aberta): luz de **freio, porta aberta e cinto** no painel **não reprovam** e não contam como atenção. A IA lista a luz e faz uma **pergunta de Sim/Não** ("É o freio de mão puxado?"). Só reprovam no painel: óleo, temperatura, bateria, motor/injeção, airbag, ABS e direção. Combustível só vira atenção ("Abastece antes da rota.") quando a luz da reserva está acesa ou o ponteiro está claramente no E; na dúvida, a IA não fala nada.
- **Água do radiador e vareta de óleo com confirmação**: se o reservatório é opaco/sujo e dá para ver as marcas MIN/MAX mas não o nível, a IA **não pede para refazer**: pergunta "a água tá entre MIN e MAX?" (dica: acender a lanterna atrás ou abrir a tampa). Na vareta há dois tipos: plástico laranja quadriculada (Uno/Fiat: óleo molhando dentro do quadriculado) e metal com duas marcas (Bongo: óleo entre as marcas). Se não dá para ler, pergunta "o óleo tá molhando dentro do quadriculado (ou entre as marcas)?". Nunca pede papel branco, só fundo claro e chegar a 20 cm da ponta.
- **Perguntas de um toque (Sim/Não)**: enquanto não respondida, a pergunta não muda o resultado do checklist. Respondendo **Não**, vira atenção (ou grave, conforme o caso); **Sim** resolve. A resposta fica gravada com a hora.
- **Linguagem**: as frases da IA e do sistema falam com o motorista de forma curta e direta ("Fecha o capô e tira de novo"). Quando o problema é enquadramento, sempre diz "mais perto"/"mais longe" com a medida. Orientação por foto: frente 2 passos (frente inteira e placa legível; rodas não são exigidas), laterais 4 passos (carro inteiro), traseira 2 passos com a porta do baú fechada, painel sem flash, água a 30 cm, vareta a 20 cm. Capô aberto nas fotos de fora vira o aviso "Fecha o capô e tira de novo; primeiro as fotos de fora, depois o capô". No porta-malas a IA só olha organização e limpeza (as bolsas pretas do mostruário são normais).
- **Ordem das fotos**: 1) de fora, 2) painel, 3) capô (água, vareta), 4) baú/porta-malas.
- **KM menor que o último final**: o sistema também avisa (atenção) se o KM do painel é menor que o último KM final registrado do veículo.
- Se houver problema, o motorista vê a frase do problema, o que fazer e o aviso fixo de período de teste, e escolhe **Corrigir agora** ou **Seguir mesmo assim (teste)**. **Em modo teste nada trava o início do dia**: IA fora do ar, foto que não sobe (dá para "Pular esta foto (teste)") ou veículo sem foto modelo não impedem a saída. As travas de KM final de ontem pendente, pendência de rota e veículo já em uso continuam valendo normalmente.
- Quando a IA está fora do ar, a foto sobe "sem análise" e o resultado do checklist fica como "IA indisponível".
- O que o motorista decidiu (corrigiu ou seguiu) e todas as fotos ficam gravados.

**Fotos modelo** (quem tem admin ou "Pode_Editar_Veiculos"): na ficha do veículo, aba "Fotos modelo", envie uma foto por ângulo. Enviar de novo substitui a anterior (a antiga fica no histórico). Quem só visualiza pode ver, mas não enviar. Sem foto modelo o motorista vê só a orientação escrita.

**Aba Checklists da ficha** (admin ou "Pode_Acessar_Veiculos"): lista, do mais recente ao mais antigo, os checklists concluídos do veículo com motorista, resultado (aprovado, atenção, reprovado, IA indisponível), decisão do motorista, KM lido no painel × KM digitado e as miniaturas das fotos.

**Chave de emergência**: existe uma chave que volta o checklist para as 6 caixinhas antigas sem publicar nada. Agora ela tem **botão em Configurações → card "Checklist de veículos"** (só administrador). O resumo antigo (✓/✗ por item) continua aparecendo na aba de motoristas da ficha.

**Dia 2 (22/10/2026): o que mudou para o motorista**
- **Foto extra opcional** na água do radiador ("foto de cima, com a tampa aberta") e na vareta de óleo ("foto da ponta, bem de perto"). **Nunca trava**: dá para escolher "Depois". Essa 2ª foto **não passa pela IA** (sem custo, não reprova) e fica só como apoio para o escritório; mandar de novo troca só a foto extra, a principal não muda.
- **"Tá certo assim, deixa"**: se a IA marcou uma foto como atenção ou pediu para refazer, o motorista pode discordar e seguir. Vale **só no modo teste** e **nunca para foto reprovada** nem para pergunta ainda sem resposta. O veredito original da IA não é alterado (serve para calibrar a IA); o sistema só passa a não contar aquele aviso no resultado e registra a **discordância** (hora e foto). Dá para desfazer enquanto o checklist está aberto. Com a chave em "desligado" o botão é recusado.
- **KM do painel**: o app guarda se o KM foi **confirmado a partir do painel** ou **digitado** (campo "origem do KM").

**Dia 2: o que mudou para o escritório**
- **Cadastro do veículo (quem edita veículos) ganhou 4 campos que ajudam a IA**: *tipo de vareta* (plástico quadriculada ou metal com marcas), *reservatório de água opaco* (sim/não), *o que é normal ter dentro* (até 500 caracteres, ex.: "bolsas pretas do mostruário, caixa térmica azul") e *avarias já conhecidas* (até 500 caracteres, ex.: "para-choque traseiro raspado"). A IA passa a usar: na vareta lê pelo tipo certo, no reservatório opaco pergunta em vez de pedir outra foto, não reclama do que é normal no baú/porta-malas e não aponta de novo avaria já conhecida (nas 4 fotos de fora). O texto digitado é tratado como informação.
- **Aba Checklists da ficha**: além dos concluídos, mostra o checklist **em andamento de hoje** (com pelo menos 1 foto), para quem recebe o aviso por WhatsApp conseguir ver as fotos antes de o motorista iniciar o dia. Quem tem permissão do **Caixa** (acessar ou editar) também vê essa aba ao abrir a ficha pelo Caixa. Cada checklist mostra o número de **discordâncias** (fotos em que o motorista disse "tá certo assim") e a origem do KM.
- **Visão do dia**: lista dos veículos que saíram hoje (ou têm checklist em andamento) com motorista e resultado — rota `GET /api/veiculos/checklists-hoje` (admin ou "Pode_Acessar_Veiculos").
- **Avisos por WhatsApp** (equipe interna, nunca cliente): *na hora* quando um motorista **segue mesmo com checklist reprovado** ou **responde "Não" a uma pergunta da IA**; e **resumos** nos horários configurados (padrão 7h e 13h) com quantos saíram, quem teve problema, quem saiu **sem checklist por foto** e quem está montando. Se ninguém foi escolhido, o aviso vai para os **administradores com telefone cadastrado**. Quem recebe e os horários ficam em Configurações → "Checklist de veículos" (botão de teste manda uma mensagem só para você). Domingo sem movimento não manda resumo. Se o WhatsApp do bot estiver fora, as mensagens ficam na fila e saem depois.

**Como o motorista vê a foto (Dia 2):**
- **Tocar num quadrinho com foto abre a foto em tela cheia** com o parecer da IA e o que fazer; arrastar para o lado troca de foto, dois dedos ampliam, e o botão "Tirar de novo" abre a câmera no mesmo toque. Quadrinho vazio abre a tela "Tire assim", que agora mostra um **desenho** da posição e distância (vale mesmo sem foto modelo).
- Os quadrinhos ficam em **blocos na ordem certa**: por fora (capô fechado), painel, capô aberto (água e óleo) e baú/porta-malas. Ao passar para o capô sem as fotos de fora, o app avisa, mas deixa seguir.
- **KM do painel**: quando a IA lê o KM, o app mostra "Painel marca X km. Confirma?" com Confirma/Corrigir, em vez de pedir para digitar.

**Veículos no computador (Dia 2):** em tela a partir de 1024 px, lista à esquerda e ficha à direita, sem painel por cima, com busca por placa/modelo, filtro de tipo, "só ativos" e a coluna **Hoje** com o selo do checklist. No celular e iPad em pé continua com cartões e painel lateral. As miniaturas de checklist e as fotos modelo abrem em tela cheia (setas do teclado, roda do mouse para ampliar, Esc fecha).

### Ver ficha do veículo (histórico de KM)
1. Clique no ícone de ficha (ChevronRight) no veículo
2. A ficha abre mostrando o histórico de KM por data de uso nas rotas

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Visualiza os veículos |
| `admin` ou `Pode_Editar_Veiculos` | Pode criar, editar e gerenciar manutenções |

---

## Depende de / Interfere em

- **Embarque** — ao montar uma carga, o motorista seleciona o veículo
- **Caixa Diário** — o veículo do dia aparece no caixa; a ficha de KM é registrada no caixa
- **Despesas** — despesas de manutenção do caixa são vinculadas ao veículo do dia

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Veiculos/Veiculos.jsx` | Tela principal com lista e modais |
| `frontend/src/pages/Veiculos/VeiculoFicha.jsx` | Painel de ficha do veículo |
| `backend/src/routes/veiculos.js` | Rotas do backend |
| `frontend/src/components/Diario/DiarioGateway.jsx` | Trava de Ponto Diário (KM) na abertura do app |
| `frontend/src/components/PendenciaRotaGateway.jsx` | Trava de Pendências de Rota (tela cheia com a lista) |
| `backend/services/diarioService.js` (`iniciarDia`) | Recusa o check-in com KM pendente OU rota pendente (`codigo: 'PENDENCIA_ROTA'`) |
| `backend/services/atendimentoService.js` (`buscarPendenciasRota`) | Calcula quem ficou sem atendimento no dia útil anterior |

### Foto na volta e pendências de veículo (Dia 3, modo teste)

- **Checklist de volta**: ao encerrar o dia de trabalho com carro, o motorista tira **3 fotos**: painel (a IA lê o KM final), traseira e o baú/porta-malas (o certo é estar **vazio e limpo**). Se responder **"Bateu ou raspou em algo hoje? Sim"**, as duas laterais também passam a ser obrigatórias (o app envia essa resposta ao servidor assim que a pessoa toca em Sim ou Não). Carro "Particular" só tira o painel. A volta **nunca impede** a pessoa de encerrar o dia.
- **KM final pelo painel**: se o motorista confirma o KM lido na foto ("Painel marca X. Confirma?"), o sistema usa esse KM no fim do dia. Se ele digitar um KM que difere do painel em mais de 30 km, o app recusa e pede para conferir. O KM final continua não podendo ser menor que o inicial. Repetir o encerramento (clique duplo) não muda o KM nem a observação já gravados.
- **Sem câmera ou sem sinal**: o motorista sempre pode encerrar o dia **digitando o KM** (botão "Não consegui tirar as fotos"). Esse dia vira uma **pendência de volta** (volta sem foto). Se o dia seguinte começar com dia anterior sem encerrar, o app pede o KM/fotos de ontem antes de abrir o dia (a foto tirada no dia seguinte fica marcada como **atrasada**). Quem encerrou digitando o KM fica na lista até o responsável dar OK; mandar as fotos depois, pela tela, vem numa próxima entrega.
- **Pendências**: a lista de "dias sem foto da volta" é calculada pelo sistema (não é preenchida por ninguém). Aparece na **Central de Pendências** (bloco "Veículos: volta sem foto") e em `/veiculos/pendencias`. Só entram dias a partir da data de início configurada (para não despejar o histórico antigo). Quem é **administrador ou está na lista "Quem libera e dá OK"** pode dar **OK** com um **motivo** (mínimo 5 letras): o item sai da lista e o OK fica no histórico dos últimos 30 dias, com quem deu e por quê. OK repetido não duplica; dia que ainda não acabou ou que já tem as fotos não aceita OK. Quem não está na lista nem é admin só vê (se tiver acesso à Central) e o servidor recusa o OK.
- **Quem libera e dá OK**: lista ordenada, definida pelo administrador (rotas `GET/PUT /api/checklists-veiculo/config/responsaveis`). Se estiver vazia, vale **administradores ativos com telefone**.
- **Aviso das 6h**: todo dia entre 6h e 9h o sistema manda um WhatsApp **interno** (nunca cliente) aos responsáveis com os dias dos últimos 7 dias ainda sem foto de volta e sem OK. Sem pendência, não manda nada.
- **Caixa**: o dado da volta já vai na resposta do resumo do Caixa (a API), mas o **selo da volta no card do dia ainda não aparece na tela**: isso vem numa próxima entrega. O selo da saída continua sendo só o da saída.
- **Permissões (Dia 3)**: apagar veículo agora exige "Pode_Editar_Veiculos" (ou admin) e a lista completa com inativos (`/veiculos/admin/todos`) exige "Pode_Acessar_Veiculos" (ou admin) — antes qualquer usuário logado conseguia pelo servidor. A lista de veículos ativos usada pelo motorista não mudou.
