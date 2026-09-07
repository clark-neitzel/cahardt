/**
 * Classificação de ORIGEM de uma linha de `pagamentos_parcela` — ponto único, extraído
 * de `adminExec.js` (rota `GET /diag-baixas-origem`, criada antes da coluna `origem`
 * existir) para ser reusado pelo retroativo "Pix comum/cartão SEM banco" (09/2026,
 * `POST/GET /admin-exec/reverter-baixas-sem-banco`).
 *
 * Prioriza a coluna `origem` (gravada por todo caminho novo desde a Fase 0 do ledger).
 * Baixas antigas sem `origem` caem no fallback por regex na `observacao` — cada rotina
 * grava um texto característico; ver os comentários abaixo linha a linha.
 */

/** Caminho pelo qual a baixa entrou: CAIXA_ROTA | CAIXA_BAIXA_CA | CONCILIACAO | ASAAS |
 *  CA_EXTRATO | SYNC_CA | DEVOLUCAO | MANUAL_CONTAS_RECEBER. */
function classificarOrigemPagamento(p) {
    if (p.origem) return p.origem === 'MANUAL' ? 'MANUAL_CONTAS_RECEBER' : p.origem;
    const obs = p.observacao || '';
    if (/^Cobran[çc]a em rota/i.test(obs)) return 'CAIXA_ROTA';
    if (/^Motorista:.*\| Caixa:/i.test(obs) || /^Baixa caixa - /i.test(obs)) return 'CAIXA_BAIXA_CA';
    if (/conciliação bancária/i.test(obs)) return 'CONCILIACAO';
    if (/^Pago via .*\(pay_/i.test(obs)) return 'ASAAS';
    if (/Baixa espelhada do Conta Azul/i.test(obs)) return 'CA_EXTRATO';
    if (/Baixa sincronizada do Conta Azul/i.test(obs)) return 'SYNC_CA';
    if (Number(p.valorRecebido) <= 0 && Number(p.valorDesconto) > 0) return 'DEVOLUCAO';
    return 'MANUAL_CONTAS_RECEBER';
}

/** A forma de pagamento é (variação de) Dinheiro/espécie? */
const ehDinheiroPagamento = (formaPagamento) => /dinheiro|especie|espécie/i.test(String(formaPagamento || ''));

/** A forma de pagamento é (variação de) Pix comum — nunca PIX Asaas, que tem rótulo próprio. */
const ehPixComumPagamento = (formaPagamento) => {
    const f = String(formaPagamento || '').toLowerCase();
    return f.includes('pix') && !f.includes('asaas');
};

/** A forma de pagamento é (variação de) Cartão (débito/crédito)? */
const ehCartaoPagamento = (formaPagamento) => /cart[ãa]o/i.test(String(formaPagamento || ''));

module.exports = {
    classificarOrigemPagamento,
    ehDinheiroPagamento,
    ehPixComumPagamento,
    ehCartaoPagamento
};
