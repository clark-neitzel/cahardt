const prisma = require('../config/database');

const vendedorController = {
    // Listar todos os vendedores
    listar: async (req, res) => {
        try {
            const vendedores = await prisma.vendedor.findMany({
                orderBy: { nome: 'asc' }
            });
            res.json(vendedores);
        } catch (error) {
            console.error('Erro ao listar vendedores:', error);
            res.status(500).json({ error: 'Erro ao listar vendedores' });
        }
    },

    // Buscar vendedor por ID (opcional)
    obter: async (req, res) => {
        try {
            const { id } = req.params;
            const vendedor = await prisma.vendedor.findUnique({ where: { id } });
            if (!vendedor) return res.status(404).json({ error: 'Vendedor não encontrado' });
            res.json(vendedor);
        } catch (error) {
            console.error('Erro ao obter vendedor:', error);
            res.status(500).json({ error: 'Erro ao obter vendedor' });
        }
    },

    // Atualizar dados locais (Email, Flex)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;
            const { email, flexMensal, flexDisponivel } = req.body;

            // Prepara objeto de atualização (ignora undefined)
            const dataToUpdate = {};
            if (email !== undefined) dataToUpdate.email = email;
            if (flexMensal !== undefined) dataToUpdate.flexMensal = flexMensal;
            if (flexDisponivel !== undefined) dataToUpdate.flexDisponivel = flexDisponivel;

            const vendedor = await prisma.vendedor.update({
                where: { id },
                data: dataToUpdate
            });

            res.json(vendedor);
        } catch (error) {
            console.error('Erro ao atualizar vendedor:', error);
            res.status(500).json({ error: 'Erro ao atualizar vendedor' });
        }
    }
};

module.exports = vendedorController;
