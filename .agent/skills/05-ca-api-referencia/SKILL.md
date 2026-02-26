---
name: 05-ca-api-referencia
description: "📚 DICIONÁRIO COMPLETO CONTA AZUL. Consulte para ver payloads, limites e regras das rotas de Pessoas, Pedidos, Vendedores, Contas e Produtos."
---

# 05 CA API REFERENCIA
> ⚠️ **DOCUMENTO MESTRE**: Este documento é a consolidação das antigas skills: contaazul-clientes, contaazul-pedidos, contaazul-produtos, contaazul-vendedores, contas-financeiras.



-------------------------------------------------
## CONTEÚDO ORIGINAL DE: contaazul-clientes
-------------------------------------------------

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

---

## 8. Filtros Avançados (Hardt App)

A aplicação estende a API padrão com filtros específicos para a operação da Hardt:

*   **Status**: `Ativo`, `Inativo`, `Todos`.
*   **Cidade**: Filtro por cidades existentes na base de clientes.
*   **Vendedor**: Filtro por vendedor responsável (`id_vendedor`).
*   **Dia de Entrega**: Segunda a Sábado.
*   **Dia de Venda**: Segunda a Sábado.
*   **Condição de Pagamento**: Filtro por ID da condição.

## 9. Ações em Lote (Bulk Actions)

Para facilitar a gestão, o sistema permite ações em massa na listagem de clientes:

### Alteração em Lote
Permite alterar campos específicos de múltiplos clientes selecionados simultaneamente:
1.  **Vendedor**: Atribuir carteira de clientes a um novo vendedor.
2.  **Dia de Entrega**: Otimizar rotas logísticas.
3.  **Dia de Venda**: Reorganizar agenda comercial.

> **Importante:** Estas ações atualizam o banco de dados local (`clientes`) e devem sincronizar com o Conta Azul (se houver campo correspondente via Custom fields ou Observação, conforme regra de negócio de Sync).

## 10. Novos Campos (Extensão Hardt)

Além dos campos padrão do Conta Azul, a tabela `clientes` local possui:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id_vendedor` | String | ID do Vendedor responsável (FK `vendedores`). |
| `Dia_de_entrega` | String | Dia da semana fixo para entrega. |
| `Dia_de_venda` | String | Dia da semana fixo para visita/contato. |
| `Condicao_de_pagamento` | String | ID da tabela de preços (`1000`, `BOL_7`, etc). |
| `Formas_Atendimento` | String[] | Array de canais (`WHATSAPP`, `VISITA`, etc). |

Estes campos são fundamentais para o funcionamento dos filtros e da lógica de vendas do App.

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: contaazul-pedidos
-------------------------------------------------

# Integração de Pedidos - Conta Azul

Esta skill documenta a integração de envio de Pedidos (Vendas) para o Conta Azul, baseada no script legado e nas regras da API.

## 1. Fluxo de Sincronização

1. **Local (App)**: O pedido é criado no app com status inicial.
2. **Status de Envio**:
   - `ABERTO`: Pedido rascunho ou bloqueado (ex: sem saldo flex). O vendedor pode alterar livremente.
   - `ENVIAR`: Pedido finalizado pelo vendedor, pronto para envio. Não pode mais ser alterado.
   - `SINCRONIZANDO`: O worker/script pegou o pedido e está processando com o CA.
   - `RECEBIDO`: Pedido processado com sucesso no CA, recebemos o `id_venda_contaazul`. Intocável.
   - `ERRO`: Ocorreu falha no envio. A mensagem vai para `erro_envio`.
3. **Job Assíncrono**: Um processo em background pega 1 pedido por vez (prioriza `SINCRONIZANDO`, depois `ENVIAR`).
4. **Idempotência e Prevenção de Duplicidade:**
   - Se já existe `id_venda_contaazul`, verifica via `GET https://api-v2.contaazul.com/v1/venda/{id}` se consta no CA.
   - Se não tem ID, mas tem `numero`, busca via `GET https://api-v2.contaazul.com/v1/venda/busca?numeros={numero}`. Se achar, salva o ID e marca como `RECEBIDO`.
   - Se não existir no CA de forma alguma, gera um novo número (`GET https://api-v2.contaazul.com/v1/venda/proximo-numero`) se necessário, constrói o payload e dispara `POST https://api-v2.contaazul.com/v1/venda`.

**CRÍTICO [FEV/2026]: Integração V2 OBRIGATÓRIA para Vendas**
Com a migração para tokens Cognito, a API antiga (`api.contaazul.com/v1/vendas`) passou a rejeitar novos tokens com erro 401 Unauthorized.
Você DEVE utilizar exclusivamentes as rotas da V2 hospedadas em `api-v2.contaazul.com`.

- **Busca de Múltiplas Vendas:** `GET https://api-v2.contaazul.com/v1/venda/busca`
  - Parâmetros principais: `?data_alteracao_de=2026-01-01T00:00:00&tamanho_pagina=50` (Atenção ao formato da data sem "Z" no final).
  - A resposta devolve as vendas em **`response.data.itens`** (um array). Não leia `response.data` diretamente!
- **Criar Venda:** `POST https://api-v2.contaazul.com/v1/venda`

## 2. Estrutura de Envio (Payload POST /v1/venda)

*A integração cria vendas SEM NATUREZA FINANCEIRA, para evitar que o Conta Azul crie lançamentos financeiros não desejados imediatamente ou use categorias incorretas.*

### Payload Base
```json
{
  "id_cliente": "UUID-DO-CLIENTE",
  "numero": 12345, // Adquirido do proximo-numero se não existir
  "situacao": "APROVADO",
  "data_venda": "YYYY-MM-DD", // Data de ENTREGA que o vendedor estipulou
  "observacoes": "Texto livre",
  "id_vendedor": "UUID-DO-VENDEDOR", // Só envia se for UUID v4 válido
  "id_categoria": "UUID-CATEGORIA", // Opcional
  "itens": [
    {
      "id": "UUID-DO-PRODUTO",
      "descricao": "Nome do produto/Obs",
      "quantidade": 10.5,
      "valor": 15.90, // Valor unitário estipulado pelo vendedor (pode ter flex)
      "tipo": "PRODUTO"
    }
  ],
  "condicao_pagamento": {
    "tipo_pagamento": "BOLETO", // Vem de CondicaoPagamento.tipo_pagamento
    "id_conta_financeira": "UUID-CONTA", // Vem de CondicaoPagamento.banco_padrao
    "opcao_condicao_pagamento": "30 dias", // Vem de CondicaoPagamento.opcao_condicao 
    "pagamento_a_vista": false,
    "parcelas": [
      {
        "data_vencimento": "YYYY-MM-DD", // Data Venda + parcelas_dias
        "valor": 166.95, // Soma total dos itens (Neste modelo enviamos 1 parcela pro total)
        "descricao": "Venda 12345"
      }
    ]
  }
}
```

## 3. Regra de Integração de API (Token Auto-Refresh)
**CRÍTICO:** Nunca use `axios.get()` ou `axios.post()` diretamente para interagir com a API do Conta Azul a partir dos Services, pois o Token expira a cada 1 hora.
- Se for fazer um `GET` (como buscar vendas ou próximo número), use o wrapper interno `contaAzulService._axiosGet(url, 'LOG_NAME')` que interceptará falhas `401 Unauthorized` e renovará o token silenciosamente.
- Se for fazer um `POST/PUT` (como enviar a venda), se assegure de capturar o token atual com `contaAzulService.getAccessToken()` e, caso ocorra a falha HTTP `401`, chame `contaAzulService.getAccessToken(true)` para forçar a renovação e tente a requisição novamente.

## 4. Limitações e Regras CA
- O array de itens deve conter apenas produtos cadastrados (`id` de produto válido). `pedido_item_id` ou identificadores similares do app são controles locais apenas.
- Vendedores precisam ser cadastrados no ERP e linkados no Payload via `id_vendedor`.
- Ref: Common Mistakes: `https://developers.contaazul.com/commonmistakes`
- O `proximo-numero` pode falhar e o retorno ser texto puro em vez de JSON. Deve tratar o retorno (`Number(response.body)` vs `JSON.parse`).

### Limitações Fiscais e Logísticas (API v1)
A API Pública `POST /v1/venda` do Conta Azul foca apenas na criação do **Pedido de Venda** (Reserva de Estoque e Provisão Financeira). 
Ela **não suporta** o envio direto de dados para emissão da NF-e, como:
- **Natureza de Operação (CFOP)**
- **Dados da Transportadora / Frete Logístico**

**Solução:** O faturamento da Nota Fiscal deve ocorrer dentro do painel do Conta Azul. A emissão puxará as configurações de Natureza de Operação padrões vinculadas aos produtos/clientes, ou necessitará de preenchimento manual do faturista no ERP antes de emitir a nota. O aplicativo Antigravity apenas envia a venda.

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: contaazul-produtos
-------------------------------------------------

# Conta Azul API - Módulo de Produtos

Este documento descreve os endpoints disponíveis para integração com o módulo de produtos do Conta Azul, conforme documentação oficial fornecida em Fev/2026.

## Autenticação

Todos os endpoints requerem autenticação via OAuth 2.0.
Header: `Authorization: Bearer <access_token>`

## Base URL
**CRÍTICO [FEV/2026]: A documentação e os sistemas atuais utilizam EXCLUSIVAMENTE `https://api-v2.contaazul.com`. A `api.contaazul.com` foi desativada para novas integrações Cognito (gerando erros irreversíveis de Autorização/401).**

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

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: contaazul-vendedores
-------------------------------------------------

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
    - `login`: Nome de usuário para acesso exclusivo ao App (ex: "Clarkson").
    - `senha`: Hash da senha de acesso ao App.
    - `permissoes`: JSON de controle granular de acesso às abas do app (view, edit, e visibilidade de clientes "todos" vs "vinculados").

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

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: contas-financeiras
-------------------------------------------------

# Contas Financeiras (Bancos)

Esta skill documenta a tabela `contas_financeiras`, responsável por armazenar os bancos e caixas utilizados para recebimento.

## Estrutura do Banco (`contas_financeiras`)

Os IDs devem ser **EXATAMENTE** os fornecidos pelo usuário, pois correspondem aos IDs reais no Conta Azul ou sistema legado.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | String (PK) | UUID do Conta Azul (Fixo) |
| `nome_banco` | String | Nome exibido (Ex: "Conta Azul") |
| `tipo_uso` | String | Ex: `BOLETO_BANCARIO`, `DINHEIRO` |
| `opcao_condicao` | String | Vínculo visual com condição (Ex: "1x", "À vista") |

## Dados Padronizados (Seeds)

Estes registros são inseridos via `migrationService.js` e não devem ser alterados manualmente:

1.  **Caixinha** (`DINHEIRO`)
    *   ID: `1dc7f96e-7658-4e0c-8d0a-5c5980234c90`
2.  **Conta Azul** (`BOLETO_BANCARIO`)
    *   ID: `ed4798c2-f8e3-4e87-9ff3-8f264dcf6aa0`
3.  **Acredicoop** (`BOLETO_BANCARIO`)
    *   ID: `dc83b583-4a49-47c4-b238-c7d14ab77d5f`
4.  **Sicoob** (`BOLETO_BANCARIO`)
    *   ID: `f756dd56-4946-493e-9343-0a2e2fdfe681`

## Uso

*   Utilizado para vincular a `TabelaPreco` (campo `banco_padrao`) ou selecionar destino financeiro de um pedido.
*   **Endpoint**: `GET /api/contas-financeiras`