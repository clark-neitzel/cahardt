import React, { useState, useEffect } from 'react';
import { X, Truck, User, Package, DollarSign, AlertTriangle, CheckCircle, Clock, RotateCcw, MapPin } from 'lucide-react';
import entregasService from '../../../services/entregasService';

const STATUS_LABEL = {
    ENTREGUE: { label: 'Entregue', cls: 'bg-green-100 text-green-800' },
    ENTREGUE_PARCIAL: { label: 'Entregue Parcial', cls: 'bg-amber-100 text-amber-800' },
    DEVOLVIDO: { label: 'Devolvido', cls: 'bg-red-100 text-red-800' },
    PENDENTE: { label: 'Pendente', cls: 'bg-gray-100 text-gray-700' },
};

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ModalDetalheEntrega = ({ entregaId, onClose }) => {
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const d = await entregasService.getById(entregaId);
                setDados(d);
            } catch (e) {
                setErro('Não foi possível carregar os detalhes desta entrega.');
            } finally {
                setLoading(false);
            }
        })();
    }, [entregaId]);

    const totalPedido = dados?.itens?.reduce((acc, i) => acc + Number(i.valor) * Number(i.quantidade), 0) || 0;
    const totalDevolvido = dados?.itensDevolvidos?.reduce((acc, i) => acc + Number(i.valorBaseItem || 0) * Number(i.quantidade), 0) || 0;
    const totalRecebido = dados?.pagamentosReais?.reduce((acc, p) => acc + Number(p.valor), 0) || 0;
    const statusInfo = STATUS_LABEL[dados?.statusEntrega] || { label: dados?.statusEntrega, cls: 'bg-gray-100 text-gray-700' };

    return (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Truck className="h-5 w-5 text-blue-600" />
                            Detalhe da Entrega
                            {dados?.numero && <span className="text-gray-400 font-mono text-sm">#{dados.numero}</span>}
                        </h2>
                        {dados?.dataEntrega && (
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(dados.dataEntrega).toLocaleString('pt-BR')}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {loading && (
                    <div className="p-10 text-center text-gray-500 text-sm">Carregando detalhes...</div>
                )}

                {erro && (
                    <div className="p-8 text-center text-red-600 text-sm flex flex-col items-center gap-2">
                        <AlertTriangle className="h-8 w-8" />
                        {erro}
                    </div>
                )}

                {dados && !loading && (
                    <div className="p-5 space-y-5">

                        {/* Status da entrega */}
                        <div className="flex flex-wrap items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusInfo.cls}`}>
                                {statusInfo.label}
                            </span>
                            {dados.divergenciaPagamento && (
                                <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full font-semibold">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Divergência de Pagamento
                                </span>
                            )}
                            {dados.especial && (
                                <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded-full">
                                    Pedido Especial
                                </span>
                            )}
                        </div>

                        {/* Cliente + Logística */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-gray-50 rounded-xl p-4 space-y-1">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                                    <User className="h-3.5 w-3.5" /> Cliente
                                </p>
                                <p className="font-bold text-gray-900">{dados.cliente?.NomeFantasia || dados.cliente?.Nome}</p>
                                <p className="text-xs text-gray-500 font-mono">{dados.cliente?.Documento}</p>
                                {dados.cliente?.End_Cidade && (
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {dados.cliente.End_Logradouro}{dados.cliente.End_Numero ? `, ${dados.cliente.End_Numero}` : ''} — {dados.cliente.End_Cidade}
                                    </p>
                                )}
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 space-y-1">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                                    <Truck className="h-3.5 w-3.5" /> Logística
                                </p>
                                <p className="text-sm font-semibold text-gray-800">
                                    {dados.embarque?.responsavel?.nome || 'Sem responsável'}
                                    <span className="text-xs text-gray-400 ml-1 font-mono">EMB #{dados.embarque?.numero || '—'}</span>
                                </p>
                                <p className="text-xs text-gray-500">
                                    Vendedor: <strong>{dados.vendedor?.nome || 'N/A'}</strong>
                                </p>
                                <p className="text-xs text-gray-500">
                                    Condição: <strong>{dados.condicaoNome || '—'}</strong>
                                </p>
                            </div>
                        </div>

                        {/* Itens do Pedido */}
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                                <Package className="h-3.5 w-3.5" /> Itens do Pedido
                            </p>
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Produto</th>
                                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">Qtd</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Valor Unit.</th>
                                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {dados.itens?.map((item, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-2.5 font-medium text-gray-800">{item.produto?.nome}</td>
                                                <td className="px-4 py-2.5 text-center text-gray-600">{item.quantidade} {item.produto?.unidade || 'un'}</td>
                                                <td className="px-4 py-2.5 text-right text-gray-600">{fmt(item.valor)}</td>
                                                <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{fmt(Number(item.valor) * Number(item.quantidade))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50 border-t border-gray-200">
                                        <tr>
                                            <td colSpan="3" className="px-4 py-2 text-right text-sm font-bold text-gray-700">Total do Pedido</td>
                                            <td className="px-4 py-2 text-right text-sm font-bold text-blue-700">{fmt(totalPedido)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* Itens Devolvidos */}
                        {dados.itensDevolvidos?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                                    <RotateCcw className="h-3.5 w-3.5" /> Itens Devolvidos / Parcial
                                </p>
                                <div className="border border-amber-200 rounded-xl overflow-hidden">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-amber-50">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-amber-600">Produto</th>
                                                <th className="px-4 py-2 text-center text-xs font-semibold text-amber-600">Qtd</th>
                                                <th className="px-4 py-2 text-right text-xs font-semibold text-amber-600">Crédito</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-amber-100">
                                            {dados.itensDevolvidos.map((item, i) => (
                                                <tr key={i}>
                                                    <td className="px-4 py-2.5 text-gray-800">{item.produto?.nome}</td>
                                                    <td className="px-4 py-2.5 text-center text-gray-600">{item.quantidade} {item.produto?.unidade || 'un'}</td>
                                                    <td className="px-4 py-2.5 text-right text-amber-700 font-semibold">{fmt(Number(item.valorBaseItem || 0) * Number(item.quantidade))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Pagamentos Recebidos */}
                        {dados.pagamentosReais?.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                                    <DollarSign className="h-3.5 w-3.5" /> Pagamentos Recebidos
                                </p>
                                <div className="border border-green-200 rounded-xl overflow-hidden">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-green-50">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-green-700">Forma</th>
                                                <th className="px-4 py-2 text-right text-xs font-semibold text-green-700">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-green-100">
                                            {dados.pagamentosReais.map((pgto, i) => (
                                                <tr key={i}>
                                                    <td className="px-4 py-2.5 text-gray-800">{pgto.formaPagamento}</td>
                                                    <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmt(pgto.valor)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-green-50 border-t border-green-200">
                                            <tr>
                                                <td className="px-4 py-2 text-right text-sm font-bold text-green-700">Total Recebido</td>
                                                <td className="px-4 py-2 text-right text-sm font-bold text-green-700">{fmt(totalRecebido)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Resumo financeiro */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
                            <div>
                                <p className="text-xs text-blue-500 font-semibold uppercase">Pedido</p>
                                <p className="text-base font-bold text-blue-900">{fmt(totalPedido)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-amber-500 font-semibold uppercase">Devolvido</p>
                                <p className="text-base font-bold text-amber-700">{fmt(totalDevolvido)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-green-600 font-semibold uppercase">Recebido</p>
                                <p className="text-base font-bold text-green-700">{fmt(totalRecebido)}</p>
                            </div>
                        </div>

                        {/* Observação da entrega */}
                        {dados.observacaoEntrega && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                                <p className="text-xs font-semibold text-yellow-700 mb-1">📋 Observação do Motorista</p>
                                <p className="text-sm text-gray-700">{dados.observacaoEntrega}</p>
                            </div>
                        )}

                        {/* Motivo de devolução */}
                        {dados.motivoDevolucao && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                                    <RotateCcw className="h-3.5 w-3.5" /> Motivo da Devolução
                                </p>
                                <p className="text-sm text-gray-700">{dados.motivoDevolucao}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ModalDetalheEntrega;
