const clienteInsightService = require('../services/clienteInsightService');
const prisma = require('../config/database');

const getInsightPorCliente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const insight = await clienteInsightService.obterInsightCliente(clienteId);

        if (!insight) {
            // Em vez de 404, retorna 200 com null para o UI saber que não tem
            return res.json(null);
        }

        res.json(insight);
    } catch (error) {
        console.error('Erro ao buscar insight:', error);
        res.status(500).json({ error: 'Falha ao buscar insights do cliente' });
    }
};

const recalcularInsightManualmente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const novoInsight = await clienteInsightService.recalcularCliente(clienteId);

        if (!novoInsight) {
            return res.status(400).json({ error: 'Não foi possível calcular o insight (cliente inexistente ou erro interno)' });
        }

        res.json(novoInsight);
    } catch (error) {
        console.error('Erro ao recalcular insight:', error);
        res.status(500).json({ error: 'Falha ao recalcular insights' });
    }
};

// Recalcula todos os clientes que têm um dia específico na rota (ex: SEG, TER)
// POST /api/insights/recalcular-dia/:diaSigla
const recalcularPorDia = async (req, res) => {
    const { diaSigla } = req.params;
    const sigla = (diaSigla || '').toUpperCase().trim();

    const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
    if (!DIAS_VALIDOS.includes(sigla)) {
        return res.status(400).json({ error: `Sigla inválida. Use: ${DIAS_VALIDOS.join(', ')}` });
    }

    try {
        const clientes = await prisma.cliente.findMany({
            where: { Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Dia_de_venda: true }
        });

        const filtrados = clientes.filter(c => {
            const dias = (c.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim());
            return dias.includes(sigla);
        });

        const resultados = [];
        for (const c of filtrados) {
            const insight = await clienteInsightService.recalcularCliente(c.UUID);
            resultados.push({
                clienteId: c.UUID,
                nome: c.NomeFantasia || c.Nome,
                cenario: insight?.insightPrincipalTipo ?? null,
                situacao: insight?.insightPrincipalResumo ?? null,
                proximaAcao: insight?.proximaAcaoSugerida ?? null,
                statusRecompra: insight?.statusRecompra ?? null,
                diasSemComprar: insight?.diasSemComprar ?? null,
                ok: !!insight,
            });
        }

        res.json({
            dia: sigla,
            total: filtrados.length,
            resultados,
        });
    } catch (error) {
        console.error('Erro ao recalcular por dia:', error);
        res.status(500).json({ error: 'Falha no recálculo por dia' });
    }
};

// Gera orientação IA manualmente para um cliente específico
// POST /api/insights/clientes/:clienteId/gerar-ia
const gerarOrientacaoIAManual = async (req, res) => {
    try {
        const { clienteId } = req.params;

        // Garante que o insight está atualizado antes de chamar a IA
        await clienteInsightService.recalcularCliente(clienteId);

        const orientacaoService = require('../services/orientacaoService');
        const resultado = await orientacaoService.gerarOrientacaoIA(clienteId, {
            disparadoPor: 'MANUAL_UI',
            usuarioId: req.user?.id || null,
        });

        res.json({
            ok: true,
            clienteId,
            cenario: resultado.cenario,
            orientacaoIaJson: resultado.orientacaoIaJson,
            tokensUsados: resultado.tokensUsados,
        });
    } catch (error) {
        console.error('Erro ao gerar orientação IA manual:', error);
        res.status(500).json({ error: error.message || 'Falha ao gerar orientação IA' });
    }
};

module.exports = {
    getInsightPorCliente,
    recalcularInsightManualmente,
    recalcularPorDia,
    gerarOrientacaoIAManual,
};
