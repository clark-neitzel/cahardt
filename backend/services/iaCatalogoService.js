// Catálogo personalizado gerado pela IA (Ana) — v1.6.5.
//
// A Ana, durante a conversa no WhatsApp, monta uma lista de preços (igual à que o vendedor monta
// na tela Produtos → Catálogo) e manda o link pro cliente. Reaproveita 100% o serviço existente
// (backend/services/catalogoPersonalizadoService.js — mesmo snapshot, mesma página pública
// /lista/:token, mesmo formato de link); esta camada só faz a parte específica da IA:
//   - identificação por TELEFONE (nunca CPF/CNPJ sozinho — mesma regra do resto desta API);
//   - resolve "todos os produtos" e aceita id do site (CongeladosProduto) além de Produto.id;
//   - snapshot do vendedor vinculado ao cliente (como o handoff `vendedorInfo` já faz);
//   - dedupe leve por telefone+condição+produtos nos últimos 10 minutos;
//   - auditoria (fora da gravação principal, nunca derruba o catálogo já criado).
const prisma = require('../config/database');
const catalogoService = require('./catalogoPersonalizadoService');
const iaClienteService = require('./iaClienteService');

const JANELA_DEDUPE_MIN = 10;
// Domínio OFICIAL da marca (o mesmo que a tela do vendedor usa no link do WhatsApp) — o link vai
// pro CLIENTE final, nunca o domínio técnico do easypanel. Confirmado servindo /lista/:token.
const HOST_PADRAO = 'https://hardtsalgados.com.br';

function hostPublico() {
    return (process.env.PUBLIC_APP_URL || HOST_PADRAO).replace(/\/+$/, '');
}
function linkDoToken(token) {
    return `${hostPublico()}/lista/${token}`;
}
function tituloPadrao() {
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return `Catálogo · Ana · ${hoje}`;
}

// Filtro de "universo vendável" para a Ana: Produto ativo e "vendável" (mesma regra que o
// snapshot do catálogo já aplica em `criar()` — categorias marcadas como imobilizado/não-venda
// ficam de fora) DENTRO das categorias CA configuradas em `app_configs.categorias_vendas` (ex.:
// "Produto Acabado", "Mercadoria para Revenda") — a MESMA config que a tela Produtos → Catálogo
// usa como base antes de aplicar as permissões do vendedor logado (`categoriaProdutoIds` do
// usuário). Sem essa checagem, "todos" pegaria QUALQUER Produto ativo do banco, inclusive
// insumo/material de uso e consumo que nunca aparece pra vendedor nenhum (achado testando
// localmente: sem o filtro de categoria, "todos" trouxe abraçadeira/parafuso junto com salgado).
// Sem `categorias_vendas` configurado (array vazio/ausente) cai no mesmo comportamento de antes —
// tela e API sem filtro de categoria CA, só `ativo`+`vendável`. A Ana não é um vendedor com
// permissões de categoria comercial — essa parte (mais restritiva, por usuário) não se aplica aqui.
// Usado TANTO por `todos:true` quanto por `produtoIds` explícito (revisor 09/2026: um id de
// ferragem passado direto em `produtoIds` entrava com preço, porque só `todos` filtrava por
// categoria) — ver `resolverProdutoIds` abaixo.
async function universoWhere() {
    const [naoVendaveis, cfgCategorias] = await Promise.all([
        catalogoService.nomesNaoVendaveis(),
        prisma.appConfig.findUnique({ where: { key: 'categorias_vendas' } }).catch(() => null)
    ]);
    const categoriasVendas = Array.isArray(cfgCategorias?.value) ? cfgCategorias.value.filter(Boolean) : [];
    return {
        ativo: true,
        ...catalogoService.filtroVendavel(naoVendaveis),
        ...(categoriasVendas.length ? { categoria: { in: categoriasVendas } } : {})
    };
}

async function todosProdutoIds() {
    const produtos = await prisma.produto.findMany({ where: await universoWhere(), select: { id: true } });
    return produtos.map(p => p.id);
}

// Aceita tanto Produto.id (o que o catálogo grava) quanto CongeladosProduto.id (o "id do site",
// que a Ana às vezes vai ter em mãos vindo do catálogo/ficha do site de Congelados) — mapeia o
// segundo para o Produto.id correspondente. Depois filtra pelo MESMO universo vendável de
// `todos:true` (ativo + vendável + `categorias_vendas` quando configurado) — id que não é
// produto de venda (ferragem, insumo, inativo) é simplesmente IGNORADO, não vira erro por si só;
// só some com `400 SEM_PRODUTOS` se sobrar zero produto válido no fim.
async function resolverProdutoIds(idsRecebidos) {
    const ids = [...new Set((idsRecebidos || []).filter(Boolean).map(String))];
    if (!ids.length) return [];
    const viaSite = await prisma.congeladosProduto.findMany({
        where: { id: { in: ids } },
        select: { id: true, produtoId: true }
    });
    const mapaSite = new Map(viaSite.map(c => [c.id, c.produtoId]));
    const candidatos = [...new Set(ids.map(id => mapaSite.get(id) || id))];
    const validos = await prisma.produto.findMany({
        where: { id: { in: candidatos }, ...(await universoWhere()) },
        select: { id: true }
    });
    return validos.map(p => p.id);
}

// Dedupe leve: mesma telefone+condicaoId+conjunto de produtoIds nos últimos 10 minutos devolve o
// catálogo já existente em vez de criar outro. Não há coluna para `idempotencyKey` (o parâmetro é
// aceito mas não é o que decide o reaproveitamento — ver ia-consulta-api.md).
async function catalogoReaproveitavel(clienteUuid, condicaoId, produtoIds) {
    const desde = new Date(Date.now() - JANELA_DEDUPE_MIN * 60 * 1000);
    const candidatos = await prisma.catalogoPersonalizado.findMany({
        where: { clienteUuid, condicaoId, status: 'ATIVO', createdAt: { gte: desde } },
        orderBy: { createdAt: 'desc' },
        include: { itens: { select: { produtoId: true } } }
    });
    const alvo = [...produtoIds].sort().join('|');
    return candidatos.find(c => c.itens.map(i => i.produtoId).sort().join('|') === alvo) || null;
}

function montarRespostaCatalogo(cat, { reaproveitado = false } = {}) {
    return {
        reconhecido: true,
        id: cat.id,
        token: cat.token,
        link: linkDoToken(cat.token),
        titulo: cat.titulo,
        cliente: { nome: cat.clienteNome },
        condicao: { nome: cat.condicaoNome, medianteAprovacao: cat.medianteAprovacao },
        total: Number(cat.total) || 0,
        qtdItens: cat.itens?.length ?? cat._count?.itens ?? 0,
        validadeEm: cat.validadeEm,
        vendedorNome: cat.vendedorNome || 'Hardt Salgados',
        itens: (cat.itens || []).map(i => ({
            produtoId: i.produtoId,
            codigo: i.codigo,
            nome: i.nome,
            unidade: i.unidade,
            precoFinal: Number(i.precoFinal) || 0
        })),
        reaproveitado
    };
}

const iaCatalogoService = {
    // POST /catalogo/gerar — ver contrato completo em backend/docs/ia-consulta-api.md (v1.6.5).
    async gerar({ telefone, produtoIds, todos, titulo, observacoes, condicaoId, idempotencyKey }) {
        const cliente = await iaClienteService.clientePorTelefone(telefone);
        if (!cliente) return { reconhecido: false };

        // Produtos: `todos:true` OU `produtoIds` (não os dois vazios)
        let idsProduto = [];
        if (todos === true) {
            idsProduto = await todosProdutoIds();
        } else if (Array.isArray(produtoIds) && produtoIds.length) {
            idsProduto = await resolverProdutoIds(produtoIds);
        }
        if (!idsProduto.length) {
            const e = new Error('Informe produtoIds (ids de produto) ou todos:true.');
            e.status = 400; e.code = 'SEM_PRODUTOS';
            throw e;
        }

        // Condição: a informada (validada) ou a padrão do cliente (a mesma que
        // reconhecer-telefone devolve em condicaoPagamento).
        const condIdBruto = condicaoId || cliente.Condicao_de_pagamento;
        if (!condIdBruto) {
            const e = new Error('Cliente sem condição de pagamento padrão cadastrada — informe condicaoId.');
            e.status = 400; e.code = 'SEM_CONDICAO';
            throw e;
        }
        const condicao = await prisma.tabelaPreco.findFirst({
            where: { OR: [{ id: condIdBruto }, { idCondicao: condIdBruto }] }
        });
        if (!condicao || condicao.permiteCatalogoPersonalizado === false) {
            const e = new Error('Condição de pagamento inválida ou não disponível para catálogo.');
            e.status = 400; e.code = 'CONDICAO_INVALIDA';
            throw e;
        }

        // Dedupe leve (10 min) — antes de criar, devolve o existente se bater exatamente.
        const existente = await catalogoReaproveitavel(cliente.UUID, condicao.id, idsProduto);
        if (existente) {
            return montarRespostaCatalogo(existente, { reaproveitado: true });
        }

        // Vendedor do snapshot: o vendedor vinculado ao cliente (igual ao `vendedorInfo` do
        // handoff em reconhecerPorTelefone). Sem vendedor (ou vendedor inativo) → "Hardt Salgados".
        let vendedorSnapshot = {};
        if (cliente.idVendedor) {
            const v = await prisma.vendedor.findUnique({
                where: { id: cliente.idVendedor },
                select: { id: true, nome: true, telefone: true, ativo: true }
            });
            if (v && v.ativo !== false) vendedorSnapshot = { id: v.id, nome: v.nome, telefone: v.telefone };
        }

        const catalogo = await catalogoService.criar({
            vendedor: vendedorSnapshot,
            clienteUuid: cliente.UUID,
            condicaoId: condicao.id,
            produtoIds: idsProduto,
            titulo: titulo && String(titulo).trim() ? titulo : tituloPadrao(),
            observacoes
        });

        // Auditoria fora da gravação principal — falha de log não desfaz o catálogo já criado.
        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'CATALOGO_GERADO_API_IA',
                    entidade: 'CatalogoPersonalizado',
                    entidadeId: catalogo.id,
                    usuarioId: 'ana',
                    usuarioNome: 'Ana (WhatsApp IA)',
                    detalhes: JSON.stringify({
                        telefone, clienteUuid: cliente.UUID, condicaoId: condicao.id,
                        qtdProdutos: idsProduto.length, idempotencyKey: idempotencyKey || null
                    })
                }
            });
        } catch (logErr) {
            console.error('[IaCatalogo] falha ao gravar auditoria (catálogo já criado):', logErr.message);
        }

        return montarRespostaCatalogo(catalogo);
    },

    // GET /catalogo/:token — mesma leitura da página pública (o token já é o segredo; não exige
    // telefone). Usado pela Ana para reler/conferir o que mandou.
    async obterPorToken(token) {
        const dados = await catalogoService.obterPublico(token);
        if (!dados) {
            const e = new Error('Catálogo não encontrado ou removido.');
            e.status = 404; e.code = 'CATALOGO_NAO_ENCONTRADO';
            throw e;
        }
        return dados;
    },

    // POST /catalogo/listar — catálogos ATIVOS do cliente reconhecido pelo telefone.
    async listarPorTelefone(telefone, limiteRaw) {
        const cliente = await iaClienteService.clientePorTelefone(telefone);
        if (!cliente) return { reconhecido: false };
        const limite = Math.min(Math.max(parseInt(limiteRaw) || 10, 1), 50);
        const catalogos = await prisma.catalogoPersonalizado.findMany({
            where: { clienteUuid: cliente.UUID, status: 'ATIVO' },
            orderBy: { createdAt: 'desc' },
            take: limite,
            select: {
                id: true, token: true, titulo: true, condicaoNome: true, total: true,
                validadeEm: true, visualizacoes: true, createdAt: true,
                _count: { select: { itens: true } }
            }
        });
        return {
            reconhecido: true,
            cliente: { nome: cliente.NomeFantasia || cliente.Nome },
            catalogos: catalogos.map(c => ({
                id: c.id,
                token: c.token,
                link: linkDoToken(c.token),
                titulo: c.titulo,
                condicaoNome: c.condicaoNome,
                total: Number(c.total) || 0,
                qtdItens: c._count.itens,
                validadeEm: c.validadeEm,
                visualizacoes: c.visualizacoes,
                criadoEm: c.createdAt
            }))
        };
    }
};

module.exports = iaCatalogoService;
