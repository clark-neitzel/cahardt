import { useState, useEffect, useCallback } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Filter, ChevronLeft, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import estoqueService from '../../services/estoqueService';

const MOTIVO_LABEL = {
    AJUSTE_MANUAL: 'Ajuste Manual',
    PEDIDO_ESPECIAL: 'Pedido Especial',
    PEDIDO_BONIFICACAO: 'Bonificação',
    FATURAMENTO: 'Faturamento',
    DEVOLUCAO: 'Devolução',
    REVERSAO_DEVOLUCAO: 'Reversão Devolução',
    CANCELAMENTO: 'Cancelamento',
    EXCLUSAO: 'Exclusão',
};

const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function HistoricoEstoque() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState(null);
    const [showFiltros, setShowFiltros] = useState(false);

    const [filtros, setFiltros] = useState({
        tipo: '',
        motivo: '',
        dataInicio: '',
        dataFim: '',
    });
    const [filtrosAplicados, setFiltrosAplicados] = useState({});

    const tamanhoPagina = 30;

    const carregar = useCallback(async (pg = 1, filtrosAtivos = {}) => {
        setLoading(true);
        setErro(null);
        try {
            const data = await estoqueService.listarHistorico({
                pagina: pg,
                tamanhoPagina,
                ...filtrosAtivos,
            });
            if (pg === 1) {
                setItems(data.items || []);
            } else {
                setItems(prev => [...prev, ...(data.items || [])]);
            }
            setTotal(data.total || 0);
        } catch {
            setErro('Erro ao carregar histórico.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        carregar(1, filtrosAplicados);
    }, [carregar, filtrosAplicados]);

    const aplicarFiltros = () => {
        const ativos = {};
        if (filtros.tipo) ativos.tipo = filtros.tipo;
        if (filtros.motivo) ativos.motivo = filtros.motivo;
        if (filtros.dataInicio) ativos.dataInicio = filtros.dataInicio;
        if (filtros.dataFim) ativos.dataFim = filtros.dataFim;
        setFiltrosAplicados(ativos);
        setPagina(1);
        setShowFiltros(false);
    };

    const limparFiltros = () => {
        setFiltros({ tipo: '', motivo: '', dataInicio: '', dataFim: '' });
        setFiltrosAplicados({});
        setPagina(1);
        setShowFiltros(false);
    };

    const carregarMais = () => {
        const nova = pagina + 1;
        setPagina(nova);
        carregar(nova, filtrosAplicados);
    };

    const temMais = items.length < total;
    const temFiltros = Object.keys(filtrosAplicados).length > 0;

    return (
        <div className="max-w-lg mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
                <button onClick={() => navigate('/estoque')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-gray-900">Histórico de Estoque</h1>
                    <p className="text-xs text-gray-500">{total} movimentações</p>
                </div>
                <button
                    onClick={() => setShowFiltros(!showFiltros)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${temFiltros ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    <Filter className="h-3.5 w-3.5" />
                    Filtros{temFiltros ? ` (${Object.keys(filtrosAplicados).length})` : ''}
                </button>
            </div>

            {/* Painel de filtros */}
            {showFiltros && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3 shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                            <select
                                value={filtros.tipo}
                                onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Todos</option>
                                <option value="ENTRADA">Entrada</option>
                                <option value="SAIDA">Saída</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
                            <select
                                value={filtros.motivo}
                                onChange={e => setFiltros(f => ({ ...f, motivo: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Todos</option>
                                {Object.entries(MOTIVO_LABEL).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">De</label>
                            <input type="date" value={filtros.dataInicio} onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Até</label>
                            <input type="date" value={filtros.dataFim} onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button onClick={limparFiltros} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Limpar</button>
                        <button onClick={aplicarFiltros} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Aplicar</button>
                    </div>
                </div>
            )}

            {/* Lista */}
            {erro && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm mb-4">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {erro}
                </div>
            )}

            {loading && items.length === 0 && (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
                </div>
            )}

            {!loading && items.length === 0 && !erro && (
                <div className="text-center py-16 text-gray-400 text-sm">
                    Nenhuma movimentação encontrada.
                </div>
            )}

            <div className="space-y-2">
                {items.map(item => (
                    <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-start gap-3">
                        {item.tipo === 'ENTRADA'
                            ? <ArrowUpCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                            : <ArrowDownCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        }
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900 truncate">{item.produto?.nome || '—'}</p>
                                <span className={`text-sm font-bold shrink-0 ${item.tipo === 'ENTRADA' ? 'text-green-600' : 'text-red-600'}`}>
                                    {item.tipo === 'ENTRADA' ? '+' : '-'}{Number(item.quantidade).toFixed(0)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-gray-500">{MOTIVO_LABEL[item.motivo] || item.motivo}</span>
                                {item.vendedor && <span className="text-xs text-gray-400">· {item.vendedor.nome}</span>}
                                <span className="text-xs text-gray-400">· {formatDate(item.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-gray-400">
                                    {Number(item.estoqueAntes).toFixed(0)} → <span className="font-medium text-gray-700">{Number(item.estoqueDepois).toFixed(0)}</span>
                                </span>
                                {item.sincCA
                                    ? <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-medium">CA ✓</span>
                                    : <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">CA pendente</span>
                                }
                            </div>
                            {item.observacao && <p className="text-xs text-gray-500 mt-1 italic">{item.observacao}</p>}
                            {item.erroCA && <p className="text-xs text-red-500 mt-1">Erro CA: {item.erroCA}</p>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Carregar mais */}
            {temMais && (
                <button
                    onClick={carregarMais}
                    disabled={loading}
                    className="w-full mt-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-600 font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Carregar mais
                </button>
            )}
        </div>
    );
}
