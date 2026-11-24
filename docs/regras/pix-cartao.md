# Pix comum e cartão — processo protegido

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## Pix comum e cartão NUNCA quitam sozinhos — baixa real só nasce na Conciliação (PROCESSO SENSÍVEL, NÃO QUEBRAR)

> Regra do dono, pedida em 09/2026: até então, Pix comum e cartão informados no Caixa (conferência
> de entregas, especial ou normal, e Cobrança em Rota) **quitavam a parcela na hora**, com
> `contaFinanceiraCaId: null` — o próprio código antigo chamava isso de baixa "SEM banco". O dono
> decidiu que **nenhuma baixa existe sem vínculo com uma conta financeira real**. Qualquer mudança
> aqui precisa preservar TODOS os comportamentos abaixo.

**O que quita sozinho, e o que não quita mais:**
- **Dinheiro** (entra na Caixinha) e **PIX Asaas** (entra na conta do Asaas) — continuam quitando na
  hora, porque já têm um banco de verdade no momento do clique. Sem mudança.
- **Pix comum, cartão, e qualquer forma nova que apareça amanhã** — não quitam mais. Ficam só
  **INFORMADAS**: a linha nasce em `pagamentos_parcela` com `confirmado: false` e
  `contaFinanceiraCaId: null` (nunca se chuta conta). Só vira baixa de verdade — soma em
  `parcela.valorPago`/`status` — quando a **Conciliação Bancária** casa o valor com o extrato,
  virando `confirmado: true` com a conta real.

**Onde nasce essa decisão (ponto único, não duplicar a lógica):**
`backend/services/recebimentoEntregaService.js` → `classificarBaixaPorForma({ formaNome, ehPixAsaas,
contaEspecieId, contaAsaasCaId })` devolve `{ contaCaId, confirmado }`. Reusado nos **três** ramos do
Caixa (`backend/routes/caixa.js`): conferência de especial, conferência de normal/Faturado CA
(implementação **duplicada de propósito**, documentada no próprio arquivo — não foi unificada com
`aplicarRecebimentoEntrega` por risco de mexer num ramo já em produção sem banco local para testar
de ponta a ponta) e `/cobrancas-rota/baixar`.

**Onde a baixa é confirmada:** `backend/services/conciliacaoBancariaService.js` →
`corrigirContaBaixa` (RECEBER): ao dar a conta do extrato a uma linha `confirmado:false`, ela também
vira `confirmado:true` e `recalcularParcelaReceber` recompõe a parcela na hora.

**Travas que devem permanecer:**
- **O Caixa NUNCA pode travar por causa de Pix/cartão aguardando.** É o ponto mais frágil deste
  desenho — o "quita sozinho, mesmo sem conta" que existia antes resolvia exatamente isso.
  `ContaReceber.aguardandoConciliacao` (recalculado sempre que o ledger muda) é o que permite ao
  Caixa (`caixa.js: contaSemPendenciaDeCaixa`) tratar o pedido como "processado" mesmo com a conta
  ainda ABERTO/PARCIAL — **NÃO** foi reaproveitado `pedido.baixaCaRealizada` para isso (esse campo
  tem outro significado em `kitFestaService.sincronizarPagamentos`, que gera crédito de indicação do
  Kit Festa; reusá-lo geraria crédito antes da hora).
- **Cliente que pagou em Pix/cartão e está aguardando NÃO é inadimplente.** Não bloqueia venda nova,
  não entra na régua de cobrança nem no painel de inadimplentes. `recebimentoEntregaService
  .contasAguardandoConferencia` / `idsContasEmEsperaDeConferencia` cobrem isso desde 09/2026 tanto
  para pedido **especial** quanto **normal** (antes só cobriam especial — Pix comum de especial
  quitava na hora e o normal nunca precisou dessa proteção).
- **Idempotência por fila** (mesmo padrão de `aplicarRecebimentoEntrega`): reprocessar o mesmo
  pedido no Caixa não duplica a linha "aguardando" — o ramo normal-local precisou ganhar essa trava
  do zero (antes não precisava: Pix comum quitava e a parcela saía de "abertas" sozinha).
- **Toda soma de `pagamentoParcela.valorRecebido` tratada como "dinheiro já confirmado" precisa
  filtrar `confirmado: true`** (além do já existente `estornado: false`) — senão relatórios (Fluxo de
  Caixa, "quitado no mês", contabilidade) contam Pix/cartão que ainda pode não bater no extrato.
  Diagnósticos (`adminExec.js`) fazem o oposto: **mostram** `confirmado` como informação, nunca
  escondem a linha.
- **Nunca confundir com "responsável pela cobrança"** (`ehResponsavelPelaCobranca` — vendedor/
  escritório/motorista assumiu a cobrança, dinheiro nunca passou por ninguém) nem com "especial
  aguardando conferência do Caixa" (dinheiro já confirmado, só falta o clique de processar). São
  **três conceitos diferentes** que não podem virar o mesmo `if`.

**Retroativo (09/2026) — CONCLUÍDO.** O dono confirmou em 24/11/2026 que a reversão das baixas antigas sem
banco já foi feita, e a simulação em produção no mesmo dia (`GET /api/admin-exec/reverter-baixas-sem-banco`,
de 01/01 a 24/11/2026) devolveu **0 baixas a reverter**. Nada mais a rodar. A rota continua existindo
(simulação no `GET`, execução no `POST` com os ids da simulação, idempotente) só como ferramenta de
conferência; não rodar o `POST` sem pedido do dono.

**Regras ao mexer nestes arquivos:**
1. **Nunca** deixar Pix comum/cartão quitar sozinho de novo em nenhum dos três ramos do Caixa.
2. **Nunca** deixar o Caixa travar no fechamento por causa de um pedido só com Pix/cartão aguardando
   — teste explicitamente fechando um dia só com esse cenário.
3. **Nunca** tratar cliente aguardando conciliação como inadimplente.
4. Ao criar um relatório/soma novo sobre `pagamentoParcela`, decidir explicitamente se `confirmado`
   entra no filtro (dinheiro contado) ou só aparece como coluna (diagnóstico).
