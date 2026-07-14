/**
 * Utilitário único de CPF/CNPJ (inclui CNPJ ALFANUMÉRICO — NT RFB / SERPRO).
 *
 * Regra oficial (Manual de Cálculo do DV do CNPJ, SERPRO):
 *   - CNPJ tem 14 posições. Os 12 primeiros caracteres podem ser LETRAS (A-Z) ou dígitos;
 *     os 2 últimos (dígitos verificadores) continuam SEMPRE numéricos.
 *   - No cálculo do DV, cada caractere vale (código ASCII - 48):  '0'..'9' => 0..9,  'A'..'Z' => 17..42.
 *   - Módulo 11, pesos 2..9 da direita para a esquerda (reiniciando).
 *   - Exemplo oficial válido: 12.ABC.345/01DE-35
 *   - CNPJ numérico legado continua válido (coexistência permanente).
 *
 * CPF permanece 100% numérico (11 dígitos).
 *
 * IMPORTANTE: este módulo é SÓ para CPF/CNPJ. Telefone, CEP, NSU continuam
 * numéricos e devem seguir usando um `replace(/\D/g,'')` próprio.
 */

/** Remove pontuação de um documento preservando LETRAS (para CNPJ alfanumérico). Uppercase. */
function normalizarDoc(v) {
    return String(v == null ? '' : v).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Remove tudo que não é dígito. Use para CPF, telefone, CEP — NUNCA para CNPJ (apaga letras). */
function soDigitos(v) {
    return String(v == null ? '' : v).replace(/\D/g, '');
}

/** Valor de cada caractere para o cálculo do DV (ASCII - 48). */
function valorDV(ch) {
    return ch.charCodeAt(0) - 48;
}

/** Calcula um dígito verificador (módulo 11) sobre a base já normalizada. */
function calcularDV(base) {
    let soma = 0;
    let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) {
        soma += valorDV(base[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
}

/** Valida CPF (numérico, 11 dígitos, com DV). */
function validarCpf(v) {
    const cpf = soDigitos(v);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += +cpf[i] * (10 - i);
    let d1 = (soma * 10) % 11;
    if (d1 === 10) d1 = 0;
    if (d1 !== +cpf[9]) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += +cpf[i] * (11 - i);
    let d2 = (soma * 10) % 11;
    if (d2 === 10) d2 = 0;
    return d2 === +cpf[10];
}

/** Valida CNPJ numérico OU alfanumérico (14 posições, DV numérico). */
function validarCnpj(v) {
    const cnpj = normalizarDoc(v);
    if (cnpj.length !== 14) return false;
    // 12 primeiros: letras ou dígitos; 2 últimos (DV): só dígitos.
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
    // Rejeita repetição de dígito (00000000000000 etc.) — herdado do comportamento legado.
    if (/^(\d)\1{13}$/.test(cnpj)) return false;
    if (calcularDV(cnpj.slice(0, 12)) !== +cnpj[12]) return false;
    return calcularDV(cnpj.slice(0, 13)) === +cnpj[13];
}

/** É um CNPJ (numérico ou alfanumérico) pelo comprimento normalizado? */
function ehCnpj(v) {
    return normalizarDoc(v).length === 14;
}

/** É um CPF pelo comprimento normalizado? */
function ehCpf(v) {
    const d = normalizarDoc(v);
    return d.length === 11 && /^[0-9]{11}$/.test(d);
}

/** Valida CPF (11) ou CNPJ (14), inclusive DV. */
function validarDoc(v) {
    const d = normalizarDoc(v);
    if (d.length === 11) return validarCpf(d);
    if (d.length === 14) return validarCnpj(d);
    return false;
}

/**
 * Formata para exibição: CNPJ XX.XXX.XXX/XXXX-XX (alfanumérico) ou CPF XXX.XXX.XXX-XX.
 * Outros comprimentos: devolve o valor original.
 */
function formatarDoc(v) {
    const s = normalizarDoc(v);
    if (s.length === 14) {
        return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
    }
    if (s.length === 11) {
        return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
    }
    return v == null ? '' : String(v);
}

/**
 * Máscara viva para digitação (onChange). Decide CPF x CNPJ:
 *   - tem letra => sempre CNPJ;
 *   - só dígitos e <= 11 => CPF;  senão => CNPJ.
 */
function mascaraDoc(v) {
    const s = normalizarDoc(v).slice(0, 14);
    const temLetra = /[A-Z]/.test(s);
    let out = '';
    if (!temLetra && s.length <= 11) {
        for (let i = 0; i < s.length; i++) {
            if (i === 3 || i === 6) out += '.';
            if (i === 9) out += '-';
            out += s[i];
        }
        return out;
    }
    for (let i = 0; i < s.length; i++) {
        if (i === 2 || i === 5) out += '.';
        if (i === 8) out += '/';
        if (i === 12) out += '-';
        out += s[i];
    }
    return out;
}

/**
 * Normaliza a CHAVE de acesso da NF-e (44 posições). Com a NT 2026.004 a chave
 * passa a ser alfanumérica quando o emitente tem CNPJ alfanumérico — por isso
 * preservamos letras aqui também. Retorna '' se não tiver 44 posições.
 */
function normalizarChaveNFe(v) {
    const s = normalizarDoc(v);
    return s.length === 44 ? s : '';
}

module.exports = {
    normalizarDoc,
    soDigitos,
    calcularDV,
    validarCpf,
    validarCnpj,
    validarDoc,
    ehCnpj,
    ehCpf,
    formatarDoc,
    mascaraDoc,
    normalizarChaveNFe,
};
