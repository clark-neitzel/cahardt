// Máscara da URL antes de ir para o log do servidor.
//  - `mt=` (token de mídia) → `mt=***`
//  - qualquer token de agente `cah_ag_...` → `cah_ag_***`, em qualquer parâmetro/posição, mesmo
//    codificado (`cah%5Fag%5F`, `%63ah_ag_`), duplamente codificado (`cah%255Fag%255F`) ou em
//    maiúsculas (`CAH_AG_`).
//  - o VALOR de qualquer parâmetro de query cujo nome contenha senha|password|passwd|token|secret|authorization|
//    api_key (ex.: `?token=X&senha=Y` → `?token=***&senha=***`). Só olha parâmetros (precedidos de `?`, `&` ou `;`):
//    um segmento de CAMINHO como `/lista/:token` não é afetado.
// A URL é DECODIFICADA antes de mascarar (até 3 passadas) — assim `m%74=` também é pego. Se a
// decodificação padrão falhar (`%zz`, UTF-8 inválido), cai numa decodificação TOLERANTE que troca
// cada `%XX` ASCII válido individualmente e ignora os malformados. Depois da máscara, qualquer
// caractere de controle vira `?` (sem quebra de linha forjada no log) e o texto é truncado.
// A função NUNCA lança e tem custo LINEAR: a entrada é cortada em MAX_ENTRADA caracteres ANTES de qualquer regex
// (roda em toda requisição, antes do login — URL hostil de 16 KB/1 MB não pode custar tempo) e a máscara de
// parâmetros sensíveis é um parser de uma passada (sem regex com retrocesso).
const MAX_PASSADAS = 3;
const MAX_LOG = 2000;
const MAX_ENTRADA = 4000; // o que passa disto nunca chegaria ao log mesmo (a saída tem MAX_LOG)
const PALAVRAS_SENSIVEIS = ['senha', 'password', 'passwd', 'token', 'secret', 'authorization', 'apikey', 'api-key', 'api_key'];

function chaveSensivel(chave) {
    const k = chave.toLowerCase();
    for (const p of PALAVRAS_SENSIVEIS) if (k.includes(p)) return true;
    return false;
}

/**
 * Máscara do VALOR de parâmetros sensíveis, em UMA passada (linear). Parâmetro = o que vem depois de `?`, `&` ou `;`
 * até o `=`; o valor vai até o próximo `&`. O trecho antes do 1º separador (o caminho) nunca é tocado.
 */
function mascararParametrosSensiveis(s) {
    let saida = '';
    let ult = 0; // início do trecho ainda não copiado
    let i = 0;
    const n = s.length;
    while (i < n) {
        const c = s.charCodeAt(i);
        if (c !== 63 /* ? */ && c !== 38 /* & */ && c !== 59 /* ; */) { i += 1; continue; }
        const ini = i + 1;
        let q = ini; // fim da chave: primeiro `=`, `&` ou `;`
        while (q < n) { const d = s.charCodeAt(q); if (d === 61 || d === 38 || d === 59) break; q += 1; }
        if (q < n && s.charCodeAt(q) === 61 /* = */ && chaveSensivel(s.slice(ini, q))) {
            let r = q + 1; // fim do valor: próximo `&`
            while (r < n && s.charCodeAt(r) !== 38) r += 1;
            const valor = s.slice(q + 1, r);
            // valor que É um token de agente fica para a regra `cah_ag_***` (mantém o diagnóstico)
            if (!/cah_ag_/i.test(decodificarParaBusca(valor))) {
                saida += `${s.slice(ult, q + 1)}***`;
                ult = r;
            }
            i = r;
        } else {
            i = q < n && s.charCodeAt(q) === 61 ? q + 1 : q; // chave comum: segue (um `;token=` dentro do valor ainda é achado)
        }
    }
    return ult === 0 ? s : saida + s.slice(ult);
}

function decodificarTolerante(s) {
    return s.replace(/%([0-9a-f]{2})/gi, (m, h) => {
        const c = parseInt(h, 16);
        return c < 0x80 ? String.fromCharCode(c) : m;
    });
}

// Decodifica em laço (para quando não muda). Serve para ACHAR o token; não é para exibir sem mascarar.
function decodificarParaBusca(texto) {
    let s = String(texto == null ? '' : texto);
    for (let i = 0; i < MAX_PASSADAS; i++) {
        let prox;
        try { prox = decodeURIComponent(s); } catch { prox = decodificarTolerante(s); }
        if (prox === s) break;
        s = prox;
    }
    return s;
}

function mascararUrlLog(url) {
    try {
        let s = String(url == null ? '' : url);
        const cortou = s.length > MAX_ENTRADA;
        if (cortou) s = s.slice(0, MAX_ENTRADA); // ANTES de qualquer regex/decodificação
        const MT = /([?&;]mt=)[^&]*/gi;
        s = s.replace(MT, '$1***');          // cru (caso o valor contenha algo que a decodificação reabra)
        s = mascararParametrosSensiveis(s);  // cru: pega o valor inteiro mesmo com `%26` dentro dele
        s = decodificarParaBusca(s);
        s = s.replace(MT, '$1***');          // depois de decodificar (pega `m%74=`)
        s = mascararParametrosSensiveis(s);  // depois de decodificar (pega `tok%65n=`)
        // `cah_%0Aag_X`: se tirando os caracteres de controle aparece um token, usa a versão sem eles
        const semControle = s.replace(/[\r\n\u0000-\u001f\u007f]/g, '');
        if (/cah_ag_/i.test(semControle)) s = semControle;
        s = s.replace(/cah_ag_[A-Za-z0-9_-]*/gi, 'cah_ag_***');
        s = s.replace(/[\r\n\u0000-\u001f\u007f]/g, '?');
        return cortou || s.length > MAX_LOG ? s.slice(0, MAX_LOG) + '…' : s;
    } catch {
        return '[url ilegível]';
    }
}

module.exports = { mascararUrlLog, decodificarParaBusca };
