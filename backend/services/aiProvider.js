/**
 * Abstração de provider de IA (LLM)
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
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
};

function providerAtual() {
    return PROVIDER;
}

function modeloAtual() {
    return process.env.AI_MODEL || MODELO_PADRAO[PROVIDER] || 'gpt-4o-mini';
}

/** Há chave configurada para o provider selecionado? */
function isConfigured() {
    if (PROVIDER === 'gemini') return !!process.env.GEMINI_API_KEY;
    return !!process.env.OPENAI_API_KEY; // openai (padrão)
}

// ─────────────────────────────────────────────
// OpenAI
// ─────────────────────────────────────────────
async function gerarTextoOpenAI({ system, mensagens, maxTokens, temperature, json }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.');

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });
    const modelo = modeloAtual();

    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    for (const m of mensagens) msgs.push({ role: m.role, content: m.content });

    const resp = await openai.chat.completions.create({
        model: modelo,
        messages: msgs,
        temperature: temperature ?? 0.4,
        max_tokens: maxTokens ?? 600,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
    });

    return {
        texto: resp.choices[0].message.content.trim(),
        usage: {
            prompt: resp.usage?.prompt_tokens ?? null,
            resposta: resp.usage?.completion_tokens ?? null,
            total: resp.usage?.total_tokens ?? null,
        },
        modelo,
        provider: 'openai',
    };
}

// ─────────────────────────────────────────────
// Gemini (Google) — grátis dentro do free tier
// ─────────────────────────────────────────────
async function gerarTextoGemini({ system, mensagens, maxTokens, temperature, json }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

    let GoogleGenerativeAI;
    try {
        ({ GoogleGenerativeAI } = require('@google/generative-ai'));
    } catch {
        throw new Error('Pacote @google/generative-ai não instalado. Rode: npm i @google/generative-ai');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelo = modeloAtual();
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

/**
 * Gera texto com o provider configurado.
 * @param {Object} opts
 * @param {string}  opts.system     Instrução de sistema (opcional)
 * @param {Array}   opts.mensagens  [{ role: 'user'|'assistant', content }]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {boolean}[opts.json]      Força saída JSON
 */
async function gerarTexto(opts) {
    if (PROVIDER === 'gemini') return gerarTextoGemini(opts);
    return gerarTextoOpenAI(opts); // openai (padrão)
}

module.exports = { gerarTexto, isConfigured, providerAtual, modeloAtual };
