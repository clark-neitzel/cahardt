---
name: 05-ca-api-referencia
description: "📚 DICIONÁRIO COMPLETO CONTA AZUL. Consulte para ver payloads, limites, cURLs e regras das rotas de OAuth, Pessoas, Produtos, Vendas, Financeiro, Notas Fiscais e Contratos."
---

# 05 CA API REFERENCIA — Documentação Completa

> ⚠️ **DOCUMENTO MESTRE** — Atualizado em Abr/2026 com toda a documentação oficial do Portal do Desenvolvedor Conta Azul.
> Organizado por área: [Autenticação](#-autenticação-oauth-20) | [Pessoas/Clientes](#-pessoas-clientes-e-fornecedores) | [Produtos](#-produtos-e-estoque) | [Vendas](#-vendas) | [Financeiro](#-financeiro) | [Notas Fiscais](#-notas-fiscais) | [Contratos](#-contratos)

---

## ⚙️ PADRÕES GLOBAIS

| Item | Valor |
|------|-------|
| **Base URL** | `https://api-v2.contaazul.com` |
| **Auth URL** | `https://auth.contaazul.com` |
| **Estilo** | REST |
| **Formato** | JSON |
| **Autenticação** | OAuth 2.0 (Bearer JWT) |
| **Header** | `Authorization: Bearer <access_token>` |
| **Rate Limit** | **600 req/min e 10 req/seg** por conta conectada do ERP |
| **Paginação** | `pagina` (int) + `tamanho_pagina` (int) |
| **Datas** | ISO 8601 — `YYYY-MM-DDTHH:mm:ss` (sem Z, fuso SP/GMT-3 salvo indicação) |
| **Sandbox** | ❌ Não existe. Use App de Desenvolvimento (conta fictícia por 30 dias) |
| **Webhooks** | ❌ Não existem. Use polling periódico |
| **SDKs** | ❌ Não existem. Use chamadas HTTP diretas |
| **Suporte** | Portal do Desenvolvedor → ícone chat inferior direito |

### Códigos de Retorno HTTP
| Código | Significado |
|--------|-------------|
| `200` | Sucesso |
| `202` | Aceito (processamento assíncrono em Financeiro) |
| `400` | Payload inválido / campos faltando |
| `401` | Token expirado ou inválido |
| `404` | Recurso não encontrado |
| `429` | Rate limit excedido — implemente backoff exponencial |
| `500` | Erro interno CA — tente novamente em alguns segundos |

---

## 🔐 AUTENTICAÇÃO (OAuth 2.0)

O Conta Azul usa o fluxo **Authorization Code** do OAuth 2.0.

### ETAPA 1 — Solicitar código de autorização
Redirecione o usuário para o portal Conta Azul para conceder permissão à sua aplicação. O CA retornará um `code` (válido por **3 minutos**) na `redirect_uri`.

### ETAPA 2 — Trocar o código pelo access_token

```bash
curl --location 'https://auth.contaazul.com/oauth2/token' \
  --header 'Authorization: Basic BASE64(SEU_CLIENT_ID:SEU_CLIENT_SECRET)' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'code=CODIGO_AUTORIZACAO' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode 'redirect_uri=SUA_URL_REDIRECIONAMENTO'
```

> **Como gerar o Base64:**
> - Linux/mac: `echo -n "client_id:client_secret" | base64`
> - Windows PowerShell: `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("client_id:client_secret"))`

#### Resposta (200 OK)
```json
{
  "access_token": "ACCESS_TOKEN_GERADO",
  "expires_in": 3600,
  "refresh_token": "REFRESH_TOKEN_GERADO",
  "token_type": "Bearer"
}
```

| Token | Validade | Uso |
|-------|----------|-----|
| `access_token` | **3600 seg (1 hora)** | Header de todas as requisições à API |
| `refresh_token` | **5 anos** ou até próxima renovação | Renovar o access_token quando expira |

> ⚠️ **CRÍTICO:** Salve o `refresh_token` a cada renovação — ele muda a cada uso.

### ETAPA 3 — Renovar o access_token (refresh)
Quando o `access_token` expirar, use o `refresh_token` para obter um novo par de tokens sem re-autenticar o usuário.

### ETAPA 4 — Usar o token nas requisições
Todas as chamadas à API devem incluir:
```
Authorization: Bearer <access_token>
```

### Regra crítica do App Hardt — _axiosGet obrigatório
> **NUNCA** use `axios.get()` ou `axios.post()` diretamente. Use `contaAzulService._axiosGet(url, 'LOG_NAME')` para GETs, pois ele intercepta erros `401` e renova o token automaticamente.
> Para POST/PUT, capture o token com `contaAzulService.getAccessToken()` e em caso de `401` force renovação com `getAccessToken(true)`.

---

## 👥 PESSOAS (Clientes e Fornecedores)

**Base URL:** `https://api-v2.contaazul.com/v1/pessoas`

> ⚠️ O filtro de data (`data_alteracao_de` / `data_alteracao_ate`) exige **ambos os campos**, formato **sem milissegundos e sem Z** (`YYYY-MM-DDTHH:mm:ss`), e **intervalo máximo de 365 dias** — caso contrário retorna erro.

> **`GET /v1/pessoas/conta-conectada`** (adicionado Mar/2026): retorna os dados cadastrais e de contato da empresa vinculada à integração (útil para validar qual conta está conectada ao token atual).

---

### GET /v1/pessoas — Listar Pessoas

Consulta pessoas cadastradas com suporte a filtros.

| Parâmetro | Tipo | Obrig.? | Descrição |
|-----------|------|---------|-----------|
| `pagina` | integer | **Sim** | Número da página |
| `tamanho_pagina` | integer | **Sim** | Itens por página |
| `tipo_perfil` | string | **Sim** | `Cliente`, `Fornecedor`, `Transportadora` |
| `busca` | string | Não | Busca por documento ou nome |
| `ids` | string | Não | UUIDs separados por vírgula |
| `documentos` | string | Não | CPF/CNPJ |
| `emails` | string | Não | Emails |
| `nomes` | string | Não | Nomes |
| `telefones` | string | Não | Telefones |
| `tipos_pessoa` | string | Não | `Fisica`, `Juridica`, `Estrangeira` |
| `ufs` | string | Não | Siglas de estados |
| `cidades` | string | Não | Cidades |
| `paises` | string | Não | Países |
| `codigos_pessoa` | string | Não | Códigos internos |
| `data_criacao_inicio` | string | Não | Data inicial de criação |
| `data_criacao_fim` | string | Não | Data final de criação |
| `data_alteracao_de` | string | Cond. | ISO `YYYY-MM-DDTHH:mm:ss` — obrig. junto com `ate` |
| `data_alteracao_ate` | string | Cond. | ISO `YYYY-MM-DDTHH:mm:ss` — obrig. junto com `de` |
| `com_endereco` | boolean | Não | Incluir endereços na resposta |
| `tipo_ordenacao` | string | Não | `nome`, `email`, `documento`, `ativo` |
| `ordem_ordenacao` | string | Não | `ASC`, `DESC` |

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/pessoas?pagina=1&tamanho_pagina=50&tipo_perfil=Cliente&data_alteracao_de=2024-01-01T00:00:00&data_alteracao_ate=2024-01-31T23:59:59' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### POST /v1/pessoas — Criar Nova Pessoa

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/pessoas' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{...}'
```

```json
{
  "nome": "João Silva",
  "tipo_pessoa": "Juridica",
  "cnpj": "12.345.678/0001-90",
  "nome_fantasia": "Empresa LTDA",
  "email": "cliente@email.com",
  "ativo": true,
  "agencia_publica": false,
  "optante_simples": false,
  "codigo": "CLI001",
  "data_nascimento": "1990-01-01",
  "observacao": "Cliente preferencial",
  "perfis": [
    { "tipo_perfil": "Cliente" }
  ],
  "enderecos": [
    {
      "logradouro": "Rua das Flores",
      "numero": "123",
      "complemento": "Apto 45",
      "bairro": "Centro",
      "cidade": "São Paulo",
      "estado": "SP",
      "cep": "12345-678",
      "pais": "Brasil"
    }
  ],
  "inscricoes": [
    {
      "indicador_inscricao_estadual": "NAO CONTRIBUINTE",
      "inscricao_estadual": "ISENTO"
    }
  ],
  "outros_contatos": []
}
```

---

### PUT /v1/pessoas/{id} — Atualizar Pessoa (Completo)
Substitui integralmente o cadastro. Todos os campos obrigatórios devem ser enviados.

```bash
curl -X PUT 'https://api-v2.contaazul.com/v1/pessoas/UUID-DA-PESSOA' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ ...payload_completo... }'
```

---

### PATCH /v1/pessoas/{id} — Atualizar Pessoa (Parcial)
Atualiza apenas os campos enviados.

```bash
curl -X PATCH 'https://api-v2.contaazul.com/v1/pessoas/UUID-DA-PESSOA' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "novo.email@dominio.com",
    "telefones": [{ "numero": "11999999999", "tipo": "CELULAR" }]
  }'
```

---

### GET /v1/pessoas/{id} — Consultar por ID
```bash
curl -X GET 'https://api-v2.contaazul.com/v1/pessoas/UUID-DA-PESSOA' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/pessoas/legado/{id} — Consultar por ID Legado (V1)
Para compatibilidade com sistemas que guardam o ID numérico antigo da API V1.

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/pessoas/legado/123456' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### POST /v1/pessoas/ativar — Ativar em Lote
```bash
curl -X POST 'https://api-v2.contaazul.com/v1/pessoas/ativar' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "uuids": ["UUID-1", "UUID-2"] }'
```

---

### POST /v1/pessoas/inativar — Desativar em Lote
```bash
curl -X POST 'https://api-v2.contaazul.com/v1/pessoas/inativar' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "uuids": ["UUID-1", "UUID-2"] }'
```

---

### POST /v1/pessoas/excluir — Excluir em Lote
```bash
curl -X POST 'https://api-v2.contaazul.com/v1/pessoas/excluir' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "uuids": ["UUID-1", "UUID-2"] }'
```

---

### Campos Extendidos Hardt (Banco Local)
Além dos campos padrão do CA, a tabela `clientes` local possui:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id_vendedor` | String | ID do Vendedor responsável (FK `vendedores`) |
| `Dia_de_entrega` | String | Dia da semana fixo para entrega |
| `Dia_de_venda` | String | Dia da semana fixo para visita/contato |
| `Condicao_de_pagamento` | String | ID da tabela de preços (`1000`, `BOL_7`, etc.) |
| `Formas_Atendimento` | String[] | Array de canais (`WHATSAPP`, `VISITA`, etc.) |

---

## 📦 PRODUTOS E ESTOQUE

**Base URL:** `https://api-v2.contaazul.com/v1/produtos`

---

### GET /v1/produtos — Listar Produtos

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `pagina` | integer | Número da página |
| `tamanho_pagina` | integer | Itens por página |
| `busca` | string | Busca textual (Nome, EAN, SKU) |
| `status` | string | `ATIVO` ou `INATIVO` |
| `sku` | string | Filtro exato por SKU (adicionado Nov/2025) |
| `data_alteracao_de` | string | ISO 8601 — Data inicial de alteração (adicionado Nov/2025) |
| `data_alteracao_ate` | string | ISO 8601 — Data final de alteração (adicionado Nov/2025) |
| `integracao_ecommerce_ativo` | boolean | Filtrar integrados via e-commerce |
| `produtos_kit_ativo` | boolean | Filtrar kits |
| `valor_venda_inicial` | number | Range de preço inicial |
| `valor_venda_final` | number | Range de preço final |
| `campo_ordenacao` | string | Campo para ordenar |
| `direcao_ordenacao` | string | `ASC` ou `DESC` |

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/produtos?pagina=1&tamanho_pagina=50&status=ATIVO&data_alteracao_de=2024-01-01T00:00:00&data_alteracao_ate=2024-01-31T23:59:59' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

#### Resposta (lista simplificada)
```json
{
  "items": [
    {
      "id": "030bfa5e-e7b4-434d-aaab-bd1833056c74",
      "nome": "COXINHA TRADICIONAL FRANGO C/20 130GR",
      "codigo_sku": "3059",
      "codigo_ean": "7898620330224",
      "status": "ATIVO",
      "categoria": {
        "id": 61589260,
        "descricao": "Produto Acabado",
        "uuid": "b96ad226-588e-49b2-bdc7-9c97d97ffa22"
      },
      "ultima_atualizacao": "2026-01-20T10:51:05.706929Z"
    }
  ],
  "totalItems": 232
}
```

> ⚠️ **IMPORTANTE:** A listagem retorna estrutura simplificada. Para dados completos (estoque, custos), use o endpoint de detalhes `GET /v1/produtos/{id}`.

---

### GET /v1/produtos/{id} — Consultar Produto por ID

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/produtos/UUID-DO-PRODUTO' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

#### Resposta (detalhes completos)
```json
{
  "id": "030bfa5e-e7b4-434d-aaab-bd1833056c74",
  "id_legado": 462908994,
  "ativo": true,
  "nome": "COXINHA TRADICIONAL FRANGO C/20 130GR",
  "codigo_sku": "3059",
  "codigo_ean": "7898620330224",
  "status": "ATIVO",
  "formato": "SIMPLES",
  "categoria": {
    "id": 61589260,
    "descricao": "Produto Acabado",
    "uuid": "b96ad226-588e-49b2-bdc7-9c97d97ffa22"
  },
  "estoque": {
    "quantidade_total": 120,
    "quantidade_disponivel": 120,
    "quantidade_reservada": 0,
    "minimumStock": 180,
    "valor_venda": 54.5,
    "custo_medio": 3.35
  },
  "fiscal": {
    "origem": "NACIONAL",
    "tipo_produto": "PRODUTO_ACABADO",
    "ncm": {
      "id": 617762,
      "codigo": "19022000",
      "descricao": "Massas aliments.recheadas"
    },
    "cest": {},
    "unidade_medida": { "id": 51617379, "descricao": "PT" }
  },
  "pesos_dimensoes": {
    "peso_liquido": 1.25,
    "peso_bruto": 1.35
  },
  "url_imagem": "https://...",
  "ultima_atualizacao": "2026-01-20T10:51:05.706929Z"
}
```

> ⚠️ **Campos críticos:**
> - `estoque.valor_venda` — **Preço está dentro do objeto `estoque`**, não na raiz
> - `estoque.custo_medio` — **Custo está dentro de `estoque`**, não na raiz
> - `estoque.minimumStock` — **camelCase!** (não `estoque_minimo`)
> - `url_imagem` — adicionado em Dez/2025 para download de imagens

---

### POST /v1/produtos — Criar Produto

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/produtos' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{...}'
```

```json
{
  "nome": "Nome do Produto",
  "codigo_sku": "SKU123",
  "codigo_ean": "EAN123",
  "valor_venda": 100.00,
  "ativo": true,
  "unidade_medida": { "id": 51617379 },
  "categoria": { "id": 61589260 },
  "fiscal": {
    "ncm": { "id": 617762 },
    "cest": { "id": 1 },
    "origem": "NACIONAL",
    "tipo_produto": "MERCADORIA_PARA_REVENDA"
  },
  "estoque": {
    "estoque_disponivel": 50,
    "estoque_minimo": 10
  },
  "pesos_dimensoes": {
    "peso_liquido": 1.0,
    "peso_bruto": 1.1
  }
}
```

> ⚠️ IDs de NCM, Categoria e Unidade devem ser buscados previamente nos endpoints auxiliares. Não é possível enviar strings diretamente.

---

### PATCH /v1/produtos/{id} — Atualizar Produto (Parcial)
Atualiza apenas os campos enviados (nome, EAN, SKU, NCM, peso, valor_venda, unidade_medida, etc.).

```bash
curl -X PATCH 'https://api-v2.contaazul.com/v1/produtos/UUID-DO-PRODUTO' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "valor_venda": 59.90, "nome": "Novo Nome" }'
```

---

### DELETE /v1/produtos/{id} — Deletar Produto

```bash
curl -X DELETE 'https://api-v2.contaazul.com/v1/produtos/UUID-DO-PRODUTO' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### Endpoints Auxiliares de Produtos (Cadastros Básicos)

| Endpoint | Descrição | Filtros |
|----------|-----------|---------|
| `GET /v1/produtos/categorias` | Categorias de produto | `busca_textual`, `pagina`, `tamanho_pagina` |
| `GET /v1/produtos/unidades-medida` | Unidades de medida | `busca_textual` |
| `GET /v1/produtos/ncm` | Códigos NCM fiscais | `busca_textual` (por código ou descrição) |
| `GET /v1/produtos/cest` | Códigos CEST fiscais | `busca_textual` |
| `GET /v1/produtos/ecommerce-categorias` | Categorias e-commerce | `descricao` |
| `GET /v1/produtos/ecommerce-marcas` | Marcas e-commerce | `nome`, `pagina` |

```bash
# Exemplo: buscar unidades de medida
curl -X GET 'https://api-v2.contaazul.com/v1/produtos/unidades-medida?busca_textual=PT' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

## 🛒 VENDAS

**Base URL:** `https://api-v2.contaazul.com/v1/venda`

> ⚠️ **CRÍTICO [FEV/2026]:** Use **exclusivamente** `api-v2.contaazul.com`. A antiga `api.contaazul.com` rejeita os novos tokens Cognito com `401 Unauthorized`.

---

### GET /v1/venda/vendedores — Listar Vendedores

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/venda/vendedores' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

#### Resposta (200)
```json
[
  {
    "id": "cd3dff75-91e1-4284-8d20-f933b7ae31e3",
    "nome": "Clarkson Neitzel",
    "id_legado": null
  }
]
```

---

### GET /v1/venda/proximo-numero — Próximo Número de Venda

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/venda/proximo-numero' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

> ⚠️ Pode retornar texto puro (não JSON). Trate com `Number(response.body)` antes de `JSON.parse`.

---

### GET /v1/venda/busca — Listar Vendas por Filtro

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `pagina` | integer | Página |
| `tamanho_pagina` | integer | Itens por página |
| `data_inicio` | string | Data início da emissão (`YYYY-MM-DD`) |
| `data_fim` | string | Data fim da emissão (`YYYY-MM-DD`) |
| `data_criacao_de` | string | Data criação de (`YYYY-MM-DD`) |
| `data_criacao_ate` | string | Data criação até (`YYYY-MM-DD`) |
| `data_alteracao_de` | string | Data alteração de (ISO, SP/GMT-3) — adicionado Nov/2025 |
| `data_alteracao_ate` | string | Data alteração até (ISO, SP/GMT-3) |
| `termo_busca` | string | Busca por nome/email do cliente ou número da venda |
| `ids_vendedores` | array | IDs dos vendedores |
| `ids_clientes` | array | IDs dos clientes |
| `ids_produtos` | array | IDs dos produtos |
| `ids_categorias` | array | IDs das categorias |
| `ids_natureza_operacao` | array | IDs da natureza de operação |
| `numeros` | array | Números das vendas |
| `situacoes` | array | Situações das vendas |
| `tipos` | array | Tipos de venda (`SALE`, `SCHEDULED_SALE`, `SALE_PROPOSAL`) |
| `origens` | array | Origens das vendas |
| `pendente` | boolean | Somente vendas pendentes |
| `campo_ordenado_ascendente` | string | `NUMERO`, `CLIENTE`, `DATA` |
| `campo_ordenado_descendente` | string | `NUMERO`, `CLIENTE`, `DATA` |

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/venda/busca?pagina=1&tamanho_pagina=50&data_alteracao_de=2026-01-01T00:00:00&data_alteracao_ate=2026-01-31T23:59:59' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

> ⚠️ A resposta devolve as vendas em **`response.data.itens`** (array). **Nunca** leia `response.data` diretamente!

---

### GET /v1/venda/{id} — Buscar Venda por ID

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/venda/UUID-DA-VENDA' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/venda/{id_venda}/itens — Itens de uma Venda

| Parâmetro | Tipo | Valores aceitos |
|-----------|------|-----------------|
| `tamanho_pagina` | integer | `10, 20, 50, 100, 200, 500, 1000` |

Retorna também o campo `id_centro_custo` por item (adicionado Fev/2026).

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/venda/UUID-DA-VENDA/itens?tamanho_pagina=100' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/venda/{id}/imprimir — PDF de uma Venda

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/venda/UUID-DA-VENDA/imprimir' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### POST /v1/venda — Criar Nova Venda

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/venda' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{...}'
```

#### Payload Completo
```json
{
  "id_cliente": "UUID-DO-CLIENTE",
  "numero": 12345,
  "situacao": "APROVADO",
  "data_venda": "2025-03-15",
  "id_categoria": "UUID-CATEGORIA",
  "id_centro_custo": "UUID-CENTRO-CUSTO",
  "id_vendedor": "UUID-DO-VENDEDOR",
  "observacoes": "Texto livre sobre a venda",
  "observacoes_pagamento": "Observações sobre o pagamento",
  "itens": [
    {
      "id": "UUID-DO-PRODUTO",
      "descricao": "Nome do produto / obs",
      "quantidade": 10.5,
      "valor": 15.90,
      "valor_custo": 10.00,
      "tipo": "PRODUTO"
    }
  ],
  "composicao_de_valor": {
    "frete": 10.00,
    "desconto": {
      "tipo": "PORCENTAGEM",
      "valor": 5
    }
  },
  "condicao_pagamento": {
    "tipo_pagamento": "BOLETO_BANCARIO",
    "id_conta_financeira": "UUID-CONTA",
    "opcao_condicao_pagamento": "7, 14",
    "nsu": "1234567890",
    "parcelas": [
      {
        "data_vencimento": "2025-04-15",
        "valor": 166.95,
        "descricao": "Venda 12345"
      }
    ]
  }
}
```

#### Valores aceitos para `tipo_pagamento`
`BOLETO_BANCARIO`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `CARTEIRA_DIGITAL`, `CASHBACK`, `CHEQUE`, `CREDITO_LOJA`, `CREDITO_VIRTUAL`, `DEPOSITO_BANCARIO`, `DINHEIRO`, `OUTRO`, `DEBITO_AUTOMATICO`, `CARTAO_CREDITO_VIA_LINK`, `PIX_PAGAMENTO_INSTANTANEO`, `PIX_COBRANCA`, `PROGRAMA_FIDELIDADE`, `SEM_PAGAMENTO`, `TRANSFERENCIA_BANCARIA`, `VALE_ALIMENTACAO`, `VALE_COMBUSTIVEL`, `VALE_PRESENTE`, `VALE_REFEICAO`

#### Valores aceitos para `situacao`
`EM_ANDAMENTO`, `APROVADO`

> ⚠️ **Limitações Fiscais:** A API `POST /v1/venda` foca apenas na criação do pedido de venda. **Não suporta** envio de Natureza de Operação (CFOP) nem dados de transportadora/frete logístico. O faturamento da NF-e ocorre dentro do painel CA.

> ✅ **Padrão validado no App Hardt (Mar/2026):** para boleto parcelado, `opcao_condicao_pagamento` aceita lista de dias (`"7, 14"`) e as parcelas devem ser enviadas com `data_vencimento` individual por parcela.

> ⚠️ **Natureza de Operação no Hardt:** enviar em 2 etapas — primeiro `POST /v1/venda`, depois `PUT /v1/venda/{id}` com `id_natureza_operacao` (CNPJ/CPF). Incluir `id_natureza_operacao` no POST não está surtindo efeito no cenário atual.

#### Fluxo de Sincronização (App Hardt)
| Status Local | Descrição |
|---|---|
| `ABERTO` | Pedido rascunho/bloqueado. Vendedor pode alterar |
| `ENVIAR` | Finalizado pelo vendedor, pronto para envio |
| `SINCRONIZANDO` | Worker pegou o pedido, processando com CA |
| `RECEBIDO` | Processado com sucesso. Temos `id_venda_contaazul`. Intocável |
| `ERRO` | Falha no envio. Mensagem em `erro_envio` |

**Prevenção de duplicidade:**
1. Se já tem `id_venda_contaazul`: verifica via `GET /v1/venda/{id}` se existe no CA
2. Se não tem ID mas tem `numero`: busca via `GET /v1/venda/busca?numeros={numero}`
3. Se não existe no CA: gera novo número via `GET /v1/venda/proximo-numero` e dispara `POST /v1/venda`

---

### PUT /v1/venda/{id} — Atualizar Venda

```bash
curl -X PUT 'https://api-v2.contaazul.com/v1/venda/UUID-DA-VENDA' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ ...payload_completo... }'
```

---

### POST /v1/venda/exclusao-lote — Excluir Vendas em Lote

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/venda/exclusao-lote' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "ids": ["UUID-1", "UUID-2"] }'
```

---

### Vendedores — Estratégia de Sincronização (App Hardt)

Campos extendidos no banco local (não existem na API CA):

| Campo | Descrição |
|-------|-----------|
| `email` | E-mail de login/contato |
| `flex_mensal` | Limite de desconto mensal (R$) |
| `flex_disponivel` | Saldo atual de desconto disponível (R$) |
| `login` | Nome de usuário para acesso ao App |
| `senha` | Hash da senha de acesso ao App |
| `permissoes` | JSON de controle granular de acesso |

**Fluxo upsert:**
- `where: { contaAzulId: api.id }`
- `update: { nome: api.nome, id_legado: api.id_legado ?? null }`
- `create: { contaAzulId: api.id, nome: api.nome, id_legado: api.id_legado ?? null }`
- **NUNCA** sobrescrever `email` ou `flex_*` com null durante update

---

## 💰 FINANCEIRO

**Base URL:** `https://api-v2.contaazul.com`

### Endpoints Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/v1/centro-de-custo` | Listar centros de custo por filtro |
| `POST` | `/v1/centro-de-custo` | Criar novo centro de custo |
| `GET` | `/v1/categorias` | Listar categorias financeiras |
| `GET` | `/v1/financeiro/categorias-dre` | Listar estrutura DRE |
| `GET` | `/v1/conta-financeira` | Listar contas financeiras |
| `GET` | `/v1/conta-financeira/{id}/saldo-atual` | Saldo atual de uma conta financeira |
| `GET` | `/v1/financeiro/eventos-financeiros/{id_evento}/parcelas` | Parcelas por evento financeiro |
| `GET` | `/v1/financeiro/eventos-financeiros/parcelas/{id}` | Parcela por ID (inclui `codigo_referencia`, rateio, centros de custo, categoria, renegociação) |
| `PATCH` | `/v1/financeiro/eventos-financeiros/parcelas/{id}` | Atualizar parcela (parcial) |
| `POST` | `/v1/financeiro/eventos-financeiros/contas-a-receber` | Criar conta a receber |
| `GET` | `/v1/financeiro/eventos-financeiros/contas-a-receber/buscar` | Buscar receitas por filtro |
| `POST` | `/v1/financeiro/eventos-financeiros/contas-a-receber/gerar-cobranca` | Gerar cobrança (suporta `maximo_parcelas`) |
| `POST` | `/v1/financeiro/eventos-financeiros/contas-a-pagar` | Criar conta a pagar |
| `GET` | `/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar` | Buscar despesas por filtro |
| `GET` | `/v1/financeiro/eventos-financeiros/alteracoes` | IDs de eventos financeiros alterados em um período |
| `GET` | `/v1/financeiro/eventos-financeiros/saldo-inicial` | Saldos iniciais das contas financeiras por período |
| `GET` | `/v1/financeiro/transferencias` | Transferências por período (adicionado Mar/2026) |

---

### GET /v1/conta-financeira — Listar Contas Financeiras

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/conta-financeira' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/conta-financeira/{id}/saldo-atual — Saldo da Conta

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/conta-financeira/UUID-DA-CONTA/saldo-atual' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

> Adicionado em Out/2025 para monitoramento em tempo real.

---

### GET /v1/financeiro/eventos-financeiros/contas-a-receber/buscar — Buscar Receitas

| Parâmetro | Tipo | Obrig.? | Descrição |
|-----------|------|---------|-----------|
| `pagina` | integer | **Sim** | Página |
| `tamanho_pagina` | integer | **Sim** | Itens por página |
| `data_vencimento_de` | string | **Sim** | ISO date (`YYYY-MM-DD`) |
| `data_vencimento_ate` | string | **Sim** | ISO date (`YYYY-MM-DD`) |
| `data_competencia_de` | string | Não | ISO date |
| `data_competencia_ate` | string | Não | ISO date |
| `data_pagamento_de` | string | Não | ISO date |
| `data_pagamento_ate` | string | Não | ISO date |
| `data_alteracao_de` | string | Não | ISO (SP/GMT-3) — adicionado Out/2025 |
| `data_alteracao_ate` | string | Não | ISO (SP/GMT-3) |
| `valor_de` | string | Não | Valor mínimo |
| `valor_ate` | string | Não | Valor máximo |
| `status` | array | Não | `PERDIDO`, `RECEBIDO`, `EM_ABERTO`, `RENEGOCIADO`, `RECEBIDO_PARCIAL`, `ATRASADO` |
| `ids_contas_financeiras` | array | Não | IDs de contas financeiras |
| `ids_categorias` | array | Não | IDs de categorias |
| `ids_centros_de_custo` | array | Não | IDs de centros de custo |
| `ids_clientes` | array | Não | IDs de clientes (adicionado Fev/2026) |
| `descricao` | string | Não | Descrição da conta |

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?pagina=1&tamanho_pagina=50&data_vencimento_de=2025-01-01&data_vencimento_ate=2025-12-31' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/financeiro/eventos-financeiros/contas-a-pagar/buscar — Buscar Despesas

Mesmos parâmetros das Receitas, com `descricao` como "Pagamento do salário".

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=1&tamanho_pagina=50&data_vencimento_de=2025-01-01&data_vencimento_ate=2025-12-31' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

#### Resposta das Despesas (200)
```json
{
  "itens_totais": 6,
  "itens": [
    {
      "id": "c6a28b6e-efe4-11ee-8ef8-8b86c5251537",
      "descricao": "Aluguel do escritório",
      "data_vencimento": "2027-08-15",
      "status_traduzido": "ATRASADO",
      "total": 781201.79,
      "nao_pago": 213023.79,
      "pago": 0,
      "data_criacao": "2027-08-15T14:30:00Z",
      "data_alteracao": "2027-08-15T14:30:00Z",
      "data_competencia": "2018-03-16",
      "categorias": [
        { "id": "b134ec6b-...", "nome": "Adiantamento Salarial" }
      ],
      "centros_custo": [
        { "id": "428389c6-...", "nome": "Centro de custo de Teste" }
      ],
      "fornecedor": { "nome": "Maria da Silva" }
    }
  ],
  "totais": { "ativo": 6, "inativo": 0, "todos": 6 }
}
```

---

### POST /v1/financeiro/eventos-financeiros/contas-a-receber — Criar Conta a Receber

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{...}'
```

```json
{
  "data_competencia": "2024-07-15",
  "valor": 500.00,
  "observacao": "Pagamento de serviço",
  "descricao": "Prestação de serviço",
  "contato": "UUID-DO-CLIENTE",
  "conta_financeira": "UUID-DA-CONTA-FINANCEIRA",
  "rateio": [
    {
      "id_categoria": "UUID-DA-CATEGORIA",
      "valor": 500.00,
      "rateio_centro_custo": [
        {
          "id_centro_custo": "UUID-DO-CENTRO-CUSTO",
          "valor": 500.00
        }
      ]
    }
  ],
  "condicao_pagamento": {
    "parcelas": [
      {
        "descricao": "Parcela 1",
        "data_vencimento": "2024-08-15",
        "nota": "Pagamento via PIX",
        "conta_financeira": "UUID-DA-CONTA-FINANCEIRA",
        "detalhe_valor": {
          "valor_bruto": 500.00,
          "valor_liquido": 497.90,
          "desconto": 0,
          "juros": 0,
          "multa": 0,
          "taxa": 2.10
        }
      }
    ]
  }
}
```

#### Resposta (202 — processamento assíncrono)
```json
{
  "protocolId": "UUID-DO-PROTOCOLO",
  "status": "PENDING",
  "createdAt": "2024-10-22T14:30:00Z"
}
```

> Status possíveis do protocolo: `PENDING`, `SUCCESS`, `ERROR`

---

### POST /v1/financeiro/eventos-financeiros/contas-a-pagar — Criar Conta a Pagar

Mesmo payload da conta a receber. Substitua `contato` pelo UUID do fornecedor.

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ ...mesmo_payload_de_receber... }'
```

---

### GET /v1/financeiro/eventos-financeiros/parcelas/{id} — Parcela por ID

Retorna rateio, centros de custo, categoria financeira, objeto de renegociação e `codigo_referencia`.

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/UUID-DA-PARCELA' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

**Todos os status possíveis de parcela:**

| Status | Descrição |
|--------|-----------|
| `EM_ABERTO` | Ainda não vencida e não paga |
| `ATRASADO` | Vencida sem pagamento |
| `RECEBIDO` | Paga integralmente |
| `RECEBIDO_PARCIAL` | Paga parcialmente |
| `RENEGOCIADO` | Parcela substituída por renegociação |
| `PERDIDO` | Baixada como perda/inadimplência definitiva |

> **`codigo_referencia`** (adicionado Abr/2026): campo retornado na parcela por ID para facilitar conciliação bancária — identifica o título correspondente no banco.
> **Objeto `renegociacao`** (adicionado Nov/2025): presente quando `status = RENEGOCIADO`, contém dados da parcela que substituiu esta.
> **App Hardt:** usa status `['EM_ABERTO', 'ATRASADO', 'RECEBIDO', 'RECEBIDO_PARCIAL']` na busca de parcelas. `RENEGOCIADO` e `PERDIDO` não estão incluídos — parcelas nesses status ficam invisíveis para o app (decisão intencional).

---

### PATCH /v1/financeiro/eventos-financeiros/parcelas/{id} — Atualizar Parcela

```bash
curl -X PATCH 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/UUID-DA-PARCELA' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "data_vencimento": "2025-05-10",
    "valor": 150.00,
    "observacoes": "Ajuste de vencimento"
  }'
```

---

### GET /v1/financeiro/eventos-financeiros/alteracoes — IDs de Eventos Alterados

Retorna os IDs dos eventos financeiros modificados em um período. Útil para sync incremental eficiente sem buscar todas as parcelas.

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/alteracoes?data_de=2026-04-01&data_ate=2026-04-28' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

> Adicionado Mar/2026.

---

### GET /v1/financeiro/eventos-financeiros/saldo-inicial — Saldos Iniciais

Retorna os saldos iniciais das contas financeiras em um período definido por data de início e fim.

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/saldo-inicial?data_de=2026-01-01&data_ate=2026-04-28' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

> Adicionado Abr/2026.

---

### GET /v1/categorias — Listar Categorias Financeiras

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/categorias?pagina=1&tamanho_pagina=50' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/financeiro/categorias-dre — Estrutura DRE

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/financeiro/categorias-dre' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

> Adicionado Out/2025 para listar categorias da Demonstração do Resultado do Exercício (DRE).

---

### GET /v1/centro-de-custo — Listar Centros de Custo

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `pagina` | integer | Página |
| `tamanho_pagina` | integer | Itens por página |
| `busca` | string | Busca textual |
| `status` | string | `ativo`, `inativo`, `todos` |
| `campo_ordenado_ascendente` | string | `ID`, `CODIGO`, `NOME`, `ATIVO` |
| `campo_ordenado_descendente` | string | `ID`, `CODIGO`, `NOME`, `ATIVO` |

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/centro-de-custo?pagina=1&tamanho_pagina=50' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### POST /v1/centro-de-custo — Criar Centro de Custo

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/centro-de-custo' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "codigo": "CC001", "nome": "Comercial" }'
```

---

### Contas Financeiras Fixas (App Hardt)

IDs reais no Conta Azul que devem ser preservados (Seeds):

| Nome | Tipo | ID (UUID Conta Azul) |
|------|------|---------------------|
| Caixinha | `DINHEIRO` | `1dc7f96e-7658-4e0c-8d0a-5c5980234c90` |
| Conta Azul (Boleto) | `BOLETO_BANCARIO` | `ed4798c2-f8e3-4e87-9ff3-8f264dcf6aa0` |
| Acredicoop | `BOLETO_BANCARIO` | `dc83b583-4a49-47c4-b238-c7d14ab77d5f` |
| Sicoob | `BOLETO_BANCARIO` | `f756dd56-4946-493e-9343-0a2e2fdfe681` |

---

## 🧾 NOTAS FISCAIS

**Base URL:** `https://api-v2.contaazul.com/v1/notas-fiscais`

> A API de NF é somente **consulta** — não é possível emitir NFs pela API. A emissão ocorre dentro do painel Conta Azul.

---

### GET /v1/notas-fiscais — Listar NF-e por Filtro

Retorna somente NF-e com status **EMITIDA** e **CORRIGIDA COM SUCESSO**.

| Parâmetro | Descrição |
|-----------|-----------|
| `data_inicio` | Data inicial de emissão |
| `data_fim` | Data final de emissão |
| `numero_nota` | Número da nota |
| `id_venda` | ID da venda associada (adicionado Nov/2025) |
| `ids` | IDs (UUID) das NF-e |

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/notas-fiscais?data_inicio=2025-01-01&data_fim=2025-12-31' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/notas-fiscais/{chave} — NF-e por Chave de Acesso

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/notas-fiscais/CHAVE_ACESSO_NF' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/notas-fiscais-servico — Listar NFS-e por Filtro

Retorna NFS-e com todos os status possíveis a partir da emissão.

| Parâmetro | Descrição |
|-----------|-----------|
| `data_inicio` | Data inicial |
| `data_fim` | Data final |
| `numero_nota` | Número da nota |
| `id_venda` | ID da venda associada |
| `ids` | IDs (UUID) das NFS-e (adicionado Fev/2026) |

```bash
curl -X GET \
  'https://api-v2.contaazul.com/v1/notas-fiscais-servico?data_inicio=2025-01-01&data_fim=2025-12-31' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### POST /v1/notas-fiscais/vinculo-mdfe — Vincular NF a MDF-e

Associa notas fiscais (pelas chaves de acesso) a um MDF-e logístico.

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/notas-fiscais/vinculo-mdfe' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "chaves_acesso": ["CHAVE_1", "CHAVE_2"],
    "status": "AUTORIZADO"
  }'
```

> Status aceitos: `AUTORIZADO`, `ENCERRADO`, `CANCELADO`

---

## 📑 CONTRATOS (Vendas Recorrentes)

**Base URL:** `https://api-v2.contaazul.com/v1/contratos`

> Contratos geram vendas automaticamente conforme a periodicidade configurada (`SCHEDULED_SALE`).

---

### GET /v1/contratos — Listar Contratos por Filtro

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/contratos?pagina=1&tamanho_pagina=50' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

---

### GET /v1/contratos/proximo-numero — Próximo Número de Contrato

```bash
curl -X GET 'https://api-v2.contaazul.com/v1/contratos/proximo-numero' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

> Adicionado Nov/2025 para criação automatizada de contratos.

---

### POST /v1/contratos — Criar Novo Contrato

```bash
curl -X POST 'https://api-v2.contaazul.com/v1/contratos' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "id_cliente": "UUID-DO-CLIENTE",
    "numero": 1,
    "itens": [...],
    "condicao_pagamento": {...}
  }'
```

---

## 📋 ERROS COMUNS

| Erro | Causa | Solução |
|------|-------|---------|
| `invalid_grant` | Código de autorização já usado, expirado ou redirect_uri incorreto | Use o código imediatamente (validade: 3 min). Verifique redirect_uri e client_id |
| `401 Unauthorized` | Token ausente, inválido ou expirado | Use `refresh_token` para renovar. No App: `_axiosGet` faz isso automaticamente |
| `429 Too Many Requests` | Rate limit excedido (600/min ou 10/seg) | Implemente backoff exponencial + cache de dados |
| `500 Internal Server Error` | Erro no servidor CA ou payload malformado | Verifique o JSON, tente novamente após alguns segundos |

---

## 📈 CHANGELOG RESUMIDO (últimas versões)

| Versão | Data | O que mudou |
|--------|------|-------------|
| Abr/2026 | 2026-04-24 | Gerar cobrança: campo `maximo_parcelas` no body (`POST /v1/financeiro/eventos-financeiros/contas-a-receber/gerar-cobranca`) |
| Abr/2026 | 2026-04-17 | Contratos: parâmetros `tipo_pagamento` e `status` no filtro; objeto `conta_financeira`, objeto `termos` (data_fim, tipo_expiracao, vigencia_atual, vigencia_total), campos `tipo_pagamento`, `total` e `total_proximo_vencimento` no retorno; novo endpoint `POST /v1/contratos/{id}/encerrar`; novo endpoint `DELETE /v1/contratos/{id}` |
| Abr/2026 | 2026-04-16 | Contratos: novo endpoint `GET /v1/contratos/{id}` |
| Abr/2026 | 2026-04-06 | Parcelas: campo `codigo_referencia` no retorno de `GET /v1/financeiro/eventos-financeiros/parcelas/{id}` — facilita conciliação bancária |
| Abr/2026 | 2026-04-01 | Novo endpoint: `GET /v1/financeiro/eventos-financeiros/saldo-inicial` — saldos iniciais das contas financeiras por período |
| Mar/2026 | 2026-03-31 | Novo endpoint: `GET /v1/financeiro/eventos-financeiros/alteracoes` — IDs de eventos financeiros alterados em período (sync incremental eficiente) |
| Mar/2026 | 2026-03-24 | Novo endpoint: `GET /v1/pessoas/conta-conectada` — dados cadastrais da empresa vinculada à integração |
| Mar/2026 | 2026-03-18 | Vendas: suporte a criação e alteração de itens do tipo **kit** (`POST /v1/venda` e `PUT /v1/venda/{id}`) |
| Mar/2026 | 2026-03-12 | Pessoas: campo `contato_cobranca_faturamento` em atualizar (`PUT` e `PATCH /v1/pessoas/{id}`) |
| Mar/2026 | 2026-03-11 | Pessoas: campo `contato_cobranca_faturamento` no retorno de `GET /v1/pessoas/{id}` e `GET /v1/pessoas/legacyid/{id}` |
| Mar/2026 | 2026-03-10 | Pessoas: filtro `data_alteracao_de/ate` passa a exigir **intervalo máximo de 365 dias** |
| Mar/2026 | 2026-03-06 | Pessoas: campo `contato_cobranca_faturamento` em criar (`POST /v1/pessoas`); novo endpoint `GET /v1/financeiro/transferencias` — transferências por período |
| Mar/2026 | 2026-03-05 | Receitas, Despesas e Vendas: filtro `data_alteracao_de/ate` passa a exigir **intervalo máximo de 365 dias** |
| Fev/2026 | 2026-02-23 | Itens de venda: campo `id_centro_custo` no retorno; `tamanho_pagina` válido: `10, 20, 50, 100, 200, 500, 1000` |
| Fev/2026 | 2026-02-18 | Produtos: campo `url_imagem` no retorno de `GET /v1/produtos/{id}` |
| Fev/2026 | 2026-02-13 | Receitas: filtro `ids_clientes` adicionado; campos `data_competencia`, `centros_de_custo`, `categorias` no retorno de receitas e despesas |
| Jan/2026 | 2026-01-29 | NFS-e: filtro e retorno por `ids`; Vendas: `tipo_pagamento` PIX padronizado como `PIX_PAGAMENTO_INSTANTANEO` (antes era `PAGAMENTO_INSTANTANEO`) |
| Jan/2026 | 2026-01-14 | Vendas: campo `id_contrato` no retorno das vendas por filtro; objeto `contrato` no retorno de `GET /v1/venda/{id}` |
| Dez/2025 | 2025-12-18 | Novo endpoint: NFS-e por filtro (`GET /v1/notas-fiscais-servico`) |
| Dez/2025 | 2025-12-02 | Canal de suporte migrado para Portal do Desenvolvedor (email api@contaazul.com descontinuado) |
| Nov/2025 | 2025-11-19 | Rate limit: **600/min e 10/seg por conta conectada do ERP** (antes era por aplicação) |
| Nov/2025 | 2025-11-14 | NF-e: filtro por `id_venda` |
| Nov/2025 | 2025-11-12 | Produtos: novos filtros `sku`, `data_alteracao_de`, `data_alteracao_ate` |
| Nov/2025 | 2025-11-11 | Contratos: endpoint `GET /v1/contratos/proximo-numero` |
| Nov/2025 | 2025-11-07 | Parcelas: todos os status mapeados (`EM_ABERTO`, `ATRASADO`, `RECEBIDO`, `RECEBIDO_PARCIAL`, `RENEGOCIADO`, `PERDIDO`); objeto `renegociacao` nas parcelas |
| Nov/2025 | 2025-11-05 | Pessoas: filtro por `data_alteracao_de/ate` (adicionado, mas intervalo máx. 365d imposto em Mar/2026) |
| Nov/2025 | 2025-11-04 | Vendas: filtro por `data_alteracao_de/ate` |
| Out/2025 | 2025-10-23 | Receitas/Despesas: filtro por `data_alteracao_de/ate`; Itens de venda: campo `valor_custo` no retorno |
| Out/2025 | 2025-10-10 | Saldo de conta financeira: `GET /v1/conta-financeira/{id}/saldo-atual`; Categorias DRE: `GET /v1/financeiro/categorias-dre` |
| Ago/2025 | 2025-08-27 | Parcelas: retorna rateio, centros de custo e categoria financeira |
