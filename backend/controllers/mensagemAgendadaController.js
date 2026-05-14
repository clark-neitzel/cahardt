const prisma = require('../config/database');
const mensagemAgendadaService = require('../services/mensagemAgendadaService');

const mensagemAgendadaController = {
    listar: async (req, res) => {
        try {
            const configs = await prisma.mensagemAgendada.findMany({
                include: { vendedor: { select: { id: true, nome: true, telefone: true } } },
                orderBy: [{ vendedor: { nome: 'asc' } }, { hora: 'asc' }]
            });
            res.json(configs);
        } catch (err) {
            console.error('[MensagemAgendada] listar:', err);
            res.status(500).json({ error: 'Erro ao listar mensagens agendadas' });
        }
    },

    obter: async (req, res) => {
        try {
            const config = await prisma.mensagemAgendada.findUnique({
                where: { id: req.params.id },
                include: { vendedor: { select: { id: true, nome: true, telefone: true } } }
            });
            if (!config) return res.status(404).json({ error: 'Não encontrado' });
            res.json(config);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar mensagem agendada' });
        }
    },

    criar: async (req, res) => {
        try {
            const { vendedorId, tipo, hora, diasSemana, ativo } = req.body;
            if (!vendedorId || !tipo || !hora || !diasSemana?.length) {
                return res.status(400).json({ error: 'Campos obrigatórios: vendedorId, tipo, hora, diasSemana' });
            }
            const config = await prisma.mensagemAgendada.create({
                data: { vendedorId, tipo, hora, diasSemana, ativo: ativo !== false },
                include: { vendedor: { select: { id: true, nome: true, telefone: true } } }
            });
            res.status(201).json(config);
        } catch (err) {
            console.error('[MensagemAgendada] criar:', err);
            res.status(500).json({ error: 'Erro ao criar mensagem agendada' });
        }
    },

    atualizar: async (req, res) => {
        try {
            const { tipo, hora, diasSemana, ativo } = req.body;
            const data = {};
            if (tipo !== undefined) data.tipo = tipo;
            if (hora !== undefined) data.hora = hora;
            if (diasSemana !== undefined) data.diasSemana = diasSemana;
            if (ativo !== undefined) data.ativo = ativo;

            const config = await prisma.mensagemAgendada.update({
                where: { id: req.params.id },
                data,
                include: { vendedor: { select: { id: true, nome: true, telefone: true } } }
            });
            res.json(config);
        } catch (err) {
            console.error('[MensagemAgendada] atualizar:', err);
            res.status(500).json({ error: 'Erro ao atualizar mensagem agendada' });
        }
    },

    deletar: async (req, res) => {
        try {
            await prisma.mensagemAgendada.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao deletar mensagem agendada' });
        }
    },

    disparar: async (req, res) => {
        try {
            const config = await prisma.mensagemAgendada.findUnique({
                where: { id: req.params.id },
                include: { vendedor: true }
            });
            if (!config) return res.status(404).json({ error: 'Não encontrado' });

            let resultado;
            if (config.tipo === 'meta') {
                resultado = await mensagemAgendadaService.enviarMeta(config.vendedor);
            } else if (config.tipo === 'atendimento') {
                resultado = await mensagemAgendadaService.enviarAtendimento(config.vendedor);
            } else {
                return res.status(400).json({ error: `Tipo desconhecido: ${config.tipo}` });
            }

            if (resultado.ok) {
                await prisma.mensagemAgendada.update({
                    where: { id: config.id },
                    data: { ultimoEnvio: new Date() }
                });
            }
            res.json(resultado);
        } catch (err) {
            console.error('[MensagemAgendada] disparar:', err);
            res.status(500).json({ error: 'Erro ao disparar mensagem' });
        }
    },

    preview: async (req, res) => {
        try {
            const { vendedorId } = req.params;
            const tipo = req.query.tipo || 'meta';
            const texto = await mensagemAgendadaService.gerarPreview(vendedorId, tipo);
            res.json({ texto });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

module.exports = mensagemAgendadaController;
