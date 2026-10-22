# Plano — PDF do Como Fazer, etapa 1 (cartaz + fichário + visualizador + escolha de páginas)

Arquiteto · 22/10/2026 · porte: **GRANDE** (módulo novo no backend + componente novo no frontend + dependência nova nos dois lados). Não toca em fiscal/financeiro/WhatsApp/IA-consulta; toca em **permissões** e **upload/volume** (leitura de fotos).

Desenho aprovado: `docs/pop/mockup-impressao-pop.html` (abas 0, 1, 2 e 5). Abas 3 (várias fotos) e 4 (registro) = etapas 2 e 3: só ganchos.

---

> ## REVISÃO 22/10 (requisito novo do dono) — ARRANJO DE PÁGINAS MANDA; "N páginas" virou atalho
> O dono escolhe **quantas páginas** e **quais passos entram em cada uma** (aba 6 do mockup, "Montar as páginas"). Onde este documento falar em "paginação automática / DP como caminho principal", vale o que está no **§4 (contrato)**, **§5.0 (algoritmo)**, **§6 passos 11-13b** e **§13 (aceite)** já reescritos abaixo. O DP do §5.1 passou a ser só a **sugestão inicial** do arranjo. Nada mais muda: pdfkit, sharp, pdfjs, imprimir/salvar, permissões.
> Pesos e limites do mockup (aba 6): passo = 1; passo com 3-4 fotos = 2 (etapa 2; na etapa 1 todo passo vale 1). **Cartaz: 6 por página com foto grande (até 8 em modo compacto). Fichário: 12.**

## 1. Entendimento do pedido

Em cada conteúdo do Como Fazer, botão **"PDF"**. A pessoa escolhe formato (cartaz de parede / folha de fichário; registro fica "em breve"), **quantas páginas** quer, vê o PDF dentro do app (modal, sem outra aba) com zoom e setas, e tem **Imprimir** e **Salvar PDF**. O PDF nasce no servidor, A4 real, igual em computador/iPad/celular. Só versão **publicada** imprime.

Interpretação adotada onde havia dúvida:
- "Quantas páginas" é uma **escolha da pessoa**, não um teto automático: o servidor distribui o conteúdo exatamente em N páginas, ou recusa com o mínimo necessário. Nunca gera folha ilegível.
- O botão fica onde já ficam Imprimir A4 / QR code: mesma condição de visibilidade (`pode.painel || pode.editar`, `ConteudoPagina.jsx:182-190`), e **só com versão publicada**.

## 2. Mapa do código atual (lido de verdade)

Backend
- `backend/routes/comoFazerRoutes.js:14-41` — `jsonPequeno` (100 KB) vale para a rota nova; helper `h()` converte `ErroCF` em `{erro,codigo,...extra}` (o `extra` serve para devolver `paginasMinimas`). `ESCOPO_PAINEL`/`ESCOPO_EDITAR` em `:36-37`. Rota de leitura `GET /conteudos/:id` em `:108`.
- `backend/services/comoFazerAuthService.js:175-183` — `temPermissao` e `exigirPermissao(...nomes)`: **tablet (`origem !== 'APP'`) recebe 403 sempre**; admin passa; aceita lista de permissões (OU). Serve exatamente para "editar OU painel".
- `backend/services/comoFazerService.js:246-288` — `abrirConteudo` monta o que a tela usa (id, codigo, titulo, setores, cargos, encarregados, versao{numero,publicadaEm,publicadaPor,doc}). `docParaLeitura` (`:233`) **remove `fotoSugerida` e `ia`**: o gerador de PDF deve ler `versao.passos` direto do banco (o publicar já tira `ia`; `fotoSugerida` fica gravada).
- `backend/services/comoFazerSchema.js:20-117` — formato do doc: `secoes[]{id,bloco(PRINCIPAL|MONTAR|USAR|LIMPAR|PROBLEMA),titulo,passos[]}`, passo `{texto(≤140),detalhe(≤240),foto,video,perigo,itens[{nome,quantidade,unidade,foto}],pergunta,fotoSugerida}`, doc `{avisoPerigo,objetivo,materiais,naoFazer,seDerErrado[{se,entao}]}`. `midiaValida` (`:20`) = só `como-fazer/...` sem `..`.
- `backend/middlewares/uploadComoFazerMiddleware.js:11-18,46-55` — fotos em `backend/uploads/como-fazer/conteudos/<id>/<uuid>.(jpg|png|webp)` (`RAIZ` exportada). Aceita **webp**, e o frontend (`components/ComoFazer/imagem.js`) só reencoda para JPEG quando a foto passa de 1600 px/1,5 MB — logo pode haver PNG/WebP/JPEG grande no volume.
- `backend/services/comoFazerPainelService.js:194-212` (`relatorio`) — fonte da lista de treinados (`comoFazerTreinamento`: funcionário, `aprendeuEm`, `confirmadoPorFuncionarioId`, `versaoNumero`). Treino válido da versão = `versaoTreinoNumero` do conteúdo (`comoFazerService.js:60-69`, `treinoAtual`).
- `backend/prisma/schema.prisma:4850-4907` — `ComoFazerConteudo` (`codigo`, `setores`, `cargos`, `responsaveisIds`, `versaoPublicadaId`, `versaoTreinoNumero`, `reciclagemMeses` nulo/Fase 3) e `ComoFazerVersao` (`numero`, `status RASCUNHO|PUBLICADA|SUBSTITUIDA`, `passos Json`, `publicadaEm`, `publicadaPorId`). **Não existe campo "o que mudou" nem "revisar até".**
- Precedente de PDF no servidor: `backend/services/receitaPdfService.js` (pdfkit 0.18, Helvetica embutida, `MM = 72/25.4`, mede o texto e pagina de verdade — escrito justamente porque o HTML→print falhou no iPad) e `backend/routes/pcpImpressaoRoutes.js:107-149` (devolve `application/pdf`). Outros: `reciboEspecialPdf.js`, `impressaoLoteService.js`, `code128.js`. Nenhum Chromium em lugar nenhum.
- `backend/package.json`: `pdfkit 0.18.0`, `qrcode 1.5.4` (já está), `pdf-lib`, `pdfjs-dist 3.11.174`. **Não há `sharp`.** `backend/Dockerfile`: `node:20-alpine`, sem fonte nem Chromium.
- `backend/index.js:124,252` — `/api/como-fazer` sem authMiddleware global (auth interna) e **sem `exposedHeaders` de CORS** (em produção o nginx do frontend faz proxy `/api` na mesma origem, então não importa; mas não dependa de header customizado).

Frontend
- `frontend/src/pages/ComoFazer/ConteudoPagina.jsx:170-192` — `botoesGestao` (Imprimir A4, QR code, Nova versão); `ModalQr` (`:40-60`) mostra o padrão de modal do módulo; QR aponta `${window.location.origin}/como-fazer/c/${id}` (`:295`).
- `frontend/src/pages/ComoFazer/htmlDocumento.js` — impressão A4 atual via `utils/imprimirNaPagina` (`imprimirNaPagina(estilos, corpoHtml)`).
- `frontend/src/services/comoFazerService.js` — cliente único do módulo (app usa `api`; tablet usa axios próprio). Hoje **não** há chamada que devolva blob.
- `frontend/package.json` — tem `qrcode`, **não tem `pdfjs-dist`** (só o backend). `utils/lazyComRetry.js` existe.

## 3. Decisões (uma recomendação cada)

### 3.1 Gerador: **pdfkit** (recomendado). Não usar Chromium.
| | pdfkit (layout manual) | HTML→PDF Chromium |
|---|---|---|
| Container | zero mudança no Dockerfile | +300-400 MB de imagem; precisa `apk add chromium` + fontes; 300-500 MB de RAM por geração no EasyPanel compartilhado; risco de OOM derrubar a API de pedidos |
| Fidelidade ao mockup | alta para este desenho (cartões, tabelas, faixas, QR vetorial). Perde só a fonte Manrope e o `grid` CSS | 100%, mas o mockup nem é o objetivo final: é A4 de papel |
| Paginação "N páginas" | **controle total** (medimos antes de desenhar, que é exatamente o requisito novo) | brigar com `page-break` e `scale`: é o que falhou 6× na receita |
| Já provado no projeto | sim (receita, recibo, lote) | não |
| Tempo | ~100-400 ms | 1-3 s + subir navegador |

Detalhes que o dev-backend precisa tratar:
- **Fonte:** Helvetica/Helvetica-Bold embutidas do pdfkit (WinAnsi: acentos OK, `–—•“”…` OK). **Não suportam** emoji, `−` (U+2212), `▦`, `⚠`, `→`. Criar `limparTextoPdf(s)` que troca `−`→`-`, `→`→`>`, `×`→`x`, remove emoji/símbolos fora do WinAnsi e colapsa espaços. Ícones (perigo, tesoura…) desenhar como vetor (triângulo `path`), nunca como caractere. Não embutir Manrope nesta etapa (fonte variável + fontkit = risco; ganho só estético). Se o dono pedir depois, entram TTFs estáticos em `backend/assets/fonts/` (ver `backend/assets/logo-danfe.png` como precedente de pasta).
- **Imagens:** pdfkit só lê JPEG e PNG. Adicionar **`sharp`** em `backend/package.json` (binário pré-compilado `linuxmusl` existe para node20-alpine; confirmar com `npm install` local e com o build do Dockerfile) e passar TODA foto por `sharp(buf).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:80})`. Isso resolve de uma vez webp, PNG com alfa, orientação EXIF do celular e foto de 15 MB (memória e tamanho do PDF ≈ 1-3 MB). Sem `sharp`: foto webp viraria quadro vazio — não aceitável. Se o `npm install` com sharp falhar no Dockerfile, plano B = pular webp com aviso + `reduzirImagem` no front já cobre a maioria (não recomendado como definitivo).
- **Foto ausente:** `fs.existsSync` + `path.resolve` dentro de `RAIZ` (anti-traversal além de `midiaValida`). Se faltar o arquivo (sumiu do volume) ou o passo não tiver foto: desenhar o quadro tracejado com a **dica** (`fotoSugerida`, senão "foto" / "foto não encontrada"). Nunca derrubar o PDF por causa de foto.
- **QR:** `qrcode` (já no backend) `QRCode.create(url,{errorCorrectionLevel:'M'})` e desenhar os módulos como retângulos vetoriais (nítido na impressora, sem PNG). URL = `<base>/como-fazer/c/<id>`. `<base>`: usar `req.headers.origin` se for `https://…` ou `http://localhost`, senão `process.env.APP_PUBLIC_URL`, senão `https://cahardt-github.xrqvlq.easypanel.host`. Não aceitar URL vinda do corpo da requisição.
- **Memória/tempo:** processar fotos em série (`for…await`), no máximo **2 PDFs ao mesmo tempo** (fila simples em memória; o 3º espera, e passando de 15 s devolve `PDF_OCUPADO`). Limite por usuário: 20 PDFs/min (Map em memória, como o freio de PIN do módulo).

### 3.2 Visualizador: **pdfjs-dist no frontend, em `<canvas>`**, não `<embed>/<iframe>`.
- `<embed>/<iframe>` de PDF: no iPad/iOS mostra só a 1ª página sem rolagem e some no PWA standalone; é o mesmo defeito que o CLAUDE.md proíbe. Canvas se comporta igual em qualquer aparelho.
- Instalar no frontend **`pdfjs-dist@3.11.174`** (mesma versão já vetada no backend; build 3.x roda em Safari/iOS antigo — a 4.x/5.x usa sintaxe que quebra em iPad velho). Importar `pdfjs-dist/legacy/build/pdf` e o worker com `import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url'` (Vite devolve um asset com hash em `/assets/` → cai na regra "cache primeiro" do `sw.js`, e funciona offline depois da 1ª vez). Dev-frontend confirma os caminhos exatos na 3.11.174 e testa o build.
- Todo o código do pdfjs fica **dentro** de `VisualizadorPdf.jsx`, importado com `lazyComRetry(() => import('…/VisualizadorPdf'))` a partir do modal de opções → não pesa o bundle principal; deploy novo com chunk velho cai na recuperação existente.

### 3.3 Impressão do PDF: **renderizar as páginas em imagem e usar `imprimirNaPagina`** (sem `window.open`, sem iframe, sem `<embed>` oculto).
- Ao abrir o visualizador, em segundo plano, renderizar cada página a ~150 dpi (1240×1754 px) → `canvas.toBlob` → `URL.createObjectURL` (sem estourar o limite de ~16 Mpx de canvas do iOS; liberar o canvas depois de cada página).
- **Imprimir** (botão habilitado só quando as imagens estiverem prontas; mostrar "Preparando…" antes) chama **síncrono no clique** `imprimirNaPagina('@page{size:A4 portrait;margin:0} .pg{width:210mm;height:297mm;display:block;page-break-after:always}', '<img class="pg" src="blob:…">…')`. Isso mantém o `print()` síncrono no clique (regra do iOS) e reaproveita a restauração já blindada da util. Antes de implementar, dev-frontend lê o restante de `utils/imprimirNaPagina.js` (o util aceita `@page` do próprio estilo? conferir) — se ele não suportar margem 0, adicionar parâmetro opcional em vez de copiar o código.
- **Limite do iPad (texto simples dentro do modal, abaixo dos botões, só quando `navigator.userAgent` for iOS/iPadOS):** "No iPad a impressão depende do Safari. Se a janela de impressão não abrir, toque em **Salvar PDF**, escolha **Imprimir** na folha de compartilhar." É honesto e dá caminho de volta.

### 3.4 Salvar PDF
1. Se `navigator.canShare?.({files:[file]})` (iPad/iPhone/Android): `navigator.share({files:[new File([blob], nome, {type:'application/pdf'}), ], title})` — no clique; ignorar `AbortError` (usuário cancelou).
2. Senão: `<a href=blobUrl download=nome>` programático (desktop). 
3. Nome do arquivo vem do servidor (`Content-Disposition`), ex.: `HIG-001-v3-cartaz.pdf`.
4. Revogar as `blob:` URLs ao fechar o modal.

## 4. Contrato da API (dev-backend)

Todas em `backend/routes/comoFazerRoutes.js`, com um novo
`const ESCOPO_IMPRIMIR = exigirPermissao('Pode_Editar_Como_Fazer', 'Pode_Ver_Painel_Como_Fazer');`
(= o mesmo critério do botão "Imprimir A4"; **tablet e usuário sem essas permissões levam 403**; funcionário comum não gera PDF, alinhado ao front `pode.painel || pode.editar`, `ConteudoPagina.jsx:182`).

### 4.0 O ARRANJO (objeto comum a todas as rotas)
```json
{ "formato": "CARTAZ",
  "paginas": [ { "titulo": "Vestir",        "passoIds": ["p_a1","p_a2","p_a3","p_a4"] },
               { "titulo": "Lavar as mãos", "passoIds": ["p_b1","p_b2","p_b3"] } ],
  "foraDasPaginas": ["p_z9"],          // só devolvido pela API; na entrada é ignorado (o servidor recalcula)
  "confirmarOmitidos": false,           // true = o dono viu o aviso e aceita imprimir sem os passos "fora"
  "compacto": false }                   // cartaz: true libera até 8 por página (letra/foto menores)
```
`passoIds` são os `id` estáveis do documento (`normalizarPasso` mantém o id; o rascunho nasce clonando a versão publicada, então o id sobrevive às versões). Ordem em `passoIds` = ordem no papel. Título: texto simples ≤ 40 caracteres, vai no cabeçalho do PDF ("Página 2 de 4 · Lavar as mãos"); vazio → "Página N". A numeração dos passos no papel continua **a do manual** (passo 5 é "5" em qualquer página), não recomeça por página: o encarregado cita "passo 5" e o número bate com o tablet.

### 4.1 `POST /api/como-fazer/conteudos/:id/pdf/previa` → JSON (medição, não lê imagem)
Corpo: `{ formato, arranjo?: {paginas, compacto}, modo?: 'passosPorPagina'|'umProcessoPorPagina'|'automatico', passosPorPagina?: 3|4|5|6, blocoNovaPagina?: bool }`
- **Sem `arranjo`** (ou com `modo`): o servidor **calcula e devolve a sugestão** de arranjo para o modo pedido (é o que os atalhos do front chamam):
  - `passosPorPagina: k` → fatias contíguas de k passos, **respeitando o limite** (k > limite → 422 "no cartaz cabem 6"); a última página recebe o resto, balanceada com a anterior (nunca 1 passo sozinho: 13 passos com k=6 → 5+4+4... usa DP de equilíbrio com o nº de páginas = ceil(T/k)).
  - `umProcessoPorPagina` → uma página por **grupo** (ver §4.5): seções do documento (Montar/Usar/Limpar/Problema) ou, se houver só uma seção, os grupos do passo; seção/grupo que passa do limite é dividida em partes ("Limpar (1/2)", "Limpar (2/2)").
  - `automatico` → o DP do §5.1: menor nº de páginas que cabe, equilibrado.
- **Com `arranjo`**: valida e mede esse arranjo.
Resposta 200:
```json
{ "formato":"CARTAZ","versao":3,"codigo":"HIG-001","totalPassos":16,
  "limite": { "porPagina": 6, "compactoAte": 8, "pesoFoto34": 2 },
  "arranjo": { "paginas":[{"titulo":"Vestir","passoIds":[…]}], "foraDasPaginas":[], "compacto":false },
  "paginasResumo":[ { "indice":1,"titulo":"Vestir","passos":4,"peso":4,"limite":6,"situacao":"OK|CHEIA|ESTOURADA|VAZIA",
                      "mensagem":"4 passos · cabe bem" },
                    { "indice":3,"situacao":"ESTOURADA","excesso":3,
                      "mensagem":"9 passos · não cabe (máximo 6). Mova 3 passos para outra página." } ],
  "podeGerar": false,
  "bloqueios":[ { "tipo":"PAGINA_ESTOURADA","pagina":3,"excesso":3,"mensagem":"…" },
                { "tipo":"PAGINA_VAZIA","pagina":4,"mensagem":"A página 4 está vazia: tire-a ou coloque passos." } ],
  "avisos":[ { "tipo":"PASSOS_FORA","passoIds":["p_z9"],"mensagem":"1 passo ficou fora das páginas: o passo 9 'Passe álcool em gel'." },
             { "tipo":"SEM_FOTO","mensagem":"3 passos sem foto…" }, { "tipo":"FOTO_PERDIDA","mensagem":"…" } ],
  "layoutGuardado": { "existe": true, "atualizadoEm":"…", "passosNovos":["p_n1"], "passosRemovidos":["p_x"] },
  "nomeArquivo":"HIG-001-v3-cartaz.pdf" }
```
`podeGerar=false` quando há `bloqueios` (página estourada, página vazia, passoId inexistente/duplicado, nº de páginas fora de 1–8 no cartaz e 1–6 no fichário) **ou** há passos fora e `confirmarOmitidos` não veio `true`. Passo fora das páginas **não** é bloqueio duro, é **aviso que exige confirmação explícita** (o dono pode querer deixar de fora de propósito).
Erros: `NAO_ENCONTRADO` 404; `SEM_VERSAO_PUBLICADA` 409; `FORMATO_INVALIDO` 400; `FORMATO_INDISPONIVEL` 501 (`REGISTRO`).

### 4.2 `POST /api/como-fazer/conteudos/:id/pdf` → binário
Corpo: `{ formato, arranjo:{paginas:[{titulo,passoIds}], compacto?}, confirmarOmitidos? }`. (`paginas:'auto'|N` do plano anterior **foi retirado**; quem quiser "automático" chama a prévia com `modo` e envia o arranjo devolvido.) O servidor **revalida tudo** (mesma função da prévia) e responde:
- 200 `application/pdf`, `Content-Disposition: attachment; filename="HIG-001-v3-cartaz.pdf"`.
- **422** `ARRANJO_INVALIDO` com `extra:{bloqueios:[…mesmo formato da prévia…]}` — ex.: `{tipo:'PAGINA_ESTOURADA', pagina:3, excesso:3}`; **422** `PASSOS_FORA_SEM_CONFIRMACAO` com `extra:{passoIds}`; 400 `ARRANJO_MALFORMADO` (JSON inválido, títulos longos, >40 passoIds por página).
- Demais: `PDF_OCUPADO` 503, `ERRO_INTERNO`.
**Frontend:** erro em blob → `JSON.parse(await err.response.data.text())` antes de mostrar (costura clássica).

### 4.3 Arranjo guardado — **tabela própria aditiva** (recomendado), não dentro do JSON da versão
Por quê: (a) o JSON da versão é imutável depois de publicado e o arranjo precisa **sobreviver à troca de versão**; (b) `normalizarDoc` descarta campo desconhecido do documento e a publicação o reescreve; (c) arranjo é preferência de impressão, não conteúdo ensinado, não deve gerar versão/zerar treinamento. Modelo novo (só ADICIONA tabela; `db push` sem risco):
```prisma
model ComoFazerLayoutImpressao {
  id            String   @id @default(uuid())
  conteudoId    String   @map("conteudo_id")
  formato       String   // CARTAZ | FICHARIO (| REGISTRO no futuro)
  layout        Json     @default("{}") // { paginas:[{titulo, passoIds[]}], compacto }
  atualizadoPorId String? @map("atualizado_por_id")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  conteudo ComoFazerConteudo @relation(fields: [conteudoId], references: [id], onDelete: Cascade)
  @@unique([conteudoId, formato])
  @@map("como_fazer_layouts_impressao")
}
```
(+ `layoutsImpressao ComoFazerLayoutImpressao[]` no `ComoFazerConteudo`; nenhum campo existente muda.)
- `GET  /api/como-fazer/conteudos/:id/pdf/arranjo?formato=CARTAZ` → `{ existe, arranjo, atualizadoEm, atualizadoPor }` (a prévia já embute a reconciliação, mas o GET permite carregar sem medir).
- `PUT  /api/como-fazer/conteudos/:id/pdf/arranjo` `{formato, arranjo}` → grava (upsert). `DELETE ?formato=` → "voltar ao automático". Todos com `ESCOPO_IMPRIMIR`. Última gravação vence (mostrar "atualizado por X em …" no front).
- **Reconciliação com a versão em vigor** (feita no servidor, em toda prévia/GET): ids que não existem mais são **removidos em silêncio** das páginas e listados em `passosRemovidos`; ids novos (não presentes em nenhuma página) vão para `foraDasPaginas` e são listados em `passosNovos` — **o arranjo e os títulos são mantidos**, nada é re-distribuído sozinho. O front mostra: "A versão 4 trouxe 2 passos novos. Eles estão em *Fora das páginas*: coloque-os numa página." Página que ficou vazia continua existindo (vazia = bloqueio até o dono tirar ou preencher).
- Salvar o arranjo **não** exige que ele seja válido (dá para guardar rascunho de arranjo); gerar PDF exige.

### 4.4 Regras de servidor (inalteradas + novas)
- Só `PUBLICADO` + versão `PUBLICADA`; rascunho nunca imprime. Sem `?previa`.
- Cache em memória (LRU 12 / 30 MB / 10 min) com chave `conteudoId|versaoId|formato|hash(arranjo)|compacto|dia` (+ hash de treinados/revisões no fichário). Nada em disco.
- Fila de 2 PDFs simultâneos; freio de 20/min por usuário; validar tamanho do corpo (`jsonPequeno` 100 KB basta: 40 passoIds × 8 páginas).
- Log `[ComoFazer][pdf]` com conteudoId, formato, nº de páginas, vendedorId, ms.

### 4.5 Pergunta do coordenador 1 — o que é "bloco/processo" quando há uma seção só (Regra/Rotina com 16 passos)?
Hoje só **Máquina** tem seções nomeadas (MONTAR/USAR/LIMPAR/PROBLEMA); Regra/Rotina/Dosagem têm uma seção `PRINCIPAL`. **Recomendação (duas camadas, sem mexer em nada do que já existe):**
1. **Etapa 1 — só pela montagem das páginas.** Para conteúdo de seção única, "Um processo por página" não tem de onde tirar grupos; então o atalho vira "Dividir em páginas de 3-5" e o dono **nomeia cada página** ("Vestir", "Lavar as mãos", "Conferir") na tela de montagem. O arranjo guardado (§4.3) *é* o agrupamento. Zero mudança no editor e no schema do documento. Se o conteúdo for Máquina, o atalho usa as seções reais como página natural (padrão do pedido).
2. **Etapa 2 (opcional, junto das várias fotos) — campo `grupo` opcional no passo** (texto ≤ 30, ex. "Lavar as mãos"; passos consecutivos com o mesmo `grupo` formam um processo). Entra em `normalizarPasso`/`validarDoc`/`PassoEditor.jsx`, **aditivo** (ausente = sem grupo) e vira a fonte do "Um processo por página" para Regra/Rotina. Vantagem: o agrupamento passa a fazer parte do ensino (tablet pode mostrar "Etapa: Lavar as mãos"), mas mexe em versão/treinamento → fica fora da etapa 1. **Decisão do dono:** começar pela camada 1 (não custa nada e entrega o pedido); `grupo` só se ele sentir falta de agrupar no próprio editor.

### 4.6 Onde entra o botão "PDF": **TRÊS lugares**, um só componente (`ModalPdf`)
O dono procurou e não achou: "Imprimir A4" só existe dentro do conteúdo aberto da Biblioteca (`ConteudoPagina.jsx:183`), e nem a lista nem o editor têm botão de impressão. Mesma permissão nos três (`pode.editar || pode.painel`; admin passa) e o servidor é quem decide (§4.1: sem versão publicada devolve `SEM_VERSAO_PUBLICADA`).
1. **Conteúdo aberto (Biblioteca)** — `ConteudoPagina.jsx`, `botoesGestao`, ao lado de Imprimir A4 / QR code. Aqui a versão é sempre a publicada (a tela já exige).
2. **Lista de Conteúdos do Painel** — `frontend/src/pages/RH/comoFazer/TabConteudos.jsx`: cartão mobile `:127` e tabela desktop `:150-160`. Hoje a **linha inteira é um `<button>`** que abre o editor: não aninhar botão dentro de botão (HTML inválido; no iOS o toque erra o alvo). Tirar a ação para uma coluna "Ações" na tabela; no cartão mobile trocar o `<button>` raiz por `<div>` com a área do título clicável e uma barra de ações embaixo (`PDF` e `Editar`, `min-h-[44px]`). Habilitado só com `c.status==='PUBLICADO' && c.versaoAtual != null`; nos outros casos o botão aparece desligado com o texto do item 3. Com `c.temRascunho` aparece o aviso do item 3.
3. **Barra do editor** — `frontend/src/pages/RH/comoFazer/EditorConteudo.jsx:355-360`, a linha de ações (`✓ Rascunho salvo · Salvar rascunho · Publicar · (Refazer agenda) · Arquivar`): inserir **"PDF"** entre `Publicar` e `Refazer agenda/Arquivar` (nunca ao lado do Arquivar, vermelho, para não induzir toque errado), mesma classe de botão secundário (`bg-white border border-primary text-primary rounded-full min-h-[44px]`), ícone `FileText`. Regras de estado (texto simples sob o botão, `text-xs text-gray-600`, ou `title`):
   - **só rascunho** (`meta.status==='RASCUNHO'`, nunca publicado): botão **visível e desligado** (`disabled`, `aria-disabled`, opacidade 50%), texto "Publique primeiro para gerar o PDF". Rascunho nunca imprime.
   - **publicado e sem alteração pendente**: ligado, abre o modal.
   - **publicado + rascunho sobre ele** (existe versão `RASCUNHO` além da `PUBLICADA`, ou o editor tem alteração não salva/publicada): ligado, com o aviso fixo dentro do modal e como texto sob o botão: "O PDF usa a versão publicada (v3), não o rascunho." Detectar com os dados que o editor já carrega via `detalheAdmin` (lista de versões com status) ou o flag `temRascunho` de `listarAdmin`; se a informação não existir no estado do editor, mostrar o aviso sempre que `meta.status==='PUBLICADO'` (aviso extra é inofensivo, silêncio errado não).
   - **arquivado**: desligado, "Arquivado: publique de novo para gerar o PDF".
   - Não bloquear o botão por `salvo==='pendente'`: o PDF não depende do rascunho.
   O modal sempre mostra no topo "Imprime a **versão N**, publicada em dd/mm" (vem da prévia).
Em todos os três o `ModalPdf` recebe só `{conteudoId, titulo, aoFechar}`, busca a prévia e a gravação do arranjo sozinho e lembra do formato (`useFiltroSalvo`). `lazyComRetry` no import em cada ponto.

## 5. Algoritmo de paginação (backend; arquivo novo `comoFazerPdfLayout.js`, funções puras e testáveis)

Unidade: mm; conversão `MM = 72/25.4` como na receita. A4 = 210×297.

### 5.0 (REVISÃO 22/10) Algoritmo com ARRANJO — é este que vale; o DP de 5.1/5.2 só alimenta a sugestão
Funções puras em `comoFazerPdfLayout.js`:
1. `reconciliar(arranjoGuardado|null, docPublicado)` → `{arranjo, foraDasPaginas, passosNovos, passosRemovidos}`. Percorre os `passoIds` de cada página; descarta ids que não existem na versão (remoção silenciosa, registrada); ids do documento que não estão em página nenhuma → `foraDasPaginas` (ordem do documento); duplicados (mesmo id em 2 páginas) → `ARRANJO_INVALIDO` na entrada de POST, mas na reconciliação de arranjo guardado mantém a 1ª ocorrência.
2. `pesoDoPasso(p)` = 1; (etapa 2) `fotosDoPasso(p).length >= 3 ? 2 : 1`. Passo `perigo` com texto > 90 caracteres no cartaz também pesa 2 (ocupa linha dupla — é o mesmo cálculo de largura dupla do 5.1.3).
3. `limitePagina(formato, compacto)` = cartaz `compacto ? 8 : 6`; fichário 12. (O modo "compacto" é uma chave do próprio modal: "Letra e foto menores (até 8 por página)". Sem ela, cartaz = foto grande, 6.) Nº de páginas: 1–8 cartaz, 1–6 fichário (cartaz com 16 passos × 4 páginas × 4; ok).
4. `validarArranjo(arranjo, doc, formato)` → `{paginasResumo, bloqueios, avisos, podeGerar}`. Por página: `peso = Σ pesoDoPasso`; `ESTOURADA` se `peso > limite` (`excesso = peso − limite`, mensagem "Mova N passo(s) para outra página"); `VAZIA` se 0 passos; `CHEIA` se `peso == limite`; `OK` senão. **Ainda mede de verdade**: roda a medição de altura do 5.1.3 com a distribuição daquela página — se o peso cabe mas o texto é tão longo que `Σ hMin > corpoH`, marca `ESTOURADA` com `excesso` em passos (`ceil((Σ hMin − corpoH) / hMedio)`). O peso é a regra simples que o dono entende; a medição é a rede de segurança para nunca gerar folha ilegível.
5. `sugerir(modo, doc, formato, k?)`:
   - `passosPorPagina k` → N = ceil(T/k); distribui T em N fatias contíguas o mais iguais possível (13 passos, k=6 → 5/4/4). Se k > limite → 422.
   - `umProcessoPorPagina` → uma página por seção do documento com passos (Máquina: Montar/Usar/Limpar/Problema, título = título da seção); seção maior que o limite → dividida em partes iguais ("Limpar (1/2)"). Conteúdo de seção única → devolve `{modo:'umProcessoPorPagina', indisponivel:true, motivo:'Este manual tem uma seção só: use "Passos por página" e dê um nome a cada página.'}` (o front desliga o atalho com esse texto). Quando existir o campo `grupo` (etapa 2), agrupa por ele.
   - `automatico` → o DP do 5.1: menor nº de páginas viável (peso ≤ limite e altura ≤ corpoH), equilibrado, sem página com menos de 2 passos salvo se T < 2.
   - Todas as sugestões trazem `titulo` automático ("Página N", ou o da seção/grupo); o dono renomeia.
6. **Fichário com arranjo**: cada página do arranjo vira "uma folha de procedimento": a página 1 traz cabeçalho de controle + Objetivo + Quem executa + Materiais + a tabela de Procedimento só com os passos dela; as seguintes trazem o cabeçalho compacto (com o título da página) + a tabela dos seus passos; as seções finais (NÃO FAZER, Se der errado, Revisões, Treinamento) seguem depois da última página do arranjo. Quebra de página **forçada** entre páginas do arranjo. A escala de foto/fonte (5.2.3) é calculada **por página** para ocupar a folha. Se as seções iniciais + passos da página 1 não cabem em uma folha (limite 12 passos é "teórico"), a medição marca `ESTOURADA` na página 1. Se o bloco final não cabe no que sobra da última página, gera **1 folha extra** de fechamento e a prévia diz "Mais 1 página só com Revisões e Treinamento (total 5)". O número "de N" no rodapé conta tudo.
7. **Passos fora das páginas**: nunca entram no PDF; a geração exige `confirmarOmitidos:true` e a primeira página do PDF **não** ganha marca (o dono decidiu). Não existe "impressão silenciosa com passo esquecido".
8. Cache/idempotência: `hash(arranjo normalizado)` (JSON estável com chaves ordenadas).

Prova do algoritmo (script `teste-comofazer-pdf.js`): 16 passos → `passosPorPagina 4` → 4 páginas de 4; `3` → 6 páginas (5/5/... limite de nº de páginas 8 ok); `6` → 3 páginas (6/5/5); página com 9 passos → 422 com `{pagina:3,excesso:3}`; um passoId fora; id inexistente; id duplicado; arranjo guardado + versão com passo novo e passo removido.

> Os itens 5.1.5 a 5.1.9 abaixo ("paginasMinimas / recusa por N / DP / expansão") ficam como **sugestão e como medição de altura por página**; quem decide as páginas é o arranjo (5.0). A recusa por N pequeno virou a validação de página estourada.

### 5.1 CARTAZ (A4 em pé, margem 8 mm, 2 colunas)
1. **Entrada normalizada**: lista de "itens de fluxo" a partir de `secoes[]`: `{tipo:'FAIXA_BLOCO', titulo}` (só quando há >1 seção com passos) e `{tipo:'CARTAO', n, texto, detalhe, perigo, foto, dica}`. Numeração dos passos **contínua** (1..T) atravessando blocos e páginas.
2. **Geometria fixa por página** (igual nas N páginas): cabeçalho 30 mm (título do conteúdo em caixa-alta, subtítulo, "COD · versão", setores, "Aprovada em", QR 22 mm à direita); rodapé 8 mm ("Encarregada: … · Revisar até …" à esquerda; "Hardt Salgados · Como Fazer · pág. X/N" à direita); **faixa vermelha NÃO FAZER repetida em TODAS as páginas** (cada folha pode ir sozinha para a parede), altura medida pelo texto (14–22 mm); `avisoPerigo`, se houver, vira faixa vermelha fina logo abaixo do cabeçalho na página 1 e vira frase compacta no cabeçalho das demais. `corpoH = 297 − 16 − 30 − naoFazerH − 8 − folgas`.
3. **Medir cada cartão** com `doc.heightOfString` na largura da coluna (≈ 95 mm): texto a 15 pt em negrito; se passar de 5 linhas desce até 12 pt; `detalhe` a 9 pt entra **só se sobrar altura** na fase de expansão (item 8). `hMin = padding + texto + fotoMin(18 mm)`. Cartão com `perigo` ganha moldura vermelha (2 colunas de largura se o texto for >90 caracteres).
4. **Linhas de 2 colunas**: empacotar cartões em ordem; cartão de largura dupla ocupa a linha inteira; cartão ímpar final ocupa a linha com a outra coluna vazia (nunca esticar para a largura toda se for 1 passo isolado, a não ser que a página tenha ≤ 2 cartões — aí usar 1 coluna larga). `FAIXA_BLOCO` ocupa uma linha de 8 mm (e nunca fica órfã no pé da página: gruda no próximo cartão).
5. **Capacidade legível**: no máximo **8 cartões por página** (regra do mockup, "slots"; cartão duplo conta 2 — fica pronto para a etapa 2 com 3-4 fotos) e `Σ alturas mínimas ≤ corpoH`.
6. **Mínimo de páginas** `paginasMinimas` = menor P tal que um corte contíguo das linhas respeita o item 5 (varredura gulosa). Com `blocoNovaPagina` (Máquina): cada bloco com passos começa página nova → `paginasMinimas = Σ por bloco (mín. do bloco)`. Máximo = `min(4, nº de linhas)` (nunca mais páginas que linhas → sem página vazia).
7. **Escolha**: `auto` → `paginasMinimas`. `N < paginasMinimas` → **recusa** `PAGINAS_INSUFICIENTES` (mensagem: "Não cabe em N página(s): cabem X passos por folha com letra legível. Escolha K."). `N > máximo` → `PAGINAS_INVALIDAS`.
8. **Distribuição equilibrada**: dividir as linhas em exatamente N pedaços contíguos **minimizando a maior altura mínima de página** (programação dinâmica; ≤ ~25 linhas, trivial) com desempate por menor diferença entre páginas → nenhuma página quase vazia. Com `blocoNovaPagina`: primeiro reservar ≥1 página por bloco; as páginas extras vão para o bloco de maior peso, repetindo o DP dentro de cada bloco.
9. **Expansão por página**: `sobra = corpoH − Σ hMin`. Dividir a sobra igualmente entre as linhas e somar à altura da foto, com teto **85 mm** de foto. Sobra que restar: (a) liga o `detalhe` de cada cartão (9 pt) se couber, (b) sobe a fonte do texto até 18 pt, (c) aumenta o respiro entre linhas até 6 mm, (d) o que ainda restar fica no pé (grade alinhada ao topo). Resultado: 1 página = fotos compactas (≈ 20-27 mm); 3 páginas = fotos grandes. Foto sempre `cover` (corta ao quadro, centralizada) → o layout **não depende da proporção da imagem**.
10. **Desenho**: cada cartão = retângulo verde-escuro `#1E3932` 0,6 mm, número grande em círculo, texto, foto/quadro, `detalhe`. Só preto/verde-escuro/vermelho (impressora P&B). Cada página reescreve cabeçalho e rodapé → QR, código e versão em **todas** as páginas.

### 5.2 FICHÁRIO (A4 em pé, margem esquerda 28 mm, direita 10 mm, topo/baixo 12 mm)
1. **Seções fixas em ordem**: Cabeçalho de controle (tabela: logo/“Hardt Salgados”, título, código+versão, página X de N, setor, aprovado por/em, revisar até); 1 Objetivo; 2 Quem executa / supervisiona (setores+cargos / encarregados); 3 Materiais e EPI (`materiais`); 4 Procedimento (tabela Nº | O que fazer (texto em negrito + detalhe) | Fotos); 5 O que NÃO fazer (caixa vermelha); 6 Se der errado (tabela); 7 Controle de revisões; 8 Treinamento. Seção sem dado (ex.: sem `objetivo`) é omitida e a numeração se ajusta.
2. **Páginas seguintes** repetem um cabeçalho compacto (logo, título, código/versão, "Página X de N") e o rodapé ("COD · vN · Impresso em dd/mm/aaaa por Nome" + QR pequeno de 14 mm). Linha de tabela **nunca é cortada** (se não cabe, vai inteira para a próxima página, com o cabeçalho da tabela repetido).
3. **Escala `s`** (1,00 → 1,35) multiplica fonte do corpo (9 → 12 pt), altura da foto (13 → 30 mm) e espaçamentos. Natural = `s=1`. `paginasMinimas` = nº de páginas do fluxo com `s=1` (simulação sem desenhar). Máximo = 6.
4. **Escolha**: `auto` → mínimas. `N < mínimas` → `PAGINAS_INSUFICIENTES`. Para `N ≥ mínimas`: busca binária no maior `s ≤ 1,35` cujo fluxo ocupa **≤ N** páginas; se ainda sobrar página, a **seção 8 (Treinamento) cresce** com linhas em branco para assinar à mão até fechar exatamente N páginas (mensagem na prévia: "As páginas extras ficam com linhas para assinar"). Nunca página em branco.
5. **Treinamento**: linhas preenchidas com os funcionários que aprenderam a versão em vigor (`ciclo:1`, `versaoTreinoNumero` do conteúdo; nome, data do "Aprendi", "confirmado por" quando houver) + linhas em branco até completar a página (mín. 5 em branco). Colunas: Nome | Data | Assinatura do funcionário | Visto do encarregado (mockup).
6. **Controle de revisões**: uma linha por versão (`PUBLICADA` e `SUBSTITUIDA`, mais nova primeiro, máx. 8): versão | data de publicação | "O que mudou" | aprovado por.
7. **Duas lacunas do modelo (decisão do dono — ver §9)**: "O que mudou" não existe no banco → etapa 1 sai **em branco** (para escrever à mão); "Revisar até" não existe → etapa 1 imprime `publicadaEm + 12 meses` marcado como regra do sistema. Nenhum campo novo no schema nesta etapa.

### 5.3 O que acontece com conteúdo "vazio"
- Sem versão publicada / rascunho / arquivado → recusa (não gera nada).
- Versão publicada sem passos não existe (o publicar valida ≥1 passo). Se vier doc sem seções (dado corrompido) → `CONTEUDO_VAZIO` 409.
- Sem fotos em nenhum passo → gera mesmo assim (quadros tracejados com a dica) e a prévia avisa "Nenhum passo tem foto".

## 6. Plano de execução numerado

**Ordem recomendada** (backend e frontend podem andar em paralelo depois do passo 3; a costura é o contrato do §4).

### dev-backend
1. `backend/package.json`: adicionar `sharp` (versão estável compatível com node20 musl); rodar `npm install` local; confirmar que `docker build` do `backend/Dockerfile` instala (não precisa mudar o Dockerfile). **Parar e avisar** se o binário `linuxmusl` não instalar.
2. `backend/services/comoFazerPdfLayout.js` (novo, puro): `medirCartaz`, `medirFicharioPaginas`, `distribuirLinhas` (DP), `limparTextoPdf`. Sem pdfkit e sem banco → testável por script.
3. `backend/services/comoFazerPdfService.js` (novo): `carregarConteudoParaPdf(id)` (valida publicada, lê `versao.passos`, treinados, revisões, encarregados, nomes de setor), `previa(id, opts)`, `gerar(id, opts, cf)`, fotos via `sharp` + `existsSync` em `RAIZ`, QR vetorial, cache LRU, fila de 2, freio por usuário. Padrão visual copiado de `receitaPdfService.js` (MM, estrutura, tratamento de erro).
3b. `backend/prisma/schema.prisma`: model aditivo `ComoFazerLayoutImpressao` (§4.3) + relação no `ComoFazerConteudo`; **nenhum campo existente muda**; validar com `npx prisma validate`/`db push` local em `hardt_local` (CLAUDE.md: deploy usa `db push`).
4. `backend/routes/comoFazerRoutes.js`: `ESCOPO_IMPRIMIR`, as rotas do §4 (`pdf/previa`, `pdf`, `pdf/arranjo` GET/PUT/DELETE), `res.type('application/pdf')…send(buffer)`; erros via `ErroCF` (importar de `svc` como as outras).
5. **Prova de conceito antes de mexer em tela** (§7). Só depois seguir.
6. `backend/scripts/teste-comofazer-pdf.js` (script de teste, ver §7): gera cartaz 5 e 12 passos × 1/2/3 páginas, fichário 2 páginas, foto ausente, Máquina com bloco novo, rascunho bloqueado; grava PDFs em pasta temporária e imprime resumo.
7. `backend/manuais/abas/como-fazer.md`: documentar o botão PDF, formatos, escolha de páginas, avisos, quem pode. `backend/services/copilotoService.js` tabela `ABAS`: não muda (rota e permissão da aba não mudam) — conferir.

### dev-frontend
8. `frontend/package.json`: `pdfjs-dist@3.11.174` (exato, sem `^`). Confirmar `npm run build` e que o worker sai como asset em `dist/assets/`.
9. `frontend/src/services/comoFazerService.js`: `pdfPrevia(id, corpo)` (JSON) e `pdfGerar(id, corpo)` → `api.post(..., {responseType:'blob'})`, traduzindo erro-em-blob para `{codigo,mensagem,extra}`. Somente cliente `api` (app), nunca o do tablet.
10. `frontend/src/components/VisualizadorPdf.jsx` (novo, **genérico**: recebe `blob` ou `url`, `nomeArquivo`, `onFechar`; nada de Como Fazer dentro). Modal tela cheia (`fixed inset-0 z-[9000]`, fundo cinza-escuro, barra superior: nome, "pág. X/N", `‹ ›`, `− 100% +` e "Ajustar à largura", Salvar PDF, Imprimir, Fechar — todos com `min-h-[44px]`). Renderização: uma `<canvas>` por página em coluna rolável, `devicePixelRatio` limitado a 2, render sob demanda (IntersectionObserver) e liberação ao sair de vista; zoom por botões (50-300%) com rolagem horizontal **dentro** do modal (a página do app não ganha scroll horizontal); setas rolam até a página; indicador "pág. 1/2" atualiza pelo scroll. Pré-renderização de impressão (§3.3) em segundo plano. Texto do limite do iPad (§3.3). Reaproveitável por Anexos/DANFE depois (`AnexosEntidade.jsx` hoje abre blob em outra aba: **não mexer agora**).
11. `frontend/src/pages/ComoFazer/ModalPdf.jsx` (novo; ponto de entrada nos 3 lugares do §4.6). Fluxo em 3 passos dentro de um modal (folha de baixo no celular, botões fixos no rodapé): **(a) Formato** — dois cartões grandes (🧱 Cartaz de parede / 📒 Folha de fichário; "📋 Folha de registro — em breve" desligado) e, em Máquina, nada de pergunta extra (blocos são páginas naturais); **(b) Páginas** — chips de atalho `Automático · 3 · 4 · 5 · 6 passos por página` e `Um processo por página`, e o botão **"Montar as páginas"** que abre o `MontarPaginas`; resumo "4 páginas · 16 passos · tudo cabe" ou o motivo do bloqueio; chave "Letra e foto menores (até 8 por página)" só no cartaz; **(c) Ver o PDF** — botão grande (loading "Montando o PDF…") que **só liga com `podeGerar`**; avisos listados (sem foto, foto perdida, passos fora → pede o "Sim, imprimir sem esses passos" que seta `confirmarOmitidos`). Chama a prévia a cada mudança de arranjo (debounce 400 ms, cancelando a chamada anterior) — a prévia é a **única fonte** de verdade da validação, o front só desenha o resultado.
12. `frontend/src/pages/ComoFazer/MontarPaginas.jsx` (novo; mockup aba 6). Estado: `arranjo={paginas:[{uid,titulo,passoIds}], compacto}` + `fora` (derivado: todos os passos do documento menos os colocados) + `resumo` (da prévia). Itens:
    - Atalhos no topo (chips 44 px): `Passos por página 3/4/5/6`, `Um processo por página` (desligado com o texto do servidor quando `indisponivel`), `+ Página`, `Voltar ao automático`. Cada atalho chama a prévia com `modo` e **substitui o arranjo** (se o dono já mexeu à mão, confirmar: "Isso refaz as páginas que você montou. Continuar?").
    - Um cartão por página: título editável (input), medidor (barra verde/âmbar/vermelha + texto "4 passos · cabe bem" / "9 passos · não cabe (máximo 6). Mova 3 passos para outra página."), lista de passos com `☰` (arrastar), número do passo, texto, selo "4 fotos · conta como 2", e **"Mover ▾"** (`SelectBusca`-like em portal com as páginas + "Fora das páginas"; **toque, é o caminho principal em celular/iPad**). Arrastar só no computador (HTML5 drag & drop com `draggable`; **não** depender dele no toque), sem biblioteca nova. Página tem "Remover página" (os passos vão para *Fora*).
    - Bandeja **"Fora das páginas (N)"**: mesmos itens com "Colocar em ▾". Fundo âmbar se N>0 e "Passo esquecido" explícito.
    - Layout: computador = grade de cartões lado a lado (`md:grid-cols-2 lg:grid-cols-3`); celular = empilhados e **recolhíveis** (cabeçalho do cartão é botão ▾/▴ 44 px, abre só o primeiro e o estourado); alvos ≥ 44 px; sem scroll horizontal; `gap` em todos os grids.
    - "Guardar este arranjo" (caixa marcada por padrão): ao fechar o modal ou clicar em **Ver o PDF**, `PUT /pdf/arranjo` (debounce, só se mudou). Indica "Arranjo guardado por X em dd/mm". Banner de reconciliação: "A versão 4 trouxe 2 passos novos; estão em *Fora das páginas*." e "1 passo foi removido do manual e saiu das páginas."
    - Os cálculos de peso no front são só para **feedback imediato ao arrastar** (opcional); o bloqueio de verdade vem da prévia/servidor.
13. `frontend/src/services/comoFazerService.js` (rever o passo 9): `pdfPrevia(id, corpo)`, `pdfGerar(id, corpo)` (blob, erro-em-blob → JSON com `bloqueios`), `pdfArranjo.obter/salvar/apagar`. Persistir com `useFiltroSalvo('como-fazer-pdf:formato','CARTAZ')` apenas formato e `compacto`; **o arranjo vive no servidor, não no localStorage**.
13b. Pontos de entrada do botão: `ConteudoPagina.jsx`, `TabConteudos.jsx` (desktop+mobile, §4.6) e `EditorConteudo.jsx` (§4.6.3), todos com `lazyComRetry(() => import('…/ModalPdf'))`.
14. Manter `htmlDocumento.js` + "Imprimir A4" **como estão** (§8).
15. Novidade: `frontend/public/novidade-pdf-pop.html` (padrão `novidade-tarefas.html`, accordions abertos, mockups com pins das 3 telas: opções, visualizador, folha pronta; sem `og:image`, sem botão "abrir o app") + entrada no topo de `frontend/public/novidades.json` (`slug:'pdf-pop'`). Texto pronto para o WhatsApp na nota de entrega.
16. `npm run build` (obrigatório) e marcador de deploy conforme o padrão do projeto para conferir o chunk em produção.

### Gerente / QA
17. QA e revisor em paralelo (§10) → gerente-entrega.

## 7. Prova de conceito (obrigatória, antes de tudo que vem depois)

`backend/scripts/teste-comofazer-pdf.js` (não commitar PDFs). Com o backend local e `hardt_local`:
1. Rodar `backend/scripts/seedComoFazer.js` (existe) para ter o POP de **Higiene e uniforme** publicado; subir 3-4 fotos de exemplo (JPG, uma PNG, uma WebP, uma grande de ~10 MB) em `backend/uploads/como-fazer/conteudos/<id>/` e ligá-las a passos.
2. Gerar `HIG-001-v3-cartaz.pdf` (1 página) e `-fichario.pdf` (2 páginas) numa pasta temporária fora do repositório.
3. Conferir **visualmente** (PDF → PNG com `pdftoppm`/`pdfjs`) contra `docs/pop/mockup-impressao-pop.html` abas 1 e 2: números nos cartões, faixa NÃO FAZER, QR nítido, acentos (`ç ã é`), margem de 28 mm no fichário, tabela de treinados, rodapé "pág. X/N".
4. Medir tempo e memória (`process.memoryUsage()`): alvo < 1 s e < +80 MB por PDF com 12 fotos.
5. Ler o QR gerado (decodificar com `jsqr` ou celular) e confirmar que abre `/como-fazer/c/<id>`.
Se o resultado visual for ruim em 1 dia de ajuste, **reavaliar** (Chromium vira a única saída, com decisão do dono sobre o container) — não empilhar remendo.

## 8. Substituição da impressão atual
Etapa 1: **não mexer** em `htmlDocumento.js`/"Imprimir A4" (é o único caminho hoje, mesmo falho no iPad). O botão novo é **adicional**. Quando o dono validar o PDF no iPad real em produção, uma etapa de limpeza separada troca "Imprimir A4" para abrir o mesmo `ModalPdf` (formato Fichário) e remove `htmlDocumento.js` se nada mais o usar (`grep` por `montarCorpoDocumento|ESTILOS_FOLHA` antes — também pode estar no editor `frontend/src/pages/RH/comoFazer/`).

## 9. Decisões abertas para o dono (não bloqueiam o dev; adotado o padrão indicado)
1. **"Revisar até"**: não existe no sistema. Adotado `publicação + 12 meses` (calculado, rótulo "Revisar até"). Alternativa: campo novo no conteúdo (`reciclagemMeses` já existe para treinamento, Fase 3).
2. **"O que mudou" nas revisões**: não existe. Adotado em branco para escrever à mão. Alternativa: pedir uma frase ao publicar a nova versão (campo novo em `ComoFazerVersao`, exige `db push` — fazer em etapa própria).
3. **Código do POP (`HIG-001`) aparece no papel** que vai para a parede. O schema diz que o código "nunca" aparece para o funcionário; o mockup aprovado e o "Imprimir A4" atual já o mostram. Mantido (o dono aprovou o mockup); sem `codigo` o cabeçalho usa só o título.
4. **Quem gera PDF**: só quem já vê o botão "Imprimir A4" (editar ou painel; admin passa). Funcionário comum e tablet não gera.

## 10. Riscos e efeitos colaterais

| Risco | Verificação feita / mitigação |
|---|---|
| `sharp` não instala no `node:20-alpine` | passo 1 do backend; plano B no §3.1. Nenhum outro código usa `sharp` (grep em `backend/` não acha) — só entra o pacote |
| Memória: foto 10-15 MB × 12 | `resize` para 1200 px antes de entregar ao pdfkit, uma por vez, fila de 2 PDFs |
| Foto sumiu do volume | quadro tracejado + aviso na prévia; PDF nunca falha por isso. Caminho só `RAIZ` (`../uploads/como-fazer`, já correto no middleware) — **este módulo só LÊ; não grava nada no disco**, então não se aplica a regra "testar atravessando deploy", mas a leitura de foto existente **deve ser testada em produção** depois do deploy |
| Texto com caractere fora do WinAnsi vira lixo no PDF | `limparTextoPdf` + teste com emoji, `−`, `→`, `⚠` no conteúdo |
| Header de erro em blob no Axios | passo 9; QA tem que forçar `PAGINAS_INSUFICIENTES` de verdade |
| `print()` assíncrono bloqueado no iOS | pré-renderização + botão só habilita quando pronto (§3.3) |
| Chunk do pdfjs/worker velho após deploy | `lazyComRetry`; worker é asset com hash em `/assets/`; subir `VERSAO` do `sw.js` **não** é necessário (estratégia não muda) |
| Bundle principal inchado | pdfjs só em chunk lazy; conferir no `npm run build` que o chunk principal não cresceu |
| Permissão front ≠ back | back: `exigirPermissao('Pode_Editar_Como_Fazer','Pode_Ver_Painel_Como_Fazer')` (admin passa); front: `pode.editar \|\| pode.painel`. Conferir `useComoFazerMe` mapeia admin igual ao back (permissão é OBJETO: testar com o perfil "Producao") |
| Conflito com o working tree compartilhado | arquivos novos em sua maioria; únicas edições em arquivo existente: `comoFazerRoutes.js`, `comoFazerService.js` (front), `ConteudoPagina.jsx`, `backend/package.json`, `frontend/package.json`, `novidades.json`, `manuais/abas/como-fazer.md`. Add explícito, nunca `git add .` |
| Consumidores quebrados | nada existente muda de formato: grep confirma que `abrirConteudo`, `relatorio`, `htmlDocumento.js` não são alterados. A API `/api/ia-consulta/v1` não é tocada |
| Cache servir folha velha | chave inclui `versaoId` e hash de treinados/revisões; lista de treinados muda → chave muda |
| Arranjo guardado fica velho (passo novo/removido) | reconciliação no servidor (§4.3) em toda prévia; nunca redistribui sozinho; passo novo vai para "Fora" |
| Cliente manda arranjo adulterado (id de outro conteúdo, 500 ids) | servidor valida cada `passoId` contra o documento publicado, limita 40 ids × 8 páginas, título ≤ 40 |
| Dois gestores editam o arranjo juntos | última gravação vence; tela mostra "atualizado por X em …" |
| Botão aninhado em linha clicável da lista | §4.6.2 (cartão vira `div`; ação separada) |
| Tela de montagem pesada no celular | sem biblioteca de drag; cartões recolhíveis; prévia com debounce e cancelamento |

## 11. O que NÃO fazer
- Não usar `window.open`, `<iframe>`, `<embed>` ou `<object>` para mostrar/imprimir o PDF (regra do CLAUDE.md; o iPad imprime branco).
- Não usar Chromium/puppeteer nem mexer no `Dockerfile` do backend.
- Não gerar PDF de rascunho ou arquivado; não aceitar `?previa`.
- Não ler `docParaLeitura` no gerador (ele apaga `fotoSugerida`).
- Não confiar na URL de foto do doc sem `midiaValida` + `path.resolve` dentro de `RAIZ`.
- Não aceitar URL do QR vinda do corpo da requisição.
- Não gravar PDF em disco (nem em `uploads`): gerado em memória, cache em memória.
- Não deixar o layout depender da proporção da imagem; não usar fonte/ícone fora do WinAnsi.
- Não mudar o schema Prisma nesta etapa (nenhum campo novo; ver §9).
- Não quebrar "Imprimir A4" nem o QR code atuais.
- Não persistir nº de páginas escolhido; não usar `<select>` nativo (usar chips).
- Não criar gerador separado "por tipo de conteúdo": um só layout lê o mesmo doc.

- Não colocar o botão PDF dentro de um `<button>` (linha da lista) nem ao lado do Arquivar no editor.
- Não gravar o arranjo no JSON da versão nem no localStorage; não deixar o front ser o único validador (servidor revalida com 422).
- Não imprimir rascunho nem "o rascunho aberto no editor": PDF = versão publicada, e a tela diz isso.
- Não depender de arrastar para mover passo (toque com "Mover ▾" é o caminho principal).

## 12. Ganchos das etapas 2 e 3
- **Etapa 2 (até 4 fotos por passo, `fotos:[{url,legenda}]`)**: o layout já mede por "slots" e por lista de fotos (`passo.fotos ?? (passo.foto ? [passo.foto] : [])`); cartão com 3-4 fotos ocupa linha dupla. Escrever o normalizador `fotosDoPasso(p)` desde já.
- **Etapa 3 (registro de rotina, A4 paisagem)**: `formato:'REGISTRO'` já existe no contrato e responde `FORMATO_INDISPONIVEL`; o modal já mostra o cartão desabilitado "em breve"; o layout paisagem entra como terceira função em `comoFazerPdfLayout.js`.

## 13. Critérios de aceite (REVISADOS 22/10; QA clicando no app local + PDF aberto de verdade)
1. **16 passos em 4 páginas**: atalho "4 passos por página" monta 4 páginas de 4 (medidor verde); "Ver o PDF" gera 4 páginas A4 com os passos certos em cada uma, numeração do manual (1–16) contínua, o **nome de cada página no cabeçalho**, QR/código/versão/"pág. X/4" em todas.
2. **Um processo por página**: em conteúdo de **Máquina**, uma página por Montar/Usar/Limpar/Problema (seção grande é dividida em partes); em Regra/Rotina de seção única o atalho aparece desligado com a explicação e "Passos por página" + nomes manuais funcionam.
3. **Página estourada bloqueia**: mover 9 passos para uma página (cartaz) deixa o cartão vermelho com "não cabe (máximo 6). Mova 3 passos…", "Ver o PDF" desligado; chamada direta `POST /pdf` com o mesmo arranjo devolve **422 ARRANJO_INVALIDO** com `{pagina, excesso}`. "Letra e foto menores" libera até 8. Fichário aceita até 12. Página vazia também bloqueia.
4. **Passo esquecido avisa**: tirar um passo de uma página o leva a "Fora das páginas (1)"; gerar exige o "Sim, imprimir sem esse passo" (sem isso a API devolve 422 `PASSOS_FORA_SEM_CONFIRMACAO`); o PDF não contém o passo.
5. **Arranjo guardado volta igual**: montar, gerar, fechar tudo, reabrir (e em outro navegador com outro usuário gestor): mesmas páginas, títulos, ordem; "Voltar ao automático" apaga.
6. **Troca de versão**: publicar versão nova com 1 passo a mais e 1 a menos: arranjo e títulos mantidos, o passo novo em "Fora das páginas" com o aviso, o removido some sem erro; PDF antigo continua dizendo a versão antiga.
7. **Mover**: "Mover ▾" por toque entre páginas e para/de "Fora" (celular 375 px e iPad); arrastar pelo ☰ no computador; ambos atualizam o medidor na hora.
8. **Responsivo**: computador = páginas lado a lado; 375 px = cartões empilhados e recolhíveis; alvos ≥ 44 px; sem scroll horizontal; iPad (820 px) usável só com toque.
9. **Os três botões**: PDF visível e funcional na Biblioteca (ao lado do Imprimir A4), em cada linha publicada da lista de Conteúdos (desktop e mobile, sem abrir o editor ao tocar) e na barra do editor (entre Publicar e Arquivar). Editor: conteúdo só-rascunho = botão desligado "Publique primeiro para gerar o PDF"; publicado com rascunho por cima = aviso "O PDF usa a versão publicada (vN), não o rascunho"; arquivado = desligado. Usuário sem permissão/tablet: nenhum dos três aparece e a API devolve 403.
10. Visualizador, Salvar PDF e Imprimir (itens 8-10 antigos): em 375 px e iPad sem scroll horizontal da página; setas e "pág. X/N"; zoom; Salvar baixa `HIG-001-v3-cartaz.pdf` certo (iPad: folha de compartilhar); Imprimir abre o diálogo com as N páginas e sem nova aba; texto do limite do iPad em iOS.
11. Foto ausente (arquivo apagado) e passo sem foto: quadro tracejado com a dica; PDF gerado; aviso na prévia. Texto com emoji/`−`/`→` não gera lixo no PDF.
12. Fichário com arranjo de 2 páginas (6+6 passos): margem 28 mm, cabeçalho de controle na 1ª, compacto com o nome da página na 2ª, Revisões e Treinamento no fim (folha extra anunciada na prévia se preciso), nenhuma linha cortada.
13. Erro de rede/servidor: mensagem simples em português; botões continuam utilizáveis.
14. Regressão: "Imprimir A4", QR code, Nova versão, Publicar/Arquivar/Salvar rascunho do editor, abas Versões/Quem treinou/Execuções, tablet abrindo conteúdo, autosave do editor.
15. `npm run build` passa; pdfjs fora do bundle principal; worker em `dist/assets`; `prisma validate` e `db push` locais ok (tabela nova apenas adicionada).
16. Pós-deploy em produção: PDF de conteúdo real com foto, arranjo guardado, e **abrir de novo depois de um deploy** (a tabela é banco, mas a leitura de foto do volume e o `sharp` no container precisam ser provados lá).
17. Clippy: `backend/manuais/abas/como-fazer.md` e `rh-como-fazer-painel.md` atualizados (botão PDF nos 3 lugares, montar páginas); novidade `novidade-pdf-pop.html` com mockups das telas (opções, montar páginas desktop/celular, visualizador) + `novidades.json`.

Revisor confere: arranjo validado no servidor com os mesmos limites; ids vindos do cliente conferidos contra o documento; `exigirPermissao` com as duas permissões em TODAS as rotas novas (incl. `/pdf/arranjo`); schema só aditivo; nenhum `fotoSugerida` vazando fora do PDF de gestão; `sharp` só no serviço novo; sem escrita em disco; `limparTextoPdf` em todo texto; caminho de foto com `path.resolve` dentro de `RAIZ`; cleanup de `blob:` e canvases; sem `window.open`/iframe; sem `<select>` nativo; sem botão dentro de botão.
