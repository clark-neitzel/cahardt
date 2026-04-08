import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import caixaService from '../../services/caixaService';
import vendedorService from '../../services/vendedorService';
import { Link, useNavigate } from 'react-router-dom';
import {
    Wallet, Truck, Fuel, Package, CheckCircle, AlertTriangle,
    Lock, Printer, ClipboardCheck, ChevronDown, ChevronUp, ReceiptText, Plus, Undo2, FlaskConical, Edit3, RotateCcw, Home, MapPin, DollarSign, Loader2, RefreshCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import NovaDespesaModal from './NovaDespesaModal';
import VeiculoFicha from '../Veiculos/VeiculoFicha';
import ModalDevolucao from '../Pedidos/ModalDevolucao';

const SESSION_KEY = '@CAHardt:CaixaFiltros';

const STATUS_BADGES = {
    ABERTO: { label: 'Aberto', class: 'bg-green-100 text-green-800' },
    FECHADO: { label: 'Fechado', class: 'bg-yellow-100 text-yellow-800' },
    CONFERIDO: { label: 'Conferido', class: 'bg-blue-100 text-blue-800' }
};

const CaixaDiarioPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Caixa;
    // Permissão específica para definir adiantamento (admin ou quem tiver a flag)
    const podeDefinirAdiantamento = user?.permissoes?.admin
        || user?.permissoes?.Pode_Editar_Caixa
        || user?.permissoes?.Pode_Definir_Adiantamento;
    // Permissão para ver caixas de outros dias (sem essa flag, o usuário vê APENAS hoje)
    const podeVerHistorico = user?.permissoes?.admin
        || user?.permissoes?.Pode_Editar_Caixa
        || user?.permissoes?.Pode_Ver_Historico_Caixa;
    const podeReverter = user?.permissoes?.admin || user?.permissoes?.Pode_Reverter_Caixa;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Restaurar filtros da sessão se existirem
    const restoreSession = () => {
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (saved) return JSON.parse(saved);
        } catch { }
        return null;
    };

    const session = restoreSession();
    // Se pode ver histórico, restaura data salva; caso contrário, sempre hoje
    const [data, setData] = useState(podeVerHistorico ? (session?.data || today) : today);
    const [vendedorId, setVendedorId] = useState(
        // Não-admin: SEMPRE o próprio user.id — nunca restaura da sessão
        // Admin: restaura da sessão para manter o vendedor que estava visualizando
        isAdmin ? (session?.vendedorId || '') : (user?.id || '')
    );
    const [vendedores, setVendedores] = useState([]);
    const [resumo, setResumo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [adiantamento, setAdiantamento] = useState('');
    const [savingAdiantamento, setSavingAdiantamento] = useState(false);
    const [expandedEntregas, setExpandedEntregas] = useState(false);
    const [expandedAmostras, setExpandedAmostras] = useState(false);
    const [obsAdmin, setObsAdmin] = useState('');
    const [showDespesaModal, setShowDespesaModal] = useState(false);
    const [veiculoFichaId, setVeiculoFichaId] = useState(null);
    const [editandoKm, setEditandoKm] = useState(false);
    const [kmInicialEdit, setKmInicialEdit] = useState('');
    // Baixa CA
    const [selectedBaixa, setSelectedBaixa] = useState(new Set());
    const [quitandoCA, setQuitandoCA] = useState(false);
    // Devolução
    const podeFazerDevolucao = user?.permissoes?.admin || user?.permissoes?.Pode_Fazer_Devolucao;
    const [modalDevolucao, setModalDevolucao] = useState(null); // { pedidoId, ... }

    // Persistir filtros na sessão sempre que mudarem
    useEffect(() => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data, vendedorId }));
    }, [data, vendedorId]);

    useEffect(() => {
        if (isAdmin) {
            vendedorService.listar().then(res => setVendedores(res || [])).catch(() => { });
        }
    }, [isAdmin]);

    useEffect(() => {
        if (vendedorId && data) fetchResumo();
    }, [vendedorId, data]);

    const fetchResumo = async () => {
        try {
            setLoading(true);
            const res = await caixaService.getResumo(data, vendedorId);
            setResumo(res);
            setAdiantamento(String(res.caixa?.adiantamento || '0'));
        } catch (error) {
            console.error('Erro ao buscar resumo:', error);
            toast.error('Erro ao carregar caixa.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAdiantamento = async () => {
        try {
            setSavingAdiantamento(true);
            await caixaService.setAdiantamento({ vendedorId, data, valor: parseFloat(adiantamento) || 0 });
            toast.success('Adiantamento atualizado!');
            fetchResumo();
        } catch (error) {
            toast.error('Erro ao salvar adiantamento.');
        } finally {
            setSavingAdiantamento(false);
        }
    };

    const handleFechar = async () => {
        if (!confirm('Fechar o caixa do dia? Isso salvará os totais atuais.')) return;
        try {
            await caixaService.fecharCaixa({ vendedorId, data });
            toast.success('Caixa fechado!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao fechar caixa.');
        }
    };

    const handleConferir = async () => {
        if (!confirm('Confirmar conferência deste caixa?')) return;
        try {
            await caixaService.conferirCaixa({ id: resumo.caixa.id, obsAdmin });
            toast.success('Caixa conferido!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao conferir.');
        }
    };

    const handleToggleEntregaConferida = async (pedidoId, conferido) => {
        try {
            await caixaService.conferirEntrega({ caixaId: resumo.caixa.id, pedidoId, conferido });
            fetchResumo();
        } catch (error) {
            toast.error('Erro ao marcar entrega.');
        }
    };

    const handleReverterConferencia = async () => {
        if (!confirm('Reverter a conferência deste caixa? O status voltará para FECHADO.')) return;
        try {
            await caixaService.reverterConferencia(resumo.caixa.id);
            toast.success('Conferência revertida!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter conferência.');
        }
    };

    const handleReabrirCaixa = async () => {
        if (!confirm('Reabrir este caixa? O status voltará para ABERTO e os totais serão recalculados ao fechar novamente.')) return;
        try {
            await caixaService.reabrirCaixa(resumo.caixa.id);
            toast.success('Caixa reaberto!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reabrir caixa.');
        }
    };

    // Verifica se uma entrega é elegível para baixa: tem pagamento REAL em dinheiro
    // (não Pix, não Boleto, não fiado/vendedor responsável, não escritório responsável)
    const isElegivelBaixa = (entrega) => {
        if (entrega.statusEntrega === 'DEVOLVIDO') return false;
        if (entrega.quitado === 'QUITADO') return false;
        return entrega.pagamentos?.some(p =>
            p.debitaCaixa &&
            !p.vendedorResponsavelId &&
            !p.escritorioResponsavel &&
            p.formaNome?.toLowerCase().includes('dinheiro')
        );
    };

    const handleToggleBaixa = (pedidoId) => {
        setSelectedBaixa(prev => {
            const next = new Set(prev);
            if (next.has(pedidoId)) next.delete(pedidoId);
            else next.add(pedidoId);
            return next;
        });
    };

    const handleSelectAllDinheiro = () => {
        if (!resumo?.entregas) return;
        const dinheiroIds = resumo.entregas.filter(isElegivelBaixa).map(e => e.pedidoId);
        setSelectedBaixa(prev => {
            const allSelected = dinheiroIds.length > 0 && dinheiroIds.every(id => prev.has(id));
            if (allSelected) return new Set();
            return new Set(dinheiroIds);
        });
    };

    const handleQuitarCA = async () => {
        if (selectedBaixa.size === 0) {
            toast.error('Selecione ao menos uma entrega para quitar.');
            return;
        }
        const ids = Array.from(selectedBaixa);
        const nomes = resumo.entregas?.filter(e => ids.includes(e.pedidoId)).map(e => e.clienteNome).join(', ');
        if (!confirm(`Quitar ${ids.length} entrega(s) no Conta Azul (caixinha)?\n\n${nomes}`)) return;

        try {
            setQuitandoCA(true);
            const result = await caixaService.quitarCA(ids, data);
            const ok = result.resultados?.filter(r => r.status === 'OK') || [];
            const erros = result.resultados?.filter(r => r.status === 'ERRO') || [];
            const jaQuitados = result.resultados?.filter(r => r.status === 'JA_QUITADO') || [];

            if (ok.length > 0) toast.success(`${ok.length} baixa(s) criada(s) no CA!`);
            if (jaQuitados.length > 0) toast.success(`${jaQuitados.length} já quitada(s).`);
            if (erros.length > 0) {
                erros.forEach(e => toast.error(`${e.cliente}: ${e.erro}`, { duration: 6000 }));
            }

            setSelectedBaixa(new Set());
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao quitar no CA.');
        } finally {
            setQuitandoCA(false);
        }
    };

    if (!vendedorId && !isAdmin) {
        return (
            <div className="container mx-auto px-4 py-6 text-center text-gray-500">
                Nenhum vendedor vinculado a este usuário.
            </div>
        );
    }

    const caixa = resumo?.caixa;
    const statusBadge = caixa ? STATUS_BADGES[caixa.status] || STATUS_BADGES.ABERTO : null;
    const isAberto = caixa?.status === 'ABERTO';

    return (
        <div className="container mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center space-x-3">
                    <Wallet className="h-7 w-7 text-amber-600" />
                    <h1 className="text-2xl font-bold text-gray-800">Caixa Diário</h1>
                    {statusBadge && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusBadge.class}`}>
                            {statusBadge.label}
                        </span>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <input
                        type="date"
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        disabled={!podeVerHistorico}
                        max={!podeVerHistorico ? today : undefined}
                        className={`border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm bg-white text-gray-900 ${!podeVerHistorico ? 'opacity-60 cursor-not-allowed' : ''
                            }`}
                        title={!podeVerHistorico ? 'Você só pode visualizar o caixa do dia atual.' : ''}
                    />
                    {isAdmin && (
                        <select
                            value={vendedorId}
                            onChange={(e) => setVendedorId(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm bg-white text-gray-900"
                        >
                            <option value="">Selecione vendedor...</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>{v.nome}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
                    Carregando caixa...
                </div>
            ) : !resumo ? (
                <div className="text-center text-gray-400 py-20">Selecione vendedor e data para abrir o caixa.</div>
            ) : (
                <div className="space-y-6">
                    {/* Card Header: Veículo + Adiantamento + Média */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Veículo / Diário */}
                        <div
                            className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${resumo.diario?.veiculoId ? 'cursor-pointer hover:border-sky-300 hover:bg-sky-50/40' : ''}`}
                            onClick={() => resumo.diario?.veiculoId && setVeiculoFichaId(resumo.diario.veiculoId)}
                            title={resumo.diario?.veiculoId ? 'Abrir resumo do veículo' : ''}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                    <Truck className="h-5 w-5 text-sky-600" />
                                    <h3 className="text-sm font-semibold text-gray-700">Diário do Dia</h3>
                                </div>
                                {resumo.diario?.modo && (
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                        resumo.diario.modo === 'PRESENCIAL'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {resumo.diario.modo === 'PRESENCIAL'
                                            ? <><MapPin className="h-3 w-3" /> Presencial</>
                                            : <><Home className="h-3 w-3" /> Home Office</>
                                        }
                                    </span>
                                )}
                            </div>
                            {resumo.diario ? (
                                <div className="text-sm text-gray-600">
                                    {resumo.diario.placa ? (
                                        <p className="font-medium text-gray-900">{resumo.diario.placa} — {resumo.diario.modelo}</p>
                                    ) : (
                                        <p className="text-gray-400 italic text-xs">Sem veículo (Home Office)</p>
                                    )}
                                    {resumo.diario.modo === 'PRESENCIAL' && (
                                        <>
                                            {editandoKm ? (
                                                <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                                                    <input type="number" className="w-24 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                                                        value={kmInicialEdit} onChange={e => setKmInicialEdit(e.target.value)} autoFocus />
                                                    <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                                                        onClick={async () => {
                                                            try {
                                                                await api.put(`/diarios/${resumo.diario.id}/km`, { kmInicial: parseInt(kmInicialEdit) });
                                                                toast.success('KM inicial atualizado!');
                                                                setEditandoKm(false);
                                                                fetchResumo();
                                                            } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar KM.'); }
                                                        }}>OK</button>
                                                    <button className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setEditandoKm(false)}>✕</button>
                                                </div>
                                            ) : (
                                                <p className="text-xs mt-1">
                                                    KM: {resumo.diario.kmInicial || '—'} → {resumo.diario.kmFinal || '—'}
                                                    {resumo.diario.totalKm > 0 && <span className="ml-1 font-medium">({resumo.diario.totalKm} km)</span>}
                                                    {isAdmin && resumo.diario.id && (
                                                        <button className="ml-2 text-indigo-500 hover:text-indigo-700" title="Editar KM inicial"
                                                            onClick={(e) => { e.stopPropagation(); setKmInicialEdit(String(resumo.diario.kmInicial || '')); setEditandoKm(true); }}>
                                                            <Edit3 className="h-3 w-3 inline" />
                                                        </button>
                                                    )}
                                                </p>
                                            )}
                                        </>
                                    )}
                                    {resumo.diario.veiculoId && (
                                        <p className="text-[11px] text-sky-700 mt-2">Clique para ver Resumo, Documentos e Manutenção</p>
                                    )}
                                    {isAdmin && resumo.diario.id && (
                                        <button
                                            className="mt-2 inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                                            title="Apagar diário para que o vendedor possa iniciar novamente"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!confirm('Reiniciar o diário deste vendedor? Ele precisará escolher o modo novamente (Home Office / Presencial).')) return;
                                                try {
                                                    await api.delete(`/diarios/${resumo.diario.id}`);
                                                    toast.success('Diário reiniciado! O vendedor poderá escolher o modo novamente.');
                                                    fetchResumo();
                                                } catch (err) {
                                                    toast.error(err.response?.data?.error || 'Erro ao reiniciar diário.');
                                                }
                                            }}
                                        >
                                            <RotateCcw className="h-3 w-3" /> Reiniciar Diário
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">Sem diário iniciado no dia</p>
                            )}
                        </div>

                        {/* Adiantamento */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Adiantamento (R$)</h3>
                            {podeDefinirAdiantamento ? (
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={adiantamento}
                                        onChange={(e) => setAdiantamento(e.target.value)}
                                        disabled={!isAberto}
                                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm disabled:bg-gray-100 bg-white text-gray-900"
                                    />
                                    {isAberto && (
                                        <button
                                            onClick={handleSaveAdiantamento}
                                            disabled={savingAdiantamento}
                                            className="px-3 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                                        >
                                            {savingAdiantamento ? '...' : 'Salvar'}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                // Sem permissão: apenas exibe o valor, sem editar
                                <div className="flex items-center space-x-2">
                                    <p className="text-2xl font-bold text-gray-900">
                                        R$ {Number(resumo.caixa?.adiantamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">somente leitura</span>
                                </div>
                            )}
                        </div>

                        {/* Média Combustível */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <Fuel className="h-5 w-5 text-orange-500" />
                                <h3 className="text-sm font-semibold text-gray-700">Média Combustível (3 meses)</h3>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">
                                {resumo.mediaCombustivel3Meses ? `${resumo.mediaCombustivel3Meses.toFixed(2)} km/L` : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Card Despesas */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                                <ReceiptText className="h-5 w-5 text-red-500" />
                                <h3 className="text-sm font-semibold text-gray-700">Despesas do Dia</h3>
                            </div>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={() => setShowDespesaModal(true)}
                                    className="inline-flex items-center text-xs px-2 py-1 bg-primary text-white rounded font-medium hover:bg-blue-700"
                                >
                                    <Plus className="h-3 w-3 mr-1" /> Nova Despesa
                                </button>
                                <Link
                                    to={`/despesas?data=${data}&vendedorId=${vendedorId}&from=caixa`}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Ver todas →
                                </Link>
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-red-600">
                            R$ {Number(resumo.totalDespesas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{resumo.despesas?.length || 0} lançamentos</p>
                    </div>

                    {/* Card Entregas */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                                <Package className="h-5 w-5 text-green-600" />
                                <h3 className="text-sm font-semibold text-gray-700">Entregas do Dia</h3>
                            </div>
                            <button
                                onClick={() => setExpandedEntregas(!expandedEntregas)}
                                className="text-xs text-gray-500 flex items-center hover:text-gray-700"
                            >
                                {expandedEntregas ? 'Recolher' : 'Expandir'}
                                {expandedEntregas ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                            </button>
                        </div>

                        {/* Contagens */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            <div className="text-center p-2 bg-gray-50 rounded">
                                <p className="text-lg font-bold text-gray-900">{resumo.contagens?.totalEntregas || 0}</p>
                                <p className="text-xs text-gray-500">Total</p>
                            </div>
                            <div className="text-center p-2 bg-green-50 rounded">
                                <p className="text-lg font-bold text-green-700">{resumo.contagens?.entregues || 0}</p>
                                <p className="text-xs text-green-600">Entregues</p>
                            </div>
                            <div className="text-center p-2 bg-yellow-50 rounded">
                                <p className="text-lg font-bold text-yellow-700">{resumo.contagens?.parciais || 0}</p>
                                <p className="text-xs text-yellow-600">Parciais</p>
                            </div>
                            <div className="text-center p-2 bg-red-50 rounded">
                                <p className="text-lg font-bold text-red-700">{resumo.contagens?.devolvidos || 0}</p>
                                <p className="text-xs text-red-600">Devolvidos</p>
                            </div>
                        </div>

                        {/* Totais Recebidos */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-xs text-green-600 font-medium">Recebido (Caixa)</p>
                                <p className="text-lg font-bold text-green-800">
                                    R$ {Number(resumo.totalRecebidoCaixa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-xs text-blue-600 font-medium">Recebido (Outros)</p>
                                <p className="text-lg font-bold text-blue-800">
                                    R$ {Number(resumo.totalRecebidoOutros || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        {/* Lista de Entregas Expandida */}
                        {expandedEntregas && resumo.entregas && (
                            <div className="border-t border-gray-200 pt-4">
                                {/* Barra de seleção para baixa CA */}
                                {isAdmin && (
                                    <div className="flex flex-wrap items-center gap-2 mb-3 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                                        <DollarSign className="h-4 w-4 text-indigo-600" />
                                        <span className="text-xs font-medium text-indigo-700">Baixa CA:</span>
                                        <button
                                            onClick={handleSelectAllDinheiro}
                                            className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 font-medium"
                                        >
                                            {selectedBaixa.size > 0 ? 'Limpar Seleção' : 'Selecionar Dinheiro'}
                                        </button>
                                        {selectedBaixa.size > 0 && (
                                            <button
                                                onClick={handleQuitarCA}
                                                disabled={quitandoCA}
                                                className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-medium disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {quitandoCA ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />}
                                                Quitar {selectedBaixa.size} no CA
                                            </button>
                                        )}
                                        {selectedBaixa.size > 0 && (
                                            <span className="text-xs text-indigo-500">{selectedBaixa.size} selecionada(s)</span>
                                        )}
                                    </div>
                                )}

                                {/* Desktop */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-gray-500 uppercase border-b">
                                                {isAdmin && <th className="py-2 px-2 text-center w-10">✓</th>}
                                                {isAdmin && <th className="py-2 px-2 text-center w-10" title="Selecionar para baixa CA">CA</th>}
                                                <th className="py-2 px-2 text-left">Nº</th>
                                                <th className="py-2 px-2 text-left">Cliente</th>
                                                <th className="py-2 px-2 text-left">Cond. Pgto</th>
                                                <th className="py-2 px-2 text-right">Valor</th>
                                                <th className="py-2 px-2 text-center">Status</th>
                                                <th className="py-2 px-2 text-left">Pagamentos</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {resumo.entregas.map((e) => {
                                                const elegivel = isElegivelBaixa(e);
                                                return (
                                                <tr key={e.pedidoId} className={`hover:bg-gray-50 ${selectedBaixa.has(e.pedidoId) ? 'bg-indigo-50' : ''}`}>
                                                    {isAdmin && (
                                                        <td className="py-2 px-2 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!e.conferida}
                                                                onChange={(ev) => handleToggleEntregaConferida(e.pedidoId, ev.target.checked)}
                                                                className="h-4 w-4 text-green-600 rounded"
                                                            />
                                                        </td>
                                                    )}
                                                    {isAdmin && (
                                                        <td className="py-2 px-2 text-center">
                                                            {elegivel && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedBaixa.has(e.pedidoId)}
                                                                    onChange={() => handleToggleBaixa(e.pedidoId)}
                                                                    className="h-4 w-4 rounded text-indigo-600"
                                                                    title="Selecionar para baixa (dinheiro)"
                                                                />
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="py-2 px-2 text-gray-500 text-sm">{e.numero}</td>
                                                    <td className="py-2 px-2 font-medium text-gray-900">
                                                        {e.clienteNome}
                                                        {e.especial && <span className="ml-1.5 text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">ESPECIAL</span>}
                                                        {e.quitado === 'QUITADO' && <span className="ml-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">QUITADO</span>}
                                                        {e.quitado === 'PARCIAL' && <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">PARCIAL</span>}
                                                        {e.devolucaoFinalizada && <span className="ml-1.5 text-[10px] font-bold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">DEV. FEITA</span>}
                                                    </td>
                                                    <td className="py-2 px-2 text-gray-500">{e.condicaoPagamento}</td>
                                                    <td className="py-2 px-2 text-right font-medium">
                                                        R$ {Number(e.valorPedido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-2 px-2 text-center">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.statusEntrega === 'ENTREGUE' ? 'bg-green-100 text-green-700' :
                                                            e.statusEntrega === 'PARCIAL' ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-red-100 text-red-700'
                                                            }`}>
                                                            {e.statusEntrega}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-2 text-xs text-gray-500">
                                                        {e.pagamentos?.map((p, i) => (
                                                            <span key={i} className={`mr-2 ${p.debitaCaixa ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                                                                {p.formaNome}: R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        ))}
                                                        {podeFazerDevolucao && ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada && (
                                                            <button
                                                                onClick={() => setModalDevolucao(e)}
                                                                className="ml-1 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200"
                                                            >
                                                                Fazer Devolução
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile */}
                                <div className="md:hidden space-y-3">
                                    {resumo.entregas.map((e) => (
                                        <div key={e.pedidoId} className={`rounded-lg p-3 border ${selectedBaixa.has(e.pedidoId) ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-200'}`}>
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <p className="font-medium text-gray-900 text-sm">
                                                        <span className="text-gray-500 mr-1">#{e.numero}</span>
                                                        {e.clienteNome}
                                                        {e.especial && <span className="ml-1.5 text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">ESPECIAL</span>}
                                                        {e.quitado === 'QUITADO' && <span className="ml-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">QUITADO</span>}
                                                        {e.quitado === 'PARCIAL' && <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">PARCIAL</span>}
                                                        {e.devolucaoFinalizada && <span className="ml-1.5 text-[10px] font-bold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">DEV. FEITA</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{e.condicaoPagamento}</p>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {e.pagamentos?.map((p, i) => (
                                                            <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${p.debitaCaixa ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                                                {p.formaNome}: R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="text-right ml-3">
                                                    <p className="font-bold text-gray-900 text-sm">
                                                        R$ {Number(e.valorPedido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.statusEntrega === 'ENTREGUE' ? 'bg-green-100 text-green-700' :
                                                        e.statusEntrega === 'PARCIAL' ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        {e.statusEntrega}
                                                    </span>
                                                    {isAdmin && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!e.conferida}
                                                                onChange={(ev) => handleToggleEntregaConferida(e.pedidoId, ev.target.checked)}
                                                                className="h-4 w-4 text-green-600 rounded"
                                                                title="Conferir"
                                                            />
                                                            {isElegivelBaixa(e) && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedBaixa.has(e.pedidoId)}
                                                                    onChange={() => handleToggleBaixa(e.pedidoId)}
                                                                    className="h-4 w-4 text-indigo-600 rounded"
                                                                    title="Baixa (dinheiro)"
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                    {podeFazerDevolucao && ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada && (
                                                        <button
                                                            onClick={() => setModalDevolucao(e)}
                                                            className="mt-2 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded border border-red-200"
                                                        >
                                                            Fazer Devolução
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card Amostras */}
                    {(resumo.amostrasCount > 0) && (
                        <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-2">
                                    <FlaskConical className="h-5 w-5 text-orange-500" />
                                    <h3 className="text-sm font-semibold text-gray-700">Amostras Entregues</h3>
                                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        {resumo.amostrasCount}
                                    </span>
                                    <span className="text-xs text-gray-400">(sem valor financeiro)</span>
                                </div>
                                <button
                                    onClick={() => setExpandedAmostras(!expandedAmostras)}
                                    className="text-xs text-gray-500 flex items-center hover:text-gray-700"
                                >
                                    {expandedAmostras ? 'Recolher' : 'Expandir'}
                                    {expandedAmostras ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                                </button>
                            </div>

                            {expandedAmostras && resumo.amostras && (
                                <div className="border-t border-orange-100 pt-3 space-y-2">
                                    {resumo.amostras.map((am) => (
                                        <div key={am.id} className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-medium text-gray-900 text-sm">
                                                        AM#{am.numero} — {am.destinatario}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        Solicitado por: {am.vendedorNome}
                                                    </p>
                                                    {am.itens && am.itens.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {am.itens.map((item, i) => (
                                                                <span key={i} className="text-xs bg-white text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">
                                                                    {item.nome} × {item.quantidade}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                    ENTREGUE
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* VALOR A PRESTAR */}
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-6">
                        <p className="text-sm font-medium text-amber-700 mb-1 text-center">VALOR A PRESTAR</p>
                        <p className="text-4xl font-black text-amber-900 text-center">
                            R$ {Number(resumo.valorAPrestar || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>

                        {/* Detalhamento */}
                        <div className="mt-4 border-t border-amber-200 pt-3 space-y-1 text-sm">
                            {Number(resumo.caixa?.adiantamento || 0) > 0 && (
                                <div className="flex justify-between text-green-700">
                                    <span>+ Adiantamento</span>
                                    <span className="font-medium">R$ {Number(resumo.caixa.adiantamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* Condições que debitam do caixa */}
                            {(resumo.detalhamentoCaixa || []).filter(d => d.debitaCaixa).map((d, i) => (
                                <div key={i} className="flex justify-between text-green-700">
                                    <span>+ {d.condicao}</span>
                                    <span className="font-medium">R$ {Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            ))}

                            {/* Despesas */}
                            {Number(resumo.totalDespesas || 0) > 0 && (
                                <div className="flex justify-between text-red-700">
                                    <span>− Despesas</span>
                                    <span className="font-medium">R$ {Number(resumo.totalDespesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* Separador */}
                            {(resumo.detalhamentoCaixa || []).some(d => !d.debitaCaixa) && (
                                <>
                                    <div className="border-t border-amber-200 my-2"></div>
                                    <p className="text-xs text-amber-600 font-medium">Outros (não debitam do caixa):</p>
                                    {(resumo.detalhamentoCaixa || []).filter(d => !d.debitaCaixa).map((d, i) => (
                                        <div key={i} className="flex justify-between text-gray-500">
                                            <span>{d.condicao}</span>
                                            <span>R$ {Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Devolvidos */}
                            {(resumo.contagens?.devolvidos || 0) > 0 && (
                                <div className="flex justify-between text-gray-400 text-xs italic mt-1">
                                    <span>{resumo.contagens.devolvidos} devolução(ões) — não descontam</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Ações */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {isAberto && (
                            <button
                                onClick={handleFechar}
                                className="inline-flex items-center justify-center px-6 py-3 bg-yellow-600 text-white rounded-md font-medium hover:bg-yellow-700"
                            >
                                <Lock className="h-5 w-5 mr-2" /> Fechar Caixa
                            </button>
                        )}

                        <button
                            onClick={() => navigate(`/caixa/impressao?data=${data}&vendedorId=${vendedorId}`)}
                            className="inline-flex items-center justify-center px-6 py-3 bg-gray-600 text-white rounded-md font-medium hover:bg-gray-700"
                        >
                            <Printer className="h-5 w-5 mr-2" /> Imprimir
                        </button>

                        {isAdmin && caixa?.status === 'FECHADO' && (
                            <div className="flex flex-col sm:flex-row items-center gap-2">
                                <input
                                    type="text"
                                    value={obsAdmin}
                                    onChange={(e) => setObsAdmin(e.target.value)}
                                    placeholder="Observação (opcional)"
                                    className="border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm w-full sm:w-48 bg-white text-gray-900"
                                />
                                <button
                                    onClick={handleConferir}
                                    className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 whitespace-nowrap"
                                >
                                    <ClipboardCheck className="h-5 w-5 mr-2" /> Conferir Caixa
                                </button>
                            </div>
                        )}

                        {podeReverter && caixa?.status === 'CONFERIDO' && (
                            <button
                                onClick={handleReverterConferencia}
                                className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-500 text-white rounded-md font-medium hover:bg-amber-600 text-sm"
                            >
                                <Undo2 className="h-4 w-4 mr-2" /> Reverter Conferência
                            </button>
                        )}

                        {podeReverter && caixa?.status === 'FECHADO' && (
                            <button
                                onClick={handleReabrirCaixa}
                                className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-500 text-white rounded-md font-medium hover:bg-amber-600 text-sm"
                            >
                                <Undo2 className="h-4 w-4 mr-2" /> Reabrir Caixa
                            </button>
                        )}
                    </div>
                </div>
            )}
            {showDespesaModal && (
                <NovaDespesaModal
                    onClose={() => setShowDespesaModal(false)}
                    onSaved={() => { setShowDespesaModal(false); toast.success('Despesa criada!'); fetchResumo(); }}
                    vendedorId={vendedorId}
                    dataReferencia={data}
                    veiculoDoDia={resumo?.diario?.veiculoId || null}
                />
            )}
            {veiculoFichaId && (
                <VeiculoFicha
                    veiculoId={veiculoFichaId}
                    onClose={() => setVeiculoFichaId(null)}
                    readOnly={true}
                    allowedTabs={['resumo', 'documentos', 'manutencao']}
                />
            )}

            {modalDevolucao && (
                <ModalDevolucao
                    entrega={modalDevolucao}
                    onClose={() => setModalDevolucao(null)}
                    onSalvo={() => {
                        setModalDevolucao(null);
                        toast.success('Devolução registrada!');
                        carregarResumo();
                    }}
                />
            )}
        </div>
    );
};

export default CaixaDiarioPage;
