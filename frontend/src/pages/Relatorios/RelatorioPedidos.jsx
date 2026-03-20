import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import {
    FileText, Filter, Download, ChevronDown, ChevronUp, Search, X,
    TrendingUp, ShoppingCart, DollarSign, Package
} from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const STATUS_ENVIO = {
    ABERTO: { label: 'Aberto', class: 'bg-gray-100 text-gray-700' },
    ENVIAR: { label: 'Enviar', class: 'bg-yellow-100 text-yellow-800' },
    SINCRONIZANDO: { label: 'Sincronizando', class: 'bg-blue-100 text-blue-700' },
    RECEBIDO: { label: 'Recebido', class: 'bg-green-100 text-green-700' },
    ERRO: { label: 'Erro', class: 'bg-red-100 text-red-700' },
};

const STATUS_ENTREGA = {
    PENDENTE: 'Pendente',
    ENTREGUE: 'Entregue',
    ENTREGUE_PARCIAL: 'Parcial',
    DEVOLVIDO: 'Devolvido',
};

const RelatorioPedidos = () => {
    const { user } = useAuth();

    const [pedidos, setPedidos] = useState([]);
    const [resumo, setResumo] = useState({});
    const [loading, setLoading] = useState(false);
    const [showFiltros, setShowFiltros] = useState(true);
    const [expandido, setExpandido] = useState(null);

    // Vendedores para filtro
    const [vendedores, setVendedores] = useState([]);

    // Filtros
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const inicioMes = hoje.slice(0, 8) + '01';
    const [dataCriacaoDe, setDataCriacaoDe] = useState(inicioMes);
    const [dataCriacaoAte, setDataCriacaoAte] = useState(hoje);
    const [dataVendaDe, setDataVendaDe] = useState('');
    const [dataVendaAte, setDataVendaAte] = useState('');
    const [vendedorId, setVendedorId] = useState('');
    const [statusEnvio, setStatusEnvio] = useState('');
    const [especial, setEspecial] = useState('');
    const [situacaoCA, setSituacaoCA] = useState('');
    const [statusEntrega, setStatusEntrega] = useState('');
    const [buscaCliente, setBuscaCliente] = useState('');

    const podeVerTodos = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';

    useEffect(() => {
        if (podeVerTodos) {
            api.get('/vendedores').then(r => setVendedores(r.data || [])).catch(() => {});
        }
    }, [podeVerTodos]);

    const fetchRelatorio = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (dataCriacaoDe) params.dataCriacaoDe = dataCriacaoDe;
            if (dataCriacaoAte) params.dataCriacaoAte = dataCriacaoAte;
            if (dataVendaDe) params.dataVendaDe = dataVendaDe;
            if (dataVendaAte) params.dataVendaAte = dataVendaAte;
            if (vendedorId) params.vendedorId = vendedorId;
            if (statusEnvio) params.statusEnvio = statusEnvio;
            if (especial) params.especial = especial;
            if (situacaoCA) params.situacaoCA = situacaoCA;
            if (statusEntrega) params.statusEntrega = statusEntrega;

            const { data } = await api.get('/pedidos/relatorio', { params });

            let resultado = data.pedidos || [];

            // Filtro local por nome de cliente
            if (buscaCliente.trim()) {
                const termo = buscaCliente.trim().toLowerCase();
                resultado = resultado.filter(p =>
                    p.clienteNome.toLowerCase().includes(termo) ||
                    p.clienteDocumento.includes(termo)
                );
            }

            setPedidos(resultado);
            setResumo(data.resumo || {});
            setShowFiltros(false);
        } catch (error) {
            toast.error('Erro ao gerar relatório.');
        } finally {
            setLoading(false);
        }
    }, [dataCriacaoDe, dataCriacaoAte, dataVendaDe, dataVendaAte, vendedorId, statusEnvio, especial, situacaoCA, statusEntrega, buscaCliente]);

    const exportarCSV = () => {
        if (pedidos.length === 0) {
            toast.error('Nenhum dado para exportar.');
            return;
        }

        const headers = [
            'Nº', 'Data Criação', 'Data Venda', 'Cliente', 'CNPJ/CPF', 'Vendedor',
            'Tipo', 'Status', 'Situação CA', 'Entrega', 'Condição Pgto',
            'Qtd Itens', 'Valor Total (R$)', 'Flex Total', 'Canal', 'Observações'
        ];

        const rows = pedidos.map(p => [
            p.especial ? `ZZ${p.numero || ''}` : (p.numero || '-'),
            new Date(p.createdAt).toLocaleDateString('pt-BR'),
            new Date(p.dataVenda).toLocaleDateString('pt-BR'),
            `"${p.clienteNome}"`,
            p.clienteDocumento,
            `"${p.vendedorNome}"`,
            p.especial ? 'Especial' : 'Normal',
            p.statusEnvio,
            p.situacaoCA || '-',
            STATUS_ENTREGA[p.statusEntrega] || p.statusEntrega || '-',
            `"${p.condicaoPagamento}"`,
            p.qtdItens,
            Number(p.valorTotal).toFixed(2).replace('.', ','),
            Number(p.flexTotal).toFixed(2).replace('.', ','),
            p.canalOrigem,
            `"${(p.observacoes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
        ]);

        const BOM = '\uFEFF';
        const csvContent = BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio-pedidos-${dataCriacaoDe || 'inicio'}-${dataCriacaoAte || 'fim'}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exportado!');
    };

    return (
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <FileText className="h-6 w-6 sm:h-7 sm:w-7 text-indigo-600 flex-shrink-0" />
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">Relatório de Pedidos</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {pedidos.length > 0 && (
                        <button
                            onClick={exportarCSV}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                        >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">CSV</span>
                        </button>
                    )}
                    <button
                        onClick={() => setShowFiltros(!showFiltros)}
                        className="flex items-center gap-1.5 px-2.5 py-2 text-sm bg-white border rounded-md hover:bg-gray-50"
                    >
                        <Filter className="h-4 w-4" />
                        <span className="hidden sm:inline">Filtros</span>
                    </button>
                </div>
            </div>

            {/* Filtros */}
            {showFiltros && (
                <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-4 mb-4 sm:mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Criação - De</label>
                            <input type="date" value={dataCriacaoDe} onChange={(e) => setDataCriacaoDe(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Criação - Até</label>
                            <input type="date" value={dataCriacaoAte} onChange={(e) => setDataCriacaoAte(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        {podeVerTodos && (
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Vendedor</label>
                                <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                    <option value="">Todos</option>
                                    {vendedores.map(v => (
                                        <option key={v.id} value={v.id}>{v.nome}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Venda - De</label>
                            <input type="date" value={dataVendaDe} onChange={(e) => setDataVendaDe(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Venda - Até</label>
                            <input type="date" value={dataVendaAte} onChange={(e) => setDataVendaAte(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Cliente</label>
                            <div className="relative mt-1">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                                <input type="text" value={buscaCliente}
                                    onChange={(e) => setBuscaCliente(e.target.value)}
                                    placeholder="Nome ou CNPJ..."
                                    className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Status Envio</label>
                            <select value={statusEnvio} onChange={(e) => setStatusEnvio(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                <option value="">Todos</option>
                                <option value="ABERTO">Aberto</option>
                                <option value="ENVIAR">Enviar</option>
                                <option value="RECEBIDO">Recebido</option>
                                <option value="ERRO">Erro</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Tipo</label>
                            <select value={especial} onChange={(e) => setEspecial(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                <option value="">Todos</option>
                                <option value="false">Normal</option>
                                <option value="true">Especial</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Situação CA</label>
                            <select value={situacaoCA} onChange={(e) => setSituacaoCA(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                <option value="">Todas</option>
                                <option value="APROVADO">Aprovado</option>
                                <option value="FATURADO">Faturado</option>
                                <option value="EM_ABERTO">Em Aberto</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Entrega</label>
                            <select value={statusEntrega} onChange={(e) => setStatusEntrega(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                <option value="">Todas</option>
                                <option value="PENDENTE">Pendente</option>
                                <option value="ENTREGUE">Entregue</option>
                                <option value="ENTREGUE_PARCIAL">Parcial</option>
                                <option value="DEVOLVIDO">Devolvido</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button
                            onClick={() => {
                                setDataCriacaoDe(inicioMes); setDataCriacaoAte(hoje);
                                setDataVendaDe(''); setDataVendaAte('');
                                setVendedorId(''); setStatusEnvio(''); setEspecial('');
                                setSituacaoCA(''); setStatusEntrega(''); setBuscaCliente('');
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
                        >
                            Limpar
                        </button>
                        <button
                            onClick={fetchRelatorio}
                            disabled={loading}
                            className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {loading ? 'Gerando...' : 'Gerar Relatório'}
                        </button>
                    </div>
                </div>
            )}

            {/* Indicadores */}
            {pedidos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                            <ShoppingCart className="h-3.5 w-3.5 text-indigo-500" />
                            <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Pedidos</span>
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-gray-900">{resumo.totalPedidos || 0}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                            <DollarSign className="h-3.5 w-3.5 text-green-500" />
                            <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Valor Total</span>
                        </div>
                        <p className="text-base sm:text-xl font-bold text-gray-900">R$ {fmt(resumo.valorTotalGeral)}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Package className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Total Itens</span>
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-gray-900">{resumo.totalItens || 0}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Ticket Médio</span>
                        </div>
                        <p className="text-base sm:text-xl font-bold text-gray-900">R$ {fmt(resumo.ticketMedio)}</p>
                    </div>
                </div>
            )}

            {/* Lista de pedidos */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3"></div>
                    Gerando relatório...
                </div>
            ) : pedidos.length === 0 ? (
                <div className="text-center text-gray-400 py-20">
                    {showFiltros ? 'Configure os filtros e clique em "Gerar Relatório".' : 'Nenhum pedido encontrado com os filtros selecionados.'}
                </div>
            ) : (
                <div className="space-y-2">
                    {/* Cabeçalho desktop */}
                    <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div className="col-span-1">Nº</div>
                        <div className="col-span-1">Criação</div>
                        <div className="col-span-3">Cliente</div>
                        <div className="col-span-2">Vendedor</div>
                        <div className="col-span-1">Status</div>
                        <div className="col-span-1">Entrega</div>
                        <div className="col-span-1 text-right">Itens</div>
                        <div className="col-span-2 text-right">Valor</div>
                    </div>

                    {pedidos.map(p => {
                        const isExpanded = expandido === p.id;
                        const badge = STATUS_ENVIO[p.statusEnvio] || STATUS_ENVIO.ABERTO;

                        return (
                            <div key={p.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                                <div
                                    className="p-3 sm:px-4 sm:py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                                    onClick={() => setExpandido(isExpanded ? null : p.id)}
                                >
                                    {/* Mobile */}
                                    <div className="sm:hidden">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-gray-900 text-sm truncate">{p.clienteNome}</p>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                        {p.especial ? 'ZZ' : ''}#{p.numero || '-'}
                                                    </span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.class}`}>
                                                        {badge.label}
                                                    </span>
                                                    {p.especial && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">ESP</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <span className="text-sm font-bold text-gray-900">R$ {fmt(p.valorTotal)}</span>
                                                {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                                            <span>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</span>
                                            <span>{p.vendedorNome}</span>
                                            <span>{p.qtdItens} itens</span>
                                        </div>
                                    </div>

                                    {/* Desktop */}
                                    <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                                        <div className="col-span-1 text-sm font-medium text-gray-700">
                                            {p.especial ? 'ZZ' : ''}{p.numero || '-'}
                                        </div>
                                        <div className="col-span-1 text-xs text-gray-500">
                                            {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                                        </div>
                                        <div className="col-span-3 text-sm text-gray-900 truncate font-medium">
                                            {p.clienteNome}
                                        </div>
                                        <div className="col-span-2 text-xs text-gray-500 truncate">
                                            {p.vendedorNome}
                                        </div>
                                        <div className="col-span-1">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.class}`}>
                                                {badge.label}
                                            </span>
                                        </div>
                                        <div className="col-span-1 text-xs text-gray-500">
                                            {STATUS_ENTREGA[p.statusEntrega] || '-'}
                                        </div>
                                        <div className="col-span-1 text-sm text-gray-700 text-right">
                                            {p.qtdItens}
                                        </div>
                                        <div className="col-span-2 text-right flex items-center justify-end gap-2">
                                            <span className="text-sm font-bold text-gray-900">R$ {fmt(p.valorTotal)}</span>
                                            {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Detalhes expandidos */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100 p-3 sm:p-4 bg-gray-50">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                            <div>
                                                <span className="text-gray-400">CNPJ/CPF</span>
                                                <p className="text-gray-700 font-medium">{p.clienteDocumento}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Condição</span>
                                                <p className="text-gray-700 font-medium">{p.condicaoPagamento}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Situação CA</span>
                                                <p className="text-gray-700 font-medium">{p.situacaoCA || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Flex Total</span>
                                                <p className={`font-medium ${p.flexTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {p.flexTotal >= 0 ? '+' : ''}{Number(p.flexTotal).toFixed(2)}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Canal</span>
                                                <p className="text-gray-700 font-medium">{p.canalOrigem}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Conta a Receber</span>
                                                <p className="text-gray-700 font-medium">{p.contaReceberStatus || '-'}</p>
                                            </div>
                                            {p.especial && (
                                                <div className="col-span-2">
                                                    <span className="text-gray-400">Tipo</span>
                                                    <p className="text-purple-700 font-medium">Pedido Especial</p>
                                                </div>
                                            )}
                                        </div>
                                        {p.observacoes && (
                                            <div className="mt-2 text-xs">
                                                <span className="text-gray-400">Obs:</span>
                                                <p className="text-gray-600 mt-0.5">{p.observacoes}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RelatorioPedidos;
