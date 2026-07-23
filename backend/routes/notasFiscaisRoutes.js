// Notas Fiscais emitidas pelo APP (Focus NFe) — fila de emissão, emissão, status, DANFE/XML.
// Permissões (JSON do vendedor): Pode_Acessar_Notas_Fiscais (ver) · Pode_Emitir_NF (emitir).
// Montado em /api/notas-fiscais com authMiddleware (index.js).
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const focusNfe = require('../services/focusNfeService');
const emissao = require('../services/focusNfeEmissaoService');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof vendedor?.permissoes === 'string' ? JSON.parse(vendedor.permissoes) : (vendedor?.permissoes || {});
};

const checkVer = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Notas_Fiscais) {
        return res.status(403).json({ error: 'Sem permissão para acessar as notas fiscais.' });
    }
    next();
};

const checkEmitir = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Emitir_NF) {
        return res.status(403).json({ error: 'Sem permissão para emitir notas fiscais.' });
    }
    next();
};

// GET /api/notas-fiscais/fila?de=YYYY-MM-DD&ate=YYYY-MM-DD — pedidos do período com o
// estado da nota de cada um (sem nota / processando / autorizada / erro / emitida no CA).
router.get('/fila', checkVer, async (req, res) => {
    try {
        await emissao.sincronizarEventos(); // aplica webhooks pendentes antes de listar

        const de = req.query.de ? new Date(`${req.query.de}T00:00:00-03:00`) : null;
        const ate = req.query.ate ? new Date(`${req.query.ate}T23:59:59-03:00`) : null;
        const ambiente = focusNfe.ambiente();
        const prefixo = `nf-${ambiente === 'producao' ? 'p' : 'h'}-`;

        const pedidos = await prisma.pedido.findMany({
            where: {
                especial: false,
                bonificacao: false,
                numero: { not: null },
                ...(de || ate ? { dataVenda: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}),
            },
            include: {
                cliente: { select: { Nome: true, Documento: true } },
                itens: { select: { quantidade: true, valor: true } },
                notasFiscaisApp: true,
            },
            orderBy: { numero: 'desc' },
            take: 300,
        });

        const resposta = pedidos.map(p => {
            const doc = String(p.cliente?.Documento || '').replace(/[^0-9A-Za-z]/g, '');
            const total = p.itens.reduce((s, i) => s + Math.round(Number(i.quantidade) * Number(i.valor) * 100) / 100, 0);
            const nota = p.notasFiscaisApp.find(n => n.ref === `${prefixo}${p.id}`) || null;
            return {
                id: p.id,
                numero: p.numero,
                dataVenda: p.dataVenda,
                total: Math.round(total * 100) / 100,
                tipoPagamento: p.tipoPagamento,
                cliente: {
                    nome: p.cliente?.Nome || '—',
                    documento: p.cliente?.Documento || null,
                    tipoDoc: /^\d{11}$/.test(doc) ? 'CPF' : 'CNPJ',
                },
                notaCA: p.nfeChave ? { chave: p.nfeChave, numero: p.nfeNumero } : null,
                nota: nota && {
                    id: nota.id,
                    status: nota.status,
                    numero: nota.numero,
                    serie: nota.serie,
                    chave: nota.chave,
                    mensagemSefaz: nota.mensagemSefaz,
                    atualizadoEm: nota.atualizadoEm,
                },
            };
        });
        res.json({ ambiente, pedidos: resposta });
    } catch (e) {
        console.error('[NotasFiscais] fila:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/notas-fiscais/emitir/:pedidoId — emite (ou reemite após rejeição).
router.post('/emitir/:pedidoId', checkEmitir, async (req, res) => {
    try {
        const nota = await emissao.emitirVenda(req.params.pedidoId);
        res.json({ ok: true, nota });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/notas-fiscais/emitir-devolucao/:devolucaoId — NF-e de devolução de venda
// (só devolução de pedido COM nota; especial não gera NF).
router.post('/emitir-devolucao/:devolucaoId', checkEmitir, async (req, res) => {
    try {
        const nota = await emissao.emitirDevolucao(req.params.devolucaoId);
        res.json({ ok: true, nota });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// GET /api/notas-fiscais/xmls-zip?de=YYYY-MM-DD&ate=YYYY-MM-DD — ZIP com os XMLs do período
// (notas do app + notas antigas do CA já copiadas/localizáveis) para enviar à contabilidade.
router.get('/xmls-zip', checkVer, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!de || !ate) return res.status(400).json({ error: 'Informe ?de=YYYY-MM-DD&ate=YYYY-MM-DD' });
        const ini = new Date(`${de}T00:00:00-03:00`);
        const fim = new Date(`${ate}T23:59:59-03:00`);
        const AdmZip = require('adm-zip');
        const xmlNfeService = require('../services/xmlNfeService');
        const zip = new AdmZip();
        const erros = [];

        // Notas emitidas pelo app (venda e devolução) autorizadas no período
        const notasApp = await prisma.notaFiscalApp.findMany({
            where: { status: 'AUTORIZADO', ambiente: 'producao', atualizadoEm: { gte: ini, lte: fim } },
            include: { pedido: { select: { numero: true } } },
        });
        for (const n of notasApp) {
            try {
                const xml = await xmlNfeService.obterXmlNotaApp(n.id);
                const rotulo = n.tipo === 'DEVOLUCAO' ? 'devolucao' : 'venda';
                zip.addFile(`nfe-${n.numero || n.ref}-${rotulo}-pedido-${n.pedido?.numero || ''}.xml`, Buffer.from(xml, 'utf8'));
            } catch (e) {
                erros.push(`NF ${n.numero || n.ref}: ${e.message}`);
            }
        }

        // Notas antigas do CA cujos pedidos são do período (chave em cache)
        const pedidosCA = await prisma.pedido.findMany({
            where: { nfeChave: { not: null }, dataVenda: { gte: ini, lte: fim } },
            select: { numero: true, nfeChave: true, nfeNumero: true },
        });
        for (const p of pedidosCA) {
            try {
                const xml = await xmlNfeService.obterXmlNotaCA(p.nfeChave);
                zip.addFile(`nfe-${p.nfeNumero || p.nfeChave}-venda-ca-pedido-${p.numero || ''}.xml`, Buffer.from(xml, 'utf8'));
            } catch (e) {
                erros.push(`NF CA ${p.nfeNumero || ''} (pedido ${p.numero}): ${e.message}`);
            }
        }

        if (erros.length) zip.addFile('_avisos.txt', Buffer.from(`XMLs que não puderam ser incluídos:\n${erros.join('\n')}\n`, 'utf8'));
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="xmls-nfe-${de}-a-${ate}.zip"`);
        res.send(zip.toBuffer());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/notas-fiscais/:id/consultar — força atualização de status na Focus.
router.post('/:id/consultar', checkVer, async (req, res) => {
    try {
        const nota = await emissao.consultarAtualizar(req.params.id);
        res.json({ nota });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// GET /api/notas-fiscais/:id/danfe — PDF no layout do app (mesmo gerador das notas do CA).
// GET /api/notas-fiscais/:id/xml — XML autorizado (nfeProc).
async function baixar(req, res, qual) {
    const nota = await prisma.notaFiscalApp.findUnique({ where: { id: req.params.id } });
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
    if (nota.status !== 'AUTORIZADO' && nota.status !== 'CANCELADO') {
        return res.status(400).json({ error: `Nota ainda "${nota.status}" — arquivo disponível só após autorização.` });
    }
    const caminho = nota.caminhoXml || (await emissao.consultarAtualizar(nota.id)).caminhoXml;
    if (!caminho) return res.status(404).json({ error: 'XML ainda não disponível na Focus.' });
    const xml = (await focusNfe.baixarArquivo(caminho)).toString('utf8');
    if (qual === 'xml') {
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="nfe-${nota.numero || nota.ref}.xml"`);
        return res.send(xml);
    }
    const { gerarPDF } = require('@alexssmusica/node-pdf-nfe');
    const path = require('path');
    const fs = require('fs');
    const pathLogo = path.join(__dirname, '../assets/logo-danfe.png');
    const doc = await gerarPDF(xml, fs.existsSync(pathLogo) ? { pathLogo } : {});
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
}

router.get('/:id/danfe', checkVer, (req, res) => {
    baixar(req, res, 'danfe').catch(e => res.status(500).json({ error: e.message }));
});
router.get('/:id/xml', checkVer, (req, res) => {
    baixar(req, res, 'xml').catch(e => res.status(500).json({ error: e.message }));
});

module.exports = router;
