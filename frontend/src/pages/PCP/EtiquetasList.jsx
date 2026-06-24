import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Printer, X, Minus, Plus, Tag } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';
import EtiquetaLabel, { codExibir } from './EtiquetaLabel';

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
    @page { size: 80mm 100mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important; }
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
                        <p className="text-sm text-gray-400">Cód. {codExibir(et)} · {et.pesoUnitario}g · {et.quantidadeEmbalagem} un/emb</p>
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
                                className="w-16 text-center text-lg font-bold text-gray-800 border border-gray-300 rounded-lg py-1 focus:ring-2 focus:ring-indigo-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button onClick={() => setCopies(c => Math.min(999, (parseInt(c) || 1)+1))} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50">
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
                            <EtiquetaLabel et={et} dataFab={dataFabDisplay} dataVal={dataValDisplay} />
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
                        {codExibir(et)}
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
    const [categoriaSel, setCategoriaSel] = useState(
        () => localStorage.getItem('etiquetas_categoria') || null
    );
    const [selecionada, setSelecionada] = useState(null);
    const inputRef = useRef(null);

    const selecionarCategoria = (id) => {
        setCategoriaSel(id);
        if (id) localStorage.setItem('etiquetas_categoria', id);
        else localStorage.removeItem('etiquetas_categoria');
    };

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

    // Categorias únicas dos produtos vinculados, ordenadas
    const categorias = [...new Map(
        todas
            .filter(et => et.produto?.categoriaProduto)
            .map(et => [et.produto.categoriaProduto.id, et.produto.categoriaProduto])
    ).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    const filtradas = todas
        .filter(et => {
            if (categoriaSel && et.produto?.categoriaProduto?.id !== categoriaSel) return false;
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return et.nomeProduto.toLowerCase().includes(q) || et.codigoProduto.toLowerCase().includes(q);
        })
        .sort((a, b) => a.nomeProduto.localeCompare(b.nomeProduto, 'pt-BR'));

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Cabeçalho */}
            <div className="mb-4">
                <h1 className="text-2xl font-bold text-gray-800">Etiquetas</h1>
                <p className="text-sm text-gray-500 mt-0.5">Selecione um produto para imprimir a etiqueta</p>
            </div>

            {/* Busca */}
            <div className="relative mb-2">
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

            {/* Filtros de categoria — pills compactos */}
            {categorias.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <button
                        onClick={() => selecionarCategoria(null)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                            categoriaSel === null
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300'
                                : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                        Todos
                    </button>
                    {categorias.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => selecionarCategoria(categoriaSel === cat.id ? null : cat.id)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                categoriaSel === cat.id
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300'
                                    : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                            }`}
                        >
                            {cat.nome}
                        </button>
                    ))}
                </div>
            )}

            {/* Contador */}
            {!loading && (
                <p className="text-xs text-gray-400 mb-3">
                    {filtradas.length} etiqueta(s){categoriaSel || search ? ' filtrada(s)' : ' ativa(s)'}
                </p>
            )}

            {/* Grid de cards */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
