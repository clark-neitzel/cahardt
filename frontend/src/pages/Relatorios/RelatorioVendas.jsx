import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { BarChart2, Filter, Download, Printer, ChevronUp, ChevronDown, ChevronsUpDown, X, ArrowLeft, ListFilter, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (v) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
const STORAGE_KEY = 'relatorio-vendas-v6';

const COLUNAS = [
    { id: 'criacao',  label: 'Criação',   field: 'dataCriacao',           tipo: 'data',   filtravel: false },
    { id: 'data',     label: 'Dt Venda',  field: 'dataVenda',             tipo: 'data',   filtravel: false },
    { id: 'cliente',   label: 'Cliente',   field: 'clienteNome',           tipo: 'texto',  filtravel: true  },
    { id: 'produto',   label: 'Produto',   field: 'produto',               tipo: 'texto',  filtravel: true  },
    { id: 'quantidade',label: 'Qtd',       field: 'quantidade',            tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'valorUnit', label: 'Vl Unit',   field: 'valorUnit',             tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'valor',     label: 'Valor',     field: 'valorTotal',            tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'precoCusto',label: 'Vl Custo',  field: 'precoCusto',            tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'custoTotal',label: 'Custo Total',field: 'custoTotal',           tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'condicao', label: 'Condição',  field: 'nomeCondicaoPagamento', tipo: 'texto',  filtravel: true  },
    { id: 'categoria',label: 'Categoria', field: 'categoriaComercial',    tipo: 'texto',  filtravel: true  },
    { id: 'tipo',     label: 'Tipo',      field: 'tipo',                  tipo: 'texto',  filtravel: true  },
    { id: 'cidade',   label: 'Cidade',    field: 'cidade',                tipo: 'texto',  filtravel: true  },
    { id: 'bairro',   label: 'Bairro',    field: 'bairro',                tipo: 'texto',  filtravel: true  },
    { id: 'vendedor', label: 'Vendedor',  field: 'vendedorNome',          tipo: 'texto',  filtravel: true  },
    { id: 'vendedorTel', label: 'Tel Vendedor', field: 'vendedorTelefone', tipo: 'texto', filtravel: false },
    { id: 'indicacao',label: 'Indicação', field: 'indicacao',             tipo: 'texto',  filtravel: true  },
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
// Usa estado local pendente — só aplica o filtro ao clicar OK (evita salto de layout durante seleção)
function FilterDropdown({ col, allData, selecao, onChange, onClose }) {
    const ref = useRef();
    const [busca, setBusca] = useState('');

    const todosValores = useMemo(() => {
        const map = new Map();
        allData.forEach(r => {
            const v = String(r[col.field] ?? '');
            const key = v.toLowerCase();
            if (!map.has(key)) map.set(key, v);
        });
        return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    }, [allData, col.field]);

    // Estado local — não afeta a tabela até clicar OK
    const [pendente, setPendente] = useState(() =>
        selecao ? new Set(selecao) : new Set(todosValores.map(v => v.toLowerCase()))
    );

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                // Fechar sem aplicar (clique fora = cancela)
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const valoresFiltrados = busca.trim()
        ? todosValores.filter(v => v.toLowerCase().includes(busca.toLowerCase()))
        : todosValores;

    const todosMarcados = pendente.size >= todosValores.length;

    const toggle = (val) => {
        const next = new Set(pendente);
        const key = val.toLowerCase();
        next.has(key) ? next.delete(key) : next.add(key);
        setPendente(next);
    };

    const toggleTodos = () => {
        setPendente(todosMarcados
            ? new Set()
            : new Set(todosValores.map(v => v.toLowerCase()))
        );
    };

    const aplicar = () => {
        onChange(col.id, pendente.size >= todosValores.length ? undefined : pendente);
        onClose();
    };

    const limpar = () => {
        onChange(col.id, undefined);
        onClose();
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
                <span className="text-[10px] text-gray-400">{pendente.size}/{todosValores.length}</span>
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
                            checked={pendente.has(val.toLowerCase())}
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
                    onClick={limpar}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                    Limpar
                </button>
                <button
                    onClick={aplicar}
                    className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 font-medium">
                    OK
                </button>
            </div>
        </div>
    );
}

// Multi-seleção para o painel principal (Condição de Pagamento, Categoria Comercial).
// As opções vêm dos dados já carregados — garante que casam exatamente com a tabela.
// Aplica direto no mesmo estado dos filtros de coluna (instantâneo, sem recarregar).
function MultiSelectFiltro({ options, selecao, onChange, placeholderVazio }) {
    const ref = useRef();
    const [aberto, setAberto] = useState(false);
    const [busca, setBusca] = useState('');

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const todosMarcados = !selecao || selecao.size >= options.length;
    const qtdSel = selecao ? selecao.size : options.length;

    const visiveis = busca.trim()
        ? options.filter(v => v.toLowerCase().includes(busca.toLowerCase()))
        : options;

    const toggle = (val) => {
        const base = selecao ? new Set(selecao) : new Set(options.map(v => v.toLowerCase()));
        const key = val.toLowerCase();
        base.has(key) ? base.delete(key) : base.add(key);
        onChange(base.size >= options.length ? undefined : base);
    };

    const toggleTodos = () => onChange(todosMarcados ? new Set() : undefined);

    const resumo = options.length === 0
        ? (placeholderVazio || 'Sem opções')
        : todosMarcados ? 'Todas' : qtdSel === 0 ? 'Nenhuma' : `${qtdSel} de ${options.length}`;

    return (
        <div className="relative" ref={ref}>
            <button type="button"
                onClick={() => options.length && setAberto(a => !a)}
                disabled={options.length === 0}
                className={`w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-left flex items-center justify-between gap-2 ${options.length === 0 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-900 hover:border-gray-400'}`}>
                <span className="truncate">{resumo}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
            </button>
            {aberto && options.length > 0 && (
                <div className="absolute top-full left-0 z-[100] bg-white border border-gray-200 rounded-lg shadow-2xl w-full min-w-[14rem] mt-1">
                    <div className="p-2 border-b">
                        <div className="relative">
                            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                            <input autoFocus type="text" value={busca} onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar..."
                                className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </div>
                    </div>
                    <div className="px-3 py-1.5 border-b bg-gray-50 flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} className="rounded text-indigo-600" />
                            <span className="text-xs font-medium text-gray-600">Selecionar todas</span>
                        </label>
                        <span className="text-[10px] text-gray-400">{qtdSel}/{options.length}</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                        {visiveis.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhum resultado</p>}
                        {visiveis.map(val => (
                            <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 cursor-pointer">
                                <input type="checkbox"
                                    checked={!selecao || selecao.has(val.toLowerCase())}
                                    onChange={() => toggle(val)}
                                    className="rounded text-indigo-600 flex-shrink-0" />
                                <span className="text-xs text-gray-700 truncate">{val || '(vazio)'}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
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
    const [dataCriacaoDe,      setDataCriacaoDe]      = useState(saved.dataCriacaoDe      ?? '');
    const [dataCriacaoAte,     setDataCriacaoAte]     = useState(saved.dataCriacaoAte     ?? '');
    const [vendedorId,         setVendedorId]         = useState(saved.vendedorId         ?? '');
    const [situacaoCA,         setSituacaoCA]         = useState(saved.situacaoCA         ?? 'FATURADO');
    const [excluirBonificacao, setExcluirBonificacao] = useState(saved.excluirBonificacao ?? 'true');

    const [sortCol, setSortCol] = useState('dataVenda');
    const [sortDir, setSortDir] = useState('desc');
    const [colsVisiveis, setColsVisiveis] = useState(() => new Set(COLUNAS.map(c => c.id)));
    const [colOrdem, setColOrdem] = useState(() => COLUNAS.map(c => c.id));
    const [filtrosAtivos, setFiltrosAtivos] = useState(() => {
        const fa = saved.filtrosAtivos;
        if (!fa || typeof fa !== 'object') return {};
        const out = {};
        for (const [k, arr] of Object.entries(fa)) {
            if (Array.isArray(arr) && arr.length) out[k] = new Set(arr);
        }
        return out;
    });
    const [dropdownAberto, setDropdownAberto] = useState(null);
    const dragColRef = useRef(null);

    const podeVerTodos = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';

    useEffect(() => {
        if (podeVerTodos) api.get('/vendedores').then(r => setVendedores(r.data || [])).catch(() => {});
    }, [podeVerTodos]);

    useEffect(() => {
        const fa = {};
        for (const [k, set] of Object.entries(filtrosAtivos)) {
            if (set && set.size) fa[k] = [...set];
        }
        salvar({ dataVendaDe, dataVendaAte, dataCriacaoDe, dataCriacaoAte, vendedorId, situacaoCA, excluirBonificacao, filtrosAtivos: fa });
    }, [dataVendaDe, dataVendaAte, dataCriacaoDe, dataCriacaoAte, vendedorId, situacaoCA, excluirBonificacao, filtrosAtivos]);

    const fetchRelatorio = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (dataVendaDe)        params.dataVendaDe        = dataVendaDe;
            if (dataVendaAte)       params.dataVendaAte       = dataVendaAte;
            if (dataCriacaoDe)      params.dataCriacaoDe      = dataCriacaoDe;
            if (dataCriacaoAte)     params.dataCriacaoAte     = dataCriacaoAte;
            if (vendedorId)         params.vendedorId         = vendedorId;
            if (situacaoCA)         params.situacaoCA         = situacaoCA;
            if (excluirBonificacao) params.excluirBonificacao = excluirBonificacao;
            const { data } = await api.get('/pedidos/relatorio-vendas', { params });
            setPedidos(data.pedidos || []);
            setResumo(data.resumo || {});
            // mantém a seleção de filtros do usuário (não zera ao gerar de novo)
            setShowFiltros(false);
        } catch {
            toast.error('Erro ao gerar relatório de vendas.');
        } finally {
            setLoading(false);
        }
    }, [dataVendaDe, dataVendaAte, dataCriacaoDe, dataCriacaoAte, vendedorId, situacaoCA, excluirBonificacao]);

    const limpar = () => {
        setDataVendaDe(''); setDataVendaAte('');
        setDataCriacaoDe(''); setDataCriacaoAte('');
        setVendedorId(''); setSituacaoCA('FATURADO'); setExcluirBonificacao('true');
        setFiltrosAtivos({});
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

    // Opções dos multi-filtros do painel — derivadas dos dados carregados (casam exatamente com a tabela)
    const opcoesDe = useCallback((field) => {
        const map = new Map();
        pedidos.forEach(r => {
            const v = String(r[field] ?? '');
            const k = v.toLowerCase();
            if (!map.has(k)) map.set(k, v);
        });
        return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    }, [pedidos]);
    const opcoesCondicao = useMemo(() => opcoesDe('nomeCondicaoPagamento'), [opcoesDe]);
    const opcoesCategoria = useMemo(() => opcoesDe('categoriaComercial'), [opcoesDe]);

    const dadosFiltrados = useMemo(() => {
        let result = [...pedidos];
        for (const [colId, selecao] of Object.entries(filtrosAtivos)) {
            if (!selecao) continue;
            const col = COLUNAS.find(c => c.id === colId);
            if (!col) continue;
            result = result.filter(row => selecao.has(String(row[col.field] ?? '').toLowerCase()));
        }
        return result;
    }, [pedidos, filtrosAtivos]);

    // Colunas na ordem definida pelo usuário, apenas as visíveis
    const colsAtivas = colOrdem.map(id => COLUNAS.find(c => c.id === id)).filter(c => c && colsVisiveis.has(c.id));
    const todasDimensoesVisiveis = COLUNAS.filter(c => c.tipo !== 'numero').every(c => colsVisiveis.has(c.id));

    const dadosAgrupados = useMemo(() => {
        const dimCols = colsAtivas.filter(c => c.tipo !== 'numero');
        if (todasDimensoesVisiveis) {
            // Sem agrupamento — ordena e retorna com _count=1
            const col = COLUNAS.find(c => c.id === sortCol);
            const sorted = [...dadosFiltrados];
            if (col) {
                sorted.sort((a, b) => {
                    let va = a[col.field] ?? '', vb = b[col.field] ?? '';
                    if (col.tipo === 'numero') { va = Number(va); vb = Number(vb); }
                    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
                    if (va < vb) return sortDir === 'asc' ? -1 : 1;
                    if (va > vb) return sortDir === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            return sorted.map(r => ({ ...r, _count: 1, _key: r.id }));
        }
        // Agrupa por chave das colunas dimensão visíveis
        const map = new Map();
        dadosFiltrados.forEach(row => {
            const key = dimCols.map(c => String(row[c.field] ?? '')).join('\x00');
            if (!map.has(key)) {
                const g = { _key: key, _count: 0, valorTotal: 0, quantidade: 0, valorUnit: null, custoTotal: 0, precoCusto: null, _temCusto: false };
                dimCols.forEach(c => { g[c.field] = row[c.field]; });
                map.set(key, g);
            }
            const g = map.get(key);
            g.valorTotal += Number(row.valorTotal || 0);
            g.quantidade += Number(row.quantidade || 0);
            if (row.custoTotal != null) { g.custoTotal += Number(row.custoTotal); g._temCusto = true; }
            g._count += 1;
        });
        const result = [...map.values()];
        // Custo unitário do grupo = custo total / quantidade (constante por produto).
        // Sem nenhum custo no grupo → mostra "-" em vez de R$ 0,00.
        result.forEach(g => {
            if (!g._temCusto) { g.custoTotal = null; g.precoCusto = null; }
            else g.precoCusto = g.quantidade > 0 ? g.custoTotal / g.quantidade : null;
        });
        const col = COLUNAS.find(c => c.id === sortCol);
        if (col && colsVisiveis.has(col.id)) {
            result.sort((a, b) => {
                let va = a[col.field] ?? '', vb = b[col.field] ?? '';
                if (col.tipo === 'numero') { va = Number(va); vb = Number(vb); }
                else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
                if (va < vb) return sortDir === 'asc' ? -1 : 1;
                if (va > vb) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [dadosFiltrados, colsAtivas, todasDimensoesVisiveis, sortCol, sortDir]);

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
        if (!dadosAgrupados.length) { toast.error('Nenhum dado para exportar.'); return; }
        const headers = colsAtivas.map(c => c.label);
        const rows = dadosAgrupados.map(r => colsAtivas.map(c => {
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

    const handleDragStart = (colId) => { dragColRef.current = colId; };
    const handleDragOver = (e, colId) => {
        e.preventDefault();
        if (!dragColRef.current || dragColRef.current === colId) return;
        setColOrdem(prev => {
            const next = [...prev];
            const from = next.indexOf(dragColRef.current);
            const to = next.indexOf(colId);
            if (from < 0 || to < 0) return prev;
            next.splice(from, 1);
            next.splice(to, 0, dragColRef.current);
            return next;
        });
    };
    const handleDragEnd = () => { dragColRef.current = null; };

    const temDados = pedidos.length > 0;

    // Altura do header fixo em px — usada no padding-top do conteúdo e no top do thead
    const HEADER_H = 57;

    return (
        <>
            {/*
              Header FIXO no desktop. Usa position:fixed com left:64px (largura do sidebar md:w-16).
              No mobile o sidebar não existe e o top-nav já tem z-50, então ocultamos com md:flex.
            */}
            <div
                className="hidden md:flex fixed top-0 left-16 right-0 z-40 bg-white border-b border-gray-100 shadow-sm items-center justify-between px-6 print:hidden"
                style={{ height: HEADER_H }}>
                <div className="flex items-center gap-2 min-w-0">
                    <BarChart2 className="h-6 w-6 text-indigo-600 flex-shrink-0" />
                    <h1 className="text-2xl font-bold text-gray-800 truncate">Relatório de Vendas</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {temDados && <>
                        <button onClick={() => setShowPrint(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 font-medium">
                            <Printer className="h-4 w-4" /> Imprimir
                        </button>
                        <button onClick={exportarCSV}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium">
                            <Download className="h-4 w-4" /> CSV
                        </button>
                    </>}
                    <button onClick={() => setShowFiltros(!showFiltros)}
                        className="flex items-center gap-1.5 px-2.5 py-2 text-sm bg-white border rounded-md hover:bg-gray-50">
                        <Filter className="h-4 w-4" /> Filtros
                    </button>
                </div>
            </div>

            {/* Header mobile — fluxo normal (não fixo) */}
            <div className="md:hidden flex items-center justify-between px-3 py-3 mb-3 border-b border-gray-100 print:hidden">
                <div className="flex items-center gap-2 min-w-0">
                    <BarChart2 className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                    <h1 className="text-lg font-bold text-gray-800 truncate">Relatório de Vendas</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {temDados && <>
                        <button onClick={() => setShowPrint(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800">
                            <Printer className="h-4 w-4" />
                        </button>
                        <button onClick={exportarCSV} className="flex items-center gap-1 px-2.5 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">
                            <Download className="h-4 w-4" />
                        </button>
                    </>}
                    <button onClick={() => setShowFiltros(!showFiltros)} className="flex items-center gap-1 px-2.5 py-1.5 text-sm bg-white border rounded-md hover:bg-gray-50">
                        <Filter className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Espaçador no desktop para empurrar conteúdo abaixo do header fixo */}
            <div className="hidden md:block" style={{ height: HEADER_H }} />

            <div className="container mx-auto px-3 sm:px-4 max-w-6xl">

                {/* Painel de filtros */}
                {showFiltros && (
                    <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-4 mb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            {/* Data Venda */}
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Data Venda De</label>
                                <input type="date" value={dataVendaDe} onChange={e => setDataVendaDe(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Data Venda Até</label>
                                <input type="date" value={dataVendaAte} onChange={e => setDataVendaAte(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                            </div>
                            {/* Data Criação */}
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Data Criação De</label>
                                <input type="date" value={dataCriacaoDe} onChange={e => setDataCriacaoDe(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Data Criação Até</label>
                                <input type="date" value={dataCriacaoAte} onChange={e => setDataCriacaoAte(e.target.value)}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Condição de Pagamento</label>
                                <MultiSelectFiltro
                                    options={opcoesCondicao}
                                    selecao={filtrosAtivos.condicao}
                                    onChange={(sel) => handleFiltroChange('condicao', sel)}
                                    placeholderVazio="Gere o relatório primeiro"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Categoria Comercial</label>
                                <MultiSelectFiltro
                                    options={opcoesCategoria}
                                    selecao={filtrosAtivos.categoria}
                                    onChange={(sel) => handleFiltroChange('categoria', sel)}
                                    placeholderVazio="Gere o relatório primeiro"
                                />
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
                                <p className="text-base font-bold text-gray-900">{resumo.totalPedidos} pedidos</p>
                                <p className="text-xs text-gray-500">R$ {fmt(resumo.valorTotalGeral)}</p>
                            </div>
                            <div className="bg-white rounded-lg border p-3">
                                <p className="text-[10px] sm:text-xs text-gray-500">Filtrado</p>
                                <p className="text-base font-bold text-indigo-700">{dadosFiltrados.length} itens</p>
                                <p className="text-xs text-indigo-500">R$ {fmt(totalFiltrado)}</p>
                            </div>
                            <div className="bg-white rounded-lg border p-3">
                                <p className="text-[10px] sm:text-xs text-gray-500">Ticket médio</p>
                                <p className="text-base font-bold text-gray-900">
                                    R$ {fmt(dadosFiltrados.length > 0 ? totalFiltrado / dadosFiltrados.length : 0)}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg border p-3">
                                <p className="text-[10px] sm:text-xs text-gray-500">Linhas · Filtros ativos</p>
                                <p className="text-base font-bold text-gray-900">{dadosAgrupados.length} linhas · {chips.length} filtros</p>
                            </div>
                        </div>

                        {/* Toggle de colunas — mostra na ordem atual, arrastar para reordenar */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {colOrdem.map(id => {
                                const c = COLUNAS.find(col => col.id === id);
                                if (!c) return null;
                                return (
                                    <button key={c.id} onClick={() => toggleCol(c.id)}
                                        draggable
                                        onDragStart={() => handleDragStart(c.id)}
                                        onDragOver={e => handleDragOver(e, c.id)}
                                        onDragEnd={handleDragEnd}
                                        className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors cursor-grab active:cursor-grabbing ${
                                            colsVisiveis.has(c.id)
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                        }`}>
                                        {c.label}
                                    </button>
                                );
                            })}
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
                        <div className="bg-white rounded-lg border shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b md:sticky md:top-[57px] z-10">
                                    <tr>
                                        {colsAtivas.map(col => {
                                            const temFiltro = filtrosAtivos[col.id] && filtrosAtivos[col.id].size > 0;
                                            return (
                                                <th key={col.id}
                                                    draggable
                                                    onDragStart={() => handleDragStart(col.id)}
                                                    onDragOver={e => handleDragOver(e, col.id)}
                                                    onDragEnd={handleDragEnd}
                                                    className={`px-2 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider select-none relative cursor-grab active:cursor-grabbing ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                                                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                                                        <button
                                                            onClick={(e) => handleSort(col, e)}
                                                            className="flex items-center gap-1 hover:text-indigo-700">
                                                            {col.label}
                                                            <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                                                        </button>
                                                        {col.filtravel && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setDropdownAberto(d => d === col.id ? null : col.id); }}
                                                                className={`ml-0.5 p-0.5 rounded transition-colors ${temFiltro ? 'text-indigo-600 bg-indigo-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                                                title={`Filtrar por ${col.label}`}>
                                                                <ListFilter className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
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
                                    {dadosAgrupados.map(row => (
                                        <tr key={row._key} className="hover:bg-gray-50">
                                            {colsAtivas.map(col => {
                                                const val = row[col.field];
                                                return (
                                                    <td key={col.id}
                                                        className={`px-2 py-2 text-xs text-gray-800 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                        {(col.id === 'data' || col.id === 'criacao') && fmtData(val)}
                                                        {col.id === 'valor' && (
                                                            <span className="font-semibold">
                                                                R$ {fmt(val)}
                                                                {row._count > 1 && <span className="ml-1 text-[10px] text-gray-400 font-normal">({row._count})</span>}
                                                            </span>
                                                        )}
                                                        {col.id === 'quantidade' && (
                                                            <span>{Number(val || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span>
                                                        )}
                                                        {col.id === 'valorUnit' && (
                                                            val != null ? <span>R$ {fmt(val)}</span> : <span className="text-gray-400">-</span>
                                                        )}
                                                        {col.id === 'precoCusto' && (
                                                            val != null ? <span>R$ {fmt(val)}</span> : <span className="text-gray-400">-</span>
                                                        )}
                                                        {col.id === 'custoTotal' && (
                                                            val != null ? <span className="font-semibold text-rose-700">R$ {fmt(val)}</span> : <span className="text-gray-400">-</span>
                                                        )}
                                                        {col.id === 'tipo' && (
                                                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${TIPO_BADGE[val] || 'bg-gray-100 text-gray-700'}`}>{val}</span>
                                                        )}
                                                        {!['data','criacao','valor','quantidade','valorUnit','precoCusto','custoTotal','tipo'].includes(col.id) && (val || '-')}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                {dadosAgrupados.length > 0 && (
                                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                                        <tr>
                                            {colsAtivas.map((col, i) => (
                                                <td key={col.id} className={`px-2 py-2 text-xs font-semibold text-gray-700 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                    {i === 0 && `${dadosAgrupados.length} linhas`}
                                                    {col.id === 'quantidade' && dadosAgrupados.reduce((s, r) => s + Number(r.quantidade || 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                                    {col.id === 'valor' && `R$ ${fmt(totalFiltrado)}`}
                                                    {col.id === 'custoTotal' && `R$ ${fmt(dadosAgrupados.reduce((s, r) => s + Number(r.custoTotal || 0), 0))}`}
                                                </td>
                                            ))}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                            {dadosAgrupados.length === 0 && (
                                <p className="text-center text-gray-400 py-10">Nenhum registro com os filtros ativos.</p>
                            )}
                        </div>

                        <p className="text-xs text-gray-400 mt-2 text-center">
                            Arraste as pílulas ou os cabeçalhos para reordenar · <ListFilter className="h-3 w-3 inline" /> filtra · clique no nome ordena · ocultar coluna agrupa os dados
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
                            style={{ width: '210mm', padding: '4mm 6mm' }}>
                            <h1>RELATÓRIO DE VENDAS</h1>
                            <div className="sub">
                                {[
                                    dataVendaDe && `Venda: ${fmtData(dataVendaDe)} a ${fmtData(dataVendaAte || dataVendaDe)}`,
                                    situacaoCA  && `Situação: ${situacaoCA}`,
                                    chips.length && `Filtros: ${chips.map(c => `${c.label} (${c.qtd}/${c.total})`).join(', ')}`,
                                    `Total: ${dadosFiltrados.length} pedidos · ${dadosAgrupados.length} linhas · R$ ${fmt(totalFiltrado)}`
                                ].filter(Boolean).join(' | ')}
                            </div>
                            <table>
                                <thead>
                                    <tr>{colsAtivas.map(col => <th key={col.id} style={{ textAlign: col.align || 'left' }}>{col.label}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {dadosAgrupados.map(row => (
                                        <tr key={row._key}>
                                            {colsAtivas.map(col => {
                                                const val = row[col.field];
                                                return (
                                                    <td key={col.id} className={col.align === 'right' ? 'num' : ''}>
                                                        {(col.id === 'data' || col.id === 'criacao') ? fmtData(val)
                                                        : col.id === 'valor' ? `R$ ${fmt(val)}${row._count > 1 ? ` (${row._count})` : ''}`
                                                        : col.id === 'quantidade' ? Number(val || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                                        : (col.id === 'valorUnit' || col.id === 'precoCusto' || col.id === 'custoTotal') ? (val != null ? `R$ ${fmt(val)}` : '-')
                                                        : val || '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        {colsAtivas.map((col, i) => (
                                            <td key={col.id} className={col.align === 'right' ? 'num' : ''}>
                                                {i === 0 && `${dadosAgrupados.length} linhas`}
                                                {col.id === 'valor' && `R$ ${fmt(totalFiltrado)}`}
                                                {col.id === 'custoTotal' && `R$ ${fmt(dadosAgrupados.reduce((s, r) => s + Number(r.custoTotal || 0), 0))}`}
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
