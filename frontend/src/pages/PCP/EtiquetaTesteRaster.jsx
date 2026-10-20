import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Download, Scan } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import etiquetaService from '../../services/etiquetaService';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { EtiquetaRender } from './EtiquetaLabelNova';
import { TAMANHOS, LAYOUTS, layoutValido, ehDeitada, dimensoesEtiqueta } from './etiquetaModelos';
import {
    rasterizarEtiquetas, bitmapParaCanvas, matrizQr, empacotarParaEnvio, GIRO_DEITADA, LIMIAR, ESCALA, PX_POR_MM,
} from './etiquetaRaster';
import { montarEtiquetas, LINK_KIT_FESTA, FONTES_ETIQUETA } from '../KitFesta/etiquetasCaixas';

// As frases/nomes são medidos com canvas.measureText: SÓ valem com as fontes já carregadas
const carregarFontesKit = () => Promise.all(FONTES_ETIQUETA.map((f) => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready);

// SPIKE E3-0 (admin, sem item de menu): rasteriza etiquetas REAIS e mostra o bitmap 1-bit em
// tamanho real ao lado do preview. Serve para decidir se o html2canvas é fiel o bastante.

const PEDIDO_TESTE = {
    numero: '2053', nomeCliente: 'Maria Aparecida dos Santos', modo: 'entrega', data: '2026-10-20', horario: '14:30',
    itens: [
        { nomeProduto: 'COXINHA FRANGO C/25-HF', quantidade: 2, unidadesPorCaixa: 25 },
        { nomeProduto: 'RISOLES DE PRESUNTO E QUEIJO C/25-HF', quantidade: 2, unidadesPorCaixa: 25 },
    ],
};
const QR_PLACEHOLDER = '<svg data-raster="qr" viewBox="0 0 1 1" style="visibility:hidden"></svg>';

function dataBr(d) { const x = new Date(d); return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`; }

function CanvasView({ canvas, zoom, titulo }) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || !canvas) return;
        el.innerHTML = '';
        canvas.style.width = `${(canvas.width / ESCALA) * zoom}px`;   // tamanho REAL (1 mm = 3,78 px) × zoom
        canvas.style.height = `${(canvas.height / ESCALA) * zoom}px`;
        canvas.style.imageRendering = 'pixelated';
        canvas.style.border = '1px solid #9ca3af';
        el.appendChild(canvas);
    }, [canvas, zoom]);
    return (
        <div className="shrink-0">
            <div className="text-xs text-gray-500 mb-1">{titulo} · {canvas.width}×{canvas.height} dots</div>
            <div ref={ref} />
        </div>
    );
}

export default function EtiquetaTesteRaster() {
    const { user } = useAuth();
    const isAdmin = !!user?.permissoes?.admin;
    const [lista, setLista] = useState([]);
    const [f, setF] = useFiltrosSalvos('teste-raster', { etiquetaId: '', tamanho: 'g120', layout: 'anvisa', orientacao: 'auto', zoom: 1 });
    const [rodando, setRodando] = useState(false);
    const [res, setRes] = useState(null); // { canvases:[], tempos, avisos, bytesZlib, kind }
    const [sel, setSel] = useState(null);

    // depuração do spike: HTML do Kit Festa COM o QR real (referência do "print atual")
    useEffect(() => {
        window.__kitRef = async () => {
            await carregarFontesKit();
            const QR = await import('qrcode');
            const svg = await (QR.default || QR).toString(LINK_KIT_FESTA, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
            return montarEtiquetas(PEDIDO_TESTE, { qrSvg: svg, cada: 4, nomeLimpo: true, colunas: 2, frases: 'carinho' });
        };
    }, []);
    useEffect(() => {
        if (!isAdmin) return;
        etiquetaService.listar({}).then((r) => setLista(Array.isArray(r) ? r : (r?.data || []))).catch((e) => toast.error(e.message));
    }, [isAdmin]);

    if (!isAdmin) return <div className="p-8 text-center text-red-600 font-bold">Acesso restrito ao administrador.</div>;

    const etBase = lista.find((e) => String(e.id) === String(f.etiquetaId));
    const et = etBase ? { ...etBase, ...(f.orientacao !== 'auto' ? { orientacao: f.orientacao } : {}) } : null;
    const layout = layoutValido(f.layout);
    const deitada = et ? ehDeitada(et) : false;
    // O layout Clássico é FIXO 80×100 (ignora o rolo — hoje no 100×120 ele sai pequeno no canto, bug de 08/2026)
    const desenho = (layoutValido(f.layout) === 'classico' && !deitada) ? { larguraMM: 80, alturaMM: 100 } : dimensoesEtiqueta(f.tamanho, deitada ? 'DEITADA' : 'EM_PE');
    const hojeDt = new Date();
    const dataFab = dataBr(hojeDt);
    const dataVal = dataBr(new Date(hojeDt.getTime() + 90 * 86400000));

    const rodarProduto = async () => {
        if (!et) { toast.error('Escolha uma etiqueta.'); return; }
        setRodando(true); setRes(null);
        try {
            const r = await rasterizarEtiquetas({
                itens: [{
                    elemento: <EtiquetaRender layout={layout} tamanho={f.tamanho} et={et} dataFab={dataFab} dataVal={dataVal} modoRaster />,
                    larguraMm: desenho.larguraMM, alturaMm: desenho.alturaMM, giro: deitada ? GIRO_DEITADA : 0,
                }],
            });
            const env = await empacotarParaEnvio(r.bitmaps[0]);
            window.__env = { ...env, esperado: r.bitmaps[0].bytes.length, hash: r.bitmaps[0].hash }; // conferência do spike
            setRes({ canvases: r.bitmaps.map(bitmapParaCanvas), tempos: r.tempos, avisos: r.avisos, bytes: env.dados.length, formato: env.formato, kind: 'produto', ts: Date.now() });
        } catch (e) { console.error(e); toast.error('Falhou: ' + e.message); }
        setRodando(false);
    };

    const rodarKit = async (qual) => {
        setRodando(true); setRes(null);
        try {
            await carregarFontesKit();
            const m = await matrizQr(LINK_KIT_FESTA);
            const { estilos, corpo } = montarEtiquetas(PEDIDO_TESTE, { qrSvg: QR_PLACEHOLDER, cada: 4, nomeLimpo: true, colunas: 2, frases: 'carinho' });
            const r = await rasterizarEtiquetas({
                itens: [{ html: corpo, estilos, seletorCelula: qual === 'sabor' ? '.etq.sabor' : '.etq.pedido', larguraMm: 40, alturaMm: 25, qrMatriz: m }],
            });
            const env = await empacotarParaEnvio(r.bitmaps[0]);
            setRes({ canvases: r.bitmaps.map(bitmapParaCanvas), tempos: r.tempos, avisos: r.avisos, bytes: env.dados.length, formato: env.formato, kind: 'kit-' + qual, ts: Date.now(), qrModulos: m.size });
        } catch (e) { console.error(e); toast.error('Falhou: ' + e.message); }
        setRodando(false);
    };

    const baixar = (canvas, i) => {
        const a = document.createElement('a');
        a.download = `raster-${res?.kind || 'etq'}-${i + 1}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    };

    const chip = (ativo) => `px-3 py-2 rounded-full text-xs font-semibold border min-h-[44px] ${ativo ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary'}`;

    return (
        <div className="w-full max-w-full overflow-x-hidden p-3 md:p-6" data-teste-raster>
            <div className="flex items-center gap-3 mb-4">
                <Link to="/pcp/etiquetas" className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft className="h-5 w-5 text-gray-600" /></Link>
                <div className="bg-teal-100 p-2 rounded-lg"><Scan className="h-5 w-5 text-teal-600" /></div>
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900">Teste do rasterizador</h1>
                    <p className="text-xs text-gray-500">Spike E3 · só administrador · limiar {LIMIAR} · {ESCALA.toFixed(4)}× ({PX_POR_MM.toFixed(3)} px/mm → 8 dots/mm)</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Etiqueta de produto</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <label className="text-sm font-medium text-gray-700 md:col-span-2">Etiqueta
                        <SelectBusca value={f.etiquetaId} onChange={(e) => setF({ ...f, etiquetaId: e.target.value })} className="w-full mt-1">
                            <option value="">Escolha…</option>
                            {lista.map((e) => <option key={e.id} value={e.id}>{e.nomeProduto}{e.orientacao === 'DEITADA' ? ' (deitada)' : ''}</option>)}
                        </SelectBusca>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Orientação
                        <SelectBusca value={f.orientacao} onChange={(e) => setF({ ...f, orientacao: e.target.value })} className="w-full mt-1">
                            <option value="auto">Do cadastro</option>
                            <option value="EM_PE">Em pé</option>
                            <option value="DEITADA">Deitada</option>
                        </SelectBusca>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Zoom do bitmap
                        <SelectBusca value={String(f.zoom)} onChange={(e) => setF({ ...f, zoom: Number(e.target.value) })} className="w-full mt-1">
                            <option value="1">Tamanho real</option><option value="2">2×</option><option value="3">3×</option>
                        </SelectBusca>
                    </label>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {Object.values(TAMANHOS).map((t) => <button key={t.id} onClick={() => setF({ ...f, tamanho: t.id })} className={chip(f.tamanho === t.id)}>{t.label}</button>)}
                    <span className="w-2" />
                    {Object.values(LAYOUTS).map((l) => <button key={l.id} onClick={() => setF({ ...f, layout: l.id })} className={chip(layout === l.id)} disabled={deitada} title={deitada ? 'Deitada tem layout único' : ''}>{l.label}</button>)}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={rodarProduto} disabled={rodando} data-acao="produto" className="px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm shadow-sm disabled:opacity-60">Rasterizar produto</button>
                    <button onClick={() => rodarKit('sabor')} disabled={rodando} data-acao="kit-sabor" className="px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-60">Kit Festa · sabor (QR)</button>
                    <button onClick={() => rodarKit('pedido')} disabled={rodando} data-acao="kit-pedido" className="px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-60">Kit Festa · pedido</button>
                </div>
            </div>

            {rodando && <div className="text-sm text-gray-600 mb-3">Rasterizando…</div>}

            {res && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4" data-resultado data-ts={res.ts}>
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Resultado (1-bit)</div>
                    <p className="text-sm text-gray-700 mb-3" data-tempo={res.tempos.join(',')}>
                        Tempo: <b>{res.tempos.join(' / ')} ms</b> · envio {res.formato}: {(res.bytes / 1024).toFixed(1)} KB (base64)
                        {res.avisos.length ? <span className="text-amber-700"> · avisos: {res.avisos.join('; ')}</span> : null}
                    </p>
                    <div className="flex flex-wrap gap-4 overflow-x-auto">
                        {res.canvases.map((c, i) => (
                            <div key={i}>
                                <CanvasView canvas={c} zoom={f.zoom} titulo={`#${i + 1}`} />
                                <button onClick={() => baixar(c, i)} className="mt-1 inline-flex items-center gap-1 text-xs text-primary font-semibold min-h-[44px]"><Download className="h-3.5 w-3.5" /> baixar PNG</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {et && (
                <div className="bg-gray-100 rounded-xl p-3 md:p-6 overflow-x-auto">
                    <p className="text-xs text-gray-500 mb-2">Preview atual (o que o caminho antigo imprime) — {desenho.larguraMM}×{desenho.alturaMM} mm</p>
                    <div data-preview><EtiquetaRender layout={layout} tamanho={f.tamanho} et={et} dataFab={dataFab} dataVal={dataVal} /></div>
                </div>
            )}
        </div>
    );
}
