---
aba: PCP — Ordens de Produção
rota: /pcp/ordens
permissao: admin ou acesso ao módulo PCP
---

# PCP — Ordens de Produção

## O que é

Lista completa de todas as ordens de produção criadas, com filtro por status. Serve para visualizar o histórico e criar novas ordens. Para a execução no chão de fábrica (iniciar, apontar consumos, finalizar), use a aba **PCP — Painel Operacional**.

---

## O que dá pra fazer aqui

- Listar ordens de produção com paginação (30 por vez)
- Filtrar por status: Planejada, Em Produção, Finalizada, Cancelada
- Criar nova ordem de produção
- Ver: número da ordem, receita, produto, status, quantidade planejada x produzida, fator e data
- Cancelar ou excluir uma ordem (quem tem permissão)
- Navegar para o Painel Operacional clicando em uma ordem ou no botão Painel

---

## Status das ordens

| Status | Cor | Significado |
|--------|-----|-------------|
| PLANEJADA | Azul | Criada, aguardando início |
| EM_PRODUCAO | Amarelo | Em andamento no chão de fábrica |
| FINALIZADA | Verde | Produção concluída |
| CANCELADA | Vermelho | Cancelada antes de finalizar |

---

## Como fazer (passo a passo real)

### Criar uma nova ordem
1. Clique em **+ Nova Ordem**
2. Selecione a receita a ser produzida
3. Informe a quantidade planejada e a data prevista
4. Salve — a ordem é criada com status PLANEJADA

### Ver ordens em produção
1. Clique no filtro **Em Producao**
2. Clique em qualquer ordem para ir ao Painel Operacional com os detalhes

### Cancelar uma ordem
1. Localize a ordem (precisa estar em PLANEJADA ou EM_PRODUCAO)
2. Clique no ícone de cancelar (X)
3. Confirme

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Cria e visualiza ordens |
| `pcp.cancelarOrdens` | Pode cancelar e excluir ordens |

---

## Depende de / Interfere em

- **PCP — Receitas** — cada ordem é baseada em uma receita ativa
- **PCP — Painel Operacional** — a execução (iniciar, consumos, finalizar) acontece lá
- **PCP — Estoque** — ao finalizar, o estoque dos itens consumidos é baixado e o item produzido é adicionado

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/OrdensProducao.jsx` | Lista de ordens com filtros |
| `frontend/src/services/pcpOrdemService.js` | Chamadas de API |
| `backend/src/routes/pcp/ordens.js` | Rotas do backend |
