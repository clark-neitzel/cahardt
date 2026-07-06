// Segredo de assinatura dos JWTs (login do app, tokens de cliente, etc.).
//
// SEM fallback embutido: se JWT_SECRET não estiver no ambiente, o servidor
// NÃO sobe. Antes existia uma frase reserva pública no código
// ('fallback_secret_key_hardt_app_123') — se a variável faltasse, qualquer
// pessoa poderia forjar um token de admin. Falhar no boot é mais seguro do
// que rodar com um segredo conhecido.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('[FATAL] JWT_SECRET não configurado no ambiente. Defina a variável JWT_SECRET antes de iniciar o servidor.');
}
if (JWT_SECRET.length < 16) {
    console.warn('[SEGURANÇA] JWT_SECRET tem menos de 16 caracteres — considere um segredo mais longo e aleatório.');
}

module.exports = JWT_SECRET;
