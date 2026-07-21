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
const botWhatsapp = require('../services/botWhatsappService');

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
        if (perms.admin || perms.Pode_Executar_Entregas || perms.Pode_Baixar_Contas_Receber || perms.Pode_Ver_Todas_Entregas) {
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
    linkPagamento: c.boletoUrl || null, // fatura Asaas (PIX gerado p/ enviar ao cliente)
    vencimento: c.vencimento,
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

// ── Configuração da integração (Configurações → Asaas) ──
// GET aberto a quem pode cobrar (a tela de PIX lê a validade padrão);
// ?completo=1 inclui o status da integração (consulta o Asaas — usar só na tela de config).
router.get('/config', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const config = await asaasService.obterConfig();
        if (req.query.completo === '1') {
            const status = await asaasService.statusCompleto();
            return res.json({ config, status });
        }
        res.json({ config });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

// Salvar: só admin (mexe em multa/juros cobrados do cliente)
router.put('/config', verificarAuth, async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!perms.admin) return res.status(403).json({ error: 'Somente administradores.' });
        const config = await asaasService.salvarConfig(req.body || {});
        res.json({ ok: true, config });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

// ── POST /pix — gerar QR Code PIX para um pedido (entrega ou cobrança do financeiro) ──
router.post('/pix', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const { pedidoId, valor, descricao, validadeDias, vincularParcela } = req.body;
        if (!pedidoId) return res.status(400).json({ error: 'Informe o pedido.' });

        const cobranca = await asaasService.criarPixPedido({
            pedidoId,
            valor,
            descricao,
            validadeDias,
            vincularParcela: !!vincularParcela,
            criadoPorId: req.user.id
        });
        res.json(mapCobranca(cobranca));
    } catch (e) {
        console.error('[Asaas] Erro ao criar PIX:', e.message);
        res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao gerar PIX.' });
    }
});

// ── POST /pix/:cobrancaId/whatsapp — enviar o link/código PIX ao cliente ──
router.post('/pix/:cobrancaId/whatsapp', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const webhookService = require('../services/webhookService');
        const cobranca = await prisma.cobrancaAsaas.findUnique({
            where: { id: req.params.cobrancaId },
            include: {
                cliente: { select: { Nome: true, NomeFantasia: true, Telefone_Celular: true, Telefone: true } },
                pedido: { select: { numero: true, especial: true } }
            }
        });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        if (cobranca.status !== 'PENDENTE') return res.status(400).json({ error: `Cobrança está ${cobranca.status} — nada a enviar.` });

        const nome = cobranca.cliente?.NomeFantasia || cobranca.cliente?.Nome || 'Cliente';
        const telefone = cobranca.cliente?.Telefone_Celular || cobranca.cliente?.Telefone;
        if (!telefone) return res.status(400).json({ error: 'Cliente sem telefone cadastrado.' });

        const venc = cobranca.vencimento ? new Date(cobranca.vencimento) : new Date();
        const vencStr = venc.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const numeroPedido = cobranca.pedido?.numero ? `${cobranca.pedido.especial ? 'ZZ#' : '#'}${cobranca.pedido.numero}` : '';
        const mensagem = `Olá, *${nome}*! 😊\n\nSegue o PIX${numeroPedido ? ` do pedido *${numeroPedido}*` : ''}:\n\n💰 Valor: *R$ ${Number(cobranca.valor).toFixed(2).replace('.', ',')}*\n📅 Válido até: *${vencStr}*${cobranca.boletoUrl ? `\n\n🔗 Link para pagar: ${cobranca.boletoUrl}` : ''}${cobranca.pixPayload ? `\n\n*PIX copia e cola:*\n${cobranca.pixPayload}` : ''}\n\nQualquer dúvida, estamos à disposição!\n_Hardt Doces e Salgados_`;

        // Envio manual pelo botão: referência nova a cada clique, senão o bot
        // devolveria `duplicado` e o reenvio pedido pelo usuário não sairia.
        const r = await webhookService.enviarCobranca({
            telefone,
            nome,
            mensagem,
            referencia: botWhatsapp.referenciaUnica(`asaas-pix-${cobranca.id}`),
        });
        if (!r.ok) return res.status(400).json({ error: `WhatsApp não enviado: ${r.motivo}` });
        res.json({ ok: true, message: 'PIX enviado por WhatsApp!' });
    } catch (e) {
        console.error('[Asaas] Erro ao enviar PIX por WhatsApp:', e.message);
        res.status(500).json({ error: 'Erro ao enviar por WhatsApp.' });
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

// ═══════════════ BOLETOS (Contas a Receber) ═══════════════

const mapBoleto = (c) => c && ({
    id: c.id,
    parcelaId: c.parcelaId,
    status: c.status,
    valor: Number(c.valor),
    valorRecebido: c.valorRecebido != null ? Number(c.valorRecebido) : null,
    recebidoEm: c.recebidoEm,
    boletoUrl: c.boletoUrl,
    linhaDigitavel: c.linhaDigitavel,
    vencimento: c.vencimento,
    baixaAppOk: c.baixaAppOk,
    baixaCaOk: c.baixaCaOk,
    baixaErro: c.baixaErro,
    createdAt: c.createdAt
});

// ── GET /pedidos/:pedidoId/boletos — mesmo payload, resolvendo a conta pelo pedido ──
// (usado pelo botão de boleto na lista de Pedidos)
router.get('/pedidos/:pedidoId/boletos', verificarAuth, async (req, res) => {
    try {
        const conta = await prisma.contaReceber.findUnique({
            where: { pedidoId: req.params.pedidoId },
            select: { id: true, status: true, pedido: { select: { especial: true } } }
        });
        if (!conta) return res.status(404).json({ error: 'Este pedido não tem conta a receber (ex.: bonificação).' });
        // Regra do dono: especial não gera cobrança Asaas; conta quitada também não
        if (conta.pedido?.especial) return res.status(400).json({ error: 'Pedido especial não gera cobrança pelo Asaas.' });
        if (conta.status === 'QUITADO') return res.status(400).json({ error: 'Este pedido já está quitado — nada a cobrar.' });
        req.params.contaReceberId = conta.id;
        return listarBoletosConta(req, res);
    } catch (e) {
        console.error('[Asaas] Erro ao listar boletos do pedido:', e.message);
        res.status(500).json({ error: 'Erro ao listar boletos.' });
    }
});

// ── GET /contas/:contaReceberId/boletos — boletos de todas as parcelas da conta ──
const listarBoletosConta = async (req, res) => {
    try {
        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.contaReceberId },
            include: { parcelas: { orderBy: { numeroParcela: 'asc' } } }
        });
        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });

        const cobrancas = await prisma.cobrancaAsaas.findMany({
            where: { parcelaId: { in: conta.parcelas.map(p => p.id) }, tipo: 'BOLETO' },
            orderBy: { createdAt: 'desc' }
        });
        const parcelas = [];
        for (const p of conta.parcelas) {
            const doBoleto = cobrancas.filter(c => c.parcelaId === p.id);
            let ativo = doBoleto.find(c => ['PENDENTE', 'RECEBIDO'].includes(c.status)) || doBoleto[0] || null;
            // Parcela mudou de vencimento depois da emissão? Realinha o boleto no Asaas
            // (melhor esforço — sem mudança é um no-op barato)
            if (ativo?.status === 'PENDENTE') {
                try { ativo = await asaasService.sincronizarVencimentoBoleto(ativo.id); } catch (_) { /* mostra como está */ }
            }
            parcelas.push({
                id: p.id,
                numeroParcela: p.numeroParcela,
                valor: Number(p.valor),
                saldo: Math.max(0, Math.round((Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0)) * 100) / 100),
                dataVencimento: p.dataVencimento,
                status: p.status,
                boleto: mapBoleto(ativo)
            });
        }
        res.json({ contaId: conta.id, parcelas });
    } catch (e) {
        console.error('[Asaas] Erro ao listar boletos da conta:', e.message);
        res.status(500).json({ error: 'Erro ao listar boletos.' });
    }
};
router.get('/contas/:contaReceberId/boletos', verificarAuth, listarBoletosConta);

// ── POST /boletos — emitir boletos (por conta, por parcelas, ou por PEDIDOS em lote) ──
router.post('/boletos', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const { contaReceberId, parcelaIds, pedidoIds } = req.body;
        let ids = Array.isArray(parcelaIds) ? parcelaIds : [];
        let semConta = []; // pedidos do lote sem conta a receber — reportar por número, não sumir calado
        if (!ids.length && Array.isArray(pedidoIds) && pedidoIds.length) {
            const parcelas = await prisma.parcela.findMany({
                where: {
                    contaReceber: { pedidoId: { in: pedidoIds } },
                    status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] }
                },
                orderBy: { numeroParcela: 'asc' },
                select: { id: true }
            });
            ids = parcelas.map(p => p.id);
            const pedidosSemConta = await prisma.pedido.findMany({
                where: { id: { in: pedidoIds }, contaReceber: null },
                select: { numero: true, especial: true }
            });
            semConta = pedidosSemConta.map(x => `${x.especial ? 'ZZ#' : '#'}${x.numero}`);
        }
        if (!ids.length && contaReceberId) {
            const parcelas = await prisma.parcela.findMany({
                where: { contaReceberId, status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] } },
                orderBy: { numeroParcela: 'asc' },
                select: { id: true }
            });
            ids = parcelas.map(p => p.id);
        }
        if (!ids.length) {
            return res.status(400).json({
                error: semConta.length
                    ? `Pedido(s) ${semConta.join(', ')} sem conta a receber no app — avise o suporte (a conta deveria ter sido criada ao enviar o pedido).`
                    : 'Nenhuma parcela em aberto para emitir boleto.'
            });
        }

        const resultados = [];
        for (const parcelaId of ids) {
            try {
                const cobranca = await asaasService.criarBoletoParcela({ parcelaId, criadoPorId: req.user.id });
                resultados.push({ parcelaId, ok: true, boleto: mapBoleto(cobranca) });
            } catch (e) {
                resultados.push({ parcelaId, ok: false, erro: e.message });
            }
        }
        const okCount = resultados.filter(r => r.ok).length;
        const avisoSemConta = semConta.length ? ` Atenção: ${semConta.join(', ')} sem conta a receber (não emitido).` : '';
        res.json({
            message: `${okCount} boleto(s) emitido(s)${okCount < resultados.length ? `, ${resultados.length - okCount} com erro` : ''}.${avisoSemConta}`,
            resultados
        });
    } catch (e) {
        console.error('[Asaas] Erro ao emitir boletos:', e.message);
        res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao emitir boletos.' });
    }
});

// ── GET /boletos/:cobrancaId — atualizar/consultar um boleto (status + linha digitável) ──
router.get('/boletos/:cobrancaId', verificarAuth, async (req, res) => {
    try {
        let cobranca = await asaasService.consultarCobranca(req.params.cobrancaId);
        if (!cobranca) return res.status(404).json({ error: 'Boleto não encontrado.' });
        if (!cobranca.linhaDigitavel) cobranca = await asaasService.completarLinhaDigitavel(cobranca.id);
        res.json(mapBoleto(cobranca));
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao consultar boleto.' });
    }
});

// ── DELETE /boletos/:cobrancaId — cancelar boleto pendente ──
router.delete('/boletos/:cobrancaId', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const cobranca = await asaasService.cancelarCobranca(req.params.cobrancaId);
        res.json(mapBoleto(cobranca));
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao cancelar boleto.' });
    }
});

// ── POST /boletos/:cobrancaId/whatsapp — enviar o boleto ao cliente pelo WhatsApp (bot) ──
router.post('/boletos/:cobrancaId/whatsapp', verificarAuth, checkPodeCobrar, async (req, res) => {
    try {
        const webhookService = require('../services/webhookService');
        let cobranca = await prisma.cobrancaAsaas.findUnique({
            where: { id: req.params.cobrancaId },
            include: {
                cliente: { select: { Nome: true, NomeFantasia: true, Telefone_Celular: true, Telefone: true } },
                parcela: { include: { contaReceber: { select: { pedido: { select: { numero: true } } } } } }
            }
        });
        if (!cobranca) return res.status(404).json({ error: 'Boleto não encontrado.' });
        if (cobranca.status !== 'PENDENTE') return res.status(400).json({ error: `Boleto está ${cobranca.status} — nada a enviar.` });
        if (!cobranca.boletoUrl) return res.status(400).json({ error: 'Boleto ainda sem link. Tente de novo em instantes.' });
        if (!cobranca.linhaDigitavel) {
            const atualizada = await asaasService.completarLinhaDigitavel(cobranca.id);
            cobranca.linhaDigitavel = atualizada?.linhaDigitavel || null;
        }

        const nome = cobranca.cliente?.NomeFantasia || cobranca.cliente?.Nome || 'Cliente';
        const telefone = cobranca.cliente?.Telefone_Celular || cobranca.cliente?.Telefone;
        if (!telefone) return res.status(400).json({ error: 'Cliente sem telefone cadastrado.' });

        const venc = cobranca.vencimento ? new Date(cobranca.vencimento) : new Date();
        const vencStr = venc.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const numeroPedido = cobranca.parcela?.contaReceber?.pedido?.numero;
        const mensagem = `Olá, *${nome}*! 😊\n\nSegue o boleto${numeroPedido ? ` do pedido *#${numeroPedido}*` : ''} (parcela ${cobranca.parcela?.numeroParcela || 1}):\n\n💰 Valor: *R$ ${Number(cobranca.valor).toFixed(2).replace('.', ',')}*\n📅 Vencimento: *${vencStr}*\n\n📄 Boleto (PDF): ${cobranca.boletoUrl}${cobranca.linhaDigitavel ? `\n\n*Linha digitável:*\n${cobranca.linhaDigitavel}` : ''}\n\nQualquer dúvida, estamos à disposição!\n_Hardt Doces e Salgados_`;

        const r = await webhookService.enviarCobranca({
            telefone,
            nome,
            mensagem,
            referencia: botWhatsapp.referenciaUnica(`asaas-boleto-${cobranca.id}`),
        });
        if (!r.ok) return res.status(400).json({ error: `WhatsApp não enviado: ${r.motivo}` });
        res.json({ ok: true, message: 'Boleto enviado por WhatsApp!' });
    } catch (e) {
        console.error('[Asaas] Erro ao enviar boleto por WhatsApp:', e.message);
        res.status(500).json({ error: 'Erro ao enviar por WhatsApp.' });
    }
});

module.exports = router;
