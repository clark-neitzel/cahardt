---
aba: PCP — Dashboard
rota: /pcp/dashboard
permissao: admin ou acesso ao módulo PCP
---

# PCP — Dashboard

## O que é

Painel de visão geral do módulo de PCP (Planejamento e Controle de Produção). Exibe os principais indicadores de produção: quantas ordens estão em cada status, volume produzido na semana, e quais itens estão abaixo do estoque mínimo. Os cards são clicáveis e levam para as telas específicas.

---

## O que dá pra fazer aqui

- Ver quantas ordens estão Planejadas, Em Produção e Finalizadas
- Ver quantas sugestões de produção estão pendentes de decisão
- Ver o volume total produzido na semana atual (em unidades)
- Ver quais itens estão abaixo do estoque mínimo com déficit calculado
- Navegar rapidamente para as ordens ou sugestões clicando nos cards

---

## KPIs do painel

| KPI | O que mostra |
|-----|-------------|
| Planejadas | Ordens criadas aguardando início |
| Em Produção | Ordens iniciadas no chão de fábrica |
| Finalizadas | Total histórico de ordens concluídas |
| Sugestões Pendentes | Sugestões de produção aguardando aceite/rejeição |
| Produção da Semana | Volume (unidades) produzido nas últimas ordens finalizadas desta semana |

---

## Como fazer (passo a passo real)

### Navegar pelos KPIs
- Clique em **Planejadas** para ir à lista de ordens planejadas
- Clique em **Em Produção** para ir ao Painel Operacional
- Clique em **Sugestões Pendentes** para ir às sugestões

### Ver itens abaixo do mínimo
- Se houver itens críticos, um card vermelho aparece na parte inferior com a tabela de déficit
- Mostra: item, tipo, estoque atual, mínimo e quantidade em falta

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Acessa o dashboard |

---

## Depende de / Interfere em

- **PCP — Ordens** — os números de planejadas/em produção/finalizadas vêm de lá
- **PCP — Sugestões** — o contador de pendentes vem das sugestões não decididas
- **PCP — Estoque** — os itens abaixo do mínimo vêm do estoque PCP

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/DashboardPcp.jsx` | Tela do dashboard PCP |
| `frontend/src/services/pcpSugestaoService.js` | API de KPIs (`dashboard()`) |
| `backend/src/routes/pcp/sugestoes.js` | Rota do dashboard PCP |
