# Plano de implementação — "Como Fazer" · Fase 1 (piloto na cozinha)

> Arquiteto · 19/10/2026 · baseado em `docs/pop/proposta-pop.md` (v2) e `docs/pop/mockup-pop.html`.
> Porte: **GRANDE** (módulo novo + permissões + login por tablet + integração com Tarefas) → equipe completa.
> Regra nº 1 do dono: **UM padrão só**. Tudo abaixo foi desenhado para existir uma estrutura de dados, um viewer de passo,
> um checklist, uma tabela de treinamento e um jeito de entrar.

---


> ## ⚠️ ADENDO 19/10 (decisão do dono, DEPOIS do plano) — vale sobre tudo o que está abaixo
> O dono viu o mockup v2 e escolheu **o jeito da versão 1** para duas telas. Mockup já atualizado (`mockup-pop.html`, abas 2 e 3):
> 1. **Biblioteca / Home (`/como-fazer`, F4):** NÃO é a tela de tiles grandes por setor. É a **lista em cartões** agrupada
>    (Falta aprender · Rotinas · Máquinas/Regras/Dosagens), chips de setor no topo (abre no setor da pessoa), filtro de tipo
>    (lembrado com `useFiltrosSalvos`), cartão com **código + versão** (`HIG-001 · v3`), título com emoji do tipo, badge do tipo,
>    selo amarelo "Você não treinou" (cartão com borda amarela, sempre primeiro), "já sei ✅", botão **Fazer agora** no cartão
>    de Rotina. Gestão vê além disso: Rascunho, "Revisão vencida", `+ Novo`, `Painel`. **Backend:** `ItemLista` de `GET /home`
>    passa a devolver também `codigo` e `versaoNumero` (aditivo). A regra "nunca mostrar código ao funcionário" CAI.
> 2. **Conteúdo aberto (`/como-fazer/c/:id`, F5/F7):** NÃO é um passo por tela. É o **documento inteiro numa página**:
>    topbar (título, código, versão, aprovado por, reciclagem; botões Imprimir / QR / Nova versão só com permissão), abas
>    Passo a passo · Versões · Quem treinou (· Execuções para Rotina), cabeçalho em 4 caixinhas (tipo, setor, quem treina,
>    encarregado), "Para que serve", "O que precisa", **passos numerados** (número em círculo, frase, detalhe, foto/vídeo à
>    direita, botão 🔊 Ouvir em cada passo), bloco vermelho "O que NÃO fazer", tabela "Se der errado", e no rodapé o bloco de
>    treinamento (Aprendi + Encarregado confirma PIN; ou só "Li e entendi" para Rotina/Dosagem). Máquina = o mesmo documento com
>    as 4 seções (Montar/Usar/Limpar/Deu problema) como blocos na mesma página (âncoras/abas internas); os tiles da tela 4 do
>    mockup viram atalhos para essas seções. Dosagem = passos cujos itens mostram foto da medida + quantidade.
>    O `ViewerPassos` "um por tela" NÃO é feito; `PassoCard` continua único (é a linha numerada do documento).
> 3. JSON do documento (§5) **não muda**: o mesmo `doc` com `secoes[].passos[]` alimenta a página. Para o documento ter
>    "Para que serve", "O que precisa", "O que NÃO fazer" e "Se der errado", acrescentar ao doc os campos opcionais
>    `objetivo` (texto), `materiais` (texto), `naoFazer` (texto) e `seDerErrado` (array de `{se, entao}`) — validados em
>    `comoFazerSchema.js` e editáveis no editor. Aditivo; ausentes = seção não aparece.
> Tudo o mais (tablet foto+PIN, Ouvir, treino duplo, checklist, painel, agenda) continua como planejado.

## 0. Descobertas na leitura do código (mudam o plano — leia antes)

Estas 8 coisas contradizem ou complementam a proposta. Cada uma já está resolvida no desenho abaixo.

1. **O "PIN do ponto" não é um PIN.** `Funcionario.senhaHash` (bcrypt) é uma senha livre, mínimo 4 caracteres
   (`backend/controllers/funcionarioController.js:121-134`, `frontend/src/pages/RH/FuncionarioFicha.jsx:114-119`).
   Teclado numérico não digita letra. **Decisão:** reaproveitar a MESMA senha (um segredo só, "um jeito só de entrar"), mas o
   tablet só lista quem tem senha de **exatamente 4 números**. Nova coluna `Funcionario.senhaNumerica` (marcada em
   `definirSenha` quando a senha nova bate `/^\d{4}$/`). Não há como migrar as senhas antigas (é bcrypt): o RH redefine a senha
   de quem vai usar o tablet. A ficha do RH ganha a dica "para usar o tablet, use 4 números".
2. **Não existe `tarefaService.js`.** Toda a lógica de Tarefas está dentro de `backend/routes/tarefaRoutes.js` (686 linhas;
   `ocorreNoDia` linha 52, `POST /:id/concluir` linha 466). O plano extrai só a função pura `ocorreNoDia`/`datasDoIntervalo`
   para `backend/services/tarefaRecorrenciaService.js` (o Como Fazer precisa calcular "rotina não feita") e o resto é escrito
   num serviço novo `comoFazerAgendaService.js` que grava direto em `tarefa`/`tarefaOcorrencia` (mesmas tabelas).
3. **Tarefa pertence a `Vendedor`, não a `Funcionario`** (`schema.prisma:825-849`: `criadoPorId` e `responsavelId` são FK de Vendedor,
   obrigatórios). O funcionário do tablet pode nem ter usuário no app. **Decisão:** o alarme da rotina vai para o(s)
   **encarregado(s)** (`Vendedor`) cadastrados no conteúdo (`responsaveisIds`); quem faz a rotina no tablet aparece na execução
   pelo `funcionarioId`. O pop-up sonoro continua sendo o do app do encarregado (`AlertaTarefas`); o tablet mostra a lista
   "Fazer agora" (sem som na Fase 1 — gancho para Fase 2).
4. **O token do tablet NÃO pode usar o `authMiddleware` atual.** Ele faz `prisma.vendedor.findUnique({ where: { id: decoded.id } })`
   (`backend/middlewares/authMiddleware.js:17`) e usa o mesmo `JWT_SECRET` do login do app. Um token do tablet assinado com o
   mesmo segredo passaria no `jwt.verify` e cairia numa consulta com `id` indefinido. **Decisão:** assinar o token do tablet com
   um segredo DERIVADO (`JWT_SECRET + ':como-fazer-tablet'`), de modo que em QUALQUER outra rota o `jwt.verify` falha
   (401) antes de tocar no banco. Mesmo padrão de separação que o ponto já usa (`tipo: 'ponto'`), só que mais forte.
5. **`/setor/:slug` público expõe nome+foto dos funcionários a qualquer pessoa da internet.** A proposta não trata isso.
   **Decisão:** "pareamento do aparelho" — chave longa por setor (hash em `AppConfig`, sem tabela nova); o tablet guarda a chave
   no `localStorage` na primeira abertura (link de pareamento gerado no painel). Sem a chave, `/setor/cozinha` mostra "Aparelho
   não autorizado". PIN de 4 dígitos só tem 10 mil combinações → também precisa de **freio por tentativa** (ver 3.1).
6. **`Funcionario.foto` existe mas NADA grava nele** (nenhuma rota/tela de RH faz upload; `funcionarioController.js:80` só lê).
   A grade de fotos do tablet precisa disso → entra upload de foto na ficha do funcionário (`POST /api/rh/funcionarios/:id/foto`).
7. **Funcionário não tem setor.** Só `cargo` (texto livre). Nova coluna `Funcionario.setor` (COZINHA/ESTOQUE/EXPEDICAO/MOTORISTA).
   "Cargo" do conteúdo continua sendo o texto de `Funcionario.cargo` (comparação sem acento/caixa).
8. **`Funcionario.vendedorId` é o elo com o app.** Quem tem permissão `Pode_Confirmar_Treinamento` mora em `Vendedor.permissoes`.
   Logo, o **encarregado precisa ter funcionário ligado a um usuário** (`vendedorId`) para poder confirmar no tablet. O painel
   avisa quem está faltando.

Outras confirmações: `Layout` devolve só `children` quando não há usuário (`App.jsx:385`) — então `/setor/:slug` renderiza sem
menu nem alertas (igual `/ponto/:token`); o `api` global derruba o login em qualquer 401 (`services/api.js:20-34`) — o tablet
**precisa de axios próprio** (como `pontoPublicoService.js`); nginx do frontend já aceita 50 MB (`frontend/Dockerfile:31`);
`PermissoesModal` exige 3 lugares por permissão nova (defaults ~l.147, `BOOL_INDEX` ~l.244, bloco de toggle da seção) — o backend
**não** tem lista de permissões; `ReceitaDetalhe.jsx` NÃO exporta `imprimirConteudo` (é função local) → copiar para util novo.

---

## 1. Entendimento do pedido

Módulo "Como Fazer": a equipe leiga (Cozinha na Fase 1) vê **foto + frase + Ouvir**, passo a passo; treina com dupla confirmação
(funcionário + encarregado/PIN); executa rotinas por checklist (agenda de Tarefas); a gestão acompanha num painel e imprime
relatório. Entrada no tablet: toca na foto + 4 números. Interpretação adotada onde a proposta era ambígua:

- "Publicar zera treinamentos" = incrementa `versaoTreinoNumero`; o status de cada funcionário é **calculado**, não há update em
  massa (idempotente e barato). Checkbox opcional "foi só correção de texto, não precisa treinar de novo" (`zeraTreinamento:false`).
- "Rotina 2× ao dia" = 1 `Tarefa` recorrente por horário (a tabela `tarefas` tem um `hora` só).
- "Freezer 1, 2…" = perguntas dentro do MESMO checklist (um checklist por horário), não uma tarefa por freezer.
- "Limpar vira rotina" (Máquina) = a Máquina aponta para um conteúdo Rotina (`relacionadoId`); Fase 1 só mostra o link.

---

## 2. Arquivos a criar/alterar — em ordem de execução

> Legenda: **[B]** dev-backend · **[F]** dev-frontend · **(A)** edição aditiva em arquivo compartilhado · **(N)** arquivo novo.

### 2.1 Backend

| # | Arquivo | O quê |
|---|---|---|
| B1 | `backend/prisma/schema.prisma` **(A)** | 4 modelos novos + 2 colunas em `Funcionario` + 2 em `Tarefa` (seção 3). **Só adicionar.** |
| B2 | `backend/services/comoFazerSchema.js` **(N)** | Validação/normalização do JSON de passos (seção 5) — usada no PUT do rascunho e no publicar. Sem lib nova (funções puras). |
| B3 | `backend/services/comoFazerAuthService.js` **(N)** | Chave de aparelho (gerar/conferir), emitir/verificar token de tablet, freio de PIN, `middleware comoFazerAuth`, helpers `exigirPermissao('Pode_X')`. |
| B4 | `backend/services/comoFazerService.js` **(N)** | Regras: aplicabilidade (setor/cargo), status de treinamento calculado, listar por setor, abrir, aprendi, confirmar, executar (desvio calculado NO SERVIDOR), publicar. |
| B5 | `backend/services/tarefaRecorrenciaService.js` **(N)** + `backend/routes/tarefaRoutes.js` **(A, mínima)** | Mover `ocorreNoDia`/`datasDoIntervalo`/`diaSemana` para o service (pura, sem mudar comportamento); `tarefaRoutes` passa a importá-las. Mais: `resumoTarefa` devolve `origem`/`origemRef` e `podeEditar:false` quando `origem` preenchida; guards em `PUT /:id`, `DELETE /:id` e `POST /:id/concluir` (seção 8). |
| B6 | `backend/services/comoFazerAgendaService.js` **(N)** | `sincronizarTarefasDaRotina(conteudo)`, `concluirTarefasDaExecucao(exec)`, `criarTarefaDesvio(exec, desvios)`, `criarTarefaChamado(...)`, `criarTarefaLembrete(...)`. Tudo idempotente. |
| B7 | `backend/middlewares/uploadComoFazerMiddleware.js` **(N)** | multer → `path.join(__dirname, '../uploads/como-fazer/<contexto>/<yyyy-mm>')` (de `middlewares/`, `../uploads` = `/app/uploads` ✓ volume). Foto 15 MB; vídeo 45 MB; mimes jpeg/png/webp/mp4/quicktime/webm. Nome = uuid. |
| B8 | `backend/routes/comoFazerRoutes.js` **(N)** | Todas as rotas da seção 4 (público do aparelho → `router.use(comoFazerAuth)` → equipe → painel → editor). |
| B9 | `backend/index.js` **(A, 1 linha)** | `app.use('/api/como-fazer', comoFazerRoutes);` (SEM `authMiddleware` na montagem — a auth é interna). Próximo a `/api/tarefas` (l.232). Bumpar `deployMarker`. |
| B10 | `backend/controllers/funcionarioController.js` + `backend/routes/rh.js` **(A)** | `definirSenha` marca `senhaNumerica`; `atualizar` aceita `setor`; `listar/detalhe` devolvem `setor`, `senhaNumerica`, `foto`; nova rota `POST /funcionarios/:id/foto` (multer próprio em `uploads/funcionarios/<id>/foto-*.jpg`, `checkEditPonto`) e `foto` vira URL relativa `funcionarios/<id>/<arquivo>`. |
| B11 | `backend/scripts/seedComoFazer.js` **(N)** + rota `POST /api/admin-exec/como-fazer-seed` **(A)** | Seed idempotente (upsert por `codigo`) dos 3 conteúdos (seção 9). Em `adminExecRoutes` só uma rota nova. |
| B12 | `backend/manuais/abas/como-fazer.md`, `rh-como-fazer-painel.md` (N), `README.md` (A), `backend/services/copilotoService.js` tabela `ABAS` (A) | Últimos. Rotas reais: `/como-fazer` (perm `null`) e `/rh/como-fazer` (perm `Pode_Ver_Painel_Como_Fazer`). Atualizar também `tarefas.md` (rotina do Como Fazer aparece na agenda e abre o checklist). |

### 2.2 Frontend

| # | Arquivo | O quê |
|---|---|---|
| F1 | `frontend/src/services/comoFazerService.js` **(N)** | Cliente HTTP único. `clienteHttp()` escolhe: se há token de tablet em `sessionStorage` → axios público (`API_URL/api`) com `Bearer <tablet>`; senão o `api` do app. Tratamento de erro padrão (seção 7). |
| F2 | `frontend/src/pages/ComoFazer/hooks/useSessaoTablet.js` **(N)** | Guarda token em `sessionStorage`, timer de inatividade de **2 min** (qualquer toque/tecla reinicia; `pointerdown` global), chama `POST /sessao/renovar` no máximo a cada 30 s de atividade, ao estourar: limpa e volta à grade. |
| F3 | `frontend/src/pages/ComoFazer/EntrarSetor.jsx` **(N)** — rota `/setor/:slug` | Grade de fotos + teclado PIN (componente `TecladoNumerico.jsx` N, reaproveitado pelo checklist e pelo PIN do encarregado). |
| F4 | `frontend/src/pages/ComoFazer/ComoFazerHome.jsx` **(N)** — rota `/como-fazer` | Setores + lista (🟡 primeiro). |
| F5 | `frontend/src/pages/ComoFazer/ConteudoPagina.jsx` **(N)** — rota `/como-fazer/c/:id` | Decide a tela: Máquina → `MaquinaTiles`; senão → `ViewerPassos` direto. |
| F6 | `frontend/src/components/ComoFazer/PassoCard.jsx` **(N)** | **O ÚNICO componente de passo**: foto grande + frase + detalhe + Ouvir + itens de dosagem + marca de perigo. Usado pelo viewer, pelo treino, pela máquina, pela dosagem e pela prévia do editor. |
| F7 | `frontend/src/components/ComoFazer/ViewerPassos.jsx` **(N)** | Um passo por tela, setas ≥ 56 px, progresso "Passo 3 de 10", último passo → `FimTreinamento`. Aviso de perigo lido em voz alta antes do 1º passo. |
| F8 | `frontend/src/components/ComoFazer/FimTreinamento.jsx` **(N)** + `PedirPinEncarregado.jsx` **(N)** | "Aprendi" → "Encarregado confirma (PIN)" (escolhe a foto do encarregado + PIN). |
| F9 | `frontend/src/components/ComoFazer/MaquinaTiles.jsx` **(N)** | 4 tiles (Montar/Usar/Limpar/Deu problema) + faixa de perigo + "Chamar o encarregado" + "Fazer o treinamento". |
| F10 | `frontend/src/components/ComoFazer/Checklist.jsx` **(N)** — rota `/como-fazer/fazer/:id` | Linhas grandes; 3 tipos de pergunta; desvio em vermelho; "Pronto" travado. |
| F11 | `frontend/src/components/ComoFazer/falar.js` **(N)** | `speechSynthesis` pt-BR (escolhe `voice.lang` que começa com `pt-BR`, cancela fala anterior, no iOS só dentro do clique). |
| F12 | `frontend/src/pages/RH/ComoFazerPainel.jsx` **(N)** + `frontend/src/pages/RH/comoFazer/*` (abas Treinamentos, Rotinas, Conteúdos, `EditorConteudo.jsx`, `PareamentoTablet.jsx`) — rota `/rh/como-fazer` | Painel (seção 7.4). |
| F13 | `frontend/src/utils/imprimirNaPagina.js` **(N)** | Cópia do `imprimirConteudo` de `PCP/ReceitaDetalhe.jsx:105` (NÃO editar o ReceitaDetalhe) + `RelatorioComoFazer.jsx` (prévia → botão Imprimir **síncrono**). |
| F14 | `frontend/src/App.jsx` **(A)** | 5 `lazyComRetry`; rotas `/setor/:slug` (junto de `/ponto/:token`, l.827, sem `PrivateRoute`), `/como-fazer`, `/como-fazer/c/:id`, `/como-fazer/fazer/:id` (`<PrivateRoute>` sem `tab`), `/rh/como-fazer` (`tab="Pode_Ver_Painel_Como_Fazer"`); item de menu "Como Fazer" (ícone `BookOpenCheck`/`BookOpen` do lucide) logo após "Tarefas" nas **duas** barras (desktop l.543 e drawer mobile l.673) e "Painel Como Fazer" no grupo RH (l.456-459) com `isAdmin || hasPermission('Pode_Ver_Painel_Como_Fazer')`. |
| F15 | `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` **(A)** | 3 permissões: defaults (~l.147-158), `BOOL_INDEX` (sec nova `comofazer` + `SECOES`, ~l.224/244) e bloco de `Toggle` (`secaoComoFazer`, modelo `secaoTarefas` l.862). |
| F16 | `frontend/src/components/AlertaTarefas.jsx` + `frontend/src/pages/Tarefas/TarefasAgenda.jsx` **(A)** | Tarefa com `origem==='COMO_FAZER'`: botão vira "Fazer agora" e navega a `/como-fazer/fazer/:origemRef?tarefa=&data=&hora=` em vez de `tarefaService.concluir` (l.87-91 / l.201-208). Esconder editar/excluir (já cai em `podeEditar:false`). |
| F17 | `frontend/src/pages/RH/FuncionarioFicha.jsx` + `frontend/src/services/funcionarioService.js` **(A)** | Campo Setor (SelectBusca), upload de foto, dica "senha de 4 números para o tablet" e selo "Tablet: pronto/sem senha de 4 números". |
| F18 | `frontend/public/novidade-como-fazer.html` (N) + `frontend/public/novidades.json` **(A)** | Por último. |

**Edição aditiva em arquivos compartilhados** (`schema.prisma`, `App.jsx`, `index.js`, `rh.js`, `tarefaRoutes.js`, `PermissoesModal.jsx`,
`novidades.json`, `copilotoService.js`): só ACRESCENTAR blocos; nunca reformatar nem reordenar.

---

## 3. Schema Prisma proposto (completo)

Convenções do projeto: `@@map` snake_case, `@map` nas colunas, ids uuid, **índices declarados no schema** (senão o `db push` derruba),
nenhum campo removido. Plain strings (sem FK) para `Funcionario`/`Vendedor` — não mexer nesses modelos além das 2 colunas novas.

```prisma
// ───────── Como Fazer (POPs, manuais, regras, dosagem, treinamento) ─────────

// Um "conteúdo" = uma coisa que a equipe precisa saber/fazer. Os 4 tipos usam a MESMA estrutura.
model ComoFazerConteudo {
  id     String @id @default(uuid())
  tipo   String // ROTINA | MAQUINA | REGRA | DOSAGEM
  codigo String? @unique // só no painel (ex.: POP-HIG-003). NUNCA mostrar ao funcionário.
  titulo String
  icone  String? // emoji

  setores String[] @default([]) // COZINHA | ESTOQUE | EXPEDICAO | MOTORISTA
  cargos  String[] @default([]) // texto de Funcionario.cargo; vazio = todos do setor
  ordem   Int      @default(0)

  status String @default("RASCUNHO") // RASCUNHO | PUBLICADO | ARQUIVADO
  // versão que os tablets mostram (id de ComoFazerVersao). Sem FK de propósito (evita ciclo).
  versaoPublicadaId    String?   @map("versao_publicada_id")
  // sobe só quando o publicar zera o treinamento; o treinamento de cada pessoa amarra nele
  versaoTreinoNumero   Int       @default(0) @map("versao_treino_numero")
  primeiraPublicacaoEm DateTime? @map("primeira_publicacao_em")

  // treinamento
  exigeConfirmacao Boolean @default(false) @map("exige_confirmacao") // MAQUINA e REGRA = true (definido na criação pelo tipo)
  reciclagemMeses  Int?    @map("reciclagem_meses") // Fase 1: campo existe, UI não preenche (reciclagem é Fase 3)

  // rotina (ROTINA com horário; sem horário = "por evento", só botão Fazer agora)
  horarios        String[] @default([]) // 'HH:MM'
  recorrencia     String   @default("NUNCA") // mesmos valores de Tarefa.recorrencia
  diasSemana      Int[]    @default([]) @map("dias_semana")
  responsaveisIds String[] @default([]) @map("responsaveis_ids") // Vendedor.id dos encarregados (alarme + desvio)

  relacionadoId String? @map("relacionado_id") // Máquina → rotina de limpeza (gancho; Fase 1 só link)

  criadoPorId String   @map("criado_por_id") // Vendedor.id
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  versoes       ComoFazerVersao[]
  treinamentos  ComoFazerTreinamento[]
  execucoes     ComoFazerExecucao[]

  @@index([status, tipo])
  @@map("como_fazer_conteudos")
}

// Cada conteúdo tem no máximo 1 RASCUNHO e 1 PUBLICADA; as antigas ficam SUBSTITUIDA (histórico p/ Vigilância).
model ComoFazerVersao {
  id          String   @id @default(uuid())
  conteudoId  String   @map("conteudo_id")
  numero      Int // 1,2,3… (sequencial por conteúdo)
  status      String   @default("RASCUNHO") // RASCUNHO | PUBLICADA | SUBSTITUIDA
  passos      Json     @default("{}") // UM formato só — ver seção 5 (campo chama "passos" por pedido do dono; guarda o documento inteiro)
  zeraTreinamento Boolean @default(true) @map("zera_treinamento")
  publicadaEm DateTime? @map("publicada_em")
  publicadaPorId String? @map("publicada_por_id") // Vendedor.id
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  conteudo     ComoFazerConteudo      @relation(fields: [conteudoId], references: [id], onDelete: Cascade)
  execucoes    ComoFazerExecucao[]

  @@unique([conteudoId, numero])
  @@index([conteudoId, status])
  @@map("como_fazer_versoes")
}

// UM registro de treinamento para todos os tipos. O que varia é `exigeConfirmacao` (snapshot do conteúdo).
model ComoFazerTreinamento {
  id                 String    @id @default(uuid())
  conteudoId         String    @map("conteudo_id")
  versaoId           String    @map("versao_id") // versão que ele viu (auditoria)
  versaoNumero       Int       @map("versao_numero")
  versaoTreinoNumero Int       @map("versao_treino_numero") // amarra no Conteudo.versaoTreinoNumero
  ciclo              Int       @default(1) // reciclagem futura (Fase 1 sempre 1)
  funcionarioId      String    @map("funcionario_id")
  aprendeuEm         DateTime  @default(now()) @map("aprendeu_em")
  origem             String    @default("TABLET") // TABLET | APP
  exigeConfirmacao   Boolean   @map("exige_confirmacao")
  confirmadoPorFuncionarioId String? @map("confirmado_por_funcionario_id")
  confirmadoPorVendedorId    String? @map("confirmado_por_vendedor_id") // quem tinha a permissão
  confirmadoEm       DateTime? @map("confirmado_em")
  validoAte          DateTime? @map("valido_ate") // aprendeu/confirmou + reciclagemMeses (null na Fase 1)
  createdAt          DateTime  @default(now()) @map("created_at")

  conteudo ComoFazerConteudo @relation(fields: [conteudoId], references: [id], onDelete: Cascade)

  @@unique([funcionarioId, conteudoId, versaoTreinoNumero, ciclo]) // idempotência do "Aprendi"
  @@index([conteudoId])
  @@index([funcionarioId])
  @@map("como_fazer_treinamentos")
}

// Cada vez que um checklist (rotina) é preenchido.
model ComoFazerExecucao {
  id               String    @id @default(uuid())
  chave            String    @unique // idempotência: a tela gera um uuid ao abrir o checklist; reenviar não duplica
  conteudoId       String    @map("conteudo_id")
  versaoId         String    @map("versao_id")
  versaoNumero     Int       @map("versao_numero")
  funcionarioId    String?   @map("funcionario_id") // tablet ou app com funcionário ligado
  vendedorId       String?   @map("vendedor_id") // quando feito por usuário do app
  dataRef          String    @map("data_ref") // 'YYYY-MM-DD' (dia SP)
  horaAlvo         String?   @map("hora_alvo") // 'HH:MM' do horário da rotina (null = por evento)
  tarefaId         String?   @map("tarefa_id") // tarefa que originou (se veio do alarme)
  respostas        Json      @default("[]") // [{passoId,tipo,valor,foto,desvio}] — seção 5.3
  temDesvio        Boolean   @default(false) @map("tem_desvio")
  desvioTarefaIds  String[]  @default([]) @map("desvio_tarefa_ids")
  concluidaEm      DateTime  @default(now()) @map("concluida_em")
  createdAt        DateTime  @default(now()) @map("created_at")

  conteudo ComoFazerConteudo @relation(fields: [conteudoId], references: [id], onDelete: Cascade)
  versao   ComoFazerVersao   @relation(fields: [versaoId], references: [id])

  @@index([conteudoId, dataRef])
  @@index([dataRef, temDesvio])
  @@index([funcionarioId])
  @@map("como_fazer_execucoes")
}
```

**Colunas novas em modelos existentes (somente adicionar):**

```prisma
// model Funcionario
  setor         String?  // COZINHA | ESTOQUE | EXPEDICAO | MOTORISTA — usado pelo Como Fazer
  senhaNumerica Boolean  @default(false) @map("senha_numerica") // senhaHash é de 4 números → pode usar o tablet
  @@index([setor, ativo])          // dentro do bloco de índices existente

// model Tarefa
  origem    String? // 'COMO_FAZER' | 'COMO_FAZER_DESVIO' | 'COMO_FAZER_CHAMADO' | 'COMO_FAZER_LEMBRETE'
  origemRef String? @map("origem_ref") // conteudoId (ou execucaoId no desvio)
  @@index([origem, origemRef])
```

`@map` nas duas colunas novas de `Funcionario`: `setor` não precisa; use `@map("setor")` por consistência. Backfill de produção: nenhum
(`senhaNumerica=false`, `setor=null` → RH preenche). `prisma db push` com colunas novas opcionais/default não exige `--accept-data-loss`.

**Status de treinamento (calculado em `comoFazerService.statusTreino(conteudo, treino, agora)`):**

| Situação | status |
|---|---|
| conteúdo não se aplica ao funcionário (setor/cargo) | `NAO_SE_APLICA` |
| não há linha com `versaoTreinoNumero == conteudo.versaoTreinoNumero` | `PENDENTE` 🟡 |
| linha existe, `exigeConfirmacao` e `confirmadoEm` nulo | `AGUARDANDO_CONFIRMACAO` 🟡 |
| linha completa e (`validoAte` nulo ou futuro > 30 d) | `OK` ✅ |
| linha completa e `validoAte` em ≤ 30 d | `VENCENDO` ⏳ |
| linha completa e `validoAte` passado | `VENCIDO` 🟡 (Fase 1: nunca ocorre, pois `reciclagemMeses` fica nulo) |
| conteúdo tem versão publicada mais nova **sem** zerar | continua `OK` (e `novaVersao:true` só para exibir "versão nova em dd/mm") |

---

## 4. Contrato das rotas

Base: `/api/como-fazer`. Formato de erro **sempre** `{ "erro": "texto em português simples", "codigo": "CODIGO_MAQUINA" }` (o front também
aceita `error` por causa de rotas antigas). Datas `YYYY-MM-DD`/`HH:MM` no fuso de São Paulo (usar `new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})`
como em `asaasService.js:61`/`utils/dataReferenciaBrasilia.js`).

Quem pode chamar:
- **P** = público com chave do aparelho · **T** = token de tablet **ou** login do app · **A** = só login do app (+ permissão).
- Tablet nunca tem permissão `Pode_*` (o token não traz `permissoes`); rotas A recusam o token de tablet com 403 `SEM_PERMISSAO`.

### 4.1 Entrar no tablet (fluxo completo)

**Pareamento (uma vez por aparelho)** — feito pelo RH no painel (aba "Aparelhos"):
1. `POST /admin/tablet/:setor/parear` **[A, `Pode_Editar_Como_Fazer`]** → `200 { setor, link: "https://<host>/setor/cozinha#k=<CHAVE>", chave }`.
   Gera 32 bytes aleatórios (hex), grava `sha256(chave)` em `AppConfig` `como_fazer_aparelhos` → `{ COZINHA: { hash, geradaEm, geradaPor } }`.
   Gerar de novo **invalida a chave anterior**. A chave é mostrada **uma vez** (guardada só em hash).
2. No tablet, abrir o link: `EntrarSetor` lê `#k=`, grava `localStorage['cf_aparelho_<slug>']`, limpa o hash da URL (`history.replaceState`). Daí em diante o tablet manda `x-cf-aparelho: <chave>` em toda chamada pública.

**Grade:** `GET /tablet/:setor/funcionarios` **[P]** (header `x-cf-aparelho`)
→ `200 { setor:{slug,nome}, funcionarios:[{ id, nome, primeiroNome, foto:"funcionarios/<id>/foto-xxx.jpg"|null }] }`
(só `ativo`, do setor, `senhaNumerica=true`, ordenados por nome). Erros: `401 APARELHO_NAO_AUTORIZADO` (sem chave/chave velha), `404 SETOR_INVALIDO`.

**PIN:** `POST /tablet/:setor/entrar` **[P]** body `{ funcionarioId, pin }` (pin = 4 dígitos string)
→ `200 { token, expiraEm (ISO, +2 min), funcionario:{id,nome,foto,setor} }`
Erros: `401 PIN_INCORRETO` (+`tentativasRestantes`), `429 AGUARDE` (`{ segundos }`), `401 APARELHO_NAO_AUTORIZADO`, `403 FUNCIONARIO_INATIVO`, `409 SEM_PIN` (sem senha de 4 números).
Token = `jwt.sign({ escopo:'como-fazer', tipo:'como-fazer-tablet', funcionarioId, setor }, JWT_SECRET+':como-fazer-tablet', { expiresIn:'2m' })`.
Sem claim `id` (deliberadamente).

**Freio do PIN (3.1):** em memória (`Map`) por `funcionarioId` e por IP: 3 erros seguidos → resposta "chame o encarregado" e espera de 30 s; 8 erros em 15 min → 5 min. Não bloqueia permanentemente (regra de ouro nº 3). Log `[ComoFazer] PIN errado funcionario=<id> ip=<ip>` (sem o PIN). Reinício do backend zera o Map (aceito; backend é instância única).

**Renovar:** `POST /sessao/renovar` **[T-tablet]** → `200 { token, expiraEm }` (novo token +2 min, mesmo funcionário). Front chama no máximo a cada 30 s de atividade. Token vencido → `401 SESSAO_EXPIROU` → front volta à grade (nunca à tela de login do app).

**Middleware `comoFazerAuth` (B3):** lê `Authorization: Bearer`; (1) tenta `jwt.verify(tk, JWT_SECRET+':como-fazer-tablet')` → se ok e `escopo==='como-fazer'`, `req.cf={origem:'TABLET', funcionarioId, setor, permissoes:{}}`; (2) senão delega ao `authMiddleware` existente e depois resolve `req.cf={origem:'APP', vendedorId:req.user.id, permissoes:req.user.permissoes, funcionarioId: <Funcionario.vendedorId=req.user.id>|null}`. Nada além de `/api/como-fazer/*` aceita o token de tablet (segredo diferente → `jwt.verify` do `authMiddleware` falha → 401).

### 4.2 Equipe (rotas T)

| Método e caminho | Body / query | Resposta |
|---|---|---|
| `GET /me` | — | `{ origem:'TABLET'|'APP', funcionario:{id,nome,foto,setor,cargo}|null, setores:[{slug,nome}], pode:{ confirmar, editar, painel } }` (`pode.*` = `admin || permissoes.Pode_*`; tablet = tudo false) |
| `GET /home` | `?setor=COZINHA` (padrão = setor do funcionário) | `{ setorAtual, setores:[{slug,nome,total,pendentes}], itens:[ItemLista] }` onde `ItemLista = { id, tipo, titulo, icone, subtitulo ("Rotina · 07:30 e 16:30" / "Máquina · montar, usar, limpar" / "versão nova em 10/10"), status (§3), novaVersao:boolean, rotina:null|{ horarios, fazerAgora:boolean, proximaEm } }`. Ordem: `PENDENTE`/`AGUARDANDO` primeiro, depois `ordem`, `titulo`. Só `PUBLICADO` e não `ARQUIVADO`. Não devolve `codigo`. |
| `GET /conteudos/:id` | — | `{ id, tipo, titulo, icone, setores, exigeConfirmacao, versao:{ id, numero, doc:<seção 5> }, meuTreino:{ status, aprendeuEm, confirmadoEm, confirmadoPor:{nome} }|null, rotina:null|{horarios,recorrencia}, relacionado:null|{id,titulo,tipo} }`. `404 NAO_ENCONTRADO` se não publicado (exceto `?previa=1` com `Pode_Editar_Como_Fazer`, que devolve o rascunho). |
| `POST /conteudos/:id/aprendi` | — | `201 { treinamento:{ id, status } }`. Idempotente (repetir devolve `200` com a mesma linha). Erros: `409 SEM_FUNCIONARIO` (usuário do app sem funcionário ligado → "peça ao RH para ligar seu usuário"), `409 NAO_SE_APLICA`. |
| `GET /encarregados` | `?setor=` | `{ encarregados:[{ funcionarioId, nome, foto }] }` — funcionários ativos do setor **com** `vendedorId` cujo vendedor tem `Pode_Confirmar_Treinamento` (ou é admin) e `senhaNumerica`. |
| `POST /conteudos/:id/confirmar` | `{ treinandoId (funcionárioId; no tablet = o logado), encarregadoId (funcionárioId), pin }` | `200 { treinamento:{ status:'OK', confirmadoPor:{nome}, confirmadoEm } }`. Regras no servidor: treinando já deu "Aprendi" (`409 FALTA_APRENDI`); `encarregadoId !== treinandoId` (`403 NAO_PODE_SE_CONFIRMAR`); encarregado tem `vendedorId` com permissão (`403 SEM_PERMISSAO`); PIN confere com `senhaHash` (mesmo freio do 4.1; `401 PIN_INCORRETO`); idempotente (já confirmado → `200`). O PIN do encarregado **não** vira sessão. Conteúdo que não exige confirmação → `409 NAO_EXIGE`. |
| `POST /conteudos/:id/execucoes` | `{ chave (uuid gerado pela tela), dataRef, horaAlvo?, tarefaId?, respostas:[{passoId,valor,foto}] }` | `201 { execucao:{ id, temDesvio, desvios:[{passoId, rotulo, mensagem}] }, tarefaDesvio:{criada:boolean} }`. **O servidor calcula o desvio** a partir da versão publicada (nunca confia no front): NUMERO fora de `[min,max]`; SIMNAO diferente de `respostaEsperada` (padrão SIM). Valida obrigatórias (`400 FALTAM_OBRIGATORIAS` + `passoIds`). `dataRef` só pode ser hoje ou ontem em SP (`400 DATA_INVALIDA`). `chave` repetida → `200` com a execução existente (idempotente). Só conteúdo `ROTINA` (`409 NAO_E_ROTINA`). Depois de gravar (FORA de transação, `try/catch` próprio): conclui as tarefas da rotina daquele dia/hora e cria a tarefa de desvio (seção 8). |
| `GET /conteudos/:id/execucoes/hoje` | — | `{ feitas:[{ horaAlvo, execucaoId, por, em, temDesvio }] }` (para o tablet marcar "Fazer agora" e para reabrir) |
| `POST /conteudos/:id/chamar-encarregado` | `{ secaoId? }` | `201 { tarefaId }` — cria tarefa `COMO_FAZER_CHAMADO` para os `responsaveisIds`, título "Chamado: <Máquina> — <quem pediu>", NUNCA WhatsApp. Anti-spam: 1 chamado a cada 2 min por (conteúdo, pessoa) → `429 AGUARDE`. |
| `POST /upload` | multipart `arquivo` + `contexto=execucao` | `201 { url:"como-fazer/execucoes/2026-10/<uuid>.jpg", tipo:'FOTO'|'VIDEO' }` (relativo a `/uploads`). Tablet pode (contexto execucao); `contexto=conteudo` exige `Pode_Editar_Como_Fazer` (A). |

### 4.3 Painel e editor (rotas A)

| Permissão | Método e caminho | Body / query | Resposta |
|---|---|---|---|
| `Pode_Ver_Painel_Como_Fazer` | `GET /painel/resumo` | `?setor&de&ate` | `{ kpis:{ treinamentosFaltando, reciclagensVencendo, rotinasComDesvio, pctRotinasNoPrazo } }` |
| idem | `GET /painel/treinamentos` | `?setor=COZINHA` | `{ conteudos:[{id,titulo,tipo,icone}], funcionarios:[{ id,nome,foto,cargo,novo:boolean, semUsuario:boolean, celulas:{ [conteudoId]:{ status, versaoNumero } } }] }` |
| `Pode_Editar_Como_Fazer` | `POST /painel/treinamentos/lembrar` | `{ funcionarioId, conteudoId }` | `201 { tarefaId }` (tarefa `COMO_FAZER_LEMBRETE` para o vendedor ligado) ou `409 SEM_USUARIO` ("esta pessoa não tem usuário no app; lembre pelo tablet") |
| `Pode_Ver_Painel_Como_Fazer` | `GET /painel/execucoes` | `?de&ate&setor&conteudoId&situacao=DESVIO|NAO_FEITA|OK|todas` | `{ itens:[{ quando, conteudoId, titulo, funcionario, situacao, detalhe, fotos[], execucaoId }] }` — `NAO_FEITA` é **calculada**: para cada rotina publicada com horário, cada dia em `[max(de,primeiraPublicacaoEm), ontem/hoje já passado]` em que `ocorreNoDia` e não há execução para (conteúdo, dia, hora) |
| idem | `GET /painel/relatorio` | `?conteudoId&de&ate` | `{ conteudo, versaoPublicada.doc, treinados:[{nome,aprendeuEm,confirmadoPor,versaoNumero}], execucoes:[…] }` p/ impressão |
| `Pode_Editar_Como_Fazer` | `GET /admin/conteudos` | `?tipo&setor&status` | lista com `codigo`, `versaoAtual`, `temRascunho`, `semFoto:N`, `agenda:{ok}` |
| idem | `POST /admin/conteudos` | `{ tipo, titulo, icone?, setores[], cargos[], horarios?, recorrencia?, diasSemana?, responsaveisIds?, codigo? }` | `201 { id }` — cria o conteúdo + versão 1 `RASCUNHO` com doc vazio do tipo (§5.4). `exigeConfirmacao` = `tipo ∈ {MAQUINA,REGRA}`. |
| idem | `GET /admin/conteudos/:id` | — | metadados + rascunho (ou última publicada) + `versoes:[{numero,status,publicadaEm}]` |
| idem | `PUT /admin/conteudos/:id` | metadados editáveis | `200` (muda título/setores/cargos/horários/responsáveis; se PUBLICADO e mudou horário/responsável/recorrência → ressincroniza agenda) |
| idem | `PUT /admin/conteudos/:id/rascunho` | `{ doc }` | `200 { doc, avisos:[…] }` — valida e normaliza (§5.5). Cria rascunho novo copiando a publicada se não existir (versão `numero+1`). Autosave a cada alteração do editor; last-write-wins. |
| idem | `POST /admin/conteudos/:id/publicar` | `{ zeraTreinamento: true }` | `200 { versao:{numero}, agenda:{ ok, criadas, desativadas, erro? } }`. Valida (§5.5 erros bloqueantes). **Transação** `{timeout:20000,maxWait:10000}` só com: versão antiga → `SUBSTITUIDA`, rascunho → `PUBLICADA`, conteúdo `status=PUBLICADO` + `versaoPublicadaId` + (`versaoTreinoNumero+1` se zera) + `primeiraPublicacaoEm`. **Fora da transação** (try/catch): `sincronizarTarefasDaRotina`; falha → publicação vale e a resposta traz `agenda.erro`. Repetir o clique sem rascunho → `409 SEM_RASCUNHO`. |
| idem | `POST /admin/conteudos/:id/arquivar` | — | `200` (some dos tablets; desativa tarefas da rotina) |
| idem | `POST /admin/conteudos/:id/sincronizar-agenda` | — | `200 { criadas, desativadas }` (botão "Refazer agenda" se o publicar avisou erro) |
| idem | `POST /admin/tablet/:setor/parear` | — | §4.1 |
| `Pode_Editar_Como_Fazer` | `POST /upload` | `contexto=conteudo` | §4.2; foto 15 MB, vídeo 45 MB. O front recusa vídeo > 22 s (metadados do `<video>`) e reduz foto para 1600 px antes de enviar (canvas). |

Permissão no backend: helper `exigirPermissao(...nomes)` → `admin === true || nomes.some(n => permissoes[n] === true)`; tablet → 403. **O front espelha exatamente** (§7.5).

---

## 5. Formato JSON ÚNICO (versão: campo `passos`)

### 5.1 Documento (`ComoFazerVersao.passos`)

```jsonc
{
  "schema": 1,
  "avisoPerigo": "Óleo quente. Nunca encher com água." ,   // opcional; faixa vermelha no topo, lida em voz alta antes do 1º passo
  "secoes": [
    {
      "id": "s_a1",
      "bloco": "PRINCIPAL",          // PRINCIPAL | MONTAR | USAR | LIMPAR | PROBLEMA
      "titulo": "Passo a passo",     // em PROBLEMA = nome da situação ("Não esquenta")
      "icone": "🌡️",                 // opcional (usado nos tiles de PROBLEMA)
      "passos": [ /* Passo */ ]
    }
  ]
}
```

- **Rotina / Regra / Dosagem:** exatamente 1 seção `PRINCIPAL`.
- **Máquina:** 1 seção `MONTAR`, 1 `USAR`, 1 `LIMPAR` e **N** seções `PROBLEMA` (cada situação = uma seção; o tile "Deu problema" lista os `titulo` delas). O viewer toca QUALQUER seção do mesmo jeito.
- Sem outro tipo de estrutura. `schema` existe só para evolução futura.

### 5.2 Passo (único, vale para todos os tipos)

```jsonc
{
  "id": "p_9f3c",                    // gerado pelo front (nanoid curto); estável entre versões (execuções apontam para ele)
  "texto": "Lave as mãos até o cotovelo, com sabão, por 20 segundos.",   // OBRIGATÓRIO, ≤ 140 caracteres (a frase lida em voz alta)
  "detalhe": "Antes de começar, depois do banheiro e toda vez que sair da cozinha.", // opcional, ≤ 240
  "foto": "como-fazer/conteudos/<conteudoId>/<uuid>.jpg",   // opcional (relativo a /uploads); sem foto o viewer mostra o ícone do tipo
  "video": null,                     // opcional "como-fazer/conteudos/…/<uuid>.mp4"; se houver, aparece ▶ sobre a foto
  "perigo": false,                   // true = passo com moldura/rótulo vermelho "Perigo" e fala "Atenção" antes
  "itens": null,                     // DOSAGEM: lista abaixo; null nos demais
  "pergunta": null                   // CHECKLIST: objeto abaixo; null nos demais
}
```

**`itens` (dosagem)** — "item tem foto da medida + quantidade + nome":
```jsonc
"itens": [
  { "id": "i_1", "nome": "Sanitizante", "quantidade": "1", "unidade": "tampa cheia", "foto": "como-fazer/conteudos/…/medida.jpg" },
  { "id": "i_2", "nome": "Água", "quantidade": "1", "unidade": "balde até a linha vermelha", "foto": "…" }
]
```
`quantidade` é texto (aceita "½", "2"); `unidade` é a medida caseira ("conchas rasas", "copo até a linha do meio"). Nada de gramas obrigatório.
O `PassoCard` desenha a grade de itens (foto + número grande + nome) quando `itens` existe — mesmo componente, mesma tela.

**`pergunta` (checklist)** — só os 3 tipos pedidos:
```jsonc
{ "tipo": "NUMERO", "rotulo": "Freezer 1 — qual a temperatura?", "obrigatoria": true,
  "min": -18, "max": -12, "unidade": "°C",
  "avisoDesvio": "Está muito quente. Passe o produto para outro freezer." }

{ "tipo": "SIMNAO", "rotulo": "A porta fecha bem?", "obrigatoria": true,
  "respostaEsperada": "SIM",                 // SIM (padrão) | NAO; resposta diferente = desvio
  "avisoDesvio": "Chame o encarregado: a porta não está vedando." }

{ "tipo": "FOTO", "rotulo": "Foto do visor", "obrigatoria": true }   // sem desvio; é evidência
```
Em `ROTINA`, passo **sem** `pergunta` = linha informativa ("Olhe a temperatura no visor"): aparece no checklist, não é obrigatória e não gera resposta. Em Regra/Máquina/Dosagem a `pergunta` é ignorada (o editor nem oferece; o validador acusa aviso).

### 5.3 Respostas da execução (`ComoFazerExecucao.respostas`)

```jsonc
[
  { "passoId": "p_a1", "tipo": "NUMERO", "valor": -10,   "desvio": true,  "mensagem": "Está muito quente. Passe o produto para outro freezer." },
  { "passoId": "p_a2", "tipo": "SIMNAO", "valor": "SIM", "desvio": false },
  { "passoId": "p_a3", "tipo": "FOTO",   "valor": null,   "foto": "como-fazer/execucoes/2026-10/<uuid>.jpg", "desvio": false }
]
```
`desvio`/`mensagem` são **escritos pelo servidor**. O cliente manda só `{ passoId, valor, foto }`.

### 5.4 Documento vazio por tipo (criação)

ROTINA/REGRA/DOSAGEM → `{schema:1, secoes:[{id,bloco:'PRINCIPAL',titulo:'Passo a passo',passos:[]}]}`;
MAQUINA → 4 blocos (`MONTAR`,`USAR`,`LIMPAR` vazios + `PROBLEMA` com 1 seção "Chamar o encarregado" opcional). O botão "Chamar o encarregado" do tile Problema NÃO é seção: é fixo da tela.

### 5.5 Validação (`comoFazerSchema.js`)

Bloqueantes (impedem publicar): `texto` vazio ou > 140; `foto/video` fora de `como-fazer/` ou com `..`; ids de passo/seção/item repetidos; ROTINA sem nenhum passo com `pergunta`; ROTINA com horário e sem `responsaveisIds`; NUMERO sem `min` ou `max` (ou `min>max`); MAQUINA sem `MONTAR/USAR/LIMPAR` com ≥ 1 passo; seção `PRINCIPAL` vazia; > 40 passos por seção.
Avisos (publica mesmo assim, aparecem no painel como "sem foto: N"): passo sem `foto`; `pergunta` em tipo que não é ROTINA.
Mantêm `id` dos passos existentes ao salvar (execuções antigas referenciam).

---

## 6. Divisão do trabalho e a "costura"

### 6.1 Ordem e paralelismo

```
Passo 0 (gerente): congelar este documento (contrato §4 e JSON §5). Cada dev lê as seções 3, 4, 5.
Passo 1  dev-backend: B1 (schema) + B2 + B3 + B9 → sobe "esqueleto": /me, /home, /conteudos/:id, tablet/*  ← LIBERA o frontend
Passo 2  em paralelo:
   dev-backend: B4 (aprendi/confirmar/execuções) → B6/B5 (agenda) → B7/B8 (painel/editor/upload) → B10 → B11 seed
   dev-frontend: F1-F2-F11 → F3 (entrar) → F4-F9 (home/viewer/treino/máquina) → F10 (checklist) → F15 → F14 → F12 (painel/editor) → F13 → F16/F17
Passo 3  seed no ambiente local → front passa a usar dado real
Passo 4  QA + revisor (em paralelo) → ajustes → gerente-entrega
Passo 5  manuais, novidade (B12, F18) — por último
```
O frontend NÃO espera o backend inteiro: desde o Passo 1 existe `GET /conteudos/:id` e o seed local; o front trabalha com o JSON de exemplo da seção 5 (colar como fixture em `docs/pop/exemplos/` se quiser).

### 6.2 Costura (onde já deu defeito nas entregas passadas — verificar SEMPRE)

| Costura | Quem produz | Quem consome | O que o consumidor faz no erro |
|---|---|---|---|
| Documento `passos` | `PUT /rascunho` normaliza e DEVOLVE `{doc}` | `EditorConteudo` (usa o doc devolvido, não o enviado) e `ViewerPassos`/`Checklist` | Se `doc.secoes` ausente/vazio → mostra "Este conteúdo ainda não tem passos" (nunca tela branca/`undefined.map`). |
| `status` do treinamento | `comoFazerService.statusTreino` (único lugar) | Home (bolinhas 🟡/✅), `FimTreinamento`, painel (matriz) | Status desconhecido → trata como `PENDENTE`. Home e painel usam o MESMO dicionário `STATUS_VISUAL` em `comoFazerService.js` (front). |
| `desvio` | só servidor | `Checklist` pinta vermelho **ao digitar** (cálculo local só para feedback imediato, mesma regra min/max) e **reconcilia** com `execucao.desvios` da resposta | Divergência → vale o servidor. |
| Permissões | backend `exigirPermissao` | `useComoFazerPermissoes()` (hook do `/me`) | 403 `SEM_PERMISSAO` → toast "Você não tem permissão para isso" e volta à Home; nunca desloga. |
| Token do tablet | `entrar` / `renovar` | `comoFazerService.clienteHttp()` | 401 `SESSAO_EXPIROU` ou `APARELHO_NAO_AUTORIZADO` → limpa `sessionStorage` (e `localStorage` da chave no 2º caso), volta a `/setor/:slug`. **Nunca** chamar `logout()` do `AuthContext` nem passar pelo interceptor do `api` global. |
| `url` de foto | `upload` devolve caminho relativo | todo `<img>`/`<video>` | helper único `urlMidia(rel)` = `${API_URL}/uploads/${rel}`; falha de carga → `onError` troca por ícone (arquivo perdido não quebra a tela). |
| Tarefa ↔ checklist | `resumoTarefa` devolve `origem`, `origemRef`, `hora`, `dataRef` | `AlertaTarefas`, `TarefasAgenda` | `origem==='COMO_FAZER'` → navega; se `origemRef` ausente (dado antigo) → cai no concluir normal. |
| Tablet "Fazer agora" | `GET /home` (`rotina.fazerAgora`) + `/execucoes/hoje` | `ComoFazerHome` | Falha ao carregar `hoje` não esconde a rotina (mostra o botão de qualquer jeito). |
| Fuso/data | servidor decide "hoje" (SP) | `Checklist` envia `dataRef` do `rotina.fazerAgora.dataRef` vindo do servidor | Nunca montar `dataRef` com `new Date().toISOString()` (UTC → vira o dia errado depois das 21 h). |

**Teste de caminho de erro obrigatório (QA):** backend desligado/lento durante "Pronto" do checklist → a tela mantém as respostas, mostra "Não consegui enviar. Toque para tentar de novo" e o reenvio usa a MESMA `chave` (não duplica).

---

## 7. Frontend — comportamento detalhado

### 7.1 Regras de todas as telas
Botões ≥ 56 px (`min-h-[56px]`), tema Starbucks (`bg-primary`, `rounded-full`), uma ação por tela, nenhum campo de texto livre para a equipe, nada de código tipo "POP-…", `lazyComRetry` em tudo, mobile-first (375 px sem scroll horizontal). `SelectBusca` em qualquer menu (painel/RH). Filtros do painel com `useFiltrosSalvos('como-fazer-painel', {…})` e período com `FiltroPeriodo`/`usePeriodoSalvo('como-fazer-painel')`.
Não persistir: busca livre, paginação, estado de modal. No tablet **não** usar `localStorage` para filtro nenhum (aparelho compartilhado): o `useFiltrosSalvos` só vale no painel (RH).
Tablet = tela cheia; esconder o gesto de "voltar ao app": não há menu (Layout já não aparece sem usuário).

### 7.2 Telas da equipe
- **EntrarSetor** (`/setor/:slug`): sem chave → card "Este aparelho ainda não foi liberado. Peça ao RH o link de liberação." Com chave: grade 2-3 colunas de fotos (iniciais se sem foto), toque → teclado 0-9 + ⌫; ao 4º dígito envia sozinho. Erro: balança + "Número errado" ; na 3ª vez "Chame o encarregado". Relógio "volta sozinho em 2 min" não aparece (silencioso).
- **ComoFazerHome**: faixa "Olá, <primeiro nome> · N coisas para aprender", 4 setores (Cozinha na Fase 1; os demais aparecem desabilitados "em breve" se não tiverem conteúdo publicado), seção "Falta aprender" (borda amarela 🟡) e "Já sei fazer" (✅). Rotina: botão "Fazer agora" quando `rotina.fazerAgora`. Tablet: botão "Sair" sempre visível.
- **ViewerPassos / PassoCard / falar.js**: foto `object-contain` ocupando ~60% da altura; frase 24-28 px; botão Ouvir 56 px (lê `texto` + `detalhe`; se `itens`, lê "quantidade unidade de nome" de cada); setas ≥ 64 px nas laterais; barra de progresso; passo `perigo` com borda vermelha e fala "Atenção. Perigo." antes. `speechSynthesis` ausente → botão Ouvir some (não quebra). **Voz deve ser iniciada no clique** (regra do iOS).
- **FimTreinamento**: texto "Agora faça na prática com o encarregado olhando"; botão "✅ Aprendi" (desabilita após uso); se `exigeConfirmacao` → "🔒 Encarregado confirma" abre `PedirPinEncarregado` (fotos dos encarregados do setor → PIN). Rótulo final "Fica registrado: <nome> aprendeu … confirmado por …" usa a resposta do servidor. Conteúdo que não exige confirmação (Rotina/Dosagem) → só "Li e entendi".
- **MaquinaTiles**: foto da máquina (1ª foto da seção USAR), faixa de perigo (lida ao abrir), 4 tiles com contagem de passos; "Deu problema" abre lista das seções `PROBLEMA` + "Chamar o encarregado" (`POST chamar-encarregado`, confirmação "Avisamos o <nome>"); "Fazer o treinamento" percorre MONTAR→USAR→LIMPAR no mesmo viewer e termina no `FimTreinamento`.
- **Checklist** (`/como-fazer/fazer/:id?tarefa=&data=&hora=`): uma linha grande por passo; NUMERO abre `TecladoNumerico` (com sinal de menos, vírgula) e valida local; SIMNAO = dois botões 👍/👎; FOTO = `<input type="file" accept="image/*" capture="environment">` (reduz a 1600 px, `POST /upload`, mostra miniatura, permite refazer); desvio local → linha vermelha com `avisoDesvio`; "Pronto ✓" desabilitado até todas as `obrigatoria` ok e nenhum upload em andamento; "Depois" volta (no app com `tarefaId` chama `tarefaService.adiar`). Ao concluir: tela "Registrado ✓" (e, se desvio, "<encarregado> foi avisado"). Guarda rascunho do checklist em `sessionStorage` (sobrevive a recarregar a página; limpa ao concluir). Gera `chave = crypto.randomUUID()` (fallback manual p/ iOS antigo) ao abrir.

### 7.3 Tablet × app
Mesmas telas; só muda o `clienteHttp()`. Em tablet o rodapé mostra "Sair"; no app, "Voltar". `useSessaoTablet` só é montado quando existe token de tablet.

### 7.4 Painel do gestor (`/rh/como-fazer`, permissão `Pode_Ver_Painel_Como_Fazer`)
Abas: **Treinamentos** (KPIs + matriz funcionário × conteúdo por setor com ✅/🟡/⏳, "novo" nos últimos 30 dias, selo "sem usuário/sem PIN" com atalho à ficha; "Lembrar" = `lembrar`); **Rotinas** (tabela desvio/não feita/OK com foto clicável, filtro período + situação); **Conteúdos** (lista + "Novo conteúdo" + editor — só com `Pode_Editar_Como_Fazer`; sem a permissão, aba somente leitura); **Aparelhos** (parear tablet por setor: mostra o link UMA vez + botão copiar + QR opcional não, só link). Desktop: tabela; mobile: cards (regra do projeto). Botão "Relatório p/ Vigilância" abre prévia → imprimir.
**Editor**: lista de seções/passos à esquerda, `PassoCard` como prévia à direita (o mesmo componente); passo = botão "Tirar foto / escolher" (câmera no celular), frase, pergunta opcional (só ROTINA), marcar perigo; itens (só DOSAGEM); arrastar para reordenar (setas ▲▼, sem lib nova); "Salvar rascunho" automático; "Publicar" abre confirmação com o checkbox "Foi só uma correção de texto (ninguém precisa treinar de novo)"; mostra `agenda.erro` se vier.

### 7.5 Espelho de permissões (front = back)
| Permissão | Backend (`exigirPermissao`) | Frontend |
|---|---|---|
| `Pode_Ver_Painel_Como_Fazer` | `admin || perm===true` em `/painel/*` | `isAdmin || hasPermission('Pode_Ver_Painel_Como_Fazer')` no menu, rota (`PrivateRoute tab=`) e abas |
| `Pode_Editar_Como_Fazer` | `/admin/*`, `lembrar`, `upload contexto=conteudo` | botões Novo/Editar/Publicar/Parear/Lembrar e aba Conteúdos editável |
| `Pode_Confirmar_Treinamento` | quem aparece em `/encarregados` e quem passa em `/confirmar` | só altera quem aparece na lista do PIN (a decisão é do servidor) |
São todas **booleanas** (`hasPermission` trata boolean em `AuthContext.jsx:111`); não usar `!!perms.objeto`. Rota "Como Fazer" para equipe: `<PrivateRoute>` sem `tab` (como Tarefas, `App.jsx:848`).
Adicionar as 3 em `PermissoesModal` (defaults + `BOOL_INDEX` + toggles). Sugestão de perfil: `Pode_Confirmar_Treinamento` para encarregados; **não** é `danger`.

### 7.6 Impressão
`imprimirNaPagina.js` = cópia fiel do padrão (classe `modo-impressao`, `@page` na raiz, área em mm, restauração por `afterprint/focus/pointerdown/visibilitychange` com guarda de 1,2 s, timeout 60 s, `print()` síncrono). **Pré-carregar as imagens na prévia** (modal "Relatório") e só então habilitar "Imprimir" — a chamada `window.print()` precisa ser síncrona no clique. Conteúdo A4: título, versão, passos (foto 6 cm + frase), quem treinou (tabela nome/data/confirmado por/versão), execuções do período. Fase 1 pode ser simples; sem `window.open`/iframe.

---

## 8. Integração com Tarefas (sem quebrar a agenda)

**Modelo:** rotina com `horarios=['07:30','16:30']`, `recorrencia='DIARIA'` → 2 `Tarefa` por responsável (`origem:'COMO_FAZER'`, `origemRef:conteudoId`, `hora`, `dataInicio` = dia da publicação em SP, `recorrencia`/`diasSemana` iguais, `titulo` = título do conteúdo, `descricao` = "Toque em Fazer agora para preencher o checklist", `insistir:true`, `criadoPorId` = quem publicou, `responsavelId` = cada encarregado). `recorrencia:'NUNCA'` + sem horário = rotina "por evento": **não gera tarefa**.

**`sincronizarTarefasDaRotina(conteudo)` (idempotente, fora de transação, chamada no publicar/arquivar/PUT de metadados/botão):**
chave natural `(origem='COMO_FAZER', origemRef, hora, responsavelId)`; cria o que falta, atualiza recorrência/dias, **desativa** (`ativo=false`, nunca deleta — preserva ocorrências/parecer) o que sobrou (horário removido, responsável removido, conteúdo arquivado). Rodar 2× produz o mesmo estado.

**Concluir:** `AlertaTarefas`/`TarefasAgenda` chamam `tarefaService.concluir` direto hoje (`AlertaTarefas.jsx:87-91`, `TarefasAgenda.jsx:201-208`). Mudanças:
1. Front (F16): `origem==='COMO_FAZER'` → botão "Fazer agora" → `navigate('/como-fazer/fazer/<origemRef>?tarefa=<id>&data=<dataRef>&hora=<hora>')`. "Lembrar em 5 min" (adiar) continua igual.
2. Back guard em `POST /tarefas/:id/concluir` (`tarefaRoutes.js:466`), colocado **depois** do `existente?.status==='CONCLUIDA'` (idempotência intacta): se `tarefa.origem==='COMO_FAZER'` → `409 { error:'Esta tarefa se conclui preenchendo o checklist.', acao:'ABRIR_CHECKLIST', conteudoId }`. (Cobre aba antiga em cache, celular desatualizado, API direta.) `COMO_FAZER_DESVIO/CHAMADO/LEMBRETE` concluem normalmente.
3. Ao gravar a execução, `concluirTarefasDaExecucao`: para cada tarefa ativa `origem=COMO_FAZER, origemRef=conteudoId, hora=horaAlvo` faz `tarefaOcorrencia.upsert` (`CONCLUIDA`, `concluidaEm`, `concluidaHora`) no `dataRef` — mesma unique `(tarefaId,dataRef)` da rota atual → o alerta para de insistir para todos os encarregados, inclusive os que não fizeram. Falha aqui não desfaz a execução (log).
4. Quando a execução é feita no tablet por um funcionário fora de horário (ex.: às 16:50 a de 16:30): `horaAlvo` = a rotina cuja janela cobre o momento (a mais recente já vencida e ainda sem execução hoje); o servidor decide se `horaAlvo` não vier.
5. Guards `PUT /:id` e `DELETE /:id` (`tarefaRoutes.js:350/442`): `origem` preenchida e ≠ DESVIO/CHAMADO/LEMBRETE → `403 'Esta tarefa é gerenciada pelo Como Fazer.'`; `resumoTarefa.podeEditar=false` para elas (some o lápis/lixeira).

**Desvio:** `criarTarefaDesvio`: `origem:'COMO_FAZER_DESVIO'`, `origemRef:execucaoId`, `dataInicio`=hoje SP, `hora`=agora+1 min SP (HH:MM), `recorrencia:'NUNCA'`, `insistir:true`, título "Desvio: <Rotina> — <rótulo> <valor>", descrição com valor, limite, quem fez, hora; `TarefaAnexo` tipo `LINK` para `/rh/como-fazer?aba=rotinas&execucao=<id>` (se o encarregado tiver o painel) — sem WhatsApp. Idempotente por `origemRef`. Se `responsaveisIds` vazio (não deve acontecer após o bloqueio do publicar) → `desvioTarefaIds=[]` e o painel mostra "sem encarregado".
**Pop-up com som a cada 5 min** (manual `tarefas.md`): as tarefas novas entram na mesma fila do `AlertaTarefas` (que mostra a mais recente e o resto vai ao sino) — **não** mexer em `POLL_MS/SNOOZE_MS`. Volume de tarefas: 2 por rotina/encarregado; avisar o dono de que várias rotinas × vários encarregados enchem o sino.
**Parecer do dia** (`Pode_Ver_Parecer_Tarefas`) passa a incluir as rotinas — é desejado (rotina atrasada aparece); confirmar com QA que a tela não quebra com os campos novos.

---

## 9. Seeds (3 conteúdos reais, todos como RASCUNHO)

Idempotente (upsert por `codigo`), via `POST /api/admin-exec/como-fazer-seed`. **Todos nascem RASCUNHO** (as fotos reais ainda não existem e o texto de higiene precisa de olho do dono/responsável técnico). Os passos vêm **sem foto** (avisos "sem foto: N" no painel).

1. **`POP-HIG-001` — "Higiene e uniforme"** · REGRA · setor COZINHA · `exigeConfirmacao=true` · 10 passos (texto ≤ 140 car.; proposta para revisão):
   1 Tire anéis, pulseiras, relógio e brincos antes de entrar. · 2 Prenda o cabelo e cubra tudo com a touca. · 3 Lave as mãos até o cotovelo, com sabão, por 20 segundos. *(do mockup; detalhe: "Antes de começar, depois do banheiro e toda vez que sair da cozinha.")* · 4 Seque as mãos com papel descartável. · 5 Vista o uniforme limpo e completo. · 6 Use sapato fechado e que não escorrega. · 7 Mantenha as unhas curtas, limpas e sem esmalte. · 8 Quem tem barba usa a proteção. · 9 Celular fica guardado no armário, não entra na cozinha. · 10 Está doente ou com ferida na mão? Avise o encarregado antes de entrar.
2. **`POP-FRZ-001` — "Temperatura dos freezers"** · ROTINA · COZINHA · `horarios=['07:30','16:30']` · `DIARIA` · `responsaveisIds=[]` (**o dono escolhe o encarregado no painel antes de publicar**, o publicar bloqueia sem isso). Passos (2 freezers de exemplo): "Olhe a temperatura no visor" (informativo) · Freezer 1: NUMERO min −18 max −12 °C com `avisoDesvio` · Freezer 1: SIMNAO "A porta fecha bem?" esperado SIM · Freezer 1: FOTO "Foto do visor" · mesmos 3 para o Freezer 2.
3. **`POP-MAQ-001` — "Fritadeira"** · MAQUINA · COZINHA · `exigeConfirmacao=true` · `avisoPerigo`="Óleo quente. Nunca encher com água. Nunca ligar sem o cesto. Use a luva térmica." · MONTAR 2 passos, USAR 2, LIMPAR 2, PROBLEMA com 1 seção "Não esquenta" (2 passos). Textos marcados "EXEMPLO — troque pelo seu".

Os textos acima são rascunho de produto, não norma sanitária: **o dono confere** antes de publicar (não afirmar conformidade legal em lugar nenhum).

---

## 10. Riscos e o que pode quebrar

| Risco | Efeito | Mitigação / quem verifica |
|---|---|---|
| **Trabalho da outra sessão não commitado** (histórico de endereço do cliente) toca `schema.prisma`, `novidades.json`, manuais e outros | `git add schema.prisma` / `novidades.json` levaria hunks da outra sessão para o nosso commit; ou conflito | Devs **não tocam** em `clienteController.js`, `clienteRoutes.js`, `gpsClientesService.js`, `DetalheCliente.jsx`, `QualidadeGps.jsx`, `clienteService.js`, `gpsQuemAtualizou.js`, `clienteEnderecoHistoricoService.js`, `HistoricoEndereco.jsx`, `docs/plano-historico-endereco-cliente.md`, `novidade-historico-endereco.html`. Edição em `schema.prisma`, `App.jsx`, `index.js`, `rh.js`, `tarefaRoutes.js`, `PermissoesModal.jsx`, `copilotoService.js`, `novidades.json` é **só aditiva**. Commit: **`git add` explícito arquivo por arquivo; nos arquivos compartilhados que a outra sessão também modificou (`schema.prisma`, `novidades.json`) usar `git add -p` e conferir `git diff --cached`**, ou esperar a outra sessão commitar primeiro e dar `git pull --rebase`. Revisor confere o diff staged. |
| Deploy com schema (`prisma db push` no start) | Falha de boot derruba o app inteiro | Só colunas opcionais/default e tabelas novas; **nada removido**; todos os `@@index` no schema; `prisma validate` + `prisma db push` no banco **local** (`hardt_local`) antes do commit; seed só depois do deploy. Bumpar `deployMarker` e verificar `/admin-exec/ping`. |
| Token do tablet vazando para outras rotas | Funcionário do tablet acessa dados do sistema | Segredo derivado (§0.4); teste do QA: usar o token do tablet em `GET /api/pedidos`, `/api/tarefas`, `/api/rh/funcionarios` → **401**. Nenhuma rota fora de `/api/como-fazer` o aceita. |
| Chave de aparelho vazada | Quem tem o link vê nomes/fotos do setor | Chave por setor, regenerável, só hash no banco; link mostrado uma vez; PIN continua exigido para qualquer dado além da grade. |
| PIN de 4 dígitos por força bruta | Alguém entra como outro funcionário | Freio por funcionário e IP (§4.1); token só alcança Como Fazer (dano baixo: "Aprendi" no nome de outro). Confirmação do encarregado usa PIN do encarregado com o mesmo freio. |
| Senhas antigas não numéricas | Funcionário não aparece na grade do tablet | `senhaNumerica` + painel "sem PIN" + RH redefine. Avisar o dono: **cada funcionário do tablet precisa ter senha de 4 números no RH**. |
| Agenda de Tarefas | Rotina cria tarefas demais; guards erram e travam tarefa comum | Guards só atuam quando `origem` preenchida (campo novo, null nas tarefas existentes → comportamento igual ao atual). QA roda o roteiro de Tarefas (§11-F). Extração de `ocorreNoDia` é movimento puro: revisor compara linha a linha; QA confere agenda de um dia com tarefa DIARIA/DIAS_SEMANA/MENSAL antes/depois. |
| `tarefaRoutes.js` é arquivo vivo em produção | Qualquer erro derruba Tarefas | Mudança mínima e testada; `node --check` + chamar `/pendentes`, `/`, `/concluir` localmente. |
| Upload fora do volume | Fotos somem no deploy (já aconteceu em 07/2026) | Só `../uploads/como-fazer` a partir de `middlewares/`; grep `uploads/` e conferir; **teste em produção atravessando um deploy**: subir foto → publicar de novo → abrir a foto (regra do CLAUDE.md). `static` `/uploads` já serve a pasta. |
| Vídeo grande | Estoura nginx (50 MB) / lento | Limite 45 MB no multer + front recusa > 22 s; nunca processar vídeo no servidor. |
| `speechSynthesis` no iPad/iOS | Sem voz pt-BR ou mudo se não for no clique | Chamar em handler de clique; escolher voz `pt-BR` quando existir, senão a padrão do aparelho; botão some se API ausente. **Testar no iPad real antes de dizer pronto.** |
| Timer de 2 min no tablet | Perde o checklist digitado | Atividade (toque) reinicia; checklist guarda rascunho em `sessionStorage`; ao expirar **volta à grade** e o rascunho só é recuperável pelo mesmo funcionário (guarda `funcionarioId` no rascunho). Aviso discreto aos 15 s finais não é necessário (decisão: simples). |
| `$transaction` | Timeout 5 s em banco lento | Só no publicar e no confirmar; sempre `{timeout:20000,maxWait:10000}`; tarefa/log/notificação fora. |
| Dado nulo em template string | "undefined" na tela | Guardar `cargo`, `confirmadoPor`, `foto`, `detalhe` antes de interpolar. |
| Dois devs no mesmo `App.jsx` | Conflito | Só o dev-frontend mexe no `App.jsx` (uma vez, no passo F14); dev-backend não. |
| Funcionário sem `setor` | Não aparece em lugar nenhum | Painel lista "Sem setor" com atalho; RH define na ficha. |
| Encarregado sem funcionário ligado | Não confirma | `/encarregados` só lista quem tem vínculo; painel avisa quem tem `Pode_Confirmar_Treinamento` mas não tem funcionário. |
| API `/api/ia-consulta/v1`, NF-e, WhatsApp, Prisma de pedidos | — | **Não tocados.** Nenhuma mensagem de WhatsApp é enviada pelo módulo (decisão do dono: desvio/chamado/lembrete = tarefa na agenda). |

---

## 11. Critérios de aceite (o que o QA clica)

Ambiente local (`/verify`): backend + Vite + banco `hardt_local`; seed rodado; 1 usuário admin, 1 usuário "encarregada" (vendedor com `Pode_Confirmar_Treinamento`, funcionário ligado, senha 4 números), 2 funcionários da Cozinha com senha 4 números e foto, 1 funcionário com senha "abc123" (não numérica), 1 usuário sem permissão nenhuma. Viewport 375×812 **e** tablet 1024×768 (landscape e retrato).

**A. Tablet / entrar**
1. `/setor/cozinha` sem chave → "Aparelho ainda não foi liberado". Nenhum nome/foto na rede (conferir resposta 401).
2. Painel → Aparelhos → Parear Cozinha → abrir o link → grade mostra só os 2 funcionários com senha de 4 números (o "abc123" não aparece); inativo não aparece.
3. Tocar foto → PIN errado ×3 → mensagem "Chame o encarregado" e espera; PIN certo entra. Sem digitar nada por 2 min → volta à grade sozinho. Tocar a cada minuto mantém a sessão.
4. Token do tablet em `GET /api/tarefas`, `/api/pedidos`, `/api/rh/funcionarios`, `/api/como-fazer/admin/conteudos` → 401/403. Regerar a chave → o aparelho velho cai em "não autorizado".

**B. Treinar (Regra — Higiene e uniforme, após publicar o seed)**
5. Home mostra 🟡 "Higiene e uniforme" no topo; abrir → 10 passos, setas ≥ 56 px, "Passo n de 10", Ouvir fala (no iPad real), sem código tipo POP em lugar nenhum.
6. Fim: "Aprendi" → status vira "aguardando confirmação" (continua 🟡). "Encarregado confirma" → escolher a encarregada + PIN errado (erro) → PIN certo → ✅; mensagem com nome/data/quem confirmou. Tentar a mesma pessoa confirmar a si mesma → recusa. Clicar "Aprendi" duas vezes → 1 só registro (banco).
7. Painel → Treinamentos: matriz mostra ✅ para ele e 🟡 para os outros. Publicar nova versão (zera) → volta 🟡 para todos; publicar com "só correção de texto" → continua ✅.

**C. Máquina (Fritadeira, já publicada com os exemplos)**
8. Tela com 4 tiles, faixa de perigo em vermelho no topo (lida em voz alta), "Deu problema" lista "Não esquenta", "Chamar o encarregado" cria tarefa na agenda dela (conferir em Tarefas); 2º toque em < 2 min → aviso, não duplica.

**D. Rotina / checklist (Temperatura dos freezers)**
9. Publicar sem encarregado → bloqueia com mensagem clara. Com encarregada → cria 2 tarefas (07:30 e 16:30) na agenda dela; republicar 2× não duplica; trocar horário desativa a antiga.
10. No horário o pop-up do app (som) aparece com "Fazer agora" (não "Concluir"); abre o checklist com `tarefa/data/hora`. Chamar `POST /api/tarefas/:id/concluir` direto → 409 `ABRIR_CHECKLIST`.
11. Checklist: "Pronto" desabilitado até as obrigatórias; −10 °C fica vermelho com a frase; −15 °C normal; SIMNAO e FOTO funcionam com câmera (no celular e no iPad); foto sobe e aparece. Concluir com desvio → tela diz quem foi avisado; encarregada recebe tarefa de desvio na agenda; painel → Rotinas mostra "Desvio" com foto.
12. Sem rede ao tocar "Pronto" → mensagem de erro, respostas preservadas, reenvio não duplica (1 execução, mesma `chave`). Concluir a execução marca a tarefa do horário como concluída (alerta para de tocar).
13. Rotina vencida sem checklist → aparece como "Não feita" no painel (testar com data de ontem forçada).
14. Tablet: "Fazer agora" na Home executa o mesmo checklist e também conclui a tarefa da encarregada.

**E. Painel e editor**
15. Sem `Pode_Ver_Painel_Como_Fazer` → item de menu não aparece e `/rh/como-fazer` mostra "Acesso Negado"; e a API devolve 403 (front = back). Com `Pode_Ver_Painel` mas sem `Pode_Editar`: painel lê, mas Novo/Publicar/Parear somem **e** a API recusa.
16. Criar conteúdo novo do zero pelo celular (foto da câmera + frase), reordenar, publicar; aparece no tablet. Foto sobrevive a recarregar. Vídeo > 22 s recusado. Rascunho nunca aparece no tablet.
17. Relatório p/ Vigilância: prévia mostra fotos, "Imprimir" abre o diálogo do navegador **sem nova aba**; no iPad real sai a folha (não a tela do app) e o app volta ao normal depois (inclusive cancelando).

**F. Regressão (obrigatória)**
18. Tarefas: criar tarefa comum, recorrente, concluir, adiar, editar, excluir, parecer do dia — tudo igual a antes. Tarefa antiga sem `origem` conclui normalmente.
19. RH: ficha do funcionário — definir senha (4 números marca "Tablet: pronto"; texto marca "sem 4 números"), definir setor, subir foto; Ponto continua entrando com a mesma senha.
20. Permissões: modal mostra as 3 chaves novas, busca por "treinamento" acha, perfil em lote não as liga sozinho para quem não deve.
21. Menu: "Como Fazer" ao lado de Tarefas nas duas barras (desktop e drawer mobile) e "Painel Como Fazer" no grupo RH apenas com permissão.
22. Mobile 375 px: todas as telas sem scroll horizontal; botões ≥ 56 px nas telas da equipe; tabelas do painel viram cards.
23. `cd frontend && npm run build` passa; `node --check` nos arquivos novos do backend; `npx prisma validate`; backend sobe limpo.
24. **Em produção, atravessando um deploy:** subir foto de conteúdo → novo deploy (push vazio) → foto ainda abre; executar checklist com foto → deploy → foto abre. Só então "pronto".

**Revisor confere:** schema só aditivo; `@@index` presentes; `$transaction` com timeout e sem log/API dentro; `uploads` só em `../uploads/como-fazer`; nenhuma rota do Como Fazer cai em `authMiddleware` sem querer nem aceita o token de tablet fora do prefixo; desvio calculado no servidor; idempotência (`chave`, unique do treinamento, sync de tarefas); sem WhatsApp; `hasPermission` booleano espelhando o `exigirPermissao`; nada em `useState` que devesse ser `useFiltrosSalvos` no painel; `lazyComRetry`; staging do git sem hunks da outra sessão.

---

## 12. O que NÃO fazer (armadilhas desta área)

- **Não** criar um editor/viewer por tipo, nem uma tabela de checklist separada, nem `treinamento_maquina`/`treinamento_regra`. Um componente de passo, um checklist, uma tabela de treinamento.
- **Não** reutilizar o `authMiddleware` nem o `JWT_SECRET` puro para o token do tablet. **Não** enviar o token do tablet pelo `api` global (o interceptor desloga e redireciona para `/login`).
- **Não** confiar no front para dizer o que é desvio, qual é a data (`dataRef` em UTC), nem se a pessoa pode confirmar.
- **Não** gravar upload fora de `backend/uploads` (`../../uploads` é o erro clássico). Não confiar só no caminho do banco: `<img onError>` com ícone.
- **Não** usar `window.open` nem iframe para imprimir; **não** editar o `ReceitaDetalhe.jsx` (copiar o padrão).
- **Não** mandar WhatsApp (nem "só um aviso interno"): desvio, chamado e lembrete = tarefa na agenda. O módulo não toca o bot da Ana.
- **Não** apagar tarefas/ocorrências ao republicar: desativar (`ativo=false`). **Não** alterar `POLL_MS`/`SNOOZE_MS` do `AlertaTarefas`.
- **Não** remover/renomear nada do schema; **não** mexer em `iaConsultaRoutes`, NF-e, devolução, Asaas.
- **Não** exibir `codigo` (POP-…) nem versão técnica ao funcionário; **não** pedir texto digitado à equipe.
- **Não** guardar filtros do painel em `useState` (use `useFiltrosSalvos`/`usePeriodoSalvo`); **não** persistir nada de filtro no tablet.
- **Não** usar `<select>` nativo (SelectBusca); **não** `React.lazy` (lazyComRetry); **não** animar `box-shadow`.
- **Não** dar `git add .`/`git add -A`: só os arquivos do Como Fazer (e `-p` nos compartilhados modificados pela outra sessão).
- **Não** deixar o tablet logado no app (DiarioGateway/alertas passariam a rodar nele): tablet só em `/setor/:slug`.
- **Não** publicar os seeds automaticamente; **não** inventar norma sanitária nos textos.

---

## 13. Ficou FORA da Fase 1 (ganchos deixados)

| Item | Gancho já deixado |
|---|---|
| QR por máquina/freezer | rota `/como-fazer/c/:id` já é um link estável por conteúdo (QR é só gerar a URL; abre dentro do app/tablet) |
| Dosagem ligada à Receita do PCP | `itens[]` por passo já tem `nome/quantidade/unidade/foto`; futuro `itens[].receitaItemId` opcional |
| Motorista (celular) | setor `MOTORISTA` já existe nos enums; mesma tela via login do app; checklist idêntico |
| Reciclagem automática 6/12 meses | colunas `reciclagemMeses`, `validoAte`, `ciclo` já no schema e no cálculo de status (`VENCENDO/VENCIDO`); falta só a UI e o job |
| Clippy lendo os conteúdos | `versao.passos` é JSON legível; Fase 3 indexa só `PUBLICADO` |
| Alarme sonoro no tablet | tablet já tem "Fazer agora"; falta polling + bip (Fase 2) |
| Setores Estoque/Expedição | só criar conteúdos (sem código novo) + parear tablets |
| `Limpar` da máquina vira rotina automática | `relacionadoId` |
| Notificação por WhatsApp de desvio | **proibida** pela regra do WhatsApp; se virar necessidade, API oficial (Meta) |

---

## 14. Porte e esforço

**Grande.** Backend: ~11 arquivos novos + 4 edições aditivas. Frontend: ~25 arquivos novos + 6 edições aditivas. Sequência: backend entrega esqueleto
(Passo 1) → frontend começa; QA só após seed local; novidade/manuais por último. Sugestão de commits: (1) schema+backend, (2) frontend, (3) integração Tarefas, (4) manuais/novidade — cada um com `git add` explícito.
