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

// ── Configuração da integração (tela Configurações → Asaas) ─────────────────
// app_configs.asaas_config — multa/juros do boleto, mensagens e validade padrão do PIX.
const CONFIG_ASAAS_PADRAO = {
    multaAtiva: false, multaPercent: 2,          // multa: única, após o vencimento (máx. legal 2%)
    jurosAtivo: false, jurosMesPercent: 1,       // juros: ao mês, pro-rata dia (máx. legal 1%/mês)
    msgBoleto: 'Pedido {pedido} - parcela {parcela} - Hardt Doces e Salgados',
    pixValidadePadraoDias: 0,                    // 0=hoje, 1=amanhã, 3, 7 (pré-seleção da tela de PIX)
    msgPix: 'Pedido {pedido} - Hardt Doces e Salgados',
    avisosAsaas: false,                          // false = Asaas NÃO manda e-mail/SMS (quem avisa é o app)
};

async function obterConfigAsaas() {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_config' } });
        if (cfg?.value && typeof cfg.value === 'object') return { ...CONFIG_ASAAS_PADRAO, ...cfg.value };
        // chave antiga (só multa/juros), de antes da tela existir
        const legado = await prisma.appConfig.findUnique({ where: { key: 'asaas_boleto_config' } });
        const v = legado?.value || {};
        const out = { ...CONFIG_ASAAS_PADRAO };
        if (Number(v.multaPercent) > 0) { out.multaAtiva = true; out.multaPercent = Number(v.multaPercent); }
        if (Number(v.jurosMesPercent) > 0) { out.jurosAtivo = true; out.jurosMesPercent = Number(v.jurosMesPercent); }
        return out;
    } catch (_) {
        return { ...CONFIG_ASAAS_PADRAO };
    }
}

// Preenche {pedido}, {parcela}, {cliente}, {vencimento} num modelo de mensagem.
// Token sem valor vira vazio (nunca sobra "{cliente}" impresso no boleto).
function preencherMsg(modelo, vars = {}) {
    const out = String(modelo || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
    return out.replace(/\s{2,}/g, ' ').trim();
}

// Status do Asaas → status local da CobrancaAsaas
function mapearStatus(statusAsaas) {
    if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(statusAsaas)) return 'RECEBIDO';
    if (['OVERDUE'].includes(statusAsaas)) return 'EXPIRADO';
    if (['REFUNDED'].includes(statusAsaas)) return 'ESTORNADO';
    if (['DELETED', 'CANCELLED'].includes(statusAsaas)) return 'CANCELADO';
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
            const cfgAvisos = await obterConfigAsaas();
            try {
                const criado = await http.post('/customers', {
                    name: cliente.Nome,
                    cpfCnpj,
                    email: cliente.Email || undefined,
                    mobilePhone: celular || undefined,
                    externalReference: clienteUuid,
                    // padrão: quem avisa o cliente é o nosso app (WhatsApp/Régua), não o Asaas
                    notificationDisabled: !cfgAvisos.avisosAsaas
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

    // ── Criar cobrança PIX de um pedido (QR na entrega ou cobrança do financeiro) ──
    // Idempotente por clique: se já existe PIX PENDENTE do mesmo pedido e valor
    // (e não expirado), devolve o existente em vez de criar outro.
    // validadeDias: 0 = vale até o fim de hoje; N = fim do dia hoje+N.
    // vincularParcela: true (financeiro) = amarra na 1ª parcela em aberto → baixa
    // automática (app + CA) quando pagar. false (entrega) = baixa via fluxo do Caixa.
    criarPixPedido: async ({ pedidoId, valor, descricao, criadoPorId, validadeDias = 0, vincularParcela = false }) => {
        exigirConfig();

        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                cliente: { select: { UUID: true, Nome: true } },
                contaReceber: { include: { parcelas: { orderBy: { numeroParcela: 'asc' } } } }
            }
        });
        if (!pedido) throw new Error('Pedido não encontrado.');
        if (pedido.bonificacao) {
            const err = new Error('Bonificação não gera cobrança.');
            err.statusCode = 400;
            throw err;
        }

        // Valor: informado, ou o saldo em aberto das parcelas
        let valorNum = valor != null ? Math.round(Number(valor) * 100) / 100 : null;
        const parcelasAbertas = (pedido.contaReceber?.parcelas || [])
            .filter(p => ['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(p.status));
        if (valorNum == null) {
            const saldo = parcelasAbertas.reduce(
                (s, p) => s + Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0), 0);
            valorNum = Math.round(saldo * 100) / 100;
        }
        if (!valorNum || valorNum <= 0) {
            const err = new Error('Valor do PIX inválido (pedido sem saldo em aberto?).');
            err.statusCode = 400;
            throw err;
        }

        const parcelaId = vincularParcela ? (parcelasAbertas[0]?.id || null) : null;
        if (vincularParcela && !parcelaId) {
            const err = new Error('Pedido sem parcela em aberto para vincular a cobrança.');
            err.statusCode = 400;
            throw err;
        }

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

        // Vencimento = hoje + validadeDias (o QR/link vale até o fim desse dia)
        const dias = Math.max(0, Math.min(30, parseInt(validadeDias, 10) || 0));
        const venc = new Date(Date.now() + dias * 24 * 3600 * 1000)
            .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        // Descrição do PIX: modelo configurável (Configurações → Asaas)
        const cfgPix = await obterConfigAsaas();
        const numeroExib = `${pedido.especial ? 'ZZ#' : '#'}${pedido.numero || 's/n'}`;
        const descPix = descricao
            || preencherMsg(cfgPix.msgPix, { pedido: numeroExib, cliente: pedido.cliente?.Nome || '' })
            || `Pedido ${numeroExib} - Hardt`;

        let payment;
        try {
            const resp = await http.post('/payments', {
                customer: customerId,
                billingType: 'PIX',
                value: valorNum,
                dueDate: venc,
                description: descPix.slice(0, 500),
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
                parcelaId,
                boletoUrl: payment.invoiceUrl || null, // link da fatura Asaas (dá p/ pagar pelo link)
                vencimento: new Date(venc + 'T12:00:00-03:00'),
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
        if (novoStatus === 'ESTORNADO') {
            const asaasBaixaService = require('./asaasBaixaService');
            await asaasBaixaService.registrarEstorno(cobranca.id);
            return prisma.cobrancaAsaas.findUnique({ where: { id: cobranca.id } });
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
        // Pedido ESPECIAL pago via PIX → converte em pedido normal (regra do dono).
        // Roda ANTES da baixa, para a baixa já enxergar o pedido convertido.
        if (count > 0 && cobranca?.pedidoId) {
            try {
                const pedidoConversaoService = require('./pedidoConversaoService');
                await pedidoConversaoService.converterSeEspecial(cobranca);
            } catch (e) {
                console.error('[Asaas] Erro na conversão do especial (recebimento segue):', e.message);
            }
        }
        // Cobrança com parcela vinculada (boleto/PIX do financeiro) → baixa automática app + CA.
        // PIX de entrega tem parcelaId nulo (baixa acontece no fluxo do Caixa).
        if (cobranca?.parcelaId && (!cobranca.baixaAppOk || !cobranca.baixaCaOk)) {
            const asaasBaixaService = require('./asaasBaixaService'); // require tardio (evita ciclo de import)
            try { await asaasBaixaService.registrarBaixa(cobranca.id); }
            catch (e) { console.error('[Asaas] Erro na baixa automática (registrado p/ reprocesso):', e.message); }
        }
        return cobranca;
    },

    // ── Criar boleto de UMA parcela do Contas a Receber ──
    // Idempotente: se já existe boleto PENDENTE da parcela, devolve o existente.
    criarBoletoParcela: async ({ parcelaId, criadoPorId }) => {
        exigirConfig();

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: {
                contaReceber: {
                    include: {
                        cliente: { select: { UUID: true, Nome: true } },
                        pedido: { select: { id: true, numero: true, especial: true, idVendaContaAzul: true, dataVenda: true, situacaoCA: true, nfeChave: true } }
                    }
                }
            }
        });
        if (!parcela) throw new Error('Parcela não encontrada.');
        // Regra do dono: pedido especial (sem nota) não emite boleto Asaas
        if (parcela.contaReceber?.pedido?.especial) {
            const err = new Error('Pedido especial não emite boleto pelo Asaas.');
            err.statusCode = 400;
            throw err;
        }
        if (parcela.contaReceber?.status === 'QUITADO' || parcela.contaReceber?.status === 'CANCELADO') {
            const err = new Error(`Conta está ${parcela.contaReceber.status} — não dá para gerar cobrança.`);
            err.statusCode = 400;
            throw err;
        }
        // Regra do dono: boleto só DEPOIS da NF-e emitida (faturado + XML confirmado no CA).
        // Emitir boleto sem nota seria um problema fiscal sério.
        if (parcela.contaReceber?.pedido) {
            const ped = parcela.contaReceber.pedido;
            if (ped.situacaoCA !== 'FATURADO') {
                const err = new Error('O pedido ainda não está FATURADO no Conta Azul — emita a NF-e antes de gerar o boleto.');
                err.statusCode = 400;
                throw err;
            }
            if (!ped.nfeChave) {
                // Confirma que a NF-e existe de verdade (XML autorizado) e cacheia a chave
                const pedidoController = require('../controllers/pedidoController');
                const pedidoFull = await prisma.pedido.findUnique({ where: { id: ped.id } });
                try {
                    await pedidoController._localizarNotaFiscal(pedidoFull);
                } catch (e) {
                    const err = new Error('NF-e do pedido não encontrada no Conta Azul — emita a nota antes de gerar o boleto.');
                    err.statusCode = 400;
                    throw err;
                }
            }
        }
        if (!['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(parcela.status)) {
            const err = new Error(`Parcela está ${parcela.status} — não dá para emitir boleto.`);
            err.statusCode = 400;
            throw err;
        }

        const existente = await prisma.cobrancaAsaas.findFirst({
            where: { parcelaId, tipo: 'BOLETO', status: 'PENDENTE', ambiente: AMBIENTE },
            orderBy: { createdAt: 'desc' }
        });
        if (existente) return existente;

        const saldo = Math.round((Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0)) * 100) / 100;
        if (saldo <= 0) {
            const err = new Error('Parcela sem saldo em aberto.');
            err.statusCode = 400;
            throw err;
        }

        const conta = parcela.contaReceber;
        const customerId = await asaasService.ensureCustomer(conta.cliente.UUID);

        // Vencimento OFICIAL: o da parcela no Conta Azul (a condição de pagamento é
        // calculada lá no faturamento — a parcela local pode estar defasada).
        // Se divergir, atualiza a parcela local junto.
        let vencOficial = parcela.dataVencimento || null;
        let parcelaCaId = null; // parcela correspondente no CA (p/ apontar a conta ASAAS depois)
        if (conta.pedido?.idVendaContaAzul) {
            try {
                const contaAzulService = require('./contaAzulService');
                const dataVendaStr = new Date(conta.pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                const parcelasCA = await contaAzulService.encontrarParcelasDeVenda(
                    conta.cliente.UUID, conta.pedido.idVendaContaAzul, dataVendaStr
                );
                const caPar = (parcelasCA || []).find(p => (p.numero_parcela || 0) === parcela.numeroParcela)
                    || ((parcelasCA || []).length === 1 ? parcelasCA[0] : null);
                parcelaCaId = caPar?.id || null;
                if (caPar?.data_vencimento) {
                    const vencCA = new Date(caPar.data_vencimento + 'T12:00:00-03:00');
                    const localStr = vencOficial ? new Date(vencOficial).toISOString().split('T')[0] : null;
                    if (caPar.data_vencimento !== localStr) {
                        await prisma.parcela.update({ where: { id: parcelaId }, data: { dataVencimento: vencCA } })
                            .catch(() => { /* melhor esforço */ });
                    }
                    vencOficial = vencCA;
                }
            } catch (e) {
                console.warn('[Asaas] Não consegui conferir o vencimento no CA (uso o local):', e.message);
            }
        }

        // Boleto nunca com vencimento no passado
        const hoje = hojeSP();
        const vencParcela = vencOficial
            ? new Date(vencOficial).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
            : hoje;
        const dueDate = vencParcela < hoje ? hoje : vencParcela;

        // Multa/juros e mensagem do boleto (Configurações → Asaas)
        const cfgBoleto = await obterConfigAsaas();
        const multaJuros = {};
        if (cfgBoleto.multaAtiva && Number(cfgBoleto.multaPercent) > 0) multaJuros.fine = { value: Number(cfgBoleto.multaPercent) };
        if (cfgBoleto.jurosAtivo && Number(cfgBoleto.jurosMesPercent) > 0) multaJuros.interest = { value: Number(cfgBoleto.jurosMesPercent) };

        const numeroPedido = conta.pedido?.numero ? `#${conta.pedido.numero}` : 's/n';
        let payment;
        try {
            const resp = await http.post('/payments', {
                customer: customerId,
                billingType: 'BOLETO',
                value: saldo,
                dueDate,
                description: (preencherMsg(cfgBoleto.msgBoleto, {
                    pedido: numeroPedido,
                    parcela: String(parcela.numeroParcela ?? ''),
                    cliente: conta.cliente?.Nome || '',
                    vencimento: dueDate.split('-').reverse().join('/')
                }) || `Pedido ${numeroPedido} - parcela ${parcela.numeroParcela} - Hardt`).slice(0, 500),
                externalReference: parcelaId,
                ...multaJuros
            });
            payment = resp.data;
        } catch (e) {
            throw erroAsaas(e, 'criar boleto');
        }

        // Linha digitável (se ainda não disponível, fica nula e o app busca depois)
        let linhaDigitavel = null;
        try {
            const li = await http.get(`/payments/${payment.id}/identificationField`);
            linhaDigitavel = li.data?.identificationField || null;
        } catch (_) { /* boleto pode demorar alguns segundos para registrar */ }

        const cobranca = await prisma.cobrancaAsaas.create({
            data: {
                asaasPaymentId: payment.id,
                tipo: 'BOLETO',
                status: 'PENDENTE',
                valor: saldo,
                descricao: `Pedido ${numeroPedido} - parcela ${parcela.numeroParcela}`,
                clienteId: conta.cliente.UUID,
                pedidoId: conta.pedido?.id || null,
                parcelaId,
                boletoUrl: payment.bankSlipUrl || payment.invoiceUrl || null,
                linhaDigitavel,
                vencimento: new Date(dueDate + 'T12:00:00-03:00'),
                criadoPorId: criadoPorId || null,
                ambiente: AMBIENTE
            }
        });

        // Boleto agora é do Asaas → aponta a parcela do CA para a conta financeira ASAAS
        // (senão a venda fica marcada como banco "Conta Azul"). Melhor esforço: falha
        // aqui não pode travar a emissão do boleto.
        if (parcelaCaId) {
            try {
                const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
                const contaAsaasCaId = cfg?.value || null;
                if (contaAsaasCaId) {
                    const contaAzulService = require('./contaAzulService');
                    const det = await contaAzulService.buscarParcelaDetalhe(parcelaCaId);
                    if (det?.conta_financeira?.id !== contaAsaasCaId) {
                        await contaAzulService.atualizarParcela(parcelaCaId, {
                            versao: det.versao,
                            id_conta_financeira: contaAsaasCaId
                        });
                        console.log(`[Asaas] Parcela ${parcelaCaId} do CA apontada para a conta ASAAS.`);
                    }
                }
            } catch (e) {
                console.warn('[Asaas] Não consegui apontar a parcela do CA para a conta ASAAS (boleto emitido normalmente):', e.message);
            }
        }

        return cobranca;
    },

    // ── Completar a linha digitável de um boleto salvo sem ela ──
    completarLinhaDigitavel: async (cobrancaId) => {
        const cobranca = await prisma.cobrancaAsaas.findUnique({ where: { id: cobrancaId } });
        if (!cobranca || cobranca.tipo !== 'BOLETO' || cobranca.linhaDigitavel || !configurado()) return cobranca;
        try {
            const li = await http.get(`/payments/${cobranca.asaasPaymentId}/identificationField`);
            if (li.data?.identificationField) {
                return prisma.cobrancaAsaas.update({
                    where: { id: cobrancaId },
                    data: { linhaDigitavel: li.data.identificationField }
                });
            }
        } catch (_) { /* tenta de novo na próxima consulta */ }
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
            } else if (evento === 'PAYMENT_REFUNDED') {
                // Devolução depois de pago: desfaz as baixas (app + CA) e avisa o faturamento
                const asaasBaixaService = require('./asaasBaixaService');
                await asaasBaixaService.registrarEstorno(cobranca.id);
                resultado = { ok: true, motivo: 'cobrança estornada (baixas desfeitas)' };
            } else if (evento === 'PAYMENT_DELETED') {
                if (cobranca.status !== 'RECEBIDO') {
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
    },

    // ── Configuração (tela Configurações → Asaas) ──
    obterConfig: obterConfigAsaas,

    salvarConfig: async (dados) => {
        const atual = await obterConfigAsaas();
        const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
        const novo = {
            multaAtiva: !!dados.multaAtiva,
            multaPercent: Math.round(num(dados.multaPercent, atual.multaPercent) * 100) / 100,
            jurosAtivo: !!dados.jurosAtivo,
            jurosMesPercent: Math.round(num(dados.jurosMesPercent, atual.jurosMesPercent) * 100) / 100,
            msgBoleto: String(dados.msgBoleto ?? atual.msgBoleto).trim().slice(0, 400),
            pixValidadePadraoDias: [0, 1, 3, 7].includes(num(dados.pixValidadePadraoDias, atual.pixValidadePadraoDias))
                ? num(dados.pixValidadePadraoDias, atual.pixValidadePadraoDias) : atual.pixValidadePadraoDias,
            msgPix: String(dados.msgPix ?? atual.msgPix).trim().slice(0, 400),
            avisosAsaas: !!dados.avisosAsaas,
        };
        // Tetos legais (Código de Defesa do Consumidor): multa 2%, juros 1% ao mês
        if (novo.multaPercent < 0 || novo.multaPercent > 2) {
            const err = new Error('Multa deve ficar entre 0% e 2% (máximo permitido por lei).');
            err.statusCode = 400; throw err;
        }
        if (novo.jurosMesPercent < 0 || novo.jurosMesPercent > 1) {
            const err = new Error('Juros devem ficar entre 0% e 1% ao mês (máximo permitido por lei).');
            err.statusCode = 400; throw err;
        }
        await prisma.appConfig.upsert({
            where: { key: 'asaas_config' },
            create: { key: 'asaas_config', value: novo },
            update: { value: novo }
        });
        return novo;
    },

    // Status completo para a tela de Configurações: chave + webhook + conta CA
    statusCompleto: async () => {
        const status = await asaasService.statusIntegracao();
        let webhookAtivo = false;
        if (status.configurado && !status.erro) {
            try {
                const lista = await http.get('/webhooks');
                webhookAtivo = (lista.data?.data || []).some(w => w.enabled && (w.url || '').includes('/api/asaas/webhook'));
            } catch (_) { /* sem acesso à lista → mostra como não confirmado */ }
        }
        let contaCaVinculada = false;
        try {
            const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
            contaCaVinculada = !!cfg?.value;
        } catch (_) { /* segue false */ }
        return { ...status, webhookAtivo, contaCaVinculada };
    }
};

module.exports = asaasService;
