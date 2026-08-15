/**
 * Utilitário único da CHAVE DE ACESSO da NF-e (44 dígitos).
 *
 * Usado pelo módulo "Canhoto da Nota Fiscal": o escritório bipa o código de barras
 * da DANFE (Code-128C com a chave crua) e o sistema precisa saber, ANTES de ir ao
 * banco, se aquilo é uma chave de verdade — leitor a laser passado torto devolve
 * dígito a mais/a menos e viraria "nota não encontrada" sem explicação.
 *
 * Layout oficial da chave (NT 2003.001 / Manual da NF-e):
 *   cUF 2 · AAMM 4 · CNPJ 14 · mod 2 · série 3 · nNF 9 · tpEmis 1 · cNF 8 · DV 1 = 44
 *   0-2    2-6      6-20       20-22   22-25    25-34   34-35     35-43    43-44
 *
 * DV: módulo 11, pesos 2..9 da direita para a esquerda (reiniciando), sobre os 43
 * primeiros dígitos. Resto 0 ou 1 → DV 0; senão 11 - resto.
 *
 * Espelhado em `frontend/src/utils/chaveNfe.js` (mesmo padrão de `documento.js`).
 * A validação do FRONT é só para retorno instantâneo — a autoridade é sempre o backend.
 */

/** Só os dígitos. Cobre o prefixo "NFe..." que o webhook da Focus manda e o Enter do leitor USB. */
function limpar(txt) {
    return String(txt == null ? '' : txt).replace(/\D/g, '');
}

/** Tem exatamente 44 dígitos? (não valida o DV — para isso use `dvValido`) */
function ehChave(txt) {
    return limpar(txt).length === 44;
}

/** Dígito verificador calculado sobre os 43 primeiros dígitos. */
function calcularDV(base43) {
    let soma = 0;
    let peso = 2;
    for (let i = base43.length - 1; i >= 0; i--) {
        soma += Number(base43[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
}

/** A chave passa no módulo 11? Barra leitura torta antes de consultar o banco. */
function dvValido(txt) {
    const c = limpar(txt);
    if (c.length !== 44) return false;
    return calcularDV(c.slice(0, 43)) === Number(c[43]);
}

/** Número da nota (nNF) embutido na chave. */
function numeroDaChave(txt) {
    const c = limpar(txt);
    if (c.length !== 44) return null;
    const n = Number(c.slice(25, 34));
    return Number.isFinite(n) ? n : null;
}

/** Série embutida na chave. */
function serieDaChave(txt) {
    const c = limpar(txt);
    if (c.length !== 44) return null;
    const n = Number(c.slice(22, 25));
    return Number.isFinite(n) ? n : null;
}

/**
 * AAMM da EMISSÃO embutido na chave (posições 2..6) — ex.: '2605'.
 *
 * É a única fonte confiável do mês em que a nota foi emitida, e a pasta física do
 * arquivo é organizada por esse mês. As alternativas erram:
 *   - `Pedido.dataVenda` é a data de ENTREGA (nota emitida em 31/07 para entregar 01/08);
 *   - `NotaFiscalApp.criadoEm` é o da 1ª tentativa (nota rejeitada em 31/07 e reemitida
 *     em 01/08 reaproveita a mesma linha, com a data velha).
 * Errar aqui manda a equipe guardar o papel na pasta errada — e depois não achar.
 */
function aammDaChave(txt) {
    const c = limpar(txt);
    if (c.length !== 44) return null;
    const aamm = c.slice(2, 6);
    const mes = Number(aamm.slice(2));
    if (!(mes >= 1 && mes <= 12)) return null;
    return aamm;
}

/** Competência 'YYYY-MM' derivada da própria chave. `null` quando a chave não serve. */
function competenciaDaChave(txt) {
    const aamm = aammDaChave(txt);
    if (!aamm) return null;
    return `20${aamm.slice(0, 2)}-${aamm.slice(2)}`;
}

/**
 * Interpreta o que caiu no campo de bipe.
 *
 * - 44 dígitos com DV bom  → { tipo: 'chave',  chave, numero, serie }
 * - 44 dígitos com DV ruim → { tipo: 'invalido', motivo: 'DV' }        (leitura torta)
 * - 1 a 9 dígitos          → { tipo: 'numero', numero }                 (código rasgado, digitado)
 * - qualquer outra coisa   → { tipo: 'invalido', motivo: 'TAMANHO' }
 */
function interpretarBipe(txt) {
    const c = limpar(txt);
    if (!c) return { tipo: 'invalido', motivo: 'VAZIO' };
    if (c.length === 44) {
        if (!dvValido(c)) return { tipo: 'invalido', motivo: 'DV' };
        return { tipo: 'chave', chave: c, numero: numeroDaChave(c), serie: serieDaChave(c) };
    }
    if (c.length <= 9) {
        const n = Number(c);
        if (!Number.isFinite(n) || n <= 0) return { tipo: 'invalido', motivo: 'TAMANHO' };
        return { tipo: 'numero', numero: n };
    }
    return { tipo: 'invalido', motivo: 'TAMANHO' };
}

module.exports = { limpar, ehChave, calcularDV, dvValido, numeroDaChave, serieDaChave, aammDaChave, competenciaDaChave, interpretarBipe };
