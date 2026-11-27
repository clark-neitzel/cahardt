# Plano — Chat do Luke + webhook (CA-Hardt)

Código lido em `/Users/clarksonneitzel/Projetos/CA-Hardt-wt-forn` (`23af0330`) e o diff em andamento do D1 em `/Users/clarksonneitzel/Projetos/CA-Hardt-wt-d1`. Nada foi alterado. Porte: **grande** (permissões, upload, integração externa, agente) — equipe completa em cada fatia.

## 1. Entendimento do pedido

O dono quer um lugar dentro do app para a equipe falar com o Luke (BPO financeiro): mandar comprovante ou nota e receber a resposta. Cada pessoa tem a própria conversa; o admin vê todas. Tem que abrir bem no celular e no computador. O webhook é o meio para o Luke ser avisado na hora.

Interpretação adotada: uma conversa contínua por usuário, sem tópicos. "Recursos modernos" entram em fases, sem inflar a fase 1.

## 2. Mapa do código atual (o que muda o desenho)

| Fato confirmado | Onde |
|---|---|
| `GET /api/agente/v1/**` é sempre liberado para **qualquer** agente; POST ali resolve BLOQUEADO | `backend/config/agentePoliticaPadrao.js:40-43`, `agentePoliticaService.js:68, 97` |
| A trava "escrita não pode ser LIBERADA" vale só para exceções do dono; "sempre liberado" é avaliado antes dela | `agentePoliticaService.js:72, 216` |
| Família desconhecida = BLOQUEADO, então o token do agente nunca alcança `/api/chat-luke/*` | `agentePoliticaPadrao.js:13, 94` |
| A solicitação muda de estado em 6 pontos, 3 deles por `updateMany` sem ids (expirar, indeterminar, recusar em massa) | `agenteSolicitacaoService.js:339, 347, 515, 570, 589, 630` |
| `expirarVencidas` também roda dentro de requisição do agente | `agenteSolicitacaoService.js:417, 429` |
| A execução autorizada é finalizada no contexto do admin humano; só a chamada loopback roda como agente | `agenteSolicitacaoService.js:547-548` |
| `assertNaoAgente` é opt-in: só barra o serviço que o chama | `backend/utils/agenteContexto.js` |
| Fila com backoff pronta para espelhar: `status/tentativas/proximaEm/ultimoErro`, worker de 5 min | `botWhatsappService.js:61, 413-470`, `schema.prisma:2835`, `workers/scheduler.js:337-343` |
| Anexo genérico já existe: tabela `anexos`, magic bytes (PDF/JPG/PNG/WebP/XML), sha256, 404 `ARQUIVO_PERDIDO`, pasta `../uploads/anexos` | `backend/services/anexoService.js:17-19, 53, 155, 242` |
| `/uploads/anexos` já responde 403 no estático, e `uploads` inteiro entra no backup diário | `backend/index.js:146`, `backupService.js:34` |
| **Furo a evitar:** em `/api/anexos/:id/arquivo`, quem é `admin` abre anexo de qualquer `entidadeTipo` | `backend/routes/anexos.js:32-37, 149` |
| Não há tratamento de HEIC em lugar nenhum; o front já tem compressão para JPEG via canvas | `frontend/src/utils/comprimirFoto.js` |
| **O Clippy só existe no computador** (`hidden lg:block`); no celular não há botão embaixo hoje | `frontend/src/components/Clippy/Clippy.jsx:187`, `App.jsx:896` |
| Clippy: mascote arrastável, balança com `novidades.json`, permissão ligada por padrão (só `=== false` desliga) | `Clippy.jsx:52-68`, `PermissoesModal.jsx:159, 262` |
| Já existe botão flutuante no canto inferior direito na tela de rota do vendedor; 8 telas têm barra `fixed bottom-0` | `frontend/src/pages/Rota/RotaLeads.jsx:2702` |
| SSE já funciona no projeto (flush, `X-Accel-Buffering`, ping de 15 s); nginx com `proxy_buffering off` e 300 s | `backend/routes/comoFazerRoutes.js:229-240`, `frontend/Dockerfile` |
| `compression()` é global; o JSON global é limitado a 100 KB | `backend/index.js:112, 129` |
| O service worker não intercepta `/api` | `frontend/public/sw.js:154` |
| `Vendedor` não tem campo "papel" | `schema.prisma:954` |
| Usuário externo (contador) só alcança `/api/contabilidade` | `authMiddleware.js:16` |
| Não há web-push nem assinatura de push | `backend/package.json`, `sw.js` |
| Um teste espera 200 em todo GET de `/api/agente/v1` do catálogo | `backend/tests/agentePolitica.test.js:177` |
| Selo de pendentes usa polling de 60 s + `visibilitychange` | `frontend/src/hooks/useSolicitacoesAgente.js:10, 41` |

Não confirmei: se o backend roda em uma instância só; se o `sharp` deste build decodifica HEIC; o que o endpoint `api2.cursor.sh` valida (HMAC ou Bearer); os códigos exatos de `agenteTokenService.validarToken`.

## 3. Decisões de arquitetura

1. **Webhook = fila no banco, espelhando `bot_whatsapp_envios`.** Tabela `luke_webhook_eventos`, serviço `lukeWebhookService` (`enfileirar`, `processarFila`, `reenviar`), tick próprio de 15 s no scheduler com trava de "rodando".
2. **Evento de solicitação nasce por varredura, não por gancho em cada transição.** O tick procura solicitações em estado final alteradas desde o marco de ativação e cria o evento com chave de deduplicação `sol:<id>:<status>:<execComecouEm>`.
   - Cobre os 3 `updateMany`.
   - Não toca em `authMiddleware.js`.
   - Não acrescenta coluna em `agente_solicitacoes`.
   - Marco de ativação em `AppConfig` (`luke_webhook_inicio`), para não disparar o histórico no primeiro deploy.
3. **Contexto de agente.** `lukeWebhookService` não importa `assertNaoAgente`. O POST externo sai só do worker (sem contexto) ou do "acorda fila" chamado na rota JWT do usuário.
   - A resposta do Luke não gera evento, então não há laço.
   - Brecha: nenhuma. A URL vem só de env, o corpo é montado pelo servidor, e o reenvio é rota de admin humano.
4. **Evento magro.** O que sai para o terceiro leva só ids, tipo, status e URL relativa. Texto, nome, resumo e arquivo o Luke busca pela API autenticada.
5. **Anexo reaproveita a tabela `anexos`** com `entidadeTipo='CHAT_LUKE'` e `entidadeId=<mensagemId>`. Ganha magic bytes, sha256, caminho persistente e 404 de arquivo perdido sem modelo novo.
   - Obrigatório: bloquear `CHAT_LUKE` nas três rotas de `routes/anexos.js` (GET arquivo, PATCH, DELETE), inclusive para admin. Abre-se só pelas rotas do chat.
   - Excluir `CHAT_LUKE` do aviso de duplicidade das outras telas.
6. **Upload em uma requisição só.** `POST /api/chat-luke/mensagens` em multipart (texto + `arquivos[]`), com `Idempotency-Key` gerada no aparelho. Sem anexo órfão e sem job de limpeza.
7. **Foto sempre passa por `comprimirFoto` no aparelho** (vira JPEG de ~350 KB). Resolve o HEIC do iPhone no Safari e o 3G na rua. O backend não aceita HEIC; a mensagem de recusa explica.
8. **Estado da solicitação na bolha é derivado na leitura** (join da tabela de vínculo com `agente_solicitacoes`). A varredura só "toca" a mensagem ligada para o polling perceber.
9. **POST do Luke = sempre liberado por regra exata**, não pela matriz: `POST /api/agente/v1/chat/conversas/:id/mensagens`. É mensagem, não gravação financeira.
10. **Qual agente atende o chat.** Como todo GET de `/api/agente/v1` é liberado a qualquer agente, o roteador do chat exige `req.user.id === AppConfig['chat_luke'].agenteId`. Outro agente recebe 403 `AGENTE_CHAT_NAO_HABILITADO`. Módulo `chat` na matriz do D1 fica como evolução.
11. **Idempotência própria:** `@@unique([conversaId, chaveIdempotencia])` na mensagem. Não depende de `agente_idempotencia`; o interceptador do D1 só roda em `decisao.matriz === true`, e o chat não passa por ele.
12. **Tempo real: polling.** 4 s com o chat aberto e visível; 60 s para o contador com o chat fechado; pausa com a aba oculta; busca imediata ao voltar. Cursor por `atualizadoEm`.
    - SSE é viável, mas `EventSource` não manda `Authorization` (teria de ser fetch-stream) e exige barramento se houver mais de uma instância. Só se o polling incomodar.
    - WebSocket: não.
13. **Clippy — recomendação única: um botão só, com abas "Luke" e "Ajuda".**
    - Tem os dois: botão do Luke; a aba Ajuda é o Clippy embutido; novidade continua balançando o botão e abre na aba Ajuda.
    - Só Clippy: fica exatamente como hoje.
    - Só Luke: botão do Luke, sem aba Ajuda.
    - Celular: só Luke (o Clippy nunca existiu lá).
    - Implementação: extrair `useNovidades()` e dar ao `Clippy.jsx` a prop `embutido`.

## 4. Divergências spec × código

| # | Spec do Luke | Código real | Decisão |
|---|---|---|---|
| 1 | Status `REJEITADA` | `RECUSADA` | Usar `RECUSADA` |
| 2 | 4 estados finais | Existe `ERRO_INDETERMINADO` | Enviar também; o Luke não reenvia, espera o dono |
| 3 | 400 `CHAVE_NA_URL` | 400 `TOKEN_NA_URL` | Manter o atual |
| 4 | 429 `LIMITE_MINUTO`, 300/min | `LIMITE`, 120/min por token, com `Retry-After` | Manter o atual |
| 5 | 401 `NAO_AUTENTICADO`, 403 `ESCOPO_INSUFICIENTE` | 401 sem `codigo` no JWT; formato `{ error, codigo }` | 403 `AGENTE_CHAT_NAO_HABILITADO`; não inventar os outros |
| 6 | Campos `conversaId/mensagemId` na solicitação | D1 está mexendo no mesmo modelo | Tabela de vínculo nova; zero coluna em tabela existente |
| 7 | Retry 2 s/8 s/30 s/120 s, 5 tentativas | Padrão da casa é fila no banco | 15 s, 1 min, 5 min, 30 min, 2 h (6 tentativas), depois `FALHA` + reenvio manual |
| 8 | Evento leva texto, nome, papel, resumo, quem autorizou | Destino é terceiro | Evento magro |
| 9 | `usuario.papel` | Campo não existe | Devolver `admin: true/false` na API |
| 10 | Datas com `-03:00` | A API do agente devolve ISO UTC | Manter UTC |
| 11 | Upload separado + anexo órfão | — | Multipart único com `Idempotency-Key` |
| 12 | `ChatLukeAnexo` novo | `anexos` + `anexoService` existem | Reaproveitar |
| 13 | HEIC aceito no servidor | Sem suporte | Converter no aparelho; servidor recusa HEIC |
| 14 | PDF na fase 2 | `anexoService` já valida PDF | PDF na fase 1 |
| 15 | Substituir o clipe embaixo | Clippy é só desktop e é o canal das novidades | Botão único com abas |
| 16 | Sem permissão, "o clipe não volta" | Permissão do Clippy é independente | Quem só tem Clippy segue igual |
| 17 | Status gravado com 5 valores | — | Gravar só `ENVIADO/PROCESSANDO/RESPONDIDO/ERRO`; "aguardando autorização" é derivado |
| 18 | Agente baixa anexo de qualquer conversa | Qualquer agente lê `/api/agente/v1` | Só o agente configurado |
| 19 | Admin somente leitura (fase 2) | — | Manter, com permissão própria e auditoria |
| 20 | Vínculo de origem por header | Com a matriz do D1 em SIM não nasce solicitação | Vínculo só existe em PEDE; no SIM o Luke responde por texto |
| 21 | `Idempotency-Key` "já usada na API" | Nenhuma rota lê hoje (`agenteSolicitacaoService.js:40`) | Própria do chat |
| 22 | 503 `NAO_CONFIGURADA` | — | Sem agente configurado o usuário ainda grava; a tela avisa "Luke ainda não conectado" |

## 5. Modelo de dados (só adições, no fim do `schema.prisma`)

```prisma
model ChatLukeConversa {
  id               String    @id @default(uuid())
  usuarioId        String    @unique @map("usuario_id")
  usuarioNome      String    @map("usuario_nome")
  ultimaMensagemEm DateTime? @map("ultima_mensagem_em")
  lidaUsuarioEm    DateTime? @map("lida_usuario_em")
  criadoEm         DateTime  @default(now()) @map("criado_em")
  atualizadoEm     DateTime  @updatedAt @map("atualizado_em")
  mensagens        ChatLukeMensagem[]
  @@index([ultimaMensagemEm])
  @@map("chat_luke_conversas")
}

model ChatLukeMensagem {
  id                String   @id @default(uuid())
  conversaId        String   @map("conversa_id")
  autor             String   // USUARIO | LUKE | SISTEMA
  usuarioId         String?  @map("usuario_id")
  texto             String?  @db.Text
  assunto           String?  // LANCAMENTO | NOTA | CORRECAO | DUVIDA | FECHAMENTO
  tipo              String   @default("TEXTO") // TEXTO | PENDENCIA (fase 2)
  status            String   @default("ENVIADO") // ENVIADO | PROCESSANDO | RESPONDIDO | ERRO
  respondeA         String?  @map("responde_a")
  pendenciaAberta   Boolean  @default(false) @map("pendencia_aberta")
  chaveIdempotencia String?  @map("chave_idempotencia")
  qtdAnexos         Int      @default(0) @map("qtd_anexos")
  criadoEm          DateTime @default(now()) @map("criado_em")
  atualizadoEm      DateTime @updatedAt @map("atualizado_em")
  conversa          ChatLukeConversa @relation(fields: [conversaId], references: [id])
  solicitacoes      ChatLukeMensagemSolicitacao[]
  @@unique([conversaId, chaveIdempotencia])
  @@index([conversaId, criadoEm])
  @@index([conversaId, atualizadoEm])
  @@map("chat_luke_mensagens")
}

model ChatLukeMensagemSolicitacao {
  mensagemId    String @map("mensagem_id")
  solicitacaoId String @map("solicitacao_id") // sem FK
  origem        String @default("LUKE") // LUKE (solicitacaoIds) | HEADER (X-Origem-*)
  criadoEm      DateTime @default(now()) @map("criado_em")
  mensagem      ChatLukeMensagem @relation(fields: [mensagemId], references: [id])
  @@id([mensagemId, solicitacaoId])
  @@index([solicitacaoId])
  @@map("chat_luke_mensagem_solicitacoes")
}

model LukeWebhookEvento {
  id            String    @id @default(uuid()) // = eventoId
  tipo          String    // solicitacao.atualizada | chat.mensagem | chat.lembrete (fase 3)
  chaveDedupe   String    @unique @map("chave_dedupe")
  status        String    @default("PENDENTE") // PENDENTE | ENVIADO | FALHA | DESLIGADO
  tentativas    Int       @default(0)
  proximaEm     DateTime? @map("proxima_em")
  httpStatus    Int?      @map("http_status")
  ultimoErro    String?   @map("ultimo_erro")
  solicitacaoId String?   @map("solicitacao_id")
  conversaId    String?   @map("conversa_id")
  mensagemId    String?   @map("mensagem_id")
  payload       Json
  criadoEm      DateTime  @default(now()) @map("criado_em")
  enviadoEm     DateTime? @map("enviado_em")
  @@index([status, proximaEm])
  @@index([tipo, criadoEm])
  @@map("luke_webhook_eventos")
}

// Fase 3
model ChatLukeLembrete {
  id         String    @id @default(uuid())
  conversaId String    @map("conversa_id")
  mensagemId String?   @map("mensagem_id")
  texto      String    @db.Text
  quandoEm   DateTime  @map("quando_em")
  status     String    @default("AGENDADO") // AGENDADO | DISPARADO | CANCELADO
  criadoPor  String    @map("criado_por") // USUARIO | LUKE
  criadoEm   DateTime  @default(now()) @map("criado_em")
  @@index([status, quandoEm])
  @@map("chat_luke_lembretes")
}
```

- Anexos: tabela `anexos` existente (`entidadeTipo='CHAT_LUKE'`). Mudança só em código: `ENTIDADES` de `anexoService`.
- `AppConfig`: chaves `chat_luke` (`{ agenteId, ativo }`) e `luke_webhook_inicio`.
- Permissões novas: `Pode_Usar_Chat_Luke` e `Pode_Ver_Chat_Luke_Todos`, ambas com padrão `false` e `noBulk`. Check sempre `=== true` (ou `admin === true`), idêntico no front e no back.

## 6. Envs (EasyPanel, serviço do backend)

| Variável | Uso |
|---|---|
| `LUKE_WEBHOOK_URL` | Só `https://`. Vazio = eventos nascem `DESLIGADO` |
| `LUKE_WEBHOOK_SECRET` | Nunca em log, resposta, tela ou banco |
| `LUKE_WEBHOOK_AUTH` | `hmac` (padrão) ou `bearer` |

No ambiente local as três ficam vazias. O QA usa um receptor local (servidor Node de teste), nunca o endpoint real.

## 7. Fatias

### Fatia 0 — sem código de produto (começa agora, não espera o D1)
- `dev-frontend`: preview `docs/preview-chat-luke.html` com botão Computador/Celular (seção 9).
- Gerente: mandar ao Luke o contrato da seção 10 e levar ao dono as decisões da seção 11.
- Aceite: dono aprova o preview; Luke confirma HMAC ou Bearer.

### Fatia A — Webhook de solicitações (backend, invisível) — depois do D1 publicado
- **Novos:** `backend/services/lukeWebhookService.js`, `backend/routes/lukeWebhookAdminRoutes.js` (`GET /api/agentes-webhook/eventos`, `POST …/:id/reenviar`), `backend/tests/lukeWebhook.test.js`, `backend/docs/luke-webhook.md`.
  - O prefixo `agentes-webhook` casa com o bloqueio fixo `^/api/agentes`; a rota exige admin humano.
- **Alterados:** `schema.prisma` (modelo no fim), `workers/scheduler.js` (bloco novo no fim), `index.js` (1 mount).
- **Ordem:** modelo → serviço (assinar o corpo cru; `redirect:'error'`; timeout 10 s; guardar só o status HTTP e erro de até 300 caracteres) → varredura com marco de ativação → rotas admin → testes.
- **Aceite:**
  1. Autorizar, recusar, expirar e forçar erro geram um evento cada, com `eventoId` estável nos reenvios.
  2. A assinatura confere com script local.
  3. Destino 500 ou timeout reagenda; 400 vira `FALHA` sem laço; reenviar funciona.
  4. Env vazia: solicitação funciona igual, evento `DESLIGADO`.
  5. `grep` do segredo em log e resposta dá zero.
  6. O primeiro deploy não dispara o histórico.
  7. Repetir um `ERRO_INDETERMINADO` gera evento novo.
  8. Os testes de política e de solicitações passam sem alteração.
- **Riscos:** tick de 15 s no banco compartilhado (consulta indexada, limite 20, trava de sobreposição); rajada de eventos no deploy (o marco resolve).
- **Rollback:** esvaziar `LUKE_WEBHOOK_URL`, sem deploy. Tabela pode ficar.

### Fatia B1 — Chat, backend (invisível: ninguém tem a permissão)
- **Novos:** `backend/services/chatLukeService.js`, `backend/routes/chatLukeRoutes.js` (JWT), `backend/routes/agenteChatV1Routes.js`, `backend/tests/chatLuke.test.js`, `backend/docs/chat-luke-api.md`.
  - `agenteChatV1Routes.js` é montado em `/api/agente/v1/chat` numa linha própria do `index.js`, **antes** da linha de `/api/agente/v1`. Assim `agenteApiV1Routes.js` não é tocado.
- **Alterados:**
  - `schema.prisma` (3 modelos).
  - `agentePoliticaPadrao.js`: 1 regra POST exata em `REGRAS_SEMPRE_LIBERADO`.
  - `agenteSolicitacaoService.js`: `lerPedido` devolve `origem` lida de `X-Origem-Conversa/Mensagem` (UUID válido ou ignora); depois de criar, grava o vínculo em `try/catch` próprio, fora da transação; id inválido só gera aviso no log.
  - `anexoService.js`: `ENTIDADES += 'CHAT_LUKE'`; aviso de duplicidade ignora `CHAT_LUKE`.
  - `routes/anexos.js`: bloqueio explícito de `CHAT_LUKE` nas 3 rotas.
  - `tests/agentePolitica.test.js:177`: exceção para os GET novos com `:p`.
  - `index.js`.
- **Rotas do usuário (JWT):**
  - `GET /api/chat-luke/conversa`
  - `GET /api/chat-luke/mensagens?antesDe|depoisDe&limit`
  - `POST /api/chat-luke/mensagens` (multipart; multer com limite de 10 MB por arquivo e 5 arquivos, pasta temporária em `../uploads/anexos/_tmp`)
  - `POST /api/chat-luke/lida`
  - `GET /api/chat-luke/nao-lidas`
  - `GET /api/chat-luke/anexos/:id` (dono da conversa; binário com `nosniff` e `private, no-store`)
- **Rotas do Luke:** as 5 da spec, com o guarda do agente configurado.
  - POST aceita `{ texto (até 8000), solicitacaoIds?, respondeA?, status? }` + `Idempotency-Key`.
  - `solicitacaoIds` precisam ser do próprio agente; senão 400 `SOLICITACAO_INVALIDA`.
- **Transação da mensagem** (`{ timeout: 20000, maxWait: 10000 }`): mensagem + `ultimaMensagemEm` + evento na fila. Arquivos gravados antes; "acorda fila" e auditoria depois.
- **Limites:** texto do usuário até 4000 caracteres; 20 mensagens/min por usuário; resposta do Luke exibida como texto puro (sem HTML).
- **Aceite:**
  1. Sem permissão: 403 em todas as rotas JWT.
  2. Usuário A não lê mensagem nem anexo de B.
  3. Token de agente em `/api/chat-luke/*`: 403; JWT em `/api/agente/v1/chat/*`: negado.
  4. Agente não configurado: 403; token na URL: 400 `TOKEN_NA_URL`.
  5. `.exe` renomeado para `.jpg` e arquivo acima de 10 MB são recusados, sem nada no disco.
  6. Mesma `Idempotency-Key` duas vezes = uma mensagem.
  7. Evento `chat.mensagem` sai magro; a resposta do Luke não gera evento.
  8. 202 com `X-Origem-*` cria o vínculo; UUID inexistente mantém o 202 idêntico.
  9. Admin em `/api/anexos/:id/arquivo` de anexo do chat: 403.
  10. Arquivo apagado do disco: 404 `ARQUIVO_PERDIDO`.
  11. **Em produção:** gravar → publicar de novo → ler o anexo.
- **Rollback:** `AppConfig chat_luke.ativo=false` (rotas respondem 503) e ninguém com permissão. Reverter o código não exige mexer no banco.

### Fatia B2 — Chat, frontend (depois do D2 mexer no `PermissoesModal.jsx`)
- **Novos:** `frontend/src/components/Assistente/DockAssistente.jsx`, `ChatLuke.jsx`, `BolhaMensagem.jsx`, `Compositor.jsx`, `CartaoSolicitacao.jsx`; `frontend/src/services/chatLukeService.js`; `frontend/src/hooks/useChatLuke.js`, `useNovidades.js`.
- **Alterados:** `Clippy.jsx` (prop `embutido` + hook de novidades), `App.jsx:896` (monta o dock), `PermissoesModal.jsx` (2 entradas no `BOOL_INDEX` com `noBulk` + `DEFAULT_PERMISSIONS`).
- **Também:** manual `backend/manuais/abas/chat-luke.md`, índice `README.md`, tabela `ABAS` em `copilotoService.js`, `frontend/public/novidade-chat-luke.html`, topo de `novidades.json`.
- **Aceite (QA clicando, 375 px e desktop):**
  1. Foto pela câmera em 2 toques, texto, enviar; a bolha aparece na hora.
  2. Resposta via curl aparece sem recarregar em até 5 s.
  3. Colar imagem e anexar PDF no desktop.
  4. Teclado aberto não cobre o compositor.
  5. Cartão "Aguardando autorização" muda sozinho ao autorizar.
  6. Novidade nova ainda balança o botão e abre na aba Ajuda.
  7. Usuário só com Clippy vê tudo igual a hoje.
  8. O botão não cobre o FAB de `RotaLeads.jsx` nem as 8 barras `fixed bottom-0`.
  9. Sem rede: a mensagem fica "não enviada — tentar de novo" com a mesma chave.
  10. `npm run build` passa.
- **Não confirmado, dizer ao dono:** iPhone real como PWA instalado (câmera, HEIC, teclado).
- **Rollback:** reverter o frontend; o Clippy volta ao modo antigo.

### Fatia C — Admin vê todas + operação (fase 2)
- Tela `/admin/chat-luke` (via `lazyComRetry`): lista + detalhe somente leitura, filtros com `useFiltrosSalvos`, `FiltroPeriodo` e `SelectBusca`; cards no mobile.
- Aba "Avisos ao Luke": log do webhook + reenviar; interruptor "este agente atende o chat".
- Rotas `GET /api/chat-luke/admin/*` exigindo `admin === true || Pode_Ver_Chat_Luke_Todos === true` e não-agente.
- Auditoria no `AuditLog`: `CHAT_LUKE_CONVERSA_ABERTA` (1 por admin+conversa a cada 10 min) e `CHAT_LUKE_ANEXO_ABERTO` (todo download por quem não é o dono), fora de transação.
- Linha fixa no chat do usuário: "A administração pode ver esta conversa."
- Cartão da solicitação para admin com "Ver e decidir", reusando o detalhe de `SolicitacoesAgente.jsx`.
- **Aceite:** não-admin recebe 403 e não vê o menu; admin não consegue escrever; cada abertura gera linha no AuditLog; filtros funcionam; reenvio usa o mesmo `eventoId`.

### Fatia D — recursos de BPO (fase 2/3, seção 8)

## 8. Recursos além da spec

| Recurso | Valor | Custo | Fase |
|---|---|---|---|
| Atalhos no compositor ("Lançar pagamento", "Enviar nota", "Corrigir", "Dúvida") que gravam `assunto` | Alto: uma mão, e o Luke já recebe a intenção | Baixo | **1** |
| Contador de não lidas no botão | Alto | Baixo | **1** |
| PDF | Alto: nota vem em PDF | Zero (já validado) | **1** |
| Cartão da solicitação com estado vivo + link | Alto | Baixo | **1** |
| Aviso "este comprovante já foi enviado antes" (sha256) | Médio: evita lançamento em dobro | Baixo | **1** |
| Pendências do Luke ("preciso do comprovante X") com contador e "resolver" | Alto: é o dia a dia do BPO | Médio | **2** |
| Admin: "Ver e decidir" dentro do chat | Alto para o dono | Médio | **2** |
| Link "abrir tela" na resposta (só rota interna iniciada por `/`; reusa `config/agenteTelas.js`) | Médio | Baixo | **2** |
| Filtro por assunto (próprio chat e admin) | Médio | Baixo | **2** |
| Luke devolver arquivo (relatório de fechamento em PDF) | Alto para a contabilidade | Médio | **2/3** |
| Lembrar/agendar: data única, dispara `chat.lembrete` no dia | Médio-alto | Médio | **3** |
| Áudio | Médio; depende de o Luke transcrever | Médio (MediaRecorder varia no iOS; magic bytes novos) | **3** |
| Busca na conversa | Médio | Baixo-médio | **3** |
| Push do PWA | Médio | Alto (VAPID, `npm install`, mexer no `sw.js` e subir `VERSAO`, permissão no iOS) | **3**, só se o contador não bastar |

**Não fazer:** tópicos/threads; fixar mensagem; editar ou apagar mensagem; recorrência de lembrete (o Luke tem agenda do lado dele); WebSocket; transcrição no servidor; avisar pelo WhatsApp que o Luke respondeu; autorizar com um toque sem ver o pedido; admin escrever como o Luke ou como o usuário.

## 9. UX alvo (para o preview HTML)

**Tokens:** `primary #00754A`, `primaryDark #006241`, `house #1E3932`, `mint #d4e9e2`, fundo `#f2f0eb`, Manrope, botões em pílula, cartões `rounded-xl`, painel `rounded-2xl`. Animar só `opacity` e `transform`.

**Desktop (painel acoplado):**
- Botão redondo de 56 px no canto inferior direito, avatar do Luke em `bg-house`, contador vermelho.
- Painel de 400 × 640 (máx. 80 vh), `shadow-2xl`.
- Cabeçalho `bg-house`: avatar, "Luke · financeiro", estado ("conectado" / "ainda não conectado"), abas em pílula **Luke | Ajuda**, botão expandir (painel lateral de 480 px, altura total) e fechar.
- Mensagens sobre o creme: bolha do usuário `bg-primary` branca à direita; bolha do Luke branca com borda à esquerda; separadores de dia; rodapé da bolha com hora e estado.
- Cartão de solicitação dentro da bolha do Luke: `rounded-xl` com borda, badge semântico (âmbar = aguardando, verde = autorizada, vermelho = recusada/erro, cinza = expirada), resumo em 1 linha, link "Ver pedido".
- Compositor: atalhos roláveis; campo que cresce até 5 linhas; clipe, câmera e enviar. Enter envia, Shift+Enter quebra linha. Arrastar-e-soltar e Ctrl+V anexam.
- Vazio: "Fale com o Luke. Mande um comprovante e diga o que precisa." + 3 atalhos grandes.

**Mobile (folha cheia):**
- Botão de 56 px em `bottom: calc(88px + env(safe-area-inset-bottom))`, acima das barras de ação; some com o chat aberto.
- Folha `fixed inset-0`, altura `100dvh`, compositor ajustado por `visualViewport`.
- Cabeçalho `bg-house` com seta voltar.
- **Câmera em 2 toques:** botão de câmera de 44 px sempre visível → `input capture="environment"` → miniatura na bandeja com X → enviar. Permissão só ao tocar.
- "+" abre folha inferior: Galeria, Arquivo PDF.
- Alvos de toque de 44 px; sem scroll horizontal em 320 px.
- Estados: enviando (bolha a 60%), "não enviada — tentar de novo", "Luke recebeu", "Luke ainda não conectado".

**Admin (fase 2):** duas colunas no desktop (lista de conversas | histórico); no mobile, lista em cards e detalhe em tela cheia.

## 10. O que responder ao Luke

1. **Estados:** `PENDENTE, EXECUTANDO, AUTORIZADA, RECUSADA, ERRO, ERRO_INDETERMINADO, EXPIRADA`. O evento sai em AUTORIZADA, RECUSADA, ERRO, ERRO_INDETERMINADO e EXPIRADA. Em `ERRO_INDETERMINADO`, não reenviar a gravação.
2. **Evento magro:**
   - `{ eventoId, tipo:"solicitacao.atualizada", enviadoEm, solicitacao:{ id, status, consultaUrl, conversaId, mensagemId } }`
   - `{ eventoId, tipo:"chat.mensagem", enviadoEm, conversaId, mensagemId, assunto, qtdAnexos }`
   - Texto, usuário e anexos: `GET /api/agente/v1/chat/conversas/:id/mensagens?depoisDe=`.
   - Quem decidiu e o resultado: `GET /api/agente/v1/solicitacoes/:id` (já devolve `decididoPorNome`, `resultado`, `idsResultado`).
3. **Headers:** `X-Luke-Event`, `X-Luke-Delivery` (= `eventoId`), `X-Luke-Timestamp`, `User-Agent: CA-Hardt-Webhook/1`, `X-Hub-Signature-256` ou `Authorization: Bearer`. **Pergunta:** qual dos dois o painel da rotina valida de fato, e qual status devolve no sucesso?
4. **Entrega:** timeout de 10 s; reenvio em 15 s, 1 min, 5 min, 30 min, 2 h; mesmo `eventoId`; deduplicar por ele. Um mesmo pedido pode gerar mais de um evento (ex.: indeterminado → repetido → autorizado), cada um com `eventoId` próprio.
5. **Erros:** `{ error, codigo }`; `TOKEN_NA_URL` (400); `LIMITE` (429, 120/min, `Retry-After`); `AGENTE_CHAT_NAO_HABILITADO` (403); `SOLICITACAO_INVALIDA` (400); `ARQUIVO_PERDIDO` (404). Datas em ISO UTC.
6. **POST de resposta:** JSON `{ texto, solicitacaoIds?, respondeA?, status? }` + `Idempotency-Key`; 201 com a mensagem. Ainda não aceita arquivo.
7. **Usuário:** `{ id, nome, admin }` (não existe "papel").
8. **Anexos:** JPG, PNG, WebP e PDF, 10 MB cada, até 5 por mensagem. Sem HEIC e sem áudio por enquanto.
9. **Vínculo:** `X-Origem-Conversa` e `X-Origem-Mensagem` só valem quando a gravação vira pedido (202). Com a matriz do D1, gravação em SIM executa direto, sem pedido e sem evento; o Luke responde no chat por conta própria.
10. **Mudanças que virão do D1:** `Idempotency-Key` obrigatória nas criações diretas; 403 novos `AGENTE_SEM_PERMISSAO` e `AGENTE_SO_ADMIN`.

## 11. Como não colidir com o D1

| Arquivo | D1 mexe? | Este plano |
|---|---|---|
| `middlewares/authMiddleware.js` | sim, muito | **Não toca** |
| `routes/agenteApiV1Routes.js`, `routes/agenteRoutes.js` | sim | **Não toca** (roteadores novos em arquivo próprio) |
| `config/agentePoliticaPadrao.js` | sim | 1 linha, depois do D1 |
| `services/agenteSolicitacaoService.js` | sim (bloco do `create`, linha 244) | 2 pontos, depois do D1 |
| `prisma/schema.prisma` | sim (1 modelo novo) | modelos no fim, depois do D1 |
| `workers/scheduler.js` | sim (bloco no fim) | bloco no fim, depois do D1 |
| `tests/agentePolitica.test.js` | provável | 1 ajuste, depois do D1 |
| `PermissoesModal.jsx`, `copilotoService.js` (ABAS), `novidades.json` | D2 | depois do D2, ou combinar a linha |

**Ordem:** Fatia 0 agora → D1 publica → Fatia A → Fatia B1 → D2 publica → Fatia B2 → Fatia C → Fatia D.

Em paralelo ao D1, o `dev-backend` pode escrever só os arquivos novos (serviços, rotas, testes) em worktree próprio, deixando os 6 toques em arquivo compartilhado para depois do rebase.

## 12. O que NÃO fazer

- Não mexer em `authMiddleware.js`.
- Não liberar `POST /api/agente/v1/**` por prefixo (só a regra exata).
- Não pôr o chat sob a regra de exceção do dono (ela recusa escrita liberada).
- Não importar `assertNaoAgente` no serviço do webhook, nem removê-lo de outro serviço.
- Não gravar segredo, assinatura ou `Authorization` em banco ou log; não seguir redirect; não aceitar URL `http://`.
- Não servir anexo por `/uploads` nem com token na query (o padrão `?mt=` não se aplica aqui).
- Não usar `../../uploads`.
- Não fazer chamada externa ou auditoria dentro de `$transaction`.
- Não usar `!!perms.x` (permissão é objeto; usar `=== true`).
- Não renderizar a resposta do Luke como HTML.
- Não usar `React.lazy`, `<select>` nativo nem `<input type="date">` solto.
- Não tocar em NF-e, WhatsApp nem em `/api/ia-consulta/v1`.
- Não testar o webhook local contra o endpoint real.

## 13. Decisões para o dono (padrão recomendado em cada uma)

1. **Luke e Clippy no mesmo lugar?** Padrão: um botão só. Quem tem os dois vê as abas "Luke" e "Ajuda"; o aviso de novidade continua. No celular aparece só o Luke.
2. **Quem começa com o chat?** Padrão: ninguém, só os administradores; o dono liga pessoa por pessoa. O contador externo fica de fora por enquanto.
3. **Quem vê a conversa de todos?** Padrão: só administrador (ou quem receber a permissão própria). Fica registrado quem abriu qual conversa, e o usuário vê o aviso "a administração pode ver esta conversa".
4. **O que o aviso ao serviço do Luke leva?** Padrão: só os números de identificação. Texto, nome e foto o Luke busca dentro do sistema, com a chave dele. Assim nada pessoal fica guardado no serviço de terceiros.
5. **Autorizar pelo chat?** Padrão: o cartão mostra o pedido e o botão abre o pedido completo para decidir (fase 2). Sem "autorizar com um toque".
6. **Áudio agora ou depois?** Padrão: depois. Fase 1 sai com texto, foto e PDF. Áudio entra quando o Luke confirmar que transcreve.


---

# Adendo ao plano do Chat do Luke — decisões novas do dono (substitui as partes indicadas; o resto do plano entregue antes continua valendo)

Conferido no código (`/Users/clarksonneitzel/Projetos/CA-Hardt-wt-forn`, `23af0330`); nada alterado.

## Fatos conferidos para este adendo

| Fato | Onde |
|---|---|
| O Clippy **não aparece no celular**: o contêiner inteiro é `hidden lg:block` (só a partir de 1024 px) | `frontend/src/components/Clippy/Clippy.jsx:187` |
| A ajuda já respeita permissão: filtra a tabela `ABAS` por `podeAcessar(perms, a.perm)` e só manda ao modelo o índice e os manuais das telas que o usuário acessa; os botões "Ir para" são validados contra essas rotas | `backend/services/copilotoService.js:196-201, 297, 346-352` |
| Limite atual da ajuda: o modelo **não fica sabendo** que a tela existe quando o usuário não tem acesso — a instrução é só "se não estiver na lista, diga que não tem acesso" | `copilotoService.js:276` |
| A ajuda é síncrona e sem histórico no servidor (o front manda as últimas 8 falas); pergunta cortada em 800 caracteres | `copilotoService.js:325-330`, `frontend/src/services/copilotoService.js` |
| Cada resposta da ajuda já é registrada com usuário e custo (`origem: 'CLIPPY'`) em `ia_uso_log`; existe a tela Dashboard → Uso de IA | `copilotoService.js:337`, `schema.prisma:5455`, `frontend/src/pages/Dashboard/AbaUsoIA.jsx` |
| A trava da ajuda é `Pode_Ver_Clippy === false` (ausente = ligado, vale para admin), no back e no front | `backend/routes/copiloto.js:16-22`, `App.jsx:896` |
| A persona do modelo se descreve como "o clipe no canto da tela" | `copilotoService.js:270-278` |

## 1. O que muda no plano

**Substitui a decisão 13 da seção 3, a linha 15/16 da tabela de divergências e a decisão 1 do dono.** Agora a spec do Luke e o dono concordam: o Luke toma o lugar do Clippy. O que sobra do Clippy é o cérebro (`copilotoService` + manuais + `ABAS`), não o personagem.

**Um personagem, três funções, no computador e no celular:**

| Função | Quem responde | Permissão | Webhook |
|---|---|---|---|
| Novidades (card com resumo + abrir) | `novidades.json` estático | `Pode_Ver_Clippy` (chave mantida) | não |
| Ajuda "como/onde/o que faz" | `copilotoService.responderAjuda` (interno, imediato) | `Pode_Ver_Clippy` | não |
| Pedir ao Luke (BPO financeiro) | Luke externo | `Pode_Usar_Chat_Luke` | sim |

**Quem vê o quê:**
- `Pode_Ver_Clippy !== false` e sem chat: cachorro com Novidades + Ajuda. É o que todos têm hoje, com a cara nova, e passa a existir no celular.
- Com `Pode_Usar_Chat_Luke === true`: ganha a aba "Pedir ao Luke".
- `Pode_Ver_Clippy === false` e chat ligado: cachorro só com "Pedir ao Luke" (sem novidades nem ajuda).
- Os dois desligados: sem cachorro.

A chave `Pode_Ver_Clippy` **não é renomeada** (está gravada nos usuários e no histórico de permissões). Só o rótulo no `PermissoesModal.jsx:262` muda para "Assistente Luke — novidades e ajuda". A chave nova do chat entra como interruptor separado, `noBulk`, padrão desligado.

## 2. Roteamento: ajuda × pedido de trabalho

**Recomendação: o usuário escolhe, com duas abas grandes e nomes de leigo — "Tirar dúvida" e "Pedir ao Luke". Sem classificação automática na fase 1.**

Motivos:
- Classificar errado custa caro nos dois sentidos: dúvida que vira trabalho gasta a cota e acorda o Luke; pedido que vira dúvida faz o comprovante não ser lançado e ninguém percebe.
- Classificador automático é mais uma chamada de IA por mensagem e um ponto de falha no caminho do comprovante.
- A aba deixa claro para o leigo o que acontece: "Tirar dúvida" responde na hora; "Pedir ao Luke" avisa "o Luke responde em alguns minutos".

**Rede de segurança barata, sem IA (fase 1):**
- Anexo só existe na aba "Pedir ao Luke" (câmera e clipe não aparecem em "Tirar dúvida").
- Em "Tirar dúvida", se a pessoa tem o chat ligado, toda resposta termina com o botão "Isto é um pedido? Mandar para o Luke", que leva o texto para a outra aba.
- Em "Pedir ao Luke", se a mensagem não tem anexo e começa com "como", "onde", "o que", "qual tela", aparece antes de enviar: "Parece uma dúvida de uso — quer a resposta na hora?" com dois botões. A pessoa decide; nada é desviado sozinho.

**Aba inicial:** quem tem o chat abre em "Pedir ao Luke" (o caso do comprovante na rua continua em poucos toques); quem não tem abre em "Tirar dúvida". A última aba usada é lembrada por usuário (`useFiltroSalvo('luke:aba', …)`).

**Classificação automática:** fase 3, e só se o painel de uso mostrar muita mensagem na aba errada.

**Dados separados:** a ajuda continua sem histórico no servidor (como hoje). Só "Pedir ao Luke" grava em `chat_luke_mensagens`. O admin que "vê a conversa de todos" vê só os pedidos ao Luke, não as dúvidas.

## 3. Ajuda considerando as permissões de quem pergunta

O reaproveitamento é direto: a rota `POST /api/copiloto/chat` e `responderAjuda` ficam como estão. Três ajustes em `backend/services/copilotoService.js`:

1. **Índice das telas sem acesso.** Montar também `ABAS.filter(a => !podeAcessar(perms, a.perm))` e mandar ao modelo **só o nome** dessas telas (sem rota e sem manual), numa seção "TELAS QUE EXISTEM MAS ESTE USUÁRIO NÃO PODE ACESSAR". A instrução da linha 276 passa a ser: "se a tarefa é feita numa dessas telas, diga que a função existe, que este usuário não tem acesso e que deve pedir ao administrador; não ensine o passo a passo". Os botões "Ir para" continuam validados só contra as rotas acessíveis (`rotasValidas` não muda).
2. **Persona.** Trocar "Clippy / clipe no canto da tela" por "Luke, o cachorro". Incluir uma linha: "pedidos de lançamento, correção ou fechamento não são com você aqui; oriente a usar a aba Pedir ao Luke" — somente quando `perms.Pode_Usar_Chat_Luke === true` ou `perms.admin === true`; para os demais, "peça ao financeiro".
3. **Manuais.** Atualizar a seção de novidades do manual e a entrada da tabela `ABAS` para o novo personagem.

Limite que precisa ser dito ao dono: a tabela `ABAS` tem uma permissão **por tela**, não por botão. A ajuda sabe se a pessoa entra na tela; não sabe, por exemplo, que ela vê Contas a Pagar mas não pode dar baixa. Onde o manual da tela já descreve a permissão do botão, o modelo repete isso; fora daí ele não sabe. Permissão por ação exigiria um campo novo em `ABAS` — fora desta entrega.

Agente (token `cah_ag_`) continua sem alcançar `/api/copiloto` (bloqueio fixo em `agentePoliticaPadrao.js:17`).

## 4. Celular

- Hoje não existe nada no celular. O cachorro passa a aparecer em todas as larguras para quem tem qualquer uma das duas permissões.
- É mudança visível para a equipe inteira (novidades e ajuda chegam ao celular pela primeira vez). Tem que constar na página de novidade.
- Posição: canto inferior direito, 56 px, `bottom: calc(88px + env(safe-area-inset-bottom))`. Precisa conviver com o botão flutuante de `frontend/src/pages/Rota/RotaLeads.jsx:2702` e com as 8 telas de barra `fixed bottom-0` — o QA confere cada uma.
- No celular o cachorro **não é arrastável** (o arraste do Clippy usa `touchAction: 'none'` e brigaria com o scroll); a posição fixa basta. No computador o arraste e a posição salva (`clippy_pos`) continuam.
- Aberto: folha cheia com as abas no topo; novidade nova aparece como card no topo da folha, com "Abrir" (iframe em tela cheia, como hoje).
- O cachorro fica dentro de `no-print` e do modo de impressão, como o Clippy.

**Animação (regra do projeto, vale para o preview):** só `transform` e `opacity`, nunca `box-shadow`. Estados: parado respirando, virando a cabeça, dormindo após ~2 min sem interação, balançando o rabo quando há novidade ou resposta do Luke. Respeitar `prefers-reduced-motion`. Animação pausa com a aba oculta.

## 5. Controle de uso (o dono teme ligar para todos)

**Configuração (em `AppConfig`, chave `chat_luke`, editável pelo admin na tela do chat):**

| Limite | Padrão sugerido | Efeito ao estourar |
|---|---|---|
| Pedidos ao Luke por usuário por dia | 20 | 429 `CHAT_LIMITE_DIA`; a tela mostra "Você usou os 20 pedidos de hoje. Volta amanhã ou fale com o administrador." |
| Anexos por usuário por dia | 30 | idem, `CHAT_LIMITE_ANEXOS` |
| Anexos por mensagem / tamanho | 5 / 10 MB | já no plano |
| Mensagens por minuto | 20 | já no plano |
| Dúvidas (ajuda) por usuário por dia | 50 | 429 em `/api/copiloto/chat` com texto claro |
| Limite individual | campo opcional por usuário, sobrepõe o padrão | — |

- A contagem é feita no banco (`count` de mensagens `autor='USUARIO'` do dia, no fuso local), sem tabela nova. A da ajuda conta `ia_uso_log` com `origem='CLIPPY'`.
- Administrador não tem limite diário (o limite por minuto vale para todos).
- O limite individual fica numa tabela pequena nova `chat_luke_limites` (`usuarioId` único, `pedidosDia`, `anexosDia`) — **não** dentro de `Vendedor.permissoes`, pelo mesmo motivo do D1: "copiar permissões" e "restaurar versão" apagariam (`PermissoesModal.jsx:509, 668`).
- O usuário vê o próprio saldo discretamente no compositor quando faltam 5 ou menos.

**Painel de uso (admin, dentro da tela Admin → Chat do Luke, fase 2):**
- Por usuário, no período (`FiltroPeriodo`): pedidos enviados, anexos, quantos viraram solicitação, quantos ficaram sem resposta, vezes que bateu no limite.
- Dúvidas de ajuda e custo de IA: já existem em Dashboard → Uso de IA; o painel só linka para lá.
- Botão por usuário: ajustar limite e desligar o chat.

**Kill switch geral:** `chat_luke.ativo=false` desliga "Pedir ao Luke" para todos sem deploy; novidades e ajuda continuam.

## 6. Efeito nas fatias

**Fatia A (webhook) e B1 (backend do chat): sem mudança de desenho.** Acréscimos em B1:
- Limites diários em `chatLukeService` + tabela `chat_luke_limites` + leitura da configuração.
- Limite diário da ajuda em `backend/routes/copiloto.js`.
- Os 3 ajustes de `copilotoService.js` da seção 3.
- Aceite extra: usuário no limite recebe 429 com a mensagem certa e nada é gravado nem enviado ao webhook; pergunta sobre tela sem acesso responde "existe, você não tem acesso", sem passo a passo e sem botão "Ir para".

**Fatia B2 (frontend) muda de forma:**
- `frontend/src/components/Clippy/Clippy.jsx` é **aposentado**, não embutido. Novo `frontend/src/components/Luke/` com: `LukeMascote.jsx` (cachorro e animações), `LukeDock.jsx` (botão, posição, abas), `AbaAjuda.jsx` (porta a lógica de chat do Clippy: `copilotoService.perguntar`, atalhos "Ir para"), `AbaPedir.jsx` (chat do BPO), `CardNovidade.jsx`, `useNovidades.js` (porta a lógica de `novidades.json` e a chave `clippy_novidade_vista`, mantida para ninguém rever novidade antiga).
- `App.jsx:896`: troca `<Clippy />` por `<LukeDock />` com a condição `Pode_Ver_Clippy !== false || Pode_Usar_Chat_Luke === true || admin`.
- Grep obrigatório antes: os outros arquivos que citam "Clippy" (`MapaExpedicao.jsx`, `RelatorioCaixaPrint.jsx`, `PainelEstoque.jsx`, `AlertaDevolucaoRefItem.jsx`, `AbaUsoIA.jsx`, `Dashboard/indicadores/guia.js`, `Configuracoes/IA.jsx`) — conferir se é só texto/comentário ou se dependem de posição/z-index do mascote.
- Textos visíveis "Clippy" viram "Luke" (permissões, Uso de IA, Configurações de IA). A `origem: 'CLIPPY'` no log **não muda** (histórico e relatório dependem dela).
- CLAUDE.md, manuais e a regra de novidades citam "o Clippy balança": atualizar a redação no mesmo commit (a regra continua, o personagem muda).
- Aceite extra: no celular (375 px) o cachorro aparece para quem só tem novidades/ajuda; novidade nova faz o cachorro balançar nos dois tamanhos e o card abre a página; dúvida respondida na hora sem gerar linha em `chat_luke_mensagens` nem evento de webhook; a aba "Pedir ao Luke" não existe para quem não tem a permissão (e a API devolve 403).

**Risco novo:** B2 deixa de ser invisível — troca o assistente de todo mundo e o leva ao celular. Publicar B2 em dois passos reduz o risco: primeiro o cachorro com Novidades + Ajuda (substituição do Clippy, sem chat), depois ligar a aba "Pedir ao Luke" para os primeiros usuários.

**Rollback de B2:** reverter o frontend devolve o Clippy; nenhum dado depende do componente.

## 7. Decisões do dono — lista revisada (substitui a seção 13)

Resolvidas por ele: substituição do Clippy pelo Luke; liga por usuário; funciona no celular.

Restam:
1. **Como a pessoa escolhe entre dúvida e pedido?** Padrão: duas abas — "Tirar dúvida" (responde na hora) e "Pedir ao Luke" (o Luke de verdade). O sistema só sugere trocar de aba, nunca troca sozinho.
2. **Limites de uso.** Padrão: 20 pedidos e 30 anexos por pessoa por dia, 50 dúvidas por dia; o dono muda o número geral ou o de uma pessoa na tela.
3. **Quem vê a conversa de todos.** Padrão: só administrador; fica registrado quem abriu; o usuário vê o aviso "a administração pode ver". As dúvidas de ajuda não são guardadas.
4. **O que o aviso ao serviço do Luke leva.** Padrão: só os números de identificação; o conteúdo o Luke busca dentro do sistema.
5. **Autorizar pelo chat.** Padrão: o botão abre o pedido completo para decidir; sem "um toque".
6. **Áudio.** Padrão: depois; fase 1 com texto, foto e PDF.

## 8. Para o dev do preview

Arquitetura que o preview precisa refletir (sem pixel):
- Cachorro pequeno fixo no canto; estados parado / virando / dormindo / rabo balançando; bolinha de contador.
- Aberto: cabeçalho verde-escuro com o nome "Luke" e duas abas em pílula ("Tirar dúvida" · "Pedir ao Luke"); card de novidade no topo quando houver.
- "Tirar dúvida": sem câmera e sem clipe; resposta com botões "Ir para a tela"; rodapé "Isto é um pedido? Mandar para o Luke".
- "Pedir ao Luke": atalhos de assunto, câmera sempre visível no celular, bandeja de anexos, cartão de solicitação, aviso "o Luke responde em alguns minutos", saldo do dia quando baixo.
- Três variações de usuário no preview: só novidades/ajuda; com chat; no limite do dia.
- Botão Computador/Celular no mesmo link.

---

# Decisão do dono (27/11/2026, noite) — autorizar DENTRO do chat

Substitui a decisão 5 ("sem autorizar com um toque"): o dono quer decidir os pedidos do Luke dentro do próprio chat.
- Para o admin, o chat ganha uma terceira aba/segmento **"Autorizações"** com contador (bolinha no cachorro soma pendentes), listando os pedidos PENDENTES de todos os agentes com o mesmo conteúdo do cartão da tela Admin → Solicitações (resumo, "ver o que será enviado", antes × depois, Abrir tela, **Autorizar**, **Recusar**).
- O cartão do pedido dentro da conversa também traz Autorizar / Recusar para o admin.
- O Luke (cachorro) lembra quando há autorização pendente (balão "Você tem N pedidos esperando autorização").
- A tela Admin → Solicitações CONTINUA existindo (histórico, com erro, resultado incerto, tentar de novo); as ações do dia a dia ficam no chat.
- Implementação: reusar as rotas /api/agentes/solicitacoes* e os componentes de SolicitacoesAgente.jsx (extrair o cartão para componente compartilhado); manter as travas existentes (confirmação quando "mudou desde o pedido", aviso forte ao repetir).
