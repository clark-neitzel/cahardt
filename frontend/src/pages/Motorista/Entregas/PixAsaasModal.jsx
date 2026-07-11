import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, Copy, CheckCircle, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import asaasService from '../../../services/asaasService';

// Modal de cobrança PIX na entrega (Asaas):
// motorista define o valor → QR Code na tela → cliente paga →
// confirmação automática em segundos (poll no backend, que confere no Asaas).
const PixAsaasModal = ({ pedido, valorSugerido, valorMaximo, onRecebido, onClose }) => {
    const [valor, setValor] = useState(Number(valorSugerido || 0).toFixed(2));
    const [cobranca, setCobranca] = useState(null); // cobrança PENDENTE/RECEBIDA em tela
    const [gerando, setGerando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const pollRef = useRef(null);
    const recebidoRef = useRef(false);

    // Poll de status a cada 3,5s enquanto houver cobrança pendente na tela
    useEffect(() => {
        if (!cobranca || cobranca.status !== 'PENDENTE') return undefined;
        pollRef.current = setInterval(async () => {
            try {
                const atual = await asaasService.consultar(cobranca.id);
                if (atual.status !== 'PENDENTE') {
                    setCobranca(atual);
                }
            } catch (_) { /* sem rede agora — tenta de novo no próximo ciclo */ }
        }, 3500);
        return () => clearInterval(pollRef.current);
    }, [cobranca]);

    // Quando confirmar o recebimento, avisa a tela de pagamentos (uma vez só)
    useEffect(() => {
        if (cobranca?.status === 'RECEBIDO' && !recebidoRef.current) {
            recebidoRef.current = true;
            toast.success('PIX recebido! Pagamento confirmado pelo banco.');
        }
    }, [cobranca]);

    const handleGerar = async () => {
        const v = Number(String(valor).replace(',', '.'));
        if (!v || v <= 0) return toast.error('Informe um valor maior que zero.');
        if (valorMaximo != null && v > Number(valorMaximo) + 0.05) {
            return toast.error(`O PIX não pode passar de R$ ${Number(valorMaximo).toFixed(2)} (saldo a receber).`);
        }
        try {
            setGerando(true);
            const nova = await asaasService.criarPix({
                pedidoId: pedido.id,
                valor: v,
                descricao: `Pedido #${pedido.numero || 's/n'} - entrega`
            });
            setCobranca(nova);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao gerar o PIX. Tente novamente.');
        } finally {
            setGerando(false);
        }
    };

    const handleCopiar = async () => {
        try {
            await navigator.clipboard.writeText(cobranca.pixPayload);
            setCopiado(true);
            toast.success('Código PIX copiado! Cole no app do banco.');
            setTimeout(() => setCopiado(false), 3000);
        } catch (_) {
            toast.error('Não consegui copiar. Peça para o cliente escanear o QR Code.');
        }
    };

    const handleFecharSemPagar = async () => {
        if (cobranca && cobranca.status === 'PENDENTE') {
            try { await asaasService.cancelar(cobranca.id); } catch (_) { /* melhor esforço */ }
        }
        onClose();
    };

    const recebido = cobranca?.status === 'RECEBIDO';
    const problema = cobranca && ['CANCELADO', 'EXPIRADO'].includes(cobranca.status);

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end md:items-center justify-center" role="dialog">
            <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                        <div className="bg-mint p-2 rounded-lg">
                            <QrCode className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 leading-tight">Receber com PIX</h3>
                            <p className="text-xs text-gray-500">Pedido #{pedido.numero || 's/n'}</p>
                        </div>
                    </div>
                    {!recebido && (
                        <button onClick={handleFecharSemPagar} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                <div className="p-5 flex-1">
                    {/* Etapa 1: definir o valor */}
                    {!cobranca && (
                        <div className="space-y-4">
                            {/* Pedido ESPECIAL: PIX converte em pedido com NF (regra do dono) */}
                            {pedido.especial && (
                                <div className="bg-red-50 border-2 border-red-600 rounded-xl p-3.5">
                                    <p className="flex items-center gap-2 font-bold text-red-800 text-sm">
                                        <AlertTriangle className="h-5 w-5 shrink-0" /> Este pedido vai virar NOTA FISCAL
                                    </p>
                                    <p className="text-xs text-red-900 mt-1.5">
                                        Pedido ESPECIAL pago com PIX é <b>convertido automaticamente</b> em pedido
                                        normal (ganha número novo e a NF-e será emitida pelo escritório).
                                        Se o cliente não quiser nota, receba em dinheiro.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label className="text-sm font-medium text-gray-700">Valor do PIX (R$)</label>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0.01"
                                    className="w-full mt-1 border border-gray-300 rounded px-3 py-3 text-2xl font-bold font-mono text-primaryDark focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    value={valor}
                                    onChange={(e) => setValor(e.target.value)}
                                />
                                {valorMaximo != null && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Saldo a receber: R$ {Number(valorMaximo).toFixed(2)}. Pode ser menor se parte for em dinheiro.
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={handleGerar}
                                disabled={gerando}
                                className="w-full py-4 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {gerando ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                                {gerando ? 'Gerando QR Code...' : 'Gerar QR Code'}
                            </button>
                        </div>
                    )}

                    {/* Etapa 2: QR na tela, aguardando pagamento */}
                    {cobranca && !recebido && !problema && (
                        <div className="space-y-4 text-center">
                            <p className="text-3xl font-black text-gray-900 font-mono">R$ {Number(cobranca.valor).toFixed(2)}</p>
                            {cobranca.pixQrCodeBase64 ? (
                                <img
                                    src={`data:image/png;base64,${cobranca.pixQrCodeBase64}`}
                                    alt="QR Code PIX"
                                    className="mx-auto w-64 h-64 max-w-full border border-gray-200 rounded-xl"
                                />
                            ) : (
                                <div className="mx-auto w-64 h-64 border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm">
                                    QR indisponível — use o copia e cola
                                </div>
                            )}
                            <div className="flex items-center justify-center gap-2 text-primaryDark">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm font-semibold">Aguardando pagamento...</span>
                            </div>
                            <p className="text-xs text-gray-500">A confirmação aparece aqui em segundos, direto do banco.</p>
                            {cobranca.pixPayload && (
                                <button
                                    onClick={handleCopiar}
                                    className="w-full py-3 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm flex items-center justify-center gap-2"
                                >
                                    {copiado ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    {copiado ? 'Copiado!' : 'Copiar código PIX (copia e cola)'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Etapa 3: pago! */}
                    {recebido && (
                        <div className="text-center space-y-4 py-6">
                            <div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle className="h-12 w-12 text-green-600" />
                            </div>
                            <div>
                                <h4 className="text-2xl font-black text-green-700">PIX Recebido!</h4>
                                <p className="text-3xl font-black text-gray-900 font-mono mt-2">
                                    R$ {Number(cobranca.valorRecebido ?? cobranca.valor).toFixed(2)}
                                </p>
                                <p className="text-sm text-gray-500 mt-2">Pagamento confirmado pelo banco. Pode entregar tranquilo.</p>
                            </div>
                            <button
                                onClick={() => onRecebido(cobranca)}
                                className="w-full py-4 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-base"
                            >
                                Continuar
                            </button>
                        </div>
                    )}

                    {/* Problema: cancelado/expirado */}
                    {problema && (
                        <div className="text-center space-y-4 py-6">
                            <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                                <AlertCircle className="h-10 w-10 text-red-600" />
                            </div>
                            <p className="text-sm text-gray-600">
                                {cobranca.status === 'EXPIRADO' ? 'Este QR Code expirou.' : 'Esta cobrança foi cancelada.'} Gere um novo para cobrar.
                            </p>
                            <button
                                onClick={() => { setCobranca(null); }}
                                className="w-full py-3 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm"
                            >
                                Gerar novo PIX
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PixAsaasModal;
