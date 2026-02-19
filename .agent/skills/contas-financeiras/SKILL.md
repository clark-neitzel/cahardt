---
name: contas-financeiras
description: Documentação das Contas Financeiras (Bancos) e seus IDs fixos
---

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
