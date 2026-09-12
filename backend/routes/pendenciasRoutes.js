// Central de Pendências (A3, 09/2026) — GET /api/pendencias agrega em uma chamada
// só o que está esperando um clique do escritório/gerência. Montado em index.js com
// authMiddleware (req.user.permissoes já vem atualizado do banco a cada request).
// Permissão: Pode_Ver_Pendencias (nova, registrada no BOOL_INDEX de PermissoesModal.jsx)
// ou quem já tem admin / Pode_Acessar_Financeiro_Gerencial.
const express = require('express');
const router = express.Router();
const pendenciasService = require('../services/pendenciasService');

const temPermissao = (permissoes = {}) =>
    !!permissoes.admin || !!permissoes.Pode_Acessar_Financeiro_Gerencial || !!permissoes.Pode_Ver_Pendencias;

router.get('/', async (req, res) => {
    try {
        const permissoes = req.user?.permissoes || {};
        if (!temPermissao(permissoes)) {
            return res.status(403).json({ error: 'Sem permissão para acessar a Central de Pendências.' });
        }
        const limitePorBloco = req.query.limite ? parseInt(req.query.limite, 10) : 5;
        const resultado = await pendenciasService.listarPendencias({ usuario: req.user, limitePorBloco });
        res.json(resultado);
    } catch (error) {
        console.error('[Pendências] Erro ao montar a Central de Pendências:', error);
        res.status(500).json({ error: 'Erro ao carregar a Central de Pendências.' });
    }
});

module.exports = router;
