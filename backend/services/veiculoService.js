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

    // Retorna o último KM final registrado nos diários para pré-preenchimento do KM inicial
    ultimoKmFinal: async (veiculoId) => {
        const ultimo = await prisma.diarioVendedor.findFirst({
            where: { veiculoId, kmFinal: { not: null } },
            orderBy: { dataReferencia: 'desc' },
            select: { kmFinal: true, dataReferencia: true }
        });
        return ultimo || null;
    },

    // Retorna o maior KM registrado em abastecimentos para validação ao registrar novo
    ultimoKmAbastecimento: async (veiculoId) => {
        const resultado = await prisma.despesa.findFirst({
            where: {
                veiculoId,
                categoria: 'COMBUSTIVEL',
                kmNoAbastecimento: { not: null }
            },
            orderBy: { kmNoAbastecimento: 'desc' },
            select: { kmNoAbastecimento: true, dataReferencia: true, litros: true }
        });
        return resultado || null;
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

        // Calcular média de consumo real (km/L) a partir dos abastecimentos com KM registrado
        // Lógica: entre cada par de abastecimentos consecutivos, km_percorridos / litros_no_2o_abastecimento
        const combsComKm = veiculo.despesas
            .filter(d => d.litros && Number(d.litros) > 0 && d.kmNoAbastecimento && Number(d.kmNoAbastecimento) > 0)
            .map(d => ({ litros: Number(d.litros), km: Number(d.kmNoAbastecimento), data: d.dataReferencia }))
            .sort((a, b) => a.km - b.km); // ordena por km crescente

        let consumoMedioReal = null;
        const parcelasConsumo = [];

        if (combsComKm.length >= 2) {
            for (let i = 1; i < combsComKm.length; i++) {
                const kmRodados = combsComKm[i].km - combsComKm[i - 1].km;
                const litrosNoPonto = combsComKm[i].litros;
                // Sanity check: ignora segmentos inválidos
                // - KM rodados deve ser > 0 e < 5000 (mais que 5000km entre abastecimentos é dado errado)
                // - km/L deve ser <= 50 (acima disso é abastecimento parcial/1L ou dado errado)
                // - litros deve ser >= 5 (menos que 5L é abastecimento parcial - afeta a média)
                if (kmRodados > 0 && kmRodados < 5000 && litrosNoPonto >= 5) {
                    const eficiencia = kmRodados / litrosNoPonto;
                    if (eficiencia <= 50) {
                        parcelasConsumo.push(eficiencia);
                    }
                }
            }

            if (parcelasConsumo.length > 0) {
                const somaConsumo = parcelasConsumo.reduce((s, v) => s + v, 0);
                consumoMedioReal = parseFloat((somaConsumo / parcelasConsumo.length).toFixed(2));
            }
        }

        // KM atual estimado (último kmFinal registrado)
        const kmAtual = diariosComKm.length > 0 ? diariosComKm[0].kmFinal : null;

        return {
            ...veiculo,
            // IMPORTANTE: retorna veiculo.despesas original (com todos os campos: valor, categoria, kmNoAbastecimento, etc)
            // Não sobrescreve! O spread ...veiculo já inclui despesas; apenas stats são adicionados
            stats: {
                kmAtual,
                kmMedioPorDia,
                consumoMedioReal,
                totalDiarios: veiculo.diarios.length,
                totalAbastecimentos: veiculo.despesas.filter(d => d.litros && Number(d.litros) > 0).length,
                alertasPendentes: veiculo.alertasManutencao.filter(a => !a.concluido).length,
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
                seguroApoliceUrl: dados.seguroApoliceUrl || null,
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
                seguroApoliceUrl: dados.seguroApoliceUrl !== undefined ? dados.seguroApoliceUrl : undefined,
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
