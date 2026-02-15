---
name: contaazul-vendedores
description: Documentação da API de Vendedores e Representantes da Conta Azul (v1)
---

# Conta Azul API - Vendedores

Guia para sincronização de Vendedores (Salespeople) da Conta Azul.

## 1. Visão Geral
A API de Vendedores permite listar os vendedores cadastrados para uso em vendas e emissão de notas.
No App Hardt, estes dados são enriquecidos com campos de controle de "Flex" (descontos permitidos).

## 2. Endpoints

### 2.1. Listar Vendedores
Retorna a lista de todos os vendedores ativos.

- **Método:** `GET`
- **URL:** `https://api-v2.contaazul.com/v1/venda/vendedores`
- **Autenticação:** Bearer Token (OAuth 2.0)

#### Exemplo de Requisição (cURL)
```bash
curl -i -X GET \
  https://api-v2.contaazul.com/v1/venda/vendedores \
  -H 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'
```

#### Exemplo de Resposta (Status 200)
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "nome": "João da Silva",
    "id_legado": 123456
  },
  {
    "id": "cd3dff75-91e1-4284-8d20-f933b7ae31e3",
    "nome": "Clarkson Neitzel",
    "id_legado": null
  }
]
```

### 2.2. Campos do Objeto Vendedor

| Campo       | Tipo   | Descrição                                      |
| :---------- | :----- | :--------------------------------------------- |
| `id`        | UUID   | Identificador único do vendedor no Conta Azul. |
| `nome`      | String | Nome de exibição do vendedor.                  |
| `id_legado` | Int/Str| Identificador numérico legado (pode ser null). |

---

## 3. Estratégia de Sincronização (App Hardt)

O App Hardt estende os dados do Conta Azul com campos locais de controle financeiro/comercial.

### 3.1. Campos Estendidos (Banco Local)
Ao sincronizar, o sistema deve:
1.  **Criar/Atualizar:** Inserir novos vendedores ou atualizar o nome dos existentes baseando-se no `id` (UUID).
2.  **Preservar:** Manter os dados locais que **não** existem na API:
    - `email`: E-mail de login/contato do vendedor.
    - `flex_mensal`: Limite de desconto mensal (R$).
    - `flex_disponivel`: Saldo atual de desconto disponível (R$).

### 3.2. Fluxo
1.  Busca lista completa na API (`GET /v1/venda/vendedores`).
2.  Itera sobre cada registro.
3.  Executa `upsert` no banco local:
    - `where: { contaAzulId: api.id }`
    - `update: { nome: api.nome, id_legado: api.id_legado ?? null }`
    - `create: { contaAzulId: api.id, nome: api.nome, id_legado: api.id_legado ?? null }`
4.  **Não** sobrescrever `email` ou `flex_*` com null durante o update.

## 4. Tratamento de Erros
- **401 Unauthorized:** Token expirado. Realizar refresh token e tentar novamente.
- **500 Internal Server Error:** Falha momentânea na CA. Tentar novamente mais tarde.
