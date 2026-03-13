import React, { useState, useEffect, useCallback } from 'react';
import { ListChecks, Clock, AlertTriangle, CheckCircle2, ArrowRightLeft, X, Loader, Filter, User } from 'lucide-react';
import tarefaService from '../../services/tarefaService';
import vendedorService from '../../services/vendedorService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const FilaTarefas = () => {
    const { user } = useAuth();
    const perms = user?.permissoes || {};
    const podeVerTodas = perms.Pode_Ver_Todas_Tarefas || perms.admin;
    const podeTransferir = perms.Pode_Transferir_Tarefas || perms.admin;

    const [tarefas, setTarefas] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [vendedores, setVendedores] = useState([]);
    const [filtroStatus, setFiltroStatus] = useState('PENDENTE');
    const [filtroVendedor, setFiltroVendedor] = useState('');
    const [resumo, setResumo] = useState(null);

    // Modal de transferência
    const [transferindo, setTransferindo] = useState(null); // tarefa sendo transferida
    const [novoResponsavel, setNovoResponsavel] = useState('');
    const [savingTransfer, setSavingTransfer] = useState(false);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = { status: filtroStatus };
            if (podeVerTodas && filtroVendedor) params.responsavelId = filtroVendedor;

            const [filaData, resumoData] = await Promise.all([
                tarefaService.listarFila(params),
                podeVerTodas ? tarefaService.resumo().catch(() => null) : Promise.resolve(null)
            ]);

            setTarefas(filaData.tarefas || []);
            setTotal(filaData.total || 0);
            if (resumoData) setResumo(resumoData);
        } catch (err) {
            console.error(err);
            toast.error('Erro ao carregar tarefas.');
        } finally {
            setLoading(false);
        }
    }, [filtroStatus, filtroVendedor, podeVerTodas]);

    useEffect(() => { carregar(); }, [carregar]);

    useEffect(() => {
        if (podeVerTodas) {
            vendedorService.listar().then(data => {
                if (Array.isArray(data)) setVendedores(data.filter(v => v.ativo));
            }).catch(() => {});
        }
    }, [podeVerTodas]);

    const handleTransferir = async () => {
        if (!novoResponsavel || !transferindo) return;
        try {
            setSavingTransfer(true);
            await tarefaService.transferir(transferindo.id, novoResponsavel);
            toast.success('Tarefa transferida!');
            setTransferindo(null);
            setNovoResponsavel('');
            carregar();
        } catch {
            toast.error('Erro ao transferir tarefa.');
        } finally {
            setSavingTransfer(false);
        }
    };

    const handleCancelar = async (tarefaId) => {
        if (!window.confirm('Cancelar esta tarefa?')) return;
        try {
            await tarefaService.cancelar(tarefaId);
            toast.success('Tarefa cancelada.');
            carregar();
        } catch {
            toast.error('Erro ao cancelar.');
        }
    };

    const isVencida = (dataVencimento) => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        return new Date(dataVencimento) < hoje;
    };

    const isHoje = (dataVencimento) => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        const d = new Date(dataVencimento);
        return d >= hoje && d < amanha;
    };

    const formatDate = (d) => {
        return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    };

    return (
        <div className="container mx-auto px-4 py-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <ListChecks className="h-6 w-6 text-emerald-600" />
                        Fila de Tarefas
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {podeVerTodas ? 'Todas as tarefas do time' : 'Suas tarefas pendentes'}
                    </p>
                </div>
                {total > 0 && (
                    <span className="text-sm font-semibold text-gray-500">{total} tarefa{total !== 1 ? 's' : ''}</span>
                )}
            </div>

            {/* Resumo Admin */}
            {resumo && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className={`rounded-xl p-4 ${resumo.vencidas > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-100'}`}>
                        <div className="flex items-center gap-2">
                            <AlertTriangle className={`h-5 w-5 ${resumo.vencidas > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                            <div>
                                <p className={`text-2xl font-bold ${resumo.vencidas > 0 ? 'text-red-600' : 'text-gray-400'}`}>{resumo.vencidas}</p>
                                <p className="text-[11px] text-gray-500 font-medium">Vencidas</p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl p-4 bg-blue-50 border border-blue-100">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-blue-500" />
                            <div>
                                <p className="text-2xl font-bold text-blue-600">{resumo.hoje}</p>
                                <p className="text-[11px] text-gray-500 font-medium">Hoje</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filtros */}
            <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-gray-400" />
                    {['PENDENTE', 'CONCLUIDA', 'CANCELADA'].map(s => (
                        <button
                            key={s}
                            onClick={() => setFiltroStatus(s)}
                            className={`px-3 py-1 rounded-full text-[12px] font-semibold border transition-colors ${filtroStatus === s
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            {s === 'PENDENTE' ? 'Pendentes' : s === 'CONCLUIDA' ? 'Concluídas' : 'Canceladas'}
                        </button>
                    ))}
                </div>
                {podeVerTodas && vendedores.length > 0 && (
                    <select
                        value={filtroVendedor}
                        onChange={e => setFiltroVendedor(e.target.value)}
                        className="text-[12px] border border-gray-200 rounded-full px-3 py-1 bg-white text-gray-700"
                    >
                        <option value="">Todos os vendedores</option>
                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </select>
                )}
            </div>

            {/* Lista */}
            {loading ? (
                <div className="text-center py-12 text-gray-400">
                    <Loader className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Carregando...
                </div>
            ) : tarefas.length === 0 ? (
                <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Nenhuma tarefa {filtroStatus === 'PENDENTE' ? 'pendente' : filtroStatus.toLowerCase()}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {tarefas.map(t => {
                        const vencida = filtroStatus === 'PENDENTE' && isVencida(t.dataVencimento);
                        const hoje = filtroStatus === 'PENDENTE' && isHoje(t.dataVencimento);
                        return (
                            <div
                                key={t.id}
                                className={`rounded-xl border p-4 transition-colors ${
                                    vencida ? 'bg-red-50 border-red-200' :
                                    hoje ? 'bg-amber-50 border-amber-200' :
                                    'bg-white border-gray-100 hover:border-gray-200'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        {/* Ação + Badge */}
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[13px] font-bold ${vencida ? 'text-red-700' : 'text-gray-900'}`}>
                                                {t.acaoLabel}
                                            </span>
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                                t.contexto === 'LEAD' ? 'bg-purple-100 text-purple-700' :
                                                t.contexto === 'CLIENTE' ? 'bg-blue-100 text-blue-700' :
                                                t.contexto === 'POS_VENDA' ? 'bg-green-100 text-green-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {t.contexto}
                                            </span>
                                            {vencida && (
                                                <span className="text-[10px] font-bold text-red-600 flex items-center gap-0.5">
                                                    <AlertTriangle className="h-3 w-3" /> VENCIDA
                                                </span>
                                            )}
                                            {hoje && !vencida && (
                                                <span className="text-[10px] font-bold text-amber-600">HOJE</span>
                                            )}
                                        </div>

                                        {/* Lead/Cliente info */}
                                        {t.lead && (
                                            <p className="text-[12px] text-gray-600 truncate">
                                                Lead #{t.lead.numero} · {t.lead.nomeEstabelecimento}
                                                {t.lead.etapa && <span className="ml-1 text-gray-400">({t.lead.etapa})</span>}
                                            </p>
                                        )}

                                        {/* Descrição */}
                                        {t.descricao && (
                                            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{t.descricao}</p>
                                        )}

                                        {/* Footer: Responsável + Data */}
                                        <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                {t.responsavel?.nome || 'Sem responsável'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatDate(t.dataVencimento)}
                                            </span>
                                            {t.criadoPor && t.criadoPor.id !== t.responsavel?.id && (
                                                <span className="text-gray-400">
                                                    criada por {t.criadoPor.nome}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Ações */}
                                    {filtroStatus === 'PENDENTE' && (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {podeTransferir && (
                                                <button
                                                    onClick={() => { setTransferindo(t); setNovoResponsavel(''); }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                                                    title="Transferir"
                                                >
                                                    <ArrowRightLeft className="h-4 w-4" />
                                                </button>
                                            )}
                                            {(perms.admin || t.responsavel?.id === user?.id) && (
                                                <button
                                                    onClick={() => handleCancelar(t.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                    title="Cancelar"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Por Vendedor (Admin) */}
            {resumo?.porVendedor?.length > 0 && (
                <div className="mt-8 bg-white rounded-xl border border-gray-100 p-4">
                    <h3 className="text-[13px] font-bold text-gray-700 mb-3">Tarefas pendentes por vendedor</h3>
                    <div className="space-y-1.5">
                        {resumo.porVendedor.map(v => (
                            <div key={v.vendedorId} className="flex items-center justify-between text-[13px]">
                                <span className="text-gray-700">{v.nome}</span>
                                <span className="font-bold text-gray-900">{v.total}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal de Transferência */}
            {transferindo && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6">
                        <h3 className="font-bold text-[16px] text-gray-900 mb-1">Transferir Tarefa</h3>
                        <p className="text-[12px] text-gray-500 mb-4">
                            {transferindo.acaoLabel} — {transferindo.lead?.nomeEstabelecimento || 'Tarefa'}
                        </p>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Novo Responsável</label>
                        <select
                            value={novoResponsavel}
                            onChange={e => setNovoResponsavel(e.target.value)}
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] mb-4"
                        >
                            <option value="">Selecione...</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setTransferindo(null)}
                                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-[14px] font-semibold text-gray-600"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleTransferir}
                                disabled={!novoResponsavel || savingTransfer}
                                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {savingTransfer && <Loader className="h-4 w-4 animate-spin" />}
                                Transferir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FilaTarefas;
