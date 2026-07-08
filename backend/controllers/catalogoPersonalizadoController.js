const service = require('../services/catalogoPersonalizadoService');
const prisma = require('../config/database');

// POST /api/catalogo-personalizado  (privado)
// body: { clienteUuid, condicaoId, validadeDias, produtoIds:[], titulo?, observacoes? }
async function gerar(req, res) {
    try {
        const { clienteUuid, clienteNome, condicaoId, produtoIds, titulo, observacoes } = req.body || {};

        // Dados do vendedor logado (para o snapshot: nome + telefone do WhatsApp)
        let vendedor = { id: req.user?.id, nome: req.user?.nome || null, telefone: null };
        try {
            if (req.user?.id) {
                const v = await prisma.vendedor.findUnique({
                    where: { id: req.user.id },
                    select: { nome: true, telefone: true }
                });
                if (v) vendedor = { id: req.user.id, nome: v.nome, telefone: v.telefone };
            }
        } catch (_) { /* segue com o que veio do token */ }

        const catalogo = await service.criar({
            vendedor, clienteUuid, clienteNome, condicaoId, produtoIds, titulo, observacoes
        });

        return res.status(201).json({
            ok: true,
            id: catalogo.id,
            token: catalogo.token,
            total: Number(catalogo.total) || 0,
            validadeEm: catalogo.validadeEm,
            qtdItens: catalogo.itens?.length || 0
        });
    } catch (err) {
        console.error('[CatalogoPersonalizado] gerar:', err.message);
        return res.status(err.status || 500).json({ error: err.message || 'Erro ao gerar catálogo.' });
    }
}

// GET /api/catalogo-personalizado  (privado) — meus catálogos gerados
async function listarMeus(req, res) {
    try {
        const lista = await service.listarDoVendedor(req.user?.id, { limit: req.query.limit });
        return res.json(lista);
    } catch (err) {
        console.error('[CatalogoPersonalizado] listarMeus:', err.message);
        return res.status(500).json({ error: 'Erro ao listar catálogos.' });
    }
}

// DELETE /api/catalogo-personalizado/:id  (privado) — arquiva
async function arquivar(req, res) {
    try {
        await service.remover(req.params.id, req.user?.id);
        return res.json({ ok: true });
    } catch (err) {
        console.error('[CatalogoPersonalizado] arquivar:', err.message);
        return res.status(err.status || 500).json({ error: err.message || 'Erro ao remover catálogo.' });
    }
}

// GET /api/catalogo-personalizado-publico/:token  (PÚBLICO, sem login)
async function publicoPorToken(req, res) {
    try {
        const dados = await service.obterPublico(req.params.token);
        if (!dados) return res.status(404).json({ error: 'Lista não encontrada ou removida.' });
        return res.json(dados);
    } catch (err) {
        console.error('[CatalogoPersonalizado] publicoPorToken:', err.message);
        return res.status(500).json({ error: 'Erro ao carregar a lista.' });
    }
}

module.exports = { gerar, listarMeus, arquivar, publicoPorToken };
