// Auditoria AGENTE_REQUISICAO: grava no audit_logs toda NEGAÇÃO do agente (política BLOQUEADO/PEDE).
// A leitura liberada NÃO é gravada aqui (o uso já é contado em agente_tokens). Nos PRs de escrita, toda
// escrita do agente também passa por aqui.
// - fire-and-forget: log lento ou falho nunca atrasa nem derruba a resposta;
// - nunca grava token, hash, cabeçalho nem query string (só caminho sem query, mascarado);
// - negação repetida (mesmo agente + método + FAMÍLIA + status) numa janela de 60 s vira UMA linha + um resumo com o contador
//   (a chave crua não entra na deduplicação: URL com ids/lixo diferentes não vira uma linha por tentativa);
// - teto de TETO_POR_MINUTO linhas por agente por janela de 60 s; acima disso só um contador em memória e
//   UMA linha-resumo ({resumo:true, motivo:'teto_por_minuto', suprimidas}) quando a janela fecha.
const prisma = require('../config/database');
const { mascararUrlLog } = require('../utils/mascararUrlLog');

const JANELA_MS = 60 * 1000;
const MAX_CHAVES = 2000;
const TETO_POR_MINUTO = 30;
const tetos = new Map(); // vendedorId -> { ate, gravadas, suprimidas, vendedor }
const janelas = new Map(); // `${vendedorId}|${chave}|${status}` -> { ate, suprimidas, base }

function gravar(vendedor, detalhes) {
    Promise.resolve()
        .then(() => prisma.auditLog.create({
            data: {
                acao: 'AGENTE_REQUISICAO', entidade: 'Agente', entidadeId: String(vendedor.id),
                detalhes: JSON.stringify(detalhes), usuarioId: String(vendedor.id), usuarioNome: vendedor.nome || 'agente',
            },
        }))
        .catch((e) => console.error('[Agente] falha ao gravar auditoria da requisição:', e.message));
}

/**
 * Liga a gravação da negação ao fim da resposta. `info`: { reqId, vendedor{id,nome}, tokenPrefixo, ip, decisao, inicio }.
 * Chamar ANTES de responder (usa res.on('finish') para pegar status e duração reais).
 */
function registrarNegacao(req, res, info) {
    const registrar = () => {
        try {
            const caminho = mascararUrlLog(String(req.originalUrl || '').split('?')[0].split('#')[0]).slice(0, 300);
            const d = info.decisao || {};
            const status = res.statusCode || 403; // res "de mentira" (proxy) sem statusCode: a negação é sempre 403
            const detalhes = {
                reqId: info.reqId, metodo: req.method, caminho, chave: d.chave || null, nivel: d.nivel || null,
                fixo: d.fixo === true, status, ms: Date.now() - info.inicio, tokenPrefixo: info.tokenPrefixo || null, ip: info.ip || null,
            };
            const k = `${info.vendedor.id}|${req.method}|${d.familia || 'desconhecida'}|${status}`;
            const agora = Date.now();
            const j = janelas.get(k);
            if (j && agora < j.ate) { j.suprimidas += 1; return; }
            if (j && j.suprimidas > 0) gravar(info.vendedor, { ...j.base, resumo: true, repeticoes: j.suprimidas });
            // teto por agente por janela de 60 s
            let t = tetos.get(info.vendedor.id);
            if (!t || agora >= t.ate) {
                if (t && t.suprimidas > 0) gravar(t.vendedor, { resumo: true, motivo: 'teto_por_minuto', suprimidas: t.suprimidas });
                t = { ate: agora + JANELA_MS, gravadas: 0, suprimidas: 0, vendedor: info.vendedor };
                tetos.set(info.vendedor.id, t);
            }
            if (t.gravadas >= TETO_POR_MINUTO) { t.suprimidas += 1; return; }
            t.gravadas += 1;
            if (janelas.size >= MAX_CHAVES) varrer(true);
            janelas.set(k, { ate: agora + JANELA_MS, suprimidas: 0, base: detalhes, vendedor: info.vendedor });
            gravar(info.vendedor, detalhes);
        } catch (e) {
            console.error('[Agente] falha ao preparar a auditoria da requisição:', e.message);
        }
    };
    // `res` pode ser um proxy sem `on` (ver comoFazerAuthService): grava logo depois, sem depender do evento
    if (res && typeof res.on === 'function') res.on('finish', registrar);
    else setImmediate(registrar);
}

/** Fecha janelas vencidas: se houve repetição suprimida, grava a linha-resumo. `tudo`: ignora o prazo. */
function varrer(tudo = false) {
    const agora = Date.now();
    for (const [k, j] of janelas) {
        if (!tudo && agora < j.ate) continue;
        if (j.suprimidas > 0) gravar(j.vendedor, { ...j.base, resumo: true, repeticoes: j.suprimidas });
        janelas.delete(k);
    }
    for (const [id, t] of tetos) {
        if (!tudo && agora < t.ate) continue;
        if (t.suprimidas > 0) gravar(t.vendedor, { resumo: true, motivo: 'teto_por_minuto', suprimidas: t.suprimidas });
        tetos.delete(id);
    }
}
setInterval(varrer, JANELA_MS).unref();

function limpar() { janelas.clear(); tetos.clear(); }

module.exports = { registrarNegacao, varrer, limpar, JANELA_MS, TETO_POR_MINUTO };
