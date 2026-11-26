import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { mensagemCadastroACorrigir } from '../utils/cadastroACorrigir';

// Popup "Corrigir cadastro" — aparece quando o servidor recusa uma operação (pedido, amostra,
// aprovação da fila do site, NF) com 403 CADASTRO_A_CORRIGIR.
// `dados` = corpo do 403 (ver utils/cadastroACorrigir.js); null/undefined = fechado.
export default function ModalCadastroACorrigir({ dados, onFechar, textoExtra }) {
    const navigate = useNavigate();
    useEffect(() => {
        if (!dados) return undefined;
        const aoTeclar = (e) => { if (e.key === 'Escape') onFechar?.(); };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [dados, onFechar]);
    if (!dados) return null;
    const mensagem = mensagemCadastroACorrigir(dados);
    const nome = dados.clienteNome || '';
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" data-modal-cadastro-a-corrigir onClick={(e) => { e.stopPropagation(); onFechar?.(); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="bg-red-600 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 rounded-full p-2"><AlertTriangle className="h-6 w-6 text-white" /></div>
                        <h2 className="text-white font-bold text-lg leading-tight">Corrigir cadastro</h2>
                    </div>
                    <button onClick={onFechar} aria-label="Fechar" className="text-white/80 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-5 py-4 space-y-2">
                    {nome && <p className="text-sm font-bold text-gray-900">{nome}</p>}
                    <p className="text-sm text-gray-700 leading-relaxed">{mensagem}</p>
                    {textoExtra && <p className="text-xs text-gray-500">{textoExtra}</p>}
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t flex flex-col md:flex-row gap-2 md:justify-end">
                    <button onClick={onFechar} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded-full min-h-[44px]">Fechar</button>
                    {dados.clienteId && (
                        <button onClick={() => { onFechar?.(); navigate(`/clientes/${dados.clienteId}`); }}
                            className="px-5 py-2.5 bg-primary hover:bg-primaryDark text-white text-sm font-semibold rounded-full shadow-sm flex items-center justify-center gap-2 min-h-[44px]">
                            Abrir a ficha do cliente
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
