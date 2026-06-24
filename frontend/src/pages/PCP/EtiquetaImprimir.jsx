import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Printer, Minus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';
import EtiquetaLabel, { codExibir } from './EtiquetaLabel';

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

    useEffect(() => {
        etiquetaService.buscar(id)
            .then(data => { setEt(data); })
            .catch(err => { toast.error(err.message); navigate('/pcp/etiquetas'); })
            .finally(() => setLoading(false));
    }, [id, navigate]);

    if (loading) return <div className="p-8 text-center text-gray-400">Carregando...</div>;
    if (!et) return null;

    const dataFabDisplay = isoParaDisplay(dataFab);
    const dataValDisplay = somarDias(dataFab, et.validadeDias || 90);

    const handlePrint = () => {
        const conteudo = printRef.current;
        if (!conteudo) return;

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 80mm 100mm; margin: 2mm; }
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
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => navigate('/pcp/etiquetas')} className="p-2 rounded-lg hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Imprimir Etiqueta</h1>
                    <p className="text-sm text-gray-500">{et.nomeProduto} — Cód. {codExibir(et)}</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <div className="flex flex-wrap items-end gap-6">
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
                            {dataValDisplay} <span className="text-gray-400">({et.validadeDias} dias)</span>
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
                    <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                        <Printer className="h-4 w-4" />
                        Imprimir {copies > 1 ? `${copies} cópias` : ''}
                    </button>
                </div>
            </div>

            <div className="bg-gray-100 rounded-xl p-6 flex justify-center">
                <div>
                    <p className="text-xs text-gray-400 text-center mb-3">Preview — 80mm × 100mm</p>
                    <div ref={printRef} style={{ transform:'scale(1.8)', transformOrigin:'top center', marginBottom:'180px' }}>
                        <EtiquetaLabel et={et} dataFab={dataFabDisplay} dataVal={dataValDisplay} />
                    </div>
                </div>
            </div>
        </div>
    );
}
