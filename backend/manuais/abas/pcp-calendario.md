---
aba: Calendário de Produção
rota: /pcp/calendario
permissao: pcp.agenda
---

# Calendário de Produção

## O que é

Visão de agenda para planejar a produção ao longo do tempo. Permite associar ordens de produção a datas e horários específicos. Os eventos são exibidos num calendário interativo com views de semana (padrão), dia e mês. A view padrão ao abrir é a semana atual, mostrando slots de 30 minutos entre 05h e 22h.

Existem dois tipos de evento:
- **Automáticos**: gerados pelo sistema com base na data planejada da ordem ao ser criada.
- **Manuais**: criados pelo usuário diretamente no calendário para planejar a produção num horário específico.

## O que dá pra fazer aqui

- Ver eventos de produção nas views: Semana, Dia e Mês
- Navegar entre períodos (setas e botão "Hoje")
- Criar novos eventos vinculados a ordens existentes
- Mover eventos arrastando para outro dia/horário (drag and drop)
- Redimensionar eventos arrastando a borda inferior
- Clicar em um evento para ver os detalhes (ordem vinculada, status, quantidade, observações)
- Remover eventos manuais

## Como fazer (passo a passo real)

### Criar um evento no calendário

1. Clique (ou clique e arraste) num slot de horário/dia vazio.
2. O modal **Agendar Produção** abre, mostrando o intervalo de tempo selecionado.
3. Selecione a **Ordem de Produção** — aparecem as ordens com status PLANEJADA e EM_PRODUCAO.
4. O **Título** é preenchido automaticamente no formato "OP #X — Nome da Receita". Você pode alterar.
5. Escolha uma **Cor** (preenchida automaticamente conforme o status da ordem).
6. Observações (opcional).
7. Clique em **Agendar**.

### Mover um evento

1. Clique e arraste o evento para outro dia ou horário.
2. O sistema salva a nova data/hora automaticamente ao soltar.
3. Se der erro, o evento volta para a posição original.

> Apenas eventos manuais podem ser movidos. Eventos automáticos são fixos (gerados pela data planejada da OP).

### Redimensionar a duração de um evento

1. Clique e arraste a borda inferior do evento para cima ou para baixo.
2. O novo horário de término é salvo automaticamente.

### Ver detalhes de um evento

1. Clique no evento.
2. O modal mostra: título, horário de início e fim, número e status da ordem vinculada, receita, quantidade planejada e observações.
3. Para eventos automáticos, aparece o aviso "Gerado automaticamente pela data planejada da OP".
4. Clique em **Fechar** ou fora do modal para fechar.

### Remover um evento manual

1. Clique no evento para abrir o modal de detalhe.
2. Clique em **Remover** (vermelho).
3. Confirme.

> Eventos automáticos não têm botão de remover.

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver, criar, mover, remover eventos | `pcp.agenda` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.agenda`.

## Depende de / Interfere em

- **Ordens de Produção**: os eventos são vinculados a ordens existentes. Criar um evento no calendário não cria uma nova ordem — ela já precisa existir.
- **Painel de Produção**: o calendário complementa o painel; a execução em si (iniciar, consumos, finalizar) é feita no Painel.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/CalendarioProducao.jsx` | Calendário completo com FullCalendar, modais de criar e detalhar |
| `frontend/src/services/pcpAgendaService.js` | Chamadas de API para eventos de agenda |
