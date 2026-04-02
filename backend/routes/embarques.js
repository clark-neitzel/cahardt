const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const verificarAuth = require('../middlewares/authMiddleware');

const checkAcessoEmbarque = async (req, res, next) => {
    try {
        const vendedor = await prisma.vendedor.findUnique({
            where: { id: req.user.id },
            select: { permissoes: true }
        });
        const perms = typeof vendedor?.permissoes === 'string'
            ? JSON.parse(vendedor.permissoes)
            : (vendedor?.permissoes || {});
        if (perms.admin || perms.Pode_Acessar_Embarque) return next();
        return res.status(403).json({ error: 'Você não possui permissão para acessar Embarques/Expedição.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão de embarque.' });
    }
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
                _count: { select: { pedidos: true, amostras: true } }
            }
        });

        res.json(embarques);
    } catch (error) {
        console.error('Erro ao listar embarques:', error);
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

// ==========================================
// 2a. LISTA DE AMOSTRAS LIBERADAS LIVRES
// ==========================================
router.get('/amostras-disponiveis', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const amostrasLivres = await prisma.amostra.findMany({
            where: {
                status: 'LIBERADO',
                embarqueId: null
            },
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true } },
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json(amostrasLivres);
    } catch (error) {
        console.error('Erro ao listar amostras disponíveis:', error);
        res.status(500).json({ error: 'Erro ao buscar amostras livres.' });
    }
});

// ==========================================
// 2b. LISTA DE PEDIDOS "FATURADOS" LIVRES
// ==========================================
router.get('/pedidos-disponiveis', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        // Regra de Ouro: FATURADOS, Especiais prontos (ENVIAR) ou Bonificações prontas (ENVIAR), sem Embarque
        const pedidosLivres = await prisma.pedido.findMany({
            where: {
                embarqueId: null,
                OR: [
                    { situacaoCA: 'FATURADO' },
                    { especial: true, statusEnvio: 'ENVIAR' },
                    { bonificacao: true, statusEnvio: 'ENVIAR' }
                ]
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
// 3. DETALHAR UM EMBARQUE (Para Separação e Impressão)
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
                },
                amostras: {
                    include: {
                        itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                        solicitadoPor: { select: { nome: true } },
                        lead: { select: { nomeEstabelecimento: true, numero: true } },
                        cliente: { select: { NomeFantasia: true, Nome: true, End_Cidade: true } },
                    }
                }
            }
        });

        if (!embarque) return res.status(404).json({ error: 'Embarque não encontrado.' });

        // Buscar nomes por extenso das condições de pagamento via TabelaPreco
        // O Pedido salva opcaoCondicaoPagamento = opcaoCondicao da TabelaPreco (não idCondicao!)
        const todasCondicoes = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, tipoPagamento: true, nomeCondicao: true }
        });
        // Mapa por chave composta para distinguir condições com mesma opcaoCondicao (ex: À vista vs À vista - ZZ)
        const mapaCondicoes = {};
        const mapaCondicoesPorOpcao = {};
        for (const t of todasCondicoes) {
            const chave = `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}`;
            if (!mapaCondicoes[chave]) mapaCondicoes[chave] = t.nomeCondicao;
            if (!mapaCondicoesPorOpcao[t.opcaoCondicao]) mapaCondicoesPorOpcao[t.opcaoCondicao] = t.nomeCondicao;
        }

        // Injetar dado mastigado no array pra exibição
        embarque.pedidos = embarque.pedidos.map(p => {
            const chave = `${p.tipoPagamento || ''}|${p.opcaoCondicaoPagamento || ''}`;
            return {
                ...p,
                nomeCondicaoPagamento: p.nomeCondicaoPagamento || mapaCondicoes[chave] || mapaCondicoesPorOpcao[p.opcaoCondicaoPagamento] || p.opcaoCondicaoPagamento || p.tipoPagamento || '-'
            };
        });

        res.json(embarque);
    } catch (error) {
        console.error('Erro ao detalhar embarque:', error);
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

// ==========================================
// 3b. EDITAR UM EMBARQUE (dataSaida / responsavel)
// ==========================================
router.patch('/:id', verificarAuth, async (req, res) => {
    try {
        const vendedor = await prisma.vendedor.findUnique({
            where: { id: req.user.id },
            select: { permissoes: true }
        });
        const perms = typeof vendedor?.permissoes === 'string'
            ? JSON.parse(vendedor.permissoes)
            : (vendedor?.permissoes || {});
        if (!perms.admin && !perms.Pode_Editar_Embarque) {
            return res.status(403).json({ error: 'Você não possui permissão para editar embarques.' });
        }

        const { dataSaida, responsavelId } = req.body;
        if (!dataSaida && !responsavelId) {
            return res.status(400).json({ error: 'Informe dataSaida ou responsavelId para atualizar.' });
        }

        const data = {};
        if (dataSaida) data.dataSaida = new Date(dataSaida);
        if (responsavelId) data.responsavelId = responsavelId;

        const embarque = await prisma.embarque.update({
            where: { id: req.params.id },
            data,
            include: { responsavel: { select: { id: true, nome: true } } }
        });

        res.json(embarque);
    } catch (error) {
        console.error('Erro ao editar embarque:', error);
        res.status(500).json({ error: 'Erro ao atualizar o embarque.' });
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

        // Trava: Validar se os pedidos realmente estão livres e aptos para embarque
        const pedidosCandidatos = await prisma.pedido.findMany({
            where: { id: { in: pedidosIds } },
            select: { id: true, numero: true, embarqueId: true, situacaoCA: true, especial: true, statusEnvio: true }
        });

        const pedidosBloqueados = pedidosCandidatos.filter(p => {
            if (p.embarqueId) return true; // Já em outro embarque
            if (p.situacaoCA === 'FATURADO') return false; // OK: faturado
            if (p.especial && p.statusEnvio === 'ENVIAR') return false; // OK: especial pronto
            if (p.bonificacao && p.statusEnvio === 'ENVIAR') return false; // OK: bonificação pronta
            return true; // Bloqueado
        });

        if (pedidosBloqueados.length > 0) {
            return res.status(400).json({
                error: 'Restrição Estrutural: Um ou mais pedidos selecionados não estão aptos para embarque (necessário FATURADO ou Especial pronto).',
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

// ==========================================
// 7. INSERIR AMOSTRAS NUM EMBARQUE
// ==========================================
router.post('/:id/amostras', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { amostrasIds } = req.body;
        const embarqueId = req.params.id;

        if (!amostrasIds || !amostrasIds.length) {
            return res.status(400).json({ error: 'Forneça a lista de amostras a incluir.' });
        }

        // Validar: só LIBERADO e sem embarque
        const bloqueadas = await prisma.amostra.findMany({
            where: {
                id: { in: amostrasIds },
                OR: [
                    { embarqueId: { not: null } },
                    { status: { not: 'LIBERADO' } }
                ]
            }
        });

        if (bloqueadas.length > 0) {
            return res.status(400).json({
                error: 'Uma ou mais amostras não estão LIBERADAS ou já pertencem a outro embarque.',
                bloqueadas: bloqueadas.map(a => a.numero || a.id)
            });
        }

        await prisma.amostra.updateMany({
            where: { id: { in: amostrasIds } },
            data: { embarqueId }
        });

        res.json({ message: `${amostrasIds.length} amostras atreladas ao embarque.` });
    } catch (error) {
        console.error('Erro ao adicionar amostras na carga:', error);
        res.status(500).json({ error: 'Erro ao atrelar amostras.' });
    }
});

// ==========================================
// 8. REMOVER AMOSTRA DA CARGA
// ==========================================
router.delete('/:id/amostras/:amostraId', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { id, amostraId } = req.params;

        const amostra = await prisma.amostra.findUnique({
            where: { id: amostraId },
            select: { embarqueId: true, numero: true }
        });

        if (!amostra) return res.status(404).json({ error: 'Amostra não encontrada.' });
        if (amostra.embarqueId !== id) return res.status(400).json({ error: 'Amostra não pertence a este embarque.' });

        await prisma.amostra.update({
            where: { id: amostraId },
            data: { embarqueId: null }
        });

        res.status(204).send();
    } catch (error) {
        console.error('Erro ao remover amostra:', error);
        res.status(500).json({ error: 'Erro ao desvincular amostra.' });
    }
});

module.exports = router;
