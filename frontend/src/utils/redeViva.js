/**
 * "Tem internet de verdade?" — navigator.onLine MENTE: com Wi-Fi conectado mas sem saída para a internet
 * (câmara fria com roteador sem sinal) ele continua `true`. Aqui pedimos a página inicial ao servidor, sem cache,
 * com prazo curto. O service worker não intercepta esse pedido (não é navegação), então vai mesmo para a rede.
 *
 * Usado antes de apagar o cache e recarregar por causa de um "arquivo da tela sumiu": sem rede de verdade,
 * apagar o cache destruiria a casca offline do app.
 */
export async function redeViva(prazoMs = 4000) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ac?.abort(), prazoMs);
    try {
        const r = await fetch('/', { cache: 'no-store', signal: ac?.signal });
        try { ac?.abort(); } catch { /* corpo descartado */ }
        return !!r;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export default redeViva;
