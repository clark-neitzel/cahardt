# API dos agentes comerciais — `/api/analytics/v1`

API de máquina para os agentes da área de vendas (carteira, retenção, recompra, upsell, cobrança, preço, visita e prospecção). Ela **não usa o login** dos vendedores. A chave é outra, só desta API.

Ela **não envia WhatsApp**, **não cria pedido** e **não dá baixa** em parcela. O que ela grava é nota de contato, lead, a sugestão que o agente mandou para o vendedor, e a **pessoa** que atende o WhatsApp do cliente (nome, papel, última conversa).

A leitura de cliente reusa a Carteira (`carteiraService`). A leitura de venda reusa a mesma régua do app: pedido não cancelado, sem bonificação, faturado ou especial, menos a devolução ativa.

## Configurar no EasyPanel

1. No serviço do **backend**, aba Environment, crie a variável `ANALYTICS_API_KEY`.
2. O valor é uma senha longa, sorteada (por exemplo 40 caracteres aleatórios). **Não commite esse valor** e não cole em chat, print ou URL.
3. Salve e faça o deploy (ou reinicie o serviço). Sem essa variável a API responde **503** e não atende ninguém.
4. A publicação já roda `prisma db push` no start do backend. Isso cria a tabela `sugestoes_agente` e a tabela `cliente_contatos`. Não é preciso rodar SQL na mão. Os arquivos em `backend/prisma/migrations/` são o mesmo passo, para quem aplica migration pelo Prisma. A cópia dos telefones já cadastrados para contatos sem nome roda sozinha na subida do backend (uma vez). `db push` não executa INSERT.

A chave vai **somente** no header `x-analytics-key`. Se ela for na URL (`?x-analytics-key=`), a API recusa (400): o servidor anota a URL no log e a senha vazaria.

Em toda **escrita**, mande também `x-analytics-agent` com o nome do agente (até 80 caracteres). É o que fica na auditoria (`audit_logs`: ação, id, data e o nome do agente).

Limite: 300 chamadas certas por minuto, e 30 chaves erradas por minuto no mesmo IP. Acima disso, 429.

Base (produção): `https://<host-do-backend>/api/analytics/v1`

Exemplo de chamada:

```bash
curl -s -H "x-analytics-key: $ANALYTICS_API_KEY" \
  "https://<host>/api/analytics/v1/status"
```

Resposta:

```json
{ "ok": true, "versao": "1", "whatsapp": false, "escreve": ["atendimentos", "leads", "sugestoes", "contatos"] }
```

Erros: `{ "error": "mensagem", "codigo": "CODIGO" }`. 401 chave errada, 503 variável ausente, 404 rota que não existe (pedido e financeiro não têm POST).

Paginação (onde a lista é paginada): `page` (1) e `limit` (padrão 50, máximo 100; vendas padrão 25). A resposta traz `total` e `totalPages`.

Datas: `de` e `ate` em `YYYY-MM-DD`, fuso de São Paulo, dia inclusive. Vendas e diário: até 366 dias. Atendimentos: até 120 dias.

---

## Leituras

### `GET /v1/carteira`

O painel da aba Carteira, o mesmo cálculo de `carteiraService.obterPainel`.

| Query | |
|---|---|
| `periodo` | `semana` (padrão) ou `mes` |
| `vendedorId` | id do vendedor, `sem-vendedor` ou omitido (`todos`) |
| `fresh` | `1` ignora o cache de 10 minutos |

### `GET /v1/clientes`

Um cliente por linha, com a **mesma** classificação da Carteira (cadastros ligados em "mesmo cliente" viram uma linha).

| Query | |
|---|---|
| `vendedorId` | id, ou `sem-vendedor` |
| `estado` | `PARADO`, `ATRASO_LEVE`, `NO_RITMO`, `NOVO`, `SAZONAL`, `INATIVAR`, `SEM_PEDIDO` (pode combinar com vírgula) |
| `cidade`, `q` | cidade, ou nome/documento |
| `carteira` | `1` = só quem entra na carteira (esconde funcionário e inativo antigo) |
| `ordenar` | `risco` (padrão, maior `valorEmRiscoMes`), `dias` ou `nome` |
| `fresh` | `1` recalcula a base |

```json
{
  "page": 1,
  "limit": 50,
  "total": 1,
  "hoje": "2026-11-12",
  "data": [{
    "clienteId": "uuid",
    "nome": "Padaria do Zé",
    "documento": "12345678000199",
    "vendedorId": "uuid",
    "vendedor": "Leticia",
    "endereco": { "cidade": "Blumenau", "estado": "SC", "bairro": "Centro" },
    "diasVenda": "TER,QUI",
    "diasEntrega": "QUA,SEX",
    "whatsapps": ["47999990000"],
    "temCelular": true,
    "estado": "PARADO",
    "ritmoDias": 7,
    "diasSemComprar": 28,
    "ultimoPedido": "2026-10-15",
    "ticketMedio": 480.5,
    "valorEmRiscoMes": 2059.29,
    "destino": "ANA"
  }]
}
```

`valorEmRiscoMes` é o dinheiro em risco que a Carteira já calcula (ticket médio × 30 / ritmo). `destino` `ANA` = tem celular e ainda vale chamar; `VISITA` = parado sem celular útil ou sem resposta no WhatsApp. Esta API **não chama** ninguém.

### `GET /v1/clientes/:id/financeiro`

Ficha de cobrança de um cliente, pela regra única de inadimplência do app.

`situacao.inadimplente` é o que vale. `destino` de cada conta:

| destino | significado |
|---|---|
| `DEVE` | atraso de verdade |
| `EM_ESPERA` | dinheiro, Pix ou cartão apontado, ainda no prazo de conferir |
| `A_CONFIRMAR` | o mesmo, passou do prazo — aparece, mas **não** é inadimplente e não bloqueia venda |
| `FORA` | funcionário ou especial ainda não entregue |

Pix/cartão esperando conciliação **não** é cliente devedor.

### `GET /v1/vendas`

Pedidos do período na régua de venda. `de` e `ate` obrigatórios.

| Query | |
|---|---|
| `vendedorId`, `clienteId` | opcionais |
| `itens` | `0` tira os itens (a resposta fica menor). Padrão traz os itens |

`resumo` é o período inteiro, não só a página: `valorBruto`, `valorDevolvido`, `valorLiquido`, `pedidos`. A devolução do resumo entra pela **data da devolução**. Em cada pedido, `valorDevolvido` é a soma das devoluções ativas daquele pedido (qualquer data), para o líquido do pedido.

```bash
curl -s -H "x-analytics-key: $ANALYTICS_API_KEY" \
  "https://<host>/api/analytics/v1/vendas?de=2026-11-01&ate=2026-11-12&vendedorId=UUID&limit=25"
```

```json
{
  "de": "2026-11-01",
  "ate": "2026-11-12",
  "resumo": { "valorBruto": 15230.5, "valorDevolvido": 180, "valorLiquido": 15050.5, "pedidos": 41, "devolucoes": 2 },
  "page": 1, "total": 41,
  "data": [{
    "id": "uuid", "numero": 5821, "dataVenda": "2026-11-10T15:00:00.000Z",
    "especial": false, "situacao": "FATURADO",
    "vendedor": { "id": "uuid", "nome": "Leticia" },
    "cliente": { "id": "uuid", "nome": "Padaria do Zé", "cidade": "Blumenau" },
    "valorBruto": 320, "valorDevolvido": 0, "valorLiquido": 320,
    "itens": [{ "produtoId": "uuid", "nome": "Coxinha", "quantidade": 20, "valorUnitario": 2.5, "valorTotal": 50 }]
  }]
}
```

### `GET /v1/vendas/itens`

As mesmas vendas, uma linha por item (`produtoId` opcional). O líquido do período continua em `resumo`. A linha do item é o valor bruto vendido.

### `GET /v1/produtos`

Preço de tabela (`valorVenda`), custo que a tela de margem usa (`custoAtual` + `fonteCusto`: ficha, ficha de referência, compra ou CA), custo médio/manual gravados, estoque disponível e o preço em cada tabela ativa.

`preco = valorVenda × (1 + acrescimoPct/100)` — a mesma conta do catálogo.

| Query | |
|---|---|
| `q` | nome ou código |
| `ativo` | padrão só ativos; `0` só inativos; `todos` os dois |
| `categoriaId` | categoria comercial |
| `comCusto` | `0` pula o cálculo de ficha técnica (resposta só com preço, custo médio/manual e tabelas). O padrão calcula o custo atual, o mesmo da tela de margem — a primeira página pode demorar |

Também traz `promocaoVigente` quando há promoção ativa hoje naquele produto.

### `GET /v1/tabelas-preco`

Condições de pagamento (acréscimo, parcelas, valor mínimo, se vale para pedido/especial/bonificação). `ativo=todos` inclui as desligadas.

### `GET /v1/promocoes`

| Query | |
|---|---|
| `status` | `ATIVA` ou `ENCERRADA` |
| `vigente` | `1` = ativa e dentro do prazo agora |
| `produtoId` | uma promoção de um produto |

Cada item traz os grupos e as condições (quantidade de outro produto ou valor mínimo do pedido).

### `GET /v1/vendedores`

Vendedores da operação (quem é acesso externo de contabilidade fica de fora; `incluirExternos=1` traz). **Não devolve senha, login nem permissão.**

`mes` (`YYYY-MM`, padrão o mês atual) traz a meta: valor, dias de trabalho, produtos, cidades e promoções. Também o flex disponível (sala de desconto do vendedor).

### `GET /v1/atendimentos`

Notas e visitas gravadas no período (`de`/`ate` obrigatórios, até 120 dias). Padrão esconde tipo `FINANCEIRO` (é lançamento de caixa, não visita) — igual à tela. Filtros: `vendedorId`, `clienteId`, `leadId`, `tipo`.

`visao=painel` devolve a lista misturada da tela (nota + pedido do período), com o teto de 3000 linhas de cada fonte. Para o mês inteiro, use a visão padrão e cruze com `/vendas`.

### `GET /v1/diarios`

Diário de bordo do vendedor no período: modo (escritório ou rua), hora de início e fim, km, placa e observação. `de`/`ate` obrigatórios. `vendedorId` opcional.

### `GET /v1/receber`

Parcelas. Padrão: em aberto (`PENDENTE`, `PARCIAL`, `VENCIDO`) com vencimento nos últimos 365 dias até hoje.

| Query | |
|---|---|
| `de`, `ate` | filtra pela data de vencimento (os dois juntos) |
| `clienteId`, `vendedorId` | |
| `status` | `ABERTAS` (padrão), `PENDENTE`, `PARCIAL`, `VENCIDO`, `PAGO`, `CANCELADO`, `TODAS` |
| `somenteInadimplentes` | `1` usa a lista oficial de quem está em atraso (não inclui quem só está esperando conciliação) |
| `bloqueiaVenda` | `1` junto com o filtro acima: só quem já passa da carência e do valor mínimo |

Cada linha traz `diasAtraso`, `aguardandoConciliacao` e `situacao` do cliente. **Cobrar por `situacao.inadimplente`, não só por `diasAtraso`.**

### `GET /v1/leads`

Leads com vendedor, cidade, WhatsApp, dias de visita, etapa e último contato. `q` busca o nome, `etapa` filtra, `vendedorId` filtra. `parados=1` é a lista da gestão (esquecidos, teto de 1000).

---

## Escritas

Todas exigem `x-analytics-agent`. Nenhuma manda mensagem.

### `POST /v1/atendimentos`

Registra uma tentativa de contato ou nota no cliente (ou no lead). Aparece no histórico que o vendedor já vê. Não pausa visita, não muda etapa do lead, não liga em pedido e não dispara WhatsApp.

```bash
curl -s -X POST -H "x-analytics-key: $ANALYTICS_API_KEY" \
  -H "x-analytics-agent: carteira-manha" -H "content-type: application/json" \
  -d '{
    "vendedorId": "UUID",
    "clienteId": "UUID",
    "tipo": "WHATSAPP",
    "observacao": "Mandei mensagem e não respondeu.",
    "acaoLabel": "Sem resposta",
    "referencia": "retencao-2026-11-12-cliente-uuid"
  }' \
  "https://<host>/api/analytics/v1/atendimentos"
```

`tipo`: `WHATSAPP`, `PRESENCIAL`, `VISITA`, `TELEFONE`, `LIGACAO`, `OUTROS`, `SEM_VISITA`, `NOTA`, `AMOSTRA`.

`vendedorId` e (`clienteId` ou `leadId`) são obrigatórios. `referencia` (8 a 80 caracteres, letras/números/`._:-`) é opcional e **única no banco**: repetir o POST, mesmo duas vezes ao mesmo tempo, devolve o atendimento já gravado (`duplicado: true`) e não cria outra nota.

`proximaVisita` (`YYYY-MM-DD`), quando o contato é de um lead, grava a data **no lead e na nota, juntos**. É essa data do lead que coloca a visita na rota do vendedor. Sem ela, o lead parado continua na lista de parados.

Resposta 201: `{ "atendimento": { "id", "tipo", "observacao", "clienteId", "vendedorId", "criadoEm" }, "duplicado": false, "agente": "carteira-manha" }`.

### `POST /v1/leads` e `PATCH /v1/leads/:id`

Cria ou atualiza um lead. Reusa o `leadService` (cidade fora da lista oficial é aceita e vira pendência de cadastro, no mesmo modo da IA — não derruba o registro).

Criar (201), obrigatórios `nomeEstabelecimento` e `vendedorId`:

```json
{
  "nomeEstabelecimento": "Mercado da Esquina",
  "vendedorId": "UUID",
  "contato": "Ana",
  "whatsapp": "47988887777",
  "cidade": "Blumenau",
  "diasVisita": "SEG,QUA",
  "origemLead": "PROSPECCAO",
  "observacoes": "Indicada pela padaria do Zé."
}
```

Atualizar: qualquer um destes campos — `nomeEstabelecimento`, `contato`, `whatsapp`, `diasVisita`, `horarioAtendimento`, `horarioEntrega`, `formasAtendimento` (lista), `pontoGps`, `observacoes`, `etapa` (`NOVO`, `VISITA`, `PEDIDO`, `CONVERTIDO`, `FINALIZADO`), `proximaVisita` (`YYYY-MM-DD` ou vazio para limpar), `cidade`, `origemLead`, `categoriaClienteId`, `vendedorId`.

`vincularClienteId` liga o lead a um cliente já cadastrado e marca a etapa `CONVERTIDO` (a mesma regra da tela: um cliente não fica em dois leads).

Não há rota para apagar lead.

### `POST /v1/sugestoes` e `PATCH /v1/sugestoes/:sugestaoId` e `GET /v1/sugestoes`

O rastreio do que o agente sugeriu ao vendedor.

| status na API | gravado | significado |
|---|---|---|
| `suggested` | `SUGERIDA` | o agente registrou (é o estado inicial) |
| `approved` | `APROVADA` | alguém com a chave anotou que o dono aprovou. Mande `aprovadoPor` com o nome (ex.: `Clarkson`). A chave não é um login separado do dono |
| `sent` | `ENVIADA` | a sugestão foi passada ao vendedor |
| `done` | `FEITA` | o vendedor executou. **Obrigatório** `provaTexto` (o que foi feito). `provaPor` é o nome de quem fez |
| `ignored` | `IGNORADA` | descartada |

`tipo`: `RETENCAO`, `RECOMPRA`, `UPSELL`, `CROSS_SELL`, `COBRANCA`, `PRECO`, `VISITA`, `PROSPECCAO`, `OUTRO`.

```bash
curl -s -X POST -H "x-analytics-key: $ANALYTICS_API_KEY" \
  -H "x-analytics-agent: carteira-manha" -H "content-type: application/json" \
  -d '{
    "sugestaoId": "retencao-cli-001",
    "tipo": "RETENCAO",
    "titulo": "Ligar para a Padaria do Zé",
    "texto": "Parada há 28 dias, ritmo de 7. Ticket médio R$ 480.",
    "vendedorId": "UUID",
    "clienteId": "UUID"
  }' \
  "https://<host>/api/analytics/v1/sugestoes"
```

Repetir o POST com o mesmo `sugestaoId` não cria outra (200, `duplicado: true`). Sem `sugestaoId`, a API gera um e devolve em `sugestao.sugestaoId`.

```bash
curl -s -X PATCH -H "x-analytics-key: $ANALYTICS_API_KEY" \
  -H "x-analytics-agent: carteira-manha" -H "content-type: application/json" \
  -d '{ "status": "done", "provaTexto": "Leticia ligou e anotou o pedido para sexta.", "provaPor": "Leticia" }' \
  "https://<host>/api/analytics/v1/sugestoes/retencao-cli-001"
```

`GET /v1/sugestoes` filtra por `status`, `tipo`, `vendedorId`, `clienteId`, `leadId`, `agente`. Cada linha traz o `historico` (quem mudou, quando, a nota).

### Contatos do cliente — pessoas do WhatsApp

O cadastro do cliente continua com o **número da empresa** (`Telefone`, `Telefone_Celular`, `Telefone_Comercial` e a lista `cliente_whatsapps`). Esses campos não mudam: é por eles que saem aviso de pedido, boleto e cobrança.

O contato é a **pessoa** que atende aquele WhatsApp. Um cliente pode ter várias. Várias pessoas podem usar o **mesmo** número (dona e gerente no mesmo celular da loja). A Ana não apaga contato por esta API.

Telefone na busca e na gravação aceita o jeito que chegar: com ou sem `55`, com ou sem o 9º dígito, com máscara. `47999998888`, `4799998888`, `5547999998888` e `+55 (47) 99999-8888` são o mesmo número.

Na subida do backend, cada telefone já gravado no cadastro vira um contato **sem nome** (`origem: "MIGRACAO"`). Rodar de novo não duplica.

#### `GET /v1/clientes/:id/contatos`

Lista as pessoas daquele cliente. `falarCom` é quem tem nome **e** a conversa mais recente. Se ninguém se encaixa, `falarCom` é `null` e `perguntarQuem` é `true` — a Ana pergunta com quem está falando. `pessoas` são só as que já têm nome (dá para oferecer "falo com a Maria ou o João?").

#### `GET /v1/contatos/por-telefone?telefone=`

Acha o cliente e os contatos daquele número. Não exige `x-analytics-agent` (é leitura).

- Se o número está em mais de um cliente, `encontrados` vem maior que 1. **Não escolha um.** Pergunte de qual empresa se trata. A busca junta contato e telefone do cadastro: um cliente que só tem o número no cadastro (contato apagado, migração no meio, telefone gravado por fora) continua na lista, com `telefoneNoCadastro: true`.
- `falarCom` olha só as pessoas **daquele** número.
- `telefoneNoCadastro: true` e `total: 0`: o número está no cadastro da empresa, mas ainda não há linha de contato (a cópia do boot não rodou, ou o número entrou por fora). A Ana pergunta quem é e grava com o POST abaixo. Esta leitura **não cria** contato.

```bash
curl -s -H "x-analytics-key: $ANALYTICS_API_KEY" \
  "https://<host>/api/analytics/v1/contatos/por-telefone?telefone=5547999998888"
```

```json
{
  "telefone": "5547999998888",
  "chave": "4799998888",
  "encontrados": 1,
  "data": [{
    "clienteId": "uuid",
    "nome": "Padaria do Zé",
    "razaoSocial": "Padaria do Zé Ltda",
    "ativo": true,
    "cidade": "Blumenau",
    "estado": "SC",
    "falarCom": {
      "id": "uuid-maria",
      "clienteId": "uuid",
      "nome": "Maria",
      "telefone": "47999998888",
      "papel": "dona",
      "nota": null,
      "ultimoContatoEm": "2026-11-13T14:02:00.000Z",
      "origem": "AGENTE",
      "criadoPor": "ana",
      "atualizadoPor": "ana",
      "criadoEm": "2026-11-13T13:00:00.000Z",
      "atualizadoEm": "2026-11-13T14:02:00.000Z"
    },
    "perguntarQuem": false,
    "telefoneNoCadastro": false,
    "pessoas": [{
      "id": "uuid-maria",
      "nome": "Maria",
      "telefone": "47999998888",
      "papel": "dona",
      "ultimoContatoEm": "2026-11-13T14:02:00.000Z"
    }],
    "total": 1,
    "data": [{
      "id": "uuid-maria",
      "clienteId": "uuid",
      "nome": "Maria",
      "telefone": "47999998888",
      "papel": "dona",
      "nota": null,
      "ultimoContatoEm": "2026-11-13T14:02:00.000Z",
      "origem": "AGENTE"
    }]
  }]
}
```

`data` traz todo mundo daquele número, inclusive quem ainda está sem nome. `pessoas` traz só quem já tem nome. O objeto do contato é o mesmo em `falarCom`, `pessoas` e `data` (o exemplo encurta `pessoas`).

Se `perguntarQuem` é `true`, cumprimente a empresa sem chutar um nome.

#### `POST /v1/clientes/:id/contatos`

Cria ou atualiza. Exige `x-analytics-agent`. É o que a Ana chama quando aprende o nome.

| Situação | O que acontece |
|---|---|
| Número novo, com ou sem nome | 201, `criado: true` |
| Mesmo número e mesmo nome (maiúscula e acento não contam) | 200, `atualizado: true`, não cria outra pessoa |
| Número que só tinha contato sem nome, e agora veio um nome | 200, `aprendeuNome: true` — preenche aquela linha |
| Outro nome no mesmo número | 201, outra pessoa |
| Sem nome, mas o número já tem pessoa nomeada | 409 `INFORME_O_NOME`, com `pessoas` para a Ana perguntar |

`telefone` é obrigatório. `nome`, `papel` (texto livre: `dona`, `gerente`, `compras`…), `nota` e `ultimoContatoEm` (ISO) são opcionais. Campo ausente no atualizar não apaga o que já estava.

```bash
curl -s -X POST -H "x-analytics-key: $ANALYTICS_API_KEY" \
  -H "x-analytics-agent: ana" -H "content-type: application/json" \
  -d '{ "nome": "Maria", "telefone": "47999998888", "papel": "dona", "nota": "Prefere de manhã" }' \
  "https://<host>/api/analytics/v1/clientes/UUID/contatos"
```

Resposta 201: `{ "contato": { "id", "clienteId", "nome", "telefone", "papel", "nota", "ultimoContatoEm", "origem": "AGENTE", "criadoPor": "ana" }, "criado": true, "atualizado": false, "aprendeuNome": false, "agente": "ana" }`.

A escrita fica em `audit_logs` (`CONTATO_CRIADO` ou `CONTATO_ATUALIZADO`) com `usuarioNome` = o agente.

#### `PATCH /v1/contatos/:id`

Atualiza nome, telefone, papel, nota ou `ultimoContatoEm`. Mesma regra do agente no header. Mandar `""` limpa nome, papel ou nota. Não apaga a pessoa.

#### `POST /v1/contatos/:id/conversa`

Marca a última conversa com aquela pessoa. Sem corpo, usa o horário de agora. Com corpo, `{ "em": "2026-11-13T14:02:00.000Z" }`.

É isso que faz `falarCom` apontar para ela na próxima mensagem. Também vai para o `audit_logs` (`CONTATO_CONVERSA`).

```bash
curl -s -X POST -H "x-analytics-key: $ANALYTICS_API_KEY" \
  -H "x-analytics-agent: ana" -H "content-type: application/json" \
  -d '{}' \
  "https://<host>/api/analytics/v1/contatos/UUID/conversa"
```

#### O que o bot da Ana precisa fazer

1. Na mensagem que chega, `GET /v1/contatos/por-telefone?telefone=` com o número de quem escreveu.
2. `encontrados: 0` — número desconhecido (o fluxo de lead continua como já é; esta API não cria cliente).
3. `encontrados` maior que 1 — não escolha. Pergunte a empresa.
4. Um cliente com `falarCom` — trate a pessoa pelo nome.
5. Um cliente com `perguntarQuem: true` — pergunte com quem está falando. Se `pessoas` tiver nomes, pode citá-los.
6. Quando a pessoa disser o nome, `POST /v1/clientes/:clienteId/contatos` com `nome`, o mesmo `telefone` e o header `x-analytics-agent: ana`. Repetir o POST não duplica.
7. No fim da conversa (ou ao reconhecer a pessoa), `POST /v1/contatos/:id/conversa`.
8. Não há DELETE. Contato errado se corrige no app (ficha do cliente → Pessoas do WhatsApp) ou com PATCH.

---

## O que esta API não faz

- Não apaga contato de cliente. Quem corrige um nome errado é o PATCH, ou a ficha do cliente no app.
- Não envia WhatsApp, boleto, Pix nem e-mail.
- Não cria, edita ou cancela pedido, nota ou devolução.
- Não dá baixa, não estorna e não concilia.
- Não executa SQL nem código enviado pelo chamador.
- Não devolve senha, token, certificado ou a própria chave.
