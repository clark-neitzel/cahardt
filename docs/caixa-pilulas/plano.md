# Plano — Caixa Diário: setas de data + pílulas + fix "conferência de caixa sem movimento"

Mockup aprovado pelo dono: `docs/mockups/caixa-diario-navegacao.html` (referência exata de cores/ordem/comportamento).

## Decisões do gerente de projeto
- Gap `Pode_Ver_Historico_Caixa` no backend: **FORA desta entrega** (será perguntado ao dono). Não mexer.
- Rotas admin de diagnóstico/limpeza dos caixas presos na fila: **criar**, mas **não executar** em produção (dono decide).
- `podeVerOutros` = `admin || Pode_Editar_Caixa` (mesmo critério do `isAdmin` atual da tela). Não ampliar.
- Não usar `FiltroPeriodo` nesta tela (é navegação dia-a-dia, aprovada via mockup).

## Causa raiz do bug
1. `backend/routes/caixa.js` ~377-388 (`GET /resumo`) cria `CaixaDiario` ABERTO só por consultar.
2. `backend/services/caixaConferenciaWorker.js` ~26-67 (`enviarCaixasDaVirada`) envia TODO caixa ABERTO não enviado para "A conferir", sem checar movimento.
3. `caixaConferenciaService.js` ~136 já calcula `temMovimento` em `calcularValorAPrestar`, mas ninguém usa e falta `recebimentosTitulos`.
4. `routes/caixa.js` ~888 `conferenciaDinheiroPendente` também ignora movimento → caixa de R$0 trava o fechamento.

## Backend (dev-backend)
1. `caixaConferenciaService.js`
   - Função pura exportada `temMovimentoNoDia({ entregasCount, totalDespesas, adiantamento, cobrancasCount, recebimentosTitulos })` (adiantamento > 0 = TEM movimento). `calcularValorAPrestar.temMovimento` passa a usá-la (incluindo recebimentosTitulos).
   - Estender `estadoDoCaixa(caixa, valorAtual, { devolucaoPendente = false } = {})`:
     ```js
     if (!caixa) return 'ABERTO';
     if (caixa.status === 'CONFERIDO') return 'CONFERIDO';
     if (caixa.status === 'FECHADO') return 'FECHADO';
     if (caixa.dinheiroConferido) return conferenciaDesatualizada(caixa, valorAtual) ? 'A_CONFERIR' : 'A_FECHAR';
     if (caixa.enviadoConferenciaEm) return 'A_CONFERIR';
     if (devolucaoPendente) return 'DEVOLUCAO_PENDENTE';
     return 'ABERTO';
     ```
     (único call site hoje: `routes/caixa.js` ~864 — passar `{ devolucaoPendente: conferenciaDevolucaoPendente }`). Conferir no frontend que `CONFERIDO`/`DEVOLUCAO_PENDENTE` vindo de `conferenciaDinheiro.estado` não quebra nada (ex.: botões que comparam estado === 'FECHADO').
   - `resumoDoDia(data, { usuario, podeVerOutros })` — ver contrato. Valor a prestar = MESMA fórmula de `calcularValorAPrestar` (pode rodar `calcularValorAPrestar` em paralelo só para os candidatos do dia — quem tem pedido/despesa/cobrança/caixaDiario/baixa de título no dia + o próprio usuário).
2. `caixaConferenciaWorker.js` `enviarCaixasDaVirada`: antes de marcar `enviadoConferenciaEm`, `calcularValorAPrestar(c.vendedorId, c.dataReferencia, cfg)`; se `!temMovimento` → `continue` (não apaga, não muda status).
3. `routes/caixa.js`
   - `/resumo`: passar devolucaoPendente para estadoDoCaixa; `conferenciaDinheiroPendente = exigeConf && !dinheiroConferidoValido && temMovimentoNoDia(...)` (com os totais que a rota já calcula). Garantir que `/fechar` e `/conferencia-dinheiro/*` usem o mesmo critério (caixa sem movimento fecha sem conferência mesmo com a chave ligada).
   - Nova `GET /resumo-dia` depois do `router.use(checkAcessoCaixa)`.
4. `routes/adminExec.js`: `GET /diag-caixa-sem-movimento` (lista ABERTO + enviadoConferenciaEm not null + dinheiroConferido false + sem movimento) e `POST /caixa-limpar-fila-sem-movimento` (recomputa no servidor, zera só os 4 campos `enviadoConferencia*`; não toca status/valores). NÃO executar em produção.
5. Se tocar arquivo com `$transaction`: timeout 20000/maxWait 10000 (regra boy scout).

## Contrato `GET /api/caixa/resumo-dia?data=YYYY-MM-DD`
Fim de semana com soDiasUteis: mesmo formato do `/resumo` → `{ "diaSemCaixa": true, "dataSugerida": "...", "mensagem": "..." }`.

Normal:
```json
{
  "data": "2026-09-13",
  "podeVerOutros": true,
  "caixas": [
    { "vendedorId": "uuid", "vendedorNome": "Jociel", "ativo": true,
      "status": "A_CONFERIR", "valorAPrestar": 1234.56, "entregasCount": 8,
      "caixaId": "uuid-ou-null", "temMovimento": true }
  ],
  "resumoContagem": { "A_CONFERIR": 2, "DEVOLUCAO_PENDENTE": 1, "ABERTO": 3, "A_FECHAR": 1, "FECHADO": 4, "CONFERIDO": 6 },
  "pendenciasAnteriores": [ { "data": "2026-09-11", "qtd": 2 } ]
}
```
- `status` ∈ `A_CONFERIR | DEVOLUCAO_PENDENTE | ABERTO | A_FECHAR | FECHADO | CONFERIDO` (produzido por estadoDoCaixa).
- `caixas` sempre inclui o próprio usuário (mesmo sem movimento); outros só com `temMovimento: true` e só se `podeVerOutros`. Caixa FECHADO/CONFERIDO de outro vendedor no dia também entra (teve movimento).
- Ordem: A_CONFERIR, DEVOLUCAO_PENDENTE, ABERTO, A_FECHAR, FECHADO, CONFERIDO; depois nome.
- `pendenciasAnteriores`: 7 dias antes da `data` pedida... (na prática: os 7 dias anteriores a HOJE, excluindo a data exibida), só dias com A_CONFERIR/DEVOLUCAO_PENDENTE; sem podeVerOutros conta só o próprio. Mais recente primeiro.
- `resumoContagem` só com chaves de contagem > 0 é aceitável; frontend trata chave ausente como 0.

## Frontend (dev-frontend)
1. `caixaService.js`: `getResumoDia: (data) => api.get('/caixa/resumo-dia', { params: { data } })`.
2. `CaixaDiarioPage.jsx` header (~636-675): barra `‹ data › + Hoje` e faixa de pílulas num componente novo `frontend/src/pages/Caixa/CaixaPilulasDia.jsx`.
   - `‹` habilitada se `podeVerHistorico`; `›` desabilitada em hoje; `Hoje` volta; clique na data abre o calendário (input date nativo, `showPicker()` com fallback).
   - Teclado ←/→ só fora de input/textarea/select/contenteditable e sem modal aberto.
   - Pílulas: avatar com iniciais, nome, status, valor a prestar (brl), ponto piscando (só `opacity`) em A_CONFERIR/DEVOLUCAO_PENDENTE; selecionada com borda `house`. Cores do mockup: A_CONFERIR `bg-[#fde68a] text-[#78350f]`(âmbar), DEVOLUCAO_PENDENTE `bg-red-100 text-red-800`, ABERTO `bg-blue-100 text-blue-800` (atenção: camada de tema Starbucks remapeia azuis legados — garantir que fica azul de fato), A_FECHAR `bg-mint text-primaryDark`, FECHADO `bg-gray-200 text-gray-700`, CONFERIDO `bg-primary text-white` com ✓.
   - Resumo com contagem por status no cabeçalho da faixa.
   - "+ outros" (só se `podeVerOutros`): reaproveita `getVendedoresDoDia` + `SelectBusca` existente.
   - Aviso amarelo de `pendenciasAnteriores` com link por dia → `setData(dia)`.
   - Recarregar a faixa ao trocar a data e depois de ações que mudam status (fechar, conferir, enviar p/ conferência, reverter).
   - Adicionar `DEVOLUCAO_PENDENTE` e garantir `CONFERIDO` em `STATUS_BADGES`.
   - Mobile 375px: faixa `overflow-x-auto hide-scrollbar`, nav de data numa linha, toques ≥44px.
3. Build: `cd frontend && npm run build` tem que passar.

## Critérios de aceite
1. Caixa sem movimento (0 entregas/despesas/adiantamento/cobrança/baixa de título) não entra na fila "A conferir" na virada.
2. Esse caixa fecha sem exigir conferência mesmo com `caixa_conferencia` ligado.
3. Caixa com movimento continua exigindo conferência como hoje.
4. Setas/Hoje/calendário funcionam; › desligada em hoje.
5. Pílulas: todos com movimento, na ordem; clique troca o caixa abaixo.
6. Sem Pode_Editar_Caixa/admin: só a própria pílula, sem "+ outros".
7. Sem permissão de histórico: setas/calendário desabilitados.
8. Aviso de dias anteriores pendentes com link que pula para o dia.
9. Caixa CONFERIDO mostra badge "Conferido".
10. Valor da pílula == "Valor a prestar" do card, em ≥3 cenários.
11. Mobile 375px sem scroll horizontal.
12. Build passa.
