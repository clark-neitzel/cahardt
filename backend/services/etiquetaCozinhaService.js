// Etiquetas da Cozinha (E2) — regras de negócio da aba PCP → Etiquetas da Cozinha.
// Plano: docs/etiquetas-cozinha/PLANO-ARQUITETO.md 2.5 e 2.6. Contrato: docs/etiquetas-cozinha/CONTRATO-E2.md
//
// Datas do módulo são TEXTO 'YYYY-MM-DD' (nunca `new Date('YYYY-MM-DD')` — UTC erra o dia à noite).
// O lote é gravado primeiro (com a trava @@unique + retry); o trabalho de impressão é enfileirado DEPOIS,
// em try/catch próprio: falha na fila nunca desfaz o lote (a tela mostra `aviso` e oferece Reimprimir).
const crypto = require('crypto');
const prisma = require('../config/database');
const impressaoService = require('./impressaoService');
const pcpItemService = require('./pcpItemService');
const render = require('./etiquetaCozinhaRender');

const CONSERVACOES = ['REFRIGERADO', 'CONGELADO'];
const TAMANHOS = ['40x25', '100x120'];
const GRUPOS = ['RECHEIO', 'MASSA', 'OUTRO'];
const RE_REQUISICAO = /^[A-Za-z0-9-]{8,80}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function erro(status, mensagem) {
    const e = new Error(mensagem);
    e.status = status;
    return e;
}

// ---------- datas (texto) ----------

function pad(n) { return String(n).padStart(2, '0'); }
function hojeStr() {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}
function dataValida(str) {
    if (typeof str !== 'string' || !RE_DATA.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function somaDias(str, dias) {
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + dias));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function diffDias(de, ate) {
    const a = de.split('-').map(Number), b = ate.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
function loteTexto(loteData, seq) {
    return `${loteData.slice(2, 4)}${loteData.slice(5, 7)}${loteData.slice(8, 10)}-${String(seq).padStart(2, '0')}`;
}

// Validade sugerida (2.6): congelado -> prazo do congelado; refrigerado -> prazo do refrigerado. Sem prazo = null (não inventa).
function validadeSugerida(item, conservacao) {
    const v = conservacao === 'CONGELADO' ? item?.validadeCongeladoDias : item?.validadeRefrigeradoDias;
    return Number.isInteger(v) && v > 0 ? v : null;
}

function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    const a = p[0][0] || '';
    const b = p.length > 1 ? p[p.length - 1][0] : '';
    return (a + b).toUpperCase();
}

function permsDe(v) {
    const p = v?.permissoes;
    if (typeof p === 'string') { try { return JSON.parse(p); } catch (_) { return {}; } }
    return p || {};
}

const ITEM_SELECT = {
    id: true, codigo: true, nome: true, tipo: true, unidade: true, grupoCozinha: true, origem: true,
    validadeRefrigeradoDias: true, validadeCongeladoDias: true,
};

// Últimos tamanho/conservação usados PELO USUÁRIO para cada item ("bisnaga sempre pequena").
async function ultimosDoUsuario(userId, ids) {
    const mapa = new Map();
    if (!userId || !ids.length) return mapa;
    const lotes = await prisma.etiquetaCozinhaLote.findMany({
        where: { criadoPorId: String(userId), itemPcpId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['itemPcpId'],
        select: { itemPcpId: true, tamanho: true, conservacao: true },
    });
    for (const l of lotes) mapa.set(l.itemPcpId, l);
    return mapa;
}

function formatarItem(it, ultimos) {
    const u = ultimos.get(it.id);
    return {
        id: it.id, codigo: it.codigo, nome: it.nome, tipo: it.tipo, unidade: it.unidade,
        grupoCozinha: GRUPOS.includes(it.grupoCozinha) ? it.grupoCozinha : 'OUTRO',
        origem: it.origem,
        validadeRefrigeradoDias: it.validadeRefrigeradoDias ?? null,
        validadeCongeladoDias: it.validadeCongeladoDias ?? null,
        ultimoTamanho: u?.tamanho || null,
        ultimaConservacao: u?.conservacao || null,
    };
}

// Itens que aparecem na aba: SUB ativos + qualquer item com grupo da cozinha marcado.
const WHERE_ITENS = { ativo: true, OR: [{ tipo: 'SUB' }, { grupoCozinha: { not: null } }] };

async function idsFavoritos(userId) {
    const desde = new Date(Date.now() - 30 * 86400000);
    let g = await prisma.etiquetaCozinhaLote.groupBy({
        by: ['itemPcpId'],
        where: { criadoPorId: String(userId), createdAt: { gte: desde } },
        _count: { itemPcpId: true },
        orderBy: { _count: { itemPcpId: 'desc' } },
        take: 6,
    });
    let fonte = 'USUARIO';
    if (!g.length) {
        g = await prisma.etiquetaCozinhaLote.groupBy({
            by: ['itemPcpId'],
            _count: { itemPcpId: true },
            orderBy: { _count: { itemPcpId: 'desc' } },
            take: 6,
        });
        fonte = 'GERAL';
    }
    return { ids: g.map((x) => x.itemPcpId), fonte };
}

// ---------- consultas ----------

async function itens({ grupo = 'TODOS', busca = '', userId }) {
    grupo = String(grupo || 'TODOS').toUpperCase();
    if (![...GRUPOS, 'FAVORITOS', 'TODOS'].includes(grupo)) throw erro(400, 'grupo deve ser: RECHEIO, MASSA, OUTRO, FAVORITOS ou TODOS.');

    const todos = await prisma.itemPcp.findMany({ where: WHERE_ITENS, select: ITEM_SELECT, orderBy: { nome: 'asc' } });
    const fav = await idsFavoritos(userId);
    const efetivo = (it) => (GRUPOS.includes(it.grupoCozinha) ? it.grupoCozinha : 'OUTRO');
    const contadores = {
        FAVORITOS: todos.filter((i) => fav.ids.includes(i.id)).length,
        RECHEIO: todos.filter((i) => efetivo(i) === 'RECHEIO').length,
        MASSA: todos.filter((i) => efetivo(i) === 'MASSA').length,
        OUTRO: todos.filter((i) => efetivo(i) === 'OUTRO').length,
        TODOS: todos.length,
    };

    let lista = todos;
    if (grupo === 'FAVORITOS') lista = todos.filter((i) => fav.ids.includes(i.id));
    else if (grupo !== 'TODOS') lista = todos.filter((i) => efetivo(i) === grupo);
    const b = pcpItemService.normalizarNome(busca);
    if (b) lista = lista.filter((i) => pcpItemService.normalizarNome(i.nome).includes(b) || String(i.codigo).toLowerCase().includes(b));
    if (grupo === 'FAVORITOS') lista.sort((x, y) => fav.ids.indexOf(x.id) - fav.ids.indexOf(y.id));

    const ultimos = await ultimosDoUsuario(userId, lista.map((i) => i.id));
    return { itens: lista.map((i) => formatarItem(i, ultimos)), contadores };
}

async function favoritos(userId) {
    const fav = await idsFavoritos(userId);
    if (!fav.ids.length) return { itens: [], fonte: fav.fonte };
    const lista = await prisma.itemPcp.findMany({ where: { id: { in: fav.ids }, ativo: true }, select: ITEM_SELECT });
    lista.sort((x, y) => fav.ids.indexOf(x.id) - fav.ids.indexOf(y.id));
    const ultimos = await ultimosDoUsuario(userId, lista.map((i) => i.id));
    return { itens: lista.map((i) => formatarItem(i, ultimos)), fonte: fav.fonte };
}

// Chips de responsável. Permissões são OBJETO: p.pcp?.etiquetas (nunca !!p.pcp).
async function equipe(user) {
    const vendedores = await prisma.vendedor.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, permissoes: true },
        orderBy: { nome: 'asc' },
    });
    const meuId = String(user?.id || '');
    const lista = vendedores
        .filter((v) => v.id === meuId || permsDe(v).admin === true || permsDe(v).pcp?.etiquetas === true)
        .map((v) => ({ id: v.id, nome: v.nome, iniciais: iniciais(v.nome), eu: v.id === meuId }));
    lista.sort((a, b) => (b.eu - a.eu) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { equipe: lista };
}

function formatarLote(l) {
    const t = (l.trabalhos || [])[0];
    return {
        id: l.id, lote: l.lote, loteData: l.loteData, itemPcpId: l.itemPcpId, nomeImpresso: l.nomeImpresso,
        fabricacao: l.fabricacao, validade: l.validade, validadeDias: l.validadeDias, validadeAlterada: l.validadeAlterada,
        conservacao: l.conservacao, pesoGramas: l.pesoGramas, quantidade: l.quantidade, tamanho: l.tamanho,
        impressoraId: l.impressoraId, responsavelId: l.responsavelId, responsavelNome: l.responsavelNome,
        criadoPorNome: l.criadoPorNome, reimpressoes: l.reimpressoes, createdAt: l.createdAt,
        statusImpressao: t ? t.status : null,
        erroImpressao: t?.erro || null,
    };
}
const INCLUI_ULTIMO_TRABALHO = { trabalhos: { orderBy: { pedidoEm: 'desc' }, take: 1, select: { id: true, status: true, erro: true } } };

async function hoje({ data, de, ate, itemPcpId } = {}) {
    for (const [k, v] of Object.entries({ data, de, ate })) {
        if (v && !dataValida(v)) throw erro(400, `${k} deve ser uma data no formato AAAA-MM-DD.`);
    }
    const where = {};
    let dia = null;
    if (de || ate) {
        where.loteData = {};
        if (de) where.loteData.gte = de;
        if (ate) where.loteData.lte = ate;
    } else {
        dia = data || hojeStr();
        where.loteData = dia;
    }
    if (itemPcpId) where.itemPcpId = String(itemPcpId);
    const lotes = await prisma.etiquetaCozinhaLote.findMany({
        where, orderBy: [{ createdAt: 'desc' }], take: 500, include: INCLUI_ULTIMO_TRABALHO,
    });
    return {
        data: dia,
        lotes: lotes.map(formatarLote),
        totais: { lotes: lotes.length, etiquetas: lotes.reduce((s, l) => s + l.quantidade, 0) },
    };
}

async function detalhe(id) {
    const l = await prisma.etiquetaCozinhaLote.findUnique({
        where: { id },
        include: {
            trabalhos: {
                orderBy: { pedidoEm: 'desc' },
                select: { id: true, tipo: true, status: true, copias: true, tentativas: true, erro: true, pedidoEm: true, impressoEm: true, solicitadoPorNome: true },
            },
        },
    });
    if (!l) throw erro(404, 'Lote não encontrado.');
    const { trabalhos, ...resto } = l;
    return { lote: formatarLote({ ...resto, trabalhos: trabalhos.slice(0, 1) }), trabalhos };
}

// ---------- impressão ----------

async function escolherImpressora(tamanho, impressoraId) {
    if (impressoraId) {
        const imp = await prisma.impressora.findUnique({ where: { id: String(impressoraId) }, include: { agente: true } });
        if (!imp || !imp.ativa) throw erro(400, 'Essa impressora não está ativa.');
        if (imp.tamanho !== tamanho) throw erro(400, `Essa impressora é de ${imp.tamanho}, não de ${tamanho}.`);
        return imp;
    }
    const ativas = await prisma.impressora.findMany({ where: { tamanho, ativa: true }, include: { agente: true }, orderBy: { createdAt: 'asc' } });
    if (!ativas.length) throw erro(409, `Nenhuma impressora ativa configurada para ${tamanho.replace('x', '×')}. Peça a um administrador em Configurações → Impressoras.`);
    if (ativas.length > 1) throw erro(400, `Há mais de uma impressora ativa para ${tamanho.replace('x', '×')}: escolha qual usar (impressoraId).`);
    return ativas[0];
}

function gerarBytes(lote, imp) {
    const dados = {
        nome: lote.nomeImpresso, fabricacao: lote.fabricacao, validade: lote.validade, conservacao: lote.conservacao,
        pesoGramas: lote.pesoGramas || undefined, lote: lote.lote, quantidade: lote.quantidade,
        responsavelIniciais: iniciais(lote.responsavelNome), responsavelNome: lote.responsavelNome,
    };
    if (imp.tamanho === '100x120') {
        if (imp.linguagem !== 'ZPL') throw erro(409, 'A impressora 100×120 precisa estar configurada como ZPL.');
        return render.renderZplGrande(dados, imp);
    }
    if (imp.linguagem !== 'EPL2') throw erro(409, 'A impressora 40×25 precisa estar configurada como EPL2.');
    return render.renderEpl2Pequena(dados, imp);
}

function avisoAgente(imp) {
    const estado = impressaoService.estadoAgente(imp.agente);
    return {
        estado,
        aviso: estado === 'OFFLINE'
            ? 'O computador da cozinha parece desligado. A etiqueta fica na fila por 15 minutos.'
            : null,
    };
}

// Enfileira (idempotente pela chave). Nunca lança: devolve { trabalho, aviso }.
async function enfileirarSeguro(lote, imp, quantidade, user, chave) {
    try {
        const conteudo = gerarBytes({ ...lote, quantidade }, imp);
        const t = await impressaoService.enfileirar({
            impressoraId: imp.id, tipo: 'ETIQUETA_COZINHA', conteudo, copias: quantidade,
            chaveIdempotencia: chave, loteId: lote.id,
            usuario: { id: String(user?.id || ''), nome: user?.nome || null },
        });
        return { trabalho: { id: t.id, status: t.status }, reaproveitado: !!t.reaproveitado, aviso: null };
    } catch (e) {
        console.error('[EtiquetaCozinha] Falha ao enfileirar (lote já registrado):', e.message);
        return {
            trabalho: null, reaproveitado: false,
            aviso: `O lote ${lote.lote} foi registrado, mas a etiqueta não entrou na fila de impressão (${e.message}). Use Reimprimir.`,
        };
    }
}

function validarEntrada(b) {
    if (!b || typeof b !== 'object') throw erro(400, 'Corpo inválido.');
    if (!RE_REQUISICAO.test(String(b.requisicaoId || ''))) throw erro(400, 'requisicaoId inválido (8 a 80 caracteres: letras, números e hífen).');
    if (!b.itemPcpId && !String(b.nomeLivre || '').trim()) throw erro(400, 'Informe o item (itemPcpId) ou o nome digitado (nomeLivre).');
    if (!CONSERVACOES.includes(b.conservacao)) throw erro(400, 'conservacao deve ser REFRIGERADO ou CONGELADO.');
    if (!TAMANHOS.includes(b.tamanho)) throw erro(400, 'tamanho deve ser 40x25 ou 100x120.');
    const q = Number(b.quantidade);
    if (!Number.isInteger(q) || q < 1 || q > 200) throw erro(400, 'quantidade deve ser um número inteiro de 1 a 200.');
    if (!dataValida(b.fabricacao)) throw erro(400, 'fabricacao deve ser uma data AAAA-MM-DD.');
    const hoje = hojeStr();
    if (b.fabricacao > hoje) throw erro(400, 'A data de fabricação não pode ser no futuro.');
    if (b.fabricacao < somaDias(hoje, -7)) throw erro(400, 'A data de fabricação não pode ter mais de 7 dias.');
    let peso = null;
    if (b.pesoGramas !== undefined && b.pesoGramas !== null && b.pesoGramas !== '') {
        peso = Number(b.pesoGramas);
        if (!Number.isInteger(peso) || peso < 1 || peso > 2000000) throw erro(400, 'pesoGramas deve ser um inteiro de 1 a 2.000.000.');
    }
    let validade, validadeDias;
    if (b.validade) {
        if (!dataValida(b.validade)) throw erro(400, 'validade deve ser uma data AAAA-MM-DD.');
        if (b.validade < b.fabricacao) throw erro(400, 'A validade não pode ser antes da fabricação.');
        validade = b.validade;
        validadeDias = diffDias(b.fabricacao, b.validade);
    } else {
        validadeDias = Number(b.validadeDias);
        if (!Number.isInteger(validadeDias)) throw erro(400, 'Informe a validade (validadeDias ou validade).');
        validade = somaDias(b.fabricacao, validadeDias);
    }
    if (validadeDias < 1 || validadeDias > 730) throw erro(400, 'A validade deve ser de 1 a 730 dias após a fabricação.');
    if (!b.responsavelId) throw erro(400, 'Informe o responsável (responsavelId).');
    return { quantidade: q, peso, validade, validadeDias };
}

async function respostaDeLoteExistente(lote, user) {
    const imp = lote.impressoraId ? await prisma.impressora.findUnique({ where: { id: lote.impressoraId }, include: { agente: true } }) : null;
    const chave = `lote-${lote.id}`;
    let trabalho = await prisma.impressaoTrabalho.findUnique({ where: { chaveIdempotencia: chave }, select: { id: true, status: true } });
    let aviso = null;
    if (!trabalho && imp) { // o 1º pedido gravou o lote mas não conseguiu enfileirar: o retry tenta de novo
        const r = await enfileirarSeguro(lote, imp, lote.quantidade, user, chave);
        trabalho = r.trabalho; aviso = r.aviso;
    }
    const ag = imp ? avisoAgente(imp) : { estado: 'OFFLINE', aviso: null };
    return { lote: { ...formatarLote(lote), statusImpressao: trabalho?.status || null }, trabalho, agente: { estado: ag.estado }, aviso: aviso || ag.aviso || undefined, repetido: true };
}

async function imprimir(body, user) {
    const requisicaoId = String(body?.requisicaoId || '');
    // Idempotência: o mesmo requisicaoId nunca cria outro lote
    if (RE_REQUISICAO.test(requisicaoId)) {
        const ja = await prisma.etiquetaCozinhaLote.findUnique({ where: { requisicaoId } });
        if (ja) return { status: 200, corpo: await respostaDeLoteExistente(ja, user) };
    }
    const v = validarEntrada(body);

    const resp = await prisma.vendedor.findUnique({ where: { id: String(body.responsavelId) }, select: { id: true, nome: true, ativo: true } });
    if (!resp || resp.ativo === false) throw erro(400, 'O responsável escolhido não existe ou está inativo.');

    const imp = await escolherImpressora(body.tamanho, body.impressoraId);

    let item;
    if (body.itemPcpId) {
        item = await prisma.itemPcp.findUnique({ where: { id: String(body.itemPcpId) }, select: { ...ITEM_SELECT, ativo: true } });
        if (!item || !item.ativo) throw erro(400, 'Item não encontrado ou inativo.');
    } else {
        item = await pcpItemService.criarDaCozinha(body.nomeLivre);
    }
    const sugerida = validadeSugerida(item, body.conservacao);
    const validadeAlterada = sugerida != null && sugerida !== v.validadeDias;

    // Lote AAMMDD-NN: max+1 do dia; a @@unique([loteData, loteSeq]) é a trava real (retry em P2002)
    const loteData = hojeStr();
    let lote = null;
    for (let tentativa = 0; tentativa < 6 && !lote; tentativa++) {
        const max = await prisma.etiquetaCozinhaLote.aggregate({ where: { loteData }, _max: { loteSeq: true } });
        const seq = (max._max.loteSeq || 0) + 1;
        try {
            lote = await prisma.etiquetaCozinhaLote.create({
                data: {
                    requisicaoId, lote: loteTexto(loteData, seq), loteData, loteSeq: seq,
                    itemPcpId: item.id, nomeImpresso: item.nome,
                    fabricacao: body.fabricacao, validade: v.validade, validadeDias: v.validadeDias, validadeAlterada,
                    conservacao: body.conservacao, pesoGramas: v.peso, quantidade: v.quantidade, tamanho: body.tamanho,
                    impressoraId: imp.id, responsavelId: resp.id, responsavelNome: resp.nome,
                    criadoPorId: String(user?.id || ''), criadoPorNome: user?.nome || user?.login || 'desconhecido',
                },
            });
        } catch (e) {
            if (e.code !== 'P2002') throw e;
            const alvo = JSON.stringify(e.meta?.target || '');
            if (/requisicao/i.test(alvo)) { // clique duplo simultâneo: o outro pedido ganhou
                const ja = await prisma.etiquetaCozinhaLote.findUnique({ where: { requisicaoId } });
                if (ja) return { status: 200, corpo: await respostaDeLoteExistente(ja, user) };
            }
            // senão: colisão de número de lote -> recalcula
        }
    }
    if (!lote) throw erro(503, 'Não consegui reservar o número do lote (muita gente imprimindo ao mesmo tempo). Tente de novo.');

    const r = await enfileirarSeguro(lote, imp, lote.quantidade, user, `lote-${lote.id}`);
    const ag = avisoAgente(imp);
    return {
        status: 201,
        corpo: {
            lote: { ...formatarLote(lote), statusImpressao: r.trabalho?.status || null }, trabalho: r.trabalho, agente: { estado: ag.estado },
            aviso: r.aviso || ag.aviso || undefined,
            itemCriado: !body.itemPcpId ? { id: item.id, codigo: item.codigo, nome: item.nome, itemReativado: item.reativado === true } : undefined,
        },
    };
}

async function reimprimir(id, body = {}, user) {
    const lote = await prisma.etiquetaCozinhaLote.findUnique({ where: { id } });
    if (!lote) throw erro(404, 'Lote não encontrado.');
    let quantidade = lote.quantidade;
    if (body.quantidade !== undefined && body.quantidade !== null && body.quantidade !== '') {
        quantidade = Number(body.quantidade);
        if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 200) throw erro(400, 'quantidade deve ser um número inteiro de 1 a 200.');
    }
    let reqId = body.requisicaoId ? String(body.requisicaoId) : crypto.randomUUID();
    if (!RE_REQUISICAO.test(reqId)) throw erro(400, 'requisicaoId inválido (8 a 80 caracteres: letras, números e hífen).');

    let imp;
    if (body.impressoraId) imp = await escolherImpressora(lote.tamanho, body.impressoraId);
    else {
        const antiga = lote.impressoraId
            ? await prisma.impressora.findUnique({ where: { id: lote.impressoraId }, include: { agente: true } }) : null;
        imp = antiga && antiga.ativa ? antiga : await escolherImpressora(lote.tamanho);
    }

    const r = await enfileirarSeguro(lote, imp, quantidade, user, `reimp-${lote.id}-${reqId}`);
    if (!r.trabalho) throw erro(502, r.aviso);
    let reimpressoes = lote.reimpressoes;
    if (!r.reaproveitado) { // contador é informativo: falhar aqui nunca pode dar erro com a etiqueta já na fila
        try {
            const up = await prisma.etiquetaCozinhaLote.update({ where: { id: lote.id }, data: { reimpressoes: { increment: 1 } }, select: { reimpressoes: true } });
            reimpressoes = up.reimpressoes;
        } catch (e) {
            console.error('[EtiquetaCozinha] Falha ao contar reimpressão (etiqueta já na fila):', e.message);
            reimpressoes = lote.reimpressoes + 1;
        }
    }
    const ag = avisoAgente(imp);
    return {
        status: r.reaproveitado ? 200 : 201,
        corpo: { lote: { ...formatarLote({ ...lote, reimpressoes }), statusImpressao: r.trabalho.status }, trabalho: r.trabalho, agente: { estado: ag.estado }, aviso: ag.aviso || undefined },
    };
}

module.exports = {
    itens, favoritos, equipe, hoje, detalhe, imprimir, reimprimir,
    _internos: { validarEntrada, validadeSugerida, loteTexto, somaDias, diffDias, dataValida, iniciais, hojeStr },
};
