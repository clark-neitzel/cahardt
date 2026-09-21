// ── Forma/conta EFETIVAS de parcelas do Contas a Receber ─────────────────────────
// Baixa que entra pela conciliação bancária ou pelo Asaas grava só o LEDGER
// (`pagamentos_parcela`); o resumo da parcela (`formaPagamento`/`contaFinanceiraCaId`)
// fica vazio. Este helper deriva, NA LEITURA (nunca escreve na parcela), a forma de
// pagamento e o nome do banco a partir do ledger não estornado — é o que permite à
// tela responder "como este título foi baixado e em que banco o dinheiro entrou".
//
// Regras:
//   • Campo preenchido na própria parcela tem precedência (a derivação só completa
//     o que falta) — assim baixa manual continua mostrando exatamente o que gravou.
//   • Mais de uma forma distinta no ledger → 'VARIAS'; mais de uma conta → 'Várias'.
//   • Custo controlado: UMA query extra (`parcelaId IN (...)`), e só para as parcelas
//     que têm pagamento e resumo incompleto — sem N+1.
//
// Contrato do chamador: cada parcela precisa vir com `id`, `formaPagamento`,
// `valorPago`, `status` e (se quiser o nome da conta gravada na própria parcela)
// a relação `contaFinanceira: { select: { nomeBanco: true } }` incluída.
const prisma = require('../config/database');

const temPagamentoAtivo = (p) =>
    Number(p.valorPago || 0) > 0 || p.status === 'PAGO' || p.status === 'PARCIAL';

/**
 * Recebe as parcelas já carregadas e devolve uma função síncrona
 * `(parcela) => { formaPagamentoEfetiva, contaNomeEfetiva }` para usar na serialização.
 */
async function mapaFormaContaEfetiva(parcelas) {
    const idsSemResumo = (parcelas || [])
        .filter(p => temPagamentoAtivo(p) && (!p.formaPagamento || !p.contaFinanceira?.nomeBanco))
        .map(p => p.id);

    const ledgerPorParcela = new Map();
    if (idsSemResumo.length > 0) {
        const linhas = await prisma.pagamentoParcela.findMany({
            where: { parcelaId: { in: idsSemResumo }, estornado: false },
            select: {
                parcelaId: true, formaPagamento: true, contaFinanceiraCaId: true,
                contaFinanceira: { select: { nomeBanco: true } }
            },
            orderBy: { dataPagamento: 'asc' }
        });
        for (const l of linhas) {
            const acc = ledgerPorParcela.get(l.parcelaId)
                || { formas: new Set(), contasIds: new Set(), nomePorConta: new Map() };
            if (l.formaPagamento) acc.formas.add(l.formaPagamento);
            if (l.contaFinanceiraCaId) {
                acc.contasIds.add(l.contaFinanceiraCaId);
                acc.nomePorConta.set(l.contaFinanceiraCaId, l.contaFinanceira?.nomeBanco || null);
            }
            ledgerPorParcela.set(l.parcelaId, acc);
        }
    }

    return (p) => {
        const acc = ledgerPorParcela.get(p.id);
        let forma = p.formaPagamento || null;
        let contaNome = p.contaFinanceira?.nomeBanco || null;
        if (!forma && acc && acc.formas.size > 0) {
            forma = acc.formas.size === 1 ? [...acc.formas][0] : 'VARIAS';
        }
        if (!contaNome && acc && acc.contasIds.size > 0) {
            contaNome = acc.contasIds.size === 1
                ? (acc.nomePorConta.get([...acc.contasIds][0]) || null)
                : 'Várias';
        }
        return { formaPagamentoEfetiva: forma, contaNomeEfetiva: contaNome };
    };
}

module.exports = { mapaFormaContaEfetiva };
