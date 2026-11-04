import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Confirmação em modal do app (nunca window.confirm — não funciona direito no iPad/iPhone).
// Cancelar um QR PIX é ação explícita: fechar a janela NÃO cancela.
const ConfirmarCancelarQr = ({ valor, cancelando, onConfirmar, onVoltar }) => (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" role="alertdialog">
        <div className="bg-white w-full max-w-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
                <div className="bg-red-100 p-2 rounded-full shrink-0"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
                <div className="min-w-0">
                    <h4 className="font-bold text-gray-900">Cancelar este QR?</h4>
                    <p className="text-sm text-gray-600 mt-1 break-words">
                        O QR{valor != null ? ` de R$ ${Number(valor).toFixed(2).replace('.', ',')}` : ''} deixa de valer e o cliente não consegue mais pagar por ele.
                        Gerar outro depois gera uma nova cobrança. Fica registrado quem cancelou e quando.
                    </p>
                </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button onClick={onVoltar} disabled={cancelando}
                    className="flex-1 min-h-[44px] py-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm disabled:opacity-60">
                    Voltar
                </button>
                <button onClick={onConfirmar} disabled={cancelando}
                    className="flex-1 min-h-[44px] py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {cancelando && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sim, cancelar o QR
                </button>
            </div>
        </div>
    </div>
);

export default ConfirmarCancelarQr;
