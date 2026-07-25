import { useState, useEffect, useCallback } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Filter, ChevronLeft, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import estoqueService from '../../services/estoqueService';
import produtoService from '../../services/produtoService';
import SelectBusca from '../../components/SelectBusca';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { useAtualizaAoVoltar } from '../../hooks/useAtualizaAoVoltar';

const MOTIVO_LABEL = {
    AJUSTE_MANUAL: 'Ajuste Manual',
    PEDIDO_ESPECIAL: 'Pedido Especial',
    PEDIDO_BONIFICACAO: 'Bonificação',
    FATURAMENTO: 'Faturamento',
    DEVOLUCAO: 'Devolução',
    REVERSAO_DEVOLUCAO: 'Reversão Devolução',
    CANCELAMENTO: 'Cancelamento',
    EXCLUSAO: 'Exclusão',
    INVENTARIO: 'Inventário',
};

const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const MovimentacaoCard = ({ item, compact }) => (
    <div className={`bg-white border border-gray-200 rounded-xl ${compact ? 'p-2.5' : 'p-3.5'} flex items-start gap-2.5`}>
        {item.tipo === 'ENTRADA'
            ? <ArrowUpCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            : <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
                <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-900 truncate`}>{item.produto?.nome || '—'}</p>
                <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold shrink-0 ${item.tipo === 'ENTRADA' ? 'text-green-600' : 'text-red-600'}`}>
                    {item.tipo === 'ENTRADA' ? '+' : '-'}{Number(item.quantidade).toFixed(0)}
                </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[11px] text-gray-500">{MOTIVO_LABEL[item.motivo] || item.motivo}</span>
                {item.vendedor && <span className="text-[11px] text-gray-400">· {item.vendedor.nome}</span>}
                <span className="text-[11px] text-gray-400">· {formatDate(item.createdAt)}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[11px] text-gray-400">
                    {Number(item.estoqueAntes).toFixed(0)} → <span className="font-medium text-gray-700">{Number(item.estoqueDepois).toFixed(0)}</span>
                </span>
                {item.sincCA
                    ? <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-medium">CA ✓</span>
                    : <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">CA pendente</span>
                }
            </div>
            {item.observacao && <p className="text-[11px] text-gray-500 mt-0.5 italic">{item.observacao}</p>}
            {item.erroCA && <p className="text-[11px] text-red-500 mt-0.5">Erro CA: {item.erroCA}</p>}
        </div>
    </div>
);

const fmtCaixas = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export default function HistoricoEstoque() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [totais, setTotais] = useState(null); // { entradas: {lancamentos, caixas}, saidas: {...} } — filtro inteiro
    const [pagina, setPagina] = useState(1);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState(null);
    const [showFiltros, setShowFiltros] = useState(false);

    // Produto escolhido na lista (não persiste — é uma busca pontual)
    const [produtoId, setProdutoId] = useState('');
    const [produtos, setProdutos] = useState([]);

    // Tipo/motivo aplicados ficam salvos por usuário; o rascunho do painel parte deles
    const [filtrosAplicados, setFiltrosAplicados] = useFiltrosSalvos('estoque-historico', { tipo: '', motivo: '' });
    const [filtros, setFiltros] = useState(filtrosAplicados);

    // Período no padrão do sistema (preset salvo por usuário; padrão: todo o período)
    const [periodo, periodoCtl] = usePeriodoSalvo('estoque-historico', 'todo');

    const tamanhoPagina = 60;

    useEffect(() => {
        produtoService.listar({ limit: 2000, page: 1 }).then(r => {
            const arr = Array.isArray(r) ? r : (r?.data || []);
            setProdutos(arr.sort((a, b) => a.nome.localeCompare(b.nome)));
        }).catch(() => {});
    }, []);

    const carregar = useCallback(async (pg = 1, filtrosAtivos = {}, prodId = '', de = '', ate = '') => {
        setLoading(true);
        setErro(null);
        try {
            const data = await estoqueService.listarHistorico({
                pagina: pg,
                tamanhoPagina,
                ...(filtrosAtivos.tipo ? { tipo: filtrosAtivos.tipo } : {}),
                ...(filtrosAtivos.motivo ? { motivo: filtrosAtivos.motivo } : {}),
                ...(prodId ? { produtoId: prodId } : {}),
                ...(de ? { dataInicio: de } : {}),
                ...(ate ? { dataFim: ate } : {}),
            });
            if (pg === 1) {
                setItems(data.items || []);
            } else {
                setItems(prev => [...prev, ...(data.items || [])]);
            }
            setTotal(data.total || 0);
            if (data.totais) setTotais(data.totais);
        } catch {
            setErro('Erro ao carregar histórico.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setPagina(1);
        carregar(1, filtrosAplicados, produtoId, periodo.de, periodo.ate);
    }, [carregar, filtrosAplicados, produtoId, periodo.de, periodo.ate]);

    // Rebusca ao voltar ao app / a cada 5 min: recarrega a 1ª página com os
    // filtros atuais (movimentos novos aparecem no topo, sem perder o filtro)
    useAtualizaAoVoltar(() => carregar(1, filtrosAplicados, produtoId, periodo.de, periodo.ate));

    const aplicarFiltros = () => {
        setFiltrosAplicados({ tipo: filtros.tipo || '', motivo: filtros.motivo || '' });
        setShowFiltros(false);
    };

    const limparFiltros = () => {
        setFiltros({ tipo: '', motivo: '' });
        setFiltrosAplicados({ tipo: '', motivo: '' });
        setProdutoId('');
        periodoCtl.limpar();
        setShowFiltros(false);
    };

    const carregarMais = () => {
        const nova = pagina + 1;
        setPagina(nova);
        carregar(nova, filtrosAplicados, produtoId, periodo.de, periodo.ate);
    };

    const temMais = items.length < total;
    const numFiltrosAtivos = (filtrosAplicados.tipo ? 1 : 0) + (filtrosAplicados.motivo ? 1 : 0)
        + (produtoId ? 1 : 0) + (!periodo.padrao ? 1 : 0);
    const temFiltros = numFiltrosAtivos > 0;

    const entradas = items.filter(i => i.tipo === 'ENTRADA');
    const saidas = items.filter(i => i.tipo === 'SAIDA');
    const saldoPeriodo = totais ? totais.entradas.caixas - totais.saidas.caixas : 0;

    return (
        <div className="w-full px-4 py-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
                <button onClick={() => navigate('/estoque')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-gray-900">Histórico de Estoque</h1>
                    <p className="text-xs text-gray-500">
                        {total} movimentações
                        {totais && (
                            <>
                                {' · '}<span className="font-semibold text-green-700">+{fmtCaixas(totais.entradas.caixas)} entraram</span>
                                {' · '}<span className="font-semibold text-red-700">−{fmtCaixas(totais.saidas.caixas)} saíram</span>
                                {' · saldo '}
                                <span className={`font-semibold ${saldoPeriodo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {saldoPeriodo >= 0 ? '+' : '−'}{fmtCaixas(Math.abs(saldoPeriodo))}
                                </span>
                            </>
                        )}
                    </p>
                </div>
                <div className="flex-1 max-w-xs">
                    <SelectBusca value={produtoId} onChange={e => setProdutoId(e.target.value)} className="w-full">
                        <option value="">Todos os produtos</option>
                        {produtos.map(p => (
                            <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                    </SelectBusca>
                </div>
                <button
                    onClick={() => setShowFiltros(!showFiltros)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${temFiltros ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    <Filter className="h-3.5 w-3.5" />
                    Filtros{temFiltros ? ` (${numFiltrosAtivos})` : ''}
                </button>
            </div>

            {/* Painel de filtros */}
            {showFiltros && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3 shadow-sm max-w-xl">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                            <SelectBusca
                                value={filtros.tipo}
                                onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}
                                className="w-full"
                            >
                                <option value="">Todos</option>
                                <option value="ENTRADA">Entrada</option>
                                <option value="SAIDA">Saída</option>
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
                            <SelectBusca
                                value={filtros.motivo}
                                onChange={e => setFiltros(f => ({ ...f, motivo: e.target.value }))}
                                className="w-full"
                            >
                                <option value="">Todos</option>
                                {Object.entries(MOTIVO_LABEL).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </SelectBusca>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
                        <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full" />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button onClick={limparFiltros} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Limpar</button>
                        <button onClick={aplicarFiltros} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Aplicar</button>
                    </div>
                </div>
            )}

            {/* Erro */}
            {erro && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm mb-4">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {erro}
                </div>
            )}

            {/* Loading */}
            {loading && items.length === 0 && (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
                </div>
            )}

            {/* Vazio */}
            {!loading && items.length === 0 && !erro && (
                <div className="text-center py-16 text-gray-400 text-sm">
                    Nenhuma movimentação encontrada.
                </div>
            )}

            {/* ── Desktop: duas colunas (Entradas | Saídas) ── */}
            <div className="hidden md:grid md:grid-cols-2 md:gap-5">
                {/* Coluna Entradas */}
                <div>
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <ArrowUpCircle className="h-5 w-5 text-green-500" />
                        <h2 className="text-sm font-bold text-green-700 uppercase tracking-wide">Entradas</h2>
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                            {totais ? `${totais.entradas.lancamentos} lançamentos · +${fmtCaixas(totais.entradas.caixas)} caixas` : entradas.length}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {entradas.length === 0 && !loading && (
                            <p className="text-xs text-gray-400 text-center py-8">Nenhuma entrada no período</p>
                        )}
                        {entradas.map(item => (
                            <MovimentacaoCard key={item.id} item={item} compact />
                        ))}
                    </div>
                </div>

                {/* Coluna Saídas */}
                <div>
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <ArrowDownCircle className="h-5 w-5 text-red-500" />
                        <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide">Saídas</h2>
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium">
                            {totais ? `${totais.saidas.lancamentos} lançamentos · −${fmtCaixas(totais.saidas.caixas)} caixas` : saidas.length}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {saidas.length === 0 && !loading && (
                            <p className="text-xs text-gray-400 text-center py-8">Nenhuma saída no período</p>
                        )}
                        {saidas.map(item => (
                            <MovimentacaoCard key={item.id} item={item} compact />
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Mobile: lista única ── */}
            <div className="md:hidden space-y-2">
                {items.map(item => (
                    <MovimentacaoCard key={item.id} item={item} />
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
