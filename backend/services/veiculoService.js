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

    // Retorna o último KM final registrado para pré-preenchimento do KM inicial
    ultimoKmFinal: async (veiculoId) => {
        const ultimo = await prisma.diarioVendedor.findFirst({
            where: { veiculoId, kmFinal: { not: null } },
            orderBy: { dataReferencia: 'desc' },
            select: { kmFinal: true, dataReferencia: true }
        });
        return ultimo || null;
    },

    // Ficha completa do veículo com médias calculadas
    obterFicha: async (id) => {
        const veiculo = await prisma.veiculo.findUnique({
            where: { id },
            include: {
                diarios: {
                    include: {
                        vendedor: { select: { id: true, nome: true } }
                    },
                    orderBy: { dataReferencia: 'desc' },
                    take: 100
                },
                alertasManutencao: {
                    orderBy: { createdAt: 'desc' }
                },
                despesas: {
                    where: { categoria: 'COMBUSTIVEL' },
                    orderBy: { createdAt: 'desc' },
                    take: 50
                }
            }
        });

        if (!veiculo) throw new Error('Veículo não encontrado');

        // Calcular KM médio por dia (apenas diários com KM inicial e final)
        const diariosComKm = veiculo.diarios.filter(d => d.kmInicial && d.kmFinal);
        const kmMedioPorDia = diariosComKm.length > 0
            ? Math.round(diariosComKm.reduce((sum, d) => sum + (d.kmFinal - d.kmInicial), 0) / diariosComKm.length)
            : null;

        // Calcular média de consumo real (km/L) a partir dos abastecimentos
        // Junta abastecimentos com dados de km do diário do mesmo dia e veículo
        const abastecimentos = veiculo.despesas.filter(d => d.litros && Number(d.litros) > 0);
        let consumoMedioReal = null;
        if (abastecimentos.length >= 2) {
            // Precisa de pelo menos 2 abastecimentos para calcular (entre-pontos)
            // Busca diários correspondentes por data
            const diasAbastecimento = abastecimentos.map(a => a.dataReferencia);
            const diariosMap = {};
            veiculo.diarios.forEach(d => { diariosMap[d.dataReferencia] = d; });

            const pontos = abastecimentos
                .map(a => {
                    const diario = diariosMap[a.dataReferencia];
                    return diario ? { litros: Number(a.litros), kmFinal: diario.kmFinal } : null;
                })
                .filter(Boolean)
                .sort((a, b) => a.kmFinal - b.kmFinal);

            if (pontos.length >= 2) {
                const totalLitros = pontos.reduce((s, p) => s + p.litros, 0);
                const kmTotal = pontos[pontos.length - 1].kmFinal - pontos[0].kmFinal;
                consumoMedioReal = totalLitros > 0 ? parseFloat((kmTotal / totalLitros).toFixed(2)) : null;
            }
        }

        // KM atual estimado (último kmFinal registrado)
        const kmAtual = diariosComKm.length > 0 ? diariosComKm[0].kmFinal : null;

        return {
            ...veiculo,
            stats: {
                kmAtual,
                kmMedioPorDia,
                consumoMedioReal,
                totalDiarios: veiculo.diarios.length,
                totalAbastecimentos: abastecimentos.length,
                alertasPendentes: veiculo.alertasManutencao.filter(a => !a.concluido).length,
                // Alerta de seguro próximo do vencimento (30 dias)
                seguroVencendoEm30Dias: veiculo.seguroVencimento
                    ? (new Date(veiculo.seguroVencimento) - new Date()) < 30 * 24 * 60 * 60 * 1000
                    : false
            }
        };
    },

    criar: async (dados) => {
        const existente = await prisma.veiculo.findUnique({ where: { placa: dados.placa } });
        if (existente) throw new Error('Já existe um veículo cadastrado com esta placa.');

        return await prisma.veiculo.create({
            data: {
                placa: dados.placa.toUpperCase(),
                modelo: dados.modelo,
                ativo: dados.ativo !== undefined ? dados.ativo : true,
                documentoUrl: dados.documentoUrl || null,
                seguroVencimento: dados.seguroVencimento ? new Date(dados.seguroVencimento) : null,
                seguroApolice: dados.seguroApolice || null,
                seguroSeguradora: dados.seguroSeguradora || null,
                capacidadeTanque: dados.capacidadeTanque || null,
                kmMedioSugerido: dados.kmMedioSugerido ? parseInt(dados.kmMedioSugerido) : null,
                observacoes: dados.observacoes || null
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
                documentoUrl: dados.documentoUrl !== undefined ? dados.documentoUrl : undefined,
                seguroVencimento: dados.seguroVencimento !== undefined
                    ? (dados.seguroVencimento ? new Date(dados.seguroVencimento) : null)
                    : undefined,
                seguroApolice: dados.seguroApolice !== undefined ? dados.seguroApolice : undefined,
                seguroSeguradora: dados.seguroSeguradora !== undefined ? dados.seguroSeguradora : undefined,
                capacidadeTanque: dados.capacidadeTanque !== undefined ? dados.capacidadeTanque : undefined,
                kmMedioSugerido: dados.kmMedioSugerido !== undefined
                    ? (dados.kmMedioSugerido ? parseInt(dados.kmMedioSugerido) : null)
                    : undefined,
                observacoes: dados.observacoes !== undefined ? dados.observacoes : undefined
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
