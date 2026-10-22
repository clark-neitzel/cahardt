const express = require('express');
const router = express.Router();
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const verificarAuth = require('../middlewares/authMiddleware');
// Caixa fechado não se altera (08/2026) — a trava só vale com a chave ligada.
const confService = require('../services/caixaConferenciaService');
// F2: comprovante da despesa (foto + leitura da IA). Só marca e avisa: nunca trava nem desfaz a despesa.
const cupomService = require('../services/cupomDespesaService');

const usuarioComprovante = (req) => ({ id: req.user.id, nome: req.user.nome || null, admin: req.user?.permissoes?.admin === true });
// motivo de "sem comprovante": se veio o campo, tem que ter pelo menos 5 letras (campo ausente = app antigo, segue sem foto)
const motivoSemComprovanteInvalido = (b) =>
    b.semComprovanteMotivo !== undefined && b.semComprovanteMotivo !== null && !b.comprovanteRef
    && String(b.semComprovanteMotivo).replace(/\s/g, '').length < 5;
const MSG_MOTIVO_SEM_COMPROVANTE = 'Informe o motivo de não ter o comprovante (mínimo 5 letras).';

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

// ── Middleware: Acesso ao Caixa ──
const checkAcessoCaixa = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Acessar_Caixa || perms.Pode_Editar_Caixa) {
            req._perms = perms;
            return next();
        }
        return res.status(403).json({ error: 'Sem permissão para acessar Despesas.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

router.use(verificarAuth);
router.use(checkAcessoCaixa);

// ── GET / — Listar despesas do dia ──
router.get('/', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório (YYYY-MM-DD).' });

        const targetVendedor = vendedorId || req.user.id;

        // Apenas admin/editor pode ver despesas de outros
        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para ver despesas de outro usuário.' });
        }

        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: data },
            include: { veiculo: { select: { placa: true, modelo: true } } },
            orderBy: { createdAt: 'asc' }
        });

        // F2: resumo do comprovante por despesa (falha -> null; a lista nunca quebra por isso)
        const resumos = await cupomService.resumoPorDespesas(despesas.map((d) => d.id));
        res.json(despesas.map((d) => ({ ...d, comprovante: resumos.get(d.id) || null })));
    } catch (error) {
        console.error('Erro ao listar despesas:', error);
        res.status(500).json({ error: 'Erro ao listar despesas.' });
    }
});

// ── POST / — Criar despesa ──
router.post('/', async (req, res) => {
    try {
        const { vendedorId, dataReferencia, categoria, descricao, valor, veiculoId, litros, kmNoAbastecimento, tipoManutencao, comprovanteRef, semComprovanteMotivo } = req.body;

        if (!dataReferencia || !categoria || valor === undefined) {
            return res.status(400).json({ error: 'Campos obrigatórios: dataReferencia, categoria, valor.' });
        }
        if (motivoSemComprovanteInvalido(req.body)) return res.status(400).json({ error: MSG_MOTIVO_SEM_COMPROVANTE, codigo: 'MOTIVO_OBRIGATORIO' });

        // Validar KM de combustível: obrigatório e deve ser maior que o último
        if (categoria === 'COMBUSTIVEL' && veiculoId) {
            if (!kmNoAbastecimento) {
                return res.status(400).json({ error: 'KM do hodômetro é obrigatório para abastecimento.' });
            }
            const kmInt = parseInt(kmNoAbastecimento);
            const isAdmin = req.user?.permissoes?.admin === true;
            if (!isAdmin) {
                const ultimoAbast = await prisma.despesa.findFirst({
                    where: { veiculoId, categoria: 'COMBUSTIVEL', kmNoAbastecimento: { not: null } },
                    orderBy: [{ dataReferencia: 'desc' }, { id: 'desc' }],
                    select: { kmNoAbastecimento: true }
                });
                if (ultimoAbast && kmInt <= ultimoAbast.kmNoAbastecimento) {
                    return res.status(400).json({
                        error: `KM informado (${kmInt}) deve ser maior que o último registro (${ultimoAbast.kmNoAbastecimento}).`
                    });
                }
            }
        }

        const targetVendedor = vendedorId || req.user.id;

        // Caixa fechado não se altera: sem reabrir, não entra despesa nesse dia.
        const bloqueio = await confService.bloqueioPorCaixaFechado(targetVendedor, dataReferencia);
        if (bloqueio) return res.status(400).json({ error: bloqueio });

        const despesa = await prisma.despesa.create({
            data: {
                vendedorId: targetVendedor,
                dataReferencia,
                categoria,
                descricao: descricao || null,
                valor,
                veiculoId: categoria === 'COMBUSTIVEL' ? veiculoId : null,
                litros: categoria === 'COMBUSTIVEL' ? litros : null,
                kmNoAbastecimento: categoria === 'COMBUSTIVEL' && kmNoAbastecimento ? parseInt(kmNoAbastecimento) : null,
                tipoManutencao: categoria === 'MANUTENCAO_VEICULO' ? tipoManutencao : null,
                criadoPor: req.user.id
            },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        // F2: a despesa JÁ está salva. Comprovante é depois, fora de transação, e falha dele nunca desfaz nada.
        const reg = await cupomService.registrarParaDespesa({ despesa, comprovanteRef, semComprovanteMotivo, usuario: usuarioComprovante(req) });
        const resumo = (await cupomService.resumoPorDespesas([despesa.id])).get(despesa.id) || null;

        res.status(201).json({ ...despesa, comprovante: resumo, comprovanteErro: reg.comprovanteErro || null });
    } catch (error) {
        console.error('Erro ao criar despesa:', error);
        res.status(500).json({ error: 'Erro ao criar despesa.' });
    }
});

// ── PUT /:id — Editar despesa ──
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const despesa = await prisma.despesa.findUnique({ where: { id } });

        if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada.' });

        // Dono pode editar se caixa ABERTO, admin/editor sempre
        const isOwner = despesa.vendedorId === req.user.id;
        const isEditor = req._perms.admin || req._perms.Pode_Editar_Caixa;

        if (!isOwner && !isEditor) {
            return res.status(403).json({ error: 'Sem permissão para editar esta despesa.' });
        }

        if (isOwner && !isEditor) {
            // Verificar se caixa ainda está aberto
            const caixa = await prisma.caixaDiario.findUnique({
                where: { vendedorId_dataReferencia: { vendedorId: despesa.vendedorId, dataReferencia: despesa.dataReferencia } }
            });
            if (caixa && caixa.status !== 'ABERTO') {
                return res.status(400).json({ error: 'Caixa já fechado. Não é possível editar.' });
            }
        }

        // Caixa fechado não se altera — vale também para admin/auditor: reabra o caixa.
        const bloqueioEdit = await confService.bloqueioPorCaixaFechado(despesa.vendedorId, despesa.dataReferencia);
        if (bloqueioEdit) return res.status(400).json({ error: bloqueioEdit });

        const { categoria, descricao, valor, veiculoId, litros, kmNoAbastecimento, tipoManutencao, comprovanteRef, semComprovanteMotivo } = req.body;
        const catFinal = categoria || despesa.categoria;
        if (motivoSemComprovanteInvalido(req.body)) return res.status(400).json({ error: MSG_MOTIVO_SEM_COMPROVANTE, codigo: 'MOTIVO_OBRIGATORIO' });

        // Validar KM de combustível na edição
        if (catFinal === 'COMBUSTIVEL' && veiculoId) {
            if (!kmNoAbastecimento) {
                return res.status(400).json({ error: 'KM do hodômetro é obrigatório para abastecimento.' });
            }
            const kmInt = parseInt(kmNoAbastecimento);
            const isAdminUser = req.user?.permissoes?.admin === true;
            if (!isAdminUser) {
                const ultimoAbast = await prisma.despesa.findFirst({
                    where: { veiculoId, categoria: 'COMBUSTIVEL', kmNoAbastecimento: { not: null }, id: { not: id } },
                    orderBy: [{ dataReferencia: 'desc' }, { id: 'desc' }],
                    select: { kmNoAbastecimento: true }
                });
                if (ultimoAbast && kmInt <= ultimoAbast.kmNoAbastecimento) {
                    return res.status(400).json({
                        error: `KM informado (${kmInt}) deve ser maior que o último registro (${ultimoAbast.kmNoAbastecimento}).`
                    });
                }
            }
        }

        const updated = await prisma.despesa.update({
            where: { id },
            data: {
                categoria: catFinal,
                descricao: descricao !== undefined ? descricao : despesa.descricao,
                valor: valor !== undefined ? valor : despesa.valor,
                veiculoId: catFinal === 'COMBUSTIVEL' ? veiculoId : null,
                litros: catFinal === 'COMBUSTIVEL' ? litros : null,
                kmNoAbastecimento: catFinal === 'COMBUSTIVEL' && kmNoAbastecimento ? parseInt(kmNoAbastecimento) : null,
                tipoManutencao: catFinal === 'MANUTENCAO_VEICULO' ? tipoManutencao : null
            },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        // F2: comprovante (despesa já atualizada; nada abaixo desfaz nem bloqueia a edição)
        let comprovanteErro = null;
        if (comprovanteRef) {
            const reg = await cupomService.registrarParaDespesa({ despesa: updated, comprovanteRef, usuario: usuarioComprovante(req), substituir: true });
            comprovanteErro = reg.comprovanteErro || null;
        } else if (semComprovanteMotivo !== undefined && semComprovanteMotivo !== null) {
            // só vale se a despesa ainda não tem foto (não apaga comprovante existente)
            try {
                const tem = await prisma.anexo.count({ where: { entidadeTipo: 'DESPESA', entidadeId: id, tipo: 'COMPROVANTE', ativo: true } });
                if (!tem) await cupomService.registrarParaDespesa({ despesa: updated, semComprovanteMotivo, usuario: usuarioComprovante(req) });
            } catch (e) { console.error('[Despesas] motivo sem comprovante não gravado:', e.message); }
        } else if (['valor', 'litros', 'veiculoId', 'categoria'].some((k) => req.body[k] !== undefined)) {
            await cupomService.recalcularParaDespesa(updated); // refaz a comparação com a leitura já guardada (sem IA)
        }
        const resumo = (await cupomService.resumoPorDespesas([id])).get(id) || null;

        res.json({ ...updated, comprovante: resumo, comprovanteErro });
    } catch (error) {
        console.error('Erro ao editar despesa:', error);
        res.status(500).json({ error: 'Erro ao editar despesa.' });
    }
});

// ── DELETE /:id — Excluir despesa ──
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const despesa = await prisma.despesa.findUnique({ where: { id } });

        if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada.' });

        const isOwner = despesa.vendedorId === req.user.id;
        const isEditor = req._perms.admin || req._perms.Pode_Editar_Caixa;

        if (!isOwner && !isEditor) {
            return res.status(403).json({ error: 'Sem permissão para excluir esta despesa.' });
        }

        if (isOwner && !isEditor) {
            const caixa = await prisma.caixaDiario.findUnique({
                where: { vendedorId_dataReferencia: { vendedorId: despesa.vendedorId, dataReferencia: despesa.dataReferencia } }
            });
            if (caixa && caixa.status !== 'ABERTO') {
                return res.status(400).json({ error: 'Caixa já fechado. Não é possível excluir.' });
            }
        }

        // Caixa fechado não se altera — vale também para admin/auditor: reabra o caixa.
        const bloqueioDel = await confService.bloqueioPorCaixaFechado(despesa.vendedorId, despesa.dataReferencia);
        if (bloqueioDel) return res.status(400).json({ error: bloqueioDel });

        await prisma.despesa.delete({ where: { id } });
        await cupomService.aoExcluirDespesa(id, usuarioComprovante(req)); // solta comprovante (nunca lança)
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao excluir despesa:', error);
        res.status(500).json({ error: 'Erro ao excluir despesa.' });
    }
});

module.exports = router;
