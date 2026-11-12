// Helpers da API /api/analytics/v1. Sem banco. Sem segredo.
const { isoNowTZ, inicioDiaSP, fimDiaSP, somaDiasISO, diffDias } = require('../utils/dataSP');

function erro(status, message, codigo) {
    const e = new Error(message);
    e.status = status;
    e.codigo = codigo || null;
    return e;
}

const num = (v) => Number(v || 0);
const dec = (v) => Math.round(num(v) * 100) / 100;

function pagina(query, { padrao = 50, max = 100 } = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    let limit = parseInt(query.limit, 10) || padrao;
    if (limit < 1) limit = 1;
    if (limit > max) limit = max;
    return { page, limit, skip: (page - 1) * limit };
}

function lista({ page, limit, total, data, extra = {} }) {
    return {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        ...extra,
        data,
    };
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * de/ate obrigatórios (YYYY-MM-DD), intervalo inclusive, teto em dias.
 * Devolve também o instante de início e fim no fuso de São Paulo.
 */
function periodoObrigatorio(query, { maxDias = 366 } = {}) {
    const de = String(query.de || '').trim();
    const ate = String(query.ate || '').trim();
    if (!ISO_DIA.test(de) || !ISO_DIA.test(ate)) {
        throw erro(400, 'Informe de e ate no formato YYYY-MM-DD.', 'PERIODO_OBRIGATORIO');
    }
    if (de > ate) throw erro(400, 'A data inicial é posterior à final.', 'PERIODO_INVALIDO');
    if (diffDias(de, ate) > maxDias) {
        throw erro(400, `O período pode ter no máximo ${maxDias} dias.`, 'PERIODO_LONGO');
    }
    return { de, ate, inicio: inicioDiaSP(de), fim: fimDiaSP(ate) };
}

function idOpcional(v, nome) {
    if (v == null || String(v).trim() === '') return null;
    const s = String(v).trim();
    if (s.length > 80 || !/^[A-Za-z0-9_-]+$/.test(s)) {
        throw erro(400, `${nome} inválido.`, 'ID_INVALIDO');
    }
    return s;
}

function texto(v, max, { obrigatorio = false, nome = 'campo' } = {}) {
    if (v == null || String(v).trim() === '') {
        if (obrigatorio) throw erro(400, `Informe ${nome}.`, 'CAMPO_OBRIGATORIO');
        return null;
    }
    const s = String(v).trim();
    if (s.length > max) throw erro(400, `${nome} passa de ${max} caracteres.`, 'CAMPO_LONGO');
    return s;
}

function dataOpcional(v, nome) {
    if (v == null || String(v).trim() === '') return null;
    const s = String(v).trim();
    if (ISO_DIA.test(s)) return new Date(`${s}T12:00:00.000-03:00`);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw erro(400, `${nome} não é uma data.`, 'DATA_INVALIDA');
    return d;
}

module.exports = {
    erro, num, dec, pagina, lista, periodoObrigatorio, idOpcional, texto, dataOpcional,
    isoNowTZ, inicioDiaSP, fimDiaSP, somaDiasISO,
};
