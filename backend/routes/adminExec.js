/**
 * ROTA ADMIN-EXEC
 * Endpoints internos protegidos por ADMIN_SECRET (variável de ambiente).
 * Usados para operações de diagnóstico e manutenção em produção.
 *
 * Header obrigatório: x-admin-secret: <ADMIN_SECRET>
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../config/database');
const clienteInsightService = require('../services/clienteInsightService');
const orientacaoService = require('../services/orientacaoService');
const estoqueService = require('../services/estoqueService');
const contaAzulService = require('../services/contaAzulService');

// Estado do backfill assíncrono da conta financeira em Contas a Receber (varre em segundo plano)
const _backfillReceber = { rodando: false, progresso: null };
const _backfillLedger = { rodando: false, progresso: null };

// Comparação em tempo constante (evita ataque de timing). Usa hash SHA-256 para
// os buffers terem sempre o mesmo tamanho, sem vazar o comprimento do segredo.
function segredoConfere(recebido, esperado) {
    if (typeof recebido !== 'string' || typeof esperado !== 'string') return false;
    const a = crypto.createHash('sha256').update(recebido).digest();
    const b = crypto.createHash('sha256').update(esperado).digest();
    return crypto.timingSafeEqual(a, b);
}

// Middleware: valida ADMIN_SECRET
router.use((req, res, next) => {
    const esperado = process.env.ADMIN_SECRET;
    // Fail-closed: sem segredo configurado no ambiente, ninguém entra (evita
    // comparar contra undefined e deixar a rota aberta por engano).
    if (!esperado) {
        console.error('[admin-exec] ADMIN_SECRET não configurado no ambiente — acesso bloqueado.');
        return res.status(503).json({ error: 'Servidor sem ADMIN_SECRET configurado.' });
    }
    const secret = req.headers['x-admin-secret'];
    if (!secret || !segredoConfere(String(secret), esperado)) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
});

// GET /api/admin-exec/ping
// Verifica se o servidor está respondendo e com as variáveis corretas
router.get('/ping', (req, res) => {
    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        openaiConfigurada: !!process.env.OPENAI_API_KEY,
        jwtConfigurada: !!process.env.JWT_SECRET,          // termômetro: JWT_SECRET setado no ambiente?
        certEncKeyConfigurada: !!process.env.CERT_ENC_KEY, // idem para a chave do certificado A1
        caClientConfigurada: !!(process.env.CONTA_AZUL_CLIENT_ID && process.env.CONTA_AZUL_CLIENT_SECRET),
        asaasConfigurada: !!process.env.ASAAS_API_KEY,
        asaasWebhookTokenConfigurado: !!process.env.ASAAS_WEBHOOK_TOKEN,
        botWhatsappConfigurado: !!(process.env.BOT_WHATSAPP_URL && process.env.BOT_WHATSAPP_API_KEY),
        node: process.version,
    });
});

// ── Integração de WhatsApp (bot da Ana) ───────────────────────────

// GET /api/admin-exec/bot-whatsapp-status — a chave do EasyPanel é aceita? como está a fila?
router.get('/bot-whatsapp-status', async (req, res) => {
    try {
        const botWhatsapp = require('../services/botWhatsappService');
        const [bot, fila] = await Promise.all([
            botWhatsapp.status(),
            prisma.botWhatsappEnvio.groupBy({ by: ['status'], _count: true }),
        ]);
        res.json({ bot, fila: Object.fromEntries(fila.map(f => [f.status, f._count])) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/bot-whatsapp-testar — manda uma mensagem de teste real.
// Body: { telefone, texto? }. Sempre tipo 'interno' (é teste da equipe, não cliente)
// e referência nova a cada chamada, para poder repetir sem cair na idempotência.
router.post('/bot-whatsapp-testar', async (req, res) => {
    try {
        const botWhatsapp = require('../services/botWhatsappService');
        const { telefone, texto } = req.body || {};
        if (!telefone) return res.status(400).json({ error: 'Informe o telefone.' });

        const r = await botWhatsapp.enviar({
            telefone,
            texto: texto || 'Teste da integração de WhatsApp do sistema Hardt. Se você recebeu isto, está tudo funcionando. ✅',
            tipo: 'interno',
            origem: 'teste-integracao',
            referencia: botWhatsapp.referenciaUnica(`teste-${String(telefone).replace(/\D/g, '')}`),
        });
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Integração Asaas ──────────────────────────────────────────────

// GET /api/admin-exec/asaas-status — chave configurada? conta responde? webhook token setado?
router.get('/asaas-status', async (req, res) => {
    try {
        const asaasService = require('../services/asaasService');
        const status = await asaasService.statusIntegracao();
        // Diagnóstico seguro da chave (só prefixo + tamanho — detecta corte do "$" pelo EasyPanel)
        const k = process.env.ASAAS_API_KEY || '';
        res.json({
            ...status,
            webhookTokenConfigurado: !!process.env.ASAAS_WEBHOOK_TOKEN,
            chaveDiag: k ? `${k.slice(0, 6)}... (${k.length} caracteres)` : null
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/asaas-registrar-webhook — cria/atualiza o webhook no painel do Asaas
// Body opcional: { url } (padrão: URL pública do app + /api/asaas/webhook)
router.post('/asaas-registrar-webhook', async (req, res) => {
    try {
        const asaasService = require('../services/asaasService');
        // Atenção: o webhook precisa apontar para o domínio do BACKEND (o do frontend serve só o app)
        const url = req.body?.url || 'https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/asaas/webhook';
        const resultado = await asaasService.registrarWebhook(url);
        res.json({ ok: true, url, ...resultado });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-configurar-conta-ca — acha a conta financeira "ASAAS" no
// Conta Azul e grava o id em app_configs.asaas_conta_financeira_ca_id (baixas do PIX caem nela)
router.post('/asaas-configurar-conta-ca', async (req, res) => {
    try {
        const contas = await contaAzulService.listarContasFinanceiras();
        const alvo = req.body?.nome || 'asaas';
        const conta = contas.find(c => (c.nome || '').toLowerCase().includes(String(alvo).toLowerCase()));
        if (!conta) {
            return res.status(404).json({ ok: false, error: `Nenhuma conta financeira com "${alvo}" no nome.`, contas: contas.map(c => c.nome) });
        }
        await prisma.appConfig.upsert({
            where: { key: 'asaas_conta_financeira_ca_id' },
            create: { key: 'asaas_conta_financeira_ca_id', value: conta.id },
            update: { value: conta.id }
        });
        res.json({ ok: true, contaEscolhida: conta });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-extrato-sync — dispara a busca do extrato do Asaas para a
// conciliação bancária (o worker roda sozinho a cada 30 min; isto é para diagnóstico/backfill).
// Body opcional: { dias } (padrão 7, máx 90 — usar 90 na primeira carga).
router.post('/asaas-extrato-sync', async (req, res) => {
    try {
        const asaasExtratoService = require('../services/asaasExtratoService');
        const r = await asaasExtratoService.sincronizar({ dias: Number(req.body?.dias) || 7 });
        res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-corrigir-baixa-entrega — conserta o caso "PIX de entrega
// recebido no Asaas mas parcela aberta" (Caixa só trocou a forma no CA, sem baixar).
// Body: { paymentId } (ex.: pay_3x25fglydot6ist0). Vincula a cobrança à parcela aberta
// de valor compatível e roda a baixa padrão (app: ledger na conta Asaas; CA: baixa na
// conta Asaas, PIX). Idempotente — reprocessar não duplica (flags baixaAppOk/baixaCaOk).
router.post('/asaas-corrigir-baixa-entrega', async (req, res) => {
    try {
        const paymentId = String(req.body?.paymentId || '').trim();
        if (!paymentId) return res.status(400).json({ error: 'Informe paymentId.' });

        const cobranca = await prisma.cobrancaAsaas.findUnique({ where: { asaasPaymentId: paymentId } });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada no app.' });
        if (cobranca.status !== 'RECEBIDO') return res.status(400).json({ error: `Cobrança está ${cobranca.status} — só corrijo cobrança RECEBIDA.` });
        if (!cobranca.pedidoId) return res.status(400).json({ error: 'Cobrança sem pedido vinculado.' });

        // Vincula a parcela aberta de valor compatível (se ainda não vinculada)
        if (!cobranca.parcelaId) {
            const conta = await prisma.contaReceber.findFirst({
                where: { pedidoId: cobranca.pedidoId },
                include: { parcelas: { orderBy: { numeroParcela: 'asc' } } }
            });
            if (!conta) return res.status(400).json({ error: 'Pedido sem conta a receber no app.' });
            const valorCob = Number(cobranca.valorRecebido ?? cobranca.valor);
            const abertas = conta.parcelas.filter(p => ['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(p.status));
            const alvo = abertas.find(p => Math.abs(Number(p.valor) - Number(p.valorPago || 0) - valorCob) <= 0.01) || (abertas.length === 1 ? abertas[0] : null);
            if (!alvo) return res.status(400).json({ error: 'Nenhuma parcela aberta com valor compatível (ambíguo — corrigir à mão).', parcelas: conta.parcelas.map(p => ({ n: p.numeroParcela, valor: p.valor, status: p.status })) });
            await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { parcelaId: alvo.id } });
        }

        const asaasBaixaService = require('../services/asaasBaixaService');
        const r = await asaasBaixaService.registrarBaixa(cobranca.id);
        res.json({ ok: r.erros.length === 0, ...r });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-reprocessar-baixas — cobranças RECEBIDAS com baixa pendente (app ou CA)
router.post('/asaas-reprocessar-baixas', async (req, res) => {
    try {
        const asaasBaixaService = require('../services/asaasBaixaService');
        const resultados = await asaasBaixaService.reprocessarPendentes();
        res.json({ ok: true, total: resultados.length, resultados });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-contas-receber — cria a conta a receber de pedidos
// enviados que ficaram sem (bug do fluxo ABERTO→ENVIAR, ex.: pedidos do Site Congelados).
// Faturados no CA: parcelas espelham as do CA (vencimento/valor oficiais).
// Especiais sem venda no CA: 1 parcela com o total, vencendo na data da venda.
// Body opcional: { numeros: [2035, ...] } para limitar; { dryRun: true } só lista.
router.post('/backfill-contas-receber', async (req, res) => {
    try {
        const numeros = (req.body?.numeros || []).map(n => parseInt(n, 10)).filter(Boolean);
        const dryRun = !!req.body?.dryRun;
        const pedidos = await prisma.pedido.findMany({
            where: {
                bonificacao: false,
                statusEnvio: { in: ['ENVIAR', 'RECEBIDO', 'SINCRONIZANDO'] },
                contaReceber: null,
                ...(numeros.length ? { numero: { in: numeros } } : {})
            },
            include: {
                cliente: { select: { UUID: true } },
                itens: { select: { valor: true, quantidade: true } }
            }
        });

        const resultados = [];
        for (const p of pedidos) {
            const item = { numero: p.numero, especial: p.especial, pedidoId: p.id };
            try {
                const totalItens = Math.round(p.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0) * 100) / 100;
                let parcelasData = null;

                if (p.idVendaContaAzul && p.cliente?.UUID) {
                    // Fonte oficial: parcelas da venda no CA — espelha vencimento, valor E status
                    // (parcela já RECEBIDA no CA entra como PAGO aqui; senão criaria inadimplência falsa)
                    const dataVendaStr = new Date(p.dataVenda).toISOString().split('T')[0];
                    const parcelasCA = await contaAzulService.encontrarParcelasDeVenda(p.cliente.UUID, p.idVendaContaAzul, dataVendaStr);
                    if (parcelasCA?.length) {
                        parcelasData = parcelasCA
                            .sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento))
                            .map((pc, i) => {
                                const valor = Math.round(Number(pc.valor_composicao?.valor_bruto ?? pc.valor ?? 0) * 100) / 100;
                                const pagaNoCA = pc.status === 'RECEBIDO';
                                return {
                                    numeroParcela: i + 1,
                                    valor,
                                    dataVencimento: new Date(pc.data_vencimento),
                                    ...(pagaNoCA ? {
                                        status: 'PAGO',
                                        valorPago: valor,
                                        dataPagamento: pc.data_quitacao ? new Date(pc.data_quitacao) : new Date(pc.data_vencimento),
                                        observacao: 'Baixa espelhada do Conta Azul (backfill de conta a receber).'
                                    } : {})
                                };
                            });
                    }
                }
                if (!parcelasData) {
                    // Sem venda no CA (ex.: especial): 1 parcela com o total do pedido
                    parcelasData = [{ numeroParcela: 1, valor: totalItens, dataVencimento: new Date(p.dataVenda) }];
                }

                const valorTotal = Math.round(parcelasData.reduce((s, x) => s + x.valor, 0) * 100) / 100;
                const pagas = parcelasData.filter(x => x.status === 'PAGO').length;
                const statusConta = pagas === parcelasData.length ? 'QUITADO' : (pagas > 0 ? 'PARCIAL' : 'ABERTO');
                item.parcelas = parcelasData.map(x => ({ valor: x.valor, venc: x.dataVencimento.toISOString().split('T')[0], status: x.status || 'PENDENTE' }));
                item.valorTotal = valorTotal;
                item.statusConta = statusConta;

                if (!dryRun) {
                    await prisma.contaReceber.create({
                        data: {
                            pedidoId: p.id,
                            clienteId: p.clienteId,
                            origem: p.especial ? 'ESPECIAL' : 'FATURADO_CA',
                            valorTotal,
                            status: statusConta,
                            parcelas: { create: parcelasData }
                        }
                    });
                    item.criada = true;
                }
            } catch (e) {
                item.erro = e.message;
            }
            resultados.push(item);
        }
        res.json({ ok: true, dryRun, total: resultados.length, resultados });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-nota-fiscal?idVenda=... — resposta crua da API de notas fiscais do CA
// (investigação: a API devolve link de DANFE PDF/XML?)
router.get('/diag-nota-fiscal', async (req, res) => {
    try {
        // `qs` cru para experimentar formatos (ex.: ?qs=pagina=1%26tamanho_pagina=5).
        // `path` opcional para variar o recurso (ex.: notas-fiscais/{id}/pdf).
        const path = req.query.path || 'notas-fiscais';
        let qs = req.query.qs;
        if (!qs) {
            const hoje = new Date();
            const antes = new Date(hoje.getTime() - 30 * 24 * 3600 * 1000);
            qs = `pagina=1&tamanho_pagina=5&data_inicial=${antes.toISOString().split('T')[0]}&data_final=${hoje.toISOString().split('T')[0]}`;
        }
        const url = `https://api-v2.contaazul.com/v1/${path}${qs ? `?${qs}` : ''}`;
        const response = await contaAzulService._axiosGet(url, 'NOTA_FISCAL_DIAG');
        res.json({ url, data: response.data });
    } catch (e) {
        res.status(500).json({ error: e.message, detalhe: e.response?.data || null, status: e.response?.status || null });
    }
});

// GET /api/admin-exec/diag-danfe?numero=2028 — testa o fluxo completo da DANFE de um pedido
router.get('/diag-danfe', async (req, res) => {
    try {
        const numero = parseInt(req.query.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?numero=' });
        const pedido = await prisma.pedido.findFirst({ where: { numero, especial: false, bonificacao: false } });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        const pedidoController = require('../controllers/pedidoController');
        const nota = await pedidoController._localizarNotaFiscal(pedido);
        const xml = await contaAzulService.buscarXmlNotaFiscal(nota.chave_acesso);
        const { gerarPDF } = require('@alexssmusica/node-pdf-nfe');
        const path = require('path');
        const fs = require('fs');
        const pathLogo = path.join(__dirname, '../assets/logo-danfe.png');
        const doc = await gerarPDF(xml, fs.existsSync(pathLogo) ? { pathLogo } : {});
        // ?pdf=1 → devolve o PDF em si (conferência visual); senão devolve o resumo JSON
        if (req.query.pdf === '1') {
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);
            return;
        }
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => res.json({
            ok: true,
            numeroNota: nota.numero_nota,
            chave: nota.chave_acesso,
            cache: !!nota.cache,
            xmlBytes: xml.length,
            pdfBytes: Buffer.concat(chunks).length
        }));
    } catch (e) {
        res.status(e.statusCode || 500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/danfe-limpar-cache — apaga as DANFEs do cache em disco para
// serem regeradas com o layout atual na próxima impressão (a NF-e em si não muda).
// Body opcional: { chave: '4226...' } limpa só uma; sem body limpa todas.
router.post('/danfe-limpar-cache', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const dir = path.join(__dirname, '../uploads/cache-fiscal');
        if (!fs.existsSync(dir)) return res.json({ ok: true, removidos: [] });
        const chave = (req.body?.chave || '').replace(/\D/g, '');
        const alvos = fs.readdirSync(dir).filter(n =>
            chave ? n === `danfe-${chave}.pdf` : /^danfe-.*\.pdf$/.test(n));
        for (const n of alvos) fs.unlinkSync(path.join(dir, n));
        res.json({ ok: true, removidos: alvos });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-parcela-venda?numero=2034 — parcela CA de uma VENDA (contas a receber):
// mostra todos os campos do detalhe (nome do campo da conta financeira, versao, vencimento)
// + dados locais do pedido/parcelas para comparar vencimentos.
router.get('/diag-parcela-venda', async (req, res) => {
    try {
        const numero = parseInt(req.query.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?numero=' });
        const pedido = await prisma.pedido.findFirst({
            where: { numero, especial: false, bonificacao: false },
            include: {
                cliente: { select: { UUID: true, Nome: true } },
                contaReceber: { include: { parcelas: { orderBy: { numeroParcela: 'asc' } } } }
            }
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

        const dataVendaStr = new Date(pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        let parcelasCA = [];
        let detalhe = null;
        if (pedido.idVendaContaAzul) {
            parcelasCA = await contaAzulService.encontrarParcelasDeVenda(pedido.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr);
            if (parcelasCA[0]?.id) {
                try { detalhe = await contaAzulService.buscarParcelaDetalhe(parcelasCA[0].id); } catch (e) { detalhe = { erro: e.message }; }
            }
        }
        res.json({
            pedidoLocal: {
                numero: pedido.numero,
                dataVenda: pedido.dataVenda,
                nomeCondicaoPagamento: pedido.nomeCondicaoPagamento,
                tipoPagamento: pedido.tipoPagamento,
                primeiroVencimento: pedido.primeiroVencimento,
                intervaloDias: pedido.intervaloDias,
                idContaFinanceira: pedido.idContaFinanceira,
                situacaoCA: pedido.situacaoCA
            },
            parcelasLocais: (pedido.contaReceber?.parcelas || []).map(p => ({ n: p.numeroParcela, venc: p.dataVencimento, status: p.status, valor: p.valor })),
            parcelasCA: parcelasCA.map(p => ({ id: p.id, n: p.numero_parcela, venc: p.data_vencimento, status: p.status })),
            detalheParcelaCA: detalhe
        });
    } catch (e) {
        res.status(500).json({ error: e.message, detalhe: e.response?.data || null });
    }
});

// POST /api/admin-exec/asaas-reprocessar-estorno — força o tratamento de estorno de
// uma cobrança (webhook antigo/perdido). Body: { paymentId } ou { cobrancaId }.
// registrarEstorno é idempotente: se não há baixa, só normaliza o status + gera o aviso.
router.post('/asaas-reprocessar-estorno', async (req, res) => {
    try {
        const { paymentId, cobrancaId } = req.body || {};
        const cobranca = cobrancaId
            ? await prisma.cobrancaAsaas.findUnique({ where: { id: cobrancaId } })
            : await prisma.cobrancaAsaas.findUnique({ where: { asaasPaymentId: paymentId } });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        const asaasBaixaService = require('../services/asaasBaixaService');
        const resultado = await asaasBaixaService.registrarEstorno(cobranca.id);
        const depois = await prisma.cobrancaAsaas.findUnique({ where: { id: cobranca.id } });
        res.json({ ok: true, statusAntes: cobranca.status, statusDepois: depois.status, resultado });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-cobrancas-ca?limite=8 — varre pedidos de BOLETO faturados e
// mostra as solicitações de cobrança do CA (url/tipo/status) + o content-type da URL
// (para saber se o boleto do CA é PDF mergeável na impressão em lote).
router.get('/diag-cobrancas-ca', async (req, res) => {
    try {
        const axios = require('axios');
        const limite = Math.min(parseInt(req.query.limite, 10) || 8, 20);
        const pedidos = await prisma.pedido.findMany({
            where: {
                especial: false, bonificacao: false,
                tipoPagamento: 'BOLETO_BANCARIO',
                idVendaContaAzul: { not: null },
                situacaoCA: 'FATURADO'
            },
            orderBy: { createdAt: 'desc' },
            take: limite,
            include: { cliente: { select: { UUID: true, Nome: true } } }
        });

        const saida = [];
        for (const p of pedidos) {
            const dataVendaStr = new Date(p.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            try {
                const parcelas = await contaAzulService.encontrarParcelasDeVenda(p.cliente.UUID, p.idVendaContaAzul, dataVendaStr);
                const cobs = [];
                for (const par of (parcelas || [])) {
                    for (const c of (par.solicitacoes_cobrancas || [])) {
                        let contentType = null, bytes = null;
                        if (c.url && req.query.testarUrl === '1') {
                            try {
                                const r = await axios.get(c.url, { responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5 });
                                contentType = r.headers['content-type'];
                                bytes = r.data?.length || null;
                            } catch (e) { contentType = `ERRO: ${e.message}`; }
                        }
                        cobs.push({
                            parcela: par.numero_parcela, statusParcela: par.status,
                            tipo: c.tipo_solicitacao_cobranca || c.tipo || null,
                            status: c.status || null,
                            url: c.url || null,
                            _chaves: Object.keys(c || {}),
                            contentType, bytes
                        });
                    }
                }
                saida.push({ numero: p.numero, parcelasCA: (parcelas || []).length, cobrancas: cobs });
            } catch (e) {
                saida.push({ numero: p.numero, erro: e.message });
            }
        }
        res.json({ total: saida.length, pedidos: saida });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/diag-checar-lote — roda a MESMA checagem da impressão em lote
// (consulta o CA e classifica os boletos). Body: { numeros: [2027, 2025] }
router.post('/diag-checar-lote', async (req, res) => {
    try {
        const numeros = (req.body?.numeros || []).map(n => parseInt(n, 10)).filter(Boolean);
        if (!numeros.length) return res.status(400).json({ error: 'Informe numeros: [..]' });
        const pedidos = await prisma.pedido.findMany({
            where: { numero: { in: numeros }, especial: false, bonificacao: false },
            select: { id: true, numero: true }
        });
        const impressaoLoteService = require('../services/impressaoLoteService');
        const itens = await impressaoLoteService.checar(pedidos.map(p => p.id));
        res.json({ itens });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/diag-parcela-patch — testa PATCH numa parcela CA (ex.: trocar conta financeira)
// Body: { parcelaId, payload } — versao atual é buscada automaticamente
router.post('/diag-parcela-patch', async (req, res) => {
    try {
        const { parcelaId, payload } = req.body || {};
        if (!parcelaId || !payload) return res.status(400).json({ error: 'Informe parcelaId e payload.' });
        const antes = await contaAzulService.buscarParcelaDetalhe(parcelaId);
        const patch = { versao: antes.versao, ...payload };
        await contaAzulService.atualizarParcela(parcelaId, patch);
        const depois = await contaAzulService.buscarParcelaDetalhe(parcelaId);
        res.json({
            ok: true,
            patchEnviado: patch,
            contaAntes: antes.conta_financeira?.nome || null,
            contaDepois: depois.conta_financeira?.nome || null,
            metodoDepois: depois.metodo_pagamento,
            vencimentoDepois: depois.data_vencimento
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, detalhe: e.response?.data || null });
    }
});

// GET /api/admin-exec/asaas-cobrancas — últimas cobranças (diagnóstico)
router.get('/asaas-cobrancas', async (req, res) => {
    try {
        // ?pedidoNumero=2041 filtra por pedido; nesse caso devolve também a conta/parcelas
        const numero = parseInt(req.query.pedidoNumero, 10) || null;
        const cobrancas = await prisma.cobrancaAsaas.findMany({
            where: numero ? { pedido: { numero, especial: false, bonificacao: false } } : {},
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { cliente: { select: { Nome: true } }, pedido: { select: { numero: true } } }
        });
        let conta = null;
        if (numero) {
            conta = await prisma.contaReceber.findFirst({
                where: { pedido: { numero, especial: false, bonificacao: false } },
                include: { parcelas: true, pedido: { select: { numero: true, baixaCaRealizada: true, situacaoCA: true } } }
            });
        }
        const eventos = numero ? [] : await prisma.asaasWebhookEvento.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
        res.json({ cobrancas, conta, eventos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-extrato-asaas-pendentes — SÓ LEITURA. Cruza os CRÉDITOS
// pendentes do extrato Asaas (conciliação) com as cobranças/pedidos/parcelas do app
// para achar descompasso: dinheiro que entrou no Asaas mas cuja parcela está aberta
// ou foi baixada em outra conta (ex.: Caixa trocou a forma no CA e não criou a baixa).
router.get('/diag-extrato-asaas-pendentes', async (req, res) => {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
        const contaAsaas = cfg?.value || null;
        if (!contaAsaas) return res.status(400).json({ error: 'Conta Asaas não vinculada.' });

        const creditos = await prisma.extratoLancamento.findMany({
            where: { contaFinanceiraCaId: contaAsaas, tipo: 'CREDITO', status: 'PENDENTE' },
            orderBy: { data: 'desc' },
            take: 100
        });

        const relatorio = [];
        for (const l of creditos) {
            const item = {
                data: l.data, valor: Number(l.valor), descricao: l.descricao,
                paymentId: l.refNum || null, situacao: 'SEM_COBRANCA_NO_APP', detalhe: null
            };
            const cobranca = l.refNum
                ? await prisma.cobrancaAsaas.findUnique({
                    where: { asaasPaymentId: l.refNum },
                    include: { pedido: { select: { id: true, numero: true, baixaCaRealizada: true, baixaCaEm: true } } }
                })
                : null;
            if (cobranca) {
                item.pedido = cobranca.pedido?.numero || null;
                item.tipoCobranca = cobranca.tipo;
                item.statusCobranca = cobranca.status;
                item.baixaAppOk = cobranca.baixaAppOk;
                item.parcelaVinculada = !!cobranca.parcelaId;

                // Pagamentos registrados na entrega (o vínculo é o que separa PIX Asaas de Pix comum no Caixa)
                if (cobranca.pedidoId) {
                    const pagsReais = await prisma.pedidoPagamentoReal.findMany({
                        where: { pedidoId: cobranca.pedidoId },
                        select: { formaPagamentoNome: true, valor: true, cobrancaAsaasId: true }
                    });
                    item.pagamentosEntrega = pagsReais.map(p => ({
                        forma: p.formaPagamentoNome, valor: Number(p.valor), vinculadoAsaas: !!p.cobrancaAsaasId
                    }));
                    const conta = await prisma.contaReceber.findFirst({
                        where: { pedidoId: cobranca.pedidoId },
                        include: {
                            parcelas: {
                                include: { pagamentos: { where: { estornado: false }, select: { valorRecebido: true, contaFinanceiraCaId: true, formaPagamento: true } } }
                            }
                        }
                    });
                    if (conta) {
                        item.statusConta = conta.status;
                        item.parcelas = conta.parcelas.map(p => ({
                            numero: p.numeroParcela, valor: Number(p.valor), status: p.status,
                            contaFinanceiraCaId: p.contaFinanceiraCaId,
                            baixadaNaContaAsaas: p.contaFinanceiraCaId === contaAsaas,
                            pagamentos: p.pagamentos.map(pg => ({ valor: Number(pg.valorRecebido), conta: pg.contaFinanceiraCaId, forma: pg.formaPagamento }))
                        }));
                        const temAberta = conta.parcelas.some(p => ['PENDENTE', 'PARCIAL'].includes(p.status));
                        const pagaForaAsaas = conta.parcelas.some(p => p.status === 'PAGO' && p.contaFinanceiraCaId && p.contaFinanceiraCaId !== contaAsaas);
                        if (temAberta) {
                            item.situacao = 'DESCOMPASSO_PARCELA_ABERTA';
                            item.detalhe = 'Dinheiro entrou no Asaas mas a parcela segue aberta no app (e provavelmente no CA).';
                        } else if (pagaForaAsaas) {
                            item.situacao = 'BAIXADA_EM_OUTRA_CONTA';
                            item.detalhe = 'Parcela paga, mas registrada em outra conta financeira (não a do Asaas).';
                        } else {
                            item.situacao = 'PAGA_SEM_LEDGER_NA_CONTA';
                            item.detalhe = 'Parcela paga; conferir por que a conciliação não achou a baixa (baixa sem ledger ou sem conta).';
                        }
                    } else {
                        item.situacao = 'PEDIDO_SEM_CONTA_RECEBER';
                    }
                } else {
                    item.situacao = 'COBRANCA_SEM_PEDIDO';
                }
            }
            relatorio.push(item);
        }

        const resumo = {};
        for (const r of relatorio) resumo[r.situacao] = (resumo[r.situacao] || 0) + 1;
        res.json({ contaAsaas, totalCreditosPendentes: creditos.length, resumo, relatorio });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-dashboard-vendas — confere as vendas do mês na regra do
// Dashboard Gerencial (FATURADO ou especial, sem bonificação) direto no banco de
// produção: total do mês, últimos 7 dias por dia e o pedido mais recente.
router.get('/diag-dashboard-vendas', async (req, res) => {
    try {
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const mes = hoje.slice(0, 7);
        const gte = new Date(`${mes}-01T00:00:00-03:00`);
        const lte = new Date(`${hoje}T23:59:59.999-03:00`);
        const [y, m] = mes.split('-').map(Number);
        const fimMes = new Date(`${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}T23:59:59.999-03:00`);
        const [totalMes, totalMesInteiro, porDia, ultimo, devolucoes] = await Promise.all([
            prisma.$queryRaw`
                SELECT COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total, COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}`,
            prisma.$queryRaw`
                SELECT COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total, COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${gte} AND p.data_venda <= ${fimMes}`,
            prisma.$queryRaw`
                SELECT to_char((p.data_venda AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
                       COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total, COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${gte}
                GROUP BY 1 ORDER BY 1 DESC LIMIT 10`,
            prisma.pedido.findFirst({
                where: { bonificacao: false },
                orderBy: { createdAt: 'desc' },
                select: { numero: true, createdAt: true, dataVenda: true, situacaoCA: true, especial: true }
            }),
            prisma.devolucao.aggregate({
                _sum: { valorTotal: true },
                where: { status: 'ATIVA', dataDevolucao: { gte, lte } }
            })
        ]);
        res.json({
            hojeSP: hoje,
            regra: 'FATURADO ou especial, sem bonificação, data_venda no período',
            mesAteHoje: { ...totalMes[0] },
            mesInteiro: { ...totalMesInteiro[0], nota: 'é este que o Dashboard Gerencial mostra' },
            devolucoesMes: Number(devolucoes._sum.valorTotal || 0),
            porDia,
            pedidoMaisRecente: ultimo
        });
    } catch (error) {
        console.error('[admin-exec] diag-dashboard-vendas:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/testar-alerta-certificado — roda o alerta de validade do A1 na hora.
// Se faltar > 30 dias, só retorna { dias, alertado:false } (não envia WhatsApp) — seguro p/ testar.
router.get('/testar-alerta-certificado', async (req, res) => {
    try {
        const certificadoService = require('../services/certificadoService');
        const r = await certificadoService.alertarValidadeCertificado();
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-parcela-ca?nota=1802  — diagnóstico de edição de vencimento no CA
router.get('/diag-parcela-ca', async (req, res) => {
    try {
        const { nota } = req.query;
        if (!nota) return res.status(400).json({ error: 'Informe ?nota=NUMERO' });

        const conta = await prisma.contaPagar.findFirst({
            where: { OR: [{ numeroNota: String(nota) }, { descricao: { contains: String(nota) } }] },
            include: { parcelas: { orderBy: { numeroParcela: 'asc' } } },
            orderBy: { criadoEm: 'desc' }
        });
        if (!conta) return res.json({ ok: false, motivo: `Nenhuma conta com nota "${nota}"` });

        const parcelasLocal = conta.parcelas.map((p) => ({
            id: p.id, numeroParcela: p.numeroParcela, status: p.status,
            dataVencimentoLocal: p.dataVencimento, valorLocal: p.valor, idParcelaCA: p.idParcelaCA
        }));

        // Estado REAL no CA da 1ª parcela mapeada (mostra o nome/valor do campo de vencimento no CA)
        let parcelaCA = null;
        const mapeada = conta.parcelas.find((p) => p.idParcelaCA);
        if (mapeada) {
            try {
                const det = await contaAzulService.buscarParcelaDetalhe(mapeada.idParcelaCA);
                parcelaCA = {
                    idParcelaCA: mapeada.idParcelaCA,
                    versao: det?.versao,
                    status: det?.status, status_traduzido: det?.status_traduzido,
                    data_vencimento: det?.data_vencimento, vencimento: det?.vencimento,
                    total: det?.total, valor_composicao: det?.valor_composicao,
                    _chaves: Object.keys(det || {})
                };
            } catch (e) {
                parcelaCA = { erro: e.response?.data || e.message };
            }
        }

        const logs = await prisma.syncLog.findMany({
            where: { tipo: { in: ['PARCELA_ATUALIZAR', 'PARCELA_DETALHE'] } },
            orderBy: { dataHora: 'desc' }, take: 8,
            select: { tipo: true, status: true, mensagem: true, requestMethod: true, responseStatus: true, responseBody: true, dataHora: true }
        });

        res.json({
            ok: true,
            conta: { id: conta.id, descricao: conta.descricao, numeroNota: conta.numeroNota, statusEnvioCA: conta.statusEnvioCA, idEventoCA: conta.idEventoCA },
            parcelasLocal, parcelaCA, logsRecentes: logs
        });
    } catch (error) {
        console.error('[admin-exec] Erro diag-parcela-ca:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/diag-conciliacao?nota=858860  (ou ?busca=produpan)
// SOMENTE LEITURA: refaz a busca de conciliação ao vivo no CA e mostra por que casou/ não casou.
router.get('/diag-conciliacao', async (req, res) => {
    try {
        const { nota, busca } = req.query;
        const BASE = 'https://api-v2.contaazul.com';
        const fmtDataCA = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const round2 = (v) => Math.round(Number(v) * 100) / 100;

        const where = nota
            ? { numeroNota: { contains: String(nota) } }
            : { OR: [
                { descricao: { contains: String(busca || ''), mode: 'insensitive' } },
                { fornecedor: { razaoSocial: { contains: String(busca || ''), mode: 'insensitive' } } }
              ] };
        const contas = await prisma.contaPagar.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 3, include: { fornecedor: true, parcelas: true } });
        if (contas.length === 0) return res.json({ erro: 'Nenhuma conta encontrada no app', where });

        const info = {
            contasApp: contas.map(c => ({
                id: c.id, numeroNota: c.numeroNota, valorTotal: Number(c.valorTotal),
                statusEnvioCA: c.statusEnvioCA, idEventoCA: c.idEventoCA, erroEnvioCA: c.erroEnvioCA,
                fornecedorCaId: c.fornecedor?.contaAzulId,
                vencs: c.parcelas.map(p => fmtDataCA(p.dataVencimento))
            }))
        };

        const conta = contas[0];
        const numero = String(conta.numeroNota || '').trim();
        const datas = conta.parcelas.map(p => new Date(p.dataVencimento).getTime()).filter(t => !isNaN(t));
        const bc = new Date(conta.competencia || Date.now()).getTime(); if (!isNaN(bc)) datas.push(bc);
        const JAN = 45 * 24 * 60 * 60 * 1000;
        const de = fmtDataCA(new Date(Math.min(...datas) - JAN));
        const ate = fmtDataCA(new Date(Math.max(...datas) + JAN));
        const statusQS = ['RECEBIDO', 'EM_ABERTO', 'ATRASADO', 'RECEBIDO_PARCIAL', 'RENEGOCIADO', 'PERDIDO'].map(s => `&status=${s}`).join('');
        const url = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=1&tamanho_pagina=100&data_vencimento_de=${de}&data_vencimento_ate=${ate}${statusQS}`;

        const valorConta = round2(Number(conta.valorTotal || 0));
        const alvoForn = String(conta.fornecedor?.razaoSocial || 'produpan').toLowerCase().split(' ')[0];
        const candidatos = [];
        let pagina = 1, totalItens = null, itensVarridos = 0;
        try {
            while (pagina <= 10) {
                const purl = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=${pagina}&tamanho_pagina=100&data_vencimento_de=${de}&data_vencimento_ate=${ate}${statusQS}`;
                const resp = await contaAzulService._axiosGet(purl, 'DIAG_CONCILIA');
                const itens = resp.data?.itens || resp.data?.items || [];
                totalItens = Number(resp.data?.itens_totais || totalItens || 0);
                itensVarridos += itens.length;
                for (const it of itens) {
                    const totalIt = round2(Number(it.total ?? it.nao_pago ?? 0));
                    const desc = String(it.descricao || '');
                    const forn = String(it.fornecedor?.nome || '');
                    const valorBate = Math.abs(totalIt - valorConta) < 0.01;
                    const numNaDesc = numero && desc.includes(numero);
                    const pareceForn = forn.toLowerCase().includes(alvoForn) || desc.toLowerCase().includes('produpan') || desc.includes('858860');
                    if (valorBate || numNaDesc || pareceForn) {
                        let det = {};
                        try {
                            const d = await contaAzulService._axiosGet(`${BASE}/v1/financeiro/eventos-financeiros/parcelas/${it.id}`, 'DIAG_DET');
                            const ev = d.data?.evento || {};
                            det = { evento_id: ev.id, codigo_referencia: ev.codigo_referencia, origem: ev.origem, evento_descricao: ev.descricao };
                        } catch (e) { det = { erroDetalhe: e.message }; }
                        candidatos.push({ parcelaId: it.id, total: totalIt, descricao: desc, fornecedor: forn, valorBate, numeroAppNaDesc: numNaDesc, ...det });
                    }
                }
                if (itens.length < 100) break;
                if (totalItens && pagina * 100 >= totalItens) break;
                pagina++;
            }
        } catch (e) {
            info.buscaErro = e.response?.status ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message;
        }
        info.busca = { numeroApp: numero, de, ate, itens_totais: totalItens, itensVarridos, paginas: pagina };
        info.candidatos = candidatos;

        // Chama a função REAL de conciliação para confirmar o que ela adotaria hoje (só leitura).
        try {
            const contasPagarCaSyncService = require('../services/contasPagarCaSyncService');
            const adotaria = await contasPagarCaSyncService._encontrarEventoPorNumeroNota(conta);
            info.conciliacaoReal = { adotariaEventoId: adotaria || null };
        } catch (e) {
            info.conciliacaoReal = { erro: e.message };
        }

        // Testa a busca de fornecedor por documento (dedup de cadastro no CA).
        try {
            const cnpj = conta.fornecedor?.cnpjCpf;
            const achado = cnpj ? await contaAzulService.buscarFornecedorPorDocumento(cnpj) : null;
            info.fornecedorNoCA = { cnpj: cnpj || null, appUsaContaAzulId: conta.fornecedor?.contaAzulId || null, buscaPorDocumentoRetornou: achado };
        } catch (e) {
            info.fornecedorNoCA = { erro: e.message };
        }
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: (error.stack || '').split('\n').slice(0, 5) });
    }
});

// POST /api/admin-exec/kitfesta-reenviar-whatsapp/:numero
// Reenvia (ou envia) ao celular do cliente a confirmação de um pedido do Kit Festa.
// Útil para pedidos criados antes do recurso entrar no ar ou que falharam no envio.
router.post('/kitfesta-reenviar-whatsapp/:numero', async (req, res) => {
    try {
        const numero = parseInt(req.params.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Número de pedido inválido.' });
        const pedido = await prisma.kitFestaPedido.findUnique({ where: { numero } });
        if (!pedido) return res.status(404).json({ error: 'Pedido Kit Festa não encontrado.' });
        const webhookService = require('../services/webhookService');
        const result = await webhookService.notificarPedidoKitFesta(pedido.id);
        res.json({ numero, telefoneCliente: pedido.telefoneCliente, ...result });
    } catch (error) {
        console.error('[admin-exec] Erro kitfesta-reenviar-whatsapp:', error);
        res.status(500).json({ ok: false, motivo: error.message });
    }
});

// GET /api/admin-exec/diag-colunas
// SOMENTE LEITURA. Conta, por tabela, colunas vivas vs "fantasma" (dropped) que
// ainda ocupam vaga no limite de 1600 do Postgres. Usado para diagnosticar o
// estoque de colunas mortas (ex.: tabela "clientes" no teto).
// ── POST /corrigir-tipo-condicao — corrige o tipo de pagamento de uma condição ──
// A condição "À vista - Funcionário" estava cadastrada como BOLETO_BANCARIO (venda a
// funcionário não é boleto — o pedido é especial e nem vai ao CA). Isso a fazia cair no filtro
// "Cobrança = Boleto" de Contas a Receber. Corrige o cadastro (tabela_precos) e o tipo gravado
// nos pedidos já feitos com essa condição.
// Body: { condicaoId: "4000", tipoNovo: "DINHEIRO", aplicar: false }  (aplicar=false → só simula)
router.post('/corrigir-tipo-condicao', async (req, res) => {
    try {
        const { condicaoId, tipoNovo, aplicar } = req.body || {};
        if (!condicaoId || !tipoNovo) {
            return res.status(400).json({ ok: false, error: 'Informe condicaoId e tipoNovo.' });
        }
        const condicao = await prisma.tabelaPreco.findUnique({ where: { id: String(condicaoId) } });
        if (!condicao) return res.status(404).json({ ok: false, error: 'Condição não encontrada.' });

        // `not` no Prisma exclui linhas null — daí o OR explícito para pegar também pedido sem tipo
        const alvoPedidos = {
            nomeCondicaoPagamento: condicao.nomeCondicao,
            OR: [{ tipoPagamento: { not: tipoNovo } }, { tipoPagamento: null }]
        };
        const pedidosAfetados = await prisma.pedido.count({ where: alvoPedidos });

        const resumo = {
            condicao: { id: condicao.id, nome: condicao.nomeCondicao, tipoAtual: condicao.tipoPagamento, tipoNovo },
            pedidosAfetados,
            aplicado: false
        };
        if (!aplicar) return res.json({ ok: true, simulacao: true, ...resumo });

        await prisma.tabelaPreco.update({ where: { id: condicao.id }, data: { tipoPagamento: tipoNovo } });
        const upd = await prisma.pedido.updateMany({ where: alvoPedidos, data: { tipoPagamento: tipoNovo } });
        res.json({ ok: true, simulacao: false, ...resumo, aplicado: true, pedidosAtualizados: upd.count });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/diag-colunas', async (req, res) => {
    try {
        const linhas = await prisma.$queryRawUnsafe(`
            SELECT
                c.relname AS tabela,
                count(*) FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped)::int AS colunas_vivas,
                count(*) FILTER (WHERE a.attnum > 0 AND a.attisdropped)::int     AS colunas_fantasma,
                count(*) FILTER (WHERE a.attnum > 0)::int                        AS total_slots
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            GROUP BY c.relname
            ORDER BY total_slots DESC
            LIMIT 40
        `);
        res.json({ ok: true, limiteMaximo: 1600, tabelas: linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/recalcular-dia/:diaSigla
// Recalcula insights + orientação para todos os clientes de um dia de rota
router.post('/recalcular-dia/:diaSigla', async (req, res) => {
    const sigla = (req.params.diaSigla || '').toUpperCase().trim();
    const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

    if (!DIAS_VALIDOS.includes(sigla)) {
        return res.status(400).json({ error: `Sigla inválida. Use: ${DIAS_VALIDOS.join(', ')}` });
    }

    try {
        const clientes = await prisma.cliente.findMany({
            where: { Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Dia_de_venda: true },
        });

        const filtrados = clientes.filter(c =>
            c.Dia_de_venda.toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );

        const resultados = [];
        for (const c of filtrados) {
            const insight = await clienteInsightService.recalcularCliente(c.UUID);
            const cat = insight ? orientacaoService.CATALOGO[insight.insightPrincipalTipo] : null;
            resultados.push({
                clienteId: c.UUID,
                nome: c.NomeFantasia || c.Nome,
                cenario: insight?.insightPrincipalTipo ?? null,
                situacao: cat?.situacao ?? null,
                objetivo: cat?.objetivo ?? null,
                canalRecomendado: cat?.canalRecomendado ?? null,
                acaoSugerida: cat?.acaoSugerida ?? null,
                statusRecompra: insight?.statusRecompra ?? null,
                diasSemComprar: insight?.diasSemComprar ?? null,
                ticketRecente: insight?.ticketMedioRecente ? Number(insight.ticketMedioRecente).toFixed(2) : null,
                variacaoTicket: insight?.variacaoTicketPct ? Number(insight.variacaoTicketPct).toFixed(1) + '%' : null,
                atendimentosSemPedido30d: insight?.qtdAtendimentosSemPedido30d ?? null,
                ok: !!insight,
            });
        }

        res.json({ dia: sigla, total: filtrados.length, resultados });
    } catch (error) {
        console.error('[admin-exec] Erro recalcular-dia:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin-exec/ia-dia/:diaSigla
// Gera orientação via IA (GPT-4o-mini) para todos os clientes de um dia de rota
router.post('/ia-dia/:diaSigla', async (req, res) => {
    const sigla = (req.params.diaSigla || '').toUpperCase().trim();
    const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
    if (!DIAS_VALIDOS.includes(sigla)) {
        return res.status(400).json({ error: `Sigla inválida. Use: ${DIAS_VALIDOS.join(', ')}` });
    }
    try {
        const clientes = await prisma.cliente.findMany({
            where: { Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Dia_de_venda: true }
        });
        const filtrados = clientes.filter(c =>
            c.Dia_de_venda.toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );
        const resultados = [];
        for (const c of filtrados) {
            try {
                const resultado = await orientacaoService.gerarOrientacaoIA(c.UUID, { disparadoPor: 'MANUAL' });
                resultados.push({ ok: true, ...resultado });
            } catch (err) {
                resultados.push({ ok: false, clienteId: c.UUID, nome: c.NomeFantasia || c.Nome, erro: err.message });
            }
        }
        res.json({ dia: sigla, total: filtrados.length, resultados });
    } catch (error) {
        console.error('[admin-exec] Erro ia-dia:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin-exec/migrate-ia-log
// Cria tabela ia_analise_logs se não existir (migração manual)
router.post('/migrate-ia-log', async (req, res) => {
    const steps = [];
    try {
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ia_analise_logs" ("id" SERIAL NOT NULL, "cliente_id" TEXT NOT NULL, "vendedor_id" TEXT, "disparado_por" TEXT NOT NULL, "disparado_por_usuario_id" TEXT, "atendimento_id" INTEGER, "modelo" TEXT NOT NULL DEFAULT 'gpt-4o-mini', "prompt_enviado" TEXT NOT NULL, "dados_entrada" JSONB NOT NULL, "resposta_ia" JSONB, "tokens_prompt" INTEGER, "tokens_resposta" INTEGER, "tokens_total" INTEGER, "duracao_ms" INTEGER, "sucesso" BOOLEAN NOT NULL DEFAULT true, "erro_msg" TEXT, "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ia_analise_logs_pkey" PRIMARY KEY ("id"))`);
        steps.push('tabela criada');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_cliente_id_idx" ON "ia_analise_logs"("cliente_id")`);
        steps.push('index cliente_id');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_criado_em_idx" ON "ia_analise_logs"("criado_em" DESC)`);
        steps.push('index criado_em');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_vendedor_id_idx" ON "ia_analise_logs"("vendedor_id")`);
        steps.push('index vendedor_id');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_disparado_por_idx" ON "ia_analise_logs"("disparado_por")`);
        steps.push('index disparado_por');
        // FK com verificação manual (DO $$ não é prepared statement)
        const [fkExiste] = await prisma.$queryRaw`SELECT COUNT(*) as c FROM information_schema.table_constraints WHERE constraint_name = 'ia_analise_logs_cliente_id_fkey'`;
        if (Number(fkExiste.c) === 0) {
            await prisma.$executeRawUnsafe(`ALTER TABLE "ia_analise_logs" ADD CONSTRAINT "ia_analise_logs_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("UUID") ON DELETE RESTRICT ON UPDATE CASCADE`);
            steps.push('FK adicionada');
        } else {
            steps.push('FK já existe');
        }
        // Corrigir tipo da coluna atendimento_id de INTEGER para TEXT (fix UUID)
        try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "ia_analise_logs" ALTER COLUMN "atendimento_id" TYPE TEXT USING "atendimento_id"::text`);
            steps.push('coluna atendimento_id convertida para TEXT');
        } catch (e) {
            steps.push(`atendimento_id já é TEXT ou erro: ${e.message}`);
        }
        res.json({ ok: true, steps, mensagem: 'Tabela ia_analise_logs criada/verificada com sucesso.' });
    } catch (error) {
        console.error('[admin-exec] Erro migrate-ia-log:', error);
        res.status(500).json({ error: error.message, steps });
    }
});

// GET /api/admin-exec/ia-log-status
// Diagnóstico: verifica se iaAnaliseLog está disponível no Prisma e conta registros
router.get('/ia-log-status', async (req, res) => {
    try {
        // 1. Conta via raw SQL (sempre funciona se a tabela existe)
        const [countRaw] = await prisma.$queryRaw`SELECT COUNT(*)::int as total FROM "ia_analise_logs"`;
        // 2. Testa se o model Prisma está disponível
        let prismaModelOk = false;
        let prismaCount = null;
        try {
            prismaCount = await prisma.iaAnaliseLog.count();
            prismaModelOk = true;
        } catch (e) {
            prismaModelOk = false;
        }
        res.json({
            tabelaExiste: true,
            totalRegistrosRaw: countRaw.total,
            prismaModelDisponivel: prismaModelOk,
            prismaCount,
        });
    } catch (error) {
        res.status(500).json({ error: error.message, tabelaExiste: false });
    }
});

// POST /api/admin-exec/limpar-atendimentos-pedido
// Remove atendimentos auto-criados do tipo PEDIDO (gerados erroneamente ao criar pedido)
router.post('/limpar-atendimentos-pedido', async (req, res) => {
    try {
        const result = await prisma.atendimento.deleteMany({ where: { tipo: 'PEDIDO' } });
        res.json({ ok: true, removidos: result.count });
    } catch (error) {
        console.error('[admin-exec] Erro limpar-atendimentos-pedido:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-pendencias?email=xxx&data=2026-04-21
// Diagnostica o que existe no banco para um vendedor em uma data
router.get('/debug-pendencias', async (req, res) => {
    try {
        const { email, data } = req.query;
        if (!email || !data) return res.status(400).json({ error: 'email e data obrigatórios' });

        const vendedor = await prisma.vendedor.findFirst({ where: { email } });
        if (!vendedor) return res.status(404).json({ error: 'Vendedor não encontrado', email });

        const vendedorId = vendedor.id;
        const inicioDia = new Date(data + 'T00:00:00Z');
        const fimAmanha = new Date(data + 'T23:59:59.999Z');
        fimAmanha.setDate(fimAmanha.getDate() + 1);

        // Clientes da rota do dia
        const SIGLAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const sigla = SIGLAS[new Date(data + 'T12:00:00Z').getDay()];
        const todosClientes = await prisma.cliente.findMany({
            where: { idVendedor: vendedorId, Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, NomeFantasia: true, Nome: true, Dia_de_venda: true },
        });
        const clientesDoDia = todosClientes.filter(c =>
            (c.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );
        const uuids = clientesDoDia.map(c => c.UUID);

        const atendimentos = await prisma.atendimento.findMany({
            where: { clienteId: { in: uuids }, criadoEm: { gte: inicioDia, lte: fimAmanha }, tipo: { not: 'FINANCEIRO' } },
            select: { id: true, tipo: true, criadoEm: true, observacao: true, clienteId: true, cliente: { select: { NomeFantasia: true } } },
        });
        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: { in: uuids }, createdAt: { gte: inicioDia, lte: fimAmanha } },
            select: { id: true, createdAt: true, dataVenda: true, clienteId: true, cliente: { select: { NomeFantasia: true } } },
        });

        const atendidos = new Set([...atendimentos.map(a => a.clienteId), ...pedidos.map(p => p.clienteId)]);
        const pendentes = clientesDoDia.filter(c => !atendidos.has(c.UUID));

        res.json({
            vendedor: vendedor.nome || vendedor.email,
            vendedorId,
            sigla,
            totalRota: clientesDoDia.length,
            atendimentos: atendimentos.length,
            pedidos: pedidos.length,
            pendentes: pendentes.length,
            clientesPendentes: pendentes.map(c => c.NomeFantasia || c.Nome),
            detalheAtendimentos: atendimentos,
            detalhePedidos: pedidos,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-cliente-atendimentos?clienteId=xxx
// Últimos atendimentos de um cliente (sem filtro de data)
router.get('/debug-cliente-atendimentos', async (req, res) => {
    try {
        const { clienteId } = req.query;
        if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });
        const atendimentos = await prisma.atendimento.findMany({
            where: { clienteId },
            select: { id: true, tipo: true, acaoKey: true, acaoLabel: true, observacao: true, criadoEm: true, idVendedor: true },
            orderBy: { criadoEm: 'desc' },
            take: 10,
        });
        res.json({ total: atendimentos.length, atendimentos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin-exec/recalcular-todos
// Recalcula insights de TODOS os clientes ativos
router.post('/recalcular-todos', async (req, res) => {
    res.json({ ok: true, mensagem: 'Recálculo iniciado em background.' });
    setImmediate(() => {
        clienteInsightService.recalcularTodosClientes().catch(console.error);
    });
});

// GET /api/admin-exec/diag-receber-conciliacao?pedido=2033  (SOMENTE LEITURA)
// Mostra, para um pedido, o ledger de recebimentos (PagamentoParcela) com a conta
// financeira de cada baixa, a conta Asaas, e os lançamentos do extrato pendentes
// na conta Asaas — para diagnosticar por que um crédito do Asaas não acha par.
router.get('/diag-receber-conciliacao', async (req, res) => {
    try {
        const numero = parseInt(req.query.pedido, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?pedido=NUMERO' });
        const ymd = (d) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : null;

        const pedido = await prisma.pedido.findFirst({ where: { numero }, select: { id: true, numero: true } });
        if (!pedido) return res.json({ ok: false, motivo: `Nenhum pedido ${numero}` });

        const contas = await prisma.contaReceber.findMany({
            where: { pedidoId: pedido.id },
            select: {
                id: true, status: true, valorTotal: true,
                parcelas: {
                    select: {
                        id: true, numeroParcela: true, valor: true, valorPago: true, status: true,
                        contaFinanceiraCaId: true, dataPagamento: true,
                        pagamentos: {
                            select: {
                                id: true, valorRecebido: true, formaPagamento: true, contaFinanceiraCaId: true,
                                dataPagamento: true, estornado: true, observacao: true
                            },
                            orderBy: { dataPagamento: 'asc' }
                        }
                    }
                }
            }
        });

        // Conta Asaas (pela integração) + nome das contas envolvidas
        const asaasCfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } }).catch(() => null);
        const asaasContaId = (typeof asaasCfg?.value === 'string' && asaasCfg.value) ? asaasCfg.value : null;
        const contasFin = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } });
        const nomeConta = (id) => contasFin.find((c) => c.id === id)?.nomeBanco || (id ? '(conta não cadastrada)' : '(sem conta)');

        const ledger = [];
        for (const cr of contas) {
            for (const p of cr.parcelas) {
                for (const pg of p.pagamentos) {
                    ledger.push({
                        parcela: p.numeroParcela, valorRecebido: Number(pg.valorRecebido), forma: pg.formaPagamento,
                        contaFinanceiraCaId: pg.contaFinanceiraCaId, conta: nomeConta(pg.contaFinanceiraCaId),
                        ehAsaas: !!asaasContaId && pg.contaFinanceiraCaId === asaasContaId,
                        data: ymd(pg.dataPagamento), estornado: pg.estornado
                    });
                }
            }
        }

        // Lançamentos do extrato pendentes na conta Asaas com valor 10 (o crédito do exemplo)
        const extratoAsaas = asaasContaId ? await prisma.extratoLancamento.findMany({
            where: { contaFinanceiraCaId: asaasContaId, status: 'PENDENTE', tipo: 'CREDITO' },
            select: { id: true, data: true, valor: true, descricao: true, status: true },
            orderBy: { data: 'desc' }, take: 30
        }) : [];

        res.json({
            ok: true,
            pedido: numero,
            asaasContaId, asaasContaNome: nomeConta(asaasContaId),
            parcelas: contas.flatMap((c) => c.parcelas.map((p) => ({
                numeroParcela: p.numeroParcela, valor: Number(p.valor), valorPago: Number(p.valorPago || 0),
                status: p.status, contaFinanceiraCaId: p.contaFinanceiraCaId, conta: nomeConta(p.contaFinanceiraCaId)
            }))),
            ledgerRecebimentos: ledger,
            temRecebimentoAsaas: ledger.some((l) => l.ehAsaas && !l.estornado),
            extratoAsaasPendenteCredito: extratoAsaas.map((l) => ({ ...l, valor: Number(l.valor), data: ymd(l.data) }))
        });
    } catch (error) {
        console.error('[admin-exec] Erro diag-receber-conciliacao:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-contas-receber-abertas — diagnóstico de contas ABERTO/PARCIAL por status do pedido
router.get('/debug-contas-receber-abertas', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { status: { in: ['ABERTO', 'PARCIAL'] } },
            select: {
                id: true, status: true, origem: true,
                pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true, bonificacao: true, especial: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        const agrupado = {};
        for (const c of contas) {
            const key = c.pedido
                ? `pedido: statusEnvio=${c.pedido.statusEnvio} | situacaoCA=${c.pedido.situacaoCA} | bonificacao=${c.pedido.bonificacao} | especial=${c.pedido.especial}`
                : 'sem pedido (ESPECIAL)';
            if (!agrupado[key]) agrupado[key] = { count: 0, exemplos: [] };
            agrupado[key].count++;
            if (agrupado[key].exemplos.length < 5) {
                agrupado[key].exemplos.push({
                    contaStatus: c.status,
                    pedidoNumero: c.pedido?.numero || null
                });
            }
        }

        res.json({ total: contas.length, agrupado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/cancelar-contas-pedido-excluido — cancela contas cujo pedido foi excluído/cancelado no CA
router.post('/cancelar-contas-pedido-excluido', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: {
                    OR: [
                        { statusEnvio: 'EXCLUIDO' },
                        { situacaoCA: { in: ['CANCELADO', 'EXCLUIDO'] } }
                    ]
                }
            },
            select: { id: true, pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true, bonificacao: true } } }
        });

        let canceladas = 0;
        for (const c of contas) {
            await prisma.$transaction([
                prisma.parcela.updateMany({
                    where: { contaReceberId: c.id, status: { notIn: ['PAGO'] } },
                    data: { status: 'CANCELADO' }
                }),
                prisma.contaReceber.update({
                    where: { id: c.id },
                    data: { status: 'CANCELADO' }
                })
            ]);
            canceladas++;
        }

        res.json({
            ok: true,
            canceladas,
            detalhes: contas.map(c => ({ pedidoNumero: c.pedido?.numero, statusEnvio: c.pedido?.statusEnvio, situacaoCA: c.pedido?.situacaoCA, bonificacao: c.pedido?.bonificacao }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/debug-inadimplencia?clienteId=xxx — parcelas vencidas PENDENTES de um cliente
router.get('/debug-inadimplencia', async (req, res) => {
    try {
        const { clienteId } = req.query;
        if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

        const parcelas = await prisma.parcela.findMany({
            where: {
                status: 'PENDENTE',
                dataVencimento: { lt: hoje },
                contaReceber: { clienteId, status: { in: ['ABERTO', 'PARCIAL'] } }
            },
            include: {
                contaReceber: {
                    select: { id: true, status: true, origem: true, pedidoId: true,
                        pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true } } }
                }
            }
        });

        const todasContas = await prisma.contaReceber.findMany({
            where: { clienteId },
            select: { id: true, status: true, origem: true,
                pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true } },
                parcelas: { select: { status: true, dataVencimento: true, valor: true } }
            }
        });

        res.json({ parcelasVencidasPendentes: parcelas.length, parcelas, todasContas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/cancelar-contas-bonificacao — cancela contasReceber de pedidos bonificação (não deveriam existir)
router.post('/cancelar-contas-bonificacao', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { status: { in: ['ABERTO', 'PARCIAL'] }, pedido: { bonificacao: true } },
            select: { id: true, pedido: { select: { numero: true } } }
        });

        let canceladas = 0;
        for (const c of contas) {
            await prisma.$transaction([
                prisma.parcela.updateMany({
                    where: { contaReceberId: c.id, status: { notIn: ['PAGO'] } },
                    data: { status: 'CANCELADO' }
                }),
                prisma.contaReceber.update({ where: { id: c.id }, data: { status: 'CANCELADO' } })
            ]);
            canceladas++;
        }

        res.json({ ok: true, canceladas, pedidos: contas.map(c => c.pedido?.numero) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/listar-contas-sem-pedido — lista todas as contas sem pedido vinculado (especial de teste)
router.get('/listar-contas-sem-pedido', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { pedidoId: null },
            select: {
                id: true, status: true, origem: true,
                valorTotal: true, createdAt: true,
                cliente: { select: { Nome: true, NomeFantasia: true } },
                parcelas: { select: { id: true, status: true, valor: true, dataVencimento: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json({ total: contas.length, contas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/deletar-contas-ids — deleta permanentemente contas a receber por IDs
// Body: { ids: ["id1","id2",...] }
router.post('/deletar-contas-ids', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Body deve conter { ids: [...] }' });
        }
        const deletadas = [];
        for (const id of ids) {
            const conta = await prisma.contaReceber.findUnique({
                where: { id },
                select: { id: true, status: true, cliente: { select: { Nome: true } }, pedidoId: true }
            });
            if (!conta) { deletadas.push({ id, status: 'não encontrada' }); continue; }
            await prisma.$transaction([
                prisma.parcela.deleteMany({ where: { contaReceberId: id } }),
                prisma.contaReceber.delete({ where: { id } })
            ]);
            deletadas.push({ id, cliente: conta.cliente?.Nome, status: 'deletada' });
        }
        res.json({ ok: true, deletadas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/setar-combustivel — define tipoCombustivel em veículos pelo array {placa, tipo}
router.post('/setar-combustivel', async (req, res) => {
    try {
        const { veiculos } = req.body; // [{ placa: 'RLB6E01', tipo: 'DIESEL' }, ...]
        if (!Array.isArray(veiculos)) return res.status(400).json({ error: 'veiculos deve ser array' });
        const resultados = [];
        for (const { placa, tipo } of veiculos) {
            const v = await prisma.veiculo.findUnique({ where: { placa: placa.toUpperCase() } });
            if (!v) { resultados.push({ placa, ok: false, erro: 'não encontrado' }); continue; }
            await prisma.veiculo.update({ where: { id: v.id }, data: { tipoCombustivel: tipo } });
            resultados.push({ placa, ok: true, tipo });
        }
        res.json({ ok: true, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/debug-charge/:pedidoId — retorna raw do CA para cobranças do pedido
router.get('/debug-charge/:pedidoId', async (req, res) => {
    try {
        const contaAzulService = require('../services/contaAzulService');
        const axios = require('axios');

        const pedido = await prisma.pedido.findUnique({
            where: { id: req.params.pedidoId },
            include: { cliente: { select: { UUID: true } } }
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
        if (!pedido.idVendaContaAzul) return res.status(400).json({ error: 'Pedido sem idVendaContaAzul' });

        const dataVendaStr = new Date(pedido.dataVenda).toISOString().split('T')[0];
        const parcelas = await contaAzulService.encontrarParcelasDeVenda(
            pedido.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr
        );

        const token = await contaAzulService.getAccessToken();
        const resultado = [];

        for (const parcela of parcelas) {
            const solicitacoes = parcela.solicitacoes_cobrancas || [];
            for (const cob of solicitacoes) {
                if (!cob?.id) continue;
                try {
                    const r = await axios.get(`https://api-v2.contaazul.com/v1/charge/${cob.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    resultado.push({ cobObj: cob, chargeRaw: r.data });
                } catch (e) {
                    resultado.push({ cobObj: cob, erro: e.response?.data || e.message });
                }
            }
        }

        res.json({ pedidoId: pedido.id, idVendaCA: pedido.idVendaContaAzul, parcelas: parcelas.length, cobranças: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/export-full-db
// Exporta todas as tabelas como JSON para backup/sync local.
// Query param opcional: ?skip=sync_logs,ia_analise_logs
router.get('/export-full-db', async (req, res) => {
    const skip = (req.query.skip || '').split(',').filter(Boolean);

    const ALL_TABLES = [
        'categorias_produto', 'categorias_estoque', 'categorias_cliente',
        'condicoes_pagamento', 'tabela_precos', 'contas_financeiras',
        'formas_pagamento_entrega', 'delivery_categorias',
        'app_configs', 'conta_azul_config',
        'vendedores', 'veiculos',
        'produtos', 'produto_imagens',
        'clientes', 'cliente_arquivos',
        'leads', 'embarques',
        'amostras', 'amostra_itens',
        'pedidos', 'pedido_itens', 'pedido_pagamentos_reais',
        'entrega_itens_devolvidos', 'movimentacoes_estoque',
        'atendimentos',
        'devolucoes', 'devolucao_itens',
        'diario_vendedor', 'despesas',
        'caixa_diario', 'caixa_entrega_conferida',
        'contas_receber', 'parcelas',
        'promocoes', 'promocao_condicao_grupos', 'promocao_condicoes',
        'cliente_insights', 'ia_analise_logs',
        'roteirizacoes',
        'meta_mensal_vendedor', 'meta_cidades', 'meta_produtos', 'meta_promocoes',
        'delivery_status', 'delivery_permissoes', 'delivery_webhook_logs',
        'audit_logs', 'manutencao_alertas',
        'itens_pcp', 'receitas', 'receita_itens', 'receita_versao_log',
        'ordens_producao', 'ordens_consumo', 'agenda_producao',
        'movimentacoes_pcp', 'sugestoes_producao',
        'sync_logs',
    ];

    const tables = ALL_TABLES.filter(t => !skip.includes(t));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="backup.json"');

    res.write('{"_exportedAt":"' + new Date().toISOString() + '"');

    for (const table of tables) {
        try {
            const rows = await prisma.$queryRawUnsafe(
                `SELECT row_to_json(t)::text AS r FROM (SELECT * FROM "${table}") t`
            );
            const parsed = rows.map(r => { try { return JSON.parse(r.r); } catch { return r.r; } });
            res.write(',\n"' + table + '":' + JSON.stringify(parsed));
            console.log(`[export-full-db] ${table}: ${rows.length} rows`);
        } catch (e) {
            console.error(`[export-full-db] Erro em ${table}:`, e.message);
            res.write(',\n"' + table + '_error":"' + e.message.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
        }
    }

    res.end('\n}');
});

// GET /api/admin-exec/especiais-abertos — lista pedidos especiais entregues com conta ainda aberta
router.get('/especiais-abertos', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: {
                    especial: true,
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] }
                }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                pedido: {
                    select: {
                        numero: true, statusEntrega: true, dataEntrega: true,
                        pagamentosReais: { where: { valor: { gt: 0 } }, select: { formaPagamentoNome: true, valor: true, escritorioResponsavel: true } }
                    }
                },
                parcelas: { where: { status: { not: 'CANCELADO' } }, select: { id: true, numeroParcela: true, status: true, valor: true } }
            }
        });

        const resultado = contas.map(c => {
            const pgtos = c.pedido?.pagamentosReais || [];
            const totalCaixa = pgtos.filter(p => !p.escritorioResponsavel).reduce((s, p) => s + Number(p.valor), 0);
            const totalParcelas = c.parcelas.filter(p => p.status !== 'PAGO').reduce((s, p) => s + Number(p.valor), 0);
            return {
                contaId: c.id,
                pedidoNumero: c.pedido?.numero,
                cliente: c.cliente?.NomeFantasia || c.cliente?.Nome,
                statusEntrega: c.pedido?.statusEntrega,
                dataEntrega: c.pedido?.dataEntrega,
                totalCaixa,
                totalParcelasAbertas: totalParcelas,
                cobreTotal: totalCaixa >= totalParcelas - 0.05,
                pagamentos: pgtos,
                parcelas: c.parcelas
            };
        });

        res.json({ total: resultado.length, casos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/corrigir-especiais-abertos — baixa automaticamente as contas elegíveis
router.post('/corrigir-especiais-abertos', async (req, res) => {
    try {
        const { executar = false } = req.body;
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: { especial: true, statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] } }
            },
            include: {
                pedido: { select: { numero: true, vendedorId: true, pagamentosReais: { where: { valor: { gt: 0 } } } } },
                parcelas: { where: { status: { not: 'CANCELADO' } } }
            }
        });

        const elegíveis = contas.filter(c => {
            const pgtos = c.pedido?.pagamentosReais || [];
            const totalCaixa = pgtos.filter(p => !p.escritorioResponsavel).reduce((s, p) => s + Number(p.valor), 0);
            const totalAberto = c.parcelas.filter(p => p.status !== 'PAGO').reduce((s, p) => s + Number(p.valor), 0);
            return totalAberto > 0 && totalCaixa >= totalAberto - 0.05;
        });

        if (!executar) {
            return res.json({ simulacao: true, totalElegíveis: elegíveis.length, pedidos: elegíveis.map(c => c.pedido?.numero) });
        }

        let corrigidos = 0;
        for (const conta of elegíveis) {
            const pgtos = conta.pedido?.pagamentosReais || [];
            const forma = pgtos.filter(p => !p.escritorioResponsavel)[0]?.formaPagamentoNome || 'Dinheiro';
            const baixadoPorId = conta.pedido?.vendedorId;
            const hoje = new Date();

            await prisma.$transaction(async (tx) => {
                for (const parcela of conta.parcelas) {
                    if (parcela.status === 'PAGO') continue;
                    await tx.parcela.update({
                        where: { id: parcela.id },
                        data: {
                            status: 'PAGO',
                            valorPago: Number(parcela.valor),
                            formaPagamento: forma,
                            dataPagamento: hoje,
                            baixadoPorId: baixadoPorId || null,
                            observacao: 'Correção retroativa — pagamento já registrado na entrega'
                        }
                    });
                }
                await tx.contaReceber.update({ where: { id: conta.id }, data: { status: 'QUITADO' } });
            }, { timeout: 20000, maxWait: 10000 });
            corrigidos++;
        }

        res.json({ corrigidos, pedidos: elegíveis.map(c => c.pedido?.numero) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/db-push — executa prisma db push (cria tabelas novas sem migration)
router.post('/db-push', async (req, res) => {
    const { execSync } = require('child_process');
    try {
        const out = execSync('npx prisma db push --skip-generate --accept-data-loss 2>&1', {
            cwd: process.cwd(),
            timeout: 60000,
            env: { ...process.env },
        }).toString();
        res.json({ ok: true, output: out });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, output: e.stdout?.toString() });
    }
});

// POST /api/admin-exec/import-curriculos — importa os currículos do CSV incluído no repositório
router.post('/import-curriculos', async (req, res) => {
    const { execSync } = require('child_process');
    const path = require('path');
    const csvPath = path.join(process.cwd(), 'scripts', 'Curriculos.csv');
    try {
        const out = execSync(`node scripts/importarCurriculos.js "${csvPath}" 2>&1`, {
            cwd: process.cwd(),
            timeout: 120000,
            env: { ...process.env },
        }).toString();
        res.json({ ok: true, output: out });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, output: e.stdout?.toString() });
    }
});

// GET /api/admin-exec/estoque-reconciliacao — reconciliação completa por produto desde uma data
// Query param: ?desde=2026-04-01
router.get('/estoque-reconciliacao', async (req, res) => {
    try {
        const desde = req.query.desde || '2026-04-01';

        // Última movimentação ANTES de 'desde' → estoque_depois é o saldo inicial do período
        const iniciais = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_depois AS estoque_inicial
            FROM movimentacoes_estoque
            WHERE created_at < $1::timestamp
            ORDER BY produto_id, created_at DESC
        `, desde + 'T00:00:00');

        // Se produto não tem movimento antes de 'desde', pegar estoque_antes do primeiro movimento no período
        const primeiros = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_antes AS estoque_inicial
            FROM movimentacoes_estoque
            WHERE created_at >= $1::timestamp
            ORDER BY produto_id, created_at ASC
        `, desde + 'T00:00:00');

        // Movimentos por produto/tipo/motivo NO período
        const movimentos = await prisma.$queryRawUnsafe(`
            SELECT
                m.produto_id,
                p.nome AS produto_nome,
                m.tipo,
                m.motivo,
                SUM(m.quantidade) AS total_qtd,
                COUNT(*) AS num_movs
            FROM movimentacoes_estoque m
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.created_at >= $1::timestamp
            GROUP BY m.produto_id, p.nome, m.tipo, m.motivo
            ORDER BY p.nome, m.tipo, m.motivo
        `, desde + 'T00:00:00');

        // Estoque atual (último movimento de todos os tempos)
        const atuais = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_depois AS estoque_atual,
                created_at AS ultima_mov
            FROM movimentacoes_estoque
            ORDER BY produto_id, created_at DESC
        `);

        // Montar mapa
        const mapaInicial = {};
        for (const r of iniciais) mapaInicial[r.produto_id] = Number(r.estoque_inicial);
        for (const r of primeiros) {
            if (mapaInicial[r.produto_id] === undefined)
                mapaInicial[r.produto_id] = Number(r.estoque_inicial);
        }
        const mapaAtual = {};
        for (const r of atuais) mapaAtual[r.produto_id] = { estoque: Number(r.estoque_atual), ultimaMov: r.ultima_mov };

        // Agrupar por produto
        const porProduto = {};
        for (const m of movimentos) {
            const pid = m.produto_id;
            if (!porProduto[pid]) {
                porProduto[pid] = {
                    nome: m.produto_nome,
                    estoqueInicial: mapaInicial[pid] ?? 0,
                    estoqueAtual: mapaAtual[pid]?.estoque ?? 0,
                    ultimaMov: mapaAtual[pid]?.ultimaMov,
                    entradas: {},
                    saidas: {},
                    totalEntradas: 0,
                    totalSaidas: 0,
                };
            }
            const qtd = Number(m.total_qtd);
            if (m.tipo === 'ENTRADA') {
                porProduto[pid].entradas[m.motivo] = (porProduto[pid].entradas[m.motivo] || 0) + qtd;
                porProduto[pid].totalEntradas += qtd;
            } else {
                porProduto[pid].saidas[m.motivo] = (porProduto[pid].saidas[m.motivo] || 0) + qtd;
                porProduto[pid].totalSaidas += qtd;
            }
        }

        // Verificar equação: inicial + entradas - saidas = atual
        const resultado = Object.values(porProduto).map(p => {
            const calculado = p.estoqueInicial + p.totalEntradas - p.totalSaidas;
            return {
                ...p,
                calculado,
                bate: Math.abs(calculado - p.estoqueAtual) < 0.001,
                diferenca: p.estoqueAtual - calculado,
            };
        });

        const inconsistentes = resultado.filter(p => !p.bate);
        const negativos = resultado.filter(p => p.estoqueAtual < 0);

        res.json({ desde, totalProdutos: resultado.length, inconsistentes: inconsistentes.length, negativos: negativos.length, produtos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/estoque-status — resumo do estoque atual (último movimento por produto)
router.get('/estoque-status', async (req, res) => {
    try {
        const rows = await prisma.$queryRawUnsafe(`
            SELECT
                p.nome,
                p.id AS produto_id,
                m.tipo,
                m.motivo,
                m.estoque_depois AS estoque_atual,
                m.created_at AS ultima_mov,
                tot.total_entradas,
                tot.total_saidas
            FROM (
                SELECT DISTINCT ON (produto_id)
                    produto_id, tipo, motivo,
                    estoque_depois,
                    created_at
                FROM movimentacoes_estoque
                ORDER BY produto_id, created_at DESC
            ) m
            JOIN produtos p ON p.id = m.produto_id
            LEFT JOIN (
                SELECT
                    produto_id,
                    SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade ELSE 0 END) AS total_entradas,
                    SUM(CASE WHEN tipo = 'SAIDA'   THEN quantidade ELSE 0 END) AS total_saidas
                FROM movimentacoes_estoque
                GROUP BY produto_id
            ) tot ON tot.produto_id = m.produto_id
            ORDER BY p.nome
        `);
        const resultado = rows.map(r => ({
            nome: r.nome,
            estoqueAtual: Number(r.estoque_atual),
            ultimaMov: r.ultima_mov,
            totalEntradas: Number(r.total_entradas || 0),
            totalSaidas: Number(r.total_saidas || 0),
        }));
        const negativos = resultado.filter(r => r.estoqueAtual < 0);
        res.json({ total: resultado.length, negativos: negativos.length, produtos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-estoque-produto?nome=<parte do nome>&desde=YYYY-MM-DD
// Pente fino READ-ONLY de UM produto: todas as movimentações do período (com vendedor
// e pedido), pedidos que contêm o produto, devoluções de entrega e devoluções formais.
// A análise/cruzamento é feita por quem consome — aqui só devolve os dados escopados.
router.get('/diag-estoque-produto', async (req, res) => {
    try {
        const { nome } = req.query;
        if (!nome) return res.status(400).json({ error: 'Informe ?nome= (parte do nome do produto).' });
        const desde = new Date((req.query.desde || '2026-05-21') + 'T00:00:00-03:00');

        const produto = await prisma.produto.findFirst({
            where: { nome: { contains: nome, mode: 'insensitive' } },
            select: {
                id: true, nome: true, codigo: true, categoria: true, controlaEstoque: true,
                estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true, updatedAt: true
            }
        });
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

        const [movAnterior, movimentos, pedidos, devolvidosEntrega, devolucaoItens] = await Promise.all([
            // última movimentação ANTES do período → saldo inicial
            prisma.movimentacaoEstoque.findFirst({
                where: { produtoId: produto.id, createdAt: { lt: desde } },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true, tipo: true, motivo: true, quantidade: true, estoqueAntes: true, estoqueDepois: true }
            }),
            prisma.movimentacaoEstoque.findMany({
                where: { produtoId: produto.id, createdAt: { gte: desde } },
                orderBy: { createdAt: 'asc' },
                include: {
                    vendedor: { select: { nome: true } },
                    pedido: { select: { numero: true, statusEnvio: true, statusEntrega: true, especial: true, bonificacao: true } }
                }
            }),
            prisma.pedido.findMany({
                where: {
                    itens: { some: { produtoId: produto.id } },
                    OR: [{ dataVenda: { gte: desde } }, { createdAt: { gte: desde } }]
                },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true, numero: true, statusEnvio: true, situacaoCA: true, statusEntrega: true,
                    especial: true, bonificacao: true, dataVenda: true, dataEntrega: true, createdAt: true,
                    itens: { where: { produtoId: produto.id }, select: { quantidade: true } },
                    cliente: { select: { Nome: true } },
                    vendedor: { select: { nome: true } }
                }
            }),
            prisma.entregaItemDevolvido.findMany({
                where: { produtoId: produto.id, createdAt: { gte: desde } },
                select: { pedidoId: true, quantidade: true, createdAt: true, pedido: { select: { numero: true } } }
            }),
            prisma.devolucaoItem.findMany({
                where: { produtoId: produto.id, devolucao: { dataDevolucao: { gte: desde } } },
                select: {
                    quantidade: true,
                    devolucao: {
                        select: {
                            numero: true, tipo: true, escopo: true, status: true, dataDevolucao: true,
                            pedidoOriginalId: true, pedidoOriginal: { select: { numero: true } }
                        }
                    }
                }
            })
        ]);

        res.json({ desde, produto, movAnterior, movimentos, pedidos, devolvidosEntrega, devolucaoItens });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/estoque-produtos?categoria=Produto%20Acabado
// Lista produtos de uma categoria com estoque atual e se controlam estoque
// (base para rodar a correção retroativa produto a produto).
router.get('/estoque-produtos', async (req, res) => {
    try {
        const categoria = req.query.categoria;
        if (!categoria) return res.status(400).json({ error: 'Informe ?categoria=' });
        const produtos = await prisma.produto.findMany({
            where: { categoria },
            orderBy: { nome: 'asc' },
            select: {
                id: true, nome: true, codigo: true, ativo: true, categoria: true,
                controlaEstoque: true, estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true
            }
        });
        const saida = [];
        for (const p of produtos) {
            const controla = await estoqueService.produtoControlaEstoque(p);
            saida.push({ ...p, controla });
        }
        res.json({ categoria, total: saida.length, produtos: saida });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/estoque-corrigir-retroativo
// Corrige retroativamente o estoque de UM produto desde uma data:
//  - pedido RECEBIDO sem baixa (bug do especial/bonificação) → registra a SAIDA que faltou
//  - pedido com baixa em dobro → credita a diferença (ENTRADA AJUSTE_MANUAL)
// Compara a quantidade do pedido com o saldo efetivamente baixado (saídas − estornos),
// então é idempotente: rodar de novo encontra delta 0 e não mexe em nada.
// Body: { produtoId | produtoNome, desde='2026-05-21', executar=false } — executar=false só simula.
router.post('/estoque-corrigir-retroativo', async (req, res) => {
    try {
        const { produtoId, produtoNome, desde: desdeStr, executar = false } = req.body || {};
        if (!produtoId && !produtoNome) return res.status(400).json({ error: 'Informe produtoId ou produtoNome.' });
        const desde = new Date((desdeStr || '2026-05-21') + 'T00:00:00-03:00');

        const produto = await prisma.produto.findFirst({
            where: produtoId ? { id: produtoId } : { nome: { contains: produtoNome, mode: 'insensitive' } },
            select: { id: true, nome: true, estoqueTotal: true }
        });
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

        const pedidos = await prisma.pedido.findMany({
            where: {
                statusEnvio: 'RECEBIDO',
                // situacaoCA null entra (pedido recém-sincronizado); CANCELADO fica de fora
                OR: [{ situacaoCA: null }, { situacaoCA: { not: 'CANCELADO' } }],
                AND: [{ OR: [{ dataVenda: { gte: desde } }, { createdAt: { gte: desde } }] }],
                itens: { some: { produtoId: produto.id } }
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true, numero: true, especial: true, bonificacao: true,
                itens: { where: { produtoId: produto.id }, select: { quantidade: true } }
            }
        });

        const movs = await prisma.movimentacaoEstoque.findMany({
            where: { produtoId: produto.id, pedidoId: { in: pedidos.map(p => p.id) } },
            select: { pedidoId: true, tipo: true, quantidade: true, motivo: true }
        });
        const MOTIVOS_BAIXA = ['FATURAMENTO', 'PEDIDO_ESPECIAL', 'PEDIDO_BONIFICACAO'];
        // AJUSTE_MANUAL entra como estorno AQUI porque os créditos de "baixa em dobro"
        // desta própria rota são gravados assim (com pedidoId — ajuste da tela não tem
        // pedidoId e nem passa neste filtro). Sem isso, rodar de novo creditaria em dobro.
        const MOTIVOS_ESTORNO = ['CANCELAMENTO_CA', 'CANCELAMENTO', 'EXCLUSAO', 'AJUSTE_MANUAL'];
        const saldoPorPedido = {};
        for (const mv of movs) {
            const q = parseFloat(mv.quantidade || 0);
            if (mv.tipo === 'SAIDA' && MOTIVOS_BAIXA.includes(mv.motivo)) {
                saldoPorPedido[mv.pedidoId] = (saldoPorPedido[mv.pedidoId] || 0) + q;
            } else if (mv.tipo === 'ENTRADA' && MOTIVOS_ESTORNO.includes(mv.motivo)) {
                saldoPorPedido[mv.pedidoId] = (saldoPorPedido[mv.pedidoId] || 0) - q;
            }
        }

        const correcoes = [];
        for (const pe of pedidos) {
            const qtdPedido = pe.itens.reduce((s, i) => s + parseFloat(i.quantidade || 0), 0);
            const baixado = saldoPorPedido[pe.id] || 0;
            const delta = qtdPedido - baixado;
            if (Math.abs(delta) < 0.001) continue;
            if (delta > 0) {
                correcoes.push({
                    pedidoId: pe.id, numero: pe.numero, tipo: 'SAIDA', quantidade: delta,
                    motivo: pe.bonificacao ? 'PEDIDO_BONIFICACAO' : (pe.especial ? 'PEDIDO_ESPECIAL' : 'FATURAMENTO'),
                    observacao: `Baixa retroativa pedido #${pe.numero || pe.id} — aprovado sem baixa de estoque (correção do bug, jul/2026)`
                });
            } else {
                correcoes.push({
                    pedidoId: pe.id, numero: pe.numero, tipo: 'ENTRADA', quantidade: -delta,
                    motivo: 'AJUSTE_MANUAL',
                    observacao: `Correção de baixa em dobro pedido #${pe.numero || pe.id} (bug corrigido, jul/2026)`
                });
            }
        }

        const totalSaidas = correcoes.filter(c => c.tipo === 'SAIDA').reduce((s, c) => s + c.quantidade, 0);
        const totalEntradas = correcoes.filter(c => c.tipo === 'ENTRADA').reduce((s, c) => s + c.quantidade, 0);
        const estoqueAtual = parseFloat(produto.estoqueTotal || 0);
        const projetado = estoqueAtual - totalSaidas + totalEntradas;

        if (!executar) {
            return res.json({
                simulacao: true, produto: produto.nome, desde,
                pedidosVerificados: pedidos.length, correcoes: correcoes.length,
                totalSaidasFaltantes: totalSaidas, totalCreditosDuplicidade: totalEntradas,
                estoqueAtual, estoqueProjetado: projetado, detalhes: correcoes
            });
        }

        // Execução: cada correção em transação própria (banco compartilhado lento);
        // se parar no meio, rodar de novo continua de onde parou (delta já corrigido vira 0).
        const aplicadas = [];
        for (const c of correcoes) {
            await prisma.$transaction(async (tx) => {
                const atual = await tx.produto.findUnique({
                    where: { id: produto.id },
                    select: { estoqueTotal: true }
                });
                const antes = parseFloat(atual?.estoqueTotal || 0);
                const depois = c.tipo === 'SAIDA' ? antes - c.quantidade : antes + c.quantidade;
                await tx.produto.update({ where: { id: produto.id }, data: { estoqueTotal: depois } });
                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: produto.id,
                        pedidoId: c.pedidoId,
                        tipo: c.tipo,
                        quantidade: c.quantidade,
                        motivo: c.motivo,
                        observacao: c.observacao,
                        estoqueAntes: antes,
                        estoqueDepois: depois,
                        sincCA: false,
                        erroCA: null
                    }
                });
                aplicadas.push({ numero: c.numero, tipo: c.tipo, quantidade: c.quantidade, antes, depois });
            }, { timeout: 20000, maxWait: 10000 });
        }

        const recalc = await estoqueService.recalcularEstoqueProduto(produto.id);
        const produtoFinal = await prisma.produto.findUnique({
            where: { id: produto.id },
            select: { estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true }
        });

        res.json({
            executado: true, produto: produto.nome,
            correcoesAplicadas: aplicadas.length,
            totalSaidasFaltantes: totalSaidas, totalCreditosDuplicidade: totalEntradas,
            estoqueFinal: produtoFinal, recalc, detalhes: aplicadas
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/estoque-ajuste-batch — aplica ajustes manuais em lote
// Body: { ajustes: [{ nomeProduto, quantidade, tipo, observacao }] }
router.post('/estoque-ajuste-batch', async (req, res) => {
    const { ajustes } = req.body;
    if (!Array.isArray(ajustes) || ajustes.length === 0) {
        return res.status(400).json({ error: 'ajustes deve ser um array não vazio.' });
    }
    const resultados = [];
    const erros = [];

    for (const aj of ajustes) {
        try {
            const produto = await prisma.produto.findFirst({
                where: { nome: aj.nomeProduto },
                select: { id: true, nome: true }
            });
            if (!produto) {
                erros.push({ nomeProduto: aj.nomeProduto, erro: 'Produto não encontrado' });
                continue;
            }
            const qtd = parseFloat(aj.quantidade);
            if (!qtd || qtd <= 0) {
                erros.push({ nomeProduto: aj.nomeProduto, erro: 'Quantidade inválida' });
                continue;
            }
            const resultado = await estoqueService.ajustar({
                produtoId: produto.id,
                vendedorId: null,
                tipo: aj.tipo || 'ENTRADA',
                quantidade: qtd,
                motivo: 'AJUSTE_MANUAL',
                observacao: aj.observacao || 'Correção de estoque via admin'
            });
            resultados.push({ nomeProduto: produto.nome, tipo: aj.tipo || 'ENTRADA', quantidade: qtd, estoqueDepois: resultado.estoqueDepois });
        } catch (err) {
            erros.push({ nomeProduto: aj.nomeProduto, erro: err.message });
        }
    }

    return res.json({ ok: true, aplicados: resultados.length, erros: erros.length, resultados, erros });
});

// POST /api/admin-exec/import-etiquetas — upsert em lote de etiquetas (por codigoProduto)
router.post('/import-etiquetas', async (req, res) => {
    try {
        const { etiquetas, limparVazios } = req.body;

        if (limparVazios) {
            const del = await prisma.etiquetaProduto.deleteMany({
                where: { OR: [{ codigoProduto: '' }, { nomeProduto: '' }] }
            });
            if (!etiquetas?.length) return res.json({ ok: true, deletados: del.count });
        }

        // Pré-carrega produtos do catálogo para auto-vincular por código
        const todosProdutos = await prisma.produto.findMany({ select: { id: true, codigo: true } });
        if (!Array.isArray(etiquetas) || etiquetas.length === 0)
            return res.status(400).json({ error: 'Array etiquetas vazio.' });

        const criados = [], atualizados = [], erros = [];

        for (const et of etiquetas) {
            try {
                // Match por codigoProduto + pesoUnitario para não sobrescrever versões diferentes
                const existente = await prisma.etiquetaProduto.findFirst({
                    where: {
                        codigoProduto: String(et.codigoProduto),
                        pesoUnitario: parseInt(et.pesoUnitario) || 0,
                    }
                });
                // Auto-link: procura produto no catálogo, respeita unique constraint (produtoId)
                const produtoCat = todosProdutos.find(p => String(p.codigo).trim() === String(et.codigoProduto).trim());
                let produtoIdFinal = undefined;
                if (produtoCat?.id) {
                    const jaOcupado = await prisma.etiquetaProduto.findFirst({
                        where: { produtoId: produtoCat.id, id: { not: existente?.id ?? 'none' } }
                    });
                    if (!jaOcupado) produtoIdFinal = produtoCat.id;
                }
                const data = {
                    codigoProduto:         String(et.codigoProduto || ''),
                    nomeProduto:           String(et.nomeProduto || ''),
                    pesoUnitario:          parseInt(et.pesoUnitario) || 0,
                    pesoTabelaNutricional: parseInt(et.pesoTabelaNutricional) || 0,
                    valorEnergetico:       et.valorEnergetico   || null,
                    carboidratos:          et.carboidratos       || null,
                    acucaresTotais:        et.acucaresTotais      || null,
                    acucaresAdicionados:   et.acucaresAdicionados || null,
                    proteinas:             et.proteinas          || null,
                    gordurasTotais:        et.gordurasTotais     || null,
                    gordurasSaturadas:     et.gordurasSaturadas  || null,
                    gordurasTrans:         et.gordurasTrans      || null,
                    fibraAlimentar:        et.fibraAlimentar     || null,
                    sodio:                 et.sodio              || null,
                    produtoId:             produtoIdFinal,
                    quantidadeEmbalagem:   parseInt(et.quantidadeEmbalagem) || 1,
                    quantidadeAproximada:  Boolean(et.quantidadeAproximada),
                    composicao:            String(et.composicao  || ''),
                    modoPreparo:           String(et.modoPreparo || ''),
                    codigoBarras:          et.codigoBarras       || null,
                    contemLeite:           Boolean(et.contemLeite),
                    contemGluten:          Boolean(et.contemGluten),
                    contemLactose:         Boolean(et.contemLactose),
                    contemOvo:             Boolean(et.contemOvo),
                    alergenos:             Array.isArray(et.alergenos) ? et.alergenos.filter(Boolean) : [],
                    especieCrustaceos:     et.especieCrustaceos   || null,
                    especiePeixes:         et.especiePeixes        || null,
                    outrosAlergenos:       et.outrosAlergenos    || null,
                    avisosRotulo:          et.avisosRotulo        || null,
                    armazenamento:         et.armazenamento       || null,
                    validadeDias:          parseInt(et.validadeDias) || 90,
                    ativo:                 et.ativo !== false,
                    tipoProduto:           et.tipoProduto         || null,
                    tarjaPreta:            Boolean(et.tarjaPreta),
                };
                if (existente) {
                    await prisma.etiquetaProduto.update({ where: { id: existente.id }, data });
                    atualizados.push(et.codigoProduto);
                } else {
                    await prisma.etiquetaProduto.create({ data });
                    criados.push(et.codigoProduto);
                }
            } catch (e) {
                erros.push({ codigo: et.codigoProduto, erro: e.message });
            }
        }
        return res.json({ ok: true, criados: criados.length, atualizados: atualizados.length, erros, detalhe: { criados, atualizados } });
    } catch (err) {
        console.error('[import-etiquetas]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/migrar-alergenos
// Converte os booleans antigos (contemLeite/contemOvo) para a lista alergenos[]
router.post('/migrar-alergenos', async (req, res) => {
    try {
        const todas = await prisma.etiquetaProduto.findMany({
            select: { id: true, nomeProduto: true, contemLeite: true, contemOvo: true, alergenos: true }
        });
        const atualizadas = [];
        for (const et of todas) {
            if (Array.isArray(et.alergenos) && et.alergenos.length > 0) continue; // já tem
            const lista = [];
            if (et.contemLeite) lista.push('Leite');
            if (et.contemOvo)   lista.push('Ovos');
            if (lista.length === 0) continue;
            await prisma.etiquetaProduto.update({ where: { id: et.id }, data: { alergenos: lista } });
            atualizadas.push({ nome: et.nomeProduto, alergenos: lista });
        }
        return res.json({ ok: true, atualizadas: atualizadas.length, detalhe: atualizadas });
    } catch (err) {
        console.error('[migrar-alergenos]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/fix-km-combustivel — corrige km errado em abastecimento
// Body: { veiculoId, kmErrado, kmCorreto }
router.post('/fix-km-combustivel', async (req, res) => {
    try {
        const { veiculoId, kmErrado, kmCorreto } = req.body;
        if (!veiculoId || kmErrado === undefined) {
            return res.status(400).json({ error: 'veiculoId e kmErrado obrigatórios' });
        }
        const registros = await prisma.despesa.findMany({
            where: { veiculoId, categoria: 'COMBUSTIVEL', kmNoAbastecimento: Number(kmErrado) },
            select: { id: true, dataReferencia: true, kmNoAbastecimento: true, litros: true, valor: true }
        });
        if (registros.length === 0) {
            return res.json({ ok: false, mensagem: 'Nenhum registro encontrado com esse km.' });
        }
        if (kmCorreto === null || kmCorreto === undefined) {
            // Sem kmCorreto: apenas lista os registros encontrados
            return res.json({ ok: true, encontrados: registros.length, registros });
        }
        const atualizados = [];
        for (const r of registros) {
            await prisma.despesa.update({ where: { id: r.id }, data: { kmNoAbastecimento: Number(kmCorreto) } });
            atualizados.push(r.id);
        }
        res.json({ ok: true, corrigidos: atualizados.length, ids: atualizados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/recalcular-flex-historico
// Recalcula flexGerado por item e flexTotal dos pedidos dos últimos 30 dias
// aplicando as regras atuais de categoria (flexPositivo, flexNegativo, contabilizaFlex, isentoFlex)
router.post('/recalcular-flex-historico', async (req, res) => {
    try {
        const diasParam = parseInt(req.query.dias) || 30;
        const apenasSimular = req.query.simular === 'true';

        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - diasParam);

        // Carrega regras de categorias CA
        const catEstoque = await prisma.categoriaEstoque.findMany({ select: { nome: true, contabilizaFlex: true } });
        const catEstoqueMap = new Map(catEstoque.map(c => [c.nome, c.contabilizaFlex]));

        // Carrega regras de categorias comerciais
        const catProduto = await prisma.categoriaProduto.findMany({ select: { id: true, flexPositivo: true, flexNegativo: true } });
        const catProdutoMap = new Map(catProduto.map(c => [c.id, { flexPositivo: c.flexPositivo, flexNegativo: c.flexNegativo }]));

        // Busca produtos com suas categorias
        const produtos = await prisma.produto.findMany({ select: { id: true, categoria: true, categoriaProdutoId: true } });
        const produtoMap = new Map(produtos.map(p => {
            const contabilizaFlex = p.categoria ? (catEstoqueMap.get(p.categoria) ?? true) : true;
            const catComercial = p.categoriaProdutoId ? catProdutoMap.get(p.categoriaProdutoId) : null;
            return [p.id, { contabilizaFlex, flexPositivo: catComercial?.flexPositivo ?? true, flexNegativo: catComercial?.flexNegativo ?? true }];
        }));

        // Busca pedidos do período
        const pedidos = await prisma.pedido.findMany({
            where: {
                createdAt: { gte: trintaDiasAtras },
                statusEnvio: { not: 'EXCLUIDO' }
            },
            include: {
                itens: { select: { id: true, produtoId: true, valor: true, valorBase: true, quantidade: true, flexGerado: true } },
                cliente: { select: { categoriaCliente: { select: { isentoFlex: true } } } }
            }
        });

        const resultados = [];
        let pedidosAlterados = 0;
        let itensAlterados = 0;

        for (const pedido of pedidos) {
            const isentoFlex = pedido.cliente?.categoriaCliente?.isentoFlex || false;
            let novoFlexTotal = 0;
            const itensParaAtualizar = [];

            for (const item of pedido.itens) {
                let novoFlexGerado;

                if (isentoFlex || pedido.bonificacao) {
                    novoFlexGerado = 0;
                } else {
                    const flexBruto = (Number(item.valor) - Number(item.valorBase)) * Number(item.quantidade);
                    const regra = produtoMap.get(item.produtoId);
                    if (!regra || !regra.contabilizaFlex) {
                        novoFlexGerado = 0;
                    } else if (flexBruto > 0 && !regra.flexPositivo) {
                        novoFlexGerado = 0;
                    } else if (flexBruto < 0 && !regra.flexNegativo) {
                        novoFlexGerado = 0;
                    } else {
                        novoFlexGerado = flexBruto;
                    }
                }

                novoFlexTotal += novoFlexGerado;

                const flexAtual = Number(item.flexGerado || 0);
                if (Math.abs(flexAtual - novoFlexGerado) > 0.001) {
                    itensParaAtualizar.push({ id: item.id, novoFlexGerado, flexAtual });
                }
            }

            const flexTotalAtual = Number(pedido.flexTotal || 0);
            const mudouTotal = Math.abs(flexTotalAtual - novoFlexTotal) > 0.001;
            const mudouItens = itensParaAtualizar.length > 0;

            if (mudouTotal || mudouItens) {
                pedidosAlterados++;
                itensAlterados += itensParaAtualizar.length;
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    especial: pedido.especial,
                    flexAntes: flexTotalAtual,
                    flexDepois: novoFlexTotal,
                    itensMudados: itensParaAtualizar.length
                });

                if (!apenasSimular) {
                    // Atualiza itens
                    for (const it of itensParaAtualizar) {
                        await prisma.pedidoItem.update({ where: { id: it.id }, data: { flexGerado: it.novoFlexGerado } });
                    }
                    // Atualiza flexTotal do pedido
                    await prisma.pedido.update({ where: { id: pedido.id }, data: { flexTotal: novoFlexTotal } });
                }
            }
        }

        res.json({
            ok: true,
            simulacao: apenasSimular,
            diasConsiderados: diasParam,
            totalPedidos: pedidos.length,
            pedidosAlterados,
            itensAlterados,
            detalhes: resultados
        });
    } catch (e) {
        console.error('[admin-exec] recalcular-flex-historico:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/autolink-etiquetas-ean
// Vincula etiquetas sem produtoId procurando produto pelo EAN (codigoBarras == produto.ean)
router.post('/autolink-etiquetas-ean', async (req, res) => {
    try {
        const etiquetasSemLink = await prisma.etiquetaProduto.findMany({
            where: { produtoId: null },
            select: { id: true, codigoBarras: true, codigoProduto: true, nomeProduto: true }
        });

        const vinculadas = [], semMatch = [], erros = [];

        for (const et of etiquetasSemLink) {
            if (!et.codigoBarras) { semMatch.push(et.codigoProduto); continue; }
            try {
                const produto = await prisma.produto.findFirst({
                    where: { ean: et.codigoBarras },
                    select: { id: true, codigo: true, nome: true }
                });
                if (!produto) { semMatch.push(`${et.codigoProduto} (EAN ${et.codigoBarras})`); continue; }

                await prisma.etiquetaProduto.update({
                    where: { id: et.id },
                    data: { produtoId: produto.id }
                });
                vinculadas.push({ etiqueta: et.nomeProduto, produto: produto.nome, sku: produto.codigo });
            } catch (e) {
                erros.push({ codigo: et.codigoProduto, erro: e.message });
            }
        }

        return res.json({ ok: true, vinculadas: vinculadas.length, semMatch: semMatch.length, erros: erros.length, detalhe: { vinculadas, semMatch, erros } });
    } catch (err) {
        console.error('[autolink-etiquetas-ean]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/sync-itempcp-nomes
// Corrige nomes defasados: faz o nome de cada ItemPcp (usado nas receitas)
// espelhar o nome atual do Produto vinculado. Idempotente.
router.post('/sync-itempcp-nomes', async (req, res) => {
    try {
        const itens = await prisma.itemPcp.findMany({
            where: { produtoId: { not: null } },
            select: { id: true, nome: true, produto: { select: { nome: true } } }
        });
        const corrigidos = [];
        for (const it of itens) {
            const nomeProduto = it.produto?.nome;
            if (nomeProduto && nomeProduto !== it.nome) {
                await prisma.itemPcp.update({ where: { id: it.id }, data: { nome: nomeProduto } });
                corrigidos.push({ de: it.nome, para: nomeProduto });
            }
        }
        return res.json({ ok: true, verificados: itens.length, corrigidos: corrigidos.length, detalhe: corrigidos });
    } catch (err) {
        console.error('[sync-itempcp-nomes]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/admin-exec/dfe-status
// Diagnóstico da captura de NF-e (SEFAZ DF-e): controle de NSU, contagens por
// status e as 5 notas mais recentes.
router.get('/dfe-status', async (req, res) => {
    try {
        const sefazDfeService = require('../services/sefazDfeService');
        const [controle, ativa, porStatus, recentes] = await Promise.all([
            prisma.dfeControle.findUnique({ where: { id: 'dfe' } }),
            sefazDfeService.capturaAtiva(),
            prisma.notaEntrada.groupBy({ by: ['status'], _count: { _all: true } }),
            prisma.notaEntrada.findMany({
                orderBy: { criadoEm: 'desc' },
                take: 5,
                select: {
                    id: true, chave: true, numero: true, fornecedorNome: true,
                    emissao: true, valorTotal: true, status: true, manifestada: true, criadoEm: true
                }
            })
        ]);
        res.json({
            ok: true,
            capturaAtiva: ativa,
            controle,
            contagens: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])),
            notasRecentes: recentes
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/dfe-consultar
// Força um ciclo de captura de NF-e agora. Resposta síncrona resumida
// (timeout de 60s — se estourar, o ciclo continua em background).
router.post('/dfe-consultar', async (req, res) => {
    try {
        const sefazDfeService = require('../services/sefazDfeService');
        const timeout = new Promise((resolve) => setTimeout(
            () => resolve({ ok: true, timeout: true, motivo: 'Ciclo ainda em execução após 60s — segue em background (veja /dfe-status).' }),
            60000
        ));
        const resultado = await Promise.race([sefazDfeService.executarCiclo(), timeout]);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/contas-pagar-status
// Diagnóstico do envio de Contas a Pagar → Conta Azul: contagens por status de
// envio, fornecedores pendentes/erro e as contas mais recentes com o motivo do erro.
router.get('/contas-pagar-status', async (req, res) => {
    try {
        const [porStatusConta, porStatusForn, contas, fornPend] = await Promise.all([
            prisma.contaPagar.groupBy({ by: ['statusEnvioCA'], _count: { _all: true } }),
            prisma.fornecedor.groupBy({ by: ['statusEnvioCA'], _count: { _all: true } }),
            prisma.contaPagar.findMany({
                orderBy: { criadoEm: 'desc' },
                take: 10,
                select: {
                    id: true, descricao: true, valorTotal: true, origem: true,
                    statusEnvioCA: true, erroEnvioCA: true, idEventoCA: true, protocoloCA: true,
                    criadoEm: true,
                    fornecedor: { select: { razaoSocial: true, contaAzulId: true, statusEnvioCA: true, erroEnvioCA: true } }
                }
            }),
            prisma.fornecedor.findMany({
                where: { statusEnvioCA: { in: ['ENVIAR', 'ENVIANDO', 'ERRO'] } },
                take: 10,
                select: { id: true, razaoSocial: true, cnpjCpf: true, statusEnvioCA: true, erroEnvioCA: true, contaAzulId: true }
            })
        ]);
        const caConfig = await prisma.contaAzulConfig.findFirst({ select: { id: true, updatedAt: true } }).catch(() => null);
        res.json({
            ok: true,
            caConectada: !!caConfig,
            contasPorStatusEnvio: Object.fromEntries(porStatusConta.map((s) => [s.statusEnvioCA, s._count._all])),
            fornecedoresPorStatusEnvio: Object.fromEntries(porStatusForn.map((s) => [s.statusEnvioCA, s._count._all])),
            fornecedoresPendentes: fornPend,
            contasRecentes: contas
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-reenviar
// Re-enfileira para o CA todas as Contas a Pagar que ficaram em ERRO
// (equivale ao botão "reenviar" da tela, em lote). Diagnóstico/manutenção.
router.post('/contas-pagar-reenviar', async (req, res) => {
    try {
        const r = await prisma.contaPagar.updateMany({
            where: { statusEnvioCA: 'ERRO' },
            data: { statusEnvioCA: 'ENVIAR', erroEnvioCA: null }
        });
        res.json({ ok: true, reenfileiradas: r.count });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-reconciliar
// Conserta contas que ficaram em ERRO mas cujo erro menciona "protocolo" (indício de que o CA
// aceitou/criou o evento apesar do erro). Para cada uma, tenta localizar o evento no CA pelo
// codigo_referencia (id da conta). Se achar → adota (idEventoCA + mapeia parcelas + ENVIADO),
// SEM duplicar. Se não achar com segurança, deixa como está e reporta.
// Recupera casos como a despesa da "BERNADETE" (existe no CA, ERRO no app).
router.post('/contas-pagar-reconciliar', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        const candidatas = await prisma.contaPagar.findMany({
            where: {
                statusEnvioCA: 'ERRO',
                erroEnvioCA: { contains: 'protocolo', mode: 'insensitive' }
            },
            include: { fornecedor: true, parcelas: true },
            orderBy: { criadoEm: 'asc' },
            take: 100
        });

        let reconciliadas = 0;
        const detalhes = [];
        for (const conta of candidatas) {
            try {
                const eventoId = await caSync._encontrarEventoPorReferencia(conta.id, conta);
                if (eventoId) {
                    await prisma.contaPagar.update({
                        where: { id: conta.id },
                        data: { idEventoCA: eventoId, erroEnvioCA: null }
                    });
                    await caSync._mapearParcelasCA(conta.id, eventoId); // fecha em ENVIADO ao casar as parcelas
                    reconciliadas++;
                    detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'RECONCILIADA', eventoId });
                } else {
                    detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'NAO_ENCONTRADA' });
                }
            } catch (err) {
                detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'ERRO_BUSCA', erro: err.message });
            }
        }

        res.json({ ok: true, verificadas: candidatas.length, reconciliadas, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-extrato-conciliado?contaId=&limite=20
// Confere o que a conciliação bancária fez: cada lançamento CONCILIADO com a baixa a que
// ficou preso (valor do extrato × valor da baixa, incluindo juros/multa) e se a baixa foi
// ao CA. Serve para auditar as conciliações de teste — conciliar NÃO dá baixa em nada,
// então aqui a gente confirma que os dois lados batem de verdade.
router.get('/diag-extrato-conciliado', async (req, res) => {
    try {
        const where = { status: 'CONCILIADO' };
        if (req.query.contaId) where.contaFinanceiraCaId = String(req.query.contaId);
        const linhas = await prisma.extratoLancamento.findMany({
            where,
            orderBy: { conciliadoEm: 'desc' },
            take: Math.min(Number(req.query.limite) || 20, 100)
        });

        const n = (v) => Number(v || 0);
        const saida = [];
        for (const l of linhas) {
            const base = {
                data: l.data.toISOString().slice(0, 10),
                descricao: l.descricao,
                beneficiarioNoBanco: l.nome || l.payee || null,
                documento: l.checkNum || l.refNum || null,
                tipo: l.tipo,
                valorExtrato: n(l.valor),
                auto: l.conciliadoAuto,
                conciliadoEm: l.conciliadoEm
            };
            if (l.pagamentoParcelaPagarId) {
                const p = await prisma.pagamentoParcelaPagar.findUnique({
                    where: { id: l.pagamentoParcelaPagarId },
                    include: { parcelaPagar: { include: { contaPagar: { include: { fornecedor: true } } } } }
                });
                const totalBaixa = p ? n(p.valorPago) + n(p.juros) + n(p.multa) : 0;
                saida.push({
                    ...base,
                    baixa: p ? {
                        despesa: p.parcelaPagar?.contaPagar?.descricao,
                        fornecedor: p.parcelaPagar?.contaPagar?.fornecedor?.razaoSocial || null,
                        valorPago: n(p.valorPago), juros: n(p.juros), multa: n(p.multa), total: totalBaixa,
                        dataPagamento: p.dataPagamento?.toISOString().slice(0, 10),
                        statusEnvioCA: p.statusEnvioCA,
                        origem: p.origem,
                        estornado: p.estornado
                    } : null,
                    confere: p ? Math.abs(totalBaixa - n(l.valor)) <= 0.01 : false
                });
            } else if (l.pagamentoParcelaId) {
                const p = await prisma.pagamentoParcela.findUnique({
                    where: { id: l.pagamentoParcelaId },
                    include: { parcela: { include: { contaReceber: { include: { cliente: true } } } } }
                });
                saida.push({
                    ...base,
                    baixa: p ? {
                        cliente: p.parcela?.contaReceber?.cliente?.Nome || null,
                        valorRecebido: n(p.valorRecebido),
                        dataPagamento: p.dataPagamento?.toISOString().slice(0, 10),
                        estornado: p.estornado
                    } : null,
                    confere: p ? Math.abs(n(p.valorRecebido) - n(l.valor)) <= 0.01 : false
                });
            } else {
                saida.push({ ...base, baixa: 'GRUPO (N↔M)', confere: null });
            }
        }
        res.json({
            total: saida.length,
            divergentes: saida.filter((s) => s.confere === false).length,
            lancamentos: saida
        });
    } catch (error) {
        console.error('Erro no diag da conciliação bancária:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/contas-pagar-conciliacao-suspeitas
// Varre vínculos suspeitos com o CA (incidente do ICMS DESTDA, 07/2026):
//  (a) parcelas com baixa vinda do CA cujo total pago EXCEDE o valor da parcela
//      (indício de parcela mapeada no evento errado — a baixa era de outro título);
//  (b) contas vinculadas a evento do CA cuja "nota" é texto livre (não numérica) —
//      grupo de risco da conciliação antiga, que casava por texto sem conferir valor.
router.get('/contas-pagar-conciliacao-suspeitas', async (req, res) => {
    try {
        const parcelas = await prisma.parcelaPagar.findMany({
            where: { idParcelaCA: { not: null }, pagamentos: { some: { origem: 'CA', estornado: false } } },
            include: {
                pagamentos: { where: { estornado: false } },
                contaPagar: {
                    select: {
                        id: true, descricao: true, numeroNota: true, idEventoCA: true, statusEnvioCA: true,
                        fornecedor: { select: { razaoSocial: true } }
                    }
                }
            }
        });
        const baixasDivergentes = [];
        for (const p of parcelas) {
            const pago = p.pagamentos.reduce((s, x) => s + Number(x.valorPago), 0);
            const desconto = p.pagamentos.reduce((s, x) => s + Number(x.desconto || 0), 0);
            if (pago > Number(p.valor) - desconto + 0.02) {
                baixasDivergentes.push({
                    contaId: p.contaPagar.id,
                    descricao: p.contaPagar.descricao,
                    fornecedor: p.contaPagar.fornecedor?.razaoSocial || null,
                    numeroNota: p.contaPagar.numeroNota,
                    idEventoCA: p.contaPagar.idEventoCA,
                    parcelaId: p.id, numeroParcela: p.numeroParcela, status: p.status,
                    vencimento: p.dataVencimento,
                    valorParcela: Number(p.valor),
                    totalPago: Math.round(pago * 100) / 100
                });
            }
        }
        const comEventoENota = await prisma.contaPagar.findMany({
            where: { idEventoCA: { not: null }, numeroNota: { not: null } },
            select: { id: true, descricao: true, numeroNota: true, idEventoCA: true, valorTotal: true, statusEnvioCA: true }
        });
        const notaTextoLivre = comEventoENota.filter(
            (c) => !/^\d{3,}([-/.]\d{1,4})?$/.test(String(c.numeroNota).trim())
        );
        res.json({ ok: true, baixasDivergentes, contasNotaTextoLivreComEvento: notaTextoLivre });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-desvincular/:contaId?reenviar=1
// Desfaz um vínculo ERRADO com o CA: apaga as baixas importadas do CA (origem 'CA') das
// parcelas da conta, zera idParcelaCA/baixadoViaCA/idEventoCA/protocoloCA, recalcula os
// status e (com ?reenviar=1) re-enfileira o envio para criar a despesa certa no CA.
// NÃO mexe em baixas registradas no app (origem != 'CA').
router.post('/contas-pagar-desvincular/:contaId', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const { contaId } = req.params;
        const reenviar = String(req.query.reenviar || '') === '1';
        const conta = await prisma.contaPagar.findUnique({
            where: { id: contaId },
            include: { parcelas: true }
        });
        if (!conta) return res.status(404).json({ ok: false, error: 'Conta não encontrada.' });

        const resumo = { contaId, descricao: conta.descricao, baixasApagadas: 0, parcelasDesvinculadas: 0 };
        await prisma.$transaction(async (tx) => {
            for (const p of conta.parcelas) {
                const r = await tx.pagamentoParcelaPagar.deleteMany({
                    where: { parcelaPagarId: p.id, origem: 'CA' }
                });
                resumo.baixasApagadas += r.count;
                if (p.idParcelaCA || p.baixadoViaCA) {
                    await tx.parcelaPagar.update({
                        where: { id: p.id },
                        data: { idParcelaCA: null, baixadoViaCA: false }
                    });
                    resumo.parcelasDesvinculadas++;
                }
            }
            await tx.contaPagar.update({
                where: { id: contaId },
                data: {
                    idEventoCA: null,
                    protocoloCA: null,
                    ...(reenviar ? { statusEnvioCA: 'ENVIAR', erroEnvioCA: null } : {})
                }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Recalcula status fora da transação (cada recálculo é idempotente e isolado)
        for (const p of conta.parcelas) {
            await caSync.recalcularParcelaEConta(prisma, p.id);
        }
        const depois = await prisma.contaPagar.findUnique({
            where: { id: contaId },
            select: {
                status: true, statusEnvioCA: true, idEventoCA: true,
                parcelas: { select: { numeroParcela: true, status: true, valorPago: true, idParcelaCA: true } }
            }
        });
        res.json({ ok: true, ...resumo, reenviar, depois });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Financeiro POR CONTA (banco/caixa) — diagnóstico e backfill ──

// GET /api/admin-exec/financeiro-contas-diag — quanto de cada lado já tem a conta financeira preenchida
router.get('/financeiro-contas-diag', async (req, res) => {
    try {
        const [contasFin, pagTotal, pagSemConta, recPagas, recSemConta] = await Promise.all([
            prisma.contaFinanceira.count(),
            prisma.pagamentoParcelaPagar.count({ where: { estornado: false } }),
            prisma.pagamentoParcelaPagar.count({ where: { estornado: false, contaFinanceiraCaId: null } }),
            prisma.parcela.count({ where: { status: 'PAGO' } }),
            prisma.parcela.count({ where: { status: 'PAGO', contaFinanceiraCaId: null } })
        ]);
        const bancos = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true, tipoUso: true, ativo: true }, orderBy: { nomeBanco: 'asc' } });
        res.json({
            ok: true,
            contasFinanceirasCadastradas: contasFin,
            pagar: { totalBaixas: pagTotal, semConta: pagSemConta, comConta: pagTotal - pagSemConta },
            receber: { totalPagas: recPagas, semConta: recSemConta, comConta: recPagas - recSemConta },
            backfillReceber: _backfillReceber,
            bancos
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-financeiras-sync — puxa a lista de bancos/caixas do CA para a tabela local
router.post('/contas-financeiras-sync', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const r = await caSync.sincronizarContasFinanceiras();
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-conta-pagar?limite=300 — preenche o banco nas baixas antigas de contas a PAGAR
router.post('/backfill-conta-pagar', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const limite = Math.min(1000, Math.max(1, parseInt(req.query.limite, 10) || 300));
        const r = await caSync.backfillContasFinanceirasPagar(limite);
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-conta-receber?limite=40 — re-sincroniza do CA as contas a RECEBER
// pagas que estão sem banco, para preencher contaFinanceiraCaId. Limitado (cada conta bate no CA).
router.post('/backfill-conta-receber', async (req, res) => {
    try {
        const receberSync = require('../services/contasReceberSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        // Modo assíncrono (?async=1): dispara o processamento no servidor e responde na hora,
        // varrendo TODAS as contas em segundo plano (evita timeout do proxy em lotes grandes).
        // Acompanhe pela rota financeiro-contas-diag (receber.semConta cai até zerar).
        if (req.query.async === '1' || req.query.async === 'true') {
            if (_backfillReceber.rodando) {
                return res.json({ ok: true, jaRodando: true, progresso: _backfillReceber.progresso });
            }
            _backfillReceber.rodando = true;
            _backfillReceber.progresso = { processadas: 0, erros: 0, iniciadoEm: new Date().toISOString() };
            (async () => {
                try {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const parcelas = await prisma.parcela.findMany({
                            where: { status: 'PAGO', contaFinanceiraCaId: null, contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } } },
                            select: { contaReceberId: true },
                            take: 400
                        });
                        const ids = [...new Set(parcelas.map((p) => p.contaReceberId))];
                        if (ids.length === 0) break;
                        let algumPreenchido = false;
                        for (const contaId of ids) {
                            try {
                                await receberSync.sincronizarConta(contaId, { semLog: true });
                                const cheias = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: { not: null } } });
                                if (cheias > 0) algumPreenchido = true;
                                _backfillReceber.progresso.processadas++;
                            } catch (err) {
                                _backfillReceber.progresso.erros++;
                            }
                        }
                        // Se uma varredura inteira não preencheu nada, o restante não tem banco no CA — para.
                        if (!algumPreenchido) break;
                    }
                    console.log('[admin-exec] Backfill receber (async) concluído:', _backfillReceber.progresso);
                } catch (e) {
                    console.error('[admin-exec] Backfill receber (async) erro:', e.message);
                } finally {
                    _backfillReceber.rodando = false;
                }
            })();
            return res.json({ ok: true, iniciado: true, aviso: 'Rodando em segundo plano; acompanhe em financeiro-contas-diag.' });
        }

        const limite = Math.min(50, Math.max(1, parseInt(req.query.limite, 10) || 40));
        // Contas com alguma parcela PAGA sem banco, cujo pedido já tem espelho no CA
        const parcelas = await prisma.parcela.findMany({
            where: { status: 'PAGO', contaFinanceiraCaId: null, contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } } },
            select: { contaReceberId: true },
            take: limite * 8
        });
        const contaIds = [...new Set(parcelas.map((p) => p.contaReceberId))].slice(0, limite);

        let reSincronizadas = 0, preenchidas = 0;
        const detalhes = [];
        for (const contaId of contaIds) {
            try {
                await receberSync.sincronizarConta(contaId, { semLog: true });
                reSincronizadas++;
                const restam = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: null } });
                const cheias = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: { not: null } } });
                if (cheias > 0) preenchidas++;
                detalhes.push({ contaId, restamSemConta: restam, comConta: cheias });
            } catch (err) {
                detalhes.push({ contaId, erro: err.message });
            }
        }
        res.json({ ok: true, contasAlvo: contaIds.length, reSincronizadas, comAlgumBanco: preenchidas, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-ledger-receber?limite=40  (ou ?async=1)
// Re-sincroniza do CA as contas a RECEBER pagas cujas parcelas NÃO têm ledger individual
// (baixas antigas, feitas antes do ledger existir). O sync (soLedger) cria uma linha de
// PagamentoParcela por baixa do CA, com o banco de cada uma — assim a divisão por conta
// (ex.: PIX Asaas + dinheiro Caixinha) passa a existir no app e a conciliação/saldo a
// enxergam. NÃO mexe em status/valor da parcela. Cada conta bate no CA → capado/async.
router.post('/backfill-ledger-receber', async (req, res) => {
    try {
        const receberSync = require('../services/contasReceberSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        // Parcelas PAGAS, com pedido espelhado no CA, e SEM nenhum pagamento ativo no ledger.
        const whereParcela = {
            status: 'PAGO',
            contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } },
            pagamentos: { none: { estornado: false } }
        };

        if (req.query.async === '1' || req.query.async === 'true') {
            if (_backfillLedger.rodando) return res.json({ ok: true, jaRodando: true, progresso: _backfillLedger.progresso });
            _backfillLedger.rodando = true;
            _backfillLedger.progresso = { processadas: 0, comLedger: 0, erros: 0, iniciadoEm: new Date().toISOString() };
            (async () => {
                try {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const parcelas = await prisma.parcela.findMany({ where: whereParcela, select: { contaReceberId: true }, take: 400 });
                        const ids = [...new Set(parcelas.map((p) => p.contaReceberId))];
                        if (ids.length === 0) break;
                        let algum = false;
                        for (const contaId of ids) {
                            try {
                                await receberSync.sincronizarConta(contaId, { semLog: true, origem: 'BACKFILL_LEDGER' });
                                const comLedger = await prisma.pagamentoParcela.count({ where: { parcela: { contaReceberId: contaId }, estornado: false } });
                                if (comLedger > 0) { algum = true; _backfillLedger.progresso.comLedger++; }
                                _backfillLedger.progresso.processadas++;
                            } catch (err) { _backfillLedger.progresso.erros++; }
                        }
                        if (!algum) break; // varredura inteira sem criar ledger → o resto não tem baixa no CA
                    }
                    console.log('[admin-exec] Backfill ledger (async) concluído:', _backfillLedger.progresso);
                } catch (e) {
                    console.error('[admin-exec] Backfill ledger (async) erro:', e.message);
                } finally {
                    _backfillLedger.rodando = false;
                }
            })();
            return res.json({ ok: true, iniciado: true, aviso: 'Rodando em segundo plano; reconsulte esta rota (GET financeiro-contas-diag) para acompanhar.' });
        }

        const limite = Math.min(50, Math.max(1, parseInt(req.query.limite, 10) || 40));
        const parcelas = await prisma.parcela.findMany({ where: whereParcela, select: { contaReceberId: true }, take: limite * 8 });
        const contaIds = [...new Set(parcelas.map((p) => p.contaReceberId))].slice(0, limite);

        let reSincronizadas = 0, comLedger = 0;
        const detalhes = [];
        for (const contaId of contaIds) {
            try {
                await receberSync.sincronizarConta(contaId, { semLog: true, origem: 'BACKFILL_LEDGER' });
                reSincronizadas++;
                const n = await prisma.pagamentoParcela.count({ where: { parcela: { contaReceberId: contaId }, estornado: false } });
                if (n > 0) comLedger++;
                detalhes.push({ contaId, linhasLedger: n });
            } catch (err) {
                detalhes.push({ contaId, erro: err.message });
            }
        }
        res.json({ ok: true, progresso: _backfillLedger.progresso, contasAlvo: contaIds.length, reSincronizadas, comLedger, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/sync-ledger-pedido/:numero — re-sincroniza UM pedido do CA.
// Cria o ledger dividido por conta (soLedger) se a parcela estiver paga sem ledger —
// para consertar um caso pontual (ex.: R$ 10 do PIX Asaas do pedido 2033). Read/write
// de uma conta só. Devolve o ledger antes/depois para conferência.
router.post('/sync-ledger-pedido/:numero', async (req, res) => {
    try {
        const receberSync = require('../services/contasReceberSyncService');
        const numero = parseInt(req.params.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe o número do pedido.' });
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        const pedido = await prisma.pedido.findFirst({ where: { numero }, select: { id: true } });
        if (!pedido) return res.status(404).json({ ok: false, error: `Pedido ${numero} não encontrado.` });
        const conta = await prisma.contaReceber.findFirst({ where: { pedidoId: pedido.id }, select: { id: true } });
        if (!conta) return res.status(404).json({ ok: false, error: `Pedido ${numero} sem conta a receber.` });

        const antes = await prisma.pagamentoParcela.count({ where: { parcela: { contaReceberId: conta.id }, estornado: false } });
        const r = await receberSync.sincronizarConta(conta.id, { semLog: true, origem: 'FIX_LEDGER' });
        const ledger = await prisma.pagamentoParcela.findMany({
            where: { parcela: { contaReceberId: conta.id }, estornado: false },
            select: { valorRecebido: true, formaPagamento: true, contaFinanceiraCaId: true, dataPagamento: true }
        });
        const nomes = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } });
        const nome = (id) => nomes.find((c) => c.id === id)?.nomeBanco || (id ? '(não cadastrada)' : '(sem conta)');
        res.json({
            ok: true, pedido: numero,
            ledgerAntes: antes, ledgerDepois: ledger.length, aplicadas: r?.aplicadas ?? null,
            ledger: ledger.map((l) => ({ valor: Number(l.valorRecebido), forma: l.formaPagamento, conta: nome(l.contaFinanceiraCaId) }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-pdf-extrato — SOMENTE LEITURA, autocontido.
// Gera em memória um PDF sintético no layout do extrato do Conta Azul e roda o
// parsePdfExtratoCA NESTE servidor — prova se a leitura de PDF funciona em produção
// (dependência instalada, Node compatível) sem precisar subir arquivo.
router.get('/diag-pdf-extrato', async (req, res) => {
    try {
        const { PDFDocument, StandardFonts } = require('pdf-lib');
        const conciliacaoService = require('../services/conciliacaoBancariaService');
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const page = pdf.addPage([842, 595]);
        const draw = (x, y, t) => page.drawText(t, { x, y, size: 9, font });
        let y = 540;
        const linha = (data, desc, status, valor) => { draw(40, y, data); draw(120, y, desc); draw(480, y, status); draw(640, y, valor); y -= 22; };
        draw(40, y, '01/07/2026'); draw(120, y, 'Saldo do dia'); draw(700, y, 'R$ 31.878,76'); y -= 22;
        linha('01/07/2026', 'Recebimento de cobranca - Venda 1593 - 1/1', 'Conciliado', 'R$ 361,07');
        linha('01/07/2026', 'Pagamento de Boleto para Nome nao encontrado', 'Conciliado', '- R$ 416,94');
        const bytes = await pdf.save();
        const r = await conciliacaoService.parsePdfExtratoCA(Buffer.from(bytes));
        res.json({
            ok: true,
            lancamentos: r.lancamentos.length,
            avisos: r.avisos,
            amostra: r.lancamentos.map((l) => ({ data: l.data, tipo: l.tipo, valor: l.valor, descricao: l.descricao }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, stack: (e.stack || '').split('\n').slice(0, 4) });
    }
});

// GET /api/admin-exec/diag-ledger-receber?contaId=UUID&de=2026-07-01&ate=2026-07-31
// SOMENTE LEITURA. Para a conciliação: quantas parcelas PAGAS no período têm (ou não)
// o ledger individual (PagamentoParcela) — sem ledger, o crédito do extrato não acha par.
router.get('/diag-ledger-receber', async (req, res) => {
    try {
        const contaId = String(req.query.contaId || '').trim() || null;
        const de = new Date(`${req.query.de || '2026-07-01'}T00:00:00-03:00`);
        const ate = new Date(`${req.query.ate || '2026-07-31'}T23:59:59-03:00`);

        const pagas = await prisma.parcela.findMany({
            where: {
                status: 'PAGO',
                dataPagamento: { gte: de, lte: ate },
                ...(contaId ? { contaFinanceiraCaId: contaId } : {})
            },
            select: {
                id: true, valorPago: true, dataPagamento: true, contaFinanceiraCaId: true,
                pagamentos: { where: { estornado: false }, select: { id: true } },
                contaReceber: { select: { pedido: { select: { numero: true, nfeNumero: true } } } }
            }
        });
        const semLedger = pagas.filter((p) => p.pagamentos.length === 0);
        const comLedger = pagas.length - semLedger.length;
        res.json({
            ok: true,
            filtro: { contaId, de: req.query.de || '2026-07-01', ate: req.query.ate || '2026-07-31' },
            parcelasPagasNoPeriodo: pagas.length,
            comLedger,
            semLedger: semLedger.length,
            amostraSemLedger: semLedger.slice(0, 15).map((p) => ({
                pedido: p.contaReceber?.pedido?.numero || null,
                nfe: p.contaReceber?.pedido?.nfeNumero || null,
                valorPago: Number(p.valorPago || 0),
                dataPagamento: p.dataPagamento
            }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-pdf-ultimo — SOMENTE LEITURA. Mostra as linhas de texto
// que o servidor extraiu do ÚLTIMO PDF de extrato cuja leitura falhou (0 lançamentos)
// — gravadas pelo parsePdfExtratoCA em app_configs.diag_pdf_extrato_ultimo.
router.get('/diag-pdf-ultimo', async (req, res) => {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'diag_pdf_extrato_ultimo' } });
        if (!cfg) return res.json({ ok: false, motivo: 'Nenhum diagnóstico gravado ainda (nenhuma importação de PDF falhou desde o deploy).' });
        res.json({ ok: true, ...cfg.value });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/compras-estoque-check
// SOMENTE LEITURA. Para CADA nota CONFERIDA: quantos itens tinha, quantos estavam
// vinculados a produto/insumo (de-para memorizado) e quantas entradas de estoque
// (compras_itens ativas) foram registradas — mostra quem alimentou o estoque e quem não.
router.get('/compras-estoque-check', async (req, res) => {
    try {
        const notas = await prisma.notaEntrada.findMany({
            where: { status: 'CONFERIDA' },
            orderBy: { atualizadoEm: 'desc' },
            select: {
                id: true, tipo: true, numero: true, fornecedorNome: true, fornecedorCnpj: true,
                emissao: true, valorTotal: true, atualizadoEm: true,
                itens: { select: { codigoFornecedor: true, descricao: true } }
            }
        });

        // Compras ativas por nota
        const compras = await prisma.compraItem.groupBy({
            by: ['notaEntradaId'],
            where: { estornado: false },
            _count: { id: true }
        });
        const comprasPorNota = new Map(compras.map((c) => [c.notaEntradaId, c._count.id]));

        // Vínculos memorizados (produto OU insumo) por fornecedor+código
        const cnpjs = [...new Set(notas.map((n) => n.fornecedorCnpj).filter(Boolean))];
        const vinculos = await prisma.fornecedorProdutoVinculo.findMany({
            where: {
                fornecedorCnpj: { in: cnpjs },
                OR: [{ produtoId: { not: null } }, { itemPcpId: { not: null } }]
            },
            select: { fornecedorCnpj: true, codigoFornecedor: true }
        });
        const temVinculo = new Set(vinculos.map((v) => `${v.fornecedorCnpj}|${v.codigoFornecedor}`));

        const linhas = notas.map((n) => {
            const itens = n.itens.length;
            const itensVinculados = n.tipo === 'NFSE' ? 0 : n.itens
                .filter((i) => temVinculo.has(`${n.fornecedorCnpj}|${i.codigoFornecedor}`)).length;
            const entradas = comprasPorNota.get(n.id) || 0;
            let situacao;
            if (n.tipo === 'NFSE') situacao = 'SERVICO_SEM_ESTOQUE';       // serviço nunca movimenta
            else if (entradas > 0 && entradas >= itensVinculados) situacao = 'ALIMENTOU_ESTOQUE';
            else if (entradas > 0) situacao = 'PARCIAL';
            else if (itensVinculados > 0) situacao = 'SEM_ENTRADA_COM_VINCULO'; // conferida antes da Fase 6?
            else situacao = 'SEM_ENTRADA_SEM_VINCULO';
            return {
                numero: n.numero, tipo: n.tipo, fornecedor: n.fornecedorNome,
                emissao: n.emissao, valorTotal: n.valorTotal, conferidaEm: n.atualizadoEm,
                itens, itensVinculados, entradasEstoque: entradas, situacao
            };
        });

        const resumo = {};
        for (const l of linhas) resumo[l.situacao] = (resumo[l.situacao] || 0) + 1;

        res.json({ totalConferidas: linhas.length, resumo, notas: linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Fase 6: entrada RETROATIVA de compras (notas conferidas antes da fase) ──
// Monta, por nota CONFERIDA sem compras ativas, as entradas a partir do vínculo
// memorizado (fornecedor+cProd → produto/insumo + fator). Idempotente.
async function _montarEntradasRetroativas() {
    const notas = await prisma.notaEntrada.findMany({
        where: { status: 'CONFERIDA', tipo: { not: 'NFSE' } },
        select: {
            id: true, tipo: true, numero: true, fornecedorNome: true, fornecedorCnpj: true,
            fornecedorId: true, emissao: true, contaPagarId: true,
            itens: true,
            compras: { where: { estornado: false }, select: { id: true } }
        }
    });
    const pendentes = notas.filter((n) => n.compras.length === 0 && n.fornecedorCnpj);

    const resultado = [];
    for (const nota of pendentes) {
        const vinculos = await prisma.fornecedorProdutoVinculo.findMany({
            where: {
                fornecedorCnpj: nota.fornecedorCnpj,
                OR: [{ produtoId: { not: null } }, { itemPcpId: { not: null } }]
            },
            select: { codigoFornecedor: true, produtoId: true, itemPcpId: true, fatorConversao: true }
        });
        const porCodigo = new Map(vinculos.map((v) => [v.codigoFornecedor, v]));
        const entradas = [];
        for (const itemNota of nota.itens) {
            const v = porCodigo.get(itemNota.codigoFornecedor);
            if (!v) continue;
            entradas.push({
                itemNota,
                produtoId: v.produtoId || null,
                itemPcpId: v.produtoId ? null : v.itemPcpId,
                fator: Number(v.fatorConversao) > 0 ? Number(v.fatorConversao) : 1
            });
        }
        if (entradas.length > 0) resultado.push({ nota, entradas });
    }
    return resultado;
}

// GET /api/admin-exec/compras-retroativas-simulacao — SOMENTE LEITURA: o que seria lançado
router.get('/compras-retroativas-simulacao', async (req, res) => {
    try {
        const estoqueService = require('../services/estoqueService');
        const planos = await _montarEntradasRetroativas();
        const linhas = [];
        for (const { nota, entradas } of planos) {
            for (const e of entradas) {
                let alvo = null;
                let controla = null;
                if (e.produtoId) {
                    const p = await prisma.produto.findUnique({
                        where: { id: e.produtoId },
                        select: { nome: true, unidade: true, categoria: true, controlaEstoque: true }
                    });
                    alvo = p ? `PRODUTO: ${p.nome}` : 'PRODUTO (não encontrado)';
                    controla = p ? await estoqueService.produtoControlaEstoque(p) : false;
                } else if (e.itemPcpId) {
                    const i = await prisma.itemPcp.findUnique({ where: { id: e.itemPcpId }, select: { nome: true } });
                    alvo = i ? `INSUMO: ${i.nome}` : 'INSUMO (não encontrado)';
                    controla = true;
                }
                const qtd = Number(e.itemNota.quantidade) * e.fator;
                linhas.push({
                    nota: nota.numero,
                    fornecedor: nota.fornecedorNome,
                    item: e.itemNota.descricao,
                    alvo,
                    quantidadeConvertida: Math.round(qtd * 1000) / 1000,
                    valor: Number(e.itemNota.valorTotal),
                    custoUnitario: qtd > 0 ? Math.round((Number(e.itemNota.valorTotal) / qtd) * 10000) / 10000 : null,
                    movimentaEstoque: controla,
                    efeito: controla ? 'entrada de estoque + custo + histórico' : 'só custo + histórico (não controla estoque)'
                });
            }
        }
        res.json({ notasPendentes: planos.length, itens: linhas.length, linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/compras-retroativas — EXECUTA as entradas retroativas (idempotente)
router.post('/compras-retroativas', async (req, res) => {
    try {
        const compraEstoqueService = require('../services/compraEstoqueService');
        const planos = await _montarEntradasRetroativas();
        let totalRegistradas = 0;
        const avisos = [];
        const porNota = [];
        for (const { nota, entradas } of planos) {
            const r = await compraEstoqueService.registrarEntradasCompra(nota, nota.contaPagarId, entradas, null);
            totalRegistradas += r.registradas;
            avisos.push(...r.avisos.map((a) => `Nota ${nota.numero}: ${a}`));
            porNota.push({ nota: nota.numero, fornecedor: nota.fornecedorNome, registradas: r.registradas });
        }
        res.json({ ok: true, notasProcessadas: planos.length, totalRegistradas, porNota, avisos });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/gerencial-diag
// SOMENTE LEITURA. Roda o Fluxo de Caixa e a DRE (Fase 5) e devolve um resumo
// compacto — validar os números reais em produção logo após o deploy.
router.get('/gerencial-diag', async (req, res) => {
    try {
        const svc = require('../services/financeiroGerencialService');
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const mes = hoje.slice(0, 7);
        const [fluxo, dreDados] = await Promise.all([
            svc.fluxoCaixa(`${mes}-01`, hoje, 'dia'),
            svc.dre(`${mes.slice(0, 4)}-01`, mes)
        ]);
        res.json({
            fluxo: { kpis: fluxo.kpis, totais: fluxo.totais, dias: fluxo.linhas.length },
            dre: {
                meses: dreDados.meses,
                receitaLiquida: dreDados.receita.liquida.valores,
                totalDespesas: dreDados.despesas.total.valores,
                resultado: dreDados.resultado.valores,
                topCategorias: dreDados.despesas.categorias.slice(0, 8).map((c) => `${c.nome}: ${c.total}`)
            }
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/nfse-status
// SOMENTE LEITURA. Status da captura de NFS-e (linha 'nfse' da dfe_controle) +
// contagem de notas NFSE — acompanhar o primeiro ciclo real em produção.
router.get('/nfse-status', async (req, res) => {
    try {
        const nfseAdnService = require('../services/nfseAdnService');
        const status = await nfseAdnService.statusCaptura();
        const [notasNfse, ultimas] = await Promise.all([
            prisma.notaEntrada.count({ where: { tipo: 'NFSE' } }),
            prisma.notaEntrada.findMany({
                where: { tipo: 'NFSE' },
                orderBy: { criadoEm: 'desc' },
                take: 5,
                select: { numero: true, fornecedorNome: true, valorTotal: true, emissao: true, status: true }
            })
        ]);
        res.json({ status, notasNfse, ultimas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/nfse-ciclo
// Dispara UM ciclo de captura de NFS-e no ADN (síncrono) e devolve o resultado +
// status do controle. Diagnóstico da Fase 4 — validar o formato real da resposta
// do ambiente nacional sem depender do worker de 60min.
router.post('/nfse-ciclo', async (req, res) => {
    try {
        const nfseAdnService = require('../services/nfseAdnService');
        const resultado = await nfseAdnService.executarCiclo();
        const status = await nfseAdnService.statusCaptura();
        const notasNfse = await prisma.notaEntrada.count({ where: { tipo: 'NFSE' } });
        res.json({ resultado, status, notasNfse });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/gdrive-config
// Grava (upsert) a config do Google Drive em app_configs (chave gdrive_config).
// Body: { ativo, clientId, clientSecret, refreshToken, envioContabilidadeId }
// Nunca devolve os segredos — só confirma o que ficou salvo (mascarado).
router.post('/gdrive-config', async (req, res) => {
    try {
        const { ativo, clientId, clientSecret, refreshToken, envioContabilidadeId } = req.body || {};
        if (!clientId || !clientSecret || !refreshToken) {
            return res.status(400).json({ ok: false, error: 'clientId, clientSecret e refreshToken são obrigatórios.' });
        }
        const value = {
            ativo: ativo !== false,
            clientId, clientSecret, refreshToken,
            ...(envioContabilidadeId ? { envioContabilidadeId } : {}),
        };
        await prisma.appConfig.upsert({
            where: { key: 'gdrive_config' },
            update: { value },
            create: { key: 'gdrive_config', value },
        });
        try { require('../services/googleDriveService').limparCacheConfig(); } catch (_) {}
        const mask = (s) => (s ? `${String(s).slice(0, 6)}…${String(s).slice(-4)}` : null);
        res.json({ ok: true, salvo: { ativo: value.ativo, clientId: mask(clientId), refreshToken: mask(refreshToken), envioContabilidadeId: value.envioContabilidadeId || '(padrão)' } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/gdrive-status
// Testa o acesso ao Drive com as credenciais atuais (não expõe segredos).
router.get('/gdrive-status', async (req, res) => {
    try {
        const googleDriveService = require('../services/googleDriveService');
        const r = await googleDriveService.testarAcesso();
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ═══════════════ RÉGUA DE COBRANÇA (diagnóstico/config em produção) ═══════════════

// POST /api/admin-exec/cobranca-email-config
// Grava (upsert) a config SMTP em app_configs (chave email_config).
// Body: { ativo, host, port, secure, user, pass, from, fromName }
router.post('/cobranca-email-config', async (req, res) => {
    try {
        const { ativo, host, port, secure, user, pass, from, fromName } = req.body || {};
        if (!host || !user || !pass) {
            return res.status(400).json({ ok: false, error: 'host, user e pass são obrigatórios.' });
        }
        const value = { ativo: ativo !== false, host, port: Number(port || 465), secure: secure !== false, user, pass, from: from || user, fromName: fromName || 'Hardt Salgados' };
        await prisma.appConfig.upsert({
            where: { key: 'email_config' },
            update: { value },
            create: { key: 'email_config', value },
        });
        try { require('../services/emailService').limparCacheConfig(); } catch (_) {}
        res.json({ ok: true, salvo: { ativo: value.ativo, host, port: value.port, user, from: value.from } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/cobranca-email-teste?para=alguem@dominio.com
// Verifica a conexão SMTP e (se ?para=) envia um e-mail de teste.
router.get('/cobranca-email-teste', async (req, res) => {
    try {
        const emailService = require('../services/emailService');
        const conexao = await emailService.testarConexao();
        let envio = null;
        if (conexao.ok && req.query.para) {
            envio = await emailService.enviar(req.query.para, 'Teste — Régua de Cobrança Hardt', '<p>E-mail de teste da régua de cobrança. Se você recebeu, o SMTP está funcionando. ✅</p>');
        }
        res.json({ conexao, envio });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/cobranca-executar — roda a régua agora (mesmo pausada)
router.post('/cobranca-executar', async (req, res) => {
    try {
        const cobrancaService = require('../services/cobrancaService');
        const r = await cobrancaService.executarRegua({ forcarManual: true });
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-catalogo-condicoes — SOMENTE LEITURA
// Mostra, por condição, se aparece no catálogo personalizado e se exige aprovação de crédito.
router.get('/diag-catalogo-condicoes', async (req, res) => {
    try {
        const condicoes = await prisma.$queryRawUnsafe(`
            SELECT id, nome_condicao, ativo,
                   permite_catalogo_personalizado AS catalogo,
                   exige_aprovacao_credito AS aprov_credito
            FROM tabela_precos
            ORDER BY id ASC
        `);
        res.json({
            ok: true,
            total: condicoes.length,
            ativas: condicoes.filter(c => c.ativo).length,
            no_catalogo: condicoes.filter(c => c.catalogo).length,
            condicoes
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
