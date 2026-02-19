import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, X, AlertCircle } from 'lucide-react';
import pedidoService from '../../services/pedidoService';

const ListaPedidos = () => {
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPedido, setSelectedPedido] = useState(null); // Para o Modal

    useEffect(() => {
        carregarPedidos();
    }, []);

    const carregarPedidos = async () => {
        try {
            const data = await pedidoService.listar({});
            setPedidos(data);
        } catch (error) {
            console.error("Erro ao carregar pedidos", error);
        } finally {
            setLoading(false);
        }
    };

    const StatusBadge = ({ status }) => {
        const colors = {
            'ABERTO': 'bg-gray-100 text-gray-800',
            'ENVIAR': 'bg-blue-100 text-blue-800',
            'SINCRONIZANDO': 'bg-yellow-100 text-yellow-800',
            'RECEBIDO': 'bg-green-100 text-green-800',
            'ERRO': 'bg-red-100 text-red-800'
        };
        const colorClass = colors[status] || 'bg-gray-100 text-gray-800';
        return (
            <span className={`px-2 py-1 flex-shrink-0 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <FileText className="h-6 w-6 mr-2 text-primary" />
                        Pedidos
                    </h1>
                    <p className="text-gray-500 mt-1">Gerencie os pedidos enviados e em rascunho</p>
                </div>
                <button
                    onClick={() => navigate('/pedidos/novo')}
                    className="bg-primary hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md flex items-center transition-colors shadow-sm"
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Novo Pedido
                </button>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex gap-4">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar pedido..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">Carregando...</td></tr>
                            ) : pedidos.length === 0 ? (
                                <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">Nenhum pedido encontrado.</td></tr>
                            ) : (
                                pedidos.map((pedido) => (
                                    <tr key={pedido.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Desconhecido'}</div>
                                            <div className="text-sm text-gray-500">Vendedor: {pedido.vendedor?.nome || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(pedido.createdAt).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            R$ {Number(pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toFixed(2).replace('.', ',')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <StatusBadge status={pedido.statusEnvio} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                className="text-primary hover:text-blue-900"
                                                onClick={() => setSelectedPedido(pedido)}
                                            >
                                                Detalhes
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Detalhes do Pedido */}
            {selectedPedido && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-lg font-bold text-gray-900">Detalhes do Pedido</h2>
                            <button onClick={() => setSelectedPedido(null)} className="text-gray-500 hover:text-gray-700">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Cliente</p>
                                    <p className="text-sm font-medium text-gray-900">{selectedPedido.cliente?.NomeFantasia || selectedPedido.cliente?.Nome || 'N/D'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Vendedor</p>
                                    <p className="text-sm font-medium text-gray-900">{selectedPedido.vendedor?.nome || 'N/D'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Data e Hora</p>
                                    <p className="text-sm font-medium text-gray-900">{new Date(selectedPedido.createdAt).toLocaleString('pt-BR')}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Status de Envio</p>
                                    <div className="mt-1"><StatusBadge status={selectedPedido.statusEnvio} /></div>
                                    {selectedPedido.idVendaContaAzul && (
                                        <p className="text-xs text-green-600 mt-1">ID ERP: {selectedPedido.idVendaContaAzul}</p>
                                    )}
                                </div>
                            </div>

                            {selectedPedido.statusEnvio === 'ERRO' && selectedPedido.erroEnvio && (
                                <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700">
                                    <div className="flex items-start">
                                        <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                                        <p><strong>Erro de Sincronização:</strong> {selectedPedido.erroEnvio}</p>
                                    </div>
                                </div>
                            )}

                            {selectedPedido.observacoes && (
                                <div className="mb-6 bg-gray-50 p-3 rounded border border-gray-200">
                                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Observações do Pedido</p>
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedPedido.observacoes}</p>
                                </div>
                            )}

                            <div>
                                <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-3">Itens do Pedido</h3>
                                {selectedPedido.itens?.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedPedido.itens.map(item => (
                                            <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-100">
                                                <div className="flex-1">
                                                    <p className="text-sm font-semibold text-gray-900">{item.descricao || item.produto?.nome || 'Produto Indisponível'}</p>
                                                    <p className="text-xs text-gray-500">{Number(item.quantidade)}x - R$ {Number(item.valor).toFixed(2).replace('.', ',')} / un</p>
                                                </div>
                                                <div className="font-bold text-gray-900">
                                                    R$ {(Number(item.quantidade) * Number(item.valor)).toFixed(2).replace('.', ',')}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">Nenhum item registrado.</p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-between items-center rounded-b-lg">
                            <span className="text-gray-600 text-sm font-semibold">Total do Pedido:</span>
                            <span className="text-xl font-extrabold text-primary">
                                R$ {Number(selectedPedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toFixed(2).replace('.', ',')}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ListaPedidos;
