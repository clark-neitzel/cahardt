// Voz do aparelho (speechSynthesis) em português do Brasil.
// No iOS/iPad só fala se for chamada DENTRO de um clique/toque.
export const suportaFala = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function escolherVoz() {
    try {
        const vozes = window.speechSynthesis.getVoices() || [];
        return vozes.find((v) => (v.lang || '').replace('_', '-').toLowerCase().startsWith('pt-br'))
            || vozes.find((v) => (v.lang || '').toLowerCase().startsWith('pt'))
            || null;
    } catch { return null; }
}

export function pararFala() {
    if (!suportaFala()) return;
    try { window.speechSynthesis.cancel(); } catch { /* ignora */ }
}

/** Lê o texto (cancela a fala anterior). Devolve true se começou. */
export function falar(texto) {
    const t = String(texto || '').trim();
    if (!suportaFala() || !t) return false;
    try {
        window.speechSynthesis.cancel();
        const u = new window.SpeechSynthesisUtterance(t);
        u.lang = 'pt-BR';
        u.rate = 0.95;
        const voz = escolherVoz();
        if (voz) u.voice = voz;
        window.speechSynthesis.speak(u);
        return true;
    } catch { return false; }
}
