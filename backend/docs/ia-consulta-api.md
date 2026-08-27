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
| GET | `/congelados/catalogo` | — | Catálogo com preço **genérico** (tabela "Site", visitante sem cadastro) |
| GET | `/congelados/grupos` | — | Categorias/grupos do catálogo de congelados |
| GET | `/congelados/config` | — | Dados da loja, mínimo padrão, se atende sábado/domingo (`entregas.sabado/domingo`) |
| GET | `/congelados/produto/:id/ficha` | `:id` = id do produto no site | Ficha técnica/nutricional do produto |
| POST | `/congelados/reconhecer-telefone` | `{ telefone }` | Se o telefone bater com um cliente cadastrado: catálogo já com preço/condição/dias de entrega REAIS dele. **(v1.4)** cada produto traz `comprado:true/false` e a resposta traz `ultimoPedido:[{id,congeladosProdutoId,produtoId,nome,unidade,quantidade,precoUnit}]` (o "de sempre"). **(v1.5)** o telefone também casa com os WhatsApps cadastrados na lista do cliente. Senão: `{ reconhecido: false }` |
| POST | `/congelados/criar-senha-telefone` | `{ telefone, senha }` | Cria a senha do site (mesma conta do login) — só funciona se `telefone` bater com um cadastro. Devolve `{ token, cliente }` |
| POST | `/congelados/check-doc` | `{ documento }` (CPF/CNPJ) | `{ situacao, temCadastroApp, nome }` — descobre se o documento já tem cadastro/senha |
| POST | `/congelados/login` | `{ documento, senha }` | `{ token, cliente }` se a senha bater |
| POST | `/congelados/criar-senha` | `{ documento, senha, nome?, telefone? }` | Cria a senha **só se a conta ainda não tiver uma** (senão erro "já tem senha, use esqueci-senha") |
| POST | `/congelados/esqueci-senha` | `{ documento }` | Manda um código de 6 caracteres pelo WhatsApp — **só para o telefone já cadastrado**, nunca pra quem pediu |
| POST | `/congelados/reset-senha` | `{ documento, codigo, novaSenha }` | Confirma o código e define a nova senha. Devolve `{ token, cliente }` |
| GET | `/congelados/meu-catalogo` | header `Authorization: Bearer <token>` | Catálogo com preço/condição/dias de entrega do cliente autenticado |
| GET | `/congelados/perfil` | header `Authorization: Bearer <token>` | Dados do cliente autenticado (nome, dias de entrega, condição padrão) |
| POST | `/cliente/reconhecer-telefone` | `{ telefone }` | **Geral, qualquer linha.** Se bater com um cadastro: `{ reconhecido:true, cliente:{nome,documento,cidade,vendedor}, diasEntrega:[...], diasVenda:[...], condicaoPagamento:{nome,valorMinimo} }`. **(v1.5)** o telefone também casa com os WhatsApps cadastrados na lista do cliente. Senão: `{ reconhecido:false }` |
| POST | `/cliente/historico-pedidos` | `{ telefone, limite?, comItens? }` (limite padrão 10, máx 30) | Se o telefone bater: `{ reconhecido:true, cliente:{nome}, pedidos:[{numero,data,dataEntrega,statusEntrega,tipo,total}] }`. **(v1.4)** com `comItens:true`, cada pedido também traz `itens:[{produtoId,nome,quantidade,unidade,precoUnit}]`. Senão: `{ reconhecido:false }` |
| POST | `/cliente/criar-lead` | `{ nomeEstabelecimento, whatsapp, contato?, cidade?, observacoes? }` | Cria um prospect no CRM interno (mesma tabela que os vendedores veem). Retorna `{ id, numero, etapa }`. `origemLead` é sempre fixado como `"WHATSAPP_IA"`. **(v1.5.1)** a `cidade` é gravada com a grafia oficial (`"JOINVILLE"`/`"joinvile"` → `"Joinville"`, `"ITAPOA"` → `"Itapoá"`) — mande como o cliente escreveu, sem tratar |
| POST | `/cliente/buscar` | `{ busca, limite? }` (mín. 3 caracteres; padrão 10, máx 20) | **(v1.5, só painel da equipe)** Busca parcial por Razão Social, Nome Fantasia ou CPF/CNPJ (11+ dígitos = documento). Retorna `{ clientes:[{documento,nome,nomeFantasia,cidade,vendedor,ativo,telefones,whatsapps}] }`. Ver seção "Busca e ficha para o painel". |
| POST | `/cliente/ficha` | `{ documento }` (com ou sem pontuação) | **(v1.5, só painel da equipe)** Ficha de UM cliente pela chave `documento`. Retorna `{ encontrado, cliente:{nome,nomeFantasia,documento,cidade,vendedor,ativo}, diasEntrega, diasVenda, condicaoPagamento, whatsapps, telefones }`. |
| POST | `/congelados/pedido` | `{ telefone, itens:[{id,quantidade}], data?, modo?, observacoes?, idempotencyKey?, visitante?:{nome,telefone,cpf?} }` | **(v1.4)** Cria pedido de Congelados na fila de aprovação (`AGUARDANDO`; `PENDENTE_CADASTRO` se telefone novo). Preço recalculado no servidor. Retorna `{ id, numero, status, total }`. Ver "Fase 2". |
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

### Busca e ficha para o PAINEL da equipe (v1.5) — `/cliente/buscar` e `/cliente/ficha`

Estes dois endpoints existem para a **tela logada da equipe de atendimento** no painel do bot
(vincular manualmente uma conversa ao cadastro do CA-Hardt). **Não entram nas tools da IA nem são
expostos a cliente final** — quem chama é o backend do painel. Por isso podem buscar por
nome/documento; a IA continua identificando cliente SÓ pelo telefone autenticado do WhatsApp.
A busca não devolve preço/condição negociada — só identificação de cadastro.

**`POST /cliente/buscar`** — body `{ "busca": "panificadora joao", "limite": 10 }`:
- `busca` (obrigatório, mín. 3 caracteres): casa com Razão Social, Nome Fantasia ou CPF/CNPJ,
  parcial, sem diferenciar maiúsculas/acentos. Com 11+ dígitos (ignorando pontuação), vira busca
  por documento (comparada ignorando pontuação — CNPJ alfanumérico incluído).
- `limite` (opcional): padrão 10, máx. 20. Inativos aparecem (com `ativo:false`), depois dos ativos.

Resposta em `dados`:

```json
{
  "clientes": [
    {
      "documento": "12345678000190",
      "nome": "Panificadora Joao Ltda",
      "nomeFantasia": "Padaria do Joao",
      "cidade": "Joinville",
      "vendedor": "Jociel",
      "ativo": true,
      "telefones": ["4733331234"],
      "whatsapps": ["47999991234"]
    }
  ]
}
```

**`POST /cliente/ficha`** — body `{ "documento": "12345678000190" }` (com ou sem pontuação).
Resposta em `dados` (mesmo shape do `reconhecer-telefone`, com `encontrado` no lugar de
`reconhecido` + os campos novos):

```json
{
  "encontrado": true,
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

Não achando o documento: `{ "encontrado": false }`. Observações de formato: `documento` vem como
está gravado no cadastro (normalizado, sem pontuação); `telefones`/`whatsapps` vêm só dígitos, sem
DDI 55; `nomeFantasia`, `cidade`, `vendedor` e `condicaoPagamento` podem ser `null`.

**WhatsApps no cadastro (v1.5):** o cadastro de cliente do CA-Hardt ganhou uma lista de números de
WhatsApp (campo "WhatsApps" na tela de cliente, tabela `cliente_whatsapps`). Os dois
`reconhecer-telefone` (geral e Congelados) casam também por esses números, com a mesma tolerância
de sempre (com/sem 9º dígito, com/sem DDI 55, ignorando pontuação).

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
- **Geral (qualquer linha) — `POST /cliente/historico-pedidos` (já existe):** hoje devolve
  `{numero,data,dataEntrega,statusEntrega,tipo,total}` **sem itens**. Passa a aceitar `comItens: true` no
  corpo, devolvendo em cada pedido `itens: [{ produtoId, nome, quantidade, unidade, precoUnit }]` (adição
  segura; sem `comItens`, a resposta é idêntica à de hoje).

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
- Criação de pedido pela IA — desenho já detalhado acima na seção **"Fase 2 — Criação de pedido pela
  IA"**; falta combinar o formato com o time do WhatsApp e implementar.
- Programa de fidelidade para cliente B2B comum (hoje só existe indicação/crédito/cupom no Kit Festa).
