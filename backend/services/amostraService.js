const prisma = require('../config/database');
const gcal = require('./googleCalendarService');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');

const STATUS_ABERTOS = ['SOLICITADA', 'PREPARACAO', 'LIBERADO'];

// ---- Régua de urgência (ÚNICA, no backend) ----
// dataEntrega é guardada como meia-noite UTC do dia escolhido -> o dia é o slice do ISO.
const diaEntrega = (dataEntrega) => (dataEntrega ? new Date(dataEntrega).toISOString().slice(0, 10) : null);
const somarDias = (ymd, n) => {
    const d = new Date(ymd + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
// 'vermelho' (hoje/atrasada) | 'ambar' (amanhã) | 'cinza' (resto ou sem data)
const urgencia = (dataEntrega, hojeBr) => {
    const dia = diaEntrega(dataEntrega);
    if (!dia) return 'cinza';
    if (dia <= hojeBr) return 'vermelho';
    if (dia === somarDias(hojeBr, 1)) return 'ambar';
    return 'cinza';
};
const PESO_URG = { vermelho: 0, ambar: 1, cinza: 2 };
const ordenarPorUrgencia = (lista) => lista.sort((a, b) =>
    (PESO_URG[a.urgencia] - PESO_URG[b.urgencia])
    || ((a.dataEntregaDia || '9999') < (b.dataEntregaDia || '9999') ? -1 : (a.dataEntregaDia || '9999') > (b.dataEntregaDia || '9999') ? 1 : 0)
    || (a.numero - b.numero));
const aberta = (a) => STATUS_ABERTOS.includes(a.status) && !a.embarqueId;

const amostraService = {

    criar: async ({ leadId, clienteId, dataEntrega, observacao, solicitadoPorId, itens }) => {
        const criada = await prisma.amostra.create({
            data: {
                leadId: leadId || null,
                clienteId: clienteId || null,
                dataEntrega: dataEntrega ? new Date(dataEntrega) : null,
                observacao: observacao || null,
                solicitadoPorId,
                itens: {
                    create: itens.map(item => ({
                        produtoId: item.produtoId,
                        quantidade: item.quantidade,
                        nomeProduto: item.nomeProduto || `Amostra - ${item.nome || ''}`,
                    }))
                }
            },
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
            }
        });
        // Agenda "Produção" (Google Calendar): best-effort, nunca bloqueia a criação.
        gcal.disparar(gcal.sincronizarAmostra, criada.id);
        return criada;
    },

    listar: async (filtros = {}) => {
        const { status, solicitadoPorId, leadId, clienteId, semCarga, dataEntregaDe, dataEntregaAte, createdAtDe, createdAtAte, busca } = filtros;
        
        const where = {};
        if (status) where.status = status;
        if (solicitadoPorId) where.solicitadoPorId = solicitadoPorId;
        if (leadId) where.leadId = leadId;
        if (clienteId) where.clienteId = clienteId;
        // Só abertas sem carga (esquecidas). Combina com a visibilidade (solicitadoPorId) do controller.
        if (semCarga) {
            where.embarqueId = null;
            where.status = status && STATUS_ABERTOS.includes(status) ? status : { in: STATUS_ABERTOS };
        }

        // Filtro por Data de Entrega
        if (dataEntregaDe || dataEntregaAte) {
            where.dataEntrega = {};
            if (dataEntregaDe) where.dataEntrega.gte = new Date(dataEntregaDe + 'T00:00:00.000Z');
            if (dataEntregaAte) where.dataEntrega.lte = new Date(dataEntregaAte + 'T23:59:59.999Z');
        }

        // Filtro por Data de Criação
        if (createdAtDe || createdAtAte) {
            where.createdAt = {};
            if (createdAtDe) where.createdAt.gte = new Date(createdAtDe + 'T00:00:00.000Z');
            if (createdAtAte) where.createdAt.lte = new Date(createdAtAte + 'T23:59:59.999Z');
        }

        // Busca Genérica
        if (busca && busca.trim() !== '') {
            const termo = busca.trim();
            const numBusca = parseInt(termo);

            where.OR = [
                { lead: { nomeEstabelecimento: { contains: termo, mode: 'insensitive' } } },
                { cliente: { Nome: { contains: termo, mode: 'insensitive' } } },
                { cliente: { NomeFantasia: { contains: termo, mode: 'insensitive' } } },
                { cliente: { Documento: { contains: termo, mode: 'insensitive' } } },
                { cliente: { End_Cidade: { contains: termo, mode: 'insensitive' } } },
                { cliente: { End_Bairro: { contains: termo, mode: 'insensitive' } } },
                { solicitadoPor: { nome: { contains: termo, mode: 'insensitive' } } },
                !isNaN(numBusca) ? { numero: numBusca } : null,
                // Prefixo AM#
                termo.toLowerCase().startsWith('am#') && !isNaN(parseInt(termo.substring(3)))
                    ? { numero: parseInt(termo.substring(3)) } : null,
            ].filter(Boolean);
        }

        const lista = await prisma.amostra.findMany({
            where,
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                embarque: { select: { id: true, numero: true } },
                // id: sem ele a ficha rápida do cliente (ClientePopup) não consegue buscar o
                // cadastro completo do lead ao ser aberta a partir do card da amostra.
                lead: { select: { id: true, nomeEstabelecimento: true, numero: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true, End_Bairro: true } },
            },
            orderBy: { createdAt: 'desc' }
        });
        const hoje = getDataReferencia();
        return lista.map(a => ({
            ...a,
            dataEntregaDia: diaEntrega(a.dataEntrega),
            urgencia: aberta(a) ? urgencia(a.dataEntrega, hoje) : null,
        }));
    },

    // Abertas (SOLICITADA/PREPARACAO/LIBERADO) sem carga, enxutas, já ordenadas por urgência.
    // Usada pela faixa de Cargas, Central de Pendências e resumo da sub-aba.
    listarAbertasSemCarga: async ({ solicitadoPorId } = {}) => {
        const where = { embarqueId: null, status: { in: STATUS_ABERTOS } };
        if (solicitadoPorId) where.solicitadoPorId = solicitadoPorId;
        const rows = await prisma.amostra.findMany({
            where,
            select: {
                id: true, numero: true, status: true, dataEntrega: true, createdAt: true, embarqueId: true,
                leadId: true, clienteId: true,
                solicitadoPor: { select: { nome: true } },
                cliente: { select: { NomeFantasia: true, Nome: true, End_Cidade: true } },
                lead: { select: { nomeEstabelecimento: true, cidade: true } },
                _count: { select: { itens: true } },
            },
        });
        const hoje = getDataReferencia();
        const lista = rows.map(a => ({
            id: a.id,
            numero: a.numero,
            etiqueta: `AM#${a.numero}`,
            status: a.status,
            dataEntregaDia: diaEntrega(a.dataEntrega),
            urgencia: urgencia(a.dataEntrega, hoje),
            tipoDestino: a.leadId && !a.clienteId ? 'lead' : 'cliente',
            destinatario: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || 'Sem destinatário',
            cidade: a.cliente?.End_Cidade || a.lead?.cidade || null,
            vendedor: a.solicitadoPor?.nome || null,
            qtdItens: a._count?.itens || 0,
            criadaEm: a.createdAt,
        }));
        return { hoje, amostras: ordenarPorUrgencia(lista) };
    },

    // Libera direto (SOLICITADA/PREPARACAO -> LIBERADO). Idempotente.
    // Retorna { codigo: 200|404|409, ... }
    liberar: async (id) => {
        const r = await prisma.amostra.updateMany({
            where: { id, status: { in: ['SOLICITADA', 'PREPARACAO'] } },
            data: { status: 'LIBERADO' },
        });
        if (r.count > 0) {
            gcal.disparar(gcal.sincronizarAmostra, id);
            return { codigo: 200, ok: true, status: 'LIBERADO', jaEstava: false };
        }
        const atual = await prisma.amostra.findUnique({ where: { id }, select: { status: true } });
        if (!atual) return { codigo: 404, error: 'Amostra não encontrada.' };
        if (atual.status === 'LIBERADO') return { codigo: 200, ok: true, status: 'LIBERADO', jaEstava: true };
        return { codigo: 409, error: 'Amostra já entregue/cancelada - não dá para liberar.' };
    },

    // Etiqueta impressa: SOLICITADA -> PREPARACAO, condicional (nunca regride).
    marcarEtiquetaImpressa: async (id) => {
        const r = await prisma.amostra.updateMany({
            where: { id, status: 'SOLICITADA' },
            data: { status: 'PREPARACAO' },
        });
        if (r.count > 0) {
            gcal.disparar(gcal.sincronizarAmostra, id);
            return { codigo: 200, ok: true, status: 'PREPARACAO', avancou: true };
        }
        const atual = await prisma.amostra.findUnique({ where: { id }, select: { status: true } });
        if (!atual) return { codigo: 404, error: 'Amostra não encontrada.' };
        return { codigo: 200, ok: true, status: atual.status, avancou: false };
    },

    buscarPorId: async (id) => {
        return await prisma.amostra.findUnique({
            where: { id },
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true, unidade: true } } } },
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true, contato: true, whatsapp: true, cidade: true } }, // etiqueta da amostra p/ lead
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, End_CEP: true, Telefone_Celular: true, Telefone: true } },
            }
        });
    },

    atualizarStatus: async (id, novoStatus) => {
        const statusValidos = ['SOLICITADA', 'PREPARACAO', 'LIBERADO', 'ENTREGUE', 'CANCELADA'];
        if (!statusValidos.includes(novoStatus)) {
            throw new Error(`Status inválido: ${novoStatus}`);
        }
        const atualizada = await prisma.amostra.update({
            where: { id },
            data: { status: novoStatus }
        });
        gcal.disparar(gcal.sincronizarAmostra, id); // agenda Produção: cria/atualiza (preparação/liberada) ou apaga (solicitada/cancelada)
        return atualizada;
    },

    excluir: async (id, { forceAdmin = false } = {}) => {
        const amostra = await prisma.amostra.findUnique({ where: { id } });
        if (!amostra) throw new Error('Amostra não encontrada.');
        if (amostra.status === 'ENTREGUE' && !forceAdmin) {
            throw new Error('Não é possível excluir uma amostra já entregue.');
        }
        const removida = await prisma.$transaction(async (tx) => {
            await tx.amostraItem.deleteMany({ where: { amostraId: id } });
            await tx.atendimento.updateMany({ where: { amostraId: id }, data: { amostraId: null } });
            return await tx.amostra.delete({ where: { id } });
        }, { timeout: 20000, maxWait: 10000 });
        if (amostra.gcalEventId) gcal.disparar(gcal.removerEvento, amostra.gcalEventId); // fora da transação
        return removida;
    },

    // Amostras com status LIBERADO e sem embarque (para embarcar)
    listarDisponiveis: async () => {
        return await prisma.amostra.findMany({
            where: {
                status: 'LIBERADO',
                embarqueId: null
            },
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
            },
            orderBy: { createdAt: 'asc' }
        });
    },
};

amostraService.STATUS_ABERTOS = STATUS_ABERTOS;
amostraService.diaEntrega = diaEntrega;
amostraService.urgencia = urgencia;
amostraService.somarDias = somarDias;
amostraService.ordenarPorUrgencia = ordenarPorUrgencia;

module.exports = amostraService;
