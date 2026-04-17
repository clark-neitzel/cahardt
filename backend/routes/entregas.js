const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const verificarAuth = require('../middlewares/authMiddleware');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

// Middleware interno: Permissão Entregador (ou quem pode ver todas entregas)
const checkAcessoEntregador = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Executar_Entregas || perms.Pode_Ver_Todas_Entregas) {
            req._perms = perms; // Salva para uso no handler
            return next();
        }
        return res.status(403).json({ error: 'Você não tem permissão de Motorista/Entregador.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// Middleware interno: Permissão Auditoria/Escritório
const checkAuditor = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Ver_Todas_Entregas || perms.Pode_Ajustar_Entregas) return next();
        return res.status(403).json({ error: 'Acesso negado. Requer privilégio de Auditoria Logística.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// Middleware interno: Permissão Correção Financeira
const checkAjustador = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Ajustar_Entregas) return next();
        return res.status(403).json({ error: 'Acesso negado. Ação restritiva ao Financeiro.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// ==========================================
// 1. MOTORISTA: MINHAS ATIVAS (PENDENTES)
// ==========================================
router.get('/pendentes', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const perms = req._perms || {};
        const verTodas = perms.admin || perms.Pode_Ver_Todas_Entregas;

        // O motorista deve ver apenas cargas agendadas até a data de hoje.
        // Cargas para datas futuras (ex: amanhã) só deverão aparecer à meia-noite do dia da carga.
        const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const maxDataSaida = new Date(`${hojeStr}T23:59:59.999-03:00`);

        const where = { statusEntrega: 'PENDENTE' };
        const embarqueFiltro = { dataSaida: { lte: maxDataSaida } };

        if (!verTodas) {
            embarqueFiltro.responsavelId = req.user.id;
        } else if (req.query.responsavelId) {
            // Admin filtrando por um motorista específico
            embarqueFiltro.responsavelId = req.query.responsavelId;
        }
        where.embarque = embarqueFiltro;

        const entregas = await prisma.pedido.findMany({
            where,
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, Ponto_GPS: true } },
                embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                vendedor: { select: { id: true, nome: true } },
                usuarioLancamento: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } }
            },
            orderBy: [{ prioridadeEntrega: { sort: 'asc', nulls: 'last' } }, { cliente: { NomeFantasia: 'asc' } }]
        });

        // Enriquece com o nome legível da condição de pagamento (join manual sem FK)
        // O pedido salva opcaoCondicaoPagamento = opcaoCondicao da TabelaPreco (não idCondicao!)
        const condicoesCodigos = [...new Set(entregas.map(e => e.opcaoCondicaoPagamento).filter(Boolean))];
        const nomesCondicoes = [...new Set(entregas.map(e => e.nomeCondicaoPagamento).filter(Boolean))];
        let mapaCondicoes = {};
        let mapaCondicoesPorOpcao = {};
        let mapaCondicoesPorNome = {};
        if (condicoesCodigos.length > 0 || nomesCondicoes.length > 0) {
            const whereOr = [];
            if (condicoesCodigos.length > 0) whereOr.push({ opcaoCondicao: { in: condicoesCodigos } });
            if (nomesCondicoes.length > 0) whereOr.push({ nomeCondicao: { in: nomesCondicoes } });
            const tabelas = await prisma.tabelaPreco.findMany({
                where: { OR: whereOr },
                select: { opcaoCondicao: true, tipoPagamento: true, nomeCondicao: true, idCondicao: true }
            });
            for (const t of tabelas) {
                const chave = `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}`;
                if (!mapaCondicoes[chave]) mapaCondicoes[chave] = { nome: t.nomeCondicao, idCondicao: t.idCondicao };
                if (t.opcaoCondicao && !mapaCondicoesPorOpcao[t.opcaoCondicao]) mapaCondicoesPorOpcao[t.opcaoCondicao] = { nome: t.nomeCondicao, idCondicao: t.idCondicao };
                if (!mapaCondicoesPorNome[t.nomeCondicao]) mapaCondicoesPorNome[t.nomeCondicao] = { nome: t.nomeCondicao, idCondicao: t.idCondicao };
            }
        }

        const pedidosEnriquecidos = entregas.map(e => {
            const chave = `${e.tipoPagamento || ''}|${e.opcaoCondicaoPagamento || ''}`;
            const info = mapaCondicoes[chave] || mapaCondicoesPorOpcao[e.opcaoCondicaoPagamento] || mapaCondicoesPorNome[e.nomeCondicaoPagamento];
            return {
                ...e,
                _tipoEntrega: 'pedido',
                nomeCondicaoPagamento: e.nomeCondicaoPagamento || info?.nome || e.opcaoCondicaoPagamento || null,
                idCondicaoResolvido: info?.idCondicao || null
            };
        });

        // Amostras pendentes no embarque
        const whereAmostra = { status: 'LIBERADO' };
        whereAmostra.embarque = { ...embarqueFiltro };

        const amostrasPendentes = await prisma.amostra.findMany({
            where: whereAmostra,
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, Ponto_GPS: true } },
                lead: { select: { nomeEstabelecimento: true, pontoGps: true } },
                embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                solicitadoPor: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } }
            },
            orderBy: { createdAt: 'asc' }
        });

        const amostrasFormatadas = amostrasPendentes.map(a => ({
            id: a.id,
            _tipoEntrega: 'amostra',
            numero: a.numero,
            status: a.status,
            observacao: a.observacao,
            dataEntrega: a.dataEntrega,
            embarque: a.embarque,
            embarqueId: a.embarqueId,
            solicitadoPor: a.solicitadoPor,
            itens: a.itens,
            cliente: a.cliente || (a.lead ? {
                NomeFantasia: a.lead.nomeEstabelecimento,
                Nome: a.lead.nomeEstabelecimento,
                Ponto_GPS: a.lead.pontoGps
            } : null),
        }));

        res.json([...pedidosEnriquecidos, ...amostrasFormatadas]);
    } catch (error) {
        console.error('Erro ao listar entregas pendentes:', error);
        res.status(500).json({ error: 'Erro ao buscar roteiro logístico.' });
    }
});

// ==========================================
// 2. MOTORISTA: MEU HISTÓRICO (JÁ CONCLUÍDAS)
// ==========================================
router.get('/concluidas', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const perms = req._perms || {};
        const verTodas = perms.admin || perms.Pode_Ver_Todas_Entregas;

        const where = { statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] } };
        if (!verTodas) {
            where.embarque = { responsavelId: req.user.id };
        } else if (req.query.responsavelId) {
            where.embarque = { responsavelId: req.query.responsavelId };
        }

        const entregas = await prisma.pedido.findMany({
            where,
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                vendedor: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } },
                pagamentosReais: true,
                itensDevolvidos: { include: { produto: { select: { id: true, nome: true } } } }
            },
            orderBy: { dataEntrega: 'desc' },
            take: 50
        });

        // Enriquece com o nome legível da condição de pagamento
        const condicoesCodigos = [...new Set(entregas.map(e => e.opcaoCondicaoPagamento).filter(Boolean))];
        let mapaCondicoes = {};
        let mapaCondicoesPorOpcao2 = {};
        if (condicoesCodigos.length > 0) {
            const tabelas = await prisma.tabelaPreco.findMany({
                where: { opcaoCondicao: { in: condicoesCodigos } },
                select: { opcaoCondicao: true, tipoPagamento: true, nomeCondicao: true }
            });
            for (const t of tabelas) {
                const chave = `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}`;
                if (!mapaCondicoes[chave]) mapaCondicoes[chave] = t.nomeCondicao;
                if (!mapaCondicoesPorOpcao2[t.opcaoCondicao]) mapaCondicoesPorOpcao2[t.opcaoCondicao] = t.nomeCondicao;
            }
        }

        const pedidosEnriquecidos = entregas.map(e => {
            const chave = `${e.tipoPagamento || ''}|${e.opcaoCondicaoPagamento || ''}`;
            return {
                ...e,
                _tipoEntrega: 'pedido',
                condicaoNome: e.nomeCondicaoPagamento || mapaCondicoes[chave] || mapaCondicoesPorOpcao2[e.opcaoCondicaoPagamento] || e.opcaoCondicaoPagamento || null
            };
        });

        // Amostras entregues
        const whereAmostraConcluida = { status: 'ENTREGUE', embarqueId: { not: null } };
        if (!verTodas) {
            whereAmostraConcluida.embarque = { responsavelId: req.user.id };
        } else if (req.query.responsavelId) {
            whereAmostraConcluida.embarque = { responsavelId: req.query.responsavelId };
        }

        const amostrasEntregues = await prisma.amostra.findMany({
            where: whereAmostraConcluida,
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                lead: { select: { nomeEstabelecimento: true } },
                embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                solicitadoPor: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } }
            },
            orderBy: { updatedAt: 'desc' },
            take: 50
        });

        const amostrasFormatadas = amostrasEntregues.map(a => ({
            id: a.id,
            _tipoEntrega: 'amostra',
            numero: a.numero,
            status: a.status,
            observacao: a.observacao,
            dataEntrega: a.updatedAt,
            embarque: a.embarque,
            solicitadoPor: a.solicitadoPor,
            itens: a.itens,
            cliente: a.cliente || (a.lead ? { NomeFantasia: a.lead.nomeEstabelecimento, Nome: a.lead.nomeEstabelecimento } : null),
        }));

        res.json([...pedidosEnriquecidos, ...amostrasFormatadas]);
    } catch (error) {
        console.error('Erro ao listar entregas finalizadas:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico logístico.' });
    }
});

// ==========================================
// 2b. MOTORISTA: CONCLUIR ENTREGA DE AMOSTRA
// ==========================================
router.post('/amostra/:id/concluir', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const { id } = req.params;
        const { gpsEntrega } = req.body;

        const amostra = await prisma.amostra.findUnique({
            where: { id },
            include: { embarque: true }
        });

        if (!amostra) return res.status(404).json({ error: 'Amostra não localizada.' });
        if (amostra.status !== 'LIBERADO') return res.status(400).json({ error: `Amostra já está como ${amostra.status}.` });

        const permsUser = await getPerms(req.user.id);
        if (amostra.embarque?.responsavelId !== req.user.id && !permsUser.admin) {
            return res.status(403).json({ error: 'Esta amostra pertence à carga de outro motorista.' });
        }

        await prisma.amostra.update({
            where: { id },
            data: { status: 'ENTREGUE' }
        });

        res.json({ message: 'Amostra entregue com sucesso!' });
    } catch (error) {
        console.error('Erro ao concluir entrega de amostra:', error);
        res.status(500).json({ error: 'Erro ao processar entrega da amostra.' });
    }
});

router.post('/:id/concluir', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const { id } = req.params;
        const { statusEntrega, gpsEntrega, divergenciaPagamento, pagamentos, itensDevolvidos, motivoDevolucao, observacaoEntrega } = req.body;

        if (!['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(statusEntrega)) {
            return res.status(400).json({ error: 'Status de Entrega inválido.' });
        }

        const pedido = await prisma.pedido.findUnique({
            where: { id },
            include: { embarque: true, itens: true }
        });

        if (!pedido) return res.status(404).json({ error: 'Pedido não localizado.' });
        if (pedido.statusEntrega !== 'PENDENTE') return res.status(400).json({ error: `Este pedido já foi finalizado anteriormente como ${pedido.statusEntrega}.` });
        const permsUser = await getPerms(req.user.id);
        if (pedido.embarque.responsavelId !== req.user.id && !permsUser.admin) {
            return res.status(403).json({ error: 'Este pedido pertence à carga de outro motorista.' });
        }

        // Buscar regras da condição de pagamento do pedido (múltiplos fallbacks para resolução robusta)
        let regrasCondicao = null;
        if (pedido.opcaoCondicaoPagamento || pedido.tipoPagamento || pedido.nomeCondicaoPagamento) {
            const condicoes = await prisma.tabelaPreco.findMany({ where: { ativo: true } });
            const chave = `${pedido.tipoPagamento || ''}|${pedido.opcaoCondicaoPagamento || ''}`;
            regrasCondicao = condicoes.find(t => `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}` === chave)
                || condicoes.find(t => t.opcaoCondicao === pedido.opcaoCondicaoPagamento)
                || (pedido.nomeCondicaoPagamento ? condicoes.find(t => t.nomeCondicao === pedido.nomeCondicaoPagamento) : null)
                || null;
        }

        // Validar restrições de devolução da condição
        if (regrasCondicao) {
            if (statusEntrega === 'DEVOLVIDO' && regrasCondicao.permiteDevolucaoTotal === false) {
                return res.status(400).json({ error: 'Esta condição de pagamento não permite devolução total.' });
            }
            if (statusEntrega === 'ENTREGUE_PARCIAL' && regrasCondicao.permiteDevolucaoParcial === false) {
                return res.status(400).json({ error: 'Esta condição de pagamento não permite devolução parcial.' });
            }
        }

        // Validação Matemática Financeira! (Se o motorista não devolveu tudo, tem que pagar o resto).
        let valorDevolvidoBruto = 0;
        const operacoesItem = [];

        if (statusEntrega === 'ENTREGUE_PARCIAL' && itensDevolvidos && itensDevolvidos.length > 0) {
            for (const item of itensDevolvidos) {
                valorDevolvidoBruto += (Number(item.quantidade) * Number(item.valorBaseItem));
                operacoesItem.push({
                    produtoId: item.produtoId,
                    quantidade: item.quantidade,
                    valorBaseItem: item.valorBaseItem
                });
            }
        }

        let valorSaldoDevedor = 0;
        if (statusEntrega === 'DEVOLVIDO') {
            // Conta morre
            valorSaldoDevedor = 0;
        } else {
            // Calcula total bruto da venda do pedido
            const totalBruto = pedido.itens.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0);
            valorSaldoDevedor = Number((totalBruto - valorDevolvidoBruto).toFixed(2));
        }

        // Se há saldo a pagar, as linhas de pagamento (Dinheiro, Pix, Dívida Escritório, etc) do array de `pagamentos` devem somar o valor líquido.
        let somaRecebida = 0;
        const operacoesPgto = [];

        if (valorSaldoDevedor > 0) {
            if (!pagamentos || !pagamentos.length) {
                return res.status(400).json({ error: `Falta registrar R$ ${valorSaldoDevedor.toFixed(2)} em pagamentos para esta entrega.` });
            }
            for (const pgto of pagamentos) {
                if (Number(pgto.valor) <= 0) {
                    return res.status(400).json({ error: 'Cada pagamento deve ter valor maior que R$ 0,00.' });
                }
                somaRecebida += Number(pgto.valor);
                operacoesPgto.push({
                    formaPagamentoEntregaId: pgto.formaPagamentoEntregaId,
                    formaPagamentoNome: pgto.formaPagamentoNome,
                    valor: Number(pgto.valor),
                    vendedorResponsavelId: pgto.vendedorResponsavelId || null,
                    escritorioResponsavel: pgto.escritorioResponsavel || false
                });
            }

            // Validar formas de recebimento permitidas pela condição
            if (regrasCondicao?.formasRecebimentoPermitidas?.length > 0) {
                const permitidas = regrasCondicao.formasRecebimentoPermitidas;
                // Montar mapa de nomes permitidos a partir dos _selectId salvos
                const todasCondicoes = await prisma.tabelaPreco.findMany({ where: { ativo: true }, select: { idCondicao: true, nomeCondicao: true } });
                const formasCustom = await prisma.formaPagamentoEntrega.findMany({ where: { ativo: true }, select: { id: true, nome: true } });
                const mapaNomes = {};
                todasCondicoes.forEach(c => { mapaNomes['tabela_' + c.idCondicao] = c.nomeCondicao; });
                formasCustom.forEach(f => { mapaNomes[f.id] = f.nome; });
                const nomesPermitidos = permitidas.map(p => mapaNomes[p]?.toLowerCase()).filter(Boolean);

                for (const op of operacoesPgto) {
                    const nomeUsado = op.formaPagamentoNome?.toLowerCase();
                    const idPermitido = op.formaPagamentoEntregaId && permitidas.includes(op.formaPagamentoEntregaId);
                    if (!idPermitido && !nomesPermitidos.includes(nomeUsado)) {
                        return res.status(400).json({ error: `Forma de pagamento "${op.formaPagamentoNome}" não é permitida para esta condição.` });
                    }
                }
            }

            // Tolerância de centavos
            if (Math.abs(somaRecebida - valorSaldoDevedor) > 0.05) {
                return res.status(400).json({
                    error: `A conta não fecha: Saldo do Pedido (R$ ${valorSaldoDevedor.toFixed(2)}) e Pagamentos Apontados (R$ ${somaRecebida.toFixed(2)}).`
                });
            }
        }

        // A transação atômica do Prisma vai gravar tudo junto: 
        // 1. Atualiza status do Pedido 
        // 2. Grava extratos recebidos (se houver) 
        // 3. Grava log de itens devolvidos (se houver parcial)
        await prisma.$transaction(async (tx) => {
            await tx.pedido.update({
                where: { id },
                data: {
                    statusEntrega,
                    gpsEntrega: gpsEntrega || null,
                    divergenciaPagamento: divergenciaPagamento || false,
                    dataEntrega: new Date(),
                    motivoDevolucao: motivoDevolucao || null,
                    observacaoEntrega: observacaoEntrega || null
                }
            });

            if (operacoesPgto.length > 0) {
                await tx.pedidoPagamentoReal.createMany({
                    data: operacoesPgto.map(op => ({ ...op, pedidoId: id }))
                });
            }

            if (operacoesItem.length > 0) {
                await tx.entregaItemDevolvido.createMany({
                    data: operacoesItem.map(op => ({ ...op, pedidoId: id }))
                });
            }
        });

        res.json({ message: 'Entrega Finalizada e Registrada com Sucesso!' });
    } catch (error) {
        console.error('Erro na submissão de baixa logística:', error);
        res.status(500).json({ error: 'Erro crítico ao processar o fechamento de caixa do motorista.' });
    }
});

// ==========================================
// 3b. ADMIN: EDITAR LANÇAMENTO DE ENTREGA
// ==========================================
router.patch('/:id/editar', verificarAuth, checkAjustador, async (req, res) => {
    try {
        const { id } = req.params;
        const { statusEntrega, divergenciaPagamento, pagamentos, itensDevolvidos, motivoDevolucao, observacaoEntrega } = req.body;

        const pedido = await prisma.pedido.findUnique({ where: { id }, include: { itens: true } });
        if (!pedido) return res.status(404).json({ error: 'Pedido não localizado.' });
        if (pedido.statusEntrega === 'PENDENTE') return res.status(400).json({ error: 'Este pedido ainda não foi finalizado.' });

        if (statusEntrega && !['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(statusEntrega)) {
            return res.status(400).json({ error: 'Status de Entrega inválido.' });
        }

        await prisma.$transaction(async (tx) => {
            // Atualiza campos do pedido
            const updateData = {};
            if (statusEntrega) updateData.statusEntrega = statusEntrega;
            if (divergenciaPagamento !== undefined) updateData.divergenciaPagamento = divergenciaPagamento;
            if (motivoDevolucao !== undefined) updateData.motivoDevolucao = motivoDevolucao || null;
            if (observacaoEntrega !== undefined) updateData.observacaoEntrega = observacaoEntrega || null;
            if (Object.keys(updateData).length > 0) {
                await tx.pedido.update({ where: { id }, data: updateData });
            }

            // Se pagamentos foram enviados, reescreve todos
            if (pagamentos) {
                await tx.pedidoPagamentoReal.deleteMany({ where: { pedidoId: id } });
                if (pagamentos.length > 0) {
                    await tx.pedidoPagamentoReal.createMany({
                        data: pagamentos.map(p => ({
                            pedidoId: id,
                            formaPagamentoEntregaId: p.formaPagamentoEntregaId || null,
                            formaPagamentoNome: p.formaPagamentoNome,
                            valor: Number(p.valor),
                            vendedorResponsavelId: p.vendedorResponsavelId || null,
                            escritorioResponsavel: p.escritorioResponsavel || false
                        }))
                    });
                }
            }

            // Se itensDevolvidos foram enviados, reescreve todos
            if (itensDevolvidos) {
                await tx.entregaItemDevolvido.deleteMany({ where: { pedidoId: id } });
                if (itensDevolvidos.length > 0) {
                    await tx.entregaItemDevolvido.createMany({
                        data: itensDevolvidos.map(i => ({
                            pedidoId: id,
                            produtoId: i.produtoId,
                            quantidade: Number(i.quantidade),
                            valorBaseItem: Number(i.valorBaseItem)
                        }))
                    });
                }
            }
        });

        res.json({ message: 'Lançamento de entrega atualizado com sucesso.' });
    } catch (error) {
        console.error('Erro ao editar lançamento de entrega:', error);
        res.status(500).json({ error: 'Erro ao atualizar lançamento.' });
    }
});

// ==========================================
// 4. ADMIN: LISTAGEM GLOBAL AUDITORIA
// ==========================================
router.get('/auditoria', verificarAuth, checkAuditor, async (req, res) => {
    try {
        const { embarqueId, divergente, data, motorista, cliente } = req.query;
        const where = { statusEntrega: { not: 'PENDENTE' } }; // Auditamos o que já foi finalizado

        if (embarqueId) where.embarqueId = embarqueId;
        if (divergente === 'true') where.divergenciaPagamento = true;

        if (data) {
            where.dataEntrega = {
                gte: new Date(`${data}T00:00:00.000Z`),
                lte: new Date(`${data}T23:59:59.999Z`)
            };
        }

        if (motorista) {
            where.embarque = {
                ...(where.embarque || {}),
                responsavel: { nome: { contains: motorista, mode: 'insensitive' } }
            };
        }

        if (cliente) {
            where.cliente = {
                OR: [
                    { NomeFantasia: { contains: cliente, mode: 'insensitive' } },
                    { Nome: { contains: cliente, mode: 'insensitive' } }
                ]
            };
        }

        const entregas = await prisma.pedido.findMany({
            where,
            include: {
                embarque: { select: { numero: true, responsavel: { select: { nome: true } } } },
                cliente: { select: { NomeFantasia: true, Nome: true } },
                pagamentosReais: true,
                itensDevolvidos: { include: { produto: { select: { nome: true } } } }
            },
            orderBy: { dataEntrega: 'desc' },
            take: 500
        });

        res.json(entregas);
    } catch (error) {
        console.error('Erro ao listar auditoria de entregas:', error);
        res.status(500).json({ error: 'Erro interno na Auditoria.' });
    }
});

// ==========================================
// 4b. ADMIN: LISTAGEM GERENCIAL (LOGÍSTICA COMPLETA)
// ==========================================
router.get('/gerencial', verificarAuth, checkAuditor, async (req, res) => {
    try {
        const { search, dataInicio, dataFim, vendedorId, entregadorId, status, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where = {};

        // Filtros (Só finalizadas, assim como na auditoria, ou PENDENTES tbm? O usuario diz "entregas realizadas")
        if (status) {
            where.statusEntrega = status;
        } else {
            where.statusEntrega = { not: 'PENDENTE' }; // Default: apenas já realizadas
        }

        if (search) {
            where.cliente = {
                OR: [
                    { NomeFantasia: { contains: search, mode: 'insensitive' } },
                    { Nome: { contains: search, mode: 'insensitive' } },
                    { Documento: { contains: search } }
                ]
            };
        }

        if (vendedorId) where.vendedorId = vendedorId;

        if (entregadorId) {
            where.embarque = { responsavelId: entregadorId };
        }

        if (dataInicio || dataFim) {
            where.dataEntrega = {};
            if (dataInicio) {
                where.dataEntrega.gte = new Date(`${dataInicio}T00:00:00.000Z`);
            }
            if (dataFim) {
                where.dataEntrega.lte = new Date(`${dataFim}T23:59:59.999Z`);
            }
        }

        const [total, entregas] = await prisma.$transaction([
            prisma.pedido.count({ where }),
            prisma.pedido.findMany({
                where,
                include: {
                    cliente: { select: { NomeFantasia: true, Nome: true, Documento: true, End_Cidade: true } },
                    embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                    vendedor: { select: { id: true, nome: true } },
                    itens: { include: { produto: { select: { nome: true } } } },
                    itensDevolvidos: { include: { produto: { select: { nome: true } } } },
                    pagamentosReais: true
                },
                orderBy: { dataEntrega: 'desc' },
                skip,
                take: Number(limit)
            })
        ]);

        const totalPages = Math.ceil(total / Number(limit));

        res.json({
            data: entregas,
            meta: { total, totalPages, currentPage: Number(page) }
        });
    } catch (error) {
        console.error('Erro ao listar entregas gerencial:', error);
        res.status(500).json({ error: 'Erro ao buscar dados logísticos.' });
    }
});

// ==========================================
// 5. ADMIN FINANCEIRO: ESTORNO LOGÍSTICO (UNDO)
// ==========================================
router.delete('/:id/estorno', verificarAuth, checkAjustador, async (req, res) => {
    try {
        const { id } = req.params;

        const pedido = await prisma.pedido.findUnique({ where: { id } });
        if (!pedido) return res.status(404).json({ error: 'Pedido inexistente.' });

        // Transação de Desfazimento (Undo)
        await prisma.$transaction(async (tx) => {
            // Apaga rastros de devoluções físicas
            await tx.entregaItemDevolvido.deleteMany({ where: { pedidoId: id } });
            // Apaga extrato de pagamentos de guichê
            await tx.pedidoPagamentoReal.deleteMany({ where: { pedidoId: id } });

            // Reverte Pedido a Estágio Neutro PENDENTE no Caminhão daquela Carga
            await tx.pedido.update({
                where: { id },
                data: {
                    statusEntrega: 'PENDENTE',
                    gpsEntrega: null,
                    divergenciaPagamento: false,
                    dataEntrega: null
                }
            });
        });

        res.status(204).send();
    } catch (error) {
        console.error('Erro ao estornar check-in logístico:', error);
        res.status(500).json({ error: 'Erro de estorno crítico.' });
    }
});

// ==========================================
// 6. DETALHE DE UMA ENTREGA ESPECÍFICA
// ==========================================
router.get('/:id', verificarAuth, checkAuditor, async (req, res) => {
    try {
        const { id } = req.params;
        const pedido = await prisma.pedido.findUnique({
            where: { id },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true, Documento: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, Telefone: true, Telefone_Celular: true } },
                embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                vendedor: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } },
                pagamentosReais: true,
                itensDevolvidos: { include: { produto: { select: { id: true, nome: true, unidade: true } } } }
            }
        });

        if (!pedido) return res.status(404).json({ error: 'Entrega não localizada.' });

        // Resolve nome da condição de pagamento
        let condicaoNome = pedido.nomeCondicaoPagamento || pedido.opcaoCondicaoPagamento;
        if (!condicaoNome && pedido.opcaoCondicaoPagamento) {
            const tabela = await prisma.tabelaPreco.findFirst({
                where: { opcaoCondicao: pedido.opcaoCondicaoPagamento },
                select: { nomeCondicao: true }
            });
            if (tabela) condicaoNome = tabela.nomeCondicao;
        }

        res.json({ ...pedido, condicaoNome });
    } catch (error) {
        console.error('Erro ao detalhar entrega:', error);
        res.status(500).json({ error: 'Erro ao buscar detalhes da entrega.' });
    }
});

// ==========================================
// MOTORISTA: DEFINIR/REMOVER PRIORIDADE
// ==========================================
router.patch('/:id/prioridade', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const { id } = req.params;
        let { prioridade } = req.body; // número (1,2,3...) ou null para remover

        const pedido = await prisma.pedido.findUnique({
            where: { id },
            include: {
                cliente: { select: { Ponto_GPS: true, NomeFantasia: true } },
                embarque: { select: { responsavelId: true } }
            }
        });

        if (!pedido) return res.status(404).json({ error: 'Entrega não encontrada.' });
        if (pedido.statusEntrega !== 'PENDENTE') return res.status(400).json({ error: 'Só é possível priorizar entregas pendentes.' });

        // Validar GPS ao definir prioridade
        if (prioridade && !pedido.cliente?.Ponto_GPS) {
            return res.status(400).json({
                error: `Cliente "${pedido.cliente?.NomeFantasia}" não possui localização GPS cadastrada. Solicite ao administrador ou remova a prioridade.`
            });
        }

        // Se está definindo (não removendo), calcular próxima prioridade do MOTORISTA deste pedido
        if (prioridade) {
            const motoristaId = pedido.embarque?.responsavelId;
            const prioridadesDoMotorista = await prisma.pedido.findMany({
                where: {
                    statusEntrega: 'PENDENTE',
                    embarqueId: { not: null },
                    prioridadeEntrega: { not: null },
                    embarque: { responsavelId: motoristaId }
                },
                select: { prioridadeEntrega: true }
            });
            const maxAtual = prioridadesDoMotorista.length > 0
                ? Math.max(...prioridadesDoMotorista.map(p => p.prioridadeEntrega))
                : 0;
            prioridade = maxAtual + 1;
        }

        await prisma.pedido.update({
            where: { id },
            data: { prioridadeEntrega: prioridade || null }
        });

        // Auto-reordenar prioridades deste motorista após alteração
        const motoristaId = pedido.embarque?.responsavelId;
        if (motoristaId) {
            const priorizados = await prisma.pedido.findMany({
                where: {
                    statusEntrega: 'PENDENTE',
                    embarqueId: { not: null },
                    prioridadeEntrega: { not: null },
                    embarque: { responsavelId: motoristaId }
                },
                orderBy: { prioridadeEntrega: 'asc' },
                select: { id: true, prioridadeEntrega: true }
            });
            for (let i = 0; i < priorizados.length; i++) {
                if (priorizados[i].prioridadeEntrega !== i + 1) {
                    await prisma.pedido.update({
                        where: { id: priorizados[i].id },
                        data: { prioridadeEntrega: i + 1 }
                    });
                }
            }
        }

        res.json({ success: true, prioridade: prioridade || null });
    } catch (error) {
        console.error('Erro ao definir prioridade:', error);
        res.status(500).json({ error: 'Erro ao definir prioridade.' });
    }
});

// ==========================================
// MOTORISTA: REORDENAR PRIORIDADES (compactar gaps)
// ==========================================
router.post('/reordenar-prioridades', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        // Reordena prioridades agrupadas por motorista (responsavelId do embarque)
        const todosPriorizados = await prisma.pedido.findMany({
            where: { statusEntrega: 'PENDENTE', embarqueId: { not: null }, prioridadeEntrega: { not: null } },
            orderBy: { prioridadeEntrega: 'asc' },
            select: { id: true, prioridadeEntrega: true, embarque: { select: { responsavelId: true } } }
        });

        // Agrupar por motorista
        const porMotorista = {};
        for (const p of todosPriorizados) {
            const mId = p.embarque?.responsavelId || '_sem';
            if (!porMotorista[mId]) porMotorista[mId] = [];
            porMotorista[mId].push(p);
        }

        let totalAtualizado = 0;
        for (const lista of Object.values(porMotorista)) {
            for (let i = 0; i < lista.length; i++) {
                if (lista[i].prioridadeEntrega !== i + 1) {
                    await prisma.pedido.update({
                        where: { id: lista[i].id },
                        data: { prioridadeEntrega: i + 1 }
                    });
                    totalAtualizado++;
                }
            }
        }

        res.json({ success: true, total: totalAtualizado });
    } catch (error) {
        console.error('Erro ao reordenar prioridades:', error);
        res.status(500).json({ error: 'Erro ao reordenar.' });
    }
});

module.exports = router;
