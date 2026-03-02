const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { verificarAuth } = require('../middlewares/auth');

// Middleware interno de permissão
const checkAcessoEmbarque = (req, res, next) => {
    const { permissoes } = req.user;
    if (permissoes && (permissoes.master || permissoes.Pode_Acessar_Embarque)) {
        return next();
    }
    return res.status(403).json({ error: 'Você não possui permissão para acessar Embarques/Expedição.' });
};

// ==========================================
// 1. LISTAGEM DE EMBARQUES
// ==========================================
router.get('/', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { dataInicio, dataFim, responsavelId } = req.query;

        const where = {};

        if (dataInicio && dataFim) {
            where.dataSaida = {
                gte: new Date(dataInicio),
                lte: new Date(dataFim)
            };
        }

        if (responsavelId) {
            where.responsavelId = responsavelId;
        }

        const embarques = await prisma.embarque.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                responsavel: { select: { id: true, nome: true } },
                _count: { select: { pedidos: true } }
            }
        });

        res.json(embarques);
    } catch (error) {
        console.error('Erro ao listar embarques:', error);
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

// ==========================================
// 2. LISTA DE PEDIDOS "FATURADOS" LIVRES
// ==========================================
router.get('/pedidos-disponiveis', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        // Regra de Ouro: Somente FATURADOS e Sem Embarque
        const pedidosLivres = await prisma.pedido.findMany({
            where: {
                situacaoCA: 'FATURADO',
                embarqueId: null
            },
            orderBy: { dataVenda: 'asc' }, // Prioriza as entregas mais velhas
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true } },
                vendedor: { select: { nome: true } },
                itens: true
            }
        });

        res.json(pedidosLivres);
    } catch (error) {
        console.error('Erro ao listar pedidos disponíveis para embarque:', error);
        res.status(500).json({ error: 'Erro ao buscar pedidos livres.' });
    }
});

// ==========================================
// 3. DETALHAR UM EMBARQUE (Para Separação)
// ==========================================
router.get('/:id', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const embarque = await prisma.embarque.findUnique({
            where: { id: req.params.id },
            include: {
                responsavel: { select: { nome: true } },
                pedidos: {
                    include: {
                        cliente: { select: { NomeFantasia: true, Nome: true, End_Cidade: true, End_Logradouro: true, End_Numero: true, End_Bairro: true } },
                        itens: {
                            include: { produto: { select: { nome: true, unidade: true } } }
                        }
                    },
                    orderBy: { cliente: { NomeFantasia: 'asc' } }
                }
            }
        });

        if (!embarque) return res.status(404).json({ error: 'Embarque não encontrado.' });
        res.json(embarque);
    } catch (error) {
        console.error('Erro ao detalhar embarque:', error);
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

// ==========================================
// 4. CRIAR UM EMBARQUE
// ==========================================
router.post('/', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { dataSaida, responsavelId, pedidosIds } = req.body;

        if (!dataSaida || !responsavelId) {
            return res.status(400).json({ error: 'Data de saída e Usuário Responsável são obrigatórios.' });
        }

        // Criar o embarque e opcionalmente atrelar pedidos iniciais (se vierem)
        const embarque = await prisma.embarque.create({
            data: {
                dataSaida: new Date(dataSaida),
                responsavelId,
                ...(pedidosIds && pedidosIds.length > 0 ? {
                    pedidos: {
                        connect: pedidosIds.map(id => ({ id }))
                    }
                } : {})
            },
            include: { responsavel: { select: { nome: true } } }
        });

        // Se atrelou pedidos na criação, força o status PENDENTE para entregador (embora default seja PENDENTE)
        if (pedidosIds && pedidosIds.length > 0) {
            await prisma.pedido.updateMany({
                where: { id: { in: pedidosIds } },
                data: { statusEntrega: 'PENDENTE' }
            });
        }

        res.status(201).json(embarque);
    } catch (error) {
        console.error('Erro ao criar embarque:', error);
        res.status(500).json({ error: 'Erro ao processar a criação do embarque.' });
    }
});

// ==========================================
// 5. INSERIR PEDIDOS NUM EMBARQUE EXISTENTE
// ==========================================
router.post('/:id/pedidos', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { pedidosIds } = req.body; // Array de UUIDs de Pedidos
        const embarqueId = req.params.id;

        if (!pedidosIds || !pedidosIds.length) {
            return res.status(400).json({ error: 'Forneça a lista de pedidos a incluir.' });
        }

        // Trava: Validar se os pedidos realmente estão livres e FATURADOS
        const pedidosBloqueados = await prisma.pedido.findMany({
            where: {
                id: { in: pedidosIds },
                OR: [
                    { embarqueId: { not: null } },
                    { situacaoCA: { not: 'FATURADO' } }
                ]
            }
        });

        if (pedidosBloqueados.length > 0) {
            return res.status(400).json({
                error: 'Restrição Estrutural: Um ou mais pedidos selecionados não estão FATURADOS ou já participam de outro embarque.',
                bloqueados: pedidosBloqueados.map(p => p.numero || p.id)
            });
        }

        // Atrelar no prisma
        await prisma.pedido.updateMany({
            where: { id: { in: pedidosIds } },
            data: {
                embarqueId,
                statusEntrega: 'PENDENTE' // Status de Partida do motorista
            }
        });

        res.json({ message: `${pedidosIds.length} pedidos atrelados com sucesso ao Embarque.` });
    } catch (error) {
        console.error('Erro ao adicionar pedidos na carga:', error);
        res.status(500).json({ error: 'Falha crítica ao atrelar cargas.' });
    }
});

// ==========================================
// 6. REMOVER PEDIDO DA CARGA (DESPACHO)
// ==========================================
router.delete('/:id/pedidos/:pedidoId', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { id, pedidoId } = req.params;

        // Regra de Ouro: Só sai do embarque se estiver PENDENTE. Se o motorista já visitou/devolveu, FICA BLOQUEADO pra sempre na carga.
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            select: { statusEntrega: true, embarqueId: true, numero: true }
        });

        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (pedido.embarqueId !== id) return res.status(400).json({ error: 'Pedido não pertence a este embarque.' });

        if (pedido.statusEntrega !== 'PENDENTE') {
            return res.status(403).json({
                error: `Descarregamento Recusado: Este pedido (Status: ${pedido.statusEntrega}) já foi roteirizado ou concluído/devolvido pelo Motorista na rua e não pode mais sair deste romaneio de prestação de contas.`
            });
        }

        // Remove do Embarque
        await prisma.pedido.update({
            where: { id: pedidoId },
            data: {
                embarqueId: null
            }
        });

        res.status(204).send();
    } catch (error) {
        console.error('Erro ao remover pedido:', error);
        res.status(500).json({ error: 'Erro ao desvincular pedido.' });
    }
});

module.exports = router;
