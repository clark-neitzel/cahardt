const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const condicaoPagamentoController = require('../controllers/condicaoPagamentoController');

// Rotas para Clientes
router.get('/', clienteController.listar);
router.get('/buscar-global', clienteController.buscarGlobal); // Busca global (ignora filtro por vendedor)
router.get('/consulta-cnpj/:cnpj', clienteController.consultarCnpj); // Pré-preenchimento do cadastro (Receita + IE SEFAZ)
router.post('/', clienteController.criar); // Criar cliente novo (cadastro 100% pelo app)
router.post('/sync', clienteController.sincronizar); // Desativado (cadastro não vem mais do CA)
router.put('/lote', clienteController.atualizarLote); // Atualização em lote
router.get('/condicoes-pagamento', condicaoPagamentoController.listar); // Nova rota
router.get('/:uuid/inadimplencia', clienteController.obterInadimplencia);
router.get('/:uuid', clienteController.detalhar);
router.patch('/:uuid', clienteController.atualizar);

// Futuro: PATCH para atualizar dados internos (GPS, Dias, etc)

module.exports = router;
