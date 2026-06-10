import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Printer, X, Minus, Plus, Tag } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';

// ─── Utilidades de data ───────────────────────────────────────────────────────

function isoParaDisplay(iso) {
    const d = new Date(iso + 'T12:00:00');
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function hojeIso() { return new Date().toISOString().split('T')[0]; }

function somarDias(isoDate, dias) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// ─── Componente de código de barras ──────────────────────────────────────────

function BarcodeEl({ value, height = 28 }) {
    const svgRef = useRef(null);
    useEffect(() => {
        if (!svgRef.current || !value) return;
        try {
            JsBarcode(svgRef.current, value, {
                format: 'EAN13',
                width: 1.2,
                height,
                displayValue: true,
                fontSize: 7,
                margin: 1,
                textMargin: 1,
            });
        } catch {
            try {
                JsBarcode(svgRef.current, value, {
                    format: 'CODE128',
                    width: 1.2,
                    height,
                    displayValue: true,
                    fontSize: 7,
                    margin: 1,
                    textMargin: 1,
                });
            } catch { /* sem código de barras */ }
        }
    }, [value, height]);
    if (!value) return null;
    return <svg ref={svgRef} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />;
}

// ─── Etiqueta visual (para preview e impressão) ───────────────────────────────

function LabelView({ et, dataFab, dataVal }) {
    const svgRef = useRef(null);
    useEffect(() => {
        if (!svgRef.current || !et.codigoBarras) return;
        try {
            JsBarcode(svgRef.current, et.codigoBarras, {
                format: 'EAN13', width: 1.1, height: 22,
                displayValue: true, fontSize: 6, margin: 1, textMargin: 0,
            });
        } catch {
            try {
                JsBarcode(svgRef.current, et.codigoBarras, {
                    format: 'CODE128', width: 1.1, height: 22,
                    displayValue: true, fontSize: 6, margin: 1, textMargin: 0,
                });
            } catch { /* ignore */ }
        }
    }, [et.codigoBarras]);

    const alergenos = [];
    if (et.contemLeite)  alergenos.push('leite');
    if (et.contemGluten) alergenos.push('glúten');
    if (et.contemOvo)    alergenos.push('ovos');
    if (et.outrosAlergenos && et.outrosAlergenos.toLowerCase() !== 'não')
        alergenos.push(et.outrosAlergenos);

    const style = {
        width: '80mm', minHeight: '100mm', fontSize: '6.5pt',
        fontFamily: 'Arial, sans-serif', border: '0.5pt solid #000',
        padding: '1.5mm', boxSizing: 'border-box', lineHeight: 1.25,
        background: '#fff', color: '#000',
    };

    return (
        <div style={style}>
            <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'9.5pt', borderBottom:'0.5pt solid #000', paddingBottom:'1mm', marginBottom:'1mm', lineHeight:1.2 }}>
                {et.nomeProduto}
            </div>
            <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'7pt', borderBottom:'0.5pt solid #000', paddingBottom:'0.8mm', marginBottom:'0.8mm' }}>
                CÓD.{et.codigoProduto}&nbsp;&nbsp;&nbsp;PESO UNITÁRIO {et.pesoUnitario} gramas
            </div>
            <div style={{ border:'0.5pt solid #000', marginBottom:'0.8mm' }}>
                <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', borderBottom:'0.5pt solid #000', padding:'0.5mm 0' }}>
                    INFORMAÇÃO NUTRICIONAL - PORÇÃO {et.pesoTabelaNutricional}g
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'6pt' }}>
                    <tbody>
                        {[
                            ['Valor Energético', et.valorEnergetico],
                            ['Carboidratos',     et.carboidratos],
                            ['Proteínas',        et.proteinas],
                            ['Gorduras Trans',   et.gordurasTrans],
                            ['Fibra Alimentar',  et.fibraAlimentar],
                            ['Sódio',            et.sodio],
                        ].filter(([,v]) => v).map(([nome, valor]) => (
                            <tr key={nome} style={{ borderBottom:'0.3pt solid #000' }}>
                                <td style={{ padding:'0.3mm 1mm', width:'55%' }}>{nome}</td>
                                <td style={{ padding:'0.3mm 1mm', textAlign:'right' }}>{valor}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ fontSize:'5pt', fontStyle:'italic', padding:'0.5mm 1mm', borderTop:'0.3pt solid #000', lineHeight:1.2 }}>
                    % Valores diários com base em uma dieta de 2.000 kcal ou 8.400 kJ. Seus valores diários podem ser maiores ou menores dependendo das suas necessidades energéticas.
                </div>
            </div>
            <div style={{ border:'0.5pt solid #000', textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', padding:'0.5mm', borderBottom:'none' }}>
                CONTÉM {et.quantidadeEmbalagem} UNIDADES
            </div>
            <div style={{ border:'0.5pt solid #000', textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', padding:'0.5mm 0' }}>
                INGREDIENTES:
            </div>
            <div style={{ border:'0.5pt solid #000', borderTop:'none', padding:'0.5mm 1mm', marginBottom:'0.8mm', fontSize:'6pt', lineHeight:1.25 }}>
                {et.composicao}
            </div>
            {alergenos.length > 0 && (
                <div style={{ fontStyle:'italic', fontSize:'6pt', marginBottom:'0.8mm' }}>
                    <strong>ALÉRGICOS:</strong> Contém {alergenos.join(', ')}.
                    {et.avisosRotulo && ` ${et.avisosRotulo}`}
                </div>
            )}
            {!alergenos.length && et.avisosRotulo && (
                <div style={{ fontStyle:'italic', fontSize:'6pt', marginBottom:'0.8mm' }}>{et.avisosRotulo}</div>
            )}
            <div style={{ border:'0.5pt solid #000', textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', padding:'0.5mm', borderBottom:'none' }}>
                MODO DE PREPARO
            </div>
            <div style={{ border:'0.5pt solid #000', borderTop:'none', padding:'0.5mm 1mm', marginBottom:'0.8mm', fontSize:'6pt', lineHeight:1.25 }}>
                {et.modoPreparo}
            </div>
            {et.armazenamento && (
                <div style={{ fontStyle:'italic', fontSize:'6pt', marginBottom:'0.5mm', lineHeight:1.2 }}>
                    ❄ Conservação em FREEZER (-12°C ou mais frio)<br />
                    Uma vez descongelado não recongelar o produto.
                </div>
            )}
            {/* Código de barras */}
            {et.codigoBarras && (
                <div style={{ textAlign:'center', marginBottom:'0.5mm' }}>
                    <svg ref={svgRef} style={{ maxWidth:'100%', display:'block', margin:'0 auto' }} />
                </div>
            )}
            <div style={{ border:'0.5pt solid #000', textAlign:'center', fontWeight:'bold', fontSize:'7pt', padding:'0.8mm' }}>
                Fabricação - {dataFab}&nbsp;&nbsp;Validade - {dataVal}
            </div>
        </div>
    );
}

// ─── Modal de impressão ───────────────────────────────────────────────────────

function PrintModal({ et, onClose }) {
    const [dataFab, setDataFab] = useState(hojeIso());
    const [copies, setCopies] = useState(1);
    const labelRef = useRef(null);

    const dataFabDisplay = isoParaDisplay(dataFab);
    const dataValDisplay = somarDias(dataFab, et.validadeDias || 90);

    const handlePrint = () => {
        const conteudo = labelRef.current;
        if (!conteudo) return;

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 80mm 100mm; margin: 2mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; }
    .pg { page-break-after: always; }
    .pg:last-child { page-break-after: avoid; }
  </style>
</head>
<body>
${Array.from({ length: copies }, () => `<div class="pg">${conteudo.innerHTML}</div>`).join('')}
</body>
</html>`;

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open(); doc.write(html); doc.close();
        iframe.contentWindow.onafterprint = () => document.body.removeChild(iframe);
        setTimeout(() => iframe.contentWindow.print(), 300);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">{et.nomeProduto}</h2>
                        <p className="text-sm text-gray-400">Cód. {et.codigoProduto} · {et.pesoUnitario}g · {et.quantidadeEmbalagem} un/emb</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Controles */}
                <div className="px-6 py-4 bg-gray-50 border-b flex flex-wrap items-end gap-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Data de Fabricação</label>
                        <input
                            type="date"
                            value={dataFab}
                            onChange={e => setDataFab(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Validade ({et.validadeDias} dias)</label>
                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-mono">
                            {dataValDisplay}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Cópias</label>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCopies(c => Math.max(1, c-1))} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50">
                                <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-10 text-center text-lg font-bold text-gray-800">{copies}</span>
                            <button onClick={() => setCopies(c => Math.min(200, c+1))} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50">
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={handlePrint}
                        className="ml-auto flex items-center gap-2 px-7 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-base hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        <Printer className="h-5 w-5" />
                        Imprimir{copies > 1 ? ` ${copies}×` : ''}
                    </button>
                </div>

                {/* Preview */}
                <div className="flex-1 overflow-auto bg-gray-100 flex justify-center py-6">
                    <div>
                        <p className="text-xs text-gray-400 text-center mb-3">Preview — 80mm × 100mm</p>
                        <div ref={labelRef} style={{ transform:'scale(1.9)', transformOrigin:'top center', marginBottom:'190px' }}>
                            <LabelView et={et} dataFab={dataFabDisplay} dataVal={dataValDisplay} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Card de etiqueta ─────────────────────────────────────────────────────────

function EtiquetaCard({ et, onPrint }) {
    return (
        <div
            className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
            onClick={() => onPrint(et)}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <span className="inline-block text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mb-1">
                        {et.codigoProduto}
                    </span>
                    <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{et.nomeProduto}</h3>
                </div>
                <Tag className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{et.pesoUnitario}g/un</span>
                <span className="text-gray-300">·</span>
                <span>{et.quantidadeEmbalagem} un/emb</span>
                <span className="text-gray-300">·</span>
                <span>{et.validadeDias}d</span>
            </div>
            {et.codigoBarras && (
                <div className="border-t pt-2">
                    <BarcodeEl value={et.codigoBarras} height={22} />
                </div>
            )}
            <button
                onClick={e => { e.stopPropagation(); onPrint(et); }}
                className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
                <Printer className="h-4 w-4" />
                Imprimir
            </button>
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EtiquetasList() {
    const [todas, setTodas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selecionada, setSelecionada] = useState(null);
    const inputRef = useRef(null);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const data = await etiquetaService.listar({ ativo: 'true' });
            setTodas(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error('Erro ao carregar etiquetas: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => { inputRef.current?.focus(); }, []);

    const filtradas = todas.filter(et => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return et.nomeProduto.toLowerCase().includes(q) || et.codigoProduto.toLowerCase().includes(q);
    });

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Cabeçalho */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Etiquetas</h1>
                <p className="text-sm text-gray-500 mt-0.5">Selecione um produto para imprimir a etiqueta</p>
            </div>

            {/* Busca */}
            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Buscar por nome ou código do produto..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100">
                        <X className="h-4 w-4 text-gray-400" />
                    </button>
                )}
            </div>

            {/* Contador */}
            {!loading && (
                <p className="text-sm text-gray-400 mb-4">
                    {search ? `${filtradas.length} resultado(s) para "${search}"` : `${todas.length} etiqueta(s) ativa(s)`}
                </p>
            )}

            {/* Grid de cards */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="bg-gray-100 rounded-xl h-40 animate-pulse" />
                    ))}
                </div>
            ) : filtradas.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{search ? 'Nenhuma etiqueta encontrada' : 'Nenhuma etiqueta cadastrada'}</p>
                    {search && <p className="text-sm mt-1">Tente outro termo de busca</p>}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filtradas.map(et => (
                        <EtiquetaCard key={et.id} et={et} onPrint={setSelecionada} />
                    ))}
                </div>
            )}

            {/* Modal de impressão */}
            {selecionada && (
                <PrintModal et={selecionada} onClose={() => setSelecionada(null)} />
            )}
        </div>
    );
}
