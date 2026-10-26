const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const uploadLead = require('../middlewares/uploadLeadMiddleware');

const podeVerAtendimentos = require('../middlewares/podeVerAtendimentos');
// ?parados=1 lista leads de TODOS os vendedores: exige Pode_Ver_Atendimentos (como /atendimentos/filtros).
const gateParados = (req, res, next) => (req.query.parados === '1' || req.query.parados === 'true') ? podeVerAtendimentos(req, res, next) : next();
router.get('/', gateParados, leadController.listar);
router.get('/rota', leadController.listarParaRota);
router.get('/similares', leadController.similares);
router.get('/por-cliente/:clienteId', leadController.buscarPorCliente);
router.get('/:id', leadController.detalhar);
router.post('/', leadController.criar);
router.put('/:id', leadController.atualizar);
router.post('/:id/finalizar', leadController.finalizar);
router.post('/:id/foto', uploadLead.single('foto'), leadController.uploadFoto);
router.post('/:id/referenciar', leadController.referenciarCliente);
router.delete('/:id', leadController.excluir);

module.exports = router;
