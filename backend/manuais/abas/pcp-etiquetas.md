---
aba: Etiquetas / Dados Etiquetas
rota: /pcp/etiquetas  e  /pcp/etiquetas/dados
permissao: pcp.etiquetas
---

# Etiquetas

## O que é

Sistema de impressão de etiquetas de embalagem dos produtos Hardt. Cada etiqueta contém as informações obrigatórias do rótulo: nome do produto, informação nutricional, composição, modo de preparo, alérgenos, código de barras (EAN-13) e datas de fabricação/validade (calculada automaticamente).

Este módulo tem duas telas separadas no menu lateral, com funções distintas:

| Tela | Rota | Para quê serve |
|------|------|----------------|
| Etiquetas | `/pcp/etiquetas` | Impressão no dia a dia (chão de fábrica) |
| Dados Etiquetas | `/pcp/etiquetas/dados` | Cadastro e gestão das etiquetas |

## Sub-abas

### Etiquetas (`/pcp/etiquetas`) — tela de impressão

Tela usada na produção. Mostra todos os produtos com etiqueta ativa em cards (4 colunas), ordenados alfabeticamente.

**O que dá pra fazer:**
- Buscar produto por nome ou código (campo em destaque, com foco automático)
- Filtrar por categoria de produto (pills clicáveis, salvos no navegador)
- Escolher o **Tamanho** e o **Modelo** da etiqueta, separadamente (ver abaixo)
- Selecionar um produto e abrir o modal de impressão
- Imprimir a etiqueta diretamente

**Tamanho e Modelo são escolhidos SEPARADAMENTE (dois seletores):**

Desde 08/2026 o tamanho do rolo e o desenho da etiqueta são escolhidos de forma independente — dá para imprimir qualquer combinação, conforme o rolo que estiver na impressora. São dois seletores de pills no modal (e na tela dedicada):

- **Tamanho** — `80 × 100` ou `100 × 120`. É o tamanho da folha/rolo. O padrão é **80 × 100** (o rolo atual, mais seguro).
- **Modelo** — `Clássico` ou `ANVISA`. É o desenho do rótulo:
  - **Clássico** — o layout de sempre, sem selos. É o padrão.
  - **ANVISA** — traz os selos de advertência **"ALTO EM"** (açúcar adicionado, gordura saturada e/ou sódio) no canto superior direito quando o produto ultrapassa os limites da ANVISA por 100 g. Os selos aparecem sozinhos, calculados pela tabela nutricional; se nenhum nutriente passa do limite, a etiqueta sai sem selo. O Clássico **nunca** mostra selo, em nenhum tamanho.

As quatro combinações possíveis: **Clássico 80×100**, **Clássico 100×120**, **ANVISA 80×100** e **ANVISA 100×120**. No 80×100 o layout ANVISA fica mais compacto (fontes e espaçamentos apertados) para caber no rolo menor. **Atenção ao Clássico no 100×120:** o desenho Clássico é feito no tamanho 80×100 e sai impresso nesse tamanho mesmo na folha grande — sobra borda em branco na etiqueta. Para o rolo 100×120 o modelo que preenche o rótulo inteiro é o **ANVISA**.

As duas escolhas ficam **salvas no navegador** e valem tanto no modal quanto na tela dedicada de impressão. O que manda o tamanho da folha impressa é o **Tamanho**.

**Como imprimir:**

1. Abra a tela `/pcp/etiquetas`.
2. Digite o nome ou código na barra de busca, ou clique na categoria desejada.
3. Clique no card do produto (ou no botão **Imprimir** dentro do card).
4. O modal de impressão abre com um preview da etiqueta no tamanho escolhido.
5. Escolha o **Tamanho** (80 × 100 ou 100 × 120) e o **Modelo** (Clássico ou ANVISA) — o preview muda na hora.
6. Confira ou altere a **Data de Fabricação** (padrão: hoje).
7. A **Validade** é calculada automaticamente somando os dias configurados na etiqueta.
8. Ajuste o número de **Cópias** (use os botões + / − ou digite diretamente).
9. Clique em **Imprimir** — o diálogo de impressão do navegador abre com as cópias pré-configuradas.
10. **Na janela de impressão do computador, confira o papel e a escala** (ver abaixo).

**O papel da janela de impressão (o que mais dá problema):**

A impressora ZDesigner está configurada em **paisagem**: a etiqueta entra deitada, então a folha enviada é a etiqueta girada 90°.

**Por isso os dois números aparecem invertidos, e os dois estão certos:** a etiqueta física é 100 × 120 mm, mas como ela imprime deitada o papel é listado como 120 × 100 mm (paisagem) na janela de impressão. O mesmo vale para a pequena: etiqueta 80 × 100 mm → papel 100 × 80 mm.

| Tamanho da etiqueta (escolhido no app) | Papel a escolher na janela de impressão |
|---|---|
| 80 × 100 mm | **100 × 80 mm (paisagem)** |
| 100 × 120 mm | **120 × 100 mm (paisagem)** |

Esse aviso aparece na própria tela, num quadro amarelo, tanto no modal da lista quanto na tela dedicada — e o texto muda junto com o tamanho selecionado.

- A **escala** precisa ficar em **100%**. Se estiver em "Ajustar à página" / "Fit to page", o navegador encolhe a etiqueta.
- Se o papel escolhido for de outro tamanho, o navegador **encolhe o trabalho para caber nele** — foi o defeito de 08/2026: com o papel da etiqueta antiga (100 × 80) selecionado, a 100×120 saía reduzida a 80%, com o conteúdo do tamanho de uma 80×100 no canto de cima e o resto da etiqueta em branco. Nenhum ajuste dentro do app corrige isso: é o papel do diálogo (e, na origem, o tamanho da etiqueta configurado no driver da ZDesigner, que precisa ser 100 mm × 120 mm para o rolo grande).
- Cada cópia sai em **exatamente uma etiqueta** (1 cópia = 1 etiqueta, 3 cópias = 3 etiquetas) — conferido gerando o PDF da própria impressão.

---

### Dados Etiquetas (`/pcp/etiquetas/dados`) — cadastro

Gerenciamento do cadastro. Permite criar, editar, ativar/inativar e remover etiquetas.

**O que dá pra fazer:**
- Listar etiquetas com busca e filtro ativo/inativo
- Criar nova etiqueta
- Editar etiqueta existente
- Imprimir diretamente da lista (ícone de impressora)
- Ativar ou inativar uma etiqueta
- Remover uma etiqueta

**Como criar uma nova etiqueta:**

1. Clique em **Nova Etiqueta**.
2. Preencha a seção **Identificação**:
   - **Código do Produto** (obrigatório)
   - **Nome do Produto** (obrigatório)
   - **Peso Unitário (g)**: peso de cada unidade
   - **Peso Tabela Nutricional / Porção (g)**: tamanho da porção usada na tabela
   - **Quantidade por Embalagem**: quantas unidades por pacote; marque "Qtd. aproximada" se necessário (exibe "APROXIMADAMENTE" na etiqueta)
   - **Código de Barras**: EAN-13 (opcional; se inválido para EAN-13, usa CODE-128)
   - **Tipo de Produto**: texto livre (ex: "Mini - Fritar")
   - **Validade (dias)**: padrão 90 dias
   - **Vincular ao Produto do Catálogo**: opcional; permite filtrar por categoria na tela de impressão
3. Preencha a seção **Informação Nutricional**: valor energético, carboidratos, proteínas, gorduras totais, saturadas, trans, fibra e sódio. Preencha no formato "34kcal (2% VD)".
4. Preencha a seção **Composição e Preparo**: ingredientes, modo de preparo e armazenamento/conservação.
5. Preencha a seção **Alérgenos**: marque os checkboxes de leite, glúten e ovo; preencha outros alérgenos e o aviso de traços se necessário.
6. Clique em **Salvar**.

> Um produto do catálogo pode ter múltiplas etiquetas (ex: versão 22g e versão 28g do mesmo produto).

**Como editar ou imprimir da lista:**

- Clique no ícone de impressora para imprimir (abre tela dedicada `/pcp/etiquetas/:id/imprimir`).
- Clique no ícone de lápis para editar.
- Clique no toggle para ativar/inativar.
- Clique no ícone de lixeira para remover permanentemente.

## O que aparece na etiqueta impressa

A **impressão sai na própria página** (não abre janela nem aba nova) — funciona no computador e no iPad. A impressora fica em modo paisagem; a etiqueta é desenhada em pé e girada 90° para casar com o rolo.

### Modelo ANVISA

Etiqueta organizada por zonas: nome centralizado no topo (com folga para o selo quando houver), selo(s) "ALTO EM" no canto superior direito (a tabela começa sempre abaixo do selo, sem sobreposição), tabela nutricional completa (colunas 100 g / porção / %VD), e na zona inferior os textos de ingredientes/preparo/conservação à esquerda com o **código de barras EAN-13 na vertical** (girado 90°, número acompanhando na lateral, lendo de baixo para cima — como um EAN de embalagem em pé) numa coluna à direita, sem nunca encostar na tabela. No rodapé, sempre visíveis, as datas de Fabricação/Lote e Validade. Tudo em preto puro, pensado para a impressora térmica. Sai no tamanho escolhido — no 80 × 100 as fontes e espaçamentos ficam mais compactos para caber no rolo menor.

Quando o produto tem muito texto (ingredientes e modo de preparo longos), a etiqueta **encolhe as fontes automaticamente** até tudo caber na altura da folha — é um ajuste de layout de verdade (não um "zoom" de tela), então o que aparece no preview é exatamente o que sai impresso, no computador e no iPad. As datas de Fabricação/Validade ficam num rodapé fixo, fora do bloco que encolhe — aparecem sempre inteiras na impressão, nunca cortadas. O código de barras também não encolhe: mantém as proporções e o tamanho corretos de leitura.

### Modelo Clássico

O conteúdo clássico contém (nesta ordem):
1. Nome do produto (negrito, grande)
2. Código + Peso unitário em gramas
3. Tabela nutricional por porção
4. Nota de valores diários
5. "CONTÉM X UNIDADES" (ou "APROXIMADAMENTE X UNIDADES")
6. INGREDIENTES
7. Aviso de alérgenos (ALÉRGICOS: Contém leite, glúten...)
8. MODO DE PREPARO
9. Armazenamento (freezer -12°C), se preenchido
10. Código de barras EAN-13 (se cadastrado)
11. "Fabricação - DD/MM/AAAA   Validade - DD/MM/AAAA"

No tamanho 80 × 100 sai no formato original; no 100 × 120 o mesmo conteúdo é ampliado e centralizado para preencher a folha, sem cortar nada.

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver e imprimir etiquetas | `pcp.etiquetas` |
| Criar, editar, remover etiquetas | `pcp.etiquetas` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.etiquetas`.

> Esta é uma permissão **separada** das demais do PCP — um usuário pode ter acesso a etiquetas sem ter acesso a ordens ou receitas, e vice-versa.

## Depende de / Interfere em

- **Produtos (catálogo)**: o vínculo com produto do catálogo é opcional e só serve para ativar o filtro por categoria na tela de impressão.
- Não interfere em nenhum outro módulo do PCP (ordens, estoque, receitas).

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/EtiquetasList.jsx` | Tela de impressão: grid de cards com modal de impressão embutido |
| `frontend/src/pages/PCP/EtiquetasDados.jsx` | Tela de cadastro: listagem com ações |
| `frontend/src/pages/PCP/EtiquetaForm.jsx` | Formulário de criação/edição com todos os campos do rótulo |
| `frontend/src/pages/PCP/EtiquetaImprimir.jsx` | Tela dedicada de impressão por ID (`/pcp/etiquetas/:id/imprimir`) |
| `frontend/src/pages/PCP/EtiquetaLabel.jsx` | Componente do rótulo Clássico (recebe `larguraMM`/`alturaMM`; escala para preencher no 100×120) + função de impressão `imprimirEtiquetas` (recebe o `tamanho`) |
| `frontend/src/pages/PCP/EtiquetaLabelNova.jsx` | Componente do rótulo ANVISA (recebe o tamanho; versão compacta no 80×100) + despachante `EtiquetaRender` (`layout` + `tamanho`) |
| `frontend/src/pages/PCP/etiquetaModelos.js` | Fonte única: `TAMANHOS` (p80/g120) e `LAYOUTS` (classico/anvisa) separados, helpers puros e cálculo dos selos ANVISA (`selosAnvisa`) |
| `frontend/src/services/etiquetaService.js` | Chamadas de API para etiquetas |
