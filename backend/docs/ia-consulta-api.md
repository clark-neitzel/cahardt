# API de Consulta para IA Externa (WhatsApp / Antigravity)

API para um assistente de IA externo (hoje, o projeto "Antigravity", em outra pasta) consultar
dados do Hardt em tempo real e responder clientes no WhatsApp: catálogo/agenda/entrega do Kit
Festa, catálogo/condição comercial dos Congelados, reconhecimento de cliente/histórico/lead para
qualquer linha e — desde a **v1.4** — **criação de pedido** (Congelados e Kit Festa) que cai na
fila de aprovação do CA-Hardt; nada vira venda direto, o faturamento aprova (ver seção "Fase 2").

**IMPORTANTE:** esta API existe para o bot NUNCA precisar de acesso direto ao banco de dados
(`DATABASE_URL`/SQL cru). Se alguma informação que o bot precisa não está aqui, a resposta é
**pedir um endpoint novo**, não conectar direto no Postgres — ver "Por que isso importa" abaixo
para o incidente que motivou essa regra.

## Acesso

- **Base:** `https://<dominio-do-backend>/api/ia-consulta/v1`
- **Autenticação:** header `x-ia-api-key: <chave>` em toda requisição. A chave fica na env var
  `IA_WHATSAPP_API_KEY` (backend) — nunca reaproveitar o `ADMIN_SECRET`.
- **Limite:** 60 requisições/minuto por chave (429 se exceder).
- Sem a chave configurada no servidor → `503`. Chave errada/ausente → `401`.

## Formato de toda resposta

```json
{
  "meta": { "versaoApi": "1.4.0", "avisos": [], "geradoEm": "2026-07-02T00:00:00.000Z" },
  "dados": { /* conteúdo específico do endpoint */ }
}
```

Respostas de erro (4xx/5xx) NÃO usam esse envelope — vêm como `{ "error": "mensagem" }`.

### `meta.avisos` — como evitar que uma mudança nossa quebre o app da IA

Sempre que o time do CA-Hardt precisar mudar/remover algo que a IA já consome, o aviso é publicado
com antecedência em `backend/config/iaConsultaVersao.js` (array `AVISOS`) e passa a aparecer em
**toda resposta**, em `meta.avisos`, como `{ desde, mensagem }`.

**Regra para o app consumidor (Antigravity):** a cada chamada (ou pelo menos 1x/dia via `/status`),
verificar se `meta.avisos` não está vazio, logar/alertar o time, e ajustar o código antes da data
mencionada na mensagem. Assim a mudança nunca pega o app de surpresa.

## Endpoints

| Método | Rota | Body/Query | Retorna em `dados` |
|---|---|---|---|
| GET | `/status` | — | `{ ok: true }` — health-check. Chamar antes de responder um cliente crítico; se falhar, usar mensagem de fallback (ver abaixo). |
| GET | `/kitfesta/catalogo` | — | Lista de produtos (nome, preço, unidades por caixa, opções, tags) |
| GET | `/kitfesta/categorias` | — | Categorias de filtro do site |
| GET | `/kitfesta/config` | — | Dados da loja, regras (ex.: mínimo de caixas), textos institucionais |
| GET | `/kitfesta/agenda` | `?inicio=YYYY-MM-DD&fim=YYYY-MM-DD` | Mapa de status por dia: `open`\|`few`\|`full`\|`closed` |
| GET | `/kitfesta/slots` | `?data=YYYY-MM-DD&modo=retirada\|entrega` | Horários daquele dia com capacidade/lotação |
| POST | `/kitfesta/validar-cupom` | `{ codigo, totalCaixas }` | Validação do cupom (tipo, valor, mínimo de caixas) |
| POST | `/kitfesta/verificar-entrega` | `{ cep }` | `{ atende: true\|false\|null, distanciaKm, raioKm, endereco }` |
| GET | `/congelados/catalogo` | — | Catálogo com preço **genérico** (tabela "Site", visitante sem cadastro). **(v1.6)** cada item traz também o [objeto único de produto](#objeto-único-de-produto-v16) (`nomeCurto`, `nomeCompleto`, `embalagemInfo`, `tamanho`, `pesoUnidadeG`, `preparoTipo`, `precoTabela`, `precoCliente:null`, `disponivel`, `previsaoRetorno`, `promocao`…) somado aos campos antigos |
| GET | `/congelados/grupos` | — | Categorias/grupos do catálogo de congelados |
| GET | `/congelados/config` | — | Dados da loja, mínimo padrão, se atende sábado/domingo (`entregas.sabado/domingo`). **(v1.6)** + `horaCorte` (`"HH:MM"` ou `null`) |
| GET | `/congelados/produto/:id/ficha` | `:id` = id do produto no site | Ficha técnica/nutricional do produto |
| GET | `/congelados/promocoes` | — | **(v1.6)** Promoções vigentes dos produtos do site, contexto tabela "Site": `{ promocoes:[{ id, nome, tipo:"PRECO"\|"CONDICIONAL", precoPromo, precoNormal, condicao, validoAte, tabelas:["*"], produtoId, id_site, produto }] }`. **(v1.6.1)** ganha também `regras` (como promoção funciona neste sistema) — ver seção v1.6.1 |
| GET | `/congelados/indisponiveis` | — | **(v1.6)** Produtos do site sem estoque: `{ produtos:[{ id, produtoId, nome, previsaoRetorno:null, produto }] }`. **(v1.6.1)** ganha também `orientacao` (texto fixo — não existe previsão no cadastro) |
| POST | `/congelados/reconhecer-telefone` | `{ telefone }` | Se o telefone bater com um cliente cadastrado: catálogo já com preço/condição/dias de entrega REAIS dele. **(v1.4)** cada produto traz `comprado:true/false` e a resposta traz `ultimoPedido:[{id,congeladosProdutoId,produtoId,nome,unidade,quantidade,precoUnit}]` (o "de sempre" — **array**, formato inalterado). **(v1.5)** o telefone também casa com os WhatsApps cadastrados na lista do cliente. **(v1.6)** cada item do `catalogo[]` ganha o objeto único de produto (com `precoCliente` = preço dele e `promocao.precoPromo` já com o acréscimo da condição dele); cada item de `ultimoPedido[]` ganha o sub-objeto `produto`; a resposta ganha `ultimoPedidoDetalhe` (objeto de pedido com itens), `pedidosEmAberto[]`, `proximasEntregas[]`, `horaCorte`, `ultimaCompraEm`, `diasSemComprar`, `vendedorInfo`; `condicaoPadrao` ganha `prazoDias`, `parcelas`, `tipoPagamento`. Senão: `{ reconhecido: false }` |
| POST | `/congelados/criar-senha-telefone` | `{ telefone, senha }` | Cria a senha do site (mesma conta do login) — só funciona se `telefone` bater com um cadastro. Devolve `{ token, cliente }` |
| POST | `/congelados/check-doc` | `{ documento }` (CPF/CNPJ) | `{ situacao, temCadastroApp, nome }` — descobre se o documento já tem cadastro/senha |
| POST | `/congelados/login` | `{ documento, senha }` | `{ token, cliente }` se a senha bater |
| POST | `/congelados/criar-senha` | `{ documento, senha, nome?, telefone? }` | Cria a senha **só se a conta ainda não tiver uma** (senão erro "já tem senha, use esqueci-senha") |
| POST | `/congelados/esqueci-senha` | `{ documento }` | Manda um código de 6 caracteres pelo WhatsApp — **só para o telefone já cadastrado**, nunca pra quem pediu |
| POST | `/congelados/reset-senha` | `{ documento, codigo, novaSenha }` | Confirma o código e define a nova senha. Devolve `{ token, cliente }` |
| GET | `/congelados/meu-catalogo` | header `Authorization: Bearer <token>` | Catálogo com preço/condição/dias de entrega do cliente autenticado. **(v1.6)** itens com o objeto único de produto; `ultimoPedido[].produto` |
| GET | `/congelados/perfil` | header `Authorization: Bearer <token>` | Dados do cliente autenticado (nome, dias de entrega, condição padrão) |
| POST | `/cliente/reconhecer-telefone` | `{ telefone }` | **Geral, qualquer linha.** Se bater com um cadastro: `{ reconhecido:true, cliente:{nome,documento,cidade,vendedor}, diasEntrega:[...], diasVenda:[...], condicaoPagamento:{nome,valorMinimo} }`. **(v1.5)** o telefone também casa com os WhatsApps cadastrados na lista do cliente. **(v1.6)** + `ultimoPedidoDetalhe`, `pedidosEmAberto[]`, `proximasEntregas[]`, `horaCorte`, `ultimaCompraEm`, `diasSemComprar`, `vendedorInfo`, `endereco`; `condicaoPagamento` ganha `id`, `prazoDias`, `parcelas`, `tipoPagamento`, `permiteEspecial`. Senão: `{ reconhecido:false }` |
| POST | `/cliente/historico-pedidos` | `{ telefone, limite?, comItens? }` (limite padrão 10, máx 30) | Se o telefone bater: `{ reconhecido:true, cliente:{nome}, pedidos:[{numero,data,dataEntrega,statusEntrega,tipo,total}] }`. **(v1.4)** com `comItens:true`, cada pedido também traz `itens:[{produtoId,nome,quantidade,unidade,precoUnit}]`. **(v1.6)** cada pedido é o [objeto único de pedido](#objeto-único-de-pedido-v16) (`fonte`, `numeroFila`, `dataPrevista`, `entregueEm`, `entregador`, `status`, `emAberto`, `origem`, `nfeNumero`…), os itens ganham `id`, `precoTotal`, `promocaoId`, `produto`, e **pedidos ainda na fila de aprovação entram no topo** (`fonte:"FILA"`, fora do `limite`). Senão: `{ reconhecido:false }` |
| POST | `/cliente/produtos-comprados` | `{ telefone, meses? }` (padrão 12, máx 24) | **(v1.6)** Agregado do que o cliente compra: `{ reconhecido, janelaMeses, resumo:{totalPedidos,primeiroPedido,ultimoPedido,intervaloMedioDias}, produtos:[{ produtoId, id, nome, unidade, ultimaCompra, primeiraCompra, vezes, qtdMedia, qtdTotal, ultimoPreco, semanasDesdeUltima, noSite, produto }] }`, ordenado por `ultimaCompra` desc |
| GET | `/cliente/pedido/:numero` | `?telefone=…&fonte=PEDIDO\|FILA` (**`telefone` obrigatório**) | **(v1.6)** "Meu pedido chegou?": `{ reconhecido, cliente:{nome}, encontrado, pedido }` — só pedido DO cliente do telefone (número de outro cliente → `encontrado:false`). Sem `fonte` tenta o Pedido real e depois a fila |
| POST | `/cliente/situacao` | `{ telefone }` | **(v1.6, 🔒 só painel da equipe — NUNCA tool da IA)** `{ reconhecido, inadimplente, titulosVencidos, valorVencido, vencidoDesde, diasAtraso, titulosAbertos, valorAberto }` |
| POST | `/cliente/criar-lead` | `{ nomeEstabelecimento, whatsapp, contato?, cidade?, observacoes? }` | Cria um prospect no CRM interno (mesma tabela que os vendedores veem). Retorna `{ id, numero, etapa }`. `origemLead` é sempre fixado como `"WHATSAPP_IA"`. **(v1.5.1)** a `cidade` é gravada com a grafia oficial (`"JOINVILLE"`/`"joinvile"` → `"Joinville"`, `"ITAPOA"` → `"Itapoá"`) — mande como o cliente escreveu, sem tratar. **(09/2026, cadastro oficial de cidades)** cidade que não existe na lista do CA-Hardt **continua sendo aceita** (modo tolerante): o lead é criado normalmente e a cidade vira uma pendência interna para o escritório cadastrar ou corrigir. Nunca devolve erro por causa da cidade; a resposta não mudou |
| POST | `/cliente/buscar` | `{ busca, limite? }` (mín. 3 caracteres; padrão 10, máx 20) | **(v1.5, só painel da equipe)** Busca parcial por Razão Social, Nome Fantasia ou CPF/CNPJ (11+ dígitos = documento) em **clientes e fornecedores**. Retorna `{ clientes:[{tipo,documento,nome,nomeFantasia,cidade,vendedor,ativo,telefones,whatsapps}] }` — `tipo` é `"CLIENTE"` ou `"FORNECEDOR"` (v1.6.2). Ver seção "Busca e ficha para o painel". |
| POST | `/cliente/ficha` | `{ documento }` (com ou sem pontuação) | **(v1.5, só painel da equipe)** Ficha de UM cliente pela chave `documento`. Retorna `{ encontrado, tipo, cliente:{nome,nomeFantasia,documento,cidade,vendedor,ativo}, diasEntrega, diasVenda, condicaoPagamento, whatsapps, telefones }`. **(v1.6)** + `horaCorte`; `condicaoPagamento` com os mesmos extras do reconhecimento. **(v1.6.2)** se o documento não é de cliente, procura em fornecedor (`tipo:"FORNECEDOR"`, `horaCorte:null` + objeto `fornecedor`); documento nos dois cadastros = cliente prioridade + `tambemFornecedor:true` |
| POST | `/congelados/pedido` | `{ telefone, itens:[{id,quantidade,promocaoId?}], data?, modo?, observacoes?, observacaoInterna?, origem?, idempotencyKey?, visitante?:{nome,telefone,cpf?} }` | **(v1.4)** Cria pedido de Congelados na fila de aprovação (`AGUARDANDO`; `PENDENTE_CADASTRO` se telefone novo). Preço recalculado no servidor. Retorna `{ id, numero, status, total }`. **(v1.6)** aceita `itens[].promocaoId` (validada e recalculada aqui — `precoUnit` no body é ignorado), `observacaoInterna` (só a equipe vê) e `origem` (sempre gravado `WHATSAPP_IA`); a resposta ganha `origem` e `itens[]` (com `produto`), inclusive na repetição por `idempotencyKey`. Erros com `code`: `VISITANTE_SEM_CPF`, `PROMOCAO_INVALIDA`, `PROMOCAO_NAO_LIBERADA`. Ver "Fase 2" e "v1.6.0". |
| POST | `/kitfesta/pedido` | `{ telefone, itens:[{id,quantidade,opcao?}], modo, data, horario, enderecoEntrega?, cep?, cupomCodigo?, observacoes?, idempotencyKey?, visitante?:{nome,telefone,cpf?} }` | **(v1.4)** Cria pedido de Kit Festa na fila de aprovação. Webhook automático desligado (a Ana confirma). Retorna `{ id, numero, status, total }`. Ver "Fase 2". |

### Imagem de produto — JÁ disponível (não precisa de endpoint novo)

Todo produto devolvido pelos catálogos já traz a foto principal no campo **`imagem`** (URL pública,
ou `null` se ninguém subiu foto ainda). Vale para `GET /kitfesta/catalogo`,
`GET /congelados/catalogo`, `POST /congelados/reconhecer-telefone` e `GET /congelados/meu-catalogo`.
Congelados ainda traz **`imagens`** (array com todas as fotos, principal primeiro) no catálogo e na
ficha (`GET /congelados/produto/:id/ficha`). Ou seja, o campo já existe — o app consumidor só precisa
ler `imagem`; não há nada a implementar aqui. (Se a foto vier `null`, é porque falta o cadastro da
imagem do produto no app, não a API.)

### Como a IA deve reconhecer o cliente de Congelados, do jeito mais simples pro mais seguro

1. **Telefone (automático, sem perguntar nada):** chamar `POST /congelados/reconhecer-telefone` com o
   número de quem mandou a mensagem no WhatsApp. Se `reconhecido: true`, já usar esse catálogo —
   é o preço/condição real do cliente. Isso é seguro porque o número de quem manda mensagem no
   WhatsApp é autenticado pela própria plataforma (ninguém "digita" o número de outra pessoa).
2. **Se não reconheceu por telefone:** perguntar o CPF/CNPJ e chamar `check-doc`.
   - Se já tem senha (`TEM_SENHA`): pedir a senha e chamar `login`. Sucesso → usar o `token` em
     `meu-catalogo`.
   - Se ainda não tem senha (`CRIAR_SENHA` ou `SEM_CADASTRO`): oferecer criar uma senha ali mesmo
     (`criar-senha`) OU, se o cliente esqueceu, `esqueci-senha` (manda código pro WhatsApp já
     cadastrado) seguido de `reset-senha` com o código recebido.
3. **Nunca** liberar preço negociado/dias de entrega/pedidos de um cliente só com o CPF/CNPJ digitado
   sem passar por um dos dois caminhos acima — ver "Por que isso importa" abaixo.

### Por que isso importa (não é regra por regra, é pra não vazar dado de cliente)

CPF e principalmente CNPJ não são segredo — aparecem em nota fiscal, cartão de visita, Google. Uma
versão anterior desta API aceitava só `{ documento }` para devolver o preço negociado do cliente,
o que permitiria qualquer pessoa consultar o preço/pedidos de qualquer cliente sabendo o
CPF/CNPJ dele — **isso foi corrigido antes de qualquer app externo consumir**, e não deve voltar.
A mesma falha existia (e foi corrigida) no próprio `criarSenha` do site público: ele sobrescrevia
a senha de uma conta já existente sem pedir a senha antiga nem um código — ou seja, bastava saber
o CPF/CNPJ de alguém pra tomar conta da conta dela. Agora `criarSenha` recusa se já existir senha.

### Endpoints `/cliente/*` (gerais, qualquer linha) e o incidente que os motivou

Em 2026-07, descobrimos que o bot de WhatsApp (antes desta seção existir) rodava **SQL direto
contra o banco de produção** (`DATABASE_URL`/`CAHARDT_DATABASE_URL`) para reconhecer cliente por
telefone e criar lead — porque essas duas coisas não existiam ainda nesta API. Isso quebrou quando
o bot assumiu nomes de coluna errados (`clientes.uuid` em vez de `"UUID"`; `leads.nome`, que nunca
existiu — o campo é `nomeEstabelecimento`), e o incidente revelou o problema maior: com a senha do
banco, o bot podia ler/escrever qualquer tabela, de qualquer cliente, por fora de toda proteção
daqui (telefone batendo, sem CPF sozinho, avisos de mudança — nada disso vale se o consumidor nem
passa pela API).

**Regra:** `/cliente/reconhecer-telefone` e `/cliente/historico-pedidos` seguem a MESMA regra de
segurança do Congelados — só liberam dado com o telefone batendo no cadastro real, nunca com
CPF/CNPJ sozinho. `/cliente/criar-lead` é mais aberto (é só um cadastro de prospect novo, dado que
a própria pessoa está fornecendo na conversa), mas ainda exige nome e WhatsApp válidos.

**Se o bot precisar de mais alguma informação de cliente/pedido/preço que não está listada aqui, a
resposta certa é pedir um endpoint novo nesta API — nunca reintroduzir acesso direto ao banco.**

### Busca e ficha para o PAINEL da equipe (v1.5, + fornecedores v1.6.2) — `/cliente/buscar` e `/cliente/ficha`

Estes dois endpoints existem para a **tela logada da equipe de atendimento** no painel do bot
(vincular manualmente uma conversa ao cadastro do CA-Hardt). **Não entram nas tools da IA nem são
expostos a cliente final** — quem chama é o backend do painel. Por isso podem buscar por
nome/documento; a IA continua identificando cliente SÓ pelo telefone autenticado do WhatsApp.
A busca não devolve preço/condição negociada — só identificação de cadastro.

**v1.6.2 (2026-09-16):** os dois endpoints passam a buscar também em **Fornecedor** (não só
Cliente) — antes o painel não achava uma empresa que só existe como fornecedor (ex.: "Karville").

**`POST /cliente/buscar`** — body `{ "busca": "panificadora joao", "limite": 10 }`:
- `busca` (obrigatório, mín. 3 caracteres): casa com Razão Social, Nome Fantasia ou CPF/CNPJ,
  parcial, sem diferenciar maiúsculas/acentos. Com 11+ dígitos (ignorando pontuação), vira busca
  por documento (comparada ignorando pontuação — CNPJ alfanumérico incluído). Vale para **clientes
  e fornecedores** ao mesmo tempo.
- `limite` (opcional): padrão 10, máx. 20 — **conta o total combinado** (clientes + fornecedores).
  Inativos aparecem (com `ativo:false`), depois dos ativos, dentro de cada grupo.
- Ordem da lista: **clientes primeiro, fornecedores depois**. Se o mesmo documento existir nos dois
  cadastros, os dois itens aparecem (com `tipo` diferente).

Resposta em `dados` — cada item ganha o campo `tipo` (`"CLIENTE"` ou `"FORNECEDOR"`, v1.6.2; itens
de cliente sempre traziam esse cadastro, o campo é só identificação, nada mudou de valor):

```json
{
  "clientes": [
    {
      "tipo": "CLIENTE",
      "documento": "12345678000190",
      "nome": "Panificadora Joao Ltda",
      "nomeFantasia": "Padaria do Joao",
      "cidade": "Joinville",
      "vendedor": "Jociel",
      "ativo": true,
      "telefones": ["4733331234"],
      "whatsapps": ["47999991234"]
    },
    {
      "tipo": "FORNECEDOR",
      "documento": "98765432000155",
      "nome": "Karville Alimentos Ltda",
      "nomeFantasia": "Karville",
      "cidade": "Joinville",
      "vendedor": null,
      "ativo": true,
      "telefones": ["4732221111"],
      "whatsapps": []
    }
  ]
}
```

Fornecedor usa o **mesmo formato** do item de cliente — só que `vendedor` sempre vem `null` e
`whatsapps` sempre vem `[]` (o cadastro de fornecedor não tem essas colunas).

**`POST /cliente/ficha`** — body `{ "documento": "12345678000190" }` (com ou sem pontuação).
Resposta em `dados` (mesmo shape do `reconhecer-telefone`, com `encontrado` no lugar de
`reconhecido` + os campos novos):

```json
{
  "encontrado": true,
  "tipo": "CLIENTE",
  "cliente": {
    "nome": "Panificadora Joao Ltda",
    "nomeFantasia": "Padaria do Joao",
    "documento": "12345678000190",
    "cidade": "Joinville",
    "vendedor": "Jociel",
    "ativo": true
  },
  "diasEntrega": ["Terça"],
  "diasVenda": ["Segunda"],
  "condicaoPagamento": { "nome": "Boleto 28d", "valorMinimo": 400 },
  "whatsapps": ["47999991234"],
  "telefones": ["4733331234"]
}
```

**v1.6.2 — ficha de fornecedor:** se o documento não bate com nenhum cliente, a API procura em
Fornecedor antes de devolver "não encontrado". Mesmo shape, com `diasEntrega`/`diasVenda` vazios,
`condicaoPagamento`/`vendedor`/`horaCorte` nulos (fornecedor não tem essas informações) e um objeto
novo `fornecedor` só com o que existir no cadastro (`email`, `telefone`, `inscricaoEstadual`, `uf`):

```json
{
  "encontrado": true,
  "tipo": "FORNECEDOR",
  "cliente": {
    "nome": "Karville Alimentos Ltda",
    "nomeFantasia": "Karville",
    "documento": "98765432000155",
    "cidade": "Joinville",
    "vendedor": null,
    "ativo": true
  },
  "diasEntrega": [],
  "diasVenda": [],
  "condicaoPagamento": null,
  "whatsapps": [],
  "telefones": ["4732221111"],
  "horaCorte": null,
  "fornecedor": { "telefone": "4732221111", "inscricaoEstadual": "1234567", "uf": "SC" }
}
```

Se o mesmo documento existir como cliente **e** fornecedor, o **cliente tem prioridade** (é o que
volta na ficha) e a resposta ganha `"tambemFornecedor": true` para o painel avisar a equipe.

Não achando o documento em nenhum dos dois cadastros: `{ "encontrado": false }`. Observações de
formato: `documento` vem como está gravado no cadastro (normalizado, sem pontuação);
`telefones`/`whatsapps` vêm só dígitos, sem DDI 55; `nomeFantasia`, `cidade`, `vendedor` e
`condicaoPagamento` podem ser `null`.

**WhatsApps no cadastro (v1.5):** o cadastro de cliente do CA-Hardt ganhou uma lista de números de
WhatsApp (campo "WhatsApps" na tela de cliente, tabela `cliente_whatsapps`). Os dois
`reconhecer-telefone` (geral e Congelados) casam também por esses números, com a mesma tolerância
de sempre (com/sem 9º dígito, com/sem DDI 55, ignorando pontuação).

## v1.6.0 — dados para a Ana tirar o pedido semanal (2026-09-10)

Pedido do bot em `backend/docs/pedido-bot-ana-v1.6.0.md` (8 itens) — todos atendidos, **tudo
aditivo**: nenhum campo de `/v1` foi removido, renomeado ou mudou de tipo. Onde o bot pediu um nome
que colidia com um campo existente, o novo entrou com outro nome e o antigo ficou intacto:
`ultimoPedido` continua **array** (o objeto é `ultimoPedidoDetalhe`); `grupo` continua o **ID** da
categoria (o nome humano é `grupoNome`); `embalagem` continua **string** (o objeto é
`embalagemInfo`); `preparo` continua o rótulo livre (o enum é `preparoTipo`); `nome` continua
`nomeSite ‖ nome do sistema` (o curto derivado é `nomeCurto`, o de auditoria é `nomeCompleto`).

### Objeto único de produto (v1.6)

Aparece **no mesmo nível do item** em `GET /congelados/catalogo`, `POST /congelados/reconhecer-telefone`
(`catalogo[]`) e `GET /congelados/meu-catalogo`, e como **sub-objeto `produto`** em: itens de
`historico-pedidos` (com `comItens`), `produtos-comprados`, `ultimoPedido[]`/`ultimoPedidoDetalhe.itens`,
`pedidosEmAberto[].itens`, resposta de `POST /congelados/pedido`, `promocoes[]`, `indisponiveis[]` e
`GET /cliente/pedido/:numero`.

| Campo | O que é | Vem `null`/vazio quando |
|---|---|---|
| `id` | id do produto **no site** (`congeladosProdutoId`) — é o que vai em `itens[].id` ao criar pedido | produto não está no site (item de histórico antigo) |
| `produtoId` | id do produto no app | — |
| `codigo` | código do cadastro (numérico, ex. `"3059"`) | `""` se não houver |
| `nome` | `nomeSite` ‖ nome do sistema (campo antigo, inalterado) | — |
| `nomeSite` | nome exatamente como aparece no site | não preenchido no admin do site |
| `nomeCompleto` | nome do sistema, ex. `1-G-COXINHA TRADICIONAL FRANGO C/20 130GR` | — |
| `nomeCurto` | **(v1.6.1)** `etiqueta.nomeProduto` (nome digitado à mão no PCP, sem código/prefixo) quando há etiqueta ativa; senão derivado do nome do sistema: tira o prefixo `<dígito>-[XX-][P/M/G/GG-]`, o ` C/<un>` e o ` <peso>GR` → `COXINHA TRADICIONAL FRANGO` | nunca (cai no `nomeCompleto` se nada casar) |
| `linha` | `"CONGELADOS"` | `null` se o produto não está no site |
| `grupo` / `grupoNome` | ID / nome da categoria comercial | sem categoria |
| `tamanho` | `P`/`M`/`G`/`GG` lido do nome do sistema (só se estiver exatamente nessa posição) — a etiqueta não tem esse campo | nome fora do padrão |
| `pesoUnidadeG` | peso unitário em g: `etiqueta.pesoUnitario` → senão o `<peso>GR` do nome | sem etiqueta e nome sem `GR` |
| `unidade`, `unidades`, `embalagem` | campos antigos (inalterados) | — |
| `embalagemInfo` | `{ rotulo, unidade, unidadesPorEmbalagem, pesoG }` — **(v1.6.1)** `unidadesPorEmbalagem` = unidades do site → senão `etiqueta.quantidadeEmbalagem` → senão qtd. por caixa do cadastro → senão `C/<n>` do nome; `pesoG` = `etiqueta.pesoPacote` → senão `unidadesPorEmbalagem × pesoUnidadeG` | os sub-campos vêm `null` quando não há fonte |
| `preparo` | rótulo livre da categoria (campo antigo) | `""` se a categoria não tem rótulo |
| `preparoTipo` | `FRITO` / `ASSADO` / `PRONTO` / `CRU`, normalizado **só** do rótulo curado da categoria (campo `preparo` acima) — vocabulário controlado pelo admin. **Nunca** derivado do texto livre de `modoPreparo`: um regex sobre texto livre classificaria errado frases com negativa (ex.: "Não fritar, assar em forno…" contém a palavra "fritar") | categoria sem rótulo configurado ou rótulo não reconhecido. **Quando vier `null`, use `modoPreparo` (se houver) para descrever o preparo em palavras — não tente classificar por conta própria** |
| `modoPreparo` | **(v1.6.1)** texto livre do "Modo de Preparo" da etiqueta do PCP, cortado em 300 caracteres — pode ser citado literalmente pela Ana, inclusive como alternativa quando `preparoTipo` vier `null` | sem etiqueta cadastrada para o produto |
| `etiqueta` | **(v1.6.1)** `{ codigoBarras, alergenos:[], contemGluten, contemLactose, armazenamento }` da etiqueta ativa do PCP — útil para "tem glúten?"/"tem lactose?"/"como guardar?" | `null` sem etiqueta cadastrada |
| `precoTabela` | preço de tabela do contexto: base × (1 + acréscimo% da condição). No catálogo público = tabela "Site" | — |
| `precoCliente` | preço do cliente reconhecido (último preço negociado, com piso do flex) — o mesmo `preco` do item | `null` no catálogo público e nos itens de histórico |
| `preco` | campo antigo (inalterado no catálogo). No sub-objeto `produto` = `precoCliente` ‖ `precoTabela` | — |
| `minimoPorItem` | sempre `1` (não existe no cadastro) | — |
| `ativo` | produto ativo no app **e** no site | — |
| `disponivel` / `indisponivel` | `disponivel` = ativo e estoque disponível > 0 (mesma regra do site) | — |
| `previsaoRetorno` | **sempre `null`** — não existe previsão de retorno no cadastro. **(v1.6.1)** `GET /congelados/indisponiveis` também devolve um `orientacao` de nível superior: `"Sem previsão no sistema — a Ana deve perguntar ao responsável."` | sempre |
| `promocao` | promoção vigente do produto (objeto abaixo) | sem promoção vigente |
| `imagem` / `imagens` | foto principal / todas | sem foto |

> Não derivamos `preparo`/`linha` do prefixo `1-`/`2-`/`FR` do nome: o significado desses códigos
> não está documentado. `preparoTipo` vem **só** da categoria (vocabulário controlado); se a
> categoria não tiver rótulo, vem `null` — **não** é derivado do texto livre `modoPreparo` (decisão
> revista em v1.6.1: um regex sobre texto livre do PCP classificava errado frases com negativa,
> tipo "Não fritar, assar em forno…"). `tamanho` continua vindo só do código/nome — a etiqueta não
> tem campo de tamanho.

### Regras de promoção (v1.6.1) — `regras` em `GET /congelados/promocoes`

A resposta de `GET /congelados/promocoes` ganhou um bloco `regras` explicando, em português, como
as promoções funcionam neste sistema (a Ana já recebia a lista, mas não o "manual"):

```json
{ "promocoes": [ /* … */ ],
  "regras": {
    "resumo": "…",
    "tipos": { "PRECO": "…", "CONDICIONAL": "…" },
    "precos": "precoPromo já inclui o acréscimo % da condição de pagamento do cliente…",
    "validade": "validoDe/validoAte (AAAA-MM-DD)…",
    "naoExiste": ["LEVE_MAIS"],
    "comoUsar": "mandar itens[].promocaoId em POST /congelados/pedido…",
    "observacao": "a condição VALOR_TOTAL é avaliada com preços NORMAIS, antes do desconto…" } }
```

- `PRECO` (nossa `SIMPLES`): o preço promocional vale no período, para qualquer quantidade.
- `CONDICIONAL`: liberada se **pelo menos um** grupo de `condicoes` for atendido (grupos = "ou"
  entre si); dentro de um grupo, **todas** as condições precisam bater ("e" entre elas). Tipos de
  condição: `PRODUTO_QUANTIDADE` (quantidade mínima de um produto) e `VALOR_TOTAL` (valor mínimo
  do pedido).
- A condição `VALOR_TOTAL` (e a quantidade mínima de `PRODUTO_QUANTIDADE`) é avaliada com os preços
  **normais** de tabela, somados **antes** de qualquer desconto de promoção — regra R10 do plano,
  mesma estimativa da tela do vendedor (`criarPedidoSite`, `subtotalNormal`).

### Promoções (v1.6) — `GET /congelados/promocoes` e `produto.promocao`

```json
{ "id": "…", "nome": "Coxinha Tradicional de Frango G (pct 20un)", "tipo": "PRECO", "tipoSistema": "SIMPLES",
  "produtoId": "…", "precoPromo": 39.90, "precoPromoBase": 38.00, "precoNormal": 44.13,
  "condicao": null, "condicoes": [], "validoDe": "2026-09-09", "validoAte": "2026-09-30", "tabelas": ["*"] }
```

- Na lista de `GET /congelados/promocoes`, `nome` é o **nome do produto** (`congeladosService.promocoesVigentes`
  sobrescreve, de propósito, o `nome` da promoção pelo `nome` do item do catálogo — é o que a Ana fala pro
  cliente). O nome da própria promoção fica em `produto.promocao.nome`.
- `tipo`: `PRECO` (nossa `SIMPLES`) ou `CONDICIONAL`. **`LEVE_MAIS` não existe** neste sistema.
- `CONDICIONAL`: `condicao` é o texto humano (`"a partir de 3 un de BOLINHO DE CARNE"`,
  `"pedido a partir de R$ 300,00"`; grupos unidos por `" ou "`, condições por `" e "`) e
  `condicoes` é a estrutura (`[[{ tipo:"PRODUTO_QUANTIDADE"|"VALOR_TOTAL", produtoId, produtoNome,
  quantidadeMinima, valorMinimo }]]` — array externo = OU, interno = E).
- `tabelas` é sempre `["*"]` (promoção aqui não tem vínculo com tabela de preço).
- `precoPromo` = `precoPromoBase × (1 + acréscimo% da condição do contexto)` — a mesma conta da tela
  do vendedor. Em `GET /congelados/promocoes` o contexto é a tabela "Site"; **no reconhecimento por
  telefone, `catalogo[].promocao.precoPromo` já vem com o acréscimo da condição do cliente — é esse
  que a Ana deve falar.** `precoNormal` é o preço de tabela do contexto (não o negociado).
- Só produtos que estão no site e vigentes (`ATIVA` e dentro do período). Promoção encerrada ou
  vencida não aparece.

### Criar pedido com promoção, observação interna e origem (v1.6) — `POST /congelados/pedido`

```json
{ "telefone": "5547999998888",
  "itens": [ { "id": "<id do site>", "quantidade": 8 }, { "id": "<id do site>", "quantidade": 3, "promocaoId": "<id da promoção>" } ],
  "observacoes": "sem cebola",
  "observacaoInterna": "Cliente aceitou a promoção do bolinho (3 pct).",
  "origem": "WHATSAPP_IA",
  "idempotencyKey": "…" }
→ dados: { "id", "numero", "status": "AGUARDANDO", "total", "origem": "WHATSAPP_IA",
           "itens": [ { "id", "produtoId", "nome", "quantidade", "unidade", "precoUnit", "precoTotal", "promocaoId", "nomePromocao", "produto": {…} } ] }
```

- **O preço nunca vem do bot.** `promocaoId` é só referência: o servidor confere que a promoção está
  vigente, que é daquele produto e que a condição foi atendida (olhando o carrinho inteiro), e então
  recalcula `precoUnit = precoPromoBase × (1 + acréscimo% da condição do cliente)`, ignorando o
  último preço negociado e o piso do flex. **`precoUnit`/`valor` no body são ignorados.**
- Erros `400 { error, code }`: `PROMOCAO_INVALIDA` (não existe / encerrada / fora do período / de
  outro produto), `PROMOCAO_NAO_LIBERADA` (condicional não atendida — a mensagem diz o que falta),
  `VISITANTE_SEM_CPF` (telefone novo sem nome+CPF). Nada é gravado quando dá erro.
- O mínimo da condição continua sendo checado sobre o total **final** (com promoção). Promoção
  condicional de `VALOR_TOTAL` é avaliada sobre o subtotal **a preços normais** (mesma estimativa da
  tela do vendedor).
- `observacaoInterna` (até 500 caracteres, quebras de linha viram espaço) fica numa **coluna
  própria** da fila: a equipe vê no card do pedido; **nunca** vai para o pedido real, para a NF-e
  nem para o recibo. `observacoes` continua sendo só a observação do cliente (a fila grava com o
  prefixo `[WhatsApp IA]`, que a API remove ao devolver).
- `origem` é aceito e **ignorado**: neste endpoint o pedido nasce sempre `WHATSAPP_IA` (pedidos do
  site nascem `SITE`). Serve para a equipe filtrar/auditar na fila.
- Ao aprovar, o Pedido real reavalia a promoção pela regra do vendedor (`emPromocao`/flex) — igual a
  um pedido lançado na tela.

### Objeto único de pedido (v1.6)

Usado em `historico-pedidos`, `ultimoPedidoDetalhe`, `pedidosEmAberto[]` e `GET /cliente/pedido/:numero`.
Os campos antigos (`numero, data, dataEntrega, statusEntrega, tipo, total, itens[]`) mantêm nome, tipo e
semântica.

| Campo | `fonte: "PEDIDO"` (pedido real) | `fonte: "FILA"` (ainda na fila de aprovação) |
|---|---|---|
| `id` | id do Pedido | id do pedido da fila |
| `numero` | número do Pedido (campo antigo) | **número da fila** — o mesmo devolvido por `POST /congelados/pedido` |
| `numeroFila` | número da fila de onde veio (ou `null`) | = `numero` |
| `data` | data de venda (campo antigo) | data em que entrou na fila |
| `criadoEm` | quando foi lançado | idem |
| `dataPrevista` | data prevista de entrega (= data de venda) | data escolhida no pedido (pode ser `null`) |
| `dataEntrega` | **hora REAL da entrega** (campo antigo — `null` até o motorista entregar). ⚠️ não é a data prevista | `null` |
| `entregueEm` | = `dataEntrega` quando `statusEntrega` ∈ ENTREGUE/ENTREGUE_PARCIAL/DEVOLVIDO | `null` |
| `entregador` | nome do responsável pela carga | `null` |
| `status` | `APROVADO` ‖ `CANCELADO` | `AGUARDANDO` ‖ `PENDENTE_CADASTRO` |
| `statusEntrega` | campo antigo (`PENDENTE`/`ENTREGUE`/`ENTREGUE_PARCIAL`/`DEVOLVIDO`) | `"PENDENTE"` |
| `emAberto` | não cancelado, `statusEntrega = PENDENTE` e `dataPrevista >= hoje` (São Paulo) | `true` |
| `tipo` | campo antigo (`NORMAL`/`ESPECIAL`/`BONIFICACAO`) | `null` (o faturamento decide) |
| `total` | campo antigo | total da fila |
| `modo` | `null` | `entrega` ‖ `retirada` |
| `origem` | `WHATSAPP_IA` ‖ `SITE` ‖ `KIT_FESTA` ‖ `APP` | `WHATSAPP_IA` ‖ `SITE` |
| `canalOrigem` | canal cru do app (`VISITA`/`WHATSAPP`/`LIGACAO`/`SITE_CONGELADOS`/`KIT_FESTA`/`null`) | `null` |
| `observacoes` | observação do pedido | observação do cliente (sem o prefixo `[WhatsApp IA]`) |
| `observacaoInterna` | a que veio da fila (se o pedido nasceu na fila) | a enviada em `observacaoInterna` |
| `nfeNumero` | número da NF-e (ou `null`) | `null` |
| `itens[]` (só com `comItens`) | `{ produtoId, nome, quantidade, unidade, precoUnit }` (antigos) + `id`, `precoTotal`, `promocaoId`, `produto` | idem + `nomePromocao` |

- **Fila no histórico:** `POST /cliente/historico-pedidos` passa a devolver, **no topo e fora do
  `limite`**, os pedidos ainda em `AGUARDANDO`/`PENDENTE_CADASTRO` (`fonte:"FILA"`). Pedido da fila já
  convertido não entra (o Pedido real correspondente entra com `numeroFila`). Registrado em
  `meta.avisos` como aviso informativo. Use `fonte` para distinguir.
- `ultimoPedidoDetalhe` = último pedido **real** (não bonificação, não cancelado — o lançado por
  último). Pedido ainda na fila não conta como "último": está em `pedidosEmAberto`.
- `pedidosEmAberto` = fila aberta + pedidos reais com `emAberto` (máx. 5), com itens — "já tem
  pedido esta semana" sem chamar o histórico.
- Datas com hora em ISO; datas sem hora (`ultimaCompra`, `vencidoDesde`, `validoAte`,
  `proximasEntregas[]`, `ultimaCompraEm`) em `YYYY-MM-DD`.

### Extras no reconhecimento (v1.6)

Nos dois `reconhecer-telefone`: `proximasEntregas` (próximas 2 datas a partir de amanhã que caem
nos dias de entrega do cadastro — `[]` sem dias cadastrados), `ultimaCompraEm`/`diasSemComprar`
(do `ultimoPedidoDetalhe`), `vendedorInfo { nome, nomeBot, ativo }` (só se o vendedor está ativo;
`nomeBot` é o nome usado no marcador `[Vendedor Hardt: Nome]`, `null` se não preenchido), e, no
geral, `endereco { logradouro, numero, complemento, bairro, cidade, uf, cep }`. A condição de pagamento
ganha `id`, `prazoDias`, `parcelas`, `tipoPagamento`, `permiteEspecial` ("boleto 7 dias, mínimo R$ 100").

### Hora de corte (v1.6) — `horaCorte`

Valor único da empresa, vindo de `app_configs` (chave `ia_consulta_config`). **Sem tela por
enquanto**; enquanto ninguém gravar, vem **`null`** em todos os endpoints (reconhecimentos, ficha e
`/congelados/config`) — o bot já lida com `null`. Para configurar em produção (psql/TablePlus):

```sql
INSERT INTO app_configs(key, value) VALUES ('ia_consulta_config', '{"horaCorte":"17:00"}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Formato `HH:MM` (24h); valor inválido vale como não configurado. Cache de 30 s no servidor.

### Situação financeira (v1.6) — `POST /cliente/situacao` 🔒 só painel

Mesma regra de `/cliente/buscar` e `/cliente/ficha`: **não entra nas tools da IA**. A Ana não fala de
cobrança nem muda o atendimento; o backend do bot usa isso só para avisar a equipe quando um pedido
da Ana entra para um cliente inadimplente. Mesma conta do selo "inadimplente" do cadastro no app:
parcelas em aberto vencidas antes de hoje (meia-noite em São Paulo), descontando o que já foi pago
ou descontado, ignorando pedido excluído/cancelado no CA e a conta de especial já pago em dinheiro
que só espera a conferência do Caixa. `titulosAbertos`/`valorAberto` = em aberto ainda **não**
vencido. Valores com 2 casas; `vencidoDesde` `YYYY-MM-DD` ou `null`.

### Produtos comprados (v1.6) — `POST /cliente/produtos-comprados`

Só pedidos reais (não bonificação, não cancelado, não excluído) na janela (`meses`, padrão 12, máx.
24). Por produto: `vezes` (pedidos distintos), `qtdTotal`, `qtdMedia` (= total ÷ vezes, 1 casa),
`ultimaCompra`/`primeiraCompra`, `ultimoPreco` (do pedido mais recente), `semanasDesdeUltima`,
`noSite`, `produto`. `resumo.intervaloMedioDias` = cadência real do cliente. **Devoluções não são
descontadas** (é agregado de tendência, não de faturamento).

### Pedido por número (v1.6) — `GET /cliente/pedido/:numero?telefone=…&fonte=…`

`telefone` é **obrigatório** (400 sem ele) e o pedido só é devolvido se for **do cliente daquele
telefone** — número de outro cliente dá `encontrado:false` (o número do pedido não é único no
sistema; a busca é sempre por cliente, pegando o mais recente). `fonte=FILA` consulta pelo número
da fila (qualquer status da fila, inclusive convertido/recusado); `fonte=PEDIDO` pelo número do
pedido real; sem `fonte` tenta o real e depois a fila.

### curls (v1.6)

```bash
K='x-ia-api-key: SUACHAVE'; J='Content-Type: application/json'; B=https://<dominio>/api/ia-consulta/v1
curl -H "$K" $B/congelados/catalogo | jq '.dados[0] | {id,nome,nomeCurto,precoTabela,embalagemInfo,tamanho,pesoUnidadeG,preparoTipo,modoPreparo,etiqueta,disponivel,promocao}'
curl -H "$K" $B/congelados/promocoes | jq '.dados.promocoes, .dados.regras'
curl -H "$K" $B/congelados/indisponiveis | jq '.dados.produtos, .dados.orientacao'
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888"}' $B/congelados/reconhecer-telefone | jq '.dados | {ultimoPedidoDetalhe,pedidosEmAberto,proximasEntregas,horaCorte,vendedorInfo,condicaoPadrao}'
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888","limite":5,"comItens":true}' $B/cliente/historico-pedidos | jq '.dados.pedidos[] | {fonte,numero,numeroFila,dataPrevista,entregueEm,entregador,status,emAberto,origem}'
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888"}' $B/cliente/produtos-comprados | jq '.dados.resumo, .dados.produtos[0]'
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888","itens":[{"id":"<id do site>","quantidade":3,"promocaoId":"<id da promoção>"}],"observacoes":"sem cebola","observacaoInterna":"aceitou a promo","origem":"WHATSAPP_IA","idempotencyKey":"uuid-1"}' $B/congelados/pedido | jq .dados
curl -H "$K" "$B/cliente/pedido/12345?telefone=5547999998888" | jq '.dados'
curl -H "$K" "$B/cliente/pedido/321?telefone=5547999998888&fonte=FILA" | jq '.dados.pedido.status'
# 🔒 só painel
curl -H "$K" -H "$J" -X POST -d '{"telefone":"5547999998888"}' $B/cliente/situacao | jq .dados
```

## Regra de contrato — NUNCA quebrar o app consumidor sem aviso

Esta API tem consumidor externo fora deste repositório. As regras abaixo são obrigatórias para
qualquer alteração em `backend/routes/iaConsultaRoutes.js`, `backend/controllers/kitFestaController.js`,
`backend/controllers/congeladosController.js` (nas funções usadas aqui) ou nos serviços que eles chamam:

1. **Nunca remover ou renomear um campo já existente na resposta de um endpoint de `/v1`.** Só
   adicionar campos novos é seguro sem aviso prévio.
2. **Para remover/renomear algo:** primeiro adicionar um item em `AVISOS`
   (`backend/config/iaConsultaVersao.js`) com prazo (ex.: 30 dias), esperar o prazo passar, só
   então remover.
3. **Mudança que quebra o formato de resposta** (ex.: reestruturar `dados`, mudar tipo de um campo)
   exige criar `/v2` (novo router paralelo ao `v1` em `iaConsultaRoutes.js`) e manter `/v1` no ar até
   confirmar que o app consumidor migrou. Nunca alterar `/v1` de forma incompatível.
4. **Testar com `curl` (ver exemplos abaixo) depois de qualquer mudança, antes de commitar** —
   igual à regra de build do frontend: nunca subir uma mudança nesta API sem testar manualmente.
5. Se o endpoint ficar fora do ar (deploy quebrado, banco fora), o pior cenário aceitável é o app
   da IA cair num fallback tipo "não consegui consultar agora, um atendente confirma em instantes" —
   nunca deixar o cliente sem NENHUMA resposta. Isso depende do app consumidor tratar erros/timeout
   desta API, mas nosso dever aqui é: manter `/status` sempre respondendo rápido para ele detectar a
   falha cedo.

## Exemplos de teste manual

```bash
curl -H "x-ia-api-key: SUACHAVE" https://<dominio>/api/ia-consulta/v1/status
curl -H "x-ia-api-key: SUACHAVE" https://<dominio>/api/ia-consulta/v1/kitfesta/config
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"cep":"89239-000"}' https://<dominio>/api/ia-consulta/v1/kitfesta/verificar-entrega
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"telefone":"5547999998888"}' https://<dominio>/api/ia-consulta/v1/congelados/reconhecer-telefone
curl -H "x-ia-api-key: SUACHAVE" -H "Authorization: Bearer TOKEN_DO_CLIENTE" \
  https://<dominio>/api/ia-consulta/v1/congelados/meu-catalogo
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"telefone":"5547999998888"}' https://<dominio>/api/ia-consulta/v1/cliente/reconhecer-telefone
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"nomeEstabelecimento":"Mercado do João","whatsapp":"5547988887777","cidade":"Joinville"}' \
  https://<dominio>/api/ia-consulta/v1/cliente/criar-lead
# v1.4 — histórico com itens ("o de sempre")
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"telefone":"5547999998888","comItens":true}' https://<dominio>/api/ia-consulta/v1/cliente/historico-pedidos
# v1.4 — criar pedido de Congelados (cliente reconhecido pelo telefone; itens[].id = id do catálogo)
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"telefone":"5547999998888","itens":[{"id":"<congeladosProdutoId>","quantidade":2}],"data":"2026-07-15","idempotencyKey":"abc-123"}' \
  https://<dominio>/api/ia-consulta/v1/congelados/pedido
# v1.4 — criar pedido de Kit Festa (cliente novo → nome+cpf no visitante)
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"telefone":"5547999998888","visitante":{"nome":"Maria","cpf":"12345678909"},"itens":[{"id":"<kitFestaProdutoId>","quantidade":4,"opcao":"Frango"}],"modo":"retirada","data":"2026-07-15","horario":"10:00","idempotencyKey":"xyz-789"}' \
  https://<dominio>/api/ia-consulta/v1/kitfesta/pedido
# v1.5 — busca de cliente para o painel da equipe (razão/fantasia/documento)
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"busca":"panificadora joao","limite":10}' https://<dominio>/api/ia-consulta/v1/cliente/buscar
# v1.5 — ficha completa pela chave documento
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"documento":"12345678000190"}' https://<dominio>/api/ia-consulta/v1/cliente/ficha
# v1.6.2 — busca de FORNECEDOR (nome parcial) — antes o painel não achava
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"busca":"karville","limite":10}' https://<dominio>/api/ia-consulta/v1/cliente/buscar
# v1.6.2 — ficha de fornecedor pelo documento
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"documento":"<cnpj do fornecedor>"}' https://<dominio>/api/ia-consulta/v1/cliente/ficha
```

## Histórico de versões

- **1.0.0** (2026-07-01) — Kit Festa: catálogo, categorias, config, agenda, slots, cupom, entrega.
- **1.1.0** (2026-07-02) — + Congelados: catálogo, grupos, config, ficha, check-doc, catálogo por
  cliente por CPF/CNPJ sem senha. **Substituído na 1.2.0 por razão de segurança (ver abaixo)** — nunca
  chegou a ser consumido por nenhum app externo.
- **1.2.0** (2026-07-02) — Corrige o design da 1.1.0: reconhecimento automático por telefone
  (`reconhecer-telefone`, `criar-senha-telefone`) + fluxo completo de login/senha/código
  (`login`, `criar-senha`, `esqueci-senha`, `reset-senha`) + catálogo/perfil protegidos por token
  (`meu-catalogo`, `perfil`). Remove o endpoint `cliente-catalogo` que aceitava só CPF/CNPJ sem
  prova de identidade. Também corrige `criarSenha` (Congelados e Kit Festa) para não sobrescrever
  mais uma senha já existente sem verificação.
- **1.3.0** (2026-07-04) — Nova seção `/cliente/*` (geral, qualquer linha): `reconhecer-telefone`,
  `historico-pedidos`, `criar-lead`. Substitui o SQL direto contra o banco de produção que o bot
  rodava para essas funções (ver "Endpoints `/cliente/*`..." acima).
- **1.4.0** (2026-07-07) — Fase 2 (criação de pedido pela IA): `congelados/reconhecer-telefone` passa a
  trazer `ultimoPedido[]` + `comprado` por produto; `cliente/historico-pedidos` aceita `comItens`; novos
  `POST /congelados/pedido` e `POST /kitfesta/pedido` (caem na fila de aprovação do CA-Hardt, preço
  recalculado no servidor, `idempotencyKey`, webhook do Kit Festa desligado para pedidos do bot). Tudo
  aditivo — nenhum campo removido/renomeado.
- **1.5.0** (2026-08-10) — Busca e ficha de cliente para o PAINEL da equipe do bot:
  `POST /cliente/buscar` (parcial por razão social/fantasia/documento) e `POST /cliente/ficha`
  (por documento). Cadastro de cliente ganha lista de **WhatsApps** (tabela `cliente_whatsapps`,
  editável na tela de cliente do app) e os dois `reconhecer-telefone` (geral e Congelados) passam a
  casar também por esses números (mesma tolerância de 9º dígito/DDI 55). Tudo aditivo — nenhum campo
  removido/renomeado.
- **1.5.1** (2026-08-26) — Padronização de grafia de cidade (Fase 1). A `cidade` recebida em
  `POST /cliente/criar-lead` passa a ser **gravada com o nome oficial**: `"JOINVILLE"`,
  `"joinville"`, `"Joinville "` e `"joinvile"` viram todas `"Joinville"`; `"ITAPOA"` vira
  `"Itapoá"`; `"São Francisco "` vira `"São Francisco do Sul"`. **Nenhum campo de resposta foi
  removido ou renomeado** — `criar-lead` continua devolvendo `{ id, numero, etapa }`, e a cidade
  nem aparece na resposta. A IA **não precisa mudar nada**: pode continuar mandando a cidade como
  o cliente escreveu no WhatsApp, que o CA-Hardt normaliza. Registrado também em `meta.avisos`
  (aviso informativo, sem prazo de remoção).
  Por que isso importa do lado do CA-Hardt: cidade era texto livre, e quem casa cidade faz
  comparação exata — meta em `"Itapoá"` contra lead/pedido em `"ITAPOA"` zerava o realizado do
  vendedor sem erro nenhum aparecer.
- **(2026-09-14, sem mudança de versão — aditivo)** Cadastro oficial de cidades no CA-Hardt. Para
  esta API **nada muda**: `POST /cliente/criar-lead` continua aceitando qualquer texto em `cidade`
  (modo tolerante). Se a cidade não existir na lista oficial, o lead é criado do mesmo jeito, com o
  nome normalizado, e a cidade fica como **pendência** na tela Configurações → Cidades do app para o
  escritório cadastrar ou apontar para a cidade certa. Resposta inalterada: `{ id, numero, etapa }`.
- **1.6.0** (2026-09-10) — Dados para a Ana tirar o pedido semanal (os 8 itens de
  `pedido-bot-ana-v1.6.0.md` + extras). **Objeto único de produto** somado a todo lugar que devolve
  produto (`nomeCurto`, `nomeSite`, `nomeCompleto`, `embalagemInfo`, `tamanho`, `pesoUnidadeG`,
  `preparoTipo`, `precoTabela`, `precoCliente`, `disponivel`, `previsaoRetorno`, `promocao`…) e
  **objeto único de pedido** (`fonte` PEDIDO|FILA, `numeroFila`, `dataPrevista`, `entregueEm`,
  `entregador`, `status`, `emAberto`, `origem`, `nfeNumero`, itens com `id`/`precoTotal`/`promocaoId`/
  `produto`). `historico-pedidos` passa a incluir a fila de aprovação no topo (`fonte:"FILA"`, aviso em
  `meta.avisos`). Reconhecimentos ganham `ultimoPedidoDetalhe`, `pedidosEmAberto`, `proximasEntregas`,
  `horaCorte`, `ultimaCompraEm`/`diasSemComprar`, `vendedorInfo`, `endereco` e a condição com
  `prazoDias`/`parcelas`/`tipoPagamento`. Novos: `GET /congelados/promocoes`, `GET /congelados/indisponiveis`,
  `POST /cliente/produtos-comprados`, `POST /cliente/situacao` (🔒 só painel), `GET /cliente/pedido/:numero`.
  `POST /congelados/pedido` aceita `itens[].promocaoId` + `observacaoInterna` + `origem` (colunas
  próprias na fila: `origem`, `observacaoInterna`, `promocaoId`/`nomePromocao` por item) e devolve
  `origem` + `itens[]`; erros com `code`. `horaCorte` via `app_configs.ia_consulta_config` (sem tela;
  `null` até configurar). **Tudo aditivo** — `ultimoPedido` segue array, `grupo` segue ID,
  `embalagem` segue string, `preparo` segue rótulo; `dataEntrega` segue sendo a hora real da entrega
  (a prevista está em `dataPrevista`).
- **1.6.1** (2026-09-15) — Ajustes pedidos pelo dono na v1.6.0. Objeto único de produto passa a usar
  os **Dados da Etiqueta do PCP** como fonte principal quando existe etiqueta ativa: `nomeCurto` =
  `etiqueta.nomeProduto`; `pesoUnidadeG`/`embalagemInfo.unidadesPorEmbalagem`/`embalagemInfo.pesoG`
  priorizam `etiqueta.pesoUnitario`/`quantidadeEmbalagem`/`pesoPacote`. `preparoTipo` continua vindo
  **só** do rótulo curado da categoria (revisado durante o QA desta versão: um regex sobre o texto
  livre `modoPreparo` classificava errado frases com negativa, ex. "Não fritar, assar em forno…" →
  virava `FRITO`; a versão publicada não deriva `preparoTipo` de `modoPreparo`). Campos novos:
  `modoPreparo` (texto literal da etiqueta, até 300 chars — a Ana pode citá-lo quando `preparoTipo`
  vier `null`) e `etiqueta` (`codigoBarras`, `alergenos[]`,
  `contemGluten`, `contemLactose`, `armazenamento`; `null` sem etiqueta cadastrada). `GET
  /congelados/promocoes` ganha `regras` (explica PRECO vs. CONDICIONAL, como funciona a avaliação
  de grupos/condições e que `VALOR_TOTAL` é calculado com preços normais antes do desconto). `GET
  /congelados/indisponiveis` ganha `orientacao` (texto fixo pedindo para a Ana perguntar ao
  responsável, já que não existe previsão de retorno no cadastro). **Tudo aditivo** — nenhum campo
  removido/renomeado; `tamanho` continua vindo só do código/nome do sistema (a etiqueta não tem
  esse campo); `preparo` continua sendo o rótulo livre da categoria quando ela tiver um configurado.
- **1.6.2** (2026-09-16) — `POST /cliente/buscar` e `POST /cliente/ficha` (🔒 só painel, nunca tool
  da IA) passam a buscar também em **Fornecedor**, não só Cliente: o painel do bot não achava uma
  empresa que só existe como fornecedor (ex.: "Karville"). Cada item de `cliente/buscar` ganha o
  campo novo `tipo` (`"CLIENTE"` | `"FORNECEDOR"` — itens de cliente sempre existiram, só ganharam
  esse rótulo); fornecedor usa o mesmo formato do item de cliente, com `vendedor` sempre `null` e
  `whatsapps` sempre `[]`. Ordem: clientes primeiro, fornecedores depois; `limite` conta o total.
  `cliente/ficha` ganha `tipo`; quando o documento não é de cliente ela procura em fornecedor antes
  de devolver "não encontrado" (`diasEntrega`/`diasVenda`/`condicaoPagamento`/`horaCorte`
  vazios/`null` + objeto novo `fornecedor` com `email`/`telefone`/`inscricaoEstadual`/`uf`, só com o
  que existir — `horaCorte:null` mantido de propósito, para o shape ficar igual ao do cliente, que
  sempre traz esse campo). Documento
  em ambos os cadastros: cliente tem prioridade e a resposta ganha `tambemFornecedor:true`. **Tudo
  aditivo** — nenhum campo removido/renomeado.

## Fase 2 — Criação de pedido pela IA (IMPLEMENTADA na v1.4)

> **Status: no ar desde a v1.4 (2026-07-07).** Endpoints `POST /congelados/pedido` e
> `POST /kitfesta/pedido`, além do enriquecimento de `reconhecer-telefone` (`ultimoPedido[]`+`comprado`)
> e do `comItens` no `historico-pedidos`. Cada campo vale a regra de contrato acima (não
> remover/renomear sem aviso).

### Princípio (quem se adapta a quem)

O CA-Hardt é o **dono dos dados e das regras** (cliente, preço negociado, vendedor, condição de
pagamento, número do pedido, envio ao Conta Azul). O bot é **consumidor** e se adapta a este sistema
— não o contrário. Na prática:

1. **O bot manda só o essencial:** quem é o cliente (telefone), o que ele quer (produto + quantidade),
   quando (data/horário) e observações. **O bot NÃO manda preço, vendedor, condição, tipo de pedido
   nem número** — isso o CA-Hardt preenche sozinho a partir do cadastro do cliente.
2. **Nenhum pedido do bot vira venda direto.** Ele nasce **PENDENTE na fila de aprovação da linha**
   (Congelados ou Kit Festa) — a **mesma fila do site** — e só o **faturamento** aprova, escolhendo o
   **tipo** (Normal/Especial/Bonificação) e a **data**. Só então vira um Pedido real. Esse fluxo de
   aprovação **já existe hoje** para os pedidos feitos no site; o bot apenas entra na mesma fila.
3. **Preço:** o bot recebe os preços no "pacote" da identificação (abaixo) só para **conversar** com o
   cliente ("esse sai por R$ X"). Na hora de **gravar**, o servidor **recalcula** o preço real do
   cliente (é assim que o site já funciona hoje). Isso evita que um preço "velho" que o bot guardou
   entre no pedido, e o faturamento ainda revê tudo na aprovação.

> **Sobre o `tipo` que o bot propôs (`"congelados" | "kit_festa"`):** isso vira a **escolha do
> endpoint** (um para cada linha — abaixo), não um campo. E "tipo de pedido" no CA-Hardt significa
> outra coisa (Normal/Especial/Bonificação), decidida **pelo faturamento na aprovação** — o bot não
> manda esse campo.

> **Namespace e autenticação (decidido):** TODOS os endpoints desta fase ficam sob
> `…/api/ia-consulta/v1/*` e exigem o header `x-ia-api-key` — o **mesmo** cliente HTTP e a mesma chave
> que o bot já usa. As rotas públicas do site (`POST /congelados/pedido`, `POST /kitfesta-publico/pedido`)
> **não** são usadas pelo bot: elas são só do site. Cada endpoint desta fase é um "espelho" fino dessas
> rotas, protegido pela chave da IA — assim ninguém posta pedido falso na fila sem a chave.

### (A) "Pacote" da identificação — o "de sempre" vem pelo TELEFONE (sem login)

O bot identifica por telefone (a Ana nunca pede CPF/senha pra isso). Então o reconhecimento por telefone
já devolve tudo que o bot precisa para montar o carrinho sem novas chamadas — inclusive o último pedido:

- **Congelados — `POST /congelados/reconhecer-telefone` (enriquecido na v1.4):** devolve o catálogo com
  **preço do cliente**, `diasEntrega`, `condicaoPadrao` e, por item, **`id`** (`congeladosProdutoId`) +
  **`produtoId`** + `imagem` + **`comprado`**. Passou a trazer também o último pedido, liberado pela mesma
  identificação por telefone (antes só existia no `meu-catalogo`, que exige login):
  ```
  "ultimoPedido": [ { "id": "<congeladosProdutoId>", "produtoId": "<id app>",
                      "nome": "...", "quantidade": 2, "unidade": "cx", "precoUnit": 120.00 } ]
  ```
  → é o que fecha o "quero o de sempre" (RF-B2) por telefone, sem armazenar nada do lado do bot.
  **(v1.6)** `ultimoPedido` continua sendo esse array; o mesmo pedido como **objeto** (número,
  datas, status, itens com `produto`) está em `ultimoPedidoDetalhe`, e "já tem pedido esta semana"
  em `pedidosEmAberto[]`.
- **Geral (qualquer linha) — `POST /cliente/historico-pedidos` (já existe):** devolve
  `{numero,data,dataEntrega,statusEntrega,tipo,total}` e, com `comItens: true` no corpo, também
  `itens: [{ produtoId, nome, quantidade, unidade, precoUnit }]` (adição segura). ⚠️ `dataEntrega`
  aqui é a **hora real em que o motorista entregou** (`null` até lá) — não a data prevista. Desde a
  **v1.6** a data prevista está em `dataPrevista`, a entrega confirmada em `entregueEm`/`entregador`,
  e cada pedido traz `fonte`/`status`/`emAberto`/`origem` (ver "Objeto único de pedido").

**ID do produto — em TODOS os catálogos (confirmado):** cada item **já traz o `id`** (o
`congeladosProdutoId`; no Kit Festa, o `id` = `kitFestaProdutoId`) além do `produtoId`. Vale para o
catálogo do reconhecimento por telefone **e** para os catálogos gerais `GET /congelados/catalogo` e
`GET /kitfesta/catalogo` — os três usam o mesmo serializer. É esse **`id`** que o bot manda de volta em
`itens[].id` ao criar o pedido. Então, mesmo quando o cliente pede algo **fora** do "de sempre", o bot
mapeia `nome → id` pelo catálogo que já tem em mãos, sem casar por nome na hora de gravar.

### (B) Criar pedido de Congelados — `POST /api/ia-consulta/v1/congelados/pedido` (novo, sob a chave da IA)

Espelho fino do `criarPedidoSite` que o site já usa. Header `x-ia-api-key`. Cliente identificado por telefone.

```
POST /api/ia-consulta/v1/congelados/pedido
{
  "telefone": "5547999998888",
  "itens": [ { "id": "<congeladosProdutoId do catálogo>", "quantidade": 2 } ],
  "data": "2026-07-15",                  // opcional (data de entrega, YYYY-MM-DD)
  "modo": "entrega" | "retirada",        // opcional (default entrega)
  "observacoes": "...",                  // opcional
  "idempotencyKey": "<uuid do bot>",     // opcional — ver Idempotência
  "visitante": { "nome": "...", "telefone": "...", "cpf": "..." }  // só se telefone NÃO reconhecido (cliente novo): nome + cpf obrigatórios
}
→ dados: { "numero": 123, "status": "AGUARDANDO", "total": 240.00 }
```

- **Preço recalculado no servidor** (o bot não manda `valor`). Respeita o mínimo da condição do cliente.
- Nasce `AGUARDANDO` (ou `PENDENTE_CADASTRO` se o telefone não tiver cadastro vinculado ao CA) na
  **mesma fila de aprovação do site de Congelados**.
- Faturamento aprova no painel → cria o Pedido real (escolhe Normal/Especial/Bonificação + data).

### (C) Criar pedido de Kit Festa — `POST /api/ia-consulta/v1/kitfesta/pedido` (novo, sob a chave da IA)

Espelho fino do `criarPedidoSite` do Kit Festa. Header `x-ia-api-key`. **Mesmos nomes de campo** que o de
Congelados no que é comum (`telefone`, `itens[].id`, `itens[].quantidade`, `data` em `YYYY-MM-DD`, `modo`,
`observacoes`, `idempotencyKey`, `visitante`), só com os extras próprios do Kit Festa:

```
POST /api/ia-consulta/v1/kitfesta/pedido
{
  "telefone": "5547999998888",
  "itens": [ { "id": "<kitFestaProdutoId do catálogo>", "quantidade": 4, "opcao": "Frango" } ],
  "modo": "entrega" | "retirada",
  "data": "2026-07-15",
  "horario": "10:00",                    // Kit Festa trabalha com horário/slot
  "enderecoEntrega": "...",              // se entrega
  "cep": "89239000",                     // se entrega
  "cupomCodigo": "...",                  // opcional
  "observacoes": "...",                  // opcional
  "idempotencyKey": "<uuid do bot>",     // opcional
  "visitante": { "nome": "...", "telefone": "...", "cpf": "..." }  // cliente novo: nome + cpf obrigatórios (dispensado se o telefone já casar com conta do site)
}
→ dados: { "numero": 45, "status": "AGUARDANDO", "total": 320.00 }
```

- Valida mínimo de caixas, antecedência e (se entrega) o CEP/raio — igual ao site.
- Nasce `AGUARDANDO` na **mesma fila de aprovação do Kit Festa**; faturamento aprova → vira Pedido real.

### (D) Cross-sell "comprados juntos" — `POST /api/ia-consulta/v1/produtos/comprados-juntos` (opcional, por último)

Não existe hoje; exigiria análise de cesta no histórico. É "nice to have" (item 4) — fica para depois de
A, B e C estarem no ar.

### Onde o humano aprova (decisão de produto)

**O pedido do bot cai direto na fila de aprovação do CA-Hardt** (`AGUARDANDO`), e o **faturamento aprova
no próprio painel do CA-Hardt** (tela que já existe: busca por nome/telefone/CPF, vincula visitante,
escolhe Normal/Especial/Bonificação + data → vira Pedido real). Com isso, **acaba o passo de redigitar** e
a tela de rascunho do lado do bot deixa de ser necessária (no máximo vira um espelho só-leitura). É a
evolução natural do "modo assistido".

### Detalhes de contrato

- **Idempotência:** o bot pode mandar `idempotencyKey` (um UUID por tentativa de fechamento). Se a mesma
  chave chegar de novo (timeout + retry), o servidor **devolve o mesmo pedido** em vez de criar outro. Se
  o bot não mandar a chave, o servidor faz um dedupe de segurança por `telefone + itens` numa janela curta
  (ex.: 10 min). Objetivo: nunca duplicar pedido na fila.
- **Visitante (telefone não reconhecido):** para **cliente já reconhecido pelo telefone (o caso comum),
  a Ana NÃO pede nada** — o CPF/CNPJ já vem do cadastro e o pedido nasce `AGUARDANDO`. Só quando o
  telefone **não** bate com nenhum cadastro (cliente NOVO) o bot manda `visitante: { nome, cpf, telefone }`
  — aí **nome + CPF/CNPJ são obrigatórios**, porque o registro do cliente e a nota fiscal precisam do
  documento (a conta do site tem o documento como chave). Esse pedido nasce `PENDENTE_CADASTRO` e o
  faturamento vincula/cadastra na aprovação. (No Kit Festa, se o telefone já casar com uma conta do site
  existente, o CPF também é dispensado.)
- **Kit Festa — frete "a combinar":** `taxaEntrega` nasce `0` (a combinar), então o `total` **não inclui
  frete**. A Ana deve avisar isso na conversa (já está no prompt dela) — comportamento esperado, confirmado.
- **Webhook de confirmação (Kit Festa) — evitar mensagem dobrada:** o site dispara um WhatsApp de
  confirmação ao criar o pedido — e desde 07/2026 ele sai pelo **mesmo número** que a Ana atende (o
  BotConversa foi desligado), o que torna a mensagem dobrada ainda mais visível. Para **pedidos vindos do
  bot esse envio nasce DESLIGADO por padrão** — quem confirma é a Ana, na própria conversa (Z-API). O
  corpo aceita `notificarCliente: true` só se algum dia quiser reativar o envio automático para um pedido
  específico. Assim o cliente nunca recebe duas mensagens.

### Segurança (mantida, igual ao resto da API)

- Identificação **por telefone** (o WhatsApp já autentica o número); nunca gravar/liberar dado sensível só
  com CPF/CNPJ digitado. Endpoints de criação **sempre** sob `x-ia-api-key` (nunca públicos).
- Visitante sem cadastro cai em `PENDENTE_CADASTRO` e **exige vínculo manual** antes de o faturamento
  aprovar — o bot nunca cria cliente "de verdade" no CA por conta própria.
- Como tudo passa pela aprovação humana, o pior caso de um erro do bot é um pedido pendente que o
  faturamento recusa — nunca uma venda errada lançada direto.

## Próximos passos previstos (ainda não implementados)

- Migrar o restante do bot (catálogo de Congelados, se ainda for por SQL) para chamar os
  endpoints já existentes desta API em vez de consultar o banco direto.
- Endpoint de "dias de entrega por cidade" — ainda não implementado; a única fonte parecida no
  banco hoje (`MetaCidade.diasSemana`) é escopada por meta mensal de vendedor, não é uma referência
  confiável de "cidade X → dias de entrega" para qualquer época. Precisa definir a fonte certa
  antes de expor isso na API.
- Depois que o bot migrar 100% para esta API (nenhuma função restante em SQL direto), rotacionar
  a senha do banco de produção usada pelo bot — combinar com quem mantém a Antigravity antes de
  fazer isso, para não quebrar nada no meio da migração.
- Tela para a `horaCorte` (hoje só por SQL em `app_configs`, ver seção v1.6.0).
- Observação interna no **Pedido real** (hoje a `observacaoInterna` da Ana fica só no card da fila;
  ao aprovar, o Pedido não a carrega — o model `Pedido` não tem esse campo).
- Callback de mudança de status (aprovado/recusado/entregue → bot): hoje o bot consulta
  (`GET /cliente/pedido/:numero`); um webhook de saída é assunto de outra tarefa.
- Programa de fidelidade para cliente B2B comum (hoje só existe indicação/crédito/cupom no Kit Festa).
