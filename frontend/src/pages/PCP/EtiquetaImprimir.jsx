import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Printer, Minus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';
import { codExibir, imprimirEtiquetas, validadeDias } from './EtiquetaLabel';
import { EtiquetaRender } from './EtiquetaLabelNova';
import { TAMANHO_PADRAO, LAYOUTS, LAYOUT_PADRAO, layoutValido, paginaImpressao, ehDeitada, dimensoesEtiqueta } from './etiquetaModelos';
import { IconeOrientacao, useEscalaPreview } from './OrientacaoEtiqueta';
import { TAMANHOS } from './etiquetaModelos';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

function hojeIso() { return new Date().toISOString().split('T')[0]; }

function isoParaDisplay(iso) {
    const d = new Date(iso + 'T12:00:00');
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function somarDias(isoDate, dias) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}


// ─── Página principal ─────────────────────────────────────────────────────────

export default function EtiquetaImprimir() {
    const { id } = useParams();
    const navigate = useNavigate();
    const printRef = useRef(null);

    const [et, setEt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dataFab, setDataFab] = useState(hojeIso());
    const [copies, setCopies] = useState(1);
    // Tamanho (rolo) e Modelo (layout) escolhidos SEPARADAMENTE.
    const [tamanho, setTamanho] = useFiltroSalvo('etiquetas:tamanho', TAMANHO_PADRAO);
    const [modeloSalvo, setModelo] = useFiltroSalvo('etiquetas:modelo', LAYOUT_PADRAO);
    const layout = layoutValido(modeloSalvo); // sanitiza valor legado ('anvisa120' → 'anvisa')

    useEffect(() => {
        etiquetaService.buscar(id)
            .then(data => { setEt(data); })
            .catch(err => { toast.error(err.message); navigate('/pcp/etiquetas'); })
            .finally(() => setLoading(false));
    }, [id, navigate]);

    // Hooks antes de qualquer return condicional (et pode ser null no 1º render)
    const deitada = ehDeitada(et);
    const desenho = dimensoesEtiqueta(tamanho, deitada ? 'DEITADA' : 'EM_PE');
    const [previewRef, escala] = useEscalaPreview(desenho.larguraMM, tamanho === 'g120' ? 1.5 : 1.8);

    if (loading) return <div className="p-8 text-center text-gray-400">Carregando...</div>;
    if (!et) return null;

    const pagina = paginaImpressao(tamanho);
    const dataFabDisplay = isoParaDisplay(dataFab);
    const dias = validadeDias(et);
    const dataValDisplay = somarDias(dataFab, dias);

    const handlePrint = () => {
        const conteudo = printRef.current;
        if (!conteudo) return;

        imprimirEtiquetas(conteudo.innerHTML, parseInt(copies) || 1, tamanho, deitada ? 'DEITADA' : 'EM_PE');
    };

    return (
        <div className="w-full max-w-full overflow-x-hidden px-3 py-4 md:px-4 md:py-6">
            <div className="flex items-center gap-3 mb-4 md:mb-6">
                <button onClick={() => navigate('/pcp/etiquetas')} className="p-2 rounded-lg hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Imprimir Etiqueta</h1>
                    <p className="text-sm text-gray-500">{et.nomeProduto} — Cód. {codExibir(et)}</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 mb-4 md:mb-6">
                <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-end gap-3 md:gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tamanho</label>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.values(TAMANHOS).map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setTamanho(t.id)}
                                    className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all min-h-[44px] ${
                                        tamanho === t.id
                                            ? 'bg-primary text-white border-primary shadow-sm'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                        {deitada ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold bg-mint text-primaryDark min-h-[44px]" title="Etiqueta marcada como deitada em Dados das Etiquetas: usa o layout de mercado">
                                <IconeOrientacao orientacao="DEITADA" /> Deitada · mercado
                            </div>
                        ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {Object.values(LAYOUTS).map(l => (
                                <button
                                    key={l.id}
                                    onClick={() => setModelo(l.id)}
                                    className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all min-h-[44px] ${
                                        layout === l.id
                                            ? 'bg-primary text-white border-primary shadow-sm'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'
                                    }`}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Fabricação</label>
                        <input
                            type="date"
                            value={dataFab}
                            onChange={e => setDataFab(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                            {dataValDisplay} <span className="text-gray-400">({dias} dias{et.produto?.validadeDias != null ? ' · do produto' : ''})</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cópias</label>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCopies(c => Math.max(1, (parseInt(c)||1)-1))} className="p-1.5 rounded border border-gray-300 hover:bg-gray-50">
                                <Minus className="h-4 w-4" />
                            </button>
                            <input
                                type="number"
                                min="1"
                                max="999"
                                value={copies}
                                onChange={e => {
                                    const v = parseInt(e.target.value);
                                    if (!isNaN(v) && v >= 1) setCopies(Math.min(999, v));
                                    else if (e.target.value === '') setCopies('');
                                }}
                                onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) setCopies(1); }}
                                className="w-16 text-center font-semibold text-gray-800 border border-gray-300 rounded-lg py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button onClick={() => setCopies(c => Math.min(999, (parseInt(c)||1)+1))} className="p-1.5 rounded border border-gray-300 hover:bg-gray-50">
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <button onClick={handlePrint} className="col-span-2 md:col-auto flex items-center justify-center gap-2 px-6 py-2 min-h-[44px] bg-primary text-white rounded-full font-semibold hover:bg-primaryDark transition-colors">
                        <Printer className="h-4 w-4" />
                        Imprimir {copies > 1 ? `${copies} cópias` : ''}
                    </button>
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <Printer className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 leading-relaxed">
                        {deitada
                            ? <>Etiqueta <b>deitada</b> ({desenho.larguraMM} × {desenho.alturaMM} mm): na janela de impressão o papel é o mesmo de sempre, <b>{pagina.texto}</b>.</>
                            : <>A etiqueta é <b>{pagina.etiquetaTexto}</b>; como ela imprime deitada, na janela de impressão o papel aparece como <b>{pagina.texto}</b> — é esse que você escolhe.</>}
                        {' '}Mantenha a escala em <b>100%</b> (nada de &ldquo;ajustar à página&rdquo;): com papel de outro tamanho o navegador encolhe a etiqueta num canto.
                    </p>
                </div>
            </div>

            <div ref={previewRef} className="bg-gray-100 rounded-xl p-3 md:p-6 flex justify-center overflow-hidden">
                <div>
                    <p className="text-xs text-gray-500 text-center mb-3">Preview — {desenho.larguraMM}mm × {desenho.alturaMM}mm · {deitada ? 'Deitada · mercado' : LAYOUTS[layout]?.label}</p>
                    <div ref={printRef} style={{ transform:`scale(${escala})`, transformOrigin:'top center', marginBottom: `${Math.max(0, desenho.alturaMM * (96 / 25.4) * (escala - 1))}px` }}>
                        <EtiquetaRender layout={layout} tamanho={tamanho} et={et} dataFab={dataFabDisplay} dataVal={dataValDisplay} />
                    </div>
                </div>
            </div>
        </div>
    );
}
