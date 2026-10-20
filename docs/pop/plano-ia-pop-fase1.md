# PLANO — Fase 1 "Começar com a IA" (Como Fazer) — HEAD 9f11fa22 · 20/10/2026

> Decisões do gerente de projeto sobre o plano do arquiteto: **D1–D8 aceitas**; **P1 resolvida**: criar `GET /api/como-fazer/ia/status` (ESCOPO_EDITAR) → `{ ligado, temChave, usadasHoje, limite }` e o front esconde os botões ✨ quando `!ligado || !temChave`. Foto no "montar" fica para a Fase 1b. Fase 1 usa **somente o provider OpenAI já configurado (gpt-6-luna)**; Claude aparece desabilitado no seletor.

## RESUMO
1. Viável com o ChatGPT já integrado. `aiProvider.js` hoje não tem streaming nem override de modelo por chamada: entram dois acréscimos aditivos (`modelo`/`provedor` opcionais em `gerarTexto` e função nova `gerarTextoStream`). Não se mexe em `analisarImagem`/`modeloVisao`.
2. `ItemPcp` NÃO tem setor nem existe cadastro de máquinas (só MP/SUB/PA/EMB). O campo vira "Produto/item relacionado (opcional)" com busca em `itens_pcp`; o contexto leva só o escolhido + até 25 nomes que casem com o título.
3. Segurança existente: `POST /api/config/:key` é genérico (qualquer logado grava qualquer chave). As rotas `/api/config/ia*` vêm ANTES de `/:key` e chaves `ia_*` ganham guarda no genérico.
4. `compression()` global bufferiza SSE. A rota de streaming responde `Cache-Control: no-cache, no-transform` + `X-Accel-Buffering: no` + heartbeat. nginx do frontend já tem `proxy_buffering off`.
5. SSE consumido com `fetch` + `ReadableStream` (EventSource não faz POST nem manda Authorization), token `@HardtApp:token`. Sem axios.
6. `fotoSugerida` e `ia{}` moram DENTRO do JSON `passos`: sem migração de versões, mas `comoFazerSchema.normalizarPasso`/`normalizarDoc` descartam campo desconhecido → ajustar (aditivo), senão o autosave apaga.
7. Única tabela nova: `como_fazer_ia_usos`. Config em `app_configs` (`ia_como_fazer`, `ia_precos`).
8. Foto opcional no "montar" = Fase 1b.
9. `GET uso` vai para `/api/config/ia/uso` (permissão configuracoes).
10. Porte: GRANDE.

## 1. Entendimento
A gerente (`Pode_Editar_Como_Fazer`) conta o que quer ensinar (texto ou voz), a IA devolve rascunho completo no formato do documento (`secoes[].passos[]`, `objetivo`, `materiais`, `naoFazer`, `seDerErrado[]`, `avisoPerigo`, perguntas se Rotina) + "foto para tirar" por passo. Nada é publicado pela IA. Depois, botões ✨ por passo e por documento. Provedor/modelo por função em Configurações → Inteligência artificial; Fase 1 só OpenAI/gpt-6-luna funciona; Claude aparece desabilitado ("em breve, precisa da chave ANTHROPIC_API_KEY").

## 2. Mapa do código atual
- `backend/services/aiProvider.js`: `PROVIDER`/modelo do env no load; `gerarTextoOpenAI` usa `modeloAtual()` fixo e `response_format: json_object` quando `json:true`; `parametrosOpenAI` troca `max_tokens`→`max_completion_tokens` para não-gpt-4; devolve `{texto, usage{prompt,resposta,total}, modelo, provider}`. Sem stream, sem `finish_reason`, sem refusal. Consumidores (`copiloto.js`, `copilotoService.js`, `orientacaoService.js`, `checklistVeiculoIaService.js`, `adminExec.js`) chamam `gerarTexto` sem `modelo` → acréscimo opcional não os afeta.
- `backend/services/comoFazerSchema.js`: `normalizarPasso` (id, texto, detalhe, foto, video, perigo, itens, pergunta) e `normalizarDoc` (schema, avisoPerigo, objetivo, materiais, naoFazer, seDerErrado, secoes) RECONSTROEM o objeto. Limites: texto 140, detalhe 240, 40 passos/seção, MAX_LONGO 2000, 30 seDerErrado. `validarDoc`: sem seção, passo sem texto, >140, NUMERO sem min/max, ROTINA sem pergunta, MAQUINA sem passo em MONTAR/USAR/LIMPAR, demais sem passo em PRINCIPAL. Pergunta fora de ROTINA e itens fora de DOSAGEM são removidos.
- `backend/services/comoFazerService.js`: `criarConteudo` (~580), `salvarRascunho` (~625), `publicar` (~644, `$transaction` com timeout), `detalheAdmin` (~736), `abrirConteudo` (~224, devolve `passos` cru ao tablet).
- `backend/routes/comoFazerRoutes.js`: `router.use(auth.comoFazerAuth)`; `ESCOPO_EDITAR`; parser 100 KB (`jsonPequeno`), 2 MB em criar/rascunho; `h()` converte `ErroCF`; `req.cf = {origem, vendedorId, permissoes, funcionarioId, setor}` (sem nome → buscar `vendedor.nome`).
- `backend/index.js`: `compression()` global; `/api/como-fazer` sem parser global; `/api/config` com `authMiddleware`.
- `backend/routes/configRoutes.js`: `GET/POST /:key` genérico. Padrão de permissão: `backend/routes/cidades.js:41-45` (objeto).
- `ItemPcp`: `nome, tipo MP|SUB|PA|EMB, unidade, descricao, ativo, grupoCozinha`.
- `setoresService.listar()/codigosAtivos()`. `AppConfig {key, value Json}` via `prisma.appConfig.findUnique/upsert`.
- Frontend: `RH/comoFazer/EditorConteudo.jsx` (autosave serializado; `alterar(fn)`; adota `r.doc` do servidor), `PassoEditor.jsx` (`BotaoFoto`), `TabConteudos.jsx` (`ModalNovo` → `criar` → `onCriado(id)`), `components/ComoFazer/PassoCard.jsx`, `services/comoFazerService.js` (`api`, `apiSemLogout`, `mensagemErro`, `codigoErro`), `Configuracoes/Setores.jsx` + `setorService#podeGerirSetores` (padrão), menu `App.jsx` ~490-505 e rotas ~986-996, ditado já existe em `Pedidos/NovoPedido.jsx:1436-1470`.
- Manuais: `rh-como-fazer-painel.md`, `config-setores.md` (modelo), README, `ABAS` em `copilotoService.js`. `deployMarker` em `adminExec.js:67`. `novidades.json`.

## 3. Decisões (aceitas)
D1. Item PCP: "Produto/item relacionado (opcional)" com busca (`GET /api/como-fazer/ia/itens-pcp?busca=`, ESCOPO_EDITAR, máx. 20 `{id,nome,tipo,unidade}`).
D2. Resultado de uso: `GERADO` → `USADO`/`DESCARTADO` (cliente) ou `ERRO`/`RECUSADO`/`CANCELADO` (servidor). `GERADO` sem decisão = "Sem resposta".
D3. JSON após reparo: FATAL só se não parseia ou não há `secoes` com ≥1 passo. Erros "de publicação" viram `avisos` e o rascunho segue (editor já mostra "Falta isto para publicar"). Antes, o serviço SANEIA (corta 140/240 em limite de palavra, bloco inválido→PRINCIPAL, MAQUINA garante as 4 seções).
D4. "Usar este rascunho" é feito pelo CLIENTE (criar + PUT rascunho). Servidor não guarda o JSON gerado.
D5. `ia{}` some no `publicar`. `fotoSugerida` fica (dica some do botão quando `foto` existe).
D6. Limite diário: linhas de `como_fazer_ia_usos` do dia (fuso SP), todos os usuários; soft limit.
D7. Preço: `ia_precos` = `{ "<modelo>": { entradaUsdPorM, saidaUsdPorM }, cotacaoBrl }` sem valores inventados; sem preço → custo `null` e a tela mostra "preencha o preço do modelo".
D8. Foto no "montar" = Fase 1b.
P1 (resolvida): `GET /api/como-fazer/ia/status` (ESCOPO_EDITAR) → `{ ligado, temChave, usadasHoje, limite }`.

## 4. Schema (aditivo)
```prisma
model ComoFazerIaUso {
  id                 String   @id @default(uuid())
  createdAt          DateTime @default(now()) @map("created_at")
  vendedorId         String   @map("vendedor_id")
  vendedorNome       String?  @map("vendedor_nome")
  funcao             String   @default("COMO_FAZER")
  acao               String   // MONTAR | PEDIR_DIFERENTE | MELHORAR_PASSO | SIMPLIFICAR_PASSO | SUGERIR_NAOFAZER | SUGERIR_SEDERERRADO | SUGERIR_PERGUNTAS | SUGERIR_PASSOS
  conteudoId         String?  @map("conteudo_id")
  tipoConteudo       String?  @map("tipo_conteudo")
  tituloRef          String?  @map("titulo_ref")
  provedor           String
  modelo             String
  tokensEntrada      Int?     @map("tokens_entrada")
  tokensSaida        Int?     @map("tokens_saida")
  custoUsd           Decimal? @map("custo_usd") @db.Decimal(10, 6)
  duracaoMs          Int?     @map("duracao_ms")
  tamPromptChars     Int?     @map("tam_prompt_chars")
  tamRespostaChars   Int?     @map("tam_resposta_chars")
  reparou            Boolean  @default(false)
  resultado          String   @default("GERADO") // GERADO | USADO | DESCARTADO | ERRO | RECUSADO | CANCELADO
  erroCodigo         String?  @map("erro_codigo")
  @@index([createdAt])
  @@index([vendedorId, createdAt])
  @@map("como_fazer_ia_usos")
}
```
Nada de prompt gravado. No JSON do documento (aditivo): `passo.fotoSugerida` (≤140) e `doc.ia = { origem:'IA', usoId, modelo, em }`.

## 5. Plano numerado
### BACKEND
B1. `schema.prisma`: modelo acima; `prisma generate`; conferir `select`.
B2. `comoFazerSchema.js` (aditivo): `normalizarPasso` inclui `fotoSugerida` (≤140, omitir se vazio); `normalizarDoc` preserva `ia` só se `d.ia?.origem==='IA'` (`usoId`, `modelo`, `em` strings). Não mudar `validarDoc`. Teste puro: doc com/sem os campos.
B3. `comoFazerService.publicar`: antes da transação, `delete doc.ia`. `abrirConteudo` (tablet, não-prévia): remover `fotoSugerida`/`ia` da resposta.
B4. `aiProvider.js` (só acréscimos): `gerarTexto(opts)` aceita `opts.modelo`/`opts.provedor` e devolve `finishReason` e `recusa`; `provedor==='anthropic'` → `Error codigo='PROVEDOR_INDISPONIVEL'`. Nova `gerarTextoStream({system, mensagens, maxTokens, json, modelo, signal, onTexto})` (OpenAI `stream:true, stream_options:{include_usage:true}`); Gemini → `STREAM_NAO_SUPORTADO`. Nova `isConfiguredProvedor(p)`. NÃO tocar em `analisarImagem`/`modeloVisao`.
B5. `services/comoFazerIaService.js` (novo): `lerConfig()` (cache 30 s; padrão `{ligado:true, provedor:'openai', modelo:'gpt-6-luna', modeloAjustes:'gpt-6-luna', limiteDia:40}`; whitelist), `salvarConfig`, `checarAntes(cf)` (503 `IA_DESLIGADA`, 503 `IA_SEM_CHAVE`, 429 `LIMITE_DIA {usadas,limite}`, 409 `JA_MONTANDO`), `montarContexto` (setores ativos; item PCP escolhido + até 25 nomes; até 2 conteúdos PUBLICADOS do mesmo tipo compactos ≤1500 chars; NUNCA clientes/preços/financeiro/funcionários/telefones/fotos/responsáveis/horários), `montarPrompt` (§7), `montar({cf, body, onTexto, signal})` (uso `GERADO` → stream com timeout 90 s → `extrairJson` → `sanear` → `processarDoc` → 1 reparo se fatal → `atualizarUso`), finalização (`content_filter`/`recusa` → `RECUSADO` `IA_RECUSOU`; abort → `CANCELADO`; outra falha → `ERRO`), `melhorarPasso`, `sugerir`, `registrarResultado` (só dono ou admin; só `GERADO`→`USADO|DESCARTADO`; idempotente), `resumoUso(mes)`, `listarUsos(mes, 200)`, `status(cf)`. Log em try/catch próprio; sem `$transaction`.
B6. `comoFazerRoutes.js` (após `comoFazerAuth`, todas `ESCOPO_EDITAR`): `POST /ia/montar` (SSE), `POST /ia/passo`, `POST /ia/sugerir`, `POST /ia/usos/:id/resultado`, `GET /ia/itens-pcp`, `GET /ia/status`. `rascunhoAnterior` >80 KB → 413 `PEDIDO_GRANDE`. Validar `tipo` em `TIPOS`, `setor` em `codigosAtivos()`, `pedido` 10..4000, `titulo` 1..120, `cargos` ≤5.
B7. `configRoutes.js`: ANTES de `/:key`: `GET /ia` (view/edit), `PUT /ia` (edit), `GET /ia/uso?mes=`. Guarda no genérico: `key` começando `ia_` → 403 sem `configuracoes`. `GET /ia` devolve `chave:{openai,anthropic}`, `modelosDisponiveis`, `precos`.
B8. Manuais: `config-ia.md` novo; ajuste `rh-como-fazer-painel.md`; README; `ABAS` `{slug:'config-ia', nome:'Inteligência artificial', rota:'/config/ia', perm:'configuracoes'}` (conferir formato das vizinhas).
B9. `adminExec.js:67` `deployMarker` = `ia-pop-fase1-2026-10-21`.
### FRONTEND
F1. `services/comoFazerIaService.js`: `montarStream({corpo, onEvento, signal})` com `fetch` + `getReader()` + parser SSE (`event:`/`data:`, ignora `:` heartbeat); `melhorarPasso`, `sugerir`, `resultado`, `itensPcp`, `status`, `config.get/put`, `uso`. 401 do fetch NÃO desloga.
F2. `components/ComoFazer/ditado.js` + `useDitado` (padrão de `NovoPedido.jsx:1436-1470`); botão 🎤 só se `SpeechRecognition` existir.
F3. `pages/RH/comoFazer/ModalComecarComIA.jsx`: campos do mockup (Tipo, Setor, Título, textarea + 🎤, Produto/item relacionado com busca, Quem executa, Tamanho). SEM foto. `SelectBusca`. "Montar o POP" desabilitado até `pedido ≥10` e título. 44 px, 375, rodapé fixo.
F4. "Montando…": consome SSE; "Escrevendo… N passos"; últimos ~300 chars; Cancelar (`abort()`), cronômetro.
F5. `PreviaIA.jsx`: reusa `PassoCard` (prop `dicaFoto`), seções, avisoPerigo, objetivo, materiais, naoFazer, seDerErrado; "Usar este rascunho", "Pedir diferente" (observação), "Cancelar" (`DESCARTADO`); `avisos` sem bloquear.
F6. "Usar": (a) ModalNovo: `criar` → `salvarRascunho(id, {...doc, ia})` → `resultado(usoId,'USADO',id)` → abrir editor; se PUT falhar, retry SÓ do PUT. (b) conteúdo vazio: `alterar(() => docIA)` pela fila do autosave + `resultado`. Nunca sobrescreve conteúdo com passos.
F7. `PassoCard.jsx` prop `dicaFoto`; `PassoEditor.jsx`: dica abaixo do `BotaoFoto` quando `fotoSugerida && !foto`; ✨ Melhorar / ✨ Mais simples com Usar/Descartar → `/usos/:id/resultado`.
F8. `EditorConteudo.jsx`: selo âmbar quando `doc.ia` (some ao publicar, sem autosave); chips ✨ Sugerir (naoFazer, seDerErrado, perguntas só ROTINA, mais passos) com Usar/Descartar; cartão ✨ quando sem passos.
F9. `TabConteudos.jsx` `ModalNovo`: cartão roxo "✨ Começar com a IA" (título obrigatório antes), só `isAdmin || hasPermission('Pode_Editar_Como_Fazer') === true`; esconder ✨ se `status.ligado===false || !temChave`.
F10. `pages/Configuracoes/IA.jsx` + rota `/config/ia` (`tab="configuracoes"`, `lazyComRetry`) + menu "Inteligência artificial": KPIs, status da chave, bloco Como Fazer (ligado, provedor, modelo, modeloAjustes, limite/dia; Claude desabilitado), Clippy informativo, preços por modelo, histórico (cards mobile) com mês; ver com view/edit, editar só edit/admin.
F11. `novidade-ia-pop.html` + `novidades.json` + texto WhatsApp. Sem número de teste.
F12. `npm run build`.

## 6. Contrato das rotas
Erro: `{ erro, codigo, ...extra }`. Códigos: `400 DADOS_INVALIDOS`, `403 SEM_PERMISSAO`, `409 JA_MONTANDO`, `413 PEDIDO_GRANDE`, `429 LIMITE_DIA {usadas, limite}`, `502 IA_FALHOU`, `503 IA_DESLIGADA | IA_SEM_CHAVE | PROVEDOR_INDISPONIVEL`, `422 IA_RECUSOU`, `504 IA_DEMOROU`.
- POST `/api/como-fazer/ia/montar` body `{ tipo, setor, titulo, pedido, itemPcpId?, cargos?, tamanho:'curto'|'completo', rascunhoAnterior?, observacao? }` (com `rascunhoAnterior` → `PEDIR_DIFERENTE`, `observacao` 3..500). Resposta `200 text/event-stream` (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `flushHeaders`, heartbeat `: ping` 15 s). Eventos: `inicio {usoId, modelo, provedor, stream}` · `texto {delta}` · `progresso {segundos}` · `fim {usoId, doc, avisos, erros, resumo:{secoes,passos,segundos}, reparou}` · `erro {erro, codigo}`. `close` do cliente → abort + `CANCELADO`.
- POST `/ia/passo` `{ acao:'melhorar'|'simplificar', texto, detalhe?, tipo, titulo, objetivo? }` → `{ texto, detalhe, usoId }`.
- POST `/ia/sugerir` `{ tipo:'naoFazer'|'seDerErrado'|'perguntas'|'maisPassos', contexto:{ tipoConteudo, titulo, setor, objetivo, passos:[{secao,texto}] ≤60, naoFazer?, seDerErrado? } }` → `{ usoId, itens }` (`naoFazer`: string[] ≤8; `seDerErrado`: [{se,entao}] ≤8; `perguntas`: [{passoIndice, pergunta}] só ROTINA; `maisPassos`: [{secaoBloco, depoisDoIndice, texto, detalhe, fotoSugerida, perigo}]).
- POST `/ia/usos/:id/resultado` `{ resultado:'USADO'|'DESCARTADO', conteudoId? }` → `{ ok:true }`; 404 se não for do usuário; idempotente.
- GET `/ia/itens-pcp?busca=` → `{ itens:[{id,nome,tipo,unidade}] }`. GET `/ia/status` → `{ ligado, temChave, usadasHoje, limite }`.
- GET `/api/config/ia` → `{ config, chave:{openai,anthropic}, modelos:[{provedor,modelo,rotulo,disponivel}], precos }`; PUT mesmo formato (whitelist; Claude `disponivel:false` → 400). GET `/api/config/ia/uso?mes=YYYY-MM` → `{ resumo:{ montados, usos, custoUsd, custoBrl|null, tempoMedioMs, erros }, usos:[...] }`.

## 7. Prompt de sistema (texto completo)
```
Você é um assistente que ajuda a gerente de produção de uma fábrica de salgados congelados (Hardt Salgados) a escrever manuais de trabalho (POPs) para o tablet da equipe. Quem lê tem pouca escolaridade e não gosta de ler: frases curtas, palavras simples, nada de termo técnico sem explicar.

Responda SOMENTE com um objeto JSON válido, sem texto antes nem depois, sem markdown. O JSON precisa ter exatamente o formato descrito abaixo.

REGRAS DE ESCRITA
1. Cada passo tem UMA ação. "texto" tem no máximo 140 caracteres e começa com verbo no imperativo (Ligue, Confira, Espere...).
2. "detalhe" (opcional, máx. 240 caracteres) explica o porquê ou o jeito certo. Só use se ajudar.
3. Use números concretos quando fizer sentido (temperatura, tempo, quantidade), mas NUNCA invente valores técnicos que você não conhece. Se não souber, escreva "confira no painel/etiqueta" ou use o que a gerente disse. Não afirme que algo atende exigência da Vigilância Sanitária ou lei.
4. Marque "perigo": true nos passos com risco real (calor, óleo quente, lâmina, peso, produto químico, eletricidade) e escreva em "avisoPerigo" uma frase curta de aviso quando houver QUALQUER passo perigoso.
5. Em "fotoSugerida" diga em até 140 caracteres QUAL foto a gerente deve tirar para esse passo (o que aparece, de onde). Não invente que a foto existe.
6. "naoFazer": 3 a 6 itens curtos separados por " · ". "seDerErrado": 2 a 6 itens {"se","entao"}, frases curtas.
7. Use só o que a gerente contou e os nomes do contexto. Não invente máquinas, produtos, setores, pessoas ou horários que não foram citados.
8. Tamanho: "curto" = até 6 passos no total; "completo" = 8 a 15 passos.

FORMATO POR TIPO
- MAQUINA: secoes com bloco "MONTAR" (titulo "Montar"), "USAR" (titulo "Usar"), "LIMPAR" (titulo "Limpar") e "PROBLEMA" (titulo "Chamar o encarregado"), nessa ordem; cada uma com pelo menos 1 passo.
- ROTINA: uma única seção bloco "PRINCIPAL" (titulo "Passo a passo"). Pelo menos 1 passo precisa ter "pergunta". Tipos: {"tipo":"NUMERO","rotulo":"...","min":n,"max":n,"unidade":"°C","obrigatoria":true,"avisoDesvio":"..."}, {"tipo":"SIMNAO","rotulo":"...","respostaEsperada":"SIM"|"NAO","obrigatoria":true,"avisoDesvio":"..."}, {"tipo":"FOTO","rotulo":"...","obrigatoria":true}. NUMERO SEMPRE tem min e max (sem faixa dada pela gerente, use SIMNAO).
- REGRA e DOSAGEM: uma única seção "PRINCIPAL". Em DOSAGEM, cada passo pode ter "itens": [{"nome","quantidade","unidade"}] (quantidade como texto). Em MAQUINA e REGRA NÃO use "pergunta" nem "itens".

FORMATO DO JSON
{
  "objetivo": "para que serve, 1 a 2 frases",
  "materiais": "o que precisa (EPI, ferramentas), separado por ' · '",
  "avisoPerigo": "só se houver perigo; senão omita",
  "naoFazer": "item · item · item",
  "seDerErrado": [ {"se":"...","entao":"..."} ],
  "secoes": [
    { "bloco": "PRINCIPAL|MONTAR|USAR|LIMPAR|PROBLEMA", "titulo": "...",
      "passos": [ { "texto":"...", "detalhe":"...", "fotoSugerida":"...", "perigo": false, "pergunta": null } ] }
  ]
}
Não inclua campos "id". Não inclua "foto" nem "video".

Se o pedido pedir algo que não seja um manual de trabalho legítimo (ofensivo, perigoso, fora do contexto de fábrica), responda {"recusa":"motivo curto"}.
```
Mensagem do usuário (montada pelo serviço): `TIPO` · `SETOR` · `TÍTULO` · `QUEM EXECUTA` · `TAMANHO` · `O QUE A GERENTE QUER ENSINAR` · `ITEM RELACIONADO` · `NOMES CADASTRADOS QUE PODEM APARECER` · `SETORES DA EMPRESA` · `EXEMPLOS DE COMO A EMPRESA ESCREVE (copie o TOM, não o conteúdo)`. Pedir diferente: `RASCUNHO ANTERIOR (JSON)` + `O QUE MUDAR` + "Devolva o JSON completo ajustado". Reparo: `O JSON abaixo falhou por: <erros>. Devolva o JSON corrigido, apenas o JSON.` `json_object` exige a palavra "JSON" nas mensagens. Recusa/`content_filter` → `RECUSADO`: "A IA não aceitou este pedido. Reescreva com outras palavras ou comece em branco."

## 8. Exemplo de JSON esperado (MÁQUINA, curto)
```json
{"objetivo":"Fritar os salgados na temperatura certa, sem queimar o produto e sem ninguém se queimar.","materiais":"Luva térmica · pegador longo · termômetro · pano seco","avisoPerigo":"Óleo quente. Nunca coloque água. Use a luva térmica.","naoFazer":"Encher o cesto até a boca · tirar o cesto sem luva · deixar ligada sem ninguém","seDerErrado":[{"se":"Saiu fumaça do óleo","entao":"Desligue, espere esfriar e chame o encarregado."}],"secoes":[{"bloco":"MONTAR","titulo":"Montar","passos":[{"texto":"Confira se o óleo está até a marca.","detalhe":"Sem óleo a resistência queima.","fotoSugerida":"A marca de nível dentro da cuba","perigo":false,"pergunta":null}]},{"bloco":"USAR","titulo":"Usar","passos":[{"texto":"Encha o cesto só até a metade.","detalhe":null,"fotoSugerida":"Cesto pela metade","perigo":true,"pergunta":null}]},{"bloco":"LIMPAR","titulo":"Limpar","passos":[{"texto":"Desligue e espere o óleo esfriar antes de limpar.","detalhe":null,"fotoSugerida":"Painel com a luz apagada","perigo":true,"pergunta":null}]},{"bloco":"PROBLEMA","titulo":"Chamar o encarregado","passos":[{"texto":"Se o óleo não esquentar, chame o encarregado.","detalhe":null,"fotoSugerida":"Painel da máquina","perigo":false,"pergunta":null}]}]}
```

## 9. Costura back × front
- Erro HTTP antes do stream: caixa vermelha no modal, campos preservados. `LIMITE_DIA`: "O limite de hoje (N) acabou…". `IA_DESLIGADA`/`IA_SEM_CHAVE`: "A IA está desligada. Você pode começar em branco." + botão.
- `erro` no stream: parar, mensagem, "Tentar de novo" e "Começar em branco". Nada criado.
- `IA_RECUSOU`: mensagem simples, volta ao formulário. Stream caiu sem `fim`: "A conexão caiu"; sem retry automático.
- JSON inválido: servidor repara 1x; fatal → `IA_FALHOU`; só avisos → `fim` com `avisos`.
- Cancelar/fechar aba: abort → `CANCELADO`. Duplo clique: botão desabilitado + 409.
- Pós-"Usar": `criar` ok e PUT falhou → não criar de novo. `resultado` falhou → ignorar.
- Permissão: ✨ só `isAdmin || hasPermission('Pode_Editar_Como_Fazer') === true`; tela IA: ver com `configuracoes` view/edit, editar só `edit===true`/`true`/admin.

## 10. Riscos
R1 gpt-6-luna e JSON: usar `max_completion_tokens` 9000 (completo) / 6000 (curto) / 3000 (ajustes); `finish_reason==='length'` → `ERRO IA_CORTOU`. R2 silêncio inicial do reasoning: cronômetro + heartbeat. R3 SSE e proxies: `no-transform`; testar no deploy; se bufferizar, o cliente tolera (tudo chega no `fim`). R4 iOS PWA e microfone: botão só se API existir; erros viram toast. R5 contexto limitado (2×1500 chars, 25 nomes, pedido ≤4000, rascunho ≤80 KB). R6 limite soft global; 1 montagem por usuário por vez. R7 autosave apagando campos novos: B2. R8 `POST /api/config/:key` genérico aberto: B7 cobre `ia_*` (as demais chaves continuam abertas — avisar o dono). R9 prompt injection: saída só vira rascunho validado. R10 dado pessoal: revisor confere `montarContexto`. R11 tablet vê `fotoSugerida` cru: B3. R12 tentativa recusada/erro registrada com tokens.

## 11. O que NÃO fazer
Nunca publicar pela IA; nunca sobrescrever conteúdo com passos; nunca IA em rota de tablet. Não gravar prompt/pedido/resposta (só tamanhos e tokens). Não usar `EventSource`/axios no stream, `window.open`/iframe. Não tocar em `analisarImagem`/`modeloVisao`, `AI_MODEL`, `AI_PROVIDER` do Clippy. Não renomear campos do schema nem `/api/ia-consulta/v1`. Não `!!perms.configuracoes`; não `<select>` nativo; não `React.lazy`. Não criar conteúdo antes do clique em "Usar". Não usar `max_tokens`/`temperature` com gpt-6-luna. Log nunca derruba a resposta. Sem número de teste em manual/novidade.

## 12. Critérios de aceite (QA)
1. Máquina "Fritadeira" com pedido real → texto chegando; prévia com 4 seções, foto para tirar por passo, aviso de perigo, naoFazer, seDerErrado; frases ≤140.
2. Rotina "Temperatura dos freezers" → ≥1 pergunta; NUMERO com min/max; usar → editor mostra erros restantes sem quebrar.
3. Pedir diferente → nova versão coerente; 1 uso; histórico `PEDIR_DIFERENTE`.
4. Usar (Novo conteúdo) → editor com selo; recarregar → selo e `fotoSugerida` continuam; botão de foto mostra a dica; subir foto → dica some; publicar → selo some; tablet sem referência à IA.
5. Conteúdo vazio: cartão ✨ aparece; com passos: não.
6. ✨ Melhorar / Mais simples → Usar/Descartar; 140 respeitado; histórico USADO/DESCARTADO.
7. Sugerir perguntas (Rotina) → lista com Usar; em Máquina o chip não aparece; naoFazer/seDerErrado/mais passos funcionam; nada entra sozinho.
8. Limite diário 1 → 2ª chamada bloqueada; nada criado.
9. IA desligada / sem chave → ✨ somem ou mensagem; "Começar em branco" funciona.
10. JSON inválido simulado → reparo (`reparou`); ainda quebrado → mensagem e NADA criado; `{"recusa":…}` → RECUSADO.
11. Cancelar → formulário preservado; `CANCELADO`; rede caiu → "A conexão caiu", sem rascunho parcial.
12. Duplo clique / duas abas → uma chamada (409 tratado).
13. Sem `Pode_Editar_Como_Fazer` → sem ✨ e 403; tablet 403 em `/ia/*`; sem `configuracoes` → sem menu e 403 em `/config/ia` e `POST /api/config/ia_como_fazer`; view só → vê e não salva.
14. Configurações → IA: KPIs batem com o banco; chave; Claude desabilitado; salvar vale sem redeploy; preço sem cadastro → aviso, não "R$ 0,00".
15. 375 px em modal, montando, prévia, editor, tela IA: sem scroll horizontal, ≥44 px, cards.
16. Ditado: Chrome funciona; sem `SpeechRecognition` → botão some; permissão negada → toast.
17. Regressão: conteúdo antigo sem IA; tablet; Clippy; checklist de veículo (visão); build.
18. Produção após deploy: `deployMarker`; montagem real com texto chegando aos poucos (se vier só no fim, registrar, não bloqueia).
19. Revisor: `montarContexto` sem dado pessoal; nenhum prompt gravado; guardas `ia_`; permissões objeto; `jsonPequeno`; `sanear` não derruba doc válido; `normalizarDoc` aditivo.

## 13. Porte
GRANDE. Ordem: B1–B4 + B2 primeiro (contrato), B5–B7 em paralelo com F1–F3 (mock de SSE), integração F4–F10 e QA; manuais/novidade/deployMarker por último. Fase 1b: foto da máquina no "montar".
