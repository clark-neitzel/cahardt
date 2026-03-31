import React, { useState, useEffect, useMemo } from 'react';
import { Search, CheckSquare, Square, Save, X, Package, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';

const TipoBadge = ({ pedido }) => {
    if (pedido.bonificacao) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">BN</span>;
    if (pedido.especial) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">ZZ</span>;
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700">CA</span>;
};

const fmtData = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const fmtValor = (itens) => {
    if (!itens?.length) return '-';
    const total = itens.reduce((acc, item) => acc + (Number(item.precoUnitario || 0) * Number(item.quantidade || 0)), 0);
    return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const AdicionarPedidosModal = ({ embarqueId, onClose, onSuccess }) => {
    const [pedidosLivres, setPedidosLivres] = useState([]);
    const [amostrasLivres, setAmostrasLivres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selecionados, setSelecionados] = useState(new Set());
    const [amostrasSelecionadas, setAmostrasSelecionadas] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [aba, setAba] = useState('pedidos');
    const [filtroVendedor, setFiltroVendedor] = useState('');
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('todos');

    useEffect(() => {
        const fetchLivres = async () => {
            try {
                const [livres, amostras] = await Promise.all([
                    embarqueService.listarPedidosLivres(),
                    embarqueService.listarAmostrasDisponiveis()
                ]);
                setPedidosLivres(livres);
                setAmostrasLivres(amostras);
            } catch {
                toast.error('Erro ao buscar fila de faturamento.');
            } finally {
                setLoading(false);
            }
        };
        fetchLivres();
    }, []);

    // Lista de vendedores únicos para o filtro
    const vendedoresUnicos = useMemo(() => {
        const map = new Map();
        pedidosLivres.forEach(p => {
            if (p.vendedor?.nome) map.set(p.vendedor.nome, p.vendedor.nome);
        });
        return Array.from(map.values()).sort();
    }, [pedidosLivres]);

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

    const pedidosFiltrados = useMemo(() => {
        return pedidosLivres.filter(p => {
            const nome = (p.cliente?.NomeFantasia || p.cliente?.Nome || '').toLowerCase();
            const buscaOk = nome.includes(searchTerm.toLowerCase()) || String(p.numero || '').includes(searchTerm);
            const vendedorOk = !filtroVendedor || p.vendedor?.nome === filtroVendedor;
            const tipoOk = filtroTipo === 'todos' ||
                (filtroTipo === 'normal' && !p.especial && !p.bonificacao) ||
                (filtroTipo === 'especial' && p.especial) ||
                (filtroTipo === 'bonificacao' && p.bonificacao);
            let dataOk = true;
            if (filtroDataInicio || filtroDataFim) {
                const dataEntrega = p.dataEntrega ? new Date(p.dataEntrega) : null;
                if (!dataEntrega) {
                    dataOk = false;
                } else {
                    if (filtroDataInicio) dataOk = dataOk && dataEntrega >= new Date(filtroDataInicio);
                    if (filtroDataFim) dataOk = dataOk && dataEntrega <= new Date(filtroDataFim + 'T23:59:59');
                }
            }
            return buscaOk && vendedorOk && tipoOk && dataOk;
        });
    }, [pedidosLivres, searchTerm, filtroVendedor, filtroTipo, filtroDataInicio, filtroDataFim]);

    const amostrasFiltradas = useMemo(() => {
        return amostrasLivres.filter(a => {
            const nome = (a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '').toLowerCase();
            return nome.includes(searchTerm.toLowerCase()) || String(a.numero || '').includes(searchTerm);
        });
    }, [amostrasLivres, searchTerm]);

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
            if (temPedidos) promises.push(embarqueService.inserirPedidos(embarqueId, Array.from(selecionados)));
            if (temAmostras) promises.push(embarqueService.inserirAmostras(embarqueId, Array.from(amostrasSelecionadas)));
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

    const totalSelecionados = selecionados.size + amostrasSelecionadas.size;
    const todosSelecionados = aba === 'pedidos'
        ? selecionados.size === pedidosFiltrados.length && pedidosFiltrados.length > 0
        : amostrasSelecionadas.size === amostrasFiltradas.length && amostrasFiltradas.length > 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-60 px-2 py-4 sm:px-4 sm:py-8">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
                {/* Header */}
                <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-lg">
                    <h3 className="text-lg font-bold text-gray-900">Embarcar Pedidos e Amostras</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Abas */}
                <div className="px-4 sm:px-6 pt-3 pb-0 border-b border-gray-200 bg-white">
                    <div className="flex gap-2 overflow-x-auto">
                        <button
                            onClick={() => setAba('pedidos')}
                            className={`flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-t border-b-2 transition-colors ${aba === 'pedidos' ? 'border-sky-500 text-sky-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Pedidos ({pedidosLivres.length})
                        </button>
                        <button
                            onClick={() => setAba('amostras')}
                            className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-t border-b-2 transition-colors ${aba === 'amostras' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Package className="h-3.5 w-3.5" />
                            Amostras ({amostrasLivres.length})
                        </button>
                    </div>
                </div>

                {/* Filtros */}
                <div className="px-4 sm:px-6 py-3 border-b border-gray-200 bg-white space-y-2">
                    {/* Busca */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={aba === 'pedidos' ? 'Buscar cliente ou nº...' : 'Buscar destinatário ou nº...'}
                            className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Filtros extras — só para aba pedidos */}
                    {aba === 'pedidos' && (
                        <div className="flex flex-wrap gap-2">
                            {/* Tipo */}
                            <div className="relative">
                                <select
                                    value={filtroTipo}
                                    onChange={(e) => setFiltroTipo(e.target.value)}
                                    className="appearance-none pl-3 pr-7 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                >
                                    <option value="todos">Todos os tipos</option>
                                    <option value="normal">Normal (CA)</option>
                                    <option value="especial">Especial (ZZ)</option>
                                    <option value="bonificacao">Bonificação (BN)</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                            </div>

                            {/* Vendedor */}
                            {vendedoresUnicos.length > 0 && (
                                <div className="relative">
                                    <select
                                        value={filtroVendedor}
                                        onChange={(e) => setFiltroVendedor(e.target.value)}
                                        className="appearance-none pl-3 pr-7 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                    >
                                        <option value="">Todos os vendedores</option>
                                        {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                </div>
                            )}

                            {/* Data entrega */}
                            <input
                                type="date"
                                title="Entrega de"
                                value={filtroDataInicio}
                                onChange={(e) => setFiltroDataInicio(e.target.value)}
                                className="pl-2 pr-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            />
                            <input
                                type="date"
                                title="Entrega até"
                                value={filtroDataFim}
                                onChange={(e) => setFiltroDataFim(e.target.value)}
                                className="pl-2 pr-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            />

                            {(filtroVendedor || filtroDataInicio || filtroDataFim || filtroTipo !== 'todos') && (
                                <button
                                    onClick={() => { setFiltroVendedor(''); setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroTipo('todos'); }}
                                    className="px-2 py-1.5 text-xs text-red-600 hover:text-red-800 border border-red-200 rounded"
                                >
                                    Limpar filtros
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">Carregando...</div>
                    ) : aba === 'pedidos' ? (
                        pedidosFiltrados.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                {pedidosLivres.length === 0 ? 'Nenhum pedido disponível no momento.' : 'Nenhum pedido encontrado com estes filtros.'}
                            </div>
                        ) : (
                            <div className="overflow-x-auto shadow rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 bg-white">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-3 py-3 text-left">
                                                <button onClick={toggleTodos} className="text-sky-600 hover:text-sky-800">
                                                    {todosSelecionados ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                                </button>
                                            </th>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Tipo</th>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Nº</th>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                            <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Cidade</th>
                                            <th className="hidden md:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Condição</th>
                                            <th className="hidden md:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Vendedor</th>
                                            <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Entrega</th>
                                            <th className="hidden lg:table-cell px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {pedidosFiltrados.map((pedido) => {
                                            const sel = selecionados.has(pedido.id);
                                            const condicao = pedido.nomeCondicaoPagamento || pedido.opcaoCondicaoPagamento || pedido.tipoPagamento || '-';
                                            return (
                                                <tr
                                                    key={pedido.id}
                                                    onClick={() => toggleSelecao(pedido.id)}
                                                    className={`cursor-pointer transition-colors ${sel ? 'bg-sky-50 hover:bg-sky-100' : 'hover:bg-gray-50'}`}
                                                >
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        {sel ? <CheckSquare className="h-5 w-5 text-sky-600" /> : <Square className="h-5 w-5 text-gray-400" />}
                                                    </td>
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        <TipoBadge pedido={pedido} />
                                                    </td>
                                                    <td className="px-3 py-3 whitespace-nowrap text-sm font-mono text-gray-900 font-semibold">
                                                        {pedido.numero || 'S/N'}
                                                    </td>
                                                    <td className="px-3 py-3 text-sm text-gray-900 font-medium">
                                                        <div className="max-w-[150px] truncate">
                                                            {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Não encontrado'}
                                                        </div>
                                                        {/* Mobile: info extra */}
                                                        <div className="sm:hidden text-xs text-gray-400 mt-0.5">
                                                            {pedido.cliente?.End_Cidade || ''}{pedido.vendedor?.nome ? ` · ${pedido.vendedor.nome}` : ''}
                                                        </div>
                                                    </td>
                                                    <td className="hidden sm:table-cell px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                                                        {pedido.cliente?.End_Cidade || '-'}
                                                    </td>
                                                    <td className="hidden md:table-cell px-3 py-3 text-xs text-gray-600 max-w-[120px]">
                                                        <div className="truncate" title={condicao}>{condicao}</div>
                                                    </td>
                                                    <td className="hidden md:table-cell px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                                                        {pedido.vendedor?.nome || '-'}
                                                    </td>
                                                    <td className="hidden sm:table-cell px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                                                        {fmtData(pedido.dataEntrega)}
                                                    </td>
                                                    <td className="hidden lg:table-cell px-3 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                                                        {pedido.bonificacao ? <span className="text-green-600 font-bold">R$ 0,00</span> : fmtValor(pedido.itens)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : (
                        amostrasFiltradas.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">Nenhuma amostra LIBERADA disponível.</div>
                        ) : (
                            <div className="overflow-x-auto shadow rounded-lg border border-orange-200">
                                <table className="min-w-full divide-y divide-orange-100 bg-white">
                                    <thead className="bg-orange-50">
                                        <tr>
                                            <th className="px-3 py-3 text-left">
                                                <button onClick={toggleTodos} className="text-orange-600 hover:text-orange-800">
                                                    {todosSelecionados ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                                </button>
                                            </th>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Nº</th>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Destinatário</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Itens</th>
                                            <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Vendedor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-orange-100">
                                        {amostrasFiltradas.map((amostra) => (
                                            <tr key={amostra.id} onClick={() => toggleAmostra(amostra.id)} className={`cursor-pointer transition-colors ${amostrasSelecionadas.has(amostra.id) ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-orange-50'}`}>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    {amostrasSelecionadas.has(amostra.id) ? <CheckSquare className="h-5 w-5 text-orange-600" /> : <Square className="h-5 w-5 text-gray-400" />}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-sm text-orange-700 font-mono font-bold">
                                                    AM#{amostra.numero}
                                                </td>
                                                <td className="px-3 py-3 text-sm text-gray-900 font-medium">
                                                    {amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || '-'}
                                                    <div className="sm:hidden text-xs text-gray-400 mt-0.5">{amostra.solicitadoPor?.nome || ''}</div>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-center text-sm text-gray-700 font-bold">
                                                    {amostra.itens?.length || 0}
                                                </td>
                                                <td className="hidden sm:table-cell px-3 py-3 whitespace-nowrap text-sm text-gray-500">
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

                {/* Footer */}
                <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between rounded-b-lg gap-3">
                    <div className="text-sm text-gray-700 flex-shrink-0">
                        <span className="font-bold text-sky-700">{selecionados.size}</span> pedidos
                        {amostrasSelecionadas.size > 0 && (
                            <> + <span className="font-bold text-orange-700">{amostrasSelecionadas.size}</span> amostras</>
                        )}
                        {aba === 'pedidos' && pedidosFiltrados.length !== pedidosLivres.length && (
                            <span className="ml-2 text-xs text-gray-400">({pedidosFiltrados.length} de {pedidosLivres.length} visíveis)</span>
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
