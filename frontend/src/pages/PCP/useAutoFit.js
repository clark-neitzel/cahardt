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
// devolve um `fator` que o consumidor aplica como variável CSS `--fs` no
// bloco de conteúdo, e TODOS os font-sizes/espaçamentos verticais do rótulo são
// escritos como `calc(var(--fs, 1) * Xpt)`. Mudar a fonte muda a altura de
// verdade, em qualquer motor (Chrome, WebKit/iPad, driver) — o que se mede na
// tela é exatamente o que sai na impressora.
//
// O ajuste vale NOS DOIS SENTIDOS (pedido do dono, 08/2026 — "as frases têm que
// ser responsivas ao tamanho para sempre entrar no espaço"):
//   • muito texto → encolhe (piso 0.42, legibilidade);
//   • POUCO texto → CRESCE para preencher a etiqueta (teto 1.6, para não ficar
//     grotesco) — produto de texto curto não deixa mais um buraco em branco.
// O rodapé de datas, o selo "ALTO EM" e o código de barras ficam FORA do bloco
// ajustável / em tamanho fixo — não escalam.
//
// O hook procura por BUSCA BINÁRIA o MAIOR fator que faz o conteúdo caber:
// aplica `--fs` direto no DOM (síncrono, dentro do layout effect), mede
// `scrollHeight` contra a altura útil (`boxRef.clientHeight`) e converge em ~9
// passos (resolução ~0.002 no intervalo 0.42–1.6). A altura do conteúdo é
// monotônica no fator (fonte maior nunca reduz a altura), então a busca é
// determinística para uma mesma altura útil — sem laço com o ResizeObserver.
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
            // Aplica um fator candidato e mede se o conteúdo cabe. Medição
            // ESTRITA (sem folga): 1px de sobra vira meia linha cortada quando o
            // rótulo é ampliado (preview com zoom) ou rasterizado a 203dpi na
            // Zebra (1 CSS px ≈ 2 device px). scrollHeight arredonda p/ CIMA,
            // então a comparação estrita é conservadora — nunca corta. Leitura
            // de scrollHeight força reflow — ~10 medições num subtree pequeno,
            // imperceptível.
            const cabe = (f) => {
                inner.style.setProperty('--fs', String(f));
                return inner.scrollHeight <= avail;
            };
            const PISO = 0.42; // piso de legibilidade; o rodapé (datas) fica
            const TETO = 1.6;  // FORA deste bloco e nunca corta. Teto p/ texto
            let f;             // curto crescer sem ficar grotesco.
            if (!cabe(PISO)) {
                f = PISO;          // nem no mínimo cabe — fica no piso
            } else if (cabe(TETO)) {
                f = TETO;          // texto curtíssimo — cresce até o teto
            } else {
                let lo = PISO, hi = TETO; // maior fator que cabe (pode ser >1:
                for (let i = 0; i < 9; i++) { // pouco texto PREENCHE a etiqueta)
                    const m = (lo + hi) / 2;
                    if (cabe(m)) lo = m; else hi = m;
                }
                f = lo;
            }
            // Margem de segurança de 2%: o fator "exato" deixa o conteúdo
            // encostado no limite — qualquer re-arredondamento de layout
            // (zoom do navegador, AirPrint, driver da Zebra a 203dpi) cortava
            // meia linha do final. 2% de folga absorve isso em todos os motores.
            f = Math.max(PISO, f * 0.98);
            cabe(f); // deixa o DOM no valor final
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
