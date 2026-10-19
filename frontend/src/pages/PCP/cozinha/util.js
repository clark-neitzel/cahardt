// Utilidades da aba Etiquetas da Cozinha.
// Datas SEMPRE como texto 'YYYY-MM-DD' — nunca new Date('YYYY-MM-DD') (UTC erra o dia à noite).

export const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const DIAS_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
// Cor do dia (padrão da cozinha): seg azul, ter amarelo, qua vermelho, qui marrom, sex verde, sáb laranja, dom preto
export const CORES_DIA = ['#111111', '#2563eb', '#eab308', '#dc2626', '#92400e', '#16a34a', '#ea580c'];

const pad = (n) => String(n).padStart(2, '0');

// Hoje no fuso de São Paulo, como 'YYYY-MM-DD'
export function hojeIso() {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
}

function partes(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    return { a: +m[1], m: +m[2], d: +m[3] };
}

export function somarDias(iso, n) {
    const p = partes(iso);
    if (!p) return iso;
    const t = new Date(Date.UTC(p.a, p.m - 1, p.d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diaSemana(iso) {
    const p = partes(iso);
    if (!p) return 0;
    return new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay();
}

export function dm(iso) {
    const p = partes(iso);
    return p ? `${pad(p.d)}/${pad(p.m)}` : '';
}

export function dmy(iso) {
    const p = partes(iso);
    return p ? `${pad(p.d)}/${pad(p.m)}/${p.a}` : '';
}

export function pesoTexto(gramas) {
    if (gramas == null || !(Number(gramas) > 0)) return '';
    const kg = Number(gramas) / 1000;
    return `${kg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} kg`;
}

// Peso digitado em kg ("2", "2,5", "0.75") -> gramas inteiros, ou null
export function kgParaGramas(txt) {
    const n = parseFloat(String(txt ?? '').replace(',', '.'));
    if (!(n > 0)) return null;
    return Math.round(n * 1000);
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export { norm };

const EMOJIS = [
    [/camar/, '🦐'], [/queijo|catupiry|mussarela/, '🧀'], [/frango|galinha/, '🍗'], [/carne|bovin|boi|calabresa|bacon|presunto/, '🥩'],
    [/tomate|molho/, '🍅'], [/cebola/, '🧅'], [/ovo/, '🥚'], [/caldo|sopa/, '🍲'], [/palmito|milho|legume|verdura/, '🌽'],
    [/massa|pastel|coxinha|kibe|pao|pão/, '🫓'],
];

export function emojiDoItem(item) {
    const n = norm(item?.nome);
    for (const [re, e] of EMOJIS) if (re.test(n)) return e;
    if (item?.grupoCozinha === 'MASSA') return '🫓';
    if (item?.grupoCozinha === 'RECHEIO') return '🥣';
    return '🍽️';
}

export function rotuloGrupo(g) {
    return g === 'RECHEIO' ? 'Recheio' : g === 'MASSA' ? 'Massa' : g === 'OUTRO' ? 'Outro' : '';
}

// Validade sugerida do item para a conservação; null = item sem prazo cadastrado (não inventar)
export function validadeSugerida(item, conservacao) {
    const v = conservacao === 'CONGELADO' ? item?.validadeCongeladoDias : item?.validadeRefrigeradoDias;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export const TAMANHOS_COZINHA = {
    '40x25': { id: '40x25', titulo: 'Pequena · 40 × 25 mm', sub: 'Pote, bisnaga, saco.', curto: '40×25' },
    '100x120': { id: '100x120', titulo: 'Grande · 100 × 120 mm', sub: 'Caixa, bombona, monobloco.', curto: '100×120' },
};
