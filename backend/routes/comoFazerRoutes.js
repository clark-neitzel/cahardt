// Como Fazer — rotas. Montada em /api/como-fazer SEM authMiddleware: a autenticação é interna
// (aparelho + token de tablet OU login do app). Erro sempre { erro, codigo }.
//   P = público com chave do aparelho · T = tablet ou app · A = só app + permissão
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../services/comoFazerAuthService');
const svc = require('../services/comoFazerService');
const painel = require('../services/comoFazerPainelService');
const upl = require('../middlewares/uploadComoFazerMiddleware');
const agenda = require('../services/comoFazerAgendaService');

const { erro, exigirPermissao } = auth;

// Parser JSON: 100 KB padrão; 2 MB só em criar conteúdo e salvar o documento (rascunho), depois da checagem de permissão.
// (index.js não aplica o parser global em /api/como-fazer.)
const jsonPequeno = express.json();
const jsonGrande = express.json({ limit: '2mb' });
const rotaDocumentoGrande = (req) => ['PUT', 'POST'].includes(req.method) && /^\/admin\/conteudos(\/[^/]+\/rascunho)?\/?$/.test(req.path);
router.use((req, res, next) => (rotaDocumentoGrande(req) ? next() : jsonPequeno(req, res, next)));
const { ErroCF } = svc;

// executa o handler e converte ErroCF / erro inesperado em { erro, codigo }
const h = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (e) {
        if (e instanceof ErroCF) return erro(res, e.status, e.codigo, e.message, e.extra);
        console.error(`[ComoFazer] ${req.method} ${req.originalUrl}:`, e);
        return erro(res, 500, 'ERRO_INTERNO', 'Não consegui concluir. Tente de novo.');
    }
};

const ESCOPO_PAINEL = exigirPermissao('Pode_Ver_Painel_Como_Fazer');
const ESCOPO_EDITAR = exigirPermissao('Pode_Editar_Como_Fazer');

// ═════════ P — entrar no tablet (sem login) ═════════
async function checarAparelho(req, setor) {
    return auth.chaveConfere(setor.codigo, req.headers['x-cf-aparelho']);
}

router.get('/tablet/:setor/funcionarios', h(async (req, res) => {
    const setor = await auth.setorPorSlug(req.params.setor);
    if (!setor) return erro(res, 404, 'SETOR_INVALIDO', 'Setor não encontrado.');
    if (!setor.ativo) return erro(res, 404, 'SETOR_INATIVO', 'Este setor foi desativado pelo RH.');
    if (!(await checarAparelho(req, setor))) return erro(res, 401, 'APARELHO_NAO_AUTORIZADO', 'Este aparelho ainda não foi liberado. Peça ao RH o link de liberação.');
    const lista = await prisma.funcionario.findMany({
        where: { ativo: true, setor: setor.codigo, senhaNumerica: true },
        select: { id: true, nome: true, foto: true }, orderBy: { nome: 'asc' },
    });
    res.json({
        setor: { slug: setor.slug, nome: setor.nome, icone: setor.icone || null },
        funcionarios: lista.map(f => ({ id: f.id, nome: f.nome, primeiroNome: String(f.nome).trim().split(/\s+/)[0], foto: f.foto || null })),
    });
}));

router.post('/tablet/:setor/entrar', h(async (req, res) => {
    const setor = await auth.setorPorSlug(req.params.setor);
    if (!setor) return erro(res, 404, 'SETOR_INVALIDO', 'Setor não encontrado.');
    if (!setor.ativo) return erro(res, 404, 'SETOR_INATIVO', 'Este setor foi desativado pelo RH.');
    if (!(await checarAparelho(req, setor))) return erro(res, 401, 'APARELHO_NAO_AUTORIZADO', 'Este aparelho ainda não foi liberado. Peça ao RH o link de liberação.');
    const { funcionarioId, pin } = req.body || {};
    if (!funcionarioId || typeof funcionarioId !== 'string') return erro(res, 400, 'DADOS_INVALIDOS', 'Escolha a sua foto.');

    const ip = auth.ipDe(req);
    const chaves = [`func:${funcionarioId}`, `ip:${ip}`];
    const espera = auth.segundosBloqueado(chaves);
    if (espera > 0) return erro(res, 429, 'AGUARDE', 'Chame o encarregado e espere um pouco.', { segundos: espera });

    const f = await prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { id: true, nome: true, foto: true, setor: true, cargo: true, ativo: true, senhaHash: true, senhaNumerica: true },
    });
    if (!f || f.setor !== setor.codigo) return erro(res, 401, 'PIN_INCORRETO', 'Número errado.');
    if (!f.ativo) return erro(res, 403, 'FUNCIONARIO_INATIVO', 'Este cadastro está inativo.');
    if (!f.senhaNumerica || !f.senhaHash) return erro(res, 409, 'SEM_PIN', 'Você ainda não tem senha de 4 números. Fale com o RH.');

    const ok = /^\d{4}$/.test(String(pin || '')) && await bcrypt.compare(String(pin), f.senhaHash);
    if (!ok) {
        console.warn(`[ComoFazer] PIN errado funcionario=${f.id} ip=${ip}`); // nunca loga o PIN
        const r = auth.registrarErroPin(chaves);
        if (r.bloqueado) return erro(res, 429, 'AGUARDE', 'Chame o encarregado e espere um pouco.', { segundos: r.segundos });
        return erro(res, 401, 'PIN_INCORRETO', 'Número errado.', { tentativasRestantes: r.tentativasRestantes });
    }
    auth.limparErrosPin(chaves);
    const { token, expiraEm } = auth.emitirTokenTablet({ funcionarioId: f.id, setor: f.setor });
    res.json({ token, expiraEm, funcionario: { id: f.id, nome: f.nome, foto: f.foto || null, setor: f.setor } });
}));

// ═════════ daqui para baixo: tablet OU app ═════════
router.use(auth.comoFazerAuth);

// ═════════ T — equipe ═════════
router.post('/sessao/renovar', h(async (req, res) => {
    if (req.cf.origem !== 'TABLET') return erro(res, 409, 'SEM_SESSAO_TABLET', 'Não há sessão de tablet para renovar.');
    const f = await prisma.funcionario.findUnique({ where: { id: req.cf.funcionarioId }, select: { ativo: true, setor: true } });
    if (!f || !f.ativo) return erro(res, 401, 'SESSAO_EXPIROU', 'Sua sessão terminou. Escolha sua foto de novo.');
    const st = f.setor ? await auth.setorPorCodigo(f.setor) : null;
    if (!st || !st.ativo) return erro(res, 401, 'SETOR_INATIVO', 'Este setor foi desativado pelo RH.');
    res.json(auth.emitirTokenTablet({ funcionarioId: req.cf.funcionarioId, setor: f.setor }));
}));

router.get('/me', h(async (req, res) => res.json(await svc.me(req.cf))));

router.get('/home', h(async (req, res) => res.json(await svc.home(req.cf, req.query.setor))));

router.get('/conteudos/:id', h(async (req, res) => {
    res.json(await svc.abrirConteudo(req.cf, req.params.id, req.query.previa === '1'));
}));

router.post('/conteudos/:id/aprendi', h(async (req, res) => {
    const r = await svc.aprendi(req.cf, req.params.id);
    res.status(r.criado ? 201 : 200).json({ treinamento: r.treinamento });
}));

router.get('/encarregados', h(async (req, res) => res.json(await svc.encarregados(req.cf, req.query.setor))));

router.post('/conteudos/:id/confirmar', h(async (req, res) => {
    res.json(await svc.confirmar(req.cf, req.params.id, req.body || {}, auth.ipDe(req)));
}));

router.post('/conteudos/:id/execucoes', h(async (req, res) => {
    const r = await svc.executar(req.cf, req.params.id, req.body);
    res.status(r.status).json(r.corpo);
}));

router.get('/conteudos/:id/execucoes/hoje', h(async (req, res) => res.json(await svc.execucoesHoje(req.params.id))));

router.post('/conteudos/:id/chamar-encarregado', h(async (req, res) => {
    res.status(201).json(await svc.chamarEncarregado(req.cf, req.params.id, req.body?.secaoId));
}));

// upload: tablet/app (contexto=execucao) · contexto=conteudo exige Pode_Editar_Como_Fazer
router.post('/upload', upl.receberArquivo, h(async (req, res) => {
    if (!req.file) return erro(res, 400, 'DADOS_INVALIDOS', 'Envie o arquivo no campo "arquivo".');
    const contexto = String((req.body?.contexto || req.query.contexto || 'execucao')).toLowerCase();
    if (!['execucao', 'conteudo'].includes(contexto)) return erro(res, 400, 'DADOS_INVALIDOS', 'Contexto inválido.');
    if (contexto === 'conteudo' && !auth.temPermissao(req, 'Pode_Editar_Como_Fazer')) return erro(res, 403, 'SEM_PERMISSAO', 'Você não tem permissão para isso.');
    try {
        const r = upl.gravar(req.file, contexto, req.body?.conteudoId || req.query.conteudoId, agenda.hojeSP().slice(0, 7));
        res.status(201).json({ url: r.url, tipo: r.tipo });
    } catch (e) {
        if (e.codigoCF) return erro(res, e.http || 400, e.codigoCF, e.message);
        throw e;
    }
}));

// ═════════ A — painel ═════════
router.get('/painel/resumo', ESCOPO_PAINEL, h(async (req, res) => res.json(await painel.resumo(req.query))));
router.get('/painel/treinamentos', ESCOPO_PAINEL, h(async (req, res) => res.json(await painel.treinamentos(req.query.setor))));
router.post('/painel/treinamentos/lembrar', ESCOPO_EDITAR, h(async (req, res) => res.status(201).json(await painel.lembrar(req.cf, req.body || {}))));
router.get('/painel/execucoes', ESCOPO_PAINEL, h(async (req, res) => res.json(await painel.execucoes(req.query))));
router.get('/painel/relatorio', ESCOPO_PAINEL, h(async (req, res) => res.json(await painel.relatorio(req.query))));

// ═════════ A — editor ═════════
router.get('/admin/conteudos', ESCOPO_EDITAR, h(async (req, res) => res.json(await svc.listarAdmin(req.query))));
router.post('/admin/conteudos', ESCOPO_EDITAR, jsonGrande, h(async (req, res) => res.status(201).json(await svc.criarConteudo(req.cf, req.body))));
router.get('/admin/conteudos/:id', ESCOPO_EDITAR, h(async (req, res) => res.json(await svc.detalheAdmin(req.params.id))));
router.put('/admin/conteudos/:id', ESCOPO_EDITAR, h(async (req, res) => {
    const r = await svc.atualizarConteudo(req.cf, req.params.id, req.body);
    res.json(r);
}));
router.put('/admin/conteudos/:id/rascunho', ESCOPO_EDITAR, jsonGrande, h(async (req, res) => {
    res.json(await svc.salvarRascunho(req.cf, req.params.id, req.body?.doc));
}));
router.post('/admin/conteudos/:id/publicar', ESCOPO_EDITAR, h(async (req, res) => {
    res.json(await svc.publicar(req.cf, req.params.id, req.body || {}));
}));
router.post('/admin/conteudos/:id/arquivar', ESCOPO_EDITAR, h(async (req, res) => res.json(await svc.arquivar(req.cf, req.params.id))));
router.post('/admin/conteudos/:id/sincronizar-agenda', ESCOPO_EDITAR, h(async (req, res) => res.json(await svc.sincronizarAgenda(req.cf, req.params.id))));

router.post('/admin/tablet/:setor/parear', ESCOPO_EDITAR, h(async (req, res) => {
    const setor = await auth.setorPorSlug(req.params.setor);
    if (!setor) return erro(res, 404, 'SETOR_INVALIDO', 'Setor não encontrado.');
    if (!setor.ativo) return erro(res, 409, 'SETOR_INATIVO', 'Este setor está desativado. Reative-o antes de parear um tablet.');
    const chave = await auth.gerarChaveAparelho(setor.codigo, req.cf.vendedorId);
    const origem = req.headers.origin || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`;
    res.json({ setor: setor.slug, link: `${origem}/setor/${setor.slug}#k=${chave}`, chave });
}));

// qualquer rota do módulo que não existe: 404 no formato do módulo
router.use((req, res) => erro(res, 404, 'ROTA_NAO_ENCONTRADA', 'Rota não encontrada.'));

module.exports = router;
