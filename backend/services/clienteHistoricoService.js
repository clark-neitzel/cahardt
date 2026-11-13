// Histórico de alterações do cliente (quem mudou o quê, quando, de onde).
// Tabela `cliente_alteracoes`: só INSERT e SELECT — não existe rota para editar
// ou apagar linha. Uma linha por campo que mudou de verdade.
//
// REGRA: gravar o histórico NUNCA pode quebrar nem atrasar o salvamento. Todo
// ponto de uso chama `registrar`, que engole o erro (log [ClienteHistorico]) e
// nunca roda dentro de uma $transaction.
const crypto = require('crypto');
const prisma = require('../config/database');
const { erro } = require('./analyticsComum');
const { inicioDiaSP, fimDiaSP } = require('../utils/dataSP');

const LIMITE_VALOR = 500;       // tamanho máximo de cada valor guardado
const LIMITE_PADRAO = 50;
const LIMITE_MAX = 200;
const ORIGENS = ['app', 'api_agente', 'sistema'];
const ENTIDADES = ['cliente', 'contato'];

// Campo cujo NOME indica segredo: grava só que mudou, nunca o valor.
const CAMPO_SECRETO = /senha|password|passwd|token|secret|segredo|api[_-]?key|apikey|certificad|pfx|private|chave[_-]?priv|authorization|credencial/i;
const MASCARA = '***';

/** Campos do Cliente que entram no histórico (Ponto_GPS é gravado pelo serviço de GPS). */
const CAMPOS_CLIENTE = [
    'Nome', 'NomeFantasia', 'Documento', 'Tipo_Pessoa', 'Email', 'Telefone', 'Telefone_Celular',
    'Indicador_Inscricao_Estadual', 'Ativo',
    'End_Logradouro', 'End_Numero', 'End_Complemento', 'End_Bairro', 'End_Cidade', 'End_Estado', 'End_CEP',
    'Dia_de_entrega', 'Dia_de_venda', 'idVendedor', 'Formas_Atendimento', 'Condicao_de_pagamento',
    'condicoes_pagamento_permitidas', 'indicacaoId', 'categoriaClienteId', 'cicloCompraPersonalizadoDias',
    'insightAtivo', 'observacaoComercialFixa', 'recebeAvisoPedido', 'Observacoes_Gerais', 'Perfis',
];

/** Campos do contato que entram no histórico. */
const CAMPOS_CONTATO = ['nome', 'telefone', 'papel', 'nota', 'ultimoContatoEm'];

function embaralhar(v) {
    if (Array.isArray(v)) return v.map(embaralhar);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, CAMPO_SECRETO.test(k) ? MASCARA : embaralhar(x)]));
    }
    return v;
}

/** Valor → texto curto e estável (null para vazio). Não mascara: quem mascara é o campo. */
function normalizarValor(v) {
    if (v === undefined || v === null) return null;
    let s;
    if (v instanceof Date) s = Number.isNaN(v.getTime()) ? null : v.toISOString();
    else if (typeof v === 'object') {
        try { s = JSON.stringify(embaralhar(v)); } catch { s = String(v); }
    } else s = String(v);
    if (s === null) return null;
    s = s.trim();
    if (!s) return null;
    return s.length > LIMITE_VALOR ? `${s.slice(0, LIMITE_VALOR - 1)}…` : s;
}

/**
 * Compara antes/depois e devolve só o que mudou: [{ campo, de, para }].
 * `campos` limita o que é olhado; campo ausente nos DOIS lados é ignorado
 * (ex.: select que não trouxe a coluna). Comparação pelo texto completo, antes de
 * truncar — duas notas longas que só diferem no fim ainda contam como mudança.
 */
function calcularDiff(antes, depois, campos) {
    const a = antes || {};
    const d = depois || {};
    const lista = campos || [...new Set([...Object.keys(a), ...Object.keys(d)])];
    const out = [];
    for (const campo of lista) {
        if (!(campo in a) && !(campo in d)) continue;
        const cheioA = completo(a[campo]);
        const cheioD = completo(d[campo]);
        if (cheioA === cheioD) continue;
        if (CAMPO_SECRETO.test(campo)) {
            out.push({ campo, de: cheioA === null ? null : MASCARA, para: cheioD === null ? null : MASCARA });
        } else {
            out.push({ campo, de: normalizarValor(a[campo]), para: normalizarValor(d[campo]) });
        }
    }
    return out;
}

function completo(v) {
    if (v === undefined || v === null) return null;
    let s;
    if (v instanceof Date) s = v.toISOString();
    else if (typeof v === 'object') { try { s = JSON.stringify(v); } catch { s = String(v); } } else s = String(v);
    s = s.trim();
    return s || null;
}

/** Quem fez: usuário do app (req.user) ou agente da API. Nunca devolve segredo. */
function autorDe(ator) {
    if (ator?.agente) {
        const nome = String(ator.agente).slice(0, 80);
        return { tipo: 'agente', id: `agente:${nome}`, nome, origem: 'api_agente' };
    }
    if (ator?.sistema) return { tipo: 'sistema', id: null, nome: String(ator.sistema).slice(0, 80), origem: 'sistema' };
    return {
        tipo: 'usuario',
        id: ator?.id ? String(ator.id).slice(0, 80) : null,
        nome: String(ator?.nome || ator?.login || 'desconhecido').slice(0, 180),
        origem: 'app',
    };
}

/**
 * Grava as mudanças. `mudancas`: [{ campo, de, para, acao? }]. Nunca lança.
 * Devolve quantas linhas foram gravadas (0 se nada mudou ou se falhou).
 */
async function registrar({ clienteId, entidade = 'cliente', entidadeId = null, acao = 'alterado', ator, tela = null, mudancas }) {
    try {
        if (!clienteId || !Array.isArray(mudancas) || !mudancas.length) return 0;
        const quem = autorDe(ator);
        const data = mudancas.map((m) => ({
            id: crypto.randomUUID(),
            clienteId: String(clienteId).slice(0, 80),
            entidade,
            entidadeId: entidadeId ? String(entidadeId).slice(0, 80) : null,
            acao: m.acao || acao,
            campo: String(m.campo).slice(0, 80),
            valorAntigo: m.de ?? null,
            valorNovo: m.para ?? null,
            autorTipo: quem.tipo,
            autorId: quem.id,
            autorNome: quem.nome,
            origem: quem.origem,
            tela: tela ? String(tela).slice(0, 80) : null,
        }));
        await prisma.clienteAlteracao.createMany({ data });
        return data.length;
    } catch (e) {
        console.error('[ClienteHistorico] falha ao gravar histórico (operação já efetivada):', e?.message || e);
        return 0;
    }
}

/** Atalho: calcula o diff e grava. */
async function registrarDiff({ clienteId, entidade, entidadeId, ator, tela, antes, depois, campos }) {
    try {
        const mudancas = calcularDiff(antes, depois, campos);
        return await registrar({ clienteId, entidade, entidadeId, ator, tela, mudancas });
    } catch (e) {
        console.error('[ClienteHistorico] falha ao comparar (operação já efetivada):', e?.message || e);
        return 0;
    }
}

/** Uma linha só para criação / exclusão (campo '-' resume o registro). */
function registrarEvento({ clienteId, entidade, entidadeId, acao, ator, tela, resumo }) {
    const r = normalizarValor(resumo);
    const m = acao === 'excluido'
        ? { campo: entidade === 'contato' ? 'contato' : 'cadastro', de: r, para: null }
        : { campo: entidade === 'contato' ? 'contato' : 'cadastro', de: null, para: r };
    return registrar({ clienteId, entidade, entidadeId, acao, ator, tela, mudancas: [m] });
}

function lerDia(v, nome) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw erro(400, `${nome} deve estar no formato YYYY-MM-DD.`, 'DATA_INVALIDA');
    return s;
}

function texto(v, max = 80) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim().slice(0, max);
    return s || null;
}

/** Nomes de vendedor / categoria para os ids guardados (falha aqui não derruba a leitura). */
async function rotulosDeIds(rows) {
    const mapa = new Map();
    try {
        const ids = (campo) => [...new Set(rows.filter((r) => r.campo === campo).flatMap((r) => [r.valorAntigo, r.valorNovo]).filter(Boolean))];
        const vend = ids('idVendedor');
        const cats = ids('categoriaClienteId');
        const [vs, cs] = await Promise.all([
            vend.length ? prisma.vendedor.findMany({ where: { id: { in: vend } }, select: { id: true, nome: true } }) : [],
            cats.length ? prisma.categoriaCliente.findMany({ where: { id: { in: cats } }, select: { id: true, nome: true } }) : [],
        ]);
        vs.forEach((v) => mapa.set(`idVendedor:${v.id}`, v.nome));
        cs.forEach((c) => mapa.set(`categoriaClienteId:${c.id}`, c.nome));
    } catch (e) {
        console.error('[ClienteHistorico] não resolveu nomes de ids:', e?.message || e);
    }
    return mapa;
}

/** Leitura paginada (mais novo primeiro). Filtros: desde, ate, campo, autor, origem, entidade, limite, pagina. */
async function listar(clienteId, q = {}) {
    const id = texto(clienteId, 80);
    if (!id) throw erro(400, 'Informe o cliente.', 'ID_INVALIDO');
    const desde = lerDia(q.desde, 'desde');
    const ate = lerDia(q.ate, 'ate');
    if (desde && ate && desde > ate) throw erro(400, 'A data inicial é posterior à final.', 'PERIODO_INVALIDO');
    const origem = texto(q.origem);
    if (origem && !ORIGENS.includes(origem)) throw erro(400, `origem deve ser: ${ORIGENS.join(', ')}.`, 'ORIGEM_INVALIDA');
    const entidade = texto(q.entidade);
    if (entidade && !ENTIDADES.includes(entidade)) throw erro(400, `entidade deve ser: ${ENTIDADES.join(', ')}.`, 'ENTIDADE_INVALIDA');
    let limite = parseInt(q.limite ?? q.limit, 10) || LIMITE_PADRAO;
    limite = Math.min(Math.max(limite, 1), LIMITE_MAX);
    const pagina = Math.max(1, parseInt(q.pagina ?? q.page, 10) || 1);

    const where = { clienteId: id };
    if (desde || ate) {
        where.createdAt = {};
        if (desde) where.createdAt.gte = inicioDiaSP(desde);
        if (ate) where.createdAt.lte = fimDiaSP(ate);
    }
    const campo = texto(q.campo);
    if (campo) where.campo = campo;
    const autor = texto(q.autor, 180);
    if (autor) where.autorNome = { contains: autor, mode: 'insensitive' };
    if (origem) where.origem = origem;
    if (entidade) where.entidade = entidade;

    const [total, rows] = await Promise.all([
        prisma.clienteAlteracao.count({ where }),
        prisma.clienteAlteracao.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (pagina - 1) * limite,
            take: limite,
        }),
    ]);
    const rotulos = await rotulosDeIds(rows);
    return {
        clienteId: id,
        page: pagina,
        limit: limite,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limite),
        data: rows.map((r) => ({
            id: r.id,
            em: r.createdAt.toISOString(),
            entidade: r.entidade,
            entidadeId: r.entidadeId,
            acao: r.acao,
            campo: r.campo,
            valorAntigo: r.valorAntigo,
            valorNovo: r.valorNovo,
            // nome legível quando o valor é um id (vendedor / tipo de cliente) — aditivo
            valorAntigoRotulo: rotulos.get(`${r.campo}:${r.valorAntigo}`) || null,
            valorNovoRotulo: rotulos.get(`${r.campo}:${r.valorNovo}`) || null,
            autor: { tipo: r.autorTipo, id: r.autorId, nome: r.autorNome },
            origem: r.origem,
            tela: r.tela,
        })),
    };
}

module.exports = {
    CAMPOS_CLIENTE,
    CAMPOS_CONTATO,
    calcularDiff,
    normalizarValor,
    autorDe,
    registrar,
    registrarDiff,
    registrarEvento,
    listar,
};
