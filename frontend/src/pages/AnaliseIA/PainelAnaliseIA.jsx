import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import iaLogService from '../../services/iaLogService';
import vendedorService from '../../services/vendedorService';
import {
    Search, RefreshCw, ChevronLeft, ChevronRight,
    ChevronDown, ChevronUp, Sparkles, CheckCircle, XCircle,
    Zap, Clock, Hash, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

const DISPARADO_POR_OPTIONS = [
    { value: '', label: 'Todos os disparos' },
    { value: 'ATENDIMENTO', label: 'Atendimento' },
    { value: 'NOTURNO', label: 'Noturno (scheduler)' },
    { value: 'MANUAL', label: 'Manual (admin)' },
];

const DISPARADO_BADGE = {
    ATENDIMENTO: 'bg-purple-100 text-purple-700',
    NOTURNO:     'bg-blue-100 text-blue-700',
    MANUAL:      'bg-amber-100 text-amber-700',
};

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
const fmtHora = (d) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
const fmtDuracao = (ms) => {
    if (ms == null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
};

const LS_KEY = 'painelAnaliseIA_filters';
const loadFilters = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } };
const saveFilters = (f) => { try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch { /* ignore */ } };

// ─── Componente de aba expandida ────────────────────────────────────────────
const DetalhesLog = ({ log }) => {
    const [aba, setAba] = useState('resposta');

    const JsonBlock = ({ data }) => (
        <pre className="text-xs text-left font-mono bg-gray-950 text-green-300 rounded-lg p-4 overflow-auto max-h-80 whitespace-pre-wrap break-words">
            {JSON.stringify(data, null, 2)}
        </pre>
    );

    return (
        <div className="bg-gray-50 border-t border-gray-200 p-4 space-y-3">
            {/* Abas */}
            <div className="flex gap-1 border-b border-gray-200 pb-0">
                {[
                    { key: 'resposta', label: 'Resposta da IA' },
                    { key: 'prompt',   label: 'Prompt enviado' },
                    { key: 'dados',    label: 'Dados de entrada' },
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setAba(key)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
                            aba === key
                                ? 'border-violet-500 text-violet-700 bg-white'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Conteúdo */}
            {aba === 'resposta' && (
                log.sucesso && log.respostaIa ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Object.entries(log.respostaIa).map(([chave, valor]) => (
                            <div key={chave} className="bg-white border border-gray-200 rounded-lg p-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{chave}</p>
                                <p className="text-sm text-gray-800">{valor}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-600 mb-1">Erro</p>
                        <p className="text-sm text-red-800 font-mono">{log.erroMsg || 'Sem detalhes'}</p>
                    </div>
                )
            )}

            {aba === 'prompt' && (
                <pre className="text-xs font-mono bg-gray-950 text-yellow-200 rounded-lg p-4 overflow-auto max-h-80 whitespace-pre-wrap break-words">
                    {log.promptEnviado}
                </pre>
            )}

            {aba === 'dados' && (
                <JsonBlock data={log.dadosEntrada} />
            )}

            {/* Metadados */}
            <div className="flex flex-wrap gap-3 pt-1 text-xs text-gray-500">
                <span>Modelo: <strong>{log.modelo}</strong></span>
                {log.tokensTotal != null && (
                    <span>Tokens: <strong>{log.tokensPrompt}p + {log.tokensResposta}r = {log.tokensTotal} total</strong></span>
                )}
                {log.duracaoMs != null && (
                    <span>Duração: <strong>{fmtDuracao(log.duracaoMs)}</strong></span>
                )}
                {log.atendimentoId && (
                    <span>Atendimento ID: <strong>#{log.atendimentoId}</strong></span>
                )}
            </div>
        </div>
    );
};

// ─── Página principal ────────────────────────────────────────────────────────
const PainelAnaliseIA = () => {
    const { user } = useAuth();
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const saved = loadFilters();

    const [data, setData] = useState([]);
    const [resumo, setResumo] = useState({ total: 0, sucesso: 0, erro: 0, tokensTotal: 0, duracaoMedia: null });
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [vendedores, setVendedores] = useState([]);
    const [expandedRow, setExpandedRow] = useState(null);

    const [filtros, setFiltros] = useState({
        dataInicio:  saved.dataInicio  || hoje,
        dataFim:     saved.dataFim     || hoje,
        vendedorId:  saved.vendedorId  || '',
        disparadoPor: saved.disparadoPor || '',
        sucesso:     saved.sucesso     || '',
        busca:       saved.busca       || '',
        page: 1,
        limit: 50,
    });

    useEffect(() => {
        vendedorService.listar().then(v => setVendedores(v.filter(x => x.ativo))).catch(console.error);
    }, []);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = { ...filtros };
            if (!params.vendedorId)   delete params.vendedorId;
            if (!params.disparadoPor) delete params.disparadoPor;
            if (params.sucesso === '') delete params.sucesso;
            if (!params.busca)        delete params.busca;

            const result = await iaLogService.listar(params);
            setData(result.data || []);
            setTotal(result.total || 0);
            setTotalPages(result.totalPages || 1);
            if (result.resumo) setResumo(result.resumo);
        } catch (err) {
            console.error(err);
            toast.error('Erro ao carregar logs de análise da IA.');
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => { carregar(); }, [carregar]);

    useEffect(() => {
        const { page, limit, ...rest } = filtros;
        saveFilters(rest);
    }, [filtros]);

    const handleFiltro = (campo, valor) => {
        setFiltros(prev => ({ ...prev, [campo]: valor, page: 1 }));
    };

    const limparFiltros = () => {
        setFiltros({ dataInicio: hoje, dataFim: hoje, vendedorId: '', disparadoPor: '', sucesso: '', busca: '', page: 1, limit: 50 });
    };

    const navegarPeriodo = (dir) => {
        const inicio = new Date(filtros.dataInicio + 'T00:00:00');
        const fim = new Date(filtros.dataFim + 'T00:00:00');
        const dias = Math.max(1, Math.round((fim - inicio) / 86400000) + 1);
        inicio.setDate(inicio.getDate() + dir * dias);
        fim.setDate(fim.getDate() + dir * dias);
        setFiltros(prev => ({
            ...prev,
            dataInicio: inicio.toISOString().split('T')[0],
            dataFim: fim.toISOString().split('T')[0],
            page: 1,
        }));
    };

    const labelPeriodo = useMemo(() => {
        if (filtros.dataInicio === filtros.dataFim) {
            if (filtros.dataInicio === hoje) return 'Hoje';
            const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
            if (filtros.dataInicio === ontem.toISOString().split('T')[0]) return 'Ontem';
            return new Date(filtros.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        }
        const di = new Date(filtros.dataInicio + 'T12:00:00');
        const df = new Date(filtros.dataFim + 'T12:00:00');
        return `${di.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${df.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    }, [filtros.dataInicio, filtros.dataFim, hoje]);

    const nomeCliente = (log) =>
        log.cliente?.NomeFantasia || log.cliente?.Nome || log.clienteId;

    const toggleRow = (id) => setExpandedRow(prev => prev === id ? null : id);

    return (
        <div className="py-4 sm:py-6 space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-violet-600" />
                        Análise da IA
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {total} análise{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
                    </p>
                </div>
                <button onClick={carregar} disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 self-start sm:self-auto">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
            </div>

            {/* Cards de resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
                    <p className="text-xs text-gray-500 font-medium">Total de análises</p>
                    <p className="text-2xl font-bold text-gray-900">{resumo.total}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        <p className="text-xs text-gray-500 font-medium">Sucesso</p>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{resumo.sucesso}</p>
                    {resumo.erro > 0 && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> {resumo.erro} erro{resumo.erro !== 1 ? 's' : ''}
                        </p>
                    )}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-violet-600" />
                        <p className="text-xs text-gray-500 font-medium">Tokens consumidos</p>
                    </div>
                    <p className="text-2xl font-bold text-violet-700">
                        {resumo.tokensTotal >= 1000
                            ? `${(resumo.tokensTotal / 1000).toFixed(1)}k`
                            : resumo.tokensTotal}
                    </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blue-600" />
                        <p className="text-xs text-gray-500 font-medium">Duração média</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{fmtDuracao(resumo.duracaoMedia)}</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {/* Seletor de data */}
                    <div className="flex items-center gap-1">
                        <button onClick={() => navegarPeriodo(-1)}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                            <ChevronLeft className="h-4 w-4 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-1.5">
                            <input type="date" value={filtros.dataInicio} onChange={e => handleFiltro('dataInicio', e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-[130px] focus:ring-2 focus:ring-violet-500 focus:border-violet-500" />
                            <span className="text-gray-400 text-sm">-</span>
                            <input type="date" value={filtros.dataFim} onChange={e => handleFiltro('dataFim', e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-[130px] focus:ring-2 focus:ring-violet-500 focus:border-violet-500" />
                        </div>
                        <button onClick={() => navegarPeriodo(1)}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                            <ChevronRight className="h-4 w-4 text-gray-600" />
                        </button>
                        <span className="text-xs font-semibold text-gray-500 ml-1 hidden sm:inline">{labelPeriodo}</span>
                    </div>

                    {/* Atalhos */}
                    <div className="flex gap-1.5 flex-wrap">
                        {[
                            { label: 'Hoje', fn: () => setFiltros(p => ({ ...p, dataInicio: hoje, dataFim: hoje, page: 1 })) },
                            { label: 'Ontem', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); const o = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); setFiltros(p => ({ ...p, dataInicio: o, dataFim: o, page: 1 })); } },
                            { label: '7d', fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); setFiltros(p => ({ ...p, dataInicio: d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), dataFim: hoje, page: 1 })); } },
                            { label: '30d', fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); setFiltros(p => ({ ...p, dataInicio: d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), dataFim: hoje, page: 1 })); } },
                        ].map(({ label, fn }) => (
                            <button key={label} onClick={fn}
                                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                                    label === 'Hoje' && filtros.dataInicio === hoje && filtros.dataFim === hoje
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                }`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Selects */}
                    <div className="flex gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                        <select value={filtros.vendedorId} onChange={e => handleFiltro('vendedorId', e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
                            <option value="">Todos vendedores</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                        <select value={filtros.disparadoPor} onChange={e => handleFiltro('disparadoPor', e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
                            {DISPARADO_POR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select value={filtros.sucesso} onChange={e => handleFiltro('sucesso', e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
                            <option value="">Todos status</option>
                            <option value="true">Sucesso</option>
                            <option value="false">Erro</option>
                        </select>
                    </div>
                </div>

                {/* Busca */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" placeholder="Buscar por nome do cliente..."
                        value={filtros.busca} onChange={e => handleFiltro('busca', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500" />
                </div>
            </div>

            {/* Tabela — Desktop */}
            <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data/Hora</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Disparo</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tokens</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duração</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading && data.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                                    Carregando...
                                </td>
                            </tr>
                        )}
                        {!loading && data.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                    <Sparkles className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                    Nenhuma análise encontrada para o período selecionado
                                </td>
                            </tr>
                        )}
                        {data.map(log => (
                            <React.Fragment key={log.id}>
                                <tr
                                    onClick={() => toggleRow(log.id)}
                                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${expandedRow === log.id ? 'bg-violet-50' : ''}`}
                                >
                                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                        <div>{fmtData(log.criadoEm)}</div>
                                        <div className="text-xs text-gray-400">{fmtHora(log.criadoEm)}</div>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                                        {nomeCliente(log)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">
                                        {log.vendedorId ? (
                                            vendedores.find(v => v.id === log.vendedorId)?.nome || log.vendedorId
                                        ) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${DISPARADO_BADGE[log.disparadoPor] || 'bg-gray-100 text-gray-600'}`}>
                                            {log.disparadoPor}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-gray-600 font-mono">
                                        {log.tokensTotal ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-gray-600">
                                        {fmtDuracao(log.duracaoMs)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {log.sucesso ? (
                                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                        ) : (
                                            <XCircle className="h-4 w-4 text-red-500 mx-auto" title={log.erroMsg} />
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400">
                                        {expandedRow === log.id
                                            ? <ChevronUp className="h-4 w-4" />
                                            : <ChevronDown className="h-4 w-4" />}
                                    </td>
                                </tr>
                                {expandedRow === log.id && (
                                    <tr>
                                        <td colSpan={8} className="p-0">
                                            <DetalhesLog log={log} />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Cards — Mobile */}
            <div className="sm:hidden space-y-2">
                {loading && data.length === 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Carregando...
                    </div>
                )}
                {!loading && data.length === 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
                        Nenhuma análise encontrada
                    </div>
                )}
                {data.map(log => (
                    <div key={log.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <button
                            className="w-full p-4 text-left space-y-2"
                            onClick={() => toggleRow(log.id)}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">{nomeCliente(log)}</p>
                                    <p className="text-xs text-gray-400">{fmtData(log.criadoEm)} {fmtHora(log.criadoEm)}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {log.sucesso
                                        ? <CheckCircle className="h-4 w-4 text-green-500" />
                                        : <XCircle className="h-4 w-4 text-red-500" />}
                                    {expandedRow === log.id
                                        ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                        : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${DISPARADO_BADGE[log.disparadoPor] || 'bg-gray-100 text-gray-600'}`}>
                                    {log.disparadoPor}
                                </span>
                                {log.tokensTotal != null && (
                                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                                        {log.tokensTotal} tokens
                                    </span>
                                )}
                                <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                                    {fmtDuracao(log.duracaoMs)}
                                </span>
                            </div>
                        </button>
                        {expandedRow === log.id && <DetalhesLog log={log} />}
                    </div>
                ))}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-500">
                        Página {filtros.page} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleFiltro('page', Math.max(1, filtros.page - 1))}
                            disabled={filtros.page <= 1}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                            <ChevronLeft className="h-4 w-4" /> Anterior
                        </button>
                        <button
                            onClick={() => handleFiltro('page', Math.min(totalPages, filtros.page + 1))}
                            disabled={filtros.page >= totalPages}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                            Próxima <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PainelAnaliseIA;
