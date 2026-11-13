// Chave tolerante de telefone brasileiro — a MESMA conta de iaClienteService.chaveTelefone
// e whatsappSeloService.chaveTelefone (com/sem DDI 55, com/sem o 9º dígito do celular).
// Fica aqui para o contato do cliente casar o número do jeito que a pessoa digitar,
// sem duplicar a regra numa quarta cópia dentro do service.
function soDigitos(raw) {
    return String(raw ?? '').replace(/\D/g, '');
}

function chaveTelefone(raw) {
    let d = soDigitos(raw);
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
    return d;
}

module.exports = { soDigitos, chaveTelefone };
