const express = require('express');
const router = express.Router();
const estoqueService = require('../services/estoqueService');
const prisma = require('../config/database');

// Busca permissões frescas do banco (o JWT pode estar desatualizado)
async function getPermsFromDB(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

// Verifica se o usuário tem permissão de estoque para a categoria e tipo de operação
function verificarPermissaoEstoque(permissoes, categoriasProduto, tipo) {
    if (!permissoes) return false;
    if (permissoes.admin) return true;
    const regraEstoque = permissoes.estoque;
    if (!Array.isArray(regraEstoque)) return false;

    return regraEstoque.some(regra => {
        const categoriaOk = !regra.categoria || categoriasProduto.includes(regra.categoria);
        const tipoOk = Array.isArray(regra.pode) && regra.pode.includes(tipo === 'ENTRADA' ? 'adicionar' : 'diminuir');
        return categoriaOk && tipoOk;
    });
}

// POST /api/estoque/ajuste — ajuste manual de estoque
router.post('/ajuste', async (req, res) => {
    try {
        const { produtoId, tipo, quantidade, observacao } = req.body;
        const vendedorId = req.user?.id;
        const permissoes = await getPermsFromDB(req.user.id);

        if (!produtoId || !tipo || !quantidade) {
            return res.status(400).json({ error: 'produtoId, tipo e quantidade são obrigatórios.' });
        }
        if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
            return res.status(400).json({ error: 'tipo deve ser ENTRADA ou SAIDA.' });
        }
        if (parseFloat(quantidade) <= 0) {
            return res.status(400).json({ error: 'quantidade deve ser maior que zero.' });
        }

        // Verifica permissão de estoque
        if (!permissoes.admin) {
            const produto = await prisma.produto.findUnique({
                where: { id: produtoId },
                select: { categoria: true }
            });
            const categorias = produto?.categoria ? [produto.categoria] : [];
            if (!verificarPermissaoEstoque(permissoes, categorias, tipo)) {
                return res.status(403).json({ error: 'Você não tem permissão para realizar este tipo de ajuste nesta categoria.' });
            }
        }

        const resultado = await estoqueService.ajustar({
            produtoId,
            vendedorId,
            tipo,
            quantidade: parseFloat(quantidade),
            motivo: 'AJUSTE_MANUAL',
            observacao
        });

        return res.json(resultado);
    } catch (err) {
        console.error('[Estoque] Erro ajuste manual:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// Extrai as categorias permitidas pelas regras de estoque do usuário
function categoriasPermitidasEstoque(permissoes) {
    if (!permissoes || permissoes.admin) return null; // null = sem restrição
    const regras = Array.isArray(permissoes.estoque) ? permissoes.estoque : [];
    if (regras.length === 0) return []; // sem regras = não vê nada
    // Se alguma regra tem categoria vazia, significa "todas"
    if (regras.some(r => !r.categoria)) return null;
    return [...new Set(regras.map(r => r.categoria).filter(Boolean))];
}

// GET /api/estoque/posicao — produtos com saldo de estoque para a tela Posição
router.get('/posicao', async (req, res) => {
    try {
        const { search, categorias, categoriasComerciais } = req.query;
        const permissoes = await getPermsFromDB(req.user.id);

        const where = { ativo: true };

        // Restrição por permissão de estoque (não-admin só vê categorias configuradas)
        const catPermitidas = categoriasPermitidasEstoque(permissoes);
        if (catPermitidas !== null) {
            if (catPermitidas.length === 0) return res.json([]);
            where.categoria = { in: catPermitidas };
        }

        if (search?.trim()) {
            where.OR = [
                { nome: { contains: search.trim(), mode: 'insensitive' } },
                { codigo: { contains: search.trim(), mode: 'insensitive' } }
            ];
        }

        if (categorias) {
            const cats = categorias.split(',').map(c => c.trim()).filter(Boolean);
            if (cats.length > 0) {
                // Intersecta com as categorias permitidas
                if (catPermitidas !== null) {
                    const permitidoSet = new Set(catPermitidas);
                    const filtradas = cats.filter(c => permitidoSet.has(c));
                    if (filtradas.length === 0) return res.json([]);
                    where.categoria = { in: filtradas };
                } else {
                    where.categoria = { in: cats };
                }
            }
        }

        if (categoriasComerciais) {
            const cats = categoriasComerciais.split(',').map(c => c.trim()).filter(Boolean);
            if (cats.length > 0) where.categoriaProdutoId = { in: cats };
        }

        const produtos = await prisma.produto.findMany({
            where,
            select: {
                id: true,
                nome: true,
                codigo: true,
                unidade: true,
                categoria: true,
                estoqueTotal: true,
                estoqueReservado: true,
                estoqueDisponivel: true,
                estoqueMinimo: true,
                quantidadePorCaixa: true,
                categoriaProduto: { select: { id: true, nome: true } }
            },
            orderBy: [{ categoria: 'asc' }, { nome: 'asc' }]
        });

        return res.json(produtos);
    } catch (err) {
        console.error('[Estoque] Erro posição:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/estoque/analise-demanda — comparativo de saída líquida entre quinzenas
router.get('/analise-demanda', async (req, res) => {
    try {
        const { search, categorias, categoriasComerciais } = req.query;
        const permissoes = await getPermsFromDB(req.user.id);
        const resultado = await estoqueService.getAnaliseDemanda({ search, categorias, categoriasComerciais, permissoes });
        return res.json(resultado);
    } catch (err) {
        console.error('[Estoque] Erro análise demanda:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/estoque/historico — listagem de movimentações
router.get('/historico', async (req, res) => {
    try {
        const { produtoId, nomeProduto, vendedorId, motivo, tipo, dataInicio, dataFim, pagina, tamanhoPagina } = req.query;
        const resultado = await estoqueService.listarMovimentacoes({
            produtoId,
            nomeProduto,
            vendedorId,
            motivo,
            tipo,
            dataInicio,
            dataFim,
            pagina: pagina ? parseInt(pagina) : 1,
            tamanhoPagina: tamanhoPagina ? parseInt(tamanhoPagina) : 50
        });
        return res.json(resultado);
    } catch (err) {
        console.error('[Estoque] Erro listar histórico:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/estoque/sync-produto/:produtoId — sincroniza um produto específico com o CA
router.post('/sync-produto/:produtoId', async (req, res) => {
    try {
        const produto = await prisma.produto.findUnique({
            where: { id: req.params.produtoId },
            select: { contaAzulId: true, nome: true, estoqueDisponivel: true }
        });
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
        if (!produto.contaAzulId) return res.json({ sincCA: false, motivo: 'Produto sem vínculo CA.' });

        const contaAzulService = require('../services/contaAzulService');
        const resultado = await contaAzulService.syncProdutoIndividual(produto.contaAzulId);
        return res.json({ sincCA: true, estoqueDisponivel: resultado.estoqueDisponivel });
    } catch (err) {
        console.error('[Estoque] Erro sync-produto:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/estoque/produto/:produtoId/minimo — atualiza estoqueMinimo
router.patch('/produto/:produtoId/minimo', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!permissoes.admin) return res.status(403).json({ error: 'Apenas administradores podem alterar o estoque mínimo.' });

        const { estoqueMinimo } = req.body;
        if (estoqueMinimo === undefined || isNaN(parseFloat(estoqueMinimo))) {
            return res.status(400).json({ error: 'estoqueMinimo inválido.' });
        }
        const produto = await prisma.produto.update({
            where: { id: req.params.produtoId },
            data: { estoqueMinimo: parseFloat(estoqueMinimo) },
            select: { id: true, nome: true, estoqueMinimo: true, estoqueDisponivel: true, estoqueTotal: true, estoqueReservado: true }
        });
        return res.json(produto);
    } catch (err) {
        console.error('[Estoque] Erro ao atualizar estoqueMinimo:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/estoque/produto/:produtoId/recalcular — força recálculo dos 3 estados de estoque
router.post('/produto/:produtoId/recalcular', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!permissoes.admin) return res.status(403).json({ error: 'Apenas administradores podem forçar o recálculo.' });

        const resultado = await estoqueService.recalcularEstoqueProduto(req.params.produtoId);
        if (!resultado) return res.status(400).json({ error: 'Produto não encontrado ou categoria não controla estoque.' });
        return res.json(resultado);
    } catch (err) {
        console.error('[Estoque] Erro ao recalcular:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/estoque/inventario — contagem física (inventário) de uma categoria.
// Feita para funcionar com internet instável: o celular conta offline e envia depois.
// Idempotente por inventarioId (gerado no celular): reenviar o mesmo inventário só
// processa os produtos que ainda não foram ajustados — nada é aplicado em dobro.
router.post('/inventario', async (req, res) => {
    try {
        const { inventarioId, itens, observacao } = req.body;
        const vendedorId = req.user?.id;

        if (!inventarioId || typeof inventarioId !== 'string' || inventarioId.length < 8) {
            return res.status(400).json({ error: 'inventarioId é obrigatório.' });
        }
        if (!Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({ error: 'Envie ao menos um item contado.' });
        }
        if (itens.length > 500) {
            return res.status(400).json({ error: 'Inventário grande demais (máx. 500 itens por envio).' });
        }

        const permissoes = await getPermsFromDB(req.user.id);

        const ids = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
        const produtos = await prisma.produto.findMany({
            where: { id: { in: ids } },
            select: { id: true, nome: true, categoria: true, unidade: true }
        });
        const porId = new Map(produtos.map(p => [p.id, p]));

        // Inventário mexe nos dois sentidos: exige permissão de adicionar E diminuir na categoria
        if (!permissoes.admin) {
            for (const p of produtos) {
                const cats = p.categoria ? [p.categoria] : [];
                if (!verificarPermissaoEstoque(permissoes, cats, 'ENTRADA') ||
                    !verificarPermissaoEstoque(permissoes, cats, 'SAIDA')) {
                    return res.status(403).json({
                        error: `Inventário exige permissão de adicionar e diminuir estoque na categoria "${p.categoria || 'sem categoria'}".`
                    });
                }
            }
        }

        // Produtos deste inventário que já foram ajustados (reenvio após queda de conexão)
        const movsExistentes = await prisma.movimentacaoEstoque.findMany({
            where: { motivo: 'INVENTARIO', observacao: { contains: inventarioId } },
            select: { produtoId: true }
        });
        const jaProcessados = new Set(movsExistentes.map(m => m.produtoId));

        const ajustados = [];
        const falhas = [];
        let semDiferenca = 0;
        let pulados = 0;

        // Uma transação CURTA por produto (banco compartilhado é lento — uma transação
        // gigante com todos os itens estouraria o timeout). Se cair no meio, o reenvio
        // com o mesmo inventarioId continua de onde parou.
        for (const item of itens) {
            const produto = porId.get(item.produtoId);
            if (!produto) { pulados++; continue; }
            if (jaProcessados.has(item.produtoId)) { pulados++; continue; }

            const contado = parseFloat(item.contado);
            if (isNaN(contado) || contado < 0) { pulados++; continue; }

            try {
                const resultado = await prisma.$transaction(async (tx) => {
                    const atual = await tx.produto.findUnique({
                        where: { id: item.produtoId },
                        select: { estoqueTotal: true }
                    });
                    const antes = parseFloat(atual?.estoqueTotal || 0);
                    const delta = contado - antes;
                    if (Math.abs(delta) < 0.0005) return { semDif: true };

                    // estoqueDisponivel parte do mesmo valor; o recálculo corrige com as reservas
                    await tx.produto.update({
                        where: { id: item.produtoId },
                        data: { estoqueTotal: contado, estoqueDisponivel: contado }
                    });
                    await tx.movimentacaoEstoque.create({
                        data: {
                            produtoId: item.produtoId,
                            vendedorId,
                            tipo: delta > 0 ? 'ENTRADA' : 'SAIDA',
                            quantidade: Math.abs(delta),
                            motivo: 'INVENTARIO',
                            observacao: `Inventário ${inventarioId} — contado ${contado}${observacao ? ` · ${observacao}` : ''}`,
                            estoqueAntes: antes,
                            estoqueDepois: contado,
                            sincCA: false,
                            erroCA: null
                        }
                    });
                    await estoqueService.recalcularEstoqueProduto(item.produtoId, tx);
                    return { antes, depois: contado, delta };
                }, { timeout: 20000, maxWait: 10000 });

                if (resultado.semDif) semDiferenca++;
                else ajustados.push({ produtoId: item.produtoId, nome: produto.nome, unidade: produto.unidade, ...resultado });
            } catch (errItem) {
                console.error(`[Estoque] Inventário ${inventarioId} — falha no produto ${produto.nome}:`, errItem.message);
                falhas.push({ produtoId: item.produtoId, nome: produto.nome });
            }
        }

        console.log(`[Estoque] Inventário ${inventarioId} por ${vendedorId}: ${ajustados.length} ajustado(s), ${semDiferenca} sem diferença, ${pulados} pulado(s), ${falhas.length} falha(s).`);
        return res.json({ ok: falhas.length === 0, inventarioId, ajustados, semDiferenca, pulados, falhas });
    } catch (err) {
        console.error('[Estoque] Erro inventário:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/estoque/permissoes — retorna o que o usuário logado pode fazer
router.get('/permissoes', async (req, res) => {
    const permissoes = await getPermsFromDB(req.user.id);
    if (permissoes.admin) {
        return res.json({ admin: true, pode: { adicionar: true, diminuir: true }, categoriasPermitidas: null });
    }
    const regraEstoque = Array.isArray(permissoes.estoque) ? permissoes.estoque : [];
    const catPermitidas = categoriasPermitidasEstoque(permissoes);
    return res.json({ admin: false, regras: regraEstoque, categoriasPermitidas: catPermitidas });
});

module.exports = router;
