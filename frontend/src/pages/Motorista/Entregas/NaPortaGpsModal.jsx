import { useState } from 'react';
import { MapPin, Camera, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import gpsClientesService from '../../../services/gpsClientesService';

// ─────────────────────────────────────────────────────────────────────────────
// Pergunta de 1 toque ao motorista quando a entrega concluiu LONGE do ponto
// cadastrado do cliente (ou o cliente nem tem ponto): "Você está na porta do
// cliente agora?".
//  - NÃO  → nada acontece (ele só registrou de outro lugar).
//  - SIM  → pede a FOTO DA FACHADA (prova) e grava o sinal de correção; se o
//           cliente não tinha ponto, o lugar já vira o primeiro ponto.
// Quem entrega no lugar certo nunca vê esta tela.
// ─────────────────────────────────────────────────────────────────────────────
export default function NaPortaGpsModal({ clienteUuid, clienteNome, distanciaM, status, ponto, pedidoId, onFechar }) {
    const [etapa, setEtapa] = useState('pergunta'); // pergunta | foto
    const [foto, setFoto] = useState(null);
    const [preview, setPreview] = useState(null);
    const [enviando, setEnviando] = useState(false);

    const fmtDist = distanciaM != null
        ? (distanciaM >= 1000 ? `${(distanciaM / 1000).toFixed(1)} km` : `${distanciaM} m`)
        : null;

    const escolherFoto = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFoto(f);
        setPreview(URL.createObjectURL(f));
    };

    const enviar = async () => {
        if (!foto) return;
        setEnviando(true);
        try {
            const fd = new FormData();
            fd.append('foto', foto);
            fd.append('ponto', ponto);
            if (pedidoId) fd.append('pedidoId', pedidoId);
            const r = await gpsClientesService.naPorta(clienteUuid, fd);
            toast.success(r.pontoDefinido
                ? 'Obrigado! O ponto do cliente foi definido aqui.'
                : 'Obrigado! Sua confirmação vai ajudar a corrigir o ponto do cliente.');
            onFechar();
        } catch (err) {
            if (!err.response) {
                toast('Sem internet — não foi possível enviar agora. Sua entrega já está registrada.', { icon: '📵' });
                onFechar();
            } else {
                toast.error(err.response?.data?.error || 'Erro ao enviar a confirmação.');
            }
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-amber-500 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 rounded-full p-2">
                            <MapPin className="h-6 w-6 text-white" />
                        </div>
                        <h2 className="text-white font-bold text-base leading-tight">
                            {status === 'SEM_PONTO' ? 'Cliente sem ponto GPS' : 'Entrega longe do ponto'}
                        </h2>
                    </div>
                    <button onClick={onFechar} className="text-white/80 hover:text-white p-1"><X className="h-5 w-5" /></button>
                </div>

                {etapa === 'pergunta' ? (
                    <div className="p-5 space-y-4">
                        <p className="text-sm text-gray-700 leading-relaxed">
                            {status === 'SEM_PONTO'
                                ? <><b>{clienteNome}</b> ainda não tem ponto GPS cadastrado.</>
                                : <>Esta entrega foi concluída a <b>{fmtDist}</b> do ponto cadastrado de <b>{clienteNome}</b>.</>}
                        </p>
                        <p className="text-base font-bold text-gray-900">Você está na porta do cliente agora?</p>
                        <div className="flex gap-2">
                            <button
                                onClick={onFechar}
                                className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-full font-semibold text-sm min-h-[44px]"
                            >
                                Não
                            </button>
                            <button
                                onClick={() => setEtapa('foto')}
                                className="flex-1 px-4 py-3 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm min-h-[44px]"
                            >
                                Sim, estou na porta
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            Respondendo "Sim", vamos pedir uma foto da fachada — é ela que confirma o lugar certo para o próximo entregador.
                        </p>
                    </div>
                ) : (
                    <div className="p-5 space-y-3">
                        <p className="text-sm text-gray-700">Bata uma <b>foto da fachada</b> do cliente (frente da loja):</p>

                        {preview ? (
                            <img src={preview} alt="Fachada" className="w-full h-44 object-cover rounded-xl border border-gray-200" />
                        ) : (
                            <label className="flex flex-col items-center justify-center gap-2 h-36 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 cursor-pointer active:bg-gray-50">
                                <Camera className="h-8 w-8" />
                                <span className="text-sm font-semibold">Abrir a câmera</span>
                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFoto} />
                            </label>
                        )}

                        {preview && (
                            <label className="block text-center text-xs font-semibold text-primary cursor-pointer">
                                Tirar outra foto
                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFoto} />
                            </label>
                        )}

                        <button
                            onClick={enviar}
                            disabled={!foto || enviando}
                            className="w-full px-4 py-3 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
                        >
                            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                            {enviando ? 'Enviando…' : 'Enviar foto e confirmar'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
