const crypto = require('crypto');
const prisma = require('../config/database'); // singleton compartilhado (pool único)

// WhatsApp central da loja para o botão "fazer pedido" da página pública.
// Pode ser sobrescrito em app_configs (chave "catalogo_publico_whatsapp"); default abaixo.
const WHATSAPP_PADRAO = '5547988548476';
const VALIDADE_DIAS = 7; // validade fixa do link (pedido do dono)

// ── helpers ────────────────────────────────────────────────────────────────
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem chars ambíguos (0/O, 1/I/L)
function gerarTokenBruto(len = 7) {
    const bytes = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
    return out;
}
async function gerarTokenUnico() {
    for (let tentativa = 0; tentativa < 6; tentativa++) {
        const token = gerarTokenBruto(tentativa < 3 ? 7 : 9);
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

// A condição está aprovada para este cliente? (mesma lógica do Novo Pedido: lista de
// condições permitidas do cliente ou, na ausência dela, apenas a condição padrão)
function condicaoAprovadaParaCliente(cliente, condicao) {
    if (!cliente) return false;
    let ids = [];
    if (Array.isArray(cliente.condicoes_pagamento_permitidas)) ids = cliente.condicoes_pagamento_permitidas;
    else if (typeof cliente.condicoes_pagamento_permitidas === 'string' && cliente.condicoes_pagamento_permitidas.trim())
        ids = cliente.condicoes_pagamento_permitidas.split(',').map(s => s.trim());
    if (ids.length) return ids.includes(condicao.idCondicao) || ids.includes(condicao.id);
    return condicao.idCondicao === cliente.Condicao_de_pagamento || condicao.id === cliente.Condicao_de_pagamento;
}

// ── criar (snapshot) ─────────────────────────────────────────────────────────
async function criar({ vendedor, clienteUuid, clienteNome, condicaoId, produtoIds, titulo, observacoes }) {
    if (!condicaoId) throw Object.assign(new Error('Condição de pagamento é obrigatória.'), { status: 400 });
    if (!Array.isArray(produtoIds) || produtoIds.length === 0)
        throw Object.assign(new Error('Selecione ao menos um produto.'), { status: 400 });

    // Destinatário: cliente cadastrado (clienteUuid) OU nome avulso (não-cliente)
    let cliente = null;
    let nomeDestino, telefoneDestino = null, cidadeDestino = null;
    if (clienteUuid) {
        cliente = await prisma.cliente.findUnique({
            where: { UUID: clienteUuid },
            select: {
                Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true,
                End_Cidade: true, End_Estado: true,
                Condicao_de_pagamento: true, condicoes_pagamento_permitidas: true
            }
        });
        if (!cliente) throw Object.assign(new Error('Cliente não encontrado.'), { status: 404 });
        nomeDestino = cliente.NomeFantasia || cliente.Nome;
        telefoneDestino = cliente.Telefone_Celular || cliente.Telefone || null;
        cidadeDestino = [cliente.End_Cidade, cliente.End_Estado].filter(Boolean).join(' · ') || null;
    } else {
        nomeDestino = (clienteNome || '').trim();
        if (nomeDestino.length < 2)
            throw Object.assign(new Error('Informe o cliente ou o nome do destinatário.'), { status: 400 });
    }

    // Condição — aceita id (PK) ou idCondicao
    const condicao = await prisma.tabelaPreco.findFirst({
        where: { OR: [{ id: condicaoId }, { idCondicao: condicaoId }] }
    });
    if (!condicao) throw Object.assign(new Error('Condição de pagamento não encontrada.'), { status: 404 });
    if (condicao.permiteCatalogoPersonalizado === false)
        throw Object.assign(new Error('Essa condição não está disponível para o catálogo.'), { status: 400 });

    const acrescimo = Number(condicao.acrescimoPreco) || 0;
    const aprovada = condicaoAprovadaParaCliente(cliente, condicao);
    // Condição sujeita a aprovação de crédito (tag na condição), não aprovada p/ o destinatário
    const medianteAprovacao = !aprovada && condicao.exigeAprovacaoCredito === true;

    // Produtos frescos do catálogo
    const produtos = await prisma.produto.findMany({
        where: { id: { in: produtoIds }, ativo: true },
        include: {
            imagens: { orderBy: [{ principal: 'desc' }, { ordem: 'asc' }], take: 1 },
            categoriaProduto: { select: { nome: true, corTag: true } }
        }
    });
    if (produtos.length === 0)
        throw Object.assign(new Error('Nenhum dos produtos selecionados está disponível.'), { status: 400 });

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

    const validadeEm = new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60 * 1000);
    const token = await gerarTokenUnico();

    const catalogo = await prisma.catalogoPersonalizado.create({
        data: {
            token,
            titulo: titulo?.trim() || null,
            clienteUuid: clienteUuid || null,
            clienteNome: nomeDestino,
            clienteTelefone: telefoneDestino,
            clienteCidade: cidadeDestino,
            condicaoId: condicao.id,
            condicaoNome: condicao.nomeCondicao,
            medianteAprovacao,
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

// ── listar do vendedor ───────────────────────────────────────────────────────
async function listarDoVendedor(vendedorId, { limit = 50 } = {}) {
    return prisma.catalogoPersonalizado.findMany({
        where: { vendedorId: vendedorId || undefined, status: 'ATIVO' },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit) || 50, 200),
        select: {
            id: true, token: true, titulo: true, clienteNome: true, condicaoNome: true,
            medianteAprovacao: true, total: true, validadeEm: true, visualizacoes: true,
            ultimaVisita: true, createdAt: true, _count: { select: { itens: true } }
        }
    });
}

async function remover(id) {
    const cat = await prisma.catalogoPersonalizado.findUnique({ where: { id }, select: { id: true } });
    if (!cat) throw Object.assign(new Error('Catálogo não encontrado.'), { status: 404 });
    await prisma.catalogoPersonalizado.update({ where: { id }, data: { status: 'REMOVIDO' } });
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
    let whatsappLoja = WHATSAPP_PADRAO;
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'catalogo_publico_whatsapp' } });
        if (cfg?.value) whatsappLoja = soDigitos(typeof cfg.value === 'string' ? cfg.value : (cfg.value.numero || cfg.value.whatsapp || '')) || WHATSAPP_PADRAO;
    } catch (_) { /* usa o padrão */ }

    // Destino do WhatsApp: cliente cadastrado → vendedor que montou; não-cliente → loja
    const ehCliente = !!cat.clienteUuid;
    const whatsapp = (ehCliente && cat.vendedorTelefone) ? cat.vendedorTelefone : whatsappLoja;

    const expirado = !!(cat.validadeEm && cat.validadeEm.getTime() < Date.now());

    return {
        token: cat.token,
        titulo: cat.titulo,
        clienteNome: cat.clienteNome,
        clienteCidade: cat.clienteCidade,
        condicaoNome: cat.condicaoNome,
        medianteAprovacao: cat.medianteAprovacao,
        validadeEm: cat.validadeEm,
        expirado,
        observacoes: cat.observacoes,
        vendedorNome: cat.vendedorNome,
        whatsapp, // já resolvido (vendedor p/ cliente, loja p/ não-cliente)
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
