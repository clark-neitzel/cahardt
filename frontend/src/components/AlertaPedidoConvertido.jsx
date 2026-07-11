import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, X, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import pedidoService from '../services/pedidoService';
import { useNavigate } from 'react-router-dom';

// Popup do faturamento: pedido ESPECIAL que recebeu PIX e virou pedido com NF.
// Insiste a cada 5 minutos até alguém dar "Ciente". Quem recebe é escolhido na
// aba Vendedores (chave alertaPedidoConvertido) — o backend filtra por ela.
const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos
const DELAY_INICIAL_MS = 7000;

function bip() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const toque = (freq, t0) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
            o.start(t0); o.stop(t0 + 0.3);
        };
        toque(988, ctx.currentTime);
        toque(1319, ctx.currentTime + 0.2);
    } catch { /* áudio bloqueado antes de interação — ignora */ }
}

const AlertaPedidoConvertido = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [avisos, setAvisos] = useState([]);
    const [visivel, setVisivel] = useState(false);
    const [marcando, setMarcando] = useState(false);
    const dismissedRef = useRef(false);

    const verificar = useCallback(async () => {
        try {
            const data = await pedidoService.avisosConvertidos();
            const lista = data.avisos || [];
            if (lista.length > 0) {
                setAvisos(lista);
                if (!dismissedRef.current) {
                    setVisivel(true);
                    bip();
                }
            } else {
                setAvisos([]);
                setVisivel(false);
            }
        } catch (error) {
            console.error('Erro ao verificar pedidos convertidos:', error);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(() => verificar(), DELAY_INICIAL_MS);
        const interval = setInterval(() => {
            dismissedRef.current = false; // volta a insistir
            verificar();
        }, INTERVALO_MS);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [user, verificar]);

    const handleLembrar = () => {
        dismissedRef.current = true;
        setVisivel(false);
    };

    const handleCiente = async () => {
        setMarcando(true);
        try {
            for (const a of avisos) {
                await pedidoService.avisoConvertidoCiente(a.id);
            }
            setAvisos([]);
            setVisivel(false);
            navigate('/pedidos');
        } catch (e) {
            console.error('Erro ao dar ciência:', e);
        } finally {
            setMarcando(false);
        }
    };

    if (!visivel || avisos.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-lg mx-4 overflow-hidden">
                <div className="bg-amber-600 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 rounded-full p-2">
                            <Bell className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg">Pedido convertido — emitir NF-e</h2>
                            <p className="text-amber-100 text-sm">{avisos.length} pedido{avisos.length > 1 ? 's' : ''} especial{avisos.length > 1 ? 'is' : ''} pago{avisos.length > 1 ? 's' : ''} via PIX</p>
                        </div>
                    </div>
                    <button onClick={handleLembrar} className="text-white/80 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4 max-h-[50vh] overflow-y-auto space-y-2">
                    {avisos.map(a => (
                        <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                            <p className="text-sm font-semibold text-gray-800">
                                ZZ#{a.numeroAntigo ?? '—'} → <span className="text-amber-700 font-bold">#{a.numeroNovo ?? '—'}</span> · {a.cliente}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {a.valorPago != null ? `PIX recebido: R$ ${Number(a.valorPago).toFixed(2)} · ` : ''}
                                {a.situacaoCA === 'FATURADO' ? 'Já faturado no CA ✓' : 'Enviado ao Conta Azul — falta emitir a NF-e'}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="px-5 py-3 bg-gray-50 border-t flex items-center justify-between gap-3">
                    <button onClick={handleLembrar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors">
                        Lembrar em 5 min
                    </button>
                    <button onClick={handleCiente} disabled={marcando}
                        className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60">
                        <CheckCircle className="h-4 w-4" />
                        Ciente, vou faturar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaPedidoConvertido;
