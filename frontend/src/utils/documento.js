/**
 * Utilitário único de CPF/CNPJ (inclui CNPJ ALFANUMÉRICO — NT RFB / SERPRO).
 * Espelho de backend/utils/documento.js — mantenha os dois em sincronia.
 *
 * CNPJ: 14 posições; os 12 primeiros podem ter LETRAS A-Z; os 2 últimos (DV) sempre numéricos.
 * DV: cada caractere vale (ASCII - 48); módulo 11, pesos 2..9 da direita p/ esquerda.
 * Exemplo oficial válido: 12.ABC.345/01DE-35. CNPJ numérico legado continua válido.
 * CPF permanece 100% numérico (11 dígitos).
 *
 * ATENÇÃO: só para CPF/CNPJ. Telefone/CEP continuam com replace(/\D/g,'') próprio.
 */

/** Remove pontuação preservando LETRAS (para CNPJ alfanumérico). Uppercase. */
export function normalizarDoc(v) {
  return String(v == null ? '' : v).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Só dígitos. Use para CPF/telefone/CEP — NUNCA para CNPJ (apaga letras). */
export function soDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function valorDV(ch) {
  return ch.charCodeAt(0) - 48;
}

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

export function validarCpf(v) {
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

export function validarCnpj(v) {
  const cnpj = normalizarDoc(v);
  if (cnpj.length !== 14) return false;
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  if (calcularDV(cnpj.slice(0, 12)) !== +cnpj[12]) return false;
  return calcularDV(cnpj.slice(0, 13)) === +cnpj[13];
}

export function ehCnpj(v) {
  return normalizarDoc(v).length === 14;
}

export function ehCpf(v) {
  const d = normalizarDoc(v);
  return d.length === 11 && /^[0-9]{11}$/.test(d);
}

export function validarDoc(v) {
  const d = normalizarDoc(v);
  if (d.length === 11) return validarCpf(d);
  if (d.length === 14) return validarCnpj(d);
  return false;
}

/** Formata p/ exibição. CNPJ XX.XXX.XXX/XXXX-XX (alfa) ou CPF XXX.XXX.XXX-XX. */
export function formatarDoc(v) {
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
 * Máscara viva p/ digitação (onChange): tem letra => CNPJ; só dígitos e <=11 => CPF; senão CNPJ.
 */
export function mascaraDoc(v) {
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
