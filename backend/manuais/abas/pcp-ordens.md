---
aba: Ordens de Produção
rota: /pcp/ordens
permissao: pcp.ordens
---

# Ordens de Produção

## O que é

Lista completa de todas as ordens de produção (OP). Uma ordem de produção é a instrução para fabricar X unidades de um produto com base em uma receita ativa. Esta tela serve para criar novas ordens e consultar o histórico. A execução no chão de fábrica (iniciar, apontar consumos, finalizar) acontece no **Painel de Produção** (`/pcp/painel`).

## O que dá pra fazer aqui

- Listar ordens com filtro por status (30 por página, com navegação)
- Filtrar por: Todas / Planejada / Em Produção / Finalizada / Cancelada
- Criar nova ordem de produção
- Ver por linha: número, receita, produto, status, quantidade planejada, quantidade produzida, fator de escala, data planejada
- Cancelar uma ordem (quem tem permissão)
- Excluir uma ordem (quem tem permissão)
- Navegar ao Painel clicando em qualquer ordem ou no botão **Painel**

## Como fazer (passo a passo real)

### Criar uma nova ordem

1. Clique em **Nova Ordem**.
2. Selecione a **Receita** — apenas receitas com status "ativa" aparecem. Você vê o rendimento base e a unidade para referência.
3. Informe a **Quantidade Planejada** — pode ser diferente do rendimento base da receita (o sistema calcula o fator de escala automaticamente).
4. Enquanto você preenche a quantidade, o sistema exibe em tempo real o **Preview de Consumo**: lista de ingredientes com as quantidades calculadas e alerta vermelho em qualquer item com estoque insuficiente.
5. Informe a **Data Planejada** (padrão: hoje).
6. Observações (opcional).
7. Clique em **Criar Ordem**. A ordem é criada com status **PLANEJADA** e número sequencial (#1, #2...).

> O preview não impede a criação — você pode criar mesmo com estoque insuficiente.

### Cancelar uma ordem

1. Localize a ordem (precisa estar em PLANEJADA ou EM_PRODUCAO).
2. Clique no ícone de cancelar (X vermelho) — só aparece para quem tem permissão `pcp.cancelarOrdens`.
3. Confirme na caixa de diálogo.
4. A ordem muda para CANCELADA.

### Excluir uma ordem

- Disponível para ordens CANCELADAS ou PLANEJADAS.
- Clique no ícone de lixeira — só aparece para quem tem `pcp.cancelarOrdens`.
- Confirme. A exclusão é permanente.

### Executar uma ordem

- Clique em qualquer linha da tabela para ir ao Painel de Produção.
- Ou clique no botão **Painel** no canto superior.

## Status das ordens

| Status | Cor | Significado |
|--------|-----|-------------|
| PLANEJADA | Azul | Criada, aguardando início |
| EM_PRODUCAO | Amarelo | Iniciada pelo operador no Painel |
| FINALIZADA | Verde | Produção concluída; estoques já foram atualizados |
| CANCELADA | Vermelho | Cancelada antes de finalizar; nenhum estoque foi movido |

## O que acontece ao finalizar uma ordem

Quando o operador finaliza a ordem no Painel:
1. O estoque de cada ingrediente (MP, SUB, EMB) é **reduzido** pelo consumo real apontado.
2. O estoque do item produzido (PA ou SUB) é **aumentado** pela quantidade efetivamente produzida.
3. A ordem passa para status FINALIZADA.

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver a tela e criar ordens | `pcp.ordens` |
| Cancelar e excluir ordens | `pcp.cancelarOrdens` |

Admin (`admin: true`) tem acesso a tudo.

## Depende de / Interfere em

- **Receitas**: cada ordem é vinculada a uma receita ativa. O número da versão da receita é registrado no momento da criação.
- **Painel de Produção**: a execução (iniciar, consumos, finalizar) acontece lá.
- **Estoque PCP**: ao finalizar, os estoques de ingredientes são baixados e o item produzido é adicionado.
- **Calendário**: as ordens podem ser agendadas com data/hora no calendário de produção.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/OrdensProducao.jsx` | Listagem de ordens com filtros e paginação |
| `frontend/src/pages/PCP/OrdemProducaoForm.jsx` | Formulário de criação com preview de consumo |
| `frontend/src/services/pcpOrdemService.js` | Chamadas de API para ordens |
