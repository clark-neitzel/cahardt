import React, { useState } from 'react';
import { Link2, FileText, X, Download } from 'lucide-react';
import { API_URL } from '../services/api';

// Material de ajuda de uma tarefa: imagens viram MINIATURAS clicáveis
// (ampliam num lightbox dentro do app, sem sair do PWA); PDFs viram
// cartões com ícone; links viram chips. Usado no pop-up do alerta
// (AlertaTarefas) e no detalhe da tarefa (TarefasAgenda).
const anexoUrl = (url) => (url?.startsWith('/') ? `${API_URL}${url}` : url);

const AnexosTarefa = ({ anexos }) => {
    const [zoom, setZoom] = useState(null); // imagem ampliada
    if (!anexos || anexos.length === 0) return null;

    const imagens = anexos.filter(a => a.tipo === 'IMAGEM');
    const arquivos = anexos.filter(a => a.tipo === 'ARQUIVO');
    const links = anexos.filter(a => a.tipo === 'LINK');

    return (
        <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Material de ajuda</div>

            {/* imagens: miniaturas */}
            {imagens.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {imagens.map(a => (
                        <button key={a.id} type="button" onClick={() => setZoom(a)} title={a.nome}
                            className="relative rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary">
                            <img src={anexoUrl(a.url)} alt={a.nome} loading="lazy"
                                className="h-20 w-20 object-cover" />
                        </button>
                    ))}
                </div>
            )}

            {/* PDFs: cartão com ícone */}
            {arquivos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {arquivos.map(a => (
                        <a key={a.id} href={anexoUrl(a.url)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 min-h-[44px] max-w-full">
                            <span className="bg-red-100 text-red-600 rounded-lg p-1.5 shrink-0">
                                <FileText className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-xs font-semibold text-gray-800 truncate max-w-[190px]">{a.nome}</span>
                                <span className="block text-[10px] text-gray-400 uppercase font-bold">PDF · toque para abrir</span>
                            </span>
                        </a>
                    ))}
                </div>
            )}

            {/* links: chips */}
            {links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {links.map(a => (
                        <a key={a.id} href={anexoUrl(a.url)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-primary underline min-h-[32px]">
                            <Link2 className="h-3.5 w-3.5" />
                            <span className="max-w-[180px] truncate">{a.nome}</span>
                        </a>
                    ))}
                </div>
            )}

            {/* lightbox da imagem — acima de qualquer pop-up */}
            {zoom && (
                <div className="fixed inset-0 z-[10050] bg-black/85 flex flex-col items-center justify-center p-4"
                    onClick={() => setZoom(null)}>
                    <img src={anexoUrl(zoom.url)} alt={zoom.nome}
                        className="max-h-[80vh] max-w-full rounded-xl shadow-2xl object-contain" />
                    <div className="mt-3 flex items-center gap-3">
                        <span className="text-white/80 text-sm truncate max-w-[60vw]">{zoom.nome}</span>
                        <a href={anexoUrl(zoom.url)} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-full text-xs font-semibold min-h-[32px]">
                            <Download className="h-3.5 w-3.5" /> Abrir original
                        </a>
                    </div>
                    <button type="button" onClick={() => setZoom(null)}
                        className="absolute top-4 right-4 p-2.5 bg-white/15 hover:bg-white/25 text-white rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default AnexosTarefa;
