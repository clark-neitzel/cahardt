const pedidoService = require('../services/pedidoService');

const pedidoController = {
    listar: async (req, res) => {
        try {
            const filtros = req.query;

            if (req.user) {
                const permissaoPedidos = req.user.permissoes?.pedidos || {};
                // Se a regra for mostrar apenas para clientes vinculados, filtra os pedidos apenas do vendedor logado
                if (permissaoPedidos.clientes !== 'todos') {
                    filtros.vendedorId = req.user.id;
                }
            }

            const pedidos = await pedidoService.listar(filtros);
            res.json(pedidos);
        } catch (error) {
            console.error('Erro ao listar pedidos:', error);
            res.status(500).json({ error: 'Erro ao listar pedidos' });
        }
    },

    criar: async (req, res) => {
        try {
            const dadosPedido = req.body;
            const novoPedido = await pedidoService.criar(dadosPedido);
            res.status(201).json(novoPedido);
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            res.status(400).json({ error: error.message });
        }
    },

    atualizar: async (req, res) => {
        try {
            const id = req.params.id;
            const dadosPedido = req.body;
            const pedidoAtualizado = await pedidoService.editar(id, dadosPedido);
            res.json(pedidoAtualizado);
        } catch (error) {
            console.error('Erro ao atualizar pedido:', error);
            res.status(400).json({ error: error.message });
        }
    },

    detalhar: async (req, res) => {
        try {
            const id = req.params.id;
            const pedido = await pedidoService.detalhar(id);
            if (!pedido) {
                return res.status(404).json({ error: 'Pedido não encontrado' });
            }
            res.json(pedido);
        } catch (error) {
            console.error('Erro ao detalhar pedido:', error);
            res.status(500).json({ error: 'Erro ao detalhar pedido' });
        }
    },

    marcarRevisado: async (req, res) => {
        try {
            const id = req.params.id;
            const pedidoAtualizado = await pedidoService.editar(id, { revisaoPendente: false });
            res.json({ message: 'Revisão concluída', revisaoPendente: pedidoAtualizado.revisaoPendente });
        } catch (error) {
            console.error('Erro ao marcar pedido como revisado:', error);
            res.status(500).json({ error: 'Erro ao marcar revisão' });
        }
    },

    obterUltimoPreco: async (req, res) => {
        try {
            const { clienteId, produtoId } = req.query;
            if (!clienteId || !produtoId) {
                return res.status(400).json({ error: 'clienteId e produtoId são obrigatórios' });
            }

            const ultimoPreco = await pedidoService.obterUltimoPreco(clienteId, produtoId);
            res.json(ultimoPreco || { msg: 'Nenhum histórico encontrado' });
        } catch (error) {
            console.error('Erro ao buscar último preço:', error);
            res.status(500).json({ error: 'Erro buscar histórico de preço' });
        }
    },

    historicoComprasCliente: async (req, res) => {
        try {
            const { clienteId } = req.query;
            if (!clienteId) {
                return res.status(400).json({ error: 'clienteId é obrigatório' });
            }
            const historico = await pedidoService.historicoComprasCliente(clienteId);
            res.json(historico);
        } catch (error) {
            console.error('Erro ao buscar histórico de compras:', error);
            res.status(500).json({ error: 'Erro ao buscar histórico de compras' });
        }
    },

    excluir: async (req, res) => {
        try {
            const id = req.params.id;
            const deletado = await pedidoService.excluir(id);
            res.json({ message: 'Pedido excluído com sucesso', id: deletado.id });
        } catch (error) {
            console.error('Erro ao excluir pedido:', error);
            res.status(400).json({ error: error.message });
        }
    }
};

module.exports = pedidoController;
