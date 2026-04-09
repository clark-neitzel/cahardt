import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasReceberService from '../../services/contasReceberService';
import {
    DollarSign, ChevronDown, ChevronUp, Search, Filter, X,
    CheckCircle, AlertTriangle, Clock, Ban, Undo2, ArrowUpDown, CheckSquare, Square
} from 'lucide-react';
import toast from 'react-hot-toast';

const LS_KEY = 'contasReceber_filters';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const STATUS_BADGES = {
    ABERTO: { label: 'Aberto', class: 'bg-blue-100 text-blue-800' },
    PARCIAL: { label: 'Parcial', class: 'bg-yellow-100 text-yellow-800' },
    QUITADO: { label: 'Quitado', class: 'bg-green-100 text-green-800' },
    CANCELADO: { label: 'Cancelado', class: 'bg-gray-100 text-gray-500' }
};

const PARCELA_BADGES = {
    PENDENTE: { label: 'Pendente', class: 'bg-gray-100 text-gray-700' },
    PAGO: { label: 'Pago', class: 'bg-green-100 text-green-700' },
    VENCIDO: { label: 'Vencido', class: 'bg-red-100 text-red-700' },
    CANCELADO: { label: 'Cancelado', class: 'bg-gray-100 text-gray-400' }
};

const loadSavedFilters = () => {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    } catch { return {}; }
};

const ContasReceberPage = () => {
    const { user } = useAuth();
    const podeBaixar = user?.permissoes?.admin || user?.permissoes?.Pode_Baixar_Contas_Receber;
    const podeReverter = user?.permissoes?.admin || user?.permissoes?.Pode_Reverter_Especial;
    const podeReverterCancelamento = user?.permissoes?.admin || user?.permissoes?.Pode_Reverter_Cancelamento_CR;

    const saved = loadSavedFilters();

    const [contas, setContas] = useState([]);
    const [indicadores, setIndicadores] = useState({});
    const [loading, setLoading] = useState(false);
    const [expandido, setExpandido] = useState(null);

    // Filtros (inicializa com valores salvos)
    const [filtroStatus, setFiltroStatus] = useState(saved.status || '');
    const [filtroBusca, setFiltroBusca] = useState(saved.busca || '');
    const [filtroOrigem, setFiltroOrigem] = useState(saved.origem || '');
    const [filtroVencDe, setFiltroVencDe] = useState(saved.vencDe || '');
    const [filtroVencAte, setFiltroVencAte] = useState(saved.vencAte || '');
    const [ordenarPor, setOrdenarPor] = useState(saved.ordenarPor || 'vencimento');
    const [showFiltros, setShowFiltros] = useState(false);

    // Modal baixa
    const [baixaModal, setBaixaModal] = useState(null);
    const [baixaForm, setBaixaForm] = useState({
        valorPago: '', formaPagamento: '', dataPagamento: '', observacao: ''
    });
    const [salvandoBaixa, setSalvandoBaixa] = useState(false);

    // Seleção em lote
    const [selecionadas, setSelecionadas] = useState(new Set());
    const [baixaLoteModal, setBaixaLoteModal] = useState(false);
    const [baixaLoteForm, setBaixaLoteForm] = useState({
        formaPagamento: '', dataPagamento: '', observacao: ''
    });
    const [salvandoLote, setSalvandoLote] = useState(false);

    const todasParcelasElegiveis = contas.flatMap(c =>
        (c.parcelas || []).filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO')
    );

    const toggleSelecionada = (parcelaId) => {
        setSelecionadas(prev => {
            const next = new Set(prev);
            if (next.has(parcelaId)) next.delete(parcelaId);
            else next.add(parcelaId);
            return next;
        });
    };

    const toggleContaParcelas = (conta) => {
        const elegiveis = (conta.parcelas || []).filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO');
        if (elegiveis.length === 0) return;
        const todasSelecionadas = elegiveis.every(p => selecionadas.has(p.id));
        setSelecionadas(prev => {
            const next = new Set(prev);
            elegiveis.forEach(p => {
                if (todasSelecionadas) next.delete(p.id);
                else next.add(p.id);
            });
            return next;
        });
    };

    const contaTemElegivel = (conta) =>
        (conta.parcelas || []).some(p => p.status === 'PENDENTE' || p.status === 'VENCIDO');

    const contaTodasSelecionadas = (conta) => {
        const elegiveis = (conta.parcelas || []).filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO');
        return elegiveis.length > 0 && elegiveis.every(p => selecionadas.has(p.id));
    };

    const contaAlgumaSelecionada = (conta) =>
        (conta.parcelas || []).some(p => selecionadas.has(p.id));

    const toggleTodasContas = () => {
        const todasElegiveis = contas.flatMap(c =>
            (c.parcelas || []).filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO')
        );
        const todasJaSelecionadas = todasElegiveis.length > 0 && todasElegiveis.every(p => selecionadas.has(p.id));
        setSelecionadas(prev => {
            const next = new Set(prev);
            todasElegiveis.forEach(p => {
                if (todasJaSelecionadas) next.delete(p.id);
                else next.add(p.id);
            });
            return next;
        });
    };

    const abrirBaixaLote = () => {
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        setBaixaLoteForm({ formaPagamento: '', dataPagamento: hoje, observacao: '' });
        setBaixaLoteModal(true);
    };

    const handleDarBaixaLote = async () => {
        if (selecionadas.size === 0) return;
        try {
            setSalvandoLote(true);
            const result = await contasReceberService.darBaixaLote({
                parcelaIds: [...selecionadas],
                formaPagamento: baixaLoteForm.formaPagamento || null,
                dataPagamento: baixaLoteForm.dataPagamento || null,
                observacao: baixaLoteForm.observacao || null
            });
            toast.success(result.message);
            setBaixaLoteModal(false);
            setSelecionadas(new Set());
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao dar baixa em lote.');
        } finally {
            setSalvandoLote(false);
        }
    };

    const valorTotalSelecionadas = todasParcelasElegiveis
        .filter(p => selecionadas.has(p.id))
        .reduce((sum, p) => sum + Number(p.valor || 0), 0);

    const saveFilters = useCallback((overrides = {}) => {
        const filters = {
            status: filtroStatus,
            busca: filtroBusca,
            origem: filtroOrigem,
            vencDe: filtroVencDe,
            vencAte: filtroVencAte,
            ordenarPor,
            ...overrides
        };
        localStorage.setItem(LS_KEY, JSON.stringify(filters));
    }, [filtroStatus, filtroBusca, filtroOrigem, filtroVencDe, filtroVencAte, ordenarPor]);

    const fetchData = useCallback(async (overrides = {}) => {
        try {
            setLoading(true);
            const filtros = {};
            const s = overrides.status ?? filtroStatus;
            const b = overrides.busca ?? filtroBusca;
            const o = overrides.origem ?? filtroOrigem;
            const vd = overrides.vencDe ?? filtroVencDe;
            const va = overrides.vencAte ?? filtroVencAte;
            const ord = overrides.ordenarPor ?? ordenarPor;

            if (s) filtros.status = s;
            if (b) filtros.busca = b;
            if (o) filtros.origem = o;
            if (vd) filtros.vencimentoDe = vd;
            if (va) filtros.vencimentoAte = va;
            if (ord) filtros.ordenarPor = ord;

            const data = await contasReceberService.listar(filtros);
            let contasResult = data.contas || [];

            // Ordenar por próximo vencimento no frontend
            if (ord === 'vencimento') {
                contasResult.sort((a, b) => {
                    const va = a.proximoVencimento ? new Date(a.proximoVencimento) : new Date('2099-12-31');
                    const vb = b.proximoVencimento ? new Date(b.proximoVencimento) : new Date('2099-12-31');
                    return va - vb;
                });
            }

            setContas(contasResult);
            setIndicadores(data.indicadores || {});
        } catch (error) {
            toast.error('Erro ao carregar contas a receber.');
        } finally {
            setLoading(false);
        }
    }, [filtroStatus, filtroBusca, filtroOrigem, filtroVencDe, filtroVencAte, ordenarPor]);

    useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleFiltrar = () => {
        saveFilters();
        fetchData();
    };

    const handleLimparFiltros = () => {
        setFiltroStatus('');
        setFiltroBusca('');
        setFiltroOrigem('');
        setFiltroVencDe('');
        setFiltroVencAte('');
        setOrdenarPor('vencimento');
        const cleared = { status: '', busca: '', origem: '', vencDe: '', vencAte: '', ordenarPor: 'vencimento' };
        localStorage.setItem(LS_KEY, JSON.stringify(cleared));
        fetchData(cleared);
    };

    const handleOrdenarChange = (val) => {
        setOrdenarPor(val);
        saveFilters({ ordenarPor: val });
        fetchData({ ordenarPor: val });
    };

    const abrirBaixa = (parcela) => {
        setBaixaModal(parcela);
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        setBaixaForm({
            valorPago: String(parcela.valor),
            formaPagamento: '',
            dataPagamento: hoje,
            observacao: ''
        });
    };

    const handleDarBaixa = async () => {
        if (!baixaModal) return;
        try {
            setSalvandoBaixa(true);
            await contasReceberService.darBaixa(baixaModal.id, {
                valorPago: parseFloat(baixaForm.valorPago) || baixaModal.valor,
                formaPagamento: baixaForm.formaPagamento || null,
                dataPagamento: baixaForm.dataPagamento || null,
                observacao: baixaForm.observacao || null
            });
            toast.success('Baixa realizada!');
            setBaixaModal(null);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao dar baixa.');
        } finally {
            setSalvandoBaixa(false);
        }
    };

    const handleEstornar = async (parcelaId) => {
        if (!confirm('Estornar esta baixa? O pagamento será removido.')) return;
        try {
            await contasReceberService.estornarBaixa(parcelaId);
            toast.success('Baixa estornada!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao estornar.');
        }
    };

    const handleCancelar = async (contaId) => {
        if (!confirm('Cancelar esta conta? Parcelas pendentes serão canceladas.')) return;
        try {
            await contasReceberService.cancelar(contaId);
            toast.success('Conta cancelada!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao cancelar.');
        }
    };

    const handleReverterQuitacao = async (contaId) => {
        if (!confirm('Reverter quitação? Todos os pagamentos desta conta serão estornados e as parcelas voltarão para PENDENTE.')) return;
        try {
            await contasReceberService.reverterQuitacao(contaId);
            toast.success('Quitação revertida!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter quitação.');
        }
    };

    const handleReverterCancelamento = async (contaId) => {
        if (!confirm('Reverter cancelamento? As parcelas canceladas voltarão para PENDENTE.')) return;
        try {
            await contasReceberService.reverterCancelamento(contaId);
            toast.success('Cancelamento revertido!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter cancelamento.');
        }
    };

    const getParcelaStatusClass = (parcela) => {
        if (parcela.status === 'PAGO') return 'border-green-200 bg-green-50';
        if (parcela.status === 'CANCELADO') return 'border-gray-200 bg-gray-50';
        const venc = new Date(parcela.dataVencimento);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        venc.setHours(0, 0, 0, 0);
        if (venc < hoje) return 'border-red-300 bg-red-50';
        if (venc.getTime() === hoje.getTime()) return 'border-yellow-300 bg-yellow-50';
        return 'border-gray-200 bg-white';
    };

    const hasActiveFilters = filtroStatus || filtroBusca || filtroOrigem || filtroVencDe || filtroVencAte;

    return (
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <DollarSign className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600 flex-shrink-0" />
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">Contas a Receber</h1>
                </div>
                <button
                    onClick={() => setShowFiltros(!showFiltros)}
                    className="relative flex items-center gap-1.5 px-2.5 py-2 text-sm bg-white border rounded-md hover:bg-gray-50 flex-shrink-0"
                >
                    <Filter className="h-4 w-4" />
                    <span className="hidden sm:inline">Filtros</span>
                    {hasActiveFilters && (
                        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 bg-primary rounded-full" />
                    )}
                </button>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6">
                <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-4">
                    <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Total em Aberto</p>
                    <p className="text-base sm:text-xl font-bold text-gray-900">R$ {fmt(indicadores.totalEmAberto)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-red-200 p-3 sm:p-4">
                    <div className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
                        <p className="text-[10px] sm:text-xs text-red-600 font-medium">Vencidas</p>
                    </div>
                    <p className="text-base sm:text-xl font-bold text-red-700">R$ {fmt(indicadores.totalVencidas)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-yellow-200 p-3 sm:p-4">
                    <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500" />
                        <p className="text-[10px] sm:text-xs text-yellow-600 font-medium">A vencer (7 dias)</p>
                    </div>
                    <p className="text-base sm:text-xl font-bold text-yellow-700">R$ {fmt(indicadores.totalAVencer7d)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-green-200 p-3 sm:p-4">
                    <div className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
                        <p className="text-[10px] sm:text-xs text-green-600 font-medium">Quitadas no mês</p>
                    </div>
                    <p className="text-base sm:text-xl font-bold text-green-700">R$ {fmt(indicadores.totalQuitadasMes)}</p>
                </div>
            </div>

            {/* Filtros */}
            {showFiltros && (
                <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-4 mb-4 sm:mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Cliente</label>
                            <div className="relative mt-1">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={filtroBusca}
                                    onChange={(e) => setFiltroBusca(e.target.value)}
                                    placeholder="Buscar..."
                                    className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Status</label>
                            <select
                                value={filtroStatus}
                                onChange={(e) => setFiltroStatus(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                            >
                                <option value="">Todos</option>
                                <option value="ABERTO">Aberto</option>
                                <option value="PARCIAL">Parcial</option>
                                <option value="QUITADO">Quitado</option>
                                <option value="CANCELADO">Cancelado</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Origem</label>
                            <select
                                value={filtroOrigem}
                                onChange={(e) => setFiltroOrigem(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                            >
                                <option value="">Todas</option>
                                <option value="ESPECIAL">Especial</option>
                                <option value="FATURADO_CA">Faturado CA</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Ordenar por</label>
                            <select
                                value={ordenarPor}
                                onChange={(e) => handleOrdenarChange(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                            >
                                <option value="vencimento">Vencimento (mais próximo)</option>
                                <option value="recente">Mais recente</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Vencimento de</label>
                            <input type="date" value={filtroVencDe} onChange={(e) => setFiltroVencDe(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Vencimento até</label>
                            <input type="date" value={filtroVencAte} onChange={(e) => setFiltroVencAte(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <button onClick={handleLimparFiltros} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">
                            Limpar
                        </button>
                        <button onClick={handleFiltrar} className="px-4 py-1.5 text-sm bg-primary text-white rounded-md font-medium hover:bg-blue-700">
                            Filtrar
                        </button>
                    </div>
                </div>
            )}

            {/* Ordenação rápida (fora do painel de filtros) */}
            {!showFiltros && (
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{contas.length} conta{contas.length !== 1 ? 's' : ''}</span>
                        {podeBaixar && todasParcelasElegiveis.length > 0 && (
                            <button
                                onClick={toggleTodasContas}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-700 font-medium"
                            >
                                {todasParcelasElegiveis.length > 0 && todasParcelasElegiveis.every(p => selecionadas.has(p.id))
                                    ? <><CheckSquare className="h-3.5 w-3.5 text-green-600" /> Desmarcar todas</>
                                    : <><Square className="h-3.5 w-3.5" /> Selecionar todas</>}
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => handleOrdenarChange(ordenarPor === 'vencimento' ? 'recente' : 'vencimento')}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                        <ArrowUpDown className="h-3 w-3" />
                        {ordenarPor === 'vencimento' ? 'Por vencimento' : 'Mais recente'}
                    </button>
                </div>
            )}

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
                    Carregando...
                </div>
            ) : contas.length === 0 ? (
                <div className="text-center text-gray-400 py-20">Nenhuma conta a receber encontrada.</div>
            ) : (
                <div className="space-y-2 sm:space-y-3">
                    {contas.map(conta => {
                        const isExpanded = expandido === conta.id;
                        const badge = STATUS_BADGES[conta.status] || STATUS_BADGES.ABERTO;

                        return (
                            <div key={conta.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                                {/* Header da conta */}
                                <div
                                    className="p-3 sm:p-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                                    onClick={() => setExpandido(isExpanded ? null : conta.id)}
                                >
                                    {/* Mobile layout */}
                                    <div className="sm:hidden">
                                        <div className="flex items-start justify-between gap-2">
                                            {podeBaixar && contaTemElegivel(conta) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleContaParcelas(conta); }}
                                                    className="mt-0.5 flex-shrink-0"
                                                >
                                                    {contaTodasSelecionadas(conta)
                                                        ? <CheckSquare className="h-4.5 w-4.5 text-green-600" />
                                                        : contaAlgumaSelecionada(conta)
                                                            ? <CheckSquare className="h-4.5 w-4.5 text-green-400" />
                                                            : <Square className="h-4.5 w-4.5 text-gray-300" />}
                                                </button>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-gray-900 text-sm truncate">{conta.clienteNome}</p>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    {conta.pedidoNumero && (
                                                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                            {conta.pedidoEspecial ? 'ZZ' : ''}#{conta.pedidoNumero}
                                                        </span>
                                                    )}
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.class}`}>
                                                        {badge.label}
                                                    </span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${conta.origem === 'ESPECIAL' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                                                        {conta.origem === 'ESPECIAL' ? 'ESP' : 'FAT'}
                                                    </span>
                                                    {conta.devolucaoFinalizada && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-200 text-gray-600">
                                                            DEV. {conta.devolucaoEscopo === 'TOTAL' ? 'TOTAL' : 'PARCIAL'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <span className="text-sm font-bold text-gray-900">R$ {fmt(conta.valorTotal)}</span>
                                                {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                                            <span>{conta.parcelasPagas}/{conta.parcelasTotal} parc.</span>
                                            {conta.condicaoPagamento && <span>{conta.condicaoPagamento}</span>}
                                            {conta.proximoVencimento && (
                                                <span>
                                                    Venc.: {new Date(conta.proximoVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                </span>
                                            )}
                                        </div>
                                        {conta.valorDevolvido > 0 && (
                                            <div className="mt-1 text-[11px] text-gray-500">
                                                <span className="text-red-600 font-medium">Devolvido: R$ {fmt(conta.valorDevolvido)}</span>
                                                {conta.status === 'QUITADO' && <span className="ml-1">— Pago: R$ {fmt(conta.parcelas.reduce((s, p) => s + (p.valorPago || 0), 0))}</span>}
                                            </div>
                                        )}
                                    </div>

                                    {/* Desktop layout */}
                                    <div className="hidden sm:flex items-center justify-between">
                                        {podeBaixar && contaTemElegivel(conta) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleContaParcelas(conta); }}
                                                className="mr-3 flex-shrink-0"
                                            >
                                                {contaTodasSelecionadas(conta)
                                                    ? <CheckSquare className="h-5 w-5 text-green-600" />
                                                    : contaAlgumaSelecionada(conta)
                                                        ? <CheckSquare className="h-5 w-5 text-green-400" />
                                                        : <Square className="h-5 w-5 text-gray-300" />}
                                            </button>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-gray-900 truncate">{conta.clienteNome}</span>
                                                {conta.pedidoNumero && (
                                                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                        {conta.pedidoEspecial ? 'ZZ' : ''}#{conta.pedidoNumero}
                                                    </span>
                                                )}
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.class}`}>
                                                    {badge.label}
                                                </span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${conta.origem === 'ESPECIAL' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                                                    {conta.origem === 'ESPECIAL' ? 'ESPECIAL' : 'FATURADO'}
                                                </span>
                                                {conta.devolucaoFinalizada && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-200 text-gray-600">
                                                        DEV. {conta.devolucaoEscopo === 'TOTAL' ? 'TOTAL' : 'PARCIAL'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                                <span>Parcelas: {conta.parcelasPagas}/{conta.parcelasTotal}</span>
                                                {conta.condicaoPagamento && <span>{conta.condicaoPagamento}</span>}
                                                {conta.proximoVencimento && (
                                                    <span>
                                                        Próx. venc.: {new Date(conta.proximoVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                    </span>
                                                )}
                                                {conta.valorDevolvido > 0 && (
                                                    <span className="text-red-600 font-medium">
                                                        Devolvido: R$ {fmt(conta.valorDevolvido)}
                                                        {conta.status === 'QUITADO' && <span className="text-gray-500 font-normal ml-1">— Pago: R$ {fmt(conta.parcelas.reduce((s, p) => s + (p.valorPago || 0), 0))}</span>}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <p className="text-lg font-bold text-gray-900">R$ {fmt(conta.valorTotal)}</p>
                                            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Parcelas expandidas */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100 p-3 sm:p-4 bg-gray-50">
                                        {podeBaixar && contaTemElegivel(conta) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleContaParcelas(conta); }}
                                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-700 mb-2 font-medium"
                                            >
                                                {contaTodasSelecionadas(conta)
                                                    ? <><CheckSquare className="h-3.5 w-3.5 text-green-600" /> Desmarcar todas</>
                                                    : <><Square className="h-3.5 w-3.5" /> Selecionar todas pendentes</>}
                                            </button>
                                        )}
                                        <div className="space-y-2">
                                            {conta.parcelas.map(p => {
                                                const pBadge = PARCELA_BADGES[p.status] || PARCELA_BADGES.PENDENTE;
                                                const statusClass = getParcelaStatusClass(p);

                                                return (
                                                    <div key={p.id} className={`rounded-lg border p-2.5 sm:p-3 ${statusClass}`}>
                                                        {/* Mobile parcela */}
                                                        <div className="sm:hidden">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    {podeBaixar && (p.status === 'PENDENTE' || p.status === 'VENCIDO') && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); toggleSelecionada(p.id); }}
                                                                            className="text-gray-400 hover:text-green-600 flex-shrink-0"
                                                                        >
                                                                            {selecionadas.has(p.id)
                                                                                ? <CheckSquare className="h-4 w-4 text-green-600" />
                                                                                : <Square className="h-4 w-4" />}
                                                                        </button>
                                                                    )}
                                                                    <span className="text-xs font-bold text-gray-700">
                                                                        {p.numeroParcela}/{conta.parcelasTotal}
                                                                    </span>
                                                                    <span className="text-sm font-medium text-gray-900">R$ {fmt(p.valor)}</span>
                                                                </div>
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pBadge.class}`}>
                                                                    {pBadge.label}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between mt-1.5">
                                                                <div className="text-[11px] text-gray-500">
                                                                    <span>Venc.: {new Date(p.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                                                                    {p.dataPagamento && (
                                                                        <span className="ml-2 text-green-600">
                                                                            Pago: {new Date(p.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                                        </span>
                                                                    )}
                                                                    {p.valorPago && p.valorPago !== p.valor && (
                                                                        <span className="ml-1 text-green-600">(pago: R$ {fmt(p.valorPago)})</span>
                                                                    )}
                                                                    {p.status === 'PAGO' && conta.valorDevolvido > 0 && (
                                                                        <span className="ml-1 text-red-500">(dev: R$ {fmt(conta.valorDevolvido)})</span>
                                                                    )}
                                                                    {p.formaPagamento && <span className="ml-1">({p.formaPagamento})</span>}
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    {podeBaixar && (p.status === 'PENDENTE' || p.status === 'VENCIDO') && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); abrirBaixa(p); }}
                                                                            className="px-2.5 py-1 text-[11px] bg-green-600 text-white rounded-md font-medium hover:bg-green-700 active:bg-green-800"
                                                                        >
                                                                            Baixa
                                                                        </button>
                                                                    )}
                                                                    {podeBaixar && p.status === 'PAGO' && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleEstornar(p.id); }}
                                                                            className="p-1 text-amber-700 bg-amber-100 rounded-md hover:bg-amber-200 active:bg-amber-300"
                                                                            title="Estornar"
                                                                        >
                                                                            <Undo2 className="h-3.5 w-3.5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Desktop parcela */}
                                                        <div className="hidden sm:flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                {podeBaixar && (p.status === 'PENDENTE' || p.status === 'VENCIDO') && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); toggleSelecionada(p.id); }}
                                                                        className="text-gray-400 hover:text-green-600 flex-shrink-0"
                                                                    >
                                                                        {selecionadas.has(p.id)
                                                                            ? <CheckSquare className="h-4 w-4 text-green-600" />
                                                                            : <Square className="h-4 w-4" />}
                                                                    </button>
                                                                )}
                                                                <span className="text-sm font-bold text-gray-700 w-8">
                                                                    {p.numeroParcela}/{conta.parcelasTotal}
                                                                </span>
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-900">
                                                                        R$ {fmt(p.valor)}
                                                                        {p.valorPago && p.valorPago !== p.valor && (
                                                                            <span className="text-xs text-green-600 ml-2">(pago: R$ {fmt(p.valorPago)})</span>
                                                                        )}
                                                                        {p.status === 'PAGO' && conta.valorDevolvido > 0 && (
                                                                            <span className="text-xs text-red-500 ml-1">(devolvido: R$ {fmt(conta.valorDevolvido)})</span>
                                                                        )}
                                                                    </p>
                                                                    <p className="text-xs text-gray-500">
                                                                        Venc.: {new Date(p.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                                        {p.dataPagamento && (
                                                                            <span className="ml-2 text-green-600">
                                                                                Pago em: {new Date(p.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                                            </span>
                                                                        )}
                                                                        {p.formaPagamento && <span className="ml-2">({p.formaPagamento})</span>}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pBadge.class}`}>
                                                                    {pBadge.label}
                                                                </span>
                                                                {podeBaixar && (p.status === 'PENDENTE' || p.status === 'VENCIDO') && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); abrirBaixa(p); }}
                                                                        className="px-3 py-1 text-xs bg-green-600 text-white rounded-md font-medium hover:bg-green-700"
                                                                    >
                                                                        Dar Baixa
                                                                    </button>
                                                                )}
                                                                {podeBaixar && p.status === 'PAGO' && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleEstornar(p.id); }}
                                                                        className="px-2 py-1 text-xs text-amber-700 bg-amber-100 rounded-md font-medium hover:bg-amber-200"
                                                                        title="Estornar baixa"
                                                                    >
                                                                        <Undo2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Ações da conta */}
                                        {(podeBaixar || podeReverter || podeReverterCancelamento) && (
                                            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end gap-2 flex-wrap">
                                                {podeReverterCancelamento && conta.status === 'CANCELADO' && (
                                                    <button
                                                        onClick={() => handleReverterCancelamento(conta.id)}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 active:bg-blue-200 font-medium"
                                                    >
                                                        <Undo2 className="h-3.5 w-3.5" /> Reverter Cancelamento
                                                    </button>
                                                )}
                                                {podeReverter && (conta.status === 'QUITADO' || conta.status === 'PARCIAL') && (
                                                    <button
                                                        onClick={() => handleReverterQuitacao(conta.id)}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 active:bg-amber-200 font-medium"
                                                    >
                                                        <Undo2 className="h-3.5 w-3.5" /> Reverter Quitação
                                                    </button>
                                                )}
                                                {podeBaixar && conta.status !== 'QUITADO' && conta.status !== 'CANCELADO' && (
                                                    <button
                                                        onClick={() => handleCancelar(conta.id)}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-md hover:bg-red-100 active:bg-red-200 font-medium"
                                                    >
                                                        <Ban className="h-3.5 w-3.5" /> Cancelar Conta
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Barra de seleção em lote */}
            {selecionadas.size > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-green-700 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 sm:gap-4 max-w-lg w-[calc(100%-2rem)]">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{selecionadas.size} parcela{selecionadas.size !== 1 ? 's' : ''} selecionada{selecionadas.size !== 1 ? 's' : ''}</p>
                        <p className="text-xs text-green-200">Total: R$ {fmt(valorTotalSelecionadas)}</p>
                    </div>
                    <button
                        onClick={() => setSelecionadas(new Set())}
                        className="px-3 py-1.5 text-xs bg-green-600 rounded-md hover:bg-green-500 font-medium"
                    >
                        Limpar
                    </button>
                    <button
                        onClick={abrirBaixaLote}
                        className="px-4 py-1.5 text-sm bg-white text-green-700 rounded-md font-bold hover:bg-green-50"
                    >
                        Dar Baixa
                    </button>
                </div>
            )}

            {/* Modal de Baixa em Lote */}
            {baixaLoteModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
                    <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-md sm:mx-4 p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Baixa em Lote</h3>
                            <button onClick={() => setBaixaLoteModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="bg-gray-50 rounded-md p-3 mb-4 text-sm">
                            <p className="text-gray-600"><strong>{selecionadas.size}</strong> parcela{selecionadas.size !== 1 ? 's' : ''}</p>
                            <p className="text-gray-600">Total: <strong>R$ {fmt(valorTotalSelecionadas)}</strong></p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Forma de Pagamento</label>
                                <input
                                    type="text"
                                    value={baixaLoteForm.formaPagamento}
                                    onChange={(e) => setBaixaLoteForm(prev => ({ ...prev, formaPagamento: e.target.value }))}
                                    placeholder="Dinheiro, PIX, Transferência..."
                                    className="w-full mt-1 px-3 py-2.5 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Data do Pagamento</label>
                                <input
                                    type="date"
                                    value={baixaLoteForm.dataPagamento}
                                    onChange={(e) => setBaixaLoteForm(prev => ({ ...prev, dataPagamento: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2.5 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Observação</label>
                                <textarea
                                    value={baixaLoteForm.observacao}
                                    onChange={(e) => setBaixaLoteForm(prev => ({ ...prev, observacao: e.target.value }))}
                                    rows={2}
                                    placeholder="Opcional..."
                                    className="w-full mt-1 px-3 py-2.5 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 mt-5">
                            <button
                                onClick={() => setBaixaLoteModal(false)}
                                className="flex-1 sm:flex-none px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDarBaixaLote}
                                disabled={salvandoLote}
                                className="flex-1 sm:flex-none px-4 py-2.5 text-sm bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                                {salvandoLote ? 'Processando...' : `Confirmar Baixa (${selecionadas.size})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Baixa */}
            {baixaModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
                    <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-md sm:mx-4 p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Dar Baixa</h3>
                            <button onClick={() => setBaixaModal(null)} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="bg-gray-50 rounded-md p-3 mb-4 text-sm">
                            <p className="text-gray-600">Parcela <strong>{baixaModal.numeroParcela}</strong></p>
                            <p className="text-gray-600">Valor: <strong>R$ {fmt(baixaModal.valor)}</strong></p>
                            <p className="text-gray-600">Vencimento: <strong>{new Date(baixaModal.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</strong></p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Valor Pago (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={baixaForm.valorPago}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, valorPago: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2.5 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Forma de Pagamento</label>
                                <input
                                    type="text"
                                    value={baixaForm.formaPagamento}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, formaPagamento: e.target.value }))}
                                    placeholder="Dinheiro, PIX, Transferência..."
                                    className="w-full mt-1 px-3 py-2.5 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Data do Pagamento</label>
                                <input
                                    type="date"
                                    value={baixaForm.dataPagamento}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, dataPagamento: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2.5 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Observação</label>
                                <textarea
                                    value={baixaForm.observacao}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, observacao: e.target.value }))}
                                    rows={2}
                                    placeholder="Opcional..."
                                    className="w-full mt-1 px-3 py-2.5 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 mt-5">
                            <button
                                onClick={() => setBaixaModal(null)}
                                className="flex-1 sm:flex-none px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDarBaixa}
                                disabled={salvandoBaixa}
                                className="flex-1 sm:flex-none px-4 py-2.5 text-sm bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                                {salvandoBaixa ? 'Salvando...' : 'Confirmar Baixa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContasReceberPage;
