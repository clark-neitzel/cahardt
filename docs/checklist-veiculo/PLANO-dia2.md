# Plano Dia 2, Partes B e C: checklist de veículo (tela do motorista + escritório)

> **Decisões do gerente de projeto (21/10, antes da implementação):**
> (a) "ainda sem checklist" no resumo = quem iniciou o dia PRESENCIAL com veículo sem checklist por foto (+ "montando agora" para rascunhos abertos); "quem ainda não saiu" fica fora.
> (b) mestre-detalhe a partir de `lg:` (1024px); abaixo continua o drawer.
> (c) foto extra de água/óleo é opcional, nunca bloqueia.
> (d) **destinatários dos avisos: enquanto a chave `checklist_avisos` não existir, usar os vendedores ativos com `permissoes.admin === true` e telefone (mesmo critério de `backupService.alertarFalha`)**, tanto na hora quanto nos resumos — o dono reclamou de não ter sido avisado; não pode nascer vazio. A tela de Configurações permite trocar.
> (e) Ordem de execução: Parte A fecha primeiro (QA/revisor/gerente/commit hoje). dev-backend B/C começa JÁ pelos arquivos que não colidem com a Parte A (schema, veiculoService, avisos/worker, caixa.js, rotas novas em arquivo próprio) e só toca `checklistVeiculoService.js`/`checklistVeiculoIaService.js`/`routes/checklistsVeiculo.js`/manuais/adminExec depois do commit da Parte A. dev-frontend C começa depois do mini-ajuste de PERGUNTA (toca `ChecklistsVeiculoLista.jsx`); dev-frontend B começa depois do commit da Parte A.


Arquiteto, 21/10/2026. Base: `docs/propostas/proposta-checklist-dia2.html`, `docs/checklist-veiculo/PLANO-dia1.md` e o código real em `~/Projetos/CA-Hardt`. Todo caminho abaixo é relativo a essa pasta. Os devs trabalham SÓ nela, nunca na pasta do Drive. A sessão do arquiteto abriu no Drive, mas só li arquivos.

A **Parte A** está considerada pronta e não é replanejada. Os pontos em que B e C dependem dela estão na seção 0.

---

## 1. Entendimento e interpretações adotadas

**Parte B**: o motorista passa a ver a própria foto, em tela cheia e com o parecer. Pode responder Sim/Não às perguntas, tirar de novo ou dizer "Tá certo assim". Os quadrinhos ficam em blocos na ordem Fora, Painel, Capô, Carga. O KM vem do painel, só com confirmação. Água e óleo aceitam uma foto extra.

**Parte C**: o dono e a expedição são avisados por WhatsApp. O Caixa mostra o selo do checklist. A galeria do escritório tem teclado e zoom. A tela de Veículos no desktop vira duas colunas. O cadastro do veículo ganha 4 campos que alimentam a IA.

Cinco pontos do pedido ficaram ambíguos. A interpretação adotada vale até o gerente responder o contrário:

1. **"Quadrinho vazio abre a câmera direto."** Hoje (`frontend/src/components/Diario/ChecklistFotos.jsx`, função `tocarSlot`) o vazio abre a tela "Tire assim" e só depois a câmera. Só o "Refazer" abre a câmera direto. Adotei:
   - vazio abre "Tire assim" (agora com o desenho) e daí a câmera, porque é nessa tela que o desenho aparece;
   - qualquer quadrinho COM foto abre o visualizador, inclusive o "Refazer", que é justamente o que o motorista nunca conseguia ver.
2. **"Ainda sem checklist" no resumo.** Não existe lista de "quem deveria sair". O servidor só sabe quem **iniciou** o dia PRESENCIAL com veículo. Então "K sem checklist" = quem iniciou o dia sem checklist por foto (usou as caixinhas ou nada). Adicionei "montando agora" para rascunhos abertos. Se o dono quer "quem ainda não saiu", é outra fonte de dados e fica fora do Dia 2.
3. **Foto extra de água/óleo** é opcional e não bloqueia. Bloquear contradiz "o checklist nunca trava numa foto impossível". A tela oferece, e o motorista pode escolher "Depois".
4. **Destinatários dos avisos.** Chave ausente significa ninguém recebe, até o dono escolher na tela. Não usei "todos os admins" para não mandar mensagem a quem não pediu. No deploy, o gerente abre a tela e marca o dono (e a expedição nos resumos).
5. **Mestre-detalhe em `lg:` (≥1024px), não `md:`.** Em iPad retrato (768px) duas colunas ficam apertadas. Abaixo de 1024px continua o painel lateral atual (drawer). Se o dono insistir em `md:`, é só trocar uma constante.

---

## 2. Mapa do código atual (conferido)

**Frontend, checklist do motorista**
- `frontend/src/components/Diario/ChecklistFotos.jsx`: grade de quadrinhos.
  - `tocarSlot` está em `:~145`; `fotoDe`/`resolvido` nos `useCallback`.
  - Os grupos `GRUPO_FORA` e `GRUPO_CAPO` estão fixos no topo do arquivo.
  - `onEstado({checklistId, faltam, luzOleoAcesa})`.
  - Câmera: `<input capture="environment">` único, disparado por `abrirCamera` de forma síncrona.
- `frontend/src/components/Diario/TireAssimModal.jsx` (foto modelo + instrução + "Abrir câmera").
- `frontend/src/components/Diario/FormVeiculoPresencial.jsx`:
  - `kmInicial` é pré-preenchido com `ultimoKm.kmFinal` (`:61-67`) e o input tem `min=kmFinal` (`:254-264`).
  - `handleSubmit` (`:100`) chama `avaliar(checklistId, km)` e depois `decidir`/`onConfirmar`.
  - `ChecklistFotos` é usado em `:275` com `onEstado={setEstadoFotos}`.
- `frontend/src/components/Diario/ChecklistProblemaTela.jsx` e `ImgComFalha.jsx` (mensagem de foto perdida).
- `frontend/src/services/checklistVeiculoService.js` (`urlImagem`, `enviarFoto`, `avaliar`, `decidir`, `listarDoVeiculo`, `fotosModelo`).

**Frontend, escritório**
- `frontend/src/pages/Veiculos/ChecklistsVeiculoLista.jsx`: lista simples e um lightbox improvisado de uma foto.
- `frontend/src/pages/Veiculos/FotosModeloVeiculo.jsx`: grade 2/3 colunas, sem visualizador.
- `frontend/src/pages/Veiculos/VeiculoFicha.jsx` (1261 linhas):
  - É um **drawer** `fixed inset-0 z-[70]` com overlay e `max-w-2xl` (`:421-425`). O loading também é `fixed` (`:412`).
  - `TABS` em `:15-25`; a aba `checklists` tem `exige:'acessar'` e o filtro está em `:399`.
  - Props: `veiculoId, onClose, onUpdate, readOnly, allowedTabs`.
  - O form de edição já carrega `tipo`.
- `frontend/src/pages/Veiculos/Veiculos.jsx` (477 linhas):
  - Tabela `hidden md:block` e cards `md:hidden`.
  - A ficha abre por `veiculoFichaId` (drawer).
  - Lista vinda de `GET /veiculos/admin/todos`.
- `frontend/src/pages/Caixa/CaixaDiarioPage.jsx`:
  - Card do veículo em `:722-860`; o `onClick` do card faz `setVeiculoFichaId(resumo.diario.veiculoId)`.
  - Ficha em `:1790-1795` com `allowedTabs={['resumo','documentos','manutencao']}`.
  - O card tem vários botões internos com `stopPropagation`.
- `frontend/src/pages/Admin/Configuracoes/Configuracoes.jsx`: cards de configuração em `:778-870` (`ConferenciaCaixaConfigCard`, `SecaoBackup`…). Este arquivo **não está sujo** na outra sessão.
- Referência de mestre-detalhe: `frontend/src/pages/Estoque/PainelEstoque.jsx:551` (`md:h-[calc(100dvh-2.5rem-var(--topo-extra,0px))] md:flex md:flex-col`). Não existe hook de media query no projeto (`useMediaQuery` não existe).

**Backend**
- `backend/routes/checklistsVeiculo.js`: rotas do módulo (`/config/modo` GET/PUT declaradas antes de `/:id`, `/`, `/:id`, `PATCH /:id`, `/:id/fotos`, `/pular`, `/avaliar`, `/decisao`).
- `backend/services/checklistVeiculoService.js`:
  - `montarConfig` (`:186`) devolve os slots.
  - `enviarFoto` (`:325`) lê `veiculo {placa, modelo}` e chama a IA.
  - `avaliar` (`:405`) monta `porAngulo[f.angulo]` (último por ângulo) e os problemas.
  - `registrarDecisao` (`:510`).
  - `detalhe`/`dtoCompleto`/`listarPorVeiculo` (`:530-592`). A listagem filtra `status:'CONCLUIDO'`.
  - `resumoParaDiario`/`amarrarAoDiario` (`:594+`).
  - Permissões: `podeVerDetalhe` = dono, `Pode_Acessar_Veiculos`, `Pode_Acessar_Caixa`, `Pode_Editar_Caixa`.
- `backend/routes/veiculos.js`: `checklist-config`, `fotos-modelo`, `GET /:id/checklists` (exige `Pode_Acessar_Veiculos`). **`GET /:id` está declarado antes de `/admin/todos`**, então rota nova de listagem precisa ficar ANTES de `/:id`.
- `backend/services/veiculoService.js`: `criar` e `atualizar` têm **whitelist campo a campo** (`:166-222`). Campo novo precisa entrar à mão.
- `backend/routes/caixa.js:392-404`: monta `diarioInfo`, devolvido em `:952` como `diario`. `GET /caixa/diario` calcula tudo isso.
- `backend/services/backupService.js:137-162` (`alertarFalha`) e `backend/services/webhookService.js:459` (`enviarMensagemCustom(telefone, nome, msg, {tipo, origem, referencia})`). Este é o padrão do WhatsApp interno. O `agoraSP()` do backupService é local; para o dia use `utils/dataReferenciaBrasilia.getDataReferencia`.
- `backend/workers/scheduler.js`: blocos de `setInterval` independentes (exemplo: `caixaConfWorker`, `:498-515`). **Não está sujo.**
- `app_configs` (`key` String único, `value` Json): `getModo()` já usa `prisma.appConfig` (`:94-117`).

**Arquivos sujos da outra sessão (Como Fazer IA)**
- Já modificados: `App.jsx`, `schema.prisma`, `adminExec.js`, `novidades.json`, `copilotoService.js`, `configRoutes.js`, `configController.js`, `manuais/abas/README.md`.
- **Este plano não precisa tocar em `App.jsx`, `configRoutes.js`, `configController.js`, `copilotoService.js` nem `manuais/abas/README.md`.** Não há rota, menu nem tela nova (a configuração vira card em `Configuracoes.jsx`).
- Os únicos pontos de contato são 3 edições pequenas, descritas na seção 10:
  - `schema.prisma`, nos models do checklist;
  - `adminExec.js`, só a linha do `deployMarker`;
  - `novidades.json`, uma entrada no topo.

---

## 3. Dependências da Parte A (conferir antes de começar)

O dev-backend da Parte A precisa confirmar estes pontos. Se algum diferir, ajusta-se só o adaptador do front (`utils/checklistFotos.js`):

1. **Slots** de `checklist-config` trazem `grupo` (`'FORA'|'PAINEL'|'CAPO'|'CARGA'`) e `dicaGrupo`. Se `grupo` faltar, o front cai nos arrays fixos atuais.
2. **Formato da pergunta** em `foto.problemas[]`: `{gravidade:'PERGUNTA', descricao, oQueFazer, pergunta, seNao, resposta:null|'SIM'|'NAO'}`. O `indice` do `/responder` é a posição no array `problemas` da foto. `statusIa` ganha o valor `'PERGUNTA'` (já visto em `checklistVeiculoIaService.js`).
3. **Resposta de `POST /:id/responder`.** O front não depende do formato: depois de responder, ressincroniza chamando `criarRascunho(veiculoId)` (idempotente, devolve as fotos).
4. **Palavra de uma só do quadrinho.** Pedir à Parte A um campo opcional `curto` (≤14 caracteres, ex.: "rodas", "de cima", "capô") em cada `problemas[i]`. Sem ele, o front mostra "Atenção" genérico. Aditivo e inofensivo.
5. Tolerância de KM 30 e a frase do `AVISO_TESTE` ficam na Parte A.

**Ordem entre os dois devs-backend.** A Parte B-backend edita os mesmos arquivos que a Parte A: `checklistVeiculoService.js`, `checklistVeiculoIaService.js`, `checklistVeiculoAngulos.js`, `routes/checklistsVeiculo.js`. Ela só deve começar a editar esses arquivos DEPOIS que a Parte A terminar, ou o mesmo dev faz as duas. Até lá pode fazer o que não colide: schema, `veiculoService`, serviço de avisos novo, `caixa.js`, scheduler.

---

## 4. Schema aditivo (nada removido, nada com default quebrado)

Em `backend/prisma/schema.prisma` (arquivo sujo da outra sessão: ver riscos):

```prisma
// model Veiculo: acrescentar
tipoVareta         String?  @map("tipo_vareta")        // PLASTICO_QUADRICULADA | METAL_MARCAS | null
reservatorioOpaco  Boolean  @default(false) @map("reservatorio_opaco")
normalDentro       String?  @db.Text @map("normal_dentro")      // "bolsas pretas do mostruário, caixa térmica azul"
avariasConhecidas  String?  @db.Text @map("avarias_conhecidas") // "para-choque traseiro raspado desde 09/2026"

// model ChecklistVeiculoFoto: acrescentar
aceitaPeloMotorista Boolean   @default(false) @map("aceita_pelo_motorista")
aceitaEm            DateTime? @map("aceita_em")
complemento         Boolean   @default(false)   // 2ª foto do mesmo ângulo (foto de cima / vareta de perto)

// model ChecklistVeiculo: acrescentar
kmOrigem String? @map("km_origem")   // PAINEL_CONFIRMADO | DIGITADO
```

**`complemento` em vez de ângulo novo.** É o menor desenho: um ângulo novo (`agua_tampa`) mexeria no catálogo, nos slots por tipo, na chave do resumo do diário, no `avaliar` e no front. Com `complemento` só muda quem escolhe "foto principal" do ângulo.

---

## 5. Contrato back x front

Todas as rotas: `authMiddleware`. Erros: `{ "error": "mensagem em português", "codigo": "CODIGO" }`. URLs de imagem relativas (`/uploads/...`).

### 5.1 `FotoDTO`: campos novos (aditivos)
```json
{ "...campos do Dia 1 e da Parte A...",
  "complemento": false,
  "aceitaPeloMotorista": false,
  "aceitaEm": null }
```
- `dtoCompleto` (detalhe e listagem do escritório) ganha `kmOrigem` e `discordancias` (número de fotos ativas com `aceitaPeloMotorista=true`).
- `checklistDTO` (5.2 do Dia 1) continua devolvendo `fotos[]`, agora com complementos misturados. **O front filtra `complemento===false` para a foto principal do ângulo.**

### 5.2 `GET /api/veiculos/:id/checklist-config` (alterado, aditivo)
Slot ganha (além de `grupo`/`dicaGrupo` da Parte A):
```json
{ "angulo":"agua_radiador", "complementoRotulo":"Foto de cima, com a tampa aberta" }
```
- `complementoRotulo` é `null` em todos os ângulos, **exceto**:
  - `agua_radiador` = "Foto de cima, com a tampa aberta";
  - `vareta_oleo` = "Foto da ponta da vareta, bem de perto".

Topo da resposta ganha `"tipoVareta":"PLASTICO_QUADRICULADA"|"METAL_MARCAS"|null` e `"reservatorioOpaco":false`. O desenho da vareta do front usa o primeiro.

### 5.3 `PATCH /api/checklists-veiculo/:id` (alterado)
Body: `{ kmDigitado?, luzOleoAcesa?, kmOrigem?: "PAINEL_CONFIRMADO"|"DIGITADO" }`. Valor fora do enum vira 400 `KM_ORIGEM_INVALIDA`. Resposta igual à de hoje.

### 5.4 `POST /api/checklists-veiculo/:id/fotos` (alterado)
Multipart ganha o campo opcional `complemento` (`"1"` ou `"true"`).
- Só vale para ângulo com `complementoRotulo`; senão 400 `COMPLEMENTO_INVALIDO`.
- **Não roda IA** no Dia 2: grava com `statusIa:"NAO_ANALISADA"`, `serve:true`, `complemento:true`. Sem custo e sem risco de reprovar. A IA ler o complemento fica para o Dia 3.
- Troca só o complemento anterior do mesmo ângulo (`ativa=false` apenas onde `complemento=true`). A foto principal não é tocada.
- O limite de 6 tentativas conta separado para principal e complemento.
- Resposta 201 igual à de hoje: `{ foto, checklist:{id, fotosEnviadas} }`. **`fotosEnviadas` não conta complemento.**
- **Efeito obrigatório nos consumidores:** `avaliar`, `resumoParaDiario`, o contador `analisadas`, `total` e o `detalhe/listar` precisam ignorar `complemento=true` ao escolher a "foto do ângulo". Faça um helper único `fotosPrincipais(fotos)` e use em todos. Sem isso, o complemento (sem `leituras`) vira "a foto da água".

### 5.5 `POST /api/checklists-veiculo/:id/fotos/:fotoId/aceitar` (NOVA): "Tá certo assim"
Body: `{ "desfazer": false }` (opcional; `true` desfaz).

Resposta 200: `{ "ok": true, "foto": FotoDTO }`.

Regras no servidor:
- dono do checklist (403 `SEM_PERMISSAO`) e checklist `RASCUNHO` (409 `CHECKLIST_FECHADO`);
- `fotoId` pertence ao checklist e está `ativa` (404 `FOTO_NAO_ENCONTRADA`);
- só vale para `statusIa` ATENCAO ou REFAZER (ou `serve=false`). Para REPROVA, OK, PERGUNTA, complemento ou foto inativa: 400 `NAO_ACEITAVEL`. REPROVA nunca é aceitável;
- só com `modo==='TESTE'`; em TRAVA ou DESLIGADO: 400 `TRAVA_ATIVA`;
- grava `aceitaPeloMotorista=true`, `aceitaEm=now()`. Em `desfazer`, volta a `false` e `aceitaEm=null`. Idempotente: aceitar duas vezes devolve 200.
- O veredito original da IA (`statusIa`, `serve`, `problemas`) **não é alterado**. Isso é o dado de calibração.

Efeito em `avaliar`, para foto com `aceitaPeloMotorista=true`:
- ignora o problema `REFAZER`/`serve=false` e os problemas de gravidade `ATENCAO` dessa foto;
- mantém os `REPROVA`;
- não afeta `PERGUNTA`;
- a resposta de `avaliar` ganha `aceitosPeloMotorista:[{angulo, rotulo, descricao}]` (aditivo). O veredito pode virar APROVADO mesmo com discordância; a discordância aparece via `discordancias` e nos resumos.

`resumoParaDiario` trata foto aceita como `ok` (`f.serve !== false || f.aceitaPeloMotorista`). No front, `resolvido()` também (`serve !== false || aceitaPeloMotorista`).

### 5.6 `GET/PUT /api/checklists-veiculo/config/avisos` (NOVA)
Declarar junto de `/config/modo`, ANTES de `/:id`. **Só `admin`** (403 `SEM_PERMISSAO`). O check do front é `user.permissoes.admin === true`, idêntico.

GET 200:
```json
{
  "naHora": ["vendedorId"], "resumo": ["vendedorId"], "horas": ["07:00","13:00"],
  "candidatos": [{ "id":"uuid","nome":"Clarkson","temTelefone":true,"admin":true }]
}
```
- `candidatos` são os vendedores `ativo=true`, ordenados por nome.
- Chave ausente devolve `{naHora:[], resumo:[], horas:["07:00","13:00"]}`. Não cria a linha no GET.

PUT body: `{ naHora?, resumo?, horas? }` (parcial, dedupe).
- Cada id precisa ser vendedor ativo (400 `DESTINATARIO_INVALIDO`).
- `horas`: de 0 a 4 itens no formato `HH:MM` (regex `^([01]\d|2[0-3]):[0-5]\d$`; 400 `HORA_INVALIDA`).
- Resposta = mesmo objeto do GET.
- Grava em `app_configs.checklist_avisos` (`upsert`, sem `$transaction`).
- Se uma hora do dia já passou ao salvar, ela é enviada na próxima rodada do worker. A tela avisa isso.

### 5.7 `POST /api/checklists-veiculo/config/avisos/testar` (NOVA, admin)
Manda "Teste de aviso do checklist de veículos: funcionando" para o telefone **do próprio admin logado**. A referência é nova a cada clique (`bot.referenciaUnica('chk-teste')`), porque é reenvio manual. Resposta `{ok:true}`, ou 400 `SEM_TELEFONE` se o admin não tem telefone. É a única forma de o dono conferir que o canal funciona.

### 5.8 Chave de emergência `checklist_foto_modo`
O contrato **já existe**: `GET /api/checklists-veiculo/config/modo` (qualquer logado) e `PUT` (só admin) com `{modo:"TESTE"|"DESLIGADO"}`. Falta só o botão. `TRAVA` não aparece na tela no Dia 2 (decisão do Dia 3).

### 5.9 `GET /api/veiculos/checklists-hoje` (NOVA)
Declarar ANTES de `GET /:id` em `routes/veiculos.js`. Permissão: `admin || Pode_Acessar_Veiculos`.
```json
{ "dataReferencia":"2026-10-21",
  "itens":[{ "veiculoId":"uuid","emUso":true,
             "motorista":{"id":"uuid","nome":"Jociel"},
             "checklist":{"id":"uuid","status":"CONCLUIDO","veredito":"REPROVADO","decisao":"SEGUIU_TESTE",
                          "fotosTotal":9,"problemasTotal":3,"discordancias":1,"criadoEm":"..."} | null }] }
```
- Entram só veículos com diário PRESENCIAL hoje (`emUso:true`) ou com rascunho de checklist hoje. Os demais o front mostra como "—".
- Uma consulta de diários e uma de checklists do dia (SAIDA), agrupadas em memória. Sem N+1.

### 5.10 `GET /api/veiculos/:id/checklists` (alterado)
- **Permissão passa a `admin || Pode_Acessar_Veiculos || Pode_Acessar_Caixa || Pode_Editar_Caixa`.** Isso alinha com `podeVerDetalhe`, que já libera o detalhe de qualquer checklist a quem tem permissão de Caixa. Sem isso, a ficha aberta pelo Caixa não consegue listar. O front espelha a mesma condição (ver 7.2).
- A listagem passa a incluir também `RASCUNHO` de hoje que tenha pelo menos uma foto (mostrar "Em andamento"). Motivo: o aviso por WhatsApp sai ANTES de o diário ser criado, e o link "Veículos > placa > Checklists" ficaria vazio. Filtro: `OR [{status:'CONCLUIDO'}, {status:'RASCUNHO', dataReferencia: hoje}]`. O campo `status` já existe no DTO.

### 5.11 `GET /caixa/diario` (aditivo): `diario.checklist` e `diario.checklistEsperado`
```json
"diario": { "...campos de hoje...",
  "checklist": { "id":"uuid","veredito":"REPROVADO","decisao":"SEGUIU_TESTE","modo":"TESTE",
                 "fotosTotal":9,"problemasTotal":3,"discordancias":1,"perguntasNao":1,
                 "concluidoEm":"2026-10-21T11:46:00.000Z" } | null,
  "checklistEsperado": true }
```
- Busca: `checklistVeiculo` com `diarioId = diario.id` e `veiculoId = diario.veiculoId` (o diário pode ter mais de um veículo ao longo do dia; vale o atual), mais recente.
- `checklistEsperado = modo==='PRESENCIAL' && veiculoId && dataReferencia >= '2026-10-20' && (data < hoje || modoAtual !== 'DESLIGADO')`. A data de início fica numa constante do `checklistVeiculoAngulos.js`. Evita "Sem checklist" falso em caixa histórico.
- **O bloco inteiro roda em `try/catch`** e em falha devolve `checklist:null`, `checklistEsperado:false`. Nada do Caixa pode quebrar por causa disso (ver riscos).
- Nenhum campo existente muda.

### 5.12 Veículo (`POST /veiculos`, `PUT /veiculos/:id`)
Aceitam `tipoVareta`, `reservatorioOpaco`, `normalDentro`, `avariasConhecidas`.
- `tipoVareta`: `""`/`null` vira `null`; valor fora do enum, 400 `TIPO_VARETA_INVALIDO`.
- `reservatorioOpaco`: precisa ser boolean (aceitar `"true"/"false"` por segurança).
- Textos: `trim`, no máximo 500 caracteres (400 `TEXTO_LONGO`); vazio vira `null`.
- Entram na whitelist de `veiculoService.criar/atualizar` (padrão do `tipo`). Gate de permissão: o PUT já exige `Pode_Editar_Veiculos` (`exigirEdicaoVeiculo`). `GET /veiculos`, `/admin/todos` e `/:id/ficha` devolvem a linha crua, então os campos aparecem sozinhos.

---

## 6. Plano numerado, backend (dev-backend, depois da Parte A)

1. **Schema** (seção 4) + `npx prisma validate` + `prisma generate`. Commit do `schema.prisma` só com `git add -p`, nos blocos do checklist (ver riscos).
2. **`veiculoService.js`**: 4 campos novos na whitelist de `criar` e `atualizar`, com validação (5.12).
3. **`config/checklistVeiculoAngulos.js`**: `complementoRotulo` nos 2 ângulos; constante `CHECKLIST_INICIO = '2026-10-20'`.
4. **`checklistVeiculoService.js`**:
   - `montarConfig`: `complementoRotulo` por slot, `tipoVareta` e `reservatorioOpaco` no topo.
   - `fotoDTO`: `complemento`, `aceitaPeloMotorista`, `aceitaEm`.
   - `enviarFoto`: caminho de `complemento` (5.4). Ao ler o veículo (`:~335`), ampliar o `select` para `tipoVareta, reservatorioOpaco, normalDentro, avariasConhecidas` e passar adiante.
   - `aceitarFoto` (5.5).
   - Helper `fotosPrincipais`, usado em `avaliar`, `resumoParaDiario`, `enviarFoto` (total), `dtoCompleto`.
   - `avaliar`: pula problemas de foto aceita (5.5) e devolve `aceitosPeloMotorista`.
   - `atualizarRascunho`: `kmOrigem`.
   - `dtoCompleto`: `kmOrigem`, `discordancias`.
   - `listarPorVeiculo`: incluir rascunho de hoje (5.10).
   - Função nova `resumoParaCaixa(diarioId, veiculoId)`.
5. **`checklistVeiculoIaService.js`** (contexto do veículo na IA; ponto de encaixe único): em `analisarFoto`, logo depois da linha `Carro: ${modelo}, tipo ${tipo}. Ângulo: ...`, acrescentar linhas condicionais, cada uma só quando o campo existe:
   - `vareta_oleo` + `tipoVareta`: "A vareta deste carro é de plástico laranja com área quadriculada; o nível está certo quando o óleo molha dentro do quadriculado" (ou "de metal com duas marcas");
   - `agua_radiador` + `reservatorioOpaco`: "O reservatório deste carro é opaco/sujo; se não enxergar o nível, use gravidade PERGUNTA em vez de pedir outra foto";
   - `bau`/`porta_malas` + `normalDentro`: "É NORMAL ter dentro: <texto>. Não reclame disso";
   - todos os ângulos externos + `avariasConhecidas`: "Avarias já conhecidas, não aponte de novo: <texto>".
   O texto digitado pelo escritório entra entre aspas, truncado a 500 caracteres. A Parte A já passa `veiculo` ao prompt; só o `select` acima precisa crescer.
6. **`services/checklistAvisosService.js` (arquivo novo)**: configuração, mensagens e resumos (seção 8).
7. **`routes/checklistsVeiculo.js`**: `/config/avisos` GET e PUT e `/config/avisos/testar` (antes de `/:id`); `POST /:id/fotos/:fotoId/aceitar`. **Ganchos de aviso na hora**, depois da resposta de sucesso:
   - em `POST /:id/decisao` com `SEGUIU_TESTE`: `setImmediate(() => avisos.aoSeguirReprovado(id).catch(log))`. O serviço relê o checklist e só envia se `veredito==='REPROVADO'`;
   - em `POST /:id/responder` (rota da Parte A) com `req.body.resposta==='NAO'`: `setImmediate(() => avisos.aoResponderNao(id, angulo, indice).catch(log))`.
   Nunca `await` na requisição do motorista. Falha de WhatsApp jamais afeta a resposta HTTP.
8. **`routes/veiculos.js`**: `GET /checklists-veiculo hoje` (5.9) ANTES de `/:id`; permissão ampliada em `GET /:id/checklists` (5.10).
9. **`routes/caixa.js`** (~`:392-404`): `diario.checklist` e `checklistEsperado` dentro de `try/catch` (5.11). Uma consulta indexada (`diarioId`, `veiculoId`), mais uma contagem de fotos. Nada além.
10. **`workers/scheduler.js`**: novo bloco "Resumos do checklist de veículos" (seção 8.3).
11. **`routes/adminExec.js`**: só a linha do `deployMarker` (hoje `'ia-pop-fase1-2026-10-21'`), para `checklist-dia2-2026-10-22`. Edição localizada em arquivo sujo da outra sessão.
12. **Manuais** (não toca no `README.md` do Clippy porque não há tela nova): atualizar `backend/manuais/abas/veiculos.md` (visualizador, aba Checklists e Fotos modelo, tela em duas colunas, 4 campos do cadastro, "Tá certo assim"), `caixa.md` (selo do checklist e ficha na aba Checklists) e `config-gerais.md` (card "Checklist de veículos": quem recebe aviso, horas, chave de emergência, botão de teste). Não precisa mexer na tabela `ABAS` de `copilotoService.js`.
13. **Testes com curl** (obrigatório, com o app local): cada rota nova com sucesso e erro. Conferir `GET /caixa/diario` de um caixa SEM diário, HOME_OFFICE e com diário. Rodar `node --check` em todos os arquivos tocados. O banco local é `hardt_local`.

---

## 7. Plano numerado, frontend

### 7.1 dev-frontend B: tela do motorista

**Componentes novos (pasta nova `frontend/src/components/ChecklistVeiculo/`)**

1. **`VisualizadorFotos.jsx`: componente único reutilizado nos 3 lugares (motorista, ficha, Caixa).** Entregar PRIMEIRO, porque o dev C depende dele.
   - Props:
     ```
     slides: Slide[]          // ordem de exibição
     indiceInicial: number
     onClose: () => void
     modo: 'motorista' | 'escritorio'
     contexto?: { motorista, data, veiculo, kmLido, kmDigitado, kmOrigem }   // faixa do topo, só escritório
     acoes?: { onRefazer(slide), onAceitar(slide, desfazer), onResponder(slide, indice, resposta), ocupado }  // só motorista
     ```
   - `Slide`: `{ chave, rotulo, url, statusIa, serve, aceitaPeloMotorista, aceitaEm, parecer:{gravidade, titulo, oQueFazer}|null, perguntas:[{indice, texto, resposta}], complemento:{url}|null, editavel }`.
   - Layout:
     - tela cheia, renderizada num portal em `document.body`, `z-[140]` (acima do `TireAssim` z-120 e da ficha z-70);
     - topo: "Frente · 1 de 8" e botão fechar de 44px;
     - centro: a foto;
     - parecer abaixo no mobile (folha com `max-h-[40dvh]` e rolagem) e em painel lateral de 360px no desktop (`lg:`).
   - Gestos (sem biblioteca), com Pointer Events:
     - dois dedos = pinça (escala 1 a 5);
     - com escala > 1, um dedo arrasta;
     - com escala = 1, arrastar horizontal maior que 60px troca de foto;
     - toque duplo alterna 1x e 2,5x;
     - `touch-action: none` no palco, o que também impede o scroll do app por trás.
   - Desktop: setas do teclado trocam foto, `Esc` fecha, `+`/`-`/`0` dão zoom, roda do mouse dá zoom no ponteiro, arrastar com mouse move a imagem, botões `‹ ›` visíveis.
   - Imagem com `ImgComFalha` (mensagem "arquivo se perdeu" quando 404). Pré-carregar só as 2 vizinhas.
   - Android: ao abrir, `history.pushState({vf:1})` e escutar `popstate` para fechar. O botão voltar fecha o visualizador em vez de sair do app. Remover o estado ao fechar.
   - Parecer (modo motorista):
     - `gravidade` colore o chip;
     - título = `problemas[0].descricao`, linha 2 = `oQueFazer`;
     - **PERGUNTA**: texto + botões **Sim** / **Não** (44px). Eles chamam `acoes.onResponder`. Depois de responder, mostra "Você respondeu Sim/Não" e, se o slot tem `complementoRotulo` sem complemento ainda, o cartão "Agora tire a foto: <rótulo>" com [Tirar foto] e [Depois];
     - **"📷 Tirar de novo"**: sempre presente quando `editavel`. Chama `acoes.onRefazer(slide)`, que dispara o `inputRef.click()` do `ChecklistFotos` de forma **síncrona** no clique (regra do iOS) e só depois fecha o visualizador;
     - **"Tá certo assim, deixa"**: aparece se `statusIa ∈ {ATENCAO, REFAZER}`, `modo==='TESTE'` e ainda não aceita. Depois de aceita vira o selo "Você disse que está certo ✓" com o link "Desfazer". Nunca aparece para REPROVA.
   - Parecer (modo escritório): sem botões. Mostra:
     - chip + título + o que fazer;
     - as perguntas já respondidas ("Jociel respondeu NÃO");
     - "Motorista discordou da IA às 08:21";
     - KM lido x digitado/origem (só na foto do painel);
     - o complemento como miniatura que amplia.
   - Também serve para foto modelo (slide sem `parecer`, rótulo "Foto modelo").
2. **`frontend/src/utils/checklistFotos.js`**: funções puras compartilhadas pelo B e pelo C:
   - `fotoPrincipal(fotos, angulo)` e `complementoDe(fotos, angulo)`;
   - `estadoDoQuadrinho(foto, {obrigatorio, envio})` devolve `{codigo, palavra, cor}`:
     - `✓` OK; `⚠ <curto|"atenção">`; `✕` REPROVA; `↻ <curto|"refazer">`; `?` PERGUNTA sem resposta; "aceita" quando `aceitaPeloMotorista`;
     - câmera só no vazio;
   - `parecerDaFoto(foto)` e `montarSlides(fotos, slots|rotulos, {editavel})` para o visualizador.
3. **`DesenhosEnquadramento.jsx`**: `<DesenhoEnquadramento angulo variante />` com SVG inline por ângulo.
   - Copiar os SVG da seção "Desenho de enquadramento" de `docs/propostas/proposta-checklist-dia2.html` (frente, laterais, painel, água, vareta em 2 variantes, traseira; o baú/porta-malas usa um genérico).
   - Lateral esquerda = lateral direita espelhada (`scaleX(-1)`).
   - Cores por `currentColor`/tokens (funciona no tema claro e escuro).
   - `variante` = `tipoVareta` para a vareta.
   - **Marca d'água sobre a câmera NÃO é possível com `<input capture>`.** A câmera nativa é do sistema operacional e a página não desenha nada nela. Só dá o desenho ANTES. Desenhar sobre a câmera exigiria `getUserMedia` com câmera própria, o que perde o flash, o foco e a qualidade da câmera nativa no iOS e está fora do escopo. Não tentar.

**Componentes alterados**

4. **`ChecklistFotos.jsx`**
   - Blocos por `slot.grupo`, na ordem em que aparecem, com os rótulos "1 · Por fora (capô fechado)", "2 · Painel (porta fechada, chave ligada)", "3 · Capô aberto", "4 · Baú / Porta-malas" e a `dicaGrupo` do primeiro slot do bloco no cabeçalho. Fallback para os arrays fixos se `grupo` faltar.
   - **Aviso ao entrar no CAPÔ**: não bloqueia.
     - Se faltam fotos do bloco FORA, o primeiro toque no CAPÔ mostra "Faltam fotos de fora. Tire antes de abrir o capô" com [Tirar as de fora] e [Abrir mesmo assim].
     - Se o FORA está completo, o cartão âmbar diz "As fotos de fora já estão feitas? Então pode abrir o capô".
     - Ao terminar o CAPÔ e ir para CARGA: "Feche o capô".
   - `tocarSlot`: vazio abre `TireAssim`; com foto abre o visualizador (inclusive "Refazer"). Hoje "Refazer" abre a câmera direto (`:~143`), e é isso que impede o motorista de ver a própria foto.
   - Quadrinho: `estadoDoQuadrinho`; faixa de uma palavra; ícone de câmera só no vazio. Filtrar `complemento` ao achar `fotoDe`.
   - `resolvido()` considera `aceitaPeloMotorista`.
   - Ações do visualizador: `onResponder` chama `service.responder` e depois `criarRascunho(veiculoId)` para ressincronizar; `onAceitar` chama `service.aceitar`; o complemento sobe pelo mesmo `enviar()` com `complemento=true` (campo extra no `FormData`), sem etapa "analisando".
   - `onEstado` passa também `kmLido` (leitura do painel principal) e `kmLidoRev` (id da foto, para o cartão de KM reagir a "refazer painel").
5. **`TireAssimModal.jsx`**: mostrar `<DesenhoEnquadramento>` ao lado da foto modelo (ou sozinho quando não há modelo) e o texto de enquadramento do slot. Layout `sm:grid-cols-2`. O "Abrir câmera" continua chamando `onAbrirCamera` no clique.
6. **`FormVeiculoPresencial.jsx`: KM confirmado**
   - Com `estadoFotos.kmLido != null` e `kmLido >= ultimoKm.kmFinal` (ou sem `ultimoKm`): o campo KM é substituído por um cartão "Painel marca 206.380 km. Confirma?" com [Confirma] e [Corrigir].
   - [Confirma] define `kmInicial` e chama `atualizar(checklistId, {kmDigitado, kmOrigem:'PAINEL_CONFIRMADO'})`. [Corrigir] mostra o input atual e envia `kmOrigem:'DIGITADO'`.
   - Se `kmLido < ultimoKm.kmFinal`: **não** oferecer confirmar. Mostrar "Painel marca X, mas o último KM registrado foi Y. Digite o KM" e deixar o input (o `min` atual continua valendo).
   - Sem leitura (IA não leu, painel pulado, modo DESLIGADO ou veículo sem foto de painel): o input aparece como hoje.
   - O `kmDigitado` que vai para `avaliar` é o confirmado.
7. **`services/checklistVeiculoService.js`** (dono: B): `responder(id, {angulo, indice, resposta})`, `aceitar(id, fotoId, desfazer)`, `enviarFoto(..., {complemento})`, `atualizar` com `kmOrigem`. Os métodos do escritório (avisos, hoje) ficam em arquivo separado do C para não colidir.

**Ordem do B:** `checklistFotos.js` e `VisualizadorFotos.jsx` (avisar o C quando a API estiver estável, mesmo em versão sem polimento) → `ChecklistFotos` (blocos, estados, perguntas, aceitar, complemento) → `TireAssim` + desenhos → KM no `FormVeiculoPresencial` → build → teste em 375px.

### 7.2 dev-frontend C: escritório

1. **`components/ChecklistVeiculo/SeloChecklist.jsx`**: recebe `{checklist, esperado}`.
   - `null` e esperado = "Sem checklist" (cinza).
   - APROVADO = "Checklist ok" (verde).
   - ATENCAO = "Atenção" (âmbar). REPROVADO = "Reprovado" (vermelho). IA_INDISPONIVEL = "Sem análise" (cinza).
   - Acrescenta "· seguiu" quando `decisao==='SEGUIU_TESTE'`.
   - `status==='RASCUNHO'` = "Em andamento".
   - Cores do design system (`px-2 py-1 text-xs font-semibold rounded-full`). Usado em Veículos, Caixa e na ficha.
2. **`services/checklistEscritorioService.js`**: `avisosConfig()`, `salvarAvisos(body)`, `testarAviso()`, `hoje()`.
3. **`pages/Veiculos/ChecklistsVeiculoLista.jsx`**: trocar o lightbox improvisado por `VisualizadorFotos` (`modo:'escritorio'`) com todas as fotos do checklist.
   - Grade de miniaturas `grid-cols-3 sm:grid-cols-4 lg:grid-cols-6`.
   - Cada checklist mostra veredito, decisão, KM lido x digitado/`kmOrigem`, "N discordâncias", perguntas respondidas e a lista de problemas.
   - Prop nova `destaque` (id do checklist, ou data): o card vem primeiro, expandido, com borda destacada.
4. **`pages/Veiculos/FotosModeloVeiculo.jsx`**: o toque na foto modelo abre o visualizador (slides sem parecer, "Substituir" continua nas ações do card). Grade `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`.
5. **`pages/Veiculos/VeiculoFicha.jsx`**, três mudanças:
   - **Props novas** `abaInicial` e `modoEmbutido`. Em `modoEmbutido`, o contêiner deixa de ser `fixed inset-0` com overlay: vira `<div className="h-full flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">` (o loading também), o botão X vira "Fechar" opcional e o `z-[70]` some. O restante do componente não muda.
   - **Aba checklists**: condição `exige:'checklists'` = `admin || Pode_Acessar_Veiculos || Pode_Acessar_Caixa || Pode_Editar_Caixa`, **idêntica ao back (5.10)**. A aba `fotos` continua para todos (leitura).
   - **Bloco "Para a conferência por foto"** no modo de edição da aba Resumo, só com `podeEditarVeiculos`: `SelectBusca` do tipo de vareta (Não definida / Plástico quadriculada / Metal com marcas), caixa "Reservatório opaco ou sujo", textarea "O que é normal ter dentro" e textarea "Avarias conhecidas", cada uma com contador de 500 caracteres. Esses 4 campos entram no `form`/`PUT` que já existe.
6. **`pages/Veiculos/Veiculos.jsx`**: mestre-detalhe em `lg:`.
   - Criar `hooks/useMediaQuery.js` (um `matchMedia` com listener) e usar `useMediaQuery('(min-width: 1024px)')`.
   - Desktop: contêiner como o do Ajuste de Estoque (`lg:h-[calc(100dvh-2.5rem-var(--topo-extra,0px))] lg:flex lg:flex-col`) e, dentro, `lg:grid lg:grid-cols-[minmax(360px,40%)_1fr] lg:gap-4`, cada coluna com `overflow-y-auto`.
     - **Esquerda**: busca por placa/modelo (texto, **não** persiste), filtro de tipo com `SelectBusca` e "só ativos", persistidos com `useFiltrosSalvos('veiculos', {tipo:'todos', soAtivos:true})`; botão "Novo veículo"; tabela compacta Placa | Modelo | Tipo | Hoje (`SeloChecklist`). A linha selecionada fica destacada.
     - **Direita**: `<VeiculoFicha key={veiculoFichaId} modoEmbutido ...>`, ou um estado vazio "Escolha um veículo" (padrão do projeto).
   - O `key` remonta a ficha ao trocar de veículo e zera `editando` e os formulários. A aba ativa fica no pai (`useFiltroSalvo('veiculos:aba','resumo')`) e entra via `abaInicial`.
   - Abaixo de `lg:` fica exatamente como hoje: cards no celular e ficha em drawer. Os cards ganham o `SeloChecklist` e o botão de editar/manutenção segue com `stopPropagation`.
   - A coluna "Hoje" vem de `checklistEscritorioService.hoje()`, carregada uma vez e recarregada ao voltar para a aba (há `useAtualizaAoVoltar`). Veículo fora do mapa mostra "—".
   - `<select tipoCombustivel>` nativo do modal já existe e fica como está (não é escopo).
7. **`pages/Caixa/CaixaDiarioPage.jsx`** (tela crítica: mudanças mínimas, todas aditivas):
   - Selo do checklist no card do veículo (`:722-860`), ao lado do selo Presencial/Home Office. O `<SeloChecklist>` fica num `<span onClick={e => e.stopPropagation()}>` para não competir com o clique do card. Renderiza só se `resumo.diario?.modo==='PRESENCIAL'`; sempre com `?.`.
   - O texto "Clique para ver Resumo, Documentos e Manutenção" passa a "…, Manutenção e Checklists".
   - A ficha (`:1790`) passa a `allowedTabs={['resumo','documentos','manutencao','checklists','fotos']}` e ganha `abaInicial={resumo?.diario?.checklist ? 'checklists' : 'resumo'}`.
   - A aba checklists recebe `destaque` = `resumo.diario.checklist?.id`.
   - **Não** alterar o fechamento do caixa, as travas nem a impressão (`RelatorioCaixaPrint`). Trava é Dia 3.
8. **`pages/Admin/Configuracoes/ChecklistVeiculoConfigCard.jsx`** (novo) + **2 linhas em `Configuracoes.jsx`** (import e `{user?.permissoes?.admin && <ChecklistVeiculoConfigCard />}`, ao lado do `ConferenciaCaixaConfigCard`). Mesmo estilo de card dele (`bg-white rounded-xl border ... bg-mint/40` no cabeçalho).
   - **Chave de emergência**: dois botões em pílula, "Modo teste (fotos + IA)" e "Desligar (volta às 6 caixinhas)", com `confirm` antes de desligar e o texto "vale na hora, sem publicar". Usa `GET/PUT /config/modo`.
   - **Quem recebe o aviso na hora** e **quem recebe os resumos**: duas listas de checkboxes (candidatos); quem não tem telefone aparece desabilitado com o aviso "sem telefone no cadastro".
   - **Horas dos resumos**: duas ou mais entradas `HH:MM` (usar o `CampoNumero` ou `input type=time`) com [Adicionar hora] e [Remover].
   - Botões [Salvar] e [Enviar mensagem de teste para mim].
   - Banner âmbar quando as duas listas estão vazias: "Ninguém recebe aviso ainda".
   - Mobile em 375px: listas empilhadas, botões de 44px.
   - **Sem rota nova no `App.jsx` e sem item de menu.**
9. **Anúncio**: `frontend/public/novidade-checklist-foto-v2.html` (espelhar `novidade-tarefas.html` e `novidade-cadastro-clientes.html`: accordions abertos, mockups com legendas numeradas das telas do visualizador, da tela em blocos, do Caixa, da tela de Veículos em duas colunas e do card de Configurações; `og:title`/`og:description` sem `og:image`; sem botão "Abrir o app") + entrada no TOPO de `frontend/public/novidades.json` (arquivo sujo da outra sessão: inserir só a linha, no topo, sem reordenar nada).

**Ordem do C:** `SeloChecklist` + service + `useMediaQuery` → Caixa (selo e ficha) → `VeiculoFicha` (embutido, aba, 4 campos) → `Veiculos.jsx` desktop → integrar o visualizador quando o B liberar → card de Configurações → novidade → build.

### 7.3 Paralelismo e divisão de arquivos (sem colisão)

| Dev | Arquivos exclusivos |
|---|---|
| dev-backend | tudo de `backend/` (inclui os manuais e o `deployMarker`) |
| dev-frontend B | `components/ChecklistVeiculo/VisualizadorFotos.jsx`, `DesenhosEnquadramento.jsx`, `utils/checklistFotos.js`, `components/Diario/*` (ChecklistFotos, TireAssimModal, FormVeiculoPresencial), `services/checklistVeiculoService.js` |
| dev-frontend C | `SeloChecklist.jsx`, `services/checklistEscritorioService.js`, `hooks/useMediaQuery.js`, `pages/Veiculos/*`, `pages/Caixa/CaixaDiarioPage.jsx`, `pages/Admin/Configuracoes/*`, `novidade-checklist-foto-v2.html`, `novidades.json` |

Os dois frontends **não podem rodar `npm run build` ao mesmo tempo** no mesmo diretório sem combinar (um quebra o build do outro com arquivo pela metade). Rodar o build só ao fechar cada etapa, e o build final de todos junto, depois que ambos terminarem.

---

## 8. Avisos por WhatsApp e worker dos resumos

### 8.1 Regras do bot obedecidas
Toda mensagem usa `webhookService.enviarMensagemCustom(telefone, nome, texto, { tipo:'interno', origem:'checklist-veiculo', referencia })`. Só texto, nada promocional, para equipe interna, no mesmo padrão do `backupService.alertarFalha`. O texto é cortado antes de 2000 caracteres. Destinatário sem telefone é pulado e logado `[ChecklistAvisos]`. Retorno `reagendado` conta como sucesso. O número de destinatários é pequeno, então não há risco de teto de 200/h.

### 8.2 Aviso na hora: referências (idempotência)
| Evento | Gatilho | `referencia` |
|---|---|---|
| Seguiu mesmo assim com REPROVADO | `POST /:id/decisao` SEGUIU_TESTE e `veredito==='REPROVADO'` | `chk-hora-seguiu-<checklistId>-<destVendedorId>` |
| Resposta NÃO numa PERGUNTA | `POST /:id/responder` com NAO | `chk-hora-nao-<fotoId>-<indice>-<destVendedorId>` |
| Teste da tela | botão de teste | `bot.referenciaUnica('chk-teste')` (reenvio manual = referência nova, regra do projeto) |

- Retry da mesma ação reusa a mesma referência, então o bot devolve `DUPLICADO` e ninguém recebe duas vezes (o motorista que toca "Seguir" duas vezes, ou volta e repete).
- Mensagem (modelo do dono):
  ```
  🚗 *Checklist com problema* · 08:19
  Reprovado e seguiu mesmo assim (teste)
  Motorista: Jociel · RLJ1I28 (Kia Bongo)
  • Painel: luz de freio (ele respondeu: freio de mão)
  • Água: não deu pra ver, ele confirmou que está entre MIN e MAX
  Ver fotos: app → Veículos → RLJ1I28 → Checklists
  ```
  O servidor monta as linhas a partir de `problemas` (gravidade REPROVA e PERGUNTA respondida NAO), no máximo 12 linhas de 140 caracteres.
- **Um checklist pode gerar até 2 ou 3 mensagens** (NAO + seguiu). É o pedido do dono ("na hora em todo..."). Se virar excesso, o ajuste é agrupar com uma janela de 2 minutos, no Dia 3.

### 8.3 Resumos de 7h e 13h: sem duplicar
Bloco novo em `workers/scheduler.js`, no estilo dos vizinhos: `setTimeout(_run, 3*60*1000)` e `setInterval(_run, 5*60*1000)`, com guarda de reentrância (como o bloco de impressão), chamando `checklistAvisosService.rodarResumos()` com `catch` que só loga.

Algoritmo de `rodarResumos()`:
1. Lê `checklist_avisos`. Sem destinatários em `resumo` ou sem horas, retorna.
2. `agora` em America/Sao_Paulo e `dia = getDataReferencia()`. Para cada hora `H`: se `agora >= H` e `agora < H + 3h` (janela: um restart às 10:30 não manda o das 7h), segue.
3. **Reivindica o envio de forma atômica**: `prisma.appConfig.create({ key: 'checklist_avisos_resumo_<dia>_<HHMM>', value: { estado:'ENVIANDO', em: iso } })`.
   - A chave é única. Se der `P2002`, outra execução já pegou: se `estado==='OK'`, pula; se `ENVIANDO` há mais de 15 minutos (queda no meio), assume e reenvia, pois as referências abaixo impedem duplicata; senão pula.
4. Monta o texto (consultas abaixo) e envia a cada destinatário, com a referência `chk-resumo-<dia>-<HHMM>-<destVendedorId>`.
5. Ao fim, `update` da chave para `{estado:'OK', enviados:n, em}`. Falhando todos os envios, marca `estado:'ERRO'` com o motivo, mas não reenvia sozinho (evita laço).
6. Limpeza oportunista: remove as chaves `checklist_avisos_resumo_*` com mais de 30 dias.
- **Não há `$transaction` neste módulo.** O bot e as consultas ficam fora de qualquer transação.

Conteúdo (fontes reais, todas do dia):
- `diarios` PRESENCIAL com `veiculoId` (saíram), com vendedor e veículo;
- `checklistVeiculo` SAIDA do dia (para cruzar por `diarioId` e `veiculoId`);
- **saíram N** = diários; **M com problema** = checklists com veredito ATENCAO/REPROVADO ou com NAO; **K sem checklist** = diários sem checklist ligado, só se `checklistEsperado`; **montando agora** = rascunhos de hoje sem diário; **discordâncias** = soma de fotos aceitas pelo motorista.
- O resumo das 13h lista só o que é novo desde o resumo anterior do dia (ou desde 00:00), mas o cabeçalho traz os totais do dia.
- Domingo sem nenhum movimento: não envia. Nos demais dias envia mesmo com "saíram 0" (serve de prova de vida).
- Cada lista é cortada em 15 itens + "+N outros", e o total em 1800 caracteres.

Exemplo:
```
🚗 *Checklist · resumo das 7h* (21/10)
Saíram 4 · 1 com problema · 2 sem checklist por foto
Com problema:
• Jociel · RLJ1I28: Reprovado, seguiu mesmo assim
Sem checklist por foto:
• Patrik · RLB6E01
Em andamento: • Fulano · RNB0I36
O motorista discordou da IA em 3 fotos.
Detalhes: app → Veículos → Checklists
```

---

## 9. Riscos e efeitos colaterais

1. **Caixa é tela crítica.**
   - O bloco do `routes/caixa.js` fica em `try/catch` e devolve campos nulos em falha; mudança aditiva, sem tocar nos campos atuais. Conferir com grep que ninguém usa `diario` fora de `CaixaDiarioPage.jsx` (`RelatorioCaixaPrint`, `CaixaPilulasDia`, fechamento).
   - No front, o selo usa `?.` em tudo e não pode lançar exceção: um erro de render derruba o Caixa inteiro.
   - Testar caixa SEM diário, HOME_OFFICE, vendedor sem veículo, caixa retroativo e o fluxo de KM editável do card.
   - O clique do card hoje abre a ficha; os botões internos (editar KM, reiniciar diário) já usam `stopPropagation`. Não pode ser quebrado.
2. **`App.jsx` e demais arquivos compartilhados com a outra sessão.** O plano não toca `App.jsx`, `configRoutes.js`, `configController.js`, `copilotoService.js` nem o `README.md` dos manuais. Para `schema.prisma`, `adminExec.js` e `novidades.json`, que ficam sujos por lá:
   - editar só os trechos nossos;
   - **no commit usar `git add -p` (ou comitar arquivo por arquivo conferindo o `git diff --cached`)**. Subir o `schema.prisma` inteiro publicaria o model `ComoFazerIaUso` da outra sessão (pela memória do projeto, um arquivo não commitado já quebrou deploy uma vez);
   - conferir o `HEAD` e fazer `git pull --rebase` antes do push.
3. **Colisão com a Parte A** nos mesmos services/rotas (seção 3): sequenciar.
4. **PWA em cache / ordem do deploy.**
   - Publicar o backend ANTES do frontend; tudo no back é aditivo, então o front antigo em cache continua funcionando.
   - O front novo deve tolerar back antigo: `grupo`, `complementoRotulo`, `curto`, `aceitaPeloMotorista` ausentes caem no comportamento do Dia 1.
   - Motorista com a versão antiga em cache verá complementos como "foto do ângulo"? Só aparecem se subidos pelo front novo, então o risco é baixo; o `useVersionCheck` já avisa sobre a atualização.
   - O `sw.js` não precisa subir `VERSAO` (nenhuma estratégia de cache muda).
5. **iOS/iPad**
   - O gesto de pinça tem de ser testado em aparelho real: o PWA standalone pode ter zoom de página próprio. O palco com `touch-action:none` e `viewport` sem `user-scalable=no` precisa ser conferido.
   - `Tirar de novo` precisa abrir a câmera dentro do toque.
   - Arquivo de foto perdido deve mostrar a mensagem do `ImgComFalha`, não uma tela quebrada.
6. **Cobertura de permissão**: front = back exatamente (5.6 admin; 5.9 Veículos; 5.10 inclui Caixa). Permissão é **objeto**, não booleano (memória do projeto): use `=== true`/`!!perms.x` só nos booleanos específicos, e teste com o perfil "Producao".
7. **Regras do WhatsApp**: `tipo:'interno'`, referência única por evento/destinatário, texto máximo de 2000, nada promocional, retry com a MESMA referência e teste manual com referência nova. A configuração e o texto vão para a seção de WhatsApp do manual.
8. **Idempotência financeira/fiscal**: não há. O `aceitar` e o `decisao` são idempotentes por construção.
9. **Dados**: `complemento` mal filtrado contamina `avaliar` (5.4). É o defeito mais provável. Cobrir com teste explícito: subir complemento e conferir que a leitura/veredito do ângulo não muda.
10. **Gravação de arquivo**: o complemento usa a mesma pasta já validada (`backend/uploads/checklists-veiculo`), sem caminho novo. Mesmo assim, no QA em produção: gravar um complemento, esperar o deploy seguinte e abrir a foto de novo (a regra do projeto de "gravar > deploy > ler").
11. **Custo/latência da IA** não mudam (o complemento não chama a IA).
12. **Mestre-detalhe**: a ficha tem estado interno grande (forms de uso, abastecimento, alerta). O `key={veiculoId}` evita estado de um veículo vazar para outro. Cuidado para o `onClose`/`onUpdate` recarregarem a lista sem perder a seleção.

---

## 10. O que NÃO fazer

- Não replanejar nem reeditar a lógica de prompt/frases/limite de refazer/tolerância de KM (Parte A).
- Não usar `window.open`, `<iframe>` nem `React.lazy`. Nenhuma rota nova no `App.jsx`, então `lazyComRetry` não entra neste plano.
- Não usar `<select>` nativo (`SelectBusca`). Não persistir busca por texto.
- Não alterar o veredito original da IA ao aceitar; não aceitar REPROVA.
- Não bloquear o início do dia por causa de complemento, de aviso ou de config; nenhum erro de WhatsApp pode virar erro de HTTP para o motorista.
- Não colocar `await` de WhatsApp dentro da requisição, nem `$transaction` neste módulo.
- Não mandar mensagem para cliente nem para lista fria. Só equipe configurada.
- Não remover campo do schema; não mudar o contrato do `/api/ia-consulta/v1` (este plano não o toca).
- Não mexer no fechamento/trava do Caixa (Dia 3) nem nos fluxos de NF-e/devolução que moram na mesma tela.
- Não prometer marca d'água na câmera nativa.

---

## 11. Critérios de aceite (QA e revisor)

**Motorista (375px, depois iPad)**
1. Tocar num quadrinho com foto abre o visualizador. Contador "Frente · 1 de 8". Setas/arrasto trocam de foto. Pinça amplia e arrastar move; toque duplo alterna zoom. O botão voltar do Android fecha o visualizador sem sair do app.
2. Parecer mostra título e "o que fazer". Foto "Refazer" também abre o visualizador, e "Tirar de novo" abre a câmera no mesmo toque (iOS incluído).
3. PERGUNTA: Sim/Não chamam o `/responder`; o quadrinho muda de "?" para ✓ (Sim) ou fica registrado (Não). O aviso na hora é disparado no NÃO (conferir no `bot_whatsapp_envios`).
4. "Tá certo assim" aparece só em ATENCAO/REFAZER no modo TESTE; a foto vira "aceita", o contador "Faltam N" diminui, e `avaliar` não lista esse problema. REPROVA nunca mostra o botão. "Desfazer" volta ao estado anterior. Em modo TRAVA, o servidor recusa.
5. Blocos Fora, Painel, Capô, Carga na ordem, com a dica do grupo; aviso de capô sem bloqueio, nos dois casos (faltando fora / fora completo); "Feche o capô" ao sair.
6. "Tire assim" mostra o desenho certo por ângulo (vareta muda conforme o veículo), com e sem foto modelo.
7. KM: com leitura do painel, o cartão "Painel marca X. Confirma?"; confirmar grava `kmOrigem=PAINEL_CONFIRMADO` e o diário abre com esse KM. Sem leitura (ou lido menor que o último KM final), aparece o campo de digitação. O fluxo antigo (modo DESLIGADO com as caixinhas) continua idêntico.
8. Água/óleo: depois da resposta, oferta de foto extra; subir, trocar e pular funcionam; a foto principal e o veredito não mudam; `fotosEnviadas` não conta o complemento.
9. Erros: sem sinal no envio do complemento, resposta `/responder` com 5xx, `aceitar` com 400, arquivo de foto 404. Em todos, mensagem clara e tela utilizável, sem travar o dia.
10. Estados dos quadrinhos em uma palavra; câmera só no vazio. Sem scroll horizontal; alvos de toque de 44px.

**Escritório (desktop e mobile)**
11. Ficha > Checklists: o mesmo visualizador, com teclado (←, →, Esc, +/-/0), roda do mouse e parecer ao lado. Mostra discordâncias, respostas, KM origem. Fotos modelo abrem no visualizador.
12. Caixa: selo no card do veículo (ok / atenção / reprovado / "· seguiu" / em andamento / sem checklist); caixa antigo (antes de 20/10) **sem** "Sem checklist"; o clique no selo não abre a ficha duas vezes; clicar no veículo abre a ficha já na aba Checklists, com o checklist do dia no topo. Usuário só com permissão de Caixa vê a aba e a lista. Usuário sem nenhuma das permissões não vê.
13. Veículos em ≥1024px: duas colunas, busca, filtro de tipo e "só ativos" lembrados (reabrir a tela mantém), coluna "Hoje" com selo, ficha à direita sem drawer, grade de 4 a 6 colunas, troca de veículo sem vazar estado de edição. Abaixo de 1024px: cards e drawer como hoje, com o selo.
14. Cadastro: os 4 campos novos salvam, voltam na ficha e chegam ao prompt da IA (conferir pelo log/payload de uma foto de teste). Tipo de vareta inválido e texto maior que 500 retornam erro claro.
15. Configurações > Gerais: card visível só para admin. Salvar destinatários e horas. "Enviar teste" chega ao próprio admin. O botão de modo alterna TESTE/DESLIGADO e o motorista passa a ver as caixinhas na hora. Banner "Ninguém recebe" quando as listas estão vazias.
16. WhatsApp: "Seguiu mesmo assim" REPROVADO manda UMA mensagem por destinatário; repetir a decisão não duplica (`DUPLICADO`). Resumo das 7h e das 13h: sai uma vez mesmo reiniciando o servidor (simular reiniciar o worker, e a chave `checklist_avisos_resumo_*` com `OK`); com uma chave `ENVIANDO` velha, reenvia sem duplicar. Texto abaixo de 2000 caracteres com muitos itens.
17. Permissões: usuário comum recebe 403 em `config/avisos`; o front não mostra o card.
18. Regressões: criar rascunho, enviar foto, pular, avaliar, decisão e iniciar dia seguem como antes. Caixa de vendedor HOME_OFFICE intacto. `GET /veiculos`, `/admin/todos` e `/ficha` seguem respondendo.
19. Produção, depois do deploy: o `/admin-exec/ping` com `deployMarker` novo; o fluxo completo de um motorista de teste (uma foto, um aceite, um complemento); abrir a foto depois do deploy seguinte.
20. Revisor: grep em TODO o repositório (inclusive imports dinâmicos) por consumidores de `fotos` do checklist (`ChecklistFotos`, `ChecklistsVeiculoLista`, `FotosModeloVeiculo`, `FormVeiculoPresencial`, `DiarioGateway`, `DiarioPegarVeiculo`, `diarioService`, `caixa.js`); `node --check`; `npx prisma validate`; `npm run build`; nenhum `<select>` novo; nenhum `await` de WhatsApp na rota; `git diff --cached` do `schema.prisma` sem o model do Como Fazer.

---

## 12. Porte e estimativa

**Porte: grande.** Mexe em tela crítica (Caixa), em WhatsApp, em schema e em permissões.

| Dev | Estimativa | Observação |
|---|---|---|
| dev-backend | ~12 h (1,5 dia) | schema + veículo 1 h; aceitar/complemento/`fotosPrincipais`/avaliar 3 h; avisos + worker + testar 3,5 h; caixa + hoje + permissões + lista de rascunho 2 h; contexto da IA 1 h; curl, manuais e marker 1,5 h |
| dev-frontend B (motorista) | ~13 h (1,5 a 2 dias) | visualizador 5 h; blocos, estados, perguntas, aceitar, complemento 4 h; desenhos e Tire assim 2 h; KM 1,5 h; teste mobile 0,5 h |
| dev-frontend C (escritório) | ~11 h (1,5 dia) | selo + Caixa + ficha 3 h; mestre-detalhe 3,5 h; 4 campos + config card 3 h; novidade 1,5 h |

**Divisão recomendada: dois devs-frontend em paralelo com um dev-backend.**
1. Primeiro o dev-backend termina o que não colide com a Parte A (schema, veículo, avisos, caixa) e, quando a Parte A fechar, as edições do service e das rotas.
2. O dev B entrega o `VisualizadorFotos` primeiro; o C começa por selo, Caixa, ficha e mestre-detalhe, que não dependem dele, e integra o visualizador ao final.
3. QA e revisor em paralelo no fim; depois, `gerente-entrega`.
4. Os dois frontends compartilham só a API do `VisualizadorFotos` e `utils/checklistFotos.js`. Combinar a API de `Slide` (seção 7.1) antes de começar evita retrabalho.

**Decisões que o gerente deve confirmar com o dono antes da implementação:** (a) interpretação de "ainda sem checklist" (seção 1, item 2); (b) mestre-detalhe a partir de 1024px; (c) foto extra de água/óleo é opcional; (d) quem entra nas listas de aviso no primeiro dia.

Arquivos de referência lidos: `docs/propostas/proposta-checklist-dia2.html`, `docs/checklist-veiculo/PLANO-dia1.md`, `backend/services/checklistVeiculoService.js`, `backend/routes/checklistsVeiculo.js`, `backend/routes/veiculos.js`, `backend/routes/caixa.js`, `backend/services/backupService.js`, `backend/services/webhookService.js`, `backend/workers/scheduler.js`, `frontend/src/components/Diario/ChecklistFotos.jsx`, `frontend/src/pages/Veiculos/VeiculoFicha.jsx`, `frontend/src/pages/Veiculos/Veiculos.jsx`, `frontend/src/pages/Caixa/CaixaDiarioPage.jsx`, `frontend/src/pages/Estoque/PainelEstoque.jsx`.