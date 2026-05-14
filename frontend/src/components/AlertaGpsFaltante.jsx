import React from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';

const AlertaGpsFaltante = ({ nomeCliente, onAbrirClientePopup, onContinuar }) => {
    return (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
                <div className="flex flex-col items-center text-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                        <MapPin className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                        <p className="font-bold text-gray-900 text-[15px]">GPS não cadastrado</p>
                        <p className="text-[13px] text-gray-500 mt-1 leading-snug">
                            O cliente <span className="font-semibold text-gray-700">{nomeCliente}</span> não tem ponto de GPS registrado. Atualize para melhorar a verificação de visitas.
                        </p>
                    </div>
                    <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-left w-full">
                        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                        <p className="text-[12px] text-orange-700 leading-snug font-medium">
                            Atualize o GPS somente se você estiver fisicamente no local do cliente agora. O ponto registrado será usado para verificar visitas futuras.
                        </p>
                    </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                    <button
                        onClick={onAbrirClientePopup}
                        className="w-full bg-blue-600 active:bg-blue-700 text-white font-bold py-3 rounded-xl text-[14px] flex items-center justify-center gap-2 transition-colors"
                    >
                        <MapPin className="h-4 w-4" />
                        Atualizar GPS do cliente
                    </button>
                    <button
                        onClick={onContinuar}
                        className="w-full bg-gray-100 active:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl text-[14px] transition-colors"
                    >
                        Continuar sem atualizar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaGpsFaltante;
