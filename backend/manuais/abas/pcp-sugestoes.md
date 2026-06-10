---
aba: Sugestões de Produção
rota: /pcp/sugestoes
permissao: pcp.sugestoes
---

# Sugestões de Produção

## O que é

O sistema analisa quais itens do PCP estão com estoque abaixo do mínimo **e** possuem receita ativa, e gera sugestões de produção. Cada sugestão indica a quantidade sugerida para repor o estoque e o número de bateladas necessárias. O responsável decide: aceitar (cria uma Ordem de Produção automaticamente) ou rejeitar.

As sugestões não são geradas sozinhas — você precisa clicar em **Gerar Sugestões** para que o sistema analise o estoque.

## O que dá pra fazer aqui

- Gerar novas sugestões (análise instantânea do estoque)
- Ver todas as sugestões com status Pendente, Aceita ou Rejeitada
- Filtrar por status
- Ver os dados de cada sugestão: item, estoque atual, mínimo, quantidade sugerida, bateladas
- Aceitar uma sugestão (gera OP automaticamente)
- Rejeitar uma sugestão

## Como fazer (passo a passo real)

### Gerar sugestões

1. Clique em **Gerar Sugestões** (botão amarelo, canto superior direito).
2. O sistema varre todos os itens PCP com receita ativa e estoque abaixo do mínimo.
3. Uma mensagem informa quantas sugestões foram geradas.
4. As novas sugestões aparecem com status **PENDENTE**.

> Se não aparecer nenhuma sugestão nova, significa que todos os itens com receita ativa estão com estoque acima do mínimo (ou não têm estoque mínimo configurado).

### Aceitar uma sugestão

1. Localize a sugestão com status **PENDENTE**.
2. Clique no botão verde **Aceitar** (ícone de check).
3. Uma Ordem de Produção é criada automaticamente com a quantidade sugerida.
4. Uma mensagem mostra o número da OP criada (ex: "OP #12 criada com sucesso").
5. A sugestão muda para **ACEITA** e exibe "OP gerada".

### Rejeitar uma sugestão

1. Localize a sugestão com status **PENDENTE**.
2. Clique no botão vermelho **Rejeitar** (ícone X).
3. Confirme na caixa de diálogo.
4. A sugestão muda para **REJEITADA** e não pode mais ser aceita.

## Como as sugestões são calculadas

O sistema verifica:
1. Quais itens PCP têm estoque atual abaixo do estoque mínimo definido no cadastro.
2. Quais desses itens têm pelo menos uma receita com status "ativa".
3. Para cada item elegível, calcula a quantidade necessária para repor o estoque e quantas bateladas da receita isso representa.

## Informações de cada sugestão

| Campo | O que mostra |
|-------|-------------|
| Item | Nome e código do item PCP |
| Estoque Atual | Saldo atual em estoque |
| Estoque Mínimo | Mínimo configurado no cadastro do item |
| Qtd Sugerida | Quantidade que o sistema recomenda produzir |
| Bateladas | Número de bateladas da receita para atingir a quantidade |
| Observações | Notas geradas automaticamente |

## Status das sugestões

| Status | Cor | Significado |
|--------|-----|-------------|
| PENDENTE | Amarelo | Aguardando decisão |
| ACEITA | Verde | Decisão tomada; OP gerada |
| REJEITADA | Vermelho | Descartada pelo responsável |

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver, gerar, aceitar, rejeitar | `pcp.sugestoes` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.sugestoes`.

## Depende de / Interfere em

- **Estoque PCP**: os valores de estoque atual e mínimo vêm de lá. Sem estoque mínimo configurado, o item não gera sugestão.
- **Receitas**: só gera sugestão para itens com receita ativa. Sem receita ativa, o item não aparece aqui.
- **Ordens de Produção**: ao aceitar uma sugestão, uma OP é criada automaticamente em `/pcp/ordens` com status PLANEJADA.
- **Dashboard PCP**: o contador "Sugestões Pendentes" vem desta tela.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/SugestoesProducao.jsx` | Tela de sugestões com filtros, aceitar e rejeitar |
| `frontend/src/services/pcpSugestaoService.js` | Chamadas de API para sugestões e dashboard |
