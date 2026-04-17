import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import pedidoService from '../services/pedidoService';
import { useNavigate } from 'react-router-dom';

const INTERVALO_MS = 10 * 60 * 1000; // 10 minutos

const AlertaFaturamento = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [visivel, setVisivel] = useState(false);
    const [dismissedAt, setDismissedAt] = useState(null);

    const verificar = useCallback(async () => {
        try {
            const data = await pedidoService.pendenteFaturamento();
            if (data.total > 0) {
                setPedidos(data.pedidos);
                // Só mostra se não foi fechado nesta rodada
                if (!dismissedAt) {
                    setVisivel(true);
                }
            } else {
                setPedidos([]);
                setVisivel(false);
                setDismissedAt(null);
            }
        } catch (error) {
            console.error('Erro ao verificar pedidos pendentes de faturamento:', error);
        }
    }, [dismissedAt]);

    useEffect(() => {
        // Só ativa se o usuário tem alertaFaturamento ligado
        if (!user || user.alertaFaturamento === false) return;

        // Verifica imediatamente
        verificar();

        // Depois a cada 10 minutos
        const interval = setInterval(() => {
            setDismissedAt(null); // Reseta dismiss para mostrar novamente
            verificar();
        }, INTERVALO_MS);

        return () => clearInterval(interval);
    }, [user]);

    // Re-verifica quando dismissedAt muda para null (nova rodada do intervalo)
    useEffect(() => {
        if (dismissedAt === null && user && user.alertaFaturamento !== false) {
            verificar();
        }
    }, [dismissedAt, verificar, user]);

    const handleDismiss = () => {
        setVisivel(false);
        setDismissedAt(new Date());
    };

    const handleVerPedidos = () => {
        setVisivel(false);
        setDismissedAt(new Date());
        navigate('/pedidos');
    };

    if (!visivel || pedidos.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-amber-500 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 rounded-full p-2">
                            <AlertTriangle className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg">Pedidos Pendentes de Faturamento</h2>
                            <p className="text-amber-100 text-sm">{pedidos.length} pedido{pedidos.length > 1 ? 's' : ''} com entrega para hoje sem faturar</p>
                        </div>
                    </div>
                    <button onClick={handleDismiss} className="text-white/80 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 max-h-[50vh] overflow-y-auto">
                    <div className="space-y-2">
                        {pedidos.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-amber-700">#{p.numero || '—'}</span>
                                        <span className="text-sm font-semibold text-gray-800 truncate">{p.cliente?.Nome || 'Cliente'}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        Vendedor: {p.vendedor?.nome || '—'}
                                        {p.situacaoCA && <span className="ml-2 text-amber-600 font-medium">CA: {p.situacaoCA}</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t flex items-center justify-between gap-3">
                    <button
                        onClick={handleDismiss}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
                    >
                        Fechar (volta em 10 min)
                    </button>
                    <button
                        onClick={handleVerPedidos}
                        className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                        <ExternalLink className="h-4 w-4" />
                        Ver Pedidos
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaFaturamento;
