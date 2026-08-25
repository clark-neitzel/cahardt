import { useLayoutEffect, useRef, useState } from 'react';

// ─── Auto-fit do conteúdo da etiqueta ─────────────────────────────────────────
// A etiqueta tem altura FÍSICA fixa (80×100 / 100×120mm). Quando o produto tem
// muito texto (ingredientes + modo de preparo longos), o conteúdo fica mais alto
// que a folha e o final era CORTADO na impressão. Isso é inaceitável.
//
// HISTÓRICO (por que NÃO usar zoom nem transform: scale) — bugs reais de 08/2026,
// confirmados com foto da impressão física:
//   • `transform: scale` encolhe só o pixel pintado, não a caixa de layout —
//     cortava o rodapé na impressão.
//   • `zoom` funciona no PDF do Chrome, mas o caminho físico de impressão
//     (iPad/AirPrint, diálogo de impressão + driver) NÃO aplica o zoom igual —
//     o preview mostrava certo e a etiqueta impressa saía transbordada, com
//     modo de preparo/conservação/datas cortados.
//
// A solução definitiva é ajustar por LAYOUT REAL, sem truque de escala: o hook
// devolve um `fator` (≤ 1) que o consumidor aplica como variável CSS `--fs` no
// bloco de conteúdo, e TODOS os font-sizes/espaçamentos verticais do rótulo são
// escritos como `calc(var(--fs, 1) * Xpt)`. Encolher a fonte reduz a altura de
// verdade, em qualquer motor (Chrome, WebKit/iPad, driver) — o que se mede na
// tela é exatamente o que sai na impressora.
//
// O hook procura por BUSCA BINÁRIA o maior fator que faz o conteúdo caber:
// aplica `--fs` direto no DOM (síncrono, dentro do layout effect), mede
// `scrollHeight` contra a altura útil (`boxRef.clientHeight`) e converge em ~7
// passos. Quando cabe sem encolher, fator = 1 (layout original intacto).
export function useAutoFit(deps = []) {
    const boxRef = useRef(null);
    const innerRef = useRef(null);
    const [fator, setFator] = useState(1);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const inner = innerRef.current;
        if (!box || !inner) return;

        let raf = 0;
        const ajustar = () => {
            const avail = box.clientHeight; // altura útil da etiqueta (px de layout)
            if (!avail) return;
            // Aplica um fator candidato e mede se o conteúdo cabe (+1px de folga
            // p/ arredondamento mm→px). Leitura de scrollHeight força reflow —
            // são ~8 medições num subtree pequeno, imperceptível.
            const cabe = (f) => {
                inner.style.setProperty('--fs', String(f));
                return inner.scrollHeight <= avail + 1;
            };
            let f = 1;
            if (!cabe(1)) {
                const PISO = 0.42; // piso de legibilidade; o rodapé (datas) fica
                if (!cabe(PISO)) {    // FORA deste bloco e nunca corta.
                    f = PISO;
                } else {
                    let lo = PISO, hi = 1;
                    for (let i = 0; i < 7; i++) {
                        const m = (lo + hi) / 2;
                        if (cabe(m)) lo = m; else hi = m;
                    }
                    f = lo;
                }
                cabe(f); // deixa o DOM no valor final
            }
            setFator(prev => (Math.abs(prev - f) > 0.004 ? f : prev));
        };

        ajustar();
        // Remede no próximo frame: o código de barras (JsBarcode) e as fontes só
        // preenchem depois do primeiro layout, mudando a altura do conteúdo.
        raf = requestAnimationFrame(ajustar);

        // E observa mudanças de tamanho do conteúdo (barcode/fonte assíncronos).
        // A busca é determinística p/ uma mesma altura útil, então re-rodar com o
        // conteúdo já ajustado devolve o mesmo fator e não gera laço.
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(ajustar);
        });
        ro.observe(inner);

        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { boxRef, innerRef, fator };
}

export default useAutoFit;
