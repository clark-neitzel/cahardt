/**
 * Abstração de provider de IA (LLM)
 *
 * TROCA DE MODELO (14/10/2026): a OpenAI retira gpt-4o / gpt-4o-mini / gpt-4.1 / gpt-4.1-mini
 * da API em 14/01/2027. O padrão agora é `gpt-6-luna`, que NÃO aceita `max_tokens` nem
 * `temperature` (usa `max_completion_tokens` e temperatura fixa). `parametrosOpenAI()` monta
 * os parâmetros certos por modelo; AI_MODEL=gpt-4o-mini ainda funciona até a data de retirada.
 *
 * Permite trocar o "cérebro" do copiloto sem mexer no resto do código.
 * Escolha via variável de ambiente AI_PROVIDER:
 *   - 'openai'  (padrão) — usa OPENAI_API_KEY e o pacote `openai` (já instalado)
 *   - 'gemini'           — usa GEMINI_API_KEY e o pacote `@google/generative-ai`
 *
 * Modelo configurável via AI_MODEL (default por provider).
 *
 * Uso:
 *   const ai = require('./aiProvider');
 *   const { texto, usage, modelo } = await ai.gerarTexto({
 *     system: 'Você é ...',
 *     mensagens: [{ role: 'user', content: 'Olá' }],
 *     maxTokens: 600,
 *   });
 */

const PROVIDER = (process.env.AI_PROVIDER || 'openai').toLowerCase();

const MODELO_PADRAO = {
    openai: 'gpt-6-luna',
    gemini: 'gemini-1.5-flash',
};

function providerAtual() {
    return PROVIDER;
}

function modeloAtual() {
    return process.env.AI_MODEL || MODELO_PADRAO[PROVIDER] || 'gpt-6-luna';
}

/** Há chave configurada para o provider selecionado? */
function isConfigured() {
    if (PROVIDER === 'gemini') return !!process.env.GEMINI_API_KEY;
    return !!process.env.OPENAI_API_KEY; // openai (padrão)
}

// ─────────────────────────────────────────────
// OpenAI
// ─────────────────────────────────────────────

/** Modelo legado (gpt-4*): aceita max_tokens + temperature. Os demais, não. */
function ehModeloLegadoOpenAI(modelo) {
    return /^gpt-4/i.test(modelo || '');
}

/** Parâmetros de limite/temperatura conforme o modelo. */
function parametrosOpenAI(modelo, { maxTokens, temperature }) {
    if (ehModeloLegadoOpenAI(modelo)) {
        return { temperature: temperature ?? 0.4, max_tokens: maxTokens ?? 600 };
    }
    // Modelos novos: sem temperature (só o padrão é aceito); limite em max_completion_tokens.
    return { max_completion_tokens: maxTokens ?? 600 };
}

async function gerarTextoOpenAI({ system, mensagens, maxTokens, temperature, json, modelo: modeloOpt, signal, _m = {} }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw erroConfig('OPENAI_API_KEY não configurada.');

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });
    const modelo = modeloOpt || modeloAtual();

    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    for (const m of mensagens) msgs.push({ role: m.role, content: m.content });

    const resp = await openai.chat.completions.create({
        model: modelo,
        messages: msgs,
        ...parametrosOpenAI(modelo, { maxTokens, temperature }),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
    }, signal ? { signal } : undefined);

    const escolha = resp.choices[0];
    const conteudo = escolha?.message?.content;
    const recusa = escolha?.message?.refusal || null;
    _m.raciocinio = resp.usage?.completion_tokens_details?.reasoning_tokens ?? null;
    if (!conteudo || !conteudo.trim()) {
        const e = new Error(`IA devolveu resposta vazia (finish_reason=${escolha?.finish_reason || '?'}, ` +
            `raciocinio=${resp.usage?.completion_tokens_details?.reasoning_tokens ?? 0} tokens). Aumente o teto de tokens.`);
        e.finishReason = escolha?.finish_reason || null;
        e.recusa = recusa;
        e.usage = { prompt: resp.usage?.prompt_tokens ?? null, resposta: resp.usage?.completion_tokens ?? null, total: resp.usage?.total_tokens ?? null };
        throw e;
    }

    return {
        texto: conteudo.trim(),
        usage: {
            prompt: resp.usage?.prompt_tokens ?? null,
            resposta: resp.usage?.completion_tokens ?? null,
            total: resp.usage?.total_tokens ?? null,
        },
        modelo,
        provider: 'openai',
        finishReason: escolha?.finish_reason || null,
        recusa,
    };
}

// ─────────────────────────────────────────────
// Gemini (Google) — grátis dentro do free tier
// ─────────────────────────────────────────────
async function gerarTextoGemini({ system, mensagens, maxTokens, temperature, json, modelo: modeloOpt }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw erroConfig('GEMINI_API_KEY não configurada.');

    let GoogleGenerativeAI;
    try {
        ({ GoogleGenerativeAI } = require('@google/generative-ai'));
    } catch {
        throw new Error('Pacote @google/generative-ai não instalado. Rode: npm i @google/generative-ai');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelo = modeloOpt || modeloAtual();
    const model = genAI.getGenerativeModel({
        model: modelo,
        ...(system ? { systemInstruction: system } : {}),
        generationConfig: {
            temperature: temperature ?? 0.4,
            maxOutputTokens: maxTokens ?? 600,
            ...(json ? { responseMimeType: 'application/json' } : {}),
        },
    });

    // Converte histórico para o formato do Gemini (role 'model' em vez de 'assistant')
    const contents = mensagens.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));

    const result = await model.generateContent({ contents });
    const texto = result.response.text().trim();
    const u = result.response.usageMetadata || {};

    return {
        texto,
        usage: {
            prompt: u.promptTokenCount ?? null,
            resposta: u.candidatesTokenCount ?? null,
            total: u.totalTokenCount ?? null,
        },
        modelo,
        provider: 'gemini',
    };
}


// ─────────────────────────────────────────────
// Visão (imagem + texto) — checklist de veículo por foto
// ─────────────────────────────────────────────

/** Modelo para visão: AI_MODEL_VISAO > AI_MODEL > padrão. */
function modeloVisao() {
    return process.env.AI_MODEL_VISAO || modeloAtual();
}

/**
 * Analisa imagens com o provider configurado. Sempre com timeout (padrão 25 s).
 * @param {Object} opts
 * @param {string}  opts.system
 * @param {string}  opts.texto
 * @param {Array}   opts.imagens   [{ base64, mime }]
 * @param {number} [opts.maxTokens] (use 2000+: modelos novos gastam tokens com raciocínio)
 * @param {boolean}[opts.json]
 * @param {number} [opts.timeoutMs]
 */
async function analisarImagemInterno({ system, texto, imagens = [], maxTokens = 2500, json = true, timeoutMs = 25000, _m = {} }) {
    if (PROVIDER === 'gemini') throw new Error('Visão não suportada para o provider gemini neste módulo.');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw erroConfig('OPENAI_API_KEY não configurada.');

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
    const modelo = modeloVisao();

    const content = [{ type: 'text', text: texto }];
    for (const img of imagens) {
        content.push({
            type: 'image_url',
            image_url: { url: `data:${img.mime || 'image/jpeg'};base64,${img.base64}`, detail: 'auto' },
        });
    }
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    msgs.push({ role: 'user', content });

    const resp = await openai.chat.completions.create({
        model: modelo,
        messages: msgs,
        ...parametrosOpenAI(modelo, { maxTokens, temperature: 0.2 }),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
    });

    const escolha = resp.choices[0];
    const conteudo = escolha?.message?.content;
    _m.raciocinio = resp.usage?.completion_tokens_details?.reasoning_tokens ?? null;
    if (!conteudo || !conteudo.trim()) {
        const e = new Error(`IA devolveu resposta vazia (finish_reason=${escolha?.finish_reason || '?'}, ` +
            `raciocinio=${resp.usage?.completion_tokens_details?.reasoning_tokens ?? 0} tokens).`);
        e.usage = { prompt: resp.usage?.prompt_tokens ?? null, resposta: resp.usage?.completion_tokens ?? null, total: resp.usage?.total_tokens ?? null };
        throw e;
    }
    return {
        texto: conteudo.trim(),
        usage: {
            prompt: resp.usage?.prompt_tokens ?? null,
            resposta: resp.usage?.completion_tokens ?? null,
            total: resp.usage?.total_tokens ?? null,
        },
        modelo,
        provider: 'openai',
    };
}

/**
 * Gera texto com o provider configurado.
 * @param {Object} opts
 * @param {string}  opts.system     Instrução de sistema (opcional)
 * @param {Array}   opts.mensagens  [{ role: 'user'|'assistant', content }]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {boolean}[opts.json]      Força saída JSON
 */
async function gerarTextoInterno(opts) {
    const prov = (opts && opts.provedor) || PROVIDER; // `provedor`/`modelo` por chamada são opcionais
    if (prov === 'anthropic') {
        const e = new Error('Provedor Claude ainda não está disponível (precisa da chave ANTHROPIC_API_KEY).');
        e.codigo = 'PROVEDOR_INDISPONIVEL';
        throw e;
    }
    if (prov === 'gemini') return gerarTextoGemini(opts);
    return gerarTextoOpenAI(opts); // openai (padrão)
}

/** Há chave para o provedor pedido (openai | gemini | anthropic)? */
function isConfiguredProvedor(prov) {
    const p = String(prov || PROVIDER).toLowerCase();
    if (p === 'gemini') return !!process.env.GEMINI_API_KEY;
    if (p === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
    return !!process.env.OPENAI_API_KEY;
}

/**
 * Geração com STREAMING (só OpenAI). Chama `onTexto(delta)` a cada pedaço.
 * Resolve com { texto, usage, modelo, provider, finishReason, recusa }.
 * `signal` (AbortSignal) cancela a chamada; nesse caso lança com name 'AbortError'.
 * Lança com .finishReason/.recusa/.usage quando vier vazio.
 */
async function gerarTextoStreamInterno({ system, mensagens, maxTokens, json, modelo: modeloOpt, provedor, signal, onTexto, timeoutMs = 120000, _m = {} }) {
    const prov = provedor || PROVIDER;
    if (prov === 'anthropic') { const e = new Error('Provedor Claude ainda não está disponível.'); e.codigo = 'PROVEDOR_INDISPONIVEL'; throw e; }
    if (prov !== 'openai') { const e = new Error('Este provedor não suporta streaming.'); e.codigo = 'STREAM_NAO_SUPORTADO'; throw e; }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw erroConfig('OPENAI_API_KEY não configurada.');

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
    const modelo = modeloOpt || modeloAtual();

    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    for (const m of mensagens) msgs.push({ role: m.role, content: m.content });

    const stream = await openai.chat.completions.create({
        model: modelo,
        messages: msgs,
        ...parametrosOpenAI(modelo, { maxTokens }),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        stream: true,
        stream_options: { include_usage: true },
    }, signal ? { signal } : undefined);

    let texto = '', finishReason = null, recusa = '', usage = null;
    for await (const chunk of stream) {
        const ch = chunk.choices && chunk.choices[0];
        if (ch) {
            const d = ch.delta || {};
            if (d.content) { texto += d.content; if (onTexto) { try { onTexto(d.content); } catch { /* callback nunca derruba a geração */ } } }
            if (d.refusal) recusa += d.refusal;
            if (ch.finish_reason) finishReason = ch.finish_reason;
        }
        if (chunk.usage) usage = chunk.usage;
    }
    const u = {
        prompt: usage?.prompt_tokens ?? null,
        resposta: usage?.completion_tokens ?? null,
        total: usage?.total_tokens ?? null,
    };
    _m.raciocinio = usage?.completion_tokens_details?.reasoning_tokens ?? null;
    if (!texto.trim()) {
        const e = new Error(`IA devolveu resposta vazia (finish_reason=${finishReason || '?'}).`);
        e.finishReason = finishReason; e.recusa = recusa || null; e.usage = u;
        throw e;
    }
    return { texto: texto.trim(), usage: u, modelo, provider: 'openai', finishReason, recusa: recusa || null };
}

// ─────────────────────────────────────────────
// Registro de uso (quanto custou / quem / onde) — tabela ia_uso_logs
// ─────────────────────────────────────────────
// Fire-and-forget: NUNCA espera, NUNCA lança, NUNCA entra em $transaction. Se a tabela estiver
// indisponível a IA segue igual (só loga [IaUso]). Não grava prompt nem resposta.
const ORIGEM_PADRAO = 'OUTRO';
const SEM_REGISTRO = new Set(['PROVEDOR_INDISPONIVEL', 'STREAM_NAO_SUPORTADO', 'CONFIG_AUSENTE']);
const cortar = (v, n) => (v == null ? null : String(v).slice(0, n));

/** Erro de configuração (chave ausente): não é falha do provedor — não entra no registro de uso. */
function erroConfig(msg) { const e = new Error(msg); e.codigo = 'CONFIG_AUSENTE'; return e; }

function registrarUso({ uso, provedor, modelo, usage, raciocinio, ok, erroCodigo, duracaoMs }) {
    try {
        Promise.resolve().then(async () => {
            const prisma = require('../config/database');
            const { lerPrecos, custoUsd, cotacaoEfetiva } = require('./iaCustoService');
            const u = uso && typeof uso === 'object' ? uso : {};
            const precos = await lerPrecos();
            const custo = await custoUsd(modelo, usage, precos);
            // cotação sem esperar rede (manual > automática salva > nada); estimada de 5.0 não é gravada
            const cotacao = await cotacaoEfetiva(precos);
            const custoBrl = custo != null && !cotacao.estimada ? Number((custo * cotacao.valor).toFixed(4)) : null;
            const gatilho = cortar(u.gatilho, 40);
            const automatico = u.automatico === true || (gatilho ? gatilho.startsWith('AUTOMATICO') : false);
            let usuarioNome = cortar(u.usuarioNome, 120);
            if (!usuarioNome && u.usuarioId) {
                try { usuarioNome = (await prisma.vendedor.findUnique({ where: { id: String(u.usuarioId) }, select: { nome: true } }))?.nome || null; } catch { /* snapshot opcional */ }
            }
            await prisma.iaUsoLog.create({
                data: {
                    origem: cortar(u.origem, 40) || ORIGEM_PADRAO,
                    gatilho, automatico,
                    provedor: String(provedor || 'openai'), modelo: String(modelo || '?'),
                    tokensPrompt: usage?.prompt ?? null, tokensResposta: usage?.resposta ?? null,
                    tokensRaciocinio: raciocinio ?? null, tokensTotal: usage?.total ?? null,
                    custoUsd: custo, custoBrl,
                    usuarioId: u.usuarioId ? String(u.usuarioId) : null, usuarioNome,
                    referencia: cortar(u.referencia, 120),
                    ok: !!ok, erroCodigo: cortar(erroCodigo, 60), duracaoMs: duracaoMs ?? null,
                },
            });
        }).catch((e) => console.error('[IaUso] falha ao registrar (IA não foi afetada):', e.message));
    } catch (e) {
        console.error('[IaUso] falha ao registrar (IA não foi afetada):', e && e.message);
    }
}

/** Envolve uma chamada de IA: mede, registra e devolve o MESMO resultado/erro da função original. */
async function comRegistro(fn, opts, { provedor, modelo }) {
    const m = {};
    const t0 = Date.now();
    try {
        const r = await fn({ ...opts, _m: m });
        registrarUso({ uso: opts && opts.uso, provedor: r.provider || provedor, modelo: r.modelo || modelo, usage: r.usage, raciocinio: m.raciocinio, ok: true, duracaoMs: Date.now() - t0 });
        return r;
    } catch (e) {
        if (!(e && SEM_REGISTRO.has(e.codigo))) {
            registrarUso({ uso: opts && opts.uso, provedor, modelo, usage: e && e.usage, raciocinio: m.raciocinio, ok: false, erroCodigo: (e && (e.codigo || e.finishReason || e.code || e.status || e.name)) || 'ERRO', duracaoMs: Date.now() - t0 });
        }
        throw e;
    }
}

/** Parâmetro opcional `uso: { origem, gatilho?, usuarioId?, usuarioNome?, referencia? }` identifica quem/onde. */
function gerarTexto(opts) {
    return comRegistro(gerarTextoInterno, opts, { provedor: (opts && opts.provedor) || PROVIDER, modelo: (opts && opts.modelo) || modeloAtual() });
}
function gerarTextoStream(opts) {
    return comRegistro(gerarTextoStreamInterno, opts, { provedor: (opts && opts.provedor) || PROVIDER, modelo: (opts && opts.modelo) || modeloAtual() });
}
function analisarImagem(opts) {
    return comRegistro(analisarImagemInterno, opts, { provedor: PROVIDER, modelo: modeloVisao() });
}

module.exports = {
    gerarTexto, gerarTextoStream, analisarImagem, isConfigured, isConfiguredProvedor,
    providerAtual, modeloAtual, modeloVisao, parametrosOpenAI, registrarUso,
};
