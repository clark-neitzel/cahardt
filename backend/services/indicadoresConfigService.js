/**
 * Indicadores de Gestão — configuração (alíquota única de imposto sobre a venda).
 * Guardada em app_configs (key = indicadores_aliquota_imposto_venda, value = { aliquota }).
 * 0 / ausente = usar o imposto realmente pago (bloco "Impostos sobre vendas" da DRE).
 */
const prisma = require('../config/database');

const CHAVE = 'indicadores_aliquota_imposto_venda';

/** @returns {Promise<number|null>} percentual (ex.: 6.0) ou null quando não cadastrada/zero */
async function getAliquota() {
    const row = await prisma.appConfig.findUnique({ where: { key: CHAVE } });
    const v = row?.value && typeof row.value === 'object' ? Number(row.value.aliquota) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
}

/** Valida 0–40, 1 casa. Lança Error com mensagem amigável quando inválida. */
async function setAliquota(pct) {
    if (pct === null || pct === '' || pct === undefined) pct = 0;
    const n = Number(pct);
    if (!Number.isFinite(n)) throw new Error('Informe um número para a alíquota.');
    if (n < 0 || n > 40) throw new Error('A alíquota precisa estar entre 0 e 40%.');
    const valor = Math.round(n * 10) / 10;
    await prisma.appConfig.upsert({
        where: { key: CHAVE },
        update: { value: { aliquota: valor } },
        create: { key: CHAVE, value: { aliquota: valor } }
    });
    return valor > 0 ? valor : null;
}

module.exports = { getAliquota, setAliquota, CHAVE };
