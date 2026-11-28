import { useEffect, useState } from 'react';

// Aba do navegador visível? (o Luke pausa animação e polling com a aba oculta)
export function useAbaVisivel() {
    const [visivel, setVisivel] = useState(() => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'));
    useEffect(() => {
        const f = () => setVisivel(document.visibilityState !== 'hidden');
        document.addEventListener('visibilitychange', f);
        return () => document.removeEventListener('visibilitychange', f);
    }, []);
    return visivel;
}

// prefers-reduced-motion: o cachorro vira o PNG parado
export function useMovimentoReduzido() {
    const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const [reduzido, setReduzido] = useState(!!q?.matches);
    useEffect(() => {
        if (!q) return undefined;
        const f = () => setReduzido(q.matches);
        q.addEventListener?.('change', f);
        return () => q.removeEventListener?.('change', f);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return reduzido;
}

// Tamanho da janela. `compacto` = celular (< 768 px): cachorro fixo + painel em folha cheia.
export function useJanela() {
    const ler = () => ({ w: window.innerWidth, h: window.innerHeight });
    const [j, setJ] = useState(ler);
    useEffect(() => {
        const f = () => setJ(ler());
        window.addEventListener('resize', f);
        window.addEventListener('orientationchange', f);
        return () => { window.removeEventListener('resize', f); window.removeEventListener('orientationchange', f); };
    }, []);
    return { ...j, compacto: j.w < 768 };
}

// Área visível de verdade (descontando o teclado do celular): { altura, topo }.
// Sem isso, no iPhone o teclado cobre o campo de texto da folha cheia.
export function useAreaVisivel(ativo) {
    const [area, setArea] = useState(null);
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!ativo || !vv) { setArea(null); return undefined; }
        const f = () => setArea({ altura: vv.height, topo: vv.offsetTop });
        f();
        vv.addEventListener('resize', f);
        vv.addEventListener('scroll', f);
        return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
    }, [ativo]);
    return area;
}

// Slug de novidade válido (vira parte da URL /novidade-<slug>.html)
export const SLUG_OK = /^[a-z0-9-]+$/;

export function horaCurta(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// "Hoje", "Ontem" ou dd/mm — separador de dia da conversa
export function rotuloDia(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const ini = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dif = Math.round((ini(new Date()) - ini(d)) / 86400000);
    if (dif === 0) return 'Hoje';
    if (dif === 1) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: dif > 300 ? '2-digit' : undefined });
}

export function dataCurta(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// A resposta da ajuda vem com um pouco de markdown: deixa legível (TEXTO PURO — nunca vira HTML)
export function formatarResposta(t) {
    if (!t) return '';
    return String(t)
        .replace(/\*\*(.*?)\*\*/g, '$1')                 // remove **negrito**
        .replace(/`([^`]*)`/g, '$1')                      // remove `código`
        .replace(/([:.!?])\s+(\d{1,2}\.\s)/g, '$1\n$2')   // quebra antes de "1.", "2."...
        .replace(/(^|\n)\s*[-*]\s+/g, '$1• ')             // listas com - ou * viram •
        .trim();
}
