# Conta Azul — API v2 — Referência para Contas a Pagar e Fornecedores

> **Fonte:** specs OpenAPI oficiais baixadas do portal `developers.contaazul.com` em **2026-07-04**.
> Bundles usados (podem ser re-baixados para conferir atualizações):
> - Financeiro: `https://developers.contaazul.com/_bundle/docs/financial-apis-openapi.yaml` (OpenAPI 3.0.1, versão v1)
> - Baixas: `https://developers.contaazul.com/_bundle/docs/acquittance-apis-openapi.yaml`
> - Pessoas: `https://developers.contaazul.com/_bundle/open-api-docs/open-api-person.yaml`
> - Protocolos: `https://developers.contaazul.com/_bundle/docs/protocol-apis-openapi.yaml`
> - Índice geral: `https://developers.contaazul.com/llms.txt`
>
> Tudo que está neste documento foi extraído dessas specs, salvo onde marcado **⚠️ NÃO CONFIRMADO**.

## Informações gerais (confirmadas na doc oficial)

| Item | Valor |
|---|---|
| Base URL | `https://api-v2.contaazul.com` |
| Autenticação | `Authorization: Bearer <access_token>` (JWT) — OAuth 2.0 via `https://auth.contaazul.com/oauth2/token` |
| Validade do access_token | **1 hora** (`expires_in: 3600`) |
| refresh_token | **Rotaciona a cada renovação** — a doc avisa: "Sempre guarde o novo refresh_token, pois ele muda após cada renovação". Guardar sempre o mais recente no banco. |
| Rate limit | **600 chamadas/minuto e até 10/segundo, por conta conectada do ERP**. Estourou → HTTP 429. Detalhes vêm nos headers da resposta. |
| Webhooks | **Não existem** ("Ainda não está disponível nativamente"). A doc recomenda **polling** — usar `GET /v1/financeiro/eventos-financeiros/alteracoes` (seção 5). |
| Sandbox | Não existe. Testes = criar "App de Desenvolvimento" no portal (conta de testes de 30 dias). |
| Criação de eventos financeiros é **assíncrona** | `POST .../contas-a-pagar` responde **HTTP 202** com um `protocolId`. Consultar `GET /v1/protocolo/{id}` até status `SUCCESS` para obter o `evento_financeiro_id` criado (seção 1.1). |
| Datas | Campos `date` = `YYYY-MM-DD`. Campos `date-time` = ISO 8601, fuso **São Paulo/GMT-3** (a spec diz isso explicitamente nos filtros de data de alteração). |
| Erros | 400 Bad Request, 401 Unauthorized, 404 Not Found, 429 Too Many Requests, 500 — nas APIs de Financeiro/Baixas os erros vêm **sem corpo** definido na spec. |

**⚠️ NÃO CONFIRMADO (geral):** a spec não define o formato de serialização de parâmetros query do tipo array (`explode`/`style` ausentes). O default do OpenAPI seria repetir o parâmetro (`status=EM_ABERTO&status=ATRASADO`), mas vale testar também vírgula (`status=EM_ABERTO,ATRASADO`).

---

## 1. POST /v1/financeiro/eventos-financeiros/contas-a-pagar — Criar conta a pagar

`operationId: createPayableFinancialEvent`. Cria um **evento financeiro** de despesa; as parcelas são definidas dentro de `condicao_pagamento.parcelas` (uma entrada por parcela — para conta à vista, uma única parcela).

### Body (application/json) — obrigatório

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `descricao` | string | **Sim** | Descrição do evento financeiro. Ex.: `"Prestação de serviço"` |
| `observacao` | string | **Sim** | Observação do evento. Ex.: `"Evento financeiro no valor de R$100,00"` |
| `data_competencia` | string (date) | **Sim** | Data de competência. Ex.: `"2024-07-15"` |
| `valor` | number (decimal) | **Sim** | Valor total do evento. Ex.: `100` |
| `contato` | string (uuid) | **Sim** | **UUID da pessoa (fornecedor)** — "Identificador do negociador". É o `id` (UUID) da API de Pessoas, não o `id_legado`. |
| `conta_financeira` | string (uuid) | **Sim** | UUID da conta financeira do evento (ver seção 8) |
| `rateio` | array de `CategoriaRateio` | Não* | Rateio por categoria (ver abaixo). *A spec NÃO marca como obrigatório, mas sem ele o lançamento fica sem categoria — ⚠️ comportamento sem rateio não confirmado. |
| `condicao_pagamento` | object | **Sim** | Contém a lista de parcelas (ver abaixo) |

`rateio[]` (objeto `CategoriaRateio`):

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `id_categoria` | string (uuid) | **Sim** | UUID da categoria (de DESPESA — ver seção 6) |
| `valor` | number | **Sim** | Valor atribuído à categoria |
| `rateio_centro_custo` | array | Não | Lista de `{ id_centro_custo: uuid, valor: number }` |

`condicao_pagamento`:

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `parcelas` | array de `ParcelaCondicaoPagamento` | **Sim** | Uma entrada por parcela |

`condicao_pagamento.parcelas[]` (objeto `ParcelaCondicaoPagamento`):

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `descricao` | string | **Sim** | Ex.: `"Mensalidade (2/6)"` |
| `data_vencimento` | string (date) | **Sim** | Ex.: `"2024-07-15"` |
| `nota` | string | **Sim** | Ex.: `"Pagamento realizado via PIX"` |
| `conta_financeira` | string (uuid) | **Sim** | Conta financeira da parcela |
| `detalhe_valor` | object | **Sim** | Composição de valor (abaixo) |
| `metodo_pagamento` | string enum | Não | `DINHEIRO, CARTAO_CREDITO, BOLETO_BANCARIO, CARTAO_CREDITO_VIA_LINK, CHEQUE, CARTAO_DEBITO, TRANSFERENCIA_BANCARIA, OUTRO, CARTEIRA_DIGITAL, CASHBACK, CREDITO_LOJA, CREDITO_VIRTUAL, DEPOSITO_BANCARIO, PIX_PAGAMENTO_INSTANTANEO, PROGRAMA_FIDELIDADE, SEM_PAGAMENTO, VALE_ALIMENTACAO, VALE_COMBUSTIVEL, VALE_PRESENTE, VALE_REFEICAO, PIX_COBRANCA, DEBITO_AUTOMATICO` |

`detalhe_valor` (usado também no PATCH de parcela como `composicao_valor`):

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `valor_bruto` | number | **Sim** | Valor bruto da parcela |
| `valor_liquido` | number | Não | Valor líquido |
| `multa` | number | Não | Valor da multa |
| `juros` | number | Não | Valor dos juros |
| `desconto` | number | Não | Valor do desconto |
| `taxa` | number | Não | Valor da taxa |

**⚠️ NÃO CONFIRMADO:** a spec não diz se a soma dos `valor_bruto` das parcelas (e a soma do `rateio`) precisa bater exatamente com `valor` do evento — assumir que sim e validar no primeiro teste real.

### Exemplo de request

```json
{
  "descricao": "Compra de embalagens",
  "observacao": "NF 1234 - Fornecedor Embalagens SA",
  "data_competencia": "2026-07-01",
  "valor": 1000.00,
  "contato": "35473eec-4e74-11ee-b500-9f61de8a8b8b",
  "conta_financeira": "9c1e4f0a-0000-0000-0000-000000000000",
  "rateio": [
    { "id_categoria": "b134ec6b-30f8-4edc-9a8f-4787fd3381ac", "valor": 1000.00 }
  ],
  "condicao_pagamento": {
    "parcelas": [
      {
        "descricao": "Parcela (1/2)",
        "data_vencimento": "2026-07-30",
        "nota": "Boleto",
        "conta_financeira": "9c1e4f0a-0000-0000-0000-000000000000",
        "detalhe_valor": { "valor_bruto": 500.00 },
        "metodo_pagamento": "BOLETO_BANCARIO"
      },
      {
        "descricao": "Parcela (2/2)",
        "data_vencimento": "2026-08-30",
        "nota": "Boleto",
        "conta_financeira": "9c1e4f0a-0000-0000-0000-000000000000",
        "detalhe_valor": { "valor_bruto": 500.00 },
        "metodo_pagamento": "BOLETO_BANCARIO"
      }
    ]
  }
}
```

### Response **202 Accepted** (criação assíncrona!)

```json
{
  "protocolId": "35473eec-4e74-11ee-b500-9f61de8a8b8b",
  "status": "PENDING",
  "createdAt": "2024-10-22T14:30:00Z"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `protocolId` | uuid | Protocolo para acompanhar o processamento |
| `status` | enum `PENDING, SUCCESS, ERROR` | Status inicial |
| `createdAt` | date-time | Criação do protocolo |

### 1.1 GET /v1/protocolo/{id} — descobrir o id do evento criado

Consultar até `status = SUCCESS` (ou `ERROR`). Response 200:

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "resposta": "Operação realizada com sucesso.",
  "status": "SUCCESS",
  "evento_financeiro_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

`evento_financeiro_id` é o UUID do evento — usar em `GET /v1/financeiro/eventos-financeiros/{id_evento}/parcelas` para pegar os UUIDs das parcelas.

---

## 2. GET /v1/financeiro/eventos-financeiros/contas-a-pagar/buscar — Buscar despesas (parcelas)

`operationId: searchInstallmentsToPayByFilter`. **Retorna PARCELAS de despesa** (não eventos), com filtros.

### Parâmetros de query

| Parâmetro | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `pagina` | integer | **Sim** | default 1 |
| `tamanho_pagina` | integer | **Sim** | enum: `10, 20, 50, 100, 200, 500, 1000` |
| `data_vencimento_de` | date | **Sim** | Vencimento de (ISO) |
| `data_vencimento_ate` | date | **Sim** | Vencimento até (ISO) — **os dois filtros de vencimento são obrigatórios sempre** |
| `descricao` | string | Não | Descrição da conta |
| `data_competencia_de` / `data_competencia_ate` | date | Não | |
| `data_pagamento_de` / `data_pagamento_ate` | date | Não | |
| `data_alteracao_de` / `data_alteracao_ate` | date-time | Não | ISO 8601, São Paulo/GMT-3 |
| `valor_de` / `valor_ate` | string | Não | Ex.: `"110.10"` |
| `status` | array de enum | Não | `PERDIDO, RECEBIDO, EM_ABERTO, RENEGOCIADO, RECEBIDO_PARCIAL, ATRASADO` (sim, com nomes de "recebido" mesmo sendo contas a pagar — literal na spec) |
| `ids_contas_financeiras` | array de string | Não | |
| `ids_categorias` | array de string | Não | |
| `ids_centros_de_custo` | array de string | Não | |
| `campo_ordenado_ascendente` / `campo_ordenado_descendente` | string enum `ID, CODIGO, NOME, ATIVO` | Não | ⚠️ esse enum parece copiado da tela de centro de custo na spec (provável erro da doc oficial); usar com cautela |

### Response 200

```json
{
  "itens_totais": 6,
  "itens": [
    {
      "id": "c6a28b6e-efe4-11ee-8ef8-8b86c5251537",
      "descricao": "Aluguel do escritório",
      "data_vencimento": "2027-08-15",
      "status": "OVERDUE",
      "status_traduzido": "ATRASADO",
      "total": 781201.79,
      "nao_pago": 213023.79,
      "pago": 0,
      "data_criacao": "2027-08-15T14:30:00Z",
      "data_alteracao": "2027-08-15T14:30:00Z",
      "data_competencia": "2018-03-16",
      "categorias": [ { "id": "b134ec6b-...", "nome": "Adiantamento Salarial" } ],
      "centros_custo": [ { "id": "428389c6-...", "nome": "Centro X" } ],
      "fornecedor": { "id": "35473eec-...", "nome": "Maria da Silva" }
    }
  ],
  "totais": { "ativo": 6, "inativo": 0, "todos": 6 }
}
```

Campos do item: `id` (uuid da **parcela**), `descricao`, `data_vencimento`, `status` (ex. `OVERDUE` — enum interno não listado na spec ⚠️), `status_traduzido` (enum `PERDIDO, RECEBIDO, EM_ABERTO, RENEGOCIADO, RECEBIDO_PARCIAL, ATRASADO`), `total`, `nao_pago`, `pago`, `data_criacao`, `data_alteracao`, `data_competencia`, `categorias[]{id,nome}`, `centros_custo[]{id,nome}`, `fornecedor{id,nome}`.

---

## 3. Parcelas

### 3.1 GET /v1/financeiro/eventos-financeiros/{id_evento}/parcelas

`operationId: getInstallmentsByEventId`. Path param `id_evento` (string, obrigatório): "uuid **ou id legado** do evento".

**Response 200** = array de parcelas. Campos principais de cada parcela (todos opcionais na spec):

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | ID da parcela (usar nas baixas e no PATCH) |
| `versao` | integer | Versão (controle otimista — necessária no PATCH) |
| `indice` | integer | Número da parcela |
| `status` | enum `PENDENTE, QUITADO, CANCELADO, RENEGOCIADO, RECEBIDO_PARCIAL, ATRASADO, PERDIDO` | A spec diz: "PENDENTE é o mesmo que EM_ABERTO. QUITADO é mesmo que RECEBIDO" |
| `valor_pago` / `nao_pago` | number | |
| `data_vencimento` | date | |
| `data_pagamento_previsto` | date | |
| `descricao`, `nota` | string | |
| `conta_financeira` | object | `{ id, banco, codigo_banco, nome, ativo, tipo, conta_padrao, possui_config_boleto_bancario, agencia, numero }` |
| `id_conta_financeira` | uuid | |
| `valor_composicao` | object | `{ multa, juros, valor_bruto, desconto, taxa, valor_liquido }` |
| `metodo_pagamento` | enum | mesmo enum de 22 valores da seção 1 |
| `conciliado` | boolean | |
| `baixa_agendada` | boolean | |
| `baixas` | array | Baixas já feitas — `{ id, versao, data_pagamento, valor_composicao{...}, conta_financeira{...}, observacao, metodo_pagamento, origem, tipo_evento_financeiro, nsu, atualizado_em, anexos[] }` |
| `anexos` | array | `{ id, versao, descricao, nome, url, tipo_conteudo(FILE/URL), referencia, tipo_anexo(BOLETO_BANCARIO_RFB/BOLETO_BANCARIO/RECIBO/FATURA/OUTROS/RECIBO_DIGITAL), id_parcela }` |
| `data_alteracao` | date-time | ISO 8601, São Paulo/GMT-3 |
| `evento` | object | `{ id, data_competencia, condicao_pagamento{quantidade_parcelas, montante_fixo}, referencia{id, revisao, origem}, agendado, tipo (RECEITA/DESPESA), codigo_referencia, rateio[]{id_categoria, nome_categoria, valor, valor_bruto, rateio_centro_custo[]} }` — `origem` enum: `LANCAMENTO_FINANCEIRO, DAS, FOLHA, TRANSFERENCIA, SALDO_CONTA_BANCARIA, VENDA, COMPRA, VENDA_AGENDADA, COMPRA_AGENDADA, IMPORTACAO_DOCUMENTO, IMPOSTO_RETIDO, SIC, NOTA_COMPRA, ANTECIPACAO, RENEGOCIACAO, HONORARIOS_CONTABEIS` |
| `fatura` | object | `{ numero, rps, tipo_fatura(NFE/NFSE/NFCE) }` |
| `renegociacao` | object | `{ id, valor }` |
| (outros) | | `solicitacoes_cobrancas[]`, `id_ultima_solicitacao_pagamento`, `id_boleto_bancario_autorizado`, `valor_total_liquido`, `perda{data,valor}`, `nsu`, `referencia` — usados mais em contas a receber |

### 3.2 GET /v1/financeiro/eventos-financeiros/parcelas/{id}

`operationId: getInstallmentById`. Path `id` (uuid da parcela). Response 200 = **um** objeto de parcela com exatamente a mesma estrutura da 3.1.

### 3.3 PATCH /v1/financeiro/eventos-financeiros/parcelas/{id}

`operationId: updateInstallment`. Atualização parcial da parcela.

Body (application/json, obrigatório):

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `versao` | integer | **Sim** | "Sempre enviar o valor atual da versão" (pegar no GET; a resposta devolve a nova versão) |
| `vencimento` | date | Não | Nova data de vencimento (atenção: aqui chama `vencimento`, não `data_vencimento`) |
| `descricao` | string | Não | |
| `nota` | string | Não | |
| `composicao_valor` | object | Não | `{ valor_bruto (obrigatório dentro do objeto), valor_liquido, multa, juros, desconto, taxa }` |
| `data_pagamento_esperado` | date | Não | |
| `metodo_pagamento` | enum (22 valores) | Não | |
| `perda` | object | Não | `{ data, valor }` |
| `nsu` | string | Não | |
| `pagamento_agendado` | boolean | Não | |
| `id_conta_financeira` | uuid | Não | Trocar a conta financeira |

Response 200: eco dos campos + `versao` nova + `conta_financeira{ id, versao, nome, agencia, numero, tipo, banco }`.

---

## 4. Baixas (API "Baixas" / acquittance)

### 4.1 POST /v1/financeiro/eventos-financeiros/parcelas/{parcela_id}/baixa — Criar baixa

`operationId: criarBaixa`. Path `parcela_id` (uuid, obrigatório). "Ao registrar a baixa, o sistema atualiza automaticamente o status da parcela." Para **baixa parcial**, enviar `valor_bruto` menor que o valor da parcela (a doc do PATCH menciona explicitamente o uso para pagamento parcial).

Body:

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `data_pagamento` | date | **Sim** | Ex.: `"2023-10-01"` |
| `composicao_valor` | object | **Sim** | ver abaixo |
| `conta_financeira` | uuid | **Sim** | Conta por onde saiu o pagamento |
| `metodo_pagamento` | enum | Não | **Enum menor que o das parcelas:** `DINHEIRO, CARTAO_CREDITO, BOLETO_BANCARIO, CARTAO_CREDITO_VIA_LINK, CHEQUE, CARTAO_DEBITO, TRANSFERENCIA_BANCARIA, OUTRO, CARTEIRA_DIGITAL, CASHBACK, CREDITO_LOJA, CREDITO_VIRTUAL, DEPOSITO_BANCARIO, PIX_PAGAMENTO_INSTANTANEO` (14 valores) |
| `observacao` | string | Não | |
| `nsu` | string | Não | Número sequencial único |

`composicao_valor`:

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `valor_bruto` | number | **Sim** | ≥ 0 |
| `multa` | number | Não | ≥ 0 |
| `juros` | number | Não | ≥ 0 |
| `desconto` | number | Não | ≥ 0 |
| `taxa` | number | Não | ≥ 0 |

Exemplo:

```json
{
  "data_pagamento": "2026-07-04",
  "composicao_valor": { "valor_bruto": 150.00, "juros": 2.50, "multa": 5.00, "desconto": 10.00 },
  "conta_financeira": "35473eec-4e74-11ee-b500-9f61de8a8b8b",
  "metodo_pagamento": "PIX_PAGAMENTO_INSTANTANEO",
  "observacao": "Pagamento referente à fatura #1234."
}
```

Response **200** (síncrono, ao contrário do POST de evento): `{ id (uuid da baixa), versao, data_pagamento, composicao_valor{...}, conta_financeira, metodo_pagamento, observacao, nsu }`.

### 4.2 GET /v1/financeiro/eventos-financeiros/parcelas/{parcela_id}/baixa — Listar baixas da parcela

`operationId: listarBaixas`. Response 200 = array de baixas: `{ id, versao, data_pagamento, valor_composicao{multa,juros,valor_bruto,desconto,taxa}, conta_financeira (uuid), id_reconciliacao, id_parcela, id_solicitacao_cobranca, observacao, metodo_pagamento, origem, id_recibo_digital, tipo_evento_financeiro (RECEITA/DESPESA), nsu, id_referencia, atualizado_em, anexos[] }`.

Atenção: na **resposta** o campo chama `valor_composicao`; no **request** de criação chama `composicao_valor`. (Literal na spec.)

### 4.3 GET /v1/financeiro/eventos-financeiros/parcelas/baixa/{baixa_id}

`operationId: buscarBaixa`. Response 200 = um objeto de baixa, mesma estrutura da 4.2. 404 se não existir.

### 4.4 PATCH /v1/financeiro/eventos-financeiros/parcelas/baixa/{baixa_id}

`operationId: atualizarBaixa`. Body: `versao` (integer, **obrigatório** — incrementa a cada atualização) + os mesmos campos opcionais do POST (`data_pagamento`, `composicao_valor` com `valor_bruto` obrigatório dentro, `conta_financeira`, `metodo_pagamento`, `observacao`, `nsu`). Response 200 = baixa atualizada.

### 4.5 DELETE /v1/financeiro/eventos-financeiros/parcelas/baixa/{baixa_id}

`operationId: deletarBaixa`. Sem body. Response 200 sem corpo. 404 se não existir. "Usar com cautela, impacta o saldo e histórico da parcela."

---

## 5. GET /v1/financeiro/eventos-financeiros/alteracoes — Polling de mudanças

`operationId: getAlteredFinancialEvents`. "Retornar os IDs dos eventos financeiros (contas a pagar **e** a receber) alterados em um período." A doc alerta: informa só a data/hora em que o evento foi salvo, **sem detalhar quais campos mudaram** (e salvar sem alterar também conta como alteração).

| Parâmetro (query) | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `data_inicio` | date-time | **Sim** | ISO 8601, São Paulo/GMT-3 |
| `data_fim` | date-time | **Sim** | ISO 8601, São Paulo/GMT-3 |
| `pagina` | integer | Não | default 1 |
| `tamanho_pagina` | integer | Não | default 10 |

Response 200:

```json
{ "itens_totais": 1, "itens": [ { "id": "35473eec-4e74-11ee-b500-9f61de8a8b8b" } ] }
```

Cada item traz **apenas o `id` (uuid) do evento** — buscar detalhes via `GET /v1/financeiro/eventos-financeiros/{id_evento}/parcelas`.

---

## 6. GET /v1/categorias — Categorias de receita/despesa

`operationId: searchCategories`.

| Parâmetro (query) | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `pagina` | number | **Sim** | |
| `tamanho_pagina` | number | **Sim** | enum `10, 20, 50, 100, 200, 500, 1000` |
| `permite_apenas_filhos` | boolean | **Sim** | "Permite apenas categorias filhas" (⚠️ a spec marca como obrigatório e não explica a diferença para `apenas_filhos`; enviar sempre, ex. `false`) |
| `tipo` | string enum `RECEITA, DESPESA` | Não | Para contas a pagar usar `DESPESA` |
| `busca` | string | Não | Busca textual por nome ou código |
| `nome` | string | Não | |
| `apenas_filhos` | boolean | Não | Filtrar apenas categorias filhas |
| `campo_ordenado_ascendente` / `campo_ordenado_descendente` | enum `NOME, TIPO` | Não | |

Response 200:

```json
{
  "itens_totais": 6,
  "itens": [
    {
      "id": "35473eec-4e74-11ee-b500-9f61de8a8b8b",
      "versao": 0,
      "nome": "Eletrônicos",
      "categoria_pai": "3d39b8d2-8b16-42d6-abd8-6cfd9d2e06c4",
      "tipo": "RECEITA",
      "entrada_dre": "DESPESAS_ADMINISTRATIVAS",
      "considera_custo_dre": true
    }
  ],
  "totais": { "ativo": 6, "inativo": 0, "todos": 6 }
}
```

(`entrada_dre` sem enum na spec.)

---

## 7. Pessoas / Fornecedores (API Pessoas — OpenAPI 3.0.0)

### 7.1 Listar fornecedores — GET /v1/pessoas?tipo_perfil=Fornecedor

`operationId: retornaPessoasPorFiltros`. **O parâmetro que identifica o perfil é `tipo_perfil`**, enum **`Cliente` | `Fornecedor` | `Transportadora`** (com acento e maiúscula inicial, exatamente assim — internamente `CLIENT/PROVIDER/TRANSPORTER`).

| Parâmetro (query) | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `pagina` | integer | Não | default 1 |
| `tamanho_pagina` | integer | Não | enum `10, 20, 50, 100, 200, 500, 1000`, default 10 |
| `tipo_perfil` | enum `Cliente, Fornecedor, Transportadora` | Não | ⚠️ a spec declara default `"Cliente"` — ou seja, **sem esse parâmetro pode vir só cliente**; enviar sempre `tipo_perfil=Fornecedor` |
| `tipos_pessoa` | enum `Física, Jurídica, Estrangeira` | Não | ⚠️ spec declara default `"Física"` — mesmo alerta: se quiser todos os tipos, comportamento sem o parâmetro não confirmado; teste na prática |
| `busca` | string | Não | Busca textual por documento ou nome |
| `documentos` | string | Não | CPF/CNPJ |
| `ids`, `codigos_pessoa`, `emails`, `nomes`, `telefones`, `paises`, `cidades`, `ufs` | string | Não | |
| `data_criacao_inicio` / `data_criacao_fim` | string | Não | um exige o outro |
| `data_alteracao_de` / `data_alteracao_ate` | string | Não | ISO 8601, São Paulo/GMT-3 (útil para sync incremental de fornecedores) |
| `com_endereco` | boolean | Não | default false |
| `tipo_ordenacao` | enum `NOME, EMAIL, DOCUMENTO, ATIVO` | Não | default NOME |
| `ordem_ordenacao` | enum `ASC, DESC` | Não | default ASC |

Response 200 (atenção: aqui os nomes são **camelCase** `items`/`totalItems`, diferente do resto):

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "id_legado": 12345,
      "uuid_legado": "550e8400-e29b-41d4-a716-446655440000",
      "nome": "João Silva",
      "documento": "123.456.789-00",
      "email": "joao.silva@email.com",
      "telefone": "(11) 1234-5678",
      "tipo_pessoa": "FISICA",
      "perfis": ["CLIENTE", "FORNECEDOR", "TRANSPORTADORA"],
      "ativo": true,
      "data_criacao": "2024-01-15T10:30:00",
      "data_alteracao": "2024-01-15T10:30:00",
      "observacoes_gerais": "Cliente preferencial",
      "endereco": { "logradouro": "Rua das Flores", "numero": "123", "bairro": "Centro", "cidade": "São Paulo", "estado": "SP", "cep": "12345-678", "pais": "Brasil", "id_cidade": 3550308, "complemento": "Apto 45", "id": "..." }
    }
  ],
  "totalItems": 150
}
```

**Sobre `id_legado`:** é um **integer** (ID da API v1 legada). Na listagem vem como `id_legado`; no GET por id vem dentro de `pessoas_legado[] { id (integer), perfil, uuid }`. Existe endpoint reverso: **`GET /v1/pessoas/legado/{id}`** (`retornaPessoaPorLegacyId`) que recebe o id legado e devolve a pessoa completa com o UUID novo — é o jeito oficial de converter cadastros antigos (v1) para o UUID usado em `contato` do contas a pagar. `id_legado` **não é enviável** na criação (não existe no body do POST); é gerado/mantido pelo ERP.

### 7.2 Criar fornecedor — POST /v1/pessoas

`operationId: criarPessoa`. Para criar com perfil fornecedor: `perfis: [ { "tipo_perfil": "Fornecedor" } ]`.

Body (application/json) — só `nome` e `tipo_pessoa` são obrigatórios:

| Campo | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `nome` | string (≤200) | **Sim** | Nome da pessoa |
| `tipo_pessoa` | enum `Física, Jurídica, Estrangeira` | **Sim** | Com acento, exatamente assim |
| `perfis` | array | Não* | `[{ "tipo_perfil": "Cliente" \| "Fornecedor" \| "Transportadora" }]` — `tipo_perfil` é obrigatório dentro de cada item. *⚠️ A spec não marca `perfis` como obrigatório e não diz qual perfil é aplicado se omitido. |
| `cpf` | string | Não | Pessoa física. Ex. `"123.456.789-00"` |
| `cnpj` | string | Não | Pessoa jurídica. Ex. `"12.345.678/0001-90"` |
| `nome_fantasia` | string (≤200) | Não | PJ |
| `codigo` | string (≤20) | Não | Código interno. Ex. `"CLI001"` |
| `email` | string (≤100) | Não | "Emails separados por vírgula" |
| `telefone_celular` | string | Não | Ex. `"11983899529"` |
| `telefone_comercial` | string | Não | |
| `data_nascimento` | string | Não | `"1990-01-01"` (PF) |
| `rg` | string (≤50) | Não | |
| `ativo` | boolean | Não | |
| `observacao` | string (≤2000) | Não | |
| `optante_simples` | boolean | Não | |
| `agencia_publica` | boolean | Não | |
| `enderecos` | array | Não | `{ logradouro(≤100), numero(≤10), bairro(≤100), complemento(≤200), cidade, estado, cep, pais }` — "Brasil" se tipo_pessoa Física/Jurídica |
| `inscricoes` | array | Não | `{ indicador_inscricao_estadual ("NAO CONTRIBUINTE" \| "CONTRIBUINTE" \| "ISENTO"), inscricao_estadual(≤20), inscricao_municipal(≤20), inscricao_suframa(≤9) }` |
| `outros_contatos` | array | Não | `{ nome (obrigatório, ≤40), cargo(≤40), email(≤100), telefone_celular, telefone_comercial }` |
| `contato_cobranca_faturamento` | object | Não | `{ emails: [string], whatsapp: string }` |

Exemplo mínimo de fornecedor PJ:

```json
{
  "nome": "Embalagens SA",
  "nome_fantasia": "Embalagens SA",
  "tipo_pessoa": "Jurídica",
  "cnpj": "12.345.678/0001-90",
  "perfis": [ { "tipo_perfil": "Fornecedor" } ],
  "email": "financeiro@embalagens.com.br",
  "telefone_comercial": "4733331234"
}
```

Response **201 Created**: pessoa completa com `id` (UUID — usar como `contato` no contas a pagar), `perfis[]{id, tipo_perfil}`, `origem: "API"`, `estrangeiro`, endereços com `id`/`id_cidade`, etc. (⚠️ o 201 **não** traz `id_legado`.)

Endpoints relacionados (mesma API): `GET /v1/pessoas/{id}`, `PUT /v1/pessoas/{id}` (substituição total — muitos campos obrigatórios), `PATCH /v1/pessoas/{id}` (parcial, response 204 sem corpo; para adicionar o perfil Fornecedor a um cliente existente enviar `perfis` completo), `POST /v1/pessoas/ativar`, `POST /v1/pessoas/inativar`, `POST /v1/pessoas/excluir`.

---

## 8. GET /v1/conta-financeira — Contas financeiras

`operationId: searchFinancialAccounts`. Para escolher a conta padrão das despesas: filtrar e/ou olhar `conta_padrao: true`.

| Parâmetro (query) | Tipo | Obrig.? | Descrição |
|---|---|---|---|
| `pagina` | integer | Não | default 1 |
| `tamanho_pagina` | integer | Não | enum `10, 20, 50, 100, 200, 500, 1000` |
| `tipos` | array | Não | Tipos de conta (valores do enum `tipo` abaixo) |
| `nome` | string | Não | |
| `apenas_ativo` | boolean | Não | |
| `esconde_conta_digital` | boolean | Não | |
| `mostrar_caixinha` | boolean | Não | |

Response 200:

```json
{
  "itens_totais": 6,
  "itens": [
    {
      "id": "35473eec-4e74-11ee-b500-9f61de8a8b8b",
      "nome": "Conta Corrente",
      "banco": "BANCO_BRASIL",
      "codigo_banco": 1,
      "ativo": true,
      "tipo": "CONTA_CORRENTE",
      "conta_padrao": true,
      "possui_config_boleto_bancario": false,
      "agencia": "001",
      "numero": "31"
    }
  ],
  "totais": { "ativo": 6, "inativo": 0, "todos": 6 }
}
```

- `tipo` enum: `APLICACAO, CAIXINHA, CONTA_CORRENTE, CARTAO_CREDITO, INVESTIMENTO, OUTROS, MEIOS_RECEBIMENTO, POUPANCA, COBRANCAS_CONTA_AZUL, RECEBA_FACIL_CARTAO`
- `banco` enum (72 valores): `BANCO_BRASIL, BRADESCO, CAIXA_ECONOMICA, HSBC, ITAU, INTER, ORIGINAL, SANTANDER, BANCOOB, BANESTES, BANPARA, BANRISUL, BCN, BANK_BOSTON, BANCO_BRASILIA, BANCO_NORDESTE, CITIBANK, CREDISAN, NOSSA_CAIXA, MERCANTIL, REAL, SAFRA, SICREDI, SUDAMERIS, UNIBANCO, SICOOB, AILOS, BS2, NUBANK, UNICRED, NEON, C6, CORA, ACESSO, STONE, AGIBANK, ASAAS, TOPAZIO, DAYCOVAL, BANCO_AMAZONIA, BANESE, BTG_PACTUAL, OMNI, GENIAL, CAPITAL, RIBEIRAO_PRETO, PAN, BMG, BNP_PARIBAS_BRASIL, CCR_SAO_MIGUEL_OESTE, CREDISIS, CRESOL, FITBANK, GERENCIANET, GLOBAL_SCM, JP_MORGAN, JUNO, MERCADO_PAGO, MODAL, MONEY_PLUS, NEXT, OTIMO, PAGSEGURO, PICPAY, PJBANK, POLOCRED, RENDIMENTO, UNIPRIME, UNIPRIME_NORTE_PARANA, VORTX_DTVM, BRL_TRUST, IUGU, OUTROS, NAO_BANCO`

Existe também `GET /v1/conta-financeira/{id_conta_financeira}/saldo-atual` (saldo em tempo real) na mesma API.

---

## Resumo do fluxo recomendado para a integração de Contas a Pagar

1. **Setup (uma vez):** `GET /v1/conta-financeira` → escolher/guardar UUID da conta padrão; `GET /v1/categorias?tipo=DESPESA&permite_apenas_filhos=false...` → mapear categorias de despesa.
2. **Fornecedor:** `GET /v1/pessoas?tipo_perfil=Fornecedor&documentos=<cnpj>` (ou `busca=`); se não existir → `POST /v1/pessoas` com `perfis:[{tipo_perfil:"Fornecedor"}]`; se existir só como Cliente → `PATCH /v1/pessoas/{id}` adicionando o perfil. Guardar o UUID.
3. **Criar despesa:** `POST /v1/financeiro/eventos-financeiros/contas-a-pagar` → guardar `protocolId` → poll `GET /v1/protocolo/{id}` até `SUCCESS` → guardar `evento_financeiro_id` → `GET /v1/financeiro/eventos-financeiros/{id_evento}/parcelas` → guardar UUID + `versao` de cada parcela.
4. **Pagar:** `POST /v1/financeiro/eventos-financeiros/parcelas/{parcela_id}/baixa` (parcial = `valor_bruto` menor). Corrigir com PATCH/DELETE da baixa.
5. **Sync:** polling periódico de `GET /v1/financeiro/eventos-financeiros/alteracoes?data_inicio=...&data_fim=...` (sem webhooks) e, para itens, `GET .../contas-a-pagar/buscar` com `data_alteracao_de/ate`. Respeitar 600 req/min e 10 req/s; tratar 429 com backoff.
6. **Tokens:** renovar access_token a cada <1h e **sempre persistir o novo refresh_token** (rotaciona a cada uso).

## Lista consolidada do que NÃO foi confirmado na fonte oficial

1. Serialização de arrays em query string (`status`, `ids_categorias`, etc.) — spec omite `style/explode`.
2. Se a soma das parcelas (`detalhe_valor.valor_bruto`) e do `rateio` precisa ser exatamente igual ao `valor` do evento.
3. Comportamento do POST contas-a-pagar **sem** `rateio` (spec não o marca como obrigatório).
4. Enum do campo `status` "cru" retornado pelo `/contas-a-pagar/buscar` (ex.: `OVERDUE`) — spec só documenta `status_traduzido`.
5. Enum `campo_ordenado_*` do `/contas-a-pagar/buscar` (`ID, CODIGO, NOME, ATIVO`) parece erro de copy/paste da doc de centro de custo.
6. Comportamento real dos defaults `tipo_perfil="Cliente"` e `tipos_pessoa="Física"` no `GET /v1/pessoas` quando os parâmetros são omitidos (se filtram mesmo ou retornam tudo).
7. Perfil aplicado quando `POST /v1/pessoas` é enviado sem `perfis`.
8. Diferença exata entre `apenas_filhos` e `permite_apenas_filhos` no `GET /v1/categorias` (o segundo é obrigatório na spec, sem explicação).
9. Grafia `CREDITO_VIRTUA` (sem L) aparece literalmente em alguns enums de `metodo_pagamento` da API de Baixas (respostas/PATCH) — provável typo da spec; o request de criação usa `CREDITO_VIRTUAL`.
