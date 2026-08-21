/**
 * Parser único do campo de bipe da CONFERÊNCIA DE CARGA (doca, 08/2026).
 *
 * Na doca a pessoa abre a carga e bipa cada volume ao colocar no caminhão. O leitor
 * pode entregar três coisas diferentes:
 *
 *   1. A CHAVE DA NF-e (44 dígitos) — código de barras Code-128C da DANFE.
 *   2. O CÓDIGO DO RECIBO — Code128-B impresso em `services/reciboEspecialPdf.js`,
 *      com payload SEM o "#": `ZZ4821` (especial), `BN4821` (bonificação),
 *      `AM4821` (amostra). O "#" só existe na legenda humana embaixo do código.
 *   3. Um NÚMERO SOLTO digitado na mão (código rasgado/borrado).
 *
 * ⚠️ REGRA DE OURO DO NÚMERO SOLTO: `ZZ#100`, `BN#100`, `AM#100` e o pedido comum
 * `#100` COEXISTEM (numerações independentes — ver `services/pedidoService.js`).
 * Por isso um número solto NUNCA pode ser buscado globalmente: quem resolve é o
 * serviço, e SÓ entre os itens da carga aberta. Se casar com dois itens (ou nenhum),
 * o serviço devolve PEDE_PREFIXO e pede o prefixo à pessoa. Buscar global aqui
 * colocaria o pedido errado dentro do caminhão.
 *
 * Nunca lança: no pior caso devolve `{ tipo: 'INVALIDO', motivo }`.
 */

const { interpretarBipe, dvValido } = require('./chaveNfe');

/**
 * Limpa o que o leitor USB entrega: espaço, "#", "-", CR/LF (o Enter automático do
 * leitor) e caixa baixa. Mantém letras e dígitos.
 */
function normalizar(texto) {
    return String(texto == null ? '' : texto)
        .trim()
        .toUpperCase()
        .replace(/[\s#\-\r\n\t.]/g, '');
}

const RE_RECIBO = /^(ZZ|BN|AM)0*(\d{1,9})$/;
const RE_NUMERO = /^0*(\d{1,9})$/;

/**
 * Interpreta o texto bipado.
 *
 * @returns {object} um destes formatos:
 *   { tipo: 'RECIBO',   prefixo: 'ZZ'|'BN'|'AM', numero: Number, bruto }
 *   { tipo: 'CHAVE',    chave: '44 dígitos', numero: Number|null, serie: Number|null, bruto }
 *   { tipo: 'NUMERO',   numero: Number, bruto }      ← só resolvível DENTRO da carga
 *   { tipo: 'INVALIDO', motivo: 'VAZIO'|'DV'|'FORMATO', bruto }
 */
function interpretarCodigoCarga(texto) {
    const bruto = String(texto == null ? '' : texto).trim();
    const c = normalizar(texto);
    if (!c) return { tipo: 'INVALIDO', motivo: 'VAZIO', bruto };

    const recibo = c.match(RE_RECIBO);
    if (recibo) {
        const numero = Number(recibo[2]);
        if (!Number.isFinite(numero) || numero <= 0) return { tipo: 'INVALIDO', motivo: 'FORMATO', bruto };
        return { tipo: 'RECIBO', prefixo: recibo[1], numero, bruto };
    }

    if (/^\d{44}$/.test(c)) {
        // Delega ao utilitário oficial da chave (DV módulo 11, nNF, série).
        if (!dvValido(c)) return { tipo: 'INVALIDO', motivo: 'DV', bruto };
        const lido = interpretarBipe(c);
        if (lido.tipo !== 'chave') return { tipo: 'INVALIDO', motivo: 'DV', bruto };
        return { tipo: 'CHAVE', chave: lido.chave, numero: lido.numero, serie: lido.serie, bruto };
    }

    const numero = c.match(RE_NUMERO);
    if (numero) {
        const n = Number(numero[1]);
        if (!Number.isFinite(n) || n <= 0) return { tipo: 'INVALIDO', motivo: 'FORMATO', bruto };
        return { tipo: 'NUMERO', numero: n, bruto };
    }

    return { tipo: 'INVALIDO', motivo: 'FORMATO', bruto };
}

module.exports = { interpretarCodigoCarga, normalizar };
