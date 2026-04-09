import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Loader2, FileText, ExternalLink } from 'lucide-react';
import devolucaoService from '../../services/devolucaoService';
import { API_URL } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const STATUS_BADGE = {
    ATIVA: 'bg-red-100 text-red-700 border-red-200',
    REVERTIDA: 'bg-gray-100 text-gray-500 border-gray-200',
};

const TIPO_BADGE = {
    ESPECIAL: 'bg-violet-100 text-violet-700',
    CONTA_AZUL: 'bg-blue-100 text-blue-700',
};

const ListaDevolucoes = ({ filtros }) => {
    const { user } = useAuth();
    const podeReverter = user?.permissoes?.admin || user?.permissoes?.Pode_Reverter_Devolucao;

    const [devolucoes, setDevolucoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [revertendo, setRevertendo] = useState(null);
    const [motivoReversao, setMotivoReversao] = useState('');

    useEffect(() => {
        carregar();
    }, [filtros?.dataEntregaDe, filtros?.dataEntregaAte, filtros?.vendedorId]);

    const carregar = async () => {
        try {
            setLoading(true);
            const params = {};
            if (filtros?.dataEntregaDe) params.dataInicio = filtros.dataEntregaDe;
            if (filtros?.dataEntregaAte) params.dataFim = filtros.dataEntregaAte;
            const result = await devolucaoService.listar(params);
            setDevolucoes(result.items || []);
        } catch (error) {
            toast.error('Erro ao carregar devoluções.');
        } finally {
            setLoading(false);
        }
    };

    const handleReverter = async (id) => {
        if (!motivoReversao.trim()) {
            toast.error('Informe o motivo da reversão.');
            return;
        }
        try {
            setRevertendo(id);
            await devolucaoService.reverter(id, { motivoReversao: motivoReversao.trim() });
            toast.success('Devolução revertida com sucesso!');
            setRevertendo(null);
            setMotivoReversao('');
            setExpandedId(null);
            carregar();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter devolução.');
            setRevertendo(null);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Carregando devoluções...</div>;
    }

    if (devolucoes.length === 0) {
        return <div className="p-8 text-center text-gray-500">Nenhuma devolução encontrada no período.</div>;
    }

    return (
        <div className="bg-white rounded overflow-hidden border border-gray-200">
            <div className="divide-y divide-gray-200">
                {devolucoes.map(dev => {
                    const isExpanded = expandedId === dev.id;
                    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
                    const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
                    const numPedido = dev.pedidoOriginal?.numero
                        ? (dev.pedidoOriginal.especial ? `ZZ#${dev.pedidoOriginal.numero}` : `#${dev.pedidoOriginal.numero}`)
                        : dev.pedidoOriginalId.slice(0, 8);

                    return (
                        <div key={dev.id} className="border-b border-gray-100">
                            <div
                                className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => setExpandedId(isExpanded ? null : dev.id)}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border text-red-700 bg-red-50 border-red-200 shadow-sm shrink-0">
                                                DEV#{dev.numero}
                                            </span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIPO_BADGE[dev.tipo]}`}>
                                                {dev.tipo === 'CONTA_AZUL' ? 'CA' : 'ESPECIAL'}
                                            </span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS_BADGE[dev.status]}`}>
                                                {dev.status}
                                            </span>
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                                {dev.escopo}
                                            </span>
                                        </div>
                                        <h3 className="text-[14px] font-bold text-gray-900 truncate">
                                            {dev.cliente?.NomeFantasia || dev.cliente?.Nome || 'Cliente'}
                                        </h3>
                                        <p className="text-[11px] text-gray-500">
                                            Pedido {numPedido} · {fmtDate(dev.dataDevolucao)} · Registrado por {dev.registradoPor?.nome || '-'}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-bold text-red-700">
                                            R$ {Number(dev.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400 ml-auto mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-400 ml-auto mt-1" />}
                                    </div>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 pb-4 bg-gray-50 space-y-3">
                                    {/* Itens */}
                                    <div>
                                        <p className="text-xs font-bold text-gray-600 uppercase mb-1">Itens Devolvidos</p>
                                        <div className="space-y-1">
                                            {dev.itens?.map(item => (
                                                <div key={item.id} className="flex justify-between text-xs bg-white p-2 rounded border">
                                                    <span className="text-gray-800 font-medium">{item.produto?.nome || item.produtoId}</span>
                                                    <span className="text-gray-600">
                                                        {Number(item.quantidade)} × R$ {Number(item.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        = <span className="font-bold text-red-600">R$ {Number(item.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Detalhes */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div><span className="text-gray-500">Motorista:</span> <span className="font-medium">{dev.motorista?.nome || '-'}</span></div>
                                        <div><span className="text-gray-500">Entrega:</span> <span className="font-medium">{fmtDate(dev.dataEntregaOriginal)}</span></div>
                                        <div><span className="text-gray-500">Caixa:</span> <span className="font-medium">{dev.caixaDataReferencia || '-'}</span></div>
                                        <div><span className="text-gray-500">Registrado:</span> <span className="font-medium">{fmtDateTime(dev.dataDevolucao)}</span></div>
                                    </div>

                                    {/* Motivo */}
                                    <div className="p-2 bg-red-50 rounded border border-red-200 text-xs">
                                        <span className="font-bold text-red-700">Motivo:</span>{' '}
                                        <span className="text-red-800">{dev.motivo}</span>
                                    </div>

                                    {dev.observacao && (
                                        <div className="p-2 bg-gray-100 rounded text-xs">
                                            <span className="font-bold text-gray-600">Obs:</span> {dev.observacao}
                                        </div>
                                    )}

                                    {/* CA info */}
                                    {dev.tipo === 'CONTA_AZUL' && (
                                        <div className="p-2 bg-blue-50 rounded border border-blue-200 text-xs space-y-1">
                                            <div><span className="font-bold text-blue-700">Nota Devolução:</span> {dev.notaDevolucaoCA || '-'}</div>
                                            {dev.pdfDevolucaoUrl && (
                                                <a href={`${API_URL}${dev.pdfDevolucaoUrl}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                                    <FileText className="h-3 w-3" /> PDF Nota Devolução <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                            {dev.pdfBoletoUrl && (
                                                <a href={`${API_URL}${dev.pdfBoletoUrl}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:underline">
                                                    <FileText className="h-3 w-3" /> PDF Novo Boleto <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                            {dev.processadoCA && (
                                                <div className="text-green-700 font-medium">Processado no CA</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Reversão info */}
                                    {dev.status === 'REVERTIDA' && (
                                        <div className="p-2 bg-amber-50 rounded border border-amber-200 text-xs">
                                            <span className="font-bold text-amber-700">Revertida por:</span> {dev.revertidoPor?.nome || '-'} em {fmtDateTime(dev.revertidoEm)}
                                            {dev.motivoReversao && <> · <span className="text-amber-800">{dev.motivoReversao}</span></>}
                                        </div>
                                    )}

                                    {/* Botão reverter */}
                                    {podeReverter && dev.status === 'ATIVA' && (
                                        <div className="border-t pt-3 space-y-2">
                                            <textarea
                                                value={revertendo === dev.id ? motivoReversao : ''}
                                                onChange={e => { setRevertendo(dev.id); setMotivoReversao(e.target.value); }}
                                                onFocus={() => setRevertendo(dev.id)}
                                                placeholder="Motivo da reversão..."
                                                className="w-full border rounded p-2 text-xs resize-none"
                                                rows={2}
                                            />
                                            <button
                                                onClick={() => handleReverter(dev.id)}
                                                disabled={revertendo === dev.id && !motivoReversao.trim()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700 disabled:opacity-50"
                                            >
                                                {revertendo === dev.id && motivoReversao === '...' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                                Reverter Devolução
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ListaDevolucoes;
