import React, { useEffect } from 'react';
import { PackageX, X } from 'lucide-react';
import { somErro } from '../utils/sons';

// Popup de erro no padrão visual do sistema (usado no bloqueio de venda sem
// estoque). Toca o som de erro ao abrir. `mensagem` aceita quebras de linha.
const ModalErroEstoque = ({ titulo = 'Não foi possível enviar', mensagem, onClose }) => {
    useEffect(() => { somErro(); }, []);

    if (!mensagem) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-red-600 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 rounded-full p-2">
                            <PackageX className="h-6 w-6 text-white" />
                        </div>
                        <h2 className="text-white font-bold text-lg leading-tight">{titulo}</h2>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4">
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{mensagem}</p>
                </div>

                <div className="px-5 py-3 bg-gray-50 border-t flex justify-end">
                    <button onClick={onClose}
                        className="px-5 py-2 bg-primary hover:bg-primaryDark text-white text-sm font-semibold rounded-full shadow-sm">
                        Entendi
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModalErroEstoque;
