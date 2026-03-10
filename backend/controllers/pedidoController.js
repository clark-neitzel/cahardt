const pedidoService = require('../services/pedidoService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
            if (req.user && req.user.id) {
                dadosPedido.usuarioLancamentoId = req.user.id;
            }

            // Validação de permissão para pedidos especiais
            if (dadosPedido.especial) {
                const permissoes = req.user?.permissoes || {};
                if (!permissoes.Pode_Criar_Especial && !permissoes.admin) {
                    return res.status(403).json({ error: 'Você não tem permissão para criar pedidos especiais.' });
                }
            }

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

            // 🔒 Bloqueio: pedidos recebidos pelo CA não podem ser editados aqui
            const pedidoAtual = await prisma.pedido.findUnique({
                where: { id },
                select: { statusEnvio: true, situacaoCA: true }
            });
            if (!pedidoAtual) return res.status(404).json({ error: 'Pedido não encontrado.' });

            const situacoesCABloqueadas = ['APROVADO', 'FATURADO', 'EM_ABERTO'];
            if (pedidoAtual.statusEnvio === 'RECEBIDO' || situacoesCABloqueadas.includes(pedidoAtual.situacaoCA)) {
                return res.status(403).json({
                    error: 'Este pedido já foi recebido pelo Conta Azul e não pode ser editado por aqui. Faça as alterações diretamente no ERP.'
                });
            }

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

    aprovarEspecial: async (req, res) => {
        try {
            const id = req.params.id;
            const permissoes = req.user?.permissoes || {};

            if (!permissoes.Pode_Aprovar_Especial && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para aprovar pedidos especiais.' });
            }

            const pedido = await prisma.pedido.findUnique({ where: { id }, select: { especial: true, statusEnvio: true } });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
            if (!pedido.especial) return res.status(400).json({ error: 'Este pedido não é especial.' });
            if (pedido.statusEnvio === 'RECEBIDO') return res.status(400).json({ error: 'Este pedido já foi aprovado.' });

            const pedidoAprovado = await prisma.pedido.update({
                where: { id },
                data: {
                    statusEnvio: 'RECEBIDO',
                    situacaoCA: 'FATURADO',
                    enviadoEm: new Date()
                }
            });

            res.json({ message: 'Pedido especial aprovado com sucesso.', pedido: pedidoAprovado });
        } catch (error) {
            console.error('Erro ao aprovar pedido especial:', error);
            res.status(500).json({ error: 'Erro ao aprovar pedido especial.' });
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
