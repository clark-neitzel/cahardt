// Telas do app: "Cadastros pra acertar" e a fila de pedidos de inativação feitos pelos agentes.
// Autenticada pelo JWT do app (montada com authMiddleware). Não existe rota de exclusão.
const express = require('express');
const fichaSvc = require('../services/analyticsClienteFichaService');
const inativacao = require('../services/clienteInativacaoService');
const classif = require('../services/clienteClassificacaoService');
const nomeSvc = require('../services/clienteNomeCadastroService');
const prisma = require('../config/database');

const router = express.Router();

function permissoes(req) {
    const p = req.user?.permissoes;
    try { return typeof p === 'string' ? JSON.parse(p) : (p || {}); } catch { return {}; }
}

// Mesma régua de quem edita clientes (PATCH /clientes/:uuid): admin, clientes.edit ou Pode_Editar_GPS.
const podeEditarClientes = (req) => {
    const p = permissoes(req);
    return !!(p.admin || p.clientes?.edit || p.Pode_Editar_GPS);
};

function exigirPermissao(req, res, next) {
    if (!podeEditarClientes(req)) {
        return res.status(403).json({ error: 'Sem permissão. Peça a quem edita clientes.', codigo: 'SEM_PERMISSAO' });
    }
    next();
}

function asyncRoute(fn) {
    return (req, res) => {
        Promise.resolve(fn(req, res)).catch((err) => {
            const status = Number(err?.status) || 500;
            if (status >= 500) console.error('[CadastroPendencias]', err?.message || err);
            if (res.headersSent) return;
            const body = { error: status >= 500 ? 'Erro interno.' : (err?.message || 'Erro.') };
            if (err?.codigo && status < 500) body.codigo = err.codigo;
            res.status(status).json(body);
        });
    };
}

router.use(exigirPermissao);

router.get('/pendentes', asyncRoute(async (req, res) => {
    res.json(await fichaSvc.cadastrosPendentes(req.query));
}));

// "Cadastros a corrigir (nome)" — CPF com nome de 1 palavra (BLOQUEIA a venda quando a chave está ligada)
// e CNPJ sem fantasia (só aviso). Estado derivado, sem coluna. Mesma permissão do router (edita clientes).
// ?vendedor=<id>&tipo=CPF_NOME_UNICO|CNPJ_SEM_FANTASIA&ativo=todos|false&limite=<=500&pagina=1
router.get('/nome', asyncRoute(async (req, res) => {
    const tipo = nomeSvc.TIPOS.includes(String(req.query.tipo || '')) ? String(req.query.tipo) : undefined;
    res.json(await nomeSvc.painel({
        vendedor: req.query.vendedor ? String(req.query.vendedor) : undefined,
        tipo,
        ativo: req.query.ativo ? String(req.query.ativo) : undefined,
        limite: req.query.limite,
        pagina: req.query.pagina,
    }));
}));

// Liga/desliga o bloqueio (SÓ ADMIN — o dono liga quando os cadastros estiverem acertados). Vale NA HORA.
router.post('/nome/config', asyncRoute(async (req, res) => {
    if (!permissoes(req).admin) {
        return res.status(403).json({ error: 'Só o administrador liga ou desliga este bloqueio.', codigo: 'SO_ADMIN' });
    }
    const valor = (req.body || {}).bloquearCpfNomeUnico;
    if (typeof valor !== 'boolean') {
        return res.status(400).json({ error: 'Informe { bloquearCpfNomeUnico: true|false }.' });
    }
    const { anterior, atual } = await nomeSvc.salvarConfig({ bloquearCpfNomeUnico: valor });
    // Auditoria FORA do caminho crítico: a chave JÁ está gravada; log com defeito não desfaz.
    try {
        await prisma.auditLog.create({
            data: {
                acao: 'ALTERAR_CADASTRO_NOME_BLOQUEIO',
                entidade: 'AppConfig',
                entidadeId: nomeSvc.CHAVE,
                detalhes: `Bloqueio de venda para CPF com nome incompleto: ${anterior.bloquearCpfNomeUnico ? 'LIGADO' : 'desligado'} → ${atual.bloquearCpfNomeUnico ? 'LIGADO' : 'desligado'}`,
                usuarioId: req.user.id,
                usuarioNome: req.user.nome || '(sem nome)',
            },
        });
    } catch (logErr) {
        console.error('[CadastroPendencias] audit do bloqueio de nome falhou (a chave JÁ foi gravada):', logErr.message);
    }
    res.json({ config: { bloquearCpfNomeUnico: atual.bloquearCpfNomeUnico } });
}));

// A equipe classifica (CLIENTE | FORNECEDOR | CLIENTE_FORNECEDOR | automatica). Ator = usuário logado.
router.post('/clientes/:id/classificacao', asyncRoute(async (req, res) => {
    res.json({ classificacao: await classif.classificar(req.params.id, req.body, req.user) });
}));

// A equipe pede a inativação de um cadastro (vai para a mesma fila de aprovação dos agentes).
router.post('/clientes/:id/inativacao', asyncRoute(async (req, res) => {
    const r = await inativacao.solicitar(req.params.id, req.body, { id: req.user?.id, nome: req.user?.nome || req.user?.login });
    res.status(r.status).json({ duplicado: r.duplicado, solicitacao: r.solicitacao });
}));

router.get('/inativacoes', asyncRoute(async (req, res) => {
    res.json(await inativacao.listar(req.query));
}));

router.get('/inativacoes/contagem', asyncRoute(async (_req, res) => {
    res.json(await inativacao.contarPendentes());
}));

router.post('/inativacoes/:id/aprovar', asyncRoute(async (req, res) => {
    res.json({ solicitacao: await inativacao.aprovar(req.params.id, req.user, req.body) });
}));

router.post('/inativacoes/:id/recusar', asyncRoute(async (req, res) => {
    res.json({ solicitacao: await inativacao.recusar(req.params.id, req.user, req.body) });
}));

router.podeEditarClientes = podeEditarClientes;
module.exports = router;
