/**
 * Contas a Pagar — Fase 1 do módulo financeiro.
 * Espelha as convenções de routes/contasReceber.js (permissões, ledger, Decimal).
 *
 * Permissões:
 *   ver      → admin ou Pode_Acessar_Contas_Pagar
 *   escrever → admin ou Pode_Baixar_Contas_Pagar (criar, editar, baixar, cancelar, estornar, reenviar)
 */

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const contasPagarCaSyncService = require('../services/contasPagarCaSyncService');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcesso = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Contas_Pagar) {
        return res.status(403).json({ error: 'Sem permissão para acessar contas a pagar.' });
    }
    next();
};

const checkEscrita = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Baixar_Contas_Pagar) {
        return res.status(403).json({ error: 'Sem permissão para alterar contas a pagar.' });
    }
    next();
};

const num = (v) => (v == null ? null : Number(v));
const round2 = (v) => Math.round(Number(v) * 100) / 100;

const formatarPagamento = (pg) => ({
    id: pg.id,
    valorPago: num(pg.valorPago),
    juros: num(pg.juros) || 0,
    multa: num(pg.multa) || 0,
    desconto: num(pg.desconto) || 0,
    formaPagamento: pg.formaPagamento,
    dataPagamento: pg.dataPagamento,
    origem: pg.origem,
    estornado: pg.estornado
});

const formatarConta = (c) => ({
    id: c.id,
    descricao: c.descricao,
    categoria: c.categoria,
    numeroNota: c.numeroNota,
    valorTotal: num(c.valorTotal),
    status: c.status,
    statusEnvioCA: c.statusEnvioCA,
    erroEnvioCA: c.erroEnvioCA,
    origem: c.origem,
    observacoes: c.observacoes,
    competencia: c.competencia,
    fornecedor: c.fornecedor
        ? { id: c.fornecedor.id, razaoSocial: c.fornecedor.razaoSocial, nomeFantasia: c.fornecedor.nomeFantasia }
        : null,
    parcelas: (c.parcelas || []).map((p) => ({
        id: p.id,
        numeroParcela: p.numeroParcela,
        valor: num(p.valor),
        dataVencimento: p.dataVencimento,
        status: p.status,
        dataPagamento: p.dataPagamento,
        valorPago: num(p.valorPago),
        baixadoViaCA: p.baixadoViaCA,
        pagamentos: (p.pagamentos || []).map(formatarPagamento)
    }))
});

// Saldo restante da parcela considerando ledger não estornado (pago + desconto)
const saldoParcela = (parcela) => {
    const pagamentos = (parcela.pagamentos || []).filter((pg) => !pg.estornado);
    const quitado = pagamentos.reduce((s, pg) => s + Number(pg.valorPago) + Number(pg.desconto), 0);
    return Math.max(0, Number(parcela.valor) - quitado);
};

// ── GET /categorias — categorias de despesa do CA (cache 1h; CA fora → []) ──
router.get('/categorias', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const categorias = await contasPagarCaSyncService.listarCategoriasDespesaSeguro();
        res.json(categorias);
    } catch (error) {
        console.error('Erro ao listar categorias de despesa:', error);
        res.json([]); // frontend tem fallback
    }
});

// ── GET / — listar contas com KPIs ──
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { busca, status, categoria, mes } = req.query;

        // Mês de referência (default: mês corrente)
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        let ano = hoje.getFullYear();
        let mesIdx = hoje.getMonth();
        if (mes && /^\d{4}-\d{2}$/.test(mes)) {
            ano = Number(mes.split('-')[0]);
            mesIdx = Number(mes.split('-')[1]) - 1;
        }
        const inicioMes = new Date(ano, mesIdx, 1);
        const fimMes = new Date(ano, mesIdx + 1, 0, 23, 59, 59, 999);

        const where = {
            parcelas: { some: { dataVencimento: { gte: inicioMes, lte: fimMes } } }
        };
        if (status) where.status = status;
        if (categoria) where.categoria = { equals: categoria, mode: 'insensitive' };
        if (busca) {
            where.OR = [
                { descricao: { contains: busca, mode: 'insensitive' } },
                { numeroNota: { contains: busca, mode: 'insensitive' } },
                { fornecedor: { razaoSocial: { contains: busca, mode: 'insensitive' } } },
                { fornecedor: { nomeFantasia: { contains: busca, mode: 'insensitive' } } }
            ];
        }

        const contas = await prisma.contaPagar.findMany({
            where,
            include: {
                fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
                parcelas: {
                    orderBy: { numeroParcela: 'asc' },
                    include: { pagamentos: { orderBy: { dataPagamento: 'asc' } } }
                }
            },
            orderBy: { criadoEm: 'desc' }
        });

        // ── KPIs ──
        const em7dias = new Date(hoje);
        em7dias.setDate(em7dias.getDate() + 7);
        em7dias.setHours(23, 59, 59, 999);

        // Vencidas: TODAS as parcelas abertas vencidas, independente do mês filtrado
        const parcelasVencidas = await prisma.parcelaPagar.findMany({
            where: {
                status: { in: ['PENDENTE', 'PARCIAL'] },
                dataVencimento: { lt: hoje },
                contaPagar: { status: { notIn: ['CANCELADO'] } }
            },
            include: { pagamentos: { where: { estornado: false } } }
        });
        const vencidas = {
            valor: round2(parcelasVencidas.reduce((s, p) => s + saldoParcela(p), 0)),
            qtd: parcelasVencidas.length
        };

        // Próximos 7 dias: parcelas abertas com vencimento entre hoje e +7d (independente do mês)
        const parcelasProx7 = await prisma.parcelaPagar.findMany({
            where: {
                status: { in: ['PENDENTE', 'PARCIAL'] },
                dataVencimento: { gte: hoje, lte: em7dias },
                contaPagar: { status: { notIn: ['CANCELADO'] } }
            },
            include: { pagamentos: { where: { estornado: false } } }
        });
        const proximos7 = {
            valor: round2(parcelasProx7.reduce((s, p) => s + saldoParcela(p), 0)),
            qtd: parcelasProx7.length
        };

        // Em aberto no mês / pago no mês — sobre o conjunto filtrado por mês
        let abertoValor = 0, abertoQtd = 0;
        let pagoValor = 0;
        const parcelasComPgtoNoMes = new Set();
        for (const conta of contas) {
            if (conta.status === 'CANCELADO') continue;
            for (const p of conta.parcelas) {
                const venc = new Date(p.dataVencimento);
                const noMes = venc >= inicioMes && venc <= fimMes;
                if (noMes && (p.status === 'PENDENTE' || p.status === 'PARCIAL')) {
                    abertoValor += saldoParcela(p);
                    abertoQtd++;
                }
                for (const pg of p.pagamentos) {
                    if (pg.estornado) continue;
                    const dp = new Date(pg.dataPagamento);
                    if (dp >= inicioMes && dp <= fimMes) {
                        pagoValor += Number(pg.valorPago) + Number(pg.juros) + Number(pg.multa);
                        parcelasComPgtoNoMes.add(p.id);
                    }
                }
            }
        }

        res.json({
            kpis: {
                vencidas,
                proximos7,
                abertoMes: { valor: round2(abertoValor), qtd: abertoQtd },
                pagoMes: { valor: round2(pagoValor), qtd: parcelasComPgtoNoMes.size }
            },
            contas: contas.map(formatarConta)
        });
    } catch (error) {
        console.error('Erro ao listar contas a pagar:', error);
        res.status(500).json({ error: 'Erro ao listar contas a pagar.' });
    }
});

// ── Validação compartilhada de parcelas do body ──
const validarParcelasBody = (parcelas) => {
    if (!Array.isArray(parcelas) || parcelas.length === 0) {
        return 'Informe ao menos uma parcela.';
    }
    for (const p of parcelas) {
        const valor = Number(p?.valor);
        if (!Number.isFinite(valor) || valor <= 0) return 'Toda parcela precisa de um valor maior que zero.';
        if (!p?.dataVencimento || isNaN(new Date(p.dataVencimento).getTime())) return 'Toda parcela precisa de uma data de vencimento válida.';
    }
    return null;
};

const parseVencimento = (v) => {
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00-03:00`) : new Date(s);
};

// ── POST / — criar conta a pagar ──
router.post('/', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const {
            fornecedorId, descricao, categoria, categoriaCaId, numeroNota,
            competencia, observacoes, enviarCA, parcelas
        } = req.body;

        if (!descricao?.trim()) return res.status(400).json({ error: 'Informe a descrição da conta.' });
        const erroParcelas = validarParcelasBody(parcelas);
        if (erroParcelas) return res.status(400).json({ error: erroParcelas });

        if (fornecedorId) {
            const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
            if (!fornecedor) return res.status(400).json({ error: 'Fornecedor não encontrado.' });
        }
        if (enviarCA && !fornecedorId) {
            return res.status(400).json({ error: 'Para enviar ao Conta Azul é obrigatório informar o fornecedor.' });
        }

        const valorTotal = round2(parcelas.reduce((s, p) => s + Number(p.valor), 0));

        const conta = await prisma.contaPagar.create({
            data: {
                fornecedorId: fornecedorId || null,
                descricao: descricao.trim(),
                categoria: categoria?.trim() || null,
                categoriaCaId: categoriaCaId || null,
                numeroNota: numeroNota?.trim() || null,
                competencia: competencia ? parseVencimento(competencia) : null,
                observacoes: observacoes?.trim() || null,
                origem: 'MANUAL',
                valorTotal,
                status: 'ABERTO',
                statusEnvioCA: enviarCA ? 'ENVIAR' : 'NAO_ENVIAR',
                criadoPorId: req.user.id,
                parcelas: {
                    create: parcelas.map((p, i) => ({
                        numeroParcela: i + 1,
                        valor: round2(p.valor),
                        dataVencimento: parseVencimento(p.dataVencimento)
                    }))
                }
            },
            include: {
                fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
                parcelas: { orderBy: { numeroParcela: 'asc' }, include: { pagamentos: true } }
            }
        });

        res.status(201).json({ message: 'Conta a pagar criada!', conta: formatarConta(conta) });
    } catch (error) {
        console.error('Erro ao criar conta a pagar:', error);
        res.status(500).json({ error: 'Erro ao criar conta a pagar.' });
    }
});

// ── PUT /:id — editar conta (campos e parcelas não pagas) ──
router.put('/:id', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const conta = await prisma.contaPagar.findUnique({
            where: { id: req.params.id },
            include: { parcelas: { include: { pagamentos: { where: { estornado: false } } }, orderBy: { numeroParcela: 'asc' } } }
        });
        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status === 'QUITADO' || conta.status === 'CANCELADO') {
            return res.status(400).json({ error: `Conta ${conta.status === 'QUITADO' ? 'quitada' : 'cancelada'} não pode ser editada.` });
        }

        const {
            fornecedorId, descricao, categoria, categoriaCaId, numeroNota,
            competencia, observacoes, parcelas
        } = req.body;

        if (fornecedorId) {
            const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
            if (!fornecedor) return res.status(400).json({ error: 'Fornecedor não encontrado.' });
        }

        const dadosConta = {};
        if (descricao !== undefined) {
            if (!descricao?.trim()) return res.status(400).json({ error: 'Descrição não pode ficar vazia.' });
            dadosConta.descricao = descricao.trim();
        }
        if (fornecedorId !== undefined) dadosConta.fornecedorId = fornecedorId || null;
        if (categoria !== undefined) dadosConta.categoria = categoria?.trim() || null;
        if (categoriaCaId !== undefined) dadosConta.categoriaCaId = categoriaCaId || null;
        if (numeroNota !== undefined) dadosConta.numeroNota = numeroNota?.trim() || null;
        if (competencia !== undefined) dadosConta.competencia = competencia ? parseVencimento(competencia) : null;
        if (observacoes !== undefined) dadosConta.observacoes = observacoes?.trim() || null;

        // Edição de parcelas: só as NÃO pagas, e só antes do envio ao CA
        let novoValorTotal = null;
        if (Array.isArray(parcelas)) {
            if (!['NAO_ENVIAR', 'ENVIAR', 'ERRO'].includes(conta.statusEnvioCA)) {
                return res.status(400).json({ error: 'Conta já enviada (ou em envio) ao Conta Azul — as parcelas não podem mais ser alteradas por aqui.' });
            }
            const erroParcelas = validarParcelasBody(parcelas);
            if (erroParcelas) return res.status(400).json({ error: erroParcelas });

            const fixas = conta.parcelas.filter((p) => p.status === 'PAGO' || p.status === 'PARCIAL' || p.pagamentos.length > 0);
            const editaveisIds = new Set(conta.parcelas.filter((p) => !fixas.some((f) => f.id === p.id)).map((p) => p.id));

            await prisma.$transaction(async (tx) => {
                // Remove parcelas editáveis que não vieram no payload
                const idsEnviados = new Set(parcelas.filter((p) => p.id).map((p) => p.id));
                for (const id of editaveisIds) {
                    if (!idsEnviados.has(id)) await tx.parcelaPagar.delete({ where: { id } });
                }
                // Atualiza/cria
                let proximoNumero = fixas.length;
                for (const p of parcelas) {
                    if (p.id && fixas.some((f) => f.id === p.id)) continue; // parcela paga: intocável
                    proximoNumero++;
                    if (p.id && editaveisIds.has(p.id)) {
                        await tx.parcelaPagar.update({
                            where: { id: p.id },
                            data: { numeroParcela: proximoNumero, valor: round2(p.valor), dataVencimento: parseVencimento(p.dataVencimento) }
                        });
                    } else if (!p.id) {
                        await tx.parcelaPagar.create({
                            data: {
                                contaPagarId: conta.id,
                                numeroParcela: proximoNumero,
                                valor: round2(p.valor),
                                dataVencimento: parseVencimento(p.dataVencimento)
                            }
                        });
                    }
                }
                const todas = await tx.parcelaPagar.findMany({ where: { contaPagarId: conta.id, status: { not: 'CANCELADO' } } });
                novoValorTotal = round2(todas.reduce((s, p) => s + Number(p.valor), 0));
                await tx.contaPagar.update({
                    where: { id: conta.id },
                    data: { ...dadosConta, valorTotal: novoValorTotal }
                });
            });
        } else if (Object.keys(dadosConta).length > 0) {
            await prisma.contaPagar.update({ where: { id: conta.id }, data: dadosConta });
        }

        const atualizada = await prisma.contaPagar.findUnique({
            where: { id: conta.id },
            include: {
                fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
                parcelas: { orderBy: { numeroParcela: 'asc' }, include: { pagamentos: { orderBy: { dataPagamento: 'asc' } } } }
            }
        });
        res.json({ message: 'Conta atualizada!', conta: formatarConta(atualizada) });
    } catch (error) {
        console.error('Erro ao editar conta a pagar:', error);
        res.status(500).json({ error: 'Erro ao editar conta a pagar.' });
    }
});

// ── POST /:id/cancelar ──
router.post('/:id/cancelar', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const conta = await prisma.contaPagar.findUnique({
            where: { id: req.params.id },
            include: { parcelas: { include: { pagamentos: { where: { estornado: false } } } } }
        });
        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status === 'CANCELADO') return res.status(400).json({ error: 'Conta já está cancelada.' });

        const temPagamento = conta.parcelas.some((p) => p.pagamentos.length > 0);
        if (temPagamento) {
            return res.status(400).json({ error: 'Conta tem pagamento registrado. Estorne os pagamentos antes de cancelar.' });
        }

        await prisma.$transaction([
            prisma.parcelaPagar.updateMany({
                where: { contaPagarId: conta.id, status: { not: 'PAGO' } },
                data: { status: 'CANCELADO' }
            }),
            prisma.contaPagar.update({
                where: { id: conta.id },
                data: { status: 'CANCELADO', statusEnvioCA: conta.statusEnvioCA === 'ENVIAR' ? 'NAO_ENVIAR' : conta.statusEnvioCA }
            })
        ]);

        if (['ENVIADO', 'AGUARDANDO_PROTOCOLO', 'ENVIANDO'].includes(conta.statusEnvioCA)) {
            console.warn(`[ContasPagar] ⚠️ Conta ${conta.id} cancelada localmente mas já enviada ao CA — remover manualmente no Conta Azul se necessário.`);
        }

        res.json({ message: 'Conta cancelada com sucesso!' });
    } catch (error) {
        console.error('Erro ao cancelar conta a pagar:', error);
        res.status(500).json({ error: 'Erro ao cancelar conta a pagar.' });
    }
});

// ── POST /:id/reenviar-ca — só quando statusEnvioCA = ERRO ──
router.post('/:id/reenviar-ca', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const conta = await prisma.contaPagar.findUnique({ where: { id: req.params.id } });
        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.statusEnvioCA !== 'ERRO') {
            return res.status(400).json({ error: 'Só é possível reenviar contas com erro de envio.' });
        }
        if (conta.status === 'CANCELADO') return res.status(400).json({ error: 'Conta cancelada não pode ser reenviada.' });

        await prisma.contaPagar.update({
            where: { id: conta.id },
            data: { statusEnvioCA: 'ENVIAR', erroEnvioCA: null }
        });
        res.json({ message: 'Conta recolocada na fila de envio ao Conta Azul.' });
    } catch (error) {
        console.error('Erro ao reenviar conta ao CA:', error);
        res.status(500).json({ error: 'Erro ao reenviar conta ao CA.' });
    }
});

// ── POST /:id/parcelas/:parcelaId/baixar — baixa manual (ledger) ──
router.post('/:id/parcelas/:parcelaId/baixar', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const { id, parcelaId } = req.params;
        const { dataPagamento, valorPago, juros, multa, desconto, formaPagamento, observacao } = req.body;

        const parcela = await prisma.parcelaPagar.findUnique({
            where: { id: parcelaId },
            include: { contaPagar: true, pagamentos: { where: { estornado: false } } }
        });
        if (!parcela || parcela.contaPagarId !== id) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (parcela.status === 'PAGO') return res.status(400).json({ error: 'Parcela já está paga. Estorne antes de lançar um novo pagamento.' });
        if (parcela.status === 'CANCELADO') return res.status(400).json({ error: 'Parcela cancelada.' });
        if (parcela.contaPagar.status === 'CANCELADO') return res.status(400).json({ error: 'Conta cancelada.' });

        const vPago = Math.max(0, Number(valorPago) || 0);
        const vJuros = Math.max(0, Number(juros) || 0);
        const vMulta = Math.max(0, Number(multa) || 0);
        const vDesconto = Math.max(0, Number(desconto) || 0);
        if (vPago <= 0 && vDesconto <= 0) {
            return res.status(400).json({ error: 'Informe um valor pago ou um desconto.' });
        }

        const saldo = saldoParcela(parcela);
        if (vPago + vDesconto > saldo + 0.01) {
            return res.status(400).json({ error: `Valor informado (R$ ${(vPago + vDesconto).toFixed(2)}) é maior que o saldo restante (R$ ${saldo.toFixed(2)}). Juros/multa não entram nesse limite.` });
        }

        const dataPgto = dataPagamento ? parseVencimento(dataPagamento) : new Date();

        let resultado;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcelaPagar.create({
                data: {
                    parcelaPagarId: parcelaId,
                    valorPago: round2(vPago),
                    juros: round2(vJuros),
                    multa: round2(vMulta),
                    desconto: round2(vDesconto),
                    formaPagamento: formaPagamento || null,
                    dataPagamento: dataPgto,
                    observacao: observacao?.trim() || null,
                    origem: 'MANUAL',
                    registradoPorId: req.user.id
                }
            });
            resultado = await contasPagarCaSyncService.recalcularParcelaEConta(tx, parcelaId);
        });

        res.json({
            message: resultado?.statusParcela === 'PAGO' ? 'Parcela quitada com sucesso!' : 'Baixa parcial registrada com sucesso!',
            novoStatusParcela: resultado?.statusParcela,
            novoStatusConta: resultado?.statusConta
        });
    } catch (error) {
        console.error('Erro ao baixar parcela a pagar:', error);
        res.status(500).json({ error: 'Erro ao dar baixa na parcela.' });
    }
});

// ── POST /:id/parcelas/:parcelaId/estorno — estorna um pagamento do ledger ──
router.post('/:id/parcelas/:parcelaId/estorno', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const { id, parcelaId } = req.params;
        const { pagamentoId } = req.body;
        if (!pagamentoId) return res.status(400).json({ error: 'Informe o pagamento a estornar.' });

        const pagamento = await prisma.pagamentoParcelaPagar.findUnique({ where: { id: pagamentoId } });
        if (!pagamento || pagamento.parcelaPagarId !== parcelaId) {
            return res.status(404).json({ error: 'Pagamento não encontrado.' });
        }
        if (pagamento.estornado) return res.status(400).json({ error: 'Este pagamento já foi estornado.' });
        if (pagamento.origem === 'CA') {
            return res.status(400).json({ error: 'Esta baixa veio do Conta Azul. Exclua a baixa lá no CA (o app não estorna baixas do CA para não divergir do ERP).' });
        }

        const parcela = await prisma.parcelaPagar.findUnique({ where: { id: parcelaId } });
        if (!parcela || parcela.contaPagarId !== id) return res.status(404).json({ error: 'Parcela não encontrada.' });

        let resultado;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcelaPagar.update({
                where: { id: pagamentoId },
                data: { estornado: true, estornadoEm: new Date(), estornadoPorId: req.user.id }
            });
            resultado = await contasPagarCaSyncService.recalcularParcelaEConta(tx, parcelaId);
        });

        res.json({
            message: 'Pagamento estornado com sucesso!',
            novoStatusParcela: resultado?.statusParcela,
            novoStatusConta: resultado?.statusConta
        });
    } catch (error) {
        console.error('Erro ao estornar pagamento de parcela a pagar:', error);
        res.status(500).json({ error: 'Erro ao estornar pagamento.' });
    }
});

module.exports = router;
