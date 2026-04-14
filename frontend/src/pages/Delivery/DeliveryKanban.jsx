import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MessageCircle, ArrowRight, Settings, Lock, RefreshCw } from 'lucide-react';
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

const proximaEtapa = (etapa) => {
    const idx = ETAPAS.indexOf(etapa);
    return idx >= 0 && idx < ETAPAS.length - 1 ? ETAPAS[idx + 1] : null;
};

export default function DeliveryKanban() {
    const { user } = useAuth();
    const [buckets, setBuckets] = useState({ PEDIDO: [], PRODUCAO: [], SAINDO: [], ENTREGUE: [] });
    const [perm, setPerm] = useState({ podeVer: false, etapasPermitidas: [], admin: false });
    const [loading, setLoading] = useState(true);
    const [moving, setMoving] = useState(null);

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

    return (
        <div className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
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

            {!perm.podeVer && !loading && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
                    Você não tem permissão para visualizar o Delivery. Peça ao admin pra liberar.
                </div>
            )}

            {perm.podeVer && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {ETAPAS.map(etapa => (
                        <div key={etapa} className={`rounded-lg border-2 ${COL_COLORS[etapa]} min-h-[200px] flex flex-col`}>
                            <div className="px-3 py-2 border-b border-black/5 flex items-center justify-between">
                                <span className="font-semibold text-sm">{LABELS[etapa]}</span>
                                <span className="text-xs bg-white px-2 py-0.5 rounded-full">{(buckets[etapa] || []).length}</span>
                            </div>
                            <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
                                {(buckets[etapa] || []).map(card => (
                                    <Card
                                        key={card.id}
                                        card={card}
                                        perm={perm}
                                        moving={moving === card.id}
                                        onMover={mover}
                                    />
                                ))}
                                {!(buckets[etapa] || []).length && (
                                    <div className="text-center text-xs text-gray-400 py-4">Nenhum pedido</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Card({ card, perm, moving, onMover }) {
    const tel = card.cliente?.Telefone_Celular || card.cliente?.Telefone;
    const wa = whatsappLink(tel);
    const end = [
        card.cliente?.End_Logradouro,
        card.cliente?.End_Numero,
        card.cliente?.End_Bairro,
        card.cliente?.End_Cidade
    ].filter(Boolean).join(', ');

    const prox = proximaEtapa(card.etapa);
    const podeMover = prox && (perm.admin || perm.etapasPermitidas?.includes(prox));
    const bloqueado = card.etapa === 'ENTREGUE';

    const dataVenda = card.dataVenda ? new Date(card.dataVenda) : null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const atrasado = dataVenda && dataVenda < hoje && card.etapa !== 'ENTREGUE';

    const pagBadge = {
        QUITADO: 'bg-green-100 text-green-800',
        PARCIAL: 'bg-amber-100 text-amber-800',
        ABERTO: 'bg-red-100 text-red-800'
    }[card.statusPagamento];

    return (
        <div className={`bg-white rounded-md shadow-sm border p-3 text-xs space-y-2 ${atrasado ? 'ring-2 ring-red-400' : ''}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">
                        {card.cliente?.NomeFantasia || card.cliente?.Nome}
                    </div>
                    {card.numero && <div className="text-[10px] text-gray-400">Pedido #{card.numero}</div>}
                </div>
                {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="text-green-600 hover:text-green-700 shrink-0">
                        <MessageCircle className="h-4 w-4" />
                    </a>
                )}
            </div>

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

            {bloqueado ? (
                <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400 pt-1 border-t">
                    <Lock className="h-3 w-3" /> Entregue — bloqueado
                </div>
            ) : prox && (
                <button
                    onClick={() => onMover(card, prox)}
                    disabled={!podeMover || moving}
                    className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        podeMover ? 'bg-primary text-white hover:opacity-90' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {moving ? '...' : <>→ {LABELS[prox]} <ArrowRight className="h-3 w-3" /></>}
                </button>
            )}
        </div>
    );
}
