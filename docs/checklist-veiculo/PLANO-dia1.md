# Plano de execução: Checklist com Foto + IA, Entrega Dia 1 (modo TESTE)

Arquiteto, 20/10/2026. Especificação funcional: `docs/propostas/proposta-checklist-foto-ia.html`.

## Decisão do gerente de projeto (escopo cortado para caber até amanhã cedo)

**ENTRA no Dia 1:** A (tipo do veículo), B reduzido (fotos modelo: só subir e substituir, sem histórico/remover),
C (checklist de saída por foto com "Tire assim"), D (IA modo teste com fallback IA_INDISPONIVEL), E (tela de problema
com Corrigir / Seguir mesmo assim), F (persistência), G reduzido (ficha do veículo → aba Checklists como lista simples
com miniaturas, veredito, decisão, KM lido × digitado; sem modal rico), chave `checklist_foto_modo`, vareta condicional
(segunda/quinta ou luz de óleo), fallback das 6 caixinhas, manual do Clippy, novidade, deployMarker.

**FICA para o Dia 2:** selo do checklist no Caixa (`caixa.js` + `CaixaDiarioPage`), modal rico de detalhe,
remover/histórico das fotos modelo, badge "x/N" na lista de veículos, volta com foto, liberação via WhatsApp + página
Liberar/Recusar, pendência de ontem com OK, cupom da despesa, comparação com foto modelo, trava, offline.

---
(plano do arquiteto segue abaixo — colado pelo gerente)

## 1. Objetivo e entendimento

Trocar as 6 caixinhas do checklist de saída (`FormVeiculoPresencial.jsx`) por **fotos obrigatórias por ângulo, conforme o tipo do veículo**. Cada foto é analisada por uma IA e o resultado é guardado.

Se a IA achar problema, o motorista vê a frase do problema, o que fazer e o aviso de período de teste. Ele escolhe **Corrigir agora** ou **Seguir mesmo assim (teste)**.

**Em nenhuma hipótese o Dia 1 trava o início do dia.** Isso vale para IA fora do ar, upload que falha e veículo sem foto modelo.

O desenho de dados já nasce preparado para o resto: liberação pelo admin, pendência com OK, cupom da despesa e trava por chave.

Interpretações adotadas:

- **O checklist nasce antes do diário.** Hoje o diário só é criado em `iniciarDia` (`backend/services/diarioService.js:44`), depois que o motorista confirma. As fotos sobem antes disso. Por isso o `ChecklistVeiculo` é um **rascunho com `diarioId` nulo**, que o `iniciarDia` ou o `assumirVeiculo` amarra no fim.
- **Cada foto é analisada no próprio upload (síncrono).** A IA roda dentro do `POST` da foto. As fotos sobem em requisições paralelas, então a análise paralela vem de graça e dispensa fila e worker.
- **A chave `checklist_foto_modo` aceita `TESTE` (padrão), `DESLIGADO` e, no futuro, `TRAVA`.** `DESLIGADO` volta para as 6 caixinhas antigas. É o botão de emergência sem redeploy.

## 2. Mapa do código atual (conferido)

| Ponto | Onde | O que faz hoje |
|---|---|---|
| Formulário | `frontend/src/components/Diario/FormVeiculoPresencial.jsx` | 6 checkboxes em `CHECKLIST_ITENS` (linhas 8-15). `handleSubmit` exige todos marcados e chama `onConfirmar({veiculoId, kmInicial, checklist, obs})`. Carrega `/veiculos`, `/diarios/veiculos-em-uso-hoje` e `/veiculos/:id/ultimo-km`. |
| Consumidores | `DiarioGateway.jsx:82` faz `POST /diarios/iniciar {modo:'PRESENCIAL', ...dados}`. `DiarioPegarVeiculo.jsx:23` faz `POST /diarios/assumir-veiculo`. | Os dois repassam o objeto do form sem filtrar. |
| Back do início do dia | `diarioService.iniciarDia` (`:44`) e `assumirVeiculo` (`:126`) | Os dois exigem `!checklist` → erro. Gravam `checklist` em `DiarioVendedor.checklist Json`. Antes disso rodam `statusDoDia` (pendência de KM final de ontem) e `buscarPendenciasRota` (isento admin/`Isento_Ponto`), e barram veículo em uso. |
| Rotas | `backend/routes/diarios.js` (montado em `index.js:183`) → `diarioController.iniciar` e `assumirVeiculo` | `iniciar` devolve 400 com `{error, codigo}` em qualquer exceção. |
| Único leitor do JSON `checklist` | `VeiculoFicha.jsx:1172-1181` | Faz `Object.entries(d.checklist)` e mostra `✓/✗ key.replace(/Ok$/,'')`. Nenhum outro leitor (Caixa e Veículos só olham `modo==='PRESENCIAL' && veiculoId`). |
| Veículo | `model Veiculo` (`schema.prisma:1578`). Serviço `veiculoService.criar` e `atualizar` (**whitelist campo a campo**: campo novo precisa entrar manualmente). | `GET /veiculos` e `GET /veiculos/admin/todos` devolvem a linha crua, então `tipo` aparece sozinho. |
| Rotas de veículo | `backend/routes/veiculos.js` | Só `authMiddleware`, **sem checagem de permissão no backend** (o front esconde por `Pode_Editar_Veiculos`). Upload existente: `middlewares/uploadVeiculoMiddleware.js` (multer em disco, `../uploads/veiculos/<id>`). |
| Ficha | `frontend/src/pages/Veiculos/VeiculoFicha.jsx`: `TABS` (`:13`), prop `allowedTabs` (`:42`), edição inline com `form` (`:73-96`). Aberta pelo Caixa com `allowedTabs=['resumo','documentos','manutencao']` (`CaixaDiarioPage.jsx:1794`). | |
| Lista/cadastro | `frontend/src/pages/Veiculos/Veiculos.jsx` | Usa `GET /veiculos/admin/todos` (`:30`). `<select tipoCombustivel>` nativo na `:303`. |
| IA | `backend/services/aiProvider.js` | Só `gerarTexto`. Para modelos não-`gpt-4*`, só `max_completion_tokens` (sem `temperature`). Resposta pode vir vazia por consumo de tokens de raciocínio. |
| Upload de referência | `uploadComoFazerMiddleware.js` | multer em memória e gravação manual em `../uploads/...`. Padrão a copiar. |
| Compressão de foto no front | `components/ComoFazer/imagem.js` (`reduzirImagem`, 1600px / q0.85) | Modelo. **Não alterar**: usada pelo Como Fazer. Criar função nova. |
| Câmera | `Checklist.jsx` do Como Fazer (`:238`): `<input type=file accept="image/*" capture="environment">` | Padrão já em uso. |
| `/uploads` | `index.js:135`: `express.static` **público, sem autenticação** | Foto de checklist ficará acessível por URL. Mitigação na seção 10. |
| Config | tabela `app_configs` (`key` String, `value` Json), lida com `prisma.appConfig.findUnique` | |
| WhatsApp interno (Dia 2) | `backupService.alertarFalha`: vendedores com `permissoes.admin` e telefone, `webhookService.enviarMensagemCustom(..., {tipo:'interno'})` | Só texto. |
| Caixa, visão do escritório | `backend/routes/caixa.js:392-404` monta `diarioInfo`, consumido por `CaixaDiarioPage.jsx:723-830` | (Dia 2) |
| Data de referência | `backend/utils/dataReferenciaBrasilia.js` (`getDataReferencia`) | Usar para "hoje" e para a regra de segunda e quinta. |

## 3. Decisões de desenho que o dev precisa seguir

1. **Catálogo de ângulos em um único lugar no backend:** `backend/config/checklistVeiculoAngulos.js`. O frontend **nunca** repete a lista: recebe tudo por `GET /veiculos/:id/checklist-config`.
2. **Compatibilidade com front antigo (PWA em cache):** `/diarios/iniciar` e `/assumir-veiculo` continuam aceitando `checklist` (objeto) sem `checklistId`. O backend deploya primeiro e nada quebra.
3. **O servidor decide `podeSeguir`.** O front não tem regra de trava. Hoje `podeSeguir` é sempre `true`.
4. **Nenhuma falha na análise da IA bloqueia.** Timeout, erro, chave ausente ou resposta inválida → `statusIa='IA_INDISPONIVEL'` e o fluxo segue.
5. **Sem `$transaction`** no módulo novo. IA e disco ficam fora de qualquer transação.
6. **Persistência em duas tabelas** (checklist e foto) mais a de foto modelo.

## 4. Schema Prisma proposto (só adições, nada removido)

```prisma
// em model Veiculo: adicionar
tipo String @default("CARGA") // CARGA | PASSEIO | PARTICULAR
checklists ChecklistVeiculo[]
fotosModelo VeiculoFotoModelo[]
// em model Vendedor e DiarioVendedor: só os campos de relação inversa (não criam coluna).

model ChecklistVeiculo {
  id             String  @id @default(uuid())
  diarioId       String? @map("diario_id")      // nulo enquanto rascunho; preenchido em iniciar/assumir
  veiculoId      String  @map("veiculo_id")
  vendedorId     String  @map("vendedor_id")
  dataReferencia String  @map("data_referencia") // YYYY-MM-DD (fuso Brasília)
  momento        String  @default("SAIDA")       // SAIDA | VOLTA (VOLTA = Dia 2)
  tipoVeiculo    String  @map("tipo_veiculo")    // snapshot do Veiculo.tipo
  modo           String  @default("TESTE")       // snapshot de checklist_foto_modo
  status         String  @default("RASCUNHO")    // RASCUNHO | CONCLUIDO
  kmDigitado     Int?    @map("km_digitado")
  kmLido         Int?    @map("km_lido")         // lido pela IA no painel
  luzOleoAcesa   Boolean @default(false) @map("luz_oleo_acesa")
  veredito       String?                          // APROVADO | ATENCAO | REPROVADO | IA_INDISPONIVEL
  problemas      Json?                            // lista consolidada (formato da seção 6)
  fotosPuladas   Json?   @map("fotos_puladas")    // [{angulo, motivo}]
  decisao        String?                          // CORRIGIU | SEGUIU_TESTE
  decisoes       Json?                            // log [{decisao, em}]
  decisaoEm      DateTime? @map("decisao_em")
  // ---- reservado para o Dia 2 (nasce vazio) ----
  liberacaoStatus   String?   @map("liberacao_status")    // PEDIDA | LIBERADA | RECUSADA | EXPIRADA
  liberacaoPedidaEm DateTime? @map("liberacao_pedida_em")
  liberacaoPorId    String?   @map("liberacao_por_id")
  liberacaoMotivo   String?   @map("liberacao_motivo") @db.Text
  liberacaoEm       DateTime? @map("liberacao_em")
  okPendenciaPorId  String?   @map("ok_pendencia_por_id")
  okPendenciaMotivo String?   @map("ok_pendencia_motivo") @db.Text
  okPendenciaEm     DateTime? @map("ok_pendencia_em")
  criadoEm     DateTime @default(now()) @map("criado_em")
  atualizadoEm DateTime @updatedAt @map("atualizado_em")
  concluidoEm  DateTime? @map("concluido_em")

  veiculo  Veiculo         @relation(fields: [veiculoId], references: [id])
  vendedor Vendedor        @relation(fields: [vendedorId], references: [id])
  diario   DiarioVendedor? @relation(fields: [diarioId], references: [id])
  fotos    ChecklistVeiculoFoto[]

  @@index([diarioId])
  @@index([veiculoId, dataReferencia])
  @@index([vendedorId, dataReferencia])
  @@map("checklists_veiculo")
}

model ChecklistVeiculoFoto {
  id          String @id @default(uuid())
  checklistId String @map("checklist_id")
  angulo      String
  caminho     String                 // /uploads/checklists-veiculo/<veiculoId>/<AAAA-MM-DD>/<checklistId>/<angulo>-<hex>.jpg
  ativa       Boolean @default(true) // refazer = nova linha; a anterior vira ativa=false (histórico)
  tamanhoBytes Int?   @map("tamanho_bytes")
  statusIa    String  @default("NAO_ANALISADA") @map("status_ia") // OK | ATENCAO | REPROVA | REFAZER | IA_INDISPONIVEL | NAO_ANALISADA
  serve       Boolean?
  motivoRefazer String? @map("motivo_refazer") @db.Text
  problemas   Json?
  leituras    Json?
  iaModelo    String? @map("ia_modelo")
  iaMs        Int?    @map("ia_ms")
  iaTokens    Int?    @map("ia_tokens")
  criadoEm    DateTime @default(now()) @map("criado_em")

  checklist ChecklistVeiculo @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  @@index([checklistId, angulo])
  @@map("checklist_veiculo_fotos")
}

model VeiculoFotoModelo {
  id          String  @id @default(uuid())
  veiculoId   String  @map("veiculo_id")
  angulo      String
  caminho     String                 // /uploads/veiculos/<veiculoId>/modelo/<angulo>-<hex>.jpg
  ativa       Boolean @default(true) // histórico preservado (refazer = nova linha, anterior ativa=false)
  criadoPorId String? @map("criado_por_id")
  criadoEm    DateTime @default(now()) @map("criado_em")
  veiculo Veiculo @relation(fields: [veiculoId], references: [id])
  @@index([veiculoId, angulo, ativa])
  @@map("veiculo_fotos_modelo")
}
```

- `Veiculo.tipo` com `@default("CARGA")` é adição segura. Tudo aditivo: `db push` sem `--accept-data-loss`.
- Conferir com `npx prisma validate` e `prisma generate`.
- **Chave:** `app_configs.checklist_foto_modo` = `"TESTE"`. O service cria a linha na primeira leitura se não existir. Valores: `TESTE | DESLIGADO | TRAVA`. Desconhecido = `TESTE`.

## 5. Contrato back × front (a costura)

Todas as rotas passam pelo `authMiddleware`. Erros: `{ "error": "mensagem em português", "codigo"?: "CODIGO" }`. Campos em `camelCase`. URLs de imagem **relativas** (`/uploads/...`).

**Montagem:** `app.use('/api/checklists-veiculo', authMiddleware, require('./routes/checklistsVeiculo'))` em `index.js`. Endpoints de veículo entram em `routes/veiculos.js`.

**DTO de foto (`FotoDTO`):**
```json
{ "id":"uuid", "angulo":"frente", "url":"/uploads/checklists-veiculo/...jpg",
  "statusIa":"OK", "serve":true, "motivoRefazer":null,
  "problemas":[{"gravidade":"ATENCAO","descricao":"...","oQueFazer":"..."}],
  "leituras":{"placa":"ABC1D23","km":84312,"combustivel":"3/4","luzesAviso":[],"nivelAgua":null,"nivelOleo":null},
  "criadoEm":"2026-10-21T08:31:02.000Z" }
```

### 5.1 `GET /api/veiculos/:id/checklist-config`
Qualquer usuário logado. Resposta 200:
```json
{
  "veiculoId":"uuid","placa":"ABC1D23","modelo":"Fiorino","tipo":"CARGA",
  "modo":"TESTE","dataReferencia":"2026-10-21","varetaHoje":true,
  "temFotoModelo":true,"fotosModeloFaltando":["vareta_oleo"],
  "slots":[
    {"angulo":"frente","rotulo":"Frente com placa","instrucao":"Frente inteira, a 2 m, pegando a placa e os faróis","dicaNoite":"Use o flash da câmera","ordem":1,
     "obrigatorio":true,"condicional":false,"fotoModeloUrl":"/uploads/veiculos/<id>/modelo/frente-ab12.jpg"},
    {"angulo":"vareta_oleo","rotulo":"Vareta de óleo","instrucao":"Ponta da vareta sobre papel branco","dicaNoite":"...","ordem":7,
     "obrigatorio":false,"condicional":true,"condicao":"SEGUNDA_QUINTA_OU_LUZ_OLEO","fotoModeloUrl":null}
  ]
}
```
- `slots` já vem filtrado pelo tipo. `obrigatorio` da vareta = `varetaHoje` (segunda ou quinta, Brasília). O front soma "luz de óleo acesa" → vareta obrigatória.
- `modo:"DESLIGADO"` faz o front mostrar as 6 caixinhas antigas.
- 404 veículo inexistente; 400 inativo.

### 5.2 `POST /api/checklists-veiculo`
Body: `{ "veiculoId":"uuid", "momento":"SAIDA", "kmDigitado":84312, "luzOleoAcesa":false }`. Só `veiculoId` obrigatório.
- **Idempotente:** reaproveita o rascunho do mesmo `vendedor + veiculo + SAIDA + dia` sem `diarioId`.
- 200: `{ "id","status":"RASCUNHO","veiculoId","tipo","modo","dataReferencia","kmDigitado","luzOleoAcesa","fotos":[FotoDTO ativas],"fotosPuladas":[] }`.
- 400 `VEICULO_INATIVO`; 404.

### 5.3 `PATCH /api/checklists-veiculo/:id`
Body: `{ "kmDigitado"?:int, "luzOleoAcesa"?:bool }`. Resposta: objeto de 5.2. Só o dono do rascunho (403).

### 5.4 `POST /api/checklists-veiculo/:id/fotos` (multipart/form-data)
Campos: `angulo` (texto) e `arquivo` (jpeg/png/webp; até 6 MB; mínimo 5 KB).
- Valida `angulo` nos slots do tipo (400 `ANGULO_INVALIDO`).
- Grava em `path.join(__dirname,'../uploads/checklists-veiculo/<veiculoId>/<data>/<checklistId>/<angulo>-<hex16>.jpg')`.
- Foto anterior do mesmo ângulo vira `ativa=false`.
- Roda a IA (timeout 25 s) e grava o resultado. Máx. 6 envios por ângulo (400 `MUITAS_TENTATIVAS`).
- **201**: `{ "foto":{FotoDTO}, "checklist":{"id":"uuid","fotosEnviadas":5} }`
- Erros: 400 `ANGULO_INVALIDO`, 400 `ARQUIVO_INVALIDO`, 403, 409 `CHECKLIST_FECHADO`, 413 `ARQUIVO_GRANDE`.
- **A IA nunca causa erro HTTP.** Falha → 201 com `statusIa:"IA_INDISPONIVEL"`, `serve:true`.
- `serve:false` → front mostra `motivoRefazer` no slot e reabre a câmera ao toque.

### 5.5 `POST /api/checklists-veiculo/:id/pular`
Body: `{ "angulo":"bau", "motivo":"FALHA_ENVIO"|"SEM_CONDICAO"|"OUTRO" }`. Só com `modo=TESTE`. Resposta: objeto de 5.2.

### 5.6 `POST /api/checklists-veiculo/:id/avaliar`
Body: `{ "kmDigitado": 84312 }`. Pode ser chamado várias vezes. Grava `veredito`, `problemas`, `kmLido`. 200:
```json
{
 "veredito":"ATENCAO","modo":"TESTE",
 "completo":false,"faltando":["bau"],
 "problemas":[
   {"angulo":"agua_radiador","gravidade":"REPROVA","descricao":"Água do radiador abaixo do mínimo",
    "oQueFazer":"Complete com água até a marca MAX e refaça a foto","origem":"IA"},
   {"angulo":"painel","gravidade":"ATENCAO","descricao":"KM do painel (84.390) diferente do digitado (84.312)",
    "oQueFazer":"Confira o KM digitado","origem":"REGRA"}
 ],
 "aviso":"Estamos em período de teste. Em breve não será possível sair com o veículo assim sem liberação do escritório.",
 "podeSeguir":true,
 "podePedirLiberacao":false
}
```
O aviso **sai pronto do servidor**.

### 5.7 `POST /api/checklists-veiculo/:id/decisao`
Body: `{ "decisao":"CORRIGIU"|"SEGUIU_TESTE" }`. Append em `decisoes`, atualiza `decisao`/`decisaoEm`. `{ "ok":true,"decisao":"..." }`. `SEGUIU_TESTE` só com `modo=TESTE` (400 `TRAVA_ATIVA`).

### 5.8 Mudança em `POST /api/diarios/iniciar` e `POST /api/diarios/assumir-veiculo`
Aceitam `checklistId` (opcional):
- Com `checklistId` válido (do próprio vendedor, mesmo `veiculoId`, sem `diarioId`), o backend deriva o `checklist` do diário (resumo compatível). Não exige `checklist` do cliente.
- Depois de criar o diário, `UPDATE checklists_veiculo SET diario_id, status='CONCLUIDO', concluido_em` em `try/catch` próprio. Falha → só loga; o dia já está aberto.
- `checklistId` inválido: **loga e segue** com o `checklist` do corpo ou `{}`.
- **Resumo compatível** em `DiarioVendedor.checklist`, booleanos com sufixo `Ok`: `frenteOk, lateralDireitaOk, lateralEsquerdaOk, traseiraOk, painelOk, aguaOk, oleoOk, bauOk, portaMalasOk` (só os do tipo). `true` = foto enviada e sem REPROVA.

### 5.9 Escritório
- `GET /api/veiculos/:id/checklists?limit=30&de=YYYY-MM-DD&ate=YYYY-MM-DD`. Permissão `admin || Pode_Acessar_Veiculos`. Array por mais recente:
```json
[{ "id","dataReferencia","momento","vendedor":{"id","nome"},"veredito","decisao","modo",
   "kmDigitado","kmLido","problemas":[...],"diarioId",
   "fotos":[FotoDTO + {"rotulo":"Frente com placa"}],"criadoEm" }]
```
- `GET /api/checklists-veiculo/:id` (detalhe). Permissão: dono, `admin`, `Pode_Acessar_Veiculos`, `Pode_Acessar_Caixa` ou `Pode_Editar_Caixa`.
- (Dia 2) aditivo em `GET /caixa/diario`: `diario.checklist = { id, veredito, decisao, modo, fotosTotal } | null`.

### 5.10 Fotos modelo
- `GET /api/veiculos/:id/fotos-modelo` → `{ "tipo":"CARGA", "slots":[{"angulo","rotulo","instrucao","modelo":{"id","url","criadoEm","criadoPorNome"}|null}] }`. Logado.
- `POST /api/veiculos/:id/fotos-modelo` (multipart `angulo`, `arquivo`). Backend: `admin || Pode_Editar_Veiculos`. 201 `{ "slot":{...} }`. Grava em `path.join(__dirname,'../uploads/veiculos/<id>/modelo/<angulo>-<hex>.jpg')`. Substituir = nova linha ativa, anterior `ativa=false`.
- (Dia 2) `DELETE /api/veiculos/:id/fotos-modelo/:angulo`.
- `PUT /api/checklists-veiculo/config/modo` `{ "modo":"TESTE"|"DESLIGADO" }`, só `admin`. Declarar **antes** de `/:id`.
- `PUT /api/veiculos/:id` e `POST /api/veiculos` aceitam `tipo`. Fora de `CARGA|PASSEIO|PARTICULAR` → 400.

## 6. IA: provedor, prompts e formato

### 6.1 `aiProvider.js`
Nova função `analisarImagem({ system, texto, imagens:[{base64, mime}], maxTokens, json:true, timeoutMs })`.
- OpenAI: `content: [{type:'text',text}, {type:'image_url', image_url:{url:'data:image/jpeg;base64,...', detail:'auto'}}]`.
- Modelo = `AI_MODEL_VISAO || AI_MODEL || padrão`. Timeout 25 s.
- `maxTokens` alto (**2000+**): o `gpt-6-luna` gasta tokens com raciocínio.
- Gemini: `inlineData` nas `parts` (mínimo) ou lançar "visão não suportada" (vira `IA_INDISPONIVEL`).
- Não mudar `gerarTexto`.

**Prova obrigatória (antes de codar o resto):** chamada real com a `OPENAI_API_KEY` do `backend/.env` e uma foto de teste. Mostrar resposta, tempo e tokens. Se `gpt-6-luna` recusar imagem, descobrir modelo com visão (`openai.models.list()`) e fixar em `AI_MODEL_VISAO` com fallback. Se precisar de `AI_MODEL_VISAO`, o dono cria no EasyPanel (entra na nota de entrega).

### 6.2 `backend/services/checklistVeiculoIaService.js`
`analisarFoto({ buffer, mime, angulo, veiculo, tipo, kmDigitado, ultimoKmFinal, luzOleoAcesa })` → JSON. `catch` geral → `{ statusIa:'IA_INDISPONIVEL', serve:true }`. Sem chave (`!aiProvider.isConfigured()`) nem tenta.

**Prompt de sistema (rascunho):**
```
Você confere fotos de checklist de um veículo de entregas (salgados congelados) tirada por um
motorista, muitas vezes de madrugada ou à noite, no pátio. Responda SOMENTE um JSON válido.

REGRAS
1. NUNCA reprove nem peça para refazer porque "a foto está escura/baixa luz". Se algo importante
   não está visível, diga o que NÃO consegue ver e o que o motorista deve fazer
   (ex.: "não vejo o pneu traseiro; aproxime 1 m e aponte o flash para o pneu").
2. Só relate o que enxerga. Em caso de dúvida real, use serve=false com motivoRefazer
   ou gravidade ATENCAO. Nunca invente leitura (placa, KM, nível).
3. REPROVA só para risco de segurança ou operação evidente: pneu visivelmente murcho/careca,
   nível de água ou óleo claramente abaixo do mínimo, luz de aviso grave acesa (freio, óleo,
   temperatura, airbag), placa que não é a do veículo, porta/baú aberto ou danificado,
   dano grave. Sujeira leve, risco pequeno, amassado antigo, dúvida = ATENCAO.
4. Frases curtas, em português do Brasil, para quem dirige. Máx. 140 caracteres cada.
5. serve=false SOMENTE se a foto não permite avaliar o ângulo pedido (cortada, borrada, outro
   assunto, ângulo errado). Informe motivoRefazer e como tirar de novo.

FORMATO
{"serve":bool,"motivoRefazer":string|null,
 "problemas":[{"gravidade":"ATENCAO"|"REPROVA","descricao":string,"oQueFazer":string}],
 "leituras":{"placa":string|null,"km":int|null,"combustivel":string|null,
             "luzesAviso":[string],"nivelAgua":"ABAIXO_MIN"|"OK"|"ACIMA_MAX"|null,
             "nivelOleo":"ABAIXO_MIN"|"OK"|"ACIMA_MAX"|null}}
Campos não aplicáveis a este ângulo: null (ou [] para lista).
```

**Complemento por ângulo:** `Veículo: {modelo} {placa}, tipo {CARGA|PASSEIO}. Ângulo: {rotulo}.` mais:

| Ângulo | Instrução ao modelo |
|---|---|
| `frente` | Frente com a placa legível. Leia a placa. Farol quebrado, para-brisa trincado, para-choque, pneus dianteiros murchos. |
| `lateral_direita` / `lateral_esquerda` | Veículo inteiro de lado. Dois pneus: murcho, careca, parede estufada. Amassado ou risco grande. Pneu não visível → `serve=false` ou ATENCAO "aproxime do pneu". |
| `traseira` | Placa traseira legível. Lanternas, porta/baú fechado, para-choque. |
| `painel` | Painel ligado. Odômetro total (`km`, inteiro), combustível, luzes de aviso acesas. Freio/óleo/temperatura/airbag = REPROVA. KM ilegível → `km=null` (**não** é problema). |
| `agua_radiador` | Reservatório com MIN/MAX. Abaixo do MIN = REPROVA; entre = OK; acima = ATENCAO. Marca não aparece → `serve=false` ("abra o capô e aproxime o celular do reservatório"). |
| `vareta_oleo` | Ponta da vareta sobre papel branco. Entre as marcas = OK; abaixo = REPROVA; muito escuro/espesso = ATENCAO. |
| `bau` (CARGA) | Interior limpo e organizado? Termômetro se visível. Sujeira grande ou carga solta = ATENCAO. |
| `porta_malas` (PASSEIO) | Mostruário e caixa térmica no lugar, limpeza. |
| `painel` (PARTICULAR) | Igual ao painel, sem placa externa. |

### 6.3 Regras no servidor (`checklistVeiculoService.avaliar`) — constantes num objeto configurável
- **Placa:** normalizar. Igual → ok. Distância 1 → ignora. ≥ 2 → REPROVA. Nula → nada.
- **KM lido × digitado:** ≤ 5 ok; 6–1000 ATENCAO; > 1000 REPROVA. Nulo → nada.
- **KM lido × KM final de ontem** (`veiculoService.ultimoKmFinal`): lido < último final − 5 → ATENCAO.
- **Veredito:** REPROVA → `REPROVADO`; senão ATENCAO / REFAZER pendente / obrigatória faltando → `ATENCAO`; nenhuma analisada → `IA_INDISPONIVEL`; senão `APROVADO`.
- **Vareta:** obrigatória se `varetaHoje` ou `luzOleoAcesa`.

## 7. Arquivos a criar e alterar

### Backend
**Criar:** `backend/config/checklistVeiculoAngulos.js`; `backend/services/checklistVeiculoService.js`; `backend/services/checklistVeiculoIaService.js`; `backend/routes/checklistsVeiculo.js` (multer em memória, gravação manual, `../uploads/checklists-veiculo/...`).
**Alterar:** `schema.prisma` (seção 4); `aiProvider.js` (`analisarImagem`, `AI_MODEL_VISAO`); `veiculoService.js` (`tipo` em criar/atualizar com validação); `routes/veiculos.js` (`checklist-config`, `fotos-modelo` GET/POST, `checklists`); `diarioService.js` (`checklistId` em `iniciarDia` e `assumirVeiculo`, **sem mexer na ordem das travas**); `index.js` (montar rota); `adminExec.js` (deployMarker `checklist-foto-dia1-2026-10-20`); `manuais/abas/veiculos.md` (tipo, fotos modelo, aba Checklists, seção "Checklist de saída por foto"; corrigir rota do cabeçalho para `/admin/veiculos`). Sem tela/rota nova → nada em `ABAS`.

### Frontend
**Criar:** `utils/comprimirFoto.js` (1280 px, JPEG q0.8→0.6 até ≤ ~350 KB; falha → original); `services/checklistVeiculoService.js`; `components/Diario/ChecklistFotos.jsx` (grade 3 col. mobile, estados por slot, toggle "Luz de óleo acesa?", "Faltam N fotos", falha de envio com "Tentar de novo" / "Pular esta foto (teste)"); `components/Diario/TireAssimModal.jsx`; `components/Diario/ChecklistProblemaTela.jsx` (aviso vem do servidor; lugar reservado para "Pedir liberação", sem botão); `pages/Veiculos/FotosModeloVeiculo.jsx` (subir/substituir; leitura para quem não edita); `pages/Veiculos/ChecklistsVeiculoLista.jsx` (lista simples).
**Alterar:** `FormVeiculoPresencial.jsx` (bloco CHECKLIST → `ChecklistFotos`; submit: valida KM → `avaliar` → se ATENCAO/REPROVADO mostra `ChecklistProblemaTela` → Seguir chama `decisao SEGUIU_TESTE` → `onConfirmar({ veiculoId, kmInicial, checklistId, obs })`; **manter as 6 caixinhas como fallback** para `modo==='DESLIGADO'` ou `checklist-config` falhando); `Veiculos.jsx` (Tipo com `SelectBusca`, badge de tipo); `VeiculoFicha.jsx` (`tipo` no form/PUT; abas `fotos` e `checklists`; **não** nas `allowedTabs` do Caixa); `public/novidade-checklist-foto.html` + `novidades.json`.

**Permissões (front = back):** aba Checklists `admin || Pode_Acessar_Veiculos`; upload foto modelo `admin || Pode_Editar_Veiculos`. Booleanos explícitos.

## 8. Ordem de execução
Back e front começam juntos pelo contrato da seção 5. **dev-backend:** schema + catálogo + tipo (1 h) → **prova da visão** (1 h, começar logo) → fotos modelo + config (1,5 h) → rotas do checklist + avaliar/decisao/pular (3 h) → prompts e calibração com fotos reais inclusive noturnas (2 h) → diarioService + listas + deployMarker + manual (1,5 h) → curl em cada rota inclusive erro. **dev-frontend:** comprimirFoto + service + ChecklistFotos (2,5 h) → TireAssim + ProblemaTela + FormVeiculoPresencial com fallback (3 h) → Veiculos.jsx + VeiculoFicha (3 h) → aba Checklists (1,5 h) → novidade + build + 375 px.
**Deploy:** backend primeiro, depois frontend, depois QA em produção. Fotos modelo cadastradas antes de a equipe testar.

## 9. Flash, câmera e "sem sinal"
- **Flash:** o navegador **não controla** o flash com `capture` (câmera nativa decide). Dia 1 = câmera nativa + orientação escrita abaixo dos slots externos e de capô: "Pouca luz? Antes de bater a foto, toque no raio (⚡) da câmera e deixe em Automático ou Ligado. A IA não reprova foto por ser escura: se faltar algo, ela diz o que mostrar."
- **Sem sinal:** sem fila offline no Dia 1. Slot mostra "Falha no envio" com **Tentar de novo** (sem rebater) e **Pular esta foto (teste)**. Fotos já enviadas voltam ao reabrir (rascunho idempotente).

## 10. Riscos e mitigação
| # | Risco | Mitigação |
|---|---|---|
| 1 | `gpt-6-luna` sem imagem ou > 20 s por foto | Prova real antes; `AI_MODEL_VISAO`; timeout 25 s; falha = `IA_INDISPONIVEL`, segue |
| 2 | Falso positivo da IA | Prompt conservador (dúvida = ATENCAO), tolerâncias configuráveis, decisões gravadas |
| 3 | Contrato do `iniciar` quebra Caixa/Veículos | `checklistId` opcional e aditivo; `checklist` segue com booleanos `*Ok` |
| 4 | Ordem das travas do `iniciarDia` | `checklistId` tratado depois das travas e do `create` |
| 5 | PWA em cache antigo × back novo | Back aceita payload antigo; front cai no fallback se `checklist-config` falhar |
| 6 | Upload fora de `backend/uploads` | `__dirname` + `../uploads/...`; **gravar → deploy → ler em produção** |
| 7 | `/uploads` público | Nome aleatório hex16 + pasta UUID; risco aceito no teste, avisar o dono |
| 8 | Disco/backup (≈2,4 MB por motorista/dia) | Avisar; retenção fica para o Dia 3 |
| 9 | Duplo envio | Mais novo vira ativa; limite 6 por ângulo |
| 10 | `tipo` mal preenchido (Uno como CARGA) | Escritório confere o tipo antes do teste |
| 11 | `PUT/POST /veiculos` sem permissão no back (pré-existente) | Rotas novas checam; endurecer antigas depois |
| 13 | Dois motoristas no mesmo veículo | Trava "veículo em uso" já existe; rascunho é por vendedor |
| 14 | Texto "escritório foi avisado" sem mecanismo | Texto honesto: "Este veículo ainda não tem foto modelo cadastrada." |
| 15 | KM final de ontem pendente | Continua barrando no confirmar, como hoje |

**O que NÃO fazer:** remover/renomear colunas; repetir catálogo no front; IA em `$transaction`; `window.open`/iframe/`<select>` nativo; galeria; front decidir `podeSeguir` ou o texto do aviso; bloquear em falha; alterar `ComoFazer/imagem.js`; WhatsApp no Dia 1.

## 11. Critérios de aceite (QA clicando; 375 px incluído)
1. Veículos: Tipo Carga/Passeio/Particular editável; badge na lista (tabela desktop, card mobile, sem scroll horizontal).
2. Ficha → "Fotos modelo": Carga 8 slots; Passeio troca baú por porta-malas; Particular só painel. Subir e substituir funcionam.
3. Sem `Pode_Editar_Veiculos`/admin: vê, não envia; `POST` direto → 403.
4. (Dia 2) badge x/N.
5. Home Office → Presencial e "Pegar veículo": slots do tipo, **sem** caixinhas. Slot abre "Tire assim" com a foto modelo; sem modelo, genérico.
6. Câmera nativa, não galeria.
7. Foto sobe na hora ("enviando/analisando"), slot verde. Foto ruim volta vermelha com motivo e permite refazer.
8. Vareta obrigatória só segunda/quinta ou com "luz de óleo acesa".
9. KM diferente ou placa de outro veículo → tela de problema com frase, o que fazer e aviso fixo. **Nunca** "foto escura".
10. **Corrigir agora** volta aos slots; **Seguir mesmo assim (teste)** abre o dia.
11. (Dia 2) selo no Caixa.
12. Ficha → aba Checklists: lista por dia com veredito, decisão, KM lido × digitado, miniaturas.
13. Aba "Motoristas" da ficha segue mostrando ✓/✗ (compat).
14. **IA fora** (sem `OPENAI_API_KEY`): foto sobe "sem análise", veredito `IA_INDISPONIVEL`, dia abre.
15. **Upload falhando**: "Tentar de novo" e "Pular esta foto (teste)"; dia abre.
16. **Sem foto modelo**: genérico, nada trava.
17. **`checklist-config` falhando** ou `DESLIGADO`: 6 caixinhas e fluxo antigo inteiro.
18. Checklist de outro vendedor: 403. `checklistId` inválido no `iniciar`: dia abre.
19. KM final de ontem pendente: `iniciar` barra com a mesma mensagem.
20. Reabrir o app no meio: fotos enviadas voltam.
21. **Produção:** foto modelo + foto de checklist → deploy → abrir ambas.

**Revisor:** caminhos de upload; `podeSeguir`/aviso só do back; permissões espelhadas; nada removido do schema; `tipo` na whitelist; grep consumidores de `diario.checklist`; build.

## 12. Estimativa
dev-backend 9–10 h; dev-frontend 12–13 h (menos com os cortes); QA 3 h + 1 h deploy; revisão 1–1,5 h; gerente 1,5 h.
