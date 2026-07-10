// =====================================================================
// Rotas da integração Asaas — PIX na entrega (QR Code) + webhook de pagamento.
// Webhook é público (autenticado pelo token do próprio Asaas no header
// `asaas-access-token`); as demais rotas exigem login.
// =====================================================================
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const asaasService = require('../services/asaasService');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

// Quem pode gerar/cancelar PIX: motorista em rota ou financeiro
const checkPodeCobrar = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Executar_Entregas || perms.Pode_Dar_Baixa || perms.Pode_Ver_Todas_Entregas) {
            return next();
        }
        return res.status(403).json({ error: 'Sem permissão para gerar cobrança PIX.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

const mapCobranca = (c) => c && ({
    id: c.id,
    status: c.status,
    tipo: c.tipo,
    valor: Number(c.valor),
    valorRecebido: c.valorRecebido != null ? Number(c.valorRecebido) : null,
    recebidoEm: c.recebidoEm,
    pedidoId: c.pedidoId,
    pixPayload: c.pixPayload,
    pixQrCodeBase64: c.pixQrCodeBase64,
    pixExpiraEm: c.pixExpiraEm,
    ambiente: c.ambiente,
    createdAt: c.createdAt
});

// ── POST /webhook — chamado pelo Asaas quando o status de uma cobrança muda ──
router.post('/webhook', async (req, res) => {
    const token = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!token || req.headers['asaas-access-token'] !== token) {
        return res.status(401).json({ error: 'Token do webhook inválido.' });
    }
    try {
        const resultado = await asaasService.processarWebhook(req.body);
        res.json(resultado);
    } catch (e) {
        console.error('[Asaas webhook] Erro:', e.message);
        // 500 faz o Asaas reenviar o evento depois (fila pausa até receber 200)
        res.status(500).json({ error: 'Erro ao processar evento.' });
    }
});

// ── GET /status — front usa para decidir se mostra o botão de PIX ──
router.get('/status', verificarAuth, (req, res) => {
    res.json({ configurado: asaasService.configurado(), ambiente: asaasService.configurado() ? asaasService.AMBIENTE : null });
});

// ── POST /pix — gerar QR Code PIX para um pedido (entrega) ──
router.post('/pix', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const { pedidoId, valor, descricao } = req.body;
        if (!pedidoId) return res.status(400).json({ error: 'Informe o pedido.' });

        const cobranca = await asaasService.criarPixPedido({
            pedidoId,
            valor,
            descricao,
            criadoPorId: req.user.id
        });
        res.json(mapCobranca(cobranca));
    } catch (e) {
        console.error('[Asaas] Erro ao criar PIX:', e.message);
        res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao gerar PIX.' });
    }
});

// ── GET /cobrancas/:id — poll de status (confere no Asaas se ainda pendente) ──
router.get('/cobrancas/:id', verificarAuth, async (req, res) => {
    try {
        const cobranca = await asaasService.consultarCobranca(req.params.id);
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        res.json(mapCobranca(cobranca));
    } catch (e) {
        console.error('[Asaas] Erro ao consultar cobrança:', e.message);
        res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao consultar cobrança.' });
    }
});

// ── DELETE /cobrancas/:id — cancelar PIX pendente (desistiu / valor errado) ──
router.delete('/cobrancas/:id', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const cobranca = await asaasService.cancelarCobranca(req.params.id);
        res.json(mapCobranca(cobranca));
    } catch (e) {
        console.error('[Asaas] Erro ao cancelar cobrança:', e.message);
        res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao cancelar cobrança.' });
    }
});

module.exports = router;
