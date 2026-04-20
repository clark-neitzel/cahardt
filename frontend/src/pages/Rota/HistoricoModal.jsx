import React, { useEffect, useState } from 'react';
import { X, ClipboardList, Loader, User, Calendar, Clock, Package, DollarSign, ShoppingCart } from 'lucide-react';
import atendimentoService from '../../services/atendimentoService';
import pedidoService from '../../services/pedidoService';
import leadService from '../../services/leadService';
import devolucaoService from '../../services/devolucaoService';

const HistoricoModal = ({ cliente, onClose }) => {
    const isLead = !!(cliente?.nomeEstabelecimento);
    const nome = isLead ? cliente.nomeEstabelecimento : (cliente.NomeFantasia || cliente.Nome || '');

    const [loading, setLoading] = useState(true);
    const [itens, setItens] = useState([]);

    useEffect(() => {
        const carregar = async () => {
            setLoading(true);
            try {
                if (isLead) {
                    const atends = await atendimentoService.listarPorLead(cliente.id).catch(() => []);
                    setItens(
                        (atends || [])
                            .map(a => ({ ...a, _tipo: 'ATENDIMENTO', _data: new Date(a.criadoEm) }))
                            .sort((a, b) => b._data - a._data)
                    );
                } else {
                    const [atends, peds, devs, leadsData] = await Promise.all([
                        atendimentoService.listarPorCliente(cliente.UUID).catch(() => []),
                        pedidoService.listar({ clienteId: cliente.UUID }).catch(() => []),
                        devolucaoService.listar({ clienteId: cliente.UUID, tamanhoPagina: 100 }).catch(() => ({ items: [] })),
                        leadService.buscarPorCliente(cliente.UUID).catch(() => []),
                    ]);

                    const leadAtendimentos = (leadsData || []).flatMap(lead =>
                        (lead.atendimentos || []).map(a => ({
                            ...a,
                            _tipo: 'ATENDIMENTO_LEAD',
                            _data: new Date(a.criadoEm),
                            _leadNome: lead.nomeEstabelecimento || `Lead #${lead.numero}`,
                        }))
                    );

                    const pedsSorted = (Array.isArray(peds) ? peds : []);
                    const unified = [
                        ...(atends || []).map(a => ({ ...a, _tipo: 'ATENDIMENTO', _data: new Date(a.criadoEm) })),
                        ...leadAtendimentos,
                        ...pedsSorted.map(p => ({ ...p, _tipo: 'PEDIDO', _data: new Date(p.dataVenda || p.createdAt) })),
                        ...(devs.items || []).map(d => ({ ...d, _tipo: 'DEVOLUCAO', _data: new Date(d.dataDevolucao) })),
                    ].sort((a, b) => b._data - a._data);

                    setItens(unified);
                }
            } catch (e) {
                console.error('Erro ao carregar histórico:', e);
            } finally {
                setLoading(false);
            }
        };
        carregar();
    }, [cliente, isLead]);

    const fmtCanal = (c) => {
        switch (c) {
            case 'VISITA': return 'Visita Presencial';
            case 'AMOSTRA': return 'Amostra';
            case 'LIGACAO': return 'Ligação';
            case 'WHATSAPP': return 'WhatsApp';
            case 'OUTROS': return 'Outros';
            default: return c || 'Direto / Sistema';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg h-[85vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="bg-gray-900 text-white px-4 py-4 shrink-0 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Histórico</p>
                        <h2 className="text-[15px] font-bold leading-tight">{nome}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <Loader className="h-7 w-7 animate-spin mb-3" />
                            <p className="text-sm">Carregando histórico...</p>
                        </div>
                    ) : itens.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <ClipboardList className="h-10 w-10 mb-2" />
                            <p className="font-semibold text-sm">Nenhum histórico registrado ainda.</p>
                        </div>
                    ) : (
                        itens.map(item => {
                            /* ── DEVOLUÇÃO ── */
                            if (item._tipo === 'DEVOLUCAO') {
                                const dev = item;
                                const numPedido = dev.pedidoOriginal?.numero
                                    ? (dev.pedidoOriginal.especial ? `ZZ#${dev.pedidoOriginal.numero}` : `#${dev.pedidoOriginal.numero}`)
                                    : '';
                                return (
                                    <div key={`dev-${dev.id}`} className="border border-red-200 rounded-lg p-3 bg-red-50">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-800">DEVOLUÇÃO DEV#{dev.numero}</span>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{dev.escopo}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${dev.status === 'ATIVA' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{dev.status}</span>
                                        </div>
                                        <p className="text-sm font-semibold text-red-900">
                                            Pedido {numPedido} · R$ {Number(dev.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-xs text-red-700 mt-0.5"><span className="font-medium">Motivo:</span> {dev.motivo}</p>
                                        <div className="text-[11px] text-gray-600 mt-1 space-y-0.5">
                                            {dev.itens?.map(it => (
                                                <p key={it.id}>• {it.produto?.nome || it.produtoId}: {Number(it.quantidade)} × R$ {Number(it.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 mt-2">
                                            <span>Motorista: {dev.motorista?.nome || '-'}</span>
                                            <span>Entrega: {dev.dataEntregaOriginal ? new Date(dev.dataEntregaOriginal).toLocaleDateString('pt-BR') : '-'}</span>
                                            <span>Por: {dev.registradoPor?.nome || '-'}</span>
                                            <span>{new Date(dev.dataDevolucao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                        </div>
                                        {dev.status === 'REVERTIDA' && (
                                            <p className="text-[10px] text-amber-600 mt-1">Revertida por {dev.revertidoPor?.nome || '-'} em {new Date(dev.revertidoEm).toLocaleDateString('pt-BR')}</p>
                                        )}
                                    </div>
                                );
                            }

                            /* ── PEDIDO ── */
                            if (item._tipo === 'PEDIDO') {
                                const pedido = item;
                                const totalItens = pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0;
                                const freteValor = Number(pedido.valorFrete || 0);
                                const totalPedido = totalItens + freteValor;

                                return (
                                    <div key={`ped-${pedido.id}`} className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm">
                                        <div className="flex items-center justify-between mb-3 border-b border-blue-50 pb-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-xs font-bold text-white px-2 py-0.5 rounded flex items-center gap-1 shadow-sm ${pedido.bonificacao ? 'bg-green-600' : pedido.especial ? 'bg-purple-600' : 'bg-blue-600'}`}>
                                                    <ShoppingCart className="h-3 w-3" />
                                                    {pedido.bonificacao ? 'BONIFICAÇÃO' : pedido.especial ? 'ESPECIAL' : 'PEDIDO'}{' '}
                                                    {pedido.numero ? (pedido.bonificacao ? `BN#${pedido.numero}` : pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`) : ''}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pedido.statusEnvio === 'RECEBIDO' ? 'bg-green-100 text-green-700' : pedido.statusEnvio === 'ERRO' ? 'bg-red-100 text-red-700' : pedido.statusEnvio === 'ENVIAR' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {pedido.statusEnvio}
                                                </span>
                                                {pedido.statusEntrega && pedido.statusEntrega !== 'PENDENTE' && (
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5 ${pedido.statusEntrega === 'ENTREGUE' ? 'bg-green-50 text-green-700 border border-green-200' : pedido.statusEntrega === 'ENTREGUE_PARCIAL' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                                        <Package className="h-2.5 w-2.5" />
                                                        {pedido.statusEntrega === 'ENTREGUE' ? 'Entregue' : pedido.statusEntrega === 'ENTREGUE_PARCIAL' ? 'Parcial' : 'Devolvido'}
                                                        {pedido.dataEntrega && ` · ${new Date(pedido.dataEntrega).toLocaleDateString('pt-BR')}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-3 bg-white p-2 rounded border border-gray-100">
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                <Calendar className="h-3 w-3 text-gray-400" />
                                                <span className="font-medium text-gray-700">Criado:</span> {new Date(pedido.createdAt).toLocaleDateString('pt-BR')}
                                            </div>
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                <Clock className="h-3 w-3 text-gray-400" />
                                                <span className="font-medium text-gray-700">Entrega:</span> {pedido.dataVenda ? new Date(pedido.dataVenda).toLocaleDateString('pt-BR') : '-'}
                                            </div>
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                <User className="h-3 w-3 text-gray-400" />
                                                <span className="font-medium text-gray-700">Vendedor:</span> {pedido.vendedor?.nome || 'N/D'}
                                            </div>
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                <span className="font-medium text-gray-700">Canal:</span> {fmtCanal(pedido.canalOrigem)}
                                            </div>
                                        </div>

                                        {pedido.itens && pedido.itens.length > 0 && (
                                            <div className="space-y-1">
                                                {pedido.itens.map(it => {
                                                    const qtdDevolvida = pedido.itensDevolvidos?.filter(d => d.produtoId === it.produtoId)?.reduce((s, d) => s + Number(d.quantidade), 0) || 0;
                                                    const qtdEntregue = Number(it.quantidade) - qtdDevolvida;
                                                    return (
                                                        <div key={it.id} className="flex items-center justify-between text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded">
                                                            <span className="flex items-center gap-1">
                                                                <Package className="h-3 w-3 text-gray-400" />
                                                                {it.produto?.nome || it.descricao || 'Produto'}
                                                            </span>
                                                            <span className="font-semibold text-gray-800 shrink-0 ml-2">
                                                                {qtdDevolvida > 0
                                                                    ? <>{qtdEntregue}x <span className="text-green-600">entregue</span> · <span className="text-red-500 line-through">{Number(it.quantidade)}x</span></>
                                                                    : <>{Number(it.quantidade)}x</>
                                                                } R$ {Number(it.valor).toFixed(2).replace('.', ',')}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {pedido.pagamentosReais && pedido.pagamentosReais.length > 0 && (
                                            <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-2">
                                                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                                                    <DollarSign className="h-3 w-3" /> Pagamentos Recebidos
                                                </p>
                                                {pedido.pagamentosReais.map((pg, idx) => (
                                                    <div key={idx} className="flex justify-between text-xs text-green-800 font-medium">
                                                        <span>{pg.formaPagamentoNome}</span>
                                                        <span>R$ {Number(pg.valor).toFixed(2).replace('.', ',')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {pedido.motivoDevolucao && (
                                            <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg p-2">
                                                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-0.5">Motivo da Devolução</p>
                                                <p className="text-xs text-amber-800 italic">"{pedido.motivoDevolucao}"</p>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                                            {pedido.observacoes
                                                ? <p className="text-xs text-gray-500 italic flex-1 mr-3">{pedido.observacoes}</p>
                                                : <span />
                                            }
                                            <span className="text-sm font-bold text-blue-700 shrink-0">
                                                Total: R$ {totalPedido.toFixed(2).replace('.', ',')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }

                            /* ── ATENDIMENTO (cliente ou lead) ── */
                            const a = item;
                            const isFromLead = item._tipo === 'ATENDIMENTO_LEAD';
                            return (
                                <div key={`atend-${a.id}`} className={`bg-white border rounded-xl p-4 shadow-sm ${isFromLead ? 'border-orange-200' : 'border-gray-200'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${isFromLead ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                                                {a.tipo || 'ATENDIMENTO'}
                                            </span>
                                            {isFromLead && (
                                                <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                                                    Lead: {a._leadNome}
                                                </span>
                                            )}
                                            {a.acaoLabel && (
                                                <span
                                                    className="text-xs font-bold px-2 py-0.5 rounded"
                                                    style={a.alertaVisualCor
                                                        ? { backgroundColor: a.alertaVisualCor + '20', color: a.alertaVisualCor, border: `1px solid ${a.alertaVisualCor}40` }
                                                        : { backgroundColor: '#f3f4f6', color: '#374151' }
                                                    }
                                                >
                                                    {a.acaoLabel}
                                                </span>
                                            )}
                                            {a.vendedor?.nome && (
                                                <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                    <User className="h-3 w-3" />
                                                    {a.vendedor.nome}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                                            <Clock className="h-3 w-3" />
                                            {new Date(a.criadoEm).toLocaleDateString('pt-BR')} {new Date(a.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    {a.etapaNova && (
                                        <div className="flex items-center gap-1 mb-1">
                                            <span className="text-[10px] text-gray-400">{a.etapaAnterior || '—'}</span>
                                            <span className="text-[10px] text-gray-400">→</span>
                                            <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">{a.etapaNova}</span>
                                        </div>
                                    )}

                                    {a.observacao
                                        ? <p className="text-sm text-gray-700 mt-1">{a.observacao}</p>
                                        : <p className="text-xs text-gray-300 italic mt-1">Sem observação registrada</p>
                                    }

                                    {(a.dataRetorno || a.assuntoRetorno || a.transferidoPara?.nome || a.amostra || a.proximaVisita) && (
                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                            {a.dataRetorno && (
                                                <span className="text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    Retorno: {new Date(a.dataRetorno).toLocaleDateString('pt-BR')}
                                                </span>
                                            )}
                                            {a.assuntoRetorno && (
                                                <span className="text-[11px] text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200 italic">
                                                    {a.assuntoRetorno}
                                                </span>
                                            )}
                                            {a.transferidoPara?.nome && (
                                                <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                                    <User className="h-3 w-3" />
                                                    Transferido para: {a.transferidoPara.nome}
                                                </span>
                                            )}
                                            {a.amostra && (
                                                <span className="text-[11px] text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 flex items-center gap-1">
                                                    <Package className="h-3 w-3" />
                                                    Amostra AM#{a.amostra.numero} · {a.amostra.status}
                                                </span>
                                            )}
                                            {a.proximaVisita && (
                                                <span className="text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    Próx. visita: {new Date(a.proximaVisita).toLocaleDateString('pt-BR')}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                    <div className="h-4" />
                </div>
            </div>
        </div>
    );
};

export default HistoricoModal;
