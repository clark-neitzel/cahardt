// Formatadores pt-BR da tela de Indicadores. Valor ausente (null/undefined/NaN) = "—",
// nunca "0" enganando nem "undefined" na tela.
const ok = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export const fmtNum = (v, casas = 2) =>
    ok(v) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '—';
export const fmtRS = (v, casas = 2) => (ok(v) ? `R$ ${fmtNum(v, casas)}` : '—');
// Compacto: R$ 379,3 mil / R$ 1,2 mi / R$ 640
export const fmtRSk = (v) => {
    if (!ok(v)) return '—';
    const n = Number(v), a = Math.abs(n);
    if (a >= 1_000_000) return `R$ ${fmtNum(n / 1_000_000, 2)} mi`;
    if (a >= 1000) return `R$ ${fmtNum(n / 1000, 1)} mil`;
    return `R$ ${fmtNum(n, 0)}`;
};
export const fmtPct = (v, casas = 1) => (ok(v) ? `${fmtNum(v, casas)}%` : '—');
export const fmtPctSinal = (v, casas = 1) => (ok(v) ? `${Number(v) > 0 ? '+' : ''}${fmtNum(v, casas)}%` : '—');
export const fmtInt = (v) => (ok(v) ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—');
export const fmtData = (iso) => {
    if (!iso || typeof iso !== 'string') return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return d && m ? `${d}/${m}` : '';
};
export const temValor = ok;

// Semáforo: SEMPRE a palavra, nunca só a cor.
export const SEMAFORO = {
    ok: { palavra: 'no alvo', cls: 'bg-green-100 text-green-800' },
    atencao: { palavra: 'atenção', cls: 'bg-amber-100 text-amber-700' },
    agir: { palavra: 'agir', cls: 'bg-red-100 text-red-700' },
    sem_dado: { palavra: 'sem dado', cls: 'bg-gray-100 text-gray-700' },
};
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
