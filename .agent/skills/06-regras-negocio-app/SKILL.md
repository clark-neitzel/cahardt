---
name: 06-regras-negocio-app
description: "💼 REGRAS CORPORATIVAS. Obrigatório consultar para alterar cálculos de Tabelas de Preços, comissões, saldo Flex ou limitações logísticas."
---

# 06 REGRAS NEGOCIO APP
> ⚠️ **DOCUMENTO MESTRE**: Este documento é a consolidação das antigas skills: regras-negocio-pedido, tabela-precos.



-------------------------------------------------
## CONTEÚDO ORIGINAL DE: regras-negocio-pedido
-------------------------------------------------

# Regras de Negócio do Pedido (App Hardt)

Esta skill define as lógicas exclusivas do Aplicativo referentes a elaboração do pedido, com foco no balanço "Flex" do vendedor, regras de precificação e interface de usuário.

## 1. O Sistema FLEX

O "Flex" é uma conta-corrente virtual do vendedor, onde ele acumula saldo se vender mais caro, ou gasta saldo se vender mais barato que a tabela + acréscimo de condição de pagamento.

### Regras do Flex
- **Preço Base do Cálculo**: `Valor de Venda do Produto` (tabela) + `% Acréscimo da Condição de Pagamento`.
- **Preço Praticado**: Valor digitado/selecionado pelo vendedor para aquele item.
- **Cálculo por Item**: `(Preço Praticado - Preço Base) * Quantidade`.
  - Diferença positiva ganha saldo.
  - Diferença negativa consome saldo.
- **Acúmulo e Recalculação**:
  - O saldo Flex do pedido é a soma do flex de todos os itens.
  - Se a Condição de Pagamento do pedido mudar, **todo** o Flex do pedido é recalculado.
- **Limites**:
  - **Limite Mínimo de Produto**: O preço praticado não pode ser inferior a `X%` do preço base (esse `%` deve ser configurável no painel administrativo, ex: `AppConfig`).
  - **Limite Total de Flex**: Se, após processar o pedido, o Flex do vendedor ficar negativo e ele não tiver saldo disponível (`Flex_Disponivel` + `Flex_Mensal`), **o pedido não pode ser enivado**.
- **Comportamento Sem Saldo**: O vendedor até consegue montar o pedido e ser alertado de saldo insuficiente. Porém, não consegue mudar o status para `ENVIAR` (o botão deve ser bloqueado e avisar). O pedido pode, opcionalmente, ser salvo só como `ABERTO`.
- **Renovação**: Todo dia 1º do mês, o saldo Flex do vendedor é restaurado/redefinido.

## 2. Elaboração e Precificação do Pedido 

### 2.1 Puxando Preço Histórico
- Na hora de inserir um produto em um pedido, o app deve checar se **aquele cliente já comprou aquele mesmo produto antes**.
- **Se Sim**: O `Preço Praticado` inicial deve ser o preço do **último pedido**. O app mostrará a diferença (Flex gerado) com base nesse preço histórico.
- **Se Não**: O `Preço Praticado` inicial será o Preço Base (`Valor de Venda` + `Condição`). Flex original = 0.

### 2.2 Seleção de Cliente e Vendedor
- O vendedor responsável pelo pedido é, por regra, o vendedor associado ao **Cliente**.
- **Condição Bloqueante**: Se tentar fazer pedido para cliente sem vendedor associado, lançar alerta impeditivo pedindo para configurar primeiro o vendedor no Cadastro de Cliente.

### 2.3 Condições de Pagamento Disponíveis
- O dropdown de Condições de Pagamento no Pedido **NÃO** deve listar todas as condições globais.
- Só deve exibir as condições que estiverem explicitamente marcadas nas **Condições Permitidas** do Cliente (`condicoes_pagamento_permitidas`). *Isso requer ajustar estrutura de cliente (Muitos para Muitos ou Array).*

## 3. Finalização e GPS

- Quando o vendedor salva o pedido (especialmente finalizando para `ENVIAR`), o App deve **capturar obrigatoriamente** o Ponto de GPS (latitude, longitude) local do smartphone/dispositivo.

## 4. UX Mobile (Guidelines)

Como o App será operado 95% do tempo via Celular em campo:
- **Design Denso/Compacto**: Minimizar rolagens extensas (no mobile). Menos padding vazio, uso eficiente de espaço.
- **Accordion ou Sections**: Área de Itens (carrinho) que agrupa linhas para não usar toda a tela.
- **Feedback Visual Flex**: Saldo Flex projetado em Cores (ex: **Verde** se gera flex positivo, **Vermelho** se consumir, totalizador fixado no bottom ou top da tela de modo persistente).
- **Digitação Rápida**: Teclado numérico nativo para campos numéricos; foco rápido entre os text inputs de produto e valor.

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: tabela-precos
-------------------------------------------------

# Tabela de Preços (Condições Avançadas)

Esta skill documenta a implementação da `TabelaPreco`, que substitui/complementa as condições de pagamento padrão do Conta Azul com regras de negócio específicas da Hardt.

## Estrutura do Banco (`tabela_precos`)

Diferente do Conta Azul (que usa UUIDs opacos), esta tabela usa IDs semânticos ou legados para facilitar a identificação visual e a integração.

| Campo | Tipo | Descrição | Exemplo |
| :--- | :--- | :--- | :--- |
| `id` | String (PK) | ID Interno/Legado | `1002` |
| `id_condicao` | String | Código legível | `BOL_7` |
| `nome_condicao` | String | Nome exibido ao usuário | `7 dias - Boleto` |
| `tipo_pagamento` | String | Tipo de Pagamento | `BOLETO_BANCARIO` |
| `opcao_condicao` | String | Agrupamento/Opção Visual | `7, 14` |
| `qtd_parcelas` | Int | Número de parcelas | `1` |
| `parcelas_dias` | Int | Dias para vencimento | `7` |
| `acrescimo_preco` | Decimal | % de acréscimo | `2.5` |
| `parcelas_percentuais` | Decimal | Percentual | `100` |
| `exige_banco` | Boolean | Se exige banco no cadastro | `true` |
| `banco_padrao` | String | FK de banco preferido | `UUID` |
| `ativo` | Boolean | Status do registro | `true` |
| `obs` | String | Observações | `...` |

## Regras de Negócio

1.  **Exibição Separada**: No frontend, "Parcelas" e "Dias" devem ser mostrados em colunas distintas (ex: `1x` e `7 dias`), nunca concatenados como string ("1x (7 dias)"), para clareza técnica.
2.  **Seleção no Cliente**: Ao selecionar uma condição no cadastro do cliente (`DetalheCliente.jsx`), o sistema deve mostrar imediatamente um resumo técnico (Parcelas, Dias, Acréscimo) para que o usuário valide a escolha.
3.  **Imutabilidade dos IDs de seed**: Os IDs de seed (`1000` a `1008`) e códigos base (`BOL_7`, etc.) são fixos e não devem ser gerados aleatoriamente.
4.  **Condição parcelada por dias explícitos**: Para condições como `2x boleto 7/14`, usar `opcao_condicao = "7, 14"` e `qtd_parcelas = 2`.

### Atualização Mar/2026 — Parcelas com vencimento real no CA

- O worker de pedidos agora prioriza os dias extraídos de `opcaoCondicaoPagamento` quando a quantidade bate com `qtdParcelas`.
- Exemplo: `opcaoCondicaoPagamento = "7, 14"` + `qtdParcelas = 2` gera parcelas em D+7 e D+14 no payload de venda.
- Fallback legado: se não houver opção parseável, o sistema usa progressão por `intervaloDias` (`7, 14, 21...`).

## Integração

*   **Endpoint**: `GET /api/tabela-precos`
*   **Uso**: Dropdowns de seleção de condição de pagamento e cálculo de totais de pedidos.

---

## Campo `debitaCaixa` (Adicionado 2026)

O campo `debitaCaixa` (BOOLEAN, default `false`) foi adicionado à `tabela_precos` para indicar se aquela condição de pagamento resulta em **dinheiro entregue ao motorista** (que deve prestar contas).

| Campo | Tipo | Descrição |
|---|---|---|
| `debita_caixa` | Boolean | `true` = Dinheiro/PIX — motorista recebe em mãos. `false` = Boleto/Prazo — cobrado depois. |

**Uso na classificação do Caixa Diário:**
```javascript
// buscar tabelaPreco por nomeCondicao (nome real pago no checkout)
const mapaDebitaPorNome = Object.fromEntries(
    todasCondicoes.map(t => [t.nomeCondicao, t.debitaCaixa])
);
// Classificar pagamento real
const debitaCaixa = mapaDebitaPorNome[pagamento.formaPagamentoNome] ?? false;
```

**Migration SQL:**
```sql
ALTER TABLE "tabela_precos" ADD COLUMN IF NOT EXISTS "debita_caixa" BOOLEAN DEFAULT FALSE;
```

**Seeds de referência (valores padrão):**
| Condição | `debitaCaixa` |
|---|---|
| À Vista - Dinheiro | `true` |
| À Vista - PIX | `true` |
| 7/14/28 dias - Boleto | `false` |
| 30/45/60 dias | `false` |

---

## Campo `nomeCondicaoPagamento` no Pedido (CRÍTICO — MAR/2026)

O modelo `Pedido` agora persiste o **nome completo da condição de pagamento** (`nomeCondicaoPagamento`) no momento da criação do pedido. Isso foi necessário porque múltiplas condições podem ter o mesmo `opcaoCondicao` (ex: "À vista - Dinheiro" e "À vista - ZZ" ambas com `opcaoCondicao = "À vista"`), tornando o lookup reverso ambíguo.

### Onde é salvo

| Local | Campo Enviado | Campo Salvo |
|---|---|---|
| `NovoPedido.jsx` | `condicaoSelecionada.nomeCondicao` | `nomeCondicaoPagamento` |
| `pedidoService.js` criar() | `nomeCondicaoPagamento` | `nome_condicao_pagamento` |
| `pedidoService.js` editar() | `nomeCondicaoPagamento` | `nome_condicao_pagamento` |
| Importação CA (órfão) | lookup na `TabelaPreco` | `nome_condicao_pagamento` |

### Onde é exibido

`caixa.js`, `embarques.js`, `entregas.js` usam a seguinte prioridade:
```javascript
// Ordem de prioridade decrescente:
const nomeCondicao = e.nomeCondicaoPagamento           // 1º: nome salvo no pedido
    || mapaCondicoes[`${e.tipoPagamento}|${e.opcaoCondicaoPagamento}`]  // 2º: chave composta
    || e.opcaoCondicaoPagamento;                        // 3º: fallback bruto
```

### Consistência de TabelaPreco × ContaFinanceira

**REGRA:** Cada condição na `TabelaPreco` deve ter `bancoPadrao` compatível com `tipoPagamento`:

| tipoPagamento | tipoUso da ContaFinanceira aceito |
|---|---|
| `DINHEIRO` | `DINHEIRO` (ex: Caixinha) |
| `PIX` | `PIX` |
| `BOLETO_BANCARIO` | `BOLETO_BANCARIO` |
| `CARTAO` | `CARTAO` |

**Erro comum:** condição com `tipoPagamento: BOLETO_BANCARIO` + `bancoPadrao: Caixinha (DINHEIRO)` → CA rejeita com 400. O `syncPedidosService.js` detecta e omite o banco automaticamente, mas a causa raiz é configuração incorreta na interface da TabelaPreco.
