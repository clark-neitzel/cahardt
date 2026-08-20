/**
 * Financeiro Gerencial (Fase 5) — Fluxo de Caixa e DRE.
 * Relatórios sobre contas a receber/pagar e pedidos (leitura), mais as
 * correções da tela Saldos por Conta: mover lançamento de banco e
 * ajuste manual de saldo (escrita pontual, só nos campos de conta).
 *
 * Permissão: admin ou Pode_Acessar_Financeiro_Gerencial
 */

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const financeiroGerencialService = require('../services/financeiroGerencialService');
const importacaoCaService = require('../services/importacaoCaService');

const CLASSIFICACOES = ['OPERACIONAL', 'FINANCEIRO', 'FORA_DRE', 'A_CLASSIFICAR'];
const NATUREZAS = ['FIXA', 'VARIAVEL', 'A_DEFINIR'];

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
    if (!perms.admin && !perms.Pode_Acessar_Financeiro_Gerencial) {
        return res.status(403).json({ error: 'Sem permissão para acessar o financeiro gerencial.' });
    }
    next();
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

// ── GET /fluxo-caixa?de=YYYY-MM-DD&ate=YYYY-MM-DD&granularidade=dia|mes ──
router.get('/fluxo-caixa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        const granularidade = req.query.granularidade === 'mes' ? 'mes' : 'dia';
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const dados = await financeiroGerencialService.fluxoCaixa(String(de), String(ate), granularidade);
        res.json(dados);
    } catch (error) {
        console.error('Erro no fluxo de caixa:', error);
        res.status(500).json({ error: 'Erro ao montar o fluxo de caixa.' });
    }
});

// ── GET /dre?de=YYYY-MM&ate=YYYY-MM ──
router.get('/dre', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YM.test(String(de)) || !YM.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'O mês final precisa ser maior ou igual ao inicial.' });
        }
        const dados = await financeiroGerencialService.dre(String(de), String(ate));
        res.json(dados);
    } catch (error) {
        console.error('Erro na DRE:', error);
        res.status(500).json({ error: 'Erro ao montar a DRE.' });
    }
});

// ── GET /por-conta?de=YYYY-MM-DD&ate=YYYY-MM-DD&saldoCA=1 ──
// Totais por conta financeira (banco/caixa) no período: entradas, saídas, resultado
// e, opcionalmente, o saldo em tempo real no Conta Azul.
router.get('/por-conta', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const comSaldoCA = req.query.saldoCA === '1' || req.query.saldoCA === 'true';
        const dados = await financeiroGerencialService.saldosPorConta(String(de), String(ate), comSaldoCA);
        res.json(dados);
    } catch (error) {
        console.error('Erro no financeiro por conta:', error);
        res.status(500).json({ error: 'Erro ao montar o resumo por conta.' });
    }
});

// ── GET /por-conta/extrato?contaId=UUID|sem&de=YYYY-MM-DD&ate=YYYY-MM-DD ──
// Lançamentos (entradas e saídas) de UMA conta no período. contaId=sem → sem banco informado.
router.get('/por-conta/extrato', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const contaId = (!req.query.contaId || req.query.contaId === 'sem') ? null : String(req.query.contaId);
        const dados = await financeiroGerencialService.extratoPorConta(contaId, String(de), String(ate));
        res.json(dados);
    } catch (error) {
        console.error('Erro no extrato por conta:', error);
        res.status(500).json({ error: 'Erro ao montar o extrato da conta.' });
    }
});

// Resolve o contaId vindo do frontend ('sem' | uuid) e valida que a conta existe.
// Retorna { ok, contaId } ou { ok: false, erro }.
const resolverContaId = async (bruto) => {
    if (!bruto || bruto === 'sem') return { ok: true, contaId: null };
    const conta = await prisma.contaFinanceira.findUnique({ where: { id: String(bruto) }, select: { id: true } });
    if (!conta) return { ok: false, erro: 'Conta (banco/caixa) não encontrada.' };
    return { ok: true, contaId: conta.id };
};

// ── PUT /por-conta/lancamento-banco — mover um lançamento para outra conta ──
// body: { origem: 'RECEBER'|'PAGAR'|'AJUSTE', id, contaId: uuid|'sem' }
// Corrige lançamentos que caíram em "Não informado" ou no banco errado.
// Só muda o campo de conta financeira — valor, data e baixa ficam intactos.
router.put('/por-conta/lancamento-banco', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { origem, id } = req.body || {};
        if (!id || !['RECEBER', 'PAGAR', 'AJUSTE'].includes(origem)) {
            return res.status(400).json({ error: 'Informe origem (RECEBER, PAGAR ou AJUSTE) e id do lançamento.' });
        }
        const r = await resolverContaId(req.body?.contaId);
        if (!r.ok) return res.status(400).json({ error: r.erro });

        const data = { contaFinanceiraCaId: r.contaId };
        if (origem === 'RECEBER') await prisma.parcela.update({ where: { id: String(id) }, data });
        else if (origem === 'PAGAR') await prisma.pagamentoParcelaPagar.update({ where: { id: String(id) }, data });
        else await prisma.ajusteSaldoConta.update({ where: { id: String(id) }, data });

        res.json({ message: 'Lançamento movido de conta!' });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Lançamento não encontrado.' });
        console.error('Erro ao mover lançamento de conta:', error);
        res.status(500).json({ error: 'Erro ao mover o lançamento de conta.' });
    }
});

// ── POST /por-conta/ajuste — criar um ajuste manual de saldo ──
// body: { contaId: uuid|'sem', tipo: 'ENTRADA'|'SAIDA', valor > 0, data: 'YYYY-MM-DD', descricao }
router.post('/por-conta/ajuste', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { tipo, data, descricao } = req.body || {};
        const valor = Math.round(Number(req.body?.valor) * 100) / 100;
        if (!['ENTRADA', 'SAIDA'].includes(tipo)) return res.status(400).json({ error: 'Informe o tipo: ENTRADA ou SAIDA.' });
        if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Informe um valor maior que zero.' });
        if (!YMD.test(String(data))) return res.status(400).json({ error: 'Informe a data no formato YYYY-MM-DD.' });
        if (!String(descricao || '').trim()) return res.status(400).json({ error: 'Descreva o motivo do ajuste.' });

        const r = await resolverContaId(req.body?.contaId);
        if (!r.ok) return res.status(400).json({ error: r.erro });

        const ajuste = await prisma.ajusteSaldoConta.create({
            data: {
                contaFinanceiraCaId: r.contaId,
                data: new Date(`${data}T12:00:00-03:00`),
                valor: tipo === 'SAIDA' ? -valor : valor,
                descricao: String(descricao).trim(),
                criadoPorId: req.user.id
            }
        });
        res.status(201).json({ message: 'Ajuste registrado!', id: ajuste.id });
    } catch (error) {
        console.error('Erro ao criar ajuste de saldo:', error);
        res.status(500).json({ error: 'Erro ao registrar o ajuste.' });
    }
});

// ── DELETE /por-conta/ajuste/:id — excluir um ajuste manual ──
router.delete('/por-conta/ajuste/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        await prisma.ajusteSaldoConta.delete({ where: { id: String(req.params.id) } });
        res.json({ message: 'Ajuste excluído!' });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Ajuste não encontrado.' });
        console.error('Erro ao excluir ajuste de saldo:', error);
        res.status(500).json({ error: 'Erro ao excluir o ajuste.' });
    }
});

// ── GET /dashboard — visão geral do financeiro em uma tela ──
// Fluxo próximos 30 dias, movimento por conta (últimos 30), aging de recebíveis,
// margem e DRE do mês corrente, pendências de conciliação.
router.get('/dashboard', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const dados = await financeiroGerencialService.dashboardFinanceiro();
        res.json(dados);
    } catch (error) {
        console.error('Erro no dashboard financeiro:', error);
        res.status(500).json({ error: 'Erro ao montar o dashboard financeiro.' });
    }
});

// ── GET /margem-produtos?de=YYYY-MM-DD&ate=YYYY-MM-DD ──
// Margem por produto: vendas do período (mesma regra da DRE) × custo unitário
// (ficha técnica ativa do PCP > custo de compra > custo do CA).
router.get('/margem-produtos', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const dados = await financeiroGerencialService.margemProdutos(String(de), String(ate));
        res.json(dados);
    } catch (error) {
        console.error('Erro na margem por produto:', error);
        res.status(500).json({ error: 'Erro ao montar a margem por produto.' });
    }
});

// ── GET /categorias-despesa — categorias com o "balde" (classificação) e o total gasto ──
// Garante uma linha para toda categoria já vista nas contas (com o palpite padrão),
// para o usuário nunca ficar com categoria "solta" fora da classificação.
router.get('/categorias-despesa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        // Categorias vistas nas contas (rateios + categoria da conta)
        const [rateios, contas] = await Promise.all([
            prisma.contaPagarRateio.groupBy({
                by: ['categoria'],
                _sum: { valor: true },
                where: { contaPagar: { status: { not: 'CANCELADO' } } }
            }),
            prisma.contaPagar.groupBy({
                by: ['categoria'],
                _sum: { valorTotal: true },
                where: { status: { not: 'CANCELADO' }, rateios: { none: {} } }
            })
        ]);

        const totalPorNome = new Map();
        const somar = (nome, v) => {
            const n = (nome || 'Sem categoria').trim() || 'Sem categoria';
            totalPorNome.set(n, Math.round(((totalPorNome.get(n) || 0) + Number(v || 0)) * 100) / 100);
        };
        rateios.forEach((r) => somar(r.categoria, r._sum.valor));
        contas.forEach((c) => somar(c.categoria, c._sum.valorTotal));

        // Cria as que ainda não existem na tabela de classificação + garante os
        // blocos padrão da DRE e aplica o palpite de bloco/natureza nas novas
        await importacaoCaService.garantirCategorias([...totalPorNome.keys()]);
        await importacaoCaService.garantirGruposDre();

        const linhas = await prisma.categoriaDespesa.findMany({ orderBy: { nome: 'asc' } });
        res.json(linhas.map((l) => ({
            id: l.id,
            nome: l.nome,
            classificacao: l.classificacao,
            natureza: l.natureza,
            grupoDreId: l.grupoDreId,
            total: totalPorNome.get(l.nome) || 0
        })));
    } catch (error) {
        console.error('Erro ao listar categorias de despesa:', error);
        res.status(500).json({ error: 'Erro ao listar as categorias de despesa.' });
    }
});

// ── PUT /categorias-despesa — salvar classificação, bloco e natureza ──
// body: { categorias: [{ nome, classificacao, grupoDreId?, natureza? }] }
// grupoDreId/natureza são opcionais (chamadas antigas seguem funcionando).
router.put('/categorias-despesa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const lista = Array.isArray(req.body?.categorias) ? req.body.categorias : [];
        if (lista.length === 0) return res.status(400).json({ error: 'Nada para salvar.' });

        const gruposValidos = new Set(
            (await prisma.grupoDre.findMany({ select: { id: true } })).map((g) => g.id)
        );
        for (const item of lista) {
            const nome = String(item?.nome || '').trim();
            const classificacao = String(item?.classificacao || '').toUpperCase();
            if (!nome || !CLASSIFICACOES.includes(classificacao)) continue;

            const dados = { classificacao };
            if ('grupoDreId' in (item || {})) {
                dados.grupoDreId = item.grupoDreId && gruposValidos.has(String(item.grupoDreId))
                    ? String(item.grupoDreId) : null;
            }
            if ('natureza' in (item || {})) {
                const nat = String(item.natureza || '').toUpperCase();
                dados.natureza = NATUREZAS.includes(nat) ? nat : 'A_DEFINIR';
            }
            // Fora da DRE não pertence a bloco nenhum
            if (classificacao === 'FORA_DRE') dados.grupoDreId = null;

            await prisma.categoriaDespesa.upsert({
                where: { nome },
                update: dados,
                create: { nome, ...dados }
            });
        }
        res.json({ message: 'Classificação salva!' });
    } catch (error) {
        console.error('Erro ao salvar classificação de categorias:', error);
        res.status(500).json({ error: 'Erro ao salvar a classificação.' });
    }
});

// ── POST /categorias-despesa — criar categoria nova (sem esperar aparecer numa despesa) ──
// body: { nome, grupoDreId?, natureza? }
// As categorias nascem sozinhas quando aparecem numa conta a pagar; esta rota é para
// criar ANTES — para a categoria já estar na lista na hora de lançar a despesa.
router.post('/categorias-despesa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nome = String(req.body?.nome || '').trim().replace(/\s+/g, ' ');
        if (!nome) return res.status(400).json({ error: 'Informe o nome da categoria.' });
        if (nome.length > 120) return res.status(400).json({ error: 'Nome muito longo (máx. 120 caracteres).' });

        // Duplicidade sem diferenciar maiúscula/minúscula ("Aluguel" x "aluguel")
        const existente = await prisma.categoriaDespesa.findFirst({
            where: { nome: { equals: nome, mode: 'insensitive' } }
        });
        if (existente) {
            return res.status(400).json({ error: `A categoria "${existente.nome}" já existe.` });
        }

        let grupoDreId = null;
        if (req.body?.grupoDreId) {
            const grupo = await prisma.grupoDre.findUnique({ where: { id: String(req.body.grupoDreId) } });
            if (!grupo) return res.status(400).json({ error: 'Bloco da DRE não encontrado.' });
            grupoDreId = grupo.id;
        }

        const naturezaBruta = String(req.body?.natureza || 'A_DEFINIR').toUpperCase();
        const natureza = NATUREZAS.includes(naturezaBruta) ? naturezaBruta : 'A_DEFINIR';
        const classificacao = grupoDreId ? 'OPERACIONAL' : 'A_CLASSIFICAR';

        const criada = await prisma.categoriaDespesa.create({
            data: { nome, classificacao, natureza, grupoDreId }
        });

        res.status(201).json({
            id: criada.id,
            nome: criada.nome,
            classificacao: criada.classificacao,
            natureza: criada.natureza,
            grupoDreId: criada.grupoDreId,
            total: 0
        });
    } catch (error) {
        if (error?.code === 'P2002') return res.status(400).json({ error: 'Essa categoria já existe.' });
        console.error('Erro ao criar categoria de despesa:', error);
        res.status(500).json({ error: 'Erro ao criar a categoria.' });
    }
});

// ── DELETE /categorias-despesa/:id — apagar categoria que nunca foi usada ──
// Só sai se NENHUMA despesa/rateio/item de nota apontar para ela (por ID ou pelo nome).
// Serve para desfazer um nome digitado errado; categoria com histórico nunca é apagada.
router.delete('/categorias-despesa/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const cat = await prisma.categoriaDespesa.findUnique({ where: { id: String(req.params.id) } });
        if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });

        const [porIdConta, porIdRateio, porIdItem, porNomeConta, porNomeRateio] = await Promise.all([
            prisma.contaPagar.count({ where: { categoriaDespesaId: cat.id } }),
            prisma.contaPagarRateio.count({ where: { categoriaDespesaId: cat.id } }),
            prisma.notaEntradaItem.count({ where: { categoriaDespesaId: cat.id } }),
            prisma.contaPagar.count({ where: { categoria: cat.nome } }),
            prisma.contaPagarRateio.count({ where: { categoria: cat.nome } })
        ]);
        const usos = porIdConta + porIdRateio + porIdItem + porNomeConta + porNomeRateio;
        if (usos > 0) {
            return res.status(400).json({
                error: `"${cat.nome}" já está em uso em ${usos} lançamento(s) — não dá para apagar. Se ela não deve entrar no resultado, marque como "Fora da DRE".`
            });
        }

        await prisma.categoriaDespesa.delete({ where: { id: cat.id } });
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao excluir categoria de despesa:', error);
        res.status(500).json({ error: 'Erro ao excluir a categoria.' });
    }
});

// ─────────────────────────────────────────────────────────────
// Blocos da DRE (grupos) — o usuário cria, renomeia, reordena e apaga
// ─────────────────────────────────────────────────────────────

// ── GET /grupos-dre — lista os blocos (cria os padrão na primeira vez) ──
router.get('/grupos-dre', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const grupos = await importacaoCaService.garantirGruposDre();
        res.json(grupos.map((g) => ({ id: g.id, nome: g.nome, ordem: g.ordem })));
    } catch (error) {
        console.error('Erro ao listar blocos da DRE:', error);
        res.status(500).json({ error: 'Erro ao listar os blocos da DRE.' });
    }
});

// ── POST /grupos-dre — criar um bloco novo. body: { nome } ──
router.post('/grupos-dre', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nome = String(req.body?.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'Dê um nome ao bloco.' });
        if (nome.length > 60) return res.status(400).json({ error: 'Nome do bloco muito longo (máx. 60).' });
        const max = await prisma.grupoDre.aggregate({ _max: { ordem: true } });
        const grupo = await prisma.grupoDre.create({
            data: { nome, ordem: (max._max.ordem ?? -1) + 1 }
        });
        res.status(201).json({ id: grupo.id, nome: grupo.nome, ordem: grupo.ordem });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: 'Já existe um bloco com esse nome.' });
        console.error('Erro ao criar bloco da DRE:', error);
        res.status(500).json({ error: 'Erro ao criar o bloco.' });
    }
});

// ── PUT /grupos-dre/ordem — reordenar. body: { ids: [id, id, ...] } na ordem nova ──
router.put('/grupos-dre/ordem', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
        if (ids.length === 0) return res.status(400).json({ error: 'Informe a ordem dos blocos.' });
        for (let i = 0; i < ids.length; i++) {
            await prisma.grupoDre.update({ where: { id: ids[i] }, data: { ordem: i } }).catch(() => {});
        }
        res.json({ message: 'Ordem salva!' });
    } catch (error) {
        console.error('Erro ao reordenar blocos da DRE:', error);
        res.status(500).json({ error: 'Erro ao salvar a ordem.' });
    }
});

// ── PUT /grupos-dre/:id — renomear. body: { nome } ──
router.put('/grupos-dre/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nome = String(req.body?.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'Dê um nome ao bloco.' });
        if (nome.length > 60) return res.status(400).json({ error: 'Nome do bloco muito longo (máx. 60).' });
        const grupo = await prisma.grupoDre.update({ where: { id: String(req.params.id) }, data: { nome } });
        res.json({ id: grupo.id, nome: grupo.nome, ordem: grupo.ordem });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Bloco não encontrado.' });
        if (error.code === 'P2002') return res.status(400).json({ error: 'Já existe um bloco com esse nome.' });
        console.error('Erro ao renomear bloco da DRE:', error);
        res.status(500).json({ error: 'Erro ao renomear o bloco.' });
    }
});

// ── DELETE /grupos-dre/:id — apagar (as categorias do bloco voltam para "sem bloco") ──
router.delete('/grupos-dre/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const id = String(req.params.id);
        await prisma.categoriaDespesa.updateMany({ where: { grupoDreId: id }, data: { grupoDreId: null } });
        await prisma.grupoDre.delete({ where: { id } });
        res.json({ message: 'Bloco excluído! As categorias dele ficaram sem bloco.' });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Bloco não encontrado.' });
        console.error('Erro ao excluir bloco da DRE:', error);
        res.status(500).json({ error: 'Erro ao excluir o bloco.' });
    }
});

module.exports = router;
