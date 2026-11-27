// Helpers de data/texto das telas de Agentes de IA e Solicitações.

export function fmtDataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// "há 5 min", "há 3 h", "há 2 dias"
export function haQuanto(iso, agora = Date.now()) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const s = Math.max(0, Math.round((agora - t) / 1000));
    if (s < 60) return 'agora há pouco';
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const dd = Math.round(h / 24);
    return `há ${dd} ${dd === 1 ? 'dia' : 'dias'}`;
}

// "expira em 3 h" / "expirada"
export function expiraEmTexto(iso, agora = Date.now()) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const ms = t - agora;
    if (ms <= 0) return 'expirada';
    const min = Math.ceil(ms / 60000);
    if (min < 60) return `expira em ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 72) return `expira em ${h} h`;
    return `expira em ${Math.floor(h / 24)} dias`;
}

// Dias inteiros que faltam (negativo = já passou). null se não há data.
export function diasRestantes(iso, agora = Date.now()) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((t - agora) / 86400000);
}

// Copia texto: API moderna e, se o aparelho não deixar (iOS fora de https), o truque do textarea.
export async function copiarTexto(texto) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            return true;
        }
    } catch { /* cai no plano B */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, texto.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

export function jsonLegivel(valor) {
    if (valor == null) return '';
    if (typeof valor === 'string') {
        try { return JSON.stringify(JSON.parse(valor), null, 2); } catch { return valor; }
    }
    try { return JSON.stringify(valor, null, 2); } catch { return String(valor); }
}

// Gatilho do SelectBusca com alvo de toque de 44px no celular (o componente compartilhado tem ~34px).
export const SELECT_TOQUE = '[&>button]:min-h-[44px] md:[&>button]:min-h-0';

// Resumo sem repetir o rótulo: "Criar conta a pagar — descrição: X" com rótulo "Criar conta a pagar" vira "descrição: X".
export function resumoLimpo(item) {
    const resumo = String(item?.resumo || '').trim();
    const rotulo = String(item?.rotulo || '').trim();
    if (!resumo) return '';
    if (rotulo && resumo.toLowerCase().startsWith(rotulo.toLowerCase())) {
        const resto = resumo.slice(rotulo.length).replace(/^[\s\-–—:·|,.]+/, '').trim();
        return resto; // vazio = o resumo era só o rótulo repetido
    }
    return resumo;
}
