# SPIKE E3-0 — rasterizador das etiquetas atuais (html2canvas → bitmap 1-bit 203 dpi)

Autor: dev-frontend · 20/10/2026 · Chrome 155 (macOS) · app local (`hardt_local`).
Página de teste: `/pcp/etiquetas/teste-raster` (só admin, sem item de menu) — `frontend/src/pages/PCP/EtiquetaTesteRaster.jsx`.
Evidências (PNG lado a lado + bitmaps): `docs/etiquetas-cozinha/evidencias-e3/spike/`.

## VEREDITO

**GO CONDICIONADO — não é "pixel idêntico" e não deve ser apresentado como tal.**

- O desenho que sai do rasterizador é o **mesmo desenho de hoje**: mesmas fontes, mesma tabela nutricional, mesmos selos ALTO EM, mesmas quebras de linha, mesmo auto-fit (o `--fs` da captura é igual ao do preview), mesmos textos e margens. Conferido lado a lado nos 7 casos (PNGs `*-comparacao.png`).
- A diferença que sobra é de **posição de 1 dot (0,125 mm)** em linhas e letras (e até 2 dots no Clássico/80×100, de fonte minúscula) — **além de antialias, portanto não atende ao critério literal do dono** ("qualquer diferença além de antialias = NO-GO"). Para a etiqueta ANVISA (100×120), a deitada e o Kit Festa o desvio é ≤ 1 dot (0 % dos pixels estão a mais de 2 dots); para o Clássico/80×100 chega a 2 dots em 2–4 % dos pixels.
- O ruído "natural" entre duas renderizações do PRÓPRIO Chrome (PDF vetorial × tela a 203 dpi) já é de ±1 dot, então a diferença que medimos tem a mesma ordem de grandeza — mas **só o papel lado a lado com a etiqueta antiga decide** (como o dono pediu). Recomendação: seguir para E3a/E3b com o botão novo AO LADO do antigo; o dono aprova pelo papel.
- **Não foi possível testar no Safari/iPad** neste ambiente (ver "Safari"). Isso é pendência de teste, não resultado.

Decisões que precisam do dono (pelo critério dele, não por mim):
1. EAN do 100×120 sai com **módulo de 2 dots (0,25 mm = 76 % do nominal)** porque é o maior inteiro que cabe na MESMA caixa de hoje (o SVG atual tem 2,54 dots/módulo). 3 dots (0,375 mm) não cabe sem ultrapassar a caixa atual (285 dots contra 241). Leitores comuns leem 0,25 mm, mas está abaixo do mínimo nominal de 80 % (0,264 mm). **Teste: bipar a etiqueta impressa com o leitor do app (Ajuste de Estoque/Canhoto).** Se falhar, a saída é deixar o código crescer para 3 dots (muda a caixa).
2. O layout **Clássico é fixo 80×100** (ignora o rolo). Hoje, escolhendo "100 × 120 + Clássico", ele sai pequeno no canto da folha (bug de 08/2026 descrito em `etiquetaModelos.js`). O rasterizador reproduz o que existe (80×100 → 640×800), mas esse tamanho **não tem impressora/endpoint** no plano (só 100×120 e 40×25). Para o Clássico sair na Zebra grande é preciso decidir: centralizar o 80×100 na folha 100×120 (como o caminho antigo faz) ou não oferecer o botão novo para o Clássico.

## O que foi medido

Referências usadas (as duas são "o que o app imprime hoje", renderizado pelo Chrome):
- **PDF vetorial** (Chrome → PDF → `pdftoppm` exato em 8 dots/mm) = `*-ref.png` — é a referência principal;
- **Tela a 203 dpi** (deviceScaleFactor 2,1167) — só para medir o ruído do próprio Chrome (piso).

Métrica "estrutural": pixel preto de um lado que não tem preto a até 1 dot (ou 2 dots) de distância no outro. Antialias puro NÃO conta. As caixas do EAN/QR ficam FORA desta métrica (são pintadas de propósito com módulo inteiro — ver mais abaixo).

| Etiqueta | Pixels diferentes (área toda, c/ antialias) | Estrutural a 1 dot (% dos pretos) | Estrutural a 2 dots | Tempo frio / quente | Envio ZLIB |
|---|---|---|---|---|---|
| ANVISA 100×120, texto LONGO (Hamburgão) | 6,9 % | 8,7 % | **0 %** | 710 / 666 ms | 18,4 KB |
| ANVISA 100×120, texto CURTO (Coxinha QA) | 4,7 % | 5,5 % | 0,6 % | 677 / 629 ms | 17,1 KB |
| DEITADA 120×100 → girada p/ 800×960 | 7,3 % | 8,2 % | 1,1 % | 720 / 684 ms | 24,9 KB |
| Clássico 80×100 (640×800) | 10,7 % | 15,4 % | 2,4 % | 724 / 651 ms | 15,1 KB |
| ANVISA 80×100 (só para olhar) | 11,6 % | 22,7 % | 4,3 % | 700 / 667 ms | 14,9 KB |
| Kit Festa — sabor (4 etiquetas, 1 passada) | 2,4–3,7 % | 0,02–3,2 % | 0 % | 577 / 566 ms **p/ as 4** | 2,0 KB |
| Kit Festa — pedido | 5,0 % | 8,9 % | 0 % | 565 / 545 ms | 2,1 KB |

Piso do próprio Chrome (PDF × tela, mesmo desenho): estrutural a 1 dot ≈ 1,0–1,3 mil pixels na ANVISA (≈ 1,3 %) e ≈ 140 px no Kit Festa. Ou seja: estamos a 4–7× do piso a 1 dot, mas ≈ 0 % a 2 dots.
Kit Festa "sabor": 3 das 4 etiquetas ficam em 0,02–3 % a 1 dot — praticamente idênticas (fora o QR).

Tempo: ~0,65–0,72 s por etiqueta de produto (primeira vez inclui o carregamento do html2canvas, ~+0,05 s); o Kit Festa roda em LOTE (até 20 por passada) a ~0,14 s por etiqueta.

### Robustez (provada)
- O mesmo bitmap sai **bit a bit idêntico** com `devicePixelRatio` 1, 2, 2,1167 e 3 (hash do bitmap igual) — o iPad (DPR 2) não muda o resultado no Chrome.
- A compressão sai em **zlib de verdade**: `zlib.inflateSync` no Node devolve exatamente os 96 000 bytes (800×960/8) — é o formato `:Z64:` do `^GFA`. Fallback `RAW` implementado (sem `CompressionStream`).
- Formato do bitmap conferido com `CONTRATO-E3.md`: linhas de cima p/ baixo, MSB = pixel à esquerda, 1 = preto, bits de sobra 0.
- Página de teste em 375 px: sem scroll horizontal.

## Fidelidade, item a item
- **Fontes** (Arial, Manrope, Oswald, Fredoka, Caveat, Lora): saem as mesmas. O rasterizador espera `document.fonts.load` de cada família usada + `fonts.ready` + 2 frames e **só captura quando o HTML ficou igual por 3 frames seguidos** (auto-fit estabilizado; teto 2,5 s). Atenção: no Kit Festa o tamanho do texto é medido por `canvas.measureText` ao montar o HTML — se a fonte ainda não carregou, a frase sai maior/menor (apareceu no spike; o `PainelEtiquetas` já pré-carrega as fontes, o rasterizador do E3b deve garantir isso ANTES de montar).
- **Tabela nutricional, selos ALTO EM, hairlines** (0,25 mm = 2 dots): saem, com linhas e letras a ±1 dot.
- **Auto-fit**: `--fs` idêntico ao do preview (0,9175 nos dois no Hamburgão); mesma quebra de linha.
- **Números tabulares / letter-spacing / kerning**: vêm do layout do DOM (posição de cada caractere); os dígitos são centralizados na célula como o navegador faz.
- **EAN-13**: pintado na MESMA caixa do SVG de hoje (mesma posição e altura de barras, guardas mais altas como hoje, centralizado na largura original das barras), módulo inteiro; os dígitos continuam sendo os do SVG atual. Larguras das barras no bitmap (linha do EAN): só múltiplos de 2 dots na ANVISA e de 5 dots no Clássico; no print atual rasterizado são mistas (2/3/5/7/8 e 5/6…). 
- **QR do Kit Festa**: módulo de 3 dots (87 dots) centralizado na mesma caixa de 12,5 mm (100 dots); a diferença para o desenho atual é o QR ficar 10,9 mm em vez de 12,5 mm (o SVG atual tem 3,45 dots/módulo, não inteiro). Zona de silêncio ≥ 6 dots à volta; **só a leitura com o celular na etiqueta impressa prova**.

## O que deu errado no caminho (e como foi resolvido) — importante p/ quem mexer depois
1. **Texto saía ~meia linha abaixo das bordas** (cortava as letras com as linhas da tabela). Causa de fundo: o preflight do Tailwind define `img { display:block }` e o html2canvas mede a linha de base das fontes com um `<img 1×1>` que precisa ser inline. Corrigido com uma regra restrita ao img 1×1 da medição, ativa só durante a captura (`injetarCorrecaoMedicao`).
2. **Resíduo de 1–3 dots no texto** (varia por tamanho de fonte: ascent/descent arredondados do DOM × canvas). Resolvido pintando o texto **por nossa conta**: o html2canvas desenha só caixas, bordas, fundos e SVG (texto transparente); cada caractere é desenhado na posição que o próprio navegador calculou (Range por caractere), com a baseline = topo da área de conteúdo + ascent medido no tamanho CSS.
3. Barras do EAN: o JsBarcode posiciona cada grupo com `translate` próprio e uma zona de silêncio à esquerda para o 1º dígito — a geometria das barras é lida dos `<rect>` reais do SVG, não deduzida.

## Plano B (html-to-image / foreignObject)
Testado no Chrome ANTES das correções acima, na mesma etiqueta: 1,2 s por etiqueta (o dobro), texto deslocado 1–2 dots na horizontal e fontes web não embutidas (erro de CORS ao ler o CSS do Google Fonts), diferença por faixa igual ou pior que a do html2canvas. Não é melhor e carrega o risco conhecido de `foreignObject` no WebKit. **Descartado; dependência removida.** O `foreignObjectRendering` nativo do html2canvas devolve imagem em branco (testado).

## Safari / iPad — NÃO testado
Safari por automação exige habilitar "Permitir automação remota"/menu Desenvolvedor (precisa de senha do Mac e alteração de configuração do navegador — não fiz). Abrir o Safari à mão não serve: a página de teste precisa de login e eu não consigo ler o resultado. **Pendência: abrir `/pcp/etiquetas/teste-raster` no iPad, rasterizar as 3 combinações e o Kit Festa e comparar com os PNGs deste spike** (principais riscos: `CompressionStream` exige iOS ≥ 16,4 — há RAW de reserva; fontes; `measureText` do canvas; ascent do WebKit).

## Só o papel na Zebra vai provar
- Que a diferença de ≤ 1 dot não é perceptível no papel (comparar com a etiqueta antiga lado a lado).
- Leitura do EAN (módulo 2 dots) com o leitor do app e do QR com o celular.
- Sentido do giro da deitada (`GIRO_DEITADA = 90`, horário) e polaridade/offsets (já previstos no plano).
- Nitidez do texto de 4–5 pt (letra minúscula da tabela) no papel térmico, com o limiar 160.

## Arquivos
- `frontend/src/pages/PCP/etiquetaRaster.js` — núcleo (final; ver `rasterizarEtiquetas`).
- `frontend/src/pages/PCP/etiquetaEan.jsx` — geometria/marcação do EAN para o modo raster.
- `frontend/src/pages/PCP/EtiquetaTesteRaster.jsx` + rota `/pcp/etiquetas/teste-raster` em `App.jsx`.
- Prop `modoRaster` (default `false`) em `EtiquetaLabel.jsx`, `EtiquetaLabelNova.jsx` (+ `EtiquetaRender`), `EtiquetaLabelDeitada.jsx`. Com `modoRaster` falso o DOM do preview é **idêntico** (HTML do preview antes × depois nos 9 casos: iguais, a menos da data do dia).
- `html2canvas@1.4.1` em `frontend/package.json`.
