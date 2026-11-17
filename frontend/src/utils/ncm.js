// NCM: 8 dígitos numéricos. Vazio é permitido. Mesma regra do backend.
export const MSG_NCM_INVALIDO = 'NCM deve ter 8 dígitos (ex.: 19022000)';

// Remove tudo que não é dígito ('1902.20.00' -> '19022000')
export function normalizarNcm(valor) {
    return String(valor ?? '').replace(/[\s.]/g, '');
}

// Vazio é válido; preenchido precisa ter exatamente 8 dígitos
export function ncmValido(valor) {
    const n = normalizarNcm(valor);
    return n === '' || /^\d{8}$/.test(n);
}

// Mensagem de erro para exibir inline (ou '' quando ok/vazio)
export function erroNcm(valor) {
    return ncmValido(valor) ? '' : MSG_NCM_INVALIDO;
}
