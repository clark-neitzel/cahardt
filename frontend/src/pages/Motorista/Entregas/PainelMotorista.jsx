import React, { useState, useEffect } from 'react';
import { Truck, MapPin, CheckCircle, Clock, Navigation, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';
import entregasService from '../../../services/entregasService';
import CheckoutEntregaModal from './CheckoutEntregaModal';

const PainelMotorista = () => {
    const [abaAtiva, setAbaAtiva] = useState('pendentes'); // 'pendentes' | 'concluidas'
    const [entregas, setEntregas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [entregaAtivaParaCheckout, setEntregaAtivaParaCheckout] = useState(null);

    const fetchEntregas = async () => {
        try {
            setLoading(true);
            const data = abaAtiva === 'pendentes'
                ? await entregasService.getPendentes()
                : await entregasService.getConcluidas();

            setEntregas(data);
        } catch (error) {
            console.error('Erro na rota mobile:', error);
            toast.error('Erro de rede. Verifique seu 4G.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntregas();
    }, [abaAtiva]);

    const handleAbrirMaps = (cliente) => {
        if (!cliente.Ponto_GPS) {
            const endereco = `${cliente.End_Logradouro || ''} ${cliente.End_Numero || ''} ${cliente.End_Bairro || ''} ${cliente.End_Cidade || ''}`;
            window.open(`https://maps.google.com/?q=${encodeURIComponent(endereco)}`);
            return;
        }
        const [lat, lng] = cliente.Ponto_GPS.split(',');
        window.open(`https://maps.google.com/?q=${lat},${lng}`);
    };

    const handleCheckoutSuccess = () => {
        setEntregaAtivaParaCheckout(null);
        fetchEntregas();
        toast.success('Check-in Logístico concluído! Muito bem.');
    };

    // --- Prioridade ---
    const proximaPrioridadeDisponivel = () => {
        const prioridades = entregas
            .filter(e => e.prioridadeEntrega)
            .map(e => e.prioridadeEntrega);
        if (prioridades.length === 0) return 1;
        return Math.max(...prioridades) + 1;
    };

    const handleTogglePrioridade = async (entrega) => {
        try {
            if (entrega.prioridadeEntrega) {
                // Remover prioridade
                await entregasService.definirPrioridade(entrega.id, null);
                // Reordenar as restantes
                await entregasService.reordenarPrioridades();
                toast.success('Prioridade removida');
            } else {
                // Definir próxima prioridade
                const proxima = proximaPrioridadeDisponivel();
                await entregasService.definirPrioridade(entrega.id, proxima);
                toast.success(`Prioridade ${proxima} definida`);
            }
            fetchEntregas();
        } catch (error) {
            const msg = error.response?.data?.error || 'Erro ao definir prioridade';
            toast.error(msg, { duration: 5000 });
        }
    };

    const totalPrioridades = entregas.filter(e => e.prioridadeEntrega).length;

    return (
        <div className="max-w-md mx-auto min-h-screen bg-gray-100 pb-20">
            {/* Header Fixo Mobile */}
            <div className="bg-sky-600 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <Truck className="h-6 w-6" />
                    <h1 className="text-xl font-bold tracking-tight">Meu Roteiro</h1>
                </div>
                <div className="flex items-center gap-2">
                    {abaAtiva === 'pendentes' && totalPrioridades > 0 && (
                        <div className="text-xs font-bold bg-amber-500 text-white px-2 py-1 rounded flex items-center gap-1">
                            <Star className="h-3 w-3" /> {totalPrioridades}
                        </div>
                    )}
                    <div className="text-xs font-semibold bg-sky-700 px-2 py-1 rounded">
                        {entregas.length} {abaAtiva === 'pendentes' ? 'Restantes' : 'Feitas'}
                    </div>
                </div>
            </div>

            {/* Abas */}
            <div className="flex bg-white shadow-sm mb-4">
                <button
                    onClick={() => setAbaAtiva('pendentes')}
                    className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-colors ${abaAtiva === 'pendentes' ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500'}`}
                >
                    A Entregar
                </button>
                <button
                    onClick={() => setAbaAtiva('concluidas')}
                    className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-colors ${abaAtiva === 'concluidas' ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500'}`}
                >
                    Já Finalizadas
                </button>
            </div>

            {/* Lista dos Clientes */}
            <div className="px-4 space-y-4">
                {loading ? (
                    <div className="text-center py-12 flex flex-col items-center justify-center opacity-60">
                        <Truck className="h-10 w-10 text-sky-600 animate-pulse mb-3" />
                        <p className="font-semibold text-gray-600">Sincronizando rota com a nuvem...</p>
                    </div>
                ) : entregas.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
                        <div className="text-gray-400 mb-2 flex justify-center"><CheckCircle className="h-12 w-12 text-green-400" /></div>
                        <p className="text-lg font-bold text-gray-800">Tudo limpo!</p>
                        <p className="text-sm text-gray-500 mt-1">
                            {abaAtiva === 'pendentes' ? 'Caminhão vazio, volte à base.' : 'Nenhuma entrega baixada no histórico recente.'}
                        </p>
                    </div>
                ) : (
                    entregas.map((entrega) => (
                        <div key={entrega.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transform transition-all active:scale-[0.98] ${entrega.prioridadeEntrega ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'}`}>
                            <div className="p-4 border-b border-gray-100">
                                <div className="flex justify-between items-start">
                                    <div className="pr-2 flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {entrega.prioridadeEntrega && (
                                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-500 text-white text-xs font-black flex-shrink-0">
                                                    {entrega.prioridadeEntrega}
                                                </span>
                                            )}
                                            <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">{entrega.cliente?.NomeFantasia}</h3>
                                        </div>
                                        <p className="text-xs text-gray-500 line-clamp-2">
                                            <MapPin className="inline h-3 w-3 mr-1" />
                                            {entrega.cliente?.End_Logradouro} {entrega.cliente?.End_Numero} - {entrega.cliente?.End_Bairro} ({entrega.cliente?.End_Cidade})
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                        <span className="inline-block bg-gray-100 text-gray-800 text-[10px] font-mono px-2 py-1 rounded font-bold border border-gray-200">
                                            Embarque #{entrega.embarque?.numero}
                                        </span>
                                        {abaAtiva === 'pendentes' && entrega._tipoEntrega !== 'amostra' && (
                                            <button
                                                onClick={() => handleTogglePrioridade(entrega)}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                                    entrega.prioridadeEntrega
                                                        ? 'bg-amber-100 text-amber-700 border border-amber-300 active:bg-amber-200'
                                                        : 'bg-gray-100 text-gray-500 border border-gray-200 active:bg-gray-200'
                                                }`}
                                            >
                                                {entrega.prioridadeEntrega ? (
                                                    <><X className="h-3 w-3" /> Tirar</>
                                                ) : (
                                                    <><Star className="h-3 w-3" /> Prioridade</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {abaAtiva === 'pendentes' && (
                                <div className="p-3 bg-gray-50 flex items-center justify-between">
                                    <div className="flex space-x-2 w-full pr-2">
                                        <button
                                            onClick={() => handleAbrirMaps(entrega.cliente)}
                                            className="flex-1 flex justify-center items-center py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-bold active:bg-blue-100"
                                        >
                                            <Navigation className="h-4 w-4 mr-1" />
                                            Maps
                                        </button>
                                        <button
                                            onClick={() => setEntregaAtivaParaCheckout(entrega)}
                                            className="flex-[2] flex justify-center items-center py-2 bg-sky-600 text-white rounded-lg text-sm font-bold active:bg-sky-700 shadow-sm"
                                        >
                                            <CheckCircle className="h-4 w-4 mr-1" />
                                            Fazer Check-in (Entregar)
                                        </button>
                                    </div>
                                </div>
                            )}

                            {abaAtiva === 'concluidas' && (
                                <div className="p-3 flex flex-col space-y-2 bg-gray-50">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-semibold text-gray-500">Status Fisíco</span>
                                        {entrega.statusEntrega === 'ENTREGUE' && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 rounded">ENTREGUE</span>}
                                        {entrega.statusEntrega === 'ENTREGUE_PARCIAL' && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 rounded">PARCIAL</span>}
                                        {entrega.statusEntrega === 'DEVOLVIDO' && <span className="text-xs font-bold text-red-700 bg-red-100 px-2 rounded">DEVOLVIDO 100%</span>}
                                    </div>

                                    {entrega.divergenciaPagamento && (
                                        <div className="text-[10px] font-bold text-amber-600 bg-amber-50 p-1 rounded">
                                            Houve Divergência Monetária Apontada!
                                        </div>
                                    )}

                                    <div className="text-[10px] text-gray-400 text-right font-mono">
                                        <Clock className="inline h-3 w-3 mr-1" />
                                        {new Date(entrega.dataEntrega).toLocaleTimeString('pt-BR')} do dia {new Date(entrega.dataEntrega).toLocaleDateString()}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Modal Fullscreen do Checkout (Carrinho Reverso) */}
            {entregaAtivaParaCheckout && (
                <CheckoutEntregaModal
                    pedido={entregaAtivaParaCheckout}
                    onClose={() => setEntregaAtivaParaCheckout(null)}
                    onSuccess={handleCheckoutSuccess}
                />
            )}
        </div>
    );
};

export default PainelMotorista;
