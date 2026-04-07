const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const verificarAuth = require('../middlewares/authMiddleware');

// ── Helpers ──
const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcessoCaixa = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Acessar_Caixa || perms.Pode_Editar_Caixa) {
            req._perms = perms;
            return next();
        }
        return res.status(403).json({ error: 'Sem permissão para acessar o Caixa Diário.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

const checkEditor = async (req, res, next) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Editar_Caixa) {
            req._perms = perms;
            return next();
        }
        return res.status(403).json({ error: 'Permissão de Auditor do Caixa necessária.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

router.use(verificarAuth);
router.use(checkAcessoCaixa);

// ── Cálculo de Média de Combustível (últimos 3 meses) ──
const calcularMediaCombustivel = async (veiculoId) => {
    if (!veiculoId) return null;

    const tresMesesAtras = new Date();
    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
    const dataRef = tresMesesAtras.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const despesas = await prisma.despesa.findMany({
        where: {
            veiculoId,
            categoria: 'COMBUSTIVEL',
            dataReferencia: { gte: dataRef },
            kmNoAbastecimento: { not: null },
            litros: { not: null }
        },
        orderBy: { kmNoAbastecimento: 'asc' }
    });

    if (despesas.length < 2) return null;

    let totalKm = 0;
    let totalLitros = 0;

    for (let i = 1; i < despesas.length; i++) {
        const kmDiff = despesas[i].kmNoAbastecimento - despesas[i - 1].kmNoAbastecimento;
        if (kmDiff > 0) {
            totalKm += kmDiff;
            totalLitros += Number(despesas[i].litros);
        }
    }

    if (totalLitros <= 0) return null;
    return Math.round((totalKm / totalLitros) * 100) / 100;
};

// ── GET /resumo — Resumo completo do caixa diário ──
router.get('/resumo', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para ver caixa de outro usuário.' });
        }

        // 1. Buscar ou criar CaixaDiario
        let caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { entregasConferidas: true }
        });

        if (!caixa) {
            caixa = await prisma.caixaDiario.create({
                data: { vendedorId: targetVendedor, dataReferencia: data },
                include: { entregasConferidas: true }
            });
        }

        // 2. Buscar DiarioVendedor (info do veículo e km)
        const diario = await prisma.diarioVendedor.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { veiculo: { select: { id: true, placa: true, modelo: true } } }
        });

        const diarioInfo = diario ? {
            id: diario.id,
            veiculoId: diario.veiculoId,
            placa: diario.veiculo?.placa,
            modelo: diario.veiculo?.modelo,
            kmInicial: diario.kmInicial,
            kmFinal: diario.kmFinal,
            totalKm: diario.kmFinal && diario.kmInicial ? diario.kmFinal - diario.kmInicial : null,
            modo: diario.modo
        } : null;

        // 3. Calcular média combustível
        const mediaCombustivel3Meses = diario?.veiculoId ? await calcularMediaCombustivel(diario.veiculoId) : null;

        // 4. Buscar despesas do dia
        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: data },
            include: { veiculo: { select: { placa: true, modelo: true } } },
            orderBy: { createdAt: 'asc' }
        });

        const totalDespesas = despesas.reduce((sum, d) => sum + Number(d.valor), 0);

        // 5. Buscar entregas do dia (via dataEntrega + embarque.responsavelId)
        const inicioDia = new Date(data + 'T00:00:00.000Z');
        const fimDia = new Date(data + 'T23:59:59.999Z');

        const entregas = await prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicioDia, lte: fimDia },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                embarque: { responsavelId: targetVendedor }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                vendedor: { select: { nome: true } },
                embarque: { select: { numero: true } },
                itens: { include: { produto: { select: { nome: true, unidade: true } } } },
                pagamentosReais: true,
                itensDevolvidos: { include: { produto: { select: { nome: true } } } }
            },
            orderBy: { dataEntrega: 'asc' }
        });

        // 6. Buscar TODAS as condições da TabelaPreco (sem distinct, cada nomeCondicao pode ter debitaCaixa diferente)
        const todasCondicoes = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, tipoPagamento: true, nomeCondicao: true, debitaCaixa: true }
        });
        // Mapa por nomeCondicao (para classificar pagamento real pelo nome usado no checkout)
        const mapaCondicoesPorNome = Object.fromEntries(
            todasCondicoes.map(t => [t.nomeCondicao, t.debitaCaixa])
        );
        // Mapa por chave composta tipoPagamento|opcaoCondicao → evita colisão quando duas condições têm a mesma opcaoCondicao
        // Fallback: mapa simples por opcaoCondicao (caso tipoPagamento não esteja salvo no pedido)
        const mapaCondicoes = {};
        const mapaCondicoesPorOpcao = {};
        for (const t of todasCondicoes) {
            const chave = `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}`;
            if (!mapaCondicoes[chave]) {
                mapaCondicoes[chave] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
            if (!mapaCondicoesPorOpcao[t.opcaoCondicao]) {
                mapaCondicoesPorOpcao[t.opcaoCondicao] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
        }

        // 7. Classificar pagamentos e calcular totais
        // DEVOLVIDO não conta nos totais (mercadoria volta, motorista não recebeu dinheiro)
        // IMPORTANTE: classifica pelo nome do PAGAMENTO REAL (como motorista pagou), não pela condição original do pedido
        let totalRecebidoCaixa = 0;
        let totalRecebidoOutros = 0;
        let entreguesCount = 0, parciaisCount = 0, devolvidosCount = 0;
        const recebidoPorCondicao = {}; // { "À Vista - Dinheiro": 500, "7 dias - Boleto": 200, ... }

        const entregasFormatadas = entregas.map(e => {
            if (e.statusEntrega === 'ENTREGUE') entreguesCount++;
            else if (e.statusEntrega === 'ENTREGUE_PARCIAL') parciaisCount++;
            else if (e.statusEntrega === 'DEVOLVIDO') devolvidosCount++;

            const valorPedido = e.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0);
            const valorDevolvido = e.itensDevolvidos.reduce((s, i) => s + Number(i.valorBaseItem) * Number(i.quantidade), 0);

            // Condição original do pedido (para exibição) — usa nome salvo direto, com fallback para lookup por chave composta
            const chaveCondicao = `${e.tipoPagamento || ''}|${e.opcaoCondicaoPagamento || ''}`;
            const condicaoInfo = mapaCondicoes[chaveCondicao] || mapaCondicoesPorOpcao[e.opcaoCondicaoPagamento];
            const nomeCondicao = e.nomeCondicaoPagamento || condicaoInfo?.nome || e.opcaoCondicaoPagamento || 'Outros';

            // Devolvido: não conta nos totais de pagamento
            const isDevolvido = e.statusEntrega === 'DEVOLVIDO';

            const pagamentos = e.pagamentosReais.map(p => {
                // Classificar debitaCaixa pelo PAGAMENTO REAL (formaPagamentoNome)
                // 1. Escritório responsável: NÃO debita
                // 2. Vendedor responsável: DEBITA
                // 3. Condição da TabelaPreco: buscar pelo nome do pagamento real
                // 4. Fallback: condição original do pedido
                let debitaCaixa;
                let labelCondicao = p.formaPagamentoNome || nomeCondicao;
                if (p.escritorioResponsavel) {
                    debitaCaixa = false;
                } else if (p.vendedorResponsavelId) {
                    debitaCaixa = true;
                } else if (mapaCondicoesPorNome[p.formaPagamentoNome] !== undefined) {
                    // Buscar pela condição que o motorista REALMENTE selecionou no checkout
                    debitaCaixa = mapaCondicoesPorNome[p.formaPagamentoNome];
                } else {
                    // Fallback: condição original do pedido
                    debitaCaixa = condicaoInfo?.debitaCaixa || false;
                }
                const val = Number(p.valor);

                if (!isDevolvido) {
                    if (debitaCaixa) totalRecebidoCaixa += val;
                    else totalRecebidoOutros += val;

                    // Agrupar por condição/forma de pagamento
                    if (!recebidoPorCondicao[labelCondicao]) {
                        recebidoPorCondicao[labelCondicao] = { total: 0, debitaCaixa };
                    }
                    recebidoPorCondicao[labelCondicao].total += val;
                }

                return {
                    id: p.id,
                    formaNome: p.formaPagamentoNome,
                    valor: val,
                    debitaCaixa,
                    vendedorResponsavelId: p.vendedorResponsavelId,
                    escritorioResponsavel: p.escritorioResponsavel
                };
            });

            // Buscar conferência
            const conferencia = caixa.entregasConferidas.find(c => c.pedidoId === e.id);

            return {
                pedidoId: e.id,
                numero: e.numero,
                especial: e.especial || false,
                clienteNome: e.cliente?.NomeFantasia || e.cliente?.Nome || 'N/A',
                vendedorNome: e.vendedor?.nome,
                embarqueNumero: e.embarque?.numero,
                condicaoPagamento: nomeCondicao,
                valorPedido: Math.round(valorPedido * 100) / 100,
                statusEntrega: e.statusEntrega,
                dataEntrega: e.dataEntrega,
                divergenciaPagamento: e.divergenciaPagamento,
                pagamentos,
                valorDevolvido: Math.round(valorDevolvido * 100) / 100,
                itensDevolvidos: e.itensDevolvidos.map(i => ({
                    produto: i.produto?.nome,
                    quantidade: Number(i.quantidade)
                })),
                conferido: conferencia?.conferido || false,
                conferenciaId: conferencia?.id || null
            };
        });

        totalRecebidoCaixa = Math.round(totalRecebidoCaixa * 100) / 100;
        totalRecebidoOutros = Math.round(totalRecebidoOutros * 100) / 100;

        // 8. Amostras entregues no dia (informativo, sem valor financeiro)
        const amostrasEntregues = await prisma.amostra.findMany({
            where: {
                status: 'ENTREGUE',
                embarqueId: { not: null },
                embarque: { responsavelId: targetVendedor },
                updatedAt: { gte: inicioDia, lte: fimDia }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                lead: { select: { nomeEstabelecimento: true } },
                solicitadoPor: { select: { nome: true } },
                embarque: { select: { numero: true } },
                itens: { select: { nomeProduto: true, quantidade: true } }
            },
            orderBy: { updatedAt: 'asc' }
        });

        const amostrasFormatadas = amostrasEntregues.map(a => ({
            id: a.id,
            numero: a.numero,
            destinatario: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-',
            vendedorNome: a.solicitadoPor?.nome,
            embarqueNumero: a.embarque?.numero,
            itensCount: a.itens?.length || 0,
            itens: a.itens?.map(i => ({ nome: i.nomeProduto, quantidade: Number(i.quantidade) })) || []
        }));

        // Breakdown por condição (arredondar valores)
        const detalhamentoCaixa = Object.entries(recebidoPorCondicao).map(([nome, info]) => ({
            condicao: nome,
            valor: Math.round(info.total * 100) / 100,
            debitaCaixa: info.debitaCaixa
        }));

        const valorAPrestar = Math.round((Number(caixa.adiantamento) + totalRecebidoCaixa - totalDespesas) * 100) / 100;

        res.json({
            caixa: {
                id: caixa.id,
                status: caixa.status,
                adiantamento: Number(caixa.adiantamento),
                dataReferencia: caixa.dataReferencia,
                conferidoPor: caixa.conferidoPor,
                conferidoEm: caixa.conferidoEm,
                obsAdmin: caixa.obsAdmin
            },
            diario: diarioInfo,
            mediaCombustivel3Meses: mediaCombustivel3Meses,
            despesas,
            totalDespesas: Math.round(totalDespesas * 100) / 100,
            entregas: entregasFormatadas,
            contagens: {
                totalEntregas: entregas.length,
                entregues: entreguesCount,
                parciais: parciaisCount,
                devolvidos: devolvidosCount
            },
            totalRecebidoCaixa,
            totalRecebidoOutros,
            totalRecebido: Math.round((totalRecebidoCaixa + totalRecebidoOutros) * 100) / 100,
            detalhamentoCaixa,
            valorAPrestar,
            amostras: amostrasFormatadas,
            amostrasCount: amostrasFormatadas.length
        });
    } catch (error) {
        console.error('Erro ao buscar resumo do caixa:', error);
        res.status(500).json({ error: 'Erro ao buscar resumo do caixa.' });
    }
});

// ── GET /pendente — Retorna caixa ABERTO de dia anterior (se existir) ──
router.get('/pendente', async (req, res) => {
    try {
        const targetVendedor = req.query.vendedorId || req.user.id;
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        const caixaPendente = await prisma.caixaDiario.findFirst({
            where: {
                vendedorId: targetVendedor,
                status: 'ABERTO',
                dataReferencia: { lt: hoje }
            },
            orderBy: { dataReferencia: 'desc' }
        });

        res.json(caixaPendente ? { pendente: true, dataReferencia: caixaPendente.dataReferencia } : { pendente: false });
    } catch (error) {
        console.error('Erro ao buscar caixa pendente:', error);
        res.status(500).json({ error: 'Erro ao buscar caixa pendente.' });
    }
});

// ── PATCH /adiantamento — Definir adiantamento ──
router.patch('/adiantamento', async (req, res) => {
    try {
        const { vendedorId, data, valor } = req.body;
        if (!data || valor === undefined) return res.status(400).json({ error: 'Campos obrigatórios: data, valor.' });

        const targetVendedor = vendedorId || req.user.id;

        const caixa = await prisma.caixaDiario.upsert({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            update: { adiantamento: valor },
            create: { vendedorId: targetVendedor, dataReferencia: data, adiantamento: valor }
        });

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao definir adiantamento:', error);
        res.status(500).json({ error: 'Erro ao definir adiantamento.' });
    }
});

// ── POST /fechar — Fechar caixa do dia (snapshot) ──
router.post('/fechar', async (req, res) => {
    try {
        const { vendedorId, data } = req.body;
        if (!data) return res.status(400).json({ error: 'Campo "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        // Buscar resumo para snapshot
        // Reutilizar lógica do resumo internamente
        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: data }
        });
        const totalDespesas = despesas.reduce((s, d) => s + Number(d.valor), 0);

        const inicioDia = new Date(data + 'T00:00:00.000Z');
        const fimDia = new Date(data + 'T23:59:59.999Z');

        const entregas = await prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicioDia, lte: fimDia },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                embarque: { responsavelId: targetVendedor }
            },
            include: { pagamentosReais: true }
        });

        // Buscar TODAS as condições da TabelaPreco (sem distinct)
        const todasCondicoesFechar = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, nomeCondicao: true, debitaCaixa: true }
        });
        const mapaDebitaPorNome = Object.fromEntries(todasCondicoesFechar.map(t => [t.nomeCondicao, t.debitaCaixa]));
        const mapaDebitaPorOpcao = {};
        for (const t of todasCondicoesFechar) {
            if (!mapaDebitaPorOpcao[t.opcaoCondicao]) mapaDebitaPorOpcao[t.opcaoCondicao] = t.debitaCaixa;
        }

        let totalRecebidoCaixa = 0;
        let totalRecebidoOutros = 0;

        entregas.forEach(e => {
            // Devolvido não conta (mercadoria volta, motorista não recebeu)
            if (e.statusEntrega === 'DEVOLVIDO') return;

            e.pagamentosReais.forEach(p => {
                const val = Number(p.valor);
                let debita;
                if (p.escritorioResponsavel) debita = false;
                else if (p.vendedorResponsavelId) debita = true;
                else if (mapaDebitaPorNome[p.formaPagamentoNome] !== undefined) debita = mapaDebitaPorNome[p.formaPagamentoNome];
                else debita = mapaDebitaPorOpcao[e.opcaoCondicaoPagamento] || false;

                if (debita) totalRecebidoCaixa += val;
                else totalRecebidoOutros += val;
            });
        });

        const caixa = await prisma.caixaDiario.upsert({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            update: {
                status: 'FECHADO',
                totalDespesas: Math.round(totalDespesas * 100) / 100,
                totalRecebidoCaixa: Math.round(totalRecebidoCaixa * 100) / 100,
                totalRecebidoOutros: Math.round(totalRecebidoOutros * 100) / 100,
                valorAPrestar: Math.round(totalRecebidoCaixa - totalDespesas) * 100 / 100
            },
            create: {
                vendedorId: targetVendedor,
                dataReferencia: data,
                status: 'FECHADO',
                totalDespesas: Math.round(totalDespesas * 100) / 100,
                totalRecebidoCaixa: Math.round(totalRecebidoCaixa * 100) / 100,
                totalRecebidoOutros: Math.round(totalRecebidoOutros * 100) / 100,
                valorAPrestar: Math.round(totalRecebidoCaixa - totalDespesas) * 100 / 100
            }
        });

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao fechar caixa:', error);
        res.status(500).json({ error: 'Erro ao fechar caixa.' });
    }
});

// ── POST /conferir — Admin confere o caixa ──
router.post('/conferir', checkEditor, async (req, res) => {
    try {
        const { id, obsAdmin } = req.body;
        if (!id) return res.status(400).json({ error: 'ID do caixa obrigatório.' });

        const caixa = await prisma.caixaDiario.update({
            where: { id },
            data: {
                status: 'CONFERIDO',
                conferidoPor: req.user.id,
                conferidoEm: new Date(),
                obsAdmin: obsAdmin || null
            }
        });

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao conferir caixa:', error);
        res.status(500).json({ error: 'Erro ao conferir caixa.' });
    }
});

// ── POST /reverter-conferencia — Reverte CONFERIDO → FECHADO ──
router.post('/reverter-conferencia', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Reverter_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para reverter caixa.' });
        }

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID do caixa obrigatório.' });

        const caixaAtual = await prisma.caixaDiario.findUnique({
            where: { id },
            include: { vendedor: { select: { nome: true } } }
        });
        if (!caixaAtual) return res.status(404).json({ error: 'Caixa não encontrado.' });
        if (caixaAtual.status !== 'CONFERIDO') {
            return res.status(400).json({ error: 'Caixa não está conferido.' });
        }

        const [caixa] = await prisma.$transaction([
            prisma.caixaDiario.update({
                where: { id },
                data: {
                    status: 'FECHADO',
                    conferidoPor: null,
                    conferidoEm: null,
                    obsAdmin: null
                }
            }),
            prisma.auditLog.create({
                data: {
                    acao: 'REVERTER_CONFERENCIA',
                    entidade: 'CaixaDiario',
                    entidadeId: id,
                    detalhes: JSON.stringify({
                        vendedor: caixaAtual.vendedor?.nome,
                        vendedorId: caixaAtual.vendedorId,
                        data: caixaAtual.dataReferencia,
                        statusAnterior: 'CONFERIDO',
                        statusNovo: 'FECHADO'
                    }),
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || 'Admin'
                }
            })
        ]);

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao reverter conferência:', error);
        res.status(500).json({ error: 'Erro ao reverter conferência.' });
    }
});

// ── POST /reabrir — Reverte FECHADO → ABERTO ──
router.post('/reabrir', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Reverter_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para reabrir caixa.' });
        }

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID do caixa obrigatório.' });

        const caixaAtual = await prisma.caixaDiario.findUnique({
            where: { id },
            include: { vendedor: { select: { nome: true } } }
        });
        if (!caixaAtual) return res.status(404).json({ error: 'Caixa não encontrado.' });
        if (caixaAtual.status !== 'FECHADO') {
            return res.status(400).json({ error: 'Caixa não está fechado.' });
        }

        const [caixa] = await prisma.$transaction([
            prisma.caixaDiario.update({
                where: { id },
                data: {
                    status: 'ABERTO',
                    totalDespesas: null,
                    totalRecebidoCaixa: null,
                    totalRecebidoOutros: null,
                    valorAPrestar: null
                }
            }),
            prisma.auditLog.create({
                data: {
                    acao: 'REABRIR_CAIXA',
                    entidade: 'CaixaDiario',
                    entidadeId: id,
                    detalhes: JSON.stringify({
                        vendedor: caixaAtual.vendedor?.nome,
                        vendedorId: caixaAtual.vendedorId,
                        data: caixaAtual.dataReferencia,
                        statusAnterior: 'FECHADO',
                        statusNovo: 'ABERTO'
                    }),
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || 'Admin'
                }
            })
        ]);

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao reabrir caixa:', error);
        res.status(500).json({ error: 'Erro ao reabrir caixa.' });
    }
});

// ── PATCH /entrega-conferir — Marcar entrega como conferida ──
router.patch('/entrega-conferir', checkEditor, async (req, res) => {
    try {
        const { caixaId, pedidoId, conferido } = req.body;
        if (!caixaId || !pedidoId) return res.status(400).json({ error: 'caixaId e pedidoId obrigatórios.' });

        const record = await prisma.caixaEntregaConferida.upsert({
            where: { caixaDiarioId_pedidoId: { caixaDiarioId: caixaId, pedidoId } },
            update: {
                conferido: conferido !== undefined ? conferido : true,
                conferidoPor: req.user.id,
                conferidoEm: new Date()
            },
            create: {
                caixaDiarioId: caixaId,
                pedidoId,
                conferido: conferido !== undefined ? conferido : true,
                conferidoPor: req.user.id,
                conferidoEm: new Date()
            }
        });

        res.json(record);
    } catch (error) {
        console.error('Erro ao conferir entrega:', error);
        res.status(500).json({ error: 'Erro ao conferir entrega.' });
    }
});

// ── GET /relatorio — Dados formatados para impressão A4 ──
router.get('/relatorio', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }

        // Buscar vendedor
        const vendedor = await prisma.vendedor.findUnique({
            where: { id: targetVendedor },
            select: { nome: true }
        });

        // Buscar caixa
        const caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { entregasConferidas: true }
        });

        // Buscar diário
        const diario = await prisma.diarioVendedor.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        // Buscar despesas
        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: data },
            include: { veiculo: { select: { placa: true } } },
            orderBy: { createdAt: 'asc' }
        });

        // Buscar entregas
        const inicioDia = new Date(data + 'T00:00:00.000Z');
        const fimDia = new Date(data + 'T23:59:59.999Z');

        const entregas = await prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicioDia, lte: fimDia },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                embarque: { responsavelId: targetVendedor }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                itens: true,
                pagamentosReais: true,
                itensDevolvidos: true
            },
            orderBy: { dataEntrega: 'asc' }
        });

        // Buscar TODAS as condições da TabelaPreco (sem distinct)
        const todasCondicoesRel = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, tipoPagamento: true, nomeCondicao: true, debitaCaixa: true }
        });
        const mapaDebitaPorNomeRel = Object.fromEntries(
            todasCondicoesRel.map(t => [t.nomeCondicao, t.debitaCaixa])
        );
        const mapaCondicoes = {};
        const mapaCondicoesPorOpcaoRel = {};
        for (const t of todasCondicoesRel) {
            const chave = `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}`;
            if (!mapaCondicoes[chave]) {
                mapaCondicoes[chave] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
            if (!mapaCondicoesPorOpcaoRel[t.opcaoCondicao]) {
                mapaCondicoesPorOpcaoRel[t.opcaoCondicao] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
        }

        // Média combustível
        const mediaCombustivel = diario?.veiculoId ? await calcularMediaCombustivel(diario.veiculoId) : null;

        // Buscar atendimentos do dia
        // OR: atendimentos do responsável do caixa (ex: motorista) OU dos clientes entregues na rota
        // Necessário pois quem registra os atendimentos é o vendedor (ex: Clarkson),
        // mas o caixa pertence à motorista (ex: Leticia).
        const clienteIdsEntregues = [...new Set(
            entregas.filter(e => e.clienteId).map(e => e.clienteId)
        )];

        const atendimentos = await prisma.atendimento.findMany({
            where: {
                criadoEm: { gte: inicioDia, lte: fimDia },
                OR: [
                    { idVendedor: targetVendedor },
                    ...(clienteIdsEntregues.length > 0 ? [{ clienteId: { in: clienteIdsEntregues } }] : [])
                ]
            },
            include: {
                lead: { select: { nomeEstabelecimento: true } }
            },
            orderBy: { criadoEm: 'asc' }
        });


        // Buscar pedidos do dia feitos pelo vendedor (em nome dele)
        // ATENÇÃO: usar createdAt (data de criação), não dataVenda (data de entrega futura)
        const pedidosDoVendedor = await prisma.pedido.findMany({
            where: {
                vendedorId: targetVendedor,
                createdAt: { gte: inicioDia, lte: fimDia }
            },
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } }
            },
            orderBy: { createdAt: 'asc' }
        });



        // Buscar amostras entregues no dia
        const amostrasEntreguesRel = await prisma.amostra.findMany({
            where: {
                status: 'ENTREGUE',
                embarqueId: { not: null },
                embarque: { responsavelId: targetVendedor },
                updatedAt: { gte: inicioDia, lte: fimDia }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                lead: { select: { nomeEstabelecimento: true } },
                solicitadoPor: { select: { nome: true } },
                itens: { select: { nomeProduto: true, quantidade: true } }
            },
            orderBy: { updatedAt: 'asc' }
        });

        // Buscar nomes de clientes atendidos (pelo clienteId)
        const clienteIds = atendimentos.filter(a => a.clienteId).map(a => a.clienteId);
        let mapaClientes = {};
        if (clienteIds.length > 0) {
            const clientes = await prisma.cliente.findMany({
                where: { UUID: { in: clienteIds } },
                select: { UUID: true, NomeFantasia: true, Nome: true }
            });
            mapaClientes = Object.fromEntries(clientes.map(c => [c.UUID, c.NomeFantasia || c.Nome]));
        }

        res.json({
            vendedorNome: vendedor?.nome || 'Usuário',
            data,
            caixa: caixa || { adiantamento: 0, status: 'ABERTO' },
            diario: diario ? {
                placa: diario.veiculo?.placa,
                modelo: diario.veiculo?.modelo,
                kmInicial: diario.kmInicial,
                kmFinal: diario.kmFinal,
                totalKm: diario.kmFinal && diario.kmInicial ? diario.kmFinal - diario.kmInicial : null,
                modo: diario.modo
            } : null,
            mediaCombustivel,
            despesas: despesas.map(d => ({
                categoria: d.categoria,
                descricao: d.descricao,
                valor: Number(d.valor),
                veiculoPlaca: d.veiculo?.placa,
                litros: d.litros ? Number(d.litros) : null
            })),
            totalDespesas: despesas.reduce((s, d) => s + Number(d.valor), 0),
            entregas: entregas.map(e => {
                const valorPedido = e.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0);
                const conferencia = caixa?.entregasConferidas?.find(c => c.pedidoId === e.id);
                const chaveCondicaoRel = `${e.tipoPagamento || ''}|${e.opcaoCondicaoPagamento || ''}`;
                const condicaoInfo = mapaCondicoes[chaveCondicaoRel] || mapaCondicoesPorOpcaoRel[e.opcaoCondicaoPagamento];
                const condicaoDebitaCaixa = condicaoInfo?.debitaCaixa || false;

                return {
                    numero: e.numero,
                    especial: e.especial || false,
                    clienteNome: e.cliente?.NomeFantasia || e.cliente?.Nome || 'N/A',
                    condicao: e.nomeCondicaoPagamento || condicaoInfo?.nome || e.opcaoCondicaoPagamento || '-',
                    valorPedido: Math.round(valorPedido * 100) / 100,
                    status: e.statusEntrega,
                    pagamentos: e.pagamentosReais.map(p => {
                        let debita;
                        if (p.escritorioResponsavel) debita = false;
                        else if (p.vendedorResponsavelId) debita = true;
                        else if (mapaDebitaPorNomeRel[p.formaPagamentoNome] !== undefined) debita = mapaDebitaPorNomeRel[p.formaPagamentoNome];
                        else debita = condicaoDebitaCaixa;
                        return { forma: p.formaPagamentoNome, valor: Number(p.valor), debitaCaixa: debita };
                    }),
                    conferido: conferencia?.conferido || false
                };
            }),
            atendimentos: atendimentos.map(a => ({
                tipo: a.tipo,
                clienteNome: a.clienteId ? mapaClientes[a.clienteId] || 'Cliente' : a.lead?.nomeEstabelecimento || 'Lead',
                leadNome: a.lead?.nomeEstabelecimento || null,
                canal: a.lead?.canalOrigem || null,
                pedidoId: a.pedidoId,
                observacao: a.observacao || null,
                hora: a.criadoEm
            })),
            pedidosVendedor: pedidosDoVendedor.map(p => ({
                numero: p.numero,
                especial: p.especial || false,
                clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'N/A',
                createdAt: p.createdAt,
                observacao: p.observacoes || null
            })),
            amostras: amostrasEntreguesRel.map(a => ({
                id: a.id,
                numero: a.numero,
                destinatario: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-',
                solicitadoPor: a.solicitadoPor?.nome,
                itens: a.itens?.map(i => ({ nome: i.nomeProduto, quantidade: Number(i.quantidade) })) || []
            })),
            amostrasCount: amostrasEntreguesRel.length
        });
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório.' });
    }
});

// ── GET /audit-logs — Log de auditoria de ações no caixa ──
router.get('/audit-logs', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Editar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }

        const logs = await prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(logs.map(l => ({
            ...l,
            detalhes: l.detalhes ? JSON.parse(l.detalhes) : null
        })));
    } catch (error) {
        console.error('Erro ao buscar audit logs:', error);
        res.status(500).json({ error: 'Erro ao buscar logs.' });
    }
});

module.exports = router;
