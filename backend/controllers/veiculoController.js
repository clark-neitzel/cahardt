const veiculoService = require('../services/veiculoService');

const veiculoController = {
    listarAtivos: async (req, res) => {
        try {
            const veiculos = await veiculoService.listarAtivos();
            res.json(veiculos);
        } catch (error) {
            console.error('Erro ao listar veículos ativos:', error);
            res.status(500).json({ error: 'Erro ao listar veículos' });
        }
    },

    listarTodos: async (req, res) => {
        try {
            const veiculos = await veiculoService.listar();
            res.json(veiculos);
        } catch (error) {
            console.error('Erro ao listar todos os veículos:', error);
            res.status(500).json({ error: 'Erro ao listar veículos' });
        }
    },

    obterPorId: async (req, res) => {
        try {
            const veiculo = await veiculoService.obterPorId(req.params.id);
            res.json(veiculo);
        } catch (error) {
            console.error('Erro ao obter veículo:', error);
            res.status(404).json({ error: error.message });
        }
    },

    criar: async (req, res) => {
        try {
            // Apenas admins? Já verificado pelo middleware nas rotas se configurado
            const novoVeiculo = await veiculoService.criar(req.body);
            res.status(201).json(novoVeiculo);
        } catch (error) {
            console.error('Erro ao criar veículo:', error);
            res.status(400).json({ error: error.message });
        }
    },

    atualizar: async (req, res) => {
        try {
            const veiculoAtualizado = await veiculoService.atualizar(req.params.id, req.body);
            res.json(veiculoAtualizado);
        } catch (error) {
            console.error('Erro ao atualizar veículo:', error);
            res.status(400).json({ error: error.message });
        }
    },

    excluir: async (req, res) => {
        try {
            await veiculoService.excluir(req.params.id);
            res.json({ message: 'Veículo excluído com sucesso' });
        } catch (error) {
            console.error('Erro ao excluir veículo:', error);
            res.status(400).json({ error: error.message });
        }
    }
};

module.exports = veiculoController;
