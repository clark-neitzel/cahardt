# Plano — Conciliação: vários títulos + parcial + desfazer por título (03/11/2026)

Spec visual aprovada: `docs/proposta-conciliacao-varios-parcial.html`. Porte GRANDE (financeiro).
Só linha de DÉBITO do extrato ↔ títulos do Contas a Pagar (`ParcelaPagar`). Crédito fora do escopo.

## Decisões do dono (assumidas pelas recomendações do arquiteto — dono avisado)
1. **Desfazer título** = ESTORNAR a baixa que a própria conciliação criou (título volta a "em aberto"), com confirmação clara.
2. **Modal antigo** continua acessível por link "modo avançado" (juros/multa/desconto, baixa já registrada, somar outro lançamento do banco).
3. Novo fluxo baixa sempre o **saldo inteiro** de cada título marcado; valor diferente → modo avançado.

## Regras
- Só linha `PENDENTE`/`PARCIAL` de DÉBITO. Se soma marcada > falta (+0,01) → 400 "passou do valor".
- `$transaction` com `{timeout:20000,maxWait:10000}`; AuditLog/log FORA da transação (try/catch); nada de API externa dentro.
- Schema só ADITIVO (`db push`), nunca remover campo.
- Mapa do código: `backend/services/conciliacaoBancariaService.js` (conciliarUnificado ~:2354, parcelasPagarEmAberto ~:2116, saldoParcelaPagar ~:2100, idsUsados ~:434, listar ~:1046, conciliar 1↔1 ~:1482, desfazer ~:1759, desconciliarPorBaixa ~:1821), `backend/routes/conciliacaoBancaria.js`, `backend/routes/contasPagar.js` (GRUPOS_METODO/montarFiltroMetodo ~:280-310; estorno ~:1664-1722; trava 409 ~:1609), `backend/routes/contabilidadeRoutes.js` (~:133-157, :646-711), `financeiroGerencialService.js:914`.

## Schema
1. `ExtratoLancamento.valorConciliado Decimal @default(0) @db.Decimal(12,2) @map("valor_conciliado")`; novo status string `PARCIAL` (comentar).
2. `ConciliacaoGrupo.extratoParcialId String? @map("extrato_parcial_id")` + `@@index([extratoParcialId])` (sem FK/relation).
Cada rodada "Conciliar parcial" = 1 `ConciliacaoGrupo` com `extratoParcialId=linha`, `tipo='DEBITO'`, `valor=valorBaixas=soma da rodada`, `diferenca=0`, itens só do lado baixa (`pagamentoParcelaPagarId`), sem item de extrato. Assim `idsUsados`, contabilidade e a trava 409 já enxergam as baixas.

## Rotas (`/api/conciliacao-bancaria`, mesmo `checkAcesso`)
- `GET /titulos-pagar-abertos` — query `de`,`ate` (VENCIMENTO), `condicoes` (CSV; aceita NAO_INFORMADO/OUTROS via `montarFiltroMetodo` extraído para helper compartilhado), `q` (fornecedor/descrição/nº nota/categoria), `valor`+`tol`(0|5|10|25 %, no servidor sobre o saldo). Só status PENDENTE/PARCIAL com saldo>0, ordem vencimento, limite 500 + `truncado`. Resposta: `{titulos:[{parcelaPagarId,saldo,valorParcela,numeroParcela,totalParcelas,vencimento,fornecedor,descricao,numeroNota,categoria,metodoPagamentoCA,origem,vaiAoCA}],total,somaTotal,truncado}`. Categoria = `categoriaDespesa.nome ?? categoria`.
- `GET /opcoes-varios` — condições e categorias (reaproveitar `opcoesDespesa`).
- `POST /:id/conciliar-varios` body `{parcelaPagarIds,metodoPagamento?,valorConciliadoEsperado}` → `{ok,status:'PARCIAL'|'CONCILIADO',valorConciliado,falta,message}`. Na transação: reler linha (DEBITO, PENDENTE/PARCIAL, `valorConciliado==esperado`); reler cada parcela DENTRO (recalcular saldo pelo ledger não estornado; recusar PAGO/CANCELADO/saldo<=0); soma saldos <= falta+0,01; `updateMany where {id,status in(PENDENTE,PARCIAL),valorConciliado=esperado}` (count=0 → erro "recarregue"); novo status CONCILIADO se falta<0,01 senão PARCIAL; criar `PagamentoParcelaPagar` por parcela (valorPago=saldo, dataPagamento=data da linha, contaFinanceiraCaId do extrato, origem 'MANUAL', observação "Baixa dada pela conciliação bancária", statusEnvioCA mesma regra `naCA` de ~:2527, registradoPorId, formaPagamento = metodoPagamentoCA do título ou `metodoPagamento` do body quando nulo) + `recalcularParcelaEConta(tx,id)`; criar o grupo. AuditLog `CONCILIACAO_VARIOS` fora da transação.
- `GET /:id/parciais` → `{valor,valorConciliado,falta,titulos:[{pagamentoId,grupoId,parcelaPagarId,fornecedor,descricao,valor,conciliadoEm,conciliadoPor}]}`.
- `POST /:id/desfazer-titulo` body `{pagamentoId}`: pagamento deve pertencer a grupo com `extratoParcialId=:id`; tirar item (apagar grupo se vazio); estornar a baixa (só `estornado=false`, idempotente) + `recalcularParcelaEConta`; recalcular `valorConciliado` (0→PENDENTE, >0→PARCIAL); NÃO chamar `desconciliarPorBaixa`; AuditLog `CONCILIACAO_TITULO_DESFEITO` fora da transação.

## Ajustes obrigatórios em código existente
- `listar`: devolver `valorConciliado`,`falta`,`qtdTitulos` nas linhas PARCIAL/CONCILIADAS por parciais; resumo ganha `parciais` e `valorParcialFalta`.
- `conciliar` 1↔1: guard `status !== 'PENDENTE'` (hoje só bloqueia CONCILIADO).
- `desfazer`: aceitar PARCIAL (e conciliada por parciais): apagar TODOS os grupos `extratoParcialId`, estornar as baixas criadas, zerar valorConciliado → PENDENTE.
- `desconciliarPorBaixa` (estorno em Contas a Pagar): se `grupo.extratoParcialId`, remover só esse item, recalcular a linha (PARCIAL/PENDENTE), NÃO desfazer as outras; AuditLog.
- `contabilidadeRoutes.js`: rótulo para linhas conciliadas por parciais (buscar por `extratoParcialId`, rótulo "Vários títulos") e para PARCIAL.
- `financeiroGerencialService.js:914`: contar PARCIAL nas pendências.
- Conferir que reimportação de OFX (`_gravarImportacao`) não regrava `status`/`valorConciliado`; `removerImportacao` já bloqueia != PENDENTE (manter).
- Dev-backend deve contar (diag/admin-exec ou dump) `metodoPagamentoCA IS NULL` e `categoriaDespesaId IS NULL`; filtro precisa da opção "Não informado".

## Frontend
- Service: métodos novos em `frontend/src/services/conciliacaoBancariaService.js`.
- Novo `frontend/src/pages/Financeiro/ConciliarVariosModal.jsx`, aberto a partir do `BuscarModal`/`AcoesLinha` para DÉBITO; link "modo avançado" para o modal antigo.
- Resumo+botões no TOPO (Extrato, Já conciliado, Marcado, Falta, barra; botão "Conciliar"/"Conciliar parcial"/"Passou do valor").
- Filtros numa linha: `FiltroPeriodo` + `usePeriodoSalvo('conciliacao-varios','mes')`; `MultiSelect` condição (com "Não informado"/"Outros"); busca texto (não persiste); valor aproximado com `SelectBusca` tolerância; `useFiltrosSalvos` para condições e tolerância.
- Tabela desktop (largura total, colunas: vencimento, fornecedor+NF, categoria, condição, parcela, origem, valor) / cards mobile (44px, sem scroll horizontal). Seleção guardada num `Map id→título` (mantém entre filtros) + contador "N marcados fora do filtro". Sugestão "N títulos fecham o valor exato" (subset-sum em centavos, limitado a ~30 candidatos/teto de estados, nunca bloqueia).
- Continuar-depois: bloco "Já conciliado" com "Desfazer" (confirmação).
- Página: opção `PARCIAL` no filtro de status; card "Parciais"; badge amarelo; "Já conciliado R$ X · falta R$ Y"; botão "Continuar"; "Desfazer" da linha PARCIAL com aviso; tratar PARCIAL em `DescricaoBanco`.
- `npm run build`. Docs: `backend/manuais/abas/conciliacao-bancaria.md`, `frontend/public/novidade-<slug>.html` (mockups com legendas, accordions abertos, sem og:image, sem botão "Abrir o app") + topo de `novidades.json` + texto de WhatsApp.

## Não pode quebrar
Conciliar 1↔1, "somar outro lançamento", baixa já registrada, crédito/Asaas `pay_`, grupo com diferença/tarifa, auto-conciliar/ignorar/transferir/despesas em lote (só PENDENTE), remover importação bloqueada com PARCIAL, estorno em Contas a Pagar/Receber e trava 409, Contabilidade, Saldos por Conta.

## Aceite (clicando)
1) 7 títulos somando o valor → sugestão → Conciliado, títulos PAGOS. 2) soma menor → "Conciliar parcial" → linha Parcial, card Parciais, filtro. 3) Continuar: travados + completar → Conciliado. 4) passar do valor bloqueado (e curl recusa). 5) desfazer título: confirma, estorna, AuditLog, outros permanecem; desfazer todos → PENDENTE. 6) estornar 1 título em Contas a Pagar mantém linha Parcial reduzida. 7) duplo clique/2 abas → 1 baixa por título. 8) filtros + persistência + "fora do filtro". 9) 375px. 10) regressões (crédito, 1↔1, ignorar, transferência, reimportar OFX, remover importação, Contabilidade). 11) build ok; manual+novidade.
