const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const clienteContatoController = require('../controllers/clienteContatoController');
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
router.get('/:uuid/sugestao-tipo-pedido', clienteController.sugestaoTipoPedido); // tipo sugerido p/ Novo Pedido
// Histórico do endereço (quem/quando/restaurar/ver no mapa) — ANTES de '/:uuid'
router.get('/:uuid/endereco-historico', clienteController.enderecoHistorico);
router.get('/:uuid/endereco-historico/:eventoId/geocode', clienteController.enderecoHistoricoGeocode);
router.post('/:uuid/endereco-historico/:eventoId/restaurar', clienteController.enderecoHistoricoRestaurar);
router.patch('/:uuid/retomar-visitas', clienteController.retomarVisitas); // ANTES de PATCH '/:uuid'
router.get('/:uuid/contatos', clienteContatoController.listar);
router.post('/:uuid/contatos', clienteContatoController.criar);
router.patch('/:uuid/contatos/:contatoId', clienteContatoController.atualizar);
router.delete('/:uuid/contatos/:contatoId', clienteContatoController.excluir);
router.get('/:uuid', clienteController.detalhar);
router.patch('/:uuid', clienteController.atualizar);

// Futuro: PATCH para atualizar dados internos (GPS, Dias, etc)

module.exports = router;
