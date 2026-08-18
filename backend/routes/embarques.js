const express = require('express');
const router = express.Router();
const prisma = require('../config/database'); // singleton compartilhado (pool único)
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
// VERSIONAMENTO DA CARGA (best-effort)
// Toda alteração sobe a versão e grava no histórico (embarque_versao_log).
// Falha aqui NUNCA derruba a operação principal — a carga continua salvando igual sempre.
// ==========================================
const nomeUsuario = async (userId) => {
    if (!userId) return null;
    const u = await prisma.vendedor.findUnique({ where: { id: userId }, select: { nome: true } });
    return u?.nome || null;
};

// Sobe a versão do embarque e grava a entrada no histórico.
const registrarVersaoEmbarque = async (embarqueId, acao, alteracoes, userId) => {
    try {
        const nome = await nomeUsuario(userId);
        const atualizado = await prisma.embarque.update({
            where: { id: embarqueId },
            data: { versao: { increment: 1 } },
            select: { versao: true }
        });
        await prisma.embarqueVersaoLog.create({
            data: {
                embarqueId,
                versao: atualizado.versao,
                acao,
                alteracoes: alteracoes || {},
                alteradoPorId: userId || null,
                alteradoPorNome: nome
            }
        });
    } catch (e) {
        console.error(`[EmbarqueVersao] Falha ao registrar versão (${acao}) — operação principal NÃO afetada:`, e.message);
    }
};

// Grava entrada no histórico SEM subir a versão (criação = v1, impressão não muda a carga).
const registrarLogEmbarque = async (embarqueId, versao, acao, alteracoes, userId) => {
    try {
        const nome = await nomeUsuario(userId);
        await prisma.embarqueVersaoLog.create({
            data: {
                embarqueId,
                versao,
                acao,
                alteracoes: alteracoes || {},
                alteradoPorId: userId || null,
                alteradoPorNome: nome
            }
        });
    } catch (e) {
        console.error(`[EmbarqueVersao] Falha ao registrar log (${acao}) — operação principal NÃO afetada:`, e.message);
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
// Pedidos que estão no Kanban de Delivery são entregues por outro fluxo
// e não devem aparecer no agrupamento de embarque.
const idsPedidosNoDelivery = async () => {
    const noDelivery = await prisma.deliveryStatus.findMany({ select: { pedidoId: true } });
    return noDelivery.map(d => d.pedidoId);
};

// Regra de Ouro: FATURADOS, Especiais prontos (ENVIAR) ou Bonificações prontas (ENVIAR), sem Embarque.
// Pedido cancelado NUNCA pode aparecer aqui — cancelar não mexe em situacaoCA/statusEnvio,
// então sem este filtro ele continuava listado como se estivesse livre.
// devolucaoFinalizada/EXCLUIDO são cinto de segurança: devolução só existe depois da entrega
// (pedido preso na carga), então na prática nem chegariam nesta consulta.
// Helper compartilhado com o mapa de divisão de cargas (routes/embarquesMapa.js).
const wherePedidosLivresParaEmbarque = (idsNoDelivery = []) => ({
    embarqueId: null,
    cancelado: false,
    devolucaoFinalizada: false,
    statusEnvio: { not: 'EXCLUIDO' },
    ...(idsNoDelivery.length > 0 ? { id: { notIn: idsNoDelivery } } : {}),
    OR: [
        { situacaoCA: 'FATURADO' },
        { especial: true, statusEnvio: 'ENVIAR' },
        { bonificacao: true, statusEnvio: 'ENVIAR' }
    ]
});

router.get('/pedidos-disponiveis', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const idsNoDelivery = await idsPedidosNoDelivery();

        const pedidosLivres = await prisma.pedido.findMany({
            where: wherePedidosLivresParaEmbarque(idsNoDelivery),
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
                },
                versoes: { orderBy: { criadoEm: 'desc' } }
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
        if (dataSaida) data.dataSaida = new Date(`${dataSaida}T12:00:00-03:00`);
        if (responsavelId) data.responsavelId = responsavelId;

        // Estado anterior (para o histórico de versões — não interfere na atualização)
        const antes = await prisma.embarque.findUnique({
            where: { id: req.params.id },
            select: { dataSaida: true, responsavelId: true, responsavel: { select: { nome: true } } }
        });

        const embarque = await prisma.embarque.update({
            where: { id: req.params.id },
            data,
            include: { responsavel: { select: { id: true, nome: true } } }
        });

        // Versionamento: registra só o que de fato mudou (best-effort, não bloqueia a resposta)
        try {
            const alteracoes = {};
            const fmt = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
            if (dataSaida && antes && fmt(antes.dataSaida) !== fmt(embarque.dataSaida)) {
                alteracoes.dataSaida = { de: fmt(antes.dataSaida), para: fmt(embarque.dataSaida) };
            }
            if (responsavelId && antes && antes.responsavelId !== embarque.responsavelId) {
                alteracoes.motorista = { de: antes.responsavel?.nome || '—', para: embarque.responsavel?.nome || '—' };
            }
            if (Object.keys(alteracoes).length > 0) {
                await registrarVersaoEmbarque(req.params.id, 'EDITADA', alteracoes, req.user.id);
            }
        } catch (e) {
            console.error('[EmbarqueVersao] Erro no registro pós-edição (ignorado):', e.message);
        }

        res.json(embarque);
    } catch (error) {
        console.error('Erro ao editar embarque:', error);
        res.status(500).json({ error: 'Erro ao atualizar o embarque.' });
    }
});

// Trava única de quem pode entrar numa carga — usada ao criar o embarque e ao
// adicionar pedidos depois. Devolve a lista de bloqueados com o motivo em texto.
// O caso que acontece de verdade é o pedido CANCELADO; devolvido/excluído ficam
// aqui só como rede de segurança (devolução só nasce de pedido já preso na carga).
// opts.cargasPermitidas (Set de embarqueIds): usado pelo aplicar-divisao do mapa —
// pedido que já está numa das cargas DO PRÓPRIO ARRANJO não conta como "em outra carga".
async function bloqueadosParaEmbarque(pedidosIds, opts = {}) {
    const cargasPermitidas = opts.cargasPermitidas instanceof Set ? opts.cargasPermitidas : null;
    const candidatos = await prisma.pedido.findMany({
        where: { id: { in: pedidosIds } },
        select: {
            id: true, numero: true, embarqueId: true, situacaoCA: true, statusEnvio: true,
            especial: true, bonificacao: true, cancelado: true, devolucaoFinalizada: true
        }
    });

    const bloqueados = [];
    for (const p of candidatos) {
        const etiqueta = `${p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '#'}${p.numero || p.id.slice(0, 8)}`;
        if (p.cancelado) { bloqueados.push({ pedido: etiqueta, motivo: 'pedido cancelado' }); continue; }
        if (p.devolucaoFinalizada) { bloqueados.push({ pedido: etiqueta, motivo: 'pedido já devolvido' }); continue; }
        if (p.statusEnvio === 'EXCLUIDO') { bloqueados.push({ pedido: etiqueta, motivo: 'pedido excluído' }); continue; }
        if (p.embarqueId && !(cargasPermitidas && cargasPermitidas.has(p.embarqueId))) { bloqueados.push({ pedido: etiqueta, motivo: 'já está em outra carga' }); continue; }
        if (p.situacaoCA === 'FATURADO') continue;                     // OK: faturado
        if (p.especial && p.statusEnvio === 'ENVIAR') continue;        // OK: especial pronto
        if (p.bonificacao && p.statusEnvio === 'ENVIAR') continue;     // OK: bonificação pronta
        bloqueados.push({ pedido: etiqueta, motivo: 'não está faturado nem pronto para envio' });
    }
    return bloqueados;
}

// ==========================================
// 4. CRIAR UM EMBARQUE
// ==========================================
router.post('/', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { dataSaida, responsavelId, pedidosIds } = req.body;

        if (!dataSaida || !responsavelId) {
            return res.status(400).json({ error: 'Data de saída e Usuário Responsável são obrigatórios.' });
        }

        // Mesma trava do "adicionar pedidos": cancelado/devolvido não entra em carga
        if (pedidosIds && pedidosIds.length > 0) {
            const bloqueados = await bloqueadosParaEmbarque(pedidosIds);
            if (bloqueados.length > 0) {
                return res.status(400).json({
                    error: `Não dá para embarcar: ${bloqueados.map(b => `${b.pedido} (${b.motivo})`).join(', ')}.`,
                    bloqueados
                });
            }
        }

        // Criar o embarque e opcionalmente atrelar pedidos iniciais (se vierem)
        const embarque = await prisma.embarque.create({
            data: {
                dataSaida: new Date(`${dataSaida}T12:00:00-03:00`),
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

        // Histórico: nasce como versão 1 (best-effort)
        await registrarLogEmbarque(embarque.id, 1, 'CRIADA', {
            motorista: embarque.responsavel?.nome || null,
            pedidos: pedidosIds?.length || 0
        }, req.user.id);

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
        // (cancelado e devolvido ficam de fora — a mercadoria não vai sair)
        const pedidosBloqueados = await bloqueadosParaEmbarque(pedidosIds);

        if (pedidosBloqueados.length > 0) {
            return res.status(400).json({
                error: `Não dá para embarcar: ${pedidosBloqueados.map(b => `${b.pedido} (${b.motivo})`).join(', ')}.`,
                bloqueados: pedidosBloqueados
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

        // Versionamento (best-effort): registra quais pedidos entraram
        try {
            const adicionados = await prisma.pedido.findMany({
                where: { id: { in: pedidosIds } },
                select: { numero: true, especial: true, bonificacao: true, cliente: { select: { NomeFantasia: true, Nome: true } } }
            });
            await registrarVersaoEmbarque(embarqueId, 'PEDIDOS_ADICIONADOS', {
                pedidos: adicionados.map(p => ({
                    numero: `${p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : ''}${p.numero}`,
                    cliente: p.cliente?.NomeFantasia || p.cliente?.Nome || null
                }))
            }, req.user.id);
        } catch (e) {
            console.error('[EmbarqueVersao] Erro no registro pós-inclusão de pedidos (ignorado):', e.message);
        }

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
            select: { statusEntrega: true, embarqueId: true, numero: true, especial: true, bonificacao: true, cliente: { select: { NomeFantasia: true, Nome: true } } }
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

        // Versionamento (best-effort)
        await registrarVersaoEmbarque(id, 'PEDIDO_REMOVIDO', {
            pedidos: [{
                numero: `${pedido.bonificacao ? 'BN#' : pedido.especial ? 'ZZ#' : ''}${pedido.numero}`,
                cliente: pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || null
            }]
        }, req.user.id);

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

        // Versionamento (best-effort)
        try {
            const adicionadas = await prisma.amostra.findMany({
                where: { id: { in: amostrasIds } },
                select: { numero: true, cliente: { select: { NomeFantasia: true, Nome: true } }, lead: { select: { nomeEstabelecimento: true } } }
            });
            await registrarVersaoEmbarque(embarqueId, 'AMOSTRAS_ADICIONADAS', {
                amostras: adicionadas.map(a => ({
                    numero: `AM#${a.numero}`,
                    destinatario: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || null
                }))
            }, req.user.id);
        } catch (e) {
            console.error('[EmbarqueVersao] Erro no registro pós-inclusão de amostras (ignorado):', e.message);
        }

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
            select: { embarqueId: true, numero: true, cliente: { select: { NomeFantasia: true, Nome: true } }, lead: { select: { nomeEstabelecimento: true } } }
        });

        if (!amostra) return res.status(404).json({ error: 'Amostra não encontrada.' });
        if (amostra.embarqueId !== id) return res.status(400).json({ error: 'Amostra não pertence a este embarque.' });

        await prisma.amostra.update({
            where: { id: amostraId },
            data: { embarqueId: null }
        });

        // Versionamento (best-effort)
        await registrarVersaoEmbarque(id, 'AMOSTRA_REMOVIDA', {
            amostras: [{
                numero: `AM#${amostra.numero}`,
                destinatario: amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || null
            }]
        }, req.user.id);

        res.status(204).send();
    } catch (error) {
        console.error('Erro ao remover amostra:', error);
        res.status(500).json({ error: 'Erro ao desvincular amostra.' });
    }
});

// ==========================================
// 9. REGISTRAR IMPRESSÃO DA FOLHA
// Carimba qual versão foi impressa (para o aviso "reimprimir" e a conferência do motorista).
// NÃO sobe a versão — imprimir não muda a carga.
// ==========================================
router.post('/:id/impressao', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const atual = await prisma.embarque.findUnique({
            where: { id: req.params.id },
            select: { versao: true }
        });
        if (!atual) return res.status(404).json({ error: 'Embarque não encontrado.' });

        const embarque = await prisma.embarque.update({
            where: { id: req.params.id },
            data: { ultimaImpressaoVersao: atual.versao, ultimaImpressaoEm: new Date() },
            select: { versao: true, ultimaImpressaoVersao: true, ultimaImpressaoEm: true }
        });

        await registrarLogEmbarque(req.params.id, atual.versao, 'IMPRESSA', {}, req.user.id);

        res.json(embarque);
    } catch (error) {
        console.error('Erro ao registrar impressão do embarque:', error);
        res.status(500).json({ error: 'Erro ao registrar a impressão.' });
    }
});

module.exports = router;

// Helpers compartilhados com o mapa de divisão de cargas (routes/embarquesMapa.js).
// Exportados como propriedades do router para não duplicar regra de negócio.
module.exports.checkAcessoEmbarque = checkAcessoEmbarque;
module.exports.idsPedidosNoDelivery = idsPedidosNoDelivery;
module.exports.wherePedidosLivresParaEmbarque = wherePedidosLivresParaEmbarque;
module.exports.bloqueadosParaEmbarque = bloqueadosParaEmbarque;
module.exports.registrarVersaoEmbarque = registrarVersaoEmbarque;
module.exports.registrarLogEmbarque = registrarLogEmbarque;
