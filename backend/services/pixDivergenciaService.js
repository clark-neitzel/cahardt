// =====================================================================
// Aviso de divergência do PIX (só para financeiro/admin).
//
// Caso real: o cliente pagou um PIX "comum" (chave da empresa, fora do QR do Asaas) e o
// Caixa registrou a baixa, MAS não há lastro no extrato (o dinheiro não foi visto no
// banco) e nenhum QR do Asaas do pedido foi pago. Alguém precisa conferir se o PIX
// realmente entrou. É só um AVISO de leitura — não bloqueia nada.
//
// A regra é uma função PURA (`calcularAvisoDivergencia`), testável sem banco.
// `carregarBaixasDoPedido` é a parte que lê o banco (e reaproveita as consultas de
// lastro do diag-pedido-financeiro: ExtratoLancamento + ConciliacaoGrupoItem).
// =====================================================================
const { ehPixComumPagamento } = require('./pagamentoOrigemService');

const ORIGENS_CAIXA = ['CAIXA_BAIXA_CA', 'CAIXA_ROTA'];

const brl = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

/**
 * @param {Array<{valor:number, em:Date|string|null, porNome:string|null, origem:string|null,
 *   forma:string|null, caixaData:string|null, temLastro:boolean, estornado:boolean, motorista?:string|null}>} baixas
 * @param {Array<{status:string}>} cobrancasAsaas
 * @returns {null | {valor:number, baixadoEm:any, baixadoPorNome:string|null, caixaData:string|null, motorista:string|null, mensagem:string}}
 */
function calcularAvisoDivergencia(baixas, cobrancasAsaas) {
    if ((cobrancasAsaas || []).some(c => c.status === 'RECEBIDO')) return null;
    const candidatas = (baixas || []).filter(b =>
        !b.estornado && ehPixComumPagamento(b.forma) && ORIGENS_CAIXA.includes(b.origem));
    if (!candidatas.length) return null;
    if (candidatas.some(b => b.temLastro)) return null;

    const valor = Math.round(candidatas.reduce((s, b) => s + Number(b.valor || 0), 0) * 100) / 100;
    const ultima = [...candidatas].sort((a, b) => new Date(b.em || 0) - new Date(a.em || 0))[0];
    return {
        valor,
        baixadoEm: ultima.em || null,
        baixadoPorNome: ultima.porNome || null,
        caixaData: ultima.caixaData || null,
        motorista: ultima.motorista || null,
        mensagem: `Baixa de ${brl(valor)} em PIX registrada no Caixa, sem QR do Asaas pago e sem lançamento no extrato bancário. Confira se o PIX realmente entrou na conta.`
    };
}

/**
 * Lê as baixas (PagamentoParcela) do pedido já no formato `baixasCaixa` do contrato.
 * `db` = prisma. Inclui estornadas (com estornado:true) para o histórico.
 */
async function carregarBaixasDoPedido(db, pedidoId, motorista = null) {
    const pagamentos = await db.pagamentoParcela.findMany({
        where: { parcela: { contaReceber: { pedidoId } } },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true, valorRecebido: true, formaPagamento: true, origem: true, estornado: true,
            dataPagamento: true, createdAt: true,
            registradoPor: { select: { nome: true } },
            caixaDiario: { select: { dataReferencia: true } }
        }
    });
    if (!pagamentos.length) return [];
    const ids = pagamentos.map(p => p.id);
    const [diretos, emGrupo] = await Promise.all([
        db.extratoLancamento.findMany({ where: { pagamentoParcelaId: { in: ids } }, select: { pagamentoParcelaId: true } }),
        db.conciliacaoGrupoItem.findMany({ where: { pagamentoParcelaId: { in: ids } }, select: { pagamentoParcelaId: true } })
    ]);
    const comLastro = new Set([...diretos, ...emGrupo].map(x => x.pagamentoParcelaId));
    return pagamentos.map(p => ({
        valor: Number(p.valorRecebido),
        em: p.createdAt,
        porNome: p.registradoPor?.nome || null,
        origem: p.origem || null,
        forma: p.formaPagamento || null,
        caixaData: p.caixaDiario?.dataReferencia || null,
        temLastro: comLastro.has(p.id),
        estornado: !!p.estornado,
        motorista
    }));
}

module.exports = { calcularAvisoDivergencia, carregarBaixasDoPedido };
