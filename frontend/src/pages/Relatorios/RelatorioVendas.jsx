import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { BarChart2, Filter, Download, Printer, ChevronUp, ChevronDown, ChevronsUpDown, X, ArrowLeft, ListFilter, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (v) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
const STORAGE_KEY = 'relatorio-vendas-v3';

const COLUNAS = [
    { id: 'data',     label: 'Data',      field: 'dataVenda',             tipo: 'data',   filtravel: false },
    { id: 'cliente',  label: 'Cliente',   field: 'clienteNome',           tipo: 'texto',  filtravel: true  },
    { id: 'valor',    label: 'Valor',     field: 'valorTotal',            tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'condicao', label: 'Condição',  field: 'nomeCondicaoPagamento', tipo: 'texto',  filtravel: true  },
    { id: 'tipo',     label: 'Tipo',      field: 'tipo',                  tipo: 'texto',  filtravel: true  },
    { id: 'cidade',   label: 'Cidade',    field: 'cidade',                tipo: 'texto',  filtravel: true  },
    { id: 'bairro',   label: 'Bairro',    field: 'bairro',                tipo: 'texto',  filtravel: true  },
    { id: 'vendedor', label: 'Vendedor',  field: 'vendedorNome',          tipo: 'texto',  filtravel: true  },
];

const TIPO_BADGE = {
    'Normal':      'bg-gray-100 text-gray-700',
    'Especial':    'bg-purple-100 text-purple-700',
    'Bonificação': 'bg-amber-100 text-amber-700',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col.id) return <ChevronsUpDown className="h-3 w-3 text-gray-300 flex-shrink-0" />;
    return sortDir === 'asc'
        ? <ChevronUp className="h-3 w-3 text-indigo-500 flex-shrink-0" />
        : <ChevronDown className="h-3 w-3 text-indigo-500 flex-shrink-0" />;
};

const salvar = (filtros) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filtros)); } catch {}
};
const carregar = () => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
};

// Dropdown de filtro por coluna (estilo Excel)
function FilterDropdown({ col, allData, selecao, onChange, onClose }) {
    const ref = useRef();
    const [busca, setBusca] = useState('');

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const todosValores = useMemo(() => {
        // Usa Map keyed por lowercase para deduplicar sem case-sensitivity, mantendo o valor original
        const map = new Map();
        allData.forEach(r => {
            const v = String(r[col.field] ?? '');
            const key = v.toLowerCase();
            if (!map.has(key)) map.set(key, v);
        });
        return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    }, [allData, col.field]);

    const valoresFiltrados = busca.trim()
        ? todosValores.filter(v => v.toLowerCase().includes(busca.toLowerCase()))
        : todosValores;

    // selecao === undefined → tudo selecionado (sem filtro)
    // selecao === Set<string (lowercase)> → apenas esses valores aparecem
    const isChecked = (val) => !selecao || selecao.has(val.toLowerCase());
    const totalSelecionados = selecao ? selecao.size : todosValores.length;
    const todosMarcados = !selecao || selecao.size >= todosValores.length;

    const toggle = (val) => {
        const atual = selecao ? new Set(selecao) : new Set(todosValores.map(v => v.toLowerCase()));
        const key = val.toLowerCase();
        atual.has(key) ? atual.delete(key) : atual.add(key);
        onChange(col.id, atual.size >= todosValores.length ? undefined : atual);
    };

    const toggleTodos = () => {
        onChange(col.id, todosMarcados ? new Set() : undefined);
    };

    return (
        <div ref={ref}
            className="absolute top-full left-0 z-[100] bg-white border border-gray-200 rounded-lg shadow-2xl w-64 mt-1 normal-case tracking-normal font-normal"
            onClick={e => e.stopPropagation()}>

            {/* Busca */}
            <div className="p-2 border-b">
                <div className="relative">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                    <input
                        autoFocus
                        type="text"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar..."
                        className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                </div>
            </div>

            {/* Selecionar todos */}
            <div className="px-3 py-1.5 border-b bg-gray-50 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={todosMarcados}
                        onChange={toggleTodos}
                        className="rounded text-indigo-600"
                    />
                    <span className="text-xs font-medium text-gray-600">Selecionar todos</span>
                </label>
                <span className="text-[10px] text-gray-400">{totalSelecionados}/{todosValores.length}</span>
            </div>

            {/* Lista de valores */}
            <div className="max-h-56 overflow-y-auto py-1">
                {valoresFiltrados.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhum resultado</p>
                )}
                {valoresFiltrados.map(val => (
                    <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isChecked(val)}
                            onChange={() => toggle(val)}
                            className="rounded text-indigo-600 flex-shrink-0"
                        />
                        <span className="text-xs text-gray-700 truncate">{val || '(vazio)'}</span>
                    </label>
                ))}
            </div>

            {/* Rodapé */}
            <div className="p-2 border-t bg-gray-50 flex justify-between">
                <button
                    onClick={() => { onChange(col.id, undefined); onClose(); }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                    Limpar
                </button>
                <button
                    onClick={onClose}
                    className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 font-medium">
                    OK
                </button>
            </div>
        </div>
    );
}

const PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');
.rv-print-container, .rv-print-container * { font-family: 'Courier Prime', 'Courier New', Courier, monospace !important; }
.rv-print-container table { width: 100%; border-collapse: collapse; margin-top: 6px; }
.rv-print-container th, .rv-print-container td { border: 1px solid #000; padding: 3px 5px; text-align: left; font-size: 9px; line-height: 1.2; color: #000; }
.rv-print-container th { background-color: #f3f4f6; font-weight: bold; }
.rv-print-container td.num { text-align: right; }
.rv-print-container h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; color: #000; text-transform: uppercase; }
.rv-print-container .sub { font-size: 9px; color: #444; margin-bottom: 6px; }
.rv-print-container tfoot td { font-weight: bold; background-color: #f3f4f6; }
@media print {
    @page { size: A4 portrait; margin: 8mm 5mm 5mm 5mm; }
    body * { visibility: hidden; }
    #rv-print-root, #rv-print-root * { visibility: visible; }
    #rv-print-root { position: absolute !important; top: 0; left: 0; width: 100% !important; background: white !important; overflow: visible !important; }
    .rv-print-scroll { padding: 0 !important; display: block !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .rv-print-container { transform: scale(1) !important; }
    .rv-print-container th, .rv-print-container td { font-size: 9px !important; padding: 3px 5px !important; line-height: 1.2 !important; color: #000 !important; border: 1px solid #000 !important; }
}
`;

export default function RelatorioVendas() {
    const { user } = useAuth();
    const saved = carregar();

    const [pedidos, setPedidos] = useState([]);
    const [resumo, setResumo] = useState({});
    const [loading, setLoading] = useState(false);
    const [showFiltros, setShowFiltros] = useState(true);
    const [showPrint, setShowPrint] = useState(false);
    const [vendedores, setVendedores] = useState([]);

    const [dataVendaDe,        setDataVendaDe]        = useState(saved.dataVendaDe        ?? '');
    const [dataVendaAte,       setDataVendaAte]       = useState(saved.dataVendaAte       ?? '');
    const [vendedorId,         setVendedorId]         = useState(saved.vendedorId         ?? '');
    const [situacaoCA,         setSituacaoCA]         = useState(saved.situacaoCA         ?? 'FATURADO');
    const [excluirBonificacao, setExcluirBonificacao] = useState(saved.excluirBonificacao ?? 'true');

    const [sortCol, setSortCol] = useState('dataVenda');
    const [sortDir, setSortDir] = useState('desc');
    const [colsVisiveis, setColsVisiveis] = useState(() => new Set(COLUNAS.map(c => c.id)));
    // filtrosAtivos: { colId: Set<string> | undefined }
    // undefined = sem filtro (tudo visível); Set = apenas esses valores
    const [filtrosAtivos, setFiltrosAtivos] = useState({});
    const [dropdownAberto, setDropdownAberto] = useState(null); // colId ou null

    const podeVerTodos = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';

    useEffect(() => {
        if (podeVerTodos) api.get('/vendedores').then(r => setVendedores(r.data || [])).catch(() => {});
    }, [podeVerTodos]);

    useEffect(() => {
        salvar({ dataVendaDe, dataVendaAte, vendedorId, situacaoCA, excluirBonificacao });
    }, [dataVendaDe, dataVendaAte, vendedorId, situacaoCA, excluirBonificacao]);

    const fetchRelatorio = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (dataVendaDe)        params.dataVendaDe        = dataVendaDe;
            if (dataVendaAte)       params.dataVendaAte       = dataVendaAte;
            if (vendedorId)         params.vendedorId         = vendedorId;
            if (situacaoCA)         params.situacaoCA         = situacaoCA;
            if (excluirBonificacao) params.excluirBonificacao = excluirBonificacao;
            const { data } = await api.get('/pedidos/relatorio-vendas', { params });
            setPedidos(data.pedidos || []);
            setResumo(data.resumo || {});
            setFiltrosAtivos({});
            setShowFiltros(false);
        } catch {
            toast.error('Erro ao gerar relatório de vendas.');
        } finally {
            setLoading(false);
        }
    }, [dataVendaDe, dataVendaAte, vendedorId, situacaoCA, excluirBonificacao]);

    const limpar = () => {
        setDataVendaDe(''); setDataVendaAte('');
        setVendedorId(''); setSituacaoCA('FATURADO'); setExcluirBonificacao('true');
        localStorage.removeItem(STORAGE_KEY);
    };

    const handleSort = (col, e) => {
        e.stopPropagation();
        if (sortCol === col.id) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col.id); setSortDir('asc'); }
    };

    const handleFiltroChange = (colId, novaSelecao) => {
        setFiltrosAtivos(prev => {
            const next = { ...prev };
            if (novaSelecao === undefined || novaSelecao === null) {
                delete next[colId];
            } else {
                next[colId] = novaSelecao;
            }
            return next;
        });
    };

    const toggleCol = (colId) => {
        setColsVisiveis(prev => {
            const next = new Set(prev);
            next.has(colId) ? next.delete(colId) : next.add(colId);
            return next;
        });
    };

    const dadosFiltrados = useMemo(() => {
        let result = [...pedidos];
        for (const [colId, selecao] of Object.entries(filtrosAtivos)) {
            if (!selecao) continue;
            const col = COLUNAS.find(c => c.id === colId);
            if (!col) continue;
            result = result.filter(row => selecao.has(String(row[col.field] ?? '').toLowerCase()));
        }
        const col = COLUNAS.find(c => c.id === sortCol);
        if (col) {
            result.sort((a, b) => {
                let va = a[col.field] ?? '';
                let vb = b[col.field] ?? '';
                if (col.tipo === 'numero') { va = Number(va); vb = Number(vb); }
                else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
                if (va < vb) return sortDir === 'asc' ? -1 : 1;
                if (va > vb) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [pedidos, filtrosAtivos, sortCol, sortDir]);

    const totalFiltrado = useMemo(
        () => dadosFiltrados.reduce((s, r) => s + Number(r.valorTotal || 0), 0),
        [dadosFiltrados]
    );

    // Chips: um por coluna com filtro ativo
    const chips = useMemo(() => Object.entries(filtrosAtivos)
        .filter(([, sel]) => sel && sel.size > 0)
        .map(([colId, sel]) => {
            const col = COLUNAS.find(c => c.id === colId);
            const total = new Set(pedidos.map(r => String(r[col?.field] ?? '').toLowerCase())).size;
            return { colId, label: col?.label || colId, qtd: sel.size, total };
        }), [filtrosAtivos, pedidos]);

    const exportarCSV = () => {
        if (!dadosFiltrados.length) { toast.error('Nenhum dado para exportar.'); return; }
        const cols = COLUNAS.filter(c => colsVisiveis.has(c.id));
        const headers = cols.map(c => c.label);
        const rows = dadosFiltrados.map(r => cols.map(c => {
            const v = r[c.field];
            if (c.tipo === 'numero') return Number(v || 0).toFixed(2).replace('.', ',');
            if (c.tipo === 'data') return fmtData(v);
            return `"${String(v ?? '').replace(/"/g, '""')}"`;
        }));
        const csv = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'relatorio-vendas.csv'; a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exportado!');
    };

    const colsAtivas = COLUNAS.filter(c => colsVisiveis.has(c.id));
    const temDados = pedidos.length > 0;

    return (
        <>
            <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-6xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className="flex items-center gap-2 min-w-0">
                        <BarChart2 className="h-6 w-6 text-indigo-600 flex-shrink-0" />
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">Relatório de Vendas</h1>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {temDados && <>
                            <button onClick={() => setShowPrint(true)}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 font-medium">
                                <Printer className="h-4 w-4" />
                                <span className="hidden sm:inline">Imprimir</span>
                            </button>
                            <button onClick={exportarCSV}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium">
                                <Download className="h-4 w-4" />
                                <span className="hidden sm:inline">CSV</span>
                            </button>
                        </>}
                        <button onClick={() => setShowFiltros(!showFiltros)}
                            className="flex items-center gap-1.5 px-2.5 py-2 text-sm bg-white border rounded-md hover:bg-gray-50">
                            <Filter className="h-4 w-4" />
                            <span className="hidden sm:inline">Filtros</span>
                        </button>
                    </div>
                </div>

                {/* Painel de filtros */}
                {showFiltros && (
                    <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-4 mb-4">
                        <div className="flex items-end gap-2 mb-3">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 font-medium">Data Venda</label>
                                <input type="date" value={dataVendaDe} onChange={e => setDataVendaDe(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                            </div>
                            <span className="text-gray-400 text-sm pb-2">até</span>
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 font-medium invisible">até</label>
                                <input type="date" value={dataVendaAte} onChange={e => setDataVendaAte(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {podeVerTodos && (
                                <div>
                                    <label className="text-xs text-gray-500 font-medium">Vendedor</label>
                                    <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                        <option value="">Todos</option>
                                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Situação CA</label>
                                <select value={situacaoCA} onChange={e => setSituacaoCA(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                    <option value="">Todas</option>
                                    <option value="FATURADO">Faturado</option>
                                    <option value="APROVADO">Aprovado</option>
                                    <option value="EM_ABERTO">Em Aberto</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Bonificações</label>
                                <select value={excluirBonificacao} onChange={e => setExcluirBonificacao(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                    <option value="true">Excluir bonificações</option>
                                    <option value="false">Incluir tudo</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={limpar} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Limpar</button>
                            <button onClick={fetchRelatorio} disabled={loading}
                                className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50">
                                {loading ? 'Gerando...' : 'Gerar Relatório'}
                            </button>
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3" />
                        Gerando relatório...
                    </div>
                )}

                {!loading && !temDados && (
                    <div className="text-center text-gray-400 py-20">
                        Configure os filtros e clique em "Gerar Relatório".
                    </div>
                )}

                {!loading && temDados && (
                    <>
                        {/* Cards resumo */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                            <div className="bg-white rounded-lg border p-3">
                                <p className="text-[10px] sm:text-xs text-gray-500">Total geral</p>
                                <p className="text-base font-bold text-gray-900">{pedidos.length} pedidos</p>
                                <p className="text-xs text-gray-500">R$ {fmt(resumo.valorTotalGeral)}</p>
                            </div>
                            <div className="bg-white rounded-lg border p-3">
                                <p className="text-[10px] sm:text-xs text-gray-500">Filtrado</p>
                                <p className="text-base font-bold text-indigo-700">{dadosFiltrados.length} pedidos</p>
                                <p className="text-xs text-indigo-500">R$ {fmt(totalFiltrado)}</p>
                            </div>
                            <div className="bg-white rounded-lg border p-3">
                                <p className="text-[10px] sm:text-xs text-gray-500">Ticket médio</p>
                                <p className="text-base font-bold text-gray-900">
                                    R$ {fmt(dadosFiltrados.length > 0 ? totalFiltrado / dadosFiltrados.length : 0)}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg border p-3">
                                <p className="text-[10px] sm:text-xs text-gray-500">Colunas / Filtros ativos</p>
                                <p className="text-base font-bold text-gray-900">{colsAtivas.length} cols · {chips.length} filtros</p>
                            </div>
                        </div>

                        {/* Toggle de colunas */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {COLUNAS.map(c => (
                                <button key={c.id} onClick={() => toggleCol(c.id)}
                                    className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                                        colsVisiveis.has(c.id)
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                    }`}>
                                    {c.label}
                                </button>
                            ))}
                        </div>

                        {/* Chips de filtros ativos por coluna */}
                        {chips.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                {chips.map(chip => (
                                    <span key={chip.colId}
                                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full font-medium">
                                        <ListFilter className="h-3 w-3" />
                                        {chip.label}: {chip.qtd} de {chip.total}
                                        <button onClick={() => handleFiltroChange(chip.colId, undefined)}
                                            className="ml-0.5 hover:text-indigo-900">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                                <button onClick={() => setFiltrosAtivos({})}
                                    className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 underline">
                                    Limpar todos
                                </button>
                            </div>
                        )}

                        {/* Tabela */}
                        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
                            <table className="w-full text-sm min-w-max">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        {colsAtivas.map(col => {
                                            const temFiltro = filtrosAtivos[col.id] && filtrosAtivos[col.id].size > 0;
                                            return (
                                                <th key={col.id}
                                                    className={`px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider select-none whitespace-nowrap relative ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                                                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                                                        {/* Sort */}
                                                        <button
                                                            onClick={(e) => handleSort(col, e)}
                                                            className="flex items-center gap-1 hover:text-indigo-700">
                                                            {col.label}
                                                            <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                                                        </button>
                                                        {/* Filtro por coluna */}
                                                        {col.filtravel && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setDropdownAberto(d => d === col.id ? null : col.id); }}
                                                                className={`ml-0.5 p-0.5 rounded transition-colors ${temFiltro ? 'text-indigo-600 bg-indigo-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                                                title={`Filtrar por ${col.label}`}>
                                                                <ListFilter className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Dropdown */}
                                                    {dropdownAberto === col.id && (
                                                        <FilterDropdown
                                                            col={col}
                                                            allData={pedidos}
                                                            selecao={filtrosAtivos[col.id]}
                                                            onChange={handleFiltroChange}
                                                            onClose={() => setDropdownAberto(null)}
                                                        />
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dadosFiltrados.map(row => (
                                        <tr key={row.id} className="hover:bg-gray-50">
                                            {colsAtivas.map(col => {
                                                const val = row[col.field];
                                                return (
                                                    <td key={col.id}
                                                        className={`px-3 py-2 text-sm whitespace-nowrap text-gray-800 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                        {col.id === 'data'  && fmtData(val)}
                                                        {col.id === 'valor' && <span className="font-semibold">R$ {fmt(val)}</span>}
                                                        {col.id === 'tipo'  && (
                                                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${TIPO_BADGE[val] || 'bg-gray-100 text-gray-700'}`}>{val}</span>
                                                        )}
                                                        {!['data','valor','tipo'].includes(col.id) && (val || '-')}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                {dadosFiltrados.length > 0 && (
                                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                                        <tr>
                                            {colsAtivas.map(col => (
                                                <td key={col.id} className={`px-3 py-2 text-xs font-semibold text-gray-700 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                    {col.id === 'data'  && `${dadosFiltrados.length} reg.`}
                                                    {col.id === 'valor' && `R$ ${fmt(totalFiltrado)}`}
                                                </td>
                                            ))}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                            {dadosFiltrados.length === 0 && (
                                <p className="text-center text-gray-400 py-10">Nenhum registro com os filtros ativos.</p>
                            )}
                        </div>

                        <p className="text-xs text-gray-400 mt-2 text-center">
                            Clique no ícone <ListFilter className="h-3 w-3 inline" /> para filtrar por coluna · Clique no nome da coluna para ordenar
                        </p>
                    </>
                )}
            </div>

            {/* Overlay de Impressão */}
            {showPrint && (
                <div id="rv-print-root" className="fixed inset-0 z-[9999] bg-gray-800 overflow-y-auto flex flex-col print:bg-white print:overflow-visible">
                    <style>{PRINT_CSS}</style>
                    <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center justify-between print:hidden flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setShowPrint(false)} className="flex items-center gap-1.5 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-700 rounded-md text-sm">
                                <ArrowLeft className="h-4 w-4" /> Voltar
                            </button>
                            <span className="text-white font-semibold text-sm flex items-center gap-2">
                                <Printer className="h-4 w-4 text-sky-400" /> Pré-visualização — Relatório de Vendas
                            </span>
                        </div>
                        <button onClick={() => window.print()} className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">
                            Imprimir / Salvar PDF
                        </button>
                    </div>
                    <div className="rv-print-scroll flex-1 flex flex-col items-center py-8 print:py-0 print:block">
                        <div className="rv-print-container bg-white text-black mx-auto shadow-2xl transform scale-[0.5] sm:scale-75 md:scale-100 origin-top"
                            style={{ width: '210mm', minHeight: '297mm', padding: '4mm 6mm' }}>
                            <h1>RELATÓRIO DE VENDAS</h1>
                            <div className="sub">
                                {[
                                    dataVendaDe && `Venda: ${fmtData(dataVendaDe)} a ${fmtData(dataVendaAte || dataVendaDe)}`,
                                    situacaoCA  && `Situação: ${situacaoCA}`,
                                    chips.length && `Filtros: ${chips.map(c => `${c.label} (${c.qtd}/${c.total})`).join(', ')}`,
                                    `Total: ${dadosFiltrados.length} pedidos · R$ ${fmt(totalFiltrado)}`
                                ].filter(Boolean).join(' | ')}
                            </div>
                            <table>
                                <thead>
                                    <tr>{colsAtivas.map(col => <th key={col.id} style={{ textAlign: col.align || 'left' }}>{col.label}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {dadosFiltrados.map(row => (
                                        <tr key={row.id}>
                                            {colsAtivas.map(col => {
                                                const val = row[col.field];
                                                return (
                                                    <td key={col.id} className={col.align === 'right' ? 'num' : ''}>
                                                        {col.id === 'data'  ? fmtData(val)
                                                        : col.id === 'valor' ? `R$ ${fmt(val)}`
                                                        : val || '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        {colsAtivas.map(col => (
                                            <td key={col.id} className={col.align === 'right' ? 'num' : ''}>
                                                {col.id === 'data'  && `${dadosFiltrados.length} registros`}
                                                {col.id === 'valor' && `R$ ${fmt(totalFiltrado)}`}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
