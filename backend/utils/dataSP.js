/**
 * Datas no fuso de São Paulo (strings 'YYYY-MM-DD'). Extraído de routes/dashboards.js
 * (11/2026) para ser usado também pelo carteiraService — comportamento idêntico ao original.
 */
const TZ = 'America/Sao_Paulo';

const isoNowTZ = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const inicioDiaSP = (ymd) => new Date(`${ymd}T00:00:00-03:00`);
const fimDiaSP = (ymd) => new Date(`${ymd}T23:59:59.999-03:00`);
const somaDiasISO = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00-03:00`);
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
};
const somaMesesYM = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const segundaDaSemana = (ymd) => {
    const d = new Date(`${ymd}T12:00:00-03:00`);
    const dow = d.getDay(); // 0=dom..6=sab
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
};
const diasNoMes = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
};
/** Diferença em dias corridos (b - a) entre duas datas 'YYYY-MM-DD'. */
const diffDias = (a, b) => Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 86400000);

module.exports = { TZ, isoNowTZ, inicioDiaSP, fimDiaSP, somaDiasISO, somaMesesYM, segundaDaSemana, diasNoMes, diffDias };
