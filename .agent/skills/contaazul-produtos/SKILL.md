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

### Exemplo de Resposta (Resumido)

```json
{
  "items": [
    {
      "id": "uuid",
      "nome": "Produto Exemplo",
      "codigo": "COD123",
      "ean": "789...",
      "valor_venda": 150.00,
      "saldo": 100, // Estoque atual
      "estoque_minimo": 10,
      "unidade_medida": "UN", // Objeto ou String? Doc diz objeto no create e string no list? Verificar.
      "status": "ATIVO",
      "ultima_atualizacao": "2025-07-10T15..."
    }
  ],
  "totalItems": 10
}
```

---

## 2. Consultar um Produto (Detalhes)

Retorna todos os dados de um produto específico.

**Endpoint:** `GET /v1/produtos/{id}`

### Dados Retornados Relevantes

- `id`, `nome`, `codigo_sku`, `codigo_ean`
- `valor_venda`, `custo_medio`
- `estoque`: { `quantidade_disponivel`, `quantidade_reservada`, `quantidade_total` }
- `fiscal`: { `ncm`, `cest`, `tipo_produto`, `origem` }
- `pesos_dimensoes`: { `peso_liquido`, `peso_bruto`, `largura`, `altura`, `profundidade` }
- `imagens`: Array de URLs/Objetos
- `variacao`: Se houver variações (grade)

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
