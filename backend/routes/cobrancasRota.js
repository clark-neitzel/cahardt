const express = require('express');
const router = express.Router();
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const verificarAuth = require('../middlewares/authMiddleware');

// ─────────────────────────────────────────────────────────────────────────
// COBRANÇA EM ROTA
// O escritório pendura títulos (parcelas em aberto) na carga; o motorista/vendedor
// cobra na rua (total ou parcial) ou marca "não consegui cobrar" (só registro).
// NADA aqui baixa a parcela — a baixa oficial sai pelo box do Caixa Diário
// (POST /api/caixa/cobrancas-rota/baixar), no mesmo ritual da Baixa CA.
// ─────────────────────────────────────────────────────────────────────────

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

// Quem cobra na rua (motorista/entregador/vendedor autorizado)
const checkCobrador = async (req, res, next) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;
        if (perms.admin || perms.Pode_Cobrar_Titulo_Rota) return next();
        return res.status(403).json({ error: 'Sem permissão para cobrar títulos em rota.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// Quem monta a carga (escritório/expedição)
const checkEscritorio = async (req, res, next) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;
        if (perms.admin || perms.Pode_Acessar_Embarque) return next();
        return res.status(403).json({ error: 'Sem permissão para gerenciar cobranças da carga.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// Busca e listagem podem ser usadas tanto pelo escritório quanto pelo cobrador
const checkEscritorioOuCobrador = async (req, res, next) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;
        if (perms.admin || perms.Pode_Acessar_Embarque || perms.Pode_Cobrar_Titulo_Rota) return next();
        return res.status(403).json({ error: 'Sem permissão para consultar cobranças em rota.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

router.use(verificarAuth);

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const saldoParcela = (p) =>
    round2(Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0));

const nomeClienteConta = (contaReceber) =>
    contaReceber?.cliente?.NomeFantasia || contaReceber?.cliente?.Nome || 'Cliente';

// Formata uma CobrancaRota (com includes) para o frontend
const formatarCobranca = (c) => ({
    id: c.id,
    status: c.status,
    parcelaId: c.parcelaId,
    numeroParcela: c.parcela?.numeroParcela,
    totalParcelas: c.parcela?.contaReceber?.parcelas?.length || null,
    valorParcela: c.parcela ? Number(c.parcela.valor) : null,
    saldoParcela: c.parcela ? saldoParcela(c.parcela) : null,
    dataVencimento: c.parcela?.dataVencimento || null,
    statusParcela: c.parcela?.status || null,
    clienteNome: nomeClienteConta(c.parcela?.contaReceber),
    clienteId: c.parcela?.contaReceber?.clienteId || null,
    pedidoNumero: c.parcela?.contaReceber?.pedido?.numero || null,
    embarqueId: c.embarqueId,
    embarqueNumero: c.embarque?.numero || null,
    valorCobrado: c.valorCobrado != null ? Number(c.valorCobrado) : null,
    formaPagamentoNome: c.formaPagamentoNome,
    observacao: c.observacao,
    responsavelTipo: c.responsavelTipo,
    cobradoPorNome: c.cobradoPor?.nome || null,
    cobradoEm: c.cobradoEm,
    dataReferencia: c.dataReferencia,
    baixadoEm: c.baixadoEm,
    criadoEm: c.createdAt
});

const INCLUDE_PADRAO = {
    parcela: {
        include: {
            contaReceber: {
                include: {
                    cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, idVendedor: true } },
                    pedido: { select: { numero: true } },
                    parcelas: { select: { id: true } }
                }
            }
        }
    },
    embarque: { select: { id: true, numero: true, responsavelId: true } },
    cobradoPor: { select: { id: true, nome: true } }
};

// Histórico da carga SEM subir a versão: cobrança não muda a folha impressa
// (romaneio/separação), então não deve disparar o aviso de "reimprima".
const registrarLogCarga = async (embarqueId, acao, alteracoes, userId) => {
    try {
        const emb = await prisma.embarque.findUnique({ where: { id: embarqueId }, select: { versao: true } });
        const usuario = await prisma.vendedor.findUnique({ where: { id: userId }, select: { nome: true } });
        await prisma.embarqueVersaoLog.create({
            data: {
                embarqueId,
                versao: emb?.versao || 1,
                acao,
                alteracoes: alteracoes || {},
                alteradoPorId: userId || null,
                alteradoPorNome: usuario?.nome || null
            }
        });
    } catch (e) {
        console.error(`[CobrancaRota] Falha ao registrar histórico da carga (${acao}) — operação principal NÃO afetada:`, e.message);
    }
};

// ── GET /parcelas-abertas?q=nome — busca títulos em aberto por cliente ──
// Usada pelo escritório (inserir na carga) e pelo cobrador (busca livre na rua).
router.get('/parcelas-abertas', checkEscritorioOuCobrador, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) return res.json([]);

        const parcelas = await prisma.parcela.findMany({
            where: {
                status: { in: ['PENDENTE', 'PARCIAL', 'VENCIDO'] },
                contaReceber: {
                    status: { in: ['ABERTO', 'PARCIAL'] },
                    cliente: {
                        OR: [
                            { NomeFantasia: { contains: q, mode: 'insensitive' } },
                            { Nome: { contains: q, mode: 'insensitive' } }
                        ]
                    }
                }
            },
            include: {
                contaReceber: {
                    include: {
                        cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                        pedido: { select: { numero: true } },
                        parcelas: { select: { id: true } }
                    }
                },
                cobrancasRota: {
                    where: { status: { in: ['PENDENTE', 'COBRADA'] } },
                    select: { id: true, status: true, embarque: { select: { numero: true } } }
                }
            },
            orderBy: { dataVencimento: 'asc' },
            take: 40
        });

        res.json(parcelas
            .filter(p => saldoParcela(p) > 0)
            .map(p => ({
                parcelaId: p.id,
                clienteNome: nomeClienteConta(p.contaReceber),
                pedidoNumero: p.contaReceber?.pedido?.numero || null,
                numeroParcela: p.numeroParcela,
                totalParcelas: p.contaReceber?.parcelas?.length || 1,
                valor: Number(p.valor),
                saldo: saldoParcela(p),
                dataVencimento: p.dataVencimento,
                status: p.status,
                vencida: p.dataVencimento ? new Date(p.dataVencimento) < new Date(hojeSP() + 'T00:00:00-03:00') : false,
                // Já está em outra rota? Bloqueia duplicar
                jaEmRota: p.cobrancasRota.length > 0,
                jaEmRotaEmbarque: p.cobrancasRota[0]?.embarque?.numero || null
            })));
    } catch (error) {
        console.error('[CobrancaRota] Erro na busca de parcelas abertas:', error);
        res.status(500).json({ error: 'Erro ao buscar títulos em aberto.' });
    }
});

// ── GET /embarque/:embarqueId — cobranças penduradas numa carga ──
router.get('/embarque/:embarqueId', checkEscritorioOuCobrador, async (req, res) => {
    try {
        const cobrancas = await prisma.cobrancaRota.findMany({
            where: { embarqueId: req.params.embarqueId },
            include: INCLUDE_PADRAO,
            orderBy: { createdAt: 'asc' }
        });
        res.json(cobrancas.map(formatarCobranca));
    } catch (error) {
        console.error('[CobrancaRota] Erro ao listar cobranças da carga:', error);
        res.status(500).json({ error: 'Erro ao listar cobranças da carga.' });
    }
});

// ── POST /embarque/:embarqueId — escritório pendura títulos na carga ──
router.post('/embarque/:embarqueId', checkEscritorio, async (req, res) => {
    try {
        const { parcelaIds } = req.body;
        const embarqueId = req.params.embarqueId;
        if (!Array.isArray(parcelaIds) || parcelaIds.length === 0) {
            return res.status(400).json({ error: 'Informe as parcelas a incluir na carga.' });
        }

        const embarque = await prisma.embarque.findUnique({ where: { id: embarqueId }, select: { id: true } });
        if (!embarque) return res.status(404).json({ error: 'Carga não encontrada.' });

        const parcelas = await prisma.parcela.findMany({
            where: { id: { in: parcelaIds } },
            include: {
                contaReceber: { include: { cliente: { select: { NomeFantasia: true, Nome: true } } } },
                cobrancasRota: { where: { status: { in: ['PENDENTE', 'COBRADA'] } }, select: { id: true } }
            }
        });

        const criadas = [];
        const recusadas = [];
        for (const p of parcelas) {
            if (!['PENDENTE', 'PARCIAL', 'VENCIDO'].includes(p.status) || saldoParcela(p) <= 0) {
                recusadas.push({ parcelaId: p.id, motivo: 'Parcela não está em aberto.' });
                continue;
            }
            if (p.cobrancasRota.length > 0) {
                recusadas.push({ parcelaId: p.id, motivo: 'Parcela já está em outra cobrança de rota.' });
                continue;
            }
            const nova = await prisma.cobrancaRota.create({
                data: { parcelaId: p.id, embarqueId, criadoPorId: req.user.id }
            });
            criadas.push({ id: nova.id, cliente: nomeClienteConta(p.contaReceber), valor: saldoParcela(p) });
        }

        if (criadas.length > 0) {
            await registrarLogCarga(embarqueId, 'COBRANCAS_ADICIONADAS', {
                cobrancas: criadas.map(c => ({ cliente: c.cliente, valor: c.valor }))
            }, req.user.id);
        }

        res.json({
            message: `${criadas.length} cobrança(s) adicionada(s) à carga.`,
            criadas: criadas.length,
            recusadas
        });
    } catch (error) {
        console.error('[CobrancaRota] Erro ao inserir cobranças na carga:', error);
        res.status(500).json({ error: 'Erro ao inserir cobranças na carga.' });
    }
});

// ── DELETE /:id — tirar cobrança da carga (só se ainda não cobrada) ──
router.delete('/:id', checkEscritorio, async (req, res) => {
    try {
        const cobranca = await prisma.cobrancaRota.findUnique({
            where: { id: req.params.id },
            include: INCLUDE_PADRAO
        });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        if (cobranca.status !== 'PENDENTE') {
            return res.status(400).json({ error: `Esta cobrança já foi trabalhada pelo motorista (${cobranca.status === 'BAIXADA' ? 'baixada no caixa' : cobranca.status === 'COBRADA' ? 'cobrada na rua' : 'marcada como não cobrada'}) e não pode ser removida.` });
        }

        await prisma.cobrancaRota.delete({ where: { id: req.params.id } });

        if (cobranca.embarqueId) {
            await registrarLogCarga(cobranca.embarqueId, 'COBRANCA_REMOVIDA', {
                cobrancas: [{ cliente: nomeClienteConta(cobranca.parcela?.contaReceber), valor: cobranca.parcela ? saldoParcela(cobranca.parcela) : null }]
            }, req.user.id);
        }

        res.status(204).send();
    } catch (error) {
        console.error('[CobrancaRota] Erro ao remover cobrança da carga:', error);
        res.status(500).json({ error: 'Erro ao remover cobrança da carga.' });
    }
});

// ── GET /minhas — cobranças do cobrador logado (pendentes das minhas cargas + trabalhadas hoje) ──
router.get('/minhas', checkCobrador, async (req, res) => {
    try {
        const hoje = hojeSP();
        const [pendentes, trabalhadasHoje] = await Promise.all([
            prisma.cobrancaRota.findMany({
                where: { status: 'PENDENTE', embarque: { responsavelId: req.user.id } },
                include: INCLUDE_PADRAO,
                orderBy: { createdAt: 'asc' }
            }),
            prisma.cobrancaRota.findMany({
                where: { cobradoPorId: req.user.id, dataReferencia: hoje },
                include: INCLUDE_PADRAO,
                orderBy: { cobradoEm: 'desc' }
            })
        ]);
        res.json({
            pendentes: pendentes.map(formatarCobranca),
            trabalhadasHoje: trabalhadasHoje.map(formatarCobranca)
        });
    } catch (error) {
        console.error('[CobrancaRota] Erro ao listar minhas cobranças:', error);
        res.status(500).json({ error: 'Erro ao listar suas cobranças.' });
    }
});

// Valida e aplica o registro de cobrança em campo sobre uma CobrancaRota PENDENTE
const registrarCobranca = async ({ cobranca, valor, formaPagamentoNome, observacao, userId }) => {
    const saldo = saldoParcela(cobranca.parcela);
    const v = round2(valor);
    if (!(v > 0)) return { erro: 'Informe o valor recebido.' };
    if (v > saldo + 0.01) return { erro: `Valor informado (R$ ${v.toFixed(2)}) é maior que o saldo do título (R$ ${saldo.toFixed(2)}).` };
    if (!formaPagamentoNome) return { erro: 'Informe a forma de pagamento.' };

    const atualizada = await prisma.cobrancaRota.update({
        where: { id: cobranca.id },
        data: {
            status: 'COBRADA',
            cobradoPorId: userId,
            cobradoEm: new Date(),
            dataReferencia: hojeSP(),
            valorCobrado: v,
            formaPagamentoNome,
            observacao: observacao || null
        },
        include: INCLUDE_PADRAO
    });

    // Histórico no cliente (best-effort, nunca derruba o registro)
    try {
        await prisma.atendimento.create({
            data: {
                tipo: 'FINANCEIRO',
                observacao: `Cobrança em rota: recebido R$ ${v.toFixed(2)} (${formaPagamentoNome}) da parcela ${cobranca.parcela.numeroParcela} — aguardando baixa no caixa${observacao ? ` | ${observacao}` : ''}`,
                clienteId: cobranca.parcela.contaReceber.clienteId,
                idVendedor: userId,
                pedidoId: cobranca.parcela.contaReceber.pedidoId || null
            }
        });
    } catch (logErr) {
        console.error('[CobrancaRota] Falha no histórico (cobrança já registrada):', logErr.message);
    }

    return { cobranca: atualizada };
};

// ── POST /avulsa/cobrar — busca livre: cobra um título na hora, sem carga ──
// DEVE vir ANTES de '/:id/cobrar': o Express casa na ordem de registro e '/:id/cobrar'
// engoliria esta rota com id='avulsa' (404 "Cobrança não encontrada").
router.post('/avulsa/cobrar', checkCobrador, async (req, res) => {
    try {
        const { parcelaId, valor, formaPagamentoNome, observacao } = req.body;
        if (!parcelaId) return res.status(400).json({ error: 'Informe a parcela.' });

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: {
                contaReceber: { include: { cliente: { select: { NomeFantasia: true, Nome: true } } } },
                cobrancasRota: { where: { status: { in: ['PENDENTE', 'COBRADA'] } }, include: { embarque: { select: { responsavelId: true } } } }
            }
        });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (!['PENDENTE', 'PARCIAL', 'VENCIDO'].includes(parcela.status) || saldoParcela(parcela) <= 0) {
            return res.status(400).json({ error: 'Este título não está mais em aberto.' });
        }

        // Já pendurada numa carga? Se for a MINHA carga, usa a cobrança existente
        const ativa = parcela.cobrancasRota[0];
        if (ativa) {
            if (ativa.status === 'COBRADA') return res.status(400).json({ error: 'Este título já foi cobrado em rota e aguarda o caixa.' });
            if (ativa.embarque && ativa.embarque.responsavelId !== req.user.id && !req._perms.admin) {
                return res.status(400).json({ error: 'Este título está na carga de outro motorista.' });
            }
            const cobrancaExistente = await prisma.cobrancaRota.findUnique({ where: { id: ativa.id }, include: INCLUDE_PADRAO });
            const resultado = await registrarCobranca({ cobranca: cobrancaExistente, valor, formaPagamentoNome, observacao, userId: req.user.id });
            if (resultado.erro) return res.status(400).json({ error: resultado.erro });
            return res.json({ message: 'Cobrança registrada! Ela entra no seu caixa de hoje para conferência.', cobranca: formatarCobranca(resultado.cobranca) });
        }

        const nova = await prisma.cobrancaRota.create({
            data: { parcelaId, destinadoParaId: req.user.id, criadoPorId: req.user.id },
            include: INCLUDE_PADRAO
        });
        const resultado = await registrarCobranca({ cobranca: nova, valor, formaPagamentoNome, observacao, userId: req.user.id });
        if (resultado.erro) {
            // Registro inválido → não deixar cobrança PENDENTE órfã da busca livre
            await prisma.cobrancaRota.delete({ where: { id: nova.id } }).catch(() => {});
            return res.status(400).json({ error: resultado.erro });
        }

        res.json({ message: 'Cobrança registrada! Ela entra no seu caixa de hoje para conferência.', cobranca: formatarCobranca(resultado.cobranca) });
    } catch (error) {
        console.error('[CobrancaRota] Erro na cobrança avulsa:', error);
        res.status(500).json({ error: 'Erro ao registrar a cobrança.' });
    }
});

// ── POST /:id/cobrar — motorista/vendedor registra a cobrança (total ou parcial) ──
router.post('/:id/cobrar', checkCobrador, async (req, res) => {
    try {
        const { valor, formaPagamentoNome, observacao } = req.body;
        const cobranca = await prisma.cobrancaRota.findUnique({
            where: { id: req.params.id },
            include: INCLUDE_PADRAO
        });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        if (cobranca.status !== 'PENDENTE') {
            return res.status(400).json({ error: 'Esta cobrança já foi registrada.' });
        }
        // Só o responsável atual da carga (ou admin) cobra as cobranças da carga
        if (!req._perms.admin && cobranca.embarque && cobranca.embarque.responsavelId !== req.user.id) {
            return res.status(403).json({ error: 'Esta cobrança está na carga de outro motorista.' });
        }

        const resultado = await registrarCobranca({ cobranca, valor, formaPagamentoNome, observacao, userId: req.user.id });
        if (resultado.erro) return res.status(400).json({ error: resultado.erro });

        res.json({ message: 'Cobrança registrada! Ela entra no seu caixa de hoje para conferência.', cobranca: formatarCobranca(resultado.cobranca) });
    } catch (error) {
        console.error('[CobrancaRota] Erro ao registrar cobrança:', error);
        res.status(500).json({ error: 'Erro ao registrar a cobrança.' });
    }
});

// ── POST /:id/nao-cobrada — não conseguiu cobrar: SÓ REGISTRO (título segue em aberto) ──
router.post('/:id/nao-cobrada', checkCobrador, async (req, res) => {
    try {
        const { responsavelTipo, observacao } = req.body;
        if (!['VENDEDOR', 'ESCRITORIO'].includes(responsavelTipo)) {
            return res.status(400).json({ error: 'Informe quem fica responsável: VENDEDOR ou ESCRITORIO.' });
        }

        const cobranca = await prisma.cobrancaRota.findUnique({
            where: { id: req.params.id },
            include: INCLUDE_PADRAO
        });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        if (cobranca.status !== 'PENDENTE') {
            return res.status(400).json({ error: 'Esta cobrança já foi registrada.' });
        }
        if (!req._perms.admin && cobranca.embarque && cobranca.embarque.responsavelId !== req.user.id) {
            return res.status(403).json({ error: 'Esta cobrança está na carga de outro motorista.' });
        }

        // Vendedor responsável = vendedor da carteira do cliente (só para acompanhamento)
        const responsavelVendedorId = responsavelTipo === 'VENDEDOR'
            ? (cobranca.parcela?.contaReceber?.cliente?.idVendedor || null)
            : null;

        const atualizada = await prisma.cobrancaRota.update({
            where: { id: req.params.id },
            data: {
                status: 'NAO_COBRADA',
                cobradoPorId: req.user.id,
                cobradoEm: new Date(),
                dataReferencia: hojeSP(),
                responsavelTipo,
                responsavelVendedorId,
                observacao: observacao || null
            },
            include: INCLUDE_PADRAO
        });

        // Histórico no cliente (best-effort)
        try {
            await prisma.atendimento.create({
                data: {
                    tipo: 'FINANCEIRO',
                    observacao: `Cobrança em rota NÃO realizada (parcela ${cobranca.parcela.numeroParcela}) — responsável: ${responsavelTipo === 'VENDEDOR' ? 'vendedor' : 'escritório'}${observacao ? ` | ${observacao}` : ''}`,
                    clienteId: cobranca.parcela.contaReceber.clienteId,
                    idVendedor: req.user.id,
                    pedidoId: cobranca.parcela.contaReceber.pedidoId || null
                }
            });
        } catch (logErr) {
            console.error('[CobrancaRota] Falha no histórico (registro já efetivado):', logErr.message);
        }

        res.json({ message: 'Registrado: não foi possível cobrar. O título continua em aberto.', cobranca: formatarCobranca(atualizada) });
    } catch (error) {
        console.error('[CobrancaRota] Erro ao registrar não-cobrança:', error);
        res.status(500).json({ error: 'Erro ao registrar.' });
    }
});

// ── POST /:id/desfazer — desfaz um registro de rua feito por engano (antes da baixa) ──
router.post('/:id/desfazer', checkEscritorioOuCobrador, async (req, res) => {
    try {
        const cobranca = await prisma.cobrancaRota.findUnique({
            where: { id: req.params.id },
            include: INCLUDE_PADRAO
        });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        if (cobranca.status === 'BAIXADA') {
            return res.status(400).json({ error: 'Esta cobrança já foi baixada no caixa. Use o estorno do Contas a Receber.' });
        }
        if (cobranca.status === 'PENDENTE') {
            return res.status(400).json({ error: 'Esta cobrança ainda não foi registrada na rua.' });
        }
        const perms = req._perms;
        const souQuemCobrou = cobranca.cobradoPorId === req.user.id;
        if (!perms.admin && !perms.Pode_Editar_Caixa && !perms.Pode_Baixar_Caixa && !souQuemCobrou) {
            return res.status(403).json({ error: 'Sem permissão para desfazer este registro.' });
        }

        if (!cobranca.embarqueId && cobranca.status === 'COBRADA') {
            // Avulsa (busca livre): desfazer = apagar o registro
            await prisma.cobrancaRota.delete({ where: { id: cobranca.id } });
            return res.json({ message: 'Registro desfeito.' });
        }

        await prisma.cobrancaRota.update({
            where: { id: cobranca.id },
            data: {
                status: 'PENDENTE',
                cobradoPorId: null,
                cobradoEm: null,
                dataReferencia: null,
                valorCobrado: null,
                formaPagamentoNome: null,
                responsavelTipo: null,
                responsavelVendedorId: null
            }
        });
        res.json({ message: 'Registro desfeito. A cobrança voltou para a lista da carga.' });
    } catch (error) {
        console.error('[CobrancaRota] Erro ao desfazer registro:', error);
        res.status(500).json({ error: 'Erro ao desfazer o registro.' });
    }
});

module.exports = router;
