---
aba: Dashboard PCP
rota: /pcp/dashboard
permissao: pcp.sugestoes
---

# Dashboard PCP

## O que é

Painel de visão geral do módulo de produção. Exibe os principais números em tempo real: quantidade de ordens por status, volume produzido na semana, sugestões pendentes e lista de itens abaixo do estoque mínimo. Os cards são clicáveis e levam direto para a tela correspondente.

Não há filtros de período — os dados refletem a situação atual (ordens abertas) e a semana corrente (produção finalizada).

## O que dá pra fazer aqui

- Ver os KPIs principais do PCP num único lugar
- Identificar rapidamente quantas ordens precisam de atenção
- Ver o volume produzido na semana atual
- Ver quais itens estão abaixo do estoque mínimo com o déficit calculado
- Navegar para as telas de ordens, painel ou sugestões clicando nos cards

## KPIs exibidos

| KPI | O que mostra | Clicando vai para |
|-----|-------------|------------------|
| Planejadas | Ordens com status PLANEJADA (aguardando início) | `/pcp/ordens` |
| Em Produção | Ordens com status EM_PRODUCAO | `/pcp/painel` |
| Finalizadas | Total geral de ordens concluídas (histórico) | — |
| Sugestões Pendentes | Sugestões aguardando aceite ou rejeição | `/pcp/sugestoes` |

## Seções do painel

### Produção da Semana
Mostra o total de unidades produzidas e o número de ordens finalizadas na semana atual.

### Resumo de Ordens
Gráfico de barras horizontais com o total de ordens em cada status (Planejadas, Em Produção, Finalizadas, Canceladas) e o percentual de cada uma em relação ao total.

### Itens Abaixo do Estoque Mínimo
Só aparece se houver itens em situação crítica. Tabela com:
- Nome do item
- Tipo (MP, SUB, PA, EMB)
- Estoque atual
- Estoque mínimo
- Déficit (quanto está faltando, em vermelho)

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver o dashboard | `pcp.sugestoes` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.sugestoes`.

> A permissão usada é `pcp.sugestoes` (mesma das sugestões) — não há permissão separada para o dashboard.

## Depende de / Interfere em

- **Ordens de Produção**: os números de planejadas, em produção e finalizadas vêm das ordens.
- **Painel de Produção**: o KPI "Em Produção" leva para o painel.
- **Sugestões**: o contador "Pendentes" vem das sugestões não decididas.
- **Estoque PCP**: os itens abaixo do mínimo vêm do estoque PCP.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/DashboardPcp.jsx` | Tela do dashboard com KPIs, gráfico e tabela de alertas |
| `frontend/src/services/pcpSugestaoService.js` | Método `dashboard()` que busca todos os KPIs numa única chamada |
