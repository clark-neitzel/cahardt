import React from 'react';
import { useAbaVisivel, useMovimentoReduzido } from './lukeHooks';

// O Luke (salsicha) — GIFs do dono com fundo transparente, em /luke/*.gif.
// Estados: idle (tranquilo) · olhando (curioso) · preguica (espreguiçando) · dormindo · novidade (sininho) · pensando · feliz.
// Acessibilidade/economia: com prefers-reduced-motion OU aba oculta mostra o PNG parado (a animação pausa).
const ARQ = {
    idle: 'luke_tranquilo', olhando: 'luke_curioso', preguica: 'luke_espreguicando', dormindo: 'luke_dormindo',
    novidade: 'luke_novidade', pensando: 'luke_pensando', feliz: 'luke_feliz',
};
const PARADO = '/luke/luke_tranquilo.png';
export const ESTADOS = Object.keys(ARQ);

let precarregado = false;
// Baixa os 7 GIFs uma vez (~50 KB cada), para a troca de estado não piscar. NUNCA compete com a abertura do app:
// só depois da carga da página e num momento ocioso do navegador (ou, no máximo, uns segundos depois).
export function precarregarLuke() {
    if (precarregado || typeof window === 'undefined') return;
    precarregado = true;
    const baixar = () => Object.values(ARQ).forEach((a) => { const i = new Image(); i.src = `/luke/${a}.gif`; });
    const quandoOcioso = () => {
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(baixar, { timeout: 8000 });
        else setTimeout(baixar, 3000);
    };
    if (document.readyState === 'complete') quandoOcioso();
    else window.addEventListener('load', quandoOcioso, { once: true });
}

/** O recorte do rosto em círculo (avatar) é feito pelo CSS `.lk-avatar`, que envolve este componente.
 *  `parado`: usa o PNG (avatares pequenos das bolhas e do cabeçalho não gastam GIF animado). */
export default function LukeMascote({ estado = 'idle', sombra = false, parado = false, className = '' }) {
    const visivel = useAbaVisivel();
    const reduzido = useMovimentoReduzido();
    // o avatar (cabeca) também anima (pensando/feliz mostram o humor); para só com aba oculta ou movimento reduzido
    const src = (parado || !visivel || reduzido) ? PARADO : `/luke/${ARQ[estado] || ARQ.idle}.gif`;
    return (
        <span className={`lk-dog ${sombra ? 'lk-sombra' : ''} ${className}`} aria-hidden="true">
            <img alt="" draggable="false" width="240" height="217" src={src} />
        </span>
    );
}
