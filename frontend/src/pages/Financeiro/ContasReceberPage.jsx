import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasReceberService from '../../services/contasReceberService';
import {
    DollarSign, ChevronDown, ChevronUp, Search, Filter, X,
    CheckCircle, AlertTriangle, Clock, Ban, Undo2
} from 'lucide-react';
import toast from 'react-hot-toast';

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

const ContasReceberPage = () => {
    const { user } = useAuth();
    const podeBaixar = user?.permissoes?.admin || user?.permissoes?.Pode_Baixar_Contas_Receber;

    const [contas, setContas] = useState([]);
    const [indicadores, setIndicadores] = useState({});
    const [loading, setLoading] = useState(false);
    const [expandido, setExpandido] = useState(null);

    // Filtros
    const [filtroStatus, setFiltroStatus] = useState('');
    const [filtroBusca, setFiltroBusca] = useState('');
    const [filtroOrigem, setFiltroOrigem] = useState('');
    const [filtroVencDe, setFiltroVencDe] = useState('');
    const [filtroVencAte, setFiltroVencAte] = useState('');
    const [showFiltros, setShowFiltros] = useState(false);

    // Modal baixa
    const [baixaModal, setBaixaModal] = useState(null); // parcela object
    const [baixaForm, setBaixaForm] = useState({
        valorPago: '', formaPagamento: '', dataPagamento: '', observacao: ''
    });
    const [salvandoBaixa, setSalvandoBaixa] = useState(false);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const filtros = {};
            if (filtroStatus) filtros.status = filtroStatus;
            if (filtroBusca) filtros.busca = filtroBusca;
            if (filtroOrigem) filtros.origem = filtroOrigem;
            if (filtroVencDe) filtros.vencimentoDe = filtroVencDe;
            if (filtroVencAte) filtros.vencimentoAte = filtroVencAte;

            const data = await contasReceberService.listar(filtros);
            setContas(data.contas || []);
            setIndicadores(data.indicadores || {});
        } catch (error) {
            toast.error('Erro ao carregar contas a receber.');
        } finally {
            setLoading(false);
        }
    };

    const handleFiltrar = () => { fetchData(); };

    const handleLimparFiltros = () => {
        setFiltroStatus('');
        setFiltroBusca('');
        setFiltroOrigem('');
        setFiltroVencDe('');
        setFiltroVencAte('');
        setTimeout(() => fetchData(), 0);
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

    return (
        <div className="container mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                    <DollarSign className="h-7 w-7 text-emerald-600" />
                    <h1 className="text-2xl font-bold text-gray-800">Contas a Receber</h1>
                </div>
                <button
                    onClick={() => setShowFiltros(!showFiltros)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded-md hover:bg-gray-50"
                >
                    <Filter className="h-4 w-4" />
                    Filtros
                    {showFiltros ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow-sm border p-4">
                    <p className="text-xs text-gray-500 font-medium">Total em Aberto</p>
                    <p className="text-xl font-bold text-gray-900">R$ {fmt(indicadores.totalEmAberto)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-red-200 p-4">
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <p className="text-xs text-red-600 font-medium">Vencidas</p>
                    </div>
                    <p className="text-xl font-bold text-red-700">R$ {fmt(indicadores.totalVencidas)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-yellow-200 p-4">
                    <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <p className="text-xs text-yellow-600 font-medium">A vencer (7 dias)</p>
                    </div>
                    <p className="text-xl font-bold text-yellow-700">R$ {fmt(indicadores.totalAVencer7d)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-green-200 p-4">
                    <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <p className="text-xs text-green-600 font-medium">Quitadas no mês</p>
                    </div>
                    <p className="text-xl font-bold text-green-700">R$ {fmt(indicadores.totalQuitadasMes)}</p>
                </div>
            </div>

            {/* Filtros */}
            {showFiltros && (
                <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
                    Carregando...
                </div>
            ) : contas.length === 0 ? (
                <div className="text-center text-gray-400 py-20">Nenhuma conta a receber encontrada.</div>
            ) : (
                <div className="space-y-3">
                    {contas.map(conta => {
                        const isExpanded = expandido === conta.id;
                        const badge = STATUS_BADGES[conta.status] || STATUS_BADGES.ABERTO;

                        return (
                            <div key={conta.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                                {/* Header da conta */}
                                <div
                                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => setExpandido(isExpanded ? null : conta.id)}
                                >
                                    <div className="flex items-center justify-between">
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
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                                <span>Parcelas: {conta.parcelasPagas}/{conta.parcelasTotal}</span>
                                                {conta.condicaoPagamento && <span>{conta.condicaoPagamento}</span>}
                                                {conta.proximoVencimento && (
                                                    <span>
                                                        Próx. venc.: {new Date(conta.proximoVencimento).toLocaleDateString('pt-BR')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-gray-900">R$ {fmt(conta.valorTotal)}</p>
                                            </div>
                                            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Parcelas expandidas */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                                        <div className="space-y-2">
                                            {conta.parcelas.map(p => {
                                                const pBadge = PARCELA_BADGES[p.status] || PARCELA_BADGES.PENDENTE;
                                                const statusClass = getParcelaStatusClass(p);

                                                return (
                                                    <div key={p.id} className={`rounded-lg border p-3 ${statusClass}`}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-sm font-bold text-gray-700 w-8">
                                                                    {p.numeroParcela}/{conta.parcelasTotal}
                                                                </span>
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-900">
                                                                        R$ {fmt(p.valor)}
                                                                        {p.valorPago && p.valorPago !== p.valor && (
                                                                            <span className="text-xs text-green-600 ml-2">(pago: R$ {fmt(p.valorPago)})</span>
                                                                        )}
                                                                    </p>
                                                                    <p className="text-xs text-gray-500">
                                                                        Venc.: {new Date(p.dataVencimento).toLocaleDateString('pt-BR')}
                                                                        {p.dataPagamento && (
                                                                            <span className="ml-2 text-green-600">
                                                                                Pago em: {new Date(p.dataPagamento).toLocaleDateString('pt-BR')}
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
                                        {podeBaixar && conta.status !== 'QUITADO' && conta.status !== 'CANCELADO' && (
                                            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
                                                <button
                                                    onClick={() => handleCancelar(conta.id)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-md hover:bg-red-100 font-medium"
                                                >
                                                    <Ban className="h-3.5 w-3.5" /> Cancelar Conta
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal de Baixa */}
            {baixaModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Dar Baixa na Parcela</h3>
                            <button onClick={() => setBaixaModal(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="bg-gray-50 rounded-md p-3 mb-4 text-sm">
                            <p className="text-gray-600">Parcela <strong>{baixaModal.numeroParcela}</strong></p>
                            <p className="text-gray-600">Valor: <strong>R$ {fmt(baixaModal.valor)}</strong></p>
                            <p className="text-gray-600">Vencimento: <strong>{new Date(baixaModal.dataVencimento).toLocaleDateString('pt-BR')}</strong></p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Valor Pago (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={baixaForm.valorPago}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, valorPago: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Forma de Pagamento</label>
                                <input
                                    type="text"
                                    value={baixaForm.formaPagamento}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, formaPagamento: e.target.value }))}
                                    placeholder="Dinheiro, PIX, Transferência..."
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Data do Pagamento</label>
                                <input
                                    type="date"
                                    value={baixaForm.dataPagamento}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, dataPagamento: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Observação</label>
                                <textarea
                                    value={baixaForm.observacao}
                                    onChange={(e) => setBaixaForm(prev => ({ ...prev, observacao: e.target.value }))}
                                    rows={2}
                                    placeholder="Opcional..."
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setBaixaModal(null)}
                                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDarBaixa}
                                disabled={salvandoBaixa}
                                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50"
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
