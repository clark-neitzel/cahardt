import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Loader2, FileText, ExternalLink } from 'lucide-react';
import devolucaoService from '../../services/devolucaoService';
import api, { API_URL } from '../../services/api';
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
    const podeEmitirNF = user?.permissoes?.admin || user?.permissoes?.Pode_Emitir_NF;

    const TAM_PAGINA = 50;
    const [devolucoes, setDevolucoes] = useState([]);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMais, setLoadingMais] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [revertendo, setRevertendo] = useState(null);
    const [motivoReversao, setMotivoReversao] = useState('');
    const [emitindoNF, setEmitindoNF] = useState(null);   // devolucaoId em emissão
    const [baixandoDanfe, setBaixandoDanfe] = useState(null);

    const emitirNFDevolucao = async (dev) => {
        setEmitindoNF(dev.id);
        try {
            await api.post(`/notas-fiscais/emitir-devolucao/${dev.id}`);
            toast.success(`NF de devolução do DEV#${dev.numero} enviada para emissão.`);
            await carregar(1);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao emitir a NF de devolução.');
        } finally {
            setEmitindoNF(null);
        }
    };

    const abrirDanfeDevolucao = async (nota) => {
        setBaixandoDanfe(nota.id);
        try {
            const resp = await api.get(`/notas-fiscais/${nota.id}/danfe`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            toast.error('Erro ao abrir a DANFE da devolução.');
        } finally {
            setBaixandoDanfe(null);
        }
    };

    useEffect(() => {
        carregar(1);
    }, [filtros?.dataEntregaDe, filtros?.dataEntregaAte, filtros?.vendedorId]);

    // pg === 1 reinicia a lista; pg > 1 acrescenta (Carregar mais). Antes a tela mostrava
    // só as 50 primeiras (limite do backend) e escondia o resto silenciosamente.
    const carregar = async (pg = 1) => {
        const primeira = pg === 1;
        try {
            if (primeira) setLoading(true); else setLoadingMais(true);
            const params = { pagina: pg, tamanhoPagina: TAM_PAGINA };
            if (filtros?.dataEntregaDe) params.dataInicio = filtros.dataEntregaDe;
            if (filtros?.dataEntregaAte) params.dataFim = filtros.dataEntregaAte;
            const result = await devolucaoService.listar(params);
            const items = result.items || [];
            setTotal(result.total || 0);
            setPagina(pg);
            if (primeira) setDevolucoes(items);
            else setDevolucoes(prev => [...prev, ...items]);
        } catch (error) {
            toast.error('Erro ao carregar devoluções.');
        } finally {
            setLoading(false);
            setLoadingMais(false);
        }
    };

    const carregarMais = () => carregar(pagina + 1);

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
        return (
            <div className="flex items-center justify-center gap-2 p-10 bg-white rounded-xl border border-gray-200">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                <span className="text-sm text-gray-500">Carregando devoluções…</span>
            </div>
        );
    }

    if (devolucoes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-10 gap-2 bg-white rounded-xl border border-gray-200">
                <RotateCcw className="h-10 w-10 text-gray-200" />
                <span className="text-sm text-gray-400">Nenhuma devolução encontrada no período.</span>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm">
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

                                    {/* NF-e de devolução emitida pelo APP (Focus) — só p/ devolução de pedido com nota */}
                                    {dev.tipo !== 'ESPECIAL' && !dev.notaDevolucaoCA && (
                                        <div className="p-2 bg-emerald-50 rounded border border-emerald-200 text-xs space-y-1.5">
                                            {dev.notaFiscalDevolucao?.status === 'AUTORIZADO' ? (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-bold">✓ NF devolução {dev.notaFiscalDevolucao.numero} · série {dev.notaFiscalDevolucao.serie}</span>
                                                    <button
                                                        onClick={() => abrirDanfeDevolucao(dev.notaFiscalDevolucao)}
                                                        disabled={baixandoDanfe === dev.notaFiscalDevolucao.id}
                                                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-primary text-primary font-bold hover:bg-mint/40 disabled:opacity-50"
                                                    >
                                                        {baixandoDanfe === dev.notaFiscalDevolucao.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                                                        DANFE
                                                    </button>
                                                </div>
                                            ) : dev.notaFiscalDevolucao?.status === 'PROCESSANDO' ? (
                                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">⏳ NF de devolução processando na SEFAZ…</span>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {dev.notaFiscalDevolucao?.status === 'ERRO' && (
                                                        <div className="text-red-700">✕ Rejeitada: {dev.notaFiscalDevolucao.mensagemSefaz}</div>
                                                    )}
                                                    {podeEmitirNF && dev.status === 'ATIVA' && (
                                                        <button
                                                            onClick={() => emitirNFDevolucao(dev)}
                                                            disabled={emitindoNF === dev.id}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-full text-xs font-bold hover:bg-primaryDark disabled:opacity-50"
                                                        >
                                                            {emitindoNF === dev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                                                            {dev.notaFiscalDevolucao?.status === 'ERRO' ? 'Emitir novamente' : 'Emitir NF de devolução'}
                                                        </button>
                                                    )}
                                                </div>
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
                                        <div className="border-t border-gray-100 pt-3 space-y-2">
                                            <textarea
                                                value={revertendo === dev.id ? motivoReversao : ''}
                                                onChange={e => { setRevertendo(dev.id); setMotivoReversao(e.target.value); }}
                                                onFocus={() => setRevertendo(dev.id)}
                                                placeholder="Motivo da reversão..."
                                                className="w-full border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                                rows={2}
                                            />
                                            <button
                                                onClick={() => handleReverter(dev.id)}
                                                disabled={revertendo === dev.id && !motivoReversao.trim()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors"
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
            {/* Carregar mais (paginação servidor) */}
            {devolucoes.length < total && (
                <div className="flex flex-col items-center gap-2 p-3 border-t border-gray-100">
                    <span className="text-[11px] text-gray-400">Mostrando {devolucoes.length} de {total}</span>
                    <button
                        onClick={carregarMais}
                        disabled={loadingMais}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-full border border-gray-300 text-sm text-gray-600 font-semibold hover:bg-gray-50 inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {loadingMais && <Loader2 className="h-4 w-4 animate-spin" />}
                        Carregar mais {Math.min(TAM_PAGINA, total - devolucoes.length)}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ListaDevolucoes;
