---
name: contaazul-produtos
description: Documentação detalhada da API de Produtos do Conta Azul (v1), incluindo consultas, criação e manipulação.
---

# Conta Azul API - Módulo de Produtos

Este documento descreve os endpoints disponíveis para integração com o módulo de produtos do Conta Azul, conforme documentação oficial fornecida em Fev/2026.

## Autenticação

Todos os endpoints requerem autenticação via OAuth 2.0.
Header: `Authorization: Bearer <access_token>`

## Base URL
Observação: A documentação faz referência a `https://api-v2.contaazul.com`, mas endpoints legados podem usar `https://api.contaazul.com`. Verificar em produção.

---

## 1. Listar Produtos

Retorna a lista de produtos com suporte a diversos filtros.

**Endpoint:** `GET /v1/produtos`

### Parâmetros de Consulta (Query Params)

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `pagina` | integer | Número da página (inicia em 1?) |
| `tamanho_pagina` | integer | Itens por página |
| `busca` | string | Busca textual (Nome, EAN, SKU) |
| `status` | string | `ATIVO` ou `INATIVO` |
| `sku` | string | Filtro exato por SKU |
| `data_alteracao_de` | string | ISO 8601 (Data inicial de alteração) |
| `data_alteracao_ate` | string | ISO 8601 (Data final de alteração) |
| `integracao_ecommerce_ativo` | boolean | Filtrar integrados via e-commerce |
| `produtos_kit_ativo` | boolean | Filtrar kits |
| `valor_venda_inicial` | number | Range de preço inicial |
| `valor_venda_final` | number | Range de preço final |
| `campo_ordenacao` | string | Campo para ordenar |
| `direcao_ordenacao` | string | `ASC` ou `DESC` |

### Exemplo de Resposta (Lista - API v2)

**⚠️ IMPORTANTE:** A listagem retorna estrutura simplificada. Para dados completos (estoque, custos), use o endpoint de detalhes.

```json
{
  "items": [
    {
      "id": "030bfa5e-e7b4-434d-aaab-bd1833056c74",
      "nome": "1-G-COXINHA TRADICIONAL FRANGO C/20 130GR",
      "codigo_sku": "3059",
      "codigo_ean": "7898620330224",
      "status": "ATIVO",
      "categoria": {
        "id": 61589260,
        "descricao": "Produto Acabado",
        "uuid": "b96ad226-588e-49b2-bdc7-9c97d97ffa22"
      },
      "ultima_atualizacao": "2026-01-20T10:51:05.706929Z"  // ⚠️ CRÍTICO para sync incremental
    }
  ],
  "totalItems": 232
}
```

**Campos Críticos:**
- `ultima_atualizacao`: Timestamp ISO 8601 - **OBRIGATÓRIO** para sincronização incremental
- `categoria`: Objeto aninhado (não string)
- `status`: String "ATIVO" ou "INATIVO"


---

## 2. Consultar um Produto (Detalhes)

Retorna todos os dados de um produto específico.

**Endpoint:** `GET /v1/produtos/{id}`

### Estrutura Real da Resposta (API v2)

```json
{
  "id": "030bfa5e-e7b4-434d-aaab-bd1833056c74",
  "id_legado": 462908994,
  "ativo": true,
  "versao": 2,
  "nome": "1-G-COXINHA TRADICIONAL FRANGO C/20 130GR",
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
    "minimumStock": 180,        // ⚠️ camelCase, não snake_case!
    "valor_venda": 54.5,        // ⚠️ Preço está DENTRO de estoque
    "custo_medio": 3.35         // ⚠️ Custo está DENTRO de estoque
  },
  "fiscal": {
    "origem": "NACIONAL",
    "tipo_produto": "PRODUTO_ACABADO",
    "ncm": {
      "id": 617762,
      "codigo": "19022000",     // ⚠️ Código NCM para sincronização
      "descricao": "Massas aliments.recheadas,incl.cozidas, prepars.out.modo"
    },
    "cest": {},
    "unidade_medida": {
      "id": 51617379,
      "descricao": "PT"
    }
  },
  "unidade_medida": {},         // Pode estar vazio
  "pesos_dimensoes": {
    "peso_liquido": 1.25,
    "peso_bruto": 1.35
  },
  "ecommerce": {
    "condicao": "NOVO",
    "marca": {},
    "categoria_ecommerce": {}
  },
  "variacao": {},
  "detalhe_kit": {},
  "ultima_atualizacao": "2026-01-20T10:51:05.706929Z"
}
```

### ⚠️ Campos Críticos para Sincronização

| Campo | Localização | Tipo | Observação |
|-------|-------------|------|------------|
| `estoque.valor_venda` | `estoque` object | Decimal | **Preço está dentro de estoque, não na raiz** |
| `estoque.custo_medio` | `estoque` object | Decimal | **Custo está dentro de estoque, não na raiz** |
| `estoque.minimumStock` | `estoque` object | Decimal | **camelCase!** Não `estoque_minimo` |
| `fiscal.ncm.codigo` | `fiscal.ncm` object | String | Código NCM (ex: "19022000") |
| `fiscal.unidade_medida.descricao` | `fiscal.unidade_medida` object | String | Unidade (ex: "PT", "UN", "KG") |
| `ultima_atualizacao` | Raiz | ISO 8601 | **Essencial para sync incremental** |

---

## 3. Criar Produto

**Endpoint:** `POST /v1/produtos`
**Content-Type:** `application/json`

### Payload Exemplo

```json
{
  "nome": "Nome do Produto",
  "codigo_sku": "SKU123",
  "codigo_ean": "EAN123",
  "valor_venda": 100.00,
  "unidade_medida": { "id": 1 }, // Requer ID da unidade
  "categoria": { "id": 1 }, // Requer ID da categoria
  "fiscal": {
    "ncm": { "id": 1 }, // ID interno do NCM no Conta Azul
    "cest": { "id": 1 }, // ID interno do CEST
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
  },
  "ativo": true
}
```

---

## 4. Endpoints Auxiliares (Cadastros Básicos)

Para criar produtos, é necessário buscar os IDs de referência (NCM, Categoria, Unidade) nestes endpoints:

### Categorias de Produto
`GET /v1/produtos/categorias`
- Query: `busca_textual`, `pagina`, `tamanho_pagina`

### Unidades de Medida
`GET /v1/produtos/unidades-medida`
- Query: `busca_textual`
- Retorna: `id`, `descricao`, `abreviacao` (Ex: "UN", "KG")

### NCM (Fiscal)
`GET /v1/produtos/ncm`
- Query: `busca_textual` (por código ou descrição)
- Retorna: `id`, `codigo`, `descricao`

### CEST (Fiscal)
`GET /v1/produtos/cest`
- Query: `busca_textual`

---

## Dicas de Implementação

1. **Sincronização de Produtos**:
   - Usar `GET /v1/produtos` com filtro `data_alteracao_de` para buscar apenas diferenciais (delta sync).
   - Paginar usando `pagina` e `tamanho_pagina`.

2. **Criação de Produtos**:
   - O fluxo exige pré-consulta de IDs auxiliares (NCM, Unidade, Categoria). Não é possível enviar a string "UN", deve-se enviar o ID da unidade "UN".

3. **Variações (Grade)**:
   - Produtos com grade retornam no campo `variacao`.
