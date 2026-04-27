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
                    orderBy: { kmNoAbastecimento: 'desc' },
                    take: 100
                }
            }
        });

        if (!veiculo) throw new Error('Veículo não encontrado');

        // Calcular KM médio por dia (apenas diários com KM inicial e final)
        const diariosComKm = veiculo.diarios.filter(d => d.kmInicial && d.kmFinal);
        const kmMedioPorDia = diariosComKm.length > 0
            ? Math.round(diariosComKm.reduce((sum, d) => sum + (d.kmFinal - d.kmInicial), 0) / diariosComKm.length)
            : null;

        // Calcular consumo médio real (km/L) — últimos 30 registros com KM e litros válidos
        // Método: km percorrido no período (último KM - primeiro KM) / total de litros abastecidos
        // Isso é mais preciso que somar médias parciais de cada par de abastecimentos
        const combsComKm = veiculo.despesas
            .filter(d => d.litros && Number(d.litros) > 0 && d.kmNoAbastecimento && Number(d.kmNoAbastecimento) > 0)
            .map(d => ({ litros: Number(d.litros), km: Number(d.kmNoAbastecimento) }))
            .sort((a, b) => a.km - b.km) // ordena por km crescente
            .slice(-30); // últimos 30 registros

        let consumoMedioReal = null;

        if (combsComKm.length >= 2) {
            const kmPercorrido = combsComKm[combsComKm.length - 1].km - combsComKm[0].km;
            // Soma litros do 2º ao último (o primeiro abastecimento "começa" o período, não conta os litros)
            const totalLitros = combsComKm.slice(1).reduce((s, d) => s + d.litros, 0);
            if (kmPercorrido > 0 && totalLitros > 0) {
                consumoMedioReal = parseFloat((kmPercorrido / totalLitros).toFixed(2));
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
                precoMedioLitro: (() => {
                    const validos = combsComKm.filter(d => d.litros >= 5);
                    // usa despesas originais p/ ter o valor
                    const despesasValidas = veiculo.despesas
                        .filter(d => d.litros && Number(d.litros) >= 5 && d.valor && Number(d.valor) > 0)
                        .slice(0, 20);
                    if (despesasValidas.length === 0) return null;
                    const totalV = despesasValidas.reduce((s, d) => s + Number(d.valor), 0);
                    const totalL = despesasValidas.reduce((s, d) => s + Number(d.litros), 0);
                    return parseFloat((totalV / totalL).toFixed(3));
                })(),
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
                tipoCombustivel: dados.tipoCombustivel || null,
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
                tipoCombustivel: dados.tipoCombustivel !== undefined ? (dados.tipoCombustivel || null) : undefined,
                observacoes: dados.observacoes !== undefined ? dados.observacoes : undefined
            }
        });
    },

    // Preço médio por litro dos últimos 20 abastecimentos com litros e valor registrados
    precoMedioLitro: async (veiculoId) => {
        const registros = await prisma.despesa.findMany({
            where: {
                veiculoId,
                categoria: 'COMBUSTIVEL',
                litros: { gt: 0 },
                valor: { gt: 0 }
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { valor: true, litros: true }
        });
        if (registros.length === 0) return null;
        const validos = registros.filter(r => Number(r.litros) >= 5);
        if (validos.length === 0) return null;
        const totalValor = validos.reduce((s, r) => s + Number(r.valor), 0);
        const totalLitros = validos.reduce((s, r) => s + Number(r.litros), 0);
        return parseFloat((totalValor / totalLitros).toFixed(3));
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
