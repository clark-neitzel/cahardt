// O que um telefone do cadastro precisa ter para receber WhatsApp (nov/2026, pergunta do Clarkson).
//
// A Z-API (que o bot da Ana usa) exige o número no formato DDI + DDD + número, só dígitos:
// "5547999998888". O cadastro guarda quase sempre SEM o 55 ("47 99999-8888"): isso é seguro —
// o 55 é colocado na hora do envio. O que NÃO dá para adivinhar é número sem DDD, com DDD que
// não existe, com dígito a menos/a mais, ou o caso "55" no lugar do DDD (ex.: "55996293920" do
// Posto 44 Richter, em Joinville: é 55 + celular sem DDD — se o sistema colocasse o 55 na frente,
// a mensagem iria para o DDD 55, no RS). Esses vão para a Leticia acertar.
//
// Mesma régua no bot (backend/src/services/telefoneBR.js do hardt-wpp-bot). Pura, sem banco.

// DDDs brasileiros em uso (Anatel).
const DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const MOTIVOS = {
    sem_ddd: 'Falta o DDD',
    ddd_55: 'Parece que falta o DDD (tem 55 no lugar do DDD)',
    ddd_invalido: 'DDD não existe',
    tamanho: 'Quantidade de dígitos errada',
    celular_sem_9: 'Celular com 9 dígitos precisa começar com 9',
    numero_invalido: 'Número inválido',
};

/**
 * Avalia um telefone do cadastro.
 *  - `uf`: estado do cliente (opcional). Só serve para aceitar o DDD 55 de quem é do RS.
 * Devolve { status, numero, motivo, rotulo }:
 *  - status 'ok'          → já estava com 55 + DDD + número;
 *  - status 'normalizado' → tinha DDD + número; o 55 foi colocado (seguro, sem incomodar ninguém);
 *  - status 'incompleto'  → não dá para mandar com segurança (motivo/rotulo dizem por quê);
 *  - status 'vazio'       → sem número.
 * `numero` = só dígitos com 55 (o formato da Z-API) quando dá para usar; senão null.
 */
function avaliarTelefone(raw, { uf } = {}) {
    let d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return { status: 'vazio', numero: null, motivo: null, rotulo: null };
    d = d.replace(/^0+/, ''); // "047 ..." (zero do interurbano)
    const incompleto = (motivo) => ({ status: 'incompleto', numero: null, motivo, rotulo: MOTIVOS[motivo] });
    let nacional;
    let status;
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) { nacional = d.slice(2); status = 'ok'; }
    else if (d.length === 10 || d.length === 11) { nacional = d; status = 'normalizado'; }
    else if (d.length === 8 || d.length === 9) return incompleto('sem_ddd');
    else return incompleto('tamanho');
    if (new Set(nacional).size === 1) return incompleto('numero_invalido'); // 0000000000, 9999999999…
    const ddd = Number(nacional.slice(0, 2));
    const numero = nacional.slice(2);
    if (!DDDS.has(ddd)) return incompleto('ddd_invalido');
    if (numero.length === 9 && numero[0] !== '9') return incompleto('celular_sem_9');
    if (numero[0] === '0' || numero[0] === '1') return incompleto('numero_invalido');
    // "55" + número sem DDD ("55996293920") é indistinguível de DDD 55 (RS). Só aceita o DDD 55
    // se o cadastro diz que o cliente é do RS.
    if (status === 'normalizado' && ddd === 55 && String(uf || '').trim().toUpperCase() !== 'RS') return incompleto('ddd_55');
    return { status, numero: `55${nacional}`, motivo: null, rotulo: null };
}

/** Atalho: número pronto para a Z-API (55 + DDD + número) ou null. */
function numeroWhatsapp(raw, opts) {
    return avaliarTelefone(raw, opts).numero;
}

module.exports = { DDDS, MOTIVOS, avaliarTelefone, numeroWhatsapp };
