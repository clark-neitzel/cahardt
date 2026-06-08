---
aba: PCP — Calendário de Produção
rota: /pcp/calendario
permissao: admin ou acesso ao módulo PCP
---

# PCP — Calendário de Produção

## O que é

Visão de calendário para planejar e acompanhar a produção ao longo do tempo. Permite associar ordens de produção a datas/horários específicos, facilitando a programação da fábrica. Os eventos podem ser criados manualmente ou gerados automaticamente pelas ordens.

---

## O que dá pra fazer aqui

- Ver os eventos de produção em visualização mensal, semanal ou por dia
- Criar novos eventos associados a ordens de produção
- Mover eventos no calendário arrastando (drag and drop)
- Redimensionar eventos para ajustar a duração
- Clicar em um evento para ver detalhes (ordem vinculada, status, observações)
- Excluir eventos manuais

---

## Como fazer (passo a passo real)

### Agendar uma ordem no calendário
1. Clique em um slot de horário/dia vazio no calendário
2. O modal de criação abre
3. Selecione a ordem de produção que quer agendar (filtra por PLANEJADA e EM_PRODUCAO)
4. Dê um título ao evento e escolha a cor
5. Adicione observações (opcional)
6. Salve

### Mover um evento
1. Arraste o evento para outro dia ou horário
2. O sistema atualiza automaticamente as datas

### Ajustar duração
1. Arraste a borda inferior do evento para cima ou para baixo
2. A duração atualiza automaticamente

### Ver detalhes de um evento
- Clique no evento
- Um modal mostra: título, ordem vinculada, status da ordem, período e observações

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Gerencia o calendário |

---

## Depende de / Interfere em

- **PCP — Ordens** — os eventos são vinculados às ordens de produção
- **PCP — Painel Operacional** — o calendário complementa o painel de execução

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/CalendarioProducao.jsx` | Calendário com FullCalendar |
| `frontend/src/services/pcpAgendaService.js` | Chamadas de API para a agenda |
| `backend/src/routes/pcp/agenda.js` | Rotas do backend |
