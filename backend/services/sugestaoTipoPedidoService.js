// Sugestão do tipo do pedido (NORMAL x ESPECIAL) a partir do histórico do cliente.
// Regra (dono): últimos 3 pedidos (sem EXCLUIDO, sem bonificação); maioria especial => ESPECIAL.
// Se a condição de pagamento não permite especial, sugere NORMAL (a aprovação recusaria o contrário).
const prisma = require('../config/database');

const JANELA = 3;

function decidir(linhas, permiteEspecial) {
    const total = linhas.length;
    const especiais = linhas.filter(l => l.especial === true).length;
    const historicoPedeEspecial = total > 0 && especiais * 2 > total;
    if (total === 0) return { sugestaoTipo: 'NORMAL', especiais: 0, total: 0, motivo: 'SEM_HISTORICO' };
    if (historicoPedeEspecial && !permiteEspecial) return { sugestaoTipo: 'NORMAL', especiais, total, motivo: 'CONDICAO_NAO_PERMITE' };
    return { sugestaoTipo: historicoPedeEspecial ? 'ESPECIAL' : 'NORMAL', especiais, total, motivo: 'HISTORICO' };
}

// Histórico bruto (últimos 3 pedidos válidos por cliente) em UMA query: Map(clienteUuid -> [{especial}]).
async function historicoLote(clienteUuids) {
    const ids = [...new Set(clienteUuids.filter(Boolean))];
    const porCliente = new Map();
    if (!ids.length) return porCliente;
    const linhas = await prisma.pedido.findMany({
        where: {
            clienteId: { in: ids },
            bonificacao: false,
            statusEnvio: { not: 'EXCLUIDO' }, // coluna NOT NULL (default ABERTO): sem risco do null
        },
        select: { clienteId: true, especial: true },
        orderBy: { createdAt: 'desc' },
    });
    for (const l of linhas) {
        const arr = porCliente.get(l.clienteId) || [];
        if (arr.length < JANELA) { arr.push(l); porCliente.set(l.clienteId, arr); }
    }
    return porCliente;
}

// Lote: itens = [{ clienteUuid, permiteEspecial }] -> array de resultados, na mesma ordem dos itens.
// (permiteEspecial é por item: dois pedidos do mesmo cliente podem ter condições diferentes.)
async function sugerirTipoPedidoLote(itens) {
    const hist = await historicoLote(itens.map(i => i.clienteUuid));
    return itens.map(i => decidir((i.clienteUuid && hist.get(i.clienteUuid)) || [], i.permiteEspecial !== false));
}

async function sugerirTipoPedido(clienteUuid, { permiteEspecial = true } = {}) {
    if (!clienteUuid) return decidir([], permiteEspecial);
    const [r] = await sugerirTipoPedidoLote([{ clienteUuid, permiteEspecial }]);
    return r;
}

// Aplica a sugestão (aditivo) nos pedidos pendentes de uma fila.
// getInfo(p) -> { clienteUuid, permiteEspecial } ; só mexe em pedidos para os quais pendente(p) é true.
async function anexarNaFila(pedidos, pendente, getInfo) {
    const alvo = pedidos.filter(pendente);
    const res = await sugerirTipoPedidoLote(alvo.map(getInfo));
    alvo.forEach((p, i) => {
        const r = res[i];
        p.sugestaoTipo = r.sugestaoTipo;
        p.historicoTipos = { especiais: r.especiais, total: r.total, motivo: r.motivo };
    });
}

module.exports = { sugerirTipoPedido, sugerirTipoPedidoLote, anexarNaFila };
