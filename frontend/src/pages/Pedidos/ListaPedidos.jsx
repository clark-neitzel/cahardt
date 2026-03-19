import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, AlertCircle, Package, ChevronDown, ChevronUp, Printer, CheckSquare, Square, Trash2 } from 'lucide-react';
import pedidoService from '../../services/pedidoService';
import amostraService from '../../services/amostraService';
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
    const [abaAtiva, setAbaAtiva] = useState('todos'); // 'todos' | 'especiais' | 'amostras'
    const [aprovando, setAprovando] = useState(null); // id do pedido sendo aprovado
    const [amostras, setAmostras] = useState([]);
    const [loadingAmostras, setLoadingAmostras] = useState(false);
    const [expandedAmostra, setExpandedAmostra] = useState(null);

    const podeAprovar = user?.permissoes?.Pode_Aprovar_Especial || user?.permissoes?.admin;
    const podeReverter = user?.permissoes?.Pode_Reverter_Especial || user?.permissoes?.admin;
    const podeExcluirPedido = user?.permissoes?.Pode_Excluir_Pedido || user?.permissoes?.admin;
    const podeExcluirEspecial = user?.permissoes?.Pode_Excluir_Especial || user?.permissoes?.admin;
    const podeExcluirAmostra = user?.permissoes?.Pode_Excluir_Amostra || user?.permissoes?.admin;
    const [revertendo, setRevertendo] = useState(null);
    const [selecionados, setSelecionados] = useState(new Set());

    useEffect(() => {
        carregarPedidos();
    }, []);

    useEffect(() => {
        if (abaAtiva === 'amostras' && amostras.length === 0 && !loadingAmostras) {
            carregarAmostras();
        }
    }, [abaAtiva]);

    const carregarAmostras = async () => {
        try {
            setLoadingAmostras(true);
            const data = await amostraService.listar();
            setAmostras(data);
        } catch (error) {
            console.error('Erro ao carregar amostras:', error);
        } finally {
            setLoadingAmostras(false);
        }
    };

    const statusAmostraCores = {
        'SOLICITADA': 'bg-blue-100 text-blue-800',
        'PREPARACAO': 'bg-yellow-100 text-yellow-800',
        'LIBERADO': 'bg-emerald-100 text-emerald-800',
        'ENTREGUE': 'bg-green-100 text-green-800',
        'CANCELADA': 'bg-red-100 text-red-700',
    };

    const statusAmostraLabels = {
        'SOLICITADA': 'Solicitada',
        'PREPARACAO': 'Preparação',
        'LIBERADO': 'Liberado',
        'ENTREGUE': 'Entregue',
        'CANCELADA': 'Cancelada',
    };

    const proximoStatusAmostra = {
        'SOLICITADA': 'PREPARACAO',
        'PREPARACAO': 'LIBERADO',
        // LIBERADO → ENTREGUE acontece via embarque/motorista, não manual
    };

    const handleAvancarAmostra = async (amostraId, statusAtual) => {
        const proximo = proximoStatusAmostra[statusAtual];
        if (!proximo) return;
        try {
            await amostraService.atualizarStatus(amostraId, proximo);
            setAmostras(prev => prev.map(a => a.id === amostraId ? { ...a, status: proximo } : a));
            toast.success(`Amostra movida para ${statusAmostraLabels[proximo]}`);
        } catch (error) {
            toast.error('Erro ao atualizar status da amostra.');
        }
    };

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

    const handleReverterEspecial = async (pedidoId) => {
        if (!podeReverter) return;
        if (!window.confirm('Tem certeza que deseja reverter este pedido para ABERTO? A conta a receber será cancelada.')) return;
        try {
            setRevertendo(pedidoId);
            await pedidoService.reverterEspecial(pedidoId);
            toast.success('Pedido revertido para ABERTO!');
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, statusEnvio: 'ABERTO', situacaoCA: null } : p
            ));
            if (selectedPedido?.id === pedidoId) {
                setSelectedPedido(prev => ({ ...prev, statusEnvio: 'ABERTO', situacaoCA: null }));
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter pedido.');
        } finally {
            setRevertendo(null);
        }
    };

    const handleExcluirPedido = async (pedido) => {
        const tipo = pedido.especial ? 'pedido especial' : 'pedido';
        if (!window.confirm(`Tem certeza que deseja excluir este ${tipo}? Esta ação não pode ser desfeita.`)) return;
        try {
            await pedidoService.excluir(pedido.id);
            toast.success('Pedido excluído com sucesso!');
            setPedidos(prev => prev.filter(p => p.id !== pedido.id));
            if (selectedPedido?.id === pedido.id) setSelectedPedido(null);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir pedido.');
        }
    };

    const handleExcluirAmostra = async (amostraId) => {
        if (!window.confirm('Tem certeza que deseja excluir esta amostra? Esta ação não pode ser desfeita.')) return;
        try {
            await amostraService.excluir(amostraId);
            toast.success('Amostra excluída com sucesso!');
            setAmostras(prev => prev.filter(a => a.id !== amostraId));
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir amostra.');
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

    const toggleSelecao = (id) => {
        setSelecionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleTodosFiltrados = () => {
        const ids = pedidosFiltrados.map(p => p.id);
        const todosJaSelecionados = ids.every(id => selecionados.has(id));
        if (todosJaSelecionados) {
            setSelecionados(new Set());
        } else {
            setSelecionados(new Set(ids));
        }
    };

    const imprimirSelecionados = () => {
        if (selecionados.size === 0) return;
        const ids = Array.from(selecionados).join(',');
        navigate(`/pedidos/imprimir/lote?ids=${ids}`);
    };

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

            {/* Abas: Todos | Especiais | Amostras */}
            <div className="flex gap-1 mb-2 items-center">
                <button
                    onClick={() => setAbaAtiva('todos')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-t border border-b-0 transition-colors ${abaAtiva === 'todos' ? 'bg-white text-gray-900 border-gray-200' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                >
                    Todos
                </button>
                {qtdEspeciais > 0 && (
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
                )}
                <button
                    onClick={() => setAbaAtiva('amostras')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-t border border-b-0 transition-colors flex items-center gap-1.5 ${abaAtiva === 'amostras' ? 'bg-white text-orange-700 border-gray-200' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                >
                    <Package className="h-3.5 w-3.5" />
                    Amostras
                </button>
                {/* Selecionar todos (só quando não é aba amostras) */}
                {abaAtiva !== 'amostras' && pedidosFiltrados.length > 0 && (
                    <button
                        onClick={toggleTodosFiltrados}
                        className="ml-auto px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-purple-600 transition-colors"
                        title="Selecionar/desmarcar todos"
                    >
                        {pedidosFiltrados.every(p => selecionados.has(p.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                )}
            </div>

            {/* Barra de seleção em lote */}
            {abaAtiva !== 'amostras' && selecionados.size > 0 && (
                <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded px-3 py-2 mb-2">
                    <div className="flex items-center gap-2 text-sm text-purple-700">
                        <CheckSquare className="h-4 w-4" />
                        <span className="font-bold">{selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}</span>
                        <button onClick={() => setSelecionados(new Set())} className="text-purple-500 hover:text-purple-700 ml-1">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <button
                        onClick={imprimirSelecionados}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700"
                    >
                        <Printer className="h-3.5 w-3.5" />
                        Imprimir {selecionados.size}
                    </button>
                </div>
            )}

            {/* Conteúdo: Amostras */}
            {abaAtiva === 'amostras' ? (
                <div className="bg-white rounded overflow-hidden border-t sm:border border-gray-100 sm:border-gray-200">
                    <div className="divide-y divide-gray-200">
                        {loadingAmostras ? (
                            <div className="p-8 text-center text-gray-500">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
                                Carregando amostras...
                            </div>
                        ) : amostras.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">Nenhuma amostra encontrada.</div>
                        ) : (
                            amostras.map(amostra => {
                                const isExpanded = expandedAmostra === amostra.id;
                                const nomeDestinatario = amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || 'Sem destinatário';
                                const proximo = proximoStatusAmostra[amostra.status];
                                return (
                                    <div key={amostra.id} className="border-b border-gray-100">
                                        <div
                                            className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                                            onClick={() => setExpandedAmostra(isExpanded ? null : amostra.id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <span className="text-[11px] font-bold px-1 py-0.5 rounded border text-orange-700 bg-orange-50 border-orange-200 shrink-0">
                                                            AM#{amostra.numero}
                                                        </span>
                                                        <h3 className="text-[14px] font-semibold text-gray-800 leading-tight truncate">
                                                            {nomeDestinatario}
                                                        </h3>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 text-[11px] text-gray-500 font-light mb-1">
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-semibold text-gray-700">Entrega: {amostra.dataEntrega ? new Date(amostra.dataEntrega).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-'}</span>
                                                            <span className="text-gray-300">•</span>
                                                            <span>Criação: {new Date(amostra.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                                        </div>
                                                        <div className="truncate text-[10px] text-gray-400">
                                                            Vendedor: {amostra.solicitadoPor?.nome || '-'}
                                                        </div>
                                                    </div>
                                                    <div className="text-[11px] text-gray-500">
                                                        {amostra.itens?.length || 0} {(amostra.itens?.length || 0) === 1 ? 'item' : 'itens'}
                                                        {amostra.observacao && <span className="text-gray-300 mx-1">|</span>}
                                                        {amostra.observacao && <span className="italic truncate">{amostra.observacao}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                    <span className={`px-2 py-1 text-xs leading-5 font-semibold rounded-full ${statusAmostraCores[amostra.status] || 'bg-gray-100 text-gray-800'}`}>
                                                        {statusAmostraLabels[amostra.status] || amostra.status}
                                                    </span>
                                                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                                </div>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="px-3 pb-3 space-y-2">
                                                {amostra.itens && amostra.itens.map(item => (
                                                    <div key={item.id} className="flex items-center justify-between bg-orange-50 px-3 py-2 rounded border border-orange-100">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-medium text-gray-900 truncate">{item.nomeProduto}</p>
                                                            <p className="text-[11px] text-gray-500">{item.produto?.codigo || '-'} · {item.produto?.nome || '-'}</p>
                                                        </div>
                                                        <span className="text-[13px] font-bold text-gray-700 shrink-0">{Number(item.quantidade)}x</span>
                                                    </div>
                                                ))}
                                                {/* Botões de ação */}
                                                <div className="flex items-center gap-2 pt-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/imprimir/${amostra.id}?tipo=amostra`); }}
                                                        className="text-[11px] font-bold px-3 py-1.5 rounded transition-colors shadow-sm border bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                                                        title="Imprimir"
                                                    >
                                                        <Printer className="h-3.5 w-3.5 inline mr-1" />
                                                        Imprimir
                                                    </button>
                                                    {proximo && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAvancarAmostra(amostra.id, amostra.status); }}
                                                            className="text-[11px] font-bold px-3 py-1.5 rounded transition-colors shadow-sm border bg-orange-500 border-orange-600 text-white hover:bg-orange-600"
                                                        >
                                                            Avançar → {statusAmostraLabels[proximo]}
                                                        </button>
                                                    )}
                                                    {amostra.status !== 'CANCELADA' && amostra.status !== 'ENTREGUE' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm('Cancelar esta amostra?')) {
                                                                    amostraService.atualizarStatus(amostra.id, 'CANCELADA').then(() => {
                                                                        setAmostras(prev => prev.map(a => a.id === amostra.id ? { ...a, status: 'CANCELADA' } : a));
                                                                        toast.success('Amostra cancelada.');
                                                                    }).catch(() => toast.error('Erro ao cancelar.'));
                                                                }
                                                            }}
                                                            className="text-[11px] font-bold px-3 py-1.5 rounded transition-colors shadow-sm border bg-white border-red-200 text-red-600 hover:bg-red-50"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    )}
                                                    {amostra.status !== 'ENTREGUE' && podeExcluirAmostra && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleExcluirAmostra(amostra.id); }}
                                                            className="text-[11px] font-bold px-3 py-1.5 rounded transition-colors shadow-sm border bg-red-600 border-red-700 text-white hover:bg-red-700 flex items-center gap-1"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                            Excluir
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : (
            /* Conteúdo: Pedidos */
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
                                    {/* Checkbox de seleção */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleSelecao(pedido.id); }}
                                        className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-purple-600 transition-colors"
                                    >
                                        {selecionados.has(pedido.id)
                                            ? <CheckSquare className="h-5 w-5 text-purple-600" />
                                            : <Square className="h-5 w-5" />
                                        }
                                    </button>
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
                                        {/* Botão Excluir */}
                                        {(pedido.statusEnvio === 'ABERTO' || pedido.statusEnvio === 'ERRO') &&
                                            (pedido.especial ? podeExcluirEspecial : podeExcluirPedido) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleExcluirPedido(pedido); }}
                                                className="text-gray-300 hover:text-red-500 p-1 transition-colors"
                                                title="Excluir pedido"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                        {/* Botão Imprimir */}
                                        {pedido.numero && (
                                            <button
                                                onClick={() => navigate(`/pedidos/imprimir/${pedido.id}`)}
                                                className="text-gray-400 hover:text-gray-700 p-1"
                                                title="Imprimir pedido"
                                            >
                                                <Printer className="h-4 w-4" />
                                            </button>
                                        )}
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
                                        {/* Botão Reverter para pedidos especiais aprovados */}
                                        {pedido.especial && pedido.statusEnvio === 'RECEBIDO' && podeReverter && (
                                            <button
                                                onClick={() => handleReverterEspecial(pedido.id)}
                                                disabled={revertendo === pedido.id}
                                                className="text-[11px] font-bold px-3 py-1 rounded transition-colors shadow-sm outline-none border bg-red-50 border-red-200 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                            >
                                                {revertendo === pedido.id ? 'Revertendo...' : 'Reverter'}
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
            )}

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
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => navigate(`/pedidos/imprimir/${selectedPedido.id}`)}
                                    className="text-gray-400 hover:text-sky-600 p-1"
                                    title="Imprimir pedido"
                                >
                                    <Printer className="h-5 w-5" />
                                </button>
                                <button onClick={() => setSelectedPedido(null)} className="text-gray-500 hover:text-gray-700">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
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

                            {/* Bloco reverter no modal para especiais aprovados */}
                            {selectedPedido.especial && selectedPedido.statusEnvio === 'RECEBIDO' && podeReverter && (
                                <div className="mb-4 bg-red-50 border border-red-200 p-4 rounded-lg flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-red-900">Pedido Especial Aprovado</p>
                                        <p className="text-xs text-red-700 mt-1">Reverter fará o pedido voltar para ABERTO (editável). A conta a receber será cancelada.</p>
                                    </div>
                                    <button
                                        onClick={() => handleReverterEspecial(selectedPedido.id)}
                                        disabled={revertendo === selectedPedido.id}
                                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
                                    >
                                        {revertendo === selectedPedido.id ? 'Revertendo...' : 'Reverter para ABERTO'}
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
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-sm font-semibold">Total:</span>
                                <span className="text-xl font-extrabold text-primary">
                                    R$ {Number(selectedPedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toFixed(2).replace('.', ',')}
                                </span>
                            </div>
                            {(selectedPedido.statusEnvio === 'ABERTO' || selectedPedido.statusEnvio === 'ERRO') &&
                                (selectedPedido.especial ? podeExcluirEspecial : podeExcluirPedido) && (
                                <button
                                    onClick={() => handleExcluirPedido(selectedPedido)}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold transition-colors shadow-sm"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Excluir Pedido
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ListaPedidos;
