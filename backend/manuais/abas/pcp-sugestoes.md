---
aba: PCP — Sugestões de Produção
rota: /pcp/sugestoes
permissao: admin ou acesso ao módulo PCP
---

# PCP — Sugestões de Produção

## O que é

O sistema analisa automaticamente quais itens estão abaixo do estoque mínimo e que possuem receita ativa, e gera sugestões de produção. Cada sugestão indica quanto produzir (quantidade sugerida e número de bateladas). O responsável pode aceitar a sugestão (cria uma Ordem de Produção automaticamente) ou rejeitar.

---

## O que dá pra fazer aqui

- Ver todas as sugestões de produção com status (Pendente, Aceita, Rejeitada)
- Gerar novas sugestões (analisa todos os itens abaixo do mínimo)
- Filtrar por status
- Aceitar uma sugestão (cria OP automaticamente)
- Rejeitar uma sugestão

---

## Como fazer (passo a passo real)

### Gerar sugestões
1. Clique em **Gerar Sugestões**
2. O sistema analisa todos os itens PCP com receita ativa e estoque abaixo do mínimo
3. As sugestões são criadas com status PENDENTE

### Aceitar uma sugestão
1. Localize a sugestão com status PENDENTE
2. Clique no botão verde de check (aceitar)
3. Uma Ordem de Produção é criada automaticamente com a quantidade sugerida
4. A sugestão muda para ACEITA e informa o número da OP criada

### Rejeitar uma sugestão
1. Clique no botão vermelho de X (rejeitar)
2. Confirme
3. A sugestão muda para REJEITADA

---

## Informações de cada sugestão

| Campo | Significado |
|-------|-------------|
| Item | Nome do subproduto/item PCP |
| Estoque Atual | Quantidade disponível agora |
| Estoque Mínimo | Quantidade mínima configurada |
| Qtd Sugerida | Quanto o sistema recomenda produzir |
| Bateladas | Número de bateladas da receita para atingir a quantidade |
| Observações | Notas automáticas ou manuais |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Gera, aceita e rejeita sugestões |

---

## Depende de / Interfere em

- **PCP — Estoque** — o estoque mínimo e atual vêm de lá
- **PCP — Receitas** — só gera sugestão para itens com receita ativa
- **PCP — Ordens** — ao aceitar, uma OP é criada automaticamente

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/SugestoesProducao.jsx` | Tela de sugestões |
| `frontend/src/services/pcpSugestaoService.js` | Chamadas de API |
| `backend/src/routes/pcp/sugestoes.js` | Rotas do backend |
