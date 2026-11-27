// Máscara da URL antes de ir para o log do servidor.
//  - `mt=` (token de mídia) → `mt=***`
//  - qualquer token de agente `cah_ag_...` → `cah_ag_***`, em qualquer parâmetro/posição, mesmo
//    codificado (`cah%5Fag%5F`, `%63ah_ag_`), duplamente codificado (`cah%255Fag%255F`) ou em
//    maiúsculas (`CAH_AG_`).
// A URL é DECODIFICADA antes de mascarar (até 3 passadas) — assim `m%74=` também é pego. Se a
// decodificação padrão falhar (`%zz`, UTF-8 inválido), cai numa decodificação TOLERANTE que troca
// cada `%XX` ASCII válido individualmente e ignora os malformados. Depois da máscara, qualquer
// caractere de controle vira `?` (sem quebra de linha forjada no log) e o texto é truncado.
// A função NUNCA lança.
const MAX_PASSADAS = 3;
const MAX_LOG = 2000;

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
        const MT = /([?&;]mt=)[^&]*/gi;
        s = s.replace(MT, '$1***');          // cru (caso o valor contenha algo que a decodificação reabra)
        s = decodificarParaBusca(s);
        s = s.replace(MT, '$1***');          // depois de decodificar (pega `m%74=`)
        // `cah_%0Aag_X`: se tirando os caracteres de controle aparece um token, usa a versão sem eles
        const semControle = s.replace(/[\r\n\u0000-\u001f\u007f]/g, '');
        if (/cah_ag_/i.test(semControle)) s = semControle;
        s = s.replace(/cah_ag_[A-Za-z0-9_-]*/gi, 'cah_ag_***');
        s = s.replace(/[\r\n\u0000-\u001f\u007f]/g, '?');
        return s.length > MAX_LOG ? s.slice(0, MAX_LOG) + '…' : s;
    } catch {
        return '[url ilegível]';
    }
}

module.exports = { mascararUrlLog, decodificarParaBusca };
