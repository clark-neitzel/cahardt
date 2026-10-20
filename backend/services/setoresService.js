/**
 * Cadastro de Setores (Como Fazer / ficha do funcionário).
 * `codigo` é imutável (é o que Funcionario.setor, ComoFazerConteudo.setores e o AppConfig
 * `como_fazer_aparelhos` guardam); renomear altera só `nome`. Ver docs/pop/plano-setores.md.
 */
const prisma = require('../config/database');

const SEED = [
    { codigo: 'COZINHA', nome: 'Cozinha', icone: '🍳', ordem: 1 },
    { codigo: 'ESTOQUE', nome: 'Estoque', icone: '🧊', ordem: 2 },
    { codigo: 'EXPEDICAO', nome: 'Expedição', icone: '📦', ordem: 3 },
    { codigo: 'MOTORISTA', nome: 'Motorista', icone: '🚚', ordem: 4 },
];
const CACHE_TTL_MS = 60 * 1000;
let _cache = { em: 0, lista: null };

function erroSetor(status, codigo, mensagem, extra = {}) {
    return Object.assign(new Error(mensagem), { status, codigo, ...extra });
}

const forma = (s) => ({
    id: s.id || null, codigo: s.codigo, slug: s.codigo.toLowerCase(), nome: s.nome,
    icone: s.icone || null, ordem: s.ordem ?? 0, ativo: s.ativo !== false,
});
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chaveNome = (t) => semAcento(t).trim().toLowerCase().replace(/\s+/g, ' ');

function invalidarCache() { _cache = { em: 0, lista: null }; }

async function garantirSeed() {
    if ((await prisma.setor.count()) > 0) return false;
    await prisma.setor.createMany({ data: SEED, skipDuplicates: true });
    invalidarCache();
    return true;
}

/** Todos (ativos e inativos), ordenados. Cache 60 s; falha do banco usa cache velho ou SEED. */
async function todos() {
    if (_cache.lista && Date.now() - _cache.em < CACHE_TTL_MS) return _cache.lista;
    try {
        let linhas = await prisma.setor.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
        if (!linhas.length) {
            try { await garantirSeed(); } catch (e) { console.error('[Setores] seed (rede de segurança):', e.message); }
            linhas = await prisma.setor.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
        }
        const lista = linhas.length ? linhas.map(forma) : SEED.map(forma);
        _cache = { em: Date.now(), lista };
        return lista;
    } catch (e) {
        console.error('[Setores] leitura falhou:', e.message);
        return _cache.lista || SEED.map(forma);
    }
}

async function listar({ incluirInativos = false } = {}) {
    const lista = await todos();
    return incluirInativos ? lista : lista.filter(s => s.ativo);
}
const porSlug = async (slug) => (await todos()).find(s => s.slug === String(slug || '').toLowerCase()) || null;
const porCodigo = async (cod) => (await todos()).find(s => s.codigo === String(cod || '').toUpperCase()) || null;
async function codigosAtivos() { return (await listar()).map(s => s.codigo); }

/** Aceita setor ativo; ou um dos `permitir` (códigos que o registro já tinha), mesmo inativo. */
async function validarCodigo(cod, { permitir = [] } = {}) {
    const c = String(cod || '').toUpperCase();
    if (!c) return false;
    const s = await porCodigo(c);
    if (!s) return false;
    return s.ativo || permitir.map(x => String(x).toUpperCase()).includes(c);
}

function gerarCodigoBase(nome) {
    const c = semAcento(nome).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
    return c || 'SETOR';
}

async function contarUso(codigo) {
    const [funcionarios, conteudos, aparelhos] = await Promise.all([
        prisma.funcionario.count({ where: { setor: codigo } }),
        prisma.comoFazerConteudo.count({ where: { setores: { has: codigo } } }),
        prisma.appConfig.findUnique({ where: { key: 'como_fazer_aparelhos' } }).catch(() => null),
    ]);
    const ap = aparelhos && aparelhos.value && typeof aparelhos.value === 'object' ? aparelhos.value : {};
    return { funcionarios, conteudos, aparelho: !!ap[codigo] };
}

function validarNome(nome) {
    const n = String(nome || '').trim().replace(/\s+/g, ' ');
    if (!n) throw erroSetor(400, 'DADOS_INVALIDOS', 'Informe o nome do setor.');
    if (n.length > 40) throw erroSetor(400, 'DADOS_INVALIDOS', 'O nome do setor pode ter no máximo 40 letras.');
    return n;
}
const limparIcone = (i) => (i === undefined || i === null || String(i).trim() === '' ? null : String(i).trim().slice(0, 8));

async function checarNomeUnico(nome, ignorarId) {
    const k = chaveNome(nome);
    const todosSetores = await prisma.setor.findMany({ select: { id: true, nome: true } });
    if (todosSetores.some(s => s.id !== ignorarId && chaveNome(s.nome) === k)) {
        throw erroSetor(409, 'SETOR_JA_EXISTE', 'Já existe um setor com esse nome.');
    }
}

async function criar({ nome, icone }) {
    const n = validarNome(nome);
    await checarNomeUnico(n);
    const existentes = new Set((await prisma.setor.findMany({ select: { codigo: true } })).map(s => s.codigo));
    const base = gerarCodigoBase(n);
    let codigo = base, i = 2;
    while (existentes.has(codigo)) codigo = `${base.slice(0, 27)}_${i++}`;
    const agg = await prisma.setor.aggregate({ _max: { ordem: true } });
    try {
        const s = await prisma.setor.create({ data: { codigo, nome: n, icone: limparIcone(icone), ordem: (agg._max.ordem || 0) + 1 } });
        return forma(s);
    } catch (e) {
        if (e.code === 'P2002') throw erroSetor(409, 'SETOR_JA_EXISTE', 'Já existe um setor com esse código. Tente de novo.');
        throw e;
    } finally { invalidarCache(); }
}

async function atualizar(id, body = {}) {
    const atual = await prisma.setor.findUnique({ where: { id } });
    if (!atual) throw erroSetor(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
    const data = {}; // `codigo` NUNCA entra aqui
    if (body.nome !== undefined) { data.nome = validarNome(body.nome); await checarNomeUnico(data.nome, id); }
    if (body.icone !== undefined) data.icone = limparIcone(body.icone);
    if (body.ordem !== undefined) {
        const o = Number(body.ordem);
        if (!Number.isInteger(o)) throw erroSetor(400, 'DADOS_INVALIDOS', 'Ordem inválida.');
        data.ordem = o;
    }
    if (body.ativo !== undefined) data.ativo = !!body.ativo;
    try {
        const s = await prisma.setor.update({ where: { id }, data });
        return { setor: forma(s), uso: await contarUso(s.codigo) };
    } finally { invalidarCache(); }
}

async function reordenar(itens) {
    if (!Array.isArray(itens) || !itens.length || itens.length > 200) throw erroSetor(400, 'DADOS_INVALIDOS', 'Lista de ordem inválida.');
    const ops = itens.map(it => {
        const o = Number(it?.ordem);
        if (!it?.id || !Number.isInteger(o)) throw erroSetor(400, 'DADOS_INVALIDOS', 'Lista de ordem inválida.');
        return prisma.setor.update({ where: { id: String(it.id) }, data: { ordem: o } });
    });
    try {
        await prisma.$transaction(ops, { timeout: 20000, maxWait: 10000 });
    } catch (e) {
        if (e.code === 'P2025') throw erroSetor(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
        throw e;
    } finally { invalidarCache(); }
}

async function excluir(id) {
    const s = await prisma.setor.findUnique({ where: { id } });
    if (!s) throw erroSetor(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
    if ((await prisma.setor.count()) <= 1) throw erroSetor(409, 'ULTIMO_SETOR', 'Precisa existir ao menos um setor.');
    const uso = await contarUso(s.codigo);
    if (uso.funcionarios > 0 || uso.conteudos > 0) {
        throw erroSetor(409, 'SETOR_EM_USO', `Este setor tem ${uso.funcionarios} funcionário(s) e ${uso.conteudos} conteúdo(s). Desative em vez de excluir.`, { uso });
    }
    try {
        await prisma.setor.delete({ where: { id } });
        if (uso.aparelho) { // remove a chave do tablet do setor excluído (só existe se foi pareado)
            try {
                const cfg = await prisma.appConfig.findUnique({ where: { key: 'como_fazer_aparelhos' } });
                if (cfg && cfg.value && typeof cfg.value === 'object') {
                    const v = { ...cfg.value }; delete v[s.codigo];
                    await prisma.appConfig.update({ where: { key: 'como_fazer_aparelhos' }, data: { value: v } });
                }
            } catch (e) { console.error('[Setores] limpar chave do aparelho (setor já excluído):', e.message); }
        }
    } finally { invalidarCache(); }
}

module.exports = {
    SEED, garantirSeed, listar, todos, porSlug, porCodigo, codigosAtivos, validarCodigo,
    gerarCodigoBase, contarUso, criar, atualizar, reordenar, excluir, invalidarCache,
};
