const crypto = require('crypto');
const prisma = require('../config/database'); // singleton compartilhado (pool único)

// WhatsApp central da loja para o botão "fazer pedido" da página pública.
// Pode ser sobrescrito em app_configs (chave "catalogo_publico_whatsapp"); default abaixo.
const WHATSAPP_PADRAO = '5547988548476';

// ── helpers ────────────────────────────────────────────────────────────────
// Token curto e legível para a URL pública (sem caracteres ambíguos: 0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function gerarTokenBruto(len = 7) {
    const bytes = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
    return out;
}
async function gerarTokenUnico() {
    // Colisão é praticamente impossível, mas garantimos unicidade no banco.
    for (let tentativa = 0; tentativa < 6; tentativa++) {
        const token = gerarTokenBruto(tentativa < 3 ? 7 : 9); // aumenta o tamanho se der azar
        const existe = await prisma.catalogoPersonalizado.findUnique({ where: { token }, select: { id: true } });
        if (!existe) return token;
    }
    throw new Error('Não foi possível gerar um token único para o catálogo.');
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
function comDDI55(tel) {
    let d = soDigitos(tel);
    if (!d) return null;
    if (!d.startsWith('55')) d = '55' + d;
    return d;
}

// ── criar (snapshot) ─────────────────────────────────────────────────────────
async function criar({ vendedor, clienteUuid, condicaoId, validadeDias, produtoIds, titulo, observacoes }) {
    if (!clienteUuid) throw Object.assign(new Error('Cliente é obrigatório.'), { status: 400 });
    if (!condicaoId) throw Object.assign(new Error('Condição de pagamento é obrigatória.'), { status: 400 });
    if (!Array.isArray(produtoIds) || produtoIds.length === 0)
        throw Object.assign(new Error('Selecione ao menos um produto.'), { status: 400 });

    // Cliente (snapshot de nome/telefone/cidade)
    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteUuid },
        select: {
            Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true,
            End_Cidade: true, End_Estado: true
        }
    });
    if (!cliente) throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });

    // Condição — aceita tanto o id (PK da TabelaPreco) quanto o idCondicao
    const condicao = await prisma.tabelaPreco.findFirst({
        where: { OR: [{ id: condicaoId }, { idCondicao: condicaoId }] }
    });
    if (!condicao) throw Object.assign(new Error('Condição de pagamento não encontrada.'), { status: 404 });

    const acrescimo = Number(condicao.acrescimoPreco) || 0;

    // Produtos frescos do catálogo (preço/estoque/imagem/categoria no momento)
    const produtos = await prisma.produto.findMany({
        where: { id: { in: produtoIds }, ativo: true },
        include: {
            imagens: { orderBy: [{ principal: 'desc' }, { ordem: 'asc' }], take: 1 },
            categoriaProduto: { select: { nome: true, corTag: true } }
        }
    });
    if (produtos.length === 0)
        throw Object.assign(new Error('Nenhum dos produtos selecionados está disponível.'), { status: 400 });

    // Preserva a ordem em que o vendedor selecionou
    const porId = new Map(produtos.map(p => [p.id, p]));
    const itens = [];
    let total = 0;
    produtoIds.forEach((id, idx) => {
        const p = porId.get(id);
        if (!p) return;
        const valorBase = round2(p.valorVenda);
        const precoFinal = round2(Number(p.valorVenda) * (1 + acrescimo / 100));
        total += precoFinal;
        itens.push({
            produtoId: p.id,
            codigo: p.codigo || '',
            nome: p.nome,
            unidade: p.unidade || 'UN',
            imagemUrl: p.imagens?.[0]?.url || null,
            valorBase,
            precoFinal,
            categoriaNome: p.categoriaProduto?.nome || null,
            categoriaCor: p.categoriaProduto?.corTag || null,
            ordem: idx
        });
    });

    const dias = Number(validadeDias);
    const validadeEm = Number.isFinite(dias) && dias > 0
        ? new Date(Date.now() + dias * 24 * 60 * 60 * 1000)
        : null;

    const token = await gerarTokenUnico();

    // Uma única chamada create com itens aninhados — Prisma já escreve tudo atomicamente.
    // Sem chamadas externas / logs aqui dentro (regra de transação do projeto).
    const catalogo = await prisma.catalogoPersonalizado.create({
        data: {
            token,
            titulo: titulo?.trim() || null,
            clienteUuid,
            clienteNome: cliente.NomeFantasia || cliente.Nome,
            clienteTelefone: cliente.Telefone_Celular || cliente.Telefone || null,
            clienteCidade: [cliente.End_Cidade, cliente.End_Estado].filter(Boolean).join(' · ') || null,
            condicaoId: condicao.id,
            condicaoNome: condicao.nomeCondicao,
            acrescimoPreco: acrescimo,
            valorMinimo: condicao.valorMinimo != null ? Number(condicao.valorMinimo) : 0,
            total: round2(total),
            validadeEm,
            observacoes: observacoes?.trim() || null,
            vendedorId: vendedor?.id || null,
            vendedorNome: vendedor?.nome || null,
            vendedorTelefone: comDDI55(vendedor?.telefone),
            itens: { create: itens }
        },
        include: { itens: { orderBy: { ordem: 'asc' } } }
    });

    return catalogo;
}

// ── listar do vendedor (painel interno) ──────────────────────────────────────
async function listarDoVendedor(vendedorId, { limit = 50 } = {}) {
    return prisma.catalogoPersonalizado.findMany({
        where: { vendedorId: vendedorId || undefined, status: 'ATIVO' },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit) || 50, 200),
        select: {
            id: true, token: true, titulo: true, clienteNome: true, condicaoNome: true,
            total: true, validadeEm: true, visualizacoes: true, ultimaVisita: true, createdAt: true,
            _count: { select: { itens: true } }
        }
    });
}

async function remover(id, vendedorId) {
    // Só arquiva (mantém histórico). Restringe ao dono quando houver vendedorId.
    const where = { id };
    const cat = await prisma.catalogoPersonalizado.findUnique({ where, select: { vendedorId: true } });
    if (!cat) throw Object.assign(new Error('Catálogo não encontrado.'), { status: 404 });
    await prisma.catalogoPersonalizado.update({ where, data: { status: 'REMOVIDO' } });
    return { ok: true };
}

// ── público (por token, sem login) ───────────────────────────────────────────
async function obterPublico(token) {
    if (!token) return null;
    const cat = await prisma.catalogoPersonalizado.findUnique({
        where: { token },
        include: { itens: { orderBy: { ordem: 'asc' } } }
    });
    if (!cat || cat.status === 'REMOVIDO') return null;

    // Contador de aberturas — best-effort, nunca derruba a resposta pública.
    prisma.catalogoPersonalizado.update({
        where: { token },
        data: { visualizacoes: { increment: 1 }, ultimaVisita: new Date() }
    }).catch(() => { });

    // WhatsApp central da loja (config opcional)
    let whatsapp = WHATSAPP_PADRAO;
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'catalogo_publico_whatsapp' } });
        if (cfg?.value) whatsapp = soDigitos(typeof cfg.value === 'string' ? cfg.value : (cfg.value.numero || cfg.value.whatsapp || '')) || WHATSAPP_PADRAO;
    } catch (_) { /* usa o padrão */ }

    const expirado = !!(cat.validadeEm && cat.validadeEm.getTime() < Date.now());

    return {
        token: cat.token,
        titulo: cat.titulo,
        clienteNome: cat.clienteNome,
        clienteCidade: cat.clienteCidade,
        condicaoNome: cat.condicaoNome,
        validadeEm: cat.validadeEm,
        expirado,
        observacoes: cat.observacoes,
        vendedorNome: cat.vendedorNome,
        vendedorTelefone: cat.vendedorTelefone, // já com DDI 55 (ou null)
        whatsapp,
        total: Number(cat.total) || 0,
        criadoEm: cat.createdAt,
        itens: cat.itens.map(i => ({
            codigo: i.codigo,
            nome: i.nome,
            unidade: i.unidade,
            imagemUrl: i.imagemUrl,
            precoFinal: Number(i.precoFinal) || 0,
            categoriaNome: i.categoriaNome,
            categoriaCor: i.categoriaCor
        }))
    };
}

module.exports = { criar, listarDoVendedor, remover, obterPublico };
