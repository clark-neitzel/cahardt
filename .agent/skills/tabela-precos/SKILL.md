---
name: tabela-precos
description: Documentação da Tabela de Preços Avançada (Condições de Pagamento com Regras)
---

# Tabela de Preços (Condições Avançadas)

Esta skill documenta a implementação da `TabelaPreco`, que substitui/complementa as condições de pagamento padrão do Conta Azul com regras de negócio específicas da Hardt.

## Estrutura do Banco (`tabela_precos`)

Diferente do Conta Azul (que usa UUIDs opacos), esta tabela usa IDs semânticos ou legados para facilitar a identificação visual e a integração.

| Campo | Tipo | Descrição | Exemplo |
| :--- | :--- | :--- | :--- |
| `id` | String (PK) | ID Interno/Legado | `1002` |
| `id_condicao` | String | Código legível | `BOL_7` |
| `nome_condicao` | String | Nome exibido ao usuário | `7 dias - Boleto` |
| `qtd_parcelas` | Int | Número de parcelas | `1` |
| `parcelas_dias` | Int | Dias para vencimento | `7` |
| `acrescimo_preco` | Decimal | % de acréscimo | `2.5` |
| `exige_banco` | Boolean | Se exige banco no cadastro | `true` |

## Regras de Negócio

1.  **Exibição Separada**: No frontend, "Parcelas" e "Dias" devem ser mostrados em colunas distintas (ex: `1x` e `7 dias`), nunca concatenados como string ("1x (7 dias)"), para clareza técnica.
2.  **Seleção no Cliente**: Ao selecionar uma condição no cadastro do cliente (`DetalheCliente.jsx`), o sistema deve mostrar imediatamente um resumo técnico (Parcelas, Dias, Acréscimo) para que o usuário valide a escolha.
3.  **Imutabilidade dos IDs**: Os IDs (`1000` a `1008`) e códigos (`BOL_7`) são fixos e usados em Seeds. Não devem ser gerados aleatoriamente.

## Integração

*   **Endpoint**: `GET /api/tabela-precos`
*   **Uso**: Dropdowns de seleção de condição de pagamento e cálculo de totais de pedidos.
