// =====================================================================
// Integração Asaas — cobranças PIX (QR Code na entrega) e, no futuro, boleto.
//
// Credenciais: env ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN (EasyPanel).
// Nada de chave no repo nem no banco. Sem a chave, a integração fica
// desligada (rotas respondem "não configurado" e o front esconde o botão).
//
// Ambiente: chave de sandbox contém "hmlg" → api-sandbox; senão produção.
// =====================================================================
const axios = require('axios');
const prisma = require('../config/database');

// Toda chave do Asaas começa com "$aact_". O EasyPanel engole o "$" inicial
// (interpolação de variável), então recolocamos se estiver faltando.
let _key = process.env.ASAAS_API_KEY || null;
if (_key && _key.startsWith('aact_')) _key = '$' + _key;
const API_KEY = _key;
const IS_SANDBOX = !!API_KEY && API_KEY.includes('hmlg');
const BASE_URL = IS_SANDBOX ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
const AMBIENTE = IS_SANDBOX ? 'SANDBOX' : 'PRODUCAO';

const http = axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CA-Hardt-App',
        ...(API_KEY ? { access_token: API_KEY } : {})
    }
});

function configurado() {
    return !!API_KEY;
}

function exigirConfig() {
    if (!API_KEY) {
        const err = new Error('Integração Asaas não configurada (falta ASAAS_API_KEY no servidor).');
        err.statusCode = 503;
        throw err;
    }
}

// Erro da API do Asaas → mensagem legível
function erroAsaas(e, contexto) {
    const desc = e.response?.data?.errors?.map(x => x.description).join('; ')
        || e.response?.data?.message
        || e.message;
    const err = new Error(`Asaas (${contexto}): ${desc}`);
    err.statusCode = e.response?.status === 401 ? 503 : 502;
    console.error(`[Asaas] Erro em ${contexto}:`, e.response?.status, e.response?.data || e.message);
    return err;
}

const soDigitos = (s) => (s || '').replace(/\D/g, '');

// Data de hoje no fuso de São Paulo, formato YYYY-MM-DD (dueDate do Asaas)
function hojeSP() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Status do Asaas → status local da CobrancaAsaas
function mapearStatus(statusAsaas) {
    if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(statusAsaas)) return 'RECEBIDO';
    if (['OVERDUE'].includes(statusAsaas)) return 'EXPIRADO';
    if (['REFUNDED', 'DELETED', 'CANCELLED'].includes(statusAsaas)) return 'CANCELADO';
    return 'PENDENTE';
}

const asaasService = {
    configurado,
    AMBIENTE,

    // ── Cliente do app ↔ customer no Asaas (cria uma vez, reutiliza sempre) ──
    ensureCustomer: async (clienteUuid) => {
        exigirConfig();

        const vinculo = await prisma.clienteAsaas.findUnique({ where: { clienteUuid } });
        if (vinculo && vinculo.ambiente === AMBIENTE) return vinculo.asaasCustomerId;

        const cliente = await prisma.cliente.findUnique({ where: { UUID: clienteUuid } });
        if (!cliente) throw new Error('Cliente não encontrado.');

        const cpfCnpj = soDigitos(cliente.Documento);
        if (!cpfCnpj) {
            const err = new Error(`Cliente "${cliente.Nome}" está sem CPF/CNPJ no cadastro — obrigatório para gerar cobrança no Asaas.`);
            err.statusCode = 400;
            throw err;
        }

        // Procura primeiro por externalReference (evita duplicar customer no Asaas)
        let customerId = null;
        try {
            const busca = await http.get('/customers', { params: { externalReference: clienteUuid } });
            customerId = busca.data?.data?.[0]?.id || null;
        } catch (e) {
            throw erroAsaas(e, 'buscar cliente');
        }

        if (!customerId) {
            const celular = soDigitos(cliente.Telefone_Celular || cliente.Telefone);
            try {
                const criado = await http.post('/customers', {
                    name: cliente.Nome,
                    cpfCnpj,
                    email: cliente.Email || undefined,
                    mobilePhone: celular || undefined,
                    externalReference: clienteUuid,
                    notificationDisabled: true // quem avisa o cliente é o nosso app, não o Asaas
                });
                customerId = criado.data.id;
            } catch (e) {
                throw erroAsaas(e, 'criar cliente');
            }
        }

        await prisma.clienteAsaas.upsert({
            where: { clienteUuid },
            create: { clienteUuid, asaasCustomerId: customerId, ambiente: AMBIENTE },
            update: { asaasCustomerId: customerId, ambiente: AMBIENTE }
        });

        return customerId;
    },

    // ── Criar cobrança PIX de um pedido (QR Code na entrega) ──
    // Idempotente por clique: se já existe PIX PENDENTE do mesmo pedido e valor
    // (e não expirado), devolve o existente em vez de criar outro.
    criarPixPedido: async ({ pedidoId, valor, descricao, criadoPorId }) => {
        exigirConfig();

        const valorNum = Math.round(Number(valor) * 100) / 100;
        if (!valorNum || valorNum <= 0) {
            const err = new Error('Valor do PIX inválido.');
            err.statusCode = 400;
            throw err;
        }

        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: { cliente: { select: { UUID: true, Nome: true } } }
        });
        if (!pedido) throw new Error('Pedido não encontrado.');

        const existente = await prisma.cobrancaAsaas.findFirst({
            where: {
                pedidoId,
                tipo: 'PIX',
                status: 'PENDENTE',
                valor: valorNum,
                ambiente: AMBIENTE,
                OR: [{ pixExpiraEm: null }, { pixExpiraEm: { gt: new Date() } }]
            },
            orderBy: { createdAt: 'desc' }
        });
        if (existente) return existente;

        const customerId = await asaasService.ensureCustomer(pedido.cliente.UUID);

        let payment;
        try {
            const resp = await http.post('/payments', {
                customer: customerId,
                billingType: 'PIX',
                value: valorNum,
                dueDate: hojeSP(),
                description: (descricao || `Pedido #${pedido.numero || 's/n'} - Hardt`).slice(0, 500),
                externalReference: pedidoId
            });
            payment = resp.data;
        } catch (e) {
            throw erroAsaas(e, 'criar cobrança PIX');
        }

        let qr = {};
        try {
            const respQr = await http.get(`/payments/${payment.id}/pixQrCode`);
            qr = respQr.data || {};
        } catch (e) {
            // QR falhou → cancela a cobrança órfã no Asaas para não sobrar lixo
            try { await http.delete(`/payments/${payment.id}`); } catch (_) { /* melhor esforço */ }
            throw erroAsaas(e, 'gerar QR Code');
        }

        return prisma.cobrancaAsaas.create({
            data: {
                asaasPaymentId: payment.id,
                tipo: 'PIX',
                status: 'PENDENTE',
                valor: valorNum,
                descricao: descricao || null,
                clienteId: pedido.cliente.UUID,
                pedidoId,
                pixPayload: qr.payload || null,
                pixQrCodeBase64: qr.encodedImage || null,
                pixExpiraEm: qr.expirationDate ? new Date(qr.expirationDate) : null,
                criadoPorId: criadoPorId || null,
                ambiente: AMBIENTE
            }
        });
    },

    // ── Consultar uma cobrança (poll do motorista) ──
    // Se ainda PENDENTE, confere direto na API do Asaas — o pagamento aparece
    // mesmo que o webhook atrase ou falhe.
    consultarCobranca: async (cobrancaId) => {
        const cobranca = await prisma.cobrancaAsaas.findUnique({ where: { id: cobrancaId } });
        if (!cobranca) return null;
        if (cobranca.status !== 'PENDENTE' || !configurado()) return cobranca;

        let payment;
        try {
            const resp = await http.get(`/payments/${cobranca.asaasPaymentId}`);
            payment = resp.data;
        } catch (e) {
            console.error('[Asaas] Falha ao consultar cobrança (mantendo status local):', e.message);
            return cobranca;
        }

        const novoStatus = mapearStatus(payment.status);
        if (novoStatus === cobranca.status) return cobranca;

        if (novoStatus === 'RECEBIDO') {
            return asaasService.marcarRecebida(cobranca.id, {
                valorRecebido: payment.value,
                recebidoEm: payment.paymentDate || payment.clientPaymentDate || null
            });
        }
        return prisma.cobrancaAsaas.update({
            where: { id: cobranca.id },
            data: { status: novoStatus }
        });
    },

    // ── Cancelar cobrança pendente (motorista desistiu / valor errado) ──
    cancelarCobranca: async (cobrancaId) => {
        exigirConfig();
        const cobranca = await prisma.cobrancaAsaas.findUnique({ where: { id: cobrancaId } });
        if (!cobranca) throw new Error('Cobrança não encontrada.');
        if (cobranca.status === 'RECEBIDO') {
            const err = new Error('Cobrança já foi paga — não pode ser cancelada.');
            err.statusCode = 400;
            throw err;
        }
        if (cobranca.status !== 'PENDENTE') return cobranca;

        try {
            await http.delete(`/payments/${cobranca.asaasPaymentId}`);
        } catch (e) {
            // Se já não existe no Asaas, seguimos cancelando localmente
            if (e.response?.status !== 404) throw erroAsaas(e, 'cancelar cobrança');
        }
        return prisma.cobrancaAsaas.update({
            where: { id: cobrancaId },
            data: { status: 'CANCELADO' }
        });
    },

    // ── Marcar cobrança como recebida (idempotente — webhook e poll podem correr juntos) ──
    marcarRecebida: async (cobrancaId, { valorRecebido, recebidoEm } = {}) => {
        const { count } = await prisma.cobrancaAsaas.updateMany({
            where: { id: cobrancaId, status: { not: 'RECEBIDO' } },
            data: {
                status: 'RECEBIDO',
                valorRecebido: valorRecebido != null ? valorRecebido : undefined,
                recebidoEm: recebidoEm ? new Date(recebidoEm) : new Date()
            }
        });
        const cobranca = await prisma.cobrancaAsaas.findUnique({ where: { id: cobrancaId } });
        if (count > 0) {
            console.log(`✅ [Asaas] Cobrança ${cobranca?.asaasPaymentId} recebida: R$ ${Number(cobranca?.valorRecebido || cobranca?.valor).toFixed(2)}`);
        }
        return cobranca;
    },

    // ── Processar webhook do Asaas (já autenticado na rota) ──
    processarWebhook: async (body) => {
        const evento = body?.event;
        const payment = body?.payment;
        if (!evento || !payment?.id) return { ok: false, motivo: 'payload sem event/payment' };

        // Idempotência: o Asaas reenvia eventos; o id do evento é único
        try {
            await prisma.asaasWebhookEvento.create({
                data: {
                    eventoId: body.id || null,
                    evento,
                    paymentId: payment.id,
                    payload: body
                }
            });
        } catch (e) {
            if (e.code === 'P2002') return { ok: true, motivo: 'evento já processado' };
            console.error('[Asaas webhook] Falha ao logar evento (segue processando):', e.message);
        }

        const cobranca = await prisma.cobrancaAsaas.findUnique({
            where: { asaasPaymentId: payment.id }
        });

        let resultado = { ok: true, motivo: 'evento ignorado' };
        try {
            if (!cobranca) {
                resultado = { ok: true, motivo: 'cobrança não é do app (ignorada)' };
            } else if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(evento)) {
                await asaasService.marcarRecebida(cobranca.id, {
                    valorRecebido: payment.value,
                    recebidoEm: payment.paymentDate || payment.clientPaymentDate || null
                });
                resultado = { ok: true, motivo: 'recebimento registrado' };
            } else if (['PAYMENT_DELETED', 'PAYMENT_REFUNDED'].includes(evento)) {
                if (cobranca.status !== 'RECEBIDO' || evento === 'PAYMENT_REFUNDED') {
                    await prisma.cobrancaAsaas.update({
                        where: { id: cobranca.id },
                        data: { status: 'CANCELADO' }
                    });
                }
                resultado = { ok: true, motivo: 'cobrança cancelada' };
            } else if (evento === 'PAYMENT_OVERDUE') {
                if (cobranca.status === 'PENDENTE') {
                    await prisma.cobrancaAsaas.update({
                        where: { id: cobranca.id },
                        data: { status: 'EXPIRADO' }
                    });
                }
                resultado = { ok: true, motivo: 'cobrança expirada' };
            }

            if (body.id) {
                await prisma.asaasWebhookEvento.update({
                    where: { eventoId: body.id },
                    data: { processado: true }
                }).catch(() => { });
            }
        } catch (e) {
            console.error('[Asaas webhook] Erro ao processar evento:', e);
            if (body.id) {
                await prisma.asaasWebhookEvento.update({
                    where: { eventoId: body.id },
                    data: { erro: e.message }
                }).catch(() => { });
            }
            throw e;
        }
        return resultado;
    },

    // ── Registrar/atualizar o webhook lá no painel do Asaas (setup via admin-exec) ──
    registrarWebhook: async (urlPublica) => {
        exigirConfig();
        const token = process.env.ASAAS_WEBHOOK_TOKEN;
        if (!token) throw new Error('Falta ASAAS_WEBHOOK_TOKEN no servidor.');

        const desejado = {
            name: 'CA-Hardt App',
            url: urlPublica,
            email: 'clarksonneitzel@gmail.com',
            enabled: true,
            interrupted: false,
            authToken: token,
            sendType: 'SEQUENTIALLY',
            events: [
                'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE',
                'PAYMENT_DELETED', 'PAYMENT_REFUNDED'
            ]
        };

        try {
            const lista = await http.get('/webhooks');
            const existente = (lista.data?.data || []).find(w => w.url === urlPublica);
            if (existente) {
                const resp = await http.put(`/webhooks/${existente.id}`, desejado);
                return { atualizado: true, webhook: resp.data };
            }
            const resp = await http.post('/webhooks', desejado);
            return { criado: true, webhook: resp.data };
        } catch (e) {
            throw erroAsaas(e, 'registrar webhook');
        }
    },

    // ── Diagnóstico ──
    statusIntegracao: async () => {
        if (!configurado()) return { configurado: false, ambiente: null };
        try {
            const resp = await http.get('/myAccount/commercialInfo');
            return { configurado: true, ambiente: AMBIENTE, conta: resp.data?.companyName || resp.data?.name || 'ok' };
        } catch (e) {
            return { configurado: true, ambiente: AMBIENTE, erro: e.response?.status === 401 ? 'Chave inválida' : e.message };
        }
    }
};

module.exports = asaasService;
