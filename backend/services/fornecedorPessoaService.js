/**
 * Pessoa (tabela `clientes`) com perfil FORNECEDOR -> linha em `fornecedores`.
 * Cadastro único de pessoas, Fase 2. Usado por:
 *   - GET  /api/fornecedores/opcoes-despesa
 *   - POST /api/fornecedores/da-pessoa/:clienteUUID
 *   - admin-exec fornecedores-espelhar-de-clientes (mesma montagem de campos)
 * Chave de unicidade: documento normalizado (utils/documento.js, preserva CNPJ alfanumérico).
 * Não altera `clientes.Ativo` (quem é "só fornecedor" continua fora de rota/pedido/catálogo).
 */
const prisma = require('../config/database');
const { normalizarDoc } = require('../utils/documento');

function temPerfilFornecedor(perfis) {
    try {
        const arr = JSON.parse(perfis || '[]');
        return Array.isArray(arr) && arr.some(p => String(typeof p === 'string' ? p : p?.perfil || '').toUpperCase() === 'FORNECEDOR');
    } catch { return false; }
}

/** Campos da nova linha de `fornecedores` a partir da pessoa (idêntico ao espelho do admin-exec). */
function dadosFornecedorDeCliente(c, doc) {
    return {
        razaoSocial: c.Nome.trim(),
        nomeFantasia: c.NomeFantasia || null,
        cnpjCpf: doc || null,
        email: c.Email || null,
        telefone: c.Telefone || null,
        cidade: c.End_Cidade || null,
        uf: c.End_Estado || null,
        ativo: true,
        origem: 'APP',
        statusEnvioCA: 'NAO_ENVIAR',
    };
}

/** Acha o fornecedor mais antigo com esse documento (compara normalizado; vale o primeiro cadastrado). */
async function acharFornecedorPorDoc(db, doc) {
    const candidatos = await db.fornecedor.findMany({
        where: { cnpjCpf: { contains: doc, mode: 'insensitive' } },
        orderBy: { criadoEm: 'asc' },
    });
    // `contains` não acha documento gravado com pontuação; cobre o caso comum e o legado formatado abaixo.
    let achado = candidatos.find(f => normalizarDoc(f.cnpjCpf) === doc);
    if (achado) return achado;
    const todos = await db.fornecedor.findMany({ where: { cnpjCpf: { not: null } }, orderBy: { criadoEm: 'asc' }, select: { id: true, cnpjCpf: true } });
    const hit = todos.find(f => normalizarDoc(f.cnpjCpf) === doc);
    return hit ? db.fornecedor.findUnique({ where: { id: hit.id } }) : null;
}

/**
 * Idempotente. Devolve { fornecedor, jaExistia }. Lança Error com .status/.message em português.
 * Corrida (clique duplo) evitada com lock consultivo por documento dentro de uma transação curta
 * (só banco — sem rede). Não há índice único em cnpj_cpf, por isso o lock.
 */
async function garantirFornecedorDaPessoa(clienteUUID) {
    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteUUID },
        select: { UUID: true, Nome: true, NomeFantasia: true, Documento: true, Email: true, Telefone: true, End_Cidade: true, End_Estado: true, Perfis: true },
    });
    const erro = (status, msg) => Object.assign(new Error(msg), { status });
    if (!cliente) throw erro(404, 'Pessoa não encontrada.');
    if (!temPerfilFornecedor(cliente.Perfis)) throw erro(400, 'Esta pessoa não está marcada como Fornecedor. Marque o papel Fornecedor no cadastro dela antes de usar em despesa.');
    const doc = cliente.Documento ? normalizarDoc(cliente.Documento) : '';
    if (!doc) throw erro(400, 'Esta pessoa não tem CPF/CNPJ cadastrado. Preencha o documento no cadastro dela para poder usá-la como fornecedor.');
    if (!cliente.Nome || !cliente.Nome.trim()) throw erro(400, 'Esta pessoa está sem nome no cadastro.');

    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fornecedor-doc:' + doc}))`;
        const existente = await acharFornecedorPorDoc(tx, doc);
        if (existente) return { fornecedor: existente, jaExistia: true };
        const fornecedor = await tx.fornecedor.create({ data: dadosFornecedorDeCliente(cliente, doc) });
        return { fornecedor, jaExistia: false };
    }, { timeout: 20000, maxWait: 10000 });
}

/** União fornecedores + pessoas-FORNECEDOR com documento sem linha em fornecedores. */
async function opcoesDespesa(busca) {
    const q = String(busca || '').trim();
    const qDoc = normalizarDoc(q);
    // Busca por nome no banco; por documento comparamos NORMALIZADO nos dois lados (o cadastro pode ter
    // pontuação e quem digita usa só números), filtrando no JS sobre listas pequenas.
    const fornecedoresNome = await prisma.fornecedor.findMany({
        where: q ? { OR: [
            { razaoSocial: { contains: q, mode: 'insensitive' } },
            { nomeFantasia: { contains: q, mode: 'insensitive' } },
        ] } : {},
        orderBy: { razaoSocial: 'asc' },
    });

    // Documentos de TODOS os fornecedores (não só os filtrados) para não oferecer como "novo" quem já existe.
    const todos = await prisma.fornecedor.findMany({ where: { cnpjCpf: { not: null } }, select: { id: true, cnpjCpf: true } });
    const docsExistentes = new Set(todos.map(f => normalizarDoc(f.cnpjCpf)).filter(Boolean));

    let fornecedores = fornecedoresNome;
    if (qDoc) {
        const jaTem = new Set(fornecedoresNome.map(f => f.id));
        const idsDoc = todos.filter(f => !jaTem.has(f.id) && (normalizarDoc(f.cnpjCpf) || '').includes(qDoc)).map(f => f.id);
        if (idsDoc.length) {
            const extra = await prisma.fornecedor.findMany({ where: { id: { in: idsDoc } } });
            fornecedores = [...fornecedoresNome, ...extra];
        }
    }

    const cBase = { Perfis: { contains: 'FORNECEDOR', mode: 'insensitive' }, Documento: { not: null } };
    const cSelect = { UUID: true, Nome: true, NomeFantasia: true, Documento: true, Perfis: true };
    let clientes = await prisma.cliente.findMany({
        where: q ? { ...cBase, OR: [
            { Nome: { contains: q, mode: 'insensitive' } },
            { NomeFantasia: { contains: q, mode: 'insensitive' } },
        ] } : cBase,
        select: cSelect,
        orderBy: { Nome: 'asc' },
    });
    if (qDoc) {
        const jaTem = new Set(clientes.map(c => c.UUID));
        const comPerfil = await prisma.cliente.findMany({ where: cBase, select: cSelect });
        clientes = [...clientes, ...comPerfil.filter(c => !jaTem.has(c.UUID) && (normalizarDoc(c.Documento) || '').includes(qDoc))];
    }

    const itens = fornecedores.map(f => ({
        id: f.id, clienteId: null, razaoSocial: f.razaoSocial, nomeFantasia: f.nomeFantasia,
        cnpjCpf: f.cnpjCpf, ativo: f.ativo, existe: true,
    }));
    const vistos = new Set();
    for (const c of clientes) {
        const doc = normalizarDoc(c.Documento);
        if (!doc || docsExistentes.has(doc) || vistos.has(doc) || !temPerfilFornecedor(c.Perfis)) continue;
        vistos.add(doc);
        itens.push({
            id: null, clienteId: c.UUID, razaoSocial: c.Nome, nomeFantasia: c.NomeFantasia || null,
            cnpjCpf: doc, ativo: true, existe: false,
        });
    }
    itens.sort((a, b) => String(a.razaoSocial).localeCompare(String(b.razaoSocial), 'pt-BR'));
    return itens;
}

module.exports = { temPerfilFornecedor, dadosFornecedorDeCliente, garantirFornecedorDaPessoa, opcoesDespesa };
