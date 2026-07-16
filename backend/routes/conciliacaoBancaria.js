/**
 * Conciliação bancária — importar extrato OFX e bater com as baixas do app.
 * Permissão: admin ou Pode_Acessar_Financeiro_Gerencial (mesma dos relatórios gerenciais).
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const conciliacaoService = require('../services/conciliacaoBancariaService');
const asaasExtratoService = require('../services/asaasExtratoService');

const uploadOfx = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
        return res.status(403).json({ error: 'Sem permissão para acessar a conciliação bancária.' });
    }
    next();
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validarPeriodo = (req, res) => {
    const { de, ate } = req.query.de ? req.query : req.body;
    if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
        res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        return null;
    }
    if (String(ate) < String(de)) {
        res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        return null;
    }
    return { de: String(de), ate: String(ate) };
};

// ── POST /importar — sobe um arquivo OFX (campo "arquivo") para uma conta ──
router.post('/importar', verificarAuth, checkAcesso, uploadOfx.single('arquivo'), async (req, res) => {
    try {
        const contaFinanceiraCaId = String(req.body.contaFinanceiraCaId || '').trim();
        if (!contaFinanceiraCaId) return res.status(400).json({ error: 'Escolha o banco/caixa do extrato.' });
        if (!req.file?.buffer) return res.status(400).json({ error: 'Envie o arquivo OFX do extrato.' });

        const resultado = await conciliacaoService.importarOfx({
            contaFinanceiraCaId,
            nomeArquivo: req.file.originalname || 'extrato.ofx',
            // OFX de banco brasileiro vem em Latin1 — decodificar às cegas em UTF-8
            // corrompia os acentos ("D�B.TIT.COMPE").
            conteudo: conciliacaoService.decodificarOfx(req.file.buffer),
            criadoPorId: req.user.id
        });
        const partes = [`${resultado.novos} lançamento(s) novo(s) importado(s)`];
        if (resultado.duplicados) partes.push(`${resultado.duplicados} já existiam`);
        if (resultado.atualizados) partes.push(`${resultado.atualizados} tiveram a descrição corrigida`);
        res.json({ message: `${partes.join(', ')}.`, ...resultado });
    } catch (error) {
        console.error('Erro ao importar OFX:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao importar o extrato.' });
    }
});

// ── Extrato AUTOMÁTICO do Asaas ─────────────────────────────────────────
// O worker busca sozinho a cada 30 min; o botão da tela é para quem não quer
// esperar. GET /asaas-info diz se a integração está de pé e qual conta é a do
// Asaas (a tela só mostra o botão nessa conta).
router.get('/asaas-info', verificarAuth, checkAcesso, async (req, res) => {
    try {
        res.json(await asaasExtratoService.info());
    } catch (error) {
        console.error('Erro no asaas-info:', error);
        res.status(500).json({ error: 'Erro ao consultar a integração do extrato Asaas.' });
    }
});

router.post('/sincronizar-asaas', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await asaasExtratoService.sincronizar({ dias: Number(req.body?.dias) || 7 });
        if (!r.ok) return res.status(400).json({ error: r.motivo });
        const partes = [`${r.novos} lançamento(s) novo(s) do Asaas`];
        if (r.duplicados) partes.push(`${r.duplicados} já estavam aqui`);
        if (r.conciliadosAuto) partes.push(`${r.conciliadosAuto} conciliado(s) automaticamente`);
        res.json({ message: `${partes.join(', ')}.`, ...r });
    } catch (error) {
        console.error('Erro ao sincronizar extrato Asaas:', error);
        res.status(error.statusCode || error.status || 500)
            .json({ error: error.message || 'Erro ao buscar o extrato no Asaas.' });
    }
});

// ── GET /lancamentos?contaId&de&ate&status — extrato + sugestões + resumo ──
router.get('/lancamentos', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const periodo = validarPeriodo(req, res);
        if (!periodo) return;
        const contaId = String(req.query.contaId || '').trim();
        if (!contaId) return res.status(400).json({ error: 'Escolha o banco/caixa.' });
        const status = req.query.status ? String(req.query.status).toUpperCase() : 'todos';
        const dados = await conciliacaoService.listar({
            contaFinanceiraCaId: contaId,
            de: periodo.de,
            ate: periodo.ate,
            status: ['PENDENTE', 'CONCILIADO', 'IGNORADO'].includes(status) ? status : 'todos'
        });
        res.json(dados);
    } catch (error) {
        console.error('Erro ao listar lançamentos do extrato:', error);
        res.status(500).json({ error: 'Erro ao listar o extrato.' });
    }
});

// ── POST /conciliar-auto — fecha sozinho os pendentes com exatamente 1 candidato ──
router.post('/conciliar-auto', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const periodo = validarPeriodo(req, res);
        if (!periodo) return;
        const contaId = String(req.body.contaId || '').trim();
        if (!contaId) return res.status(400).json({ error: 'Escolha o banco/caixa.' });
        const r = await conciliacaoService.conciliarAutomatico({
            contaFinanceiraCaId: contaId,
            de: periodo.de,
            ate: periodo.ate,
            userId: req.user.id
        });
        res.json({
            message: r.conciliados > 0
                ? `${r.conciliados} lançamento(s) conciliado(s) automaticamente${r.restantes ? `; ${r.restantes} ficaram para revisão` : ''}.`
                : 'Nenhum lançamento pôde ser conciliado sozinho — revise as sugestões na lista.',
            ...r
        });
    } catch (error) {
        console.error('Erro na conciliação automática:', error);
        res.status(500).json({ error: 'Erro na conciliação automática.' });
    }
});

// ── GET /baixas-disponiveis?contaId&de&ate&tipo=CREDITO|DEBITO ──
// Baixas do app ainda livres (para o modal de conciliação em grupo).
router.get('/baixas-disponiveis', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const periodo = validarPeriodo(req, res);
        if (!periodo) return;
        const contaId = String(req.query.contaId || '').trim();
        if (!contaId) return res.status(400).json({ error: 'Escolha o banco/caixa.' });
        const tipo = String(req.query.tipo || '').toUpperCase();
        if (!['CREDITO', 'DEBITO'].includes(tipo)) return res.status(400).json({ error: 'Informe o tipo (CREDITO ou DEBITO).' });
        const baixas = await conciliacaoService.baixasDisponiveis({
            contaFinanceiraCaId: contaId,
            de: periodo.de,
            ate: periodo.ate,
            tipo
        });
        res.json(baixas);
    } catch (error) {
        console.error('Erro ao listar baixas disponíveis:', error);
        res.status(500).json({ error: 'Erro ao listar as baixas disponíveis.' });
    }
});

// ── GET /motivos-diferenca — o que a diferença entre extrato e baixas pode ser ──
router.get('/motivos-diferenca', verificarAuth, checkAcesso, (req, res) => {
    res.json(conciliacaoService.MOTIVOS_DIFERENCA);
});

// ── POST /conciliar-unificado — a AÇÃO ÚNICA: "este lançamento do banco é isto" ──
// body: { lancamentoIds: [], parcelaPagarIds: [] (boletos em aberto → cria baixa),
//         pagamentoIds: [] (baixas já registradas → só amarra), metodoPagamento,
//         juros, multa, desconto, motivoDiferenca?, obsDiferenca? }
router.post('/conciliar-unificado', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.conciliarUnificado({
            lancamentoIds: Array.isArray(req.body.lancamentoIds) ? req.body.lancamentoIds : [],
            parcelaPagarIds: Array.isArray(req.body.parcelaPagarIds) ? req.body.parcelaPagarIds : [],
            pagamentoIds: Array.isArray(req.body.pagamentoIds) ? req.body.pagamentoIds : [],
            metodoPagamento: req.body.metodoPagamento || null,
            juros: req.body.juros,
            multa: req.body.multa,
            desconto: req.body.desconto,
            motivoDiferenca: req.body.motivoDiferenca || null,
            obsDiferenca: req.body.obsDiferenca || null,
            userId: req.user.id
        });
        res.json(r);
    } catch (error) {
        console.error('Erro ao conciliar:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao conciliar.' });
    }
});

// ── POST /:id/conciliar — vincula o lançamento à baixa escolhida ──
router.post('/:id/conciliar', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.conciliar({
            lancamentoId: req.params.id,
            pagamentoParcelaId: req.body.pagamentoParcelaId || null,
            pagamentoParcelaPagarId: req.body.pagamentoParcelaPagarId || null,
            userId: req.user.id
        });
        res.json(r);
    } catch (error) {
        console.error('Erro ao conciliar lançamento:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao conciliar.' });
    }
});

// ── POST /:id/ignorar — tarifa, transferência interna etc. ──
router.post('/:id/ignorar', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.ignorar({ lancamentoId: req.params.id, obs: req.body.obs, userId: req.user.id });
        res.json(r);
    } catch (error) {
        console.error('Erro ao ignorar lançamento:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao ignorar.' });
    }
});

// ── POST /:id/transferencia — dinheiro movido entre contas da própria empresa ──
// body: { outraContaId?, obs? } — outraContaId vazio = conta fora do sistema.
// Cria o registro TransferenciaConta (relatórios por conta) e marca o lançamento
// como TRANSFERENCIA (sai dos pendentes; "desfazer" apaga a transferência junto).
router.post('/:id/transferencia', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.transferir({
            lancamentoId: req.params.id,
            outraContaId: req.body.outraContaId,
            obs: req.body.obs,
            userId: req.user.id
        });
        res.json(r);
    } catch (error) {
        console.error('Erro ao registrar transferência:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao registrar transferência.' });
    }
});

// ── POST /:id/desfazer — volta para pendente ──
router.post('/:id/desfazer', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.desfazer({ lancamentoId: req.params.id });
        res.json(r);
    } catch (error) {
        console.error('Erro ao desfazer lançamento:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao desfazer.' });
    }
});

// ── GET /parcelas-pagar-abertas?valor=&busca=&de=&ate= — boletos EM ABERTO ──
// Janela de vencimento de/ate (padrão na tela: ±15 dias da data do débito, ajustável,
// como no Conta Azul). As que fecham com o valor do extrato vêm primeiro.
router.get('/parcelas-pagar-abertas', verificarAuth, checkAcesso, async (req, res) => {
    try {
        res.json(await conciliacaoService.parcelasPagarEmAberto({
            valor: req.query.valor,
            busca: req.query.busca,
            de: req.query.de,
            ate: req.query.ate
        }));
    } catch (error) {
        console.error('Erro ao listar parcelas a pagar em aberto:', error);
        res.status(500).json({ error: 'Erro ao listar as contas a pagar em aberto.' });
    }
});

// ── GET /opcoes-despesa — fornecedores + categorias + formas de pagamento ──
// Serve o modal de "criar despesa" DA CONCILIAÇÃO. Fica aqui (e não em /contas-pagar)
// de propósito: a permissão tem que ser a MESMA da tela onde o botão aparece, senão
// quem concilia abriria um modal que não consegue salvar.
router.get('/opcoes-despesa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        res.json(await conciliacaoService.opcoesDespesa());
    } catch (error) {
        console.error('Erro ao carregar opções da despesa:', error);
        res.status(500).json({ error: 'Erro ao carregar fornecedores/categorias.' });
    }
});

// ── POST /:id/criar-despesa — lança no Contas a Pagar a despesa que faltava ──
// Cria a conta JÁ PAGA (o dinheiro saiu do banco), com a data/valor/banco do próprio
// lançamento. A baixa vira o candidato da linha — o usuário clica em "Conciliar" depois.
router.post('/:id/criar-despesa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.criarDespesaDoLancamento({
            lancamentoId: req.params.id,
            fornecedorId: req.body.fornecedorId || null,
            fornecedorNovo: req.body.fornecedorNovo || null,
            descricao: req.body.descricao,
            categoria: req.body.categoria,
            categoriaCaId: req.body.categoriaCaId,
            numeroNota: req.body.numeroNota,
            competencia: req.body.competencia,
            observacoes: req.body.observacoes,
            metodoPagamento: req.body.metodoPagamento,
            dataVencimento: req.body.dataVencimento,
            juros: req.body.juros,
            multa: req.body.multa,
            userId: req.user.id
        });
        res.status(201).json(r);
    } catch (error) {
        console.error('Erro ao criar despesa pela conciliação:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao criar a despesa.' });
    }
});

// ── GET /importacoes?contaId — histórico de arquivos importados ──
router.get('/importacoes', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const contaId = String(req.query.contaId || '').trim();
        if (!contaId) return res.status(400).json({ error: 'Escolha o banco/caixa.' });
        res.json(await conciliacaoService.listarImportacoes(contaId));
    } catch (error) {
        console.error('Erro ao listar importações:', error);
        res.status(500).json({ error: 'Erro ao listar as importações.' });
    }
});

module.exports = router;
