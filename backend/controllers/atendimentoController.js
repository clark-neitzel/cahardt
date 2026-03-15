const atendimentoService = require('../services/atendimentoService');

const atendimentoController = {
    registrar: async (req, res) => {
        try {
            const atendimento = await atendimentoService.registrar(req.body);
            res.status(201).json(atendimento);
        } catch (error) {
            console.error('[atendimentoController.registrar]', error);
            res.status(500).json({ error: 'Erro ao registrar atendimento.' });
        }
    },

    listarPorLead: async (req, res) => {
        try {
            const atendimentos = await atendimentoService.listarPorLead(req.params.leadId);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarPorLead]', error);
            res.status(500).json({ error: 'Erro ao listar atendimentos do lead.' });
        }
    },

    listarPorCliente: async (req, res) => {
        try {
            const atendimentos = await atendimentoService.listarPorCliente(req.params.clienteId);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarPorCliente]', error);
            res.status(500).json({ error: 'Erro ao listar atendimentos do cliente.' });
        }
    },

    listarHojeVendedor: async (req, res) => {
        try {
            const { vendedorId } = req.query;
            const atendimentos = await atendimentoService.listarHojeVendedor(vendedorId);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarHojeVendedor]', error);
            res.status(500).json({ error: 'Erro ao listar atendimentos de hoje.' });
        }
    },

    listarTransferidos: async (req, res) => {
        try {
            const atendimentos = await atendimentoService.listarTransferidos(req.user.id);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarTransferidos]', error);
            res.status(500).json({ error: 'Erro ao listar atendimentos transferidos.' });
        }
    },

    marcarAlertaVisto: async (req, res) => {
        try {
            const atendimento = await atendimentoService.marcarAlertaVisto(req.params.id);
            res.json(atendimento);
        } catch (error) {
            console.error('[atendimentoController.marcarAlertaVisto]', error);
            res.status(500).json({ error: 'Erro ao marcar alerta como visto.' });
        }
    },

    listarAlertasAtivos: async (req, res) => {
        try {
            const alertas = await atendimentoService.listarAlertasAtivos(req.user.id);
            res.json(alertas);
        } catch (error) {
            console.error('[atendimentoController.listarAlertasAtivos]', error);
            res.status(500).json({ error: 'Erro ao listar alertas ativos.' });
        }
    },

    finalizarTransferencia: async (req, res) => {
        try {
            const atendimento = await atendimentoService.finalizarTransferencia(req.params.id);
            res.json(atendimento);
        } catch (error) {
            console.error('[atendimentoController.finalizarTransferencia]', error);
            res.status(500).json({ error: 'Erro ao finalizar transferência.' });
        }
    },

    marcarTransferenciaVista: async (req, res) => {
        try {
            const atendimento = await atendimentoService.marcarTransferenciaVista(req.params.id);
            res.json(atendimento);
        } catch (error) {
            console.error('[atendimentoController.marcarTransferenciaVista]', error);
            res.status(500).json({ error: 'Erro ao marcar transferência como vista.' });
        }
    },

    listarTransferenciasResolvidas: async (req, res) => {
        try {
            const atendimentos = await atendimentoService.listarTransferenciasResolvidas(req.user.id);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarTransferenciasResolvidas]', error);
            res.status(500).json({ error: 'Erro ao listar transferências resolvidas.' });
        }
    }
};

module.exports = atendimentoController;
