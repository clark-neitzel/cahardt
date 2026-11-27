const express = require('express');
const router = express.Router();
const categoriaClienteService = require('../services/categoriaClienteService');

// Escrita (criar/editar/excluir categoria de cliente). Antes não havia check nenhum: qualquer usuário logado gravava.
// Agora grava quem JÁ gravava pela tela ou pelo cadastro:
//   - admin;
//   - quem edita Configurações — a tela mora em /config/categorias-cliente. É a MESMA régua de escrita de
//     routes/configRoutes.js (`podeEditarConfig`): `configuracoes` true (legado) ou objeto com `edit: true`;
//   - quem tem `clientes.edit` ("Gerenciar Clientes"), a régua do cadastro de clientes (clienteController.criar).
// Leitura (GET) segue aberta a quem está logado (as telas de lead/rota usam a lista).
// Permissão é OBJETO no projeto: ler a chave exata, nunca `!!perms.configuracoes` / `!!perms.clientes`.
const podeEditarConfig = (p) => !!(p.admin === true || p.configuracoes === true || (p.configuracoes && typeof p.configuracoes === 'object' && p.configuracoes.edit === true)); // espelho de configRoutes.js
const podeEscreverCategoriasCliente = (p) => !!(p && (podeEditarConfig(p) || p.admin || p.clientes?.edit));
function checkEscrita(req, res, next) {
    const bruto = req.user?.permissoes;
    let perms = {};
    try { perms = typeof bruto === 'string' ? JSON.parse(bruto) : (bruto || {}); } catch (_) { perms = {}; }
    if (!podeEscreverCategoriasCliente(perms)) {
        return res.status(403).json({ error: 'Sem permissão para alterar categorias de cliente.' });
    }
    next();
}

router.get('/', async (req, res) => {
    try {
        const categorias = await categoriaClienteService.listar();
        res.json(categorias);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await categoriaClienteService.detalhar(id);
        if (!categoria) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }
        res.json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/', checkEscrita, async (req, res) => {
    try {
        const categoria = await categoriaClienteService.criar(req.body);
        res.status(201).json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', checkEscrita, async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await categoriaClienteService.atualizar(id, req.body);
        res.json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', checkEscrita, async (req, res) => {
    try {
        const { id } = req.params;
        await categoriaClienteService.deletar(id);
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
module.exports.podeEscreverCategoriasCliente = podeEscreverCategoriasCliente;
