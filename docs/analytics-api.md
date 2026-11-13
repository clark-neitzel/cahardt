# API dos agentes comerciais — `/api/analytics/v1`

API de máquina para os agentes da área de vendas (carteira, retenção, recompra, upsell, cobrança, preço, visita e prospecção). Ela **não usa o login** dos vendedores. A chave é outra, só desta API.

Ela **não envia WhatsApp**, **não cria pedido** e **não dá baixa** em parcela. O que ela grava é nota de contato, lead e a sugestão que o agente mandou para o vendedor.

A leitura de cliente reusa a Carteira (`carteiraService`). A leitura de venda reusa a mesma régua do app: pedido não cancelado, sem bonificação, faturado ou especial, menos a devolução ativa.

## Configurar no EasyPanel

1. No serviço do **backend**, aba Environment, crie a variável `ANALYTICS_API_KEY`.
2. O valor é uma senha longa, sorteada (por exemplo 40 caracteres aleatórios). **Não commite esse valor** e não cole em chat, print ou URL.
3. Salve e faça o deploy (ou reinicie o serviço). Sem essa variável a API responde **503** e não atende ninguém.
4. A publicação já roda `prisma db push` no start do backend. Isso cria a tabela `sugestoes_agente`. Não é preciso rodar SQL na mão. O arquivo `backend/prisma/migrations/20261112000000_add_sugestao_agente/migration.sql` é o mesmo passo, para quem aplica migration pelo Prisma.

A chave vai **somente** no header `x-analytics-key`. Se ela for na URL (`?x-analytics-key=`), a API recusa (400): o servidor anota a URL no log e a senha vazaria.

Em toda **escrita**, mande também `x-analytics-agent` com o nome do agente (até 80 caracteres). É o que fica na auditoria (`audit_logs`: ação, id, data e o nome do agente).

Limite: 300 chamadas certas por minuto, e 30 chaves erradas por minuto no mesmo IP. Acima disso, 429. O backup do banco (seção abaixo) conta como uma chamada, e além disso só roda um por vez.

Base (produção): `https://<host-do-backend>/api/analytics/v1`

Exemplo de chamada:

```bash
curl -s -H "x-analytics-key: $ANALYTICS_API_KEY" \
  "https://<host>/api/analytics/v1/status"
```

Resposta:

```json
{ "ok": true, "versao": "1", "whatsapp": false, "escreve": ["atendimentos", "leads", "sugestoes"] }
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

---

## Backup do banco — `GET /v1/backup`

Download **somente leitura** do Postgres inteiro, para o agente **Luke** gravar no Google Drive do dono. O formato é o custom do `pg_dump` (`-Fc`, já comprimido). Esse formato precisa reescrever o índice no fim do arquivo, então o servidor grava um temporário em `/tmp`, e **só se o `pg_dump` terminar bem** esse arquivo é enviado em stream, com `Content-Length`. O Node não carrega o dump na memória. O temporário é apagado quando o download acaba (ou se o `pg_dump` falhar — aí a resposta é JSON de erro, não um arquivo cortado). O pico de disco no container é o tamanho do dump (algumas centenas de MB).

Isto é separado do backup automático de 15 minutos (`backend/services/backupService.js`), que sobe o arquivo pela conta do Drive ligada nas Configurações. Esta rota não usa essa conta: quem grava no Drive é o Luke, do lado dele.

### Por que duas chaves

`ANALYTICS_API_KEY` é a chave de todos os agentes de venda. O dump é o banco inteiro (clientes, financeiro, configurações). Se essa chave vazar, ela **não** pode baixar o banco. A rota exige as três coisas:

| Header | Valor |
|---|---|
| `x-analytics-key` | `ANALYTICS_API_KEY` (a mesma das outras rotas) |
| `x-backup-key` | `BACKUP_API_KEY` (só desta rota) |
| `x-analytics-agent` | `luke` (maiúsculas não importam) |

`x-analytics-agent` **não é senha** — qualquer um pode escrever o header. Quem tranca é a `BACKUP_API_KEY`. O nome fica no log e na auditoria para saber quem pediu.

Sem `BACKUP_API_KEY` no ambiente, a rota responde **503** (`BACKUP_NAO_CONFIGURADO`) e não chama o `pg_dump`. O resto da API de analytics continua igual.

As duas chaves vão **só no header**. Na URL (`?x-backup-key=` ou `?backup_key=`), a API recusa (400): o servidor anota a URL no log.

### EasyPanel

No serviço **hardt-backend**, aba Environment, crie `BACKUP_API_KEY` com uma senha longa sorteada (40 caracteres ou mais), **diferente** da `ANALYTICS_API_KEY` e do `ADMIN_SECRET`. Não commite, não cole em chat e não use em print. Salve e faça o deploy. Sem essa variável o backup por esta rota fica desligado.

Não é preciso variável nova para o `pg_dump`: o `backend/Dockerfile` instala `postgresql17-client`. Não há Nixpacks neste repositório; o build do backend é o Dockerfile.

### O que volta

Sucesso: **200**, corpo binário, sem JSON. `Content-Length` é o tamanho do arquivo — se o download cair no meio, o cliente consegue ver que veio menos byte do que o prometido.

| Header | |
|---|---|
| `Content-Type` | `application/octet-stream` |
| `Content-Disposition` | `attachment; filename="hardt-banco-AAAA-MM-DD-HHMM.dump"` |
| `X-Backup-Formato` | `pg_dump-custom` |

O nome usa o fuso de São Paulo (data e hora). O formato é o custom do Postgres (`pg_dump --format=custom --no-owner --no-privileges`), o mesmo do backup automático.

Enquanto um dump está rodando (este ou o automático de 15 min), a próxima chamada recebe **409** `BACKUP_EM_ANDAMENTO`. Não há fila. Chave de backup errada: **401**, e 20 erros no mesmo IP por minuto passam a **429**. Agente que não é o luke: **403**.

O `pg_dump` tem 20 minutos para terminar. Se passar disso, a conexão cai e a resposta não é um arquivo válido.

O log do servidor anota início e fim: agente, horário, nome do arquivo, tamanho em bytes e duração. A auditoria (`audit_logs`, ação `BACKUP_BANCO`, usuário `luke`) guarda o mesmo, sem o conteúdo do arquivo. A senha do banco não entra no log, na auditoria nem na resposta. O `pg_dump` recebe a senha por variável de ambiente, não pela linha de comando.

### Versão do Postgres

O serviço **hardtapp** é Postgres **17** (conferido em 28/07/2026; ver `backend/docs/backup-restauracao.md`). O `pg_dump` precisa ser **17 ou mais novo** — o 16 falha com `server version mismatch` / `unsupported version`. A rota lê as duas versões antes de começar e, se o client for mais antigo que o servidor, responde **503** `VERSAO_INCOMPATIVEL` e não gera arquivo.

Como conferir depois do deploy, sem baixar o banco:

```bash
# dentro do container do hardt-backend
pg_dump --version

# as duas versões juntas (pg_dump e o servidor), pela rota que já existe
curl -s -H "x-admin-secret: $ADMIN_SECRET" \
  "https://<host>/api/admin-exec/diag-backup"
```

No JSON, `pgDump` é a versão do client e `servidor` é o `SELECT version()` do hardtapp. O número maior do client tem que ser igual ou maior que o do servidor.

### Pedir o arquivo

```bash
curl -fS --retry 0 \
  -H "x-analytics-key: $ANALYTICS_API_KEY" \
  -H "x-backup-key: $BACKUP_API_KEY" \
  -H "x-analytics-agent: luke" \
  -o hardt-banco.dump \
  "https://<host>/api/analytics/v1/backup"
```

Não use `curl -v` em log compartilhado: o `-v` imprime os headers, inclusive as chaves.

Só fique com o arquivo se o `curl` terminar com código 0. Se a conexão cair no meio, o curl sai com erro e o arquivo está incompleto — apague e peça de novo. Um 200 com fim limpo é o que vale. Antes de subir para o Drive, confira o arquivo:

```bash
pg_restore --list hardt-banco.dump >/dev/null
```

Se esse comando falhar, o dump está cortado ou corrompido. Não suba para o Drive no lugar de um backup bom.

Um banco de algumas centenas de MB pode levar minutos. Se o proxy do EasyPanel cortar a resposta no meio (download que para sempre no mesmo ponto), aumente o tempo de resposta do serviço **hardt-backend**. A rota manda `X-Accel-Buffering: no` para o proxy não segurar o arquivo inteiro.

### Restaurar (`pg_restore`)

O `pg_restore` tem que ser **17 ou mais novo**, igual ao `pg_dump` que gerou o arquivo. No Mac: `brew install postgresql@17` e use `/opt/homebrew/opt/postgresql@17/bin/pg_restore`. Restaure num banco **vazio**. Não restaure por cima de um banco que ainda tem dado que importa.

```bash
createdb hardt_restaurado
pg_restore --no-owner --no-privileges --exit-on-error \
  -d hardt_restaurado hardt-banco-2026-11-13-1230.dump
psql hardt_restaurado -c "SELECT count(*) FROM pedidos;"
```

`--no-owner --no-privileges` (na geração e aqui) deixa restaurar com qualquer usuário. Para voltar a produção, aponte a `DATABASE_URL` do backend para esse banco, ou restaure num Postgres novo e vazio e reinicie o backend. O passo a passo do backup automático está em `backend/docs/backup-restauracao.md`.

### Erros desta rota

| HTTP | codigo | quando |
|---|---|---|
| 400 | `CHAVE_NA_URL` | chave na query string |
| 401 | `CHAVE_INVALIDA` | `x-analytics-key` errada |
| 401 | `BACKUP_CHAVE_INVALIDA` | `x-backup-key` errada |
| 403 | `AGENTE_NAO_AUTORIZADO` | header do agente não é `luke` |
| 409 | `BACKUP_EM_ANDAMENTO` | já existe um `pg_dump` rodando |
| 429 | `LIMITE` | muitas chaves de backup erradas |
| 503 | `BACKUP_NAO_CONFIGURADO` | falta `BACKUP_API_KEY` |
| 503 | `BANCO_NAO_CONFIGURADO` | falta `DATABASE_URL` ou ela não é um endereço Postgres |
| 503 | `PG_DUMP_INDISPONIVEL` | a imagem não tem `pg_dump` |
| 503 | `VERSAO_INCOMPATIVEL` | `pg_dump` mais antigo que o servidor |
| 503 | `BANCO_INDISPONIVEL` | não deu para ler a versão do servidor |
| 504 | `BACKUP_TIMEOUT` | passou de 20 minutos sem produzir o arquivo |
| 500 | `BACKUP_FALHOU` | `pg_dump` falhou antes de enviar bytes |

A mensagem de erro não traz senha, connection string nem o texto cru do `pg_dump`.

---

## O que esta API não faz

- Não envia WhatsApp, boleto, Pix nem e-mail.
- Não cria, edita ou cancela pedido, nota ou devolução.
- Não dá baixa, não estorna e não concilia.
- Não executa SQL nem código enviado pelo chamador. O backup é um `pg_dump` fixo, só leitura — não aceita comando, filtro nem nome de tabela na URL.
- Não devolve senha, token, certificado ou a própria chave.
