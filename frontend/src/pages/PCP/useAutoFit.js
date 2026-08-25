import { useLayoutEffect, useRef, useState } from 'react';

// ─── Auto-fit do conteúdo da etiqueta ─────────────────────────────────────────
// A etiqueta tem altura FÍSICA fixa (80×100 / 100×120mm). Quando o produto tem
// muito texto (ingredientes + modo de preparo longos), o conteúdo fica mais alto
// que a folha e, com overflow:hidden + rodapé em margin-top:auto, o FINAL era
// CORTADO — sumindo Fabricação/Lote + Validade. Isso é inaceitável.
//
// Este hook mede em runtime a altura real do conteúdo (`innerRef.scrollHeight`)
// contra a altura útil da etiqueta (`boxRef.clientHeight`) e devolve um `fator`
// (≤ 1) que o consumidor aplica como CSS `zoom` no bloco de conteúdo até caber
// TUDO — principalmente as datas do rodapé. Quando cabe, fator = 1 (idêntico ao
// layout original). O `inner` usa min-height:100% para o rodapé continuar no pé
// quando sobra espaço, e crescer (revelando o overflow para a medição) quando
// falta.
//
// POR QUE `zoom` E NÃO `transform: scale` (bug real de 08/2026 — corte na
// IMPRESSÃO física): `transform: scale` encolhe só o PIXEL pintado, mas NÃO a
// caixa de layout — na tela o overflow:hidden do pai disfarçava, mas na hora de
// imprimir o Chrome pagina/recorta pela altura ORIGINAL (grande) e CORTAVA o
// rodapé (Fabricação/Validade). O `zoom` do Chrome encolhe a CAIXA DE LAYOUT de
// verdade (inclusive na impressão), então a altura física do conteúdo diminui e
// as datas sempre cabem.
//
// A medição continua correta porque `scrollHeight`/`offsetHeight` são INVARIANTES
// ao zoom (reportam a altura pré-zoom, em px de layout local) — só o
// getBoundingClientRect reflete o tamanho reduzido. Logo, aplicar `zoom` no
// próprio `inner` NÃO muda o `scrollHeight` medido e não gera laço de medição.
//
// Como imprimimos clonando o innerHTML do preview (ver imprimirEtiquetas), o
// `zoom` é aplicado INLINE pelo React e vai junto no clone — o HTML de impressão
// já sai com o zoom certo, sem precisar recalcular na folha.
export function useAutoFit(deps = []) {
    const boxRef = useRef(null);
    const innerRef = useRef(null);
    const [fator, setFator] = useState(1);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const inner = innerRef.current;
        if (!box || !inner) return;

        let raf = 0;
        const medir = () => {
            const avail = box.clientHeight;      // altura útil da etiqueta (px de layout)
            const needed = inner.scrollHeight;   // altura real do conteúdo (zoom NÃO afeta scrollHeight)
            if (!avail || !needed) return;
            // -1px de folga p/ arredondamento de mm→px não roçar a borda inferior.
            const f = needed > avail + 1 ? (avail - 1) / needed : 1;
            setFator(prev => (Math.abs(prev - f) > 0.004 ? f : prev));
        };

        medir();
        // Remede no próximo frame: o código de barras (JsBarcode) e as fontes só
        // preenchem depois do primeiro layout, mudando a altura do conteúdo.
        raf = requestAnimationFrame(medir);

        // E observa mudanças de tamanho do conteúdo (barcode/fonte assíncronos).
        // O ResizeObserver reporta o content-box em px de layout (invariante ao zoom),
        // então aplicar `zoom` não muda a medida e não gera laço.
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(medir);
        });
        ro.observe(inner);

        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { boxRef, innerRef, fator };
}

export default useAutoFit;
