import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import atendimentoService from '../../services/atendimentoService';
import vendedorService from '../../services/vendedorService';
import ClientePopup from '../Rota/ClientePopup';
import {
    Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
    Calendar, User, MapPin, ArrowLeftRight, Bell, Clock,
    CheckCircle, X, Download, ChevronDown, ChevronUp,
    ClipboardList, Eye, MessageCircle, Phone, Truck
} from 'lucide-react';
import toast from 'react-hot-toast';

const TIPOS_ATENDIMENTO = [
    { value: '', label: 'Todos os tipos' },
    { value: 'VISITA', label: 'Visita' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'LIGACAO', label: 'Ligacao' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'RETORNO', label: 'Retorno' },
    { value: 'FINANCEIRO', label: 'Financeiro' },
];

const TIPO_BADGE = {
    VISITA: 'bg-purple-100 text-purple-700',
    WHATSAPP: 'bg-green-100 text-green-700',
    LIGACAO: 'bg-blue-100 text-blue-700',
    AMOSTRA: 'bg-amber-100 text-amber-700',
    RETORNO: 'bg-indigo-100 text-indigo-700',
    FINANCEIRO: 'bg-gray-100 text-gray-600',
};

const TIPO_ICON = {
    VISITA: User,
    WHATSAPP: MessageCircle,
    LIGACAO: Phone,
    AMOSTRA: Truck,
    RETORNO: Clock,
    FINANCEIRO: ClipboardList,
};

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
const fmtHora = (d) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
const fmtDataHora = (d) => d ? `${fmtData(d)} ${fmtHora(d)}` : '-';

const LS_KEY = 'painelAtendimentos_filters';

const loadFilters = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { return {}; }
};

const saveFilters = (f) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(f)); }
    catch { /* ignore */ }
};

const PainelAtendimentos = () => {
    const { user } = useAuth();
    const isAdmin = !!user?.permissoes?.admin;

    const saved = loadFilters();
    const hoje = new Date().toISOString().split('T')[0];

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [vendedores, setVendedores] = useState([]);
    const [expandedRow, setExpandedRow] = useState(null);
    const [clientePopup, setClientePopup] = useState(null);

    const [filtros, setFiltros] = useState({
        vendedorId: saved.vendedorId || '',
        tipo: saved.tipo || '',
        busca: saved.busca || '',
        dataInicio: saved.dataInicio || hoje,
        dataFim: saved.dataFim || hoje,
        page: 1,
        limit: 50,
    });

    // Carregar vendedores
    useEffect(() => {
        vendedorService.listar().then(v => {
            setVendedores(v.filter(x => x.ativo));
        }).catch(console.error);
    }, []);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (filtros.vendedorId) params.vendedorId = filtros.vendedorId;
            if (filtros.tipo) params.tipo = filtros.tipo;
            if (filtros.dataInicio) params.dataInicio = filtros.dataInicio;
            if (filtros.dataFim) params.dataFim = filtros.dataFim;
            params.page = filtros.page;
            params.limit = filtros.limit;

            const result = await atendimentoService.listarComFiltros(params);
            setData(result.data || []);
            setTotal(result.total || 0);
            setTotalPages(result.totalPages || 1);
        } catch (error) {
            console.error(error);
            toast.error('Erro ao carregar atendimentos.');
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => { carregar(); }, [carregar]);

    // Persiste filtros (exceto page)
    useEffect(() => {
        const { page, limit, ...rest } = filtros;
        saveFilters(rest);
    }, [filtros]);

    const handleFiltro = (campo, valor) => {
        setFiltros(prev => ({ ...prev, [campo]: valor, page: 1 }));
    };

    const limparFiltros = () => {
        setFiltros({
            vendedorId: '',
            tipo: '',
            busca: '',
            dataInicio: hoje,
            dataFim: hoje,
            page: 1,
            limit: 50,
        });
    };

    // Calcula a diferença em dias do período atual e navega para frente/trás
    const navegarPeriodo = (direcao) => {
        const inicio = new Date(filtros.dataInicio + 'T00:00:00');
        const fim = new Date(filtros.dataFim + 'T00:00:00');
        const diffMs = fim.getTime() - inicio.getTime();
        const diffDias = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);

        const novoInicio = new Date(inicio);
        const novoFim = new Date(fim);
        novoInicio.setDate(novoInicio.getDate() + (direcao * diffDias));
        novoFim.setDate(novoFim.getDate() + (direcao * diffDias));

        setFiltros(prev => ({
            ...prev,
            dataInicio: novoInicio.toISOString().split('T')[0],
            dataFim: novoFim.toISOString().split('T')[0],
            page: 1,
        }));
    };

    // Label legível do período
    const labelPeriodo = useMemo(() => {
        if (filtros.dataInicio === filtros.dataFim) {
            const d = new Date(filtros.dataInicio + 'T12:00:00');
            const hj = new Date().toISOString().split('T')[0];
            if (filtros.dataInicio === hj) return 'Hoje';
            const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
            if (filtros.dataInicio === ontem.toISOString().split('T')[0]) return 'Ontem';
            return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        }
        const di = new Date(filtros.dataInicio + 'T12:00:00');
        const df = new Date(filtros.dataFim + 'T12:00:00');
        return `${di.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${df.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    }, [filtros.dataInicio, filtros.dataFim]);

    // Filtro local por busca (nome cliente/lead)
    const dataFiltrada = useMemo(() => {
        if (!filtros.busca.trim()) return data;
        const termo = filtros.busca.toLowerCase();
        return data.filter(a => {
            const nomeCliente = (a.cliente?.NomeFantasia || a.cliente?.Nome || '').toLowerCase();
            const nomeLead = (a.lead?.nomeEstabelecimento || '').toLowerCase();
            const nomeVendedor = (a.vendedor?.nome || '').toLowerCase();
            const obs = (a.observacao || '').toLowerCase();
            return nomeCliente.includes(termo) || nomeLead.includes(termo) || nomeVendedor.includes(termo) || obs.includes(termo);
        });
    }, [data, filtros.busca]);

    // Resumo
    const resumo = useMemo(() => {
        const porTipo = {};
        const porVendedor = {};
        dataFiltrada.forEach(a => {
            porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
            const vn = a.vendedor?.nome || 'Sem vendedor';
            porVendedor[vn] = (porVendedor[vn] || 0) + 1;
        });
        return { porTipo, porVendedor, total: dataFiltrada.length };
    }, [dataFiltrada]);

    const exportarCSV = () => {
        if (dataFiltrada.length === 0) return;
        const headers = ['Data', 'Hora', 'Vendedor', 'Tipo', 'Cliente/Lead', 'Cidade', 'Acao', 'Observacao', 'Data Retorno', 'Assunto Retorno', 'Transferido Para', 'GPS'];
        const rows = dataFiltrada.map(a => [
            fmtData(a.criadoEm),
            fmtHora(a.criadoEm),
            a.vendedor?.nome || '',
            a.tipo || '',
            a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead?.nomeEstabelecimento || ''),
            a.cliente?.End_Cidade || '',
            a.acaoLabel || '',
            (a.observacao || '').replace(/[\n\r]/g, ' '),
            a.dataRetorno ? fmtData(a.dataRetorno) : '',
            a.assuntoRetorno || '',
            a.transferidoPara?.nome || '',
            a.gpsVendedor || '',
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atendimentos_${filtros.dataInicio}_${filtros.dataFim}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const TipoIcon = ({ tipo }) => {
        const Icon = TIPO_ICON[tipo] || ClipboardList;
        return <Icon className="h-3.5 w-3.5" />;
    };

    return (
        <div className="py-4 sm:py-6 space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <ClipboardList className="h-6 w-6 text-blue-600" />
                        Painel de Atendimentos
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {total} atendimento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={carregar} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                    <button onClick={exportarCSV} disabled={dataFiltrada.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                        <Download className="h-4 w-4" /> CSV
                    </button>
                </div>
            </div>

            {/* Navegador de período + filtros */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                {/* Linha principal: setas + período + atalhos + vendedor + tipo */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {/* Navegador de data com setas */}
                    <div className="flex items-center gap-1">
                        <button onClick={() => navegarPeriodo(-1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors" title="Periodo anterior">
                            <ChevronLeft className="h-4 w-4 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-1.5 min-w-0">
                            <input type="date" value={filtros.dataInicio} onChange={e => handleFiltro('dataInicio', e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-[130px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            <span className="text-gray-400 text-sm">-</span>
                            <input type="date" value={filtros.dataFim} onChange={e => handleFiltro('dataFim', e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-[130px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <button onClick={() => navegarPeriodo(1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors" title="Proximo periodo">
                            <ChevronRight className="h-4 w-4 text-gray-600" />
                        </button>
                        <span className="text-xs font-semibold text-gray-500 ml-1 hidden sm:inline">{labelPeriodo}</span>
                    </div>

                    {/* Atalhos de período */}
                    <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => setFiltros(prev => ({ ...prev, dataInicio: hoje, dataFim: hoje, page: 1 }))}
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${filtros.dataInicio === hoje && filtros.dataFim === hoje ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                            Hoje
                        </button>
                        <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); const o = d.toISOString().split('T')[0]; setFiltros(prev => ({ ...prev, dataInicio: o, dataFim: o, page: 1 })); }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            Ontem
                        </button>
                        <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setFiltros(prev => ({ ...prev, dataInicio: d.toISOString().split('T')[0], dataFim: hoje, page: 1 })); }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            7d
                        </button>
                        <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 30); setFiltros(prev => ({ ...prev, dataInicio: d.toISOString().split('T')[0], dataFim: hoje, page: 1 })); }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            30d
                        </button>
                    </div>

                    {/* Vendedor + Tipo inline */}
                    <div className="flex gap-2 flex-1 min-w-0">
                        <select value={filtros.vendedorId} onChange={e => handleFiltro('vendedorId', e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Todos vendedores</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                        <select value={filtros.tipo} onChange={e => handleFiltro('tipo', e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            {TIPOS_ATENDIMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Busca */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" placeholder="Buscar por cliente, lead, vendedor ou observacao..." value={filtros.busca} onChange={e => handleFiltro('busca', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    {filtros.busca && (
                        <button onClick={() => handleFiltro('busca', '')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Resumo cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{resumo.total}</p>
                    <p className="text-[11px] text-gray-500 font-medium">Total</p>
                </div>
                {Object.entries(resumo.porTipo).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tipo, count]) => (
                    <div key={tipo} className="bg-white border border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-blue-300 transition-colors"
                        onClick={() => handleFiltro('tipo', filtros.tipo === tipo ? '' : tipo)}>
                        <p className="text-2xl font-bold text-gray-900">{count}</p>
                        <p className={`text-[11px] font-semibold px-1.5 py-0.5 rounded inline-block ${TIPO_BADGE[tipo] || 'bg-gray-100 text-gray-600'}`}>{tipo}</p>
                    </div>
                ))}
            </div>

            {/* Resumo por vendedor (colapsavel) */}
            {Object.keys(resumo.porVendedor).length > 1 && (
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Por Vendedor</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(resumo.porVendedor).sort((a, b) => b[1] - a[1]).map(([nome, count]) => (
                            <span key={nome} className="inline-flex items-center gap-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                <User className="h-3 w-3 text-gray-400" />
                                <span className="font-semibold text-gray-700">{nome.split(' ')[0]}</span>
                                <span className="font-bold text-blue-600">{count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabela Desktop */}
            <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                        <colgroup>
                            <col className="w-[100px]" />
                            <col className="w-[90px]" />
                            <col className="w-[100px]" />
                            <col className="w-[20%]" />
                            <col className="w-[90px]" />
                            <col className="w-[120px]" />
                            <col className="w-[30%]" />
                            <col className="w-[100px]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Data/Hora</th>
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Vendedor</th>
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Tipo</th>
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Cliente / Lead</th>
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Cidade</th>
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Ação</th>
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Observação</th>
                                <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Retorno</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading && (
                                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Carregando...</td></tr>
                            )}
                            {!loading && dataFiltrada.length === 0 && (
                                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Nenhum atendimento encontrado.</td></tr>
                            )}
                            {!loading && dataFiltrada.map(a => {
                                const nomeItem = a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead ? `Lead #${a.lead.numero} - ${a.lead.nomeEstabelecimento}` : '-');
                                const isExpanded = expandedRow === a.id;
                                return (
                                    <React.Fragment key={a.id}>
                                        <tr className={`hover:bg-gray-50 cursor-pointer transition-colors ${a.transferidoParaId ? 'bg-indigo-50/30' : ''} ${a.alertaVisualAtivo ? 'bg-amber-50/30' : ''}`}
                                            onClick={() => setExpandedRow(isExpanded ? null : a.id)}>
                                            <td className="px-3 py-2.5">
                                                <div className="text-xs font-medium text-gray-900">{fmtData(a.criadoEm)}</div>
                                                <div className="text-[11px] text-gray-500">{fmtHora(a.criadoEm)}</div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className="text-xs font-medium text-gray-700">{a.vendedor?.nome?.split(' ')[0] || '-'}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${TIPO_BADGE[a.tipo] || 'bg-gray-100 text-gray-600'}`}>
                                                    <TipoIcon tipo={a.tipo} /> {a.tipo}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (a.cliente) setClientePopup(a.cliente);
                                                        else if (a.lead) setClientePopup(a.lead);
                                                    }}
                                                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 text-left w-full line-clamp-2 leading-tight"
                                                    title={nomeItem}
                                                >
                                                    {nomeItem}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-gray-500 truncate">
                                                {a.cliente?.End_Cidade || '-'}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {a.acaoLabel ? (
                                                    <span className="text-[10px] font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded block truncate">{a.acaoLabel}</span>
                                                ) : <span className="text-xs text-gray-400">-</span>}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <p className="text-xs text-gray-600 line-clamp-2 leading-tight">{a.observacao || <span className="text-gray-400">-</span>}</p>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {a.dataRetorno ? (
                                                    <div>
                                                        <div className="text-[11px] font-semibold text-amber-700">{fmtData(a.dataRetorno)}</div>
                                                        {a.assuntoRetorno && <div className="text-[10px] text-gray-500 line-clamp-1">{a.assuntoRetorno}</div>}
                                                    </div>
                                                ) : <span className="text-xs text-gray-400">-</span>}
                                            </td>
                                        </tr>
                                        {/* Expanded row details */}
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={8} className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                                        {a.observacao && (
                                                            <div className="lg:col-span-2">
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Observacao</p>
                                                                <p className="text-gray-700 whitespace-pre-wrap bg-white rounded-lg border border-gray-200 p-3">{a.observacao}</p>
                                                            </div>
                                                        )}
                                                        <div className="space-y-2">
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Vendedor completo</p>
                                                                <p className="text-gray-700">{a.vendedor?.nome || '-'}</p>
                                                            </div>
                                                            {a.transferidoParaId && (
                                                                <div>
                                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Transferido para</p>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-500" />
                                                                        <span className="text-indigo-700 font-semibold">{a.transferidoPara?.nome || '-'}</span>
                                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.transferenciaFinalizada ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                            {a.transferenciaFinalizada ? 'Finalizada' : 'Pendente'}
                                                                        </span>
                                                                    </div>
                                                                    {a.transferenciaFinalizadaEm && (
                                                                        <p className="text-[11px] text-gray-500 mt-0.5">Finalizada em {fmtDataHora(a.transferenciaFinalizadaEm)}</p>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {a.dataRetorno && (
                                                                <div>
                                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Retorno</p>
                                                                    <p className="text-amber-700 font-semibold">{fmtData(a.dataRetorno)}</p>
                                                                    {a.assuntoRetorno && <p className="text-gray-600 text-[12px]">{a.assuntoRetorno}</p>}
                                                                </div>
                                                            )}
                                                            {a.alertaVisualAtivo && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Bell className="h-3.5 w-3.5" style={{ color: a.alertaVisualCor || '#ef4444' }} />
                                                                    <span className="text-[12px] font-semibold" style={{ color: a.alertaVisualCor || '#ef4444' }}>
                                                                        Alerta visual {a.alertaVisualVisto ? '(visto)' : '(ativo)'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {a.gpsVendedor && (
                                                                <div>
                                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">GPS</p>
                                                                    <button onClick={() => {
                                                                        const [lat, lng] = a.gpsVendedor.split(',');
                                                                        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                                                                    }} className="text-blue-600 hover:text-blue-800 text-[12px] font-semibold flex items-center gap-1">
                                                                        <MapPin className="h-3 w-3" /> Ver no mapa
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {a.amostra && (
                                                                <div>
                                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Amostra</p>
                                                                    <p className="text-gray-700">#{a.amostra.numero} - {a.amostra.status}</p>
                                                                </div>
                                                            )}
                                                            {a.etapaNova && (
                                                                <div>
                                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Etapa</p>
                                                                    <p className="text-gray-700">{a.etapaAnterior || '?'} &rarr; {a.etapaNova}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cards Mobile */}
            <div className="md:hidden space-y-2">
                {loading && <div className="text-center py-12 text-gray-400">Carregando...</div>}
                {!loading && dataFiltrada.length === 0 && <div className="text-center py-12 text-gray-400">Nenhum atendimento encontrado.</div>}
                {!loading && dataFiltrada.map(a => {
                    const nomeItem = a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead ? `Lead #${a.lead.numero} - ${a.lead.nomeEstabelecimento}` : '-');
                    const isExpanded = expandedRow === a.id;
                    return (
                        <div key={a.id} className={`bg-white border rounded-xl overflow-hidden ${a.transferidoParaId ? 'border-indigo-200' : 'border-gray-200'}`}>
                            <button className="w-full text-left p-3 space-y-2" onClick={() => setExpandedRow(isExpanded ? null : a.id)}>
                                {/* Top row: vendedor + tipo + data */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0">
                                            {a.vendedor?.nome?.split(' ')[0] || '?'}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${TIPO_BADGE[a.tipo] || 'bg-gray-100 text-gray-600'}`}>
                                            <TipoIcon tipo={a.tipo} /> {a.tipo}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-gray-500 shrink-0">{fmtData(a.criadoEm)} {fmtHora(a.criadoEm)}</span>
                                </div>
                                {/* Nome do cliente */}
                                <p className="text-sm font-bold text-gray-900 truncate">{nomeItem}</p>
                                {a.cliente?.End_Cidade && <p className="text-[11px] text-gray-500">{a.cliente.End_Cidade}</p>}
                                {/* Acao + obs preview */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    {a.acaoLabel && <span className="text-[10px] font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{a.acaoLabel}</span>}
                                    {a.transferidoParaId && (
                                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                            <ArrowLeftRight className="h-2.5 w-2.5" /> {a.transferidoPara?.nome?.split(' ')[0] || '?'}
                                        </span>
                                    )}
                                    {a.dataRetorno && (
                                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                            <Clock className="h-2.5 w-2.5" /> {fmtData(a.dataRetorno)}
                                        </span>
                                    )}
                                </div>
                                {a.observacao && <p className="text-[12px] text-gray-500 line-clamp-2">{a.observacao}</p>}
                            </button>
                            {/* Expanded details mobile */}
                            {isExpanded && (
                                <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2 text-sm">
                                    {a.observacao && (
                                        <div>
                                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Observacao completa</p>
                                            <p className="text-gray-700 whitespace-pre-wrap bg-white rounded-lg border p-2 text-[12px]">{a.observacao}</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase">Vendedor</p>
                                            <p className="text-[12px] text-gray-700">{a.vendedor?.nome || '-'}</p>
                                        </div>
                                        {a.transferidoParaId && (
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase">Transferido para</p>
                                                <p className="text-[12px] text-indigo-700 font-semibold">{a.transferidoPara?.nome || '-'}</p>
                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${a.transferenciaFinalizada ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {a.transferenciaFinalizada ? 'Finalizada' : 'Pendente'}
                                                </span>
                                            </div>
                                        )}
                                        {a.dataRetorno && (
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase">Retorno</p>
                                                <p className="text-[12px] text-amber-700 font-semibold">{fmtData(a.dataRetorno)}</p>
                                                {a.assuntoRetorno && <p className="text-[11px] text-gray-500">{a.assuntoRetorno}</p>}
                                            </div>
                                        )}
                                        {a.gpsVendedor && (
                                            <div>
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    const [lat, lng] = a.gpsVendedor.split(',');
                                                    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                                                }} className="text-blue-600 text-[11px] font-semibold flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" /> Ver GPS
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {a.etapaNova && (
                                        <p className="text-[11px] text-gray-600">Etapa: {a.etapaAnterior || '?'} &rarr; {a.etapaNova}</p>
                                    )}
                                    {/* Botao ver cliente */}
                                    <button onClick={() => {
                                        if (a.cliente) setClientePopup(a.cliente);
                                        else if (a.lead) setClientePopup(a.lead);
                                    }} className="w-full text-center text-[12px] font-semibold text-blue-600 bg-blue-50 rounded-lg py-1.5 hover:bg-blue-100 transition-colors">
                                        <Eye className="h-3.5 w-3.5 inline mr-1" /> Ver detalhes do cliente
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Paginacao */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-500">
                        Pagina {filtros.page} de {totalPages} ({total} registro{total !== 1 ? 's' : ''})
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setFiltros(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                            disabled={filtros.page <= 1}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button onClick={() => setFiltros(prev => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                            disabled={filtros.page >= totalPages}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Popup de Cliente */}
            {clientePopup && (
                <ClientePopup
                    cliente={clientePopup}
                    onClose={() => setClientePopup(null)}
                />
            )}
        </div>
    );
};

export default PainelAtendimentos;
