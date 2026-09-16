// Normalização de número de WhatsApp para a lista `cliente_whatsapps.numeros` — usada tanto pelo
// cadastro de cliente do app (clienteController.normalizarWhatsapps) quanto pelo endpoint da API
// de IA (iaClienteService.adicionarWhatsapp, v1.6.3), pra um número ficar com a mesma cara na tela
// de Clientes não importa quem gravou. Só tira o que não é dígito — de propósito NÃO retira o DDI
// 55 (aceita 10 a 13 dígitos: com/sem 9º dígito, com/sem 55, do jeito que a pessoa digitar).
function soDigitosWhatsapp(v) {
    return String(v ?? '').replace(/\D/g, '');
}

function whatsappValido(digitos) {
    return typeof digitos === 'string' && digitos.length >= 10 && digitos.length <= 13;
}

module.exports = { soDigitosWhatsapp, whatsappValido };
