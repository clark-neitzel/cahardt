# Plano E3 — Etiquetas atuais (produto e caixas Kit Festa) pela impressão direta

Autor: arquiteto · 19/10/2026 · HEAD de partida: f7ab2bbc (>= fec437e8) · Porte: **GRANDE** (infra de impressão + schema + 3 telas + 2 linguagens de impressora; exige equipe completa e teste físico).

Base: `CONTRATO-E1.md`, `CONTRATO-E2.md`, `PLANO-ARQUITETO.md`. Tudo abaixo foi conferido no código real; o que depende de impressora física está marcado **[A VALIDAR NA ZEBRA]** e tem teste próprio no plano (nada é afirmado sem prova).

---

## 1. Entendimento do pedido

"A etiqueta dos produtos e do delivery já saindo na impressora certa" = as etiquetas que já existem (desenho aprovado, selos ANVISA, tabela nutricional, EAN, QR, frases do Kit Festa) passam a sair pela **fila de impressão direta** (E1/E2): o app manda para o servidor, o agente do PC da cozinha entrega os bytes crus à Zebra, **sem diálogo do navegador, sem escolher papel, sem escala**.

Interpretações adotadas:
- "Produto" = PCP → Etiquetas → Imprimir. São **dois** pontos de chamada do mesmo fluxo: `EtiquetaImprimir.jsx:66-69` (página) e `EtiquetasList.jsx:90-95` (`PrintModal`, o modal do card). Os dois chamam `imprimirEtiquetas()` de `EtiquetaLabel.jsx:16`. O pedido do gerente só citava o primeiro; o plano cobre os dois.
- "Delivery" = botão de etiquetas do card do kanban (`DeliveryKanban.jsx:157/266`) **e** o painel dentro do modal do pedido do Kit Festa (`AbaPedidos.jsx:268`). Ambos usam `PainelEtiquetas.jsx` — um componente só, uma mudança só.
- O desenho NÃO muda. O caminho antigo (`imprimirNaPagina`, `imprimirEtiquetas`) **fica** como "Imprimir pelo navegador" (reserva se o PC da cozinha estiver desligado).

---

## 2. Mapa do código atual (confirmado)

| Peça | Onde | Fato relevante |
|---|---|---|
| Impressão antiga do produto | `frontend/src/pages/PCP/EtiquetaLabel.jsx:16-97` (`imprimirEtiquetas`) | copia o `innerHTML` do preview para `#area-impressao`, `window.print()`. Cópias = `copies` divs `.pg`. Em pé: `rotate(90deg)`; deitada: sem giro (driver em paisagem gira). |
| Telas que imprimem produto | `EtiquetaImprimir.jsx:66-69`, `EtiquetasList.jsx:90-95` | `tamanho` (`p80`/`g120`) e layout vêm de `useFiltroSalvo('etiquetas:tamanho'/'etiquetas:modelo')` (default **p80**); orientação vem do cadastro (`ehDeitada(et)`). |
| Desenhos | `EtiquetaLabel.jsx:101` (clássico, 80×100 fixo), `EtiquetaLabelNova.jsx:73` (ANVISA), `EtiquetaLabelDeitada.jsx:134`; despachante `EtiquetaRender` (`EtiquetaLabelNova.jsx:~300`) | CSS inline em mm/pt; tamanho dos textos por **medição de layout** (`useAutoFit.js:38`, busca binária de `--fs`, `ResizeObserver`; `useAjusteNome` na deitada). Fontes: Arial/Manrope/**Oswald (Google Fonts via index.html:18, não é self-host)**. |
| Código de barras | `EtiquetaLabelNova.jsx:92-127`, `EtiquetaLabelDeitada.jsx:141-165`, `EtiquetaLabel.jsx:94-111` | **JsBarcode em SVG**, EAN13 (cai em CODE128). Módulo = `width` 1 px (sm) ou 1,2 px (g) CSS = 2,1 / 2,54 dots a 203 dpi — **não inteiro**. Valor = `et.codigoBarras` (vem de `Produto.ean`, `resolverCodigoBarras` em `backend/routes/pcpEtiquetaRoutes.js`). |
| Caixas Kit Festa | `frontend/src/pages/KitFesta/etiquetasCaixas.js` (`montarEtiquetas` → `{estilos, corpo, total}`), `PainelEtiquetas.jsx:23-30` (`imprimirNaPagina`) | HTML string com `#area-impressao .etq` (40×25 mm), 2 por `.pag` (84 mm). Texto com tamanho medido por `canvas.measureText`. Fontes self-host (Fredoka, Caveat, Lora; `index.css:6-9`), pré-carregadas por `precarregarFontesEtiqueta`. **QR = SVG inline** do pacote `qrcode` (`AbaPedidos.jsx:158`, `DeliveryKanban.jsx:151`), `errorCorrectionLevel:'M'`, `margin:0`, 12,5×12,5 mm. |
| Quem vê os botões | Produto: rota `/pcp/etiquetas` + backend `pcp.etiquetas`. Kit Festa: `kitFesta` (`kitFestaRoutes.js:25`). Delivery: `deliveryService.permissaoDoUsuario(user).podeVer` (`deliveryService.js:88`) — **tabela própria `DeliveryPermissao`, não é a flag `kitFesta`**. | Quem imprime no Delivery pode NÃO ter `pcp.etiquetas` nem `kitFesta`. |
| Fila | `impressaoService.enfileirar` (`impressaoService.js:113`); `conteudo` é `Bytes`, `copias` só serve de tempo de espera no agente (`agente.ps1:~380`) — **cópias têm que estar DENTRO dos bytes** (`^PQ` / `P n`) | Agente entrega até 2 trabalhos por ciclo (`LOTE_MAX=2`) em base64 (`impressaoService.js:~171`). |
| Rotas de impressão | `impressaoRoutes.js:116` `GET /impressoras` e `:251` `GET /trabalhos/:id` exigem `admin \|\| pcp.etiquetas` | Kit Festa/Delivery **sem** `pcp.etiquetas` tomariam 403. `/trabalhos/:id` já restringe ao dono do trabalho (`solicitadoPorId`), então o requisito de flag é redundante para esse caso. |
| Geradores | `etiquetaCozinhaRender.js` (EPL2 2 colunas: `q672`, `Q200,24`, colunas em x=16/352 de `ajustes.col1X/col2X`, `offsetX/Y`; ZPL `^PW800^LL960`, `~SD`) | Funções puras com testes em `backend/tests/etiquetaCozinhaRender.test.js`. |
| Limite de corpo | `backend/index.js:113` `express.json()` (padrão **100 KB**) montado **antes** de `/api/impressao` (`:214`). nginx do front: `client_max_body_size 50m` (`frontend/Dockerfile:31`) | Bitmap cru de 800×960 em base64 = 128 KB → **estoura o 100 KB global**. |
| Dependências | `frontend/package.json`: `jsbarcode`, `qrcode` já existem; **não há** html2canvas/html-to-image. `backend/package.json`: sem puppeteer, sharp, canvas, pngjs. Imagem Docker do backend é `node:20-alpine` (`backend/Dockerfile`). | |

---

## 3. Decisão de abordagem

### 3.1 Como gerar o desenho 1-bit — alternativas avaliadas

| # | Alternativa | Prós | Contras | Veredito |
|---|---|---|---|---|
| A | **Navegador rasteriza o DOM atual (html2canvas) → bitmap 1-bit 8 dots/mm → servidor embrulha em ZPL/EPL2** | Reaproveita 100% dos 3 desenhos + auto-fit + Kit Festa; zero Chrome no servidor; sai do mesmo estado que o usuário vê | Fidelidade do html2canvas (fontes, `tabular-nums`, hairlines) precisa ser PROVADA; lib não mantida desde 2022; Safari/iPad precisa de teste | **RECOMENDADA, com spike obrigatório (E3-0)** |
| B | SVG `foreignObject` → `<img>` → canvas (`html-to-image`) | Motor do próprio navegador faz o layout | Fontes têm de ser embutidas em base64; Safari/WebKit tem histórico de `foreignObject` tainting/render em branco no canvas — risco no iPad | **Plano B** se o spike falhar no Safari |
| C | Puppeteer/Chromium no servidor | Fidelidade do Chrome | Alpine + Chromium (>300 MB, RAM em banco/servidor compartilhado), a etiqueta depende de hooks React/auto-fit → o servidor teria de abrir o frontend autenticado | **Descartada** |
| D | Reescrever em ZPL/EPL nativo | Nítido, leve, sem raster | Tabela nutricional com quebra de linha variável, selos, auto-fit por medição de layout, 3 layouts + 2 tamanhos de rótulo = reimplementar o motor de layout e re-aprovar todo o visual | **Descartada para E3** (futuro, se o dono quiser 100% nativo) |
| E | Desenhar direto em `<canvas>` | Controle total | Mesmo custo de D, mas com texto pior | **Descartada** |

**Decisão:** A, com **sobreposição de código de barras e QR em módulos inteiros** (ver 3.2). O gerente propôs a abordagem certa; os dois ajustes que ele pediu para decidir estão resolvidos abaixo.

### 3.2 Código de barras e QR: compor NO bitmap com módulo inteiro (não `^BEN`)

- Problema real: hoje o módulo do EAN é 2,1 dots (sm) ou 2,54 dots (g). Rasterizar o SVG nesse tamanho dá barras de 2/3 dots irregulares. Escalar o DOM por 2,1167 não resolve (as bordas caem em posição fracionária e o limiar arredonda cada aresta).
- **Solução:** o rasterizador captura a etiqueta com o `<svg>` do EAN **escondido mas ocupando o mesmo espaço** (`data-raster="ean"`), mede a caixa dele em dots (`Math.round`) e **pinta por cima** as barras direto em pixels: `bits = JsBarcode({}, valor, {format})` no modo "objeto" devolve `encodings[0].data` (string de 0/1 por módulo, 95 módulos no EAN13) → cada módulo vira **N dots exatos**. Dígitos legíveis: `fillText` bold no canvas logo abaixo (fonte Arial ~ 8 dots de altura de x). Depois disso o bitmap é impresso 1:1 (1 bit = 1 dot) — não há mais reamostragem em nenhum ponto.
- **Módulo:** 3 dots (0,37 mm, 112% do nominal EAN; seguro p/ leitor) quando a caixa reservada comporta (95×3 = 285 dots = 35,6 mm + zonas de silêncio 11+7 módulos); senão **2 dots (0,25 mm, mínimo prático)**; abaixo disso não imprime direto (aviso). Regra única numa função `moduloEan(larguraDisponivelDots)`.
- Por que não `^BEN` nativo: só serve no ZPL (a TLP/EPL2 não precisa de EAN, mas o QR sim), não é pré-visualizável, o texto legível usa outra fonte, só aceita EAN13 válido (o fallback CODE128 do código atual exigiria `^BC`), e exige coordenadas separadas do bitmap. Compor no bitmap dá o **mesmo resultado nas duas linguagens e é testável sem impressora** (decodificar o bitmap em teste).
- **Layout:** os componentes ganham a prop opcional `modoRaster` (default `false` → caminho antigo e preview idênticos, byte a byte). Em `modoRaster` o JsBarcode usa `width = módulo*96/203` px e `displayValue:false`, reservando no layout a largura/altura final do código + zona de silêncio; o resto do layout (auto-fit) acomoda. Se o EAN de 3 dots não couber no rodapé do layout `sm`/`g`, **o dev-frontend reporta** (não encolhe sozinho para 1 dot).
- **QR do Kit Festa:** `QRCode.create(LINK,{errorCorrectionLevel:'M'}).modules` → versão 3 = **29×29 módulos** (38 caracteres cabem em V3-M). Caixa de 12,5 mm = 100 dots → módulo de **3 dots** (87 dots = 10,9 mm, centralizado na caixa; 4 dots = 116 não cabe). Mesmo mecanismo de sobreposição (`data-raster="qr"`), zona de silêncio é o branco ao redor (conferir ≥ 4 módulos = 12 dots no spike).

### 3.3 Parâmetros do rasterizador (constantes numa só função, `etiquetaRaster.js`)

- Escala **exata 8 dots/mm**: `scale = 8 / (96/25.4) = 2,116667` no `html2canvas`; ao final copiar para um canvas **novo de tamanho exato** (800×960 / 960×800 / 320×200) — nunca confiar no tamanho que a lib devolve (arredonda 799/800).
- Fundo branco sólido; `foreignObjectRendering:false`; `logging:false`; `useCORS` desnecessário (sem imagem externa).
- **Limiar sem dithering:** luminância (sobre branco) `< 160` => preto. 160 (e não 128) de propósito: linhas de 0,25–0,4 pt (0,7–1,1 dot) saem de 1–2 dots em vez de sumir. Selos pretos sólidos e texto branco sobre preto passam pelo mesmo limiar. **Constante `LIMIAR`, ajustada no spike** olhando lado a lado com a etiqueta antiga.
- Se o spike mostrar letra quebrada: super-amostrar (capturar a 2× = 16 dots/mm e reduzir por média de área antes do limiar). Só entra se necessário.
- Esperar antes de capturar: `await document.fonts.load()` das famílias usadas + `document.fonts.ready` + 2 `requestAnimationFrame` + **estabilização do auto-fit** (ler `--fs` do bloco até repetir em 2 frames seguidos; teto de 2 s). Sem isso o 1º clique captura o ajuste ainda em andamento.
- Instância de captura **fora do preview** (o preview tem `transform: scale`): montar com `createRoot` num contêiner `position:fixed; left:0; top:0; z-index:-1; pointer-events:none`, tamanho exato em mm, sem `transform/zoom`, e desmontar ao fim (não usar `left:-10000px` se o html2canvas recortar — conferir no spike).
- Kit Festa: renderizar as etiquetas **em lote numa só passada** (uma célula de 40×25 mm por linha, até 20 por passada) e fatiar o canvas em tiras de 200 dots (25 mm × 8 = 200 exatos). Evita 60 capturas de ~100 ms.
- `import('html2canvas')` dinâmico no clique (não entra no bundle inicial). Falha de chunk após deploy => toast "Atualize a página" (mesma lógica do `lazyComRetry`).

### 3.4 Rotação / tamanhos

| Caso | Desenhado | Bitmap enviado | Observação |
|---|---|---|---|
| g120 EM_PE | 100×120 mm | 800×960, **sem girar** | já provado: `^PW800 ^LL960` sai em pé no feed de 100 mm |
| g120 DEITADA | 120×100 mm | gira 90° no cliente → 800×960 | **[A VALIDAR NA ZEBRA]** o sentido (hoje quem gira é o driver em paisagem; a conta indica anti-horário). Constante `GIRO_DEITADA`; o teste físico com seta decide e compara com a etiqueta antiga já impressa |
| p80 (80×100) | — | — | **Não existe impressora para esse rolo.** Decisão abaixo |
| Kit Festa | 40×25 mm por etiqueta | 320×200 cada | duas colunas montadas no servidor |

**p80:** o cadastro de impressora só aceita `'40x25' | '100x120'` (`impressaoRoutes.js:28`), e o rolo atual da cozinha é 100×120. Decisão de menor atrito: com `p80` selecionado o botão "Imprimir na Zebra" fica desabilitado com a frase "Não há impressora de rolo 80×100 cadastrada" **e** um botão de um toque "Usar 100×120" (troca `tamanho`, que o app já lembra). NÃO imprimir um 80×100 num canto do 100×120 (é exatamente o bug de 08/2026 descrito em `etiquetaModelos.js:75`). O caminho do navegador segue servindo p80. Quando chegar o rolo 80×100: adicionar `'80x100'` à lista `TAMANHOS` da rota de impressoras e ao validador do novo endpoint (640×800 dots) — o resto já é genérico por largura/altura.

### 3.5 Como o bitmap trafega e vira comando

- **Formato canônico do contrato:** linhas de cima para baixo, **MSB = pixel mais à esquerda, bit 1 = preto**, `bytesPorLinha = ceil(largura/8)` (800 -> 100; 320 -> 40), bits de sobra = 0 (branco). Tamanho exato = `bytesPorLinha × altura` (96.000 B no 100×120; 8.000 B por etiqueta 40×25).
- **Compressão no cliente:** `CompressionStream('deflate')` (formato zlib; Safari >= 16.4, Chrome >= 80) -> ~5–15 KB por etiqueta grande, ~1–2 KB por pequena. Sem suporte: envia `RAW` (128 KB / 11 KB em base64) — o servidor aceita os dois, por isso o limite do corpo é de 4 MB.
- **Servidor valida e re-empacota** (nunca confia): `zlib.inflateSync(buf,{maxOutputLength: esperado})`, exige tamanho exato, dims exatas para o tamanho da impressora (`100x120` => 800×960; `40x25` => 320×200; DPI da impressora = 203, senão 409; `rotacao` != 0 => 409 "impressora com rotação não suportada para etiqueta em imagem").

**ZPL (100×120) — `^GFA`:**
```
^XA
^CI28
^PW800
^LL960
^LH0,0
~SD<densidade>                  <- só se ajustes.densidade (igual renderZplGrande)
^FO<offsetX>,<offsetY>^GFA,96000,96000,100,:Z64:<base64 do zlib>:<CRC4hex>^FS
^PQ<copias>,0,1,N
^XZ
```
- Os dois contadores = bytes **descomprimidos** (96000); 100 = bytes por linha. `:Z64:` = zlib em base64; CRC = CRC-16/XMODEM (poli 0x1021, init 0x0000) calculado sobre a **string base64**; vetor de teste `CRC("123456789") = 31C3`. Linha única (sem quebrar o base64).
- `^PQ n` carrega as cópias (limite 1..999, igual à tela). `chaveIdempotencia` evita job duplo.
- **[A VALIDAR NA ZEBRA]** firmware aceita `:Z64:` + CRC. Reserva já prevista: `appConfig` `impressao_gf_compressao` = `Z64` (padrão) ou `HEX` (`^GFA` com 192 KB de hexa ASCII, sem compressão, aceito por qualquer firmware ZPL II). Trocar a chave não exige deploy.

**EPL2 (40×25, 2 colunas) — `GW`:** cada etiqueta de 320×200 vira um `GW` (40 bytes × 200 linhas = 8.000 B). Não precisa montar linha de 672: dois `GW` no mesmo formulário.
```
\n
N
q672
Q200,24
D8
S2
ZT                              <- mesmo cabeçalho de renderEpl2Pequena (colunas, gap, densidade, velocidade, larguraRoloMm vêm do cadastro)
N
GW<col1X+offsetX>,<offsetY>,40,200,<8000 bytes crus>\n
GW<col2X+offsetX>,<offsetY>,40,200,<8000 bytes crus>\n
P1
N
...                              <- próximo par
```
- Sequência do Kit Festa (sabor × N + etiqueta do pedido a cada N caixas) é cortada de 2 em 2: (0,1), (2,3)...; **ímpar => último formulário só com col1** (coluna 2 fica em branco), igual ao `.pag` de 1 etiqueta do caminho antigo. Defaults x=16 e x=352 (múltiplos de 8; ajustes calibrados continuam valendo).
- **Polaridade:** o formato canônico é "1 = preto". No EPL2 a polaridade do `GW` é o inverso do ZPL em boa parte das referências, mas **isso não está no repositório e não deve ser presumido: [A VALIDAR NA ZEBRA]** com o teste de polaridade (quadrado preto + seta). Constante única `EPL2_GW_BIT_PRETO` (0 ou 1) no gerador; o teste decide e o `BITMAP_TESTE` (abaixo) permite repetir sem mexer no app.
- Limite por trabalho: **40 formulários (80 etiquetas, ~672 KB)**; acima disso o servidor divide em até 3 trabalhos (240 etiquetas) e responde com a lista de ids; mais que isso => 400 (a tela já avisa acima de 60).

### 3.6 Uma rota nova com permissão por ponto de uso (NÃO abrir `/api/impressao`)

Novo roteador **`/api/impressao/etiquetas`** (`backend/routes/impressaoEtiquetasRoutes.js`), montado em `index.js` **antes** de `app.use(express.json())` (linha 113) para ter parser próprio:
```js
app.use('/api/impressao/etiquetas', express.json({ limit: '4mb' }), authMiddleware, require('./routes/impressaoEtiquetasRoutes'));
```
(o parser global pula corpo já lido; conferir que `authMiddleware` — definido na linha 91 — já existe nesse ponto). A ordem em relação à linha 214 (`/api/impressao`) não importa porque o prefixo é mais específico e vem antes.

Permissão **por `origem`** declarada no corpo e resolvida no servidor (nunca pela UI):

| `origem` | Tamanho de impressora | Quem pode (backend) | Espelho no front |
|---|---|---|---|
| `PRODUTO` | `100x120` | `admin \|\| pcp.etiquetas` (flag do OBJETO: `!!p.pcp?.etiquetas`, nunca `!!p.pcp`) | mesma tela que já exige `pcp.etiquetas` |
| `KIT_FESTA` | `40x25` | `admin \|\| kitFesta` (igual `kitFestaRoutes.js:25`) | tela com `kitFesta` |
| `DELIVERY` | `40x25` | `deliveryService.permissaoDoUsuario(user).podeVer` | tela do kanban |

Endpoints:
1. `GET /api/impressao/etiquetas/impressoras?origem=` — impressoras **ativas** do tamanho da origem, `{id,nome,tamanho,colunas,estadoAgente,estadoWindows}` (reusa `estadoWindowsDe` — hoje função privada de `impressaoRoutes.js:~108`; **exportar sem alterar comportamento**). Permite à tela mostrar "Etiqueta Grande · online" ou desabilitar o botão.
2. `POST /api/impressao/etiquetas` — corpo:
```json
{ "origem":"PRODUTO|KIT_FESTA|DELIVERY",
  "requisicaoId":"uuid 8..80 [A-Za-z0-9-]",
  "impressoraId":"opcional se só houver 1 ativa do tamanho",
  "referencia":{ "tipo":"ETIQUETA_PRODUTO|PEDIDO", "id":"...", "rotulo":"COXINHA FRANGO · fab 19/10" },
  "copias": 1,
  "bitmaps":[ {"larguraDots":800,"alturaDots":960,"formato":"ZLIB|RAW","dados":"<base64>"} ],
  "sequencia":[0,0,1,2]            // só KIT_FESTA/DELIVERY: ordem de impressão (índices em bitmaps); PRODUTO usa "copias"
}
```
   Resposta `201` (ou `200` + `repetido:true` se a `requisicaoId` já existia): `{ trabalhos:[{id,status}], totalEtiquetas, agente:{estado}, aviso?, repetido? }`. Erros em português: 400 validação, 403 sem permissão da origem, 409 sem impressora ativa do tamanho / rotação / DPI, 413 acima de 4 MB.
   - `chaveIdempotencia = "etq-<origem>-<requisicaoId>-<n>"` (n = índice do trabalho). Retry usa a mesma `requisicaoId`; clique novo = id novo (igual à cozinha).
   - Grava `tipo = 'ETIQUETA_PRODUTO' | 'CAIXA_KIT_FESTA'` (DELIVERY também usa `CAIXA_KIT_FESTA`) e **`referencia`** (coluna nova abaixo) + `solicitadoPor`.
3. `POST /api/impressao/etiquetas/trabalhos/:id/cancelar` — dono do trabalho (ou admin) cancela se ainda `PENDENTE`. Necessário para o fallback seguro: o usuário vê "PC desligado, fica na fila 15 min", resolve imprimir pelo navegador e **cancela antes** para a etiqueta não sair em dobro quando o PC voltar.
4. **Ajuste em rota existente:** `GET /api/impressao/trabalhos/:id` (`impressaoRoutes.js:251`) hoje barra quem não tem `pcp.etiquetas`. Trocar a regra para "admin **ou** dono do trabalho (`solicitadoPorId`)" — a checagem de dono que já existe na linha seguinte já é a proteção real. Sem isso, quem imprime caixas só com `kitFesta`/Delivery nunca conseguiria acompanhar o trabalho.

Schema (aditivo, `prisma db push` seguro): `ImpressaoTrabalho.referencia String? @map("referencia")` (texto livre ≤ 200). Nenhum campo removido. A tela Configurações → Impressoras → Fila passa a mostrar `tipo` amigável e `referencia` (o dev-frontend grepa onde a fila é desenhada; `SEM_CONTEUDO` em `impressaoRoutes.js:~228` ganha `referencia: true`).

### 3.7 Teste de impressão novo (prova sem tocar nas telas)

Em `POST /api/impressao/impressoras/:id/teste` (admin) acrescentar `tipo: 'BITMAP_TESTE'` (opcional `compressao:'Z64'|'HEX'`). O servidor gera um bitmap de teste **assimétrico** (moldura de 1 dot a 2 mm da borda; quadrado preto sólido 10 mm no canto superior esquerdo; seta/“F” grande; EAN-13 fixo `7891234567895` com módulo de 3 dots e outro de 2 dots; QR de teste de 29 módulos a 3 dots) e o manda pelo MESMO empacotador de produção (ZPL ou EPL2 conforme a impressora). É a prova de: polaridade EPL2, aceitação de `:Z64:`, sentido do giro, alinhamento (`offsetX/Y`), nitidez e leitura do EAN/QR — **antes** de qualquer tela mudar.

---

## 4. Fatiamento

- **E3-0 (spike, front, ~meio dia, bloqueia o resto):** página oculta de admin que rasteriza as etiquetas reais e mostra o bitmap 1-bit ao lado do preview. Responde: html2canvas é fiel (fontes, tabela, selos, hairlines)? funciona no Safari/iPad? quanto demora? Reprova => Plano B (`html-to-image`) ou renegociar.
- **E3-1 (backend único):** schema + empacotadores ZPL/EPL2 + rotas + `BITMAP_TESTE` + testes. Serve às duas fatias. Termina com o **teste físico `BITMAP_TESTE` nas duas Zebras** (cozinha) — gate para as telas.
- **E3a — etiqueta de produto (grande/ZPL):** núcleo do rasterizador + botão nas 2 telas de produto.
- **E3b — caixas Kit Festa/Delivery (pequena/EPL2):** reaproveita o núcleo; só `PainelEtiquetas`.
- **Fazer junto?** Backend, núcleo do rasterizador e spike: **uma vez só**. As duas telas: **publicar E3a primeiro** e E3b em seguida (mesmo dia se a polaridade EPL2 passar no teste; E3b não deve atrasar E3a — o ZPL já tem o teste de 16/10 provado). Um único `deployMarker` por publicação.

---

## 5. Plano de execução numerado

### dev-frontend — E3-0 (spike)
1. `npm i html2canvas@1.4.1` (frontend).
2. Criar `frontend/src/pages/PCP/etiquetaRaster.js` (esboço) e rota/página admin escondida `/pcp/etiquetas/teste-raster` (ou botão atrás de `?rasterDebug=1` no `EtiquetaImprimir`): rasteriza a etiqueta aberta e mostra o 1-bit em tamanho real, com botão "baixar PNG".
3. Rodar as 3 combinações de desenho (clássico, ANVISA, deitada) × g120 (+ p80 só para olhar) e as 2 etiquetas do Kit Festa. Comparar com a impressão antiga (PDF/PNG do print do Chrome). Registrar evidência em `docs/etiquetas-cozinha/evidencias-e3/`. **Resultado go/no-go** vai para o arquiteto/gerente antes do passo 7.

### dev-backend — E3-1
4. `backend/prisma/schema.prisma`: adicionar `referencia String? @map("referencia")` em `ImpressaoTrabalho`. Não remover nada. (`npx prisma validate`.)
5. `backend/services/etiquetaBitmapRender.js` (novo, funções puras): `desempacotar(bitmap)` (zlib/raw + validação), `crc16Xmodem`, `renderZplImagem({bitmap, copias, impressora, compressao})`, `renderEpl2Imagem({bitmaps, sequencia, impressora})` (cabeçalho idêntico ao de `renderEpl2Pequena`: expor, **sem alterar**, uma função auxiliar `parametrosEpl2(impressora)` em `etiquetaCozinhaRender.js`), `gerarBitmapTeste()`. Constante `EPL2_GW_BIT_PRETO`. Testes `backend/tests/etiquetaBitmapRender.test.js` (node:test): empacotamento MSB/1=preto, vetor CRC `31C3`, cabeçalho `^GFA,96000,96000,100,:Z64:`, round-trip inflate, EPL2 com 1/2/3 etiquetas (par, ímpar com col1 só, `P1` por formulário, `GW16,..`/`GW352,..`), recusa de dimensões erradas, recusa de bomba zip (`maxOutputLength`), divisão em jobs.
6. `backend/routes/impressaoEtiquetasRoutes.js` (novo) + montagem em `backend/index.js` antes da linha 113 (ver 3.6); permissão por origem; `GET /impressoras`, `POST /`, `POST /trabalhos/:id/cancelar`; chave de idempotência; leitura de `appConfig impressao_gf_compressao`. Ajustar `GET /api/impressao/trabalhos/:id` (dono ou admin) e incluir `BITMAP_TESTE` em `TIPOS_TESTE` (`impressaoRoutes.js:29`, `:211`). Incluir `referencia` em `SEM_CONTEUDO`. Bumpar `deployMarker` do `/admin-exec/ping`.
7. Teste local contra o banco `hardt_local`: curl do `POST` com bitmap de teste nas 3 origens (com e sem permissão => 403), reenvio com mesma `requisicaoId` => 200/`repetido:true`, corpo > 4 MB => 413. **Teste físico:** `BITMAP_TESTE` na "Etiqueta Grande" (ZPL; Z64 e HEX) e na "Etiqueta Pequena" (EPL2; polaridade). Dono/cozinha confirma; fotos como evidência.

### dev-frontend — núcleo (após go do spike e do passo 7)
8. `frontend/src/pages/PCP/etiquetaRaster.js` (final): `rasterizarEtiquetas({ elementosOuHtml, larguraMm, alturaMm, ... })` => bitmaps 1-bit packed (`Uint8Array`) por etiqueta; espera de fontes/auto-fit; limiar; sobreposição de EAN/QR (3.2); giro da deitada; empacotamento MSB; `zlib` via `CompressionStream` com fallback RAW; dedupe por hash (Kit Festa); lote de até 20 por passada.
9. Prop `modoRaster` (default false) em `EtiquetaLabel.jsx`, `EtiquetaLabelNova.jsx`, `EtiquetaLabelDeitada.jsx` + passagem pelo `EtiquetaRender`: JsBarcode com `width = módulo*96/203` e `displayValue:false`, `svg data-raster="ean"`. **Com `modoRaster` falso nada muda** (conferir por diff do DOM do preview).
10. `frontend/src/services/impressaoEtiquetasService.js` (axios: `impressoras(origem)`, `enviar(payload)`, `cancelar(id)`; `obterTrabalho` já existe em `impressaoService`).
11. `frontend/src/pages/PCP/useEnvioBitmap.js`: cópia enxuta de `cozinha/useEnvioEtiqueta.js` (trava síncrona `postando`, `requisicaoId` por intenção, retry com a MESMA id, polling 1,5 s/5 s, fases `ocioso/preparando/enviando/fila/imprimindo/saiu/erro`; acompanha **todos** os trabalhos devolvidos e mostra o pior estado). **Não alterar o hook da cozinha** (está provado em produção); unificar fica para depois.

### dev-frontend — E3a (produto)
12. Componente `ImprimirDireto.jsx` (PCP): chip da impressora ("Etiqueta Grande · online/offline" via `GET .../impressoras?origem=PRODUTO`), botão primário **"Imprimir na Zebra"** (pílula, 44 px no mobile) com estados "Preparando… → Na fila → Imprimindo… → Saiu"; botão secundário **"Imprimir pelo navegador"** = chamada atual de `imprimirEtiquetas(...)` inalterada. Em `p80`: desabilitado + "Usar 100×120". Erro/fila longa: mostrar "Tentar de novo" e, se o trabalho está pendente, **"Cancelar e imprimir pelo navegador"** (chama o cancelar antes). Aplicar em `EtiquetaImprimir.jsx` (substitui o botão da linha ~119) e em `EtiquetasList.jsx` `PrintModal`.
13. Ao enviar: renderizar a instância `modoRaster` do `EtiquetaRender` com o mesmo `et/dataFab/dataVal/tamanho/layout`, gerar 1 bitmap, `copias` = campo Cópias, `referencia = { tipo:'ETIQUETA_PRODUTO', id: et.id, rotulo }`.

### dev-frontend — E3b (caixas)
14. `PainelEtiquetas.jsx`: mesmo par de botões; no modo direto ignora a caixa "Rolo de 2 colunas" (usa `colunas` da impressora e mostra "Etiqueta Pequena · 2 colunas") e continua usando `sequenciaEtiquetas`/`montarEtiquetas` para montar o HTML (trocando `#area-impressao` por um id de captura via `replaceAll` no `estilos`, sem alterar `etiquetasCaixas.js`). Confirmação > 60 etiquetas mantida. Origem `KIT_FESTA` no modal do pedido, `DELIVERY` no card (prop nova `origem` em `PainelEtiquetas`; `AbaPedidos` e `DeliveryKanban` passam).
15. QR: usar a matriz de `QRCode.create` (o `qrSvg` string continua só para o caminho antigo).

### Fechamento (dev-frontend + dev-backend)
16. Manuais/Clippy: atualizar `backend/manuais/abas/` das abas PCP Etiquetas, Kit Festa, Delivery e Configurações → Impressoras (fila com `referencia`); `copilotoService` só se rota/permissão de aba mudou (não muda). Novidade `frontend/public/novidade-etiquetas-direto.html` (mockups com legendas, accordions abertos, sem `og:image`, sem botão "Abrir o app") + entrada no topo de `novidades.json`.
17. `cd frontend && npm run build` e `cd backend && npm test`.

---

## 6. Riscos e efeitos colaterais (varridos no repositório)

1. **Fidelidade do html2canvas** (principal). Pontos já identificados no código: `fontVariantNumeric: 'tabular-nums'` (Manrope, `EtiquetaLabelDeitada.jsx:191/:208`) e `letter-spacing` são tratados de forma limitada => números da tabela podem deslocar ~1 dot; Oswald vem do Google Fonts (CDN) — se estiver offline cai em Arial Narrow, **no caminho antigo também**; emoji `❄` (clássico) vira cinza => limiar decide. O spike prova ou reprova.
2. **Auto-fit/hairlines/quebra de linha**: o DOM é medido na resolução de 96 dpi e desenhado a 2,1167×; larguras de linha de texto podem diferir <1% e empurrar uma palavra para a linha seguinte. Mitigação: a folga de 2% do `useAutoFit` + conferência lado a lado; super-amostragem 2× se preciso.
3. **Safari/iPad** (usado na cozinha): html2canvas costuma funcionar; `CompressionStream` exige iOS >= 16.4 (há RAW de reserva); limite de canvas do iOS ~16,7 MP (o maior é 960×800 = 0,77 MP, ok; em lote do Kit Festa o limite de 20 por passada mantém 320×4000).
4. **Polaridade EPL2, Z64+CRC, giro da deitada, offsets** — só a Zebra confirma. Cada um tem constante única e o `BITMAP_TESTE`; nenhum vai para a tela antes do teste físico.
5. **Impressão crua ignora o driver**: some a classe de bug do "papel divergente" (08/2026), mas também somem as margens/offset do driver Windows. Alinhamento só por `ajustes.offsetX/Y` e `^LH`. Se a etiqueta sair deslocada, calibra-se no cadastro da impressora (como na cozinha), não no app.
6. **Duplicidade no fallback**: usuário clica "Zebra", PC desligado, imprime pelo navegador, PC liga e a fila libera a antiga. Mitigação: "Cancelar e imprimir pelo navegador" (item 3.6.3) + aviso "a etiqueta fica na fila por 15 min" já existente no hook.
7. **Limite de corpo**: o `express.json()` global (100 KB) estouraria. Por isso o roteador novo é montado **antes** dele com limite próprio de 4 MB. Esquecer essa ordem => 413 só com etiqueta grande (o teste do passo 7 cobre).
8. **Permissão**: Delivery usa `DeliveryPermissao.podeVer` (não é a flag `kitFesta`). Se o dev usar `kitFesta` no Delivery, quem opera o kanban fica sem botão. Conferir com a regra de `deliveryService.permissaoDoUsuario`. Lembrar que permissões são OBJETO (`!!perms.pcp` libera somente-leitura).
9. **Peso**: 80 etiquetas EPL2 = ~672 KB num job (bytea + base64 na sync do agente). Aceitável com `LOTE_MAX=2`; por isso o teto de 40 formulários por trabalho.
10. **Consumidores do que muda** (grep feito):
    - `imprimirEtiquetas` / `EtiquetaLabel` / `EtiquetaRender`: usados só em `EtiquetaImprimir.jsx`, `EtiquetasList.jsx`, e pelos próprios componentes de layout (grep em `frontend/src`; não há import dinâmico para eles). A prop `modoRaster` é opcional e default `false`.
    - `montarEtiquetas`/`PainelEtiquetas`/`pedidoDoDelivery`: `AbaPedidos.jsx`, `DeliveryKanban.jsx`, `PainelEtiquetas.jsx` — sem outros consumidores.
    - `GET /api/impressao/trabalhos/:id`: consumido por `impressaoService.obterTrabalho` (front) e pela cozinha (`useEnvioEtiqueta`). Afrouxar para "dono ou admin" não quebra a cozinha (ela já é o dono).
    - `etiquetaCozinhaRender.js`: só ganha um export auxiliar; testes existentes (`etiquetaCozinhaRender.test.js`) têm que continuar passando sem edição.
    - Tela da fila (Configurações → Impressoras): ganha coluna `referencia` e rótulos novos de `tipo`; confirmar que ela não tem `switch` fechado nos tipos.
11. **Efeito colateral zero em áreas sensíveis**: o plano não toca NF-e, WhatsApp, API `/api/ia-consulta/v1`, financeiro, uploads (nada é gravado em disco; o bitmap vive no banco como a fila já faz) nem `$transaction` (nenhuma é necessária: `enfileirar` já é create único com idempotência pela chave `@unique`; se o dev criar vários trabalhos de uma requisição, **não** envolver em transação longa — criar em sequência com chaves `...-0/-1/-2`, que são idempotentes).

---

## 7. Pontos de verificação

**QA (clicando de verdade, app local + Chrome via puppeteer; depois iPad em produção):**
1. PCP → Etiquetas → card → Imprimir: botão "Imprimir na Zebra" visível; chip da impressora com estado; 2 cópias => 1 trabalho na fila com `copias=2` e `^PQ2`. Confirmar em Configurações → Impressoras → Fila: tipo `ETIQUETA_PRODUTO`, referência com o nome do produto, quem pediu.
2. Mesma ação em `EtiquetaImprimir` (página) — mesma saída.
3. Os 3 desenhos (clássico, ANVISA com selos, deitada) com produtos de texto curto e de texto longo (auto-fit nos dois extremos): conferir pelo PNG do bitmap (`?rasterDebug=1`) que nada ficou cortado.
4. `p80` selecionado: botão desabilitado + "Usar 100×120" funciona em um toque; "Imprimir pelo navegador" continua abrindo o diálogo como antes.
5. Kit Festa (modal do pedido) e Delivery (card): "Imprimir na Zebra" cria o(s) trabalho(s); N ímpar deixa a 2ª coluna vazia no último formulário; > 60 pede confirmação; usuário SÓ com Delivery (sem `pcp.etiquetas`, sem `kitFesta`) consegue enviar e acompanhar; usuário sem nenhuma das três => 403 no curl.
6. Clique duplo rápido => 1 trabalho (checar fila). Queda de rede no envio + "Tentar de novo" => 1 trabalho (`repetido`). Agente desligado => aviso "fica na fila 15 min" e botão "Cancelar e imprimir pelo navegador" cancela de verdade (status `CANCELADO`).
7. Mobile 375 px sem rolagem horizontal; botões >= 44 px.
8. Erro real: impressora com a tampa aberta (a E1 já mostra a mensagem) => estado "erro" com texto humano.
9. Caminho antigo intacto: `imprimirEtiquetas` e `imprimirNaPagina` imprimem como antes (diff do DOM/estilo gerado idêntico ao do commit f7ab2bbc).

**Revisor:**
- `modoRaster=false` não altera nenhuma linha efetiva dos 3 componentes de layout (diff só em props/ramificação).
- Nenhuma `$transaction`, nenhum `window.open`/iframe novo, nenhum `fs`/disco novo; `express.json` do roteador novo montado antes do global.
- Permissão por origem no backend = o que o front mostra; flags de OBJETO.
- `enfileirar` sempre com `chaveIdempotencia`; `copias` dentro dos bytes; limites (4 MB, 40 formulários, 999 cópias, `maxOutputLength`).
- Nenhum campo removido do schema; `referencia` nullable.
- Hook da cozinha e `etiquetaCozinhaRender` sem mudança de comportamento (testes antigos verdes).
- Manuais/Clippy/novidade/`novidades.json`/`deployMarker`.

---

## 8. Critérios de aceite (todos precisam estar OK)

1. **Spike aprovado** e evidência arquivada (rasterização fiel das 3 combinações + 2 etiquetas do Kit Festa, também no Safari/iPad).
2. `BITMAP_TESTE` impresso nas duas Zebras: polaridade correta, sentido do giro da deitada definido, moldura a 2 mm das bordas, nada cortado.
3. Etiqueta de produto (g120, em pé e deitada) impressa pelo app no **iPad em produção** e **comparada lado a lado** com a mesma etiqueta pelo caminho antigo: mesmo texto, mesmos selos, tabela completa, nada cortado, sem deslocamento perceptível.
4. **EAN impresso é bipado** com o leitor do app (Ajuste de Estoque e Canhoto) e abre/identifica o produto certo — nas duas combinações de módulo que o layout permitir (3 dots; 2 dots se for o caso). Teste automático complementar: decodificar o próprio bitmap (zxing/jsQR só em teste) e comparar com `Produto.ean`.
5. **QR do Kit Festa lido com o celular** (câmera comum) a ~15 cm, abrindo `https://hardtsalgados.com.br/kit-festa`, nas etiquetas impressas na TLP 2844.
6. Caixas: sequência correta (sabor, sabor, ..., pedido a cada N), 2 colunas, ímpar com coluna vazia, frase girando por caixa como no caminho antigo.
7. Clique duplo e retry não duplicam etiqueta; fallback "Cancelar e imprimir pelo navegador" não gera etiqueta em dobro.
8. Usuário só-Delivery imprime caixas; usuário sem permissão recebe 403; `/api/impressao` geral continua admin/`pcp.etiquetas`.
9. Caminho antigo funcionando nas 3 telas; build do frontend e `npm test` do backend verdes; `prisma validate` ok.
10. Aparece na fila (Configurações → Impressoras → Fila) com tipo, referência e quem pediu.
11. Testado **em produção** pelo iPad depois do deploy (regra do CLAUDE.md para funcionalidade que depende do ambiente): backend no ar (`deployMarker` novo), front com o chunk novo, etiqueta saindo na Zebra da cozinha.

---

## 9. O que NÃO fazer

- **Não** remover nem trocar `imprimirEtiquetas`, `imprimirNaPagina`, `EtiquetaImprimir`/`PrintModal` do caminho navegador, nem `montarEtiquetas` (o desenho do Kit Festa é montado por ele nos dois caminhos).
- **Não** alterar o desenho/layout/medidas das etiquetas; `modoRaster` só troca o barcode/QR na captura. Nada de "melhorar" fonte ou espaçamento nesta tarefa.
- **Não** escalar o SVG do EAN com `transform`/`zoom` e rasterizar: o módulo precisa ser inteiro em dots (pintar por cima, 3.2). Nunca 1 dot por módulo.
- **Não** enviar PNG/JPEG para o servidor decodificar (cria dependência nativa no Alpine, cores/gama imprevisíveis); o contrato é bitmap 1-bit empacotado.
- **Não** usar dithering nem anti-aliasing no bitmap final; **não** deixar o `html2canvas` decidir o tamanho final do canvas.
- **Não** montar a instância de captura dentro do preview escalado (`transform: scale`).
- **Não** abrir `GET /api/impressao/impressoras`, `/fila`, `/agentes` etc. para quem não é admin/`pcp.etiquetas`; a permissão extra vale só no roteador novo, por `origem`.
- **Não** presumir polaridade do EPL2, aceitação de Z64 ou sentido do giro: são constantes validadas no teste físico.
- **Não** imprimir o 80×100 dentro do rolo 100×120 "no canto".
- **Não** gravar nada em disco no servidor (bitmap vive no `Bytes` da fila); **não** colocar o enfileiramento dentro de `$transaction`.
- **Não** retirar o limite de 15 min da fila nem a trava anti-clique-duplo; **não** gerar `requisicaoId` novo no "Tentar de novo".
- **Não** mexer em `useEnvioEtiqueta.js`, `etiquetaCozinhaRender.js` (além do export auxiliar aditivo) nem na E2 — está provada na cozinha.
- **Não** esquecer manuais/Clippy, `novidades.json` (sem `og:image`, sem link "Abrir o app") e `deployMarker`.

---

## 10. Notas de execução

- Equipe: arquiteto (este plano) -> dev-frontend (spike) -> gate go/no-go -> dev-backend -> **teste físico** -> dev-frontend (E3a, E3b) -> qa-testador + revisor-codigo em paralelo -> gerente-entrega. Modelo dos agentes: Sonnet explícito em cada chamada (memória do projeto); só o gerente-entrega usa o modelo caro.
- O que só o dono/cozinha consegue: ligar o PC, colocar a etiqueta, tirar foto do `BITMAP_TESTE` e do lado a lado; bipar o EAN; ler o QR com o celular.
- Pendências conscientes fora do E3: rolo 80×100 (cadastrar `'80x100'` quando chegar), unificar `useEnvioEtiqueta` com `useEnvioBitmap`, migração das cópias legadas de impressão (`window.open`) listadas no CLAUDE.md.
