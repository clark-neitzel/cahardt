// Escritas da API dos agentes. Estreitas de propósito:
//  - atendimento (nota/tentativa de contato) na tabela que o vendedor já vê;
//  - lead (criar/atualizar), reusando leadService;
//  - sugestão com sugestaoId, status e prova de execução.
// Não cria pedido, não baixa parcela, não envia WhatsApp.
const prisma = require('../config/database');
const leadService = require('./leadService');
const {
    erro, texto, idOpcional, dataOpcional,
} = require('./analyticsComum');

const TIPOS_ATENDIMENTO = ['WHATSAPP', 'PRESENCIAL', 'VISITA', 'TELEFONE', 'LIGACAO', 'OUTROS', 'SEM_VISITA', 'NOTA', 'AMOSTRA'];
const ETAPAS_LEAD = ['NOVO', 'VISITA', 'PEDIDO', 'CONVERTIDO', 'FINALIZADO'];
const TIPOS_SUGESTAO = ['RETENCAO', 'RECOMPRA', 'UPSELL', 'CROSS_SELL', 'COBRANCA', 'PRECO', 'VISITA', 'PROSPECCAO', 'OUTRO'];
const STATUS_SUGESTAO = {
    suggested: 'SUGERIDA', sugerida: 'SUGERIDA',
    approved: 'APROVADA', aprovada: 'APROVADA',
    sent: 'ENVIADA', enviada: 'ENVIADA',
    done: 'FEITA', feita: 'FEITA',
    ignored: 'IGNORADA', ignorada: 'IGNORADA',
};

function agenteObrigatorio(agente) {
    const s = String(agente || '').trim();
    if (!s) throw erro(400, 'Informe o cabeçalho x-analytics-agent (qual agente está agindo).', 'AGENTE_OBRIGATORIO');
    if (s.length > 80 || !/^[\p{L}\p{N} ._:@-]{1,80}$/u.test(s)) {
        throw erro(400, 'x-analytics-agent inválido (até 80 caracteres: letras, números, espaço, . _ : @ -).', 'AGENTE_INVALIDO');
    }
    return s;
}

function referenciaOpcional(v) {
    if (v == null || String(v).trim() === '') return null;
    const s = String(v).trim();
    if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(s)) {
        throw erro(400, 'referencia inválida (8 a 80 caracteres: letras, números, . _ : -).', 'REFERENCIA_INVALIDA');
    }
    return s;
}

function sugestaoIdDe(v) {
    if (v == null || String(v).trim() === '') return null;
    const s = String(v).trim();
    if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(s)) {
        throw erro(400, 'sugestaoId inválido (8 a 80 caracteres: letras, números, . _ : -).', 'SUGESTAO_ID_INVALIDO');
    }
    return s;
}

async function auditar(acao, entidade, entidadeId, detalhes, agente) {
    try {
        await prisma.auditLog.create({
            data: {
                acao,
                entidade,
                entidadeId: String(entidadeId || '-').slice(0, 80),
                detalhes: JSON.stringify(detalhes).slice(0, 8000),
                usuarioId: `agente:${agente}`.slice(0, 180),
                usuarioNome: agente.slice(0, 180),
            },
        });
    } catch (e) {
        console.error('[Analytics] falha ao gravar AuditLog (operação já efetivada):', e.message);
    }
}

async function exigirVendedor(id) {
    const v = await prisma.vendedor.findUnique({ where: { id }, select: { id: true, nome: true } });
    if (!v) throw erro(404, 'Vendedor não encontrado.', 'NAO_ENCONTRADO');
    return v;
}

async function exigirCliente(id) {
    const c = await prisma.cliente.findUnique({
        where: { UUID: id },
        select: { UUID: true, Nome: true, NomeFantasia: true },
    });
    if (!c) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    return c;
}

async function exigirLead(id) {
    const l = await prisma.lead.findUnique({ where: { id }, select: { id: true, numero: true, nomeEstabelecimento: true, etapa: true } });
    if (!l) throw erro(404, 'Lead não encontrado.', 'NAO_ENCONTRADO');
    return l;
}

function publicoAtendimento(a) {
    return {
        id: a.id,
        tipo: a.tipo,
        observacao: a.observacao,
        acaoKey: a.acaoKey,
        acaoLabel: a.acaoLabel,
        clienteId: a.clienteId,
        leadId: a.leadId,
        vendedorId: a.idVendedor,
        proximaVisita: a.proximaVisita,
        criadoEm: a.criadoEm,
    };
}

function publicoSugestao(s) {
    if (!s) return null;
    return {
        id: s.id,
        sugestaoId: s.sugestaoId,
        agente: s.agente,
        tipo: s.tipo,
        titulo: s.titulo,
        texto: s.texto,
        status: s.status,
        vendedorId: s.vendedorId,
        vendedor: s.vendedor ? { id: s.vendedor.id, nome: s.vendedor.nome } : null,
        clienteId: s.clienteId,
        cliente: s.cliente ? { id: s.cliente.UUID, nome: s.cliente.NomeFantasia || s.cliente.Nome } : null,
        leadId: s.leadId,
        lead: s.lead ? { id: s.lead.id, numero: s.lead.numero, nome: s.lead.nomeEstabelecimento } : null,
        provaTexto: s.provaTexto || null,
        provaPor: s.provaPor || null,
        provaEm: s.provaEm || null,
        aprovadoPor: s.aprovadoPor || null,
        historico: Array.isArray(s.historico) ? s.historico : [],
        criadoEm: s.criadoEm,
        atualizadoEm: s.atualizadoEm,
    };
}

const INCLUDE_SUGESTAO = {
    vendedor: { select: { id: true, nome: true } },
    cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
    lead: { select: { id: true, numero: true, nomeEstabelecimento: true } },
};

async function registrarAtendimento(agenteBruto, body) {
    const agente = agenteObrigatorio(agenteBruto);
    const b = body || {};
    const clienteId = idOpcional(b.clienteId, 'clienteId');
    const leadId = idOpcional(b.leadId, 'leadId');
    const vendedorId = idOpcional(b.vendedorId, 'vendedorId');
    if (!vendedorId) throw erro(400, 'Informe vendedorId (o vendedor dono do contato).', 'CAMPO_OBRIGATORIO');
    if (!clienteId && !leadId) throw erro(400, 'Informe clienteId ou leadId.', 'CAMPO_OBRIGATORIO');
    const tipo = String(b.tipo || '').trim().toUpperCase();
    if (!TIPOS_ATENDIMENTO.includes(tipo)) {
        throw erro(400, `tipo deve ser um de: ${TIPOS_ATENDIMENTO.join(', ')}.`, 'TIPO_INVALIDO');
    }
    const observacao = texto(b.observacao, 4000, { obrigatorio: true, nome: 'observacao' });
    const acaoKey = texto(b.acaoKey, 40, { nome: 'acaoKey' });
    const acaoLabel = texto(b.acaoLabel, 120, { nome: 'acaoLabel' });
    const gpsVendedor = texto(b.gps, 80, { nome: 'gps' });
    const proximaVisita = dataOpcional(b.proximaVisita, 'proximaVisita');
    const referencia = referenciaOpcional(b.referencia);

    if (referencia) {
        // A aspa final entra na busca: "abc" não pode casar com "abcdefgh".
        const marca = `"referencia":"${referencia}"`;
        const existente = await prisma.auditLog.findFirst({
            where: { acao: 'ANALYTICS_ATENDIMENTO', detalhes: { contains: marca } },
            orderBy: { createdAt: 'desc' },
        });
        if (existente?.entidadeId) {
            const ja = await prisma.atendimento.findUnique({ where: { id: existente.entidadeId } });
            if (ja) return { atendimento: publicoAtendimento(ja), duplicado: true, agente };
        }
    }

    await exigirVendedor(vendedorId);
    if (clienteId) await exigirCliente(clienteId);
    if (leadId) await exigirLead(leadId);

    const criado = await prisma.atendimento.create({
        data: {
            tipo,
            observacao,
            acaoKey: acaoKey || 'AGENTE',
            acaoLabel: acaoLabel || 'Registro do agente comercial',
            clienteId,
            leadId,
            idVendedor: vendedorId,
            proximaVisita,
            gpsVendedor,
        },
    });

    await auditar('ANALYTICS_ATENDIMENTO', 'Atendimento', criado.id, {
        referencia, clienteId, leadId, vendedorId, tipo,
    }, agente);

    return { atendimento: publicoAtendimento(criado), duplicado: false, agente };
}

function publicoLead(l) {
    if (!l) return null;
    return {
        id: l.id,
        numero: l.numero,
        nomeEstabelecimento: l.nomeEstabelecimento,
        contato: l.contato || null,
        whatsapp: l.whatsapp || null,
        cidade: l.cidade || null,
        diasVisita: l.diasVisita || null,
        horarioAtendimento: l.horarioAtendimento || null,
        horarioEntrega: l.horarioEntrega || null,
        formasAtendimento: l.formasAtendimento || [],
        pontoGps: l.pontoGps || null,
        etapa: l.etapa,
        origemLead: l.origemLead || null,
        observacoes: l.observacoes || null,
        proximaVisita: l.proximaVisita || null,
        idVendedor: l.idVendedor || null,
        clienteId: l.clienteId || null,
        categoriaClienteId: l.categoriaClienteId || null,
        criadoEm: l.createdAt || l.criadoEm || null,
        atualizadoEm: l.updatedAt || null,
    };
}

function formasDe(v) {
    if (v == null) return undefined;
    if (!Array.isArray(v)) throw erro(400, 'formasAtendimento deve ser uma lista.', 'CAMPO_INVALIDO');
    if (v.length > 20) throw erro(400, 'formasAtendimento tem itens demais.', 'CAMPO_LONGO');
    return v.map((item, i) => {
        const s = texto(item, 40, { obrigatorio: true, nome: `formasAtendimento[${i}]` });
        return s;
    });
}

async function criarLead(agenteBruto, body) {
    const agente = agenteObrigatorio(agenteBruto);
    const b = body || {};
    const nomeEstabelecimento = texto(b.nomeEstabelecimento, 200, { obrigatorio: true, nome: 'nomeEstabelecimento' });
    const idVendedor = idOpcional(b.vendedorId || b.idVendedor, 'vendedorId');
    if (!idVendedor) throw erro(400, 'Informe vendedorId.', 'CAMPO_OBRIGATORIO');
    await exigirVendedor(idVendedor);
    const categoriaClienteId = idOpcional(b.categoriaClienteId, 'categoriaClienteId');

    let lead;
    try {
        lead = await leadService.criar({
            nomeEstabelecimento,
            contato: texto(b.contato, 120, { nome: 'contato' }),
            whatsapp: texto(b.whatsapp, 30, { nome: 'whatsapp' }),
            diasVisita: texto(b.diasVisita, 40, { nome: 'diasVisita' }),
            horarioAtendimento: texto(b.horarioAtendimento, 80, { nome: 'horarioAtendimento' }),
            horarioEntrega: texto(b.horarioEntrega, 80, { nome: 'horarioEntrega' }),
            formasAtendimento: formasDe(b.formasAtendimento) || [],
            pontoGps: texto(b.pontoGps, 80, { nome: 'pontoGps' }),
            observacoes: texto(b.observacoes, 4000, { nome: 'observacoes' }),
            idVendedor,
            cidade: texto(b.cidade, 80, { nome: 'cidade' }),
            origemLead: texto(b.origemLead, 40, { nome: 'origemLead' }) || 'AGENTE',
            categoriaClienteId,
        }, { modo: 'tolerante', origem: 'ANALYTICS' });
    } catch (e) {
        if (e?.status) throw erro(e.status, e.message || 'Não foi possível criar o lead.', e.codigo);
        throw e;
    }

    await auditar('ANALYTICS_LEAD_CRIAR', 'Lead', lead.id, { numero: lead.numero, idVendedor }, agente);
    return { lead: publicoLead(lead), agente };
}

async function atualizarLead(agenteBruto, id, body) {
    const agente = agenteObrigatorio(agenteBruto);
    const leadId = idOpcional(id, 'id');
    if (!leadId) throw erro(400, 'Informe o id do lead.', 'CAMPO_OBRIGATORIO');
    await exigirLead(leadId);
    const b = body || {};
    if (b.vendedorId || b.idVendedor) await exigirVendedor(idOpcional(b.vendedorId || b.idVendedor, 'vendedorId'));
    if (b.etapa != null && !ETAPAS_LEAD.includes(String(b.etapa).toUpperCase())) {
        throw erro(400, `etapa deve ser uma de: ${ETAPAS_LEAD.join(', ')}.`, 'ETAPA_INVALIDA');
    }

    const patch = {
        ...(b.nomeEstabelecimento !== undefined && { nomeEstabelecimento: texto(b.nomeEstabelecimento, 200, { obrigatorio: true, nome: 'nomeEstabelecimento' }) }),
        ...(b.contato !== undefined && { contato: texto(b.contato, 120, { nome: 'contato' }) }),
        ...(b.whatsapp !== undefined && { whatsapp: texto(b.whatsapp, 30, { nome: 'whatsapp' }) }),
        ...(b.diasVisita !== undefined && { diasVisita: texto(b.diasVisita, 40, { nome: 'diasVisita' }) }),
        ...(b.horarioAtendimento !== undefined && { horarioAtendimento: texto(b.horarioAtendimento, 80, { nome: 'horarioAtendimento' }) }),
        ...(b.horarioEntrega !== undefined && { horarioEntrega: texto(b.horarioEntrega, 80, { nome: 'horarioEntrega' }) }),
        ...(b.formasAtendimento !== undefined && { formasAtendimento: formasDe(b.formasAtendimento) }),
        ...(b.pontoGps !== undefined && { pontoGps: texto(b.pontoGps, 80, { nome: 'pontoGps' }) }),
        ...(b.observacoes !== undefined && { observacoes: texto(b.observacoes, 4000, { nome: 'observacoes' }) }),
        ...(b.etapa !== undefined && { etapa: String(b.etapa).toUpperCase() }),
        ...(b.proximaVisita !== undefined && { proximaVisita: b.proximaVisita ? dataOpcional(b.proximaVisita, 'proximaVisita') : null }),
        ...(b.cidade !== undefined && { cidade: texto(b.cidade, 80, { nome: 'cidade' }) }),
        ...(b.origemLead !== undefined && { origemLead: texto(b.origemLead, 40, { nome: 'origemLead' }) }),
        ...(b.categoriaClienteId !== undefined && { categoriaClienteId: idOpcional(b.categoriaClienteId, 'categoriaClienteId') }),
        ...((b.vendedorId !== undefined || b.idVendedor !== undefined) && { idVendedor: idOpcional(b.vendedorId || b.idVendedor, 'vendedorId') }),
    };

    const vincular = idOpcional(b.vincularClienteId, 'vincularClienteId');
    if (!Object.keys(patch).length && !vincular) {
        throw erro(400, 'Nada para atualizar.', 'VAZIO');
    }

    let lead = null;
    if (Object.keys(patch).length) {
        try {
            lead = await leadService.atualizar(leadId, patch, { modo: 'tolerante', origem: 'ANALYTICS' });
        } catch (e) {
            if (e?.code === 'P2025') throw erro(404, 'Lead não encontrado.', 'NAO_ENCONTRADO');
            if (e?.status) throw erro(e.status, e.message || 'Não foi possível atualizar o lead.', e.codigo);
            throw e;
        }
    }
    if (vincular) {
        await exigirCliente(vincular);
        try {
            lead = await leadService.referenciarCliente(leadId, vincular);
        } catch (e) {
            if (e?.status) throw erro(e.status, e.message || 'Não foi possível vincular o cliente.', e.codigo);
            throw e;
        }
    }

    await auditar('ANALYTICS_LEAD_ATUALIZAR', 'Lead', leadId, {
        campos: Object.keys(patch),
        vincularClienteId: vincular,
    }, agente);
    return { lead: publicoLead(lead), agente };
}

function statusDe(v) {
    if (v == null || String(v).trim() === '') return null;
    const chave = String(v).trim().toLowerCase();
    const status = STATUS_SUGESTAO[chave];
    if (!status) {
        throw erro(400, 'status deve ser suggested, approved, sent, done ou ignored (ou SUGERIDA, APROVADA, ENVIADA, FEITA, IGNORADA).', 'STATUS_INVALIDO');
    }
    return status;
}

async function criarSugestao(agenteBruto, body) {
    const agente = agenteObrigatorio(agenteBruto);
    const b = body || {};
    let sugestaoId = sugestaoIdDe(b.sugestaoId);
    if (!sugestaoId) {
        sugestaoId = `ag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    const ja = await prisma.sugestaoAgente.findUnique({ where: { sugestaoId }, include: INCLUDE_SUGESTAO });
    if (ja) return { sugestao: publicoSugestao(ja), duplicado: true, agente };

    const tipo = String(b.tipo || '').trim().toUpperCase();
    if (!TIPOS_SUGESTAO.includes(tipo)) {
        throw erro(400, `tipo deve ser um de: ${TIPOS_SUGESTAO.join(', ')}.`, 'TIPO_INVALIDO');
    }
    const titulo = texto(b.titulo, 160, { obrigatorio: true, nome: 'titulo' });
    const textoSug = texto(b.texto, 4000, { obrigatorio: true, nome: 'texto' });
    const vendedorId = idOpcional(b.vendedorId, 'vendedorId');
    const clienteId = idOpcional(b.clienteId, 'clienteId');
    const leadId = idOpcional(b.leadId, 'leadId');
    if (vendedorId) await exigirVendedor(vendedorId);
    if (clienteId) await exigirCliente(clienteId);
    if (leadId) await exigirLead(leadId);

    const agora = new Date().toISOString();
    let criada;
    try {
        criada = await prisma.sugestaoAgente.create({
            data: {
                sugestaoId,
                agente,
                tipo,
                titulo,
                texto: textoSug,
                status: 'SUGERIDA',
                vendedorId,
                clienteId,
                leadId,
                historico: [{ em: agora, status: 'SUGERIDA', agente, nota: null }],
            },
            include: INCLUDE_SUGESTAO,
        });
    } catch (e) {
        if (e?.code === 'P2002') {
            const outra = await prisma.sugestaoAgente.findUnique({ where: { sugestaoId }, include: INCLUDE_SUGESTAO });
            if (outra) return { sugestao: publicoSugestao(outra), duplicado: true, agente };
        }
        throw e;
    }

    await auditar('ANALYTICS_SUGESTAO_CRIAR', 'SugestaoAgente', criada.id, { sugestaoId, tipo, vendedorId, clienteId, leadId }, agente);
    return { sugestao: publicoSugestao(criada), duplicado: false, agente };
}

async function atualizarSugestao(agenteBruto, sugestaoIdBruto, body) {
    const agente = agenteObrigatorio(agenteBruto);
    const sugestaoId = sugestaoIdDe(sugestaoIdBruto);
    if (!sugestaoId) throw erro(400, 'Informe o sugestaoId.', 'CAMPO_OBRIGATORIO');
    const atual = await prisma.sugestaoAgente.findUnique({ where: { sugestaoId } });
    if (!atual) throw erro(404, 'Sugestão não encontrada.', 'NAO_ENCONTRADO');

    const b = body || {};
    const status = statusDe(b.status);
    const nota = texto(b.nota, 2000, { nome: 'nota' });
    const provaTexto = texto(b.provaTexto, 4000, { nome: 'provaTexto' });
    const provaPor = texto(b.provaPor, 80, { nome: 'provaPor' });
    const aprovadoPor = texto(b.aprovadoPor, 80, { nome: 'aprovadoPor' });
    if (!status && !nota && !provaTexto && !provaPor && !aprovadoPor) {
        throw erro(400, 'Informe status, nota ou prova.', 'VAZIO');
    }
    const statusFinal = status || atual.status;
    const provaFinal = provaTexto || atual.provaTexto;
    if (statusFinal === 'FEITA' && !provaFinal) {
        throw erro(400, 'Para marcar como feita (done), informe provaTexto: o que o vendedor fez.', 'PROVA_OBRIGATORIA');
    }

    const historico = Array.isArray(atual.historico) ? [...atual.historico] : [];
    historico.push({
        em: new Date().toISOString(),
        status: statusFinal,
        agente,
        nota,
        provaPor: provaPor || null,
        aprovadoPor: aprovadoPor || null,
    });
    if (historico.length > 50) historico.splice(0, historico.length - 50);

    const data = { historico, status: statusFinal };
    if (provaTexto) {
        data.provaTexto = provaTexto;
        data.provaPor = provaPor || agente;
        data.provaEm = new Date();
    } else if (provaPor) {
        data.provaPor = provaPor;
    }
    if (aprovadoPor) data.aprovadoPor = aprovadoPor;

    const salva = await prisma.sugestaoAgente.update({
        where: { sugestaoId },
        data,
        include: INCLUDE_SUGESTAO,
    });
    await auditar('ANALYTICS_SUGESTAO_STATUS', 'SugestaoAgente', salva.id, {
        sugestaoId, de: atual.status, para: statusFinal, aprovadoPor, temProva: !!provaTexto,
    }, agente);
    return { sugestao: publicoSugestao(salva), agente };
}

async function listarSugestoes(query) {
    const { pagina, lista, idOpcional: idOf } = require('./analyticsComum');
    const pg = pagina(query);
    const where = {};
    const status = statusDe(query.status);
    if (status) where.status = status;
    const vendedorId = idOf(query.vendedorId, 'vendedorId');
    const clienteId = idOf(query.clienteId, 'clienteId');
    const leadId = idOf(query.leadId, 'leadId');
    if (vendedorId) where.vendedorId = vendedorId;
    if (clienteId) where.clienteId = clienteId;
    if (leadId) where.leadId = leadId;
    if (query.agente) where.agente = agenteObrigatorio(query.agente);
    if (query.tipo) {
        const tipo = String(query.tipo).trim().toUpperCase();
        if (!TIPOS_SUGESTAO.includes(tipo)) throw erro(400, 'tipo inválido.', 'TIPO_INVALIDO');
        where.tipo = tipo;
    }
    const [total, rows] = await Promise.all([
        prisma.sugestaoAgente.count({ where }),
        prisma.sugestaoAgente.findMany({
            where,
            include: INCLUDE_SUGESTAO,
            orderBy: { criadoEm: 'desc' },
            skip: pg.skip,
            take: pg.limit,
        }),
    ]);
    return lista({ page: pg.page, limit: pg.limit, total, data: rows.map(publicoSugestao) });
}

module.exports = {
    registrarAtendimento,
    criarLead,
    atualizarLead,
    criarSugestao,
    atualizarSugestao,
    listarSugestoes,
    agenteObrigatorio,
};
