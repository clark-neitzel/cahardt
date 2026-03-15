import React, { useState, useEffect } from 'react';
import { Search, CheckSquare, Square, Save, X, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';

const AdicionarPedidosModal = ({ embarqueId, onClose, onSuccess }) => {
    const [pedidosLivres, setPedidosLivres] = useState([]);
    const [amostrasLivres, setAmostrasLivres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selecionados, setSelecionados] = useState(new Set());
    const [amostrasSelecionadas, setAmostrasSelecionadas] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [aba, setAba] = useState('pedidos'); // 'pedidos' | 'amostras'

    useEffect(() => {
        const fetchLivres = async () => {
            try {
                const [livres, amostras] = await Promise.all([
                    embarqueService.listarPedidosLivres(),
                    embarqueService.listarAmostrasDisponiveis()
                ]);
                setPedidosLivres(livres);
                setAmostrasLivres(amostras);
            } catch (error) {
                toast.error('Erro ao buscar fila de faturamento.');
            } finally {
                setLoading(false);
            }
        };
        fetchLivres();
    }, []);

    const toggleSelecao = (id) => {
        const novoSet = new Set(selecionados);
        if (novoSet.has(id)) novoSet.delete(id);
        else novoSet.add(id);
        setSelecionados(novoSet);
    };

    const toggleAmostra = (id) => {
        const novoSet = new Set(amostrasSelecionadas);
        if (novoSet.has(id)) novoSet.delete(id);
        else novoSet.add(id);
        setAmostrasSelecionadas(novoSet);
    };

    const toggleTodos = () => {
        if (aba === 'pedidos') {
            if (selecionados.size === pedidosFiltrados.length) setSelecionados(new Set());
            else setSelecionados(new Set(pedidosFiltrados.map(p => p.id)));
        } else {
            if (amostrasSelecionadas.size === amostrasFiltradas.length) setAmostrasSelecionadas(new Set());
            else setAmostrasSelecionadas(new Set(amostrasFiltradas.map(a => a.id)));
        }
    };

    const handleAtrelar = async () => {
        const temPedidos = selecionados.size > 0;
        const temAmostras = amostrasSelecionadas.size > 0;
        if (!temPedidos && !temAmostras) return toast.error('Selecione ao menos um pedido ou amostra.');

        try {
            setSaving(true);
            const promises = [];
            if (temPedidos) {
                promises.push(embarqueService.inserirPedidos(embarqueId, Array.from(selecionados)));
            }
            if (temAmostras) {
                promises.push(embarqueService.inserirAmostras(embarqueId, Array.from(amostrasSelecionadas)));
            }
            await Promise.all(promises);
            const msgs = [];
            if (temPedidos) msgs.push(`${selecionados.size} pedidos`);
            if (temAmostras) msgs.push(`${amostrasSelecionadas.size} amostras`);
            toast.success(`${msgs.join(' e ')} atrelados à carga!`);
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao atrelar itens à carga.');
        } finally {
            setSaving(false);
        }
    };

    const pedidosFiltrados = pedidosLivres.filter(p => {
        const nome = (p.cliente?.NomeFantasia || p.cliente?.Nome || '').toLowerCase();
        return nome.includes(searchTerm.toLowerCase()) || String(p.numero || '').includes(searchTerm);
    });

    const amostrasFiltradas = amostrasLivres.filter(a => {
        const nome = (a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '').toLowerCase();
        return nome.includes(searchTerm.toLowerCase()) || String(a.numero || '').includes(searchTerm);
    });

    const totalSelecionados = selecionados.size + amostrasSelecionadas.size;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-60 px-4 py-8">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-lg">
                    <h3 className="text-lg font-bold text-gray-900">Embarcar Pedidos e Amostras</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Abas + Busca */}
                <div className="p-4 border-b border-gray-200 bg-white space-y-2">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setAba('pedidos')}
                            className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors ${aba === 'pedidos' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                        >
                            Pedidos FATURADOS ({pedidosLivres.length})
                        </button>
                        <button
                            onClick={() => setAba('amostras')}
                            className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors flex items-center gap-1 ${aba === 'amostras' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                        >
                            <Package className="h-3.5 w-3.5" />
                            Amostras LIBERADAS ({amostrasLivres.length})
                        </button>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder={aba === 'pedidos' ? 'Buscar por cliente ou nº do pedido CA...' : 'Buscar por destinatário ou nº da amostra...'}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">Carregando...</div>
                    ) : aba === 'pedidos' ? (
                        pedidosLivres.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">Nenhum pedido FATURADO livre no momento.</div>
                        ) : (
                            <div className="shadow border-b border-gray-200 sm:rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 bg-white">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                <button onClick={toggleTodos} className="text-sky-600 hover:text-sky-800">
                                                    {selecionados.size === pedidosFiltrados.length && pedidosFiltrados.length > 0 ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                                </button>
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nº Pedido CA</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cidade</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {pedidosFiltrados.map((pedido) => (
                                            <tr key={pedido.id} onClick={() => toggleSelecao(pedido.id)} className="cursor-pointer hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {selecionados.has(pedido.id) ? (
                                                        <CheckSquare className="h-5 w-5 text-sky-600" />
                                                    ) : (
                                                        <Square className="h-5 w-5 text-gray-400" />
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                                                    {pedido.numero || 'S/N'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                    {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Cliente não encontrado'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {pedido.cliente?.End_Cidade || 'Sem endereço'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : (
                        amostrasLivres.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">Nenhuma amostra LIBERADA disponível.</div>
                        ) : (
                            <div className="shadow border-b border-orange-200 sm:rounded-lg">
                                <table className="min-w-full divide-y divide-orange-100 bg-white">
                                    <thead className="bg-orange-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                                <button onClick={toggleTodos} className="text-orange-600 hover:text-orange-800">
                                                    {amostrasSelecionadas.size === amostrasFiltradas.length && amostrasFiltradas.length > 0 ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                                </button>
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Nº</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Destinatário</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Itens</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Vendedor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-orange-100">
                                        {amostrasFiltradas.map((amostra) => (
                                            <tr key={amostra.id} onClick={() => toggleAmostra(amostra.id)} className="cursor-pointer hover:bg-orange-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {amostrasSelecionadas.has(amostra.id) ? (
                                                        <CheckSquare className="h-5 w-5 text-orange-600" />
                                                    ) : (
                                                        <Square className="h-5 w-5 text-gray-400" />
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-700 font-mono font-bold">
                                                    AM#{amostra.numero}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                    {amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700 font-bold">
                                                    {amostra.itens?.length || 0}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {amostra.solicitadoPor?.nome || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between rounded-b-lg">
                    <div className="text-sm text-gray-700">
                        <span className="font-bold text-sky-700">{selecionados.size}</span> pedidos
                        {amostrasSelecionadas.size > 0 && (
                            <> + <span className="font-bold text-orange-700">{amostrasSelecionadas.size}</span> amostras</>
                        )}
                    </div>
                    <div className="flex space-x-3">
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-100">
                            Cancelar
                        </button>
                        <button
                            onClick={handleAtrelar}
                            disabled={saving || totalSelecionados === 0}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? 'Atrelando...' : 'Atrelar à Carga'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdicionarPedidosModal;
