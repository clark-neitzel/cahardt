import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, X, ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import pedidoService from '../services/pedidoService';
import { somAviso } from '../utils/sons';

// Lembrete na tela do vendedor: pedidos SALVOS (ABERTO) ainda não enviados.
// Insiste a cada 30 minutos enquanto houver pedido aberto do próprio usuário.
// Não aparece dentro da tela de criação/edição de pedido (para não atrapalhar).
const INTERVALO_MS = 30 * 60 * 1000; // 30 minutos
const DELAY_INICIAL_MS = 12000;

const AlertaPedidosNaoEnviados = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [pedidos, setPedidos] = useState([]);
    const [visivel, setVisivel] = useState(false);
    const dismissedRef = useRef(false);

    const verificar = useCallback(async () => {
        try {
            const data = await pedidoService.meusNaoEnviados();
            const lista = data.pedidos || [];
            setPedidos(lista);
            if (lista.length > 0 && !dismissedRef.current) {
                setVisivel(true);
                somAviso();
            }
            if (lista.length === 0) setVisivel(false);
        } catch (e) {
            console.error('Erro ao verificar pedidos não enviados:', e);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(() => verificar(), DELAY_INICIAL_MS);
        const interval = setInterval(() => {
            dismissedRef.current = false; // volta a insistir a cada 30 min
            verificar();
        }, INTERVALO_MS);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [user, verificar]);

    // Não interromper quem está criando/editando um pedido agora
    if (location.pathname.startsWith('/pedidos/novo')) return null;
    if (!visivel || pedidos.length === 0) return null;

    const fecharPor30min = () => {
        dismissedRef.current = true;
        setVisivel(false);
    };

    const irParaPedidos = () => {
        fecharPor30min();
        navigate('/pedidos');
    };

    const fmtData = (iso) => {
        try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
        catch { return ''; }
    };

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-amber-500 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 rounded-full p-2">
                            <ClipboardList className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg leading-tight">
                                {pedidos.length === 1 ? 'Pedido salvo sem enviar' : `${pedidos.length} pedidos salvos sem enviar`}
                            </h2>
                            <p className="text-amber-100 text-sm">Lembre de enviar para não perder a entrega</p>
                        </div>
                    </div>
                    <button onClick={fecharPor30min} className="text-white/80 hover:text-white p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4 max-h-[45vh] overflow-y-auto space-y-2">
                    {pedidos.map(p => (
                        <div key={p.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                                {p.especial ? 'Especial · ' : p.bonificacao ? 'Bonificação · ' : ''}{p.cliente}
                            </p>
                            <span className="text-xs text-gray-500 shrink-0">entrega {fmtData(p.dataEntrega)}</span>
                        </div>
                    ))}
                </div>

                <div className="px-5 py-3 bg-gray-50 border-t flex items-center justify-between gap-3">
                    <button onClick={fecharPor30min} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
                        Lembrar em 30 min
                    </button>
                    <button onClick={irParaPedidos}
                        className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primaryDark text-white text-sm font-semibold rounded-full shadow-sm">
                        <Send className="h-4 w-4" />
                        Ver pedidos
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaPedidosNaoEnviados;
