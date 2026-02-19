import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText } from 'lucide-react';
import pedidoService from '../../services/pedidoService';

const ListaPedidos = () => {
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);

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
            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}>
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
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
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
                                                onClick={() => navigate(`/pedidos/${pedido.id}`)}
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
        </div>
    );
};

export default ListaPedidos;
