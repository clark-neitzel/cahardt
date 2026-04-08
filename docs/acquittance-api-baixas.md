# API de Baixas (Acquittance) — Conta Azul v2

Base URL: `https://api-v2.contaazul.com`
Auth: Bearer JWT

Referencia: https://developers.contaazul.com/docs/acquittance-apis-openapi/v1

---

## Endpoints

### 1. Criar Baixa

**POST** `/v1/financeiro/eventos-financeiros/parcelas/{parcela_id}/baixa`

Cria uma baixa (quitação/pagamento) para uma parcela específica.

#### Path Parameters
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| parcela_id | string (uuid) | Sim | ID da parcela no CA |

#### Request Body
```json
{
  "data_pagamento": "2026-04-08",
  "composicao_valor": {
    "multa": 0,
    "juros": 0,
    "valor_bruto": 150.00,
    "desconto": 0,
    "taxa": 0
  },
  "conta_financeira": "uuid-da-conta-caixinha",
  "metodo_pagamento": "DINHEIRO",
  "observacao": "Motorista: Edilson | Caixa: 08/04/2026 | Solicitante: Admin"
}
```

#### Campos do Request Body
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| data_pagamento | string (date) | Sim | Data do pagamento (YYYY-MM-DD) |
| composicao_valor | object | Sim | Composição do valor |
| composicao_valor.valor_bruto | number | Sim | Valor bruto |
| composicao_valor.multa | number | Não | Multa |
| composicao_valor.juros | number | Não | Juros |
| composicao_valor.desconto | number | Não | Desconto |
| composicao_valor.taxa | number | Não | Taxa |
| conta_financeira | string (uuid) | Sim | ID da conta financeira (ex: caixinha) |
| metodo_pagamento | string (enum) | Não | Método de pagamento |
| observacao | string | Não | Observação (motorista, caixa, dia, solicitante) |
| nsu | string | Não | NSU para cartão |

#### Enum: metodo_pagamento
- DINHEIRO
- CARTAO_CREDITO
- BOLETO_BANCARIO
- CARTAO_CREDITO_VIA_LINK
- CHEQUE
- CARTAO_DEBITO
- TRANSFERENCIA_BANCARIA
- OUTRO
- CARTEIRA_DIGITAL
- CASHBACK
- CREDITO_LOJA
- CREDITO_VIRTUA
- DEPOSITO_BANCARIO
- PIX_PAGAMENTO_INSTANTANEO
- PROGRAMA_FIDELIDADE
- SEM_PAGAMENTO
- VALE_ALIMENTACAO
- VALE_COMBUSTIVEL
- VALE_PRESENTE
- VALE_REFEICAO
- PIX_COBRANCA
- DEBITO_AUTOMATICO

#### Responses
- 200/201: Baixa criada com sucesso
- 400: Bad Request
- 401: Unauthorized (token expirado)
- 429: Too Many Requests

#### cURL Exemplo
```bash
curl -X POST \
  https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/35473eec-4e74-11ee-b500-9f61de8a8b8b/baixa \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
    "data_pagamento": "2026-04-08",
    "composicao_valor": {
      "valor_bruto": 150.00,
      "multa": 0,
      "juros": 0,
      "desconto": 0,
      "taxa": 0
    },
    "conta_financeira": "uuid-da-conta-caixinha",
    "metodo_pagamento": "DINHEIRO",
    "observacao": "Motorista: Edilson | Caixa: 08/04/2026"
  }'
```

---

### 2. Buscar Baixas por Parcela

**GET** `/v1/financeiro/eventos-financeiros/parcelas/{parcela_id}/baixas`

Retorna as baixas associadas a uma parcela.

---

### 3. Buscar Baixa por ID

**GET** `/v1/financeiro/baixas/{id}`

Retorna detalhes de uma baixa específica.

---

### 4. Atualizar Baixa (Parcial)

**PATCH** `/v1/financeiro/baixas/{id}`

Atualiza parcialmente uma baixa existente.

---

### 5. Deletar Baixa

**DELETE** `/v1/financeiro/baixas/{id}`

Remove uma baixa.

---

## Endpoints Auxiliares Necessários

### Buscar Conta Financeira (Caixinha)
**GET** `/v1/conta-financeira?tipos=CAIXINHA&mostrar_caixinha=true&apenas_ativo=true`

Retorna contas financeiras do tipo CAIXINHA.

### Buscar Parcelas (Contas a Receber)
**GET** `/v1/financeiro/eventos-financeiros/contas-a-receber/buscar`

Filtros importantes:
- `pagina`, `tamanho_pagina` (obrigatórios)
- `data_vencimento_de`, `data_vencimento_ate` (obrigatórios)
- `ids_clientes` (filtrar por cliente)
- `status` (EM_ABERTO, ATRASADO)

### Buscar Detalhes da Parcela
**GET** `/v1/financeiro/eventos-financeiros/parcelas/{id}`

Retorna a parcela completa com:
- `evento.referencia.id` — ID da venda/origem
- `evento.referencia.origem` — "VENDA", "LANCAMENTO_FINANCEIRO", etc.
- `versao` — necessário para updates

---

## Schema: Baixa (Response)
```json
{
  "id": "uuid",
  "versao": 1,
  "data_pagamento": "2026-04-08",
  "valor_composicao": {
    "multa": 0,
    "juros": 0,
    "valor_bruto": 150.00,
    "desconto": 0,
    "taxa": 0,
    "valor_liquido": 150.00
  },
  "conta_financeira": {
    "id": "uuid",
    "nome": "Caixinha",
    "tipo": "CAIXINHA"
  },
  "metodo_pagamento": "DINHEIRO",
  "observacao": "...",
  "origem": "VENDA",
  "tipo_evento_financeiro": "RECEITA"
}
```
