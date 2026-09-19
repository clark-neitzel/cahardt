// Comparação de segredo/token em tempo constante (evita ataque de timing).
// Usa hash SHA-256 para os buffers terem sempre o mesmo tamanho, sem vazar
// o comprimento do segredo. Padrão único — usado por todo webhook/rota
// protegida por header de segredo (admin-exec, Focus NFe, Asaas...).
const crypto = require('crypto');

function segredoConfere(recebido, esperado) {
    if (typeof recebido !== 'string' || typeof esperado !== 'string') return false;
    const a = crypto.createHash('sha256').update(recebido).digest();
    const b = crypto.createHash('sha256').update(esperado).digest();
    return crypto.timingSafeEqual(a, b);
}

module.exports = { segredoConfere };
