# API de Consulta do CA-Hardt para a IA (v1.6.1) — guia autocontido para o time do bot

Este arquivo é para o time que desenvolve o bot de WhatsApp ("Ana"/Antigravity), que **não tem
acesso ao repositório do CA-Hardt**. Ele descreve tudo que é preciso saber para consumir a API:
como autenticar, todos os endpoints (histórico completo da v1.0 até a v1.6.1), o formato do objeto
de produto e do objeto de pedido campo a campo, as regras de promoção, como criar pedido, códigos
de erro, e os avisos de mudança.

**Regra de ouro:** o bot NUNCA acessa o banco de dados do CA-Hardt diretamente (sem SQL, sem
`DATABASE_URL`). Tudo passa por esta API. Se faltar algum dado, a resposta é pedir um endpoint
novo ao time do CA-Hardt — não existe atalho.

---

## 1. Acesso

- **Base de produção:** `https://cahardt-github.xrqvlq.easypanel.host/api/ia-consulta/v1`
- **Autenticação:** header `x-ia-api-key: <chave>` em **toda** requisição. A chave é fornecida pelo
  time do CA-Hardt fora deste documento (variável de ambiente `IA_WHATSAPP_API_KEY` no lado deles) —
  nunca commitar a chave em repositório do bot.
- **Limite:** 60 requisições/minuto por chave. Acima disso, `429`.
- Sem a chave no header, ou chave errada/diferente da configurada → `401`. `503` é outra situação:
  o servidor do CA-Hardt está sem a variável de ambiente `IA_WHATSAPP_API_KEY` configurada (nenhuma
  chave aceita ainda) — nesse caso avisar o time do CA-Hardt, não é problema do bot.

## 2. Envelope de toda resposta

Toda resposta de sucesso (`2xx`) vem embrulhada assim:

```json
{
  "meta": { "versaoApi": "1.6.1", "avisos": [], "geradoEm": "2026-09-15T12:00:00.000Z" },
  "dados": { /* conteúdo específico do endpoint — é o que este doc descreve endpoint a endpoint */ }
}
```

Respostas de **erro** (`4xx`/`5xx`) **não** usam esse envelope — vêm direto como:

```json
{ "error": "mensagem legível", "code": "CODIGO_OPCIONAL" }
```

`code` só vem quando o erro é de uma regra de negócio conhecida (lista completa na seção 8).

### `meta.avisos` — o mecanismo anti-quebra

Sempre que o CA-Hardt precisar mudar ou remover algo que este bot já consome, o aviso aparece **com
antecedência**, em **toda resposta**, dentro de `meta.avisos` como `{ desde, mensagem }`. Não existe
push/webhook para isso — é responsabilidade do bot **checar `meta.avisos` a cada chamada (ou pelo
menos 1x/dia via `GET /status`)**, logar/alertar o time e se ajustar antes da data mencionada. Uma
lista vazia (`[]`) é o normal — nada pendente.

**Nunca aconteceu, e não deve acontecer:** um campo de resposta já existente ser removido ou
renomeado sem aviso prévio aqui. Mudança incompatível vira sempre uma versão nova (`/v2`, ainda não
existe), mantendo `/v1` no ar. Só adicionar campo novo é considerado seguro e não gera aviso.

---

## 3. Tabela de endpoints (histórico completo v1.0 → v1.6.1)

| Método | Rota | Desde | Body/Query | O que devolve |
|---|---|---|---|---|
| GET | `/status` | 1.0 | — | `{ ok: true }` — health-check. Chamar antes de responder um cliente crítico; se falhar, usar mensagem de fallback. |
| GET | `/kitfesta/catalogo` | 1.0 | — | Lista de produtos do Kit Festa (nome, preço, unidades por caixa, opções, tags) |
| GET | `/kitfesta/categorias` | 1.0 | — | Categorias de filtro do site do Kit Festa |
| GET | `/kitfesta/config` | 1.0 | — | Dados da loja, regras (ex.: mínimo de caixas), textos institucionais |
| GET | `/kitfesta/agenda` | 1.0 | `?inicio=YYYY-MM-DD&fim=YYYY-MM-DD` | Mapa de status por dia: `open`\|`few`\|`full`\|`closed` |
| GET | `/kitfesta/slots` | 1.0 | `?data=YYYY-MM-DD&modo=retirada\|entrega` | Horários daquele dia com capacidade/lotação |
| POST | `/kitfesta/validar-cupom` | 1.0 | `{ codigo, totalCaixas }` | Validação do cupom (tipo, valor, mínimo de caixas) |
| POST | `/kitfesta/verificar-entrega` | 1.0 | `{ cep }` | `{ atende: true\|false\|null, distanciaKm, raioKm, endereco }` |
| GET | `/congelados/catalogo` | 1.0 (+1.6) | — | Catálogo com preço **genérico** (tabela "Site", visitante sem cadastro). Cada item traz os campos antigos **+ o objeto único de produto** (seção 5) |
| GET | `/congelados/grupos` | 1.0 | — | Categorias/grupos do catálogo de congelados |
| GET | `/congelados/config` | 1.0 (+1.6) | — | Dados da loja, mínimo padrão, se atende sábado/domingo. **+ `horaCorte`** (`"HH:MM"` ou `null`) |
| GET | `/congelados/produto/:id/ficha` | 1.0 | `:id` = id do produto no site | Ficha técnica/nutricional do produto |
| GET | `/congelados/promocoes` | 1.6 (+1.6.1) | — | Promoções vigentes + **`regras`** explicando como funcionam (seção 6) |
| GET | `/congelados/indisponiveis` | 1.6 (+1.6.1) | — | Produtos do site sem estoque + **`orientacao`** (seção 7) |
| POST | `/congelados/reconhecer-telefone` | 1.0 (+1.4, 1.5, 1.6) | `{ telefone }` | Se o telefone bater com cadastro: catálogo já com preço/condição/dias de entrega REAIS dele + histórico recente (seção 5) |
| POST | `/congelados/criar-senha-telefone` | 1.0 | `{ telefone, senha }` | Cria a senha do site (mesma conta do login) — só se `telefone` bater com um cadastro. Devolve `{ token, cliente }` |
| POST | `/congelados/check-doc` | 1.0 | `{ documento }` (CPF/CNPJ) | `{ situacao, temCadastroApp, nome }` — descobre se o documento já tem cadastro/senha |
| POST | `/congelados/login` | 1.0 | `{ documento, senha }` | `{ token, cliente }` se a senha bater |
| POST | `/congelados/criar-senha` | 1.0 | `{ documento, senha, nome?, telefone? }` | Cria a senha **só se a conta ainda não tiver uma** (senão erro "já tem senha, use esqueci-senha") |
| POST | `/congelados/esqueci-senha` | 1.0 | `{ documento }` | Manda um código de 6 caracteres pelo WhatsApp — **só para o telefone já cadastrado**, nunca pra quem pediu |
| POST | `/congelados/reset-senha` | 1.0 | `{ documento, codigo, novaSenha }` | Confirma o código e define a nova senha. Devolve `{ token, cliente }` |
| GET | `/congelados/meu-catalogo` | 1.0 (+1.6) | header `Authorization: Bearer <token>` | Catálogo com preço/condição/dias de entrega do cliente autenticado + objeto único de produto |
| GET | `/congelados/perfil` | 1.0 | header `Authorization: Bearer <token>` | Dados do cliente autenticado (nome, dias de entrega, condição padrão) |
| POST | `/cliente/reconhecer-telefone` | 1.3 (+1.5, 1.6) | `{ telefone }` | **Geral, qualquer linha.** Reconhecimento + histórico recente (seção 5) |
| POST | `/cliente/historico-pedidos` | 1.3 (+1.4, 1.6) | `{ telefone, limite?, comItens? }` (limite padrão 10, máx 30) | Lista de pedidos do cliente, ver seção 5 |
| POST | `/cliente/produtos-comprados` | 1.6 | `{ telefone, meses? }` (padrão 12, máx 24) | Agregado do que o cliente compra (seção 5.4) |
| GET | `/cliente/pedido/:numero` | 1.6 | `?telefone=…&fonte=PEDIDO\|FILA` (**`telefone` obrigatório**) | "Meu pedido chegou?" — um pedido específico, só do dono do telefone |
| POST | `/cliente/situacao` | 1.6 | `{ telefone }` | 🔒 **Só painel interno da equipe — NUNCA vira tool da IA/Ana** (seção 5.5) |
| POST | `/cliente/criar-lead` | 1.3 (+1.5.1) | `{ nomeEstabelecimento, whatsapp, contato?, cidade?, observacoes? }` | Cria um prospect no CRM interno. Retorna `{ id, numero, etapa }` |
| POST | `/cliente/buscar` | 1.5 | `{ busca, limite? }` (mín. 3 caracteres) | 🔒 Só painel interno — busca cliente por nome/documento |
| POST | `/cliente/ficha` | 1.5 | `{ documento }` | 🔒 Só painel interno — ficha completa de um cliente |
| POST | `/congelados/pedido` | 1.4 (+1.6) | ver seção 8 | Cria pedido de Congelados na fila de aprovação |
| POST | `/kitfesta/pedido` | 1.4 | ver docs completos (fora do escopo deste resumo — pedir se precisar) | Cria pedido de Kit Festa na fila de aprovação |

### Imagem de produto (já pronto, sem endpoint extra)

Todo produto devolvido pelos catálogos já traz a foto principal em **`imagem`** (URL pública, ou
`null` se ninguém subiu foto ainda). Congelados também traz **`imagens`** (array com todas as
fotos, principal primeiro).

---

## 4. Como reconhecer o cliente (leia antes de tudo)

**Sempre pelo telefone primeiro, automaticamente, sem perguntar nada:**

1. Chamar `POST /congelados/reconhecer-telefone` (linha de Congelados) ou
   `POST /cliente/reconhecer-telefone` (qualquer linha/geral) com o número de quem mandou a
   mensagem no WhatsApp. Se `reconhecido: true`, já é o preço/condição/histórico REAL do cliente —
   isso é seguro porque o número de quem manda mensagem no WhatsApp é autenticado pela própria
   plataforma (ninguém "digita" o número de outra pessoa).
2. **Se não reconheceu por telefone** (visitante/lead novo): perguntar o CPF/CNPJ e chamar
   `check-doc`.
   - Já tem senha (`TEM_SENHA`): pedir a senha, chamar `login`, usar o `token` em `meu-catalogo`.
   - Ainda não tem senha (`CRIAR_SENHA`/`SEM_CADASTRO`): oferecer `criar-senha` ali mesmo, OU,
     se esqueceu, `esqueci-senha` (manda código pro WhatsApp já cadastrado) + `reset-senha`.
3. **NUNCA** liberar preço negociado, dias de entrega ou pedidos de um cliente só com CPF/CNPJ
   digitado, sem passar por um dos dois caminhos acima. CPF e principalmente CNPJ **não são
   segredo** (aparecem em nota fiscal, cartão de visita, Google) — a identificação válida é sempre
   telefone batendo com o WhatsApp de quem está mandando a mensagem, ou senha/código enviado ao
   telefone **já cadastrado** (nunca a quem está pedindo).
4. `/cliente/buscar`, `/cliente/ficha` e `/cliente/situacao` são **só para o painel interno da
   equipe humana** — nunca tools que a Ana usa para responder cliente.

Se o bot precisar de algum dado de cliente/pedido/preço que não está nesta lista, a resposta é
**pedir um endpoint novo** ao time do CA-Hardt — nunca reintroduzir acesso direto ao banco (isso já
aconteceu uma vez, em 2026-07, e quebrou o bot porque ele assumiu nomes de coluna errados; foi
corrigido criando os endpoints `/cliente/*` que existem hoje).

---

## 5. Objeto único de PRODUTO (v1.6 / v1.6.1) — campo a campo

Este objeto aparece **no mesmo nível do item** em `GET /congelados/catalogo`,
`POST /congelados/reconhecer-telefone` (`catalogo[]`) e `GET /congelados/meu-catalogo`; e como
**sub-objeto `produto`** dentro de: itens de `historico-pedidos` (com `comItens:true`),
`produtos-comprados`, `ultimoPedido[]`/`ultimoPedidoDetalhe.itens`, `pedidosEmAberto[].itens`,
resposta de `POST /congelados/pedido`, `promocoes[]`, `indisponiveis[]` e
`GET /cliente/pedido/:numero`.

**Regra que nunca muda:** os campos antigos continuam com o mesmo nome/tipo/sentido. Onde um nome
"óbvio" colidia com um campo já existente, o novo entrou com outro nome: `ultimoPedido` continua
**array** (o objeto por pedido é `ultimoPedidoDetalhe`); `grupo` continua o **ID** da categoria (o
nome humano é `grupoNome`); `embalagem` continua **string** (o objeto é `embalagemInfo`); `preparo`
continua o rótulo livre (o enum é `preparoTipo`); `nome` continua `nomeSite ‖ nome do sistema` (o
curto derivado é `nomeCurto`, o de auditoria é `nomeCompleto`).

| Campo | O que é | Pode vir `null`/vazio quando… | O que a Ana faz nesse caso |
|---|---|---|---|
| `id` | id do produto **no site** (`congeladosProdutoId`) — é o que vai em `itens[].id` ao criar pedido | produto não está mais no site (item de histórico antigo) | não oferecer para recompra; falar que saiu de linha |
| `produtoId` | id do produto no app interno | — | — |
| `codigo` | código do cadastro (numérico, ex. `"3059"`) | `""` se não houver | ignorar, não é o que o cliente reconhece |
| `nome` | `nomeSite` ‖ nome do sistema (campo antigo, sempre existiu) | — | é o nome padrão para falar com o cliente |
| `nomeSite` | nome exatamente como aparece no site | admin não preencheu | usar `nome` no lugar |
| `nomeCompleto` | nome interno do cadastro, ex. `1-G-COXINHA TRADICIONAL FRANGO C/20 130GR` | — | não falar isso pro cliente — é o nome "de sistema", cheio de código |
| `nomeCurto` | **(v1.6.1)** vem de `etiqueta.nomeProduto` (nome digitado à mão no PCP, sem código/prefixo) quando existe etiqueta ativa cadastrada para o produto; senão é derivado automaticamente do `nomeCompleto` (regex tira prefixo/quantidade/peso) | nunca fica vazio (cai no `nomeCompleto` se nada casar) | **preferir este campo** para falar com o cliente — é o mais limpo |
| `linha` | sempre `"CONGELADOS"` | `null` se o produto não está no site | — |
| `grupo` / `grupoNome` | ID / nome da categoria comercial | sem categoria cadastrada | agrupar como "Outros" |
| `tamanho` | `P`/`M`/`G`/`GG`, lido só do `nomeCompleto` (posição fixa no padrão do nome) — **a etiqueta do PCP não tem esse campo**, então não existe uma segunda fonte para ele | nome fora do padrão esperado | não mencionar tamanho |
| `pesoUnidadeG` | peso unitário em gramas: prioriza `etiqueta.pesoUnitario`; se não houver etiqueta, tenta ler o `<peso>GR` do `nomeCompleto` | sem etiqueta e nome sem `GR` no final | não falar peso |
| `unidade`, `unidades`, `embalagem` | campos antigos (inalterados) | — | — |
| `embalagemInfo` | `{ rotulo, unidade, unidadesPorEmbalagem, pesoG }`. `unidadesPorEmbalagem`: unidades cadastradas no site → senão `etiqueta.quantidadeEmbalagem` (v1.6.1) → senão a quantidade por caixa do cadastro interno → senão o `C/<n>` extraído do nome. `pesoG`: peso fixo do pacote cadastrado na etiqueta (`etiqueta.pesoPacote`) → senão `unidadesPorEmbalagem × pesoUnidadeG` | sub-campos vêm `null` quando não há nenhuma fonte | usar para responder "quantas unidades vêm no pacote?"/"qual o peso do pacote?" |
| `preparo` | rótulo livre configurado na categoria do produto (ex.: "Para fritar") — é o texto que já existia antes da v1.6.1 e continua tendo prioridade quando a categoria tem um rótulo configurado | `""` se a categoria não tem rótulo configurado | usar `preparoTipo`/`modoPreparo` no lugar |
| `preparoTipo` | enum normalizado: `FRITO` \| `ASSADO` \| `PRONTO` \| `CRU`. Vem **só** do rótulo curado da categoria (`preparo`) — vocabulário controlado pelo admin do CA-Hardt. **Nunca** é derivado do texto livre `etiqueta.modoPreparo`: isso foi tentado e revertido ainda na v1.6.1 porque um regex sobre texto livre do PCP classifica errado frases com negativa (ex.: "Não fritar, assar em forno…" contém a palavra "fritar" e seria lido como `FRITO`) | `null` quando a categoria do produto não tem rótulo configurado | **se vier `null`, NÃO tente adivinhar o modo de preparo.** Use o campo `modoPreparo` (texto literal) se ele existir; se também vier `null`, diga que não tem essa informação cadastrada |
| `modoPreparo` | **(v1.6.1, NOVO)** texto livre do "Modo de Preparo" cadastrado na etiqueta do PCP (ex.: "Fritar em óleo quente por 5 minutos" ou "Assar em forno pré-aquecido a 200°C por 20 minutos"), cortado em **300 caracteres** | `null` quando o produto não tem etiqueta ativa cadastrada | pode ser **citado literalmente** pela Ana quando o cliente perguntar "como eu preparo isso?" — inclusive como alternativa quando `preparoTipo` vier `null`. **Nunca** usar este texto para classificar/inferir o `preparoTipo` por conta própria — pode conter negativas que invertem o sentido |
| `etiqueta` | **(v1.6.1, NOVO)** `{ codigoBarras, alergenos: [ "Leite", "Soja", … ], contemGluten: bool, contemLactose: bool, armazenamento: "texto ou null" }` — dados da etiqueta ativa do PCP | objeto inteiro vem `null` quando não há etiqueta cadastrada para o produto | usar para responder "tem glúten?"/"tem lactose?"/"quais os alérgenos?"/"como armazenar?". **Se vier `null`, não afirmar "não tem" — dizer que não tem essa informação cadastrada e sugerir falar com um atendente** |
| `precoTabela` | preço de tabela do contexto (base × (1 + acréscimo% da condição)). No catálogo público = tabela "Site" | — | — |
| `precoCliente` | preço do cliente reconhecido (último preço negociado, com piso de desconto aplicado) — é o mesmo valor do campo antigo `preco` do item | `null` no catálogo público (visitante) e nos itens de histórico | usar `precoTabela` no lugar quando `null` |
| `preco` | campo antigo (inalterado no catálogo). No sub-objeto `produto` = `precoCliente` ‖ `precoTabela` | — | é o preço "seguro" para sempre falar, já resolve a prioridade sozinho |
| `minimoPorItem` | sempre `1` (não existe mínimo por item no cadastro) | — | — |
| `ativo` | produto ativo no app **e** no site | — | se `false`, produto não deve ser oferecido |
| `disponivel` / `indisponivel` | `disponivel` = ativo **e** estoque disponível > 0 (mesma regra do site) | — | não oferecer produto com `disponivel:false` |
| `previsaoRetorno` | **sempre `null`** — não existe previsão de retorno de estoque no cadastro do CA-Hardt | sempre | ver seção 7 — usar a `orientacao` fixa de `GET /congelados/indisponiveis` em vez de inventar prazo |
| `promocao` | promoção vigente do produto, no formato da seção 6, ou `null` | sem promoção vigente no momento | não mencionar promoção |
| `imagem` / `imagens` | foto principal / todas as fotos | sem foto cadastrada | não enviar imagem |

---

## 6. Regras de promoção (v1.6.1) — `GET /congelados/promocoes`

Resposta de `dados`:

```json
{
  "promocoes": [
    { "id": "…", "nome": "Produto Exemplo",
      "tipo": "PRECO", "tipoSistema": "SIMPLES", "produtoId": "…",
      "precoPromo": 9.50, "precoPromoBase": 9.00, "precoNormal": 10.00,
      "condicao": null, "condicoes": [], "validoDe": "2026-09-09", "validoAte": "2026-09-30",
      "tabelas": ["*"], "id_site": "…", "produto": { /* objeto único de produto, seção 5 */ } }
  ],
  "regras": {
    "resumo": "Existem dois tipos de promoção: PRECO (preço promocional vale sempre, qualquer quantidade, dentro do período) e CONDICIONAL (só é liberada se o carrinho atender pelo menos um dos grupos de condições cadastrados). O preço com desconto só é aplicado ao item cuja promoção está vigente e, no caso CONDICIONAL, liberada — os demais itens do pedido seguem o preço normal.",
    "tipos": {
      "PRECO": "Preço promocional (precoPromo) vale no período (validoDe–validoAte) para qualquer quantidade do produto — não depende do resto do carrinho.",
      "CONDICIONAL": "Só é liberada se pelo menos UM grupo de \"condicoes\" for atendido (grupos são \"ou\" entre si). Dentro de um grupo, TODAS as condições precisam ser verdadeiras ao mesmo tempo (\"e\" entre elas). Cada condição é de um destes tipos: PRODUTO_QUANTIDADE (quantidade mínima de um produto específico no pedido) ou VALOR_TOTAL (valor mínimo do pedido inteiro)."
    },
    "precos": "precoPromo já inclui o acréscimo % da condição de pagamento do cliente (mesma conta da tela de pedido do vendedor) — é o valor que a Ana deve falar para o cliente. precoPromoBase é o preço promocional cadastrado, sem esse acréscimo.",
    "validade": "validoDe/validoAte (formato AAAA-MM-DD) — fora desse período a promoção nem aparece nesta lista, porque ela só traz promoções VIGENTES.",
    "naoExiste": ["LEVE_MAIS"],
    "comoUsar": "Para aplicar uma promoção ao criar o pedido, mande o campo \"promocaoId\" no item (POST /congelados/pedido, itens[].promocaoId). O servidor SEMPRE valida de novo e recalcula o preço — nunca confia em preço mandado pelo cliente/bot. Se a promoção não existir/não estiver mais vigente, o erro vem com code \"PROMOCAO_INVALIDA\"; se existir mas a condição do carrinho ainda não foi atendida, vem com code \"PROMOCAO_NAO_LIBERADA\" (a mensagem de erro já descreve a condição em português).",
    "observacao": "A condição VALOR_TOTAL (e a quantidade mínima de PRODUTO_QUANTIDADE) é avaliada com os preços NORMAIS de tabela, somados ANTES de qualquer desconto de promoção — ou seja, o cliente não consegue \"se qualificar\" para uma promoção usando o preço já promocional de outro item."
  }
}
```

Pontos importantes:

- Na lista de `promocoes[]`, o campo `nome` (de nível superior) é o **nome do PRODUTO**, não o nome
  da promoção — é assim de propósito, porque é o que a Ana deve falar pro cliente. O nome da própria
  promoção fica em `produto.promocao.nome` (dentro do sub-objeto).
- `tipo`: `PRECO` (internamente chamado de `SIMPLES` no `tipoSistema`) ou `CONDICIONAL`.
  **`LEVE_MAIS` não existe** neste sistema — nunca ofereça esse tipo.
- Quando `CONDICIONAL`: `condicao` já vem como **texto humano pronto** (ex.: `"a partir de 3 un de
  BOLINHO DE CARNE"`, `"pedido a partir de R$ 300,00"` — grupos unidos por `" ou "`, condições por
  `" e "`) — pode ser lido/adaptado direto para o cliente. `condicoes` é a estrutura crua (array
  externo = grupos "ou", array interno = condições "e" dentro do grupo), com
  `{ tipo: "PRODUTO_QUANTIDADE"|"VALOR_TOTAL", produtoId, produtoNome, quantidadeMinima, valorMinimo }`.
- `tabelas` é sempre `["*"]` — promoção aqui não tem vínculo com tabela de preço específica.
- No `GET /congelados/promocoes` isolado, o contexto de preço é a tabela "Site" (visitante). **No
  reconhecimento por telefone** (`POST /congelados/reconhecer-telefone` ou
  `/cliente/reconhecer-telefone`), `catalogo[].promocao.precoPromo` já vem calculado com o
  acréscimo % da condição de pagamento REAL daquele cliente — é sempre esse valor específico do
  cliente que a Ana deve falar quando o cliente já está identificado, não o do endpoint isolado de
  promoções.
- Só aparecem promoções de produtos que estão no site e vigentes (`ATIVA` e dentro do período).
  Promoção encerrada, ainda não iniciada ou pausada nunca aparece aqui.

---

## 7. Produtos indisponíveis — `GET /congelados/indisponiveis`

```json
{
  "produtos": [
    { "id": "…", "produtoId": "…", "nome": "Coxinha Tradicional de Frango M",
      "previsaoRetorno": null, "produto": { /* objeto único de produto, seção 5 */ } }
  ],
  "orientacao": "Sem previsão no sistema — a Ana deve perguntar ao responsável."
}
```

O CA-Hardt **não tem, hoje, nenhum campo de previsão de retorno de estoque** — `previsaoRetorno`
sempre vem `null`, item a item. Para não deixar a Ana inventar uma data, a resposta carrega o campo
fixo `orientacao` (texto curto, sempre o mesmo) — é a instrução oficial: quando o cliente perguntar
"quando volta?", a Ana deve dizer que vai perguntar ao responsável, **nunca chutar um prazo**.

---

## 8. Criar pedido de Congelados — `POST /congelados/pedido`

```json
{
  "telefone": "5547999998888",
  "itens": [
    { "id": "<id do site, campo 'id' do objeto de produto>", "quantidade": 8 },
    { "id": "<id do site>", "quantidade": 3, "promocaoId": "<id da promoção, opcional>" }
  ],
  "data": "2026-09-20",
  "modo": "entrega",
  "observacoes": "sem cebola",
  "observacaoInterna": "Cliente aceitou a promoção do bolinho (3 pct).",
  "origem": "WHATSAPP_IA",
  "idempotencyKey": "uuid-gerado-pelo-bot-por-tentativa-de-envio",
  "visitante": { "nome": "…", "telefone": "…", "cpf": "…" }
}
```

Resposta (`dados`):

```json
{
  "id": "…", "numero": 12345, "status": "AGUARDANDO", "total": 456.70,
  "origem": "WHATSAPP_IA",
  "itens": [
    { "id": "…", "produtoId": "…", "nome": "…", "quantidade": 8, "unidade": "cx",
      "precoUnit": 44.13, "precoTotal": 353.04, "promocaoId": null, "nomePromocao": null,
      "produto": { /* objeto único de produto, seção 5 */ } }
  ]
}
```

Pontos importantes:

- **O pedido NÃO vira venda direto** — ele cai na **fila de aprovação** do CA-Hardt
  (`status: "AGUARDANDO"`, ou `"PENDENTE_CADASTRO"` se o telefone é de um cliente totalmente novo).
  Um humano do faturamento aprova depois.
- **`id` de cada item é o `id` do objeto único de produto** (seção 5) — não é `produtoId`.
- **O preço nunca vem do bot.** `promocaoId` é só uma referência: o servidor confere se a promoção
  está vigente, se é do produto certo e se a condição foi atendida olhando o carrinho inteiro, e
  recalcula o preço sozinho. Qualquer `precoUnit`/`valor` que o body mandar é **ignorado**.
- `observacaoInterna` (até 500 caracteres) é só para a equipe interna ver no card da fila — **nunca**
  vai para o pedido real, para a nota fiscal nem para o recibo do cliente. `observacoes` é a
  observação do próprio cliente.
- `origem` é sempre gravado como `"WHATSAPP_IA"` neste endpoint, mesmo que o body mande outra coisa
  — é só para a equipe filtrar/auditar.
- `idempotencyKey`: gere um valor único por **tentativa de envio** (ex.: UUID). Se a mesma chave for
  reenviada (por causa de timeout, retry de rede etc.), o servidor devolve o **mesmo pedido já
  criado**, em vez de duplicar. Não reaproveite a mesma chave para pedidos diferentes.

### Códigos de erro (`400 { error, code }`)

| `code` | Quando acontece | O que o bot deve fazer |
|---|---|---|
| `VISITANTE_SEM_CPF` | Telefone novo, sem cadastro, e faltou `visitante.nome`/`visitante.cpf` | Pedir nome e CPF/CNPJ ao cliente e tentar de novo |
| `PROMOCAO_INVALIDA` | `promocaoId` não existe, já encerrou, está fora do período, ou é de outro produto | Não insistir na promoção; seguir com o preço normal ou avisar o cliente que a promoção não está mais disponível |
| `PROMOCAO_NAO_LIBERADA` | A promoção existe e está vigente, mas a condição (quantidade/valor mínimo) não foi atendida pelo carrinho atual | A mensagem de erro já explica em português o que falta — repassar ao cliente ou sugerir aumentar o pedido |

Nada é gravado no banco quando o endpoint retorna erro — é seguro repetir a chamada corrigida.

---

## 9. Campos que só existem para o painel interno (nunca vira tool da Ana)

- `POST /cliente/buscar`, `POST /cliente/ficha`: usados pela tela logada da equipe de atendimento
  para vincular manualmente uma conversa ao cadastro do CA-Hardt. Não devolvem preço negociado.
- `POST /cliente/situacao`: 🔒 **nunca é usado pela IA para responder o cliente.** Devolve
  `{ reconhecido, inadimplente, titulosVencidos, valorVencido, vencidoDesde, diasAtraso,
  titulosAbertos, valorAberto }` — é só para o backend do painel avisar a equipe humana quando um
  pedido da Ana entra para um cliente inadimplente. A Ana não fala de cobrança nem muda o
  atendimento por causa disso.

---

## 10. `situacao` do pedido — nota de terminologia

O campo `situacao` (quando aparecer em telas administrativas do CA-Hardt) é **só do painel**, não
faz parte do contrato desta API para a IA — o status relevante para o bot é sempre o par
`status`/`statusEntrega`/`emAberto` do [objeto único de pedido](#objeto-único-de-pedido-v16) descrito
no documento completo (`backend/docs/ia-consulta-api.md`, dentro do repositório do CA-Hardt).

---

## 11. `horaCorte` — hora limite para pedido do dia

Vem em `GET /congelados/config`, nos dois `reconhecer-telefone` e em `/cliente/ficha`, como string
`"HH:MM"` (24h) ou **`null`** quando a empresa ainda não configurou esse horário (não existe tela
para isso hoje — é configurado direto no banco pelo time do CA-Hardt). **O bot precisa tratar
`null` normalmente** — nesse caso, não existe corte a informar; não inventar um horário.

---

## 12. curls de exemplo (produção)

```bash
K='x-ia-api-key: SUACHAVE'
J='Content-Type: application/json'
B=https://cahardt-github.xrqvlq.easypanel.host/api/ia-consulta/v1

# health-check
curl -H "$K" $B/status

# catálogo público com objeto único de produto
curl -H "$K" $B/congelados/catalogo | jq '.dados[0] | {id,nome,nomeCurto,precoTabela,embalagemInfo,tamanho,pesoUnidadeG,preparoTipo,modoPreparo,etiqueta,disponivel,promocao}'

# promoções vigentes + regras de como funcionam
curl -H "$K" $B/congelados/promocoes | jq '.dados.promocoes, .dados.regras'

# indisponíveis + orientação fixa
curl -H "$K" $B/congelados/indisponiveis | jq '.dados.produtos, .dados.orientacao'

# reconhecimento por telefone (Congelados)
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888"}' \
  $B/congelados/reconhecer-telefone | jq '.dados | {reconhecido,ultimoPedidoDetalhe,pedidosEmAberto,proximasEntregas,horaCorte,vendedorInfo,condicaoPadrao}'

# reconhecimento geral (qualquer linha)
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888"}' \
  $B/cliente/reconhecer-telefone | jq '.dados'

# histórico com itens (inclui fila de aprovação no topo)
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888","limite":5,"comItens":true}' \
  $B/cliente/historico-pedidos | jq '.dados.pedidos[] | {fonte,numero,numeroFila,dataPrevista,entregueEm,entregador,status,emAberto,origem}'

# produtos comprados (tendência de recompra)
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888"}' \
  $B/cliente/produtos-comprados | jq '.dados.resumo, .dados.produtos[0]'

# criar pedido de Congelados
curl -H "$K" -H "$J" -X POST -d '{
  "telefone":"5547999998888",
  "itens":[{"id":"<id do site>","quantidade":3,"promocaoId":"<id da promoção>"}],
  "observacoes":"sem cebola",
  "observacaoInterna":"aceitou a promo",
  "origem":"WHATSAPP_IA",
  "idempotencyKey":"uuid-1"
}' $B/congelados/pedido | jq .dados

# pedido específico, por número
curl -H "$K" "$B/cliente/pedido/12345?telefone=5547999998888" | jq '.dados'
```

---

## 13. Avisos ativos (histórico até 2026-09-15)

Estes avisos já foram publicados em `meta.avisos` no passado — **não são quebra de contrato**, são
mudanças de comportamento que já aconteceram e o bot precisa conhecer:

1. `POST /cliente/historico-pedidos`: a lista passa a incluir, **no topo e fora do `limite`**, os
   pedidos ainda na fila de aprovação (`fonte:"FILA"`, status `AGUARDANDO`/`PENDENTE_CADASTRO`,
   `numero` = número da fila). Entradas antigas continuam iguais, com `fonte:"PEDIDO"`. Note também
   que `dataEntrega` sempre foi a hora REAL da entrega (`null` até o motorista entregar) — a data
   prevista está no campo `dataPrevista`.
2. `POST /cliente/criar-lead`: a `cidade` enviada passa a ser gravada com a grafia oficial (ex.:
   `"JOINVILLE"`, `"joinvile"` e `"Joinville "` viram todas `"Joinville"`; `"ITAPOA"` vira
   `"Itapoá"`). Nenhum campo de resposta mudou. A IA pode continuar mandando a cidade como o cliente
   escreveu.

Para o histórico completo e sempre atualizado de `meta.avisos`, consultar `GET /status` (ou
qualquer outra chamada — o array vem em toda resposta) em produção.

---

## 14. A regra que nunca pode ser quebrada, resumida

Este documento é um espelho do contrato oficial mantido no repositório do CA-Hardt
(`backend/docs/ia-consulta-api.md`). O CA-Hardt se compromete a:

1. **Nunca remover ou renomear** um campo de resposta já existente em `/v1` sem aviso prévio (em
   `meta.avisos`, com antecedência).
2. Mudança que quebra o formato de resposta vira sempre uma versão nova (`/v2`), mantendo `/v1` no
   ar — o bot nunca é forçado a migrar de repente.
3. Testar toda mudança com `curl` antes de publicar em produção.

Do lado do bot, a expectativa é: **checar `meta.avisos`** regularmente e nunca acessar o banco de
dados do CA-Hardt diretamente — qualquer dado que falte é um pedido de endpoint novo para o time do
CA-Hardt, não um motivo para contornar esta API.
