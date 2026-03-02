const prisma = require('../config/database');

const veiculoService = {
    listar: async () => {
        return await prisma.veiculo.findMany({
            orderBy: { placa: 'asc' }
        });
    },

    listarAtivos: async () => {
        return await prisma.veiculo.findMany({
            where: { ativo: true },
            orderBy: { placa: 'asc' }
        });
    },

    obterPorId: async (id) => {
        const veiculo = await prisma.veiculo.findUnique({
            where: { id },
            include: {
                diarios: {
                    include: {
                        vendedor: { select: { nome: true } }
                    },
                    orderBy: { dataReferencia: 'desc' },
                    take: 20
                }
            }
        });
        if (!veiculo) throw new Error('Veículo não encontrado');
        return veiculo;
    },

    criar: async (dados) => {
        const existente = await prisma.veiculo.findUnique({ where: { placa: dados.placa } });
        if (existente) throw new Error('Já existe um veículo cadastrado com esta placa.');

        return await prisma.veiculo.create({
            data: {
                placa: dados.placa.toUpperCase(),
                modelo: dados.modelo,
                ativo: dados.ativo !== undefined ? dados.ativo : true,
                documentoUrl: dados.documentoUrl || null
            }
        });
    },

    atualizar: async (id, dados) => {
        if (dados.placa) {
            const existente = await prisma.veiculo.findFirst({
                where: { placa: dados.placa, id: { not: id } }
            });
            if (existente) throw new Error('Já existe outro veículo cadastrado com esta placa.');
        }

        return await prisma.veiculo.update({
            where: { id },
            data: {
                placa: dados.placa ? dados.placa.toUpperCase() : undefined,
                modelo: dados.modelo,
                ativo: dados.ativo,
                documentoUrl: dados.documentoUrl
            }
        });
    },

    excluir: async (id) => {
        const temDiarios = await prisma.diarioVendedor.findFirst({ where: { veiculoId: id } });
        if (temDiarios) {
            throw new Error('Não é possível excluir o veículo, pois existem registros de uso atrelados a ele. Apenas inative-o.');
        }

        return await prisma.veiculo.delete({
            where: { id }
        });
    }
};

module.exports = veiculoService;
