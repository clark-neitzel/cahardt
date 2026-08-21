/**
 * Parser do campo de bipe da CONFERÊNCIA DE CARGA — lado do navegador.
 *
 * ESPELHO de `backend/utils/codigoCarga.js` (mesma doutrina de `utils/chaveNfe.js`):
 * mantenha os dois em sincronia. Aqui a leitura serve só para dar RETORNO INSTANTÂNEO
 * na tela — quem está na doca com o volume na mão não pode esperar a rede para
 * descobrir que passou o leitor torto. **A AUTORIDADE É SEMPRE O BACKEND**: quem
 * decide o que aquele código é, e se ele pertence à carga, é a resposta de
 * `POST /api/embarques/:id/conferir`.
 *
 * ⚠️ DE PROPÓSITO NÃO RESOLVE O ITEM. Um número solto (`100`) pode ser o pedido `#100`,
 * o especial `ZZ#100`, a bonificação `BN#100` E a amostra `AM#100` ao mesmo tempo —
 * são numerações independentes. Só o servidor pode desempatar, e só entre os itens da
 * carga aberta. Adivinhar aqui colocaria o pedido errado dentro do caminhão.
 *
 * O leitor pode entregar três coisas:
 *   1. CHAVE da NF-e (44 dígitos, Code-128C da DANFE);
 *   2. CÓDIGO DO RECIBO (`ZZ4821` / `BN4821` / `AM4821` — o "#" só existe na legenda);
 *   3. NÚMERO SOLTO digitado na mão, quando o código está rasgado.
 *
 * Nunca lança: no pior caso devolve `{ tipo: 'INVALIDO', motivo }`.
 */

import { interpretarBipe, dvValido } from './chaveNfe';

/**
 * Limpa o que o leitor USB entrega: espaço, "#", "-", ponto, CR/LF (o Enter automático
 * do leitor) e caixa baixa. Mantém letras e dígitos.
 */
export function normalizar(texto) {
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
 * @returns {object} um destes formatos (idênticos aos do backend):
 *   { tipo: 'RECIBO',   prefixo: 'ZZ'|'BN'|'AM', numero, bruto }
 *   { tipo: 'CHAVE',    chave, numero, serie, bruto }
 *   { tipo: 'NUMERO',   numero, bruto }        ← só resolvível DENTRO da carga (servidor)
 *   { tipo: 'INVALIDO', motivo: 'VAZIO'|'DV'|'FORMATO', bruto }
 */
export function interpretarCodigoCarga(texto) {
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

/**
 * Identidade estável da leitura — é a chave da janela anti-repetição do laser e da
 * trava síncrona de "já tem um POST deste código em voo".
 */
export function identidadeDoCodigo(lido) {
    if (!lido) return '';
    if (lido.tipo === 'CHAVE') return `c:${lido.chave}`;
    if (lido.tipo === 'RECIBO') return `${lido.prefixo}:${lido.numero}`;
    if (lido.tipo === 'NUMERO') return `n:${lido.numero}`;
    return `x:${lido.bruto || ''}`;
}

export default { normalizar, interpretarCodigoCarga, identidadeDoCodigo };
