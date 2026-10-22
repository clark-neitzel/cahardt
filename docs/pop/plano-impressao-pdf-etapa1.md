# Plano — PDF do Como Fazer, etapa 1 (cartaz + fichário + visualizador + escolha de páginas)

Arquiteto · 22/10/2026 · porte: **GRANDE** (módulo novo no backend + componente novo no frontend + dependência nova nos dois lados). Não toca em fiscal/financeiro/WhatsApp/IA-consulta; toca em **permissões** e **upload/volume** (leitura de fotos).

Desenho aprovado: `docs/pop/mockup-impressao-pop.html` (abas 0, 1, 2 e 5). Abas 3 (várias fotos) e 4 (registro) = etapas 2 e 3: só ganchos.

---

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
(= o mesmo critério do botão "Imprimir A4"; **tablet e usuário sem essas permissões levam 403**; o funcionário comum não gera PDF — alinhado com o frontend `pode.painel || pode.editar`, `ConteudoPagina.jsx:182`).

### 4.1 `POST /api/como-fazer/conteudos/:id/pdf/previa` → JSON
Corpo: `{ formato: 'CARTAZ'|'FICHARIO', blocoNovaPagina?: boolean }`
Resposta 200:
```json
{
  "formato": "CARTAZ", "versao": 3, "codigo": "HIG-001", "totalPassos": 12,
  "paginasMinimas": 2, "paginasMaximas": 4, "paginasAutomatico": 2,
  "opcoes": [
    { "paginas": 1, "cabe": false, "motivo": "Não cabe em 1 página: cabem 8 passos por folha. Escolha 2 ou mais." },
    { "paginas": 2, "cabe": true,  "passosPorPagina": [6,6], "tamanhoFoto": "média" },
    { "paginas": 3, "cabe": true,  "passosPorPagina": [4,4,4], "tamanhoFoto": "grande" }
  ],
  "temBlocos": false, "blocos": null,
  "avisos": [ { "tipo": "SEM_FOTO", "mensagem": "3 passos sem foto: sairá quadro vazio com a dica da foto." },
              { "tipo": "FOTO_PERDIDA", "mensagem": "A foto do passo 4 não está mais no servidor." } ],
  "nomeArquivo": "HIG-001-v3-cartaz.pdf"
}
```
Para Máquina `temBlocos:true`, `blocos:[{bloco:'MONTAR',passos:5},…]` e, se `blocoNovaPagina`, `paginasMinimas` ≥ nº de blocos com passo.
Erros: `NAO_ENCONTRADO` 404; `SEM_VERSAO_PUBLICADA` 409 ("Este conteúdo ainda não tem versão publicada. Publique antes de gerar o PDF."); `FORMATO_INVALIDO` 400; `FORMATO_INDISPONIVEL` 501 para `REGISTRO` (gancho etapa 3).
A prévia faz só **medição** (sem ler imagem de verdade; só `existsSync` para o aviso de foto perdida) → rápida, e a tela pode chamá-la a cada troca de formato/bloco.

### 4.2 `POST /api/como-fazer/conteudos/:id/pdf` → binário
Corpo: `{ formato, paginas: 'auto' | 1..N, blocoNovaPagina?: boolean }`.
200: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="HIG-001-v3-cartaz.pdf"`, `Content-Length`, `Cache-Control: no-store` (já global). Número de páginas **não** vai em header (o pdfjs lê do arquivo).
Erros (todos JSON `{erro,codigo,...extra}` via `ErroCF`): os da prévia + `PAGINAS_INSUFICIENTES` 422 `extra:{paginasMinimas, passosPorPagina}` ("Não cabe em 1 página: cabem 8 passos. Escolha 2."), `PAGINAS_INVALIDAS` 400 (fora de 1–4 cartaz / 1–6 fichário), `PDF_OCUPADO` 503, `ERRO_INTERNO`.
**Frontend:** com `responseType:'blob'` o corpo de erro também vem como Blob → o service precisa fazer `JSON.parse(await err.response.data.text())` antes de passar para `mensagemErro/codigoErro`. (Costura clássica — testar um erro de verdade.)

### 4.3 Regras de servidor
- Só `status==='PUBLICADO'` + `versaoPublicadaId` + versão `PUBLICADA`. Rascunho **nunca** imprime (não há `?previa`). Conteúdo ARQUIVADO → 404/409 igual.
- **Cache** em memória (LRU, 12 entradas, ≤ 30 MB, TTL 10 min) com chave `conteudoId|versaoId|formato|paginas|bloco|dataDoDia` + (fichário) `hash(lista de treinados + revisões)`. Invalidação na publicação é automática (versaoId muda). Não é persistido (sem arquivo no disco → nada a perder em deploy). A data "Impresso em" entra na chave pelo dia.
- Auditoria leve: `console.log('[ComoFazer][pdf]', conteudoId, formato, paginas, vendedorId, ms)`.
- `req.cf.vendedorId` → nome via `resolverPublicadaPor` (rodapé "Impresso em … por …").

## 5. Algoritmo de paginação (backend; arquivo novo `comoFazerPdfLayout.js`, funções puras e testáveis)

Unidade: mm; conversão `MM = 72/25.4` como na receita. A4 = 210×297.

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
4. `backend/routes/comoFazerRoutes.js`: `ESCOPO_IMPRIMIR`, as duas rotas do §4, `res.type('application/pdf')…send(buffer)`; erros via `ErroCF` (importar de `svc` como as outras).
5. **Prova de conceito antes de mexer em tela** (§7). Só depois seguir.
6. `backend/scripts/teste-comofazer-pdf.js` (script de teste, ver §7): gera cartaz 5 e 12 passos × 1/2/3 páginas, fichário 2 páginas, foto ausente, Máquina com bloco novo, rascunho bloqueado; grava PDFs em pasta temporária e imprime resumo.
7. `backend/manuais/abas/como-fazer.md`: documentar o botão PDF, formatos, escolha de páginas, avisos, quem pode. `backend/services/copilotoService.js` tabela `ABAS`: não muda (rota e permissão da aba não mudam) — conferir.

### dev-frontend
8. `frontend/package.json`: `pdfjs-dist@3.11.174` (exato, sem `^`). Confirmar `npm run build` e que o worker sai como asset em `dist/assets/`.
9. `frontend/src/services/comoFazerService.js`: `pdfPrevia(id, corpo)` (JSON) e `pdfGerar(id, corpo)` → `api.post(..., {responseType:'blob'})`, traduzindo erro-em-blob para `{codigo,mensagem,extra}`. Somente cliente `api` (app), nunca o do tablet.
10. `frontend/src/components/VisualizadorPdf.jsx` (novo, **genérico**: recebe `blob` ou `url`, `nomeArquivo`, `onFechar`; nada de Como Fazer dentro). Modal tela cheia (`fixed inset-0 z-[9000]`, fundo cinza-escuro, barra superior: nome, "pág. X/N", `‹ ›`, `− 100% +` e "Ajustar à largura", Salvar PDF, Imprimir, Fechar — todos com `min-h-[44px]`). Renderização: uma `<canvas>` por página em coluna rolável, `devicePixelRatio` limitado a 2, render sob demanda (IntersectionObserver) e liberação ao sair de vista; zoom por botões (50-300%) com rolagem horizontal **dentro** do modal (a página do app não ganha scroll horizontal); setas rolam até a página; indicador "pág. 1/2" atualiza pelo scroll. Pré-renderização de impressão (§3.3) em segundo plano. Texto do limite do iPad (§3.3). Reaproveitável por Anexos/DANFE depois (`AnexosEntidade.jsx` hoje abre blob em outra aba: **não mexer agora**).
11. `frontend/src/pages/ComoFazer/ModalPdf.jsx` (novo): passo 1 "Como você vai usar?" — dois cartões grandes (🧱 Cartaz de parede / 📒 Folha de fichário; "📋 Folha de registro — em breve" desabilitado); passo 2 "Quantas páginas?" chips `Automático · 1 · 2 · 3 · 4` (cartaz) ou `Automático · 1…6` (fichário), preenchidos pela `previa`: chip `cabe:false` fica desabilitado com o motivo embaixo, em texto simples ("Não cabe em 1 página: cabem 8 passos por folha. Escolha 2 ou mais."); a escolha inicial é o `paginasAutomatico`; aviso verde "Vai sair em 2 páginas, 6 passos em cada" (como a aba 5 do mockup); só para Máquina, chave "Começar cada bloco (Montar/Usar/Limpar/Problema) em página nova"; lista os `avisos` (sem foto, foto perdida); botão **"Ver o PDF"** (loading "Montando o PDF…") → abre `VisualizadorPdf`. Erros em português simples ("Não consegui montar o PDF. Tente de novo."; para `PAGINAS_INSUFICIENTES` mostra o mínimo vindo do servidor). Sem `<select>` nativo; chips como no mockup. Mobile 375 px: modal vira folha de baixo com botões fixos no rodapé.
12. `ConteudoPagina.jsx`: botão **"PDF"** em `botoesGestao` ao lado de Imprimir A4 / QR code, mesma condição `(pode.painel || pode.editar)` **e** `conteudo.versao` publicada (a tela só abre publicado: `abrirConteudo` com `previa` falso já exige). Ícone `FileText` (lucide). `ModalPdf` e `VisualizadorPdf` carregados com `lazyComRetry`.
13. Persistir as últimas escolhas (formato; bloco novo) com `useFiltroSalvo('como-fazer-pdf:formato', 'CARTAZ')` (CLAUDE.md); **não** persistir nº de páginas (depende do conteúdo).
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

## 12. Ganchos das etapas 2 e 3
- **Etapa 2 (até 4 fotos por passo, `fotos:[{url,legenda}]`)**: o layout já mede por "slots" e por lista de fotos (`passo.fotos ?? (passo.foto ? [passo.foto] : [])`); cartão com 3-4 fotos ocupa linha dupla. Escrever o normalizador `fotosDoPasso(p)` desde já.
- **Etapa 3 (registro de rotina, A4 paisagem)**: `formato:'REGISTRO'` já existe no contrato e responde `FORMATO_INDISPONIVEL`; o modal já mostra o cartão desabilitado "em breve"; o layout paisagem entra como terceira função em `comoFazerPdfLayout.js`.

## 13. Critérios de aceite (QA clicando no app local + PDF aberto de verdade)
1. Cartaz, conteúdo de **5 passos**: 1 página (auto), 2 páginas (3+2 ou equivalente, sem página quase vazia), 3 páginas: letras legíveis, fotos maiores com mais páginas.
2. Cartaz, **12 passos**: "1 página" fica desabilitada com o aviso "Não cabe em 1 página: cabem 8 passos por folha. Escolha 2 ou mais."; `auto` = 2 páginas (6+6); 3 páginas (4+4+4). Forçar `POST` com `paginas:1` direto na API devolve `422 PAGINAS_INSUFICIENTES` com o mínimo.
3. Em todas as páginas do cartaz: QR, código/versão, faixa NÃO FAZER, "pág. X/N" corretos; numeração dos passos contínua.
4. Fichário **2 páginas**: margem esquerda 28 mm, cabeçalho de controle, passos em tabela, "Se der errado", controle de revisões e lista de treinados com linhas em branco; página 2 com cabeçalho compacto e "Página 2 de 2"; nenhuma linha cortada.
5. Foto ausente (arquivo apagado do volume) e passo sem foto: quadro tracejado com a dica; PDF gerado; aviso na prévia.
6. Versão **rascunho** / conteúdo arquivado: botão PDF não aparece; chamada direta à API devolve erro (`SEM_VERSAO_PUBLICADA`/404). Tablet e usuário sem permissão: 403; botão ausente.
7. Conteúdo de **Máquina** com "bloco em página nova": Montar, Usar, Limpar, Problema começam cada um em página própria; páginas extras vão para o bloco mais longo.
8. Visualizador em **375 px** e em **iPad** (largura 820): sem scroll horizontal da página; setas e "pág. 1/2" funcionam; zoom + / − / ajustar; botões ≥ 44 px; fechar volta ao conteúdo sem recarregar. Sem nova aba/janela em nenhum momento.
9. **Salvar PDF**: no desktop baixa `HIG-001-v3-cartaz.pdf` (abrir o arquivo e conferir que é o formato/páginas escolhidos); no iPad abre a folha de compartilhar com o arquivo.
10. **Imprimir**: abre o diálogo do navegador com as N páginas A4 sem o app por baixo; ao cancelar/terminar o app volta inteiro; botão só habilita quando pronto. Texto do limite do iPad aparece em iOS.
11. Erro de rede/servidor: mensagem em português simples, botão continua utilizável.
12. Regressão: "Imprimir A4" e "QR code" funcionam como antes; abas Versões/Quem treinou/Execuções; editor do conteúdo; tablet abre conteúdo normalmente.
13. `npm run build` do frontend passa; chunk principal sem pdfjs; worker presente em `dist/assets`.
14. Pós-deploy (gerente/QA em produção): gerar o PDF de um conteúdo real **com foto** (prova a leitura do volume e do `sharp` no container) e abrir no iPad.
15. Clippy: `backend/manuais/abas/como-fazer.md` atualizado; novidade `novidade-pdf-pop.html` + `novidades.json` publicados.

Revisor confere: ausência de `window.open`/iframe; `exigirPermissao` com as duas permissões; nenhum `fotoSugerida` vazando fora do PDF de gestão; `sharp` só no serviço novo; sem escrita em disco; `limparTextoPdf` aplicado a todo texto; caminho de foto com `path.resolve` dentro de `RAIZ`; cleanup de `blob:` URLs e de canvases; `lazyComRetry` no import; sem `<select>` nativo.
