// Como Fazer + IA (Fase 1 "Começar com a IA"). A IA só RASCUNHA: nada é criado nem publicado aqui.
// Regras: nunca gravar prompt/pedido/resposta (só tamanhos e tokens); nunca mandar à IA dado de
// cliente/preço/financeiro/funcionário/telefone/foto/responsável/horário; sem $transaction.
const prisma = require('../config/database');
const ai = require('./aiProvider');
const schema = require('./comoFazerSchema');
const setoresService = require('./setoresService');
const { ErroCF } = require('./comoFazerService');

const CHAVE_CONFIG = 'ia_como_fazer';
const CHAVE_PRECOS = 'ia_precos';
const PADRAO = { ligado: true, provedor: 'openai', modelo: 'gpt-6-luna', modeloAjustes: 'gpt-6-luna', limiteDia: 40 };

// Fase 1: só o OpenAI já configurado funciona; Claude aparece desabilitado.
const MODELOS = [
    { provedor: 'openai', modelo: 'gpt-6-luna', rotulo: 'ChatGPT (gpt-6-luna)', disponivel: true },
    { provedor: 'anthropic', modelo: 'claude', rotulo: 'Claude (em breve, precisa da chave ANTHROPIC_API_KEY)', disponivel: false },
];
const modeloValido = (provedor, modelo) => MODELOS.some(m => m.disponivel && m.provedor === provedor && m.modelo === modelo);

const ACOES = ['MONTAR', 'PEDIR_DIFERENTE', 'MELHORAR_PASSO', 'SIMPLIFICAR_PASSO', 'SUGERIR_NAOFAZER', 'SUGERIR_SEDERERRADO', 'SUGERIR_PERGUNTAS', 'SUGERIR_PASSOS'];
const TIMEOUT_MONTAR_MS = 90000;
const TIMEOUT_AJUSTE_MS = 60000;
const MAX_TOKENS = { completo: 9000, curto: 6000, ajuste: 3000 };
const MAX_RASCUNHO_BYTES = 80 * 1024;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ───────── configuração (cache 30 s) ─────────
let _cfg = { em: 0, valor: null };

function sanitizarConfig(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const provedor = modeloValido(String(r.provedor || PADRAO.provedor), String(r.modelo || PADRAO.modelo)) ? String(r.provedor || PADRAO.provedor) : PADRAO.provedor;
    const modelo = modeloValido(provedor, String(r.modelo || '')) ? String(r.modelo) : PADRAO.modelo;
    const modeloAjustes = modeloValido(provedor, String(r.modeloAjustes || '')) ? String(r.modeloAjustes) : modelo;
    const lim = Number(r.limiteDia);
    return {
        ligado: r.ligado === false ? false : true,
        provedor, modelo, modeloAjustes,
        limiteDia: Number.isInteger(lim) && lim >= 1 && lim <= 1000 ? lim : PADRAO.limiteDia,
    };
}

async function lerConfig(forcar = false) {
    if (!forcar && _cfg.valor && Date.now() - _cfg.em < 30000) return _cfg.valor;
    let bruto = null;
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: CHAVE_CONFIG } });
        bruto = row ? row.value : null;
    } catch (e) {
        console.error('[ComoFazerIA] ler config:', e.message);
        if (_cfg.valor) return _cfg.valor;
    }
    _cfg = { em: Date.now(), valor: sanitizarConfig(bruto) };
    return _cfg.valor;
}

async function lerPrecos() {
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: CHAVE_PRECOS } });
        const v = row && row.value && typeof row.value === 'object' ? row.value : {};
        return v;
    } catch { return {}; }
}

function sanitizarPrecos(entrada) {
    const out = {};
    if (!entrada || typeof entrada !== 'object') return out;
    const num = (x) => { if (x === '' || x === null || x === undefined) return null; const n = Number(x); return Number.isFinite(n) && n >= 0 && n < 100000 ? n : null; };
    let n = 0;
    for (const [modelo, p] of Object.entries(entrada)) {
        if (modelo === 'cotacaoBrl') {
            const c = num(p); if (c !== null && c > 0) out.cotacaoBrl = c;
            continue;
        }
        if (!/^[\w.\-]{1,60}$/.test(modelo) || !p || typeof p !== 'object') continue;
        const e = num(p.entradaUsdPorM), s = num(p.saidaUsdPorM);
        if (e === null || s === null) continue;
        if (++n > 20) break;
        out[modelo] = { entradaUsdPorM: e, saidaUsdPorM: s };
    }
    return out;
}

async function salvarConfig(corpo) {
    const c = corpo && typeof corpo === 'object' ? corpo : {};
    const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!obj(c.config) && !obj(c.precos)) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Envie {config:{...}} e/ou {precos:{...}}.');
    const atual = await lerConfig(true);
    if (c.config !== undefined) {
        const novo = c.config && typeof c.config === 'object' ? c.config : null;
        if (!novo) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Configuração inválida.');
        const prov = novo.provedor !== undefined ? String(novo.provedor) : atual.provedor;
        if (!['openai', 'anthropic', 'gemini'].includes(prov)) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Provedor inválido.');
        const mod = novo.modelo !== undefined ? String(novo.modelo) : atual.modelo;
        const modAj = novo.modeloAjustes !== undefined ? String(novo.modeloAjustes) : atual.modeloAjustes;
        if (!modeloValido(prov, mod) || !modeloValido(prov, modAj)) {
            throw new ErroCF(400, 'MODELO_INDISPONIVEL', 'Esse modelo ainda não está disponível. Por enquanto só o ChatGPT (gpt-6-luna) funciona.');
        }
        let lim = atual.limiteDia;
        if (novo.limiteDia !== undefined) {
            lim = Number(novo.limiteDia);
            if (!Number.isInteger(lim) || lim < 1 || lim > 1000) throw new ErroCF(400, 'DADOS_INVALIDOS', 'O limite por dia precisa ser um número entre 1 e 1000.');
        }
        if (novo.ligado !== undefined && typeof novo.ligado !== 'boolean') throw new ErroCF(400, 'DADOS_INVALIDOS', 'Valor inválido em "ligado".');
        const valor = { ligado: novo.ligado === undefined ? atual.ligado : novo.ligado, provedor: prov, modelo: mod, modeloAjustes: modAj, limiteDia: lim };
        await prisma.appConfig.upsert({ where: { key: CHAVE_CONFIG }, update: { value: valor }, create: { key: CHAVE_CONFIG, value: valor } });
    }
    if (c.precos !== undefined) {
        const precos = sanitizarPrecos(c.precos);
        await prisma.appConfig.upsert({ where: { key: CHAVE_PRECOS }, update: { value: precos }, create: { key: CHAVE_PRECOS, value: precos } });
    }
    _cfg = { em: 0, valor: null };
    return visaoConfig();
}

async function visaoConfig() {
    return {
        config: await lerConfig(true),
        chave: { openai: ai.isConfiguredProvedor('openai'), anthropic: ai.isConfiguredProvedor('anthropic') },
        modelos: MODELOS,
        precos: await lerPrecos(),
    };
}

// ───────── limite, status, trava de simultâneo ─────────
function inicioDoDiaSP() {
    const d = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return new Date(`${d}T00:00:00-03:00`);
}
const usadasHoje = () => prisma.comoFazerIaUso.count({ where: { createdAt: { gte: inicioDoDiaSP() } } });

async function status() {
    const cfg = await lerConfig();
    return { ligado: cfg.ligado, temChave: ai.isConfiguredProvedor(cfg.provedor), usadasHoje: await usadasHoje(), limite: cfg.limiteDia };
}

const montando = new Map(); // vendedorId -> true (1 montagem por usuário por vez)

async function checarAntes(cf, { exclusivo = false } = {}) {
    const cfg = await lerConfig();
    if (!cfg.ligado) throw new ErroCF(503, 'IA_DESLIGADA', 'A IA está desligada. Você pode começar em branco.');
    if (!ai.isConfiguredProvedor(cfg.provedor)) throw new ErroCF(503, 'IA_SEM_CHAVE', 'A IA ainda não está configurada. Você pode começar em branco.');
    const usadas = await usadasHoje();
    if (usadas >= cfg.limiteDia) throw new ErroCF(429, 'LIMITE_DIA', `O limite de hoje (${cfg.limiteDia}) acabou. Tente amanhã ou comece em branco.`, { usadas, limite: cfg.limiteDia });
    if (exclusivo && montando.has(cf.vendedorId)) throw new ErroCF(409, 'JA_MONTANDO', 'Já tem uma montagem sua em andamento. Espere ela terminar.');
    return cfg;
}

// ───────── custo / registro de uso ─────────
async function custoUsd(modelo, usage) {
    if (!usage || usage.prompt == null || usage.resposta == null) return null;
    const p = (await lerPrecos())[modelo];
    if (!p || !Number.isFinite(p.entradaUsdPorM) || !Number.isFinite(p.saidaUsdPorM)) return null;
    return Number(((usage.prompt * p.entradaUsdPorM + usage.resposta * p.saidaUsdPorM) / 1e6).toFixed(6));
}

async function nomeDoVendedor(id) {
    try { return (await prisma.vendedor.findUnique({ where: { id }, select: { nome: true } }))?.nome || null; } catch { return null; }
}

async function abrirUso(cf, { acao, tipoConteudo, tituloRef, conteudoId, cfg, modelo }) {
    return prisma.comoFazerIaUso.create({
        data: {
            vendedorId: cf.vendedorId, vendedorNome: await nomeDoVendedor(cf.vendedorId),
            acao, conteudoId: conteudoId || null, tipoConteudo: tipoConteudo || null,
            tituloRef: tituloRef ? String(tituloRef).slice(0, 120) : null,
            provedor: cfg.provedor, modelo,
        },
    });
}

/** Atualiza o registro de uso sem nunca derrubar a resposta (log em try/catch próprio). */
async function fecharUso(id, dados) {
    try { await prisma.comoFazerIaUso.update({ where: { id }, data: dados }); }
    catch (e) { console.error('[ComoFazerIA] atualizar uso:', e.message); }
}

// ───────── teste local de falhas (só banco localhost) ─────────
function flagTeste(nome) {
    const url = process.env.DATABASE_URL || '';
    const local = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/i.test(url) || /hardt_local\b/i.test(url);
    return local && process.env.NODE_ENV !== 'production' ? process.env[nome] || '' : '';
}

// ───────── texto / JSON ─────────
function cortarPalavra(s, max) {
    const t = str(s);
    if (t.length <= max) return t;
    let c = t.slice(0, max);
    const i = c.lastIndexOf(' ');
    if (i > max * 0.6) c = c.slice(0, i);
    return c.replace(/[\s,;:\-–·]+$/, '');
}

function extrairJson(txt) {
    let t = String(txt || '').trim();
    const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (cerca) t = cerca[1].trim();
    try { return JSON.parse(t); } catch { /* tenta recorte */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* falhou */ } }
    return null;
}

const TITULO_BLOCO = { MONTAR: 'Montar', USAR: 'Usar', LIMPAR: 'Limpar', PROBLEMA: 'Chamar o encarregado', PRINCIPAL: 'Passo a passo' };
const ORDEM_MAQUINA = ['MONTAR', 'USAR', 'LIMPAR', 'PROBLEMA'];

function saneaPasso(p) {
    if (!p || typeof p !== 'object') return null;
    const texto = cortarPalavra(p.texto, schema.MAX_TEXTO);
    if (!texto) return null;
    const out = { texto, perigo: p.perigo === true };
    const det = cortarPalavra(p.detalhe, schema.MAX_DETALHE); if (det) out.detalhe = det;
    const foto = cortarPalavra(p.fotoSugerida, 140); if (foto) out.fotoSugerida = foto;
    if (p.pergunta && typeof p.pergunta === 'object') out.pergunta = p.pergunta;
    if (Array.isArray(p.itens)) out.itens = p.itens;
    return out; // sem `id`/`foto`/`video`: o servidor gera ids e a IA nunca anexa mídia
}

/** Deixa o JSON da IA no formato do documento. Não valida regra de publicação (isso vira `erros`). */
function sanear(bruto, tipo) {
    const d = bruto && typeof bruto === 'object' ? bruto : {};
    const texto = (v, max) => (Array.isArray(v) ? v.map(str).filter(Boolean).join(' · ') : str(v)).slice(0, max);
    const out = {};
    if (texto(d.objetivo, 2000)) out.objetivo = texto(d.objetivo, 2000);
    if (texto(d.materiais, 2000)) out.materiais = texto(d.materiais, 2000);
    if (texto(d.avisoPerigo, 400)) out.avisoPerigo = texto(d.avisoPerigo, 400);
    if (texto(d.naoFazer, 2000)) out.naoFazer = texto(d.naoFazer, 2000);
    if (Array.isArray(d.seDerErrado)) {
        const l = d.seDerErrado.filter(x => x && typeof x === 'object').map(x => ({ se: cortarPalavra(x.se, 200), entao: cortarPalavra(x.entao, 300) })).filter(x => x.se || x.entao).slice(0, 10);
        if (l.length) out.seDerErrado = l;
    }
    const secIn = (Array.isArray(d.secoes) ? d.secoes : []).filter(s => s && typeof s === 'object');
    const passosDe = (s) => (Array.isArray(s.passos) ? s.passos : []).map(saneaPasso).filter(Boolean).slice(0, schema.MAX_PASSOS_SECAO || 40);

    if (tipo === 'MAQUINA') {
        const por = {};
        for (const b of ORDEM_MAQUINA) por[b] = [];
        for (const s of secIn) {
            let b = String(s.bloco || '').toUpperCase();
            if (!ORDEM_MAQUINA.includes(b)) b = 'USAR'; // PRINCIPAL ou inválido cai em "Usar"
            por[b].push(...passosDe(s));
        }
        out.secoes = ORDEM_MAQUINA.map(b => ({ bloco: b, titulo: TITULO_BLOCO[b], passos: por[b] }));
    } else {
        const passos = secIn.flatMap(passosDe);
        out.secoes = [{ bloco: 'PRINCIPAL', titulo: TITULO_BLOCO.PRINCIPAL, passos }];
    }
    return out;
}

function totalPassos(doc) { return (doc.secoes || []).reduce((n, s) => n + (s.passos || []).length, 0); }

// ───────── contexto e prompt ─────────
async function montarContexto({ setor, titulo, itemPcpId }) {
    const setores = (await setoresService.listar()).map(s => s.nome).slice(0, 30);
    let item = null;
    if (itemPcpId) {
        const it = await prisma.itemPcp.findFirst({ where: { id: String(itemPcpId), ativo: true }, select: { nome: true, tipo: true, unidade: true } });
        if (it) item = `${it.nome} (${it.tipo}, ${it.unidade})`;
    }
    const palavras = semAcentoPalavras(titulo);
    let nomes = [];
    if (palavras.length) {
        const rows = await prisma.itemPcp.findMany({
            where: { ativo: true, OR: palavras.map(w => ({ nome: { contains: w, mode: 'insensitive' } })) },
            select: { nome: true }, orderBy: { nome: 'asc' }, take: 25,
        });
        nomes = rows.map(r => r.nome);
    }
    return { setores, item, nomes };
}
function semAcentoPalavras(t) {
    return [...new Set(String(t || '').split(/[\s,.;:/()\-]+/).map(w => w.trim()).filter(w => w.length >= 4))].slice(0, 6);
}

/** Até 2 POPs já publicados do mesmo tipo, compactos (só título, objetivo e frases dos passos). */
async function exemplosDaEmpresa(tipo) {
    const lista = await prisma.comoFazerConteudo.findMany({
        where: { tipo, status: 'PUBLICADO', versaoPublicadaId: { not: null } },
        select: { titulo: true, versaoPublicadaId: true }, orderBy: { updatedAt: 'desc' }, take: 2,
    });
    const out = [];
    for (const c of lista) {
        const v = await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId }, select: { passos: true } });
        const doc = v && v.passos;
        if (!doc || !Array.isArray(doc.secoes)) continue;
        const frases = doc.secoes.flatMap(s => (s.passos || []).map(p => str(p.texto))).filter(Boolean);
        let t = `${c.titulo}${doc.objetivo ? ` — ${str(doc.objetivo)}` : ''}\n` + frases.map((f, i) => `${i + 1}. ${f}`).join('\n');
        out.push(t.slice(0, 1500));
    }
    return out;
}

const SYSTEM_MONTAR = `Você é um assistente que ajuda a gerente de produção de uma fábrica de salgados congelados (Hardt Salgados) a escrever manuais de trabalho (POPs) para o tablet da equipe. Quem lê tem pouca escolaridade e não gosta de ler: frases curtas, palavras simples, nada de termo técnico sem explicar.

Responda SOMENTE com um objeto JSON válido, sem texto antes nem depois, sem markdown. O JSON precisa ter exatamente o formato descrito abaixo.

REGRAS DE ESCRITA
1. Cada passo tem UMA ação. "texto" tem no máximo 140 caracteres e começa com verbo no imperativo (Ligue, Confira, Espere...).
2. "detalhe" (opcional, máx. 240 caracteres) explica o porquê ou o jeito certo. Só use se ajudar.
3. Use números concretos quando fizer sentido (temperatura, tempo, quantidade), mas NUNCA invente valores técnicos que você não conhece. Se não souber, escreva "confira no painel/etiqueta" ou use o que a gerente disse. Não afirme que algo atende exigência da Vigilância Sanitária ou lei.
4. Marque "perigo": true nos passos com risco real (calor, óleo quente, lâmina, peso, produto químico, eletricidade) e escreva em "avisoPerigo" uma frase curta de aviso quando houver QUALQUER passo perigoso.
5. Em "fotoSugerida" diga em até 140 caracteres QUAL foto a gerente deve tirar para esse passo (o que aparece, de onde). Não invente que a foto existe.
6. "naoFazer": 3 a 6 itens curtos separados por " · ". "seDerErrado": 2 a 6 itens {"se","entao"}, frases curtas.
7. Use só o que a gerente contou e os nomes do contexto. Não invente máquinas, produtos, setores, pessoas ou horários que não foram citados.
8. Tamanho: "curto" = até 6 passos no total; "completo" = 8 a 15 passos.

FORMATO POR TIPO
- MAQUINA: secoes com bloco "MONTAR" (titulo "Montar"), "USAR" (titulo "Usar"), "LIMPAR" (titulo "Limpar") e "PROBLEMA" (titulo "Chamar o encarregado"), nessa ordem; cada uma com pelo menos 1 passo.
- ROTINA: uma única seção bloco "PRINCIPAL" (titulo "Passo a passo"). Pelo menos 1 passo precisa ter "pergunta". Tipos: {"tipo":"NUMERO","rotulo":"...","min":n,"max":n,"unidade":"°C","obrigatoria":true,"avisoDesvio":"..."}, {"tipo":"SIMNAO","rotulo":"...","respostaEsperada":"SIM"|"NAO","obrigatoria":true,"avisoDesvio":"..."}, {"tipo":"FOTO","rotulo":"...","obrigatoria":true}. NUMERO SEMPRE tem min e max (sem faixa dada pela gerente, use SIMNAO).
- REGRA e DOSAGEM: uma única seção "PRINCIPAL". Em DOSAGEM, cada passo pode ter "itens": [{"nome","quantidade","unidade"}] (quantidade como texto). Em MAQUINA e REGRA NÃO use "pergunta" nem "itens".

FORMATO DO JSON
{
  "objetivo": "para que serve, 1 a 2 frases",
  "materiais": "o que precisa (EPI, ferramentas), separado por ' · '",
  "avisoPerigo": "só se houver perigo; senão omita",
  "naoFazer": "item · item · item",
  "seDerErrado": [ {"se":"...","entao":"..."} ],
  "secoes": [
    { "bloco": "PRINCIPAL|MONTAR|USAR|LIMPAR|PROBLEMA", "titulo": "...",
      "passos": [ { "texto":"...", "detalhe":"...", "fotoSugerida":"...", "perigo": false, "pergunta": null } ] }
  ]
}
Não inclua campos "id". Não inclua "foto" nem "video".

Se o pedido pedir algo que não seja um manual de trabalho legítimo (ofensivo, perigoso, fora do contexto de fábrica), responda {"recusa":"motivo curto"}.`;

function limparRascunho(doc) {
    const strip = (o) => {
        if (Array.isArray(o)) return o.map(strip);
        if (o && typeof o === 'object') {
            const r = {};
            for (const [k, v] of Object.entries(o)) { if (['id', 'foto', 'video', 'ia'].includes(k)) continue; r[k] = strip(v); }
            return r;
        }
        return o;
    };
    return strip(doc);
}

function mensagemUsuario(b, ctx, exemplos) {
    const L = [];
    L.push(`TIPO: ${b.tipo}`);
    L.push(`SETOR: ${b.setorNome}`);
    L.push(`TÍTULO: ${b.titulo}`);
    L.push(`QUEM EXECUTA: ${b.cargos.length ? b.cargos.join(', ') : 'equipe do setor'}`);
    L.push(`TAMANHO: ${b.tamanho}`);
    L.push(`O QUE A GERENTE QUER ENSINAR:\n${b.pedido}`);
    if (ctx.item) L.push(`ITEM RELACIONADO: ${ctx.item}`);
    if (ctx.nomes.length) L.push(`NOMES CADASTRADOS QUE PODEM APARECER: ${ctx.nomes.join('; ')}`);
    if (ctx.setores.length) L.push(`SETORES DA EMPRESA: ${ctx.setores.join('; ')}`);
    if (exemplos.length) L.push(`EXEMPLOS DE COMO A EMPRESA ESCREVE (copie o TOM, não o conteúdo):\n${exemplos.join('\n---\n')}`);
    if (b.rascunhoAnterior) {
        L.push(`RASCUNHO ANTERIOR (JSON):\n${JSON.stringify(limparRascunho(b.rascunhoAnterior))}`);
        L.push(`O QUE MUDAR: ${b.observacao}`);
        L.push('Devolva o JSON completo ajustado.');
    } else {
        L.push('Devolva o JSON do manual.');
    }
    return L.join('\n\n');
}

// ───────── validação do pedido ─────────
async function validarPedido(body) {
    const b = body && typeof body === 'object' ? body : {};
    const bad = (m) => new ErroCF(400, 'DADOS_INVALIDOS', m);
    const tipo = str(b.tipo).toUpperCase();
    if (!schema.TIPOS.includes(tipo)) throw bad('Escolha o tipo do conteúdo.');
    const setor = await setoresService.porCodigo(str(b.setor));
    if (!setor || !setor.ativo) throw bad('Escolha um setor válido.');
    const titulo = str(b.titulo);
    if (titulo.length < 1 || titulo.length > 120) throw bad('O título precisa ter de 1 a 120 letras.');
    const pedido = str(b.pedido);
    if (pedido.length < 10) throw bad('Conte com um pouco mais de detalhe o que você quer ensinar (mínimo 10 letras).');
    if (pedido.length > 4000) throw bad('O texto está grande demais (máximo 4000 letras).');
    let cargos = [];
    if (b.cargos !== undefined && b.cargos !== null) {
        if (!Array.isArray(b.cargos) || b.cargos.length > 5) throw bad('Escolha no máximo 5 cargos.');
        cargos = b.cargos.map(str).filter(Boolean).map(c => c.slice(0, 40));
    }
    const tamanho = b.tamanho === 'curto' ? 'curto' : 'completo';
    const itemPcpId = b.itemPcpId ? str(String(b.itemPcpId)).slice(0, 64) : null;
    let rascunhoAnterior = null, observacao = null;
    if (b.rascunhoAnterior !== undefined && b.rascunhoAnterior !== null) {
        if (typeof b.rascunhoAnterior !== 'object' || Array.isArray(b.rascunhoAnterior)) throw bad('Rascunho anterior inválido.');
        if (Buffer.byteLength(JSON.stringify(b.rascunhoAnterior)) > MAX_RASCUNHO_BYTES) throw new ErroCF(413, 'PEDIDO_GRANDE', 'O rascunho anterior é grande demais para reenviar.');
        observacao = str(b.observacao);
        if (observacao.length < 3 || observacao.length > 500) throw bad('Diga o que mudar (de 3 a 500 letras).');
        rascunhoAnterior = b.rascunhoAnterior;
    }
    return { tipo, setor: setor.codigo, setorNome: setor.nome, titulo, pedido, cargos, tamanho, itemPcpId, rascunhoAnterior, observacao };
}

// ───────── erros da IA ─────────
function classificarErro(e, motivoAbort) {
    if (motivoAbort === 'CLIENTE') return { resultado: 'CANCELADO', codigo: 'CANCELADO', http: 499, msg: 'Cancelado.' };
    if (motivoAbort === 'TIMEOUT') return { resultado: 'ERRO', codigo: 'IA_DEMOROU', http: 504, msg: 'A IA demorou demais. Tente de novo ou comece em branco.' };
    if (e && e.codigo === 'PROVEDOR_INDISPONIVEL') return { resultado: 'ERRO', codigo: 'PROVEDOR_INDISPONIVEL', http: 503, msg: 'Esse provedor de IA ainda não está disponível.' };
    if (e && (e.finishReason === 'content_filter' || e.recusa)) return { resultado: 'RECUSADO', codigo: 'IA_RECUSOU', http: 422, msg: 'A IA não aceitou este pedido. Reescreva com outras palavras ou comece em branco.' };
    if (e && e.finishReason === 'length') return { resultado: 'ERRO', codigo: 'IA_CORTOU', http: 502, codigoResposta: 'IA_FALHOU', msg: 'A IA não conseguiu terminar o texto (ficou grande demais). Tente o tamanho "curto" ou conte menos coisas de uma vez.' };
    if (e && e.name && /Timeout/i.test(e.name)) return { resultado: 'ERRO', codigo: 'IA_DEMOROU', http: 504, msg: 'A IA demorou demais. Tente de novo ou comece em branco.' };
    return { resultado: 'ERRO', codigo: 'IA_FALHOU', http: 502, msg: 'A IA não conseguiu responder agora. Tente de novo ou comece em branco.' };
}

function comTimeout(promessa, ms) {
    let t;
    const limite = new Promise((_, rej) => { t = setTimeout(() => { const e = new Error('timeout'); e.name = 'TimeoutIA'; rej(e); }, ms); });
    return Promise.race([promessa, limite]).finally(() => clearTimeout(t));
}

// ───────── MONTAR (SSE) ─────────
/**
 * Monta o rascunho. `emitir(evento, dados)` escreve no SSE. `signal` aborta (cliente fechou).
 * Lança ErroCF ANTES de qualquer evento (validação/limite) para a rota responder JSON normal.
 */
async function montar({ cf, body, emitir, signal }) {
    const b = await validarPedido(body);
    const cfg = await checarAntes(cf, { exclusivo: true });
    montando.set(cf.vendedorId, true);
    const t0 = Date.now();
    let uso = null, usageTotal = { prompt: null, resposta: null }, tamPrompt = 0, tamResp = 0, reparou = false;
    const ctrl = new AbortController();
    let motivoAbort = null;
    const aoCancelar = () => { if (!motivoAbort) { motivoAbort = 'CLIENTE'; ctrl.abort(); } };
    if (signal) { if (signal.aborted) aoCancelar(); else signal.addEventListener('abort', aoCancelar, { once: true }); }
    const timer = setTimeout(() => { if (!motivoAbort) { motivoAbort = 'TIMEOUT'; ctrl.abort(); } }, TIMEOUT_MONTAR_MS);
    const somaUso = (u) => { if (!u) return; if (u.prompt != null) usageTotal.prompt = (usageTotal.prompt || 0) + u.prompt; if (u.resposta != null) usageTotal.resposta = (usageTotal.resposta || 0) + u.resposta; };
    try {
        uso = await abrirUso(cf, { acao: b.rascunhoAnterior ? 'PEDIR_DIFERENTE' : 'MONTAR', tipoConteudo: b.tipo, tituloRef: b.titulo, cfg, modelo: cfg.modelo });
        emitir('inicio', { usoId: uso.id, modelo: cfg.modelo, provedor: cfg.provedor, stream: true });

        const ctx = await montarContexto(b);
        const exemplos = await exemplosDaEmpresa(b.tipo).catch(() => []);
        const msgUser = mensagemUsuario(b, ctx, exemplos);
        tamPrompt = SYSTEM_MONTAR.length + msgUser.length;
        const maxTokens = b.tamanho === 'curto' ? MAX_TOKENS.curto : MAX_TOKENS.completo;

        let r;
        const teste = flagTeste('IA_TESTE_JSON_QUEBRADO'), testeRecusa = flagTeste('IA_TESTE_RECUSA');
        r = await ai.gerarTextoStream({
            system: SYSTEM_MONTAR, mensagens: [{ role: 'user', content: msgUser }], maxTokens, json: true,
            modelo: cfg.modelo, provedor: cfg.provedor, signal: ctrl.signal, timeoutMs: TIMEOUT_MONTAR_MS + 5000,
            onTexto: (delta) => emitir('texto', { delta }),
        });
        somaUso(r.usage);
        if (r.finishReason === 'length') { const e = new Error('cortou'); e.finishReason = 'length'; throw e; } // sem gastar reparo
        let texto = r.texto;
        if (testeRecusa) texto = '{"recusa":"pedido de teste"}';
        else if (teste) texto = '{"objetivo": "quebrado", "secoes": [ {"bloco": "USAR", "passos": [ {"texto": "x"';
        tamResp = texto.length;

        const avaliar = (txt) => {
            const j = extrairJson(txt);
            if (!j) return { fatal: 'A resposta não veio em JSON válido.' };
            if (typeof j.recusa === 'string' && !Array.isArray(j.secoes)) return { recusa: j.recusa };
            const s = sanear(j, b.tipo);
            if (totalPassos(s) < 1) return { fatal: 'A resposta não trouxe nenhuma seção com passos.' };
            return { saneado: s };
        };
        let av = avaliar(texto);
        if (av.recusa) {
            const e = new Error('recusa'); e.recusa = av.recusa; throw e;
        }
        if (av.fatal) {
            reparou = true;
            const rep = await ai.gerarTexto({
                system: SYSTEM_MONTAR,
                mensagens: [
                    { role: 'user', content: msgUser },
                    { role: 'assistant', content: texto.slice(0, 20000) },
                    { role: 'user', content: `O JSON abaixo falhou por: ${av.fatal} Devolva o JSON corrigido, apenas o JSON.` },
                ],
                maxTokens, json: true, modelo: cfg.modelo, provedor: cfg.provedor, signal: ctrl.signal,
            }).catch(err => { somaUso(err.usage); throw err; });
            somaUso(rep.usage);
            if (motivoAbort) { const e = new Error('abortado'); throw e; } // cancelou/estourou durante o reparo: nunca grava GERADO
            if (rep.finishReason === 'length') { const e = new Error('cortou'); e.finishReason = 'length'; throw e; }
            let t2 = rep.texto;
            if (teste === '2') t2 = '{ ainda quebrado';
            tamResp += t2.length;
            av = avaliar(t2);
            if (av.recusa) { const e = new Error('recusa'); e.recusa = av.recusa; throw e; }
            if (av.fatal) { const e = new Error(av.fatal); e.fatalJson = true; throw e; }
        }

        const bruto = av.saneado;
        bruto.ia = { origem: 'IA', usoId: uso.id, modelo: cfg.modelo, em: new Date().toISOString() };
        const { doc, erros, avisos } = schema.processarDoc(bruto, { tipo: b.tipo, horarios: [], responsaveisIds: [], recorrencia: 'NUNCA', diasSemana: [] });
        if (motivoAbort) throw new Error('abortado');
        const dur = Date.now() - t0;
        await fecharUso(uso.id, {
            tokensEntrada: usageTotal.prompt, tokensSaida: usageTotal.resposta,
            custoUsd: await custoUsd(cfg.modelo, usageTotal), duracaoMs: dur, tamPromptChars: tamPrompt, tamRespostaChars: tamResp,
            reparou, resultado: 'GERADO', erroCodigo: null,
        });
        emitir('fim', { usoId: uso.id, doc, avisos, erros, resumo: { secoes: doc.secoes.length, passos: totalPassos(doc), segundos: Math.round(dur / 1000) }, reparou });
    } catch (e) {
        if (e instanceof ErroCF && !uso) throw e; // antes de abrir o uso: a rota responde JSON
        let cls = e && e.fatalJson ? { resultado: 'ERRO', codigo: 'IA_FALHOU', http: 502, msg: 'A IA devolveu um texto que não consegui usar. Tente de novo ou comece em branco.' } : classificarErro(e, motivoAbort);
        if (e && e.recusa && !e.fatalJson) cls = classificarErro(e, motivoAbort === 'CLIENTE' ? 'CLIENTE' : null);
        if (cls.codigo === 'IA_FALHOU' || cls.codigo === 'IA_CORTOU') console.error('[ComoFazerIA] montar falhou:', e && (e.status || ''), e && e.message);
        somaUso(e && e.usage);
        if (uso) {
            await fecharUso(uso.id, {
                resultado: cls.resultado, erroCodigo: cls.codigo === 'CANCELADO' ? null : cls.codigo,
                tokensEntrada: usageTotal.prompt, tokensSaida: usageTotal.resposta,
                duracaoMs: Date.now() - t0, tamPromptChars: tamPrompt || null, tamRespostaChars: tamResp || null, reparou,
            });
        }
        if (cls.resultado !== 'CANCELADO') emitir('erro', { erro: cls.msg, codigo: cls.codigoResposta || cls.codigo, ...(cls.codigoResposta ? { motivo: cls.codigo } : {}) });
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', aoCancelar);
        montando.delete(cf.vendedorId);
    }
}

// ───────── MELHORAR / SIMPLIFICAR PASSO ─────────
async function melhorarPasso(cf, body) {
    const b = body && typeof body === 'object' ? body : {};
    const bad = (m) => new ErroCF(400, 'DADOS_INVALIDOS', m);
    if (!['melhorar', 'simplificar'].includes(b.acao)) throw bad('Ação inválida.');
    const texto = str(b.texto);
    if (!texto || texto.length > 600) throw bad('Escreva o passo antes de pedir ajuda da IA.');
    const detalhe = str(b.detalhe).slice(0, 600);
    const tipo = str(b.tipo).toUpperCase();
    if (!schema.TIPOS.includes(tipo)) throw bad('Tipo inválido.');
    const titulo = str(b.titulo).slice(0, 120);
    const objetivo = str(b.objetivo).slice(0, 500);
    const cfg = await checarAntes(cf);
    const uso = await abrirUso(cf, { acao: b.acao === 'melhorar' ? 'MELHORAR_PASSO' : 'SIMPLIFICAR_PASSO', tipoConteudo: tipo, tituloRef: titulo, cfg, modelo: cfg.modeloAjustes });
    const t0 = Date.now();
    const system = `Você ajuda a escrever manuais de trabalho (POPs) para uma fábrica de salgados congelados. Quem lê tem pouca escolaridade: frases curtas e palavras simples.
Reescreva UM passo. Responda SOMENTE com JSON: {"texto":"...","detalhe":"..."}.
Regras: "texto" com no máximo 140 caracteres, começa com verbo no imperativo, uma única ação. "detalhe" com no máximo 240 caracteres (pode ser vazio). Não invente números, temperaturas ou tempos que não estejam no passo original. ${b.acao === 'simplificar' ? 'Deixe MAIS SIMPLES e mais curto, com palavras do dia a dia.' : 'Deixe mais claro e direto, sem mudar o sentido.'}`;
    const user = `TIPO: ${tipo}\nTÍTULO DO MANUAL: ${titulo}\n${objetivo ? `OBJETIVO: ${objetivo}\n` : ''}PASSO ATUAL: ${texto}\n${detalhe ? `DETALHE ATUAL: ${detalhe}\n` : ''}Devolva o JSON.`;
    try {
        const r = await comTimeout(ai.gerarTexto({ system, mensagens: [{ role: 'user', content: user }], maxTokens: MAX_TOKENS.ajuste, json: true, modelo: cfg.modeloAjustes, provedor: cfg.provedor }), TIMEOUT_AJUSTE_MS);
        const j = extrairJson(r.texto);
        const novo = cortarPalavra(j && j.texto, schema.MAX_TEXTO);
        if (!novo) { const e = new Error('sem texto'); e.fatalJson = true; throw e; }
        const det = cortarPalavra(j.detalhe, schema.MAX_DETALHE);
        await fecharUso(uso.id, { tokensEntrada: r.usage.prompt, tokensSaida: r.usage.resposta, custoUsd: await custoUsd(cfg.modeloAjustes, r.usage), duracaoMs: Date.now() - t0, tamPromptChars: system.length + user.length, tamRespostaChars: r.texto.length, resultado: 'GERADO' });
        return { texto: novo, detalhe: det || null, usoId: uso.id };
    } catch (e) {
        throw await falhaAjuste(e, uso, t0);
    }
}

async function falhaAjuste(e, uso, t0) {
    const cls = e && e.fatalJson ? { resultado: 'ERRO', codigo: 'IA_FALHOU', http: 502, msg: 'A IA devolveu um texto que não consegui usar. Tente de novo.' } : classificarErro(e, null);
    if (cls.codigo === 'IA_FALHOU' || cls.codigo === 'IA_CORTOU') console.error('[ComoFazerIA] ajuste falhou:', e && e.message);
    await fecharUso(uso.id, { resultado: cls.resultado, erroCodigo: cls.codigo, tokensEntrada: e && e.usage ? e.usage.prompt : null, tokensSaida: e && e.usage ? e.usage.resposta : null, duracaoMs: Date.now() - t0 });
    return new ErroCF(cls.http, cls.codigoResposta || cls.codigo, cls.msg, cls.codigoResposta ? { motivo: cls.codigo } : {});
}

// ───────── SUGERIR ─────────
async function sugerir(cf, body) {
    const b = body && typeof body === 'object' ? body : {};
    const bad = (m) => new ErroCF(400, 'DADOS_INVALIDOS', m);
    const quais = ['naoFazer', 'seDerErrado', 'perguntas', 'maisPassos'];
    if (!quais.includes(b.tipo)) throw bad('Tipo de sugestão inválido.');
    const c = b.contexto && typeof b.contexto === 'object' ? b.contexto : null;
    if (!c) throw bad('Faltou o contexto do conteúdo.');
    const tipoConteudo = str(c.tipoConteudo).toUpperCase();
    if (!schema.TIPOS.includes(tipoConteudo)) throw bad('Tipo de conteúdo inválido.');
    if (b.tipo === 'perguntas' && tipoConteudo !== 'ROTINA') throw bad('Perguntas só existem em Rotina.');
    const passos = (Array.isArray(c.passos) ? c.passos : []).slice(0, 60).filter(p => p && typeof p === 'object')
        .map(p => ({ secao: str(p.secao).slice(0, 40), texto: str(p.texto).slice(0, 140) })).filter(p => p.texto);
    if (!passos.length) throw bad('Escreva alguns passos antes de pedir sugestões.');
    const titulo = str(c.titulo).slice(0, 120);
    const objetivo = str(c.objetivo).slice(0, 500);
    const setor = await setoresService.porCodigo(str(c.setor));
    const naoFazer = str(c.naoFazer).slice(0, 600);
    const sdeIn = (Array.isArray(c.seDerErrado) ? c.seDerErrado : []).slice(0, 10).filter(x => x && typeof x === 'object').map(x => `${str(x.se).slice(0, 120)} -> ${str(x.entao).slice(0, 160)}`);

    const cfg = await checarAntes(cf);
    const ACAO = { naoFazer: 'SUGERIR_NAOFAZER', seDerErrado: 'SUGERIR_SEDERERRADO', perguntas: 'SUGERIR_PERGUNTAS', maisPassos: 'SUGERIR_PASSOS' }[b.tipo];
    const uso = await abrirUso(cf, { acao: ACAO, tipoConteudo, tituloRef: titulo, cfg, modelo: cfg.modeloAjustes });
    const t0 = Date.now();
    const FORMATOS = {
        naoFazer: 'Devolva {"itens":["...", "..."]} com 3 a 8 coisas que NÃO se deve fazer, frases curtas (até 120 caracteres).',
        seDerErrado: 'Devolva {"itens":[{"se":"...","entao":"..."}]} com 2 a 6 itens, frases curtas.',
        perguntas: 'Devolva {"itens":[{"passoIndice":n,"pergunta":{...}}]} com 1 a 4 perguntas de conferência. "passoIndice" é o número do passo (começando em 0, na ordem da lista). pergunta: {"tipo":"NUMERO","rotulo":"...","min":n,"max":n,"unidade":"...","obrigatoria":true,"avisoDesvio":"..."} OU {"tipo":"SIMNAO","rotulo":"...","respostaEsperada":"SIM"|"NAO","obrigatoria":true,"avisoDesvio":"..."} OU {"tipo":"FOTO","rotulo":"...","obrigatoria":true}. NUMERO só com faixa conhecida; senão use SIMNAO.',
        maisPassos: `Devolva {"itens":[{"secaoBloco":"PRINCIPAL|MONTAR|USAR|LIMPAR|PROBLEMA","depoisDoIndice":n,"texto":"...","detalhe":"...","fotoSugerida":"...","perigo":false}]} com 1 a 5 passos que estão faltando. "depoisDoIndice" é o número (a partir de 0) do passo depois do qual entra, ou -1 para o começo da seção. texto até 140 caracteres, começando com verbo no imperativo.`,
    };
    const system = `Você ajuda a escrever manuais de trabalho (POPs) para uma fábrica de salgados congelados. Quem lê tem pouca escolaridade: frases curtas e palavras simples. Não invente valores técnicos (temperatura, tempo) que não estejam no manual; use só o que o manual já diz. Responda SOMENTE com JSON válido. ${FORMATOS[b.tipo]}`;
    const user = [`TIPO: ${tipoConteudo}`, `SETOR: ${setor ? setor.nome : ''}`, `TÍTULO: ${titulo}`, objetivo && `OBJETIVO: ${objetivo}`,
        `PASSOS ATUAIS:\n${passos.map((p, i) => `${i}. [${p.secao}] ${p.texto}`).join('\n')}`,
        naoFazer && `JÁ TEM "NÃO FAÇA": ${naoFazer}`, sdeIn.length && `JÁ TEM "SE DER ERRADO": ${sdeIn.join('; ')}`, 'Devolva o JSON.'].filter(Boolean).join('\n\n');
    try {
        const r = await comTimeout(ai.gerarTexto({ system, mensagens: [{ role: 'user', content: user }], maxTokens: MAX_TOKENS.ajuste, json: true, modelo: cfg.modeloAjustes, provedor: cfg.provedor }), TIMEOUT_AJUSTE_MS);
        const j = extrairJson(r.texto);
        const lista = j && Array.isArray(j.itens) ? j.itens : null;
        if (!lista) { const e = new Error('sem itens'); e.fatalJson = true; throw e; }
        const itens = normalizarSugestoes(b.tipo, lista, passos.length, tipoConteudo);
        await fecharUso(uso.id, { tokensEntrada: r.usage.prompt, tokensSaida: r.usage.resposta, custoUsd: await custoUsd(cfg.modeloAjustes, r.usage), duracaoMs: Date.now() - t0, tamPromptChars: system.length + user.length, tamRespostaChars: r.texto.length, resultado: 'GERADO' });
        return { usoId: uso.id, itens };
    } catch (e) {
        throw await falhaAjuste(e, uso, t0);
    }
}

function normalizarSugestoes(tipo, lista, nPassos, tipoConteudo) {
    if (tipo === 'naoFazer') return lista.map(x => cortarPalavra(typeof x === 'string' ? x : x && x.texto, 200)).filter(Boolean).slice(0, 8);
    if (tipo === 'seDerErrado') return lista.filter(x => x && typeof x === 'object').map(x => ({ se: cortarPalavra(x.se, 200), entao: cortarPalavra(x.entao, 300) })).filter(x => x.se && x.entao).slice(0, 8);
    if (tipo === 'perguntas') {
        const out = [];
        for (const x of lista) {
            if (!x || typeof x !== 'object') continue;
            const idx = Number(x.passoIndice);
            if (!Number.isInteger(idx) || idx < 0 || idx >= nPassos) continue;
            const q = schema.normalizarPergunta ? schema.normalizarPergunta(x.pergunta) : null;
            if (!q || !q.rotulo) continue;
            if (q.tipo === 'NUMERO' && (q.min === null || q.max === null || q.min > q.max)) continue;
            out.push({ passoIndice: idx, pergunta: q });
            if (out.length >= 8) break;
        }
        return out;
    }
    const out = [];
    for (const x of lista) {
        if (!x || typeof x !== 'object') continue;
        const texto = cortarPalavra(x.texto, schema.MAX_TEXTO);
        if (!texto) continue;
        const bloco = String(x.secaoBloco || '').toUpperCase();
        const di = Number(x.depoisDoIndice);
        out.push({
            secaoBloco: tipoConteudo === 'MAQUINA' && schema.BLOCOS.includes(bloco) ? bloco : (tipoConteudo === 'MAQUINA' ? 'USAR' : 'PRINCIPAL'),
            depoisDoIndice: Number.isInteger(di) && di >= -1 && di < nPassos ? di : -1,
            texto, detalhe: cortarPalavra(x.detalhe, schema.MAX_DETALHE) || null,
            fotoSugerida: cortarPalavra(x.fotoSugerida, 140) || null, perigo: x.perigo === true,
        });
        if (out.length >= 8) break;
    }
    return out;
}

// ───────── resultado do uso ─────────
async function registrarResultado(cf, usoId, body) {
    const b = body && typeof body === 'object' ? body : {};
    if (!['USADO', 'DESCARTADO'].includes(b.resultado)) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Resultado inválido.');
    const uso = await prisma.comoFazerIaUso.findUnique({ where: { id: String(usoId) }, select: { id: true, vendedorId: true, resultado: true } });
    const admin = cf.permissoes && cf.permissoes.admin === true;
    if (!uso || (uso.vendedorId !== cf.vendedorId && !admin)) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Registro não encontrado.');
    if (uso.resultado === 'GERADO') {
        const data = { resultado: b.resultado };
        if (b.conteudoId && typeof b.conteudoId === 'string') data.conteudoId = b.conteudoId.slice(0, 64);
        await prisma.comoFazerIaUso.updateMany({ where: { id: uso.id, resultado: 'GERADO' }, data }); // idempotente
    }
    return { ok: true };
}

// ───────── apoio ─────────
async function itensPcp(busca) {
    const q = str(busca).slice(0, 60);
    const rows = await prisma.itemPcp.findMany({
        where: { ativo: true, ...(q ? { nome: { contains: q, mode: 'insensitive' } } : {}) },
        select: { id: true, nome: true, tipo: true, unidade: true }, orderBy: { nome: 'asc' }, take: 20,
    });
    return { itens: rows };
}

function intervaloMes(mes) {
    let ano, m;
    const mt = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
    if (mt && Number(mt[2]) >= 1 && Number(mt[2]) <= 12) { ano = Number(mt[1]); m = Number(mt[2]); }
    else { const [a, mm] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-'); ano = Number(a); m = Number(mm); }
    const p2 = (n) => String(n).padStart(2, '0');
    const de = new Date(`${ano}-${p2(m)}-01T00:00:00-03:00`);
    const ate = new Date(`${m === 12 ? ano + 1 : ano}-${p2(m === 12 ? 1 : m + 1)}-01T00:00:00-03:00`);
    return { de, ate, mes: `${ano}-${p2(m)}` };
}

async function usoDoMes(mes) {
    const { de, ate, mes: mesOk } = intervaloMes(mes);
    const where = { createdAt: { gte: de, lt: ate } };
    const [agg, montados, erros, usos, cfg, precos] = await Promise.all([
        prisma.comoFazerIaUso.aggregate({ where, _count: { _all: true }, _sum: { custoUsd: true, tokensEntrada: true, tokensSaida: true }, _avg: { duracaoMs: true } }),
        prisma.comoFazerIaUso.count({ where: { ...where, acao: { in: ['MONTAR', 'PEDIR_DIFERENTE'] } } }),
        prisma.comoFazerIaUso.count({ where: { ...where, resultado: { in: ['ERRO', 'RECUSADO'] } } }),
        prisma.comoFazerIaUso.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
        lerConfig(), lerPrecos(),
    ]);
    const semPreco = await prisma.comoFazerIaUso.count({ where: { ...where, custoUsd: null, tokensEntrada: { not: null } } });
    const custo = agg._sum.custoUsd == null ? null : Number(agg._sum.custoUsd);
    const cot = precos && Number.isFinite(precos.cotacaoBrl) ? precos.cotacaoBrl : null;
    return {
        mes: mesOk,
        resumo: {
            montados, usos: agg._count._all, custoUsd: custo, custoBrl: custo != null && cot ? Number((custo * cot).toFixed(2)) : null,
            tempoMedioMs: agg._avg.duracaoMs != null ? Math.round(agg._avg.duracaoMs) : null, erros,
            tokensEntrada: agg._sum.tokensEntrada || 0, tokensSaida: agg._sum.tokensSaida || 0, usosSemPreco: semPreco,
            modelo: cfg.modelo, limiteDia: cfg.limiteDia,
        },
        usos: usos.map(u => ({ ...u, custoUsd: u.custoUsd == null ? null : Number(u.custoUsd) })),
    };
}

module.exports = {
    lerConfig, salvarConfig, visaoConfig, status, checarAntes, montar, melhorarPasso, sugerir,
    registrarResultado, itensPcp, usoDoMes,
    // exportados para teste
    _t: { extrairJson, sanear, cortarPalavra, montarContexto, mensagemUsuario },
};
