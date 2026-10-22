import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Loader2, Minus, Plus, Printer, X, Maximize2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url'; // asset com hash em /assets/ (regra do sw.js)
import imprimirNaPagina from '../utils/imprimirNaPagina';

// ─────────────────────────────────────────────────────────────────────────────
// Visualizador de PDF GENÉRICO (nada de Como Fazer aqui). Mostra o PDF em <canvas> dentro do app —
// <embed>/<iframe> de PDF no iPad mostra só a 1ª página e some no PWA. Recebe um Blob ou uma URL.
//  • Imprimir: pré-renderiza cada página em imagem (150 dpi) e usa imprimirNaPagina (síncrono no clique,
//    sem window.open e sem iframe).
//  • Salvar PDF: folha de compartilhar (iPad/iPhone/Android) ou download (computador).
// Importe SEMPRE via lazyComRetry: o pdfjs pesa e não pode entrar no bundle principal.
// ─────────────────────────────────────────────────────────────────────────────

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const MAX_PIXELS = 12e6; // teto por canvas (iOS recusa canvas acima de ~16 Mpx)
const LARGURA_150DPI = 1240; // A4 a 150 dpi

const ehIos = () => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const BTN = 'min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:opacity-50';

export default function VisualizadorPdf({ blob, url, nomeArquivo = 'documento.pdf', titulo, onFechar }) {
    const [pdf, setPdf] = useState(null);
    const [erro, setErro] = useState('');
    const [zoom, setZoom] = useState(1); // 1 = ajustado à largura
    const [pagina, setPagina] = useState(1);
    const [dimensoes, setDimensoes] = useState([]); // [{w,h}] em pt, por página
    const [larguraBase, setLarguraBase] = useState(0);
    const [imgsImpressao, setImgsImpressao] = useState(null); // [{url,img}] quando prontas
    const [salvando, setSalvando] = useState(false);
    const [aviso, setAviso] = useState('');
    const areaRef = useRef(null);
    const canvasRefs = useRef([]);
    const blobRef = useRef(null);
    const navegandoAte = useRef(0);
    const urlsRef = useRef([]);
    const ios = ehIos();

    // 1) obtém o arquivo e abre no pdfjs
    useEffect(() => {
        let vivo = true;
        let doc = null;
        (async () => {
            try {
                let b = blob;
                if (!b && url) {
                    const r = await fetch(url, { credentials: 'include' });
                    if (!r.ok) throw new Error('Não consegui abrir o arquivo.');
                    b = await r.blob();
                }
                if (!b) throw new Error('Nenhum arquivo para mostrar.');
                blobRef.current = b;
                const dados = new Uint8Array(await b.arrayBuffer());
                doc = await pdfjsLib.getDocument({ data: dados }).promise;
                if (!vivo) { doc.destroy(); return; }
                const dims = [];
                for (let i = 1; i <= doc.numPages; i++) {
                    const p = await doc.getPage(i);
                    const v = p.getViewport({ scale: 1 });
                    dims.push({ w: v.width, h: v.height });
                }
                if (!vivo) return;
                setDimensoes(dims);
                setPdf(doc);
            } catch (e) {
                if (vivo) setErro(e?.message && !/Invalid PDF|Missing PDF/i.test(e.message) ? e.message : 'Este arquivo não é um PDF válido.');
            }
        })();
        return () => { vivo = false; if (doc) { try { doc.destroy(); } catch { /* já destruído */ } } };
    }, [blob, url]);

    // 2) largura disponível (ajustar à largura)
    useEffect(() => {
        const el = areaRef.current;
        if (!el) return undefined;
        const medir = () => setLarguraBase(Math.max(200, Math.min(900, el.clientWidth - 24)));
        medir();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
        ro?.observe(el);
        window.addEventListener('resize', medir);
        return () => { ro?.disconnect(); window.removeEventListener('resize', medir); };
    }, [pdf]);

    const cssLargura = dimensoes[0] ? Math.round(larguraBase * zoom) : 0;

    // 3) desenha as páginas na tela (re-desenha ao mudar zoom/largura)
    useEffect(() => {
        if (!pdf || !cssLargura) return undefined;
        let cancelado = false;
        let tarefa = null;
        const t = setTimeout(async () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            for (let i = 1; i <= pdf.numPages; i++) {
                if (cancelado) return;
                const canvas = canvasRefs.current[i - 1];
                if (!canvas) continue;
                const p = await pdf.getPage(i);
                const base = p.getViewport({ scale: 1 });
                let escala = (cssLargura / base.width) * dpr;
                const px = base.width * base.height * escala * escala;
                if (px > MAX_PIXELS) escala *= Math.sqrt(MAX_PIXELS / px);
                const vp = p.getViewport({ scale: escala });
                canvas.width = Math.floor(vp.width);
                canvas.height = Math.floor(vp.height);
                tarefa = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
                try { await tarefa.promise; } catch { /* cancelado */ }
            }
        }, 120);
        return () => { cancelado = true; clearTimeout(t); try { tarefa?.cancel(); } catch { /* ok */ } };
    }, [pdf, cssLargura]);

    // 4) pré-renderiza para impressão (150 dpi) em segundo plano
    useEffect(() => {
        if (!pdf) return undefined;
        let cancelado = false;
        (async () => {
            const lista = [];
            try {
                for (let i = 1; i <= pdf.numPages; i++) {
                    const p = await pdf.getPage(i);
                    const base = p.getViewport({ scale: 1 });
                    const vp = p.getViewport({ scale: LARGURA_150DPI / base.width });
                    const c = document.createElement('canvas');
                    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
                    await p.render({ canvasContext: ctx, viewport: vp }).promise;
                    const b = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
                    c.width = 0; c.height = 0; // libera o canvas
                    if (!b) throw new Error('sem imagem');
                    if (cancelado) return; // fechou durante a renderização: não cria blob solto
                    const u = URL.createObjectURL(b);
                    urlsRef.current.push(u);
                    const img = new Image();
                    img.src = u;
                    // só segue quando a imagem está carregada: o print() síncrono não pode esperar nada
                    await new Promise((res) => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } });
                    lista.push({ url: u, img });
                    if (cancelado) return;
                }
                if (!cancelado) setImgsImpressao(lista);
            } catch {
                if (!cancelado) setImgsImpressao([]); // vazio = impressão indisponível; Salvar PDF continua valendo
            }
        })();
        return () => { cancelado = true; };
    }, [pdf]);

    useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); urlsRef.current = []; }, []);

    // 5) página atual pelo scroll
    const aoRolar = useCallback(() => {
        const area = areaRef.current;
        if (!area || !dimensoes.length) return;
        if (Date.now() < navegandoAte.current) return; // rolagem suave em curso: não atropela a página escolhida
        const meio = area.scrollTop + area.clientHeight / 3;
        let atual = 1;
        const filhos = area.querySelectorAll('[data-pg]');
        filhos.forEach((el, i) => { if (el.offsetTop <= meio) atual = i + 1; });
        setPagina(atual);
    }, [dimensoes.length]);

    const irPara = (n) => {
        const area = areaRef.current;
        const alvo = area?.querySelector(`[data-pg="${n}"]`);
        if (area && alvo) {
            navegandoAte.current = Date.now() + 700;
            setPagina(n);
            area.scrollTo({ top: alvo.offsetTop - 8, behavior: 'smooth' });
            setTimeout(() => { navegandoAte.current = 0; aoRolar(); }, 750);
        }
    };

    useEffect(() => {
        const tecla = (e) => {
            if (e.key === 'Escape') onFechar?.();
            else if (e.key === 'ArrowRight' || e.key === 'PageDown') irPara(Math.min((dimensoes.length || 1), pagina + 1));
            else if (e.key === 'ArrowLeft' || e.key === 'PageUp') irPara(Math.max(1, pagina - 1));
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    const salvar = async () => {
        const b = blobRef.current;
        if (!b) return;
        setAviso('');
        setSalvando(true);
        try {
            const arquivo = new File([b], nomeArquivo, { type: 'application/pdf' });
            // folha de compartilhar só em iPad/iPhone/Android; no computador o certo é baixar o arquivo
            const celular = ios || /Android/i.test(navigator.userAgent || '');
            if (celular && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] }) && typeof navigator.share === 'function') {
                try { await navigator.share({ files: [arquivo], title: titulo || nomeArquivo }); return; }
                catch (e) { if (e?.name === 'AbortError') return; /* outro erro: cai no download */ }
            }
            const u = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = u; a.download = nomeArquivo; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(u), 30000);
        } finally { setSalvando(false); }
    };

    const imprimir = () => {
        if (!imgsImpressao?.length || !imgsImpressao.every((i) => i.img.complete)) return;
        const css = '@page { size: A4 portrait; margin: 0; } html.modo-impressao #area-impressao { width: 210mm !important; max-width: none !important; } '
            + '#area-impressao .pg { display:block; width:210mm; height:296.8mm; page-break-after:always; break-after:page; } #area-impressao .pg:last-child { page-break-after:auto; break-after:auto; }';
        const corpo = imgsImpressao.map((i) => `<img class="pg" src="${i.url}" alt="">`).join('');
        imprimirNaPagina(css, corpo); // síncrono no clique
    };

    const total = dimensoes.length;
    const impressaoPronta = Array.isArray(imgsImpressao) && imgsImpressao.length > 0;
    const impressaoFalhou = Array.isArray(imgsImpressao) && imgsImpressao.length === 0;

    const conteudo = (
        <div className="fixed inset-0 z-[9500] bg-gray-900 flex flex-col" role="dialog" aria-modal="true" aria-label={titulo || 'PDF'}>
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1 basis-full md:basis-auto">
                    <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">{titulo || nomeArquivo}</span>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className={`${BTN} bg-white border border-gray-300 text-gray-800 md:hidden`}><X className="h-5 w-5" /></button>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => irPara(Math.max(1, pagina - 1))} disabled={pagina <= 1} aria-label="Página anterior" className={`${BTN} bg-gray-100 text-gray-800`}><ChevronLeft className="h-5 w-5" /></button>
                    <span className="text-sm font-semibold text-gray-800 px-1 whitespace-nowrap" aria-live="polite">pág. {total ? pagina : 0}/{total}</span>
                    <button type="button" onClick={() => irPara(Math.min(total, pagina + 1))} disabled={pagina >= total} aria-label="Próxima página" className={`${BTN} bg-gray-100 text-gray-800`}><ChevronRight className="h-5 w-5" /></button>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.25).toFixed(2)))} disabled={zoom <= ZOOM_MIN} aria-label="Diminuir" className={`${BTN} bg-gray-100 text-gray-800`}><Minus className="h-4 w-4" /></button>
                    <span className="text-sm font-semibold text-gray-800 w-12 text-center">{Math.round(zoom * 100)}%</span>
                    <button type="button" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.25).toFixed(2)))} disabled={zoom >= ZOOM_MAX} aria-label="Aumentar" className={`${BTN} bg-gray-100 text-gray-800`}><Plus className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setZoom(1)} aria-label="Ajustar à largura" title="Ajustar à largura" className={`${BTN} bg-gray-100 text-gray-800`}><Maximize2 className="h-4 w-4" /></button>
                </div>
                <div className="flex items-center gap-2 md:ml-auto">
                    <button type="button" onClick={salvar} disabled={!pdf || salvando} className={`${BTN} bg-white border border-primary text-primary`}>
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Salvar PDF
                    </button>
                    <button type="button" onClick={imprimir} disabled={!impressaoPronta} className={`${BTN} bg-primary hover:bg-primaryDark text-white`}>
                        {!pdf || (!impressaoPronta && !impressaoFalhou) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        {!pdf || (!impressaoPronta && !impressaoFalhou) ? 'Preparando…' : 'Imprimir'}
                    </button>
                    <button type="button" onClick={onFechar} className={`${BTN} bg-white border border-gray-300 text-gray-800 hidden md:inline-flex`}>Fechar</button>
                </div>
                {(ios || impressaoFalhou || aviso) && (
                    <p className="basis-full text-xs text-gray-700">
                        {impressaoFalhou
                            ? 'Não consegui preparar a impressão aqui. Toque em Salvar PDF e imprima o arquivo salvo.'
                            : 'No iPad a impressão depende do Safari. Se a janela de impressão não abrir, toque em Salvar PDF e escolha Imprimir na folha de compartilhar.'}
                    </p>
                )}
            </div>

            <div ref={areaRef} onScroll={aoRolar} className="flex-1 overflow-auto p-3 overscroll-contain relative" style={{ WebkitOverflowScrolling: 'touch' }}>
                {erro && <p className="max-w-md mx-auto mt-10 rounded-xl bg-white p-4 text-red-700 font-semibold text-center">{erro}</p>}
                {!erro && !pdf && <div className="text-white text-center mt-16"><Loader2 className="h-8 w-8 animate-spin mx-auto" /><p className="mt-2 text-sm">Abrindo o PDF…</p></div>}
                {pdf && (
                    <div style={{ width: cssLargura || undefined }} className="mx-auto space-y-3">
                        {dimensoes.map((d, i) => (
                            <div key={i} data-pg={i + 1} className="bg-white shadow-lg" style={{ width: cssLargura, height: Math.round((cssLargura * d.h) / d.w) }}>
                                <canvas ref={(el) => { canvasRefs.current[i] = el; }} style={{ width: '100%', height: '100%', display: 'block' }} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
    return createPortal(conteudo, document.body);
}
