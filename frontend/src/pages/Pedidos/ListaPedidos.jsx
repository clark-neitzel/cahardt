import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, AlertCircle } from 'lucide-react';
import pedidoService from '../../services/pedidoService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const fmtNumero = (pedido) => pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`;

const ListaPedidos = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPedido, setSelectedPedido] = useState(null);
    const [busca, setBusca] = useState('');
    const [abaAtiva, setAbaAtiva] = useState('todos'); // 'todos' | 'especiais'
    const [aprovando, setAprovando] = useState(null); // id do pedido sendo aprovado

    const podeAprovar = user?.permissoes?.Pode_Aprovar_Especial || user?.permissoes?.admin;

    useEffect(() => {
        carregarPedidos();
    }, []);

    const carregarPedidos = async () => {
        try {
            const data = await pedidoService.listar({});
            data.sort((a, b) => new Date(b.dataVenda || b.createdAt) - new Date(a.dataVenda || a.createdAt));
            setPedidos(data);
        } catch (error) {
            console.error("Erro ao carregar pedidos", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAprovarEspecial = async (pedidoId) => {
        if (!podeAprovar) return;
        try {
            setAprovando(pedidoId);
            await pedidoService.aprovarEspecial(pedidoId);
            toast.success('Pedido especial aprovado!');
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' } : p
            ));
            if (selectedPedido?.id === pedidoId) {
                setSelectedPedido(prev => ({ ...prev, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' }));
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao aprovar pedido.');
        } finally {
            setAprovando(null);
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

    // Filtrar por aba e busca
    const pedidosPorAba = abaAtiva === 'especiais'
        ? pedidos.filter(p => p.especial)
        : pedidos;

    const pedidosFiltrados = busca.trim()
        ? pedidosPorAba.filter(p => {
            const termo = busca.toLowerCase();
            const nomeCliente = (p.cliente?.NomeFantasia || p.cliente?.Nome || '').toLowerCase();
            const nomeVendedor = (p.vendedor?.nome || '').toLowerCase();
            const numero = String(p.numero || '');
            const prefixoZZ = p.especial ? `zz#${p.numero}` : `#${p.numero}`;
            return nomeCliente.includes(termo) || nomeVendedor.includes(termo) || numero.includes(termo) || prefixoZZ.includes(termo);
        })
        : pedidosPorAba;

    const qtdEspeciais = pedidos.filter(p => p.especial).length;
    const qtdEspeciaisPendentes = pedidos.filter(p => p.especial && p.statusEnvio === 'ENVIAR').length;

    return (
        <div className="container mx-auto px-2 py-4">
            {/* Header: Busca */}
            <div className="flex flex-row items-center gap-2 mb-3">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar por cliente, número ou vendedor..."
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        className="block w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                </div>
            </div>

            {/* Abas: Todos | Especiais */}
            {qtdEspeciais > 0 && (
                <div className="flex gap-1 mb-2">
                    <button
                        onClick={() => setAbaAtiva('todos')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-t border border-b-0 transition-colors ${abaAtiva === 'todos' ? 'bg-white text-gray-900 border-gray-200' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setAbaAtiva('especiais')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-t border border-b-0 transition-colors flex items-center gap-1.5 ${abaAtiva === 'especiais' ? 'bg-white text-purple-700 border-gray-200' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                    >
                        Especiais
                        {qtdEspeciaisPendentes > 0 && (
                            <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {qtdEspeciaisPendentes}
                            </span>
                        )}
                    </button>
                </div>
            )}

            <div className="bg-white rounded overflow-hidden border-t sm:border border-gray-100 sm:border-gray-200">
                <div className="divide-y divide-gray-200">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                            Carregando pedidos...
                        </div>
                    ) : pedidosFiltrados.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            {busca ? `Nenhum pedido encontrado para "${busca}".` : abaAtiva === 'especiais' ? 'Nenhum pedido especial encontrado.' : 'Nenhum pedido encontrado.'}
                        </div>
                    ) : (
                        pedidosFiltrados.map((pedido) => (
                            <div key={pedido.id} className="p-3 hover:bg-gray-50 flex flex-col justify-between gap-1 border-b border-gray-100 transition-colors">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0 pr-1">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            {pedido.numero && (
                                                <span className={`text-[11px] font-bold px-1 py-0.5 rounded border shrink-0 ${pedido.especial ? 'text-purple-700 bg-purple-50 border-purple-200' : 'text-blue-700 bg-blue-50 border-blue-100'}`}>
                                                    {fmtNumero(pedido)}
                                                </span>
                                            )}
                                            {pedido.especial && (
                                                <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 py-0.5 rounded border border-purple-200 uppercase shrink-0">
                                                    Especial
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
                                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded uppercase border ${pedido.situacaoCA === 'FATURADO'
                                                ? 'text-green-700 bg-green-50 border-green-200'
                                                : 'text-blue-700 bg-blue-50 border-blue-100'
                                                }`}>
                                                {pedido.especial ? '' : 'CA: '}{pedido.situacaoCA}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {/* Botão Aprovar para pedidos especiais pendentes */}
                                        {pedido.especial && pedido.statusEnvio === 'ENVIAR' && podeAprovar && (
                                            <button
                                                onClick={() => handleAprovarEspecial(pedido.id)}
                                                disabled={aprovando === pedido.id}
                                                className="text-[11px] font-bold px-3 py-1 rounded transition-colors shadow-sm outline-none border bg-purple-600 border-purple-700 text-white hover:bg-purple-700 disabled:opacity-50"
                                            >
                                                {aprovando === pedido.id ? 'Aprovando...' : 'Aprovar'}
                                            </button>
                                        )}
                                        {(() => {
                                            const bloqueadoNoCA = pedido.statusEnvio === 'RECEBIDO' || ['APROVADO', 'FATURADO', 'EM_ABERTO'].includes(pedido.situacaoCA);
                                            const podeEditar = pedido.statusEnvio === 'ABERTO' && !bloqueadoNoCA;
                                            return (
                                                <button
                                                    className={`text-[11px] font-bold px-3 py-1 rounded transition-colors shadow-sm outline-none border ${podeEditar
                                                            ? 'bg-blue-50 border-blue-200 text-blue-700 active:bg-blue-100'
                                                            : bloqueadoNoCA
                                                                ? 'bg-green-50 border-green-200 text-green-700 cursor-default'
                                                                : 'bg-white border-gray-200 text-gray-600 active:bg-gray-50'
                                                        }`}
                                                    onClick={() => {
                                                        if (podeEditar) navigate(`/pedidos/editar/${pedido.id}`);
                                                        else setSelectedPedido(pedido);
                                                    }}
                                                    title={bloqueadoNoCA ? (pedido.especial ? 'Pedido especial aprovado.' : 'Pedido recebido pelo Conta Azul. Edite direto no ERP.') : undefined}
                                                >
                                                    {podeEditar ? 'Editar' : bloqueadoNoCA ? (pedido.especial ? 'Detalhes' : 'Ver no CA') : 'Detalhes'}
                                                </button>
                                            );
                                        })()}
                                    </div>
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
                                    <span className={selectedPedido.especial ? 'text-purple-600 font-extrabold' : 'text-blue-600 font-extrabold'}>
                                        Pedido {fmtNumero(selectedPedido)}
                                    </span>
                                ) : (
                                    'Detalhes do Pedido'
                                )}
                                {selectedPedido.especial && (
                                    <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-1 rounded-full uppercase">
                                        Especial
                                    </span>
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
                            {/* Botão aprovar no modal para especiais pendentes */}
                            {selectedPedido.especial && selectedPedido.statusEnvio === 'ENVIAR' && podeAprovar && (
                                <div className="mb-4 bg-purple-50 border border-purple-200 p-4 rounded-lg flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-purple-900">Pedido Especial Pendente de Aprovação</p>
                                        <p className="text-xs text-purple-700 mt-1">Confira os dados e o estoque antes de aprovar.</p>
                                    </div>
                                    <button
                                        onClick={() => handleAprovarEspecial(selectedPedido.id)}
                                        disabled={aprovando === selectedPedido.id}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
                                    >
                                        {aprovando === selectedPedido.id ? 'Aprovando...' : 'Aprovar / Faturar'}
                                    </button>
                                </div>
                            )}

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
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded w-fit uppercase border ${selectedPedido.situacaoCA === 'FATURADO'
                                                ? 'text-green-800 bg-green-50 border-green-300'
                                                : 'text-blue-800 bg-blue-50 border-blue-200'
                                                }`} title={selectedPedido.especial ? 'Status interno' : 'Status Oficial no Conta Azul'}>
                                                {selectedPedido.especial ? '' : 'CA: '}{selectedPedido.situacaoCA}
                                            </span>
                                        )}
                                    </div>
                                    {selectedPedido.idVendaContaAzul && (
                                        <p className="text-[10px] text-green-600 mt-2 truncate font-mono bg-green-50 p-1 w-fit rounded">ERP: {selectedPedido.idVendaContaAzul}</p>
                                    )}
                                </div>
                            </div>
                            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-3 rounded border ${selectedPedido.especial ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100'}`}>
                                <div>
                                    <p className={`text-xs uppercase font-semibold ${selectedPedido.especial ? 'text-purple-700' : 'text-blue-700'}`}>Condição de Pagamento</p>
                                    <p className={`text-sm font-medium ${selectedPedido.especial ? 'text-purple-900' : 'text-blue-900'}`}>
                                        {selectedPedido.especial ? 'Especial - À vista' : `Termo: ${selectedPedido.qtdParcelas}x de ${selectedPedido.intervaloDias}d`}
                                    </p>
                                    {selectedPedido.tipoPagamento && <p className={`text-xs font-bold mt-1 ${selectedPedido.especial ? 'text-purple-800' : 'text-blue-800'}`}>Meio de Pgto: {selectedPedido.tipoPagamento}</p>}
                                </div>
                                <div>
                                    <p className={`text-xs uppercase font-semibold ${selectedPedido.especial ? 'text-purple-700' : 'text-blue-700'}`}>Vendedor</p>
                                    <p className={`text-sm font-medium ${selectedPedido.especial ? 'text-purple-900' : 'text-blue-900'}`}>{selectedPedido.vendedor?.nome || 'N/D'}</p>
                                </div>
                                <div>
                                    <p className={`text-xs uppercase font-semibold ${selectedPedido.especial ? 'text-purple-700' : 'text-blue-700'}`}>Flex Gerado</p>
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
