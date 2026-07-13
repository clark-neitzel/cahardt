/**
 * Cliente da API de envio do bot da Ana (WhatsApp da Hardt via Z-API).
 * Contrato: integracao-envio-bot.md v2.0.0 (repo do bot).
 * Substitui o BotConversa como ÚNICO transporte de WhatsApp do sistema.
 *
 * Tudo que o sistema manda passa por aqui. Quem monta a mensagem é o
 * webhookService (e os services que chamam ele) — este arquivo só entrega.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REGRAS DO CONTRATO QUE ESTE ARQUIVO PRECISA HONRAR:
 *
 * 1. `tipo` OBRIGATÓRIO, valores fechados (TIPOS abaixo). É o que o bot audita
 *    por fluxo — se um tipo destoar do combinado, o dono corta SÓ aquele fluxo.
 *    Valor inválido vira 'outro' e fica marcado como não-classificado lá.
 *
 * 2. `referencia` ÚNICA POR MENSAGEM = idempotência do lado do bot. Repetir a
 *    mesma origem+referencia NÃO reenvia (devolve `duplicado`). Por isso:
 *      - retry SEMPRE com a MESMA referencia (é o que protege de duplicar);
 *      - reenvio MANUAL (botão) e código de verificação precisam de referencia
 *        NOVA a cada vez — senão o bot bloqueia como duplicata e o cliente
 *        nunca recebe o segundo código. Ver `referenciaUnica()`.
 *
 * 3. Só texto, 1 destinatário, máx. 2000 caracteres. Acima disso o bot RECUSA
 *    (`texto_longo`) e o cliente não recebe NADA — por isso cortamos aqui antes
 *    de mandar, em vez de deixar a mensagem inteira ser perdida.
 *
 * 4. O carimbo "🤖 *Mensagem automática*" é aplicado PELO BOT. Não mandar.
 *
 * 5. NUNCA usar para campanha/promoção/lembrete de recompra/lista fria. Só
 *    mensagem transacional provocada por um ato concreto do cliente. É o acordo
 *    que sustenta a liberação do primeiro contato — quebrá-lo derruba o número.
 * ─────────────────────────────────────────────────────────────────────────
 */
const prisma = require('../config/database');

const LIMITE_TEXTO = 2000;
const TIMEOUT_MS = 30000; // folgado de propósito: o bot espaça os envios (5s) e a chamada espera na fila

// Valores fechados do contrato (§4). Qualquer outro vira 'outro' no bot.
const TIPOS = ['verificacao', 'pedido', 'entrega', 'cobranca', 'interno', 'outro'];

// Erros que valem retry: teto/fila (429) e o modo de emergência do bot (403).
// O 403 NÃO é o estado normal — se aparecer, o dono ligou o modo restrito (§6).
const CODIGOS_REAGENDAR = [
    'limite_por_hora', 'fila_cheia',                                   // 429
    'contato_sem_conversa', 'contato_nunca_escreveu', 'fora_da_janela', // 403 (modo de emergência)
    'zapi_falhou',                                                      // 502
];

const MAX_TENTATIVAS = 6;
// Backoff: 5min, 15min, 45min, 2h, 6h — dá tempo do teto da hora virar e do
// dono desligar o modo de emergência, sem desistir da cobrança do dia.
const BACKOFF_MIN = [5, 15, 45, 120, 360];

const getConfig = () => ({
    url: (process.env.BOT_WHATSAPP_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.BOT_WHATSAPP_API_KEY || '',
});

/** Só dígitos, com DDI 55. Devolve null se não der pra usar. */
const normalizarTelefone = (raw) => {
    let phone = String(raw || '').replace(/\D/g, '');
    if (phone.length < 10) return null;
    if (!phone.startsWith('55')) phone = '55' + phone;
    return phone;
};

/**
 * Corta o texto em 2000 caracteres SEM cortar no meio de uma linha — o bot
 * recusa acima disso e o cliente ficaria sem mensagem nenhuma.
 */
const cortarTexto = (texto) => {
    const t = String(texto || '');
    if (t.length <= LIMITE_TEXTO) return t;
    const AVISO = '\n\n_(mensagem encurtada)_';
    const corte = t.slice(0, LIMITE_TEXTO - AVISO.length);
    const ultimaQuebra = corte.lastIndexOf('\n');
    const base = ultimaQuebra > LIMITE_TEXTO / 2 ? corte.slice(0, ultimaQuebra) : corte;
    return base + AVISO;
};

/**
 * Referência para mensagem que PODE legitimamente sair mais de uma vez
 * (reenvio manual pelo botão, 2º código de verificação). A idempotência do bot
 * é por origem+referencia — sem o sufixo, o reenvio viraria `duplicado` e o
 * cliente nunca receberia.
 */
const referenciaUnica = (base) => `${base}-${Date.now().toString(36)}`;

/** Grava a tentativa (enviada ou não) — auditoria local + fila de reenvio. */
const registrar = async (dados) => {
    try {
        return await prisma.botWhatsappEnvio.create({ data: dados });
    } catch (e) {
        console.error('[BotWhatsapp] Falha ao registrar envio:', e.message);
        return null;
    }
};

/** POST /api/integracao/enviar — uma tentativa, sem fila. */
const postEnviar = async ({ telefone, texto, tipo, origem, referencia }) => {
    const { url, apiKey } = getConfig();
    if (!url) return { ok: false, codigo: 'sem_url', erro: 'BOT_WHATSAPP_URL não configurada' };
    if (!apiKey) return { ok: false, codigo: 'sem_chave', erro: 'BOT_WHATSAPP_API_KEY não configurada' };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const resp = await fetch(`${url}/api/integracao/enviar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ telefone, texto, tipo, origem, referencia }),
            signal: ctrl.signal,
        });

        let corpo = null;
        try { corpo = await resp.json(); } catch { /* corpo vazio/não-JSON */ }

        if (!resp.ok) {
            return {
                ok: false,
                codigo: corpo?.codigo || `http_${resp.status}`,
                erro: corpo?.erro || `HTTP ${resp.status}`,
            };
        }
        // status: 'enviado' | 'duplicado' — duplicado NÃO é erro (já saiu antes).
        return { ok: true, status: corpo?.status || 'enviado', corpo };
    } catch (e) {
        const abortou = e.name === 'AbortError';
        return {
            ok: false,
            codigo: abortou ? 'timeout' : 'rede',
            erro: abortou ? `Sem resposta do bot em ${TIMEOUT_MS / 1000}s` : e.message,
        };
    } finally {
        clearTimeout(t);
    }
};

const botWhatsappService = {
    TIPOS,
    referenciaUnica,
    normalizarTelefone,

    /**
     * Envia uma mensagem pelo WhatsApp da Hardt.
     * Retorna { ok, status, motivo, codigo } — nunca lança.
     *
     * Falha reagendável (429 do teto, 403 do modo de emergência, 502 da Z-API,
     * rede) entra na FILA e é reenviada pelo worker com a MESMA referencia.
     * Nesses casos devolve { ok: false, reagendado: true } — o chamador deve
     * tratar como "vai sair depois", não como erro definitivo.
     */
    enviar: async ({ telefone, texto, tipo, origem, referencia }) => {
        const phone = normalizarTelefone(telefone);
        if (!phone) return { ok: false, codigo: 'telefone_invalido', motivo: 'Telefone celular inválido ou ausente' };
        if (!texto || !String(texto).trim()) return { ok: false, codigo: 'texto_vazio', motivo: 'Mensagem vazia' };

        const tipoFinal = TIPOS.includes(tipo) ? tipo : 'outro';
        if (!TIPOS.includes(tipo)) {
            console.warn(`[BotWhatsapp] tipo "${tipo}" desconhecido (origem: ${origem}) — indo como 'outro'`);
        }
        const textoFinal = cortarTexto(texto);

        const r = await postEnviar({ telefone: phone, texto: textoFinal, tipo: tipoFinal, origem, referencia });

        if (r.ok) {
            await registrar({
                telefone: phone, texto: textoFinal, tipo: tipoFinal, origem, referencia,
                status: r.status === 'duplicado' ? 'DUPLICADO' : 'ENVIADO',
                tentativas: 1, enviadoEm: new Date(),
            });
            console.log(`[BotWhatsapp] ${r.status} · ${tipoFinal} · ${phone} · ${referencia || '(sem ref)'}`);
            return { ok: true, status: r.status };
        }

        const reagendar = CODIGOS_REAGENDAR.includes(r.codigo) || r.codigo === 'rede' || r.codigo === 'timeout';

        await registrar({
            telefone: phone, texto: textoFinal, tipo: tipoFinal, origem, referencia,
            status: reagendar ? 'PENDENTE' : 'ERRO',
            tentativas: 1,
            codigoErro: r.codigo,
            ultimoErro: r.erro,
            proximaEm: reagendar ? new Date(Date.now() + BACKOFF_MIN[0] * 60000) : null,
        });

        console.error(`[BotWhatsapp] falhou (${r.codigo}) · ${tipoFinal} · ${phone} · ${r.erro}${reagendar ? ' — reagendado' : ''}`);
        return { ok: false, codigo: r.codigo, motivo: r.erro, reagendado: reagendar };
    },

    /**
     * Worker: reprocessa a fila de envios pendentes.
     * Roda em série (o bot já espaça em 5s; rajada daqui não ajudaria e o teto
     * de 200/h é dele). Chamado pelo scheduler.
     */
    processarFila: async () => {
        const agora = new Date();
        const pendentes = await prisma.botWhatsappEnvio.findMany({
            where: { status: 'PENDENTE', proximaEm: { lte: agora } },
            orderBy: { proximaEm: 'asc' },
            take: 50,
        });
        if (!pendentes.length) return { processados: 0 };

        console.log(`[BotWhatsapp] fila: ${pendentes.length} pendente(s)`);
        let enviados = 0;

        for (const item of pendentes) {
            // MESMA referencia de propósito: se a 1ª tentativa saiu e a resposta
            // se perdeu, o bot devolve `duplicado` e nada é enviado em dobro.
            const r = await postEnviar({
                telefone: item.telefone, texto: item.texto,
                tipo: item.tipo, origem: item.origem, referencia: item.referencia,
            });

            if (r.ok) {
                await prisma.botWhatsappEnvio.update({
                    where: { id: item.id },
                    data: {
                        status: r.status === 'duplicado' ? 'DUPLICADO' : 'ENVIADO',
                        tentativas: item.tentativas + 1,
                        enviadoEm: new Date(), proximaEm: null, codigoErro: null, ultimoErro: null,
                    },
                });
                enviados++;
                continue;
            }

            const tentativas = item.tentativas + 1;
            const desistir = tentativas >= MAX_TENTATIVAS
                || !(CODIGOS_REAGENDAR.includes(r.codigo) || r.codigo === 'rede' || r.codigo === 'timeout');

            await prisma.botWhatsappEnvio.update({
                where: { id: item.id },
                data: {
                    status: desistir ? 'ERRO' : 'PENDENTE',
                    tentativas,
                    codigoErro: r.codigo,
                    ultimoErro: r.erro,
                    proximaEm: desistir ? null
                        : new Date(Date.now() + (BACKOFF_MIN[Math.min(tentativas - 1, BACKOFF_MIN.length - 1)]) * 60000),
                },
            });
        }

        console.log(`[BotWhatsapp] fila: ${enviados}/${pendentes.length} enviado(s)`);
        return { processados: pendentes.length, enviados };
    },

    /** GET /api/integracao/status — health-check (usado na tela de Configurações). */
    status: async () => {
        const { url, apiKey } = getConfig();
        if (!url || !apiKey) {
            return { ok: false, configurado: false, motivo: 'BOT_WHATSAPP_URL/BOT_WHATSAPP_API_KEY não configuradas na env' };
        }
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        try {
            const resp = await fetch(`${url}/api/integracao/status`, {
                headers: { 'x-api-key': apiKey },
                signal: ctrl.signal,
            });
            const corpo = await resp.json().catch(() => null);
            if (!resp.ok) {
                return { ok: false, configurado: true, motivo: corpo?.erro || `HTTP ${resp.status}`, codigo: corpo?.codigo };
            }
            return { ok: true, configurado: true, ...corpo };
        } catch (e) {
            return { ok: false, configurado: true, motivo: e.name === 'AbortError' ? 'Bot não respondeu' : e.message };
        } finally {
            clearTimeout(t);
        }
    },
};

module.exports = botWhatsappService;
