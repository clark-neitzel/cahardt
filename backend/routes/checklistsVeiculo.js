// Checklist de veículo por foto + IA. Montado em /api/checklists-veiculo (com authMiddleware no index.js).
// Fotos gravadas em backend/uploads/checklists-veiculo (via services/checklistVeiculoService.js).
const express = require('express');
const router = express.Router();
const svc = require('../services/checklistVeiculoService');
const avisos = require('../services/checklistAvisosService');
const pendSvc = require('../services/checklistPendenciasService');
const { receberFoto } = require('../middlewares/uploadFotoChecklistMiddleware');

const rota = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (e) {
        if (e instanceof svc.ErroChecklist || e instanceof pendSvc.ErroPendencia) {
            return res.status(e.status).json({ error: e.message, codigo: e.codigo });
        }
        console.error('[ChecklistVeiculo] erro inesperado:', e);
        res.status(500).json({ error: 'Erro interno ao processar o checklist.', codigo: 'ERRO_INTERNO' });
    }
};

// Chave do modo (declarar ANTES de /:id)
router.get('/config/modo', rota(async (req, res) => {
    res.json({ modo: await svc.getModo() });
}));

router.put('/config/modo', rota(async (req, res) => {
    if (!svc.ehAdmin(req.user)) {
        return res.status(403).json({ error: 'Só administrador altera o modo do checklist.', codigo: 'SEM_PERMISSAO' });
    }
    res.json({ modo: await svc.setModo(req.body?.modo) });
}));

// Quem libera / dá OK (Dia 3). ANTES de /:id.
router.get('/config/responsaveis', rota(async (req, res) => {
    if (!svc.ehAdmin(req.user)) {
        return res.status(403).json({ error: 'Só administrador vê e altera quem libera e dá OK.', codigo: 'SEM_PERMISSAO' });
    }
    res.json(await pendSvc.obterConfigResponsaveis());
}));

router.put('/config/responsaveis', rota(async (req, res) => {
    if (!svc.ehAdmin(req.user)) {
        return res.status(403).json({ error: 'Só administrador altera quem libera e dá OK.', codigo: 'SEM_PERMISSAO' });
    }
    res.json(await pendSvc.salvarConfigResponsaveis(req.body));
}));

// Pendências dos veículos (volta sem foto etc.) e o OK do responsável. ANTES de /:id.
router.get('/pendencias', rota(async (req, res) => {
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 30, 1), 90);
    res.json(await pendSvc.listarParaTela(req.user, { dias }));
}));

router.post('/pendencias/ok', rota(async (req, res) => {
    res.json(await pendSvc.darOk(req.body, req.user));
}));

router.post('/', rota(async (req, res) => {
    res.json(await svc.criarRascunho(req.user, req.body));
}));

router.get('/:id', rota(async (req, res) => {
    res.json(await svc.detalhe(req.params.id, req.user));
}));

router.patch('/:id', rota(async (req, res) => {
    res.json(await svc.atualizarRascunho(req.params.id, req.user, req.body));
}));

router.post('/:id/fotos', receberFoto, rota(async (req, res) => {
    const r = await svc.enviarFoto(req.params.id, req.user, req.body?.angulo, req.file, { complemento: req.body?.complemento });
    res.status(201).json(r);
}));

// "Tá certo assim": motorista discorda da IA numa foto ATENCAO/REFAZER (só modo TESTE; REPROVA nunca)
router.post('/:id/fotos/:fotoId/aceitar', rota(async (req, res) => {
    res.json(await svc.aceitarFoto(req.params.id, req.params.fotoId, req.user, req.body));
}));

router.post('/:id/pular', rota(async (req, res) => {
    res.json(await svc.pularFoto(req.params.id, req.user, req.body));
}));

router.post('/:id/avaliar', rota(async (req, res) => {
    res.json(await svc.avaliar(req.params.id, req.user, req.body));
}));

router.post('/:id/responder', rota(async (req, res) => {
    const r = await svc.responderPergunta(req.params.id, req.user, req.body);
    res.json(r);
    // Aviso na hora (WhatsApp) FORA do request do motorista: nunca await, falha nunca afeta a resposta
    if (r && r.resposta === 'NAO') {
        const { id } = req.params; const { angulo, indice } = r;
        setImmediate(() => { avisos.aoResponderNao(id, angulo, indice).catch((e) => console.error('[ChecklistAvisos] aviso NAO:', e.message)); });
    }
}));

router.post('/:id/decisao', rota(async (req, res) => {
    const r = await svc.registrarDecisao(req.params.id, req.user, req.body);
    res.json(r);
    if (r && r.decisao === 'SEGUIU_TESTE') {
        const { id } = req.params;
        setImmediate(() => { avisos.aoSeguirReprovado(id).catch((e) => console.error('[ChecklistAvisos] aviso seguiu:', e.message)); });
    }
}));

module.exports = router;
