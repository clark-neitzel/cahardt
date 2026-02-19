---
name: regras-negocio-pedido
description: Regras de negócio do Pedido, Flex, Precificação e UX Mobile
---

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
