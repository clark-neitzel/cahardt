# PLANO — Bipe do pacote com câmera direta + QR na etiqueta

Autor: arquiteto · 19/11/2026 · Porte: **GRANDE** (equipe completa; mexe em etiqueta fiscal/rotulagem, câmera, offline, conferência de carga).
Legenda: **[confirmado]** = li o código ou medi no dump de produção de 15 min (19/11 19:45). **[suposição]** = não deu para provar aqui; vira teste em aparelho real.

---

## RESUMO PARA O DONO (10 linhas)

1. **Hoje o bipe NÃO leva ao produto certo por câmera, porque não existe leitor de câmera para o código de barras do pacote.** O que existe é leitor de mesa/bluetooth (Ajuste de Estoque) e uma câmera que só lê a nota fiscal. Os dois precisam ser complementados.
2. **O código certo já existe na maior parte:** das 55 etiquetas ativas, as 55 têm o código de barras do produto, todo válido (EAN-13). Nos produtos vendidos nos últimos 90 dias, 14 não têm código (12 são os "C/25-HF", quase todos pedido especial). Nenhum código repetido entre os produtos vendidos.
3. **Existem 15 pares de produtos ativos com o mesmo código** (ex.: dois "Creme de leite", dois "Café 3 Corações"). Nenhum deles é vendido ou tem etiqueta, mas o sistema hoje escolhe um deles em silêncio. Vamos listar e travar para não crescer.
4. **A câmera direta é viável:** abrir a câmera uma vez, ao entrar no modo "Bipar", e deixar rodando. A lentidão de hoje vem de abrir a câmera do zero a cada bipe. No iPhone **não dá** para garantir lanterna nem vibração (o iOS não oferece pelo navegador); o retorno será som + cor grande.
5. **O QR cabe na etiqueta** (cerca de 16 × 16 mm, com margem), mas **lote de verdade ainda não existe** na etiqueta de produto: hoje o "Fabricação/Lote" é só a data que a pessoa escolhe na tela de imprimir. Não vou inventar: o QR começa com **produto + fabricação + validade** (que o sistema sabe com certeza) e o lote real vira uma fase própria, só se você quiser.
6. **O QR leva os dados dentro dele** (não só um número para consultar). Assim funciona na câmara fria sem internet e mesmo para etiqueta impressa depois que a carga foi baixada no aparelho.
7. **O código de barras atual continua impresso** ao lado do QR. Etiqueta antiga já colada continua valendo pelo código de barras (só não tem validade no bipe). Não precisa reimprimir nada.
8. **Ordem:** (1) teste de leitura da câmera num iPhone/iPad real e arrumar os códigos faltando/repetidos; (2) tela de câmera direta; (3) bipe na conferência do motorista; (4) QR na etiqueta; (5) lote real (opcional).
9. **Estimativa:** 14 a 19 dias de trabalho no total, em fases que se entregam sozinhas (seção 8).
10. **Preciso de 5 respostas suas** (seção 9). A mais importante: aceita começar o QR só com fabricação/validade, sem lote?

---

## 1. Entendimento do pedido

O dono quer: (a) que o bipe do pacote ache o produto certo e some 1 na linha certa; (b) que o bipe seja uma tela de câmera sempre aberta e rápida; (c) QR code na etiqueta com produto, lote e validade, **começando pelo que faz achar o produto (o código de barras certo)**. O bipe é a "2ª etapa" da proposta `frontend/public/proposta-conferencia-motorista.html` (linhas 282, 346); a 1ª etapa (toque) ainda nem foi construída (memória `project_separacao_carga_camara_fria`).
Interpretação adotada: lote e validade no QR só entram se o dado existir de forma confiável; se não, o plano diz o que falta (seção 5, fase 3).

---

## 2. Resposta à pergunta 1: "o bipe vai direto para o produto certo?"

### Como funciona hoje [confirmado]
- Código de barras impresso na etiqueta de produto = **`Produto.ean`**, única fonte (`backend/routes/pcpEtiquetaRoutes.js:178,186-189`; decisão 09/10, commit a7691892). A coluna `etiquetas_produtos.codigo_barras` é só reserva (`schema.prisma:3289`). Produto sem EAN sai sem código.
- Bipe → produto: `backend/routes/estoqueRoutes.js:196-206` (`acharProdutoPorCodigo`): `SELECT ... FROM produtos WHERE ean = <código normalizado> ORDER BY ativo DESC LIMIT 1`. **Com código repetido, o sistema pega um qualquer, sem avisar.** `Produto.ean` não tem `@unique` (`schema.prisma:35`) e o salvamento só faz `trim` (`produtoController.js:425`), sem checar repetição.
- Quem lê: **só leitor tipo teclado** (USB/bluetooth) no Ajuste de Estoque (`PainelEstoque.jsx:498`, hook `useLeitorCodigoBarras.js`). A câmera existente (`LeitorCodigoBarras.jsx`) **só aceita `code_128` com 44 dígitos de DANFE** (linhas 85-92, 137, 161) e fecha ao primeiro acerto. `ConferirFolhaModal.jsx:93-112` lê só QR com jsQR. **Não existe hoje leitura por câmera de EAN-13 de produto.**

### Números de produção [confirmado, dump 19/11 19:45]
| Medida | Resultado |
|---|---|
| Produtos ativos (total) | 713 (222 sem EAN; a maioria é material de uso/peça — não vai em carga) |
| Etiquetas de produto ativas | 55, todas com produto vinculado, **55/55 com EAN-13 válido**, 49 em pé + 6 deitadas |
| Produtos **vendidos nos últimos 90 dias** | 89 produtos, 6.507 linhas de pedido |
| Desses, **sem EAN** | **14 produtos / 228 linhas (3,5%)**. 12 são "Produto Acabado" sem etiqueta ativa (3065 Bolinho de Carne, 5188 Coxinha Frango C/25-HF, 5180, 5290, 5186, 5185, 5192, 5187, 5189, 5191, 5193, 5190), mais Carne Moída 221 e Cebola CEBOL2. 80% das linhas deles são pedido **especial** |
| EAN repetido entre **ativos** | **15 grupos** (30 produtos). Nenhum deles é vendido em 90 dias e nenhum tem etiqueta. Ex.: 7898215151883 Creme de Leite (1439 × 1403); 7896035733449 Café Bom (93492 × 9952); 7900314001065 Monin (13791 × 9884) |
| EAN repetido entre vendidos (90 d) | **0** |
| Formato dos ativos com EAN | 437 EAN-13 ok · 46 **GTIN-14** (código de CAIXA, prefixo 1/9) · 8 UPC-12 |
| Mesmo produto em 2 linhas do mesmo pedido (90 d) | 0 |
| Linhas de pedido especial | 1.592 de 6.507 (24%) |

### A regra real do bipe (proposta ajustada — o mock "soma na primeira linha incompleta" NÃO serve)
`proposta-conferencia-motorista.html:507-510`: o mock soma na primeira linha com falta e nem olha o código. Regra real:

1. Ler código → normalizar (só dígitos/letras, maiúsculas; **comparar em 14 dígitos com zeros à esquerda**, para UPC-12 e EAN-13 com zero à frente casarem).
2. Resolver `código → produtoId` **no aparelho**, na tabela baixada com a carga (seção 6.2).
3. Escolher a linha, conforme o modo:
   - **Por pedido:** linha `p:<pedidoId>:<produtoId>` do pedido aberto. Sem a linha → **alerta VERMELHO** "este produto não é deste pedido — tire da bolsa".
   - **Carga inteira:** linha `c:<produtoId>` (soma de todos os pedidos da carga — chave já existente em `separacaoCargaService.js:207,237`). Produto fora da carga → vermelho "não é desta carga". O bipe soma no total do produto; **não sabe de qual pedido é o pacote**, e não precisa (quem decide o pedido é o modo "por pedido").
   - Linha já completa → **âmbar** "a mais" (o toque continua permitido; registra o excesso, não bloqueia).
4. Código que não existe em nenhum produto → **cinza/vermelho "código desconhecido"** + botão "somar no toque".
5. Mesmo produto em 2 linhas do mesmo pedido: hoje 0 casos; se surgir, somar na primeira com falta, na ordem da tela.

### Quando o bipe NÃO leva ao produto certo
| Situação | O que acontece | Tratamento |
|---|---|---|
| Produto sem EAN (14 vendidos, 80% especial) | Pacote sem código de barras | Continua só no toque; aparece na lista de pendências (fase 1) |
| EAN repetido | Sistema pega um dos dois em silêncio | Fase 1: lista + bloquear salvar EAN já usado por produto **ativo** |
| Pacote de pedido especial | O código é o do produto de catálogo — **bipe idêntico ao pedido normal** | Sem problema para contar; não distingue origem |
| Lote misturado | EAN não distingue lote | Só o QR (fase 2) distingue fabricação/validade |
| GTIN-14 (código de caixa) cadastrado como EAN do produto | Pacote unitário traz EAN-13; não casa | 46 produtos ativos; **nenhum com etiqueta própria**; ficar de olho se virarem item de carga |
| Mesmo código em 2 pacotes iguais seguidos | Impossível saber se é o mesmo pacote lido 2× | Pacotes de um lote têm o mesmo código; só a pausa curta e o "desfazer" protegem (seção 4) |

---

## 3. Mapa do código atual (câmera, offline, etiqueta)

| Peça | Onde | Observação [confirmado] |
|---|---|---|
| Leitor por câmera (modal) | `frontend/src/components/LeitorCodigoBarras.jsx` | `getUserMedia` a cada abertura (:102); `BarcodeDetector` só se suportar `code_128` (:135-137), senão `@zxing/library` por `import()` dinâmico (:158) com hint só CODE_128 e `TRY_HARDER` (:161-162), conversão de luminância em JS por frame (:171-173); laço por `setTimeout` 200/120 ms (:220); **fecha e devolve ao primeiro acerto** (:62-70). Usado só por `BipeCanhoto.jsx:425` |
| Leitor de QR | `Motorista/Entregas/ConferirFolhaModal.jsx:85-112` | `jsqr` 480 px de largura, a cada 250 ms; nova câmera por abertura |
| Leitor tipo teclado | `hooks/useLeitorCodigoBarras.js` | pacote ≥ 8 caracteres, ≤ 60 ms entre teclas, Enter. Serve para QR de 28 caracteres também |
| Som/vibração | `utils/feedbackBipe.js` | **`new AudioContext()` a cada bipe (:28)** → no iOS há limite de contextos abertos; `navigator.vibrate` **não existe no iOS** |
| Janela anti-repetição | `feedbackBipe.js:65` `JANELA_REPETICAO_MS = 800` | |
| Offline da Separação | `Logistica/SeparacaoCarga/separacaoStorage.js`, `useSeparacaoCarga.js` (`aquecerCache` :48-60 pré-carrega chunks para o SW) | carga baixada em `localStorage`; valor absoluto por linha |
| Payload da carga | `backend/services/separacaoCargaService.js:87,103-106` | produto vai com `{id, nome, unidade, quantidadePorCaixa}` — **sem `ean`** |
| Etiqueta de produto | `PCP/EtiquetaLabel.jsx`, `EtiquetaLabelNova.jsx`, `EtiquetaLabelDeitada.jsx`; tamanhos `p80` 80×100 e `g120` 100×120 (`etiquetaModelos.js:11-13`), 3 layouts | rodapé: pílulas Fabricação/Lote + Validade + EAN-13 (`EtiquetaLabelNova.jsx:270-305`) |
| Código de barras impresso | `JsBarcode` formato **EAN13**, se falhar **CODE128** (`EtiquetaLabelNova.jsx:111-116`); no raster, módulo de **2 dots (0,25 mm)** (`docs/etiquetas-cozinha/SPIKE-RASTER.md`) | |
| Impressão na Zebra | `PCP/etiquetaDireto.jsx` (`prepararProduto`) → `etiquetaRaster.js` (html2canvas → bitmap 1-bit 203 dpi, `^GFA`) → `/api/impressao-etiquetas` → fila `impressao_fila` → agente | **QR no raster já existe** (Kit Festa): `etiquetaRaster.js:126-148,442-446`, pinta módulo inteiro (3 dots), `data-raster="qr"` |
| Data de fabricação/validade | `PCP/EtiquetaImprimir.jsx:39,62-64` e `EtiquetasList.jsx:74-85` | `dataFab` = campo de data (padrão hoje); `validade = dataFab + dias` (`produto.validadeDias` ou `etiqueta.validadeDias`, `schema.prisma:3304`, default 90) |
| Registro do que foi impresso | `ImpressaoTrabalho.referencia` (texto ≤ 200, ex.: `COXINHA · fab 19/10 [ETIQUETA_PRODUTO:id]`, `impressaoEtiquetasRoutes.js:82-89`) | **texto livre, não consultável** |
| Lote estruturado | **só na Cozinha:** `EtiquetaCozinhaLote` (lote `AAMMDD-NN`, fabricação, validade, itemPcpId→produtoId, quantidade, responsável — `schema.prisma:4987-5018`) | rótulo 40×25 do semi-acabado. **A etiqueta de produto (100×120) NÃO grava nada disso** |
| QR existente em etiqueta | Kit Festa (link fixo `LINK_KIT_FESTA`, 29×29 versão 3-M) | referência de tamanho e de pipeline |

---

## 4. Tela de câmera direta e rápida (pedido 2)

### Por que é lento hoje [confirmado]
Cada "ler" abre um modal novo: pede a câmera de novo (`getUserMedia`), espera `play()`, consulta `getSupportedFormats()`, em iPhone baixa/avalia o chunk do zxing, procura a cada 120–200 ms **só um tipo de código**, e ao achar **fecha tudo**. Para bipar 40 pacotes seriam 40 aberturas.

### Desenho
Componente novo `ScannerContinuo` (frontend), **montado dentro da própria tela de conferência**, não em modal:
1. **Ao entrar no modo "Bipar"** (um toque, que também serve de gesto para liberar o som): abre a câmera **uma vez** e mantém o `<video playsInline muted>` visível numa faixa fixa no topo (~35% da altura), com a lista da carga embaixo. Nada de fechar a cada leitura. Fecha ao sair do modo, ao esconder o app (`visibilitychange`) e no unmount; reabre sozinho ao voltar.
2. **Motor de leitura em ordem:** (a) `BarcodeDetector` nativo com `['qr_code','ean_13','code_128']`, só se `getSupportedFormats()` listar; (b) senão biblioteca JS. `@zxing/library` já está no projeto (lê QR + EAN-13); `jsqr` (já no projeto) só QR e mais leve. **Spike obrigatório (fase 0)** para escolher entre zxing (JS), jsqr+zxing só para EAN, ou `zxing-wasm` [suposição: mais rápido; não testado]. Aquecer o chunk em `aquecerCache()` para abrir sem sinal.
3. **Laço:** `requestVideoFrameCallback` quando existir (Safari 15.4+), senão `requestAnimationFrame` com teto de ~10 leituras/s; decodificar em recorte central (já é o padrão de `LeitorCodigoBarras.jsx:209`). Decodificação em Web Worker/OffscreenCanvas **só se** o spike mostrar travamento do vídeo [suposição; OffscreenCanvas exige iOS 16.4+].
4. **Contra leitura em dobro:** contar de novo o MESMO código só se (a) passaram ≥ 900 ms **e** (b) o código sumiu do quadro por ≥ 300 ms; código DIFERENTE conta na hora. Vale também para leitor bluetooth (reaproveitar `JANELA_REPETICAO_MS`).
5. **Retorno imediato:** faixa **verde** gigante com nome do produto e "3 de 10" (fonte ≥ 28 px — visão do dono), **âmbar** para excesso, **vermelho** para fora do pedido; som (`sinalizar`) **corrigido para reaproveitar um único `AudioContext`** criado no toque de entrada (hoje cria um por bipe, `feedbackBipe.js:28`). Botão grande **"Desfazer último"** (lê o último evento e lança estorno).
6. **Plano B sempre visível:** campo "digitar o código" (13 dígitos do EAN) e leitor bluetooth via `useLeitorCodigoBarras` — pelo mesmo caminho de resolução. Se a câmera negar/falhar: mensagem explicando e o campo já aberto (padrão do `LeitorCodigoBarras.jsx:248-269`).
7. **Lanterna:** botão aparece **só se** `track.getCapabilities().torch` existir (Android/Chrome).

### O que NÃO dá para garantir (honestidade)
- **iPhone/iPad: sem vibração** (a API `navigator.vibrate` não existe no iOS) **e sem lanterna pelo navegador** [suposição forte, a confirmar no aparelho]. O aviso é som + cor.
- **Permissão da câmera no PWA instalado do iOS pode ser pedida de novo a cada abertura a frio do app** [suposição — testar]. Tela continua usável: o pedido é um toque.
- Foco contínuo: Android aceita `focusMode: continuous`; iOS foca sozinho, sem controle nosso.
- **Código de barras EAN-13 impresso a 0,25 mm (2 dots) lido por câmera de celular não está provado** — o spike de etiquetas (`SPIKE-RASTER.md`) deixou "só o papel prova" e a leitura nunca foi testada com câmera. QR com módulo ≥ 0,5 mm é bem mais fácil para câmera; por isso o QR melhora a leitura, não é só enfeite. Se o EAN falhar na câmera, a saída é o QR (ou crescer o EAN para 3 dots, o que muda a caixa da etiqueta).
- Tela apagando durante o bipe: Wake Lock existe no iOS ≥ 16.4 mas teve falhas em PWA [suposição]; plano B = o motorista tocar na tela.
- **Dois pacotes idênticos seguidos não podem ser distinguidos de uma leitura repetida** (mesmo código em todos). Só um número de série por pacote resolveria; custo e peso alto — fora do escopo, decidir só se virar problema.

---

## 5. Etiqueta com QR, em fases (pedido 3)

### Fase 1 — código de barras certo e único (sem mexer no layout)
- Rota **somente leitura** de diagnóstico (padrão `admin-exec`): produtos ativos **sem EAN** que têm venda nos últimos 90 dias ou etiqueta; grupos de **EAN repetido entre ativos**; produtos com EAN fora de EAN-13/UPC-12 válido (DV errado); GTIN-14.
- **Tela "Pendências de código de barras"** (Produtos): lista com 3 abas (sem código · repetidos · formato estranho), ordenada por nº de linhas vendidas, botão "editar EAN" (reaproveita `DetalheProduto.jsx:248`, que já grava `ean`). O dono/escritório preenche; para os "HF" a decisão é de negócio (podem nem ter código de fábrica) — ver pergunta 3.
- **Validação ao salvar EAN** (`produtoController.js:425`): recusar EAN já usado por **outro produto ativo** (mensagem com o nome do outro) e avisar DV inválido. **Não criar `@unique` no banco**: há 15 duplicados existentes e o `prisma db push` recusaria, derrubando o deploy (regra de schema do projeto).
- `acharProdutoPorCodigo` (`estoqueRoutes.js:196`): se houver mais de 1 produto ativo com o código, **devolver 409 "código repetido: A / B"** em vez de escolher um — além de normalizar em 14 dígitos.
- Teste de leitura em câmera do **EAN já impresso** (parte do spike), com a etiqueta no iPhone/iPad.
- Critério: depois da fase 1, **zero** produto com etiqueta ativa ou vendido sem EAN válido e único, ou o dono decidiu explicitamente quais ficam só no toque.

### Fase 2 — QR na etiqueta (conteúdo curto e versionado)
**Opções comparadas**
| | QR "cheio" (dados dentro) | QR com id curto (consulta) |
|---|---|---|
| Funciona sem internet / na câmara fria | **Sim**, só precisa da tabela código→produto que a carga já traz | Só se a tabela de ids estiver no aparelho; **etiqueta impressa DEPOIS de a carga ter sido baixada não estaria nela** → falha |
| Tamanho | ~25 módulos | ~21 módulos (menor), mas ganho pequeno |
| Lote/validade | Vão impressos dentro; sem tabela nova | Exige tabela/registro de impressão (fase 3 pronta) |
| Risco | Formato precisa ser bem versionado | Dependência de rede/tabela em campo |
**Recomendação: QR cheio.**

**Formato exato (v1)** — texto em maiúsculas e dígitos (modo alfanumérico do QR), tamanho fixo, 28 caracteres:
```
HB1 + EAN13 (13 dígitos) + FAB (AAMMDD) + VAL (AAMMDD)
exemplo: HB17891234567895251119260219
```
- `HB` = prefixo Hardt (descarta QR de outra origem: DANFE, Kit Festa, Pix); `1` = versão do formato. Versão futura `HB2` pode acrescentar lote (ex.: `-NN`) sem quebrar o `HB1` já colado.
- Datas em `AAMMDD` (ano de 2 dígitos); o leitor valida `VAL ≥ FAB` e o dígito verificador do EAN-13.
- Só gerar QR quando o EAN é EAN-13 válido. Das 55 etiquetas ativas, **55 são**. Se não for, imprime como hoje (sem QR).
- O texto de "Fabricação/Lote" e "Validade" **continua impresso por extenso** ao lado do QR — o QR é complemento, não substituto.

**Tamanho e leitura (câmara fria, luva, condensação)**
- ECC **Q (25%)**: aguenta mancha/embaçado/arranhão leve sem inchar o código (H deixaria 29×29+).
- 28 caracteres alfanuméricos cabem na **versão 2-Q (25×25 módulos, capacidade 29)**; se o formato crescer (lote) vai para a versão 3-Q (29×29, cap. 47).
- Zebra 203 dpi (8 dots/mm), módulo **inteiro de dots** (como `pintarQr`, `etiquetaRaster.js:126-143`): **5 dots = 0,62 mm → 125 dots = 15,6 mm** + margem branca de 4 módulos de cada lado (20 dots = 2,5 mm) = ~20,6 mm; piso aceitável **4 dots = 0,5 mm → 12,5 mm (+ margem ≈ 16,5 mm)**. Abaixo de 4 dots não recomendo para câmara fria. O QR do Kit Festa hoje usa 3 dots (0,37 mm), é menor do que eu indicaria aqui.
- Margem branca (zona de silêncio) obrigatória: ela precisa caber no layout; senão o leitor falha mesmo com QR perfeito.
- Preto sólido, sem tarja preta ao redor (a regra de 11/11: área preta cheia gruda o ribbon da Zebra).
- **Onde cabe [suposição, depende do desenho]:** o rodapé hoje (`EtiquetaLabelNova.jsx:270-305`) tem ~15 mm de altura com pílulas à esquerda e EAN deitado à direita. A opção mais simples: QR entre as pílulas e o EAN, pílulas ficam mais estreitas. O dev-frontend deve entregar **3 mocks (em pé 100×120, deitada 120×100, 80×100)** antes de codar, e **o 80×100 pode ser o mais apertado** (talvez só o piso de 4 dots).
- Teste de aceite físico: ler com iPhone a 15–25 cm, com luva fina, com a etiqueta gelada e com gotas de condensação.

**Arquivos**
- Frontend: os 3 componentes de etiqueta acima (+ `EtiquetaTesteRaster.jsx` para ver); `etiquetaDireto.jsx` (`prepararProduto` monta a matriz do QR por etiqueta — o raster hoje aceita **uma matriz por item** (`etiquetaRaster.js:394,425`), ok porque cada impressão é de 1 produto/1 data); impressão pelo navegador desenha o QR com a biblioteca `qrcode` (já no frontend). Parser/gerador **único** `utils/codigoEtiqueta.js` (gera `HB1…`, valida e interpreta) usado pela etiqueta E pelo bipe.
- Backend: espelho do parser (padrão `chaveNfe`/`codigoCarga`: front e back em sincronia) — só se o servidor também precisar validar; no desenho offline, quem valida é o aparelho.
- Agente de impressão: **sem mudança** (o bitmap já vai pronto).
- Manual do Clippy (`backend/manuais/abas/…etiquetas…`) e novidade para o grupo (regras do CLAUDE.md).

### Fase 3 — lote de verdade [só se o dono quiser; NÃO inventar]
**O que existe:** na etiqueta de produto "Fabricação/Lote" é só a **data** escolhida na tela (padrão hoje). Não há número de lote, nem registro estruturado do que foi impresso (só texto em `ImpressaoTrabalho.referencia`). Há lote `AAMMDD-NN` **apenas** nas etiquetas da Cozinha (semi-acabados 40×25), que não são o pacote vendido. Não existe vínculo entre a ordem de produção (`OrdemProducao`) e a etiqueta impressa, nem entre pacote e carga. **Resposta à pergunta "no momento de imprimir dá para saber produto + lote + validade com certeza?":** produto = sim; validade = sim (é a que a pessoa confirmou na tela); **lote = só a data de fabricação digitada**, que a pessoa pode ter mudado à mão.
**O que precisa nascer antes:**
1. Tabela `etiquetas_produto_impressas` (idempotente por requisição, no padrão `EtiquetaCozinhaLote`): `produtoId`, `etiquetaId`, `fabricacao`, `validade`, `lote` (`AAMMDD-NN`), `quantidade`, `quem`, `quando`, `ordemProducaoId?`.
2. Gerar o `NN` no momento da impressão (sequencial por dia, como a Cozinha já faz) e imprimir o lote por extenso.
3. QR passa a `HB2` com o lote; leitor aceita `HB1` e `HB2`.
4. Rota de consulta "este lote saiu em quais cargas" só depois que o bipe registrar lote (seção 6).
Sem isso o bipe registra **fabricação/validade lidas do QR**, que já dão rastreio por data. Só vale a fase 3 se o dono quer recall/consulta por lote.

### Etiquetas antigas já coladas
- O **código de barras EAN-13 continua impresso** na fase 2. Etiqueta antiga (sem QR) segue válida: o bipe lê o EAN, acha o produto, soma 1, e grava "sem validade lida". Nada é reimpresso.
- Estoque colado se renova naturalmente pela validade (padrão 90 dias).
- O scanner aceita os dois ao mesmo tempo (`ean_13` + `qr_code`); precisa ser **testado com um pacote com QR e outro sem na mesma carga**.

### Rotulagem (ANVISA) — só observação, **não é parecer jurídico** [suposição]
Pelo que está na memória (`reference_anvisa_rotulagem.md`: selo ALTO EM, tabela, tamanhos de letra) não há regra que proíba um QR adicional; o cuidado é **não tirar espaço/legibilidade do que é obrigatório** (tabela nutricional, alérgenos, selos, lote e validade em texto). Confirmar com quem faz a rotulagem antes de produzir o primeiro lote.

---

## 6. Conferência do motorista usando isso (pedido 4)

### 6.1 Fluxo
1. Motorista abre a carga com internet (baixa) → o aparelho guarda a carga **e a tabela de códigos** (6.2).
2. No caminhão/na mesa, entra no modo "Bipar" (tela de câmera direta, seção 4).
3. Cada bipe: resolve produto no aparelho, grava **um evento** em `localStorage` **de forma síncrona antes de qualquer rede** (padrão `useSeparacaoCarga.js`), dá retorno na hora, enfileira envio.
4. Ao voltar o sinal, envia em lotes; o servidor soma e responde o total oficial.
5. Fechar pedido/carga continua sendo ação do motorista, **sem mexer em pedido/nota/estoque** (decisão do dono 19/11).

### 6.2 Tabela código → produto no aparelho [confirmado que hoje NÃO existe]
- Hoje o payload da carga **não leva `ean`** (`separacaoCargaService.js:87,103-106`). A conferência do motorista (ainda não construída) deve nascer com `ean` por produto da carga: **só adicionar campo**, sem remover/renomear (o payload da separação já é consumido; conferir `diffCarga` em `separacaoCalculo.js` para não disparar o aviso "a carga mudou" por causa do campo novo [suposição: a assinatura em `:119` usa só pedido+itens, então não dispara]).
- Para o alerta "esse pacote é de OUTRO produto, e é o X", acrescentar um **mini-catálogo** na baixada: produtos com etiqueta ativa ou vendidos em 90 dias (hoje 89 produtos ≈ poucos KB). Fora disso: "código desconhecido".

### 6.3 O que registrar (evento de bipe, só-acréscimo)
`id` (uuid gerado no aparelho, é a **idempotência**), `cargaId`, `pedidoId` (quando por pedido), `produtoId` resolvido (ou nulo), `codigoLido` (texto cru), `tipo` (`EAN13`|`QR_HB1`), `fabricacao`/`validade` (quando QR), `resultado` (`OK`|`EXCESSO`|`FORA_DO_PEDIDO`|`DESCONHECIDO`), `usuarioId`, `aparelhoId`, `lidoEm` (relógio do aparelho **e** correção de relógio como a separação já faz: `desvioRelogioMs`), `estornaId` (no "desfazer").
Contagem por linha = soma dos eventos `OK|EXCESSO` − estornos. **Por que log de eventos e não valor absoluto por linha (como a separação):** dois aparelhos bipando a mesma carga não se sobrescrevem; "desfazer" é um evento, não edição.
Nova tabela `conferencia_motorista_bipes` (nunca remover campos depois) + rota `POST …/bipes/sincronizar` (lote de até 200, upsert por `id`, **idempotente**; log/atendimento fora de transação; `$transaction` com `{ timeout: 20000, maxWait: 10000 }` se houver).

### 6.4 Reconciliar com o pedido
Servidor recomputa por linha (pedido×produto): `bipado` × `pedir`. Diferença vira "faltou"/"sobrou" no cartão da entrega e no comprovante do Embarque (já aprovados pelo dono). Divergência **não altera** pedido/nota/estoque. Com QR: lista as validades lidas por produto ("3 pacotes val 26/02, 7 val 05/03").

---

## 7. Riscos e efeitos colaterais

1. **Mexe na etiqueta impressa e fiscal/rotulagem** → regra do projeto: testar na Zebra real com o papel do dono; **não dá para provar no computador**. Botão novo AO LADO do antigo (como no E3) até o dono aprovar pelo papel.
2. **EAN a 2 dots pode não ler por câmera** (acima). Mitigar no spike (fase 0) antes de prometer nada.
3. **Mudança de retorno de `acharProdutoPorCodigo`** (409 em duplicado): grepar consumidores de `/api/estoque/codigo-barras` (`PainelEstoque.jsx` e `vincular`) — o front hoje trata 404 e 403; 409 novo precisa de mensagem. Nunca remover campo da resposta.
4. **API de IA (`/api/ia-consulta/v1`)**: `iaProdutoSerializer.js:358` lê `Produto.ean` para `codigoBarras`. **Contrato congelado: não alterar o campo.** A validação de EAN duplicado ao salvar não muda o formato da resposta.
5. **Service worker**: o chunk de leitura precisa estar em cache para abrir sem sinal; subir `VERSAO` só se mudar estratégia. A questão pendente da "casca do SW" (memória da separação) vale aqui também.
6. **`feedbackBipe.js` é compartilhado** (Canhoto, Conferência da doca, Separação): trocar o `AudioContext` por um único **não pode mudar o vocabulário de sons**; testar as 3 telas.
7. **iOS:** sem vibração, lanterna provavelmente indisponível, permissão da câmera possivelmente repetida (seção 4). Prometer menos que o pedido.
8. **Permissão:** conferência do motorista precisa de permissão própria (já aprovada pelo dono); **o check do frontend espelha o do backend**; entrada em `BOOL_INDEX` do painel de permissões; o motorista vê **só as cargas dele**, **sem preço**.
9. **Etiqueta antiga convivendo com a nova**: fim do problema só com a validade das etiquetas coladas.
10. **Prisma**: tabelas novas só (sem remover/alterar colunas); índices TÊM que estar no schema.
11. **WhatsApp**: nada neste plano toca o bot. Nenhuma mensagem nova.
12. **Dados do dump** têm cliente/pedido: apaguei os arquivos temporários do scratchpad ao terminar.

---

## 8. Plano de execução (ordem, dono de cada passo, estimativa)

| Fase | Quem | O que | Dias |
|---|---|---|---|
| **0 — Spike** | dev-frontend + dono com aparelho | Página de teste (só admin): câmera aberta direto lendo QR + EAN-13 + Code-128; medir leituras/s e latência no iPhone, iPad e Android; comparar `BarcodeDetector`, `@zxing/library`, `jsqr`, `zxing-wasm`; ler **etiqueta atual impressa** (EAN 2 dots). Saída: motor escolhido + veredito sobre EAN | 1 |
| **1 — Código certo** | dev-backend (diag + validação + 409) → dev-frontend (tela Pendências) → qa + revisor | itens da seção 5 fase 1 | 2 a 3 |
| **2 — Câmera direta** | dev-frontend (`ScannerContinuo`, `feedbackBipe` com AudioContext único, aquecer cache) | seção 4; testar com o EAN existente | 3 |
| **3 — Conferência do motorista (bipe)** | dev-backend (payload `ean` + mini-catálogo, tabela de eventos, sincronizar) + dev-frontend | seção 6. **Depende da 1ª etapa (toque) da conferência do motorista, ainda não construída** — não está nestes dias | 3 a 4 |
| **4 — QR na etiqueta** | dev-frontend (3 layouts, raster, navegador, parser) + dono imprime na Zebra | seção 5 fase 2 | 3 a 4 + 1 de teste físico |
| **5 — Lote real (opcional)** | dev-backend + dev-frontend | seção 5 fase 3 | 4 a 6 |
Total: **14 a 19 dias** sem a fase 5 contada como obrigatória (fases 0–4 = 12 a 16; fase 5 = +4 a 6; mais a 1ª etapa do motorista, fora daqui).
Cada fase entrega sozinha. Fases 0 e 1 podem rodar em paralelo. A 4 só depois da 0 (precisa saber o menor módulo que a câmera lê).
Fim de cada fase: manual do Clippy + novidade (`novidade-<slug>.html` + `novidades.json`) conforme CLAUDE.md.

### Equipe (GRANDE)
arquiteto (este plano) → dev-backend / dev-frontend → **qa-testador + revisor-codigo em paralelo** → gerente-entrega. Backend e frontend têm **ponto de junção** (payload `ean`, eventos de bipe, formato `HB1`): o revisor confere o encaixe dos dois lados (histórico de defeitos na costura).

### O que só se prova em aparelho real (não vale computador nem produção)
- iPhone **e** iPad com o app **instalado** (PWA standalone): permissão da câmera, velocidade de leitura, sem lanterna/vibração, tela apagando, voltar do segundo plano.
- Android Chrome (se houver motorista com Android): `BarcodeDetector` nativo e lanterna.
- Zebra 100×120 (e 80×100 se usada): QR legível em 4–5 dots, EAN junto, tarja preta, ribbon.
- Câmara fria: etiqueta gelada, condensação, luva, **sem internet** (modo avião, fechar e abrir o app).
- Leitor bluetooth, se o motorista usar.
Só é "pronto" depois de publicado e testado assim (regra do CLAUDE.md).

---

## 9. Critérios de aceite (testáveis)

1. Diagnóstico mostra os mesmos números do dump (14 vendidos sem EAN, 15 grupos repetidos) e depois do saneamento o dono confirma o que sobrou.
2. Salvar EAN igual ao de outro produto ativo → recusado com o nome do outro. EAN de 12 e de 13 dígitos do mesmo produto casam.
3. Bipar EAN de produto da carga no **modo por pedido** soma 1 só na linha do pedido aberto, mostra "N de M" em letra grande e dá som; produto de outro pedido → vermelho; linha completa → âmbar.
4. Modo carga inteira: soma no total do produto; produto fora da carga → vermelho com o nome do produto (se estiver no mini-catálogo).
5. Entrar no modo Bipar abre a câmera **uma vez** e **40 bipes seguidos** acontecem sem fechar/abrir nada; mesmo código lido 3× em 1 s conta 1; "Desfazer último" tira 1.
6. Em **modo avião** (carga baixada antes): todos os bipes funcionam, eventos guardados; ao voltar o sinal sobem sem duplicar (reenviar o mesmo lote duas vezes não muda o total).
7. Câmera negada → mensagem clara e campo de digitação funcionando; leitor bluetooth bipa pelo mesmo caminho.
8. Etiqueta com QR `HB1…` lida pelo app num iPhone e num iPad: acha o produto, mostra fabricação/validade; etiqueta **antiga** (sem QR) lida pelo EAN na mesma carga; QR de outra origem (DANFE, Kit Festa) é ignorado com aviso, sem somar.
9. QR com ≥ 4 dots por módulo lê a 15–25 cm com luva fina e etiqueta gelada com condensação leve; reprovou em condensação forte → registrar o limite.
10. Os sons do Canhoto, da conferência da doca e da Separação continuam iguais aos de hoje.
11. Build do frontend passa; `curl` em `/api/estoque/codigo-barras/…` com um código repetido devolve 409 claro; contrato `/api/ia-consulta/v1` inalterado (campo `codigoBarras` igual).

---

## 10. O que NÃO fazer
- **Não reintroduzir campo digitável de código de barras na etiqueta** (decisão 09/10): quem manda é `Produto.ean`.
- **Não criar `@unique` em `produtos.ean`** (quebra o deploy com os 15 duplicados).
- **Não** abrir câmera em modal por bipe; **não** usar `window.open`/iframe para nada de impressão (regra do PWA/iPad).
- **Não** pôr link/URL no QR (Kit Festa usa link; este QR é dado — cai direto no leitor do app e não abre navegador por engano).
- **Não** imprimir QR sem margem branca, nem com tarja preta em volta, nem com módulo < 4 dots.
- **Não** tirar o EAN-13 impresso quando o QR entrar.
- **Não** inventar "lote": se não existe registro, o QR carrega fabricação/validade e pronto.
- **Não** alterar pedido/nota/estoque pelo bipe (decisão do dono 19/11).
- **Não** mandar WhatsApp nem automação nova por causa disso.
- **Não** prometer lanterna/vibração no iPhone.

---

## 11. Perguntas para o dono (5; cada uma com minha recomendação)

1. **Posso começar o QR só com produto + data de fabricação + validade, sem número de lote?** *Recomendo sim:* é o que o sistema sabe com certeza hoje; o número de lote real é uma fase à parte (4–6 dias) e só vale a pena se você quer rastrear "qual lote foi para qual cliente".
2. **Qual etiqueta é a prioridade para receber o QR primeiro?** *Recomendo a 100×120 em pé* (49 das 55 etiquetas ativas); a deitada (6) e a 80×100 depois, porque a 80×100 é a mais apertada.
3. **Para os 12 produtos "C/25-HF" que vendem sem código de barras (a maioria em pedido especial): quer criar um código para eles (o sistema gera um interno) ou deixar só no toque?** *Recomendo deixar no toque por enquanto* — são em maioria especiais e produto de terceiros; cadastrar o código real da embalagem, se existir.
4. **Aceita resolver os 15 pares de produtos com o mesmo código de barras agora (eles não são vendidos nem têm etiqueta; é cadastro duplicado do Conta Azul)?** *Recomendo:* o sistema lista e você escolhe qual fica; o outro perde o código ou é inativado. Não bloqueia nada se deixar para depois.
5. **Pode me liberar um iPhone e um iPad do motorista por meio dia, com 5 etiquetas já impressas, para o teste da câmera (fase 0)?** *Recomendo sim, antes de qualquer outra coisa:* é o teste que diz se o código de barras atual já lê ou se o QR precisa vir primeiro. Também vale uma imagem de teste dentro da câmara fria.

---

## 12. Incertezas assumidas (lista)
- Leitura de EAN a 0,25 mm por câmera: **sem prova**.
- Permissão de câmera em PWA iOS, torch, Wake Lock, OffscreenCanvas no Safari: **a testar**.
- Espaço real do rodapé para um QR de ~16 mm em cada layout: **a desenhar e imprimir**.
- Opinião sobre ANVISA: observação, não é parecer.
- `zxing-wasm` mais rápido que `@zxing/library`: **suposição**, o spike decide.
