# Mapa de Clientes — Plano de execução (Fase 1)

**Data:** 12/09/2026 · **Autor:** arquiteto · **Porte:** GRANDE (tela nova + rota nova + toque em `clienteController.atualizar` + permissões)
**Fluxo:** dev-backend ∥ dev-frontend → qa-testador + revisor-codigo → gerente-entrega

> Todos os caminhos abaixo são relativos a `~/Projetos/CA-Hardt`. **Nunca trabalhar na pasta do Drive.**

---

## 0. Aviso de sessão paralela (LER ANTES DE EDITAR)

O working tree tem ~25 arquivos modificados de OUTRA tarefa (iaConsultaRoutes, pedidoService, schema.prisma, App.jsx, adminExec.js…). Regras:

- Desta entrega, os únicos arquivos "compartilhados" que precisam de edição são **`frontend/src/App.jsx`** (2 linhas: lazy + `<Route>`) e **`backend/index.js`** (1 linha: `app.use`). Edição **cirúrgica**, sem tocar em nada mais desses arquivos.
- **NÃO tocar em `schema.prisma`** — este plano não cria coluna nem tabela (tabela `clientes` está no teto de colunas; a config vai em `app_configs`, o histórico em `audit_logs`, que já existem).
- Commit final com **`git add` explícito** só dos arquivos listados na seção 9. Nunca `git add -A`.

---

## 1. Objetivo (entendimento do pedido)

Tela **Clientes → Mapa** (`/clientes/mapa`) que mostra todos os clientes com `Ponto_GPS` num mapa Leaflet, colore por dia de entrega / venda / categoria / vendedor / WhatsApp / cidade, lista os **vizinhos atendidos em dias diferentes** (pares a < R metros sem dia em comum) e permite **corrigir na hora** (dia de entrega, dia de venda, categoria, vendedor, WhatsApp) num painel lateral — sem sair do mapa. Sem km/OSRM/IA nesta fase.

Interpretações adotadas (onde o pedido deixava margem):
- **Filtros rodam no navegador**: uma chamada só traz todos os clientes visíveis (~1.200 linhas × ~20 campos ≈ 300 KB); filtrar/colorir/contar é instantâneo e não gera N requisições. A tela de Clientes é paginada por causa da tabela; aqui o mapa precisa do conjunto inteiro de qualquer jeito.
- **Vizinhos**: calculados no backend sobre o conjunto **visível** ao usuário (com GPS + com dia de entrega real, i.e. ≠ vazio e ≠ `N/D`); o frontend aplica os filtros da tela sobre os pares (os dois clientes precisam estar no conjunto filtrado). Raio único (padrão 1000 m), editável na tela e gravado em `app_configs`. Rural (5000 m) fica para a fase 2.
- **"Tem WhatsApp"** = `whatsappClienteService.numeroValido(Telefone_Celular)` (mesma régua do resto do sistema); a **situação** detalhada (SEM_NUMERO / DISPENSADO / COM_PROBLEMA / EM_USO / SEM_HISTORICO) usa a mesma cadeia if/else do relatório de Pendências (`whatsappClienteService.js:455-470`).
- **Salvar** usa a rota existente `PATCH /api/clientes/:uuid` (pedido do dono), **com uma correção obrigatória nela** (seção 4.4) — sem ela o painel apagaria 3 campos do cliente a cada salvamento.

---

## 2. Mapa do código atual (lido, não deduzido)

### Mapa / Leaflet
- `frontend/src/pages/Admin/Embarques/MapaExpedicao.jsx:4-5` — `import L from 'leaflet'; import 'leaflet/dist/leaflet.css'` (única lib de mapa; `leaflet ^1.9.4` em `frontend/package.json:23`; **não existe** markercluster instalado — não adicionar dependência).
- `:984-990` — `L.map(..., { zoomControl: true, attributionControl: true }).setView([-25.9, -49.2], 8)` + tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (maxZoom 19).
- `:997-999` — `ResizeObserver` → `map.invalidateSize()` (obrigatório: a sidebar muda a largura).
- `:1095-1108` — marcador = `L.divIcon({ className: '', html, iconSize, iconAnchor })` com HTML inline (círculo 26 px + chips); clique → `setSelecionado`.
- `:1382` — contêiner `relative z-0 isolate flex flex-col md:flex-row ... h-[calc(100dvh-170px)] min-h-[440px]` (o `isolate` prende os z-index do Leaflet abaixo do menu z-50).
- `:1606-1635` — painel lateral desktop (`md:w-[380px]`) que vira **bottom-sheet** no celular (`translate-y-[calc(100%-56px)]`, alça com `onTouchStart/End`). **Copiar este padrão.**
- Outros usuários de Leaflet: `frontend/src/components/ModalPontoGps.jsx`, `frontend/src/components/Clientes/QualidadeGps.jsx`.

### Dados do cliente
- `backend/prisma/schema.prisma` model `Cliente` (`@@map("clientes")`): `Nome`, `NomeFantasia`, `Telefone`, `Telefone_Celular`, `Ativo`, `End_Bairro`, `End_Cidade`, `Dia_de_entrega String?` (comentário "SEG,QUA"), `Dia_de_venda String?`, `Ponto_GPS String?` ("lat,lng"), `idVendedor`→`vendedor`, `categoriaClienteId`→`categoriaCliente`, `cicloCompraPersonalizadoDias`, relações `whatsappStatus ClienteWhatsappStatus?`, `gps ClienteGps?` (campo `balcao`), `clienteInsights ClienteInsight[]` (`dataUltimoPedido`, `diasSemComprar`, `cicloReferenciaDias`).
- **Formato real de `Dia_de_entrega`** (banco local, 1.154 ativos): `TER` (72) · `QUI` (63) · `QUA` · `SEX` · `N/D` (28) · `SEG` · `''` (13) · `SEG, QUI` (8) · `QUI, SEX` · `SEG, QUA, SEX`… — **separador é vírgula + espaço** (o `DayPicker` de `DetalheCliente.jsx:70` faz `join(', ')`), ordenado por `DIAS_SEMANA = ['SEG','TER','QUA','QUI','SEX','SAB','DOM','N/D']` (`:58`). Parse sempre `split(',').map(s=>s.trim()).filter(Boolean)`. Só 328 dos 1.154 ativos têm GPS no banco local (produção terá outro número — **nunca colocar o número do local em manual/novidade**).
- `backend/services/pontoService.js:41-59` — `parseLatLng(s)` e `haversineMetros(lat1,lng1,lat2,lng2)` (arredonda para metros). **Reusar**, não reescrever.
- `backend/services/gpsClientesService.js:48-64` — padrão `getConfig/setConfig` em `prisma.appConfig` (`key`, `value Json`). Copiar para `mapa_clientes_config`.
- `backend/services/whatsappClienteService.js:38-45` `numeroValido`; `:213-260` `whereSituacao`; `:455-470` cadeia da situação (`dispensaValida(st, cfg.diasValidadeDispensa)`); `module.exports` em `:518` já exporta `numeroValido`, `getConfig`.

### Rota de atualização e permissões
- `backend/routes/clienteRoutes.js:16` — `router.patch('/:uuid', clienteController.atualizar)`; montada em `backend/index.js:155` atrás de `authMiddleware`. **Sem middleware de permissão**.
- `backend/controllers/clienteController.js:672-990` (`atualizar`):
  - `:720` `podeEditarGPS = admin || Pode_Editar_GPS || clientes?.edit || Pode_Executar_Entregas`
  - `:722` `podeEditarCadastro = admin || clientes?.edit || Pode_Editar_GPS` — gate **só** de Nome/Documento/Endereço/E-mail/IE/Whatsapps/Ativo (`:812-828`).
  - `:790` `podeGravarWhatsapp = podeEditarCadastro || (pedidos?.edit === true && !numeroAtualOk)` — gate do `Telefone_Celular`, 403 só quando o número **muda**.
  - **`Dia_de_entrega`, `Dia_de_venda`, `idVendedor`, `categoriaClienteId` são gravados SEM gate** (`:881-897`): qualquer usuário autenticado que chegue na rota altera. É o comportamento em produção hoje (o `DayPicker` de `DetalheCliente.jsx:1072-1073` também não é gated).
  - **BUG existente (`:896-900`)** — em PATCH parcial: `cicloCompraPersonalizadoDias: (… !== undefined && !== '') ? parseInt : null` → **apaga** o ciclo personalizado; `insightAtivo: insightAtivo !== undefined ? insightAtivo : true` → **religa** insight desligado; `observacaoComercialFixa: observacaoComercialFixa || null` → **apaga** a observação. Já acontece hoje no `ModalWhatsappCliente.jsx:86` (`atualizar(uuid, { Telefone_Celular })`). O painel do mapa faria o mesmo — por isso a correção da seção 4.4 é obrigatória.
  - Não grava histórico/auditoria nenhum (nenhum `atendimento.create`/`auditLog.create` no controller).
  - `:724-727` `atual` só seleciona `Documento, End_Estado, Telefone_Celular, fiscal` — o diff da auditoria precisa ampliar este `select`.
- `clienteController.listar :172-180` — visibilidade: `if (req.user.permissoes?.pedidos?.clientes !== 'todos') where.idVendedor = req.user.id` (vendedor de campo só vê os seus). **O mapa tem de espelhar exatamente esta expressão.**
- `backend/prisma/schema.prisma:1960` `model AuditLog { acao, entidade, entidadeId, detalhes Text?, usuarioId, usuarioNome, createdAt }` (`@@map("audit_logs")`). `req.user` (`backend/middlewares/authMiddleware.js:33`) = `{ ...decoded, permissoes, maxDescontoFlex }` — o **nome** do usuário vem de `prisma.vendedor.findUnique` (padrão `getAutor` em `backend/routes/gpsClientesRoutes.js:15-18`).
- Frontend: `AuthContext.jsx:107-125` `hasPermission(tab, action)`; `App.jsx:138-147` `PrivateRoute tab="clientes"`; rotas do módulo em `App.jsx:870-874` (`/clientes`, `/clientes/novo`, `/clientes/saude-gps`, `/clientes/pendencias-whatsapp`, `/clientes/:uuid` — **a rota nova tem de ficar ANTES de `/:uuid`**); lazy em `App.jsx:13-17` com `lazyComRetry`. Menu (`App.jsx:415`): Clientes é um item só; as sub-telas são botões no topo de `ListaClientes.jsx:461-482` (Saúde GPS / WhatsApp, ambos atrás de `podeCadastrar = admin || clientes?.edit`, `:72`).
- `DetalheCliente.jsx:100-104` — `podeEditarCadastroCA = admin || clientes?.edit || Pode_Editar_GPS` (espelho do backend, reusar o mesmo nome/expressão).

### Componentes a reusar
- `frontend/src/components/SelectBusca.jsx` (drop-in de `<select>`), `MultiSelect.jsx` (`options, selected, onChange, valueKey, labelKey, summary, searchable`), `PageHeader.jsx` (`icon, cor='green', titulo, subtitulo, acoes`), `EstadoVazio.jsx`, `hooks/useFiltrosSalvos.js` (`useFiltrosSalvos(chave, inicial)` / `useFiltroSalvo`), `utils/vendedoresFiltro.jsx` (`opcoesVendedorMulti(lista)` → `{valor,label}` com "(inativo)"), `services/vendedorService.js:18` `listarParaFiltro()` = `GET /vendedores` (inclui inativos), `GET /categorias-cliente` (`backend/routes/categoriasCliente.js:5`).
- `frontend/src/components/ModalWhatsappCliente.jsx:34-50` — props `aberto, onFechar, clienteUuid, clienteNome, numeroAtual, rotuloSalvar, permitirDispensa, onSalvo`. **Usar `permitirDispensa={false}`** fora do ENVIAR (comentário `:41-48` explica por quê). Ele já faz o PATCH e já trata o 403/400 do backend.
- `frontend/src/components/SeloWhatsappCliente.jsx` (precisa da flag `mostrar`; no mapa mostrar sempre → passar `mostrar` true ou renderizar o selo próprio da legenda).
- `DayPicker` está **dentro** de `DetalheCliente.jsx:58-98` (não exportado). Fase 1: criar `frontend/src/components/DayPicker.jsx` com o **mesmo** `DIAS_SEMANA` e o **mesmo** `join(', ')` — e NÃO tocar em `DetalheCliente.jsx` (migração dele fica como boy-scout para quando aquele arquivo for mexido).

### Clippy / novidades
- `backend/services/copilotoService.js:53-55` — entradas `clientes`, `saude-pontos-gps`, `pendencias-whatsapp` (`perm: 'clientes'`); `podeAcessar :182`.
- `backend/manuais/abas/README.md:35-37` (seção Vendas) e modelo de manual de mapa em `backend/manuais/abas/embarques-mapa.md`.
- `frontend/public/novidades.json` (mais recente primeiro); modelo de página com mockups: `frontend/public/novidade-cadastro-clientes.html` (classes `.tela`, `.app-card`, `.pin`, `.legenda`, `.acc aberto`). **Sem `og:image`** (o modelo antigo ainda tem — não copiar essa linha).

---

## 3. Contrato da API (FECHADO — os dois devs codificam contra isto)

Router novo `backend/routes/mapaClientesRoutes.js`, montado em `backend/index.js` logo após a linha 158:
```js
app.use('/api/mapa-clientes', authMiddleware, require('./routes/mapaClientesRoutes')); // Mapa de Clientes (reorganização por dia/região)
```
Lógica em `backend/services/mapaClientesService.js`. Todas as respostas em JSON; erros `{ error: string }` com 400/403/404/500.

### 3.1 `GET /api/mapa-clientes` — carga completa
Query: `ativo` = `'true'` (padrão) | `'false'` | `'todos'`.
Visibilidade: **mesma expressão de `clienteController.listar:174-178`** — se `req.user.permissoes?.pedidos?.clientes !== 'todos'` → só `idVendedor = req.user.id`.

Resposta 200:
```jsonc
{
  "geradoEm": "2026-09-12T14:03:00.000Z",
  "config": { "raioMetros": 1000 },
  "totais": { "clientes": 1154, "comGps": 328, "semGps": 826 },     // do conjunto devolvido (antes de qualquer filtro de tela)
  "clientes": [
    {
      "uuid": "…", "nome": "Razão Social", "fantasia": "Fantasia ou null",
      "ativo": true,
      "cidade": "Rio Negrinho", "bairro": "Centro",                   // null quando vazio (nunca "undefined")
      "categoriaId": "…|null", "categoriaNome": "Padaria|null",
      "vendedorId": "…|null", "vendedorNome": "Nome|null", "vendedorAtivo": true,
      "diasEntrega": ["SEG","QUI"],   // parse de Dia_de_entrega: split(',') + trim + filter(Boolean); "N/D" É devolvido como valor
      "diasVenda":   ["TER"],
      "diaEntregaRaw": "SEG, QUI",    // texto original, para o PATCH devolver o mesmo formato
      "diaVendaRaw":   "TER",
      "gps": { "lat": -26.25, "lng": -49.51 } | null,               // parseLatLng(Ponto_GPS); inválido => null (conta como semGps)
      "balcao": false,                                               // gps?.balcao === true
      "telefone": "…|null", "telefoneCelular": "…|null",
      "whatsapp": { "temNumero": true, "situacao": "EM_USO" },       // situacao ∈ SEM_NUMERO|DISPENSADO|COM_PROBLEMA|EM_USO|SEM_HISTORICO
      "ultimoPedidoEm": "2026-09-01T00:00:00.000Z|null",
      "diasSemComprar": 11 | null,
      "cicloDias": 7 | null                                          // clienteInsights[0].cicloReferenciaDias
    }
  ],
  "opcoes": {                                                        // montadas do CONJUNTO INTEIRO (regra: opção de filtro não some do menu por causa do resultado)
    "cidades":  [{ "valor": "Rio Negrinho", "qtd": 412 }],           // ordem alfabética pt-BR; vazio/null NÃO entra
    "bairros":  [{ "valor": "Centro", "cidade": "Rio Negrinho", "qtd": 80 }],
    "categorias": [{ "id": "…", "nome": "Padaria", "qtd": 90 }],     // só as que aparecem em algum cliente
    "diasEntrega": [{ "valor": "SEG", "qtd": 26 }],                  // contagem por dia (cliente com 2 dias conta nos 2); inclui "N/D"
    "diasVenda":   [{ "valor": "TER", "qtd": 300 }]
  }
}
```
Notas de implementação (backend):
- `findMany` com `select` enxuto + `include`/`select` em `vendedor {id,nome,ativo}`, `categoriaCliente {id,nome}`, `whatsappStatus`, `gps {balcao}`, `clienteInsights { select: { dataUltimoPedido, diasSemComprar, cicloReferenciaDias }, take: 1 }`. **Validar todos os nomes de campo contra o schema antes de commitar** (memória: campo inexistente passa no `node --check` e derruba a rota).
- `situacao` via helper **novo e exportado** `situacaoWhatsapp(cliente, cfg)` em `whatsappClienteService.js` (extraído da cadeia de `:463-470`, mais `SEM_HISTORICO` quando tem número e selo é null/EM_USO ausente) — aditivo; o relatório existente pode continuar como está (boy-scout opcional: fazer o relatório chamar o helper).
- `ativo='todos'` devolve inativos com `ativo:false` (o filtro de tela decide).

### 3.2 `GET /api/mapa-clientes/vizinhos` — pares em dias diferentes
Query: `raio` (metros, inteiro 100..20000; omitido → `config.raioMetros`), `limite` (1..500, padrão 200), `ativo` (igual a 3.1, padrão `'true'`).
Mesma visibilidade de 3.1. Universo: clientes do conjunto visível com `gps != null` **e** `diasEntrega` com pelo menos um dia real (exclui `[]` e `['N/D']`). Cliente balcão entra normalmente (tem entrega? se `balcao` true, **excluir** — quem retira na empresa não gera parada).

Critério do par: `distanciaMetros <= raio` **e** `interseção(diasEntrega A, diasEntrega B) = ∅` (ignorando `N/D`).

Resposta 200:
```jsonc
{
  "raioMetros": 1000, "universo": 300, "total": 57, "truncado": false,
  "pares": [
    { "distanciaMetros": 42,
      "a": { "uuid": "…", "nome": "Fantasia ou Nome", "diasEntrega": ["SEG"], "gps": { "lat": 0, "lng": 0 }, "vendedorNome": "…|null", "cidade": "…|null" },
      "b": { "uuid": "…", "nome": "…", "diasEntrega": ["QUI"], "gps": { … }, "vendedorNome": "…|null", "cidade": "…|null" } }
  ]
}
```
Ordenação: `distanciaMetros` asc; `truncado = total > limite`. `a` é sempre o de menor `uuid` (par estável, sem duplicata A-B/B-A).

Algoritmo (documentar no service): grade espacial — célula = `raio` em graus (`dLat = raio/111320`, `dLng = raio/(111320*cos(latMédia))`); indexar cada ponto em `Map("i,j" → [pontos])`; para cada ponto, comparar só com as 9 células vizinhas e só com índices maiores (evita par duplo). Custo ~O(n·k). Para referência: n=1.200 força bruta = 719.400 pares (n(n-1)/2) de Haversine ≈ dezenas de ms em Node — a grade é para não crescer com o cadastro, não por urgência. Usar `haversineMetros` de `pontoService.js`.

### 3.3 `GET /api/mapa-clientes/config` · `PUT /api/mapa-clientes/config`
- GET → `{ "raioMetros": 1000 }` (padrão 1000 quando a chave `mapa_clientes_config` não existe em `app_configs`).
- PUT body `{ "raioMetros": 1500 }` → valida inteiro 100..20000 (400 fora disso) → upsert → devolve `{ raioMetros }`.
- **Permissão do PUT:** `perms.admin || perms.clientes?.edit` (403 caso contrário). Frontend: o campo de raio fica editável para todos (ajuste local, sem gravar) e o botão **"Salvar como padrão"** só aparece para `admin || clientes?.edit` — espelho exato.

### 3.4 Salvar edição rápida — `PATCH /api/clientes/:uuid` (EXISTENTE)
Body **só com os campos alterados**, no formato que o backend já espera:
```jsonc
{ "Dia_de_entrega": "SEG, QUI",          // join(', ') na ordem de DIAS_SEMANA; '' para limpar
  "Dia_de_venda": "TER",
  "categoriaClienteId": "uuid" | "",     // '' => null (controller :887)
  "idVendedor": "id" | "",               // '' => null (controller :884)
  "origem": "mapa-clientes" }            // NOVO, opcional: só para a auditoria (seção 4.4)
```
WhatsApp/celular **não** vai neste body: usar `ModalWhatsappCliente` (que já faz `PATCH { Telefone_Celular }` e trata 403 "já tem número"/400 `WHATSAPP_NAO_EXISTE`).
Resposta: o cliente atualizado (objeto Prisma). O frontend **não** depende do shape da resposta: após 200, refaz `GET /api/mapa-clientes` (ou atualiza o item local com o que enviou e agenda um reload leve).

Permissão (espelho exato do backend, seção 2): dia de entrega / dia de venda / categoria / vendedor → **qualquer usuário que enxerga a tela** (backend não gateia); WhatsApp → gate interno do modal. Ver risco R1.

---

## 4. Plano de execução

### 4.A — PACOTE BACKEND (`dev-backend`)

**4.1** Criar `backend/services/mapaClientesService.js`
- `getConfig()/setConfig({raioMetros})` (cópia do padrão `gpsClientesService.js:48-64`, chave `mapa_clientes_config`, padrão `{ raioMetros: 1000 }`).
- `whereVisibilidade(reqUser)` → `{}` ou `{ idVendedor: reqUser.id }` com a **mesma** expressão de `clienteController.listar:174-178`.
- `carregar({ reqUser, ativo })` → payload 3.1. Usa `parseLatLng` (`pontoService`), `numeroValido` + `situacaoWhatsapp` (`whatsappClienteService`), monta `opcoes`.
- `vizinhos({ reqUser, ativo, raio, limite })` → payload 3.2 com a grade espacial.
- Sem `$transaction` (só leitura) — nada a ajustar de timeout.

**4.2** Adicionar em `backend/services/whatsappClienteService.js` (aditivo) o helper `situacaoWhatsapp(cliente, cfg)` que devolve `{ temNumero, situacao }` reproduzindo `:463-470` (+ `SEM_HISTORICO` quando `temNumero && !selo`, `EM_USO` quando selo EM_USO). Exportar em `module.exports`. Não alterar `whereSituacao` nem o relatório.

**4.3** Criar `backend/routes/mapaClientesRoutes.js` (GET `/`, GET `/vizinhos`, GET `/config`, PUT `/config`) e montar em `backend/index.js` (1 linha, após a 158). Parse/validação de query no router; erros com `console.error('[MapaClientes] …')`.

**4.4** Correção cirúrgica em `backend/controllers/clienteController.js` (`atualizar`) — **obrigatória para esta entrega**:
- `:896-900` trocar por semântica "ausente = não mexe":
  ```js
  cicloCompraPersonalizadoDias: cicloCompraPersonalizadoDias === undefined ? undefined
      : (cicloCompraPersonalizadoDias === '' || cicloCompraPersonalizadoDias === null ? null : parseInt(cicloCompraPersonalizadoDias)),
  insightAtivo: insightAtivo === undefined ? undefined : !!insightAtivo,
  observacaoComercialFixa: observacaoComercialFixa === undefined ? undefined : (observacaoComercialFixa || null),
  ```
  `DetalheCliente` manda o formulário inteiro (`:400-409`), então continua igual para ele; `ModalWhatsappCliente` e o mapa passam a **não apagar** ciclo/insight/observação. Confirmar com `grep -rn "clienteService.atualizar(" frontend/src` que os únicos chamadores são estes dois (conferido em 12/09: `ModalWhatsappCliente.jsx:86`, `DetalheCliente.jsx:400`).
- Ampliar o `select` de `atual` (`:726`) com `Dia_de_entrega, Dia_de_venda, idVendedor, categoriaClienteId, Nome, NomeFantasia`.
- **Depois** do `prisma.cliente.update` (fora de qualquer transação; `try/catch` próprio; nunca altera a resposta): se algum de `Dia_de_entrega, Dia_de_venda, idVendedor, categoriaClienteId, Telefone_Celular` mudou em relação a `atual`, gravar
  `prisma.auditLog.create({ data: { acao: 'CLIENTE_ALTERADO', entidade: 'Cliente', entidadeId: uuid, usuarioId: req.user.id, usuarioNome, detalhes: JSON.stringify({ origem: req.body.origem || null, mudancas: { Dia_de_entrega: { de, para }, … } }) } })`
  (`usuarioNome` via `prisma.vendedor.findUnique({ where:{id:req.user.id}, select:{nome:true} })` — mesmo padrão de `gpsClientesRoutes.js:15`). Isto atende "gravar histórico" e cobre também a ficha e o modal de WhatsApp.
- **Não** adicionar gate novo a `Dia_de_entrega/Dia_de_venda/idVendedor/categoriaClienteId` nesta fase (ver R1). Não mexer em nada mais deste controller.

**4.5** Clippy: criar `backend/manuais/abas/mapa-clientes.md` (frontmatter `aba: Mapa de Clientes / rota: /clientes/mapa / permissao: clientes (view)`; cobrir: filtros, colorir por, legenda clicável, contadores, painel do cliente e o que cada campo grava, vizinhos + raio, paradas por dia, celular, o que **não** faz — km/OSRM/IA); linha no `README.md` (seção Vendas, após Pendências de WhatsApp); entrada em `copilotoService.js` `ABAS` após a linha 55: `{ slug: 'mapa-clientes', nome: 'Mapa de Clientes', rota: '/clientes/mapa', perm: 'clientes' }`. Também acrescentar 1 parágrafo em `clientes.md` apontando o botão "Mapa".

**4.6** Teste local (evidência para o QA/revisor): `curl` autenticado nos 4 endpoints (200, 400 com `raio=5`, 403 no PUT sem `clientes.edit`), e `PATCH /clientes/:uuid` com `{ Dia_de_entrega: 'QUA' }` provando que `cicloCompraPersonalizadoDias` e `observacaoComercialFixa` **não mudaram** e que uma linha entrou em `audit_logs`.

### 4.B — PACOTE FRONTEND (`dev-frontend`) — pode começar em paralelo com o contrato da seção 3

**4.7** `frontend/src/services/mapaClientesService.js`: `carregar({ativo})`, `vizinhos({raio, limite, ativo})`, `config()`, `salvarConfig({raioMetros})`. Salvar do cliente continua em `clienteService.atualizar(uuid, dados)`.

**4.8** `frontend/src/components/DayPicker.jsx` — cópia fiel do `DetalheCliente.jsx:58-98` (mesmo `DIAS_SEMANA`, `join(', ')`, ordenação), com prop `compacto` para o painel. Exportar também `DIAS_SEMANA` e `parseDias(str)`.

**4.9** Página `frontend/src/pages/Clientes/MapaClientes.jsx` + pasta `frontend/src/pages/Clientes/mapaClientes/`:
- `coresMapa.js` — paleta **fixa por dia** (SEG/TER/QUA/QUI/SEX/SAB/DOM/N-D, cores distintas e legíveis; `#00754A` reservado para ação, não para dado), paleta rotativa (`CORES` do MapaExpedicao `:27`) para categoria/vendedor/cidade, `#6b7280` para "sem valor"; WhatsApp: tem = verde `#16a34a`, não tem = vermelho `#dc2626` (mesmas semânticas dos badges).
- `marcador.js` — `criarIconeFatias(cores[], { selecionado, esmaecido })` → `L.divIcon` com círculo 18 px e `background: conic-gradient(c1 0 50%, c2 50% 100%)` (fatias iguais para N valores; 1 valor = cor sólida), borda branca 2 px, sombra; selecionado = `outline: 3px solid #cba258` (dourado, igual ao MapaExpedicao `:1097`); destaque do par = anel pulsante só com `opacity/transform` (regra CSS do CLAUDE.md — nunca `box-shadow` animado).
- `FiltrosMapa.jsx` — `useFiltrosSalvos('mapa-clientes', { cidades:[], bairros:[], categorias:[], vendedores:[], diasEntrega:[], diasVenda:[], whatsapp:'todos', gps:'todos', ativo:'ativos', colorirPor:'diaEntrega' })` (`MultiSelect` com `{valor,label}`; vendedores via `listarParaFiltro` + `opcoesVendedorMulti`; categorias via `GET /categorias-cliente` **unidas** às de `opcoes.categorias`). Bairros dependem da cidade escolhida (quando há cidade marcada, só bairros dela). Botão "N filtros ativos" + "Limpar". Em mobile: linha rolável `flex gap-2 overflow-x-auto hide-scrollbar` + botão que abre a folha de filtros.
- `useDadosMapa.js` — carrega 3.1 uma vez (e após cada salvamento), aplica filtros em `useMemo`, deriva: `filtrados`, `comGps`, `semGps`, contadores (total, com/sem GPS, com/sem WhatsApp, por dia de entrega e por dia de venda), `legenda` (valor → cor, qtd, ligado?) e `valoresOcultos` (Set, **não persistido**).
- `LegendaMapa.jsx` — itens "SEG · 84 clientes", clique liga/desliga (`aria-pressed`), item desligado esmaecido; "mostrar todos".
- `Contadores.jsx` — cartões `grid-cols-2 md:grid-cols-4` + faixa por dia (chips).
- `DrawerCliente.jsx` — ficha (nome, fantasia, cidade/bairro, categoria, vendedor, dias, telefone/celular + selo da situação, último pedido, dias sem comprar/ciclo, aviso "cliente balcão" se for) + **edição rápida**: `DayPicker` (entrega e venda), `SelectBusca` categoria, `SelectBusca` vendedor (**só ativos** no formulário — `vendedorService.listarAtivos()`, regra de `vendedoresFiltro.jsx:7-10`), botão "Alterar WhatsApp" → `ModalWhatsappCliente permitirDispensa={false} rotuloSalvar="Salvar"`. Botão Salvar (`bg-primary rounded-full`, `disabled` enquanto salva, anti-clique-duplo) manda **só campos alterados** + `origem:'mapa-clientes'`; sucesso → toast + recarrega; erro → toast com `e.response?.data?.error`, painel continua aberto com os valores digitados. Link "Abrir ficha completa" → `/clientes/:uuid`.
- `PainelVizinhos.jsx` — campo raio (100–20000 m) com "Aplicar" (refaz 3.2) e "Salvar como padrão" (só `admin || clientes?.edit`); lista filtrada pelos filtros da tela; linha = "A (SEG) ↔ B (QUI) · 42 m"; clique → `map.fitBounds` nos dois (`pad(0.3)`), destaca ambos e abre mini-cartão com os dois nomes e botões "Editar A"/"Editar B" (abre o Drawer). Estado vazio com `EstadoVazio`. Aviso "mostrando 200 de N" quando `truncado`.
- `PainelParadas.jsx` — duas tabelas (entrega / venda): dia × nº de clientes no filtro; rodapé "km rodados por dia chega na fase 2".
- `ListaSemGps.jsx` — lista dos filtrados sem GPS (nome, cidade, vendedor) com link para a ficha; é para onde o contador "sem GPS" leva.
- Layout: `PageHeader icon={MapPinned} cor="green" titulo="Mapa de Clientes"` + botão "Voltar para Clientes"; corpo igual a `MapaExpedicao.jsx:1382` (`relative z-0 isolate … h-[calc(100dvh-170px)] min-h-[440px]`); painel direito 380 px com **abas em pílula** (Cliente · Vizinhos · Paradas · Sem GPS); no celular vira **bottom-sheet** com alça (copiar `:1606-1635`), legenda flutuante recolhível sobre o mapa (`absolute bottom-16 left-3 right-3 md:top-3 md:right-3`, cf. `:1535`). Mapa: `L.map` + tiles OSM + `ResizeObserver` (igual `:984-999`); marcadores em `L.layerGroup` recriado quando muda `filtrados`/`colorirPor`/`valoresOcultos`; `fitBounds` só na 1ª carga e quando o usuário clica "Enquadrar".

**4.10** `frontend/src/App.jsx` (cirúrgico): linha 17 → `const MapaClientes = lazyComRetry(() => import('./pages/Clientes/MapaClientes'));`; rota `<Route path="/clientes/mapa" element={<PrivateRoute tab="clientes"><MapaClientes /></PrivateRoute>} />` inserida **antes** de `/clientes/:uuid` (`:874`). Nenhuma outra linha.

**4.11** `frontend/src/pages/Clientes/ListaClientes.jsx:461` — botão "🗺️ Mapa" ao lado de "Saúde GPS", **sem** o gate `podeCadastrar` (a tela é de leitura para quem tem `clientes` view; a edição é gateada dentro dela).

**4.12** Novidade: `frontend/public/novidade-mapa-clientes.html` (modelo `novidade-cadastro-clientes.html`: hero, "As telas do app" com mocks HTML das 3 telas — mapa+legenda, painel do cliente, vizinhos — com pins numerados, accordions `aberto`, sem `og:image`, sem botão "abrir o app") + entrada no topo de `frontend/public/novidades.json` `{ slug:'mapa-clientes', titulo:'Mapa de Clientes', resumo:'…', data:'2026-09-XX' }`. **Nenhum número do banco local no texto.**

**4.13** `cd frontend && npm run build` — obrigatório antes de entregar.

### Ordem/dependências
1. Backend 4.1–4.4 e frontend 4.7–4.9 em paralelo (frontend pode mockar a resposta 3.1 até o backend subir local).
2. Frontend integra com backend local → 4.10–4.11 → build.
3. 4.5 e 4.12 (manual + novidade) por último, com base no comportamento real.
4. QA + revisor → gerente-entrega.

---

## 5. Riscos e efeitos colaterais

- **R1 — Permissão de edição (decisão do dono).** Hoje o backend grava `Dia_de_entrega/Dia_de_venda/idVendedor/categoriaClienteId` para **qualquer** usuário autenticado (sem gate); a ficha faz o mesmo. O plano espelha isso (edição liberada a quem vê a tela). O mapa torna essa edição muito mais rápida — inclusive "passar cliente para outro vendedor". Se o dono quiser travar (ex.: só `clientes.edit`), é mudança em **backend E frontend E ficha** juntos (senão vendedor de campo perde o DayPicker que usa hoje) — registrar como decisão, não fazer calado.
- **R2 — Correção 4.4 muda semântica de PATCH parcial.** Único caminho que hoje "aproveita" o bug é nenhum (o comportamento atual é destrutivo). Revisor deve conferir que `DetalheCliente` (envia tudo) e `ModalWhatsappCliente` (envia 1 campo) continuam funcionando. Chamadores confirmados por grep em 12/09 — o revisor **repete o grep** (inclui `api.patch(\`/clientes/`).
- **R3 — Formato do dia.** Gravar `join(', ')` exatamente como o DayPicker; `listar` filtra com `contains` (`:134`) — um formato diferente (sem espaço) quebraria o filtro da tela de Clientes de forma silenciosa. Valores fora de `DIAS_SEMANA` não devem ser gravados.
- **R4 — Payload único (~300 KB).** Aceitável em 4G; se produção tiver muito mais clientes que o esperado, o `select` enxuto é a primeira alavanca. Não paginar.
- **R5 — 1.200 `divIcon` no Leaflet.** Recriar a `layerGroup` inteira a cada mudança de filtro é OK (< 100 ms); **não** recriar a cada `moveend`. Não instalar markercluster nesta fase.
- **R6 — z-index / menu lateral.** Sem `relative z-0 isolate` no contêiner o Leaflet passa por cima do menu (comentário em `MapaExpedicao.jsx:1378-1381`).
- **R7 — Insights podem não existir** para todo cliente (`clienteInsights` vazio) → campos `null`; a tela nunca interpola `undefined` (regra de template strings do CLAUDE.md).
- **R8 — `App.jsx`/`index.js` modificados pela outra sessão.** Edição só nas linhas indicadas; `git add` explícito; conferir `git diff` do arquivo antes do commit para não arrastar o trabalho alheio.
- **R9 — Vendedor com visibilidade restrita** vê só os seus no mapa, e os pares de vizinhos também só entre os seus — coerente com a tela de Clientes; documentar no manual para não parecer bug ("meu vizinho não aparece").
- **R10 — `situacaoWhatsapp` novo.** Aditivo; se o dev optar por fazer o relatório de Pendências usar o helper, QA precisa reabrir Pendências de WhatsApp e conferir os KPIs.
- Áreas sensíveis **não tocadas**: NF-e, WhatsApp/Z-API (nenhum envio novo — só leitura de status), `/api/ia-consulta/v1`, upload, schema, financeiro.

---

## 6. Critérios de aceite (QA clica; revisor confere)

Funcional (desktop 1366 px e mobile 375 px):
1. `/clientes/mapa` abre para usuário com `clientes` view; usuário sem a permissão vê "Acesso Negado"; botão "Mapa" aparece no topo de Clientes para quem tem a view (também para quem **não** tem `clientes.edit`).
2. Mapa carrega com pinos de todos os clientes ativos com GPS; contador "sem GPS" bate com `totais.semGps` da API e a aba "Sem GPS" lista exatamente esses nomes.
3. Cada filtro (cidade, bairro dependente da cidade, categoria, vendedor — inclusive um inativo com "(inativo)", dia de entrega, dia de venda, WhatsApp tem/não tem, GPS, ativo/inativo) reduz pinos, contadores e legenda de forma coerente; fechar e reabrir a tela **mantém** os filtros (exceto busca livre, que não existe aqui); "Limpar" volta ao padrão.
4. "Colorir por" troca as cores; a legenda mostra "VALOR · N clientes" e a soma das contagens (para dia) é ≥ nº de pinos (cliente com 2 dias conta em 2); cliente com `SEG, QUI` aparece com pino em 2 fatias; clicar em "QUI" na legenda esconde os pinos só-QUI e deixa o pino SEG/QUI visível (esmaecido na fatia oculta ou mantido — documentar o escolhido).
5. Clique no pino abre o painel com ficha correta (comparar com a ficha completa do mesmo cliente); telefone/celular e situação do WhatsApp coincidem com a aba "Qualidade dos dados" da ficha.
6. Edição rápida: mudar dia de entrega de `TER` para `SEG, QUI` + categoria + vendedor → Salvar → toast → pino muda de cor/fatias **sem recarregar a página**; abrir a ficha completa mostra os mesmos valores; **ciclo personalizado, "insight ativo" e observação comercial fixa do cliente continuam iguais** (verificar em cliente que tenha esses 3 preenchidos — este é o teste da correção 4.4); em `audit_logs` há 1 linha `CLIENTE_ALTERADO` com `origem: 'mapa-clientes'` e as mudanças de/para.
7. Caminho de erro: com o backend derrubado (ou `PATCH` forçado a 500 via devtools), Salvar mostra toast de erro, o painel **não fecha** e os valores digitados permanecem; recarregar a tela mostra os valores antigos.
8. WhatsApp: "Alterar WhatsApp" abre o `ModalWhatsappCliente` **sem** a opção "Não consegui agora"; usuário sem `clientes.edit` e sem `pedidos.edit` tentando trocar número que já existe recebe a mensagem de 403 do backend, e nada muda.
9. Vizinhos: lista ordenada por distância; nenhum par com dia em comum; nenhum par com cliente balcão ou sem dia real; clicar no par enquadra o mapa nos dois e destaca; mudar raio para 300 m e "Aplicar" reduz a lista; "Salvar como padrão" só aparece para `admin || clientes.edit`, grava e persiste após F5 (`GET /config` devolve o novo valor); `raio=5` na URL da API → 400.
10. Paradas por dia: tabela bate com os chips de contador e com a legenda "colorir por dia de entrega" para o mesmo filtro.
11. Mobile 375 px: sem scroll horizontal; mapa em cima, bottom-sheet com alça sobe/desce por toque e arraste; filtros acessíveis; abas do painel legíveis; pinos tocáveis (≥ 44 px de área efetiva ou hit-area maior via `iconSize`).
12. Menu lateral fica **acima** do mapa quando aberto (desktop e mobile).
13. `npm run build` passa; sem erro no console ao abrir/fechar a tela 3 vezes (mapa é destruído no unmount — `map.remove()`).
14. Clippy: perguntar "como vejo vizinhos atendidos em dias diferentes?" → responde apontando Mapa de Clientes com botão "Ir para" `/clientes/mapa` (após publicar o backend).
15. Página `/novidade-mapa-clientes.html` abre sem login, mobile-first, com mocks e pins; `novidades.json` válido (JSON parseável) com a entrada no topo.

Revisor confere ainda: contrato 3.1/3.2 igual entre service e frontend; `select` do Prisma só com campos existentes no schema; nenhuma interpolação de valor possivelmente `null`; `useFiltrosSalvos` para todo filtro; `SelectBusca`/`MultiSelect` (nenhum `<select>` nativo); `lazyComRetry`; `git diff` de `App.jsx` e `index.js` contendo **só** as linhas desta entrega; nenhum `og:image` na novidade; nenhum número do banco local em manual/novidade.

---

## 7. O que NÃO fazer

- Não adicionar coluna em `clientes` nem tabela nova (config em `app_configs`, histórico em `audit_logs`).
- Não gravar `Dia_de_entrega` em formato diferente de `join(', ')` na ordem de `DIAS_SEMANA`; não gravar valores fora da lista.
- Não colocar o histórico dentro de transação nem deixar falha do `auditLog` virar erro para o usuário.
- Não chamar OSRM/Nominatim nesta fase (custo/limite de taxa — `gpsClientesService.js:619-640` mostra a fila que o Nominatim exige).
- Não instalar dependência nova de mapa (markercluster etc.).
- Não usar `window.open` para nada interno; link externo (Google Maps) só se for para fora do app.
- Não usar `React.lazy` direto, `<select>` nativo, `useState` para filtro, `box-shadow` animado.
- Não mexer em `whereSituacao`, no relatório de Pendências nem em `ModalWhatsappCliente` (só consumir).
- Não repetir o gate `podeCadastrar` no botão "Mapa" (é tela de leitura).
- Não colocar o número de clientes com/sem GPS do banco local em texto de manual/novidade.

---

## 8. Fases futuras (registrar, não implementar)

- **Fase 2 — km por dia e "e se":** `POST /api/mapa-clientes/estimar-dias` usando `backend/services/osrmService.js` (matriz/rota por dia da semana a partir da base, como `divisaoCargasService.js`); painel "Paradas por dia" ganha km e tempo; arrastar cliente de um dia para outro no painel recalcula km (modo rascunho, igual ao MapaExpedicao: nada grava até "Confirmar"). Raio duplo urbano/rural por cidade (`mapa_clientes_config.raioPorCidade`).
- **Fase 3 — sugestão com IA:** botão "Sugerir reorganização" → backend monta o agrupamento (clusters por proximidade + dias + capacidade) e pede ao modelo (Claude) uma proposta com justificativa; usuário aceita item a item → grava via o mesmo PATCH. Carregar o skill `claude-api` antes de codificar.
- Boy-scout pendentes: migrar `DetalheCliente.jsx` para o `DayPicker` compartilhado; fazer o relatório de Pendências usar `situacaoWhatsapp`; decidir R1 (gate de edição comercial).

---

## 9. Arquivos da entrega (para o `git add` explícito)

**Backend (novos):** `backend/services/mapaClientesService.js`, `backend/routes/mapaClientesRoutes.js`, `backend/manuais/abas/mapa-clientes.md`
**Backend (alterados):** `backend/index.js` (1 linha), `backend/controllers/clienteController.js` (4.4), `backend/services/whatsappClienteService.js` (helper aditivo), `backend/services/copilotoService.js` (1 entrada em `ABAS`), `backend/manuais/abas/README.md`, `backend/manuais/abas/clientes.md`
**Frontend (novos):** `frontend/src/pages/Clientes/MapaClientes.jsx`, `frontend/src/pages/Clientes/mapaClientes/*` (coresMapa.js, marcador.js, FiltrosMapa.jsx, useDadosMapa.js, LegendaMapa.jsx, Contadores.jsx, DrawerCliente.jsx, PainelVizinhos.jsx, PainelParadas.jsx, ListaSemGps.jsx), `frontend/src/components/DayPicker.jsx`, `frontend/src/services/mapaClientesService.js`, `frontend/public/novidade-mapa-clientes.html`
**Frontend (alterados):** `frontend/src/App.jsx` (2 linhas), `frontend/src/pages/Clientes/ListaClientes.jsx` (1 botão), `frontend/public/novidades.json`
**Docs:** `docs/mapa-clientes/PLANO.md`

Sugestão de `deployMarker` (em `backend/routes/adminExec.js:63`, se a outra sessão não estiver disputando a linha): `'mapa-clientes-2026-09-XX'` — caso contrário, verificar o deploy pelo `GET /api/mapa-clientes/config` respondendo 200 (em vez de 404).
