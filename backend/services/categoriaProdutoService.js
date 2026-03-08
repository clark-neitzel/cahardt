const prisma = require('../config/database');

const categoriaProdutoService = {
    listar: async () => {
        return await prisma.categoriaProduto.findMany({
            orderBy: { ordemExibicao: 'asc' }
        });
    },

    detalhar: async (id) => {
        return await prisma.categoriaProduto.findUnique({
            where: { id }
        });
    },

    criar: async (dados) => {
        return await prisma.categoriaProduto.create({
            data: dados
        });
    },

    atualizar: async (id, dados) => {
        return await prisma.categoriaProduto.update({
            where: { id },
            data: dados
        });
    },

    deletar: async (id) => {
        return await prisma.categoriaProduto.delete({
            where: { id }
        });
    }
};

module.exports = categoriaProdutoService;
