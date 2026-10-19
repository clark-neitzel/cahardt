# Plano — Histórico do endereço do cliente (quem/quando/restaurar/ver no mapa)

Autor: arquiteto · 19/10/2026 · Porte: **GRANDE** (escrita em cadastro de cliente que alimenta NF-e + schema novo + 2 telas). Equipe completa.

## 1. Entendimento do pedido
O dono quer, na ficha do cliente (aba **Qualidade dos dados → card Localização**):
1. Ficar salvo **quem** e **quando** mudou o endereço (texto E ponto no mapa).
2. Um botão **Restaurar** em qualquer versão antiga.
3. **Clicar numa versão antiga e ver no mapa dentro do app** (para tirar dúvida, sem abrir mapa externo).

Interpretação adotada: "endereço" = os 7 campos de texto (`End_Logradouro, End_Numero, End_Complemento, End_Bairro, End_Cidade, End_Estado, End_CEP`) + `Ponto_GPS`. `End_Pais` fica fora (sempre "Brasil", ninguém edita).

## 2. Mapa do código atual (confirmado lendo o código)

Backend
- `backend/prisma/schema.prisma:175-190` campos `End_*` em `Cliente`; `:206` `Ponto_GPS`; `:253-254` relações `gps`/`gpsLogs`; `:395-427` `ClienteGpsLog` (só o PONTO); `:1998` `AuditLog`.
- `backend/controllers/clienteController.js`
  - `:16` `CAMPOS_AUDITADOS_CLIENTE` — não tem `End_*` (confirmado).
  - `:576-598` `criar` grava `End_*` + `Ponto_GPS`; `:603-617` já grava `ClienteGpsLog` (CADASTRO) em try/catch.
  - `:655-960` `atualizar` (PATCH): `podeEditarGPS` `:~714`, `podeEditarCadastro` `:~715`; `End_*` entram no `cadastro` `:842-848` (cidade passa por `cidadeService.resolver(..., {modo:'estrito'})` `:821`; `validarIe(ie, uf)` `:759`); ponto passa por `registrarMudanca` `:855-895` ANTES do `cliente.update` `:~897`; auditoria `audit_logs` `:920-950`.
  - `:1170-1176` `atualizarLote` NÃO aceita `End_*` (só vendedor, dias, formas, Ativo) — não precisa de trilha.
- `backend/services/gpsClientesService.js`
  - `:327-395` `registrarMudanca` — **não existe mais pendência**: o comentário `:370-376` registra a decisão do dono (07/2026) "edição manual VALE NA HORA"; nenhum PENDENTE novo é criado. Só `validarPonto` barra (INVALIDO/EMPRESA/DUPLICADO ≤5 m; PROXIMO ≤30 m só com `autorizacao`). `AJUSTE_LIVRE_M=100`: mover mais que isso zera o selo.
  - `:464` `decidirPendencia`, `:494` `aplicarPendenciasLegadas` (flag, já rodou), `:536` `desfazerMudanca` (grava `Ponto_GPS = pontoAntigo`).
  - `:409` `ultimaMudancaPonto` (selo "quem atualizou o GPS") lê o último `ClienteGpsLog` MUDANCA/APLICADO e compara com o ponto atual.
  - `:714` `geocodeEndereco` (Nominatim 1 req/s + fallback BrasilAPI por CEP, cache 24 h), `:785` `geocodeEnderecoDoCliente(uuid)` (só do endereço ATUAL).
- `backend/routes/gpsClientesRoutes.js`: `GET /historico` `:~209` (por cliente: tudo; global: sem PENDENTE), `POST /historico/:id/desfazer` `:~237` (exige `Pode_Autorizar_Ponto_Gps`), `POST /cliente/:uuid/ponto` `:~110`, `na-porta` `:~130`.
- `backend/routes/clienteRoutes.js:7-16` (montado em `/api/clientes`, `index.js:157`). Ordem importa: `/:uuid/...` deve ficar antes de `/:uuid`.
- `backend/services/cidadeService.js` + `backfillCidadesService.js` (fusão/renomeio de cidade reescreve `End_Cidade` em massa via `updateMany` `:742`).

Quem ESCREVE `End_*` / `Ponto_GPS` em `clientes` (grep no repo inteiro, `--include='*.js'`):
| Caminho | Escreve | Tratamento |
|---|---|---|
| `clienteController.criar` | End_* + ponto | trilha tipo CRIACAO |
| `clienteController.atualizar` | End_* + ponto (limpar ponto `:879`) | trilha |
| `gpsClientesService.registrarMudanca` (POST /ponto, na-porta, Saúde GPS, Rota, Motorista) | ponto | trilha |
| `gpsClientesService.desfazerMudanca` | ponto | trilha (origem DESFAZER_GPS) |
| `gpsClientesService.decidirPendencia` | ponto | trilha (legado, só por completude) |
| `backfillCidadesService.fundirCidade` / `cidadeService.fundir|renomear` | End_Cidade em massa | **não** loga linha a linha; pego pelo reconciliador (item 4.4) |
| `routes/fornecedores.js:264` | cria cliente só-fornecedor (cidade/UF) | ignorar (nasce inativo, sem endereço) |
| `contaAzulService.syncClientes` `:504` | End_* | **código morto** (nenhum chamador; CA somente leitura) — ignorar |
| `scripts/*`, `adminExec` | pontuais | ignorar; reconciliador cobre |
| `entregas.js:357,466` | NÃO escreve (é `lead.pontoGps` mapeado na resposta) | — |
`atualizarLote` não toca endereço.

Frontend
- `frontend/src/pages/Clientes/DetalheCliente.jsx`: aba qualidade `:647-690` (2 montagens de `<QualidadeGps>`: com e sem pendências); `podeEditarCadastroCA :109` e `podeEditarPontoGps :111` já espelham exatamente `podeEditarCadastro`/`podeEditarGPS` do backend; "Histórico do ponto" na aba Cadastro `:1235-1277` (carrega por `gpsClientesService.historico(uuid)` em `:238` e `:490`); atenção: a aba `historico` da ficha é de ATENDIMENTOS/pedidos — não confundir.
- `frontend/src/components/Clientes/QualidadeGps.jsx`: mini-mapa Leaflet só-leitura (`h-32`, `pointer-events-none`, `dragging:false`) `:90-110`, `ModalPontoGps` `:148`.
- `frontend/src/components/ModalPontoGps.jsx`: já desenha ponto atual apagado + endereço geocodificado (referência de estilo de marcador).
- `frontend/src/utils/gpsQuemAtualizou.js`: `TELA_POR_ORIGEM`, `formatarDataHora`, `acaoHistorico` (reaproveitar).
- `frontend/src/services/gpsClientesService.js`: `historico`, `desfazer`, `geocodeEndereco`. Consumidores de `/gps-clientes/historico`: `DetalheCliente.jsx:238,490` e `SaudePontosGps.jsx:117,127` — **este endpoint não muda**.

## 3. Decisão de armazenamento (recomendação)

**Tabela nova `clientes_endereco_log` com snapshot JSON de/para (sua preferência), mantendo `ClienteGpsLog` intacto, e listagem unificada que mescla o legado.**

Por quê (e o que descartei):
- *Estender `CAMPOS_AUDITADOS_CLIENTE`/`audit_logs`*: descartado. `audit_logs` guarda `detalhes` como texto, sem índice por cliente+data, e o `rotaHistoricaService` lê essa tabela para reconstruir rota de dias passados — misturar centenas de eventos de endereço ali aumenta o custo dessa leitura e arrisca quebrar o caixa retroativo.
- *Unificar dentro de `ClienteGpsLog`*: descartado. Ele tem consumidores com contrato próprio (selo "quem atualizou" `ultimaMudancaPonto`, Saúde GPS, desfazer, `status` PENDENTE/DESFEITO). Enfiar texto de endereço ali muda a semântica dessas telas.
- *Tabela nova*: uma linha = um "salvar" completo, com `antes` e `depois` COMPLETOS (7 campos + ponto). Restaurar vira trivial e à prova de erro (não precisa remontar o estado somando diffs). Ponto continua indo para `ClienteGpsLog` (selo/Saúde GPS seguem funcionando) e a linha nova aponta para ele em `gpsLogId`, o que evita evento duplicado na lista.
- Histórico antigo: os `ClienteGpsLog` MUDANCA existentes em produção entram na lista como eventos `fonte:'GPS_LEGADO'` (só ponto; texto "não registrado"). Sem backfill, sem migração de dados: é só a consulta que une as duas fontes (dedupe: ignora `ClienteGpsLog` cujo id aparece em `gpsLogId` de alguma linha nova). O histórico do ponto não começa do zero.
- Para endereço de TEXTO antes desta entrega não há como reconstruir (nunca foi gravado) — a tela diz "registro de alterações de endereço começou em dd/mm/aaaa" (data da 1ª linha nova do sistema, vinda de `AppConfig` ou do MIN(createdAt) global).

### Schema (adicionar; nada removido)
```prisma
// Trilha do ENDEREÇO completo (texto + ponto). 1 linha = 1 gravação. antes/depois são snapshots completos.
model ClienteEnderecoLog {
  id          String  @id @default(uuid())
  clienteUuid String  @map("cliente_uuid")
  cliente     Cliente @relation(fields: [clienteUuid], references: [UUID], onDelete: Cascade)

  tipo   String @default("ALTERACAO") // ALTERACAO | CRIACAO | RESTAURACAO | SISTEMA (mudança detectada sem autor)
  origem String? // CADASTRO | CADASTRO_NOVO | ROTA | MOTORISTA | SAUDE | PEDIDO | DESFAZER_GPS | RESTAURAR | SISTEMA

  antes  Json? // null em CRIACAO. { End_Logradouro, End_Numero, End_Complemento, End_Bairro, End_Cidade, End_Estado, End_CEP, Ponto_GPS }
  depois Json
  camposAlterados String[] @default([]) @map("campos_alterados")
  distanciaPontoM Int?     @map("distancia_ponto_m") // ponto antes -> depois, se os dois existem

  autorId      String? @map("autor_id")
  autorNome    String? @map("autor_nome")
  posicaoAutor String? @map("posicao_autor")

  gpsLogId       String? @map("gps_log_id")       // ClienteGpsLog criado na mesma gravação (dedupe com o legado)
  restauradoDeId String? @map("restaurado_de_id") // id do evento (ou "gps:<id>") cuja versão foi restaurada
  restauradoLado String? @map("restaurado_lado")  // antes | depois
  restauradoPartes String? @map("restaurado_partes") // tudo | texto | ponto
  motivo String? @db.Text

  createdAt DateTime @default(now()) @map("created_at")

  @@index([clienteUuid, createdAt])
  @@index([gpsLogId])
  @@map("clientes_endereco_log")
}
```
E em `Cliente` (linha ~254): `enderecoLogs ClienteEnderecoLog[]` — campo de relação, **não cria coluna** em `clientes` (a tabela está no teto de colunas). Deploy: `prisma db push` cria a tabela nova, sem risco para as existentes. Índices já no schema.

## 4. Backend — `dev-backend` (ordem)

### 4.1 Service novo `backend/services/clienteEnderecoHistoricoService.js`
- `CAMPOS = ['End_Logradouro','End_Numero','End_Complemento','End_Bairro','End_Cidade','End_Estado','End_CEP','Ponto_GPS']`.
- `foto(uuid, db = prisma)` → snapshot normalizado (trim; vazio → null; ponto formatado `lat,lng` 6 casas).
- `diferencas(antes, depois)` → lista de campos que mudaram. Texto: compara normalizado (trim, vazio=null, **case-sensitive para exibir, mas CEP só dígitos**). Ponto: igual se `haversine < 1 m` (mesma tolerância `TOLERANCIA_MESMO_PONTO_M` do selo).
- `registrar({ clienteUuid, antes, depois, tipo, origem, autor, posicaoAutor, gpsLogId, restauradoDe... })` — **fora de transação, em `try/catch` próprio** (log de falha `[EnderecoHistorico]`, nunca propaga). Não grava se `diferencas` vazio.
- `listar(uuid, { limite = 50 })` — monta a lista unificada (ver contrato 5.1): busca `clienteEnderecoLog` (últimos N) + `clienteGpsLog` tipo MUDANCA dos mesmos N que NÃO estejam em `gpsLogId`; ordena por data desc; calcula `distanciaPontoM`, `podeRestaurar`, `restauradoDe`. Roda o reconciliador antes (4.4).
- `restaurar(uuid, eventoId, { lado, partes, autor, perms, autorizacao, posicaoAutor })` — ver 4.3.
- `geocodeVersao(uuid, eventoId, lado)` — reusa `gpsClientesService.geocodeEndereco` (já tem fila 1 req/s e cache) sobre o snapshot daquela versão.

### 4.2 Ganchos de gravação (cada um em try/catch, depois do ato principal)
1. `clienteController.atualizar`: acrescentar `End_*` e `Ponto_GPS` ao `select` de `atual` (`:~719`) = **foto "antes"** (única leitura extra, no início). Ao final (depois do `cliente.update`), `foto(uuid)` = "depois" e `registrar({ tipo:'ALTERACAO', origem: req.body.origem || 'CADASTRO', autor, gpsLogId: gpsResultado?.logId })`. Chamar `registrarMudanca(..., { trilha:false })` para o ponto não gerar uma 2ª linha no mesmo "salvar". Incluir o caminho de limpar ponto `:879`. Se o `cliente.update` lançar depois de o ponto já ter sido gravado, registrar no `finally` o que de fato mudou (foto depois) — evita ponto movido sem trilha.
2. `clienteController.criar`: `registrar({ tipo:'CRIACAO', antes:null, origem:'CADASTRO_NOVO' })` (já existe bloco best-effort `:603`).
3. `gpsClientesService.registrarMudanca`: devolver também `logId` (campo NOVO, aditivo; consumidores `POST /ponto` e `DetalheCliente` só leem `aplicado/pendente/semMudanca`); novo parâmetro opcional `trilha` (default `true`) que grava a linha de `clientes_endereco_log` após a transação. Novo parâmetro opcional `extraCliente` (objeto com `End_*` já validados) mesclado no `tx.cliente.update` — permite restaurar texto+ponto **atômico** numa transação só. Manter `{ timeout: 20000, maxWait: 10000 }` e a gravação da trilha FORA da `$transaction`.
4. `desfazerMudanca` e `decidirPendencia`: após a transação, `registrar` (origem `DESFAZER_GPS` / `SAUDE`).
5. `gpsClientesRoutes` `/cliente/:uuid/ponto`: passa a gravar trilha automaticamente via item 3 (origem já vem do body: ROTA/SAUDE/MOTORISTA/CADASTRO).

### 4.3 Restaurar — regras (recomendação)
- Rota: `POST /api/clientes/:uuid/endereco-historico/:eventoId/restaurar` (ver contrato 5.2).
- **Permissão** (mesma régua do PATCH, sem inventar permissão nova):
  - `partes: 'texto'` ou `'tudo'` → `admin || clientes.edit || Pode_Editar_GPS` (= `podeEditarCadastro`; o texto vai na NF-e, então não abre para quem só tem `Pode_Executar_Entregas`).
  - `partes: 'ponto'` → `admin || Pode_Editar_GPS || clientes.edit || Pode_Executar_Entregas` (= `podeEditarGPS`).
  - **Não** exige `Pode_Autorizar_Ponto_Gps`: editar ponto já vale na hora para esses perfis (decisão 07/2026) e restaurar é só mais uma edição, que deixa rastro. (`desfazer` do Saúde GPS continua exigindo, é outra tela.) Frontend: `podeEditarCadastroCA` (texto/tudo) e `podeEditarPontoGps` (só ponto) — já são os espelhos exatos.
- **Pendência de ponto CONFIRMADO que move muito: NÃO se aplica.** Esse mecanismo foi removido (07/2026; `registrarMudanca` não cria PENDENTE). A restauração segue o caminho normal: `validarPonto` (barra EMPRESA/DUPLICADO/INVALIDO; PROXIMO ≤30 m só com `autorizacao {vendedorId,senha}` como no modal normal) e, se mover > `AJUSTE_LIVRE_M` (100 m), zera o selo e a repetição das próximas entregas revalida. Um ponto restaurado hoje pode ter virado "duplicado" de outro cliente: responder 422 com `codigo` e `clienteConflito`; a tela oferece "Restaurar só o endereço escrito".
- **Validar TUDO antes de gravar** (nada pela metade): (a) `cidadeService.resolver(End_Cidade, {modo:'estrito'})` — cidade antiga pode ter sido fundida/inativada: erro 400 `CIDADE_NAO_CADASTRADA` com `sugestoes`; (b) `validarIe(ieAtual, UF restaurada)` — restaurar UF diferente pode invalidar a IE atual; erro 400 `IE_INCOMPATIVEL_UF`; (c) `validarPonto` do ponto.
- **Versão sem ponto** (`ponto` null no snapshot, ou evento legado de texto): restaurar NÃO apaga o ponto atual (apagar um bom ponto por restaurar um endereço antigo seria destrutivo). Resposta traz `partesAplicadas` e a tela avisa. Limpar o ponto continua sendo ação explícita do cadastro.
- **Versão só-ponto** (legado `GPS_LEGADO`): só `partes:'ponto'` é possível (`podeRestaurar` texto = false).
- **Não apaga histórico**: grava evento `tipo:'RESTAURACAO'`, `origem:'RESTAURAR'`, `restauradoDeId/Lado/Partes`, autor = quem clicou. O `ClienteGpsLog` do ponto sai com `origem:'RESTAURAR'` (o selo "quem atualizou o GPS" passa a mostrar quem restaurou — correto).
- **Idempotência** (operação que pode rodar duas vezes): se a foto atual já é igual à versão pedida nas partes pedidas → `200 { ok:true, semMudanca:true }`, sem gravar linha nem log (duplo clique não gera 2 eventos). Atomicidade: texto + ponto na mesma `$transaction` via `registrarMudanca({extraCliente})`; se o ponto não mudou (<5 m), `cliente.update` simples só do texto.
- Sem chamada externa (geocode/WhatsApp) dentro da transação. Restaurar **não** dispara aviso por WhatsApp.

### 4.4 Reconciliador (rede de segurança para escritas fora do controller)
Na própria `listar` (e ao abrir a ficha): se existe ≥1 linha da trilha e `foto(atual)` difere do `depois` da última linha (e do último `ClienteGpsLog` aplicado, para o ponto) → inserir linha `tipo:'SISTEMA'`, `origem:'SISTEMA'`, `autorNome: null` ("alteração sem autor registrado"), `antes`=último `depois`, `depois`=atual. Cobre: fusão/renomeio de cidades em massa, scripts, `adminExec`, restauração de backup, falha parcial do item 4.2.1. Limitações a dizer na tela: o horário dessas linhas é o de DETECÇÃO ("detectado em"), não o da mudança real. Sem linha nenhuma (cliente nunca mudou desde a entrega) não cria baseline — evita 1.150 linhas inúteis. Não usar worker/cron nesta entrega.
Anti-duplicata: reconferir a última linha imediatamente antes do `create`; aceitar corrida rara de 2 abas.

### 4.5 Rotas (contrato na seção 5)
- `clienteRoutes.js`: `router.get('/:uuid/endereco-historico', ...)`, `router.get('/:uuid/endereco-historico/:eventoId/geocode', ...)`, `router.post('/:uuid/endereco-historico/:eventoId/restaurar', ...)` — **antes** de `router.get('/:uuid', ...)`, e o controller fino chamando o service.
- Visibilidade da listagem: quem enxerga a ficha (mesma checagem de `detalhar`, inclusive filtro por vendedor se existir). Confirmar lendo `clienteController.detalhar`.

### 4.6 Checagens obrigatórias do dev-backend
- `node --check` e **conferir cada campo do `select`/`create` contra o schema** (lição: campo inexistente passa no node --check e derruba a rota).
- `npx prisma format`/`db push` no banco LOCAL (`hardt_local`) apenas.
- Testes com curl (ver critérios). Não mexer em `/api/ia-consulta` — `iaClienteService.js:69-75` só LÊ endereço; nenhum campo de resposta muda.
- Boy scout `$transaction`: `clienteController.js` e `gpsClientesService.js` já usam `{timeout:20000,maxWait:10000}` nas transações vistas (`:389`, `:483`, `:515`, `:543`); conferir as demais transações do controller (ex.: `criar`) e ajustar se faltar.

## 5. Contrato da API (fechado — back e front trabalham em paralelo)

### 5.1 `GET /api/clientes/:uuid/endereco-historico?limite=50`
```jsonc
{
  "atual": {
    "snapshot": { "End_Logradouro": "...", "End_Numero": "...", "End_Complemento": null, "End_Bairro": "...",
                  "End_Cidade": "...", "End_Estado": "SC", "End_CEP": "89000000", "Ponto_GPS": "-26.9,-49.0" },
    "ultimaMudanca": { "eventoId": "uuid|gps:uuid", "autorNome": "Maria", "origem": "CADASTRO", "em": "2026-10-19T14:03:00.000Z" } // ou null
  },
  "registroDesde": "2026-10-20T00:00:00.000Z",   // início da trilha de TEXTO (null se ainda não há linha)
  "eventos": [
    {
      "id": "uuid" ,                       // legado: "gps:<id do ClienteGpsLog>"
      "fonte": "ENDERECO",                 // ENDERECO | GPS_LEGADO
      "tipo": "ALTERACAO",                 // ALTERACAO | CRIACAO | RESTAURACAO | SISTEMA | MUDANCA_GPS (legado)
      "status": "APLICADO",                // legado pode vir DESFEITO / REJEITADO / PENDENTE; ENDERECO sempre APLICADO
      "origem": "CADASTRO",                // valor cru (o front traduz em tela)
      "autorNome": "Maria" ,               // null em SISTEMA
      "em": "2026-10-19T14:03:00.000Z",
      "antes":  { /* snapshot completo */ } ,   // null em CRIACAO; legado: só { Ponto_GPS } (texto = ausente)
      "depois": { /* snapshot completo */ } ,
      "textoRegistrado": true,             // false em GPS_LEGADO (não há texto para mostrar/restaurar)
      "camposAlterados": ["End_Logradouro","End_Numero","Ponto_GPS"],
      "distanciaPontoM": 310,              // null se não há dois pontos
      "restauradoDe": { "eventoId": "uuid", "em": "...", "autorNome": "João", "lado": "antes", "partes": "tudo" } , // null se não for RESTAURACAO
      "restauravel": { "antes": true, "depois": true },   // false p/ lado sem dado (ex.: antes em CRIACAO)
      "autorizadoPorNome": null            // PROXIMO liberado por (se houver)
    }
  ]
}
```
Campos só são ADICIONADOS no futuro; o front ignora campos desconhecidos. `eventos` ordenado do mais novo ao mais antigo. Erros: 404 cliente.

### 5.2 `POST /api/clientes/:uuid/endereco-historico/:eventoId/restaurar`
Body: `{ "lado": "antes" | "depois" (default "antes"), "partes": "tudo" | "texto" | "ponto" (default "tudo"), "autorizacao": { "vendedorId": "...", "senha": "..." } (opcional, só p/ PROXIMO), "posicaoAutor": "lat,lng" (opcional) }`
200: `{ "ok": true, "semMudanca": false, "partesAplicadas": ["texto","ponto"], "partesIgnoradas": [{"parte":"ponto","motivo":"VERSAO_SEM_PONTO"}], "eventoId": "uuid-da-nova-linha", "atual": { /* snapshot */ } }`
Erros (mesmo formato dos de hoje `{ error, codigo?, clienteConflito?, cidade?, sugestoes? }`):
- 403 sem permissão da `partes` pedida · 404 cliente/evento · 400 `CIDADE_NAO_CADASTRADA` (+`sugestoes`), `IE_INCOMPATIVEL_UF`, `PARTE_INDISPONIVEL` (ex.: texto de evento legado), `VERSAO_VAZIA`
- 422 `EMPRESA` | `DUPLICADO` | `PROXIMO` (+`clienteConflito`) | `INVALIDO` — vindos de `validarPonto`.

### 5.3 `GET /api/clientes/:uuid/endereco-historico/:eventoId/geocode?lado=antes|depois`
200: `{ "geo": "lat,lng" | null, "precisao": "endereco" | "cep" | null, "estimado": true, "motivo": "SEM_ENDERECO" | "GEOCODE_FALHOU" | null }`
Só geocodifica o snapshot daquela versão (não aceita endereço arbitrário). Lento (1 req/s do Nominatim): front mostra spinner e cacheia em memória por `eventoId+lado`.

### 5.4 Inalterados (não mexer)
`GET /api/gps-clientes/historico` · `POST /api/gps-clientes/historico/:id/desfazer` · `GET /api/gps-clientes/cliente/:uuid` · `POST /api/gps-clientes/cliente/:uuid/ponto` (resposta só ganha `logId`).

## 6. Frontend — `dev-frontend` (ordem)

1. `frontend/src/services/clienteService.js`: `enderecoHistorico(uuid)`, `restaurarEndereco(uuid, eventoId, body)`, `geocodeVersao(uuid, eventoId, lado)`.
2. `frontend/src/utils/gpsQuemAtualizou.js`: acrescentar origens em `TELA_POR_ORIGEM`: `CADASTRO_NOVO: 'cadastro novo'`, `DESFAZER_GPS: 'desfazer na Saúde dos pontos'`, `RESTAURAR: 'restauração do histórico'`, `SISTEMA: 'alteração sem autor registrado'`. Helper `resumoMudanca(evento)` → "Rua X, 120 → Rua Y, 45" / "ponto movido 310 m" / "ponto definido" / "cidade: A → B" (campo opcional sempre guardado: nunca interpolar `undefined`).
3. **Componente novo** `frontend/src/components/Clientes/HistoricoEndereco.jsx` (props: `clienteUuid, atual, podeRestaurarTexto, podeRestaurarPonto, onVerNoMapa(versao|null), versaoEmFoco, onRestaurado, compacto=false`):
   - Lista (cards, mobile-first, `rounded-xl border border-gray-200`): data/hora (`formatarDataHora`), autor (**"Sistema"** em SISTEMA, com subtítulo "detectado em"), chip de origem (`telaDaOrigem`), resumo da mudança, selo de tipo (Restauração/Criação/Legado GPS), status DESFEITO riscado em cinza.
   - Em cada evento, as duas versões ("Antes" e "Depois") como linhas clicáveis; a clicada ganha destaque e dispara `onVerNoMapa({ eventoId, lado, snapshot })`. Botões (pílula, `min-h-[44px]`): **Ver no mapa** e **Restaurar** (só se `restauravel[lado]` e permissão; `Restaurar` desabilitado com tooltip/texto quando o lado não tem dado).
   - Restaurar abre modal de confirmação (padrão dos modais existentes): mostra "Endereço atual → Endereço que volta", checkboxes/segmentado "Endereço escrito" e "Ponto no mapa" (ambos marcados por padrão; desabilita o que a versão não tem), aviso "o ponto do mapa não será mexido" quando a versão não tem ponto, aviso "O endereço escrito vai nas notas fiscais". Botão "Restaurar esta versão". Tratar 422 PROXIMO abrindo o fluxo de `autorizacao` já existente no `ModalPontoGps` (reaproveitar o componente/lógica de senha, não duplicar); 422 EMPRESA/DUPLICADO e 400 CIDADE/IE mostram a mensagem do servidor e oferecem "Restaurar só o texto" / "Restaurar só o ponto".
   - Após sucesso: toast, `onRestaurado()` (recarrega lista + `atualizarQualidadeGps` + `formData` do cliente).
   - Estados: carregando (skeleton), vazio ("Ainda não há alterações de endereço registradas. O registro começou em dd/mm/aaaa" usando `registroDesde`), erro (mensagem + tentar de novo; **nunca** deixar a seção em branco silenciosa).
   - `compacto`: 2 últimos + "ver todas" (substitui o "Histórico do ponto" da aba Cadastro, `DetalheCliente.jsx:1235-1277`, para haver UMA fonte de verdade); "ver todas" navega para `setAbaAtiva('qualidade')`.
4. **`QualidadeGps.jsx` — mapa comparativo no card Localização** (mantém `ModalPontoGps` e o resto): aceitar `versaoEmFoco` (estado elevado para o pai para o mapa e a lista conversarem). Com versão em foco:
   - mini-mapa passa de `h-32` para `h-56 md:h-64`, **interativo** (arrastar/zoom ligados; sem scroll-zoom no mobile para não prender a página), `fitBounds` nos dois pontos;
   - marcador **cinza** (`#9CA3AF`) = versão selecionada, **verde** (`#00754A`) = atual, linha tracejada entre eles e rótulo **"310 m de diferença"** (haversine no cliente); legenda abaixo do mapa "Cinza: versão de dd/mm/aaaa hh:mm — Verde: ponto atual";
   - se a versão não tem `Ponto_GPS` mas tem endereço: chamar `geocodeVersao`; marcador cinza **tracejado/oco** com selo "posição estimada pelo endereço (rua)" ou "(só pelo CEP)" conforme `precisao`; falhando, mensagem "Não foi possível estimar a posição deste endereço" e o mapa fica só no atual;
   - botão "Voltar ao ponto atual" (limpa o foco); link OPCIONAL "Abrir no Google Maps" (`target="_blank"`, único `window.open` permitido, é link externo explícito);
   - **Recriar/atualizar** o mapa ao trocar de versão (hoje o efeito de criação roda uma vez só: `if (...|| mapObj.current) return`). Tem que limpar camadas/`invalidateSize()` ao mudar a altura, e destruir no `return` do efeito.
   - ao clicar em versão no mobile, rolar suavemente até o mapa (`scrollIntoView`).
5. `DetalheCliente.jsx`: aba qualidade — nas **duas** montagens de `<QualidadeGps>` (`:656` e `:676`) renderizar `<HistoricoEndereco>` logo abaixo (card próprio "Histórico do endereço", ocupando a largura toda do grid: `md:col-span-2`) e levantar o `versaoEmFoco`. No branch "Tudo certo" (`pendenciasQualidade === 0`) o histórico também aparece. Trocar os dois `gpsClientesService.historico(uuid)` (`:238`, `:490`) pelo novo endpoint no modo compacto. Passar `origem` na gravação do cadastro (`origem: 'CADASTRO'` no corpo do PATCH — já suportado pelo controller).
6. Design: tokens do tema Starbucks (`bg-primary hover:bg-primaryDark`, `rounded-full`), badges padrão, nada de `<select>` nativo (se precisar de filtro de tipo use `SelectBusca`; recomendo NÃO ter filtro nesta versão). Sem animar `box-shadow`. Textos ≥ `text-gray-500` (legibilidade). Sem `position:absolute` com offset negativo em grid.
7. **Build**: `cd frontend && npm run build` antes de entregar.

## 7. Documentação/entrega que acompanha (checklist do projeto)
- Manual: `backend/manuais/abas/clientes.md` — nova seção "Histórico do endereço (aba Qualidade dos dados)": quem/quando/tela, ver no mapa (cinza × verde, estimado), restaurar (o que restaura, permissões, "não apaga o histórico", aviso da NF-e, versão sem ponto não apaga o ponto), limitação "alterações anteriores a dd/mm só têm o ponto" e "Sistema = alteração sem autor registrado". Atualizar também `backend/manuais/abas/saude-pontos-gps.md` (se existir) com 1 linha. `copilotoService.js` tabela `ABAS`: **sem mudança** (nenhuma rota/permissão de tela nova).
- Novidade: `frontend/public/novidade-historico-endereco.html` (espelhar `novidade-cadastro-clientes.html`, accordions abertos, **mockups com pins numerados** das telas: lista de versões, mapa cinza×verde, modal Restaurar; sem `og:image`; sem botão "Abrir o app") + entrada no topo de `frontend/public/novidades.json` + texto pronto para o grupo.
- `node --check` e build. Não mexe em `iaConsultaRoutes`, então `ia-consulta-api.md` não muda.
- Teste em PRODUÇÃO após o deploy (tabela nova criada pelo `db push` no boot): `GET .../endereco-historico` responde 200 (não 404/500) → editar um endereço de um cliente de teste → aparece a linha → restaurar → aparece "Restauração". Nada grava arquivo, então o ciclo "atravessar deploy" é só confirmar que a tabela existe.

## 8. Riscos e efeitos colaterais
1. **NF-e/Fiscal**: `utils/cadastroFiscal.js:28-33` e `focusNfeEmissaoService` usam `End_*` do cliente. Restaurar muda o endereço da próxima nota. Mitigação: permissão `podeEditarCadastro`, aviso no modal, validação de cidade+IE×UF antes de gravar. NF já emitida não muda (snapshot na nota). Nenhum arquivo de NF-e de devolução é tocado.
2. **Selo/Saúde GPS**: ponto restaurado entra por `registrarMudanca` → `ClienteGpsLog` (origem RESTAURAR) → `ultimaMudancaPonto` e Saúde continuam coerentes. Se alguém gravasse ponto direto no `cliente.update`, o selo "quem atualizou" ficaria sem autoria — por isso proibido.
3. **Contrato `/gps-clientes/historico`**: inalterado (consumidores: ficha e Saúde GPS). `registrarMudanca` ganha `logId` (aditivo) e parâmetros opcionais com default — chamadores atuais (`gpsClientesRoutes /ponto`, `na-porta`, `clienteController.atualizar`) seguem funcionando.
4. **Escrita fora do controller**: cidades em massa, scripts, backup restaurado → reconciliador (4.4), com o limite do "horário = detecção".
5. **Crescimento**: ~1 linha por salvar de endereço; JSON pequeno (<1 KB). `listar` limita a 50 + paginação futura (`?antes=<createdAt>`). Índice `(clienteUuid, createdAt)`.
6. **Geocode**: Nominatim 1 req/s compartilhado — várias pessoas clicando em "ver no mapa" de versão sem ponto enfileiram; cache de 24 h e cache no front mitigam. Não geocodificar automaticamente ao abrir a lista, só ao clicar.
7. **Leaflet**: o mini-mapa atual é criado uma vez e destruído só na troca de cliente — trocar de versão exige recriar/limpar camadas (bug típico: mapa cinza/tiles cortados após mudar a altura → `invalidateSize()`).
8. **Dois "históricos" na ficha** (aba Atendimentos chama `historico`): usar o rótulo "Histórico do endereço".
9. **Permissão `Pode_Executar_Entregas`** entra em `podeEditarGPS` mas NÃO em `podeEditarCadastro`: motorista pode restaurar só o ponto, não o texto. O front precisa esconder a opção "Endereço escrito" para ele (espelho exato).
10. `clientes` está no teto de colunas — por isso nada de coluna nova nela; só tabela lateral.

## 9. O que NÃO fazer
- Não mudar formato/semântica de `ClienteGpsLog` nem de `GET /gps-clientes/historico`; não remover `ultimaMudancaPonto`.
- Não restaurar com `prisma.cliente.update` direto no ponto (pula `validarPonto`, selo e log).
- Não colocar a gravação da trilha, geocode ou qualquer chamada externa dentro da `$transaction`; trilha falhar nunca desfaz nem bloqueia salvar/restaurar.
- Não apagar nem editar linhas do histórico (restaurar = nova linha). Não usar `onDelete` diferente de Cascade no cliente (apagar cliente leva a trilha, igual `ClienteGpsLog`).
- Não geocodificar endereço arbitrário vindo do cliente da API (só snapshot de evento do próprio cliente).
- Não usar `window.open`/iframe para o mapa; nada de mapa externo embutido.
- Não popular baseline em massa para os ~1.150 clientes.
- Não confiar em checagem só no frontend: o 403 do restaurar é do backend.
- Não tocar em NF-e de devolução, WhatsApp nem `/api/ia-consulta`.

## 10. Critérios de aceite (QA clica de verdade — app local + banco `hardt_local`)
Back (curl):
1. `PATCH /api/clientes/:uuid` mudando só `End_Numero` → `GET .../endereco-historico` traz 1 evento ALTERACAO com autor correto, `antes/depois` completos, `camposAlterados:["End_Numero"]`.
2. PATCH mudando texto **e** ponto no mesmo salvar → **1** evento (não 2) com `gpsLogId` preenchido; `GET /gps-clientes/historico?clienteUuid` continua mostrando o log do ponto; `GET /gps-clientes/cliente/:uuid` → `ultimaMudanca` com o autor.
3. `POST /gps-clientes/cliente/:uuid/ponto` (origem ROTA) cria evento com origem ROTA.
4. Cliente com `ClienteGpsLog` antigo e nenhuma linha nova → a lista traz esses eventos como `GPS_LEGADO`, sem duplicar os que têm linha nova.
5. Restaurar `lado:'antes'` `partes:'tudo'` → 200; cliente volta ao snapshot; nova linha RESTAURACAO com `restauradoDeId`; linha original intacta. **Repetir a mesma chamada** → `semMudanca:true`, nenhuma linha nova.
6. Restaurar versão cuja cidade foi inativada → 400 `CIDADE_NAO_CADASTRADA`, **nada** alterado. Restaurar UF que invalida a IE → 400 `IE_INCOMPATIVEL_UF`, nada alterado.
7. Ponto da versão a ≤5 m de outro cliente → 422 DUPLICADO; a ≤30 m → 422 PROXIMO e passa com `autorizacao` válida; texto continua restaurável com `partes:'texto'`.
8. Versão sem ponto: `partes:'tudo'` restaura o texto e **mantém** o ponto atual (`partesIgnoradas`).
9. Usuário com só `Pode_Executar_Entregas`: restaurar `texto/tudo` → 403; `ponto` → 200. Usuário sem permissão nenhuma de edição → 403. Perfil "Producao" (permissões como objeto) não passa por `!!perms.clientes`.
10. Escrita fora do controller (UPDATE direto de `End_Bairro` no banco local) → próxima `GET` cria linha `SISTEMA` e depois disso não cria outra (idempotente).
11. `GET .../geocode?lado=antes` de versão com endereço → `estimado:true` e `geo`; sem endereço → `motivo:SEM_ENDERECO`.
Front (navegador automatizado, desktop 1280 e mobile 375/320):
12. Ficha → aba **Qualidade dos dados** mostra o card **Histórico do endereço** abaixo de Localização, tanto com pendências quanto em "Tudo certo". Sem scroll horizontal em 320 px; botões ≥ 44 px.
13. Clicar numa versão antiga → o mapa do card Localização mostra marcador cinza (antiga) + verde (atual) + linha e "N m de diferença"; "Voltar ao ponto atual" restaura o mapa original. Trocar de versão várias vezes não deixa mapa quebrado/cortado.
14. Versão sem ponto → marcador oco "estimada pelo endereço"; geocode falho → mensagem, sem erro vermelho.
15. Restaurar pelo modal: confirma → toast, lista ganha "Restauração por <você>", mapa e Localização mostram o ponto restaurado, aba Cadastro mostra o endereço restaurado (sem recarregar a página); selo "quem atualizou" mostra você.
16. Caminhos de erro na tela: 422 DUPLICADO/EMPRESA e 400 cidade/IE mostram mensagem clara e oferecem restaurar só texto/só ponto; falha de rede mostra erro com "tentar de novo" (seção nunca fica em branco).
17. Aba Cadastro: o bloco antigo "Histórico do ponto" agora é o mesmo componente (compacto) e "ver todas" leva à aba Qualidade; Saúde dos Pontos GPS segue funcionando (histórico global + desfazer).
18. Editar endereço pela ficha e salvar → o evento aparece em segundos na lista (recarrega após salvar), com sua origem "cadastro do cliente".
Revisor confere: nenhum `$transaction` sem timeout/maxWait nos arquivos tocados; trilha fora da transação em try/catch; `select` contra o schema; `!perms.x` vs objeto; `window.open` ausente; manual + novidade + `novidades.json` presentes; `ultimaMudancaPonto`/`/gps-clientes/historico` intactos; build passou.

## 11. Divisão de tarefas (paralelas após o contrato da seção 5)
**dev-backend**: schema (3) → service novo (4.1) → ganchos (4.2) → rotas (4.5) → restaurar (4.3) → reconciliador (4.4) → curl dos critérios 1-11 → manual (parte backend/manuais) → entrega do relatório com saídas dos curl.
**dev-frontend** (pode começar com dados simulados seguindo o JSON da 5.1): serviço (6.1) → utils (6.2) → `HistoricoEndereco.jsx` (6.3) → mapa comparativo em `QualidadeGps.jsx` (6.4) → ligação no `DetalheCliente.jsx` (6.5) → build → novidade HTML + `novidades.json`.
Costura (lição das entregas passadas): front só considera pronto após rodar contra o backend real; QA testa explicitamente o caminho de erro na tela (critério 16) e o caso "permissão só de ponto" (critério 9).
Ordem de publicação: backend primeiro (tabela + rotas), frontend depois; front antigo continua funcionando (nada removido).

## 12. Decisões que dependem do dono (não bloqueiam o começo)
- Restaurar permitido também a quem só tem `Pode_Executar_Entregas` para o PONTO (recomendado: sim, é o que ele já pode editar).
- Aceitar que endereço **escrito** anterior a esta entrega não aparece (nunca foi gravado); o ponto antigo aparece pelo legado.
