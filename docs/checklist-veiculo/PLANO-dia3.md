# Plano Dia 3: checklist de veículo (volta, liberação, pendência, cupom, comparação, trava)

Arquiteto, 21/10/2026. Base: `docs/propostas/proposta-checklist-foto-ia.html`, planos e notas do Dia 1/2, e o código real em `~/Projetos/CA-Hardt`. Só li arquivos. Caminhos relativos à raiz do projeto.

---

## 0. Entendimento e interpretações adotadas

O dono quer fechar o ciclo do checklist: foto na volta (substitui o KM final digitado), pedir liberação ao escritório, pendência de ontem com OK do responsável, cupom na despesa, comparação com foto modelo, e a trava pronta mas DESLIGADA. Tudo em teste, sem travar ninguém, e cada coisa precisa poder ser testada sozinha.

Interpretações (valem até o dono dizer o contrário):

1. **A função de fechar o dia chama `encerrarDia`** (`backend/services/diarioService.js:211`), não `fecharDia`. O KM final digitado hoje está em `DiarioCheckout.jsx` (encerrar do dia) e em `DiarioGateway.jsx` (step 1, "pendência de KM de ontem"). Os dois passam a usar fotos de volta.
2. **"3 fotos de retorno" da proposta = painel + traseira + baú/porta-malas.** O pedido de hoje diz "lateral/traseira". Adotei 3 obrigatórias e um "Bateu ou raspou em algo hoje? Sim/Não"; o Sim abre as duas laterais. Decisão D3.
3. **"Pendência" é calculada, não é uma lista nova a preencher.** O servidor deriva do que existe (diário sem volta, despesa divergente, liberação sem resposta). A única tabela nova é a do OK dado pelo responsável.
4. **"Problema que disse que ia corrigir e não refez" (4ª fonte da proposta) não vira fonte própria.** O servidor já recalcula o veredito (`avaliar`) a cada foto; quem seguiu com problema cai na fonte "liberação sem resposta". Deixo isso explícito para o dono não achar que sumiu.
5. **Trava só vale para quem tem diário PRESENCIAL com veículo no dia.** Home office, administrador e `Isento_Ponto` são isentos (mesmo critério de `diarioService.js:93-95`). Isso responde "quem não dirige não é afetado".
6. **A trava não pode apanhar quem já está na rua quando ela for ligada.** A chave grava `checklist_trava_desde`; diário aberto antes disso fica isento naquele dia. Sem isso, ligar às 10h deixaria motorista sem entregar com o carro cheio.
7. **O escritório nunca é bloqueado pelo checklist do motorista.** Caixa, canhoto e despesa só travam quando quem age é o próprio motorista dono daquele registro. Quem confere o caixa dele continua conferindo; o que impede o fechamento é a pendência (volta/despesa), e o OK do responsável destrava.

---

## 1. Mapa do código atual (conferido)

**Checklist (backend)**
- `backend/services/checklistVeiculoService.js`: `getModo` :95 (lê `checklist_foto_modo`, padrão TESTE), `setModo` :111 (aceita só TESTE/DESLIGADO, recusa TRAVA), `montarConfig` :204, `criarRascunho` :307 (`momento` já aceita VOLTA; reaproveita rascunho com `diarioId: null`), `atualizarRascunho` :335 (`kmOrigem` só aceita PAINEL_CONFIRMADO/DIGITADO), `enviarFoto` :354 (grava em `../uploads/checklists-veiculo/<veiculo>/<data>/<checklist>/`, IA fora de transação), `aceitarFoto` :438 ("Tá certo assim", só TESTE), `pularFoto` :460 (já recusa em TRAVA), `avaliar` :480 (devolve `podeSeguir` e `podePedirLiberacao: false`, hoje fixo), `responderPergunta` :617, `registrarDecisao` :650 (SEGUIU_TESTE só em TESTE), `podeVerDetalhe` :670, `dtoCompleto` :674, `listarPorVeiculo` :709 (concluídos + rascunho de hoje com foto), `resumoParaDiario` :743, `amarrarAoDiario` :777.
- `backend/config/checklistVeiculoAngulos.js`: `SLOTS_POR_TIPO` (CARGA 8, PASSEIO 8, PARTICULAR só painel). **Não existe lista de slots para VOLTA.**
- `backend/services/checklistVeiculoIaService.js`: `analisarFoto` :280, uma imagem por chamada; `aiProvider.analisarImagem` (:177 de `aiProvider.js`) já aceita `imagens: []` com várias.
- `backend/routes/checklistsVeiculo.js` (rotas atuais: config/modo, `/`, `/:id`, fotos, aceitar, pular, avaliar, responder, decisao).
- `backend/services/checklistAvisosService.js`: config `checklist_avisos` em `app_configs`, `enviarParaTodos` (tipo 'interno', origem 'checklist-veiculo', ref `${base}-${destId}`), `reivindicar` (marcador atômico por chave), `rodarResumos`, `agoraSP`. Worker em `backend/workers/scheduler.js:519-531` (tick de 5 min).
- `backend/services/checklistCaixaService.js`: `resumoParaCaixa` (**sem filtro de `momento`**, ver riscos) e `checklistsHoje`.
- Schema `backend/prisma/schema.prisma`: `ChecklistVeiculo` :1648 já tem `liberacaoStatus/PedidaEm/PorId/Motivo/Em` e `okPendenciaPorId/Motivo/Em` (nascem vazios, nenhuma linha de código os usa ainda); `ChecklistVeiculoFoto` :1692; `VeiculoFotoModelo` :1718; `Veiculo` :1579 (tem `capacidadeTanque`, `tipo`, 4 campos de contexto da IA); `Despesa` :1904 **sem nenhum campo de comprovante**.

**Diário**
- `diarioService.js`: `statusDoDia` :32 (`pendenciaAnterior` = diário PRESENCIAL com `kmFinal` nulo em dia anterior), `iniciarDia` :67 (isenção :93-95; `derivarChecklist` :117; ignora checklistId inválido), `assumirVeiculo` :156 (derivar :170), `encerrarDia` :211 (exige `kmFinal` digitado, sem idempotência: repetir sobrescreve).
- `routes/diarios.js`: `/status`, `/iniciar`, `/encerrar`, `/assumir-veiculo`, `PUT /:id/km` (admin).
- Frontend: `DiarioGateway.jsx` (cortina; step 1 = KM de ontem; `resolverPendencia` chama `/diarios/encerrar`), `DiarioCheckout.jsx` (KM final + confirmação de KM acima da média), `DiarioContext.jsx` (status com TTL 5 min), `FormVeiculoPresencial.jsx`, `ChecklistFotos.jsx`.

**Despesas**: `backend/routes/despesas.js` (GET :37, POST :63, PUT :122, DELETE :197); outra porta de entrada de Despesa de COMBUSTIVEL em `backend/routes/veiculos.js:242` (POST abastecimento), `:375` (PUT), `:429` (DELETE), usada pela ficha do veículo (`VeiculoFicha.jsx:269`). Tela do motorista: `frontend/src/pages/Caixa/NovaDespesaModal.jsx`. Consumidores de `prisma.despesa`: `routes/caixa.js` :321, :426, :2369, :2436; `services/caixaConferenciaService.js` :85, :732; `services/veiculoService.js` :106, :264; `adminExec.js` :5279. Nenhum alimenta DRE; os `findMany` sem `select` passam a devolver os campos novos (aditivo, inofensivo).

**Pendências**: `backend/services/pendenciasService.js` (blocos em `DEFINICOES`, `listarPendencias` :~530; `GET /api/pendencias` exige admin, `Pode_Acessar_Financeiro_Gerencial` ou `Pode_Ver_Pendencias`, `routes/pendenciasRoutes.js:13`), tela `frontend/src/pages/Pendencias/PainelPendencias.jsx`, rota `App.jsx:932`.

**Segurança de arquivos**: `index.js:132-137` bloqueia certificado/notas-xml/cache-fiscal e serve o resto de `/uploads` como estático público. Foto do checklist tem nome com 8 bytes aleatórios + UUIDs na pasta (não adivinhável).

---

## 2. Fatias, ordem e dependências

| Fatia | Conteúdo | Depende de | Sai sozinha? |
|---|---|---|---|
| **3-0** Housekeeping rápido | permissão no servidor (`DELETE /veiculos/:id`, `GET /veiculos/admin/todos`), `ultimo-km` com 500, `kmOrigem` regravado, filtro `momento:'SAIDA'` no selo do Caixa | nada | Sim, primeiro (meio dia) |
| **3A** Volta + base das pendências | slots/rota VOLTA, KM final pela foto, fluxo no encerrar e na cortina, fonte de pendência "volta sem foto", tabela de OK, bloco na Central, aviso 6h, config "quem libera/dá OK" | 3-0 | Sim |
| **3B** Liberação | pedir, WhatsApp com link, página de decisão, fila com escalonamento, resposta no app do motorista, "seguir sem resposta" (teste), fonte "liberação sem resposta" | 3A (config de responsáveis e tabela de OK) | Sim, após 3A |
| **3C** Cupom da despesa | foto + IA, comparação, duplicidade, litros > tanque, status, visão lado a lado, fonte "despesa divergente" | 3A (tabela de OK e responsáveis). **Não depende de 3B** | Sim, pode ir em paralelo a 3B |
| **3D** Comparação com foto modelo / saída | IA com 2 imagens, registro silencioso primeiro | nada (usa 3A só para o caso volta×saída) | Sim; só vale cheio depois de 3A |
| **3F** Relatório semanal + consulta de multa + retenção de fotos | worker de segunda 7h, `GET` de uso do veículo, apagar fotos antigas | 3A–3D para o relatório ficar completo | Sim; multa e retenção independem |
| **3E** Trava | helper único, ~14 pontos, "ensaio" (conta quem teria travado), chave `TRAVA` | 3A, 3B, 3C (precisa dos estados) | Última. Nunca antes dos três |

**Recomendação de ordem** (o dono quer testar cada coisa, e a trava só liga depois de ~3 semanas de uso de tudo):

1. 3-0 e 3A no mesmo dia (3-0 é correção de segurança pequena).
2. 3B e 3C em paralelo, cada uma com sua novidade e teste do dono.
3. 3D em "modo silencioso" (grava a diferença, não incomoda o motorista), depois de 3A.
4. 3E em duas etapas: **3E-1 "ensaio"** (hooks em modo só-observa, ainda sem trava) logo após 3C; **3E-2 chave TRAVA** só depois de 3F e do relatório mostrar quantos teriam sido barrados.
5. As 3 semanas de teste contam a partir de 3C no ar (quando o conjunto estiver completo), não de hoje.

Linha do tempo estimada (dias úteis, se não houver trava de revisão): 3-0+3A 22–24/10; 3B e 3C 27/10–03/11; 3D+3F 04–07/11; 3E-1 junto de 3C; 3E-2 pronta ~10/11; **ligar a trava a partir de ~24/11** (3 semanas depois do conjunto completo), com aviso na semana anterior.

**O que NÃO deve sair antes de quê**
- Chave `TRAVA` aceita pela API só no commit da 3E-2, nunca antes (hoje `setModo` recusa e isso é uma trava de segurança do projeto).
- Nenhum ponto de trava (ver seção 5) em produção antes de 3A, 3B e 3C: sem volta, sem liberação e sem cupom, a trava barraria gente sem saída.
- Retenção de fotos só depois de o dono responder D8, e não antes de o relatório semanal estar no ar (ele usa dados das fotos).
- Cupom obrigatório com bloqueio de caixa só em TRAVA; em teste é só marca.

---

## 3. Schema aditivo (tudo opcional ou com padrão; nada removido)

`backend/prisma/schema.prisma` é arquivo compartilhado com a outra sessão: edição só aditiva, commit separado, `npx prisma validate` antes.

**`ChecklistVeiculo`** (campos novos; os `liberacao*` e `okPendencia*` existentes continuam):
- `atrasada Boolean @default(false)` (foto de volta tirada no dia seguinte)
- `liberacaoNivel Int @default(0)`, `liberacaoProximoEm DateTime?`, `liberacaoFila Json?` (snapshot da fila `[{id,nome,enviadoEm}]`), `liberacaoTentativas Int @default(0)`, `liberacaoIaErrou Boolean?`, `liberacaoVoluntaria Boolean @default(false)`
- `@@index([liberacaoStatus, liberacaoPedidaEm])`
- Valores de `liberacaoStatus` (String livre, sem enum): `PENDENTE | LIBERADA | RECUSADA | SEM_RESPOSTA`.

**`ChecklistVeiculoFoto`**: `comparacao Json?`, `apagadaEm DateTime?`.

**`Despesa`** (tudo nulo para o histórico): `comprovanteCaminho String?`, `comprovanteHash String?`, `cupomLeitura Json?`, `cupomNumero String?`, `cupomCnpj String?`, `conferenciaStatus String?` (CONFERIDA | DIVERGENTE | RECUSADA | SEM_COMPROVANTE | IA_INDISPONIVEL | ACEITA), `conferenciaMotivos Json?`, `conferenciaIaModelo String?`, `conferenciaTokens Int?`, `aceitaPorId String?`, `aceitaMotivo String? @db.Text`, `aceitaEm DateTime?`; `@@index([comprovanteHash])`, `@@index([cupomCnpj, cupomNumero])`. Sem `@unique`: o duplicado precisa conseguir entrar para ser marcado, não rejeitado.

**Modelos novos**
- `PendenciaVeiculoOk` (`pendencias_veiculo_ok`): `id, tipo (VOLTA|DESPESA|LIBERACAO), refId, dataReferencia, vendedorId (motorista), porId, porNome, motivo @db.Text, criadoEm`; `@@unique([tipo, refId])` (OK repetido não duplica; é a idempotência).
- `ChecklistTravaEnsaio` (`checklist_trava_ensaios`): `id, vendedorId, contexto, motivo, dataReferencia, criadoEm`; `@@unique([vendedorId, contexto, motivo, dataReferencia])`. Só conta o que a trava teria barrado.

**Chaves em `app_configs`** (sem schema): `checklist_responsaveis` (`{ids:[...], minutosProximo:5, esperaTesteMin:10}`), `checklist_trava_desde`, `checklist_volta_inicio` (data a partir da qual diário sem volta vira pendência, para não despejar histórico), `checklist_comparacao` (`{ativo:false, modo:'SILENCIOSO'|'PERGUNTA'}`), `checklist_retencao` (`{dias:180}`), `checklist_avisos.semanal` (lista de ids).

---

## 4. Plano por fatia

### 3-0 Housekeeping rápido (back 0.5 d, front 0.25 d)

Back:
- `routes/veiculos.js:130` `DELETE /:id`: acrescentar `exigirEdicaoVeiculo` (já definido no arquivo, usa `Pode_Editar_Veiculos`; espelha `Veiculos.jsx:24`).
- `routes/veiculos.js:120` `GET /admin/todos`: exigir admin ou `Pode_Acessar_Veiculos` (espelha `App.jsx:986` e `:463`). `GET /` (ativos, usado pelo motorista) fica aberto. Atenção: o Caixa abre a ficha com `allowedTabs` e quem só tem `Pode_Acessar_Caixa` usa `/:id/ficha`, não `admin/todos`; confirmar com grep antes de fechar.
- `veiculoController.ultimoKmFinal` :46: no catch hoje devolve 500; manter o 500, mas o front não deve mostrar "Confirma?" (ver front).
- `checklistCaixaService.js` (`resumoParaCaixa`): `findFirst` ganha `momento: 'SAIDA'` (hoje pegaria a VOLTA assim que a 3A existir e trocaria o selo).
- `atualizarRascunho`: `kmOrigem` regrava também ao refazer o painel (`enviarFoto` do ângulo `painel` zera `kmOrigem` do checklist para o app pedir a confirmação de novo).

Front: `FormVeiculoPresencial.jsx:66-71`: se `/ultimo-km` falhar (erro), tratar como "não sei" e não exibir "Confirma?" com valor vazio; o `.catch(() => setUltimoKm(null))` já cai aí, mas `ultimoKmCarregado` vira true e `kmPodeConfirmar` (:102) libera. Distinguir erro de "veículo sem KM anterior" (flag `ultimoKmErro`).

Aceite: usuário com só `Pode_Acessar_Caixa` recebe 403 em `DELETE /veiculos/:id` e em `/veiculos/admin/todos`; vendedor comum continua listando `GET /veiculos`; com `/ultimo-km` forçado a 500, a tela não mostra o painel "Confirma?".

### 3A Foto na volta + base das pendências (back 2 d, front-motorista 2 d, front-escritório 1 d, QA 1 d)

**Back**
1. `config/checklistVeiculoAngulos.js`: `SLOTS_VOLTA_POR_TIPO` = CARGA `[painel, traseira, bau]`, PASSEIO `[painel, traseira, porta_malas]`, PARTICULAR `[painel]`; `slotsDoTipo(tipo, momento)` (padrão SAIDA, mantém contrato atual). Laterais viram "opcionais, só se bateu/raspou". Textos de instrução próprios do baú de volta ("vazio e limpo").
2. `checklistVeiculoService`:
   - `montarConfig(veiculoId, momento)`; `checklist-config?momento=VOLTA` em `routes/veiculos.js:92`.
   - `criarRascunho`: aceita `momento:'VOLTA'` com `diarioId` obrigatório; valida que o diário é do usuário, `modo` PRESENCIAL, mesmo veículo e `kmFinal` ainda nulo (ou `atrasada:true` se o diário é de dia anterior; aí `dataReferencia` = a do diário). O `findFirst` de reaproveitamento passa a filtrar por `momento` + `diarioId` do diário, não `diarioId: null`.
   - `avaliar` para VOLTA: sem regra de placa (frente nem vareta/água); KM lido: `kmLido >= diario.kmInicial` (senão pergunta Sim/Não "esse é o painel do carro certo?") e aviso se rodou mais de 1,5× `kmMedioSugerido` (a regra já existe no front, `DiarioCheckout.jsx:25-26`; o servidor passa a devolver `kmRodado` e `kmExcessivo`).
   - `registrarDecisao` e `pularFoto` em VOLTA: só TESTE; "seguir" em volta nunca barra o encerramento (a volta não impede a pessoa de largar o carro).
3. `checklistVeiculoIaService`: parâmetro `momento` em `analisarFoto`; baú de volta = "vazio e limpo" (sobra de produto, lixo = ATENÇÃO; "baú vazio" não é problema); traseira de volta lê placa e avaria.
4. `diarioService.encerrarDia` :211: aceitar `checklistId` opcional. Se vier: valida (dono, `diarioId`, `momento` VOLTA, status RASCUNHO), e **o servidor decide o KM**: se `kmOrigem === 'PAINEL_CONFIRMADO'` exige `|kmFinal - checklist.kmLido| <= REGRAS.kmOk (30)`; conclui o checklist com `updateMany` condicionado (`status:'RASCUNHO'`, igual `amarrarAoDiario`) e grava `kmFinal`, `fimHora`. Sem `checklistId` o caminho antigo (KM digitado) continua e é o **fallback** quando a câmera ou a IA não funcionam; esse caminho deixa o diário "sem volta por foto" (vira pendência P1). Tornar idempotente: se o diário já tem `kmFinal`, devolver o registro atual (hoje repetir sobrescreve e perde `obsFinal`).
5. `diarioService.statusDoDia` :32: acrescentar (aditivo) `pendenciaVolta: { diarioId, dataReferencia, placa, kmInicial, bloqueia } | null`, calculado por `checklistPendenciasService`. `bloqueia = modo === 'TRAVA' && sem OK` (em teste sempre false). O campo existente `pendenciaAnterior` (KM nulo) segue exatamente como hoje.
6. **Novo `services/checklistPendenciasService.js`** com registro de fontes, assim 3B e 3C só plugam uma função:
   - Fonte `VOLTA`: diário PRESENCIAL de `dataReferencia < hoje` e `>= checklist_volta_inicio`, veículo tipo != nulo, sem `ChecklistVeiculo{momento:'VOLTA', status:'CONCLUIDO'}` e sem `PendenciaVeiculoOk{tipo:'VOLTA', refId: diarioId}`.
   - `listar({dias})`, `darOk({tipo, refId, motivo}, user)` (motivo obrigatório, mínimo 5 caracteres; `create` na tabela de OK com tratamento de `P2002` como sucesso idempotente), `podeDarOk(user)` (admin ou id em `checklist_responsaveis.ids`).
   - Aviso das 6h: `rodarAvisoPendencias()` no worker (marcador em `app_configs` igual `reivindicar`), texto curto + "app → Central de Pendências"; referência `chk-pend-<dia>-<destId>`; não envia nada se não há pendência; domingo e segunda: lista o que sobrou desde sexta.
7. Rotas (novas, em `routes/checklistsVeiculo.js`, **declaradas antes de `/:id`** porque o roteador tem `GET /:id`):
   - `GET /pendencias` → `{ podeDarOk, itens:[{tipo, refId, dataReferencia, motorista, placa, resumo, podeDarOk}] }` (permitido a quem tem `Pode_Ver_Pendencias`, admin ou Fin. Gerencial **ou** está na lista de responsáveis).
   - `POST /pendencias/ok` `{tipo, refId, motivo}` → 200 `{ok:true, jaTinha:boolean}` | 403 `SEM_PERMISSAO` | 400 `MOTIVO_OBRIGATORIO`.
   - `GET/PUT /config/responsaveis` (admin).
8. `pendenciasService.js`: novo bloco `veiculos_pendencias` (chave, título "Veículos: volta sem foto", severidade âmbar, itens com `rota: '/veiculos/pendencias'`, sem `acao` pois OK exige motivo). Adicionar também em `TITULOS` e `ROTAS_VER_TODOS`. Esse arquivo não está sujo hoje.

**Contrato back × front (volta)**
- `POST /api/checklists-veiculo` `{veiculoId, momento:'VOLTA', diarioId}` → mesmo `checklistDTO` do Dia 1 (`id, fotos, momento` …).
- `GET /api/veiculos/:id/checklist-config?momento=VOLTA` → mesmo formato (`slots[]`, `modo`, `tipo`), mais `momento` e `kmInicialDiario`.
- `POST /:id/avaliar` → acrescenta `kmRodado`, `kmExcessivo`.
- `POST /api/diarios/encerrar` `{diarioId, kmFinal, obsFinal?, checklistId?}` → 200 diário; 400 `{error}`; **novo**: `codigo:'KM_DIVERGE_DO_PAINEL'`.

**Front motorista**
- Novo `components/Diario/FormVoltaPresencial.jsx`: reutiliza `ChecklistFotos` (passa `momento`) + "Painel marca X. Confirma?" (mesmo componente do Dia 2) + pergunta "Bateu ou raspou?" + observações; botão "Não consigo tirar as fotos agora" (digita o KM, vira pendência; esconder em TRAVA só se a câmera estiver disponível, mas nunca sem saída: ver D11).
- `DiarioCheckout.jsx` e `DiarioGateway.jsx` step 1: trocam o campo KM por `FormVoltaPresencial`. Mantêm `kmExcessivo` e `confirmacaoKm`. `atrasada` quando é o step 1 do dia seguinte.
- `DiarioContext.jsx`: expõe `pendenciaVolta`.
- `services/checklistVeiculoService.js` (front): `config(veiculoId, momento)`, `criarRascunho(veiculoId, {momento, diarioId})`.

**Front escritório**
- Nova página `/veiculos/pendencias` (lazy `lazyComRetry`, uma linha em `App.jsx`, edição aditiva): lista de pendências, diálogo "Dar OK" com motivo (somente se `podeDarOk` do servidor, nunca recalcular no front), histórico dos últimos 30 dias.
- Card de Configurações: seção "Quem libera e dá OK" (ordem importa na 3B), em `ChecklistVeiculosConfigCard.jsx`.
- Ficha do veículo, aba Checklists: mostra o momento (Saída/Volta) e o selo. `SeloChecklist.jsx` ganha "Volta ok / Volta sem foto".
- `CaixaDiarioPage.jsx`: card do Diário do Dia mostra "Volta" ao lado do selo da saída (`diarioInfo.checklistVolta`, aditivo em `routes/caixa.js:392-404`, dentro do mesmo try/catch do selo).

**Riscos específicos**
- `resumoParaCaixa` e qualquer `findFirst({diarioId})` sem `momento` passam a achar a VOLTA. Fazer grep de todos os `checklistVeiculo.findFirst/findMany` e filtrar por momento (`checklistAvisosService.js:~165` já filtra SAIDA; `resumoParaCaixa` não).
- Diário de sábado/domingo cai no caixa da segunda (`intervaloDoCaixa`); a pendência de volta é por diário, não por caixa.
- `diarioService.encerrarDia` é caminho crítico do dia (cortina da próxima manhã). Fallback do KM digitado tem que continuar funcionando a qualquer erro da IA ou da rede.
- A foto da volta é tirada à noite e muitas vezes sem sinal: o fluxo atual do Dia 1 reenvia a foto? Confirmar na leitura de `ChecklistFotos.jsx` antes de codificar; se não reenvia, o fallback de KM digitado cobre.

**Critérios de aceite QA (clicando)**
1. Motorista com diário PRESENCIAL toca em "Finalizar" → vê as 3 fotos de volta, tira, vê "Painel marca X. Confirma?", confirma e o dia encerra com `kmFinal` igual ao painel.
2. Digitar KM diferente do painel por mais de 30 km → mensagem clara, não encerra.
3. KM final menor que o inicial → bloqueia com a mensagem existente.
4. Clicar duas vezes em "Confirmar" → um só encerramento, `obsFinal` preservado.
5. Sem rede/IA: "Não consigo tirar as fotos agora" → digita KM e encerra; no dia seguinte o item aparece na Central de Pendências como "volta sem foto".
6. Responsável dá OK com motivo → o item some; segundo OK do mesmo item não duplica; sem motivo → recusado.
7. Quem não está na lista nem é admin não vê botão de OK (e o servidor devolve 403 se tentar).
8. Selo do Caixa continua mostrando a SAÍDA; a volta aparece ao lado.
9. Mobile 375 px sem rolagem horizontal; tema Starbucks.
10. Domingo sem pendência: aviso das 6h não sai.

### 3B Liberação pelo escritório (back 2.5 d, front-motorista 1.5 d, front-escritório 2 d, QA 1.5 d)

**Máquina de estados** de `liberacaoStatus`: `null → PENDENTE → LIBERADA | RECUSADA | SEM_RESPOSTA`. `RECUSADA` permite nova tentativa (até 3, `liberacaoTentativas`). `SEM_RESPOSTA` só existe em TESTE.

**Back** (`checklistVeiculoService` ou novo `checklistLiberacaoService.js`, preferível para não crescer o arquivo de 791 linhas)
1. `avaliar` passa a devolver `podePedirLiberacao`: true quando há problema (ATENÇÃO/REPROVADO/NÃO respondido), ou sempre no TESTE se `voluntaria`.
2. `pedirLiberacao(id, user, {voluntaria})`: dono do checklist; idempotente (se já PENDENTE devolve o estado atual); grava `PENDENTE`, `liberacaoPedidaEm`, `liberacaoNivel=0`, `liberacaoProximoEm = agora + minutosProximo`, `liberacaoFila` (snapshot dos responsáveis na ordem); incrementa `liberacaoTentativas`. **WhatsApp fora da transação e fora do request (`setImmediate`)** para o nível 0.
3. Fila: no scheduler, tick de **1 minuto** (`_runChecklistLiberacao`, bloco novo em `scheduler.js`, que está sujo na outra sessão: edição aditiva, commit separado). Escalonamento atômico: `updateMany({ where:{ id, liberacaoStatus:'PENDENTE', liberacaoNivel:n, liberacaoProximoEm:{lte:agora} }, data:{ liberacaoNivel:n+1, liberacaoProximoEm:agora+N } })`; só quem obtém `count === 1` envia. Esgotada a fila, fica PENDENTE sem novo envio.
4. `GET /:id/liberacao` (dono ou responsável): `{ status, pedidoEm, nivel, destinatarioAtual:{nome}, decididoPor:{nome}, decididoEm, motivo, podeSeguirSemResposta, segundosParaSeguir, podePedirDeNovo }`. `podeSeguirSemResposta` calculado no servidor: modo TESTE e `agora >= pedidoEm + esperaTesteMin` (ou fila vazia/sem telefone).
5. `POST /:id/liberacao/pedir`, `POST /:id/liberacao/seguir-sem-resposta` (só TESTE, só dono, `status → SEM_RESPOSTA`, aviso ao escritório).
6. Decisão do escritório: `GET /:id/liberacao/detalhe` (checklist completo via `dtoCompleto`, **mais** histórico: nº de vezes que o motorista e o veículo tiveram o mesmo problema nos últimos 30 dias, calculado do `problemas` dos checklists anteriores) e `POST /:id/liberacao/decidir` `{acao:'LIBERAR'|'RECUSAR', motivo, iaErrou?}`. Permissão: admin ou id em `checklist_responsaveis.ids`. Motivo obrigatório ao liberar (e ao recusar, recomendado). `updateMany` condicionado a `liberacaoStatus:'PENDENTE'` → duas pessoas decidindo ao mesmo tempo: a segunda recebe 409 `JA_DECIDIDO` com a decisão da primeira.
7. Mensagens (todas `tipo:'interno'`, `origem:'checklist-veiculo'`, `texto <= 1990`):
   - Pedido ao responsável: `chk-lib-pedido-<checklistId>-t<tentativa>-n<nivel>-<destId>`; retry do worker reusa a mesma; reenvio manual (botão futuro) usa `bot.referenciaUnica(base)`.
   - Decisão ao motorista: `chk-lib-resp-<checklistId>-t<tentativa>-<LIBERADA|RECUSADA>`.
   - Aviso ao escritório "seguiu sem resposta": `chk-lib-seguiu-<checklistId>-<destId>`.
   - Link: `https://cahardt-github.xrqvlq.easypanel.host/liberacao/<checklistId>` (rota logada). Sempre acompanhado de "ou: app → Central de Pendências".
8. Quando LIBERADA em modo TRAVA, `registrarDecisao`/`iniciarDia` tratam o checklist como liberado (usado pela 3E).
9. Fonte de pendência `LIBERACAO` no serviço da 3A: PENDENTE há mais de 30 min ou `SEM_RESPOSTA` sem OK.

**Contrato (resumo)**
- `POST /api/checklists-veiculo/:id/liberacao/pedir` `{voluntaria?:bool}` → `{ status:'PENDENTE', nivel:0, pedidoEm }`; 400 `NADA_A_LIBERAR` / `JA_PENDENTE` (devolve o estado, não erro).
- `GET /api/checklists-veiculo/:id/liberacao` → objeto acima.
- `POST /:id/liberacao/decidir` → `{ ok, status, decididoPor, decididoEm }`; 403 `SEM_PERMISSAO`; 409 `JA_DECIDIDO`; 400 `MOTIVO_OBRIGATORIO`.
- Tempo real para o motorista: **polling a cada 4 s** do `GET /:id/liberacao` enquanto a tela está aberta e visível (pausar em `visibilitychange`, parar no estado final). SSE não vale a pena: o nginx do frontend faz proxy de `/api` e bufferiza; polling sai barato (uma linha por checklist).

**Front motorista**: `ChecklistProblemaTela.jsx` ganha o botão "Pedir liberação ao escritório" (no TESTE também aparece "Seguir sem resposta" depois do prazo, conforme `podeSeguirSemResposta`); novo `components/Diario/LiberacaoEspera.jsx` ("Aguardando liberação de <nome>… 2 min", depois "Liberado por X às hh:mm" ou "Recusado: <motivo>" com "Corrigir" e "Pedir de novo"). Quando liberado, o botão de iniciar o dia habilita e o `checklistId` segue para `/diarios/iniciar` como hoje.

**Front escritório**: página `/liberacao/:id` (lazy, `App.jsx` aditivo): fotos em grade com destaque na que tem problema (reaproveitar `VisualizadorFotos`), parecer da IA, histórico, dois botões grandes "Liberar" (campo de motivo obrigatório) e "Recusar", e o atalho "A foto estava boa, a IA errou" (libera e marca `iaErrou`). Bloco da Central de Pendências lista liberações abertas. A tela não confia no front para permissão: usa `podeDecidir` do `GET /detalhe`.

**Riscos**
- **Link no WhatsApp abre no Safari/Chrome, não no app instalado (PWA)**, e o navegador comum não tem o login do atalho (`localStorage` separado). Mitigação: o texto também manda abrir pelo app; a Central e o bloco de liberações são o caminho oficial; a página de decisão precisa de tela de login que volte para `/liberacao/:id` depois do login (verificar `Login` e `PrivateRoute` se preservam o destino). Testar no iPhone real (não é possível no QA automatizado).
- Corrida entre dois responsáveis (tratada com `updateMany` condicionado).
- Duplicidade de aviso após restart do servidor (referência por nível + marcador `liberacaoProximoEm`).
- O prazo "próximo após N min" e o "seguir sem resposta" não devem ser iguais (D4).
- Bot em modo de emergência (só entrega a quem já conversou) deixa a mensagem na fila: a página de decisão tem que funcionar sem WhatsApp, pelo app.

**Aceite QA**
1. Reprovar propositalmente → botão "Pedir liberação" → tela de espera; o responsável recebe a mensagem (usar "Enviar mensagem de teste" para provar o canal).
2. Responsável abre a página, vê fotos/histórico, libera com motivo → o app do motorista muda em até ~5 s e o motorista recebe WhatsApp.
3. Recusar → motorista vê o motivo, consegue corrigir e pedir de novo (máximo 3).
4. Dois responsáveis clicando juntos: um passa, o outro vê 409 amigável.
5. Sem resposta no prazo: modo teste mostra "Seguir sem resposta"; clique grava `SEM_RESPOSTA` e avisa o escritório; reload da tela não perde o estado.
6. Escalonamento: simular 2 níveis (prazo curto) e ver que a mensagem do nível 2 só sai uma vez, mesmo reiniciando o servidor.
7. Motorista de outro checklist ou usuário sem lista chamando as rotas de decisão → 403.

### 3C Cupom na despesa (back 3 d, front-motorista 2 d, front-escritório 1.5 d, QA 1.5 d)

**Cuidado financeiro**: `Despesa` entra em caixa, valor a prestar (`caixa.js:783`), conferência (`caixaConferenciaService`) e ficha do veículo. Regra: nenhuma rota atual muda de contrato; campos só se somam; a foto nunca impede a despesa ser registrada em modo teste; nada de `$transaction` com IA dentro.

**Back**
1. Novo `services/cupomDespesaService.js`:
   - `analisar({buffer, mime, categoria, veiculo, digitado:{valor,data,litros,kmNoAbastecimento}})` usa `aiProvider.analisarImagem` com prompt de cupom fiscal (lê valor total, data/hora, litros, preço por litro, posto, CNPJ, número do cupom, combustível; devolve `serve` e `motivoRefazer` como o checklist). **Nunca lança**: falha vira `IA_INDISPONIVEL` e o fluxo segue.
   - `compararComDigitado(leitura, digitado, veiculo)`: valor `|dif| <= 0,05` (ou 0,5 %); data igual à `dataReferencia` (ou o dia anterior com aviso); litros `|dif| <= 0,5 L`; `litros <= capacidadeTanque * 1,05` (usa `Veiculo.capacidadeTanque`, se nulo ignora); preço/litro coerente (`valor ≈ litros × preço`).
   - `detectarDuplicidade`: mesmo `comprovanteHash` (qualquer despesa), mesmo `cupomCnpj + cupomNumero` nos últimos 90 dias, ou mesmo `valor+data+hora+cnpj`. Devolve a despesa anterior (id, vendedor, data) para o escritório conferir.
   - Resultado: `CONFERIDA | DIVERGENTE | RECUSADA | IA_INDISPONIVEL`. `RECUSADA` = imagem não é cupom ou o escritório recusou. `SEM_COMPROVANTE` = motorista escolheu "sem cupom" com justificativa.
2. Foto **antes** de salvar (para a IA apontar "você digitou 180, o cupom diz 160" antes de gravar):
   - `POST /api/despesas/cupom/analisar` (multipart `arquivo` + campos digitados): grava em `../uploads/despesas-comprovantes/_rascunho/<vendedorId>/<hex>.jpg` (`path.join(__dirname, '../uploads/...')` a partir de `routes/` ou `services/`; **conferir contando níveis**, regra de upload do CLAUDE.md) e um `.json` ao lado com a leitura; devolve `{ comprovanteRef, serve, motivoRefazer, leitura, comparacao, resultado }`. `comprovanteRef` = nome do arquivo + HMAC (impede o cliente inventar caminho).
   - `POST /api/despesas` aceita `comprovanteRef?` e `semComprovanteMotivo?`; o servidor **recalcula** a comparação com os valores finais (não confia no que o front mostrou), move o arquivo para `uploads/despesas-comprovantes/<vendedorId>/<data>/<despesaId>-<hex>.jpg` e grava os campos novos. Sem `comprovanteRef` nem motivo, grava `conferenciaStatus = 'SEM_COMPROVANTE'` (nunca recusa em teste).
   - `PUT /api/despesas/:id` idem (refotografar). Mudou valor/litros após CONFERIDA → volta a reconferir contra a leitura salva.
   - `POST /api/despesas/:id/aceitar` `{motivo}` (admin, `Pode_Editar_Caixa` ou responsável): `conferenciaStatus='ACEITA'`, `aceitaPor*`. Também grava `PendenciaVeiculoOk` tipo DESPESA para sumir da Central. Idempotente.
   - Mesma regra e mesma service em `routes/veiculos.js:242-293` (abastecimento lançado pelo escritório): foto **opcional** para quem lança em nome de outra pessoa (o escritório pode digitar com cupom na mão); só entra a foto se vier.
   - Housekeeping do `_rascunho`: arquivos com mais de 2 dias apagados pelo worker de retenção (3F) ou na primeira chamada do dia.
3. Fonte de pendência `DESPESA` (serviço da 3A): `conferenciaStatus` em (DIVERGENTE, RECUSADA, SEM_COMPROVANTE nas categorias obrigatórias) sem aceite e sem OK, `dataReferencia >= checklist_volta_inicio`.
4. `caixa.js`: a lista de despesas do resumo (:426 e :2436) passa a incluir os novos campos (já vêm por não haver `select`; no `/relatorio` :2591 o `map` é explícito e **não muda**, para não vazar hash e leitura para o PDF). **Fechamento**: ver 3E; em teste nada muda.

**Contrato**
- `POST /api/despesas/cupom/analisar` → `{ comprovanteRef, serve, motivoRefazer, leitura:{valor,data,hora,litros,precoLitro,posto,cnpj,numero}, comparacao:[{campo, digitado, cupom, ok}], resultado, motivos:[] }`.
- `POST /api/despesas` payload atual **mais** `{comprovanteRef?, semComprovanteMotivo?}`; resposta atual **mais** `conferenciaStatus`, `conferenciaMotivos`.
- Todos os campos novos são opcionais; o app antigo em cache (PWA) continua criando despesa sem foto.

**Front motorista**: `pages/Caixa/NovaDespesaModal.jsx`: passo "Foto do cupom" (câmera: `<input type="file" accept="image/*" capture="environment">`, igual ao checklist), mostra a leitura e a comparação lado a lado ("você digitou 180,00, o cupom diz 160,00"), botões "Corrigir meu valor" / "Usar o valor do cupom" / "Está certo assim" (grava com a divergência marcada), "Foto ruim, tirar de novo" (máx. 2) e "Sem cupom" (pede o motivo). Categoria COMBUSTIVEL obrigatória; as demais opcionais (D6). Nada bloqueia o salvamento em teste.

**Front escritório**: onde a despesa aparece no Caixa (`CaixaDiarioPage.jsx`, lista de despesas do dia): selo (Conferida / Divergente / Sem cupom) e ao clicar abre painel com **foto (visualizador existente), leitura da IA e valor digitado lado a lado**, mais "Aceitar com motivo". `RelatorioCaixaPrint.jsx` não muda.

**Riscos**
- `NovaDespesaModal.jsx` já tem muita lógica de combustível (km, preço médio). Mexer só no fim do `handleSubmit`; não reordenar a validação de KM.
- `Despesa` dentro de `$transaction`? Hoje as rotas fazem `create` direto; manter. A chamada da IA acontece no `/cupom/analisar`, antes de criar; **nunca** dentro de transação.
- Tamanho da foto: o front comprime antes (Dia 1); manter limite 6 MB do multer reaproveitando `receberFoto`.
- Privacidade: cupom pode ter CPF do consumidor. Pasta dentro do volume `backend/uploads` (sobrevive ao deploy); URL não adivinhável (hex); **testar gravar → deploy → ler** em produção, como manda o CLAUDE.md.
- Cupom duplicado entre postos diferentes/ filtro de 90 dias não pode ficar lento: os dois índices acima.

**Aceite QA**
1. Lançar combustível com foto legível e valor certo → CONFERIDA; selo no Caixa.
2. Digitar valor diferente → aviso, lado a lado, motorista escolhe; servidor grava DIVERGENTE mesmo se o front mentir (testar chamando a API com valor trocado).
3. Mesma foto lançada duas vezes (outra despesa/outro dia/outro motorista) → DIVERGENTE `CUPOM_REPETIDO` com referência à primeira.
4. Litros acima do tanque → DIVERGENTE `LITROS_ACIMA_TANQUE`.
5. Foto de qualquer coisa que não é cupom → "Não parece um cupom, tira de novo"; 2 tentativas e segue com RECUSADA.
6. "Sem cupom" com motivo → SEM_COMPROVANTE; sem motivo → pede.
7. IA fora do ar (sem chave) → despesa grava normalmente, `IA_INDISPONIVEL`.
8. Escritório vê foto + leitura + digitado; "Aceitar" tira da Central; aceitar duas vezes não duplica.
9. Regressão: despesa antiga sem foto continua listando, editando e somando no "valor a prestar"; relatório A4 igual.
10. Em produção: gravar → publicar → abrir a foto.

### 3D Comparação com foto modelo e com a foto da saída (back 2 d, front 0.5 d, QA 0.5 d)

1. `checklistVeiculoIaService`: `compararFotos({modelo, hoje, angulo, veiculo})` com `aiProvider.analisarImagem({ imagens:[ref, hoje] })` e prompt "imagem 1 = referência (estado certo), imagem 2 = hoje; aponte só diferença NOVA e física (amassado, risco, peça faltando, retrovisor, pneu, adesivo); ignore luz, ângulo, sujeira, reflexo, objeto solto". Resposta: `{diferencas:[{descricao, local, confianca}]}`.
2. `enviarFoto` (:354): em **paralelo** com a análise normal (`Promise.all`, tempo = o maior dos dois, não a soma), e só se `checklist_comparacao.ativo` e existir referência. Referência: na VOLTA, a foto **da saída do mesmo diário** (mais forte); na SAÍDA, `VeiculoFotoModelo` ativa do ângulo. Só nos ângulos externos e no baú (nunca painel/água/vareta). Falha ou 25 s de timeout → ignora e loga; o motorista nunca espera por isso.
3. Modo `SILENCIOSO` (padrão): grava em `ChecklistVeiculoFoto.comparacao`, o escritório vê na ficha, **o motorista não vê nada**. Depois de uma semana calibrando, o dono liga `PERGUNTA`: a diferença vira uma `PERGUNTA` Sim/Não ("O amassado no para-choque já existia?") reaproveitando o tipo que a Parte A criou; resposta Não vira ATENÇÃO "avaria nova" com `origem:'MODELO'`.
4. Custo: segunda imagem dobra os tokens de entrada daquele ângulo (fotos de ~170 KB, `detail:'auto'`); para uma saída de 5 ângulos externos + volta isso é ordem de poucos centavos por motorista por dia. Medir `iaTokens` real na primeira semana (já existe a coluna) antes de decidir deixar ligado. Limite: no máximo 5 comparações por checklist.
5. Front: ficha do veículo mostra o par lado a lado (referência × hoje) e a lista de diferenças; só o escritório.

Riscos: falso positivo por luz de noite contra modelo de dia (por isso silencioso primeiro e só PERGUNTA, nunca REPROVA); foto modelo desatualizada depois de reparo (aviso na ficha "modelo tem mais de 6 meses"). Dependência: o ideal é existirem fotos modelo cadastradas (decisão do dono; sem elas só a comparação volta×saída roda).

Aceite: com `ativo:false` nada muda; com `ativo:true`/`SILENCIOSO` a ficha mostra a diferença em foto com amassado simulado e o motorista não é incomodado; timeout simulado não derruba a foto.

### 3F Relatório semanal, multa por placa e retenção (back 2 d, front-escritório 1 d, QA 0.5 d)

- **Relatório semanal** (segunda 7h): `checklistAvisosService.rodarSemanal()` no mesmo tick de 5 min, marcador `checklist_semanal_<segunda>` via `reivindicar`, referência `chk-semanal-<segunda>-<destId>`. Conteúdo da semana anterior: por motorista, dias com saída, % com checklist por foto, voltas com foto, reprovados, discordâncias ("Tá certo assim"), perguntas NÃO, liberações (pedidas/liberadas/recusadas/sem resposta), "IA errou", avarias novas (3D), despesas divergentes, e **"teria travado N vezes"** vindo de `checklist_trava_ensaios`. Cabe em 1990 caracteres (uma linha por motorista); se passar, corta e manda "ver tudo no app". Destinatários `checklist_avisos.semanal` (D7). Rota JSON `GET /api/checklists-veiculo/relatorio/semana?de&ate` para a tela (aba "Conformidade" opcional na ficha de Veículos).
- **Consulta de multa**: `GET /api/veiculos/uso?placa=XXX&data=YYYY-MM-DD&hora=HH:MM` (também `/:id/uso`) → `[{vendedor, dataReferencia, inicioHora, fimHora, kmInicial, kmFinal, modo, fonte:'DIARIO'|'USO_MANUAL', checklistIds, ambiguo}]`. Se mais de um diário no dia ou `fimHora` nulo, devolve todos e `ambiguo:true` (não escolhe). Permissão `Pode_Acessar_Veiculos`. Horário interpretado em `America/Sao_Paulo` (`-03:00`, como `entregas.js:262`). Front: caixa "Quem estava com o carro?" na ficha do veículo (placa, data, hora → resultado + link para os checklists daquele dia).
- **Retenção**: worker diário (fora do horário comercial) que, para `ChecklistVeiculoFoto` de checklists com `dataReferencia < hoje - checklist_retencao.dias` (padrão 180, D8), apaga o arquivo do disco e grava `apagadaEm` (a linha fica). Não apaga: foto modelo; foto de checklist com liberação RECUSADA/avaria nova (guardar mais, D8); cupom (5 anos, D9). A UI mostra "Foto apagada após N dias" em vez do erro de imagem (`ImgComFalha.jsx`). Rodar em lote pequeno (200 por rodada) e idempotente (já apagadas ficam fora). O backup de uploads para o Drive não deve apagar do Drive (decisão de política, avisar o dono).
- **Proteção de `/uploads` para fotos de checklist**: avaliado custo × benefício. `<img src>` não manda o token do app; proteger exigiria URL assinada (HMAC + validade curta) gerada em cada resposta que devolve foto (`fotoDTO`, 5+ telas, mais o PWA que cacheia `index.html`) e um endpoint `GET /api/fotos/…`. Hoje o caminho tem 64 bits aleatórios + 2 UUIDs, ninguém consegue adivinhar e a pasta não é listável. **Recomendação: não fazer agora**; sim para comprovante de despesa, onde a URL pode vazar em print do Caixa: fazer com URL assinada só nesse caso (simples, tudo em um DTO) se o dono achar o CPF no cupom sensível. Alternativa barata para as duas: `Cache-Control: private, max-age=86400` e `X-Robots-Tag: noindex` em `/uploads/checklists-veiculo` e `/uploads/despesas-comprovantes`. Decisão D10.

### 3E Trava (back 2 d, front 1.5 d, QA 2 d)

**Núcleo**: novo `services/checklistTravaService.js` com **uma** função `situacao({ user, contexto, vendedorAlvoId?, data? })` → `{ exige:boolean, ok:boolean, codigo, mensagem, etapa }` e um middleware `exigirChecklist(contexto, opcoes)` que devolve **403** com corpo `{ error: <frase de pátio>, codigo:'CHECKLIST_OBRIGATORIO', etapa:'SAIDA'|'VOLTA'|'DESPESA' }`. É a única fonte de verdade da regra (igual ao comentário "FONTE ÚNICA" de `routes/caixa.js:48-53`: quem decide a tela e quem decide o servidor usam a mesma função).

Regra de `situacao` (nessa ordem):
1. `getModo()` com cache de 15 s. Se TESTE: calcula o que **teria** barrado e grava em `checklist_trava_ensaios` (com `try/catch`, uma linha por pessoa/contexto/motivo/dia), devolve `exige:false`. DESLIGADO: `exige:false`. TRAVA: segue.
2. Isento: `permissoes.admin` ou `Isento_Ponto` (mesmo critério de `diarioService.js:93-95`).
3. Diário de hoje do usuário: se não há ou o `modo` não é PRESENCIAL com `veiculoId` → isento (home office). Se `inicioHora < checklist_trava_desde` → isento neste dia. `Veiculo.tipo`: PARTICULAR exige só o painel; PASSEIO/CARGA exigem o conjunto do tipo.
4. Checklist SAÍDA do diário: ausente → bloqueia ("Faça o checklist do carro antes de começar"). Presente: OK se `veredito` é APROVADO ou IA_INDISPONIVEL (**IA fora do ar não pode parar a frota**) ou `liberacaoStatus === 'LIBERADA'`; ATENÇÃO/REPROVADO sem liberação → bloqueia (D5 pergunta se ATENÇÃO deve parar ou só REPROVADO).
5. Para os contextos de volta/despesa: ver abaixo.

**Pontos de entrada** (todos conferidos no código; "mudança mínima" é uma linha `exigirChecklist(...)` ou um `if` chamando `situacao`):

| # | Onde | Arquivo:linha | Mudança mínima |
|---|---|---|---|
| 1 | Abrir dia presencial | `backend/services/diarioService.js:117` (dentro de `if (modo === 'PRESENCIAL')`) | após `derivarChecklist`, em TRAVA recusar com `codigo:'CHECKLIST_OBRIGATORIO'` se checklist ausente/inválido ou com problema sem liberação. Hoje `iniciarDia` **ignora** checklistId inválido (:117): em TRAVA passa a exigir. |
| 2 | Pegar veículo no meio do dia | `diarioService.js:170` (`assumirVeiculo`) | mesma regra do #1 |
| 3 | Abrir o dia seguinte com volta pendente | `diarioService.js:32` (`statusDoDia`) + `:67` (`iniciarDia`) | `pendenciaVolta.bloqueia` e recusa `codigo:'PENDENCIA_VOLTA'` (mesmo padrão do `PENDENCIA_ROTA` em `diarioService.js:104`) |
| 4 | Entregas do motorista | `backend/routes/entregas.js:259` (`GET /pendentes`) | middleware após `checkAcessoEntregador`; 403 com `codigo`. O front mostra o aviso em vez do erro genérico |
| 5 | Registrar entrega | `entregas.js:554` (`POST /:id/concluir`) | mesmo middleware (usa o dono da carga `pedido.embarque.responsavelId`, o handler já tem) |
| 6 | Concluir amostra | `entregas.js:480` (`POST /amostra/:id/concluir`) | idem |
| 7 | Conferir folha / QR da carga | `entregas.js:201` (`/conferir-folha`) | idem (é o motorista abrindo a carga) |
| 8 | Receber título na rota | `backend/routes/cobrancasRota.js:311` (`/minhas`), `:385` (`/avulsa/cobrar`), `:434` (`/:id/cobrar`), `:461` (`/:id/nao-cobrada`) | middleware após `checkCobrador` |
| 9 | Caixa: abrir o próprio caixa | `backend/routes/caixa.js:350` (`GET /resumo`) | só quando `targetVendedor === req.user.id`; retorna o 403 |
| 10 | Caixa: enviar conferência de dinheiro | `caixa.js:1186` (`POST /conferencia-dinheiro/enviar`) e `:1247` (`/contagem-dinheiro`) | só quando o dono é o usuário |
| 11 | Caixa: fechar | `caixa.js:1297` (`POST /fechar`), **mais** `caixa.js:1027-1033` (`pendencias.podeFechar`) | usa `situacao({contexto:'FECHAR_CAIXA', vendedorAlvoId: targetVendedor})`: bloqueia se o diário do dia não tem volta (nem OK) ou há despesa DIVERGENTE/RECUSADA/SEM_COMPROVANTE sem aceite. Quem fecha costuma ser o escritório; o bloqueio é do **alvo**, destravado pelo OK do responsável. Atualizar `podeFechar` e `/fechar` juntos (regra da FONTE ÚNICA, divergiram em 08/2026) |
| 12 | Canhoto | `backend/routes/canhotoRoutes.js:146` (`/bipar`), `:162`, `:177` | **só** se `contexto === 'CAIXA'` e o `caixaDiarioId` pertence ao usuário que bipa (motorista bipando o próprio caixa na volta). Escritório bipando o caixa dos outros não é afetado. Recomendo **não** implementar o resto (D12) |
| 13 | Despesa | `backend/routes/despesas.js:63` (`POST /`), `:122` (`PUT /:id`) e `backend/routes/veiculos.js:242`/`:375` | só quando `criadoPor === vendedorId` (o próprio motorista lançando): exige checklist de saída OK **e** comprovante CONFERIDA/ACEITA, senão 403 `codigo:'CHECKLIST_OBRIGATORIO', etapa:'DESPESA'`. Escritório lançando em nome de outro: não exige foto |
| 14 | Embarque (escritório monta a carga) | `backend/routes/embarques.js:80` (listagem), `:196` (detalhe) | **sem trava**; só devolve `motorista.checklist = OK/PENDENTE/SEM` ao lado do nome para a expedição (aditivo). `PainelEmbarque.jsx:26-33` mostra o selo. Motivo: a carga costuma ser montada na véspera, antes do checklist do dia; bloquear a expedição seria o erro de "travar o escritório pelo motorista" |

Atendimentos/pedidos de venda (`atendimentoRoutes.js:50`): **não entram**. O portão é o início do dia (#1); HOME_OFFICE é isento. Dirigir sem abrir o dia só é barrado no navegador hoje (a cortina `DiarioGateway`); isso é uma lacuna anterior ao checklist, tratada à parte se o dono quiser (D12).

**Mensagens (linguagem de pátio)**
- Sem checklist: "Faltou o checklist do carro. Tira as fotos antes de sair."
- Reprovado sem liberação: "O carro precisa da liberação do escritório. Toca em Pedir liberação."
- Volta pendente: "Ontem faltaram as fotos da volta. Tira agora ou pede o OK do escritório."
- Despesa: "Sem foto do cupom não entra. Fotografa o cupom inteiro."
- Caixa: "O caixa está esperando as fotos da volta do carro."

**Chave TRAVA**
- `setModo` (checklistVeiculoService.js:111): aceitar `TRAVA`; ao entrar em TRAVA grava `checklist_trava_desde = agora`; ao sair, apaga. A rota `PUT /config/modo` (`routes/checklistsVeiculo.js:~26`) exige `ehAdmin`; manter.
- Front: `ChecklistVeiculosConfigCard.jsx` ganha a opção "Travar" com confirmação forte (digitar "TRAVAR", ver o "ensaio" da última semana: "N pessoas teriam sido barradas") e o aviso fixo "avise a equipe uma semana antes". `Desligar` e `Teste` continuam voltando na hora.
- Front motorista: tratador global em `services/api.js` (hoje o interceptor só cuida de 401, `api.js:20-37`): em 403 com `codigo === 'CHECKLIST_OBRIGATORIO'` dispara `window.dispatchEvent('checklist-obrigatorio')`; `DiarioContext` ou layout abre um aviso com botão que leva ao checklist/volta/despesa. `PainelMotorista`, `NovaDespesaModal` e as telas do Caixa tratam o `codigo` localmente para mostrar a frase certa. Esses arquivos de entrega (`CheckoutEntregaModal.jsx`) estão sujos na outra sessão: só tratar o erro depois que ela commitar.

**Riscos da trava (críticos)**
- Pessoa na rua quando liga: resolvido por `checklist_trava_desde`.
- IA indisponível/erro 500 do checklist: nunca bloqueia (OK se `IA_INDISPONIVEL`), e o middleware tem `try/catch`: **falha do próprio serviço de trava = deixa passar** e loga (mesmo princípio de `derivarChecklist`, "nada aqui pode barrar o dia").
- Rota de entrega usada por não-motorista (admin vendo): isenção por permissão; confirmar com `Pode_Ver_Todas_Entregas` (esse perfil audita, não entrega).
- Cache do PWA com JS antigo: o app antigo recebe o 403 e mostra erro genérico; por isso **liberar o front (tratador do código) uma entrega antes** de aceitar `TRAVA`.
- Dois itens de escopo ficaram de fora de propósito: bipar canhoto geral e embarque/expedição (D12/ponto 14).

**Aceite QA**: matriz completa de pontos 1–14 em dois perfis (motorista CARGA, vendedor PASSEIO) e quatro estados (sem checklist; reprovado sem liberação; reprovado liberado; aprovado), mais: admin e `Isento_Ponto` livres; home office livre; diário aberto antes da chave livre; `DESLIGADO` e `TESTE` não bloqueiam nada e `TESTE` registra o ensaio; falha forçada do serviço de trava deixa passar.

---

## 5. Pontos de atenção transversais

**Telas críticas (Caixa, despesas, entregas)**
- Todo código novo no Caixa entra dentro do mesmo `try/catch` do selo (padrão `caixa.js:395-404`). Falha do checklist nunca derruba o Caixa.
- `routes/entregas.js` e `CheckoutEntregaModal.jsx` **estão modificados e não commitados pela outra sessão** (git status). Os pontos 4–7 só podem ser editados depois do commit dela, ou combinados por arquivo. Mesmo cuidado com `workers/scheduler.js` (modificado) e `routes/adminExec.js` (modificado).
- Despesa: nenhum `select` explícito pode perder campo existente; nenhuma rota muda de formato. Rodar em local: lançar uma despesa antiga (sem foto) em cada tela que lista despesa.

**Arquivos compartilhados com a outra sessão** (edição aditiva e commit separado): `frontend/src/App.jsx` (2 rotas: `/liberacao/:id`, `/veiculos/pendencias`), `backend/prisma/schema.prisma` (campos e 2 modelos), `backend/services/aiProvider.js` (**não deve ser alterado**: `analisarImagem` já aceita várias imagens), `backend/routes/adminExec.js` (só o `deployMarker`, uma linha por fatia), `frontend/public/novidades.json` (uma entrada no topo por fatia, com a página `novidade-<slug>.html`), `backend/services/copilotoService.js` (tabela `ABAS` para as páginas novas) e `backend/manuais/abas/README.md`.

**Fuso e datas**: tudo em `America/Sao_Paulo` via `getDataReferencia`/`agoraSP`; `dataReferencia` é texto `YYYY-MM-DD`. Aviso das 6h e relatório de segunda 7h usam `agoraSP()` e `dow`. Foto de volta atrasada herda a data do diário (`atrasada:true`), não a de hoje.

**`$transaction`**: nenhuma das fatias precisa de transação nova. O que for atômico (conclusão da volta + KM final, aceite + OK) usa `updateMany` condicionado, como o padrão atual de `amarrarAoDiario`. Se algum dev usar `$transaction`, `{ timeout: 20000, maxWait: 10000 }`, e **IA, WhatsApp e gravação de arquivo sempre fora**. Boy scout: `diarios.js:~120` (`PUT /:id/km`) já segue o padrão; conferir outras transações se o arquivo for tocado.

**WhatsApp**: toda mensagem com `tipo:'interno'`, `origem:'checklist-veiculo'`, referência por evento+destinatário (lista na 3B/3A/3F); retry reusa a referência; reenvio manual usa `bot.referenciaUnica`. Só equipe interna (tabela de usuários), nunca cliente. Nada em lote proativo fora de ato concreto: pedido de liberação é provocado pelo clique do motorista; o aviso das 6h e o relatório de segunda são resumos para equipe interna, na mesma linha dos resumos 7h/13h já no ar (declarar isso na nota de entrega). Limite 2000 caracteres: `cortar(…, 1990)` já existe.

**Upload**: `../uploads/despesas-comprovantes` a partir de `routes/` ou `services/`; testar em produção gravar → deploy → ler. Retenção nunca apaga `backend/uploads` fora das pastas do checklist.

**PWA/cache**: o fluxo de volta e a trava dependem de JS novo; o `index.html` já sai `no-cache`. Subir a constante `VERSAO` do `sw.js` não é necessário (sem mudança de estratégia). O front do tratador de 403 tem que estar no ar antes da chave aceitar TRAVA.

**Permissões**: o front espelha o servidor: `podeDarOk`, `podeDecidir` e `podeSeguirSemResposta` vêm do servidor, nunca recalculados. Permissões em `perms` são objetos em alguns casos (`!!perms.pedidos` libera somonte-leitura); usar sempre os booleanos explícitos acima. Não criar permissão nova em `BOOL_INDEX` (decisão: lista de responsáveis em `app_configs`, como a dos avisos).

**Manuais, Clippy e novidades** (checklist obrigatório do CLAUDE.md, por fatia): `backend/manuais/abas/veiculos.md`, `caixa.md`, `config-gerais.md`, `pendencias.md` (central), manual novo da página de liberação e de pendências de veículo, entradas em `ABAS` se a rota tiver permissão própria; uma página `novidade-<slug>.html` com mockups e legendas por fatia, entrada em `novidades.json`.

---

## 6. Estimativa e divisão em paralelo

Em dias de trabalho de agente por fatia (QA e revisor à parte):

| Fatia | dev-backend | dev-frontend motorista | dev-frontend escritório | QA |
|---|---|---|---|---|
| 3-0 | 0,5 | 0,25 | — | 0,25 |
| 3A | 2 | 2 | 1 | 1 |
| 3B | 2,5 | 1,5 | 2 | 1,5 |
| 3C | 3 | 2 | 1,5 | 1,5 |
| 3D | 2 | — | 0,5 | 0,5 |
| 3F | 2 | — | 1 | 0,5 |
| 3E | 2 | 1,5 | 0,5 | 2 |
| **Total** | **~14** | **~7,25** | **~6,5** | **~7,25** |

Paralelismo:
- **Backend é o caminho crítico.** Dentro de uma fatia, front motorista e escritório começam assim que o contrato (seção 4) estiver acordado, com resposta simulada, e trocam para a API real quando o back publicar a rota.
- Fatias independentes que podem andar juntas: **3B ∥ 3C** (dois devs-backend em arquivos diferentes: `checklistLiberacaoService.js`/`checklistsVeiculo.js` × `cupomDespesaService.js`/`despesas.js`) e **3D ∥ 3B**. Evitar dois devs no mesmo arquivo: `checklistVeiculoService.js` e `checklistsVeiculo.js` são tocados por 3A, 3B e 3D, então 3A fecha antes; `scheduler.js` e `App.jsx` são tocados por várias fatias, uma de cada vez e com commit separado.
- Revisor lê cada fatia separadamente; a 3E tem revisão dupla (matriz de pontos) por ser o que pode parar a operação.

---

## 7. Decisões que o dono precisa tomar (com sugestão)

| # | Pergunta | Sugestão |
|---|---|---|
| D1 | Quem está na lista "quem libera e dá OK", e em que ordem? | 2 ou 3 nomes; o dono por último ou primeiro conforme prefira ser acordado de madrugada. Padrão se vazio: admins com telefone (igual aos avisos). |
| D2 | Tempo da fila: passa para o próximo depois de quantos minutos? | **5 minutos** por nível. |
| D3 | Quantas fotos na volta? | **3** (painel + traseira + baú/porta-malas) e as laterais só se a pessoa disser que bateu/raspou. |
| D4 | Quanto tempo até o botão "Seguir sem resposta" (só no teste)? | **10 minutos** (maior que o passo da fila para o segundo da lista ter tempo de ver). |
| D5 | Na trava, ATENÇÃO também exige liberação ou só REPROVADO? | Começar exigindo só REPROVADO e perguntas respondidas NÃO; ATENÇÃO passa mas fica registrado. Reavaliar depois de 3 semanas de dados. (O código atual já trata os dois como "problema"; é um ajuste de uma linha.) |
| D6 | Cupom obrigatório em quais categorias? | Combustível, manutenção do veículo e pedágio; hotel/mercadoria/outro opcional. |
| D7 | Quem recebe o relatório semanal? | Só o dono. Mais gente depois, se pedir. |
| D8 | Retenção das fotos de checklist | 180 dias (não 90: cobre a disputa de seguro e multa), com fotos de liberação recusada/avaria nova guardadas por 1 ano. |
| D9 | Retenção do comprovante da despesa | 5 anos (documento fiscal). |
| D10 | Proteger `/uploads` com URL assinada? | Agora não para fotos de checklist (URL não adivinhável); sim, só nos comprovantes de despesa, **se** o dono considerar o CPF do cupom sensível. |
| D11 | O motorista pode encerrar o dia sem fotos quando a câmera falha? | Sim, sempre, digitando o KM; vira pendência de volta. Em TRAVA continua podendo encerrar, mas precisa de OK para abrir o dia seguinte. |
| D12 | Bipar canhoto e Embarque: travar? | Não para o escritório (canhoto geral e expedição). Só o motorista bipando o próprio caixa. Dirigir sem abrir o dia (lacuna antiga) fica como item à parte. |
| D13 | Quando ligar a trava e a "ensaio" | Ensaio ligado junto da 3C; ligar a trava só depois de 3 semanas **e** se o relatório mostrar que "teria travado" é baixo. Ligar de manhã cedo e avisar uma semana antes. |
| D14 | Fotos modelo dos 4–5 veículos | Sem elas a comparação (3D) só roda volta×saída. Sugestão: expedição tira numa manhã, antes de a 3D ir ao ar. |

---

## 8. O que NÃO fazer

- Não aceitar `TRAVA` em `setModo` antes da 3E-2; não ligar nenhum ponto de trava sem a função única `situacao`.
- Não bloquear o escritório pelo checklist do motorista (caixa dos outros, canhoto, embarque).
- Não deixar a IA ou o WhatsApp dentro de `$transaction`; não mandar WhatsApp dentro do request do motorista.
- Não repetir referência no reenvio manual nem usar referência nova no retry.
- Não renomear ou remover campo existente do schema (os `liberacao*` e `okPendencia*` ficam como estão, mesmo que a tabela nova assuma o OK).
- Não calcular `podeDarOk`/`podeDecidir` no front.
- Não deixar `findFirst({diarioId})` sem `momento` em nenhum consumidor do checklist.
- Não mudar a resposta de `/api/despesas`, `/caixa/relatorio` ou `/caixa/resumo` de forma incompatível; não mexer em `/api/ia-consulta/v1` (nada aqui o toca).
- Não gravar foto fora de `backend/uploads`; não publicar a fatia que grava arquivo sem provar gravar → deploy → ler.
- Não usar `window.open`/iframe para imprimir (nenhuma impressão nesta entrega); não usar `React.lazy` nas rotas novas (`lazyComRetry`).
- Não usar `<select>` nativo (usar `SelectBusca`), nem deixar filtro novo sem `useFiltrosSalvos` (aba de pendências e relatório).
- Não escrever "provavelmente" nos relatórios: o QA prova clicando.

---

## 9. Verificações finais por perfil (o que o revisor confere)

- `git diff` do schema só tem linhas `+`; `npx prisma validate` passa.
- `grep -rn "checklistVeiculo.find" backend` sem nenhuma consulta de checklist por `diarioId` sem `momento`.
- Todo `enviarMensagemCustom`/`bot.enviar` novo tem `tipo`, `origem`, `referencia`.
- Nenhum `$transaction` novo sem timeout; nenhum `await` de IA ou WhatsApp dentro de transação.
- Nenhuma rota nova está depois de `/:id` em `checklistsVeiculo.js` ou `veiculos.js`.
- Front: build passando, `lazyComRetry`, `SelectBusca`, `useFiltrosSalvos`, mobile 375 px, `Isento_Ponto` tratado como no `DiarioGateway`.
- Manual das abas e `novidades.json` atualizados em cada fatia.
- Prova em produção por fatia: `deployMarker` novo no `/ping`, rota nova responde 401 (não 404), foto atravessa um deploy.
