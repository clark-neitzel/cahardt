import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MessageCircle, ArrowLeft, Settings, RefreshCw, Send, MessageSquareOff, MessageSquare, Search, ChevronDown, Move, X, AlertCircle } from 'lucide-react';
import deliveryService from '../../services/deliveryService';
import { useAuth } from '../../contexts/AuthContext';

const { ETAPAS, LABELS } = deliveryService;
const COL_COLORS = {
    PEDIDO: 'border-blue-300 bg-blue-50',
    PRODUCAO: 'border-amber-300 bg-amber-50',
    SAINDO: 'border-purple-300 bg-purple-50',
    ENTREGUE: 'border-green-300 bg-green-50'
};

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const soDigits = (s) => (s || '').replace(/\D/g, '');
const whatsappLink = (telefone) => {
    const d = soDigits(telefone);
    if (!d) return null;
    const full = d.length <= 11 ? `55${d}` : d;
    return `https://wa.me/${full}`;
};

const etapaAnterior = (etapa) => {
    const idx = ETAPAS.indexOf(etapa);
    return idx > 0 ? ETAPAS[idx - 1] : null;
};
// Etapas à direita da etapa atual (destinos possíveis pra avançar)
const etapasAFrente = (etapa) => {
    const idx = ETAPAS.indexOf(etapa);
    return idx >= 0 ? ETAPAS.slice(idx + 1) : [];
};

const sameDateISO = (date, isoYmd) => {
    if (!date || !isoYmd) return false;
    const d = new Date(date);
    const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return ymd === isoYmd;
};

export default function DeliveryKanban() {
    const { user } = useAuth();
    const [buckets, setBuckets] = useState({ PEDIDO: [], PRODUCAO: [], SAINDO: [], ENTREGUE: [] });
    const [perm, setPerm] = useState({ podeVer: false, etapasPermitidas: [], admin: false });
    const [loading, setLoading] = useState(true);
    const [moving, setMoving] = useState(null);

    // Filtros
    const [busca, setBusca] = useState('');
    const [dataEntrega, setDataEntrega] = useState('');

    // Modal de detalhes
    const [pedidoDetalhe, setPedidoDetalhe] = useState(null);

    const isAdmin = user?.permissoes?.admin;

    const carregar = async () => {
        setLoading(true);
        try {
            const data = await deliveryService.listarPedidos();
            const { minhaPermissao, ...b } = data;
            setBuckets(b);
            setPerm(minhaPermissao);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        carregar();
        const id = setInterval(carregar, 30000);
        return () => clearInterval(id);
    }, []);

    const mover = async (card, novaEtapa) => {
        if (!novaEtapa) return;
        if (card.situacaoCA !== 'FATURADO') {
            toast.error('Este pedido ainda não foi faturado no Conta Azul. Fature primeiro para movimentar no Delivery.', {
                duration: 5000,
                style: { maxWidth: '480px' }
            });
            return;
        }
        setMoving(card.id);
        try {
            await deliveryService.moverEtapa(card.id, novaEtapa);
            toast.success(`→ ${LABELS[novaEtapa]}`);
            await carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao mover.');
        } finally {
            setMoving(null);
        }
    };

    const reenviar = async (card) => {
        setMoving(card.id);
        try {
            const r = await deliveryService.reenviar(card.id);
            if (r.ok) toast.success('Mensagem reenviada');
            else toast.error(r.motivo || 'Falha ao reenviar.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao reenviar.');
        } finally {
            setMoving(null);
        }
    };

    const toggleSilenciar = async (card) => {
        const novoEstado = !card.silenciarWhatsapp;
        // Atualização otimista — atualiza o card local antes do round-trip
        setBuckets(prev => {
            const copy = { ...prev };
            for (const k of Object.keys(copy)) {
                copy[k] = copy[k].map(c => c.id === card.id ? { ...c, silenciarWhatsapp: novoEstado } : c);
            }
            return copy;
        });
        try {
            await deliveryService.setSilenciarWhatsapp(card.id, novoEstado);
            toast.success(novoEstado ? 'WhatsApp silenciado para este pedido' : 'WhatsApp reativado para este pedido');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao atualizar.');
            await carregar();
        }
    };

    // Aplica filtros texto + data nas 4 colunas
    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        const out = {};
        for (const etapa of ETAPAS) {
            const lista = buckets[etapa] || [];
            out[etapa] = lista.filter(card => {
                if (termo) {
                    const nome = (card.cliente?.NomeFantasia || card.cliente?.Nome || '').toLowerCase();
                    const numero = String(card.numero || '');
                    if (!nome.includes(termo) && !numero.includes(termo)) return false;
                }
                if (dataEntrega && !sameDateISO(card.dataVenda, dataEntrega)) return false;
                return true;
            });
        }
        return out;
    }, [buckets, busca, dataEntrega]);

    const totalFiltrado = ETAPAS.reduce((s, e) => s + (filtrados[e]?.length || 0), 0);
    const filtroAtivo = !!(busca.trim() || dataEntrega);

    return (
        <div className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Delivery — Kit Festa</h1>
                    <p className="text-sm text-gray-500">Kanban de pedidos de entrega</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={carregar} className="p-2 text-gray-500 hover:text-primary" title="Atualizar">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {isAdmin && (
                        <Link to="/delivery/config" className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 border rounded-md hover:bg-gray-50">
                            <Settings className="h-4 w-4" /> Configurar
                        </Link>
                    )}
                </div>
            </div>

            {perm.podeVer && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Buscar por cliente ou nº pedido…"
                            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-500">Entrega:</label>
                        <input
                            type="date"
                            value={dataEntrega}
                            onChange={e => setDataEntrega(e.target.value)}
                            className="px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    {filtroAtivo && (
                        <button
                            onClick={() => { setBusca(''); setDataEntrega(''); }}
                            className="text-xs text-gray-500 hover:text-gray-800 underline"
                        >
                            Limpar
                        </button>
                    )}
                    {filtroAtivo && (
                        <span className="text-xs text-gray-500 ml-auto">
                            {totalFiltrado} pedido{totalFiltrado !== 1 ? 's' : ''} no filtro
                        </span>
                    )}
                </div>
            )}

            {!perm.podeVer && !loading && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
                    Você não tem permissão para visualizar o Delivery. Peça ao admin pra liberar.
                </div>
            )}

            {pedidoDetalhe && (
                <ModalDetalhes card={pedidoDetalhe} onClose={() => setPedidoDetalhe(null)} />
            )}

            {perm.podeVer && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {ETAPAS.map(etapa => (
                        <div key={etapa} className={`rounded-lg border-2 ${COL_COLORS[etapa]} min-h-[200px] flex flex-col`}>
                            <div className="px-3 py-2 border-b border-black/5 flex items-center justify-between">
                                <span className="font-semibold text-sm">{LABELS[etapa]}</span>
                                <span className="text-xs bg-white px-2 py-0.5 rounded-full">{(filtrados[etapa] || []).length}</span>
                            </div>
                            <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                                {(filtrados[etapa] || []).map(card => (
                                    <Card
                                        key={card.id}
                                        card={card}
                                        perm={perm}
                                        moving={moving === card.id}
                                        onMover={mover}
                                        onReenviar={reenviar}
                                        onToggleSilenciar={toggleSilenciar}
                                        onAbrirDetalhes={() => setPedidoDetalhe(card)}
                                    />
                                ))}
                                {!(filtrados[etapa] || []).length && (
                                    <div className="text-center text-xs text-gray-400 py-4">
                                        {filtroAtivo ? 'Sem resultados' : 'Nenhum pedido'}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Card({ card, perm, moving, onMover, onReenviar, onToggleSilenciar, onAbrirDetalhes }) {
    const tel = card.cliente?.Telefone_Celular || card.cliente?.Telefone;
    const wa = whatsappLink(tel);
    const end = [
        card.cliente?.End_Logradouro,
        card.cliente?.End_Numero,
        card.cliente?.End_Bairro,
        card.cliente?.End_Cidade
    ].filter(Boolean).join(', ');

    const naoFaturado = card.situacaoCA !== 'FATURADO';
    const ant = etapaAnterior(card.etapa);
    const destinos = etapasAFrente(card.etapa);
    const destinosPermitidos = destinos.filter(e => perm.admin || perm.etapasPermitidas?.includes(e));
    const podeVoltar = ant && (perm.admin || perm.etapasPermitidas?.includes(ant));

    const [menuAberto, setMenuAberto] = useState(false);
    const menuRef = useRef(null);
    useEffect(() => {
        if (!menuAberto) return;
        const fechar = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAberto(false); };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [menuAberto]);

    const dataVenda = card.dataVenda ? new Date(card.dataVenda) : null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const atrasado = dataVenda && dataVenda < hoje && card.etapa !== 'ENTREGUE';

    const pagBadge = {
        QUITADO: 'bg-green-100 text-green-800',
        PARCIAL: 'bg-amber-100 text-amber-800',
        ABERTO: 'bg-red-100 text-red-800'
    }[card.statusPagamento];

    const silenciado = !!card.silenciarWhatsapp;

    const handleCardClick = (e) => {
        // Não abre detalhes se o clique veio de um botão/link interno
        if (e.target.closest('button, a')) return;
        onAbrirDetalhes && onAbrirDetalhes();
    };

    return (
        <div
            onClick={handleCardClick}
            className={`rounded-md shadow-sm border p-3 text-xs space-y-2 cursor-pointer transition-colors ${
                naoFaturado
                    ? 'bg-gray-100 border-gray-300 opacity-90 hover:bg-gray-50'
                    : 'bg-white hover:bg-gray-50'
            } ${atrasado && !naoFaturado ? 'ring-2 ring-red-400' : ''} ${silenciado ? 'border-l-4 border-l-gray-400' : ''}`}
        >
            {naoFaturado && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>Não faturado no CA — não pode movimentar</span>
                </div>
            )}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">
                        {card.cliente?.NomeFantasia || card.cliente?.Nome}
                    </div>
                    {card.numero && <div className="text-[10px] text-gray-400">Pedido #{card.numero}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => onToggleSilenciar(card)}
                        title={silenciado ? 'WhatsApp silenciado — clique para reativar' : 'Clique para NÃO enviar WhatsApp neste pedido'}
                        className={`${silenciado ? 'text-gray-400 hover:text-gray-600' : 'text-emerald-600 hover:text-emerald-700'}`}
                    >
                        {silenciado
                            ? <MessageSquareOff className="h-4 w-4" />
                            : <MessageSquare className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={() => onReenviar(card)}
                        disabled={moving}
                        title="Reenviar mensagem da etapa atual"
                        className="text-blue-600 hover:text-blue-700 disabled:opacity-40"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                    {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="text-green-600 hover:text-green-700" title="Abrir conversa no WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                        </a>
                    )}
                </div>
            </div>

            {silenciado && (
                <div className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 inline-block">
                    🔕 Cliente não receberá WhatsApp
                </div>
            )}

            {end && <div className="text-gray-600 text-[11px] leading-tight">{end}</div>}
            {tel && <div className="text-gray-500 text-[11px]">{tel}</div>}

            <div className="border-t pt-1 space-y-0.5">
                {card.itens.slice(0, 4).map(i => (
                    <div key={i.id} className="flex justify-between text-[11px] text-gray-700">
                        <span className="truncate pr-2">{i.quantidade}× {i.produto?.nome}</span>
                        <span className="text-gray-500">{fmtBRL(i.quantidade * i.valor)}</span>
                    </div>
                ))}
                {card.itens.length > 4 && <div className="text-[10px] text-gray-400">+{card.itens.length - 4} itens</div>}
                {card.frete > 0 && (
                    <div className="flex justify-between text-[11px] text-gray-700">
                        <span>Frete</span>
                        <span>{fmtBRL(card.frete)}</span>
                    </div>
                )}
                <div className="flex justify-between text-[11px] font-semibold pt-0.5 border-t">
                    <span>Total</span>
                    <span>{fmtBRL(card.totalPedido)}</span>
                </div>
            </div>

            <div className="flex items-center justify-between pt-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${pagBadge}`}>
                    {card.statusPagamento === 'PARCIAL'
                        ? `Falta ${fmtBRL(card.aberto)}`
                        : card.statusPagamento === 'QUITADO' ? 'Quitado' : 'Em aberto'}
                </span>
                {atrasado && <span className="text-[10px] font-bold text-red-600">ATRASADO</span>}
            </div>

            <div className="flex gap-1 pt-1 border-t">
                {ant && (
                    <button
                        onClick={() => onMover(card, ant)}
                        disabled={!naoFaturado && (!podeVoltar || moving)}
                        title={naoFaturado ? 'Fature o pedido no CA para movimentar' : `Voltar para ${LABELS[ant]}`}
                        className={`px-2 py-1.5 rounded-md text-xs transition-colors ${
                            naoFaturado
                                ? 'bg-gray-50 text-gray-400 border border-dashed border-gray-400'
                                : podeVoltar
                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        }`}
                    >
                        <ArrowLeft className="h-3 w-3" />
                    </button>
                )}
                {destinos.length > 0 ? (
                    <div className="relative flex-1" ref={menuRef}>
                        <button
                            onClick={() => {
                                if (naoFaturado) {
                                    onMover(card, destinos[0]); // dispara o aviso "não faturado" no parent
                                    return;
                                }
                                setMenuAberto(o => !o);
                            }}
                            disabled={!naoFaturado && (destinosPermitidos.length === 0 || moving)}
                            className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                naoFaturado
                                    ? 'bg-gray-200 text-gray-500 hover:bg-gray-300 border border-dashed border-gray-400'
                                    : destinosPermitidos.length > 0
                                        ? 'bg-primary text-white hover:opacity-90'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                            title={naoFaturado ? 'Fature o pedido no CA para movimentar' : ''}
                        >
                            {moving ? '...' : <><Move className="h-3 w-3" /> Movimentar <ChevronDown className="h-3 w-3" /></>}
                        </button>
                        {menuAberto && !naoFaturado && destinosPermitidos.length > 0 && (
                            <div className="absolute z-10 right-0 mt-1 w-44 bg-white border rounded-md shadow-lg overflow-hidden">
                                {destinos.map(et => {
                                    const liberado = destinosPermitidos.includes(et);
                                    return (
                                        <button
                                            key={et}
                                            onClick={() => { setMenuAberto(false); if (liberado) onMover(card, et); }}
                                            disabled={!liberado}
                                            className={`w-full text-left px-3 py-2 text-xs ${
                                                liberado
                                                    ? 'hover:bg-gray-100 text-gray-800'
                                                    : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                            title={liberado ? '' : 'Sem permissão para esta etapa'}
                                        >
                                            → {LABELS[et]}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 text-center text-[11px] text-green-700 font-semibold py-1.5">Entregue ✓</div>
                )}
            </div>
        </div>
    );
}

function ModalDetalhes({ card, onClose }) {
    const cliente = card.cliente || {};
    const tel = cliente.Telefone_Celular || cliente.Telefone;
    const wa = whatsappLink(tel);
    const end = [
        cliente.End_Logradouro && `${cliente.End_Logradouro}${cliente.End_Numero ? ', ' + cliente.End_Numero : ''}`,
        cliente.End_Complemento,
        cliente.End_Bairro,
        cliente.End_Cidade && `${cliente.End_Cidade}${cliente.End_Estado ? '/' + cliente.End_Estado : ''}`,
        cliente.End_CEP && `CEP ${cliente.End_CEP}`
    ].filter(Boolean).join(' — ');
    const dataVenda = card.dataVenda ? new Date(card.dataVenda) : null;
    const dataVendaStr = dataVenda
        ? dataVenda.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
        : '-';
    const totalItens = (card.itens || []).reduce((s, i) => s + Number(i.quantidade), 0);
    const naoFaturado = card.situacaoCA !== 'FATURADO';

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
            >
                <div className="px-5 py-3 border-b flex items-center justify-between">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate">
                            {cliente.NomeFantasia || cliente.Nome || 'Pedido'}
                        </h3>
                        <p className="text-xs text-gray-500">
                            Pedido #{card.numero || '—'} · Entrega {dataVendaStr} · {LABELS[card.etapa]}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 shrink-0 ml-2">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4 overflow-y-auto space-y-3 text-sm">
                    {naoFaturado && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-md p-2 text-xs text-amber-900">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <strong>Pedido ainda não foi faturado no Conta Azul.</strong> Fature primeiro para movimentar pelo Delivery.
                            </div>
                        </div>
                    )}

                    {end && (
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-400 mb-0.5">Endereço</p>
                            <p className="text-gray-800">{end}</p>
                        </div>
                    )}

                    {tel && (
                        <div className="flex items-center gap-3">
                            <div>
                                <p className="text-[10px] uppercase font-semibold text-gray-400 mb-0.5">Telefone</p>
                                <p className="text-gray-800">{tel}</p>
                            </div>
                            {wa && (
                                <a href={wa} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800 underline">
                                    <MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp
                                </a>
                            )}
                        </div>
                    )}

                    {card.vendedor?.nome && (
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-400 mb-0.5">Vendedor</p>
                            <p className="text-gray-800">{card.vendedor.nome}</p>
                        </div>
                    )}

                    <div>
                        <p className="text-[10px] uppercase font-semibold text-gray-400 mb-1">
                            Itens ({totalItens} {totalItens === 1 ? 'un' : 'un'})
                        </p>
                        <div className="border rounded-md divide-y">
                            {(card.itens || []).map(i => (
                                <div key={i.id} className="px-2.5 py-1.5 flex justify-between gap-2 text-xs">
                                    <span className="text-gray-800">
                                        <span className="font-medium">{i.quantidade}×</span> {i.produto?.nome}
                                    </span>
                                    <span className="text-gray-600 shrink-0">
                                        {fmtBRL(i.valor)} <span className="text-gray-400">·</span> {fmtBRL(i.quantidade * i.valor)}
                                    </span>
                                </div>
                            ))}
                            {card.frete > 0 && (
                                <div className="px-2.5 py-1.5 flex justify-between text-xs">
                                    <span className="text-gray-700">Frete</span>
                                    <span className="text-gray-700">{fmtBRL(card.frete)}</span>
                                </div>
                            )}
                            <div className="px-2.5 py-1.5 flex justify-between text-sm font-semibold bg-gray-50">
                                <span>Total</span>
                                <span>{fmtBRL(card.totalPedido)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-400 mb-0.5">Pagamento</p>
                            <p className="text-gray-800">
                                {card.statusPagamento === 'QUITADO' && <span className="text-green-700 font-semibold">Quitado</span>}
                                {card.statusPagamento === 'PARCIAL' && <span className="text-amber-700 font-semibold">Parcial — falta {fmtBRL(card.aberto)}</span>}
                                {card.statusPagamento === 'ABERTO' && <span className="text-red-700 font-semibold">Em aberto</span>}
                            </p>
                            {card.totalPago > 0 && (
                                <p className="text-[11px] text-gray-500">Pago: {fmtBRL(card.totalPago)}</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-400 mb-0.5">Situação CA</p>
                            <p className={naoFaturado ? 'text-amber-700 font-semibold' : 'text-green-700 font-semibold'}>
                                {card.situacaoCA || '—'}
                            </p>
                        </div>
                    </div>

                    {card.observacoes && (
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-400 mb-0.5">Observações</p>
                            <p className="text-gray-800 whitespace-pre-wrap text-xs bg-gray-50 border rounded p-2">{card.observacoes}</p>
                        </div>
                    )}
                </div>

                <div className="px-5 py-3 border-t bg-gray-50 flex justify-end">
                    <button onClick={onClose} className="px-4 py-1.5 text-sm border rounded-md bg-white hover:bg-gray-100">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
