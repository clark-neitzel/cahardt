// NCM (Nomenclatura Comum do Mercosul): exatamente 8 dígitos. Fonte única da regra
// (gravadores de produto, entrada de notas e emissão de NF-e).

/** Remove só pontos e espaços (igual ao frontend). '1902.20.00' -> '19022000'; '1902-20-00' e 'A1902200' continuam inválidos. null/undefined -> ''. */
function normalizarNcm(v) {
    return String(v ?? '').replace(/[\s.]/g, '');
}

/** true só se, depois de normalizar, tem exatamente 8 dígitos. */
function ncmValido(v) {
    return /^\d{8}$/.test(normalizarNcm(v));
}

/**
 * Resolve o NCM que vai na nota para um item.
 *  - produto: NCM do cadastro válido
 *  - padrao:  NCM do cadastro VAZIO -> usa cfg.ncmPadrao
 *  - invalido: NCM preenchido mas inválido (a venda/bonificação recusa; a devolução cai no padrão)
 * Em 'invalido' o campo `ncm` já traz o ncmPadrao (para a devolução usar direto) e `bruto` o que estava no cadastro.
 */
function ncmDoItem(item, cfg) {
    const bruto = item?.produto?.ncm;
    const dig = normalizarNcm(bruto);
    if (String(bruto ?? '').trim() === '') return { ncm: cfg.ncmPadrao, origem: 'padrao', bruto: '' };
    if (/^\d{8}$/.test(dig)) return { ncm: dig, origem: 'produto', bruto: dig };
    return { ncm: cfg.ncmPadrao, origem: 'invalido', bruto: String(bruto).trim() };
}

module.exports = { normalizarNcm, ncmValido, ncmDoItem };
