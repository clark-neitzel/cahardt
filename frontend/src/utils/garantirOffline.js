/**
 * Pede ao service worker para garantir que a "casca" do app (index.html + os arquivos das telas offline)
 * está inteira no cache deste aparelho — é o que permite fechar e reabrir o app SEM sinal.
 *
 * Retorna sempre (nunca rejeita): { ok, faltando, buildId }.
 *  - ok:true  -> casca completa no cache (pode entrar na câmara fria / caminhão).
 *  - ok:false -> sem service worker controlando a página (1º acesso, dev), sem resposta em 20 s,
 *                ou algum arquivo não pôde ser baixado (lista em `faltando`).
 * Ver frontend/public/sw.js (mensagem GARANTIR_OFFLINE) e frontend/vite.config.js (build-info.json).
 */
export function garantirOffline(prazoMs = 20000) {
    return new Promise((resolve) => {
        let resolvido = false;
        const fim = (r) => { if (!resolvido) { resolvido = true; clearTimeout(timer); resolve(r); } };
        const falha = (motivo) => ({ ok: false, faltando: [motivo], buildId: '' });
        const timer = setTimeout(() => fim(falha('sem-resposta')), prazoMs);
        try {
            const ctl = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
            if (!ctl) { fim(falha('sem-service-worker')); return; }
            const canal = new MessageChannel();
            canal.port1.onmessage = (e) => {
                const d = e.data || {};
                fim({
                    ok: d.ok === true,
                    faltando: Array.isArray(d.faltando) ? d.faltando : [],
                    buildId: d.buildId ? String(d.buildId) : '',
                });
            };
            ctl.postMessage({ tipo: 'GARANTIR_OFFLINE' }, [canal.port2]);
        } catch {
            fim(falha('erro'));
        }
    });
}

export default garantirOffline;
