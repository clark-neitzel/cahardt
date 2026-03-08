const prisma = require('../config/database');

const categoriaClienteService = {
    listar: async () => {
        return await prisma.categoriaCliente.findMany({
            orderBy: { nome: 'asc' }
        });
    },

    detalhar: async (id) => {
        return await prisma.categoriaCliente.findUnique({
            where: { id }
        });
    },

    criar: async (dados) => {
        return await prisma.categoriaCliente.create({
            data: dados
        });
    },

    atualizar: async (id, dados) => {
        return await prisma.categoriaCliente.update({
            where: { id },
            data: dados
        });
    },

    deletar: async (id) => {
        return await prisma.categoriaCliente.delete({
            where: { id }
        });
    }
};

module.exports = categoriaClienteService;
