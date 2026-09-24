// Reconstrói "como era a rota do cliente" numa data PASSADA, a partir do audit_log de
// alterações de cadastro (CLIENTE_ALTERADO). Usado para caixa retroativo e dashboard
// histórico: cobrar/contar só quem realmente estava na rota naquele dia, não quem entrou
// depois (ex.: Dia_de_venda/idVendedor alterado pelo Mapa de Clientes após o caixa já ter
// acontecido). Regra do dono: "como aconteceu depois, não pode envolver no retroativo".
//
// Como funciona: para cada campo rastreado (Dia_de_venda, idVendedor), pega os logs
// CLIENTE_ALTERADO daquele cliente com createdAt depois do fim do dia (Brasília); o valor do
// campo NAQUELE DIA é o "de" do log mais antigo depois do dia (se não há log depois, vale o
// valor atual).
const prisma = require('../config/database');

const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const CAMPOS_RECONSTRUIDOS = ['Dia_de_venda', 'idVendedor'];

function siglaDoDia(dataYYYYMMDD) {
    return DIAS_SIGLA[new Date(dataYYYYMMDD + 'T12:00:00').getDay()];
}

function bateSigla(diaVenda, sigla) {
    return (diaVenda || '').toUpperCase().split(',').map(s => s.trim()).includes(sigla);
}

// Corte próprio (Brasília, sem depender do fimDia em UTC usado pelo resto do caixa/dashboard
// para outras janelas). Brasil não tem mais horário de verão (extinto em 2019) — -03:00 vale
// o ano inteiro. Uma mudança de cadastro feita entre 21h e 23h59 (horário de Brasília) do
// PRÓPRIO dia do caixa cai DEPOIS deste corte em UTC (23:59:59.999-03:00 = 02:59:59.999Z do dia
// seguinte); com fimDia em UTC puro (23:59:59.999Z = 20:59 em Brasília) ela seria tratada como
// "depois do dia" incorretamente, para um instante que ainda é do próprio dia em Brasília.
function corteFimDiaBrasilia(dataYYYYMMDD) {
    return new Date(`${dataYYYYMMDD}T23:59:59.999-03:00`);
}

/**
 * Monta, a partir dos audit_logs posteriores a `corte`, um mapa
 * { [clienteUuid]: { Dia_de_venda?: valorNoDia, idVendedor?: valorNoDia } }
 * com o valor de cada campo rastreado NO DIA (o "de" do log mais antigo após o dia).
 * Uma única query — não N+1.
 */
async function mapaHistoricoPosDia(corte) {
    const logs = await prisma.auditLog.findMany({
        where: {
            acao: 'CLIENTE_ALTERADO',
            entidade: 'Cliente',
            createdAt: { gt: corte }
        },
        select: { entidadeId: true, detalhes: true, createdAt: true },
        orderBy: { createdAt: 'asc' } // já ordenado do mais antigo pro mais novo
    });

    const mapa = {}; // clienteUuid -> { campo -> { valorNoDia, primeiraMudancaEm } }
    for (const log of logs) {
        let detalhes;
        try {
            detalhes = JSON.parse(log.detalhes || '{}');
        } catch (e) {
            continue; // log malformado, ignora
        }
        const mudancas = detalhes && detalhes.mudancas;
        if (!mudancas || typeof mudancas !== 'object') continue;

        for (const campo of CAMPOS_RECONSTRUIDOS) {
            if (!mudancas[campo]) continue;
            if (!mapa[log.entidadeId]) mapa[log.entidadeId] = {};
            const existente = mapa[log.entidadeId][campo];
            // Logs vêm ordenados por createdAt asc — o primeiro que aparece pra este
            // campo/cliente já é o mais antigo depois do dia; não sobrescreve.
            if (!existente) {
                mapa[log.entidadeId][campo] = { valorNoDia: mudancas[campo].de ?? null };
            }
        }
    }
    return mapa;
}

/**
 * Lista de clientes que estavam na rota (Dia_de_venda batendo a sigla do dia, e — se
 * vendedorId for passado — pertencendo àquele vendedor) NO DIA `dataYYYYMMDD`, reconstruída
 * a partir do cadastro atual + audit_log (não confia só no cadastro atual, que pode ter
 * mudado depois do dia do caixa).
 *
 * @param {string|null} vendedorId - id do vendedor, ou null para não filtrar por vendedor
 *                                   (uso do dashboard geral, que soma todos os vendedores).
 * @param {string} dataYYYYMMDD - data do caixa/dashboard, formato 'YYYY-MM-DD'.
 * @returns {Promise<Array<{ clienteId: string, clienteNome: string, diaVenda: string|null }>>}
 */
async function clientesDaRotaNoDia(vendedorId, dataYYYYMMDD) {
    const sigla = siglaDoDia(dataYYYYMMDD);
    // Corte próprio em Brasília — não é o `fimDia` (UTC) que o resto do caixa/dashboard usa
    // para outras janelas (entregas, atendimentos etc.); só entram na reconstrução mudanças
    // de cadastro registradas DEPOIS deste instante.
    const corte = corteFimDiaBrasilia(dataYYYYMMDD);
    const historico = await mapaHistoricoPosDia(corte);

    // Pool base: todo cliente ativo que HOJE é do vendedor (ou, se vendedorId=null, todo
    // cliente ativo) — cobre o caso normal e os "falsos positivos" que só entraram na
    // carteira depois do dia (serão removidos abaixo pela reconstrução do idVendedor).
    const whereBase = { Ativo: true };
    if (vendedorId) whereBase.idVendedor = vendedorId;
    const poolBase = await prisma.cliente.findMany({
        where: whereBase,
        select: { UUID: true, NomeFantasia: true, Nome: true, Dia_de_venda: true, idVendedor: true, Data_Criacao: true }
    });

    let pool = poolBase;

    // Quando filtrando por vendedor: também precisamos dos clientes que ERAM do vendedor
    // no dia mas hoje não são mais (idVendedor mudou depois) — não estão no poolBase porque
    // o idVendedor ATUAL já é outro. Achamos pelo histórico (de === vendedorId) e buscamos
    // o cadastro atual deles numa segunda query (ainda não é N+1: uma query por lote).
    if (vendedorId) {
        const idsJaNoPool = new Set(poolBase.map(c => c.UUID));
        const idsQueEramDoVendedor = Object.entries(historico)
            .filter(([uuid, campos]) => campos.idVendedor && campos.idVendedor.valorNoDia === vendedorId && !idsJaNoPool.has(uuid))
            .map(([uuid]) => uuid);
        if (idsQueEramDoVendedor.length > 0) {
            const extras = await prisma.cliente.findMany({
                where: { UUID: { in: idsQueEramDoVendedor }, Ativo: true },
                select: { UUID: true, NomeFantasia: true, Nome: true, Dia_de_venda: true, idVendedor: true, Data_Criacao: true }
            });
            pool = pool.concat(extras);
        }
    }

    const resultado = [];
    for (const c of pool) {
        const hist = historico[c.UUID];

        // idVendedor no dia: se há mudança registrada depois do dia, vale o "de"; senão o atual.
        const idVendedorNoDia = (hist && hist.idVendedor) ? hist.idVendedor.valorNoDia : c.idVendedor;
        if (vendedorId && idVendedorNoDia !== vendedorId) continue; // não era desse vendedor no dia

        // Cliente criado depois do dia do caixa não entra.
        if (c.Data_Criacao && c.Data_Criacao > corte) continue;

        // Dia_de_venda no dia: idem.
        const diaVendaNoDia = (hist && hist.Dia_de_venda) ? hist.Dia_de_venda.valorNoDia : c.Dia_de_venda;
        if (!bateSigla(diaVendaNoDia, sigla)) continue;

        resultado.push({
            clienteId: c.UUID,
            clienteNome: c.NomeFantasia || c.Nome,
            diaVenda: diaVendaNoDia
        });
    }
    return resultado;
}

module.exports = { clientesDaRotaNoDia, siglaDoDia, bateSigla };
