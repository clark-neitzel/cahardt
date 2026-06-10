const prisma = require('../config/database');

const categoriaEstoqueService = {

    // Lista todas as categorias cadastradas, mesclando com valores distintos existentes nos produtos
    listarComProdutos: async () => {
        const [cadastradas, produtosDistintos] = await Promise.all([
            prisma.categoriaEstoque.findMany({ orderBy: { nome: 'asc' } }),
            prisma.produto.findMany({
                where: { categoria: { not: null } },
                select: { categoria: true },
                distinct: ['categoria']
            })
        ]);

        const nomesCadastrados = new Set(cadastradas.map(c => c.nome));

        // Inclui categorias que existem em produtos mas ainda não foram cadastradas
        const extras = produtosDistintos
            .map(p => p.categoria)
            .filter(nome => nome && !nomesCadastrados.has(nome))
            .map(nome => ({ id: null, nome, controlaEstoque: false, createdAt: null, naoSalva: true }));

        return [...cadastradas, ...extras].sort((a, b) => a.nome.localeCompare(b.nome));
    },

    // Salva (upsert) os flags de uma categoria (estoque e/ou flex)
    salvar: async (nome, controlaEstoque, contabilizaFlex) => {
        const updateData = {};
        if (controlaEstoque !== undefined) updateData.controlaEstoque = controlaEstoque;
        if (contabilizaFlex !== undefined) updateData.contabilizaFlex = contabilizaFlex;

        return await prisma.categoriaEstoque.upsert({
            where: { nome },
            update: updateData,
            create: {
                id: require('crypto').randomUUID(),
                nome,
                controlaEstoque: controlaEstoque ?? false,
                contabilizaFlex: contabilizaFlex ?? true
            }
        });
    }
};

module.exports = categoriaEstoqueService;
