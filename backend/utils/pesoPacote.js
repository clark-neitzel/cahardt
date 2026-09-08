'use strict';

/**
 * Peso do pacote da etiqueta (PCP → Etiquetas) — validação ÚNICA das duas portas de entrada.
 *
 * O valor é gravado SEMPRE em GRAMAS inteiras (coluna `peso_pacote`, Int? no Prisma).
 * As duas portas usam unidades diferentes, de propósito, para bater com quem digita:
 *   - API do app (`/api/pcp/etiquetas`)      → recebe GRAMAS inteiras (o formulário já converte de kg).
 *   - Planilha de importação (`import-etiquetas`) → recebe KG com até 3 casas ("1,350" ou "1.35"),
 *     a MESMA unidade que a pessoa acabou de ver na tela.
 *
 * Regra de ouro (o bug que originou este arquivo): valor enviado e ilegível/fora da faixa
 * NUNCA vira `null` calado — vira ERRO. `null` é só para quem quer mesmo limpar o peso fixo.
 */

const PESO_PACOTE_MIN_G = 1;        // 0,001 kg
const PESO_PACOTE_MAX_G = 999999;   // 999,999 kg (cabe folgado no INT4 do Postgres)

// Como o valor recebido aparece na mensagem de erro (sem despejar objeto gigante no retorno).
function textoDoValor(v) {
    if (typeof v === 'object') return Array.isArray(v) ? 'lista' : 'objeto';
    return String(v).trim().slice(0, 40);
}

function ehVazio(v) {
    if (v === null || v === undefined) return true;
    return typeof v !== 'number' && String(v).trim() === '';
}

/**
 * Número não-negativo a partir de número ou texto. Devolve null quando não dá para ler.
 * Recusa de propósito: negativo, 'abc', '1e3', '1,', '1.350,5', true/false, objeto, NaN, Infinity.
 * @param {boolean} virgula — se a vírgula vale como separador decimal (planilha em kg).
 */
function numeroOuNull(v, { virgula }) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean' || typeof v === 'object') return null;

    let s = String(v).trim();
    if (virgula) {
        if (s.includes(',') && s.includes('.')) return null; // "1.350,5" é ambíguo — recusa
        s = s.replace(',', '.');
    }
    if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function foraDaFaixaGramas(gramas) {
    if (gramas < PESO_PACOTE_MIN_G) return 'min';
    if (gramas > PESO_PACOTE_MAX_G) return 'max';
    return null;
}

/**
 * Peso do pacote vindo da API, em GRAMAS.
 * @returns {{ok:true, gramas:number|null}|{ok:false, erro:string}}
 *   - ausente / null / '' → { ok:true, gramas:null } (limpa o peso fixo; único jeito de limpar)
 *   - 1..999999           → { ok:true, gramas:n }
 *   - qualquer outra coisa→ { ok:false, erro } (a rota devolve 400 com essa mensagem)
 */
function pesoPacoteDaApi(v) {
    if (ehVazio(v)) return { ok: true, gramas: null };

    const n = numeroOuNull(v, { virgula: false });
    if (n === null) {
        return {
            ok: false,
            erro: `Peso do pacote inválido ("${textoDoValor(v)}"): informe o peso em GRAMAS inteiras `
                + `(ex.: 1350 para 1,350 kg), ou null para deixar a etiqueta sem peso fixo.`,
        };
    }

    const gramas = Math.round(n);
    const fora = foraDaFaixaGramas(gramas);
    if (fora === 'min') {
        return {
            ok: false,
            erro: `Peso do pacote inválido ("${textoDoValor(v)}"): o mínimo é ${PESO_PACOTE_MIN_G} g (0,001 kg). `
                + `Para deixar a etiqueta sem peso fixo, envie null.`,
        };
    }
    if (fora === 'max') {
        return {
            ok: false,
            erro: `Peso do pacote inválido ("${textoDoValor(v)}"): o máximo é ${PESO_PACOTE_MAX_G} g (999,999 kg).`,
        };
    }
    return { ok: true, gramas };
}

/**
 * Peso do pacote vindo da planilha de importação, em KG (vírgula ou ponto, até 3 casas).
 * @returns {{ok:true, ausente:true}|{ok:true, gramas:number}|{ok:false, erro:string}}
 *   - célula ausente/vazia → { ok:true, ausente:true } → NÃO mexe no que já está gravado
 *   - "1,350" / "1.35" / 1.35 → { ok:true, gramas:1350 }
 *   - ilegível / fora da faixa / mais de 3 casas → { ok:false, erro } (vai para erros[])
 */
function pesoPacoteDaPlanilhaKg(v) {
    if (ehVazio(v)) return { ok: true, ausente: true };

    const n = numeroOuNull(v, { virgula: true });
    if (n === null) {
        return {
            ok: false,
            erro: `Peso do pacote inválido ("${textoDoValor(v)}"): informe em KG, com vírgula ou ponto `
                + `e até 3 casas decimais (ex.: 1,350 ou 1.350). Deixe a célula vazia para não mexer no valor já gravado.`,
        };
    }

    const emGramas = n * 1000;
    const gramas = Math.round(emGramas);
    const fora = foraDaFaixaGramas(gramas);
    if (fora === 'min') {
        return {
            ok: false,
            erro: `Peso do pacote inválido ("${textoDoValor(v)}" kg): o mínimo é 0,001 kg (1 g). `
                + `Deixe a célula vazia para não mexer no valor já gravado.`,
        };
    }
    if (fora === 'max') {
        return {
            ok: false,
            erro: `Peso do pacote inválido ("${textoDoValor(v)}" kg): o máximo é 999,999 kg.`,
        };
    }
    // 1,3505 kg não cabe em gramas inteiras — recusa em vez de arredondar calado.
    // A folga de 1e-6 existe porque 1.35 * 1000 dá 1350.0000000000002 em ponto flutuante.
    if (Math.abs(emGramas - gramas) > 1e-6) {
        return {
            ok: false,
            erro: `Peso do pacote inválido ("${textoDoValor(v)}" kg): use no máximo 3 casas decimais (ex.: 1,350).`,
        };
    }
    return { ok: true, gramas };
}

module.exports = {
    PESO_PACOTE_MIN_G,
    PESO_PACOTE_MAX_G,
    pesoPacoteDaApi,
    pesoPacoteDaPlanilhaKg,
};
