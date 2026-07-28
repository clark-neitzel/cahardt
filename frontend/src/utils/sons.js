// Sons curtos do sistema via Web Audio (sem arquivo de áudio).
// Mesmo padrão dos alertas (AlertaPedidoConvertido etc.): falha silenciosa se o
// navegador bloquear áudio antes da primeira interação do usuário.

function tocar(notas, ganho = 0.18) {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        notas.forEach(({ freq, t, dur = 0.28 }) => {
            const t0 = ctx.currentTime + t;
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(ganho, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            o.start(t0); o.stop(t0 + dur + 0.02);
        });
    } catch { /* áudio bloqueado — ignora */ }
}

// Aviso/lembrete (ascendente, agradável — igual ao som dos pedidos pendentes)
export function somAviso() {
    tocar([{ freq: 988, t: 0 }, { freq: 1319, t: 0.2 }]);
}

// Erro (descendente, grave — "não pode")
export function somErro() {
    tocar([{ freq: 622, t: 0, dur: 0.22 }, { freq: 415, t: 0.18, dur: 0.34 }], 0.22);
}
