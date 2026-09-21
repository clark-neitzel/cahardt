const prisma = require('../config/database');

// Função auxiliar para pegar data no formato YYYY-MM-DD baseado no horário de Brasília
const getDataReferencia = (data) => {
    const d = data ? new Date(data) : new Date();
    // Extrai o YYYY, MM, DD usando o timezone seguro de São Paulo (evita erro de virada UTC)
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const partes = formatter.formatToParts(d);
    const ano = partes.find(p => p.type === 'year').value;
    const mes = partes.find(p => p.type === 'month').value;
    const dia = partes.find(p => p.type === 'day').value;
    return `${ano}-${mes}-${dia}`;
};

const diarioService = {
    // 1. Validar Status Atual do Usuário (Se ele tem que fechar o dia anterior, ou se já abriu hoje)
    statusDoDia: async (vendedorId) => {
        const hojeDateRef = getDataReferencia();

        // Checar se ele já preencheu HOJE
        const diarioHoje = await prisma.diarioVendedor.findFirst({
            where: {
                vendedorId,
                dataReferencia: hojeDateRef
            },
            include: { veiculo: true }
        });

        // Checar se ele deixou pendência ONTEM (ou último dia presencial sem KM Final)
        const ultimoDiarioPresencial = await prisma.diarioVendedor.findFirst({
            where: {
                vendedorId,
                modo: 'PRESENCIAL',
                kmFinal: null, // não informou o KM final
                dataReferencia: { not: hojeDateRef } // que não seja hoje
            },
            orderBy: { dataReferencia: 'desc' },
            include: { veiculo: true }
        });

        return {
            hojeStatus: diarioHoje ? 'iniciado' : 'nao_iniciado',
            diarioHoje,
            pendenciaAnterior: ultimoDiarioPresencial ? true : false,
            diarioPendente: ultimoDiarioPresencial
        };
    },

    // 2. Iniciar o dia
    iniciarDia: async (vendedorId, dados) => {
        const { modo, veiculoId, kmInicial, checklist, obs } = dados;
        const hojeDateRef = getDataReferencia();

        // Bloqueia duplo check-in
        const existente = await prisma.diarioVendedor.findFirst({
            where: { vendedorId, dataReferencia: hojeDateRef }
        });
        if (existente) {
            throw new Error('O dia de hoje já foi iniciado.');
        }

        // Bloqueia ignorar pendência de KM
        const status = await diarioService.statusDoDia(vendedorId);
        if (status.pendenciaAnterior) {
            throw new Error('Você precisa informar o KM final do seu último dia de trabalho Presencial antes de iniciar outro!');
        }

        // Valida modo Presencial
        if (modo === 'PRESENCIAL') {
            if (!veiculoId || kmInicial === undefined || kmInicial === null || !checklist) {
                throw new Error('Para o modo presencial, informe Veículo, KM Inicial e Checklist.');
            }

            // Bloqueia veículo já em uso por outro motorista hoje
            const veiculoEmUso = await prisma.diarioVendedor.findFirst({
                where: {
                    veiculoId,
                    dataReferencia: hojeDateRef,
                    vendedorId: { not: vendedorId }
                },
                include: { vendedor: { select: { nome: true } } }
            });
            if (veiculoEmUso) {
                throw new Error(`Este veículo já está sendo usado hoje por ${veiculoEmUso.vendedor?.nome || 'outro motorista'}.`);
            }
        }

        return await prisma.diarioVendedor.create({
            data: {
                vendedorId,
                dataReferencia: hojeDateRef,
                modo,
                veiculoId: modo === 'PRESENCIAL' ? veiculoId : null,
                kmInicial: modo === 'PRESENCIAL' ? kmInicial : null,
                checklist: modo === 'PRESENCIAL' ? checklist : null,
                obs: obs || null,
                inicioHora: new Date()
            }
        });
    },

    // 2b. Pegar o veículo DEPOIS de ter iniciado o dia em Home Office
    // (motorista abre o app em casa, chega na empresa e só então assume o carro).
    // Converte o MESMO registro do dia para PRESENCIAL — todos os relatórios que
    // olham `modo === 'PRESENCIAL' && veiculoId` (Caixa, Veículos) passam a enxergá-lo.
    assumirVeiculo: async (vendedorId, dados) => {
        const { veiculoId, kmInicial, checklist, obs } = dados;
        const hojeDateRef = getDataReferencia();

        const diarioHoje = await prisma.diarioVendedor.findFirst({
            where: { vendedorId, dataReferencia: hojeDateRef }
        });
        if (!diarioHoje) throw new Error('Você ainda não iniciou o dia de hoje.');
        if (diarioHoje.modo === 'PRESENCIAL' && diarioHoje.veiculoId) {
            throw new Error('Você já está com um veículo hoje. Encerre o expediente antes de pegar outro.');
        }

        if (!veiculoId || kmInicial === undefined || kmInicial === null || !checklist) {
            throw new Error('Informe Veículo, KM Inicial e Checklist.');
        }

        const veiculoEmUso = await prisma.diarioVendedor.findFirst({
            where: {
                veiculoId,
                dataReferencia: hojeDateRef,
                vendedorId: { not: vendedorId }
            },
            include: { vendedor: { select: { nome: true } } }
        });
        if (veiculoEmUso) {
            throw new Error(`Este veículo já está sendo usado hoje por ${veiculoEmUso.vendedor?.nome || 'outro motorista'}.`);
        }

        const hora = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
        }).format(new Date());
        let novaObs = diarioHoje.obs || '';
        novaObs += `${novaObs ? '\n' : ''}[Começou em Home Office — pegou o veículo às ${hora}]`;
        if (obs) novaObs += `\n${obs}`;

        return await prisma.diarioVendedor.update({
            where: { id: diarioHoje.id },
            data: {
                modo: 'PRESENCIAL',
                veiculoId,
                kmInicial,
                checklist,
                obs: novaObs
            },
            include: { veiculo: true }
        });
    },

    // 3. Finalizar o dia/Pendência
    encerrarDia: async (vendedorId, dados) => {
        const { diarioId, kmFinal, obsFinal } = dados;

        const diario = await prisma.diarioVendedor.findUnique({
            where: { id: diarioId, vendedorId } // Protegido pelo vendedor
        });

        if (!diario) throw new Error('Diário não encontrado.');
        if (diario.modo !== 'PRESENCIAL') throw new Error('Apenas o modo presencial exige fechamento com KM.');

        if (kmFinal === undefined || kmFinal === null) {
            throw new Error('Informe a quilometragem final do veículo.');
        }

        if (kmFinal < diario.kmInicial) {
            throw new Error('A quilometragem final não pode ser menor que a inicial.');
        }

        let novaObs = diario.obs || '';
        if (obsFinal) {
            novaObs += `\n[Fim do Dia]: ${obsFinal}`;
        }

        return await prisma.diarioVendedor.update({
            where: { id: diarioId },
            data: {
                kmFinal,
                fimHora: new Date(),
                obs: novaObs
            }
        });
    }
};

module.exports = diarioService;
