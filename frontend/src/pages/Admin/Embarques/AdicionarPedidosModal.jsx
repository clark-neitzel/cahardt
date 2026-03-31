import React, { useState, useEffect, useMemo } from 'react';
import { Search, CheckSquare, Square, Save, X, Package, ChevronDown, MapPin, User, CreditCard, Calendar, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';

const TipoBadge = ({ pedido }) => {
    if (pedido.bonificacao) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">BN</span>;
    if (pedido.especial) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">ZZ</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700 border border-sky-200">CA</span>;
};

const fmtData = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const fmtValor = (pedido) => {
    if (pedido.bonificacao) return <span className="text-green-600 font-bold text-xs">BONIFICAÇÃO</span>;
    if (!pedido.itens?.length) return null;
    const total = pedido.itens.reduce((acc, item) => acc + (Number(item.valor || item.precoUnitario || 0) * Number(item.quantidade || 0)), 0);
    if (total === 0) return null;
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
        const termo = searchTerm.toLowerCase();
        return pedidosLivres.filter(p => {
            const condicao = (p.nomeCondicaoPagamento || p.opcaoCondicaoPagamento || p.tipoPagamento || '').toLowerCase();
            const clienteNome = (p.cliente?.NomeFantasia || p.cliente?.Nome || '').toLowerCase();
            const cidade = (p.cliente?.End_Cidade || '').toLowerCase();
            const vendedorNome = (p.vendedor?.nome || '').toLowerCase();
            const tipoAbreviacao = p.bonificacao ? 'bn' : (p.especial ? 'zz' : 'ca');
            const dataVenda = p.dataVenda ? new Date(p.dataVenda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

            const strBusca = `${clienteNome} ${String(p.numero || '')} ${cidade} ${vendedorNome} ${condicao} ${dataVenda} ${tipoAbreviacao}`;
            const buscaOk = termo === '' || strBusca.includes(termo);
            const vendedorOk = !filtroVendedor || p.vendedor?.nome === filtroVendedor;
            const tipoOk = filtroTipo === 'todos' ||
                (filtroTipo === 'normal' && !p.especial && !p.bonificacao) ||
                (filtroTipo === 'especial' && p.especial) ||
                (filtroTipo === 'bonificacao' && p.bonificacao);
            let dataOk = true;
            if (filtroDataInicio || filtroDataFim) {
                const dataVenda = p.dataVenda ? new Date(p.dataVenda) : null;
                if (!dataVenda) {
                    dataOk = false;
                } else {
                    if (filtroDataInicio) dataOk = dataOk && dataVenda >= new Date(filtroDataInicio);
                    if (filtroDataFim) dataOk = dataOk && dataVenda <= new Date(filtroDataFim + 'T23:59:59');
                }
            }
            return buscaOk && vendedorOk && tipoOk && dataOk;
        });
    }, [pedidosLivres, searchTerm, filtroVendedor, filtroTipo, filtroDataInicio, filtroDataFim]);

    const amostrasFiltradas = useMemo(() => {
        const termo = searchTerm.toLowerCase();
        return amostrasLivres.filter(a => {
            const clienteNome = (a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '').toLowerCase();
            const cidade = (a.cliente?.End_Cidade || '').toLowerCase();
            const usuarioNome = (a.solicitadoPor?.nome || '').toLowerCase();

            const strBusca = `${clienteNome} ${String(a.numero || '')} ${cidade} ${usuarioNome}`;
            return termo === '' || strBusca.includes(termo);
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

    const temFiltroAtivo = filtroVendedor || filtroDataInicio || filtroDataFim || filtroTipo !== 'todos';
    const totalSelecionados = selecionados.size + amostrasSelecionadas.size;
    const todosSelecionados = aba === 'pedidos'
        ? selecionados.size === pedidosFiltrados.length && pedidosFiltrados.length > 0
        : amostrasSelecionadas.size === amostrasFiltradas.length && amostrasFiltradas.length > 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-60 px-2 py-4 sm:px-4 sm:py-6">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">

                {/* Header */}
                <div className="px-4 sm:px-5 py-3.5 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl">
                    <h3 className="text-base font-bold text-gray-900">Embarcar Pedidos e Amostras</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Abas */}
                <div className="px-4 sm:px-5 pt-3 pb-0 bg-white border-b border-gray-200">
                    <div className="flex gap-4">
                        <button
                            onClick={() => setAba('pedidos')}
                            className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${aba === 'pedidos' ? 'border-sky-500 text-sky-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            Pedidos <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${aba === 'pedidos' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'}`}>{pedidosLivres.length}</span>
                        </button>
                        <button
                            onClick={() => setAba('amostras')}
                            className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${aba === 'amostras' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            <Package className="h-3.5 w-3.5" />
                            Amostras <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs ${aba === 'amostras' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{amostrasLivres.length}</span>
                        </button>
                    </div>
                </div>

                {/* Filtros */}
                <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-white space-y-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={aba === 'pedidos' ? 'Buscar por cliente ou nº do pedido...' : 'Buscar destinatário ou nº...'}
                            className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {aba === 'pedidos' && (
                        <div className="flex flex-wrap gap-2 items-center">
                            {/* Tipo */}
                            <div className="relative">
                                <select
                                    value={filtroTipo}
                                    onChange={(e) => setFiltroTipo(e.target.value)}
                                    className="appearance-none pl-2.5 pr-6 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 font-medium text-gray-700"
                                >
                                    <option value="todos">Todos os tipos</option>
                                    <option value="normal">CA — Normal</option>
                                    <option value="especial">ZZ — Especial</option>
                                    <option value="bonificacao">BN — Bonificação</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                            </div>

                            {/* Vendedor */}
                            {vendedoresUnicos.length > 0 && (
                                <div className="relative">
                                    <select
                                        value={filtroVendedor}
                                        onChange={(e) => setFiltroVendedor(e.target.value)}
                                        className="appearance-none pl-2.5 pr-6 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 font-medium text-gray-700"
                                    >
                                        <option value="">Todos os vendedores</option>
                                        {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                </div>
                            )}

                            {/* Data de/até */}
                            <div className="flex items-center gap-1">
                                <input
                                    type="date"
                                    title="Entrega a partir de"
                                    value={filtroDataInicio}
                                    onChange={(e) => setFiltroDataInicio(e.target.value)}
                                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-400 text-gray-700 w-[130px]"
                                />
                                <span className="text-gray-400 text-xs">até</span>
                                <input
                                    type="date"
                                    title="Entrega até"
                                    value={filtroDataFim}
                                    onChange={(e) => setFiltroDataFim(e.target.value)}
                                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-400 text-gray-700 w-[130px]"
                                />
                            </div>

                            {temFiltroAtivo && (
                                <button
                                    onClick={() => { setFiltroVendedor(''); setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroTipo('todos'); }}
                                    className="px-2.5 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors"
                                >
                                    Limpar
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    {loading ? (
                        <div className="text-center py-12 text-gray-400 text-sm">Carregando...</div>
                    ) : aba === 'pedidos' ? (
                        pedidosFiltrados.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 text-sm">
                                {pedidosLivres.length === 0 ? 'Nenhum pedido disponível.' : 'Nenhum pedido com estes filtros.'}
                            </div>
                        ) : (
                            <>
                                {/* Linha selecionar todos */}
                                <div className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-white border-b border-gray-100">
                                    <button onClick={toggleTodos} className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-sky-600 transition-colors">
                                        {todosSelecionados
                                            ? <CheckSquare className="h-4 w-4 text-sky-600" />
                                            : <Square className="h-4 w-4" />}
                                        {todosSelecionados ? 'Desmarcar todos' : `Selecionar todos (${pedidosFiltrados.length})`}
                                    </button>
                                    {selecionados.size > 0 && (
                                        <span className="ml-auto text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                                            {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>

                                {/* Cards de pedidos */}
                                <div className="divide-y divide-gray-100">
                                    {pedidosFiltrados.map((pedido) => {
                                        const sel = selecionados.has(pedido.id);
                                        const condicao = pedido.nomeCondicaoPagamento || pedido.opcaoCondicaoPagamento || pedido.tipoPagamento;
                                        const valorFormatado = fmtValor(pedido);
                                        const dataEntrega = fmtData(pedido.dataVenda);
                                        return (
                                            <div
                                                key={pedido.id}
                                                onClick={() => toggleSelecao(pedido.id)}
                                                className={`flex items-start gap-3 px-4 sm:px-5 py-3.5 cursor-pointer transition-colors ${sel ? 'bg-sky-50 border-l-4 border-l-sky-500' : 'bg-white hover:bg-gray-50 border-l-4 border-l-transparent'}`}
                                            >
                                                {/* Checkbox */}
                                                <div className="flex-shrink-0 pt-0.5">
                                                    {sel
                                                        ? <CheckSquare className="h-5 w-5 text-sky-600" />
                                                        : <Square className="h-5 w-5 text-gray-300" />}
                                                </div>

                                                {/* Conteúdo */}
                                                <div className="flex-1 min-w-0">
                                                    {/* Linha 1: tipo + número + nome cliente */}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <TipoBadge pedido={pedido} />
                                                        <span className="text-xs font-mono font-bold text-gray-500">#{pedido.numero || 'S/N'}</span>
                                                        <span className="text-sm font-semibold text-gray-900 leading-tight">
                                                            {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Cliente não encontrado'}
                                                        </span>
                                                    </div>

                                                    {/* Linha 2: cidade, vendedor, condição, data, valor */}
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                                        {pedido.cliente?.End_Cidade && (
                                                            <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                                                {pedido.cliente.End_Cidade}
                                                            </span>
                                                        )}
                                                        {pedido.vendedor?.nome && (
                                                            <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                <User className="h-3 w-3 flex-shrink-0" />
                                                                {pedido.vendedor.nome}
                                                            </span>
                                                        )}
                                                        {condicao && (
                                                            <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                <CreditCard className="h-3 w-3 flex-shrink-0" />
                                                                {condicao}
                                                            </span>
                                                        )}
                                                        {dataEntrega && (
                                                            <span className="flex items-center gap-1 text-xs font-medium text-indigo-600">
                                                                <Calendar className="h-3 w-3 flex-shrink-0" />
                                                                {dataEntrega}
                                                            </span>
                                                        )}
                                                        {valorFormatado && (
                                                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 ml-auto">
                                                                {typeof valorFormatado === 'string' ? (
                                                                    <><DollarSign className="h-3 w-3 flex-shrink-0" />{valorFormatado}</>
                                                                ) : valorFormatado}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )
                    ) : (
                        amostrasFiltradas.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 text-sm">Nenhuma amostra LIBERADA disponível.</div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-white border-b border-gray-100">
                                    <button onClick={toggleTodos} className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-orange-600 transition-colors">
                                        {todosSelecionados
                                            ? <CheckSquare className="h-4 w-4 text-orange-600" />
                                            : <Square className="h-4 w-4" />}
                                        {todosSelecionados ? 'Desmarcar todos' : `Selecionar todos (${amostrasFiltradas.length})`}
                                    </button>
                                    {amostrasSelecionadas.size > 0 && (
                                        <span className="ml-auto text-xs font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                                            {amostrasSelecionadas.size} selecionada{amostrasSelecionadas.size > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {amostrasFiltradas.map((amostra) => {
                                        const selA = amostrasSelecionadas.has(amostra.id);
                                        return (
                                            <div
                                                key={amostra.id}
                                                onClick={() => toggleAmostra(amostra.id)}
                                                className={`flex items-start gap-3 px-4 sm:px-5 py-3.5 cursor-pointer transition-colors ${selA ? 'bg-orange-50 border-l-4 border-l-orange-400' : 'bg-white hover:bg-orange-50 border-l-4 border-l-transparent'}`}
                                            >
                                                <div className="flex-shrink-0 pt-0.5">
                                                    {selA ? <CheckSquare className="h-5 w-5 text-orange-500" /> : <Square className="h-5 w-5 text-gray-300" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono font-bold text-orange-600">AM#{amostra.numero}</span>
                                                        <span className="text-sm font-semibold text-gray-900">
                                                            {amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || '-'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                                                        <span className="text-xs text-gray-500">{amostra.itens?.length || 0} itens</span>
                                                        {amostra.solicitadoPor?.nome && (
                                                            <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                <User className="h-3 w-3" />{amostra.solicitadoPor.nome}
                                                            </span>
                                                        )}
                                                        {amostra.cliente?.End_Cidade && (
                                                            <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                <MapPin className="h-3 w-3" />{amostra.cliente.End_Cidade}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 sm:px-5 py-3.5 bg-white border-t border-gray-200 flex items-center justify-between rounded-b-xl gap-3">
                    <div className="text-sm text-gray-600 flex-shrink-0">
                        {selecionados.size > 0 && <span className="font-bold text-sky-700">{selecionados.size} pedido{selecionados.size > 1 ? 's' : ''}</span>}
                        {selecionados.size > 0 && amostrasSelecionadas.size > 0 && <span className="text-gray-400"> + </span>}
                        {amostrasSelecionadas.size > 0 && <span className="font-bold text-orange-700">{amostrasSelecionadas.size} amostra{amostrasSelecionadas.size > 1 ? 's' : ''}</span>}
                        {totalSelecionados === 0 && <span className="text-gray-400 text-xs">Nenhum selecionado</span>}
                        {aba === 'pedidos' && pedidosFiltrados.length !== pedidosLivres.length && (
                            <span className="ml-2 text-xs text-gray-400">({pedidosFiltrados.length} de {pedidosLivres.length} visíveis)</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handleAtrelar}
                            disabled={saving || totalSelecionados === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            <Save className="h-4 w-4" />
                            {saving ? 'Atrelando...' : 'Atrelar à Carga'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdicionarPedidosModal;
