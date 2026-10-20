import React, { useState, useEffect } from 'react';
import { Camera, X, Moon, ImageOff } from 'lucide-react';
import { MSG_FOTO_PERDIDA } from './ImgComFalha';
import { urlImagem } from '../../services/checklistVeiculoService';

/**
 * Tela "Tire assim": mostra a foto modelo DO VEÍCULO (quando existe) e a instrução
 * do ângulo, antes de abrir a câmera. O botão chama `onAbrirCamera` direto no clique
 * (o navegador só deixa abrir a câmera dentro do toque do usuário).
 */
const TireAssimModal = ({ slot, onClose, onAbrirCamera }) => {
    const [fotoFalhou, setFotoFalhou] = useState(false);
    useEffect(() => { setFotoFalhou(false); }, [slot?.angulo, slot?.fotoModeloUrl]);
    if (!slot) return null;
    const modelo = slot.fotoModeloUrl ? urlImagem(slot.fotoModeloUrl) : null;
    return (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Tire assim</span>
                    <button type="button" onClick={onClose} aria-label="Fechar"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <h3 className="text-lg font-bold text-gray-900">{slot.rotulo}</h3>
                    {modelo && !fotoFalhou ? (
                        <img src={modelo} alt={`Foto modelo: ${slot.rotulo}`}
                            className="w-full max-h-72 object-contain rounded-xl border border-gray-200 bg-gray-50"
                            onError={() => setFotoFalhou(true)} />
                    ) : (
                        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
                            <ImageOff className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                            <p className="text-sm text-gray-600">{fotoFalhou ? MSG_FOTO_PERDIDA : 'Este veículo ainda não tem foto modelo cadastrada.'}</p>
                        </div>
                    )}
                    {slot.instrucao && <p className="text-sm text-gray-700">{slot.instrucao}</p>}
                    {slot.dicaNoite && (
                        <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                            <Moon className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>De noite ou pouca luz: {slot.dicaNoite}</span>
                        </div>
                    )}
                    <button type="button" onClick={onAbrirCamera}
                        className="w-full min-h-[48px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 shadow-sm">
                        <Camera className="h-5 w-5" /> Abrir câmera
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TireAssimModal;
