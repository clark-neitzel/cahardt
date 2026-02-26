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
            // Ordenar por dataVenda (data de entrega) decrescente
            data.sort((a, b) => new Date(b.dataVenda || b.createdAt) - new Date(a.dataVenda || a.createdAt));
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
            'ERRO': 'bg-red-100 text-red-800',
            'EXCLUIDO': 'bg-red-100 text-red-700'
        };
        const colorClass = colors[status] || 'bg-gray-100 text-gray-800';
        return (
            <span className={`px-2 py-1 flex-shrink-0 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="container mx-auto px-2 py-4">
            {/* Header ultra compacto: Busca e Novo Pedido na mesma linha */}
            <div className="flex flex-row justify-between items-center gap-2 mb-3">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar pedido..."
                        className="block w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                </div>
                <button
                    onClick={() => navigate('/pedidos/novo')}
                    className="bg-primary hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded flex items-center justify-center transition-colors shadow-sm text-sm shrink-0"
                >
                    <Plus className="h-4 w-4 mr-1" />
                    Novo
                </button>
            </div>

            <div className="bg-white rounded overflow-hidden border-t sm:border border-gray-100 sm:border-gray-200">


                <div className="divide-y divide-gray-200">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                            Carregando pedidos...
                        </div>
                    ) : pedidos.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Nenhum pedido encontrado.</div>
                    ) : (
                        pedidos.map((pedido) => (
                            <div key={pedido.id} className="p-3 hover:bg-gray-50 flex flex-col justify-between gap-1 border-b border-gray-100 transition-colors">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0 pr-1">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            {pedido.numero && (
                                                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 shrink-0">
                                                    #{pedido.numero}
                                                </span>
                                            )}
                                            <h3 className="text-[14px] font-semibold text-gray-800 leading-tight truncate">
                                                {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Desconhecido'}
                                            </h3>
                                        </div>
                                        <div className="flex flex-col gap-0.5 text-[11px] text-gray-500 font-light mb-1.5">
                                            <div className="flex items-center gap-1">
                                                <span className="font-semibold text-gray-700">Entrega: {pedido.dataVenda ? new Date(pedido.dataVenda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-'}</span>
                                                <span className="text-gray-300">•</span>
                                                <span>Criação: {new Date(pedido.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                            </div>
                                            <div className="truncate text-[10px] text-gray-400">Vendedor: {pedido.vendedor?.nome || '-'}</div>
                                        </div>
                                    </div>
                                    <div className="text-[14px] font-bold text-gray-900 tracking-tight shrink-0 mt-0.5">
                                        R$ {Number(pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toFixed(2).replace('.', ',')}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mt-0.5">
                                    <div className="flex flex-wrap items-center gap-1">
                                        <StatusBadge status={pedido.statusEnvio} />
                                        {pedido.revisaoPendente && (
                                            <span className="flex items-center text-[9px] font-medium text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded" title="Modificado no CA">
                                                <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Alt CA
                                            </span>
                                        )}
                                        {pedido.situacaoCA && (
                                            <span className="text-[9px] font-medium text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded uppercase">
                                                CA: {pedido.situacaoCA}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        className={`text-[11px] font-bold px-3 py-1 rounded transition-colors shadow-sm outline-none border ${pedido.statusEnvio === 'ABERTO'
                                            ? 'bg-blue-50 border-blue-200 text-blue-700 active:bg-blue-100'
                                            : 'bg-white border-gray-200 text-gray-600 active:bg-gray-50'
                                            }`}
                                        onClick={() => {
                                            if (pedido.statusEnvio === 'ABERTO') navigate(`/pedidos/editar/${pedido.id}`);
                                            else setSelectedPedido(pedido);
                                        }}
                                    >
                                        {pedido.statusEnvio === 'ABERTO' ? 'Editar' : 'Detalhes'}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Modal de Detalhes do Pedido */}
            {selectedPedido && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                {selectedPedido.numero ? (
                                    <span className="text-blue-600 font-extrabold">Pedido #{selectedPedido.numero}</span>
                                ) : (
                                    'Detalhes do Pedido'
                                )}
                                {selectedPedido.revisaoPendente && (
                                    <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-full flex items-center">
                                        <AlertCircle className="h-4 w-4 mr-1" /> Alterado no ERP
                                    </span>
                                )}
                            </h2>
                            <button onClick={() => setSelectedPedido(null)} className="text-gray-500 hover:text-gray-700">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1">
                            {selectedPedido.revisaoPendente && (
                                <div className="mb-6 bg-orange-50 border-l-4 border-orange-500 p-4 rounded text-sm text-orange-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-start">
                                        <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0 text-orange-600 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-orange-900 text-base">Atenção Vendedor!</p>
                                            <p className="mt-1">Este pedido foi modificado lá no Conta Azul (Escritório) desde a última vez que você visualizou. O valor ou os produtos podem ter mudado.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await pedidoService.marcarRevisado(selectedPedido.id);
                                                setSelectedPedido({ ...selectedPedido, revisaoPendente: false });
                                                setPedidos(pedidos.map(p => p.id === selectedPedido.id ? { ...p, revisaoPendente: false } : p));
                                            } catch (e) {
                                                alert('Erro ao marcar como revisado.');
                                            }
                                        }}
                                        className="whitespace-nowrap bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md font-bold text-xs transition-colors shadow-sm"
                                    >
                                        Marcar como Visto
                                    </button>
                                </div>
                            )}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Cliente</p>
                                    <p className="text-sm font-medium text-gray-900 line-clamp-2">{selectedPedido.cliente?.NomeFantasia || selectedPedido.cliente?.Nome || 'N/D'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Emissão</p>
                                    <p className="text-sm font-medium text-gray-900">{new Date(selectedPedido.createdAt).toLocaleString('pt-BR')}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Data da Entrega</p>
                                    <p className="text-sm font-bold text-gray-900 bg-gray-100 inline-block px-2 py-0.5 rounded uppercase">{new Date(selectedPedido.dataVenda).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-semibold">Status de Envio</p>
                                    <div className="mt-1 flex items-center gap-2">
                                        <StatusBadge status={selectedPedido.statusEnvio} />
                                        {selectedPedido.situacaoCA && (
                                            <span className="text-[10px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-1 rounded w-fit uppercase" title="Status Oficial no Conta Azul">
                                                CA: {selectedPedido.situacaoCA}
                                            </span>
                                        )}
                                    </div>
                                    {selectedPedido.idVendaContaAzul && (
                                        <p className="text-[10px] text-green-600 mt-2 truncate font-mono bg-green-50 p-1 w-fit rounded">ERP: {selectedPedido.idVendaContaAzul}</p>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 bg-blue-50 p-3 rounded border border-blue-100">
                                <div>
                                    <p className="text-xs text-blue-700 uppercase font-semibold">Condição de Pagamento</p>
                                    <p className="text-sm font-medium text-blue-900">
                                        Termo: {selectedPedido.qtdParcelas}x de {selectedPedido.intervaloDias}d
                                    </p>
                                    {selectedPedido.tipoPagamento && <p className="text-xs text-blue-800 font-bold mt-1">Meio de Pgto: {selectedPedido.tipoPagamento}</p>}
                                </div>
                                <div>
                                    <p className="text-xs text-blue-700 uppercase font-semibold">Vendedor</p>
                                    <p className="text-sm font-medium text-blue-900">{selectedPedido.vendedor?.nome || 'N/D'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-blue-700 uppercase font-semibold">Flex Gerado</p>
                                    <p className={`text-xl font-bold ${Number(selectedPedido.flexTotal) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {Number(selectedPedido.flexTotal) > 0 ? '+' : ''}{Number(selectedPedido.flexTotal || 0).toFixed(2).replace('.', ',')}
                                    </p>
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
                                                    <p className="text-sm font-semibold text-gray-900">{item.produto?.codigo ? `[${item.produto.codigo}] ` : ''}{item.produto?.nome || item.descricao || 'Produto Indisponível'}</p>
                                                    <p className="text-xs text-gray-500">{Number(item.quantidade)}x - R$ {Number(item.valor).toFixed(2).replace('.', ',')} / un</p>
                                                    {item.flexGerado !== undefined && item.flexGerado !== null && (
                                                        <p className={`text-[10px] font-bold mt-0.5 ${Number(item.flexGerado) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {Number(item.flexGerado) > 0 ? '+' : ''}{Number(item.flexGerado).toFixed(2).replace('.', ',')} Flex
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="font-bold text-gray-900 text-right">
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
