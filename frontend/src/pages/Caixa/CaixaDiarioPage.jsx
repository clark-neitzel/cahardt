import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import caixaService from '../../services/caixaService';
import vendedorService from '../../services/vendedorService';
import { Link, useNavigate } from 'react-router-dom';
import {
    Wallet, Truck, Fuel, Package, CheckCircle, AlertTriangle,
    Lock, Printer, ClipboardCheck, ChevronDown, ChevronUp, ReceiptText, Plus
} from 'lucide-react';
import toast from 'react-hot-toast';
import NovaDespesaModal from './NovaDespesaModal';

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
    const [obsAdmin, setObsAdmin] = useState('');
    const [showDespesaModal, setShowDespesaModal] = useState(false);

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
                        {/* Veículo */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <Truck className="h-5 w-5 text-sky-600" />
                                <h3 className="text-sm font-semibold text-gray-700">Veículo do Dia</h3>
                            </div>
                            {resumo.diario ? (
                                <div className="text-sm text-gray-600">
                                    <p className="font-medium text-gray-900">{resumo.diario.placa} — {resumo.diario.modelo}</p>
                                    <p className="text-xs mt-1">
                                        KM: {resumo.diario.kmInicial || '—'} → {resumo.diario.kmFinal || '—'}
                                        {resumo.diario.totalKm > 0 && <span className="ml-1 font-medium">({resumo.diario.totalKm} km)</span>}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">Sem diário/veículo no dia</p>
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
                                {/* Desktop */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-gray-500 uppercase border-b">
                                                {isAdmin && <th className="py-2 px-2 text-center w-10">✓</th>}
                                                <th className="py-2 px-2 text-left">Cliente</th>
                                                <th className="py-2 px-2 text-left">Cond. Pgto</th>
                                                <th className="py-2 px-2 text-right">Valor</th>
                                                <th className="py-2 px-2 text-center">Status</th>
                                                <th className="py-2 px-2 text-left">Pagamentos</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {resumo.entregas.map((e) => (
                                                <tr key={e.pedidoId} className="hover:bg-gray-50">
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
                                                    <td className="py-2 px-2 font-medium text-gray-900">{e.clienteNome}</td>
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
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile */}
                                <div className="md:hidden space-y-3">
                                    {resumo.entregas.map((e) => (
                                        <div key={e.pedidoId} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <p className="font-medium text-gray-900 text-sm">{e.clienteNome}</p>
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
                                                        <div className="mt-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!e.conferida}
                                                                onChange={(ev) => handleToggleEntregaConferida(e.pedidoId, ev.target.checked)}
                                                                className="h-4 w-4 text-green-600 rounded"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

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
                    </div>
                </div>
            )}
            {showDespesaModal && (
                <NovaDespesaModal
                    onClose={() => setShowDespesaModal(false)}
                    onSaved={() => { setShowDespesaModal(false); toast.success('Despesa criada!'); fetchResumo(); }}
                    vendedorId={vendedorId}
                    dataReferencia={data}
                />
            )}
        </div>
    );
};

export default CaixaDiarioPage;
