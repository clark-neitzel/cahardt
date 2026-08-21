/**
 * SOM E VIBRAÇÃO DO BIPE — peça única, compartilhada por todo campo de bipagem.
 *
 * Nasceu dentro de `components/BipeCanhoto.jsx` (mutirão dos canhotos) e saiu de lá
 * quando a conferência de carga na doca passou a precisar do mesmo retorno.
 * **Não copie estas funções para uma tela nova — importe daqui.** Duas cópias viram
 * dois vocabulários: o mesmo "erro" bipando diferente em duas telas faz a pessoa da
 * doca aprender um som e ser traída pelo outro.
 *
 * Quem está do outro lado tem as duas mãos ocupadas (maço de papel, caixa no ombro) e
 * NÃO OLHA A TELA a cada leitura. O som e a vibração é que dizem o resultado:
 *
 *   ok       → um bip agudo curto  ............ "entrou, pode seguir"
 *   repetido → dois bips médios  .............. "já estava, não estraga nada"
 *   aviso    → dois bips médios  .............. "pare e leia" (existe, mas não aqui)
 *   erro     → um bip grave e longo  .......... "não deu, olhe a tela"
 *
 * Som é conforto, nunca requisito: tudo aqui falha em silêncio (iPad no mudo, aba sem
 * gesto do usuário, desktop sem vibração) sem derrubar o fluxo de quem está bipando.
 */

/** Bip curto pelo WebAudio — sem arquivo de som para baixar. */
export function tocar(tipo) {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const agora = ctx.currentTime;
        const bipe = (freq, inicio, duracao, volume = 0.09) => {
            const osc = ctx.createOscillator();
            const gan = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gan.gain.setValueAtTime(volume, agora + inicio);
            gan.gain.exponentialRampToValueAtTime(0.0001, agora + inicio + duracao);
            osc.connect(gan).connect(ctx.destination);
            osc.start(agora + inicio);
            osc.stop(agora + inicio + duracao);
        };
        if (tipo === 'ok') bipe(1040, 0, 0.11);
        else if (tipo === 'repetido' || tipo === 'aviso') { bipe(660, 0, 0.08); bipe(660, 0.12, 0.08); }
        else { bipe(200, 0, 0.22, 0.12); }
        setTimeout(() => { try { ctx.close(); } catch { /* já fechado */ } }, 700);
    } catch { /* som é conforto, nunca requisito */ }
}

export function vibrar(tipo) {
    try {
        if (tipo === 'ok') navigator.vibrate?.(55);
        else if (tipo === 'repetido' || tipo === 'aviso') navigator.vibrate?.([30, 40, 30]);
        else navigator.vibrate?.([90, 60, 90]);
    } catch { /* desktop não vibra */ }
}

/** Atalho para os dois juntos — é assim que as telas usam. */
export function sinalizar(tipo) {
    tocar(tipo);
    vibrar(tipo);
}

/**
 * Janela do leitor a laser: com o gatilho preso ele dispara a MESMA leitura 2 ou 3
 * vezes seguidas. Dentro desta janela a repetição é ignorada em silêncio.
 */
export const JANELA_REPETICAO_MS = 800;

export default { tocar, vibrar, sinalizar, JANELA_REPETICAO_MS };
