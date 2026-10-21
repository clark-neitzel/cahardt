import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Camera, CheckCircle, AlertTriangle, XCircle, HelpCircle, ImageOff, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { MSG_FOTO_PERDIDA } from '../Diario/ImgComFalha';

/**
 * Visualizador de fotos do checklist de veículo (tela cheia, zoom, parecer).
 * Usado no motorista (modo 'motorista', com botões) e no escritório (modo 'escritorio', só leitura).
 *
 * Props:
 *   slides: Slide[]            ordem de exibição
 *   indiceInicial?: number
 *   onClose: () => void
 *   modo: 'motorista' | 'escritorio'
 *   semParecer?: boolean       esconde o rodapé de parecer e usa o título "Fotos modelo" (fotos modelo do veículo)
 *   contexto?: { motorista, data, veiculo, kmLido, kmDigitado, kmOrigem }   faixa do painel, só escritório
 *   acoes?: {                  só motorista (todas podem devolver Promise; erro vira toast)
 *     onRefazer(slide)         SÍNCRONO: precisa abrir a câmera dentro do toque (iOS)
 *     onComplemento(slide)     SÍNCRONO: idem, para a foto extra (água/óleo)
 *     onAceitar(slide, desfazer: boolean)
 *     onResponder(slide, indice, resposta: 'SIM'|'NAO')
 *     modoTeste: boolean       "Tá certo assim" só aparece em modo TESTE
 *   }
 *
 * Slide = { chave, rotulo, url, statusIa, serve, aceitaPeloMotorista, aceitaEm,
 *           parecer: { gravidade, titulo, oQueFazer } | null,
 *           perguntas: [{ indice, texto, resposta }],
 *           complementoRotulo?: string|null, complemento: { url } | null, editavel: boolean }
 * (utils/checklistFotos.js -> montarSlides monta tudo isso a partir de checklist.fotos + config.slots)
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const T0 = { s: 1, x: 0, y: 0 };
const ESCALA_MAX = 5;

// Android: o botão voltar fecha o visualizador (e não o app). Contador protege contra o StrictMode.
let ativos = 0;

const CHIP = {
    REPROVA: { cls: 'bg-red-100 text-red-700', txt: 'Problema', Icon: XCircle },
    REFAZER: { cls: 'bg-red-100 text-red-700', txt: 'Refazer', Icon: RefreshCw },
    ATENCAO: { cls: 'bg-amber-100 text-amber-700', txt: 'Atenção', Icon: AlertTriangle },
    PERGUNTA: { cls: 'bg-amber-100 text-amber-700', txt: 'Pergunta', Icon: HelpCircle },
};

const horaDe = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const fmtKm = (n) => (n != null && Number.isFinite(Number(n)) ? Number(n).toLocaleString('pt-BR') : null);

const VisualizadorFotos = ({ slides = [], indiceInicial = 0, onClose, modo = 'motorista', contexto = null, acoes = null, semParecer = false }) => {
    const total = slides.length;
    const [indice, setIndice] = useState(clamp(indiceInicial, 0, Math.max(0, total - 1)));
    const [t, setT] = useState(T0);
    const [arraste, setArraste] = useState(0);
    const [movendo, setMovendo] = useState(false);
    const [falhou, setFalhou] = useState(false);
    const [verComp, setVerComp] = useState(false);
    const [depois, setDepois] = useState({});     // { chave: true } ofertas de foto extra dispensadas
    const [ocupado, setOcupado] = useState(false);
    const tRef = useRef(T0);
    const stageRef = useRef(null);
    const ptrs = useRef(new Map());
    const gesto = useRef({ x: 0, y: 0, tx: 0, ty: 0, t: 0, d0: 0, s0: 1, pinca: false });
    const ultimoToque = useRef(0);
    const travaRef = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const slide = slides[indice] || null;
    const escritorio = modo === 'escritorio';
    const urlAtual = slide ? (verComp && slide.complemento ? slide.complemento.url : slide.url) : '';

    const aplicar = useCallback((n) => { tRef.current = n; setT(n); }, []);
    const limitar = useCallback((n) => {
        const el = stageRef.current;
        const s = clamp(n.s, 1, ESCALA_MAX);
        if (s <= 1.001) return T0;
        const mx = ((el?.clientWidth || 0) * (s - 1)) / 2;
        const my = ((el?.clientHeight || 0) * (s - 1)) / 2;
        return { s, x: clamp(n.x, -mx, mx), y: clamp(n.y, -my, my) };
    }, []);
    // Zoom mantendo o ponto (cx,cy, relativo ao centro do palco) parado
    const zoomEm = useCallback((s2, cx = 0, cy = 0) => {
        const { s, x, y } = tRef.current;
        const k = clamp(s2, 1, ESCALA_MAX) / s;
        aplicar(limitar({ s: clamp(s2, 1, ESCALA_MAX), x: cx - (cx - x) * k, y: cy - (cy - y) * k }));
    }, [aplicar, limitar]);

    const ir = useCallback((delta) => {
        setIndice((i) => clamp(i + delta, 0, Math.max(0, total - 1)));
    }, [total]);

    // Alternar principal/extra: a imagem nova ganha outra chance de carregar
    useEffect(() => { setFalhou(false); }, [verComp]);

    // Ao trocar de foto: zera zoom, estado de erro e "ver foto extra"
    useEffect(() => { aplicar(T0); setArraste(0); setFalhou(false); setVerComp(false); }, [indice, aplicar]);

    // Voltar do Android fecha o visualizador
    useEffect(() => {
        ativos += 1;
        if (!window.history.state?.vf) window.history.pushState({ vf: 1 }, '');
        const aoVoltar = () => onCloseRef.current?.();
        window.addEventListener('popstate', aoVoltar);
        return () => {
            ativos -= 1;
            window.removeEventListener('popstate', aoVoltar);
            setTimeout(() => { if (ativos === 0 && window.history.state?.vf) window.history.back(); }, 0);
        };
    }, []);

    // Trava o scroll do app por trás
    useEffect(() => {
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = antes; };
    }, []);

    // Teclado
    useEffect(() => {
        const tecla = (e) => {
            const alvo = e.target?.tagName;
            if (alvo === 'INPUT' || alvo === 'TEXTAREA') return;
            if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current?.(); }
            else if (e.key === 'ArrowLeft') ir(-1);
            else if (e.key === 'ArrowRight') ir(1);
            else if (e.key === '+' || e.key === '=') zoomEm(tRef.current.s * 1.3);
            else if (e.key === '-') zoomEm(tRef.current.s / 1.3);
            else if (e.key === '0') aplicar(T0);
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [ir, zoomEm, aplicar]);

    // Roda do mouse (listener não-passivo, senão o preventDefault não vale)
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return undefined;
        const roda = (e) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            const cx = e.clientX - (r.left + r.width / 2);
            const cy = e.clientY - (r.top + r.height / 2);
            zoomEm(tRef.current.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), cx, cy);
        };
        el.addEventListener('wheel', roda, { passive: false });
        return () => el.removeEventListener('wheel', roda);
    }, [zoomEm]);

    // Pré-carrega só as 2 vizinhas
    useEffect(() => {
        [indice - 1, indice + 1].forEach((i) => {
            const u = slides[i]?.url;
            if (u) { const im = new Image(); im.src = u; }
        });
    }, [indice, slides]);

    // ---- gestos (Pointer Events) ----
    const iniciarSimples = (p) => {
        gesto.current = { ...gesto.current, x: p.clientX, y: p.clientY, tx: tRef.current.x, ty: tRef.current.y, t: Date.now(), pinca: false };
    };
    const aoPressionar = (e) => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
        ptrs.current.set(e.pointerId, e);
        setMovendo(true);
        if (ptrs.current.size === 2) {
            const [a, b] = [...ptrs.current.values()];
            gesto.current.d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
            gesto.current.s0 = tRef.current.s;
            gesto.current.pinca = true;
            setArraste(0);
        } else if (ptrs.current.size === 1) {
            iniciarSimples(e);
        }
    };
    const aoMover = (e) => {
        if (!ptrs.current.has(e.pointerId)) return;
        ptrs.current.set(e.pointerId, e);
        const g = gesto.current;
        if (ptrs.current.size >= 2 && g.pinca) {
            const [a, b] = [...ptrs.current.values()];
            const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const r = stageRef.current?.getBoundingClientRect();
            const cx = (a.clientX + b.clientX) / 2 - (r ? r.left + r.width / 2 : 0);
            const cy = (a.clientY + b.clientY) / 2 - (r ? r.top + r.height / 2 : 0);
            zoomEm(g.s0 * (d / g.d0), cx, cy);
            return;
        }
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (tRef.current.s > 1) aplicar(limitar({ s: tRef.current.s, x: g.tx + dx, y: g.ty + dy }));
        else if (Math.abs(dx) > Math.abs(dy)) setArraste(dx);
    };
    const aoSoltar = (e) => {
        const tinha = ptrs.current.has(e.pointerId);
        ptrs.current.delete(e.pointerId);
        if (!tinha) return;
        const g = gesto.current;
        if (g.pinca) {
            if (ptrs.current.size === 0) { g.pinca = false; setMovendo(false); if (tRef.current.s < 1.05) aplicar(T0); }
            else if (ptrs.current.size === 1) { g.pinca = false; iniciarSimples([...ptrs.current.values()][0]); }
            return;
        }
        setMovendo(false);
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        setArraste(0);
        const agora = Date.now();
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && agora - g.t < 350) {
            // toque: duplo toque alterna 1x / 2,5x
            if (agora - ultimoToque.current < 320) {
                ultimoToque.current = 0;
                if (tRef.current.s > 1) aplicar(T0);
                else {
                    const r = stageRef.current?.getBoundingClientRect();
                    zoomEm(2.5, r ? e.clientX - (r.left + r.width / 2) : 0, r ? e.clientY - (r.top + r.height / 2) : 0);
                }
            } else ultimoToque.current = agora;
            return;
        }
        if (tRef.current.s <= 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) ir(dx < 0 ? 1 : -1);
    };

    // ---- ações do motorista (uma de cada vez) ----
    const rodar = async (fn) => {
        if (travaRef.current) return;
        travaRef.current = true;
        setOcupado(true);
        try { await fn(); }
        catch (err) { toast.error(err?.response?.data?.error || 'Não deu certo. Tente de novo.'); }
        finally { travaRef.current = false; setOcupado(false); }
    };

    if (!slide) return null;

    const par = slide.parecer;
    const chip = par ? CHIP[par.gravidade] : null;
    const aceitavel = !!acoes && slide.editavel && acoes.modoTeste
        && (slide.serve === false || slide.statusIa === 'ATENCAO' || slide.statusIa === 'REFAZER')
        && par?.gravidade !== 'REPROVA' && slide.statusIa !== 'REPROVA'
        && !slide.perguntas.some((q) => q.resposta === 'NAO')   // quem respondeu Não não pode dizer que está certo
        && !slide.perguntas.some((q) => !q.resposta);            // pergunta pendente: responde primeiro
    const ofertaComp = !!acoes && slide.editavel && slide.complementoRotulo && !slide.complemento
        && slide.perguntas.length > 0 && !depois[slide.chave];
    const kmLido = contexto?.kmLido;

    const conteudo = (
        <div className="fixed inset-0 z-[140] bg-black flex flex-col lg:flex-row" role="dialog" aria-modal="true" aria-label="Fotos do checklist">
            {/* Palco */}
            <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
                <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-b from-black/70 to-transparent">
                    <span className="text-sm font-bold text-white truncate min-w-0">
                        {semParecer ? `Fotos modelo · ${slide.rotulo}` : slide.rotulo} · {indice + 1} de {total}
                        {contexto?.veiculo && <span className="ml-2 text-xs font-semibold text-gray-300">{contexto.veiculo}</span>}
                        {verComp && <span className="ml-2 text-xs font-semibold text-amber-300">foto extra</span>}
                    </span>
                    <button type="button" onClick={onClose} aria-label="Fechar"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div ref={stageRef}
                    className="absolute inset-0 flex items-center justify-center select-none"
                    style={{ touchAction: 'none', cursor: t.s > 1 ? 'grab' : 'default' }}
                    onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
                    {falhou ? (
                        <div className="flex flex-col items-center gap-2 text-gray-300 px-6 text-center">
                            <ImageOff className="h-10 w-10" />
                            <p className="text-sm">{MSG_FOTO_PERDIDA}</p>
                        </div>
                    ) : (
                        <img key={urlAtual} src={urlAtual} alt={slide.rotulo} draggable={false} onError={() => setFalhou(true)}
                            className="max-h-full max-w-full object-contain pointer-events-none"
                            style={{
                                transform: `translate(${t.x + (t.s <= 1 ? arraste : 0)}px, ${t.y}px) scale(${t.s})`,
                                transition: movendo ? 'none' : 'transform 0.18s ease-out',
                                willChange: 'transform',
                            }} />
                    )}
                </div>

                {indice > 0 && (
                    <button type="button" onClick={() => ir(-1)} aria-label="Foto anterior"
                        className="hidden md:inline-flex absolute left-3 top-1/2 -translate-y-1/2 z-10 h-11 w-11 items-center justify-center rounded-full bg-black/45 hover:bg-black/70 text-white">
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                )}
                {indice < total - 1 && (
                    <button type="button" onClick={() => ir(1)} aria-label="Próxima foto"
                        className="hidden md:inline-flex absolute right-3 top-1/2 -translate-y-1/2 z-10 h-11 w-11 items-center justify-center rounded-full bg-black/45 hover:bg-black/70 text-white">
                        <ChevronRight className="h-6 w-6" />
                    </button>
                )}
            </div>

            {/* Parecer */}
            {!semParecer && <div className="bg-white rounded-t-2xl lg:rounded-none max-h-[46dvh] lg:max-h-none lg:w-[360px] lg:h-full overflow-y-auto shrink-0 p-4 space-y-3">
                {escritorio && contexto && (
                    <p className="text-xs text-gray-600 border-b border-gray-100 pb-2">
                        {[contexto.motorista, contexto.veiculo, contexto.data].filter(Boolean).join(' · ')}
                    </p>
                )}

                {par ? (
                    <div>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${chip?.cls || 'bg-gray-100 text-gray-700'}`}>
                            {chip && <chip.Icon className="h-3.5 w-3.5" />} {chip?.txt || 'Atenção'}
                        </span>
                        <p className="mt-1.5 text-base font-bold text-gray-900">{par.titulo}</p>
                        {par.oQueFazer && <p className="text-sm text-gray-600 mt-0.5">O que fazer: {par.oQueFazer}</p>}
                    </div>
                ) : (
                    <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-800">
                        <CheckCircle className="h-5 w-5" /> {slide.statusIa === 'IA_INDISPONIVEL' || slide.statusIa === 'NAO_ANALISADA' ? 'Foto enviada sem análise da IA' : 'Tudo certo nesta foto'}
                    </p>
                )}

                {/* Perguntas */}
                {slide.perguntas.map((q) => {
                    if (!q.resposta) {
                        if (escritorio || !acoes || !slide.editavel) {
                            return <p key={q.indice} className="text-sm text-gray-700">Pergunta sem resposta: {q.texto}</p>;
                        }
                        return (
                            <div key={q.indice} className="bg-amber-50 border border-amber-300 rounded-xl p-3">
                                <p className="text-base font-bold text-gray-900">{q.texto}</p>
                                <div className="grid grid-cols-2 gap-2 mt-3">
                                    <button type="button" disabled={ocupado} onClick={() => rodar(() => acoes.onResponder?.(slide, q.indice, 'SIM'))}
                                        className="min-h-[44px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-sm">Sim</button>
                                    <button type="button" disabled={ocupado} onClick={() => rodar(() => acoes.onResponder?.(slide, q.indice, 'NAO'))}
                                        className="min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 rounded-full font-semibold text-sm">Não</button>
                                </div>
                            </div>
                        );
                    }
                    const sim = q.resposta === 'SIM';
                    return (
                        <p key={q.indice} className={`flex items-start gap-1.5 text-sm ${sim ? 'text-green-800' : 'text-amber-800'}`}>
                            {sim ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                            <span>
                                {escritorio
                                    ? `${contexto?.motorista || 'Motorista'} respondeu ${sim ? 'Sim' : 'Não'}: ${q.texto}`
                                    : sim ? `Você confirmou: ${q.texto}` : `Você respondeu Não: ${q.texto}`}
                            </span>
                        </p>
                    );
                })}

                {/* Foto extra (água / óleo) */}
                {ofertaComp && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-sm font-semibold text-gray-800">Quer ajudar a conferência? {slide.complementoRotulo}</p>
                        <p className="text-xs text-gray-600 mt-0.5">É opcional, não trava o seu dia.</p>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <button type="button" disabled={ocupado} onClick={() => acoes.onComplemento?.(slide)}
                                className="min-h-[44px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-xs inline-flex items-center justify-center gap-1.5">
                                <Camera className="h-4 w-4" /> Mandar foto de cima
                            </button>
                            <button type="button" onClick={() => setDepois((d) => ({ ...d, [slide.chave]: true }))}
                                className="min-h-[44px] bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-xs">Depois</button>
                        </div>
                    </div>
                )}
                {slide.complemento && (
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setVerComp((v) => !v)}
                            className="flex items-center gap-2 min-h-[44px] pr-3 rounded-xl border border-gray-200 bg-gray-50 text-left">
                            <img src={slide.complemento.url} alt="Foto extra" className="h-11 w-14 object-cover rounded-l-xl" />
                            <span className="text-xs font-semibold text-gray-700">{verComp ? 'Ver a foto principal' : 'Ver a foto extra'}</span>
                        </button>
                        {!escritorio && acoes && slide.editavel && slide.complementoRotulo && (
                            <button type="button" disabled={ocupado} onClick={() => acoes.onComplemento?.(slide)}
                                className="min-h-[44px] px-3 text-xs font-medium text-primary underline">Trocar foto extra</button>
                        )}
                    </div>
                )}

                {/* Escritório: discordância e KM */}
                {escritorio && slide.aceitaPeloMotorista && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Motorista discordou da IA{horaDe(slide.aceitaEm) ? ` às ${horaDe(slide.aceitaEm)}` : ''}.
                    </p>
                )}
                {escritorio && slide.angulo === 'painel' && contexto && (kmLido != null || contexto.kmDigitado != null) && (
                    <p className="text-sm text-gray-700">
                        KM lido pela IA: <b>{fmtKm(kmLido) || '—'}</b>
                        {contexto.kmDigitado != null && <> · KM do dia: <b>{fmtKm(contexto.kmDigitado)}</b></>}
                        {contexto.kmOrigem && <> · {contexto.kmOrigem === 'PAINEL_CONFIRMADO' ? 'confirmado do painel' : 'digitado'}</>}
                    </p>
                )}

                {/* Ações do motorista */}
                {!escritorio && acoes && slide.editavel && (
                    <div className="flex flex-col gap-2 pt-1">
                        <button type="button" disabled={ocupado} onClick={() => acoes.onRefazer?.(slide)}
                            className="w-full min-h-[48px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-sm shadow-sm inline-flex items-center justify-center gap-2">
                            <Camera className="h-5 w-5" /> Tirar de novo
                        </button>
                        {aceitavel && !slide.aceitaPeloMotorista && (
                            <button type="button" disabled={ocupado} onClick={() => rodar(() => acoes.onAceitar?.(slide, false))}
                                className="w-full min-h-[48px] bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 rounded-full font-medium text-sm inline-flex items-center justify-center gap-2">
                                {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Tá certo assim, deixa
                            </button>
                        )}
                        {slide.aceitaPeloMotorista && (
                            <p className="flex items-center justify-between gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                                <span className="inline-flex items-center gap-1.5 font-semibold"><CheckCircle className="h-4 w-4" /> Você disse que está certo</span>
                                <button type="button" disabled={ocupado} onClick={() => rodar(() => acoes.onAceitar?.(slide, true))}
                                    className="min-h-[44px] px-2 underline text-xs font-medium disabled:opacity-50">Desfazer</button>
                            </p>
                        )}
                    </div>
                )}
            </div>}
        </div>
    );

    return createPortal(conteudo, document.body);
};

export default VisualizadorFotos;
