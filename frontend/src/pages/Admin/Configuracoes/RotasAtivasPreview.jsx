import React, { useEffect, useState } from 'react';
import roteirizacaoService from '../../../services/roteirizacaoService';
import { Route, MapPin, Truck, Loader, RefreshCw, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const RotasAtivasPreview = () => {
    const [rotas, setRotas] = useState([]);
    const [loading, setLoading] = useState(true);

    const carregarRotas = async () => {
        try {
            setLoading(true);
            const data = await roteirizacaoService.getTodasRotasAdmin();
            setRotas(data || []);
        } catch (error) {
            console.error('Erro ao buscar rotas ativas:', error);
            toast.error('Erro ao carregar rotas ativas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        carregarRotas();
    }, []);

    const handleLimparRotaAdmin = async (vendedorId) => {
        if (!window.confirm('Tem certeza que deseja limpar a rota deste motorista? Isso apagará a sequência atual dele no aplicativo.')) return;
        try {
            await roteirizacaoService.limparRota(vendedorId);
            toast.success('Rota removida com sucesso!');
            carregarRotas();
        } catch (error) {
            toast.error('Erro ao limpar a rota.');
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-sky-100 overflow-hidden mt-8">
            <div className="p-6 border-b border-sky-100 bg-sky-50 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-sky-800 flex items-center">
                        <Route className="h-5 w-5 mr-2 text-sky-600" />
                        Rotas Ativas (Roteirizações em Andamento)
                    </h2>
                    <p className="text-sm text-sky-600 mt-1">
                        Veja quais motoristas estão com uma rota calculada e salva no momento.
                    </p>
                </div>
                <button
                    onClick={carregarRotas}
                    disabled={loading}
                    className="p-2 text-sky-600 hover:bg-sky-100 rounded-full transition-colors disabled:opacity-50"
                    title="Atualizar lista"
                >
                    <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="p-6">
                {loading ? (
                    <div className="flex justify-center items-center py-8 text-sky-600">
                        <Loader className="h-6 w-6 animate-spin mr-2" />
                        <span>Buscando rotas ativas...</span>
                    </div>
                ) : rotas.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="font-medium text-gray-700">Nenhuma rota ativa no momento.</p>
                        <p className="text-sm mt-1">Nenhum motorista organizou rota ou todos já finalizaram suas entregas.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rotas.map((rota) => (
                            <div key={rota.vendedorId} className="border border-sky-200 rounded-lg p-4 bg-white shadow-sm relative group">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-sky-100 p-2 rounded-full">
                                            <Truck className="h-4 w-4 text-sky-700" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800 text-sm">{rota.vendedorNome}</h3>
                                            <span className="text-[10px] text-gray-500">
                                                Atualizada em: {new Date(rota.updatedAt).toLocaleString('pt-BR')}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleLimparRotaAdmin(rota.vendedorId)}
                                        className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Forçar limpeza da rota"
                                    >
                                        <XCircle className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                        <p className="text-[10px] uppercase font-bold text-gray-500">Paradas</p>
                                        <p className="text-sm font-bold text-gray-800">{rota.resumo?.totalParadas || 0}</p>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                        <p className="text-[10px] uppercase font-bold text-gray-500">Distância</p>
                                        <p className="text-sm font-bold text-gray-800">{rota.resumo?.distanciaTotalKm || 0} km</p>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded border border-gray-100 col-span-2 flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-500">Tempo Estimado</p>
                                            <p className="text-sm font-bold text-gray-800">{rota.resumo?.duracaoTotalMin || 0} min</p>
                                        </div>
                                        {rota.resumo?.totalSemGPS > 0 && (
                                            <div className="text-right">
                                                <p className="text-[10px] uppercase font-bold text-orange-500">Sem GPS</p>
                                                <p className="text-sm font-bold text-orange-600">{rota.resumo.totalSemGPS}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RotasAtivasPreview;
