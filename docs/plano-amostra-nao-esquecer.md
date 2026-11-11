# Plano: "Amostra que ninguém esquece" (4 telas)

Proposta aprovada: `docs/proposta-amostra-nao-esquecer.html`. Decisões do dono: fazer as 4 telas; imprimir a etiqueta avança SOLICITADA→PREPARACAO; aviso no WhatsApp NÃO entra agora (nada de bot/Z-API neste trabalho).
Porte: **média/grande** (mexe na rota de escrita do mapa, `aplicar-divisao`) -> equipe completa: dev-backend + dev-frontend em paralelo -> qa-testador + revisor-codigo -> gerente-entrega.

---

## 1. Entendimento

Hoje a amostra nasce SOLICITADA e só vira visível para a expedição quando alguém, dentro de Pedidos -> Amostras, clica "Avançar status" duas vezes até LIBERADO. Ninguém grita. A proposta faz a amostra aparecer sozinha em 4 lugares (Cargas, Mapa, Central de Pendências, Pedidos->Amostras), com cor de urgência pela data de entrega, e sair de lá ao entrar numa carga. Sem tela nova, sem permissão nova.

Interpretações adotadas (o dono não detalhou):
- **"Amostra aberta sem carga"** = `status IN (SOLICITADA, PREPARACAO, LIBERADO)` AND `embarqueId IS NULL`. ENTREGUE e CANCELADA ficam fora sempre.
- **"Embarcar" na faixa**: o `AdicionarPedidosModal` é amarrado a uma carga (`embarqueId` é prop obrigatória; só lista LIBERADO). Caminho mais simples: botão abre um seletor curto "Em qual carga?" (novo componente pequeno), e a gravação reaproveita `POST /api/embarques/:id/amostras` com um parâmetro novo `liberar:true`. Não se mexe no `AdicionarPedidosModal`.
- **Confirmação no mapa**: o mapa trabalha em rascunho (nada grava até "Confirmar"). A pergunta "Essa amostra ainda não foi liberada. Liberar e embarcar?" será feita no portão do Confirmar (mesmo padrão do `cobrancasApagadas`/`confirmandoApagar`), não a cada arrasto. No arrasto só aparece um aviso curto (toast) e o pino fica marcado. DECISÃO PARA O GERENTE CONFIRMAR COM O DONO se ele quer a pergunta no arrasto.

---

## 2. Mapa do código atual (lido de verdade)

Backend
- `backend/prisma/schema.prisma:2334` model Amostra (`status` String, `embarqueId`, `dataEntrega DateTime?`, `@@index([status])`, `@@index([embarqueId])`). **Sem mudança de schema.**
- `backend/routes/amostraRoutes.js` (montado em `backend/index.js:214` com `authMiddleware`): `POST /`, `GET /`, `GET /:id`, `PATCH /:id/status`, `POST /:id/enviar-whatsapp`, `DELETE /:id`. **`GET /:id` captura qualquer path de 1 segmento: rotas novas GET têm de ficar ANTES dele.**
- `backend/controllers/amostraController.js`: `listar` (visibilidade: vê tudo se `admin` ou `permissoes.pedidos.clientes === 'todos'`, senão só `solicitadoPorId = req.user.id`); `atualizarStatus` (**sem nenhuma checagem de permissão e aceita qualquer status válido, inclusive regredir ENTREGUE->LIBERADO** - falha pré-existente, NÃO mexer no PATCH para não quebrar a tela atual; as telas novas usam endpoints novos e seguros).
- `backend/services/amostraService.js`: `listar` (include sem `embarque`; `embarqueId` e `dataEntrega` já saem como escalares), `atualizarStatus` (dispara `gcal.disparar(gcal.sincronizarAmostra)`), `listarDisponiveis` (LIBERADO + sem carga).
- `backend/routes/embarques.js`: `checkAcessoEmbarque` (admin || `Pode_Acessar_Embarque`, lê do banco) linha 7; `GET /` linha 85 **já devolve `_count: { pedidos, amostras }`** (linha 102); `GET /amostras-disponiveis` linha 116; `GET /:id` linha 196 (rotas novas GET têm de ficar antes); `POST /:id/amostras` linha 519 (valida LIBERADO + sem carga, `updateMany` sem guarda de corrida, `registrarVersaoEmbarque` best-effort); `DELETE /:id/amostras/:amostraId` linha 578 (volta `embarqueId` para null, mantém LIBERADO -> reaparece na faixa).
- `backend/routes/embarquesMapa.js`: `AMOSTRA_STATUS_MOVIVEL='LIBERADO'` (72); `SELECT_AMOSTRA_MAPA` (113); `montarAmostra` (171; `travado: status !== LIBERADO`); `carregarItens` (255; consulta amostras em 283; usado por `GET /mapa` linha ~526 **e** por `POST /sugerir-divisao` linha ~599); `POST /estimar-rotas` carrega amostra por id (1008, só `montarAmostra`); `POST /aplicar-divisao` (~1120-1590): `normalizar` (1133), `motivoBloqueioAmostra` (1240), `motivoSituacao` (1250), pré-checagem (1362), transação com `updateMany` guardado por `status: MOVIVEL` (1545), versão/log depois da transação.
- `backend/services/pendenciasService.js`: `DEFINICOES` (570), `TITULOS` (582), `ROTAS_VER_TODOS` (595), `listarPendencias` (610; `total` soma `contador` de todo bloco automaticamente; `vencidas`/`avisos` são somas explícitas por chave). Helper de hoje-BR `agoraBrasil()` (linha 38) e `backend/utils/dataReferenciaBrasilia.js` (`getDataReferencia()` devolve 'YYYY-MM-DD' de Brasília). `backend/routes/pendenciasRoutes.js`: permissão `admin || Pode_Acessar_Financeiro_Gerencial || Pode_Ver_Pendencias`.
- `backend/services/googleCalendarService.js:62` `ymd()` = `toISOString().slice(0,10)`: **convenção do projeto: `dataEntrega` é guardada como meia-noite UTC do dia escolhido** (front manda 'YYYY-MM-DD' -> `new Date('YYYY-MM-DD')`, `ModalAmostra.jsx:83` + `amostraService.criar`).

Frontend
- `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx` (206 linhas): `embarqueService.listar({})` (todas as cargas), tabela desktop (coluna "Qtd. NF / Pedidos" mostra só `_count.pedidos`, linha 109) e cards mobile (linha 148 "N pedidos"), `DetalhesCargaModal`, `NovaCargaModal`. Rota protegida por `Pode_Acessar_Embarque` (`App.jsx:995`).
- `frontend/src/pages/Admin/Embarques/AdicionarPedidosModal.jsx` (props `embarqueId, onClose, onSuccess`; busca `listarAmostrasDisponiveis`; grava via `embarqueService.inserirAmostras`). Usado só por `DetalhesCargaModal` (confirmar com grep antes de mexer; este plano NÃO o altera).
- `frontend/src/services/embarqueService.js` (`inserirAmostras(id, amostrasIds)` linha 31), `frontend/src/services/amostraService.js`, `frontend/src/services/pendenciasService.js` (`executarAcao` aceita `endpoint`, `metodo`, `body`).
- `frontend/src/pages/Admin/Embarques/MapaExpedicao.jsx` (2222 linhas): `normalizarItem` (144; amostra = `raw.amostraId`), `mover` (606; bloqueia `item.travado`), `confirmar`/`aplicar` (888-905; monta `atribuicoes`/`esperado`), tratamento de 409 com `conflitos`, pinos (≈1080-1117: `todosTravados` -> cadeado + opacidade), `selMoviveis`/`selTravados` (1370).
- `frontend/src/pages/Pendencias/PainelPendencias.jsx`: `rotaDoItem` (linha 49), `LinhaPendencia` mostra **ou** `acao` **ou** "Abrir" (nunca os dois), blocos ordenados por `severidade` do bloco, vazio some.
- `frontend/src/pages/Pedidos/ListaPedidos.jsx`: abas `useState` + localStorage `pedidos_aba_ativa` (134); efeito de query string (157-163) **só aceita `['pedidos','especiais','bonificacao']` e só roda com `soEmAtraso=1`** -> `aba=amostras` hoje NÃO funciona; `carregar` da aba amostras (324-335) usa período + busca; `handleAvancarAmostra` (720); botão da sub-aba Amostras (1004-1010); card da amostra (1215-1345; data mostrada com `new Date(dataEntrega).toLocaleDateString('pt-BR')` linha 1257 **= bug de fuso: meia-noite UTC mostra o dia anterior no Brasil**); `EtiquetaAmostraModal` aberto em 2271.
- `frontend/src/pages/Pedidos/EtiquetaAmostraModal.jsx` -> `ImprimirDireto` (`frontend/src/pages/PCP/ImprimirDireto.jsx`: props sem callback de "imprimiu"; navegador chama `onNavegador`, Zebra passa por `useEnvioBitmap` fases `fila/imprimindo/saiu`).
- Manuais: slugs `pedidos`, `embarque`, `embarques-mapa`, `pendencias` em `backend/manuais/abas/` (a tabela `ABAS` de `copilotoService.js` já tem os 4; **não precisa mudar rota/permissão**).

Outros consumidores de amostra por status (grepados; NÃO mudam de comportamento): `routes/entregas.js:331` (LIBERADO na carga), `dashboards.js:990`, `adminDashboard.js:910`, `caixa.js`, `conferenciaCargaService.js`, `googleCalendarService.js` (agenda "Produção" já mostra SOLICITADA/PREPARACAO/LIBERADO).

---

## 3. Régua de urgência e data (ÚNICA, no backend)

Criar em `amostraService.js` (exportado) dois helpers puros e usá-los em TODOS os blocos novos (faixa, mapa, pendências, resumo da sub-aba), para o front nunca recalcular fuso:

```
diaEntrega(dataEntrega) -> 'YYYY-MM-DD' | null     // dataEntrega.toISOString().slice(0,10)  (convenção meia-noite UTC)
urgencia(dataEntrega, hojeBr) -> 'vermelho' | 'ambar' | 'cinza'
   sem data            -> 'cinza'
   dia <= hojeBr       -> 'vermelho'   (hoje ou atrasada)
   dia == hojeBr + 1   -> 'ambar'      (amanhã)
   resto               -> 'cinza'
```
`hojeBr` = `getDataReferencia()` de `backend/utils/dataReferenciaBrasilia.js` (já testado, fuso America/Sao_Paulo). "Amanhã" = `hojeBr` + 1 dia calculado em string via `new Date(hojeBr + 'T12:00:00Z')` + 1 dia -> slice(0,10) (nunca somar em ms ao Date local).
No front, exibir a data SEMPRE por fatiamento da string do dia (`'2026-11-11'` -> `11/11`), jamais `new Date(x).toLocaleDateString()` para `dataEntrega`. Corrigir o card da sub-aba (linha 1257) nesta mesma passada (só exibição, usando o campo novo `dataEntregaDia`/ou slice do ISO).

---

## 4. Contratos (todos ADITIVOS; nenhum campo existente é removido/renomeado)

### 4.1 `GET /api/embarques/amostras-abertas`  (NOVO) - alimenta a faixa
Auth: `verificarAuth + checkAcessoEmbarque` (espelha a rota do front `Pode_Acessar_Embarque`). Declarar ANTES de `router.get('/:id')` (junto de `/amostras-disponiveis`).
Query: nenhuma. Filtro fixo: `status IN (SOLICITADA,PREPARACAO,LIBERADO) AND embarqueId IS NULL`. Ordem: vermelho -> âmbar -> cinza; dentro, `dataEntrega` asc (sem data por último), depois `numero` asc.
Resposta 200:
```json
{
  "hoje": "2026-11-11",
  "total": 3,
  "vermelhas": 1,
  "amostras": [{
    "id": "uuid", "numero": 58, "etiqueta": "AM#58",
    "status": "SOLICITADA",
    "dataEntregaDia": "2026-11-11",        // null quando sem data
    "urgencia": "vermelho",                // vermelho | ambar | cinza
    "tipoDestino": "cliente",              // cliente | lead
    "destinatario": "Padaria Pão Quente",  // NomeFantasia||Nome||lead.nomeEstabelecimento
    "cidade": "Blumenau",                  // cliente.End_Cidade || lead.cidade || null
    "vendedor": "João",
    "qtdItens": 3,
    "criadaEm": "ISO"
  }]
}
```
Erros: 403 (sem permissão), 500 `{error}`.

### 4.2 `POST /api/amostras/:id/liberar`  (NOVO) - vai direto a LIBERADO
Auth: `authMiddleware` do mount + checagem no controller: `admin || Pode_Acessar_Embarque || Pode_Ver_Pendencias || Pode_Acessar_Financeiro_Gerencial` (é exatamente quem enxerga o botão: Cargas e Central). Usa `req.user.permissoes` (padrão de `excluir`).
Idempotente: `updateMany({ where:{ id, status:{ in:['SOLICITADA','PREPARACAO'] } }, data:{ status:'LIBERADO' } })`.
- 200 `{ ok:true, status:'LIBERADO', jaEstava:false }` (mudou) / `{ ok:true, status:'LIBERADO', jaEstava:true }` (já era LIBERADO; clique duplo é inofensivo).
- 409 `{ error:'Amostra já entregue/cancelada - não dá para liberar.' }` se ENTREGUE ou CANCELADA. 404 se não existe. 403 sem permissão.
Depois do update (fora de transação, não bloqueia): `gcal.disparar(gcal.sincronizarAmostra, id)`.
O PATCH `/:id/status` fica intocado.

### 4.3 `POST /api/amostras/:id/etiqueta-impressa`  (NOVO) - SOLICITADA -> PREPARACAO
Auth: só `authMiddleware` (mesmo nível do PATCH que a tela de Pedidos já usa; quem vê a aba imprime).
`updateMany({ where:{ id, status:'SOLICITADA' }, data:{ status:'PREPARACAO' } })` - **condicional**: nunca regride PREPARACAO/LIBERADO/ENTREGUE.
200 `{ ok:true, status:'<status atual>', avancou:true|false }` (relê o status quando `avancou:false`). gcal sync só se avançou. 404 se não existe.

### 4.4 `GET /api/amostras/resumo-abertas`  (NOVO) - contador da sub-aba
Auth: `authMiddleware`; visibilidade IGUAL a `amostraController.listar` (vendedor sem `pedidos.clientes==='todos'` e sem admin só conta as suas: `solicitadoPorId = req.user.id`). Declarar ANTES de `router.get('/:id')`.
200 `{ hoje:'2026-11-11', semCarga: 3, vermelhas: 1, ids: ["..."] }` (`ids` = amostras abertas sem carga que o usuário enxerga, até 200; serve para o card saber quem está "sem carga" mesmo fora do filtro de período).

### 4.5 `GET /api/amostras`  (ALTERADO, só aditivo)
- Include novo no `listar` do service: `embarque: { select: { id:true, numero:true } }` (resposta ganha `embarque` = `{id,numero}|null`; `embarqueId` já vinha).
- Query nova opcional `semCarga=1` -> `where.embarqueId = null AND status IN (SOLICITADA,PREPARACAO,LIBERADO)`; **combina com a visibilidade do controller** e **ignora período** quando o front não manda `dataEntregaDe/Ate` (o front não manda com esse filtro ligado).
- Campo calculado novo em cada item: `dataEntregaDia` ('YYYY-MM-DD'|null) e `urgencia` (régua da seção 3, só preenchido para abertas sem carga; senão `null`). Front usa estes campos e não recalcula.

### 4.6 `POST /api/embarques/:id/amostras`  (ALTERADO, só aditivo)
Body continua `{ amostrasIds }`; novo opcional `liberar:true`.
- Sem `liberar` = comportamento atual idêntico (só LIBERADO + sem carga).
- Com `liberar:true`: aceita SOLICITADA/PREPARACAO/LIBERADO sem carga; grava `{ embarqueId, status:'LIBERADO', ...RESET_CONFERENCIA }` num único `updateMany` guardado (`where: { id in ..., embarqueId:null, status in [...] }`); se `count !== amostrasIds.length` -> 409 `{ error:'Uma ou mais amostras mudaram (já embarcadas, entregues ou canceladas). Atualize a tela.' }` e NADA fica pela metade (um updateMany é atômico). `registrarVersaoEmbarque` continua best-effort; acrescentar em `alteracoes.amostras[]` o campo `liberadaAgora:true` quando o status mudou (campo extra no JSON do log, histórico antigo não quebra). gcal sync (fora da transação) para as que mudaram de status.
- Resposta: `{ message }` + novo `liberadas: <n>`.

### 4.7 Mapa
`GET /api/embarques/mapa` - cada item de `amostras[]` ganha (aditivo): `dataEntregaDia`, `urgencia`, `naoLiberada` (bool: status SOLICITADA|PREPARACAO). Campos existentes (`statusAmostra`, `travado`, `etiqueta`, `gps`, ...) mantêm nome e tipo. Mudança de VALOR controlada: para amostra `naoLiberada` e `embarqueId == null`, `travado` = `false` (hoje seria true); ENTREGUE/CANCELADA continuam `travado:true`. Amostra `naoLiberada` DENTRO de carga (não deveria existir) continua travada.
`carregarItens(embarqueIds, periodoEntrega, { incluirNaoLiberadas })`: novo 3º parâmetro, default `false`. SÓ `GET /mapa` passa `true` (acrescenta `{ status:{ in:['SOLICITADA','PREPARACAO'] }, embarqueId:null }` ao OR). `POST /sugerir-divisao` continua com `false` (a sugestão automática NUNCA distribui amostra não liberada).
`POST /api/embarques/aplicar-divisao`: em cada atribuição `tipo:'amostra'` aceita `liberar:true` (opcional). `normalizar` passa a carregar `liberar` (hoje descarta tudo menos tipo/id/carga). Regras:
- `motivoBloqueioAmostra(a, liberar, destino)`: LIBERADO -> ok; SOLICITADA/PREPARACAO -> ok **somente se** `liberar===true` e destino != null; senão a mensagem atual ("amostra não está liberada (status X)"); ENTREGUE/CANCELADA -> bloqueia como hoje. A função hoje só recebe o registro e é chamada em 3 lugares (`motivoSituacao` na pré-checagem, na transação e em `conflito()`): passar a flag via mapa `liberarPorChave` para os 3 usarem a mesma regra.
- Escrita (transação, linha ~1545): `where: { ...whereGuard, status: liberar ? { in:['LIBERADO','SOLICITADA','PREPARACAO'] } : 'LIBERADO' }`, `data: { embarqueId, ...(liberar ? { status:'LIBERADO' } : {}), ...RESET_CONFERENCIA }`.
- `$transaction` já tem `{ timeout: 20000, maxWait: 10000 }`: manter. Log/versão/gcal depois, fora da transação, em try/catch. Acrescentar `liberadas:n` no `alteracoesPorCarga` (opcional) e `gcal.disparar` das amostras liberadas.
- Compat: cliente antigo (sem `liberar`) recebe o mesmo 409/400 de hoje para amostra não liberada; formato antigo `{pedidoId,...}` intacto.

### 4.8 Central de Pendências
Bloco novo em `GET /api/pendencias` (aditivo; blocos existentes idênticos):
```json
{ "chave":"amostras_sem_carga", "titulo":"Amostras sem carga", "severidade":"vermelho|ambar|cinza",
  "contador": 3, "valorTotal": null,
  "itens":[{
    "id":"uuid", "titulo":"AM#58 · Padaria Pão Quente", "subtitulo":"Entrega hoje · Solicitada · vend. João",
    "dataRef":"2026-11-11T12:00:00-03:00",      // meio-dia de Brasília (padrão do bloco veiculos) para o front não voltar um dia
    "severidade":"vermelho",                     // NOVO campo opcional por item (demais blocos não têm)
    "rota":"/pedidos?aba=amostras&semCarga=1&amostra=<id>",
    "rotaAbrir":"/pedidos?aba=amostras&semCarga=1&amostra=<id>",   // NOVO: botão "Abrir" ao lado da ação
    "acao":{ "tipo":"liberar_amostra","label":"Liberar","endpoint":"/api/amostras/<id>/liberar","metodo":"POST" }  // ausente quando status já é LIBERADO
  }],
  "rotaVerTodos":"/pedidos?aba=amostras&semCarga=1" }
```
- Severidade do bloco = a pior entre TODAS as amostras abertas sem carga (não só as 5 do limite): vermelho se alguma `urgencia=vermelho`, senão âmbar se alguma amanhã, senão cinza. Itens ordenados vermelho->âmbar->cinza, depois data.
- `total` já soma `contador` sozinho. `vencidas` += quantidade vermelha; `avisos` += as demais (decisão: amostra atrasada é "prazo estourado"; o gerente pode trocar). Registrar em `TITULOS` e `ROTAS_VER_TODOS` (fallback de erro do bloco). Bloco com try/catch próprio (já é o padrão).
- Só leitura, sem `$transaction`.
- Atualizar `backend/docs/pendencias-api.md` NO MESMO COMMIT: bloco novo (de 10 para 11 blocos), campos `itens[].severidade` e `itens[].rotaAbrir`, a regra de urgência, a ação `liberar_amostra`. Atenção: o doc diz "9 blocos" no título e já está defasado (há 10 em `DEFINICOES`): corrigir a contagem.

### 4.9 Contrato da IA `/api/ia-consulta/v1`
Nenhuma rota/serviço usado por `iaConsultaRoutes.js` é alterado (grep `ia-consulta` x `amostra` antes de começar para confirmar; `amostraService.listar/listarDisponiveis` não são usados por lá, mas o dev confirma com grep). Se der qualquer hit, o campo novo é só aditivo e o doc `backend/docs/ia-consulta-api.md` entra no commit.

---

## 5. Plano de execução

### Backend (dev-backend) - ordem
1. `backend/services/amostraService.js`: helpers `diaEntrega`, `urgencia` (exportados); `listarAbertasSemCarga({ visibilidade })` (select enxuto para faixa/pendências/resumo); `liberar(id)` e `marcarEtiquetaImpressa(id)` com `updateMany` condicional + `gcal.disparar` fora; `listar` ganha include `embarque{id,numero}`, filtro `semCarga`, campos `dataEntregaDia`/`urgencia`.
2. `backend/controllers/amostraController.js` + `backend/routes/amostraRoutes.js`: `GET /resumo-abertas` (antes de `/:id`), `POST /:id/liberar`, `POST /:id/etiqueta-impressa`; `listar` repassa `semCarga`. Permissão do `liberar` conforme 4.2. Não tocar `atualizarStatus`.
3. `backend/routes/embarques.js`: `GET /amostras-abertas` (antes de `/:id`); `POST /:id/amostras` com `liberar` (4.6). Boy-scout: este arquivo não usa `$transaction` com callback; conferir `grep -n '\$transaction' backend/routes/embarques.js` e ajustar as que existirem sem `{timeout:20000,maxWait:10000}`.
4. `backend/routes/embarquesMapa.js`: `montarAmostra` (campos novos + `travado`), `carregarItens` (3º parâmetro; só `/mapa` liga), `normalizar`/`motivoBloqueioAmostra`/`updateMany` do `aplicar-divisao` (4.7). Boy-scout da `$transaction` vizinha: já está com timeout 20000/maxWait 10000; conferir as outras do arquivo.
5. `backend/services/pendenciasService.js`: `blocoAmostrasSemCarga`, registro em `DEFINICOES`/`TITULOS`/`ROTAS_VER_TODOS`, `vencidas`/`avisos`.
6. `backend/docs/pendencias-api.md` (mesmo commit). Manuais (backend/manuais/abas): `pedidos.md`, `embarque.md`, `embarques-mapa.md` (hoje diz "Amostra solicitada/em preparação não aparece" e "Amostras liberadas sem carga aparecem sempre": reescrever) e `pendencias.md`. Atualizar `README.md` do índice só se a descrição de alguma linha mudar. `copilotoService.js` não muda.
7. Testar com curl (liberar 200/idempotente/409; etiqueta-impressa não regride; amostras-abertas 200/403; aplicar-divisao com e sem `liberar`; pendencias bloco; `GET /mapa` com campos antigos presentes) e mostrar a saída.

### Frontend (dev-frontend) - pode começar já, contratos acima
1. Services: `embarqueService.listarAmostrasAbertas()`, `inserirAmostras(id, ids, { liberar })`; `amostraService.liberar(id)`, `marcarEtiquetaImpressa(id)`, `resumoAbertas()`.
2. **Tela 1 - `PainelEmbarque.jsx`** + novos `AmostrasForaDeCarga.jsx` (faixa) e `EmbarcarAmostraModal.jsx` (seletor de carga) em `pages/Admin/Embarques/`:
   - Faixa âmbar no topo (acima da tabela), só renderiza se `total>0`; cabeçalho com contador e, se `vermelhas>0`, chip vermelho "N para hoje/atrasadas". Linha: borda esquerda pela `urgencia` (vermelho/âmbar/cinza), `AM#`, destinatário (+ selo "Lead" quando `tipoDestino==='lead'`), cidade, "entrega HOJE 11/11" / "amanhã 12/11" / "14/11" / "sem data" (a partir de `dataEntregaDia`), vendedor, badge de status (cores do sistema: Solicitada azul, Preparação amarelo, Liberado esmeralda - mesmas de `statusAmostraCores` da ListaPedidos).
   - Botões em pílula: Etiqueta (abre `EtiquetaAmostraModal` - precisa buscar a amostra: o modal já faz `buscarPorId`, basta passar `{id, numero, ...}`; passar `onStatus` para atualizar o status da linha), Liberar (some se LIBERADO; `amostraService.liberar`; atualiza a linha sem recarregar tudo), Embarcar.
   - Embarcar: `EmbarcarAmostraModal` usa as cargas já carregadas em `embarques` (filtrar `dataSaida` do dia >= hoje; o front pega "hoje" com `dataLocalHoje()` de `utils/dataLocal.js`), `SelectBusca` com a carga pré-selecionada = a do dia de `dataEntregaDia`, senão a mais próxima; sem carga futura: mensagem + botão "Montar Nova Carga" (abre `NovaCargaModal`). Confirmar -> `inserirAmostras(cargaId,[id],{liberar:true})`; sucesso: toast, recarrega faixa e lista de cargas. Se a amostra não está LIBERADA, o texto do botão diz "Liberar e embarcar".
   - Lista de cargas: coluna/cartão "Pedidos" passa a mostrar `N` e, se `_count.amostras>0`, "· M amostras" (desktop linha 109; mobile linha 148). `_count.amostras` já vem de `GET /api/embarques` - **não precisa de mudança de backend**.
   - Mobile: faixa em cards empilhados (`md:hidden` / tabela compacta `hidden md:block` não é necessária: lista de cards serve nos dois), botões `min-h-[44px]`, sem scroll horizontal. Pode colapsar (recolher) com o estado em `useFiltroSalvo('embarques:faixaAmostrasAberta', true)`.
   - `AdicionarPedidosModal` NÃO muda.
3. **Tela 2 - `MapaExpedicao.jsx`**:
   - `normalizarItem` já passa os campos novos (spread). Pino da amostra `naoLiberada`: contorno tracejado + nota "falta preparar" no popup/lista lateral (CSS inline do `divIcon` existente; sem animar box-shadow). `travado` agora vem `false` para ela, então `mover`/arrasto/"Mover para..." já funcionam sem mudar.
   - Se o rascunho move uma amostra `naoLiberada` para uma carga: toast curto no arrasto ("AM#N ainda não foi liberada - será liberada ao confirmar") e no `confirmar()` um portão novo (estado `confirmandoLiberar`, mesmo padrão do `confirmandoApagar`): "Essa amostra ainda não foi liberada. Liberar e embarcar?" listando as AM#; Cancelar volta ao rascunho sem aplicar nada.
   - `aplicar()`: nas atribuições de amostra com `naoLiberada` e destino != null, enviar `liberar:true`. Resto do payload igual.
   - Itens na lista lateral/seleção: manter o cadeado só para `travado`. Contadores de carga ("14 pedidos · 2 amostras") continuam vindo de `qtdAmostras` (só amostras LIBERADAS/ENTREGUES penduradas - não muda).
   - A "Sugerir divisão" não vai mexer na amostra `naoLiberada` (backend exclui); no rascunho ela fica onde está.
4. **Tela 3 - `PainelPendencias.jsx`**: `LinhaPendencia` renderiza **ação e "Abrir" juntos** quando o item traz `rotaAbrir` (hoje é um ou outro); borda/cor do item pela `item.severidade` quando existir (usar `SEVERIDADE_ESTILO`); `rotaDoItem` usa `item.rotaAbrir || ...`. Manter o comportamento dos outros blocos. Mobile: botões quebram para a linha de baixo se faltar largura (`flex-wrap`).
5. **Tela 4 - `ListaPedidos.jsx` + `EtiquetaAmostraModal.jsx` + `ImprimirDireto.jsx`**:
   - Query string: novo efeito que aceita `aba=amostras`, `semCarga=1`, `amostra=<id>` (sem exigir `soEmAtraso`), seta `abaAtiva='amostras'`, liga o filtro "Sem carga", define destaque/expansão (`expandedAmostra` + `id="amostra-row-<id>"` + scroll, igual ao `highlightId` de pedidos) e limpa a URL com `navigate(location.pathname, {replace:true})`. Incluir `'amostras'` na lista válida do efeito antigo.
   - Contador no botão da sub-aba "Amostras": chamar `amostraService.resumoAbertas()` ao montar, ao trocar de aba e após criar/excluir/embarcar; badge `bg-red-600 text-white rounded-full` se `semCarga>0` (vermelho só se `vermelhas>0`; senão âmbar). Não persistir o número.
   - Novo filtro "Só sem carga" na aba (chip, `useFiltroSalvo('lista-pedidos:amostrasSemCarga', false)`); quando ligado chama `amostraService.listar({ semCarga: 1 })` **sem período** (assim a amostra antiga esquecida aparece) e mostra um aviso "ignorando o período". `limparFiltros` desliga.
   - Card: se `urgencia==='vermelho'` (e `!embarqueId`): borda esquerda vermelha + faixa "Entrega é HOJE/ATRASADA e a amostra ainda não está em nenhuma carga" (texto pela diferença de dia; HOJE x "atrasada há N dia(s)"); se `embarque` presente: chip `Carga #N` (verde/sky); corrigir exibição da data de entrega (fatiar string, seção 3). `handleAvancarAmostra` e o resto intactos. Remover/atualizar contador local quando o card é excluído.
   - Etiqueta: `ImprimirDireto` ganha prop opcional `onImpresso()` (aditiva; os outros usos não passam e nada muda): disparar (a) no clique de "Imprimir pelo navegador" (síncrono, DEPOIS de chamar `onNavegador` para não perder o gesto do iOS - `onImpresso` só faz fetch, não imprime) e (b) quando `envio.fase` entra em `fila|imprimindo|saiu` pela 1ª vez por envio (ref de guarda). `EtiquetaAmostraModal` recebe `onStatus(novoStatus)`; no `onImpresso`, se `(completa||amostra).status === 'SOLICITADA'`, chama `amostraService.marcarEtiquetaImpressa(id)` (try/catch, falha NÃO atrapalha a impressão), e chama `onStatus(resposta.status)`; a ListaPedidos atualiza `amostras` (setAmostras) e o contador. Chamar uma só vez por abertura do modal (ref).
6. Padrões: nada de `<select>` nativo (usar `SelectBusca`); datas por `dataLocalHoje()`; filtros novos via `useFiltroSalvo`; mobile 375px; cores/tema do CLAUDE.md; `lazyComRetry` não é necessário (sem rota nova).
7. `cd frontend && npm run build` limpo ANTES de entregar.
8. Permissões (front = back): faixa/Embarcar/Liberar da Tela 1 -> a tela já exige `Pode_Acessar_Embarque` (rota e `GET amostras-abertas`); Liberar na Central -> quem vê a Central já satisfaz o `POST /liberar`. Botão Liberar não aparece em Pedidos (não está no escopo). Não usar `!!perms.pedidos` (é OBJETO; ver `memory/reference_permissoes_objeto_nao_booleano`): para "vê tudo" usar a mesma expressão do controller (`admin || pedidos.clientes==='todos'`) se o front precisar, mas aqui quem decide é o backend.

### Comunicação e entrega
- `frontend/public/novidade-amostra-sem-esquecer.html` (espelhar `novidade-tarefas.html`/`novidade-cadastro-clientes.html`: accordions abertos, mockups das 4 telas com pins numerados, meta og:title/og:description SEM og:image, sem botão "Abrir o app") + entrada no TOPO de `frontend/public/novidades.json` (`slug:"amostra-sem-esquecer"`, `data` do dia). Texto pronto para o grupo na nota de entrega.
- Manuais/Clippy: ver item 6 do backend; avisar o que foi atualizado.
- Gerente: lembrar que ainda NÃO há teste em produção possível para as partes de escrita (mapa/liberar) sem criar amostra real; combinar com o dono um teste controlado pós-deploy (liberar uma amostra de teste e voltar).

---

## 6. Riscos e efeitos colaterais

1. **Mapa - escrita (`aplicar-divisao`)** é a área mais perigosa. Pontos de ruptura: (a) `normalizar` hoje descarta qualquer campo extra - se o `liberar` não passar por ele, a confirmação "liberar e embarcar" falha com 409 enganoso; (b) `motivoBloqueioAmostra` é chamado em 3 lugares com assinaturas diferentes - esquecer um deles gera "passa na pré-checagem e estoura na transação"; (c) o guard `status: MOVIVEL` do `updateMany` precisa aceitar o conjunto novo só quando `liberar`, senão cai em `count!==1` -> 409 "alterada por outra pessoa"; (d) nunca permitir `liberar` com destino null; (e) amostra liberada por outra pessoa durante o rascunho tem que continuar OK (idempotente) e ENTREGUE/CANCELADA tem que dar 409.
2. **Mapa - leitura**: `travado:false` para amostra não liberada faz o front tratar como móvel em todo lugar (`moviveis`, "mover cliente leva tudo", "trocar rotas inteiras" 651-660). Efeito: mover o pino de um cliente que tem pedido + amostra não liberada arrasta a amostra junto e dispara o portão de liberação; isso é desejado ("mover leva tudo"), mas o QA tem que cobrir. "Trocar rotas" também levaria a amostra - e o portão cobre.
3. **`/sugerir-divisao` e `/estimar-rotas`**: `carregarItens` é compartilhado; o default do novo parâmetro TEM que ser `false`, senão a divisão automática passa a distribuir amostra não preparada e conta paradas a mais (mudaria km/duração). `estimar-rotas` carrega por id e não é afetado, mas conferir que o grupo enviado pelo front não inclui a amostra não liberada em carga que ela ainda não está.
4. **Contagem de paradas / contadores**: `qtdAmostras` das cargas continua só LIBERADO/ENTREGUE penduradas; a amostra não liberada só aparece como pino livre. Conferir que o contador do cartão e os pinos continuam batendo.
5. **Modal de embarque**: `AdicionarPedidosModal` continua listando só LIBERADO (propositalmente). Risco: operador abre a carga e não vê a amostra SOLICITADA - por isso a faixa/seletor é o caminho para embarcar não liberada. Não "consertar" a lista do modal agora.
6. **`POST /:id/amostras`**: hoje o `updateMany` não tem guarda de corrida; duas pessoas embarcando a mesma amostra em cargas diferentes gravam a última. No ramo novo (`liberar`) o guard fecha isso; o ramo antigo fica como está (não alterar comportamento atual).
7. **Fuso**: `dataEntrega` é UTC-meia-noite. Comparar `toISOString().slice(0,10)` com `getDataReferencia()` (Brasília). Nunca `new Date().setHours(0,0,0,0)` no servidor (container em UTC: entre 21h e 23h59 de Brasília aponta para o dia seguinte). No front não usar `toLocaleDateString` na `dataEntrega`.
8. **PATCH /:id/status sem permissão e sem regra de transição** (pré-existente): não é corrigido aqui (fora do escopo e quebraria a tela atual), mas foi por isso que "Liberar" e "etiqueta-impressa" são endpoints novos e condicionais. Sugerir ao dono uma tarefa separada para endurecê-lo.
9. **Visibilidade**: o contador da sub-aba e a lista têm que seguir a mesma regra do `listar` (vendedor só vê as próprias). A faixa de Cargas e a Central mostram TODAS (quem tem esses acessos é expedição/gerência). Se o dono não quiser que a expedição veja amostra de qualquer vendedor, é decisão dele - hoje o mapa já mostra todas as liberadas.
10. **Lead**: amostra de lead não tem `cliente` -> `destinatario`/`cidade` vêm de `lead.nomeEstabelecimento`/`lead.cidade`; o mapa posiciona por `lead.pontoGps` (pode ficar em "sem GPS"); não assumir `cliente` em nenhum lugar novo.
11. **ImprimirDireto é compartilhado** (produto, funcionário, caixas, etc.): a prop `onImpresso` é opcional e tem que ser no-op quando ausente; revisor confere que nenhum outro uso mudou. O disparo no navegador não pode atrasar o `print()` (síncrono no clique no iOS).
12. **Pendências**: `LinhaPendencia` hoje exibe OU ação OU Abrir; a mudança tem que manter os outros blocos idênticos (só ganha o "Abrir" quando houver `rotaAbrir`). Bloco com `severidade` dinâmica: o front já ordena por `severidade` do bloco.
13. **Google Calendar**: liberar/avançar chama `sincronizarAmostra`; sempre fora de transação e em `gcal.disparar` (best-effort).
14. **Sem schema novo**: nada de `prisma db push`/migração. Nenhum índice novo necessário (`status` e `embarqueId` já indexados).
15. **Manuais desatualizados**: `embarques-mapa.md` linhas 15 e 44 e `embarque.md` linha 19 afirmam que amostra não liberada não aparece; ficam errados se não forem reescritos.

---

## 7. O que NÃO fazer

- NÃO enviar WhatsApp/bot (decisão do dono); nada em `botWhatsappService`/`webhookService`.
- NÃO mudar `PATCH /api/amostras/:id/status` nem o botão "Avançar status" (continua existindo).
- NÃO remover/renomear campo do mapa, de `GET /api/amostras`, de `GET /api/embarques`, de `/api/pendencias`.
- NÃO fazer `/sugerir-divisao` incluir amostra não liberada.
- NÃO alterar `AMOSTRA_STATUS_NA_CARGA` nem `listarDisponiveis`/`/amostras-disponiveis` (continuam só LIBERADO).
- NÃO fazer a etiqueta regredir status (só SOLICITADA->PREPARACAO, condicional no banco).
- NÃO calcular urgência/"hoje" no front a partir de `new Date(dataEntrega)`.
- NÃO usar `<select>` nativo, `window.open`/iframe para imprimir, `React.lazy`.
- NÃO colocar log/gcal/versão de carga dentro de `$transaction`.
- NÃO persistir busca/paginação/o número do contador em filtro salvo.

---

## 8. Critérios de aceite por tela

**Tela 1 - Expedição -> Cargas**
- Existindo amostra aberta sem carga, aparece a faixa âmbar no topo com a lista; sem nenhuma, a faixa NÃO existe.
- Vermelho para entrega hoje/atrasada, âmbar amanhã, cinza resto; "sem data" para amostra sem data (cinza). Ordem vermelho->âmbar->cinza.
- Etiqueta abre a etiqueta 100x120; Liberar muda o badge para Liberado sem recarregar a página e some o botão; Embarcar leva a amostra para a carga escolhida (a partir de SOLICITADA vira LIBERADO) e ela sai da faixa; aparece em Detalhes da carga e a versão da carga sobe (histórico "Amostras adicionadas").
- Lista de cargas mostra "N pedidos · M amostras" (desktop e mobile).
- 375px: sem scroll horizontal, botões >= 44px.
- Usuário sem `Pode_Acessar_Embarque` continua sem acesso à tela (403/redirecionamento como hoje).

**Tela 2 - Mapa**
- Amostra SOLICITADA/PREPARACAO sem carga aparece como pino tracejado "falta preparar" na posição do cliente/lead; sem GPS vai para "sem GPS" como as demais.
- Arrastar para a carga + Confirmar mostra "Essa amostra ainda não foi liberada. Liberar e embarcar?"; "Sim" libera e embarca (status LIBERADO + `embarqueId`); "Cancelar" não grava nada.
- Pedido/amostra liberada/cobrança: comportamento idêntico ao de antes (regressão); amostra ENTREGUE continua com cadeado; "Sugerir divisão" não move amostra não liberada.
- 409 e 400 existentes continuam com a mensagem correta.

**Tela 3 - Central de Pendências**
- Bloco "Amostras sem carga" com contador total e severidade certa; conta no "Total de pendências"; Liberar (1 clique) muda o item (recarrega) e Abrir leva para Pedidos -> Amostras já na sub-aba, filtro "Sem carga" ligado e a amostra em destaque.
- Amostra LIBERADA aparece só com "Abrir". Bloco some quando vazio. Erro no bloco não derruba os outros. `backend/docs/pendencias-api.md` atualizado.

**Tela 4 - Pedidos -> Amostras**
- Contador vermelho/âmbar no nome da sub-aba (amostras abertas sem carga que o usuário enxerga); some quando 0.
- Card com borda vermelha + aviso quando `dataEntrega <= hoje(BR)` e sem carga; chip "Carga #N" quando embarcada; data de entrega correta (sem o dia a menos).
- Imprimir etiqueta (Zebra ou navegador) numa amostra SOLICITADA -> vira Preparação no card sem recarregar; em PREPARACAO/LIBERADO/ENTREGUE não muda o status; falha da chamada não impede a impressão.
- `/pedidos?aba=amostras&semCarga=1&amostra=<id>` abre direto na sub-aba certa.

**Geral**: `npm run build` ok; curl dos endpoints novos/alterados anexado; manuais (4) + `novidade-amostra-sem-esquecer.html` + `novidades.json` atualizados; sem campo removido em nenhuma resposta.

---

## 9. Plano de teste do QA (app local `hardt_local`, clicando na tela; nada em produção)

### Dados (criar pela UI de amostra ou script local; hoje = data de Brasília)
| Amostra | Destino | dataEntrega | Status inicial | Carga |
|---|---|---|---|---|
| A1 | cliente com GPS | HOJE | SOLICITADA | nenhuma |
| A2 | cliente com GPS | AMANHA | PREPARACAO | nenhuma |
| A3 | LEAD (com pontoGps) | daqui a 3 dias | LIBERADO | nenhuma |
| A4 | cliente | sem data | SOLICITADA | nenhuma |
| A5 | cliente | ONTEM (atrasada) | SOLICITADA | nenhuma |
| A6 | cliente | hoje | LIBERADO | embarcada numa carga de hoje |
| A7 | cliente | hoje | ENTREGUE | numa carga |
| A8 | cliente | hoje | CANCELADA | nenhuma |
Pré-requisito: 2 cargas com data de hoje (motoristas diferentes) e 1 com data de amanhã; um usuário só com `Pode_Acessar_Embarque`, um vendedor comum (só Pedidos) que criou A1, um usuário só com `Pode_Ver_Pendencias`.
Testar também perto da virada: se possível, `TZ`/relógio simulado ~22h30 de Brasília para provar que "hoje" não pula para amanhã.

### Roteiro
1. **Faixa (Cargas)**: abre com A1(vermelho), A5(vermelho), A2(âmbar), A3(cinza), A4("sem data", cinza); NÃO aparecem A6, A7, A8. Ordem correta. Badges de status certos. A3 mostra selo de lead.
2. Etiqueta pela faixa: abre; imprimir pelo navegador em A1 -> A1 vira Preparação (faixa e, depois, Pedidos); repetir em A2 (Preparação) -> continua Preparação; em A3 (Liberado) -> continua.
3. Liberar A4 -> badge Liberado, botão Liberar some; dar duplo clique rápido -> sem erro. Liberar uma amostra que acabou de ser cancelada em outra aba -> mensagem de 409 em português.
4. Embarcar A1 (SOLICITADA) na carga de hoje: seletor vem com a carga do dia pré-selecionada; confirma; A1 sai da faixa, está LIBERADO + na carga (Detalhes da carga lista A1; histórico da carga mostra "Amostras adicionadas"; versão +1). Lista de cargas mostra "· 1 amostra" a mais (desktop e celular).
5. Sem carga futura (apagar/mudar a data das cargas): Embarcar mostra o aviso e abre "Montar Nova Carga".
6. Corrida: duas abas, embarcar a mesma A2 em cargas diferentes -> a segunda recebe o erro "mudaram", nada pela metade.
7. **Mapa** (data de hoje): A2 (PREPARACAO) e A5 aparecem tracejadas "falta preparar"; A3 pino normal; A7 com cadeado; A8 não aparece. Arrastar A2 para a carga 1 -> no Confirmar, a pergunta de liberar; Cancelar = nada gravado (conferir banco/lista); Confirmar = A2 LIBERADO na carga 1, carga sobe versão. Pino com pedido + amostra não liberada do mesmo cliente: mover leva os dois e pergunta.
8. Mapa: "Sugerir divisão" NÃO move A5 nem A2 (continuam sem carga); km/duração/paradas das cargas iguais aos de antes da mudança (comparar com um print/valor anotado na versão anterior do banco local).
9. Mapa regressão: mover pedido comum, remover amostra LIBERADA da carga (volta livre), cobrança e "trocar rotas inteiras" funcionam como antes; forçar 409 (mudar a carga de um item por outra aba) -> mensagem de conflito normal; forçar 400 (pedido de Delivery) -> lista de bloqueados normal.
10. **Central de Pendências** (usuário com `Pode_Ver_Pendencias`): bloco "Amostras sem carga" com contador = amostras abertas sem carga, severidade vermelha (há A1/A5 de hoje/ontem); itens com Liberar + Abrir (LIBERADO só Abrir); Total/Vencidas coerentes; Liberar de um item atualiza; Abrir cai em Pedidos -> Amostras com "Sem carga" ligado e a amostra em destaque, mesmo a amostra sendo antiga (fora do período padrão). Sem nenhuma amostra aberta o bloco some. Derrubar o bloco (forçar erro) não derruba os outros.
11. **Pedidos -> Amostras (vendedor comum)**: contador vermelho no nome da sub-aba = só as dele sem carga; admin vê o total. A1/A5: card com borda vermelha + aviso; A2: sem aviso vermelho; A6: chip "Carga #N" e sem aviso; data de entrega exibida igual à escolhida (sem dia a menos). Chip "Só sem carga" lembra a escolha ao reabrir a tela; "limpar filtros" desliga.
12. Etiqueta pela sub-aba: SOLICITADA -> Preparação no card sem recarregar e o contador não muda; Zebra: com a impressora online/fila, o avanço acontece; falha de rede na chamada de avanço NÃO impede a impressão (simular offline).
13. **Permissões**: usuário sem `Pode_Acessar_Embarque` -> `GET /api/embarques/amostras-abertas` = 403 e a tela de Cargas não abre; usuário sem as 4 permissões -> `POST /api/amostras/:id/liberar` = 403; vendedor comum não vê amostras alheias no contador.
14. **Mobile 375px** (Cargas, Mapa lista lateral, Central, Pedidos): sem scroll horizontal, botões tocáveis, textos sem corte, seletor de carga como bottom-sheet.
15. **Regressão geral**: criar amostra nova pelo app (fluxo normal) continua; "Avançar status" continua; entregar amostra pelo motorista (`/entregas`) continua; recibo/etiqueta de outras origens (produto/caixas) imprimem igual (ImprimirDireto); `npm run build` verde; console do navegador sem erro.

### O que o revisor confere
- `grep -rn "amostra" backend/routes/iaConsultaRoutes.js backend/services/congeladosService.js` (contrato da IA intocado).
- Nenhum campo removido/renomeado em respostas; todos os campos novos opcionais.
- Todas as 3 chamadas a `motivoBloqueioAmostra`/`motivoSituacao` usam a flag; o default de `carregarItens` é `false`; `/sugerir-divisao` não passa `true`.
- Escritas novas são `updateMany` condicionais; `gcal`/log fora de `$transaction`; `$transaction` do `aplicar-divisao` mantém `{timeout:20000,maxWait:10000}`.
- Nada de `toLocaleDateString` na `dataEntrega` nos trechos novos; "hoje" no backend por `getDataReferencia`.
- Rotas GET novas declaradas antes de `/:id`.
- Permissão do front espelha o backend (Cargas = `Pode_Acessar_Embarque`; Liberar = 4 permissões).
- `ImprimirDireto` sem mudança de comportamento para os outros `origem`.
- Manuais, doc da API, novidade + `novidades.json` no mesmo conjunto.
