import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Search, HandCoins } from 'lucide-react';
import toast from 'react-hot-toast';
import cobrancasRotaService from '../../../services/cobrancasRotaService';

const fmtMoeda = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

const STATUS_BADGE = {
    PENDENTE: { label: 'A cobrar', cls: 'bg-gray-100 text-gray-700' },
    COBRADA: { label: 'Cobrada (aguarda caixa)', cls: 'bg-blue-100 text-blue-800' },
    NAO_COBRADA: { label: 'Não cobrada', cls: 'bg-amber-100 text-amber-700' },
    BAIXADA: { label: 'Baixada no caixa', cls: 'bg-green-100 text-green-800' }
};

// Sub-modal: busca títulos em aberto por cliente e pendura na carga
const AdicionarCobrancasModal = ({ embarqueId, onClose, onSuccess }) => {
    const [q, setQ] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [selecionadas, setSelecionadas] = useState(new Set());
    const [salvando, setSalvando] = useState(false);
    const debounceRef = useRef(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const termo = q.trim();
        if (termo.length < 2) { setResultados([]); return; }
        debounceRef.current = setTimeout(async () => {
            try {
                setBuscando(true);
                const data = await cobrancasRotaService.buscarParcelasAbertas(termo);
                setResultados(data);
            } catch {
                toast.error('Erro ao buscar títulos.');
            } finally {
                setBuscando(false);
            }
        }, 350);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [q]);

    const toggle = (parcelaId) => {
        setSelecionadas(prev => {
            const next = new Set(prev);
            if (next.has(parcelaId)) next.delete(parcelaId); else next.add(parcelaId);
            return next;
        });
    };

    const handleAdicionar = async () => {
        if (selecionadas.size === 0) return;
        try {
            setSalvando(true);
            const r = await cobrancasRotaService.inserirNaCarga(embarqueId, Array.from(selecionadas));
            if (r.recusadas?.length > 0) {
                toast.error(`${r.recusadas.length} título(s) não entraram: ${r.recusadas[0].motivo}`);
            }
            if (r.criadas > 0) toast.success(`${r.criadas} cobrança(s) adicionada(s) à carga.`);
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao adicionar cobranças.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="bg-mint p-1.5 rounded-lg"><HandCoins className="h-4 w-4 text-primaryDark" /></div>
                        <h3 className="text-sm font-bold text-gray-900">Inserir Cobrança na Carga</h3>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 flex-shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            autoFocus
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Buscar cliente com título em aberto…"
                            className="w-full border border-gray-300 rounded px-3 py-2 pl-9 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">Digite ao menos 2 letras do nome do cliente. Vencidos aparecem primeiro.</p>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                    {buscando && <p className="text-sm text-gray-500 text-center py-6">Buscando…</p>}
                    {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-6">Nenhum título em aberto para essa busca.</p>
                    )}
                    {!buscando && resultados.map(p => {
                        const marcada = selecionadas.has(p.parcelaId);
                        const bloqueada = p.jaEmRota;
                        return (
                            <button
                                key={p.parcelaId}
                                disabled={bloqueada}
                                onClick={() => toggle(p.parcelaId)}
                                className={`w-full text-left border rounded-xl p-3 flex items-center gap-3 transition-colors ${bloqueada ? 'opacity-50 cursor-not-allowed border-gray-200' : marcada ? 'border-primary bg-mint/40' : 'border-gray-200 hover:bg-gray-50'}`}
                            >
                                <span className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center ${marcada ? 'bg-primary border-primary text-white' : 'border-gray-300'}`}>
                                    {marcada && <span className="text-xs font-bold">✓</span>}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-gray-900 text-sm truncate">{p.clienteNome}</div>
                                    <div className="text-xs text-gray-500">
                                        Parcela {p.numeroParcela}/{p.totalParcelas}{p.pedidoNumero ? ` · Pedido #${p.pedidoNumero}` : ''} · venc. {fmtData(p.dataVencimento)}
                                        {bloqueada ? ` · já em rota${p.jaEmRotaEmbarque ? ` (carga #${p.jaEmRotaEmbarque})` : ''}` : ''}
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-sm font-bold text-gray-900">{fmtMoeda(p.saldo)}</div>
                                    {p.vencida && <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">Vencida</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm hover:bg-gray-50">Cancelar</button>
                    <button
                        onClick={handleAdicionar}
                        disabled={selecionadas.size === 0 || salvando}
                        className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
                    >
                        {salvando ? 'Adicionando…' : `Adicionar ${selecionadas.size > 0 ? selecionadas.size : ''} cobrança(s)`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Seção "Cobranças na Carga" do modal de detalhes do embarque
const CobrancasCargaSection = ({ embarqueId }) => {
    const [cobrancas, setCobrancas] = useState([]);
    const [modalAberto, setModalAberto] = useState(false);
    const [removendo, setRemovendo] = useState(null);

    const fetchCobrancas = async () => {
        try {
            const data = await cobrancasRotaService.listarDaCarga(embarqueId);
            setCobrancas(data);
        } catch {
            // silencioso: seção é acessória, a carga continua funcionando sem ela
        }
    };

    useEffect(() => { fetchCobrancas(); }, [embarqueId]);

    const handleRemover = async (c) => {
        if (!window.confirm(`Tirar a cobrança de ${c.clienteNome} da carga?`)) return;
        try {
            setRemovendo(c.id);
            await cobrancasRotaService.remover(c.id);
            toast.success('Cobrança removida da carga.');
            fetchCobrancas();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao remover cobrança.');
        } finally {
            setRemovendo(null);
        }
    };

    return (
        <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-primaryDark uppercase flex items-center gap-2">
                    <HandCoins className="h-4 w-4" />
                    Cobranças na Carga ({cobrancas.length})
                </h4>
                <button
                    onClick={() => setModalAberto(true)}
                    className="inline-flex items-center px-3 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs"
                >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Inserir Cobrança
                </button>
            </div>

            {cobrancas.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Parcela</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Retirar</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {cobrancas.map(c => {
                                const badge = STATUS_BADGE[c.status] || STATUS_BADGE.PENDENTE;
                                return (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-semibold text-gray-900">{c.clienteNome}</td>
                                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                            {c.numeroParcela}{c.totalParcelas ? `/${c.totalParcelas}` : ''}{c.pedidoNumero ? ` · #${c.pedidoNumero}` : ''} · venc. {fmtData(c.dataVencimento)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                                            {c.status === 'COBRADA' || c.status === 'BAIXADA' ? fmtMoeda(c.valorCobrado) : fmtMoeda(c.saldoParcela)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badge.cls}`}>{badge.label}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {c.status === 'PENDENTE' ? (
                                                <button
                                                    onClick={() => handleRemover(c)}
                                                    disabled={removendo === c.id}
                                                    className="text-red-500 hover:text-red-700 disabled:opacity-50 p-1.5 rounded-full hover:bg-red-50"
                                                    title="Tirar cobrança da carga"
                                                >
                                                    {removendo === c.id ? '…' : <Trash2 className="h-4 w-4" />}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-500">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {modalAberto && (
                <AdicionarCobrancasModal
                    embarqueId={embarqueId}
                    onClose={() => setModalAberto(false)}
                    onSuccess={() => { setModalAberto(false); fetchCobrancas(); }}
                />
            )}
        </div>
    );
};

export default CobrancasCargaSection;
