---
aba: Painel de Produção
rota: /pcp/painel
permissao: pcp.ordens
---

# Painel de Produção

## O que é

Tela de chão de fábrica. É onde o operador trabalha no dia a dia: vê o que precisa ser fabricado, inicia a produção, registra o quanto de cada ingrediente foi consumido de verdade, e finaliza a ordem informando o que foi efetivamente produzido. Quando a ordem é finalizada, os estoques são atualizados automaticamente.

## O que dá pra fazer aqui

- Ver ordens agrupadas em três seções: **Em Produção**, **Planejadas**, **Finalizadas Recentes** (últimas 10)
- Expandir qualquer ordem para ver a lista de ingredientes (materiais previstos)
- Iniciar uma ordem planejada
- Registrar e salvar os consumos reais de ingredientes
- Finalizar uma ordem (informa a quantidade produzida real)
- Cancelar uma ordem (quem tem permissão)

## Como fazer (passo a passo real)

### Iniciar uma ordem planejada

1. Localize a ordem na seção **Planejadas** (fundo azul).
2. Clique no card para expandi-lo.
3. Revise os ingredientes listados (quantidades previstas).
4. Clique em **Iniciar Produção** (botão amarelo).
5. A ordem sobe para a seção **Em Produção**.

### Registrar consumo real de ingredientes

1. Expanda a ordem na seção **Em Produção** clicando nela.
2. Para cada ingrediente, aparece um campo editável com a quantidade prevista já preenchida.
3. Ajuste os campos para refletir o que foi realmente consumido.
4. Clique em **Salvar Consumos** para registrar sem finalizar.

> Você pode salvar os consumos várias vezes antes de finalizar.

### Finalizar uma ordem

1. Com a ordem em **Em Produção** e expandida, clique em **Finalizar**.
2. Um modal aparece com o campo **Quantidade Produzida Real** (pré-preenchido com a quantidade planejada).
3. Informe o que foi efetivamente produzido (pode ser diferente do planejado).
4. Se houver diferença, o sistema mostra o percentual em relação ao planejado.
5. Clique em **Finalizar Ordem**.
6. Os estoques são atualizados: ingredientes consumidos são baixados, item produzido é adicionado.
7. A ordem aparece na seção **Finalizadas Recentes**.

### Cancelar uma ordem

1. Expanda a ordem.
2. Clique em **Cancelar** (ícone X vermelho) — só aparece para quem tem `pcp.cancelarOrdens`.
3. Confirme na caixa de diálogo.

## Organização visual do painel

| Seção | Fundo | Ordens exibidas |
|-------|-------|-----------------|
| Em Produção | Amarelo | Iniciadas, aguardando finalização |
| Planejadas | Azul | Criadas, aguardando início |
| Finalizadas Recentes | Verde | Últimas 10 ordens concluídas |

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver a tela, iniciar, consumos, finalizar | `pcp.ordens` |
| Cancelar ordens | `pcp.cancelarOrdens` |

Admin (`admin: true`) tem acesso a tudo.

## Depende de / Interfere em

- **Ordens de Produção**: as ordens são criadas lá e executadas aqui.
- **Estoque PCP**: ao finalizar uma ordem, o consumo real baixa os estoques de MP/SUB/EMB e adiciona ao PA ou SUB produzido.
- **Calendário**: as ordens agendadas no calendário aparecem aqui normalmente.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/PainelOperacional.jsx` | Tela principal do painel com cards expandíveis, modal finalizar |
| `frontend/src/services/pcpOrdemService.js` | Chamadas de API (iniciar, consumo, finalizar, cancelar) |
