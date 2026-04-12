const prisma = require('../config/database');

const pcpItemService = {

    listar: async ({ tipo, search, ativo }) => {
        const where = {};
        if (tipo) where.tipo = tipo;
        if (ativo !== undefined) where.ativo = ativo === 'true' || ativo === true;
        if (search?.trim()) {
            where.OR = [
                { nome: { contains: search.trim(), mode: 'insensitive' } },
                { codigo: { contains: search.trim(), mode: 'insensitive' } }
            ];
        }
        return prisma.itemPcp.findMany({
            where,
            include: { produto: { select: { id: true, nome: true, codigo: true } } },
            orderBy: [{ tipo: 'asc' }, { nome: 'asc' }]
        });
    },

    buscarPorId: async (id) => {
        return prisma.itemPcp.findUnique({
            where: { id },
            include: {
                produto: { select: { id: true, nome: true, codigo: true } },
                receitasComoResultado: {
                    where: { status: 'ativa' },
                    select: { id: true, versao: true, nome: true, rendimentoBase: true, status: true }
                }
            }
        });
    },

    proximoCodigoSub: async () => {
        const ultimos = await prisma.itemPcp.findMany({
            where: { tipo: 'SUB', codigo: { startsWith: 'SUB-' } },
            select: { codigo: true }
        });
        let maior = 0;
        for (const it of ultimos) {
            const m = /^SUB-(\d+)$/.exec(it.codigo);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n > maior) maior = n;
            }
        }
        return `SUB-${String(maior + 1).padStart(4, '0')}`;
    },

    // Criar apenas SUB (subproduto) — MP, PA e EMB vem do cadastro de Produtos via importar
    criar: async (data) => {
        if (data.tipo !== 'SUB') {
            throw new Error('Apenas subprodutos (SUB) podem ser criados manualmente. MP, PA e EMB devem ser importados do cadastro de Produtos.');
        }
        let codigo = data.codigo?.trim();
        if (!codigo) {
            codigo = await pcpItemService.proximoCodigoSub();
        }
        return prisma.itemPcp.create({
            data: {
                codigo,
                nome: data.nome,
                tipo: 'SUB',
                unidade: data.unidade,
                descricao: data.descricao || null,
                produtoId: null,
                custoUnitario: data.custoUnitario ? parseFloat(data.custoUnitario) : null,
                estoqueMinimo: data.estoqueMinimo ? parseFloat(data.estoqueMinimo) : 0
            }
        });
    },

    // Garantir que existe ItemPcp para um Produto do cadastro (find or create)
    importar: async ({ produtoId, tipo }) => {
        if (!['MP', 'PA', 'EMB'].includes(tipo)) {
            throw new Error('Tipo para importação deve ser MP, PA ou EMB.');
        }

        const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
        if (!produto) throw new Error('Produto não encontrado no cadastro.');

        // Se já existe, retorna o existente (sem erro)
        const existente = await prisma.itemPcp.findFirst({
            where: { produtoId },
            include: { produto: { select: { id: true, nome: true, codigo: true } } }
        });
        if (existente) return existente;

        // Verificar se codigo ja existe (pode ter outro item com mesmo codigo)
        const codigoExiste = await prisma.itemPcp.findUnique({ where: { codigo: produto.codigo } });
        const codigo = codigoExiste ? `${produto.codigo}-${tipo}` : produto.codigo;

        return prisma.itemPcp.create({
            data: {
                codigo,
                nome: produto.nome,
                tipo,
                unidade: produto.unidade || 'UN',
                descricao: produto.descricao || null,
                produtoId: produto.id,
                custoUnitario: produto.custoMedio ? parseFloat(produto.custoMedio) : null,
                estoqueMinimo: 0
            },
            include: { produto: { select: { id: true, nome: true, codigo: true } } }
        });
    },

    // Importar múltiplos produtos de uma vez
    importarLote: async (itens) => {
        const resultados = [];
        for (const { produtoId, tipo } of itens) {
            try {
                const item = await pcpItemService.importar({ produtoId, tipo });
                resultados.push({ sucesso: true, item });
            } catch (err) {
                resultados.push({ sucesso: false, produtoId, tipo, erro: err.message });
            }
        }
        return resultados;
    },

    atualizar: async (id, data) => {
        const item = await prisma.itemPcp.findUnique({ where: { id }, select: { tipo: true, produtoId: true } });
        if (!item) throw new Error('Item não encontrado');

        const updateData = {};
        // Itens importados (MP/PA/EMB com produtoId): só permite editar campos PCP
        if (item.produtoId) {
            if (data.estoqueMinimo !== undefined) updateData.estoqueMinimo = parseFloat(data.estoqueMinimo);
            if (data.custoUnitario !== undefined) updateData.custoUnitario = data.custoUnitario ? parseFloat(data.custoUnitario) : null;
            if (data.descricao !== undefined) updateData.descricao = data.descricao;
        } else {
            // SUB: pode editar tudo
            if (data.codigo !== undefined) updateData.codigo = data.codigo;
            if (data.nome !== undefined) updateData.nome = data.nome;
            if (data.unidade !== undefined) updateData.unidade = data.unidade;
            if (data.descricao !== undefined) updateData.descricao = data.descricao;
            if (data.custoUnitario !== undefined) updateData.custoUnitario = data.custoUnitario ? parseFloat(data.custoUnitario) : null;
            if (data.estoqueMinimo !== undefined) updateData.estoqueMinimo = parseFloat(data.estoqueMinimo);
        }

        return prisma.itemPcp.update({ where: { id }, data: updateData });
    },

    toggleAtivo: async (id) => {
        const item = await prisma.itemPcp.findUnique({ where: { id }, select: { ativo: true } });
        if (!item) throw new Error('Item não encontrado');
        return prisma.itemPcp.update({ where: { id }, data: { ativo: !item.ativo } });
    }
};

module.exports = pcpItemService;
