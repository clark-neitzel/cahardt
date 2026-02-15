---
name: contaazul-clientes
description: Documentação detalhada da API de Pessoas (Clientes), incluindo endpoints de listagem, criação, atualização, filtros e operações em lote.
---

# Conta Azul API - Pessoas (Clientes e Fornecedores)

Este guia cobre todos os endpoints relacionados ao cadastro de pessoas (Clientes, Fornecedores e Transportadoras) na Conta Azul.

## Base URL
`GET /v1/pessoas`

Todos os requests devem conter o header de autorização:
`Authorization: Bearer <access_token>`

> **ATENÇÃO:** O filtro de data (`data_alteracao_de` e `data_alteracao_ate`) exige ambos os campos e formato ISO sem milissegundos nem timezone Z (`YYYY-MM-DDTHH:mm:ss`), caso contrário retorna erro 500.

---

## 1. Listar Pessoas (Filtros)

**GET** `/v1/pessoas`

Permite consultar as pessoas cadastradas com suporte a diversos filtros.

### Query Parameters

| Parâmetro | Tipo | Obrigatório? | Descrição |
| :--- | :--- | :--- | :--- |
| `pagina` | integer | Sim | Número da página |
| `tamanho_pagina` | integer | Sim | Itens por página |
| `tipo_ordenacao` | string | Não | `nome`, `email`, `documento`, `ativo` |
| `ordem_ordenacao` | string | Não | `ASC`, `DESC` |
| `busca` | string | Não | Busca textual (documento ou nome) |
| `ids` | string | Não | IDs separado por vírgula |
| `documentos` | string | Não | CPF/CNPJ |
| `paises` | string | Não | Países |
| `cidades` | string | Não | Cidades |
| `ufs` | string | Não | Siglas de estados |
| `codigos_pessoa` | string | Não | Códigos internos de cadastro |
| `emails` | string | Não | Emails |
| `tipos_pessoa` | string | Não | `Fisica`, `Juridica`, `Estrangeira` |
| `nomes` | string | Não | Nomes |
| `telefones` | string | Não | Telefones |
| `data_criacao_inicio` | string | Não | Data inicial de criação |
| `data_criacao_fim` | string | Não | Data final de criação |
| `data_alteracao_de` | string | Não* | Data inicial alteração (ISO 8601, clean) |
| `data_alteracao_ate` | string | Não* | Data final alteração (Obrigatório se usar 'de') |
| `tipo_perfil` | string | **Sim** | **`Cliente`**, `Fornecedor`, `Transportadora` |
| `com_endereco` | boolean | Não | Retornar endereços no payload |

### Exemplo cURL
```bash
curl -i -X GET \
  'https://api-v2.contaazul.com/v1/pessoas?pagina=1&tamanho_pagina=10&tipo_perfil=Cliente&data_alteracao_de=2024-01-01T00:00:00&data_alteracao_ate=2024-01-31T23:59:59' \
  -H 'Authorization: YOUR_ACCESS_TOKEN'
```

---

## 2. Criar Nova Pessoa

**POST** `/v1/pessoas`

Permite cadastrar um novo cliente, fornecedor ou transportadora.

### Payload Exemplo (JSON)
```json
{
  "agencia_publica": false,
  "ativo": true,
  "cnpj": "12.345.678/0001-90",
  "codigo": "CLI001",
  "data_nascimento": "1990-01-01", // Obrigatório para PF
  "email": "cliente@email.com",
  "enderecos": [
    {
      "bairro": "Centro",
      "cep": "12345-678",
      "cidade": "São Paulo",
      "complemento": "Apto 45",
      "estado": "SP",
      "logradouro": "Rua das Flores",
      "numero": "123",
      "pais": "Brasil"
    }
  ],
  "inscricoes": [
    {
      "indicador_inscricao_estadual": "NAO CONTRIBUINTE",
      "inscricao_estadual": "ISENTO"
    }
  ],
  "nome": "João Silva",
  "nome_fantasia": "Empresa LTDA",
  "observacao": "Cliente preferencial",
  "optante_simples": false,
  "outros_contatos": [],
  "perfis": [
    {
      "tipo_perfil": "Cliente"
    }
  ],
  "tipo_pessoa": "Juridica" // ou "Fisica"
}
```

---

## 3. Atualizar Pessoa (Completo)

**PUT** `/v1/pessoas/{id}`

Substitui integralmente o cadastro. Todos os campos obrigatórios devem ser enviados novamente.

### Path Params
- `id`: UUID da pessoa.

---

## 4. Atualizar Pessoa (Parcial)

**PATCH** `/v1/pessoas/{id}`

Atualiza apenas os campos enviados no JSON. Ideal para correções pontuais.

### Payload Exemplo (JSON)
```json
{
  "email": "novo.email@dominio.com",
  "telefones": [
     { "numero": "11999999999", "tipo": "CELULAR" }
  ]
}
```

---

## 5. Consultar Detalhes (Por ID)

**GET** `/v1/pessoas/{id}`

Retorna todos os dados de uma pessoa específica.

---

## 6. Consultar Detalhes (Por Legacy ID - V1)

**GET** `/v1/pessoas/legado/{id}`

Usado para compatibilidade com sistemas antigos que ainda guardam o ID numérico da V1.

---

## 7. Operações em Lote

### Ativar Pessoas
**POST** `/v1/pessoas/ativar`
```json
{ "uuids": ["UUID-1", "UUID-2"] }
```

### Desativar Pessoas
**POST** `/v1/pessoas/inativar`
```json
{ "uuids": ["UUID-1", "UUID-2"] }
```

### Excluir Pessoas
**POST** `/v1/pessoas/excluir`
```json
{ "uuids": ["UUID-1", "UUID-2"] }
```
