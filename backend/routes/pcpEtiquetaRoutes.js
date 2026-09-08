const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { pesoPacoteDaApi } = require('../utils/pesoPacote');

async function getPerms(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

function temPerm(perms) {
    return perms.admin || !!perms.pcp?.etiquetas;
}

// GET /api/pcp/etiquetas — listar
router.get('/', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!temPerm(perms)) return res.status(403).json({ error: 'Sem permissão.' });

        const { search, ativo } = req.query;
        const where = {};
        if (ativo !== undefined) where.ativo = ativo === 'true';
        if (search?.trim()) {
            where.OR = [
                { nomeProduto: { contains: search.trim(), mode: 'insensitive' } },
                { codigoProduto: { contains: search.trim(), mode: 'insensitive' } },
            ];
        }

        const lista = await prisma.etiquetaProduto.findMany({
            where,
            include: { produto: { select: { id: true, nome: true, codigo: true, validadeDias: true, quantidadePorCaixa: true, categoriaProduto: { select: { id: true, nome: true } } } } },
            orderBy: { nomeProduto: 'asc' },
        });
        return res.json(lista);
    } catch (err) {
        console.error('[Etiqueta] listar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/pcp/etiquetas/:id — detalhe
router.get('/:id', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!temPerm(perms)) return res.status(403).json({ error: 'Sem permissão.' });

        const item = await prisma.etiquetaProduto.findUnique({
            where: { id: req.params.id },
            include: { produto: { select: { id: true, nome: true, codigo: true, validadeDias: true, quantidadePorCaixa: true, categoriaProduto: { select: { id: true, nome: true } } } } },
        });
        if (!item) return res.status(404).json({ error: 'Etiqueta não encontrada.' });
        return res.json(item);
    } catch (err) {
        console.error('[Etiqueta] detalhe:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/pcp/etiquetas — criar
router.post('/', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!temPerm(perms)) return res.status(403).json({ error: 'Sem permissão.' });

        const data = sanitize(req.body);
        const item = await prisma.etiquetaProduto.create({ data });
        return res.status(201).json(item);
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ error: err.message });
        console.error('[Etiqueta] criar:', err.message);
        // P2002 não deve mais ocorrer para produtoId (removido @unique)
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/pcp/etiquetas/:id — atualizar
router.put('/:id', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!temPerm(perms)) return res.status(403).json({ error: 'Sem permissão.' });

        const data = sanitize(req.body);
        const item = await prisma.etiquetaProduto.update({ where: { id: req.params.id }, data });
        return res.json(item);
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ error: err.message });
        console.error('[Etiqueta] atualizar:', err.message);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Etiqueta não encontrada.' });
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/pcp/etiquetas/:id — remover
router.delete('/:id', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!temPerm(perms)) return res.status(403).json({ error: 'Sem permissão.' });

        await prisma.etiquetaProduto.delete({ where: { id: req.params.id } });
        return res.json({ ok: true });
    } catch (err) {
        console.error('[Etiqueta] remover:', err.message);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Etiqueta não encontrada.' });
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/pcp/etiquetas/:id/toggle — ativar/inativar
router.patch('/:id/toggle', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!temPerm(perms)) return res.status(403).json({ error: 'Sem permissão.' });

        const atual = await prisma.etiquetaProduto.findUnique({ where: { id: req.params.id }, select: { ativo: true } });
        if (!atual) return res.status(404).json({ error: 'Etiqueta não encontrada.' });

        const item = await prisma.etiquetaProduto.update({
            where: { id: req.params.id },
            data: { ativo: !atual.ativo },
        });
        return res.json(item);
    } catch (err) {
        console.error('[Etiqueta] toggle:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// Peso do pacote: validação única, compartilhada com a importação em lote
// (backend/utils/pesoPacote.js). Valor ilegível ou fora da faixa vira ERRO 400 —
// nunca null calado (null silencioso já apagou peso que estava gravado).
class ErroValidacao extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = 'ErroValidacao';
        this.status = 400;
    }
}

// Gramas inteiras (1..999999) ou null. Lança ErroValidacao quando o valor não serve.
function gramasOuNull(v) {
    const r = pesoPacoteDaApi(v);
    if (!r.ok) throw new ErroValidacao(r.erro);
    return r.gramas;
}

function sanitize(body) {
    return {
        produtoId:             body.produtoId             || null,
        codigoProduto:         String(body.codigoProduto  || ''),
        nomeProduto:           String(body.nomeProduto    || ''),
        pesoUnitario:          parseInt(body.pesoUnitario)          || 0,
        pesoTabelaNutricional: parseInt(body.pesoTabelaNutricional) || 0,
        valorEnergetico:       body.valorEnergetico   || null,
        carboidratos:          body.carboidratos       || null,
        acucaresTotais:        body.acucaresTotais      || null,
        acucaresAdicionados:   body.acucaresAdicionados || null,
        proteinas:             body.proteinas          || null,
        gordurasTotais:        body.gordurasTotais     || null,
        gordurasSaturadas:     body.gordurasSaturadas  || null,
        gordurasTrans:         body.gordurasTrans      || null,
        fibraAlimentar:        body.fibraAlimentar     || null,
        sodio:                 body.sodio              || null,
        quantidadeEmbalagem:   parseInt(body.quantidadeEmbalagem) || 1,
        quantidadeAproximada:  Boolean(body.quantidadeAproximada),
        // Peso do pacote em GRAMAS (fixo, digitado em kg no formulário). null/'' limpa o peso
        // (a etiqueta volta ao cálculo antigo: quantidade × peso unitário); valor ilegível ou
        // fora de 1..999999 g é RECUSADO com 400, nunca gravado como null.
        // Chave AUSENTE no corpo não mexe no valor já gravado (frontend antigo não apaga o campo).
        ...(body.pesoPacote !== undefined ? { pesoPacote: gramasOuNull(body.pesoPacote) } : {}),
        composicao:            String(body.composicao   || ''),
        modoPreparo:           String(body.modoPreparo  || ''),
        codigoBarras:          body.codigoBarras        || null,
        contemLeite:           Boolean(body.contemLeite),
        contemGluten:          Boolean(body.contemGluten),
        contemLactose:         Boolean(body.contemLactose),
        contemOvo:             Boolean(body.contemOvo),
        alergenos:             Array.isArray(body.alergenos) ? body.alergenos.filter(Boolean) : [],
        especieCrustaceos:     body.especieCrustaceos   || null,
        especiePeixes:         body.especiePeixes        || null,
        outrosAlergenos:       body.outrosAlergenos    || null,
        avisosRotulo:          body.avisosRotulo        || null,
        armazenamento:         body.armazenamento       || null,
        validadeDias:          parseInt(body.validadeDias) || 90,
        ativo:                 body.ativo !== undefined ? Boolean(body.ativo) : true,
        tipoProduto:           body.tipoProduto         || null,
        tarjaPreta:            Boolean(body.tarjaPreta),
    };
}

module.exports = router;
