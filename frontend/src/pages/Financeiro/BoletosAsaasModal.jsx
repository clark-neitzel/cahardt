import React, { useState, useEffect } from 'react';
import { X, FileText, Copy, Send, Trash2, ExternalLink, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import asaasService from '../../services/asaasService';

// Gestão de boletos Asaas de uma conta a receber:
// emite boleto por parcela (ou todos), copia linha digitável, abre o PDF,
// envia por WhatsApp e cancela. Pago via webhook = baixa automática (app + CA).
const BoletosAsaasModal = ({ conta, onClose, onAtualizado }) => {
    const [dados, setDados] = useState(null); // { parcelas: [...] }
    const [loading, setLoading] = useState(true);
    const [agindo, setAgindo] = useState(null); // id da parcela/boleto em ação

    // Abre por conta (Financeiro) ou por pedido (lista de Pedidos)
    const carregar = async () => {
        try {
            const r = conta.id
                ? await asaasService.boletosDaConta(conta.id)
                : await asaasService.boletosDoPedido(conta.pedidoId);
            setDados(r);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar boletos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregar(); }, [conta.id, conta.pedidoId]);

    const emAberto = (dados?.parcelas || []).filter(p => ['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(p.status));
    const semBoleto = emAberto.filter(p => !p.boleto || !['PENDENTE', 'RECEBIDO'].includes(p.boleto.status));

    const handleEmitir = async (parcelaIds) => {
        setAgindo('emitir');
        try {
            const r = await asaasService.emitirBoletos({ contaReceberId: conta.id || dados?.contaId, parcelaIds });
            toast.success(r.message);
            const comErro = (r.resultados || []).filter(x => !x.ok);
            comErro.forEach(x => toast.error(x.erro, { duration: 6000 }));
            await carregar();
            onAtualizado?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao emitir boleto.');
        } finally {
            setAgindo(null);
        }
    };

    const handleCopiar = async (boleto) => {
        let linha = boleto.linhaDigitavel;
        if (!linha) {
            try {
                const atualizado = await asaasService.consultarBoleto(boleto.id);
                linha = atualizado.linhaDigitavel;
            } catch (_) { /* segue sem linha */ }
        }
        if (!linha) return toast.error('Linha digitável ainda não disponível. Tente em instantes.');
        try {
            await navigator.clipboard.writeText(linha);
            toast.success('Linha digitável copiada!');
        } catch (_) {
            toast.error('Não consegui copiar automaticamente.');
        }
    };

    const handleWhatsapp = async (boleto) => {
        setAgindo(boleto.id);
        try {
            const r = await asaasService.enviarBoletoWhatsapp(boleto.id);
            toast.success(r.message || 'Enviado!');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao enviar por WhatsApp.');
        } finally {
            setAgindo(null);
        }
    };

    const handleCancelar = async (boleto) => {
        if (!window.confirm('Cancelar este boleto? O cliente não conseguirá mais pagá-lo.')) return;
        setAgindo(boleto.id);
        try {
            await asaasService.cancelarBoleto(boleto.id);
            toast.success('Boleto cancelado.');
            await carregar();
            onAtualizado?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao cancelar boleto.');
        } finally {
            setAgindo(null);
        }
    };

    const badgeBoleto = (p) => {
        const b = p.boleto;
        if (!b || b.status === 'CANCELADO' || b.status === 'EXPIRADO') {
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Sem boleto</span>;
        }
        if (b.status === 'RECEBIDO') {
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Pago via Asaas</span>;
        }
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Boleto emitido</span>;
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end md:items-center justify-center" role="dialog">
            <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-2 rounded-lg shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 leading-tight truncate">Boletos Asaas</h3>
                            <p className="text-xs text-gray-500 truncate">
                                {conta.clienteNome}{conta.pedidoNumero ? ` · Pedido #${conta.pedidoNumero}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
                            <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
                        </div>
                    ) : (
                        <>
                            {semBoleto.length > 1 && (
                                <button
                                    onClick={() => handleEmitir(null)}
                                    disabled={agindo === 'emitir'}
                                    className="w-full py-3 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {agindo === 'emitir' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                    Emitir boletos de todas as parcelas em aberto ({semBoleto.length})
                                </button>
                            )}

                            {(dados?.parcelas || []).map(p => (
                                <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-900 text-sm">Parcela {p.numeroParcela}</span>
                                            <span className="text-sm text-gray-500 font-mono">R$ {Number(p.saldo || p.valor).toFixed(2)}</span>
                                            {p.dataVencimento && (
                                                <span className="text-xs text-gray-500">
                                                    vence {new Date(p.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                </span>
                                            )}
                                        </div>
                                        {p.status === 'PAGO'
                                            ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Parcela paga</span>
                                            : badgeBoleto(p)}
                                    </div>

                                    {/* Boleto pago: mostra confirmação e status das baixas */}
                                    {p.boleto?.status === 'RECEBIDO' && (
                                        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                                            <CheckCircle className="h-4 w-4 shrink-0" />
                                            <span>
                                                Pago em {p.boleto.recebidoEm ? new Date(p.boleto.recebidoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                                                {' · '}baixa no app {p.boleto.baixaAppOk ? 'OK' : 'pendente'}
                                                {' · '}baixa no CA {p.boleto.baixaCaOk ? 'OK' : 'pendente'}
                                            </span>
                                        </div>
                                    )}
                                    {p.boleto?.baixaErro && (
                                        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>{p.boleto.baixaErro}</span>
                                        </div>
                                    )}

                                    {/* Ações */}
                                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                                        {['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(p.status) && (!p.boleto || !['PENDENTE', 'RECEBIDO'].includes(p.boleto.status)) && (
                                            <button
                                                onClick={() => handleEmitir([p.id])}
                                                disabled={agindo === 'emitir'}
                                                className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs disabled:opacity-60"
                                            >
                                                Emitir boleto
                                            </button>
                                        )}
                                        {p.boleto?.status === 'PENDENTE' && (
                                            <>
                                                {p.boleto.boletoUrl && (
                                                    <a
                                                        href={p.boleto.boletoUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="px-3 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs inline-flex items-center gap-1"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => handleCopiar(p.boleto)}
                                                    className="px-3 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs inline-flex items-center gap-1"
                                                >
                                                    <Copy className="h-3.5 w-3.5" /> Linha digitável
                                                </button>
                                                <button
                                                    onClick={() => handleWhatsapp(p.boleto)}
                                                    disabled={agindo === p.boleto.id}
                                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-full font-semibold text-xs inline-flex items-center gap-1 disabled:opacity-60"
                                                >
                                                    {agindo === p.boleto.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                                    WhatsApp
                                                </button>
                                                <button
                                                    onClick={() => handleCancelar(p.boleto)}
                                                    disabled={agindo === p.boleto.id}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50"
                                                    title="Cancelar boleto"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}

                            <p className="text-xs text-gray-500 px-1">
                                Quando o cliente pagar, o Asaas avisa o sistema e a baixa acontece sozinha — aqui e no Conta Azul (conta ASAAS).
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BoletosAsaasModal;
