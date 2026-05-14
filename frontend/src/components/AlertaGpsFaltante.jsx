import React, { useState } from 'react';
import { MapPin, Loader, CheckCircle, X } from 'lucide-react';
import clienteService from '../services/clienteService';
import leadService from '../services/leadService';
import toast from 'react-hot-toast';

const AlertaGpsFaltante = ({ tipo, clienteId, nomeCliente, onContinuar, onAtualizado }) => {
    const [salvando, setSalvando] = useState(false);
    const [sucesso, setSucesso] = useState(false);

    const handleAtualizar = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocalização não suportada neste dispositivo.');
            return;
        }
        setSalvando(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const gps = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
                try {
                    if (tipo === 'lead') {
                        await leadService.atualizar(clienteId, { pontoGps: gps });
                    } else {
                        await clienteService.atualizar(clienteId, { Ponto_GPS: gps });
                    }
                    setSucesso(true);
                    toast.success('Ponto de GPS salvo!');
                    setTimeout(() => {
                        if (onAtualizado) onAtualizado(gps);
                    }, 800);
                } catch (e) {
                    console.error(e);
                    toast.error('Erro ao salvar GPS.');
                } finally {
                    setSalvando(false);
                }
            },
            () => {
                setSalvando(false);
                toast.error('Não foi possível capturar localização. Permita o acesso no navegador.');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

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
                </div>

                {sucesso ? (
                    <div className="mt-5 flex items-center justify-center gap-2 text-green-700 font-semibold text-sm">
                        <CheckCircle className="h-5 w-5" />
                        GPS salvo com sucesso!
                    </div>
                ) : (
                    <div className="mt-5 flex flex-col gap-2">
                        <button
                            onClick={handleAtualizar}
                            disabled={salvando}
                            className="w-full bg-blue-600 active:bg-blue-700 text-white font-bold py-3 rounded-xl text-[14px] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                        >
                            {salvando ? (
                                <><Loader className="h-4 w-4 animate-spin" /> Capturando...</>
                            ) : (
                                <><MapPin className="h-4 w-4" /> Atualizar agora</>
                            )}
                        </button>
                        <button
                            onClick={onContinuar}
                            disabled={salvando}
                            className="w-full bg-gray-100 active:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl text-[14px] disabled:opacity-60 transition-colors"
                        >
                            Continuar sem atualizar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlertaGpsFaltante;
