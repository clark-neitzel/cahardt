import React, { useCallback, useEffect, useState } from 'react';

// Tooltip dos gráficos: passa o mouse (desktop) ou TOCA (celular/iPad) e mostra o detalhe.
// Uso:  const { alvo, Tip } = useTooltip();
//       <rect {...alvo(<>conteúdo</>)} />   ...   {Tip}
// No toque o balão fica até o próximo toque fora de um alvo (pointerleave de toque é ignorado).
export function useTooltip() {
    const [t, setT] = useState(null);

    const mostrar = useCallback((conteudo, e) => setT({ x: e.clientX, y: e.clientY, conteudo }), []);
    const esconder = useCallback(() => setT(null), []);

    useEffect(() => {
        if (!t) return undefined;
        const fora = (e) => { if (!e.target.closest?.('[data-tip]')) setT(null); };
        window.addEventListener('pointerdown', fora, true);
        window.addEventListener('scroll', esconder, true);
        return () => {
            window.removeEventListener('pointerdown', fora, true);
            window.removeEventListener('scroll', esconder, true);
        };
    }, [t, esconder]);

    const alvo = (conteudo) => ({
        'data-tip': '1',
        onPointerEnter: (e) => mostrar(conteudo, e),
        onPointerMove: (e) => mostrar(conteudo, e),
        onPointerDown: (e) => mostrar(conteudo, e),
        onPointerLeave: (e) => { if (e.pointerType !== 'touch') esconder(); },
    });

    const largura = typeof window !== 'undefined' ? window.innerWidth : 360;
    const Tip = t ? (
        <div
            role="tooltip"
            className="fixed z-[60] pointer-events-none bg-house text-white text-xs font-semibold rounded-lg px-3 py-2 shadow-lg leading-snug"
            style={{
                width: 'max-content',
                maxWidth: Math.min(260, largura - 16),
                left: Math.max(8, Math.min(t.x + 14, largura - Math.min(260, largura - 16) - 8)),
                top: t.y > 130 ? t.y - 12 : t.y + 18,
                transform: t.y > 130 ? 'translateY(-100%)' : 'none',
            }}
        >
            {t.conteudo}
        </div>
    ) : null;

    return { alvo, Tip, esconder, mostrar };
}
