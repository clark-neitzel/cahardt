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
 *    (`texto_longo`) e o cliente não recebe NADA. Mensagem longa (pedido grande) é
 *    DIVIDIDA em partes numeradas (dividirEmPartes/enviarEmPartes, referencias
 *    `<base>-p1..pN`); o corte em `cortarTexto` é só rede de segurança.
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

// Erros que valem retry — a mensagem NÃO pode ser jogada fora por algo passageiro.
// Inclui `sem_url`/`sem_chave` de propósito: se o deploy subir antes da env estar
// configurada no EasyPanel, tudo fica na fila e sai sozinho quando a chave chegar,
// em vez de perder pedido/código/cobrança em silêncio.
const CODIGOS_REAGENDAR = [
    'sem_url', 'sem_chave',                                            // env ainda não configurada
    'limite_por_hora', 'fila_cheia',                                   // 429
    'contato_sem_conversa', 'contato_nunca_escreveu', 'fora_da_janela', // 403 (modo de emergência)
    'zapi_falhou',                                                      // 502
    'chave_invalida',                                                   // 401 (chave errada/rotacionada)
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


const LIMITE_PARTE = 1900; // margem sob os 2000 do bot (marcadores "(k/N)" + acentos/emoji)
const MARCADOR_MAX = '\n\n*(99/99)*'; // reserva do pior caso ao empacotar

const marcador = (k, n) => `*(${k}/${n})*`;

/**
 * Divide uma mensagem LONGA (pedido grande) em partes que cabem no limite do bot,
 * SEM quebrar um item no meio e SEM perder nada (itens, total, condição, obs).
 * Função PURA.
 *
 *   texto de hoje = cabecalho + '\n' + itens.join('\n\n') + '\n' + rodape
 *
 * Se esse texto cabe em `limite`, devolve [texto] — IDÊNTICO ao de hoje, sem marcador.
 * Senão:
 *   parte 1      = cabecalho + itens + *(1/N)*
 *   intermediária= `<tituloContinuacao> — continuação *(k/N)*` + itens
 *   última       = continuação + itens + rodape + *(N/N)*
 * Nada é perdido: texto > limite SEMPRE vira multi-parte; se o rodapé não cabe junto dos últimos
 * itens vai em parte própria; se o rodapé sozinho estoura (Obs gigante), `rodapeEstr`
 * ({ base, obs, rotuloObs, fim }) permite quebrar a Obs entre partes em limites de linha/palavra
 * (Total/Condição na parte onde o rodapé começa; `fim` = despedida, na última).
 */
const dividirEmPartes = ({ cabecalho = '', itens = [], rodape = '', rodapeEstr = null, tituloContinuacao = '', limite = LIMITE_PARTE }) => {
    const cab = String(cabecalho);
    const lista = (itens || []).map(String);
    const textoUnico = `${cab}\n${lista.join('\n\n')}\n${rodape}`;
    if (textoUnico.length <= limite) return [textoUnico];

    const prefixoPrimeira = `${cab}\n`;
    const prefixoCont = (k, n) => `${tituloContinuacao ? `${tituloContinuacao} — ` : ''}continuação ${marcador(k, n)}\n\n`;
    const reservaCont = prefixoCont(99, 99).length;
    const capDe = (idx) => (idx === 0 ? limite - prefixoPrimeira.length : limite - reservaCont) - MARCADOR_MAX.length;
    const montar = (corpos) => {
        const n = corpos.length;
        return corpos.map((c, idx) => `${idx === 0 ? prefixoPrimeira : prefixoCont(idx + 1, n)}${c}\n\n${marcador(idx + 1, n)}`);
    };
    // Empacota unidades (blocos indivisíveis) em partes; devolve array de { itens, tam }.
    const empacotar = (unidades) => {
        const grupos = [];
        let atual = [];
        let tam = 0;
        for (const u of unidades) {
            const custo = u.length + (atual.length ? 2 : 0);
            if (atual.length && tam + custo > capDe(grupos.length)) {
                grupos.push({ itens: atual, tam });
                atual = [];
                tam = 0;
            }
            tam += u.length + (atual.length ? 2 : 0);
            atual.push(u);
        }
        if (atual.length) grupos.push({ itens: atual, tam });
        return grupos;
    };

    // 1ª tentativa: o último item vai COLADO ao rodapé (despedida/total nunca ficam sozinhos).
    if (lista.length) {
        const unidades = lista.slice(0, -1);
        unidades.push(`${lista[lista.length - 1]}\n${rodape}`);
        const grupos = empacotar(unidades);
        const partes = montar(grupos.map(g => g.itens.join('\n\n')));
        if (partes.every(t => t.length <= limite)) return partes;
    }

    // 2ª tentativa: itens sozinhos; o rodapé vai junto da última parte se couber, senão em parte(s) própria(s).
    const grupos = empacotar(lista);
    const corpos = grupos.map(g => g.itens.join('\n\n'));
    const ultimo = grupos.length - 1;
    if (ultimo >= 0 && grupos[ultimo].tam + 2 + rodape.length <= capDe(ultimo)) {
        corpos[ultimo] = `${corpos[ultimo]}\n\n${rodape}`;
        return montar(corpos);
    }

    // Rodapé em parte própria. Cabe inteiro numa parte de continuação?
    const idxRod = corpos.length;
    if (rodape.length <= capDe(Math.max(idxRod, 0))) {
        corpos.push(rodape);
        return montar(corpos);
    }

    // Rodapé gigante (obs enorme): quebra a Obs em limites de linha/palavra. Total/Condição ficam
    // na parte em que o rodapé começa; a despedida (fim) no fim da última.
    const est = rodapeEstr || { base: rodape, obs: '', rotuloObs: '', fim: '' };
    const obs = String(est.obs || '');
    const fim = String(est.fim || '');
    const cabecaObs = est.base + (obs ? `\n\n${est.rotuloObs}` : '');
    const pedacos = [];
    let resto = obs.trim();
    let idx = idxRod;
    let primeiro = true;
    while (true) {
        const reserva = primeiro ? cabecaObs.length : 0;
        const cap = Math.max(capDe(idx) - reserva, 1);
        if (resto.length + fim.length <= cap) { pedacos.push({ txt: resto, cabeca: primeiro, ultimo: true }); break; }
        // Se o resto cabe em `cap` mas não junto da despedida, corta mais cedo (reserva o `fim`
        // para a próxima parte) — senão a última parte estoura o limite.
        const lim = Math.max(resto.length <= cap ? cap - fim.length : cap, 1);
        let corte = lim;
        const janela = resto.slice(0, lim + 1);
        const quebra = Math.max(janela.lastIndexOf('\n'), janela.lastIndexOf(' '));
        if (quebra > 0) corte = quebra;
        // corte duro nunca parte um par surrogate (emoji): recua 1 se cair entre as duas metades
        else if (corte > 1) { const c = resto.charCodeAt(corte - 1); if (c >= 0xD800 && c <= 0xDBFF) corte -= 1; }
        // se o corte cai no meio de uma palavra (não há espaço/linha na janela), corta duro: caso degenerado
        const txt = resto.slice(0, corte).trimEnd();
        pedacos.push({ txt, cabeca: primeiro, ultimo: false });
        resto = resto.slice(corte).trimStart();
        primeiro = false;
        idx += 1;
        if (!resto) { pedacos[pedacos.length - 1].ultimo = true; break; }
    }
    pedacos.forEach(pc => {
        let c = (pc.cabeca ? cabecaObs : '') + pc.txt;
        if (pc.ultimo) c += fim;
        corpos.push(c);
    });
    return montar(corpos);
};

/** Grava uma parte como PENDENTE sem tentar enviar (espera a anterior sair). */
const enfileirar = async ({ telefone, texto, tipo, origem, referencia, proximaEm }) => registrar({
    telefone, texto: cortarTexto(texto), tipo: TIPOS.includes(tipo) ? tipo : 'outro', origem, referencia,
    status: 'PENDENTE', tentativas: 0, proximaEm,
    codigoErro: 'aguardando_parte_anterior',
    ultimoErro: 'Parte seguinte de uma mensagem em várias partes — sai depois da anterior',
});

const RE_PARTE = /^(.*)-p(\d+)$/;

const botWhatsappService = {
    TIPOS,
    LIMITE_PARTE,
    dividirEmPartes,
    // Exportado (só adição) para o selo do WhatsApp do cliente saber, a partir de UMA
    // fonte só, quais códigos são falha passageira/nossa — e portanto nunca podem
    // acusar o número do cliente. Uma cópia da lista aqui viraria mentira com o tempo.
    CODIGOS_REAGENDAR,
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
     * Envia uma mensagem que pode vir em VÁRIAS partes (pedido grande), em ordem.
     * 1 parte  -> igual a `enviar` (referencia = referenciaBase, sem sufixo).
     * N partes -> referencias `<base>-p1..pN`, sequencial (nunca em paralelo).
     * Parte reagendada: as seguintes NÃO são postadas — vão PENDENTES pra fila,
     * que só libera a parte k depois que a k-1 saiu (ver processarFila).
     * Erro definitivo numa parte: para e devolve ok:false ("parte k/N: ...").
     * Retorna { ok, reagendado, status, motivo, codigo, partes:[resultado por parte] } — nunca lança.
     */
    enviarEmPartes: async ({ telefone, partes, tipo, origem, referenciaBase }) => {
        const lista = (partes || []).filter(p => p && String(p).trim());
        if (!lista.length) return { ok: false, codigo: 'texto_vazio', motivo: 'Mensagem vazia', partes: [] };

        if (lista.length === 1) {
            const r = await botWhatsappService.enviar({ telefone, texto: lista[0], tipo, origem, referencia: referenciaBase });
            return { ...r, partes: [r] };
        }

        const n = lista.length;
        const resultados = [];
        let reagendado = false;
        for (let i = 0; i < n; i++) {
            const k = i + 1;
            const referencia = `${referenciaBase}-p${k}`;
            if (reagendado) {
                // Uma parte anterior ficou na fila: esta espera na fila também (ordem garantida).
                const phone = normalizarTelefone(telefone);
                const quando = new Date(Date.now() + BACKOFF_MIN[0] * 60000 + (k - 1) * 1000);
                await enfileirar({ telefone: phone, texto: lista[i], tipo, origem, referencia, proximaEm: quando });
                resultados.push({ ok: false, reagendado: true, codigo: 'aguardando_parte_anterior' });
                continue;
            }
            const r = await botWhatsappService.enviar({ telefone, texto: lista[i], tipo, origem, referencia });
            resultados.push(r);
            if (r.ok) continue;
            if (r.reagendado) { reagendado = true; continue; }
            return {
                ok: false, reagendado: false, codigo: r.codigo,
                motivo: `parte ${k}/${n}: ${r.motivo}`, partes: resultados,
            };
        }

        const todasDuplicadas = resultados.every(r => r.ok && r.status === 'duplicado');
        return {
            ok: true, reagendado,
            status: todasDuplicadas ? 'duplicado' : 'enviado',
            partes: resultados,
        };
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
            // Mensagem em várias partes: a parte k só sai depois que a k-1 (mesma base)
            // deixou de estar PENDENTE. ERRO também libera (a k-1 desistiu; não trava o resto).
            const mParte = RE_PARTE.exec(item.referencia || '');
            if (mParte && Number(mParte[2]) > 1) {
                const anterior = await prisma.botWhatsappEnvio.findFirst({
                    where: { origem: item.origem, referencia: `${mParte[1]}-p${Number(mParte[2]) - 1}`, status: 'PENDENTE' },
                    select: { id: true },
                });
                if (anterior) continue;
            }
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
