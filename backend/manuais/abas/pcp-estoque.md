---
aba: Estoque PCP
rota: /pcp/estoque
permissao: pcp.estoque
---

# Estoque PCP

## O que é

Posição de estoque dos itens que participam do processo de produção: matérias-primas (MP), subprodutos (SUB), produtos acabados controlados pelo PCP (PA) e embalagens (EMB). Este estoque é separado do estoque de vendas — aqui o foco é o controle interno de chão de fábrica.

Os saldos são atualizados de duas formas:
- **Automaticamente**: quando uma ordem de produção é finalizada (ingredientes consumidos saem, item produzido entra).
- **Manualmente**: via ajuste nesta tela (entrada de compra, saída por descarte, correção de inventário).

## O que dá pra fazer aqui

- Ver o saldo atual de cada item PCP
- Filtrar por tipo (MP, SUB, PA, EMB) e buscar por nome
- Ver itens abaixo do estoque mínimo (linha com fundo vermelho e ícone de alerta)
- Filtrar apenas itens abaixo do mínimo (checkbox)
- Registrar entrada manual de estoque (compra, recebimento)
- Registrar saída manual de estoque (descarte, uso, correção)

## Como fazer (passo a passo real)

### Ver itens em falta

1. Marque o checkbox **Abaixo do mínimo** nos filtros.
2. A lista filtra apenas os itens com estoque atual menor que o mínimo configurado.
3. Itens críticos têm fundo vermelho na tabela e ícone de alerta ao lado do saldo.

### Registrar entrada de estoque

1. Localize o item na lista.
2. Clique em **Ajustar** (coluna à direita).
3. O modal de ajuste abre — o estoque atual é exibido para referência.
4. Clique em **Entrada** (botão verde).
5. Informe a quantidade a adicionar.
6. Informe a observação (ex: "Compra NF 1234").
7. Clique em **Confirmar Ajuste**.

### Registrar saída de estoque

1. Localize o item e clique em **Ajustar**.
2. Clique em **Saída** (botão vermelho).
3. Informe a quantidade a baixar e uma observação.
4. Clique em **Confirmar Ajuste**.

## Colunas da tabela

| Coluna | O que mostra |
|--------|-------------|
| Item | Nome e código do item |
| Tipo | MP / SUB / PA / EMB |
| Unidade | KG, UN, L, etc. |
| Estoque Atual | Saldo atual (vermelho se abaixo do mínimo) |
| Mínimo | Estoque mínimo configurado no cadastro do item |
| Ajuste | Botão para abrir o modal de entrada/saída |

## Baixa automática ao finalizar uma ordem

Quando o operador finaliza uma ordem no Painel de Produção, o sistema automaticamente:
1. Reduz o estoque de cada ingrediente (MP, SUB, EMB) pelo consumo real apontado.
2. Adiciona ao estoque do item produzido (PA ou SUB) a quantidade efetivamente produzida.

Não é preciso fazer ajuste manual após finalizar uma ordem.

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver a tela e os saldos | `pcp.estoque` |
| Registrar entrada/saída manual | `pcp.estoque` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.estoque`.

## Depende de / Interfere em

- **Ordens de Produção / Painel**: ao finalizar uma ordem, os saldos desta tela são atualizados automaticamente.
- **Itens PCP**: o estoque mínimo de cada item é configurado no cadastro (`/pcp/itens`).
- **Sugestões**: quando um item fica abaixo do mínimo, o sistema pode gerar uma sugestão de produção.
- **Dashboard**: o card de "Itens Abaixo do Mínimo" no dashboard vem dos dados desta tela.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/EstoquePcp.jsx` | Tela principal com tabela, filtros e modal de ajuste |
| `frontend/src/services/pcpEstoqueService.js` | Chamadas de API para posição e ajuste de estoque |
