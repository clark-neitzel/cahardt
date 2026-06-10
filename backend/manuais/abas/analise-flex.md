---
aba: Análise de Flex
rota: /relatorios/flex
permissao: pedidos (view) — vendedor vê o próprio; admin vê todos
---

# Análise de Flex

## O que é

Painel dedicado a analisar o uso do orçamento de flex (descontos e acréscimos) por vendedor. Mostra quais pedidos geraram flex negativo (desconto dado) ou positivo (acréscimo), o saldo líquido do período e quanto cada vendedor consumiu do seu orçamento mensal.

---

## O que dá pra fazer aqui

- Selecionar o período de análise (padrão: início do mês até hoje)
- Ver um resumo geral: total de flex negativo, positivo e saldo líquido
- Ver por vendedor:
  - Quantidade de pedidos com desconto vs acréscimo
  - Barra de progresso do orçamento mensal consumido
  - Saldo restante do orçamento mensal
  - Saldo líquido (positivo + negativo)
- Expandir um vendedor para ver todos os pedidos com flex do período
- Expandir um pedido para ver cada item com o flex gerado individualmente

---

## Como interpretar o flex

| Valor | Significa |
|-------|-----------|
| Flex negativo (vermelho) | O vendedor vendeu abaixo do preço base → consumiu orçamento |
| Flex positivo (verde) | O vendedor vendeu acima do preço base → gerou margem extra |
| Saldo líquido | Soma de tudo: se negativo, o vendedor gastou mais desconto do que margem gerada |

---

## Como usar (passo a passo)

1. Acesse o menu lateral → **Análise Flex**
2. Selecione o período (De / Até)
3. Clique em **Gerar**
4. Os cards de resumo mostram os totais
5. Clique no nome de um vendedor para expandir e ver os pedidos
6. Clique em um pedido para ver os itens com flex individual

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `pedidos` (view) | Acessa a análise de flex |
| `pedidos.clientes = "todos"` ou `admin` | Vê todos os vendedores |

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Relatorios/RelatorioFlex.jsx` | Componente da aba |
| `backend/routes/pedidoRoutes.js` | Rota `GET /pedidos/relatorio-flex` |
| `backend/controllers/pedidoController.js` | Função `relatorioFlex` |
