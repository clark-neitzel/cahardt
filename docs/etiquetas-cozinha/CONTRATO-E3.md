# Contrato E3 (backend) — etiquetas atuais como IMAGEM pela fila

Base: `PLANO-E3-ETIQUETAS-ATUAIS.md` 3.5 a 3.7. Evidências: `evidencias-e3/` (curl, ZPL/EPL2 gerados, PNGs do bitmap de teste). Erros: `{ error }` em português. `deployMarker`: `etiquetas-imagem-e3-2026-10-19`.

## Formato do bitmap (vale para o corpo e para tudo que circula no servidor)
Linhas de cima para baixo, **MSB = pixel mais à esquerda, bit 1 = PRETO**, `bytesPorLinha = ceil(largura/8)`, bits de sobra = 0.
- Impressora `100x120` (ZPL): **800 x 960** dots, 100 bytes/linha, **96.000 bytes**.
- Impressora `40x25` (EPL2): **320 x 200** dots por etiqueta, 40 bytes/linha, **8.000 bytes**. (O servidor monta as 2 colunas.)
- Só 203 dpi e rotação 0 (senão `409`). Dimensão diferente da esperada para o tamanho da impressora = `400`.
- `formato: "ZLIB"` = base64 do **zlib deflate** (`CompressionStream('deflate')`), `"RAW"` = base64 dos bytes crus. O servidor descomprime com teto (`maxOutputLength` = tamanho esperado; bomba zip recusada) e exige tamanho exato.

## Rotas (montadas ANTES do `express.json()` global; parser próprio de 4 MB; JWT obrigatório — sem token `401` antes de ler o corpo)

### Permissão por `origem` (resolvida no servidor)
| origem | impressora | quem pode |
|---|---|---|
| `PRODUTO` | `100x120`, ZPL | `admin` ou `permissoes.pcp.etiquetas` (flag do objeto) |
| `KIT_FESTA` | `40x25`, EPL2 | `admin` ou `permissoes.kitFesta` |
| `DELIVERY` | `40x25`, EPL2 | `admin` ou `DeliveryPermissao.podeVer` |
Sem permissão da origem = `403 {"error":"Sem permissão para imprimir etiquetas desta área."}`. `origem` ausente/inválida = `400`.

### `GET /api/impressao/etiquetas/impressoras?origem=PRODUTO|KIT_FESTA|DELIVERY`
Impressoras **ativas** do tamanho da origem: `[{ id, nome, tamanho, colunas, estadoAgente:'ONLINE'|'INSTAVEL'|'OFFLINE', estadoWindows }]`.

### `POST /api/impressao/etiquetas`
```json
{ "origem": "PRODUTO | KIT_FESTA | DELIVERY",
  "requisicaoId": "8..80 caracteres [A-Za-z0-9-] (uuid novo por intenção; o retry REUSA o mesmo)",
  "impressoraId": "opcional se só houver 1 ativa do tamanho (se houver mais de uma, é obrigatório)",
  "referencia": { "tipo": "ETIQUETA_PRODUTO | PEDIDO", "id": "texto até 80", "rotulo": "texto até 120" },
  "copias": 1,
  "bitmaps": [ { "larguraDots": 800, "alturaDots": 960, "formato": "ZLIB | RAW", "dados": "<base64>" } ],
  "sequencia": [0, 0, 1, 2] }
```
- `PRODUTO`: exatamente **1** bitmap; `copias` 1..999 (default 1) vão **dentro dos bytes** (`^PQ`); `sequencia` não é aceita.
- `KIT_FESTA`/`DELIVERY`: 1..60 bitmaps diferentes + `sequencia` **obrigatória** (ordem de impressão; índices em `bitmaps`; máx. 240 etiquetas); `copias` ausente ou 1 (repetir etiqueta = repetir o índice).
- `referencia` é opcional; vira `ImpressaoTrabalho.referencia` como `"<rotulo> [<tipo>:<id>]"` (≤200) e aparece em `GET /api/impressao/fila` (admin).
- Teto de 40 formulários por trabalho (80 etiquetas em 2 colunas; 40 em 1 coluna); acima disso o servidor divide em até **3 trabalhos** (máx. 240 etiquetas) — acima disso `400`.
- Idempotência: `chaveIdempotencia = "etq-<origem>-<requisicaoId>-<n>"` (n = 0,1,2). Tipo gravado: `ETIQUETA_PRODUTO` (PRODUTO) ou `CAIXA_KIT_FESTA` (KIT_FESTA e DELIVERY).
- Resposta **`201`** (primeira vez) ou **`200` + `"repetido": true`** (todos os trabalhos já existiam):
```json
{ "trabalhos": [ { "id": "uuid", "status": "PENDENTE" } ], "totalEtiquetas": 2,
  "agente": { "estado": "OFFLINE" }, "aviso": "O computador da cozinha parece desligado. A etiqueta fica na fila por 15 minutos.", "repetido": true }
```
  (`aviso` só quando o agente está OFFLINE e não é repetição; `repetido` só quando é repetição.) Acompanhar cada `trabalhos[i].id` com `GET /api/impressao/trabalhos/:id` (pior estado vale).
- Erros: `400` validação (mensagem em PT: requisicaoId, bitmaps, sequencia, copias, dimensão, base64, zlib corrompido, imagem maior/menor que o esperado, "Etiquetas demais…", mais de uma impressora sem `impressoraId`); `403` sem permissão da origem; `409` sem impressora ativa do tamanho / linguagem errada / dpi ≠ 203 / rotação ≠ 0 / `requisicaoId` já usado por **outra pessoa** / ajuste de posição negativo; `413` corpo > 4 MB (`"Etiqueta grande demais (limite de 4 MB)…"`); `401` sem token; `500` erro interno.

> **Atenção (cancelar + reenviar):** repetir o mesmo `requisicaoId` depois de cancelar devolve `200 {repetido:true}` apontando para o trabalho **CANCELADO** — nada imprime. Em "cancelar e imprimir de novo" o front deve gerar `requisicaoId` NOVO.

### `POST /api/impressao/etiquetas/trabalhos/:id/cancelar`
Dono do trabalho (ou admin), só trabalho de etiqueta (`ETIQUETA_PRODUTO`/`CAIXA_KIT_FESTA`) ainda `PENDENTE` → `200 {ok:true}`, status `CANCELADO`. Outro usuário/tipo diferente = `404`; já não pendente = `409`. Serve ao "Cancelar e imprimir pelo navegador" (evita etiqueta em dobro quando o PC da cozinha volta).

## Mudanças em rotas existentes
- `GET /api/impressao/trabalhos/:id`: agora **dono OU admin** (antes exigia `pcp.etiquetas`). Quem não é dono e não é admin = `404`. Formato da resposta inalterado.
- `GET /api/impressao/fila` (admin): cada item ganha `referencia`.
- `POST /api/impressao/impressoras/:id/teste`: `tipo` ganha **`BITMAP_TESTE`** (+ `compressao` opcional `"Z64"|"HEX"`; sem ela usa `appConfig impressao_gf_compressao`, padrão `Z64`). `201 {trabalhoId}`. Só combinações ZPL 100x120 e EPL2 40x25 (outra = `400`). Admin-only como os outros testes.
- Schema: `ImpressaoTrabalho.referencia String?` (aditivo). `backend/package.json`: `qrcode` 1.5.4 passou a dependência direta (já estava no lock como dependência de `node-pdf-nfe`).

## O que sai para a impressora
**ZPL (PRODUTO)**
```
^XA
^CI28
^PW800
^LL960
^LH0,0
[~SD<densidade>]                       só se ajustes.densidade
^FO<offsetX>,<offsetY>^GFA,96000,96000,100,:Z64:<base64 do zlib>:<CRC16-XMODEM em 4 hex sobre o base64>^FS
^PQ<copias>,0,1,N
^XZ
```
Reserva sem compressão (`appConfig impressao_gf_compressao` = `HEX`): `^GFA,96000,96000,100,<192000 hexa maiúsculo>`. Troca sem deploy.

**EPL2 (KIT_FESTA/DELIVERY)** — cabeçalho idêntico ao de `renderEpl2Pequena` (`parametrosEpl2`), depois um formulário por par:
```

N
q672
Q200,24
D8
S2
ZT
N
GW16,0,40,200,<8000 bytes>
GW352,0,40,200,<8000 bytes>
P1
N
GW16,0,40,200,<8000 bytes>        <- ímpar: última linha só com a coluna 1
P1
```
`col1X`/`col2X`/`offsetX`/`offsetY` do cadastro valem (defaults 16 e 352). Impressora de 1 coluna: um formulário por etiqueta.

## BITMAP_TESTE (o que imprimir e conferir na Zebra)
- **ZPL 100x120** (um bitmap): moldura de 1 dot a 2 mm da borda; **quadrado preto sólido de 10 mm no canto superior ESQUERDO**; letra **F** grande (denuncia espelho/giro); **EAN-13 `7891234567895`** com módulo 3 dots (285 dots) e outro com módulo 2 dots (190 dots); **QR de 29 módulos a 3 dots** (87 dots, `https://hardtsalgados.com.br/kit-festa`); régua de 400 dots (50 mm).
- **EPL2 40x25** (duas etiquetas, lado a lado): A = quadrado sup. esquerdo + F + QR + EAN módulo 2; B = quadrado sup. DIREITO + 2 F + QR. (O EAN de módulo 3 não cabe nos 40 mm com área de silêncio.)
- PNGs do que o servidor gerou: `evidencias-e3/bitmap-teste-100x120.png`, `bitmap-teste-40x25-2colunas.png`.

## Correção SEM deploy: `ajustes` da impressora
`Impressora.ajustes` (JSON) aceita, além de `densidade`, `velocidade`, `col1X`, `col2X`:
- `gwInverter` (boolean) — polaridade do `GW` no EPL2: `true` inverte os bytes, `false` envia como o bitmap interno (1 = preto). Default (ausente) = constante `EPL2_GW_BIT_PRETO` (hoje inverte).
- `gfCompressao` (`"Z64"|"HEX"`) — compressão do `^GFA` no ZPL. Ordem: `body.compressao` do teste > `ajustes.gfCompressao` > `appConfig impressao_gf_compressao` > `Z64`.
- `offsetX`, `offsetY` — **inteiros 0..200** (negativo = 409 na impressão).
Validação única (`impressaoService.validarAjustes`, chaves desconhecidas são ignoradas): `PUT /api/impressao/impressoras/:id` com `{ ajustes:{...} }` (**substitui** o objeto inteiro) e `GET /api/impressao/impressoras` (admin) já devolve `ajustes` em cada impressora para a tela mostrar/editar.
Atalho sem tela: `POST /api/admin-exec/impressora-ajustes` (header `x-admin-secret`) `{ "impressoraId":"...", "ajustes":{ "gwInverter":false } }` — **mescla** com o atual (valor `null` remove a chave) e responde `{ ok, impressora, ajustesAntes, ajustesDepois }`. Depois mande `BITMAP_TESTE` de novo.

## [A VALIDAR NA ZEBRA]
1. **Polaridade do `GW` (EPL2)** — hoje inverte. Se o teste sair em negativo: `ajustes.gwInverter=false` na impressora (sem deploy).
2. **Z64 + CRC aceitos pelo firmware da ZPL** — se não, `ajustes.gfCompressao="HEX"` na impressora (sem deploy).
3. **Offsets/alinhamento** (`^FO`/`GW` em x,y; `^LH0,0`; sem margem de driver) — calibrar em `ajustes.offsetX/offsetY` (0..200) do cadastro.
4. **Nitidez e leitura do EAN (módulo 3 e 2) e do QR (3 dots)** com o leitor do app e o celular.
5. Que `^PW800/^LL960` + `^FO0,0` imprime em pé no feed de 100 mm e a moldura sai a 2 mm das bordas; régua de 50 mm mede 50 mm.
6. Que a TLP 2844 aceita 2 `GW` seguidos num formulário com `q672` e 2 colunas sem erro/deslocamento.
(O sentido do giro da etiqueta deitada é do rasterizador do frontend, não do backend; o `BITMAP_TESTE` não testa giro além da assimetria do "F"/quadrado.)

---

## Seção FRONT (E3a/E3b — 20/10/2026)

**Arquivos (frontend):** `pages/PCP/etiquetaRaster.js` (núcleo), `etiquetaEan.jsx` (geometria do EAN), `etiquetaDireto.jsx` (`prepararProduto` / `prepararCaixas`), `useEnvioBitmap.js` (envio + acompanhamento), `ImprimirDireto.jsx` (botões, chip da impressora, estados), `services/impressaoEtiquetasService.js`. Pontos de uso: `EtiquetaImprimir.jsx`, `PrintModal` de `EtiquetasList.jsx` (origem `PRODUTO`), `KitFesta/PainelEtiquetas.jsx` (prop `origem`: `KIT_FESTA` no modal do pedido, `DELIVERY` no card do kanban). O caminho antigo (`imprimirEtiquetas`, `imprimirNaPagina`) ficou intacto como "Imprimir pelo navegador".

**Regras de produto no front**
- Zebra de produto só com **100×120** e layout **ANVISA/Deitada**. `p80` e **Clássico** (fixo 80×100): botão desabilitado + aviso + atalho "Usar 100×120" / "Usar ANVISA". Não centraliza o 80×100 no rolo grande.
- Caixas: carrega `document.fonts.load` (Fredoka, Lora, Caveat, Manrope) **antes** de montar o HTML (o texto é medido com `measureText`); QR pintado com a matriz de `QRCode.create` a 3 dots/módulo (2 se não couber; erro se não couber nem a 2); lote de até 20 células por passada; bitmaps deduplicados por hash **com conferência de bytes** (máx. 60 diferentes; `sequencia` = índices na ordem de impressão; > 240 etiquetas não vai pela Zebra).
- Cópias do produto vão em `copias` (campo Cópias, 1..999); caixas não usam `copias`.
- `referencia`: produto `{tipo:'ETIQUETA_PRODUTO', id:<id da etiqueta>, rotulo:'<nome> · fab dd/mm/aaaa'}`; caixas `{tipo:'PEDIDO', id:<nº>, rotulo:'Pedido #N · X etiquetas'}`.

**Idempotência / retry (`useEnvioBitmap`)**: `requisicaoId` novo por intenção (cada clique). "Tentar de novo" reusa o MESMO id **só se o POST não respondeu** (rede); se o trabalho já foi criado e falhou/expirou/foi cancelado, o id é NOVO. "Cancelar e imprimir pelo navegador": `POST .../trabalhos/:id/cancelar` de cada trabalho (409/404 ignorados) e `window.print()` do caminho antigo no MESMO clique (síncrono, exigência do iOS); se o cancelamento falhar o app avisa "a etiqueta já estava saindo". Acompanha todos os `trabalhos[].id`; pior estado vale. Trava síncrona contra toque duplo.

**Módulo do EAN (constante única)** — `EAN_MODULO_DOTS = 2` em `etiquetaRaster.js` (0,25 mm, cabe na MESMA caixa do SVG de hoje; as barras ficam centralizadas na caixa e os dígitos continuam os do SVG). Sobrescrevível **sem deploy** por aparelho: no console do iPad `localStorage.setItem('etiquetas:eanModuloDots','3')` (aceita 1..5; `removeItem` volta ao padrão). Com 3 dots as barras passam da caixa atual (285 contra ~241 dots) — comem a zona de silêncio e o leitor decide se aceita. Efeito vale no próximo clique de "Imprimir na Zebra".

**Giro da deitada**: `GIRO_DEITADA = 90` (horário) em `etiquetaRaster.js` — [A VALIDAR NA ZEBRA]; constante única.

**Evidências de tela**: `evidencias-e3/telas/` (cliques no app local contra o backend local). Fidelidade do rasterizador: `SPIKE-RASTER.md`.
