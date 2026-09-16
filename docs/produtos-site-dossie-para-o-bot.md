# Dossiê de Produtos do Site de Congelados — para o time do bot da Ana

> Gerado em 16/09/2026 a partir dos dados **reais de produção** do CA-Hardt (rotas públicas do site, sem chave), para o time do bot de WhatsApp (Antigravity) entender o que é cada produto, campo a campo. Este documento é para leitura humana; o arquivo `produtos-site-catalogo-completo.json` (ao lado, na mesma pasta) tem os mesmos 51 produtos com a ficha embutida, em JSON, para o bot carregar direto.

**Fonte dos dados:** `https://cahardt-github.xrqvlq.easypanel.host/api/congelados-publico/{catalogo,grupos,config}` e `/api/congelados-publico/produto/:id/ficha` (uma chamada por produto). 51 produtos no catálogo, 51 fichas baixadas com sucesso (0 falhas).

**Importante para o bot:** os campos abaixo vêm da rota **pública do site** (visitante, sem login). Essa NÃO é a mesma API que o bot usa para atender o cliente pelo WhatsApp (`/api/ia-consulta/v1`) — lá o preço muda por cliente reconhecido e existem campos extras. As explicações da seção 3 abaixo (o que a API de IA acrescenta) servem para o bot cruzar as duas fontes, mas os dados numéricos deste dossiê vêm sempre da rota pública.

---

## 1. Catálogo (`GET /api/congelados-publico/catalogo`) — campo a campo

Cada item do catálogo representa um produto "vitrine" do site (existe uma tabela própria de produtos-no-site, ligada ao cadastro geral do sistema, o mesmo usado em Pedidos/PCP/Estoque).

| Campo | O que é | Como o bot deve usar |
|---|---|---|
| `id` | Identificador do produto **no site** (chave do carrinho). | Usar este `id` para montar o link/ação de compra, e para buscar a ficha (`/produto/{id}/ficha`) — **não confundir com `produtoId`**. |
| `produtoId` | Identificador do produto no cadastro geral do sistema (o mesmo produto usado em Pedidos, PCP etc.). | Uso interno/cruzamento com outras áreas do sistema; não precisa aparecer para o cliente. |
| `codigo` | Código interno do produto no sistema (texto livre, não é código de barras). | Pode citar como referência interna, mas não é o que o cliente reconhece — use o nome. |
| `nome` | Nome de exibição no site (pode ser um "apelido" cadastrado especificamente para o site, ou o nome bruto do sistema se não houver apelido). | Nome a usar ao falar com o cliente. |
| `descricao` | Texto descritivo do produto para o site (pode estar vazio — ver Inconsistências, item 3). | Usar quando existir; quando vazia, apoiar-se no nome + na composição da ficha. |
| `unidade` | Unidade de venda do cadastro geral (ex.: "PT" = pacote). Sigla curta, não é a quantidade. | Contexto apenas; a quantidade real está em `unidades`. |
| `unidades` | Quantas unidades do salgado vêm dentro de UMA embalagem vendida no site (ex.: 90 = pacote com 90 salgadinhos). | **Este é o "quantos vêm no pacote"** — responder direto perguntas tipo "quantos vêm na caixa?". |
| `embalagem` | Como o produto é vendido no site: `pacote`, `caixa`, `unidade`, `bandeja` ou `saco`. | Usar para descrever a embalagem ("vendido em pacotes de..."). |
| `grupo` | ID da categoria comercial do produto no sistema (relacional). | Uso interno para cruzar com `/grupos`. |
| `grupoNome` | Nome da categoria **lido ao vivo do cadastro geral do sistema** (não é o nome "bonito" do site — ver seção 4, é a origem da inconsistência mais visível deste levantamento). | **Não usar para exibir ao cliente.** Para o nome amigável do grupo, cruzar `grupo` (o id) com a resposta de `GET /grupos` (campo `nome` de lá). |
| `preco` | Preço de **tabela "Site"** — o preço genérico mostrado a qualquer visitante, sem login e sem cliente identificado. Recalculado a cada chamada (acréscimo da condição "Site" já aplicado). | **Não é necessariamente o preço que um cliente específico paga.** Quando o bot já reconheceu o telefone do cliente (via a API de IA, endpoint de reconhecimento por telefone), o preço real dele vem separado como `precoCliente`/`preco` naquele outro endpoint — sempre preferir esse quando disponível. Para visitante anônimo, este `preco` do catálogo público é o correto a informar. |
| `destaque` | Selo "mais pedido" na home do site — curadoria manual do dono. | Pode citar como "um dos mais pedidos" quando `true`. |
| `ordem` | Ordem de exibição manual no site. | Sem uso para o bot. |
| `imagem` | Caminho **relativo** da foto principal do produto (ex.: `/uploads/produtos/...`). **Precisa prefixar com a base** (`https://cahardt-github.xrqvlq.easypanel.host`) antes de usar/enviar. | No JSON entregue junto (`produtos-site-catalogo-completo.json`) os caminhos já vêm prefixados, prontos para uso. |
| `imagens` | Lista de todas as fotos do produto (a principal primeiro). Mesmo aviso de caminho relativo. | Usar `imagens[0]` como principal se quiser mostrar 1 foto só. |
| `preparo` | Rótulo curto do **grupo** do produto (não é por produto individual) — ex.: "Somente Aquecer", "Precisa Fritar", "Precisa Assar". Vem de uma configuração do admin do site por categoria, não do cadastro de cada produto. | Resposta rápida para "isso já vem pronto ou eu tenho que fritar?" — mas ver a ressalva importante na seção de Inconsistências (item 1): em quase metade dos produtos esse rótulo geral do grupo diverge do texto real de preparo impresso na etiqueta. Quando precisar de certeza, preferir o `modoPreparo` da ficha (texto específico daquele produto) e não só o `preparo` do catálogo. |
| `indisponivel` | `true` quando o estoque disponível do produto está zerado **neste momento** (é calculado ao vivo a cada chamada, não é uma marcação manual). | Nunca oferecer/vender um produto com `indisponivel: true`; ele pode voltar a ficar disponível a qualquer momento sem aviso, então sempre confira o campo mais recente, não uma cópia salva. |

---

## 2. Ficha do produto (`GET /api/congelados-publico/produto/:id/ficha`) — campo a campo

Repete `id`, `nome`, `codigo`, `unidade`, `unidades`, `embalagem`, `descricao`, `grupoNome`, `imagem`, `imagens` com o mesmo significado da seção 1 (mesma fonte, mesmas regras — inclusive o mesmo aviso sobre `grupoNome` não ser o nome amigável). O que a ficha acrescenta é o objeto `etiqueta` — os dados da etiqueta nutricional/regulatória cadastrada no PCP para aquele produto (pode ser `null` quando não existe etiqueta cadastrada — ver Inconsistências, item 4).

| Campo dentro de `etiqueta` | O que é | Unidade / observação |
|---|---|---|
| `pesoUnitario` | Peso de **uma unidade** do salgado. | Gramas. |
| `pesoPorcao` | Peso da porção usada para calcular a tabela nutricional (pode ser diferente do peso de 1 unidade — às vezes "porção" = 2 unidades). | Gramas. |
| `quantidadeEmbalagem` | Quantas unidades tem no pacote/caixa, segundo a etiqueta. | Deveria bater com `unidades` do catálogo (nos 51 produtos deste levantamento, bateu em 100% dos casos — não achamos divergência). |
| `quantidadeAproximada` | Se `true`, a quantidade acima é aproximada (produto vendido por peso, não por contagem exata). | Booleano. |
| `pesoPacote` | Peso fixo do pacote inteiro, quando cadastrado. `null` = não tem peso fixo cadastrado (o app calcula "na mão", pela conta unidades × peso unitário). | Gramas (mesmo quando a tela de cadastro deixa digitar em kg, o banco guarda em gramas). |
| `nutricional` | Objeto com `valorEnergetico`, `carboidratos`, `acucaresTotais`, `acucaresAdicionados`, `proteinas`, `gordurasTotais`, `gordurasSaturadas`, `gordurasTrans`, `fibraAlimentar`, `sodio`. | **Texto pronto, já formatado** (ex.: `"169kcal (12% VD)"`) — vem exatamente como foi digitado no cadastro da etiqueta; o bot deve usar o texto como está, sem tentar recalcular %. Campo pode vir `null` individualmente quando não preenchido. |
| `composicao` | Lista de ingredientes (texto livre). | — |
| `modoPreparo` | Instrução de preparo **específica daquele produto**, digitada no cadastro da etiqueta (ex.: "Colocar o produto ainda congelado, em óleo pré-aquecido..."). | **Esta é a fonte mais confiável de como preparar aquele produto especificamente** — mais confiável que o `preparo` genérico do grupo (catálogo). |
| `armazenamento` | Instrução de conservação (ex.: "Congelar -12ºC. Após descongelado, não recongelar."). | Texto livre. |
| `validadeDias` | Validade a partir do congelamento/fabricação. | Dias. |
| `contemGluten` / `contemLactose` | Declaração obrigatória (ANVISA). | Booleano. |
| `alergenos` | Lista de alérgenos declarados (ex.: `["Trigo","Leite"]`). | Array de texto. |

---

## 3. Campos extras da API de IA (`/api/ia-consulta/v1`) — o que existe além deste dossiê

Este dossiê usa a rota **pública do site**. A IA de atendimento (Ana, via WhatsApp) tem acesso a um endpoint próprio que soma campos extras por cima do catálogo — chave não disponível para gerar este dossiê, então a explicação abaixo é a partir do código-fonte (`backend/services/iaProdutoSerializer.js`), para o time do bot saber que eles existem e o que significam:

- **`nomeCurto`** — nome "limpo" do produto: se houver um nome digitado à mão na etiqueta (`nomeProduto`), usa esse; senão tenta limpar o nome bruto do sistema por regras automáticas (tira prefixos tipo código, tamanho `P/M/G/GG`, `C/30`, peso em "GR").
- **`tamanho`** — letra `P`, `M`, `G` ou `GG` extraída do padrão do nome interno do produto, quando existir. Pode vir vazio — nem todo nome segue esse padrão.
- **`pesoUnidadeG`** — peso de 1 unidade em gramas: prioriza o valor cadastrado na etiqueta; só tenta adivinhar pelo nome do produto quando não há etiqueta.
- **`embalagemInfo`** — objeto com `rotulo` (pacote/caixa/etc.), `unidade`, `unidadesPorEmbalagem` (calculado numa ordem de prioridade: primeiro o cadastro do site, depois a etiqueta, depois o cadastro geral, por último um regex no nome) e `pesoG` (peso do pacote, fixo se cadastrado ou calculado).
- **`preparoTipo`** — classificação automática do rótulo `preparo` do grupo em 4 categorias fechadas: `FRITO`, `ASSADO`, `PRONTO` ou `CRU` (ou `null` se não bater em nenhuma). É derivado do MESMO rótulo genérico do grupo (catálogo), **não** do `modoPreparo` da etiqueta — o código evita ler o texto da etiqueta aqui de propósito, porque frases como "Não fritar, assar..." confundiriam uma leitura simples.
- **`modoPreparo`** — o mesmo texto da etiqueta (seção 2), cortado em 300 caracteres.
- **`etiqueta`** (resumido) — só 5 campos: `codigoBarras`, `alergenos`, `contemGluten`, `contemLactose`, `armazenamento`.
- **`precoTabela`** — preço de tabela (igual ao `preco` deste dossiê).
- **`precoCliente`** — preço real do cliente reconhecido (histórico de negociação + piso de desconto), só preenchido quando a IA já identificou o telefone do cliente. **Este é o preço a informar quando o bot já sabe quem é o cliente** — não o `preco`/`precoTabela` genérico.
- **`preco`** — atalho: `precoCliente` quando existe, senão `precoTabela`.
- **`disponivel`** — igual ao `!indisponivel` deste dossiê.
- **`promocao`** — preenchido só quando há promoção vigente para aquele produto (preço promocional já com o acréscimo da condição aplicado); `null` quando não há promoção.

**Preço — confirmação:** sim, o `preco` deste dossiê (catálogo público) é sempre o preço da tabela genérica "Site", igual para qualquer visitante, sem histórico de negociação. O preço específico de cada cliente (`precoCliente`) só existe depois que a Ana reconhece o telefone de quem está mandando mensagem — nunca a partir de CPF/CNPJ digitado sozinho.

---

## 4. Legenda dos grupos — e por que o nome do grupo pode aparecer diferente em dois lugares

Existem **duas fontes de nome para o mesmo grupo**, e elas podem divergir:

1. **`grupoNome`** dentro de cada produto (catálogo/ficha) — é lido **ao vivo** do cadastro geral de categorias do sistema (o mesmo usado em PCP/Estoque). É o nome "técnico/operacional" da categoria, digitado por quem cadastra produtos — às vezes reflete como o produto foi agrupado internamente, não como o site quer apresentar ao cliente.
2. **O `nome` retornado por `GET /grupos`** — é o nome "**amigável do site**", que pode ter sido customizado numa tela própria do admin do site (`categoriasNomes`), independente do nome técnico. Quando não há customização, cai no mesmo nome técnico do item 1.

**Recomendação para o bot:** para exibir o nome do grupo ao cliente, sempre cruzar o `grupo` (id) do produto com a lista de `/grupos` — nunca usar `grupoNome` do próprio produto como o nome "bonito" a mostrar.

A tabela abaixo é a legenda oficial dos 6 grupos usados pelos 51 produtos deste catálogo, com o nome amigável do site e o preparo oficial de cada grupo (fonte única do "preparo esperado": a mesma configuração `categoriasNomes` que alimenta tanto `/grupos` quanto o campo `preparo` do catálogo):

| ID do grupo | Nome amigável (site, `/grupos`) | Preparo oficial do grupo | O que significa |
|---|---|---|---|
| `337b5e88-...` | **Assados** | Somente Aquecer | Salgados já cozidos/pré-assados — só esquentar antes de servir. **Atenção:** o nome técnico gravado nos produtos deste grupo (`grupoNome`) é **"H22 Mini Salgados 22 gramas"**, bem diferente de "Assados" — ver Inconsistências, item 2. |
| `0da2c06c-...` | **Assar** | Precisa Assar | Produto cru, precisa ir ao forno antes de servir. |
| `8749505b-...` | **Aquecer** | Somente Aquecer | Já pronto, só esquentar. |
| `83936f52-...` | **Fritos** | Somente Aquecer | Salgados já fritos previamente — em teoria só esquentar (mas ver item 1 das inconsistências: boa parte manda assar no forno na prática). |
| `6b469a55-...` | **Fritar** | Precisa Fritar | Produto cru, precisa fritar em óleo antes de servir. |
| `8a8477a5-...` | **Mini Fritar** | Precisa Fritar | Versão mini dos salgados para fritar. |

---

## 5. Tabela dos 51 produtos


> Peso unitário/pacote e "un./pacote" vêm da etiqueta quando existe (senão, `unidades` do catálogo). "Preparo" é o rótulo do grupo (ver ressalva do item 1 abaixo). "—" = dado não cadastrado.

| Código | Nome (site) | Nome (etiqueta) | Grupo (site) | Preparo | Peso unit. (g) | Un./pacote | Peso pacote (g) | Preço site | Glúten | Lactose | Indisponível |
|---|---|---|---|---|---|---|---|---|---|---|---|
|H22MI1|FESTA-BOCADINHO DE PALMITO 22GR|FESTA-BOCADINHO DE PALMITO 22GR|Assados|Somente Aquecer|22|90|2000|R$ 60.62|sim|não||
|H22MI2|FESTA-BOLINHA DE QUEIJO 22GR|FESTA-BOLINHA DE QUEIJO 22GR|Assados|Somente Aquecer|22|90|2000|R$ 60.62|sim|sim||
|H22MI3|FESTA-CHURROS DOCE DE LEITE 22GR|FESTA-CHURROS DOCE DE LEITE 22GR|Assados|Somente Aquecer|—|90|—|R$ 40.50|—|—||
|H22MI4|FESTA-COXINHA DE FRANGO 22GR|FESTA-COXINHA DE FRANGO 22GR|Assados|Somente Aquecer|22|90|2000|R$ 60.62|sim|não||
|H22MI5|FESTA-COXINHA DE LINGUIÇA BLUMENAU 22GR|FESTA-COXINHA DE LINGUIÇA BLUMENAU 22GR|Assados|Somente Aquecer|—|90|—|R$ 40.50|—|—||
|H22MI6|FESTA-CROQUETE DE CARNE 22GR|FESTA-CROQUETE DE CARNE 22GR|Assados|Somente Aquecer|22|90|2000|R$ 60.62|sim|não||
|H22MI8|FESTA-TRAVESSEIRO DE PIZZA 22GR|FESTA-TRAVESSEIRO DE PIZZA 22GR|Assados|Somente Aquecer|22|90|2000|R$ 60.62|sim|sim||
|3081|Mini Coxinha de Frango 30gr|Mini Coxinha de Frango 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 40.49|sim|não||
|3082|Mini Bolinha de Queijo 30gr|Mini Bolinha de Queijo 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 40.49|sim|sim||
|3083|Mini Croquete de Carne 30gr|Mini Croquete de Carne 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 40.49|sim|não||
|3084|Mini Bocadinho Palmito 30gr|Mini Bocadinho Palmito 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 40.49|sim|não||
|3085|Mini Travesseiro Pizza 30gr|Mini Travesseiro Pizza 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 40.49|sim|sim||
|3972|Mini Kibe Carne 30gr|Mini Kibe Carne 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 55.22|sim|não||
|4091|Mini Churros Doce de Leite 30gr|Mini Churros Doce de Leite 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 40.49|sim|não||
|5183|Mini Salsicha 30gr|Mini Salsicha 30gr|Mini Fritar|Precisa Fritar|25|50|1250|R$ 40.49|sim|não||
|5286|Mini Coxinha Linguiça Blumenau 30gr|Mini Coxinha Linguiça Blumenau 30gr|Mini Fritar|Precisa Fritar|28|50|1400|R$ 47.24|sim|não||
|3086|DOGUINHO C/ 2 SALSICHA 220gr|DOGUINHO C/ 2 SALSICHA 220gr|Aquecer|Somente Aquecer|190|8|1520|R$ 62.78|sim|sim||
|3087|HAMBURGÃO C/ CHEEDAR E CEBOLA 280gr|HAMBURGÃO C/ CHEEDAR E CEBOLA 280gr|Aquecer|Somente Aquecer|280|5|1400|R$ 46.06|sim|não||
|3088|ENROLADINHO DE FRANGO 140gr|ENROLADINHO DE FRANGO 140gr|Aquecer|Somente Aquecer|140|8|1120|R$ 48.47|sim|não||
|3272|ENROLADINHO DE PIZZA 140gr|ENROLADINHO DE PIZZA 140gr|Aquecer|Somente Aquecer|140|8|1120|R$ 48.47|sim|não||
|3609|TORTINHA PALMITO 130gr|TORTINHA PALMITO 130gr|Aquecer|Somente Aquecer|110|8|880|R$ 62.09|sim|sim||
|3611|TORTINHA FRANGO E REQUEIJÃO 130gr|TORTINHA FRANGO E REQUEIJÃO 130gr|Aquecer|Somente Aquecer|110|8|880|R$ 62.09|sim|sim||
|3728|TORTINHA CAMARÃO 135gr|TORTINHA CAMARÃO 135gr|Aquecer|Somente Aquecer|110|8|880|R$ 71.54|sim|sim||
|4032|TORTINHA FRANGO E PALMITO MASSA INTEGRAL 130gr|TORTINHA FRANGO E PALMITO MASSA INTEGRAL 130gr|Aquecer|Somente Aquecer|110|8|880|R$ 62.09|sim|sim||
|4614|TORTINHA CARNE 130gr|TORTINHA CARNE 130gr|Aquecer|Somente Aquecer|110|8|880|R$ 62.09|sim|sim||
|4765|EMPADINHA DE FRANGO 32gr|EMPADINHA DE FRANGO 32gr|Aquecer|Somente Aquecer|30|50|1400|R$ 62.03|sim|sim||
|5040|EMPADINHA DE PALMITO 32gr|EMPADINHA DE PALMITO 32gr|Aquecer|Somente Aquecer|30|50|1400|R$ 62.03|sim|não||
|5200|ENROLADINHO DE CALABRESA 140gr|ENROLADINHO DE CALABRESA 140gr|Aquecer|Somente Aquecer|140|8|1120|R$ 48.47|sim|não||
|3051|COXINHA FRANGO MASSA AIPIM G FRITO 130gr|COXINHA FRANGO MASSA AIPIM G FRITO 130gr|Fritos|Somente Aquecer|127|20|2540|R$ 66.14|sim|não||
|3065|BOLINHO CARNE FRITO 150gr|BOLINHO CARNE FRITO 150gr|Fritos|Somente Aquecer|—|10|—|R$ 74.25|—|—||
|3069|RISOLES DE CARNE FRITO 140GR|RISOLES DE CARNE FRITO 140GR|Fritos|Somente Aquecer|130|10|1300|R$ 44.54|sim|não||
|3070|RISOLES DE PIZZA FRITO 140GR|RISOLES DE PIZZA FRITO 140GR|Fritos|Somente Aquecer|130|10|1300|R$ 44.54|sim|não||
|3079|EMPANADO SALSICHA 140gr|EMPANADO SALSICHA 140gr|Fritos|Somente Aquecer|130|10|1300|R$ 49.69|sim|não|SIM|
|3333|ESPETINHO FRANGO C/ BACON 120gr|ESPETINHO FRANGO C/ BACON 120gr|Fritos|Somente Aquecer|140|10|1400|R$ 74.25|sim|não||
|5023|MÉDIO COXINHA FRANGO MASSA AIMPIM FRITO 60GR|MÉDIO COXINHA FRANGO MASSA AIMPIM FRITO 60GR|Fritos|Somente Aquecer|63|30|1890|R$ 59.39|sim|não||
|5182|COXINHA FRANGO C/ REQUEIJÃO Gigante FRITO 170gr|COXINHA FRANGO C/ REQUEIJÃO Gigante FRITO 170gr|Fritos|Somente Aquecer|165|10|1650|R$ 52.64|sim|não||
|5298|MÉDIO COXINHA LINGUIÇA BLUMENAU FRITO 65GR|MÉDIO COXINHA LINGUIÇA BLUMENAU FRITO 65GR|Fritos|Somente Aquecer|63|30|1890|R$ 63.44|sim|não||
|3071|CALZONE FRANGO C/ REQUEIJÃO 160gr|CALZONE FRANGO C/ REQUEIJÃO 160gr|Assar|Precisa Assar|135|8|1080|R$ 53.93|sim|sim||
|3072|CALZONE CALABRESA C/CHEEDAR 160gr|CALZONE CALABRESA C/CHEEDAR 160gr|Assar|Precisa Assar|135|8|1080|R$ 53.93|sim|sim||
|3073|CALZONE CARNE C/ REQUEIJÃO 160gr|CALZONE CARNE C/ REQUEIJÃO 160gr|Assar|Precisa Assar|135|8|1080|R$ 53.93|sim|sim||
|1|COXINHA FRANGO MASSA AIPIM G 130GR|COXINHA FRANGO MASSA AIPIM G 130GR|Fritar|Precisa Fritar|127|20|2540|R$ 63.44|sim|não||
|3059|COXINHA FRANGO TRADICIONAL G 130GR|COXINHA FRANGO TRADICIONAL G 130GR|Fritar|Precisa Fritar|127|20|2540|R$ 63.44|sim|não||
|3062|RISOLES DE PIZZA G 140GR|RISOLES DE PIZZA G 140GR|Fritar|Precisa Fritar|130|10|1300|R$ 35.09|sim|não||
|3063|RISOLES DE CARNE G 140GR|RISOLES DE CARNE G 140GR|Fritar|Precisa Fritar|130|10|1300|R$ 35.09|sim|não||
|3078|EMPANADO SALSICHA G 140GR|EMPANADO SALSICHA G 140GR|Fritar|Precisa Fritar|130|10|1300|R$ 47.24|sim|não||
|4809|MÉDIO CROQUETE CARNE 60GR|MÉDIO CROQUETE CARNE 60GR|Fritar|Precisa Fritar|63|30|1890|R$ 51.29|sim|não||
|4824|MÉDIO TRAVESSEIRO PIZZA 60GR|MÉDIO TRAVESSEIRO PIZZA 60GR|Fritar|Precisa Fritar|63|30|1890|R$ 51.29|sim|sim||
|4826|MÉDIO COXINHA FRANGO MASSA AIPIM 60GR|MÉDIO COXINHA FRANGO MASSA AIPIM 60GR|Fritar|Precisa Fritar|63|30|1890|R$ 51.29|sim|não||
|5128|MÉDIO BOLINHA DE QUEIJO 60GR|MÉDIO BOLINHA DE QUEIJO 60GR|Fritar|Precisa Fritar|63|30|1890|R$ 51.29|sim|sim||
|5151|COXINHA FRANGO C/ REQUEIJÃO GIGANTE 170GR|COXINHA FRANGO C/ REQUEIJÃO GIGANTE 170GR|Fritar|Precisa Fritar|165|10|1650|R$ 47.24|sim|sim||
|5296|MÉDIO COXINHA LINGUIÇA BLUMENAU 65GR|MÉDIO COXINHA LINGUIÇA BLUMENAU 65GR|Fritar|Precisa Fritar|63|30|1890|R$ 53.99|sim|não||

## 6. Ficha resumida de cada produto

> Composição, modo de preparo, armazenamento, validade, alérgenos e nutricional resumido, produto a produto — para o bot responder dúvidas específicas sem inventar.

### H22MI1 — FESTA-BOCADINHO DE PALMITO 22GR

- **Grupo:** Assados (preparo do site: *Somente Aquecer*)
- **Descrição (site):** PRODUTO COM 22 GRAMAS APROXIMADAMENTE E PACOTE COM 2KG
- **Embalagem:** pacote, 90 un. — **Preço site (tabela genérica):** R$ 60.62
- **Peso unitário:** 22g (aproximado)
- **Peso do pacote:** 2000g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Palmito pupunha, Óleo de soja, Sal, Margarina, Azeitonas verdes, Leite integral em pó, Vinagre, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 22g):** Valor energético: 22kcal (1% VD) · Carboidratos: 4,5g (2% VD) · Proteínas: 0,4g (1% VD) · Gorduras totais: 0,3g (0% VD) · Gorduras saturadas: 0,0g (0% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,4g (2% VD) · Sódio: 136mg (7% VD)


### H22MI2 — FESTA-BOLINHA DE QUEIJO 22GR

- **Grupo:** Assados (preparo do site: *Somente Aquecer*)
- **Descrição (site):** PRODUTO COM 22 GRAMAS APROXIMADAMENTE E PACOTE COM 2KG
- **Embalagem:** pacote, 90 un. — **Preço site (tabela genérica):** R$ 60.62
- **Peso unitário:** 22g (aproximado)
- **Peso do pacote:** 2000g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de Trigo, Queijo mussarela, Fubá, Sal, Margarina, Óleo de soja, Queijo provolone, Leite integral, Orégano, Cebolinha verde, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Leite
- **Nutricional (porção de 22g):** Valor energético: 27kcal (1% VD) · Carboidratos: 4,5g (2% VD) · Proteínas: 0,7g (1% VD) · Gorduras totais: 0,6g (1% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,3g (1% VD) · Sódio: 116mg (6% VD)


### H22MI3 — FESTA-CHURROS DOCE DE LEITE 22GR

- **Grupo:** Assados (preparo do site: *Somente Aquecer*)
- **Descrição (site):** PRODUTO COM 22 GRAMAS APROXIMADAMENTE E PACOTE COM 2KG
- **Embalagem:** pacote, 90 un. — **Preço site (tabela genérica):** R$ 40.50
- **Ficha existe, mas sem etiqueta/dados nutricionais cadastrados** (composição, modo de preparo, alérgenos: nenhum disponível).


### H22MI4 — FESTA-COXINHA DE FRANGO 22GR

- **Grupo:** Assados (preparo do site: *Somente Aquecer*)
- **Descrição (site):** PRODUTO COM 22 GRAMAS APROXIMADAMENTE E PACOTE COM 2KG
- **Embalagem:** pacote, 90 un. — **Preço site (tabela genérica):** R$ 60.62
- **Peso unitário:** 22g (aproximado)
- **Peso do pacote:** 2000g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Peito de frango, Óleo de soja, Cebola, Sal, Proteína de soja, Margarina, Caldo de galinha, Colorífico, Cebolinha verde, Glutamato monossódico, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 22g):** Valor energético: 25kcal (1% VD) · Carboidratos: 4,8g (2% VD) · Proteínas: 0,9g (2% VD) · Gorduras totais: 0,3g (0% VD) · Gorduras saturadas: 0,0g (0% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,4g (2% VD) · Sódio: 113mg (6% VD)


### H22MI5 — FESTA-COXINHA DE LINGUIÇA BLUMENAU 22GR

- **Grupo:** Assados (preparo do site: *Somente Aquecer*)
- **Descrição (site):** PRODUTO COM 22 GRAMAS APROXIMADAMENTE E PACOTE COM 2KG
- **Embalagem:** pacote, 90 un. — **Preço site (tabela genérica):** R$ 40.50
- **Ficha existe, mas sem etiqueta/dados nutricionais cadastrados** (composição, modo de preparo, alérgenos: nenhum disponível).


### H22MI6 — FESTA-CROQUETE DE CARNE 22GR

- **Grupo:** Assados (preparo do site: *Somente Aquecer*)
- **Descrição (site):** PRODUTO COM 22 GRAMAS APROXIMADAMENTE E PACOTE COM 2KG
- **Embalagem:** pacote, 90 un. — **Preço site (tabela genérica):** R$ 60.62
- **Peso unitário:** 22g (aproximado)
- **Peso do pacote:** 2000g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Carne bovina, Cebola, Açúcar, Banha, Caldo de carne, Cebolinha verde, Proteína de soja, Glutamato monossódico, Margarina, Sal, Pimenta do reino, Óleo de soja, Leite integral, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 22g):** Valor energético: 31kcal (2% VD) · Carboidratos: 5,0g (2% VD) · Proteínas: 1,1g (2% VD) · Gorduras totais: 0,6g (1% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,4g (2% VD) · Sódio: 119mg (6% VD)


### H22MI8 — FESTA-TRAVESSEIRO DE PIZZA 22GR

- **Grupo:** Assados (preparo do site: *Somente Aquecer*)
- **Descrição (site):** PRODUTO COM 22 GRAMAS APROXIMADAMENTE E PACOTE COM 2KG
- **Embalagem:** pacote, 90 un. — **Preço site (tabela genérica):** R$ 60.62
- **Peso unitário:** 22g (aproximado)
- **Peso do pacote:** 2000g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de Trigo, Caldo legumes, Queijo mussarela, Queijo provolone, Orégano, Margarina, Sal, Óleo de soja, Leite integral, Apresuntado, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 22g):** Valor energético: 28kcal (1% VD) · Carboidratos: 5,0g (2% VD) · Proteínas: 0,7g (1% VD) · Gorduras totais: 0,5g (1% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,4g (2% VD) · Sódio: 119mg (6% VD)


### 3081 — Mini Coxinha de Frango 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 40.49
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Peito de frango, Óleo de soja, Cebola, Sal, Proteína de soja, Margarina, Caldo de galinha, Colorífico, Cebolinha verde, Glutamato monossódico, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 28g):** Valor energético: 32kcal (2% VD) · Carboidratos: 6,1g (2% VD) · Proteínas: 1,1g (1% VD) · Gorduras totais: 0,4g (1% VD) · Gorduras saturadas: 0,0g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,5g (2% VD) · Sódio: 144mg (6% VD)


### 3082 — Mini Bolinha de Queijo 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 40.49
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de Trigo, Queijo mussarela, Fubá, Sal, Margarina, Óleo de soja, Queijo provolone, Leite integral, Orégano, Cebolinha verde, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Leite, Trigo
- **Nutricional (porção de 28g):** Valor energético: 34kcal (2% VD) · Carboidratos: 5,7g (2% VD) · Proteínas: 0,9g (1% VD) · Gorduras totais: 0,8g (1% VD) · Gorduras saturadas: 0,3g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,4g (2% VD) · Sódio: 147mg (6% VD)


### 3083 — Mini Croquete de Carne 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 40.49
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Carne bovina, Cebola, Açúcar, Banha, Caldo de carne, Cebolinha verde, Proteína de soja, Glutamato monossódico, Margarina, Sal, Pimenta do reino, Óleo de soja, Leite integral, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 28g):** Valor energético: 40kcal (2% VD) · Carboidratos: 6,4g (2% VD) · Proteínas: 1,4g (2% VD) · Gorduras totais: 0,7g (1% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,5g (2% VD) · Sódio: 152mg (6% VD)


### 3084 — Mini Bocadinho Palmito 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 40.49
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Palmito pupunha, Óleo de soja, Sal, Margarina, Azeitonas verdes, Leite integral em pó, Vinagre, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite
- **Nutricional (porção de 28g):** Valor energético: 30kcal (2% VD) · Carboidratos: 6,2g (2% VD) · Proteínas: 0,5g (1% VD) · Gorduras totais: 0,4g (1% VD) · Gorduras saturadas: 0,0g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,5g (2% VD) · Sódio: 186mg (8% VD)


### 3085 — Mini Travesseiro Pizza 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 40.49
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de Trigo, Caldo legumes, Queijo mussarela, Queijo provolone, Orégano, Margarina, Sal, Óleo de soja, Leite integral, Apresuntado, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite
- **Nutricional (porção de 28g):** Valor energético: 35kcal (2% VD) · Carboidratos: 6,4g (2% VD) · Proteínas: 0,9g (1% VD) · Gorduras totais: 0,6g (1% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,5g (2% VD) · Sódio: 151mg (6% VD)


### 3972 — Mini Kibe Carne 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 55.22
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de kibe, Carne bovina, Cebola, Pimenta do reino, Hortelã, Caldo de carne, Sal
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 28g):** Valor energético: 41kcal (2% VD) · Carboidratos: 4,2g (1% VD) · Proteínas: 3,4g (5% VD) · Gorduras totais: 1,1g (2% VD) · Gorduras saturadas: 0,4g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,9g (4% VD) · Sódio: 151mg (6% VD)


### 4091 — Mini Churros Doce de Leite 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 40.49
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Margarina, Sal, Óleo de soja, Leite em pó, Açúcar, Doce de leite
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Leite, Trigo, Soja
- **Nutricional (porção de 28g):** Valor energético: 49kcal (2% VD) · Carboidratos: 9,2g (3% VD) · Proteínas: 1,0g (1% VD) · Gorduras totais: 0,9g (2% VD) · Gorduras saturadas: 0,4g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,4g (2% VD) · Sódio: 148mg (6% VD)


### 5183 — Mini Salsicha 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 40.49
- **Peso unitário:** 25g (aproximado)
- **Peso do pacote:** 1250g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Sal, Óleo de soja, Cebolinha verde, Salsicha, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 25g):** Valor energético: 34kcal (2% VD) · Carboidratos: 5,7g (2% VD) · Proteínas: 0,9g (1% VD) · Gorduras totais: 0,8g (1% VD) · Gorduras saturadas: 0,3g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,4g (2% VD) · Sódio: 147mg (6% VD)


### 5286 — Mini Coxinha Linguiça Blumenau 30gr

- **Grupo:** Mini Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 47.24
- **Peso unitário:** 28g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de Trigo, Mandioca, Caldo Legumes, Linguiça Blumenau Defumada, Requeijão Cremoso, Óleo de Soja, Margarina, Caldo de Legumes, Sal refinado, cheiro verde, Farinha Rosca
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 28g):** Valor energético: 47kcal (2% VD) · Carboidratos: 7g (2% VD) · Proteínas: 1,3g (3% VD) · Gorduras totais: 1,5g (2% VD) · Gorduras saturadas: 0,5g (3% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,3g (1% VD) · Sódio: 145mg (7% VD)


### 3086 — DOGUINHO C/ 2 SALSICHA 220gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 62.78
- **Peso unitário:** 190g
- **Peso do pacote:** 1520g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Margarina, Oleo, Água, Sal, Açúcar, Fermento químico, Requeijão Hardt, Molho de tomate, Salsicha tipo hot dog, Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 190g):** Valor energético: 418kcal (21% VD) · Carboidratos: 37g (12% VD) · Proteínas: 22g (29% VD) · Gorduras totais: 20g (37% VD) · Gorduras saturadas: 7,2g (33% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,8g (8% VD) · Sódio: 1974mg (82% VD)


### 3087 — HAMBURGÃO C/ CHEEDAR E CEBOLA 280gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 5 un. — **Preço site (tabela genérica):** R$ 46.06
- **Peso unitário:** 280g
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Margarina, Sal, Açúcar, Fermento químico, Hambúrguer misto, Cebola caramelizada, Requeijão cheedar Hardt, Ovos, Gergelim branco
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 280g):** Valor energético: 432kcal (22% VD) · Carboidratos: 48g (16% VD) · Proteínas: 21g (28% VD) · Gorduras totais: 17g (31% VD) · Gorduras saturadas: 7g (35% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,9g (8% VD) · Sódio: 1046mg (59% VD)


### 3088 — ENROLADINHO DE FRANGO 140gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 48.47
- **Peso unitário:** 140g
- **Peso do pacote:** 1120g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Peito de frango, Cebola, Proteína de soja, Margarina, Óleo de soja, Açúcar, Sal, Caldo de galinha, Colorífico, Fermento químico, Cebolinha verde, Glutamato monossódico, Pimenta do reino e Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 140g):** Valor energético: 339kcal (17% VD) · Carboidratos: 43,6g (15% VD) · Proteínas: 13,3g (18% VD) · Gorduras totais: 8g (14% VD) · Gorduras saturadas: 3,9g (18% VD) · Gorduras trans: 0,5g (0% VD) · Fibra alimentar: 3,0g (12% VD) · Sódio: 462mg (19% VD)


### 3272 — ENROLADINHO DE PIZZA 140gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 48.47
- **Peso unitário:** 140g
- **Peso do pacote:** 1120g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Apresuntado, Proteína de soja, Margarina, Queijo provolone, Leite integral em pó, Sal, Fermento químico, Cebolinha verde, Orégano e Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Leite, Ovos
- **Nutricional (porção de 140g):** Valor energético: 236kcal (12% VD) · Carboidratos: 41,2g (4% VD) · Proteínas: 7,0g (9% VD) · Gorduras totais: 4,9g (9% VD) · Gorduras saturadas: 1,7g (8% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 3,3g (13% VD) · Sódio: 437mg (18% VD)


### 3609 — TORTINHA PALMITO 130gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 62.09
- **Peso unitário:** 110g
- **Peso do pacote:** 880g
- **Validade:** 180 dias
- **Composição:** Gordura Animal, Farinha de Trigo, Sal, Açúcar, Ovos, Pimenta do Reino, Palmito Pupunha, Cheiro Verde, Azeitona, Óleo vegetal, Glutamato, Papel de Arroz, Ovos, Requeijão Culinário Hardt.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter a embalagem bem fechada para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 110g):** Valor energético: 385kcal (17% VD) · Carboidratos: 39g (13% VD) · Proteínas: 7,9g (10% VD) · Gorduras totais: 22g (40% VD) · Gorduras saturadas: 10g (47% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,5g (6% VD) · Sódio: 718mg (30% VD)


### 3611 — TORTINHA FRANGO E REQUEIJÃO 130gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 62.09
- **Peso unitário:** 110g
- **Peso do pacote:** 880g
- **Validade:** 180 dias
- **Composição:** Gordura Animal, Farinha de Trigo, Sal, Açúcar, Ovos, Tomate, Cebola, Pimenta do Reino, Frango, Cheiro Verde, Óleo Vegetal, Glutamato, Papel de Arroz, Requeijão Culinário Hardt.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter a embalagem bem fechada para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 110g):** Valor energético: 340kcal (17% VD) · Carboidratos: 32g (11% VD) · Proteínas: 10g (13% VD) · Gorduras totais: 19g (34% VD) · Gorduras saturadas: 9,1g (41% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,2g (5% VD) · Sódio: 530mg (22% VD)


### 3728 — TORTINHA CAMARÃO 135gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 71.54
- **Peso unitário:** 110g
- **Peso do pacote:** 880g
- **Validade:** 180 dias
- **Composição:** Gordura Animal, Farinha de Trigo, Sal, Açúcar, Ovos, Tomate, Cebola, Pimenta do Reino, Camarão, Cheiro Verde, Amido Milho, Colorífico, Gordura Animal,  Óleo Vegetal, Glutamato, Caldo Frutos do Mar, Requeijão Culinário Hardt
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Leite, Ovos, Trigo, Soja, Crustáceos
- **Nutricional (porção de 110g):** Valor energético: 361kcal (18% VD) · Carboidratos: 35g (12% VD) · Proteínas: 7,7g (10% VD) · Gorduras totais: 21g (38% VD) · Gorduras saturadas: 9,8g (45% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,2g (5% VD) · Sódio: 432mg (22% VD)


### 4032 — TORTINHA FRANGO E PALMITO MASSA INTEGRAL 130gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 62.09
- **Peso unitário:** 110g
- **Peso do pacote:** 880g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Sal, Açúcar, Tomate, Cebola, Alho, Pimenta do reino, Cebolinha verde, Peito de frango, Óleo de soja, Glutamato monossódico, Requeijão Hardt, Palmito pupunha, Papel de arroz e Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 110g):** Valor energético: 340kcal (17% VD) · Carboidratos: 32g (11% VD) · Proteínas: 10g (13% VD) · Gorduras totais: 19g (34% VD) · Gorduras saturadas: 9,1g (41% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,2g (5% VD) · Sódio: 530mg (22% VD)


### 4614 — TORTINHA CARNE 130gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 62.09
- **Peso unitário:** 110g
- **Peso do pacote:** 880g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Gordura Animal, Margarina, Sal, Açúcar, Tomate, Cebola, Alho, Pimenta do reino, Cebolinha verde, Carne bovina, Óleo de soja, Glutamato monossódico, Proteína de soja, Pimentão vermelho, Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 110g):** Valor energético: 443kcal (22% VD) · Carboidratos: 42g (14% VD) · Proteínas: 13g (18% VD) · Gorduras totais: 25g (45% VD) · Gorduras saturadas: 11g (49% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,4g (6% VD) · Sódio: 880mg (37% VD)


### 4765 — EMPADINHA DE FRANGO 32gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 62.03
- **Peso unitário:** 30g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de Trigo, Peito frango, Leite Integral, Banha, Margarina, Cebola, Queijo parmesão, Sal, Óleo de soja, Caldo de galinha, Colorífico, Cheiro verde, Ovos, Pimenta do reino
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 30g):** Valor energético: 155kcal (8% VD) · Carboidratos: 13,5g (4% VD) · Proteínas: 5,8g (8% VD) · Gorduras totais: 8,7g (16% VD) · Gorduras saturadas: 2,0g (9% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 4,6g (18% VD) · Sódio: 247mg (10% VD)


### 5040 — EMPADINHA DE PALMITO 32gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 50 un. — **Preço site (tabela genérica):** R$ 62.03
- **Peso unitário:** 30g (aproximado)
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Farinha de Trigo, Palmito Pupunha, Leite Integral, Banha suína, Margarina, Cebola, Queijo parmesão, Sal, Óleo de soja, Azeitonas verdes, Vinagre, Ovos, Pimenta do reino
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 30g):** Valor energético: 138kcal (7% VD) · Carboidratos: 13,4g (4% VD) · Proteínas: 2,7g (4% VD) · Gorduras totais: 8,2g (15% VD) · Gorduras saturadas: 2,2g (10% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,9g (4% VD) · Sódio: 247mg (10% VD)


### 5200 — ENROLADINHO DE CALABRESA 140gr

- **Grupo:** Aquecer (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 48.47
- **Peso unitário:** 140g
- **Peso do pacote:** 1120g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Calabresa defumada, Proteína de soja, Margarina, Cebolinha verde, Requeijão cheedar Hardt, Leite integral em pó, Sal, Fermento biológico, Orégano, Ovos.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 140g):** Valor energético: 236kcal (12% VD) · Carboidratos: 41,2g (4% VD) · Proteínas: 7,0g (9% VD) · Gorduras totais: 4,9g (9% VD) · Gorduras saturadas: 1,7g (8% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 3,3g (13% VD) · Sódio: 437mg (18% VD)


### 3051 — COXINHA FRANGO MASSA AIPIM G FRITO 130gr

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 20 un. — **Preço site (tabela genérica):** R$ 66.14
- **Peso unitário:** 127g
- **Peso do pacote:** 2540g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de trigo, Peito de frango, Mandioca cozida, Cebola, Cebolinha verde, Sal, Margarina, Proteína de soja, Óleo de soja, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 127g):** Valor energético: 674kcal (8% VD) · Carboidratos: 23g (8% VD) · Proteínas: 6,2g (8% VD) · Gorduras totais: 4,9g (9% VD) · Gorduras saturadas: 0,8g (4% VD) · Gorduras trans: 0,1g (0% VD) · Fibra alimentar: 1,9g (8% VD) · Sódio: 385mg (16% VD)


### 3065 — BOLINHO CARNE FRITO 150gr

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 74.25
- **Ficha existe, mas sem etiqueta/dados nutricionais cadastrados** (composição, modo de preparo, alérgenos: nenhum disponível).


### 3069 — RISOLES DE CARNE FRITO 140GR

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 44.54
- **Peso unitário:** 130g
- **Peso do pacote:** 1300g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Caldo legumes, Carne bovina, Cebola, Sal, Óleo de soja, Margarina, Caldo de carne, Colorau, Cebolinha verde, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 130g):** Valor energético: 160kcal (8% VD) · Carboidratos: 29g (10% VD) · Proteínas: 6,3g (8% VD) · Gorduras totais: 2,1g (4% VD) · Gorduras saturadas: 0,7g (3% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,9g (7% VD) · Sódio: 746mg (31% VD)


### 3070 — RISOLES DE PIZZA FRITO 140GR

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 44.54
- **Peso unitário:** 130g
- **Peso do pacote:** 1300g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Caldo legumes, Apresuntado, Queijo mussarela, Óleo de soja, Leite integral em pó, Cebolinha verde, Orégano, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 130g):** Valor energético: 146kcal (7% VD) · Carboidratos: 25,6g (9% VD) · Proteínas: 5g (7% VD) · Gorduras totais: 2,6g (5% VD) · Gorduras saturadas: 1,3g (6% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,8g (7% VD) · Sódio: 708mg (30% VD)


### 3079 — EMPANADO SALSICHA 140gr

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 49.69
- **⚠ INDISPONÍVEL no site agora** (estoque zerado)
- **Peso unitário:** 130g
- **Peso do pacote:** 1300g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Salsicha, Margarina, Óleo de soja, Sal, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 130g):** Valor energético: 213kcal (11% VD) · Carboidratos: 21,5g (7% VD) · Proteínas: 7,4g (10% VD) · Gorduras totais: 10,8g (20% VD) · Gorduras saturadas: 3,4g (20% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,4g (5% VD) · Sódio: 1018mg (42% VD)


### 3333 — ESPETINHO FRANGO C/ BACON 120gr

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 74.25
- **Peso unitário:** 140g
- **Peso do pacote:** 1400g
- **Validade:** 180 dias
- **Composição:** Filé de peito de frango, farinha de trigo enriquecida com ferro e ácido fólico, farinha de rosca, sal, bacon, caldo de galinha e ervas finas (cebolinha e salsinha desidratada)
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 8 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter a embalagem bem fechada para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Ovos
- **Nutricional (porção de 100g):** Valor energético: 271kcal (19% VD) · Carboidratos: 22g (10% VD) · Proteínas: 25g (70% VD) · Gorduras totais: 7,2g (8% VD) · Gorduras saturadas: 0,5g (4% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,2g (7% VD) · Sódio: 711,61mg (50% VD)


### 5023 — MÉDIO COXINHA FRANGO MASSA AIMPIM FRITO 60GR

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 30 un. — **Preço site (tabela genérica):** R$ 59.39
- **Peso unitário:** 63g
- **Peso do pacote:** 1890g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Peito de frango, Mandioca desidratada, Cebola, Óleo de soja, Proteína de soja, Caldo de galinha, Margarina, Sal, Colorífico, Cebolinha verde, Glutamato monossódico, Farinha de rosca, Pimenta do reino.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 63g):** Valor energético: 74kcal (4% VD) · Carboidratos: 13,8g (5% VD) · Proteínas: 2,9g (4% VD) · Gorduras totais: 0,9g (2% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0,1g (0% VD) · Fibra alimentar: 1,1g (4% VD) · Sódio: 244mg (10% VD)


### 5182 — COXINHA FRANGO C/ REQUEIJÃO Gigante FRITO 170gr

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 52.64
- **Peso unitário:** 165g
- **Peso do pacote:** 1650g
- **Validade:** 180 dias
- **Composição:** Farinha de Trigo, Frango, Requeijão Hardt, Cheiro verde, Sal, Pimenta do reino, Margarina, Fubá, Óleo de soja, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite, Ovos
- **Nutricional (porção de 165g):** Valor energético: 158kcal (8% VD) · Carboidratos: 23g (8% VD) · Proteínas: 7,0g (10% VD) · Gorduras totais: 4,0g (7% VD) · Gorduras saturadas: 1,5g (7% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,8g (7% VD) · Sódio: 788mg (33% VD)


### 5298 — MÉDIO COXINHA LINGUIÇA BLUMENAU FRITO 65GR

- **Grupo:** Fritos (preparo do site: *Somente Aquecer*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 30 un. — **Preço site (tabela genérica):** R$ 63.44
- **Peso unitário:** 63g
- **Peso do pacote:** 1890g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Linguiça Blumenau, Aipim cozido, Cebola, Óleo de soja, Margarina, Sal, Requeijão culinário hardt, Cebolinha verde, Glutamato monossódico, Farinha de rosca, Pimenta do reino.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 10 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 63g):** Valor energético: 74kcal (4% VD) · Carboidratos: 13,8g (5% VD) · Proteínas: 2,9g (4% VD) · Gorduras totais: 0,9g (2% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0,1g (0% VD) · Fibra alimentar: 1,1g (4% VD) · Sódio: 244mg (10% VD)


### 3071 — CALZONE FRANGO C/ REQUEIJÃO 160gr

- **Grupo:** Assar (preparo do site: *Precisa Assar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 53.93
- **Peso unitário:** 135g
- **Peso do pacote:** 1080g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Margarina, Sal, Açúcar, Fermento Químico, Peito de Frango, Caldo de galinha, Pimenta do reino, Tomate, Cheiro verde, Colorífico, Requeijão culinário Hardt, Creme de leite, Leite, Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Leite, Ovos
- **Nutricional (porção de 135g):** Valor energético: 282kcal (14% VD) · Carboidratos: 40,1g (13% VD) · Proteínas: 11,4g (15% VD) · Gorduras totais: 8,4g (15% VD) · Gorduras saturadas: 2,1g (9% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 2,7g (11% VD) · Sódio: 571mg (24% VD)


### 3072 — CALZONE CALABRESA C/CHEEDAR 160gr

- **Grupo:** Assar (preparo do site: *Precisa Assar*)
- **Descrição (site):** Massa levemente crescida um recheio de calabresa picada de excelente qualidade de queijo cheedar Hardt, pacote com 8 unidades, cada produto indentificado com etiqueta comestível
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 53.93
- **Peso unitário:** 135g
- **Peso do pacote:** 1080g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Margarina, Sal, Açúcar, Fermento Químico, Calabresa, Requeijão culinário Hardt, Queijo cheedar, Creme de leite, Leite, Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Leite, Soja, Ovos
- **Nutricional (porção de 135g):** Valor energético: 282kcal (14% VD) · Carboidratos: 40,1g (13% VD) · Proteínas: 11,4g (15% VD) · Gorduras totais: 8,4g (15% VD) · Gorduras saturadas: 2,1g (9% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 2,7g (11% VD) · Sódio: 571mg (24% VD)


### 3073 — CALZONE CARNE C/ REQUEIJÃO 160gr

- **Grupo:** Assar (preparo do site: *Precisa Assar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 8 un. — **Preço site (tabela genérica):** R$ 53.93
- **Peso unitário:** 135g
- **Peso do pacote:** 1080g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Margarina, Sal, Açúcar, Fermento Químico, Carne bovina, Caldo de carne, Pimenta do reino, Tomate, Cheiro verde, Colorífico, Requeijão culinário Hardt, Creme de leite, Leite, Ovos
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em forno pré-aquecido em 180ºC, por 17 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Leite, Ovos
- **Nutricional (porção de 135g):** Valor energético: 282kcal (14% VD) · Carboidratos: 40,1g (13% VD) · Proteínas: 11,4g (15% VD) · Gorduras totais: 8,4g (15% VD) · Gorduras saturadas: 2,1g (9% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 2,7g (11% VD) · Sódio: 571mg (24% VD)


### 1 — COXINHA FRANGO MASSA AIPIM G 130GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 20 un. — **Preço site (tabela genérica):** R$ 63.44
- **Peso unitário:** 127g
- **Peso do pacote:** 2540g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de trigo, Peito de frango, Mandioca cozida, Cebola, Cebolinha verde, Sal, Margarina, Proteína de soja, Óleo de soja, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 127g):** Valor energético: 159kcal (8% VD) · Carboidratos: 22g (7% VD) · Proteínas: 7,2g (10% VD) · Gorduras totais: 4,8g (9% VD) · Gorduras saturadas: 1,9g (9% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,7g (7% VD) · Sódio: 753mg (31% VD)


### 3059 — COXINHA FRANGO TRADICIONAL G 130GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 20 un. — **Preço site (tabela genérica):** R$ 63.44
- **Peso unitário:** 127g
- **Peso do pacote:** 2540g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de trigo, Peito de frango, Cebola, Sal, Margarina, Proteína de soja, Óleo de soja, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 127g):** Valor energético: 158kcal (8% VD) · Carboidratos: 23g (8% VD) · Proteínas: 7,4g (10% VD) · Gorduras totais: 4,0g (7% VD) · Gorduras saturadas: 1,5g (7% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,8g (7% VD) · Sódio: 799mg (33% VD)


### 3062 — RISOLES DE PIZZA G 140GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 35.09
- **Peso unitário:** 130g
- **Peso do pacote:** 1300g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Caldo legumes, Apresuntado, Queijo mussarela, Óleo de soja, Leite integral em pó, Cebolinha verde, Orégano, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja, Leite
- **Nutricional (porção de 130g):** Valor energético: 146kcal (7% VD) · Carboidratos: 25,6g (9% VD) · Proteínas: 5g (7% VD) · Gorduras totais: 2,6g (5% VD) · Gorduras saturadas: 1,3g (6% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,8g (7% VD) · Sódio: 708mg (30% VD)


### 3063 — RISOLES DE CARNE G 140GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 35.09
- **Peso unitário:** 130g
- **Peso do pacote:** 1300g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Caldo legumes, Carne bovina, Cebola, Sal, Óleo de soja, Margarina, Caldo de carne, Colorau, Cebolinha verde, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 6 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 130g):** Valor energético: 160kcal (8% VD) · Carboidratos: 29g (10% VD) · Proteínas: 6,3g (8% VD) · Gorduras totais: 2,1g (4% VD) · Gorduras saturadas: 0,7g (3% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,9g (7% VD) · Sódio: 746mg (31% VD)


### 3078 — EMPANADO SALSICHA G 140GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 47.24
- **Peso unitário:** 130g
- **Peso do pacote:** 1300g
- **Validade:** 90 dias
- **Composição:** Farinha de trigo, Sal, Óleo de soja, Cebolinha verde, Salsicha hot dog, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 7 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 130g):** Valor energético: 246kcal (12% VD) · Carboidratos: 21,5g (7% VD) · Proteínas: 7,4g (10% VD) · Gorduras totais: 10,8g (20% VD) · Gorduras saturadas: 3,4g (16% VD) · Gorduras trans: 0,2g (0% VD) · Fibra alimentar: 1,4g (5% VD) · Sódio: 1018mg (42% VD)


### 4809 — MÉDIO CROQUETE CARNE 60GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 30 un. — **Preço site (tabela genérica):** R$ 51.29
- **Peso unitário:** 63g
- **Peso do pacote:** 1890g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Carne bovina, Cebola, Açúcar, Gordura animal, Caldo de carne, Cebolinha verde, Proteína de soja, Glutamato monossódico, Margarina, Sal, Pimenta do reino, Óleo de soja, Leite integral, Farinha de rosca
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 63g):** Valor energético: 94kcal (5% VD) · Carboidratos: 15g (5% VD) · Proteínas: 3,3g (4% VD) · Gorduras totais: 1,7g (3% VD) · Gorduras saturadas: 0,5g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,1g (4% VD) · Sódio: 355mg (15% VD)


### 4824 — MÉDIO TRAVESSEIRO PIZZA 60GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 30 un. — **Preço site (tabela genérica):** R$ 51.29
- **Peso unitário:** 63g
- **Peso do pacote:** 1890g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Queijo mussarela, Queijo provolone, Orégano, Margarina, Sal, Óleo de soja, Leite integral, Apresuntado, Farinha de rosca
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar a massa.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Leite, Trigo, Soja
- **Nutricional (porção de 63g):** Valor energético: 87kcal (4% VD) · Carboidratos: 12g (4% VD) · Proteínas: 2,9g (4% VD) · Gorduras totais: 2,1g (4% VD) · Gorduras saturadas: 0,8g (4% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 0,9g (3% VD) · Sódio: 356mg (15% VD)


### 4826 — MÉDIO COXINHA FRANGO MASSA AIPIM 60GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 30 un. — **Preço site (tabela genérica):** R$ 51.29
- **Peso unitário:** 63g
- **Peso do pacote:** 1890g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de trigo, Peito de frango, Mandioca cozida, Cebola, Cebolinha verde, Sal, Margarina, Proteína de soja, Óleo de soja, Pimenta do reino, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 63g):** Valor energético: 74kcal (4% VD) · Carboidratos: 13,8g (5% VD) · Proteínas: 2,9g (4% VD) · Gorduras totais: 0,9g (2% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,1g (4% VD) · Sódio: 244mg (10% VD)


### 5128 — MÉDIO BOLINHA DE QUEIJO 60GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 30 un. — **Preço site (tabela genérica):** R$ 51.29
- **Peso unitário:** 63g
- **Peso do pacote:** 1890g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de trigo, Sal, Margarina, Óleo de soja, Queijo mussarela, Queijo provolone, Leite integral em pó, Orégano, Cebolinha verde, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Leite, Ovos
- **Nutricional (porção de 63g):** Valor energético: 94kcal (5% VD) · Carboidratos: 15g (5% VD) · Proteínas: 3,3g (4% VD) · Gorduras totais: 1,7g (3% VD) · Gorduras saturadas: 0,5g (2% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,1g (4% VD) · Sódio: 355mg (15% VD)


### 5151 — COXINHA FRANGO C/ REQUEIJÃO GIGANTE 170GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 10 un. — **Preço site (tabela genérica):** R$ 47.24
- **Peso unitário:** 165g
- **Peso do pacote:** 1650g
- **Validade:** 180 dias
- **Composição:** Água, Farinha de Trigo, Frango cozido, Requeijão Cremoso, Cheiro verde, Sal, Pimenta do reino, Margarina, Fubá, Óleo de soja, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 175ºC, por 4:30 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** sim · **Alérgenos:** Trigo, Leite, Soja
- **Nutricional (porção de 165g):** Valor energético: 158kcal (8% VD) · Carboidratos: 23g (8% VD) · Proteínas: 7,4g (10% VD) · Gorduras totais: 4,0g (7% VD) · Gorduras saturadas: 1,5g (7% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,8g (7% VD) · Sódio: 788mg (33% VD)


### 5296 — MÉDIO COXINHA LINGUIÇA BLUMENAU 65GR

- **Grupo:** Fritar (preparo do site: *Precisa Fritar*)
- **Descrição (site):** _(sem descrição cadastrada)_
- **Embalagem:** pacote, 30 un. — **Preço site (tabela genérica):** R$ 53.99
- **Peso unitário:** 63g
- **Peso do pacote:** 1890g
- **Validade:** 180 dias
- **Composição:** Farinha de trigo, Linguiça blumenau defumada, Mandioca cozida, Cebola, Cebolinha verde, Sal, Pimenta do reino, Margarina, Proteína de soja, Farinha de rosca.
- **Modo de preparo (etiqueta):** Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 5 minutos. Tempo máximo de exposição em estufa: 6 horas a 60ºC. Produto congelado, após aberto manter o pacote bem fechado para não ressecar.
- **Armazenamento:** Congelar -12ºC. Após descongelado, não recongelar.
- **Contém glúten:** sim · **Contém lactose:** não · **Alérgenos:** Trigo, Soja
- **Nutricional (porção de 63g):** Valor energético: 74kcal (4% VD) · Carboidratos: 13,8g (5% VD) · Proteínas: 2,9g (4% VD) · Gorduras totais: 0,9g (2% VD) · Gorduras saturadas: 0,2g (1% VD) · Gorduras trans: 0g (0% VD) · Fibra alimentar: 1,1g (4% VD) · Sódio: 244mg (10% VD)



## 7. Inconsistências encontradas (para o dono corrigir no app)

Levantamento feito em cima dos 51 produtos e 51 fichas reais de produção, comparando os campos entre si. Nenhum destes números usa dado de teste — são todos de produção, 16/09/2026.

### 1) Preparo do catálogo × modo de preparo da etiqueta (25 produtos)

| Código | Produto | Preparo (site) | Modo de preparo (etiqueta) diz |
|---|---|---|---|
| H22MI2 | FESTA-BOLINHA DE QUEIJO 22GR | Somente Aquecer | a etiqueta manda FRITAR em óleo |
| 3086 | DOGUINHO C/ 2 SALSICHA 220gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3088 | ENROLADINHO DE FRANGO 140gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 5298 | MÉDIO COXINHA LINGUIÇA BLUMENAU FRITO 65GR | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3272 | ENROLADINHO DE PIZZA 140gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3333 | ESPETINHO FRANGO C/ BACON 120gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3728 | TORTINHA CAMARÃO 135gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 5200 | ENROLADINHO DE CALABRESA 140gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3611 | TORTINHA FRANGO E REQUEIJÃO 130gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 4614 | TORTINHA CARNE 130gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3609 | TORTINHA PALMITO 130gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3079 | EMPANADO SALSICHA 140gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 4765 | EMPADINHA DE FRANGO 32gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 5040 | EMPADINHA DE PALMITO 32gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3051 | COXINHA FRANGO MASSA AIPIM G FRITO 130gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 4032 | TORTINHA FRANGO E PALMITO MASSA INTEGRAL 130gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3070 | RISOLES DE PIZZA FRITO 140GR | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 5023 | MÉDIO COXINHA FRANGO MASSA AIMPIM FRITO 60GR | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3069 | RISOLES DE CARNE FRITO 140GR | Somente Aquecer | a etiqueta manda ASSAR no forno |
| H22MI4 | FESTA-COXINHA DE FRANGO 22GR | Somente Aquecer | a etiqueta manda FRITAR em óleo |
| H22MI6 | FESTA-CROQUETE DE CARNE 22GR | Somente Aquecer | a etiqueta manda FRITAR em óleo |
| H22MI8 | FESTA-TRAVESSEIRO DE PIZZA 22GR | Somente Aquecer | a etiqueta manda FRITAR em óleo |
| 5182 | COXINHA FRANGO C/ REQUEIJÃO Gigante FRITO 170gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| 3087 | HAMBURGÃO C/ CHEEDAR E CEBOLA 280gr | Somente Aquecer | a etiqueta manda ASSAR no forno |
| H22MI1 | FESTA-BOCADINHO DE PALMITO 22GR | Somente Aquecer | a etiqueta manda FRITAR em óleo |

*Nota: não afirmamos que a etiqueta está errada — ela é o documento regulatório (ANVISA) e tende a ser a fonte mais confiável. O que reportamos é a DIVERGÊNCIA entre o rótulo curto do grupo no site ("Somente Aquecer") e a instrução real impressa na etiqueta daquele produto. Pode ser que "Somente Aquecer" no site queira dizer só "já vem pronto, sem precisar descongelar/temperar" e a etiqueta detalhe a técnica de re-aquecimento (forno/óleo) — mas para o cliente que lê só o site, "Somente Aquecer" soa como "esquenta no micro-ondas", o que contradiz visivelmente instruções de fritar em óleo a 180ºC ou assar por 10-17 minutos. Recomendamos revisar a redação do rótulo `preparo` desses 6 grupos, ou o texto de `modoPreparo` das etiquetas, para os dois baterem.*

### 2) `grupoNome` do produto ≠ nome amigável do grupo em `/grupos` (afeta os 51 produtos, nos 6 grupos)

Como explicado na seção 4, `grupoNome` de cada produto vem direto do cadastro técnico de categorias (ao vivo), enquanto o nome mostrado em `/grupos` pode ter sido customizado para o site. Isso faz TODOS os 51 produtos exibirem, dentro do próprio item de catálogo/ficha, um `grupoNome` diferente do nome "bonito" do grupo:

| ID do grupo | `grupoNome` gravado nos produtos (técnico) | Nome amigável no site (`/grupos`) | Produtos afetados |
|---|---|---|---|
| `337b5e88-...` | **H22 Mini Salgados 22 gramas** | Assados | 7 |
| `0da2c06c-...` | Produtos para Assar | Assar | 3 |
| `8749505b-...` | Produtos Assados para Aquecer | Aquecer | 12 |
| `83936f52-...` | Produtos Fritos para Aquecer | Fritos | 9 |
| `6b469a55-...` | Produtos para Fritar | Fritar | 11 |
| `8a8477a5-...` | Mini Salgados para Fritar | Mini Fritar | 9 |

Cinco dos seis casos são só verbosidade (nome técnico "explicado por extenso" × nome curto do site — mesmo sentido, sem risco de confundir). **O caso do grupo `337b5e88-...` é o único realmente problemático**: o nome técnico ("H22 Mini Salgados 22 gramas") não tem nenhuma relação de sentido com o nome do site ("Assados") — quem ler `grupoNome` direto no produto (sem cruzar com `/grupos`) vai entender uma coisa completamente diferente do grupo real. Sugestão: renomear a categoria técnica no cadastro geral para algo como "Assados" (ou o que fizer sentido para o sistema), já que hoje ela carrega um nome de uma reorganização antiga (parece ter sido criada para a linha "H22" — Kit Festa mini 22g — mas hoje reúne também salgados maiores).

### 3) Sem descrição no catálogo público (43 de 51 produtos — 84%)

O campo `descricao` do catálogo público está vazio na grande maioria dos produtos (só 8 dos 51 têm texto: os 7 da linha "22 gramas" + o código 3072). Sem descrição, o bot fica dependente só do nome cru do produto e da ficha (quando existe) — o que funciona, mas é mais informação perdida do que precisava. Lista completa dos 43 sem descrição:

### 3) Sem descrição no catálogo público (43 produtos)

- 3071 — CALZONE FRANGO C/ REQUEIJÃO 160gr
- 3086 — DOGUINHO C/ 2 SALSICHA 220gr
- 3088 — ENROLADINHO DE FRANGO 140gr
- 5298 — MÉDIO COXINHA LINGUIÇA BLUMENAU FRITO 65GR
- 3272 — ENROLADINHO DE PIZZA 140gr
- 3333 — ESPETINHO FRANGO C/ BACON 120gr
- 3728 — TORTINHA CAMARÃO 135gr
- 5200 — ENROLADINHO DE CALABRESA 140gr
- 3611 — TORTINHA FRANGO E REQUEIJÃO 130gr
- 4614 — TORTINHA CARNE 130gr
- 3609 — TORTINHA PALMITO 130gr
- 3073 — CALZONE CARNE C/ REQUEIJÃO 160gr
- 3079 — EMPANADO SALSICHA 140gr
- 4765 — EMPADINHA DE FRANGO 32gr
- 5040 — EMPADINHA DE PALMITO 32gr
- 3051 — COXINHA FRANGO MASSA AIPIM G FRITO 130gr
- 4032 — TORTINHA FRANGO E PALMITO MASSA INTEGRAL 130gr
- 3065 — BOLINHO CARNE FRITO 150gr
- 5128 — MÉDIO BOLINHA DE QUEIJO 60GR
- 3070 — RISOLES DE PIZZA FRITO 140GR
- 5023 — MÉDIO COXINHA FRANGO MASSA AIMPIM FRITO 60GR
- 3063 — RISOLES DE CARNE G 140GR
- 3069 — RISOLES DE CARNE FRITO 140GR
- 3078 — EMPANADO SALSICHA G 140GR
- 5151 — COXINHA FRANGO C/ REQUEIJÃO GIGANTE 170GR
- 3062 — RISOLES DE PIZZA G 140GR
- 4826 — MÉDIO COXINHA FRANGO MASSA AIPIM 60GR
- 5296 — MÉDIO COXINHA LINGUIÇA BLUMENAU 65GR
- 4809 — MÉDIO CROQUETE CARNE 60GR
- 4824 — MÉDIO TRAVESSEIRO PIZZA 60GR
- 5182 — COXINHA FRANGO C/ REQUEIJÃO Gigante FRITO 170gr
- 1 — COXINHA FRANGO MASSA AIPIM G 130GR
- 3059 — COXINHA FRANGO TRADICIONAL G 130GR
- 3087 — HAMBURGÃO C/ CHEEDAR E CEBOLA 280gr
- 3081 — Mini Coxinha de Frango 30gr
- 5286 — Mini Coxinha Linguiça Blumenau 30gr
- 4091 — Mini Churros Doce de Leite 30gr
- 3082 — Mini Bolinha de Queijo 30gr
- 3084 — Mini Bocadinho Palmito 30gr
- 3972 — Mini Kibe Carne 30gr
- 5183 — Mini Salsicha 30gr
- 3083 — Mini Croquete de Carne 30gr
- 3085 — Mini Travesseiro Pizza 30gr
### 4) Fichas sem etiqueta cadastrada (3 produtos)

Estes 3 produtos têm ficha (a rota responde 200), mas o campo `etiqueta` vem `null` — ou seja, não existe nenhuma etiqueta ativa cadastrada no PCP para eles (nem por `produtoId`, nem por código). Isso significa: **sem composição, sem modo de preparo, sem peso, sem nutricional, sem alérgenos** para esses três — o bot não tem como responder essas perguntas para eles com segurança.

- **3065** — BOLINHO CARNE FRITO 150gr
- **H22MI5** — FESTA-COXINHA DE LINGUIÇA BLUMENAU 22GR
- **H22MI3** — FESTA-CHURROS DOCE DE LEITE 22GR

### 5) Código de produto suspeito

O produto **"COXINHA FRANGO MASSA AIPIM G 130GR"** está cadastrado com `codigo = "1"` — um código de 1 dígito, fora do padrão dos demais (a maioria usa códigos de 4 dígitos tipo "3051", ou o prefixo "H22MI" da linha Festa). Pode ser um erro de digitação no cadastro geral do produto (o código é do cadastro geral do sistema, compartilhado com Pedidos/PCP — não é exclusivo do site). Vale conferir se não é duplicidade/erro de um código que deveria ser outro.

### 6) Produto indisponível agora (não é erro de cadastro, é estoque zerado)

- **3079** — EMPANADO SALSICHA 140gr está com `indisponivel: true` neste momento (estoque disponível zerado no sistema). Não é uma falha de cadastro — é o comportamento normal do site (produto some da vitrine quando o estoque zera) — citado aqui só para registro, porque pode voltar a ficar disponível a qualquer momento sem aviso prévio.

### Conferido e SEM divergência (não precisa de correção)

- **Peso citado na descrição × peso da etiqueta:** os 8 produtos que têm descrição com peso escrito ("22 GRAMAS") batem exatamente com o `pesoUnitario` da etiqueta (22g) — nenhuma divergência.
- **`unidades` do catálogo × `quantidadeEmbalagem` da etiqueta:** batem em 100% dos 51 produtos — nenhuma divergência.
- **Nomes com código embutido no meio do nome:** não encontramos nenhum caso real (um falso positivo inicial — código "1" aparecendo como substring de "130GR" — foi descartado por não ser um problema de fato).

### Resumo em números

| Tipo de inconsistência | Quantos produtos |
|---|---|
| Preparo do catálogo × modo de preparo da etiqueta divergentes | 25 (49%) |
| `grupoNome` do produto ≠ nome amigável do grupo (todos os grupos, 1 caso grave) | 51 (100%) — mas só 1 dos 6 grupos é confuso de fato |
| Sem descrição no catálogo público | 43 (84%) |
| Ficha sem etiqueta cadastrada (sem nutricional/preparo/alérgenos) | 3 (6%) |
| Código de produto suspeito (1 dígito só) | 1 |
| Indisponível no momento do levantamento (estoque zerado) | 1 |
