// Resumo do checklist de veículo para o card do Caixa (GET /caixa/diario) e lista "hoje" dos Veículos.
// Arquivo separado do checklistVeiculoService para não colidir com a Parte A. Só leitura; nunca lança para o Caixa
// (quem chama deve mesmo assim usar try/catch).
const prisma = require('../config/database');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');
const { CHECKLIST_INICIO } = require('./checklistAvisosService');

const arr = (j) => (Array.isArray(j) ? j : []);

function contar(c) {
    const fotos = c.fotos || [];
    return {
        fotosTotal: fotos.length,
        problemasTotal: arr(c.problemas).filter((p) => p && p.gravidade !== 'PERGUNTA').length,
        discordancias: fotos.filter((f) => f.aceitaPeloMotorista).length,
        perguntasNao: fotos.reduce((n, f) => n + arr(f.problemas).filter((p) => p && p.resposta === 'NAO').length, 0),
    };
}

const selectFotos = { where: { ativa: true, complemento: false }, select: { problemas: true, aceitaPeloMotorista: true } };

// Contrato 5.11: { checklist: {...}|null, checklistEsperado: bool }
async function resumoParaCaixa({ diarioId, veiculoId, dataReferencia, modo }) {
    const vazio = { checklist: null, checklistEsperado: false };
    if (!diarioId || !veiculoId) return vazio;
    const { getModo } = require('./checklistVeiculoService');
    const modoAtual = await getModo();
    const hoje = getDataReferencia();
    const esperado = modo === 'PRESENCIAL' && !!veiculoId && dataReferencia >= CHECKLIST_INICIO
        && (dataReferencia < hoje || modoAtual !== 'DESLIGADO');
    const c = await prisma.checklistVeiculo.findFirst({
        where: { diarioId, veiculoId },
        orderBy: { criadoEm: 'desc' },
        select: { id: true, veredito: true, decisao: true, modo: true, concluidoEm: true, problemas: true, fotos: selectFotos },
    });
    if (!c) return { checklist: null, checklistEsperado: esperado };
    return {
        checklist: {
            id: c.id, veredito: c.veredito, decisao: c.decisao, modo: c.modo,
            ...contar(c), concluidoEm: c.concluidoEm,
        },
        checklistEsperado: esperado,
    };
}

// Contrato 5.9: veículos que saíram hoje (diário PRESENCIAL) ou têm rascunho hoje. Duas consultas, sem N+1.
async function checklistsHoje() {
    const dia = getDataReferencia();
    const [diarios, checklists] = await Promise.all([
        prisma.diarioVendedor.findMany({
            where: { dataReferencia: dia, modo: 'PRESENCIAL', veiculoId: { not: null } },
            select: { id: true, veiculoId: true, vendedor: { select: { id: true, nome: true } } },
            orderBy: { inicioHora: 'asc' },
        }),
        prisma.checklistVeiculo.findMany({
            where: { dataReferencia: dia, momento: 'SAIDA' },
            select: {
                id: true, diarioId: true, veiculoId: true, status: true, veredito: true, decisao: true, criadoEm: true,
                problemas: true, vendedor: { select: { id: true, nome: true } }, fotos: selectFotos,
            },
            orderBy: { criadoEm: 'desc' },
        }),
    ]);
    const porVeiculo = new Map();
    const dto = (c) => {
        const n = contar(c);
        return { id: c.id, status: c.status, veredito: c.veredito, decisao: c.decisao,
            fotosTotal: n.fotosTotal, problemasTotal: n.problemasTotal, discordancias: n.discordancias, criadoEm: c.criadoEm };
    };
    for (const d of diarios) {
        const c = checklists.find((x) => x.diarioId === d.id && x.veiculoId === d.veiculoId);
        porVeiculo.set(d.veiculoId, { veiculoId: d.veiculoId, emUso: true, motorista: d.vendedor, checklist: c ? dto(c) : null });
    }
    for (const c of checklists) {
        if (porVeiculo.has(c.veiculoId)) continue;
        if (c.status === 'RASCUNHO' && c.fotos.length === 0) continue;
        porVeiculo.set(c.veiculoId, { veiculoId: c.veiculoId, emUso: false, motorista: c.vendedor, checklist: dto(c) });
    }
    return { dataReferencia: dia, itens: [...porVeiculo.values()] };
}

module.exports = { resumoParaCaixa, checklistsHoje };
