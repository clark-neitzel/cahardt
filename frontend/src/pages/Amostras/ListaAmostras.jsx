import React, { useState, useEffect, useCallback } from 'react';
import { Package, Filter, Loader, ChevronDown, ChevronUp, User, Clock, Plus } from 'lucide-react';
import amostraService from '../../services/amostraService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import ModalAmostra from './ModalAmostra';

const STATUS_CONFIG = {
    SOLICITADA: { label: 'Solicitada', color: 'bg-yellow-100 text-yellow-700', next: 'PREPARANDO' },
    PREPARANDO: { label: 'Preparando', color: 'bg-blue-100 text-blue-700', next: 'ENVIADA' },
    ENVIADA: { label: 'Enviada', color: 'bg-purple-100 text-purple-700', next: 'ENTREGUE' },
    ENTREGUE: { label: 'Entregue', color: 'bg-green-100 text-green-700', next: null },
    CANCELADA: { label: 'Cancelada', color: 'bg-red-100 text-red-700', next: null }
};

const ListaAmostras = () => {
    const { user } = useAuth();
    const perms = user?.permissoes || {};
    const podeGerenciar = perms.Pode_Gerenciar_Amostras || perms.admin;

    const [amostras, setAmostras] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filtroStatus, setFiltroStatus] = useState('');
    const [expandido, setExpandido] = useState(null); // id da amostra expandida
    const [mudandoStatus, setMudandoStatus] = useState(null); // id da amostra sendo atualizada
    const [modalAberto, setModalAberto] = useState(false);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (filtroStatus) params.status = filtroStatus;
            const data = await amostraService.listar(params);
            setAmostras(data.amostras || []);
            setTotal(data.total || 0);
        } catch {
            toast.error('Erro ao carregar amostras.');
        } finally {
            setLoading(false);
        }
    }, [filtroStatus]);

    useEffect(() => { carregar(); }, [carregar]);

    const handleAvancarStatus = async (amostra) => {
        const cfg = STATUS_CONFIG[amostra.status];
        if (!cfg?.next) return;
        try {
            setMudandoStatus(amostra.id);
            await amostraService.mudarStatus(amostra.id, cfg.next);
            toast.success(`Status alterado para: ${STATUS_CONFIG[cfg.next].label}`);
            carregar();
        } catch {
            toast.error('Erro ao alterar status.');
        } finally {
            setMudandoStatus(null);
        }
    };

    const handleCancelar = async (amostra) => {
        if (amostra.status !== 'SOLICITADA') {
            toast.error('Só é possível cancelar amostras solicitadas.');
            return;
        }
        if (!window.confirm('Cancelar esta amostra?')) return;
        try {
            setMudandoStatus(amostra.id);
            await amostraService.cancelar(amostra.id);
            toast.success('Amostra cancelada.');
            carregar();
        } catch {
            toast.error('Erro ao cancelar.');
        } finally {
            setMudandoStatus(null);
        }
    };

    const formatDate = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const statusFiltros = ['', 'SOLICITADA', 'PREPARANDO', 'ENVIADA', 'ENTREGUE', 'CANCELADA'];

    return (
        <div className="container mx-auto px-4 py-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Package className="h-6 w-6 text-orange-500" />
                        Amostras
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {podeGerenciar ? 'Todas as amostras' : 'Suas amostras'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {total > 0 && (
                        <span className="text-sm font-semibold text-gray-500">{total} amostra{total !== 1 ? 's' : ''}</span>
                    )}
                    <button
                        onClick={() => setModalAberto(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-600 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Nova
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-1.5 mb-4 items-center">
                <Filter className="h-3.5 w-3.5 text-gray-400" />
                {statusFiltros.map(s => (
                    <button
                        key={s || 'TODOS'}
                        onClick={() => setFiltroStatus(s)}
                        className={`px-3 py-1 rounded-full text-[12px] font-semibold border transition-colors ${filtroStatus === s
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {s ? STATUS_CONFIG[s].label : 'Todas'}
                    </button>
                ))}
            </div>

            {/* Lista */}
            {loading ? (
                <div className="text-center py-12 text-gray-400">
                    <Loader className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Carregando...
                </div>
            ) : amostras.length === 0 ? (
                <div className="text-center py-12">
                    <Package className="h-12 w-12 text-orange-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Nenhuma amostra encontrada</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {amostras.map(a => {
                        const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.SOLICITADA;
                        const isExpanded = expandido === a.id;
                        return (
                            <div key={a.id} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                                {/* Card principal */}
                                <div
                                    className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => setExpandido(isExpanded ? null : a.id)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[14px] font-bold text-gray-900">
                                                Amostra #{a.numero}
                                            </span>
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                                                {cfg.label}
                                            </span>
                                        </div>
                                        {a.lead && (
                                            <p className="text-[12px] text-gray-600 truncate">
                                                Lead #{a.lead.numero} · {a.lead.nomeEstabelecimento}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                {a.solicitadoPor?.nome || 'Desconhecido'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatDate(a.createdAt)}
                                            </span>
                                            <span className="text-gray-400">
                                                {a.itens?.length || 0} {(a.itens?.length || 0) === 1 ? 'item' : 'itens'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {/* Botão avançar status */}
                                        {podeGerenciar && cfg.next && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleAvancarStatus(a); }}
                                                disabled={mudandoStatus === a.id}
                                                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
                                            >
                                                {mudandoStatus === a.id ? (
                                                    <Loader className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    `→ ${STATUS_CONFIG[cfg.next].label}`
                                                )}
                                            </button>
                                        )}
                                        {/* Cancelar */}
                                        {a.status === 'SOLICITADA' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleCancelar(a); }}
                                                disabled={mudandoStatus === a.id}
                                                className="px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-[11px] font-semibold transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                        )}
                                        {isExpanded ? (
                                            <ChevronUp className="h-4 w-4 text-gray-400" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-gray-400" />
                                        )}
                                    </div>
                                </div>

                                {/* Itens expandidos */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 border-t border-gray-50">
                                        {a.observacao && (
                                            <p className="text-[12px] text-gray-500 mt-3 mb-2 italic">"{a.observacao}"</p>
                                        )}
                                        <div className="mt-2 space-y-1">
                                            {(a.itens || []).map((item, idx) => (
                                                <div key={item.id || idx} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg text-[13px]">
                                                    <span className="text-gray-800 truncate">{item.produto?.nome || 'Produto'}</span>
                                                    <span className="font-semibold text-gray-900 flex-shrink-0 ml-3">
                                                        {parseFloat(item.quantidade)} {item.produto?.unidade || 'UN'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal Nova Amostra */}
            <ModalAmostra
                isOpen={modalAberto}
                onClose={() => setModalAberto(false)}
                onCriada={() => carregar()}
            />
        </div>
    );
};

export default ListaAmostras;
