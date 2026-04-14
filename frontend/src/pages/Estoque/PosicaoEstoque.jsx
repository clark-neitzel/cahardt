import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, AlertTriangle, CheckCircle, Package, X, ChevronDown, Pencil, Check, Loader2, TrendingDown, PackageX, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import estoqueService from '../../services/estoqueService';
import categoriaProdutoService from '../../services/categoriaProdutoService';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const STORAGE_KEY = 'posicao_estoque_filtros';

function useLocalStorage(key, defaultValue) {
    const [value, setValue] = useState(() => {
        try {
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch {
            return defaultValue;
        }
    });
    const set = useCallback((v) => {
        setValue(v);
        localStorage.setItem(key, JSON.stringify(v));
    }, [key]);
    return [value, set];
}

// Dropdown de multi-seleção reutilizável
function MultiSelect({ label, options, selected, onChange, placeholder = 'Todos' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (id) => {
        onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
    };

    const label_text = selected.length === 0
        ? placeholder
        : selected.length === 1
            ? options.find(o => o.id === selected[0])?.nome || '1 selecionado'
            : `${selected.length} selecionados`;

    return (
        <div className="relative" ref={ref}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border rounded-lg bg-white text-left transition-colors
                    ${selected.length > 0 ? 'border-blue-400 text-blue-700 font-medium' : 'border-gray-300 text-gray-600'}
                    hover:border-blue-400`}
            >
                <span className="truncate">{label_text}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {options.length === 0 && (
                        <p className="px-3 py-2 text-xs text-gray-400">Nenhuma opção</p>
                    )}
                    {selected.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100"
                        >
                            Limpar seleção
                        </button>
                    )}
                    {options.map(opt => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggle(opt.id)}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-blue-50 transition-colors
                                ${selected.includes(opt.id) ? 'text-blue-700 font-medium bg-blue-50/50' : 'text-gray-700'}`}
                        >
                            <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center
                                ${selected.includes(opt.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                {selected.includes(opt.id) && <Check className="h-3 w-3 text-white" />}
                            </span>
                            {opt.nome}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Linha de produto — inline edit de estoqueMinimo
function ProdutoRow({ produto, isAdmin, onMinimoSalvo }) {
    const [editando, setEditando] = useState(false);
    const [minimo, setMinimo] = useState('');
    const [salvando, setSalvando] = useState(false);

    const disp = parseFloat(produto.estoqueDisponivel || 0);
    const min = parseFloat(produto.estoqueMinimo || 0);
    const abaixo = min > 0 && disp < min;
    const ok = min > 0 && disp >= min;

    const handleEdit = () => { setMinimo(String(produto.estoqueMinimo ?? '0')); setEditando(true); };
    const handleCancel = () => setEditando(false);
    const handleSalvar = async () => {
        const val = parseFloat(minimo);
        if (isNaN(val) || val < 0) return toast.error('Valor inválido.');
        setSalvando(true);
        try {
            const res = await estoqueService.atualizarMinimo(produto.id, val);
            onMinimoSalvo(produto.id, res.estoqueMinimo);
            setEditando(false);
            toast.success('Mínimo atualizado.');
        } catch {
            toast.error('Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <tr className={`border-b border-gray-100 hover:bg-gray-50/70 transition-colors ${abaixo ? 'bg-amber-50/40' : ''}`}>
            {/* Indicador visual */}
            <td className="pl-4 pr-2 py-3 w-6">
                {abaixo && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                {ok && <CheckCircle className="h-4 w-4 text-green-500" />}
                {!abaixo && !ok && <span className="block h-4 w-4" />}
            </td>

            {/* Produto */}
            <td className="px-3 py-3">
                <p className="text-sm font-medium text-gray-900 leading-snug">{produto.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                    {produto.categoria || '—'}
                    {produto.categoriaProduto && <span className="ml-2 text-gray-300">·</span>}
                    {produto.categoriaProduto && <span className="ml-2">{produto.categoriaProduto.nome}</span>}
                </p>
            </td>

            {/* Disponível */}
            <td className="px-3 py-3 text-right">
                <span className={`text-base font-bold tabular-nums ${abaixo ? 'text-amber-600' : 'text-gray-800'}`}>
                    {disp.toFixed(0)}
                </span>
                <span className="text-xs text-gray-400 ml-1">{produto.unidade || 'un'}</span>
            </td>

            {/* Reservado */}
            <td className="px-3 py-3 text-right hidden sm:table-cell">
                <span className="text-sm text-orange-500 tabular-nums font-medium">
                    {parseFloat(produto.estoqueReservado || 0).toFixed(0)}
                </span>
            </td>

            {/* Total */}
            <td className="px-3 py-3 text-right hidden md:table-cell">
                <span className="text-sm text-gray-600 tabular-nums">
                    {parseFloat(produto.estoqueTotal || 0).toFixed(0)}
                </span>
            </td>

            {/* Mínimo */}
            <td className="px-3 py-3 text-right">
                {editando ? (
                    <div className="flex items-center justify-end gap-1">
                        <input
                            type="number"
                            value={minimo}
                            onChange={e => setMinimo(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSalvar(); if (e.key === 'Escape') handleCancel(); }}
                            autoFocus
                            className="w-20 px-2 py-1 text-sm border border-blue-400 rounded-lg text-right focus:outline-none"
                            min="0"
                            step="1"
                            inputMode="decimal"
                            disabled={salvando}
                        />
                        <button onClick={handleSalvar} disabled={salvando} className="text-green-600 hover:text-green-700 p-0.5">
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 p-0.5">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-end gap-1.5">
                        <span className={`text-sm tabular-nums ${abaixo ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                            {min > 0 ? min.toFixed(0) : <span className="text-gray-300">—</span>}
                        </span>
                        {isAdmin && (
                            <button
                                onClick={handleEdit}
                                className="text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                title="Editar mínimo"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                )}
            </td>
        </tr>
    );
}

// Card mobile para produto
function ProdutoCard({ produto, isAdmin, onMinimoSalvo }) {
    const [editando, setEditando] = useState(false);
    const [minimo, setMinimo] = useState('');
    const [salvando, setSalvando] = useState(false);

    const disp = parseFloat(produto.estoqueDisponivel || 0);
    const min = parseFloat(produto.estoqueMinimo || 0);
    const abaixo = min > 0 && disp < min;

    const handleSalvar = async () => {
        const val = parseFloat(minimo);
        if (isNaN(val) || val < 0) return toast.error('Valor inválido.');
        setSalvando(true);
        try {
            const res = await estoqueService.atualizarMinimo(produto.id, val);
            onMinimoSalvo(produto.id, res.estoqueMinimo);
            setEditando(false);
            toast.success('Mínimo atualizado.');
        } catch {
            toast.error('Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`rounded-xl border p-4 ${abaixo ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-start gap-2 mb-3">
                {abaixo
                    ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    : min > 0 ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" /> : <Package className="h-4 w-4 text-gray-300 shrink-0 mt-0.5" />
                }
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{produto.nome}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{produto.categoria || '—'}{produto.categoriaProduto ? ` · ${produto.categoriaProduto.nome}` : ''}</p>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="text-sm font-bold text-gray-700">{parseFloat(produto.estoqueTotal || 0).toFixed(0)}</p>
                </div>
                <div>
                    <p className="text-xs text-orange-500">Reservado</p>
                    <p className="text-sm font-bold text-orange-500">{parseFloat(produto.estoqueReservado || 0).toFixed(0)}</p>
                </div>
                <div>
                    <p className={`text-xs ${abaixo ? 'text-amber-600' : 'text-blue-600'}`}>Disponível</p>
                    <p className={`text-sm font-bold ${abaixo ? 'text-amber-600' : 'text-blue-700'}`}>{disp.toFixed(0)}</p>
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                <span className="text-xs text-gray-500">Mínimo:</span>
                {editando ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            value={minimo}
                            onChange={e => setMinimo(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSalvar(); if (e.key === 'Escape') setEditando(false); }}
                            autoFocus
                            className="w-20 px-2 py-1 text-sm border border-blue-400 rounded-lg text-right focus:outline-none"
                            min="0" step="1" inputMode="decimal" disabled={salvando}
                        />
                        <button onClick={handleSalvar} disabled={salvando} className="text-green-600 p-0.5">
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setEditando(false)} className="text-gray-400 p-0.5"><X className="h-4 w-4" /></button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-medium tabular-nums ${abaixo ? 'text-amber-600' : 'text-gray-600'}`}>
                            {min > 0 ? `${min.toFixed(0)} ${produto.unidade || 'un'}` : '—'}
                        </span>
                        {isAdmin && (
                            <button onClick={() => { setMinimo(String(produto.estoqueMinimo ?? '0')); setEditando(true); }} className="text-gray-400 hover:text-blue-500 p-0.5">
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function PosicaoEstoque() {
    const { user } = useAuth();
    const isAdmin = user?.permissoes?.admin === true;

    const [filtros, setFiltros] = useLocalStorage(STORAGE_KEY, {
        search: '',
        categorias: [],        // categorias de estoque (produto.categoria)
        categoriasComerciais: [], // IDs de CategoriaProduto
        atalho: null             // null | 'abaixo' | 'zero'
    });

    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [categoriasEstoque, setCategoriasEstoque] = useState([]);
    const [categoriasComerciais, setCategoriasComerciais] = useState([]);
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const filtrosRef = useRef(null);
    const searchTimeout = useRef(null);

    // Fecha painel de filtros ao clicar fora
    useEffect(() => {
        if (!filtrosAbertos) return;
        const handler = (e) => {
            if (filtrosRef.current && !filtrosRef.current.contains(e.target)) setFiltrosAbertos(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [filtrosAbertos]);

    // Carrega listas de opções de filtro
    useEffect(() => {
        Promise.all([
            api.get('/categorias-estoque').then(r => r.data),
            categoriaProdutoService.listar()
        ]).then(([cats, coms]) => {
            setCategoriasEstoque(cats.map(c => ({ id: c.nome, nome: c.nome })));
            setCategoriasComerciais(coms.filter(c => c.ativo).map(c => ({ id: c.id, nome: c.nome })));
        }).catch(() => {});
    }, []);

    // Busca produtos com debounce no search
    useEffect(() => {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            carregar();
        }, filtros.search ? 350 : 0);
        return () => clearTimeout(searchTimeout.current);
    }, [filtros.search, filtros.categorias, filtros.categoriasComerciais]);

    const carregar = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filtros.search?.trim()) params.search = filtros.search.trim();
            if (filtros.categorias?.length > 0) params.categorias = filtros.categorias.join(',');
            if (filtros.categoriasComerciais?.length > 0) params.categoriasComerciais = filtros.categoriasComerciais.join(',');

            const data = await estoqueService.getPosicao(params);
            setProdutos(data);
        } catch {
            toast.error('Erro ao carregar posição de estoque.');
        } finally {
            setLoading(false);
        }
    };

    const handleMinimoSalvo = (produtoId, novoMinimo) => {
        setProdutos(prev => prev.map(p =>
            p.id === produtoId ? { ...p, estoqueMinimo: novoMinimo } : p
        ));
    };

    const limparFiltros = () => setFiltros({ search: '', categorias: [], categoriasComerciais: [], atalho: null });
    const temFiltroCategoria = filtros.categorias?.length > 0 || filtros.categoriasComerciais?.length > 0;
    const temFiltro = filtros.search || temFiltroCategoria || filtros.atalho;

    const produtosFiltrados = produtos.filter(p => {
        if (!filtros.atalho) return true;
        const disp = parseFloat(p.estoqueDisponivel || 0);
        const min = parseFloat(p.estoqueMinimo || 0);
        if (filtros.atalho === 'abaixo') return min > 0 && disp < min;
        if (filtros.atalho === 'zero') return disp <= 0;
        return true;
    });

    const abaixoMinimo = produtos.filter(p => {
        const disp = parseFloat(p.estoqueDisponivel || 0);
        const min = parseFloat(p.estoqueMinimo || 0);
        return min > 0 && disp < min;
    }).length;
    const zeroOuNegativo = produtos.filter(p => parseFloat(p.estoqueDisponivel || 0) <= 0).length;

    const toggleAtalho = (a) => setFiltros({ ...filtros, atalho: filtros.atalho === a ? null : a });

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-5xl mx-auto px-4 py-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Posição de Estoque</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Produção / Posição</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={async () => {
                                    const dryResp = await api.post('/estoque/retroagir-capado?dry=1').catch(e => ({ error: e }));
                                    if (dryResp.error) { toast.error('Falha no dry-run: ' + (dryResp.error.response?.data?.error || dryResp.error.message)); return; }
                                    const { produtosAfetados, fixedMov, fixedProd } = dryResp.data;
                                    if (produtosAfetados === 0) { toast.success('Nenhuma movimentação capada encontrada.'); return; }
                                    if (!confirm(`Retroagir ${fixedMov} movimentações em ${produtosAfetados} produto(s)? ${fixedProd} produto(s) terão estoqueTotal ajustado.`)) return;
                                    const r = await api.post('/estoque/retroagir-capado').catch(e => ({ error: e }));
                                    if (r.error) { toast.error('Falha: ' + (r.error.response?.data?.error || r.error.message)); return; }
                                    toast.success(`OK: ${r.data.fixedMov} movs e ${r.data.fixedProd} produtos corrigidos.`);
                                }}
                                title="Retroagir movimentações antigas que foram capadas em 0"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Retroagir capados
                            </button>
                        )}
                        {abaixoMinimo > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-100 text-amber-700 text-sm font-medium px-3 py-1.5 rounded-full">
                                <AlertTriangle className="h-4 w-4" />
                                {abaixoMinimo} abaixo do mínimo
                            </div>
                        )}
                    </div>
                </div>

                {/* Barra fixa: busca + atalhos */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 p-3 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            value={filtros.search}
                            onChange={e => setFiltros({ ...filtros, search: e.target.value })}
                            placeholder="Buscar por nome ou código..."
                            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {filtros.search && (
                            <button onClick={() => setFiltros({ ...filtros, search: '' })} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Atalhos em forma de chip */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => toggleAtalho('abaixo')}
                            title="Abaixo do mínimo"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors ${filtros.atalho === 'abaixo' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600'}`}
                        >
                            <TrendingDown className="h-3.5 w-3.5" />
                            <span>Abaixo do mínimo</span>
                            <span className={`tabular-nums ${filtros.atalho === 'abaixo' ? 'text-amber-700' : 'text-gray-400'}`}>({abaixoMinimo})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleAtalho('zero')}
                            title="Estoque zero ou negativo"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors ${filtros.atalho === 'zero' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600'}`}
                        >
                            <PackageX className="h-3.5 w-3.5" />
                            <span>Estoque zero ou negativo</span>
                            <span className={`tabular-nums ${filtros.atalho === 'zero' ? 'text-red-700' : 'text-gray-400'}`}>({zeroOuNegativo})</span>
                        </button>
                    </div>
                </div>

                {/* Filtros de categoria — colapsável, fecha ao clicar fora */}
                <div ref={filtrosRef} className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
                    <button
                        type="button"
                        onClick={() => setFiltrosAbertos(o => !o)}
                        className="w-full flex items-center justify-between px-4 py-3"
                    >
                        <div className="flex items-center gap-2">
                            <Search className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">Filtros por categoria</span>
                            {temFiltroCategoria && (
                                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                    {(filtros.categorias?.length || 0) + (filtros.categoriasComerciais?.length || 0)} ativo{((filtros.categorias?.length || 0) + (filtros.categoriasComerciais?.length || 0)) !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${filtrosAbertos ? 'rotate-180' : ''}`} />
                    </button>

                    {filtrosAbertos && (
                        <div className="px-4 pb-4 border-t border-gray-100">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                                <MultiSelect
                                    label="Categoria de estoque"
                                    options={categoriasEstoque}
                                    selected={filtros.categorias || []}
                                    onChange={v => setFiltros({ ...filtros, categorias: v })}
                                    placeholder="Todas"
                                />

                                <MultiSelect
                                    label="Categoria comercial"
                                    options={categoriasComerciais}
                                    selected={filtros.categoriasComerciais || []}
                                    onChange={v => setFiltros({ ...filtros, categoriasComerciais: v })}
                                    placeholder="Todas"
                                />
                            </div>

                            {temFiltro && (
                                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                                    <p className="text-xs text-gray-500">{produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? 's' : ''} encontrado{produtosFiltrados.length !== 1 ? 's' : ''}</p>
                                    <button onClick={limparFiltros} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                                        <X className="h-3 w-3" /> Limpar filtros
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Conteúdo */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
                    </div>
                ) : produtosFiltrados.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">{temFiltro ? 'Nenhum produto para os filtros selecionados.' : 'Nenhum produto cadastrado.'}</p>
                    </div>
                ) : (
                    <>
                        {/* Tabela — desktop */}
                        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="pl-4 pr-2 py-3 w-6" />
                                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Disponível</th>
                                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Reservado</th>
                                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                            Mínimo {isAdmin && <span className="text-gray-300 normal-case font-normal">(clique p/ editar)</span>}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="group">
                                    {produtosFiltrados.map(p => (
                                        <ProdutoRow key={p.id} produto={p} isAdmin={isAdmin} onMinimoSalvo={handleMinimoSalvo} />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Cards — mobile */}
                        <div className="md:hidden space-y-3">
                            {produtosFiltrados.map(p => (
                                <ProdutoCard key={p.id} produto={p} isAdmin={isAdmin} onMinimoSalvo={handleMinimoSalvo} />
                            ))}
                        </div>

                        <p className="text-xs text-center text-gray-400 mt-4">{produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? 's' : ''}</p>
                    </>
                )}
            </div>
        </div>
    );
}
