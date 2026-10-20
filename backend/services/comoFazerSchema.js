// Como Fazer — validação e normalização do documento de um conteúdo (campo `passos` da versão).
// Funções PURAS (sem banco). Formato: seção 5 do plano (docs/pop/plano-fase1-como-fazer.md)
// + adendo 19/10: campos opcionais objetivo / materiais / naoFazer / seDerErrado.
const crypto = require('crypto');

const TIPOS = ['ROTINA', 'MAQUINA', 'REGRA', 'DOSAGEM'];
const BLOCOS = ['PRINCIPAL', 'MONTAR', 'USAR', 'LIMPAR', 'PROBLEMA'];
const TIPOS_PERGUNTA = ['NUMERO', 'SIMNAO', 'FOTO'];
const MAX_TEXTO = 140;
const MAX_DETALHE = 240;
const MAX_PASSOS_SECAO = 40;
const MAX_LONGO = 2000; // objetivo / materiais / naoFazer
const MAX_SE_DER_ERRADO = 30;

const novoId = (prefixo) => `${prefixo}_${crypto.randomBytes(4).toString('hex')}`;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const strOuNull = (v) => { const s = str(v); return s || null; };

// caminho relativo de mídia precisa ficar dentro de como-fazer/ e sem ..
const midiaValida = (rel) => typeof rel === 'string'
    && rel.startsWith('como-fazer/') && !rel.includes('..') && !rel.includes('\\') && !rel.startsWith('/');

function docVazio(tipo) {
    if (tipo === 'MAQUINA') {
        return {
            schema: 1,
            secoes: [
                { id: novoId('s'), bloco: 'MONTAR', titulo: 'Montar', passos: [] },
                { id: novoId('s'), bloco: 'USAR', titulo: 'Usar', passos: [] },
                { id: novoId('s'), bloco: 'LIMPAR', titulo: 'Limpar', passos: [] },
                { id: novoId('s'), bloco: 'PROBLEMA', titulo: 'Chamar o encarregado', passos: [] },
            ],
        };
    }
    return { schema: 1, secoes: [{ id: novoId('s'), bloco: 'PRINCIPAL', titulo: 'Passo a passo', passos: [] }] };
}

function normalizarPergunta(p) {
    if (!p || typeof p !== 'object') return null;
    const tipo = String(p.tipo || '').toUpperCase();
    if (!TIPOS_PERGUNTA.includes(tipo)) return null;
    const base = { tipo, rotulo: str(p.rotulo), obrigatoria: p.obrigatoria !== false };
    if (tipo === 'NUMERO') {
        const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
        const min = num(p.min), max = num(p.max);
        base.min = Number.isFinite(min) ? min : null;
        base.max = Number.isFinite(max) ? max : null;
        base.unidade = str(p.unidade) || '';
    }
    if (tipo === 'SIMNAO') base.respostaEsperada = String(p.respostaEsperada || 'SIM').toUpperCase() === 'NAO' ? 'NAO' : 'SIM';
    if (tipo !== 'FOTO') base.avisoDesvio = str(p.avisoDesvio) || '';
    return base;
}

function normalizarItens(itens) {
    if (!Array.isArray(itens)) return null;
    const lista = itens.filter(i => i && typeof i === 'object').map(i => ({
        id: str(i.id) || novoId('i'),
        nome: str(i.nome),
        quantidade: i.quantidade === undefined || i.quantidade === null ? '' : String(i.quantidade).trim(),
        unidade: str(i.unidade),
        foto: strOuNull(i.foto),
    }));
    return lista.length ? lista : null;
}

function normalizarPasso(p) {
    const passo = {
        id: str(p?.id) || novoId('p'),
        texto: str(p?.texto),
        detalhe: strOuNull(p?.detalhe),
        foto: strOuNull(p?.foto),
        video: strOuNull(p?.video),
        perigo: p?.perigo === true,
        itens: normalizarItens(p?.itens),
        pergunta: normalizarPergunta(p?.pergunta),
    };
    return passo;
}

/**
 * Normaliza o documento (nunca lança). Mantém os ids existentes e gera os que faltam.
 * Campos opcionais do adendo: ausentes/vazios são OMITIDOS.
 */
function normalizarDoc(doc, tipo) {
    const d = doc && typeof doc === 'object' ? doc : {};
    const out = { schema: 1 };
    const aviso = strOuNull(d.avisoPerigo);
    if (aviso) out.avisoPerigo = aviso;

    for (const campo of ['objetivo', 'materiais', 'naoFazer']) {
        const v = strOuNull(d[campo]);
        if (v) out[campo] = v.slice(0, MAX_LONGO);
    }
    if (Array.isArray(d.seDerErrado)) {
        const lista = d.seDerErrado
            .filter(x => x && typeof x === 'object')
            .map(x => ({ se: str(x.se), entao: str(x.entao) }))
            .filter(x => x.se || x.entao)
            .slice(0, MAX_SE_DER_ERRADO);
        if (lista.length) out.seDerErrado = lista;
    }

    const secoesIn = Array.isArray(d.secoes) ? d.secoes : [];
    out.secoes = secoesIn.filter(s => s && typeof s === 'object').map(s => ({
        id: str(s.id) || novoId('s'),
        bloco: BLOCOS.includes(String(s.bloco || '').toUpperCase()) ? String(s.bloco).toUpperCase() : 'PRINCIPAL',
        titulo: str(s.titulo),
        ...(strOuNull(s.icone) ? { icone: str(s.icone) } : {}),
        passos: (Array.isArray(s.passos) ? s.passos : []).filter(p => p && typeof p === 'object').map(normalizarPasso),
    }));

    // fora de ROTINA a pergunta não vale: remove (o validador avisa antes disso, ver validarDoc)
    if (tipo && tipo !== 'ROTINA') {
        for (const s of out.secoes) for (const p of s.passos) p.pergunta = null;
    }
    // fora de DOSAGEM não há itens
    if (tipo && tipo !== 'DOSAGEM') {
        for (const s of out.secoes) for (const p of s.passos) p.itens = null;
    }
    return out;
}

/**
 * Valida o documento JÁ recebido do cliente (antes de normalizar, para poder avisar sobre
 * `pergunta` em tipo errado). Devolve { erros: [], avisos: [] }.
 * erros = bloqueiam o publicar; avisos = publica mesmo assim.
 * `conteudo` = { tipo, horarios, responsaveisIds, recorrencia, diasSemana }
 */
function validarDoc(docBruto, conteudo) {
    const erros = [];
    const avisos = [];
    const tipo = conteudo?.tipo;
    const doc = normalizarDocSemLimpar(docBruto);
    const secoes = doc.secoes;

    const ids = new Set();
    const dup = (id, quem) => { if (ids.has(id)) erros.push(`Identificador repetido (${quem}).`); ids.add(id); };

    if (!secoes.length) erros.push('O conteúdo não tem nenhuma seção.');
    let semFoto = 0;
    let perguntasEmTipoErrado = 0;
    let totalPerguntas = 0;

    for (const s of secoes) {
        dup(s.id, 'seção');
        if (s.passos.length > MAX_PASSOS_SECAO) erros.push(`A seção "${s.titulo || s.bloco}" passa de ${MAX_PASSOS_SECAO} passos.`);
        s.passos.forEach((p, idx) => {
            const onde = `${s.titulo || s.bloco}, passo ${idx + 1}`;
            dup(p.id, 'passo');
            if (!p.texto) erros.push(`Falta a frase (${onde}).`);
            else if (p.texto.length > MAX_TEXTO) erros.push(`A frase passa de ${MAX_TEXTO} caracteres (${onde}).`);
            if (p.detalhe && p.detalhe.length > MAX_DETALHE) erros.push(`O detalhe passa de ${MAX_DETALHE} caracteres (${onde}).`);
            for (const campo of ['foto', 'video']) {
                if (p[campo] && !midiaValida(p[campo])) erros.push(`Arquivo de ${campo === 'foto' ? 'foto' : 'vídeo'} inválido (${onde}).`);
            }
            if (!p.foto) semFoto++;
            for (const it of (p.itens || [])) {
                dup(it.id, 'item');
                if (it.foto && !midiaValida(it.foto)) erros.push(`Foto de item inválida (${onde}).`);
            }
            if (p.pergunta) {
                if (tipo !== 'ROTINA') perguntasEmTipoErrado++;
                else {
                    totalPerguntas++;
                    const q = p.pergunta;
                    if (!q.rotulo) erros.push(`Falta o texto da pergunta (${onde}).`);
                    if (q.tipo === 'NUMERO') {
                        if (q.min === null || q.max === null) erros.push(`Pergunta de número sem mínimo ou máximo (${onde}).`);
                        else if (q.min > q.max) erros.push(`O mínimo é maior que o máximo (${onde}).`);
                    }
                }
            }
        });
    }

    if (tipo === 'ROTINA') {
        if (totalPerguntas === 0) erros.push('A rotina precisa de ao menos um passo com pergunta (número, sim/não ou foto).');
        if ((conteudo.horarios || []).length > 0 && (conteudo.responsaveisIds || []).length === 0) {
            erros.push('A rotina tem horário mas falta escolher o encarregado que recebe o aviso.');
        }
        if (conteudo.recorrencia === 'DIAS_SEMANA' && !(conteudo.diasSemana || []).length) {
            erros.push('Escolha ao menos um dia da semana para a rotina.');
        }
    }
    if (tipo === 'MAQUINA') {
        for (const bloco of ['MONTAR', 'USAR', 'LIMPAR']) {
            const sec = secoes.find(s => s.bloco === bloco);
            if (!sec || sec.passos.length < 1) erros.push(`A máquina precisa de ao menos 1 passo em "${bloco === 'MONTAR' ? 'Montar' : bloco === 'USAR' ? 'Usar' : 'Limpar'}".`);
        }
    } else {
        const principal = secoes.find(s => s.bloco === 'PRINCIPAL');
        if (!principal || principal.passos.length < 1) erros.push('A seção principal está vazia: acrescente ao menos 1 passo.');
    }

    if (semFoto > 0) avisos.push(`Sem foto: ${semFoto} passo(s).`);
    if (perguntasEmTipoErrado > 0) avisos.push('Perguntas só valem em Rotina; foram ignoradas neste tipo.');
    return { erros, avisos, semFoto };
}

// normaliza SEM descartar `pergunta`/`itens` de tipo errado (para o validador poder avisar)
function normalizarDocSemLimpar(doc) {
    return normalizarDoc(doc, null);
}

/** Atalho usado pelo PUT /rascunho e pelo publicar: normaliza + valida. */
function processarDoc(docBruto, conteudo) {
    const { erros, avisos, semFoto } = validarDoc(docBruto, conteudo);
    const doc = normalizarDoc(docBruto, conteudo?.tipo);
    return { doc, erros, avisos, semFoto };
}

// conta passos sem foto de um doc já normalizado (listagem do painel)
function contarSemFoto(doc) {
    let n = 0;
    for (const s of (doc?.secoes || [])) for (const p of (s.passos || [])) if (!p.foto) n++;
    return n;
}

// todos os passos com pergunta (usado na execução)
function perguntasDoDoc(doc) {
    const lista = [];
    for (const s of (doc?.secoes || [])) for (const p of (s.passos || [])) if (p.pergunta) lista.push({ passo: p, secao: s });
    return lista;
}

module.exports = {
    TIPOS, BLOCOS, MAX_TEXTO, MAX_DETALHE,
    novoId, docVazio, normalizarDoc, validarDoc, processarDoc, contarSemFoto, perguntasDoDoc, midiaValida,
};
