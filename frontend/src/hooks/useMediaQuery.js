import { useEffect, useState } from 'react';

/**
 * true enquanto a media query casar (ex.: useMediaQuery('(min-width: 1024px)')).
 * Reage a rotação do iPad e redimensionamento da janela.
 */
export function useMediaQuery(query) {
    const ler = () => {
        try { return typeof window !== 'undefined' && window.matchMedia(query).matches; }
        catch { return false; }
    };
    const [casa, setCasa] = useState(ler);

    useEffect(() => {
        let mql;
        try { mql = window.matchMedia(query); } catch { return undefined; }
        const aoMudar = () => setCasa(mql.matches);
        aoMudar();
        if (mql.addEventListener) mql.addEventListener('change', aoMudar);
        else mql.addListener(aoMudar); // Safari antigo
        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', aoMudar);
            else mql.removeListener(aoMudar);
        };
    }, [query]);

    return casa;
}

export default useMediaQuery;
