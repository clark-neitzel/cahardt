/**
 * Utilitário único da CHAVE DE ACESSO da NF-e (44 dígitos) — lado do navegador.
 *
 * ESPELHO de `backend/utils/chaveNfe.js` (mesmo padrão de `documento.js`):
 * mantenha os dois em sincronia. Aqui a validação serve só para dar RETORNO
 * INSTANTÂNEO na tela — quem bipa um maço de papel não pode esperar a rede a cada
 * folha para descobrir que passou o leitor torto. **A autoridade é sempre o backend**:
 * o que decide o estado da nota é a resposta de `POST /api/canhotos/bipar`.
 *
 * ⚠️ DE PROPÓSITO NÃO TEM `aammDaChave`/`competenciaDaChave` (que existem no backend).
 * **Pasta física e competência não se calculam aqui.** Quem manda no mês do arquivo é
 * o servidor: a tela apenas EXIBE o `pastaFisica` que veio na resposta. Se as duas
 * pontas calculassem por conta própria, uma hora divergiriam — e papel guardado na
 * pasta errada é exatamente o problema que este módulo existe para resolver.
 *
 * Layout oficial da chave (NT 2003.001 / Manual da NF-e):
 *   cUF 2 · AAMM 4 · CNPJ 14 · mod 2 · série 3 · nNF 9 · tpEmis 1 · cNF 8 · DV 1 = 44
 *   0-2    2-6      6-20       20-22   22-25    25-34   34-35     35-43    43-44
 *
 * DV: módulo 11, pesos 2..9 da direita para a esquerda (reiniciando), sobre os 43
 * primeiros dígitos. Resto 0 ou 1 → DV 0; senão 11 - resto.
 */

/** Só os dígitos. Cobre o prefixo "NFe..." da Focus e o Enter do leitor USB. */
export function limpar(txt) {
    return String(txt == null ? '' : txt).replace(/\D/g, '');
}

/** Tem exatamente 44 dígitos? (não valida o DV — para isso use `dvValido`) */
export function ehChave(txt) {
    return limpar(txt).length === 44;
}

/** Dígito verificador calculado sobre os 43 primeiros dígitos. */
export function calcularDV(base43) {
    let soma = 0;
    let peso = 2;
    for (let i = base43.length - 1; i >= 0; i--) {
        soma += Number(base43[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
}

/** A chave passa no módulo 11? Barra leitura torta antes de ir à rede. */
export function dvValido(txt) {
    const c = limpar(txt);
    if (c.length !== 44) return false;
    return calcularDV(c.slice(0, 43)) === Number(c[43]);
}

/** Número da nota (nNF) embutido na chave. */
export function numeroDaChave(txt) {
    const c = limpar(txt);
    if (c.length !== 44) return null;
    const n = Number(c.slice(25, 34));
    return Number.isFinite(n) ? n : null;
}

/** Série embutida na chave. */
export function serieDaChave(txt) {
    const c = limpar(txt);
    if (c.length !== 44) return null;
    const n = Number(c.slice(22, 25));
    return Number.isFinite(n) ? n : null;
}

/**
 * Interpreta o que caiu no campo de bipe.
 *
 * - 44 dígitos com DV bom  → { tipo: 'chave',  chave, numero, serie }
 * - 44 dígitos com DV ruim → { tipo: 'invalido', motivo: 'DV' }        (leitura torta)
 * - 1 a 9 dígitos          → { tipo: 'numero', numero }                (código rasgado, digitado)
 * - qualquer outra coisa   → { tipo: 'invalido', motivo: 'TAMANHO' }
 */
export function interpretarBipe(txt) {
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

export default { limpar, ehChave, calcularDV, dvValido, numeroDaChave, serieDaChave, interpretarBipe };
