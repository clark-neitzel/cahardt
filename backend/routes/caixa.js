const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../config/database'); // singleton compartilhado (pool único)
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
            include: { entregasConferidas: true, conferenciaDevolucao: true }
        });

        if (!caixa) {
            caixa = await prisma.caixaDiario.create({
                data: { vendedorId: targetVendedor, dataReferencia: data },
                include: { entregasConferidas: true, conferenciaDevolucao: true }
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
                // Ignora pagamentos com valor 0 (gerados por cliques duplicados de motorista)
                pagamentosReais: { where: { valor: { gt: 0 } } },
                itensDevolvidos: { include: { produto: { select: { nome: true } } } },
                contaReceber: { select: { status: true } }
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
                conferenciaId: conferencia?.id || null,
                quitado: (() => {
                    // Especial: usa status da ContaReceber local
                    if (e.contaReceber?.status === 'QUITADO' || e.contaReceber?.status === 'PARCIAL') return e.contaReceber.status;
                    // Normal (CA): verifica baixaCaRealizada
                    if (!e.baixaCaRealizada) return null;
                    // Checar se teve dinheiro (baixa real) ou só alteração de condição
                    const temDinheiro = pagamentos.some(p => !p.vendedorResponsavelId && !p.escritorioResponsavel && p.formaNome?.toLowerCase().includes('dinheiro'));
                    const temOutraForma = pagamentos.some(p => !p.vendedorResponsavelId && !p.escritorioResponsavel && (p.formaNome?.toLowerCase().includes('pix') || p.formaNome?.toLowerCase().includes('cart')));
                    if (temDinheiro && temOutraForma) return 'QUITADO'; // misto: baixou dinheiro + alterou condição
                    if (temDinheiro) return 'QUITADO'; // só dinheiro
                    return 'ALTERADO'; // só pix/cartão: condição alterada
                })(),
                devolucaoFinalizada: e.devolucaoFinalizada || false,
                idVendaContaAzul: e.idVendaContaAzul || null
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

        // Faltas de devolução cobradas do motorista (conferência confirmada) somam ao valor a prestar
        const confDev = caixa.conferenciaDevolucao;
        const faltasDevolucao = confDev?.status === 'CONFERIDA' ? Math.round(Number(confDev.totalCobrado) * 100) / 100 : 0;
        const temDevolucoesDia = entregas.some(e => (e.itensDevolvidos?.length || 0) > 0);

        const valorAPrestar = Math.round((Number(caixa.adiantamento) + totalRecebidoCaixa + faltasDevolucao - totalDespesas) * 100) / 100;

        // Atendimentos do dia: registrados pelo vendedor OU em clientes que foram entregues na rota
        const clienteIdsEntreguesRes = [...new Set(entregas.filter(e => e.clienteId).map(e => e.clienteId))];
        const atendimentosDia = await prisma.atendimento.findMany({
            where: {
                criadoEm: { gte: inicioDia, lte: fimDia },
                tipo: { not: 'FINANCEIRO' },
                OR: [
                    { idVendedor: targetVendedor },
                    ...(clienteIdsEntreguesRes.length > 0 ? [{ clienteId: { in: clienteIdsEntreguesRes } }] : [])
                ]
            },
            include: {
                lead: { select: { nomeEstabelecimento: true, origemLead: true } },
                vendedor: { select: { nome: true } },
                usuarioRegistro: { select: { id: true, nome: true } }
            },
            orderBy: { criadoEm: 'asc' }
        });
        const clienteIdsAtend = atendimentosDia.filter(a => a.clienteId).map(a => a.clienteId);
        let mapaClientesAtend = {};
        if (clienteIdsAtend.length > 0) {
            const cs = await prisma.cliente.findMany({
                where: { UUID: { in: clienteIdsAtend } },
                select: { UUID: true, NomeFantasia: true, Nome: true }
            });
            mapaClientesAtend = Object.fromEntries(cs.map(c => [c.UUID, c.NomeFantasia || c.Nome]));
        }
        // Pedidos criados pelo vendedor no dia (createdAt no dia)
        const pedidosDoVendedorDia = await prisma.pedido.findMany({
            where: { vendedorId: targetVendedor, createdAt: { gte: inicioDia, lte: fimDia } },
            include: { cliente: { select: { NomeFantasia: true, Nome: true } } },
            orderBy: { createdAt: 'asc' }
        });

        // Clientes do dia da rota do vendedor que NÃO foram atendidos/pedidos/entregues
        const DIAS_SIGLA_BE = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const siglaDoDia = DIAS_SIGLA_BE[new Date(data + 'T12:00:00').getDay()];
        const clientesDoDia = await prisma.cliente.findMany({
            where: {
                idVendedor: targetVendedor,
                Dia_de_venda: { contains: siglaDoDia, mode: 'insensitive' }
            },
            select: { UUID: true, NomeFantasia: true, Nome: true, Dia_de_venda: true, Ativo: true }
        });
        const atendidosIds = new Set([
            ...atendimentosDia.filter(a => a.clienteId).map(a => a.clienteId),
            ...pedidosDoVendedorDia.map(p => p.clienteId),
            ...entregas.filter(e => e.clienteId).map(e => e.clienteId)
        ]);
        const clientesNaoAtendidos = clientesDoDia
            .filter(c => c.Ativo !== false)
            .filter(c => !atendidosIds.has(c.UUID))
            // Dia_de_venda é "SEG,QUA" — validar match exato para evitar falso-positivo (ex: "DOMINGO")
            .filter(c => (c.Dia_de_venda || '').toUpperCase().split(',').map(s => s.trim()).includes(siglaDoDia))
            .map(c => ({
                clienteId: c.UUID,
                clienteNome: c.NomeFantasia || c.Nome,
                diaVenda: c.Dia_de_venda
            }));

        // Pendências para "deixar o dia certo" (escondem o VALOR A PRESTAR até serem resolvidas)
        // Só o que faz o dia estar incompleto operacionalmente — NÃO inclui financeiro (baixas/devoluções).
        const entregasPendentesDia = await prisma.pedido.count({
            where: {
                statusEntrega: 'PENDENTE',
                embarque: { responsavelId: targetVendedor, dataSaida: { gte: inicioDia, lte: fimDia } }
            }
        });
        const usouVeiculo = !!(diarioInfo && diarioInfo.modo === 'PRESENCIAL' && diarioInfo.veiculoId);
        const kmFinalFaltando = usouVeiculo && !diarioInfo.kmFinal;
        const atendimentosPendentesDia = clientesNaoAtendidos.length;
        const finalizacaoDia = {
            kmFinalFaltando,
            entregasPendentes: entregasPendentesDia,
            atendimentosPendentes: atendimentosPendentesDia,
            precisaFinalizar: kmFinalFaltando || entregasPendentesDia > 0 || atendimentosPendentesDia > 0
        };

        // Pendências para fechar caixa
        const devolucoesNaoFeitas = entregasFormatadas.filter(e =>
            ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada
        ).length;
        const quitacoesNaoFeitas = entregasFormatadas.filter(e => {
            if (e.statusEntrega === 'DEVOLVIDO') return false;
            if (e.quitado === 'QUITADO') return false;
            return e.pagamentos?.some(p =>
                p.debitaCaixa &&
                !p.vendedorResponsavelId &&
                !p.escritorioResponsavel &&
                p.formaNome?.toLowerCase().includes('dinheiro')
            );
        }).length;
        const conferenciaDevolucaoPendente = temDevolucoesDia && confDev?.status !== 'CONFERIDA';

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
            amostrasCount: amostrasFormatadas.length,
            atendimentos: atendimentosDia.map(a => ({
                tipo: a.tipo,
                clienteNome: a.clienteId ? (mapaClientesAtend[a.clienteId] || 'Cliente') : (a.lead?.nomeEstabelecimento || 'Lead'),
                leadNome: a.lead?.nomeEstabelecimento || null,
                canal: a.lead?.origemLead || null,
                pedidoId: a.pedidoId,
                observacao: a.observacao || null,
                vendedorNome: a.usuarioRegistro?.nome || a.vendedor?.nome || null,
                registradoPeloCaixaOwner: a.usuarioRegistro ? a.usuarioRegistro.id === targetVendedor : (a.idVendedor === targetVendedor),
                hora: a.criadoEm
            })),
            clientesNaoAtendidos,
            pedidosVendedor: pedidosDoVendedorDia.map(p => ({
                numero: p.numero,
                especial: p.especial || false,
                bonificacao: p.bonificacao || false,
                cancelado: p.statusEnvio === 'EXCLUIDO',
                clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'N/A',
                createdAt: p.createdAt,
                observacao: p.observacoes || null
            })),
            conferenciaDevolucao: {
                temDevolucoes: temDevolucoesDia || (faltasDevolucao > 0),
                status: confDev?.status || 'PENDENTE',
                totalCobrado: faltasDevolucao,
                conferidoPorNome: confDev?.conferidoPorNome || null,
                conferidoEm: confDev?.conferidoEm || null
            },
            faltasDevolucao,
            pendencias: {
                devolucoesNaoFeitas,
                quitacoesNaoFeitas,
                conferenciaDevolucaoPendente,
                podeFechar: devolucoesNaoFeitas === 0 && quitacoesNaoFeitas === 0 && !conferenciaDevolucaoPendente
            },
            finalizacaoDia
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
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Editar_Caixa && !perms.Pode_Fechar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para fechar o caixa.' });
        }

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
            include: {
                pagamentosReais: { where: { valor: { gt: 0 } } },
                contaReceber: { select: { status: true } },
                cliente: { select: { NomeFantasia: true, Nome: true } },
                itensDevolvidos: { select: { id: true } }
            }
        });

        // ── Validações pré-fechamento ──
        const pendencias = [];

        // 1. Devoluções pendentes: entregas parciais/devolvidas sem devolução formalizada
        const devPendentes = entregas.filter(e =>
            ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada
        );
        if (devPendentes.length > 0) {
            const nomes = devPendentes.map(e => `#${e.numero || '?'} ${e.cliente?.NomeFantasia || e.cliente?.Nome || ''}`).join(', ');
            pendencias.push(`${devPendentes.length} devolução(ões) pendente(s): ${nomes}`);
        }

        // 2. Quitações pendentes: entregas com pagamento real em dinheiro/pix/cartão não quitadas
        const quitPendentes = entregas.filter(e => {
            if (e.statusEntrega === 'DEVOLVIDO') return false;
            // Especial: já quitado via ContaReceber local
            if (e.contaReceber?.status === 'QUITADO' || e.contaReceber?.status === 'PARCIAL') return false;
            // Normal (CA): já processado via quitar-ca (baixa ou alteração de condição)
            if (e.baixaCaRealizada) return false;
            const n = (p) => (p.formaPagamentoNome || '').toLowerCase();
            return e.pagamentosReais.some(p =>
                !p.vendedorResponsavelId &&
                !p.escritorioResponsavel &&
                (n(p).includes('dinheiro') || n(p).includes('pix') || n(p).includes('cartão') || n(p).includes('cartao'))
            );
        });
        if (quitPendentes.length > 0) {
            const nomes = quitPendentes.map(e => `#${e.numero || '?'} ${e.cliente?.NomeFantasia || e.cliente?.Nome || ''}`).join(', ');
            pendencias.push(`${quitPendentes.length} baixa(s) de dinheiro pendente(s): ${nomes}`);
        }

        // 3. Conferência de devoluções: se o dia teve devolução, precisa estar confirmada
        const caixaExistente = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { conferenciaDevolucao: true }
        });
        const temDevolucoesFechar = entregas.some(e => (e.itensDevolvidos?.length || 0) > 0);
        const confDevFechar = caixaExistente?.conferenciaDevolucao;
        if (temDevolucoesFechar && confDevFechar?.status !== 'CONFERIDA') {
            pendencias.push('Conferência de devoluções pendente: confira a mercadoria que voltou antes de fechar o caixa.');
        }

        if (pendencias.length > 0) {
            return res.status(400).json({
                error: `Não é possível fechar o caixa. Pendências:\n${pendencias.join('\n')}`,
                pendencias,
                devolucoesIds: devPendentes.map(e => e.id),
                quitacoesIds: quitPendentes.map(e => e.id)
            });
        }

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

        // Snapshot do valor a prestar — mesma fórmula do /resumo:
        // adiantamento + recebido em caixa + faltas de devolução − despesas
        const adiantamentoFechar = Number(caixaExistente?.adiantamento || 0);
        const faltasDevolucaoFechar = confDevFechar?.status === 'CONFERIDA' ? Number(confDevFechar.totalCobrado) : 0;
        const valorAPrestarFechar = Math.round((adiantamentoFechar + totalRecebidoCaixa + faltasDevolucaoFechar - totalDespesas) * 100) / 100;

        const caixa = await prisma.caixaDiario.upsert({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            update: {
                status: 'FECHADO',
                totalDespesas: Math.round(totalDespesas * 100) / 100,
                totalRecebidoCaixa: Math.round(totalRecebidoCaixa * 100) / 100,
                totalRecebidoOutros: Math.round(totalRecebidoOutros * 100) / 100,
                valorAPrestar: valorAPrestarFechar
            },
            create: {
                vendedorId: targetVendedor,
                dataReferencia: data,
                status: 'FECHADO',
                totalDespesas: Math.round(totalDespesas * 100) / 100,
                totalRecebidoCaixa: Math.round(totalRecebidoCaixa * 100) / 100,
                totalRecebidoOutros: Math.round(totalRecebidoOutros * 100) / 100,
                valorAPrestar: valorAPrestarFechar
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

// ── POST /reabrir-pendentes — Reabre caixas FECHADOS que têm pendências ──
router.post('/reabrir-pendentes', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin) return res.status(403).json({ error: 'Apenas admin.' });

        // Buscar caixas FECHADOS (não CONFERIDO, pois esse já foi validado)
        const caixasFechados = await prisma.caixaDiario.findMany({
            where: { status: 'FECHADO' },
            include: { vendedor: { select: { id: true, nome: true } } }
        });

        const reabertos = [];

        for (const cx of caixasFechados) {
            const inicioDia = new Date(cx.dataReferencia + 'T00:00:00.000Z');
            const fimDia = new Date(cx.dataReferencia + 'T23:59:59.999Z');

            const entregas = await prisma.pedido.findMany({
                where: {
                    dataEntrega: { gte: inicioDia, lte: fimDia },
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                    embarque: { responsavelId: cx.vendedorId }
                },
                include: {
                    pagamentosReais: { where: { valor: { gt: 0 } } },
                    contaReceber: { select: { status: true } }
                }
            });

            const devPendentes = entregas.filter(e =>
                ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada
            );
            const quitPendentes = entregas.filter(e => {
                if (e.statusEntrega === 'DEVOLVIDO') return false;
                if (e.contaReceber?.status === 'QUITADO' || e.contaReceber?.status === 'PARCIAL') return false;
                if (e.baixaCaRealizada) return false;
                const n = (p) => (p.formaPagamentoNome || '').toLowerCase();
                return e.pagamentosReais.some(p =>
                    !p.vendedorResponsavelId &&
                    !p.escritorioResponsavel &&
                    (n(p).includes('dinheiro') || n(p).includes('pix') || n(p).includes('cartão') || n(p).includes('cartao'))
                );
            });

            if (devPendentes.length > 0 || quitPendentes.length > 0) {
                await prisma.caixaDiario.update({
                    where: { id: cx.id },
                    data: { status: 'ABERTO' }
                });
                reabertos.push({
                    data: cx.dataReferencia,
                    vendedor: cx.vendedor?.nome,
                    devolucoesP: devPendentes.length,
                    quitacoesP: quitPendentes.length
                });
            }
        }

        res.json({ reabertos: reabertos.length, detalhes: reabertos });
    } catch (error) {
        console.error('Erro ao reabrir caixas pendentes:', error);
        res.status(500).json({ error: 'Erro ao verificar caixas.' });
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

// ═══════════════════════════════════════════════════════════════════════════
// CONFERÊNCIA DE DEVOLUÇÕES
// O que o motorista marcou como devolvido nas entregas tem que voltar
// fisicamente. Quem tem Pode_Conferir_Devolucao_Caixa conta a mercadoria;
// falta sem autorização vira cobrança pela tabela do motorista (soma ao
// valor a prestar). Desconsiderar falta exige senha de quem tem
// Pode_Autorizar_Desconsiderar_Devolucao.
// ═══════════════════════════════════════════════════════════════════════════

const PERM_CONFERIR_DEV = 'Pode_Conferir_Devolucao_Caixa';
const PERM_AUTORIZAR_DEV = 'Pode_Autorizar_Desconsiderar_Devolucao';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

// Devoluções registradas nas entregas do dia do vendedor, agrupadas por produto
const buscarDevolucoesEsperadas = async (vendedorId, data) => {
    const inicioDia = new Date(data + 'T00:00:00.000Z');
    const fimDia = new Date(data + 'T23:59:59.999Z');
    const pedidos = await prisma.pedido.findMany({
        where: {
            dataEntrega: { gte: inicioDia, lte: fimDia },
            statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
            embarque: { responsavelId: vendedorId },
            itensDevolvidos: { some: {} }
        },
        select: {
            id: true,
            numero: true,
            cliente: { select: { NomeFantasia: true, Nome: true } },
            itensDevolvidos: {
                include: { produto: { select: { id: true, nome: true, unidade: true, valorVenda: true } } }
            }
        }
    });

    const porProduto = new Map();
    for (const p of pedidos) {
        const clienteNome = p.cliente?.NomeFantasia || p.cliente?.Nome || 'N/A';
        for (const item of p.itensDevolvidos) {
            if (!porProduto.has(item.produtoId)) {
                porProduto.set(item.produtoId, {
                    produtoId: item.produtoId,
                    produtoNome: item.produto?.nome || 'Produto',
                    unidade: item.produto?.unidade || null,
                    valorVendaBase: Number(item.produto?.valorVenda || 0),
                    qtdEsperada: 0,
                    pedidosOrigem: []
                });
            }
            const g = porProduto.get(item.produtoId);
            g.qtdEsperada = round3(g.qtdEsperada + Number(item.quantidade));
            g.pedidosOrigem.push({
                pedidoId: p.id,
                numero: p.numero,
                cliente: clienteNome,
                quantidade: Number(item.quantidade)
            });
        }
    }
    return [...porProduto.values()];
};

// Tabela de preço usada para cobrar faltas do motorista (config no cadastro do vendedor;
// padrão: tabela "funcionário" ativa; último recurso: preço base do produto)
const buscarTabelaCobranca = async (vendedorId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: vendedorId },
        select: { tabelaCobrancaFaltaId: true }
    });
    let tabela = null;
    if (vendedor?.tabelaCobrancaFaltaId) {
        tabela = await prisma.tabelaPreco.findFirst({
            where: { OR: [{ id: vendedor.tabelaCobrancaFaltaId }, { idCondicao: vendedor.tabelaCobrancaFaltaId }] }
        });
    }
    if (!tabela) {
        tabela = await prisma.tabelaPreco.findFirst({
            where: { ativo: true, nomeCondicao: { contains: 'funcion', mode: 'insensitive' } }
        });
    }
    return tabela;
};

const precoNaTabela = (valorVenda, tabela) =>
    round2(Number(valorVenda || 0) * (1 + Number(tabela?.acrescimoPreco || 0) / 100));

const getCaixaDoDia = (vendedorId, data) => prisma.caixaDiario.upsert({
    where: { vendedorId_dataReferencia: { vendedorId, dataReferencia: data } },
    update: {},
    create: { vendedorId, dataReferencia: data }
});

// ── GET /conferencia-devolucao — Estado da conferência do dia ──
router.get('/conferencia-devolucao', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;
        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa && !req._perms[PERM_CONFERIR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para ver caixa de outro usuário.' });
        }

        const esperadas = await buscarDevolucoesEsperadas(targetVendedor, data);
        const caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { conferenciaDevolucao: { include: { itens: true } } }
        });
        const conf = caixa?.conferenciaDevolucao || null;
        const tabela = await buscarTabelaCobranca(targetVendedor);

        const itensSalvos = new Map((conf?.itens || []).map(i => [i.produtoId, i]));
        const itens = esperadas.map(e => {
            const s = itensSalvos.get(e.produtoId);
            return {
                produtoId: e.produtoId,
                produtoNome: e.produtoNome,
                unidade: e.unidade,
                qtdEsperada: e.qtdEsperada,
                pedidosOrigem: e.pedidosOrigem,
                valorUnitCobranca: s?.valorUnitCobranca != null ? Number(s.valorUnitCobranca) : precoNaTabela(e.valorVendaBase, tabela),
                qtdRecebida: s ? Number(s.qtdRecebida) : null,
                qtdDesconsiderada: s ? Number(s.qtdDesconsiderada) : 0,
                qtdCobrada: s ? Number(s.qtdCobrada) : 0,
                valorCobrado: s ? Number(s.valorCobrado) : 0,
                motivoDesconsiderar: s?.motivoDesconsiderar || null,
                autorizadoPorNome: s?.autorizadoPorNome || null,
                autorizadoEm: s?.autorizadoEm || null,
                sobra: false
            };
        });

        // Sobras registradas (voltou sem devolução registrada)
        const idsEsperados = new Set(esperadas.map(e => e.produtoId));
        for (const s of (conf?.itens || [])) {
            if (idsEsperados.has(s.produtoId)) continue;
            itens.push({
                produtoId: s.produtoId,
                produtoNome: s.produtoNome,
                unidade: null,
                qtdEsperada: 0,
                pedidosOrigem: Array.isArray(s.pedidosOrigem) ? s.pedidosOrigem : [],
                valorUnitCobranca: s.valorUnitCobranca != null ? Number(s.valorUnitCobranca) : null,
                qtdRecebida: Number(s.qtdRecebida),
                qtdDesconsiderada: 0,
                qtdCobrada: 0,
                valorCobrado: 0,
                motivoDesconsiderar: null,
                autorizadoPorNome: null,
                autorizadoEm: null,
                sobra: true
            });
        }

        // Quem pode autorizar desconsiderar (lista do modal de autorização)
        const vendedoresAtivos = await prisma.vendedor.findMany({
            where: { ativo: true },
            select: { id: true, nome: true, permissoes: true },
            orderBy: { nome: 'asc' }
        });
        const autorizadores = vendedoresAtivos
            .filter(v => {
                const p = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
                return p.admin || p[PERM_AUTORIZAR_DEV];
            })
            .map(v => ({ id: v.id, nome: v.nome }));

        res.json({
            temDevolucoes: esperadas.length > 0 || (conf?.itens?.length || 0) > 0,
            status: conf?.status || 'PENDENTE',
            conferidoPorNome: conf?.conferidoPorNome || null,
            conferidoEm: conf?.conferidoEm || null,
            totalCobrado: Number(conf?.totalCobrado || 0),
            tabelaCobranca: tabela ? { id: tabela.id, nome: tabela.nomeCondicao } : null,
            itens,
            autorizadores,
            podeConferir: !!(req._perms.admin || req._perms[PERM_CONFERIR_DEV])
        });
    } catch (error) {
        console.error('Erro ao buscar conferência de devoluções:', error);
        res.status(500).json({ error: 'Erro ao buscar conferência de devoluções.' });
    }
});

// ── POST /conferencia-devolucao/autorizar — Desconsiderar falta com senha ──
router.post('/conferencia-devolucao/autorizar', async (req, res) => {
    try {
        if (!req._perms.admin && !req._perms[PERM_CONFERIR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para conferir devoluções.' });
        }

        const { vendedorId, data, produtoId, quantidade, motivo, autorizadorId, senha } = req.body;
        if (!data || !produtoId || !autorizadorId || !senha) {
            return res.status(400).json({ error: 'Campos obrigatórios: data, produtoId, autorizadorId, senha.' });
        }
        const qtd = Number(quantidade);
        if (!(qtd > 0)) return res.status(400).json({ error: 'Quantidade a desconsiderar deve ser maior que zero.' });

        const targetVendedor = vendedorId || req.user.id;

        // Validar autorizador: ativo + permissão + senha do próprio login
        const autorizador = await prisma.vendedor.findUnique({ where: { id: autorizadorId } });
        if (!autorizador || !autorizador.ativo) {
            return res.status(403).json({ error: 'Autorizador inválido ou inativo.' });
        }
        const permsAut = typeof autorizador.permissoes === 'string'
            ? JSON.parse(autorizador.permissoes)
            : (autorizador.permissoes || {});
        if (!permsAut.admin && !permsAut[PERM_AUTORIZAR_DEV]) {
            return res.status(403).json({ error: `${autorizador.nome} não tem permissão para autorizar desconsiderar devolução.` });
        }
        if (!autorizador.senha) {
            return res.status(403).json({ error: 'Autorizador sem senha configurada no app.' });
        }
        const senhaValida = await bcrypt.compare(senha, autorizador.senha);
        if (!senhaValida) return res.status(401).json({ error: 'Senha incorreta.' });

        // Produto precisa ter devolução registrada no dia
        const esperadas = await buscarDevolucoesEsperadas(targetVendedor, data);
        const esperado = esperadas.find(e => e.produtoId === produtoId);
        if (!esperado) return res.status(400).json({ error: 'Produto sem devolução registrada neste dia.' });

        const qtdFinal = Math.min(round3(qtd), esperado.qtdEsperada);

        const caixa = await getCaixaDoDia(targetVendedor, data);
        let conf = await prisma.caixaConferenciaDevolucao.findUnique({ where: { caixaDiarioId: caixa.id } });
        if (conf?.status === 'CONFERIDA') {
            return res.status(400).json({ error: 'Conferência já confirmada. Reabra a conferência para alterar.' });
        }
        if (!conf) {
            conf = await prisma.caixaConferenciaDevolucao.create({ data: { caixaDiarioId: caixa.id } });
        }

        const dadosAutorizacao = {
            qtdEsperada: esperado.qtdEsperada,
            qtdDesconsiderada: qtdFinal,
            motivoDesconsiderar: (motivo || '').trim() || null,
            autorizadoPorId: autorizador.id,
            autorizadoPorNome: autorizador.nome,
            autorizadoEm: new Date(),
            pedidosOrigem: esperado.pedidosOrigem
        };
        const item = await prisma.caixaConferenciaDevolucaoItem.upsert({
            where: { conferenciaId_produtoId: { conferenciaId: conf.id, produtoId } },
            update: dadosAutorizacao,
            create: {
                conferenciaId: conf.id,
                produtoId,
                produtoNome: esperado.produtoNome,
                ...dadosAutorizacao
            }
        });

        // Log de auditoria FORA da operação principal — falha no log não desfaz a autorização
        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'AUTORIZAR_DESCONSIDERAR_DEVOLUCAO',
                    entidade: 'CaixaConferenciaDevolucao',
                    entidadeId: conf.id,
                    detalhes: JSON.stringify({
                        vendedorId: targetVendedor,
                        data,
                        produto: esperado.produtoNome,
                        quantidade: qtdFinal,
                        motivo: dadosAutorizacao.motivoDesconsiderar,
                        digitadoPor: req.user.id
                    }),
                    usuarioId: autorizador.id,
                    usuarioNome: autorizador.nome
                }
            });
        } catch (logErr) {
            console.error('[conferencia-devolucao] falha no audit log (autorização já gravada):', logErr.message);
        }

        res.json({
            ok: true,
            produtoId,
            qtdDesconsiderada: qtdFinal,
            autorizadoPorNome: autorizador.nome,
            autorizadoEm: item.autorizadoEm
        });
    } catch (error) {
        console.error('Erro ao autorizar desconsiderar devolução:', error);
        res.status(500).json({ error: 'Erro ao autorizar desconsiderar devolução.' });
    }
});

// ── POST /conferencia-devolucao/confirmar — Grava contagem e calcula cobrança ──
router.post('/conferencia-devolucao/confirmar', async (req, res) => {
    try {
        if (!req._perms.admin && !req._perms[PERM_CONFERIR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para conferir devoluções.' });
        }

        const { vendedorId, data, itens, sobras } = req.body;
        if (!data) return res.status(400).json({ error: 'Campo "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        const esperadas = await buscarDevolucoesEsperadas(targetVendedor, data);
        const sobrasInformadas = (sobras || []).filter(s => Number(s.quantidade) > 0 && !esperadas.some(e => e.produtoId === s.produtoId));
        if (esperadas.length === 0 && sobrasInformadas.length === 0) {
            return res.status(400).json({ error: 'Não há devoluções para conferir neste dia.' });
        }

        const caixa = await getCaixaDoDia(targetVendedor, data);
        const confExistente = await prisma.caixaConferenciaDevolucao.findUnique({
            where: { caixaDiarioId: caixa.id },
            include: { itens: true }
        });
        // Idempotência: clique duplo não recalcula nem duplica
        if (confExistente?.status === 'CONFERIDA') {
            return res.status(400).json({ error: 'Conferência já confirmada. Reabra a conferência para alterar.' });
        }

        const tabela = await buscarTabelaCobranca(targetVendedor);
        const recebidasMap = new Map((itens || []).map(i => [i.produtoId, Number(i.qtdRecebida) || 0]));
        const salvosMap = new Map((confExistente?.itens || []).map(i => [i.produtoId, i]));

        const linhas = esperadas.map(e => {
            const salvo = salvosMap.get(e.produtoId);
            const qtdRecebida = round3(Math.max(0, recebidasMap.get(e.produtoId) ?? 0));
            const faltaAposContagem = Math.max(0, round3(e.qtdEsperada - qtdRecebida));
            const qtdDesconsiderada = Math.min(round3(Number(salvo?.qtdDesconsiderada || 0)), faltaAposContagem);
            const qtdCobrada = round3(Math.max(0, e.qtdEsperada - qtdRecebida - qtdDesconsiderada));
            const valorUnit = precoNaTabela(e.valorVendaBase, tabela);
            return {
                produtoId: e.produtoId,
                produtoNome: e.produtoNome,
                qtdEsperada: e.qtdEsperada,
                qtdRecebida,
                qtdDesconsiderada,
                qtdCobrada,
                sobra: false,
                valorUnitCobranca: valorUnit,
                valorCobrado: round2(qtdCobrada * valorUnit),
                motivoDesconsiderar: qtdDesconsiderada > 0 ? (salvo?.motivoDesconsiderar || null) : null,
                autorizadoPorId: qtdDesconsiderada > 0 ? (salvo?.autorizadoPorId || null) : null,
                autorizadoPorNome: qtdDesconsiderada > 0 ? (salvo?.autorizadoPorNome || null) : null,
                autorizadoEm: qtdDesconsiderada > 0 ? (salvo?.autorizadoEm || null) : null,
                pedidosOrigem: e.pedidosOrigem
            };
        });

        // Sobras avulsas (produto que voltou sem devolução registrada)
        if (sobrasInformadas.length > 0) {
            const prods = await prisma.produto.findMany({
                where: { id: { in: sobrasInformadas.map(s => s.produtoId) } },
                select: { id: true, nome: true }
            });
            const nomePorId = new Map(prods.map(p => [p.id, p.nome]));
            for (const s of sobrasInformadas) {
                if (!nomePorId.has(s.produtoId)) continue;
                linhas.push({
                    produtoId: s.produtoId,
                    produtoNome: nomePorId.get(s.produtoId),
                    qtdEsperada: 0,
                    qtdRecebida: round3(Number(s.quantidade)),
                    qtdDesconsiderada: 0,
                    qtdCobrada: 0,
                    sobra: true,
                    valorUnitCobranca: null,
                    valorCobrado: 0,
                    motivoDesconsiderar: null,
                    autorizadoPorId: null,
                    autorizadoPorNome: null,
                    autorizadoEm: null,
                    pedidosOrigem: []
                });
            }
        }

        const totalCobrado = round2(linhas.reduce((s, l) => s + l.valorCobrado, 0));

        const conferente = await prisma.vendedor.findUnique({
            where: { id: req.user.id },
            select: { nome: true }
        });

        const dadosConf = {
            status: 'CONFERIDA',
            conferidoPorId: req.user.id,
            conferidoPorNome: conferente?.nome || null,
            conferidoEm: new Date(),
            totalCobrado,
            tabelaCobrancaId: tabela?.id || null,
            tabelaCobrancaNome: tabela?.nomeCondicao || null
        };

        await prisma.$transaction(async (tx) => {
            const c = await tx.caixaConferenciaDevolucao.upsert({
                where: { caixaDiarioId: caixa.id },
                update: dadosConf,
                create: { caixaDiarioId: caixa.id, ...dadosConf }
            });
            await tx.caixaConferenciaDevolucaoItem.deleteMany({ where: { conferenciaId: c.id } });
            await tx.caixaConferenciaDevolucaoItem.createMany({
                data: linhas.map(l => ({ ...l, conferenciaId: c.id }))
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Log FORA da transação — falha no log nunca desfaz a conferência
        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'CONFIRMAR_CONFERENCIA_DEVOLUCAO',
                    entidade: 'CaixaDiario',
                    entidadeId: caixa.id,
                    detalhes: JSON.stringify({
                        vendedorId: targetVendedor,
                        data,
                        totalCobrado,
                        tabela: tabela?.nomeCondicao || null,
                        itens: linhas.map(l => ({
                            produto: l.produtoNome,
                            esperada: l.qtdEsperada,
                            recebida: l.qtdRecebida,
                            desconsiderada: l.qtdDesconsiderada,
                            cobrada: l.qtdCobrada,
                            valor: l.valorCobrado
                        }))
                    }),
                    usuarioId: req.user.id,
                    usuarioNome: conferente?.nome || 'Usuário'
                }
            });
        } catch (logErr) {
            console.error('[conferencia-devolucao] falha no audit log (conferência já gravada):', logErr.message);
        }

        res.json({ ok: true, totalCobrado, itens: linhas.length });
    } catch (error) {
        console.error('Erro ao confirmar conferência de devoluções:', error);
        res.status(500).json({ error: 'Erro ao confirmar conferência de devoluções.' });
    }
});

// ── POST /conferencia-devolucao/reabrir — Volta CONFERIDA → PENDENTE ──
router.post('/conferencia-devolucao/reabrir', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Reverter_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para reabrir conferência.' });
        }

        const { vendedorId, data } = req.body;
        if (!data) return res.status(400).json({ error: 'Campo "data" obrigatório.' });
        const targetVendedor = vendedorId || req.user.id;

        const caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { conferenciaDevolucao: true }
        });
        if (!caixa?.conferenciaDevolucao) return res.status(404).json({ error: 'Conferência não encontrada.' });
        if (caixa.status !== 'ABERTO') {
            return res.status(400).json({ error: 'Reabra o caixa antes de reabrir a conferência de devoluções.' });
        }

        const conf = await prisma.caixaConferenciaDevolucao.update({
            where: { id: caixa.conferenciaDevolucao.id },
            data: { status: 'PENDENTE', conferidoPorId: null, conferidoPorNome: null, conferidoEm: null, totalCobrado: 0 }
        });

        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'REABRIR_CONFERENCIA_DEVOLUCAO',
                    entidade: 'CaixaConferenciaDevolucao',
                    entidadeId: conf.id,
                    detalhes: JSON.stringify({ vendedorId: targetVendedor, data }),
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || 'Admin'
                }
            });
        } catch (logErr) {
            console.error('[conferencia-devolucao] falha no audit log (reabertura já gravada):', logErr.message);
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao reabrir conferência de devoluções:', error);
        res.status(500).json({ error: 'Erro ao reabrir conferência de devoluções.' });
    }
});

// ── GET /vendedores-do-dia — Vendedores do seletor do caixa ──
// Só ativos; inativo aparece apenas se tiver movimento no dia (caixa fechado/adiantamento,
// despesa, diário de veículo ou embarque como responsável).
router.get('/vendedores-do-dia', async (req, res) => {
    try {
        const { data } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const inicioDia = new Date(data + 'T00:00:00.000Z');
        const fimDia = new Date(data + 'T23:59:59.999Z');

        const [ativos, caixas, despesas, diarios, embarques] = await Promise.all([
            prisma.vendedor.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
            prisma.caixaDiario.findMany({
                where: { dataReferencia: data, OR: [{ status: { not: 'ABERTO' } }, { adiantamento: { gt: 0 } }] },
                select: { vendedorId: true }
            }),
            prisma.despesa.findMany({ where: { dataReferencia: data }, select: { vendedorId: true }, distinct: ['vendedorId'] }),
            prisma.diarioVendedor.findMany({ where: { dataReferencia: data }, select: { vendedorId: true } }),
            prisma.embarque.findMany({
                where: { dataSaida: { gte: inicioDia, lte: fimDia } },
                select: { responsavelId: true },
                distinct: ['responsavelId']
            })
        ]);

        const comMovimento = new Set([
            ...caixas.map(c => c.vendedorId),
            ...despesas.map(d => d.vendedorId),
            ...diarios.map(d => d.vendedorId),
            ...embarques.map(e => e.responsavelId).filter(Boolean)
        ]);

        const idsAtivos = new Set(ativos.map(v => v.id));
        const idsInativosComMov = [...comMovimento].filter(id => !idsAtivos.has(id));
        const inativos = idsInativosComMov.length
            ? await prisma.vendedor.findMany({
                where: { id: { in: idsInativosComMov } },
                select: { id: true, nome: true },
                orderBy: { nome: 'asc' }
            })
            : [];

        res.json([
            ...ativos.map(v => ({ id: v.id, nome: v.nome, ativo: true })),
            ...inativos.map(v => ({ id: v.id, nome: v.nome, ativo: false, teveCaixa: true }))
        ].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    } catch (error) {
        console.error('Erro ao listar vendedores do dia:', error);
        res.status(500).json({ error: 'Erro ao listar vendedores.' });
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
            include: { entregasConferidas: true, conferenciaDevolucao: { include: { itens: true } } }
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
                pagamentosReais: { where: { valor: { gt: 0 } } },
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
            amostrasCount: amostrasEntreguesRel.length,
            conferenciaDevolucao: caixa?.conferenciaDevolucao ? {
                status: caixa.conferenciaDevolucao.status,
                conferidoPorNome: caixa.conferenciaDevolucao.conferidoPorNome,
                conferidoEm: caixa.conferenciaDevolucao.conferidoEm,
                totalCobrado: Number(caixa.conferenciaDevolucao.totalCobrado || 0),
                tabelaCobrancaNome: caixa.conferenciaDevolucao.tabelaCobrancaNome,
                itens: caixa.conferenciaDevolucao.itens.map(i => ({
                    produtoNome: i.produtoNome,
                    qtdEsperada: Number(i.qtdEsperada),
                    qtdRecebida: Number(i.qtdRecebida),
                    qtdDesconsiderada: Number(i.qtdDesconsiderada),
                    qtdCobrada: Number(i.qtdCobrada),
                    valorCobrado: Number(i.valorCobrado),
                    sobra: i.sobra,
                    motivoDesconsiderar: i.motivoDesconsiderar,
                    autorizadoPorNome: i.autorizadoPorNome,
                    pedidosOrigem: Array.isArray(i.pedidosOrigem) ? i.pedidosOrigem : []
                }))
            } : null,
            faltasDevolucao: caixa?.conferenciaDevolucao?.status === 'CONFERIDA'
                ? Number(caixa.conferenciaDevolucao.totalCobrado || 0)
                : 0
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

// ── POST /quitar-ca — Dar baixa de entregas à vista (dinheiro) ──
// ESPECIAL → baixa LOCAL (ContaReceber/Parcela no app)
// Normal  → baixa no CONTA AZUL via API (conta caixinha)
router.post('/quitar-ca', async (req, res) => {
    const perms = req._perms || await getPerms(req.user.id);
    if (!perms.admin && !perms.Pode_Editar_Caixa && !perms.Pode_Baixar_Caixa) {
        return res.status(403).json({ error: 'Sem permissão para dar baixa no caixa.' });
    }
    const contaAzulService = require('../services/contaAzulService');

    try {
        const { pedidoIds, dataPagamento } = req.body;

        if (!Array.isArray(pedidoIds) || pedidoIds.length === 0) {
            return res.status(400).json({ error: 'Selecione ao menos uma entrega.' });
        }

        // Buscar pedidos com dados necessários
        const pedidos = await prisma.pedido.findMany({
            where: { id: { in: pedidoIds } },
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                embarque: { include: { responsavel: { select: { nome: true } } } },
                itens: true,
                pagamentosReais: { where: { valor: { gt: 0 } } }
            }
        });

        if (pedidos.length === 0) {
            return res.status(400).json({ error: 'Nenhum pedido encontrado.' });
        }

        // Buscar nome do usuário solicitante
        const solicitante = await prisma.vendedor.findUnique({
            where: { id: req.user.id },
            select: { nome: true }
        });

        const dataPgto = dataPagamento || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const resultados = [];

        // Mapear nome do pagamento real para enum do CA
        const mapMetodoPagamentoCA = (formaNome) => {
            const nome = (formaNome || '').toLowerCase();
            if (nome.includes('dinheiro')) return 'DINHEIRO';
            if (nome.includes('pix')) return 'PIX_PAGAMENTO_INSTANTANEO';
            if (nome.includes('cartão') || nome.includes('cartao')) {
                if (nome.includes('débito') || nome.includes('debito')) return 'CARTAO_DEBITO';
                return 'CARTAO_CREDITO';
            }
            if (nome.includes('boleto')) return 'BOLETO_BANCARIO';
            if (nome.includes('transferência') || nome.includes('transferencia')) return 'TRANSFERENCIA_BANCARIA';
            return 'OUTRO';
        };

        // Formas que são elegíveis para processamento no caixa
        const isFormaElegivel = (formaNome) => {
            const nome = (formaNome || '').toLowerCase();
            return nome.includes('dinheiro') || nome.includes('pix') || nome.includes('cartão') || nome.includes('cartao');
        };

        // Agrupa pagamentos elegíveis por tipo. Para pedidos CA (não-especiais),
        // Vendedor/Escritório responsável vão como grupo OUTRO (apenas alteram a
        // forma no CA, sem criar baixa). Pedidos especiais ignoram esses pagamentos.
        const agruparPagamentos = (pedido) => {
            const grupos = {};
            for (const p of pedido.pagamentosReais) {
                if (Number(p.valor) <= 0) continue;
                if (p.escritorioResponsavel || p.vendedorResponsavelId) {
                    if (pedido.especial) continue; // especial: fiado local, sem ação no CA
                    const rotulo = p.vendedorResponsavelId
                        ? 'Vendedor responsável'
                        : 'Escritório responsável';
                    if (!grupos['OUTRO']) grupos['OUTRO'] = { valor: 0, formaNome: rotulo };
                    grupos['OUTRO'].valor += Number(p.valor);
                    continue;
                }
                if (!isFormaElegivel(p.formaPagamentoNome)) continue;
                const metodo = mapMetodoPagamentoCA(p.formaPagamentoNome);
                if (!grupos[metodo]) grupos[metodo] = { valor: 0, formaNome: p.formaPagamentoNome };
                grupos[metodo].valor += Number(p.valor);
            }
            return grupos;
        };

        // Valor total elegível (dinheiro + pix + cartão)
        const calcValorElegivel = (pedido) => {
            const grupos = agruparPagamentos(pedido);
            return Object.values(grupos).reduce((s, g) => s + g.valor, 0);
        };

        // Validar elegibilidade: aceita pedidos com pagamento real em dinheiro, pix ou cartão
        const pedidosElegiveis = [];
        for (const pedido of pedidos) {
            const clienteNome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A';
            const valorElegivel = calcValorElegivel(pedido);
            if (valorElegivel <= 0) {
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: pedido.especial ? 'ESPECIAL' : 'CA',
                    status: 'ERRO',
                    erro: 'Nenhum pagamento em dinheiro/pix encontrado neste pedido'
                });
                continue;
            }
            // Impedir baixa duplicada no CA
            if (!pedido.especial && pedido.baixaCaRealizada) {
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: 'CA',
                    status: 'JA_QUITADO',
                    erro: `Baixa já realizada no CA em ${pedido.baixaCaEm ? new Date(pedido.baixaCaEm).toLocaleDateString('pt-BR') : '?'} — R$ ${Number(pedido.baixaCaValor || 0).toFixed(2)}`
                });
                continue;
            }
            pedido._valorElegivel = Math.round(valorElegivel * 100) / 100;
            pedido._gruposPagamento = agruparPagamentos(pedido);
            pedidosElegiveis.push(pedido);
        }

        // Separar especiais (baixa local) de normais (baixa CA)
        const especiais = pedidosElegiveis.filter(p => p.especial);
        const normais = pedidosElegiveis.filter(p => !p.especial);

        // ═══ ESPECIAIS → Baixa local no app ═══
        for (const pedido of especiais) {
            const clienteNome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A';
            const motorista = pedido.embarque?.responsavel?.nome || 'N/I';

            try {
                // Buscar ContaReceber + Parcelas locais
                let contaReceber = await prisma.contaReceber.findUnique({
                    where: { pedidoId: pedido.id },
                    include: { parcelas: true }
                });

                if (!contaReceber) {
                    // Auto-criar ContaReceber quando ausente (pedido especial sem conta local)
                    const valorTotal = pedido.itens?.reduce((s, i) => s + (i.valor * i.quantidade), 0) || pedido._valorElegivel;
                    const now = new Date();
                    contaReceber = await prisma.contaReceber.create({
                        data: {
                            pedidoId: pedido.id,
                            clienteId: pedido.clienteId,
                            origem: 'ESPECIAL',
                            valorTotal: Math.round(valorTotal * 100) / 100,
                            status: 'ABERTO',
                            parcelas: {
                                create: [{
                                    numeroParcela: 1,
                                    valor: Math.round(valorTotal * 100) / 100,
                                    dataVencimento: pedido.primeiroVencimento || now,
                                    status: 'PENDENTE',
                                }]
                            }
                        },
                        include: { parcelas: true }
                    });
                    console.log(`[Caixa] Auto-criada ContaReceber para pedido especial #${pedido.numero}`);
                }

                const parcelasElegiveis = contaReceber.parcelas.filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO');

                if (parcelasElegiveis.length === 0) {
                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: clienteNome,
                        tipo: 'ESPECIAL',
                        status: 'JA_QUITADO',
                        erro: 'Todas as parcelas já estão pagas'
                    });
                    continue;
                }

                // Detalhar pagamentos por tipo
                const totalParcelas = parcelasElegiveis.reduce((s, p) => s + Number(p.valor), 0);
                const detalhePgtos = Object.entries(pedido._gruposPagamento)
                    .map(([metodo, g]) => `${g.formaNome}: R$ ${g.valor.toFixed(2)}`)
                    .join(', ');
                const isParcial = pedido._valorElegivel < totalParcelas;

                let obsComplemento = ` | Pgto: ${detalhePgtos}`;
                if (isParcial) {
                    const outrasFormas = pedido.pagamentosReais
                        .filter(p => {
                            if (p.escritorioResponsavel || p.vendedorResponsavelId) return true;
                            const n = (p.formaPagamentoNome || '').toLowerCase();
                            return !n.includes('dinheiro') && !n.includes('pix');
                        })
                        .map(p => `${p.formaPagamentoNome}: R$ ${Number(p.valor).toFixed(2)}${p.vendedorResponsavelId ? ' (vendedor)' : ''}${p.escritorioResponsavel ? ' (escritório)' : ''}`)
                        .join(', ');
                    obsComplemento += ` | Baixa parcial (R$ ${pedido._valorElegivel.toFixed(2)} de R$ ${totalParcelas.toFixed(2)})`;
                    if (outrasFormas) obsComplemento += ` | Restante: ${outrasFormas}`;
                }

                const obs = `Motorista: ${motorista} | Caixa: ${dataPgto} | Solicitante: ${solicitante?.nome || req.user.id}${obsComplemento}`;

                // Dar baixa nas parcelas pelo valor total elegível (dinheiro + pix)
                await prisma.$transaction(async (tx) => {
                    let restante = pedido._valorElegivel;
                    for (const parcela of parcelasElegiveis) {
                        const valParcela = Number(parcela.valor);
                        if (restante <= 0) break;

                        const valorPagar = Math.min(restante, valParcela);
                        await tx.parcela.update({
                            where: { id: parcela.id },
                            data: {
                                status: 'PAGO',
                                valorPago: Math.round(valorPagar * 100) / 100,
                                formaPagamento: detalhePgtos,
                                dataPagamento: new Date(dataPgto + 'T12:00:00-03:00'),
                                baixadoPorId: req.user.id,
                                observacao: obs
                            }
                        });
                        restante -= valorPagar;
                    }

                    // Recalcular status da conta
                    const todasParcelas = await tx.parcela.findMany({
                        where: { contaReceberId: contaReceber.id }
                    });
                    const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
                    const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;
                    const total = todasParcelas.length;

                    let novoStatus;
                    if (pagas + canceladas >= total) novoStatus = 'QUITADO';
                    else if (pagas > 0) novoStatus = 'PARCIAL';
                    else novoStatus = 'ABERTO';

                    await tx.contaReceber.update({
                        where: { id: contaReceber.id },
                        data: { status: novoStatus }
                    });

                }, { timeout: 20000, maxWait: 10000 });

                // Log de histórico FORA da transação — um log lento/falho nunca pode
                // derrubar (rollback) uma baixa já efetivada.
                try {
                    await prisma.atendimento.create({
                        data: {
                            tipo: 'FINANCEIRO',
                            observacao: `Baixa caixa (especial) - R$ ${pedido._valorElegivel.toFixed(2)} (${detalhePgtos})${isParcial ? ' — PARCIAL' : ''} | ${obs}`,
                            clienteId: pedido.cliente.UUID,
                            idVendedor: req.user.id,
                            pedidoId: pedido.id
                        }
                    });
                } catch (logErr) {
                    console.error('[caixa baixa-lote] falha no log (baixa já efetivada):', logErr.message);
                }

                const valorTotal = parcelasElegiveis.reduce((s, p) => s + Number(p.valor), 0);
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: 'ESPECIAL',
                    status: 'OK',
                    valor: Math.round(valorTotal * 100) / 100,
                    parcelas: parcelasElegiveis.length
                });

            } catch (err) {
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: 'ESPECIAL',
                    status: 'ERRO',
                    erro: err.message
                });
            }
        }

        // ═══ NORMAIS → Baixa no Conta Azul via API ═══
        let contaCaixinha = null;
        if (normais.length > 0) {
            try {
                contaCaixinha = await contaAzulService.buscarContaCaixinha();
            } catch (err) {
                // Marcar todos os normais como erro
                for (const pedido of normais) {
                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A',
                        tipo: 'CA',
                        status: 'ERRO',
                        erro: `Erro ao buscar conta Caixinha no CA: ${err.message}`
                    });
                }
            }
        }

        if (contaCaixinha && normais.length > 0) {
            for (const pedido of normais) {
                const clienteNome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A';
                const motorista = pedido.embarque?.responsavel?.nome || 'N/I';

                try {
                    if (!pedido.idVendaContaAzul) {
                        resultados.push({
                            pedidoId: pedido.id,
                            numero: pedido.numero,
                            cliente: clienteNome,
                            tipo: 'CA',
                            status: 'ERRO',
                            erro: 'Pedido sem venda no Conta Azul (idVendaContaAzul ausente)'
                        });
                        continue;
                    }

                    const dataVendaStr = pedido.dataVenda
                        ? new Date(pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
                        : dataPgto;

                    const parcela = await contaAzulService.encontrarParcelaDeVenda(
                        pedido.cliente.UUID,
                        pedido.idVendaContaAzul,
                        dataVendaStr
                    );

                    if (!parcela) {
                        resultados.push({
                            pedidoId: pedido.id,
                            numero: pedido.numero,
                            cliente: clienteNome,
                            tipo: 'CA',
                            status: 'ERRO',
                            erro: `Parcela não encontrada no CA para venda ${pedido.idVendaContaAzul}`
                        });
                        continue;
                    }

                    if (parcela.status === 'QUITADO' || parcela.status === 'RECEBIDO') {
                        resultados.push({
                            pedidoId: pedido.id,
                            numero: pedido.numero,
                            cliente: clienteNome,
                            tipo: 'CA',
                            status: 'JA_QUITADO',
                            erro: 'Parcela já quitada no CA'
                        });
                        continue;
                    }

                    // Separar: DINHEIRO → baixa (caixinha), PIX/Cartão → alterar condição ou baixa com desconto
                    const grupos = pedido._gruposPagamento;
                    const detalhePgtos = Object.entries(grupos)
                        .map(([metodo, g]) => `${g.formaNome}: R$ ${g.valor.toFixed(2)}`)
                        .join(', ');
                    const obsBase = `Motorista: ${motorista} | Caixa: ${dataPgto} | Solicitante: ${solicitante?.nome || req.user.id} | Pgto: ${detalhePgtos}`;

                    // Calcular devolução antes de qualquer baixa: diferença entre parcela CA e valor recebido
                    const parcelaPreBaixa = await contaAzulService.buscarParcelaDetalhe(parcela.id);
                    const valorParcelaTotal = Math.round((parcelaPreBaixa.composicao_valor?.valor_bruto || 0) * 100) / 100;
                    const valorDevolvido = Math.max(0, Math.round((valorParcelaTotal - pedido._valorElegivel) * 100) / 100);

                    const acoes = [];
                    let valorBaixado = 0;

                    // 1. DINHEIRO → criar baixa no CA (caixinha)
                    if (grupos['DINHEIRO']) {
                        const valorDinheiro = Math.round(grupos['DINHEIRO'].valor * 100) / 100;
                        const formasNaoDinheiro = Object.entries(grupos).filter(([m]) => m !== 'DINHEIRO');
                        // Se não há outras formas de pagamento, incluir desconto de devolução aqui mesmo
                        const descontoDinheiro = formasNaoDinheiro.length === 0 ? valorDevolvido : 0;
                        const baixaPayload = {
                            data_pagamento: dataPgto,
                            composicao_valor: {
                                valor_bruto: valorDinheiro,
                                multa: 0, juros: 0, desconto: descontoDinheiro, taxa: 0
                            },
                            conta_financeira: contaCaixinha.id,
                            metodo_pagamento: 'DINHEIRO',
                            observacao: obsBase
                        };
                        await contaAzulService.criarBaixa(parcela.id, baixaPayload);
                        acoes.push(`Baixa dinheiro: R$ ${valorDinheiro.toFixed(2)}${descontoDinheiro > 0 ? ` + Dev: R$ ${descontoDinheiro.toFixed(2)}` : ''}`);
                        valorBaixado = valorDinheiro;
                    }

                    // 2. Formas não-dinheiro (PIX, Cartão)
                    // Com devolução → criar baixa com desconto para fechar a parcela residual
                    // Sem devolução → apenas alterar metodo_pagamento na parcela (sem baixar)
                    const formasCondicao = Object.entries(grupos).filter(([m]) => m !== 'DINHEIRO');
                    if (formasCondicao.length > 0) {
                        const [metodoMaior, grupoMaior] = formasCondicao.reduce((a, b) => b[1].valor > a[1].valor ? b : a);
                        const valorNaoDinheiro = Math.round(formasCondicao.reduce((s, [, g]) => s + g.valor, 0) * 100) / 100;
                        const detalheFormas = formasCondicao.map(([m, g]) => `${g.formaNome}: R$ ${g.valor.toFixed(2)}`).join(', ');

                        if (valorDevolvido > 0.01) {
                            // Devolução pendente: criar baixa com desconto que fecha o restante da parcela CA
                            await contaAzulService.criarBaixa(parcela.id, {
                                data_pagamento: dataPgto,
                                composicao_valor: {
                                    valor_bruto: valorNaoDinheiro,
                                    multa: 0, juros: 0, desconto: valorDevolvido, taxa: 0
                                },
                                conta_financeira: contaCaixinha.id,
                                metodo_pagamento: metodoMaior,
                                observacao: `${detalheFormas} | Dev: R$ ${valorDevolvido.toFixed(2)} | ${obsBase}`
                            });
                            acoes.push(`Baixa ${grupoMaior.formaNome} R$ ${valorNaoDinheiro.toFixed(2)} + Dev R$ ${valorDevolvido.toFixed(2)}`);
                        } else {
                            // Sem devolução: apenas alterar método na parcela
                            const parcelaAtual = await contaAzulService.buscarParcelaDetalhe(parcela.id);
                            await contaAzulService.atualizarParcela(parcela.id, {
                                versao: parcelaAtual.versao,
                                metodo_pagamento: metodoMaior,
                                nota: `${detalheFormas} | ${obsBase}`
                            });
                            acoes.push(`Condição alterada para ${grupoMaior.formaNome}: ${detalheFormas}`);
                        }
                    }

                    // Marcar localmente que a baixa foi realizada
                    await prisma.pedido.update({
                        where: { id: pedido.id },
                        data: {
                            baixaCaRealizada: true,
                            baixaCaValor: Math.round(pedido._valorElegivel * 100) / 100,
                            baixaCaEm: new Date()
                        }
                    });

                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: clienteNome,
                        tipo: 'CA',
                        status: 'OK',
                        valor: pedido._valorElegivel,
                        detalhe: acoes.join(' | ')
                    });

                } catch (err) {
                    const errMsg = err.response?.data?.message || err.response?.data
                        ? JSON.stringify(err.response?.data)
                        : err.message;
                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: clienteNome,
                        tipo: 'CA',
                        status: 'ERRO',
                        erro: errMsg
                    });
                }
            }
        }

        const ok = resultados.filter(r => r.status === 'OK').length;
        const erros = resultados.filter(r => r.status === 'ERRO').length;
        const jaQuitados = resultados.filter(r => r.status === 'JA_QUITADO').length;

        res.json({
            message: `Baixa: ${ok} OK, ${erros} erro(s), ${jaQuitados} já quitado(s)`,
            resultados,
            contaCaixinha: contaCaixinha ? { id: contaCaixinha.id, nome: contaCaixinha.nome } : null
        });

    } catch (error) {
        console.error('Erro ao quitar:', error);
        res.status(500).json({ error: 'Erro ao processar quitação.' });
    }
});

module.exports = router;
