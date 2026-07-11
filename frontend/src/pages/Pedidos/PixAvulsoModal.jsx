import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, Copy, Send, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import asaasService from '../../services/asaasService';

// PIX gerado pelo escritório/faturamento a partir do pedido:
// escolhe a validade, mostra o QR + copia-e-cola e envia o link por WhatsApp.
// Pedido ESPECIAL: aviso destacado — ao ser pago, o pedido é CONVERTIDO em
// pedido normal (com NF). Baixa automática (app + CA) quando pagar.
const VALIDADES = [
    { dias: 0, rotulo: 'Hoje' },
    { dias: 1, rotulo: 'Amanhã' },
    { dias: 3, rotulo: '3 dias' },
    { dias: 7, rotulo: '7 dias' }
];

const PixAvulsoModal = ({ pedido, onClose }) => {
    // pedido: { id, numero, especial, clienteNome, valorSugerido }
    const [valor, setValor] = useState(Number(pedido.valorSugerido || 0).toFixed(2));
    const [validade, setValidade] = useState(1);
    const [cienteConversao, setCienteConversao] = useState(false);
    const [cobranca, setCobranca] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const pollRef = useRef(null);

    // Poll de status enquanto pendente (o backend confere direto no Asaas)
    useEffect(() => {
        if (!cobranca || cobranca.status !== 'PENDENTE') return undefined;
        pollRef.current = setInterval(async () => {
            try {
                const atual = await asaasService.consultar(cobranca.id);
                if (atual.status !== 'PENDENTE') setCobranca(atual);
            } catch (_) { /* tenta no próximo ciclo */ }
        }, 4000);
        return () => clearInterval(pollRef.current);
    }, [cobranca]);

    const handleGerar = async () => {
        const v = Number(String(valor).replace(',', '.'));
        if (!v || v <= 0) return toast.error('Informe um valor maior que zero.');
        if (pedido.especial && !cienteConversao) {
            return toast.error('Confirme que entendeu a conversão do pedido especial.');
        }
        try {
            setGerando(true);
            const nova = await asaasService.criarPix({
                pedidoId: pedido.id,
                valor: v,
                validadeDias: validade,
                vincularParcela: true, // cobrança do financeiro: baixa automática ao pagar
                descricao: `Pedido ${pedido.especial ? 'ZZ#' : '#'}${pedido.numero || 's/n'} - cobrança`
            });
            setCobranca(nova);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao gerar o PIX.');
        } finally {
            setGerando(false);
        }
    };

    const handleCopiar = async () => {
        if (!cobranca?.pixPayload) return toast.error('Código ainda não disponível.');
        try {
            await navigator.clipboard.writeText(cobranca.pixPayload);
            setCopiado(true);
            toast.success('Código PIX copiado!');
            setTimeout(() => setCopiado(false), 3000);
        } catch (_) {
            toast.error('Não consegui copiar automaticamente.');
        }
    };

    const handleWhatsapp = async () => {
        setEnviando(true);
        try {
            const r = await asaasService.enviarPixWhatsapp(cobranca.id);
            toast.success(r.message || 'Enviado!');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao enviar por WhatsApp.');
        } finally {
            setEnviando(false);
        }
    };

    const recebido = cobranca?.status === 'RECEBIDO';

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end md:items-center justify-center" role="dialog">
            <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-2 rounded-lg shrink-0"><QrCode className="h-5 w-5 text-primary" /></div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 leading-tight">Gerar PIX</h3>
                            <p className="text-xs text-gray-500 truncate">
                                Pedido {pedido.especial ? 'ZZ#' : '#'}{pedido.numero || 's/n'}{pedido.clienteNome ? ` · ${pedido.clienteNome}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 flex-1 space-y-4">
                    {/* Aviso de conversão do pedido especial */}
                    {pedido.especial && !recebido && (
                        <div className="bg-red-50 border-2 border-red-600 rounded-xl p-4">
                            <p className="flex items-center gap-2 font-bold text-red-800 text-sm">
                                <AlertTriangle className="h-5 w-5 shrink-0" /> Este pedido vai virar NOTA FISCAL
                            </p>
                            <p className="text-[13px] text-red-900 mt-2">
                                O pedido <b>ZZ#{pedido.numero}</b> é ESPECIAL (sem nota). PIX é pagamento rastreado —
                                ao receber qualquer valor, ele será <b>convertido em pedido normal</b>: ganha número
                                novo na sequência, vai para o Conta Azul e a <b>NF-e deverá ser emitida</b>.
                            </p>
                            <label className="flex items-start gap-2 mt-3 cursor-pointer">
                                <input type="checkbox" checked={cienteConversao} onChange={e => setCienteConversao(e.target.checked)}
                                    className="mt-0.5 h-5 w-5 text-red-600 rounded border-red-400 focus:ring-red-500" />
                                <span className="text-[13px] font-bold text-red-800">Entendi — pode converter ao receber</span>
                            </label>
                        </div>
                    )}

                    {!cobranca && (
                        <>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Valor do PIX (R$)</label>
                                <input
                                    type="number" inputMode="decimal" step="0.01" min="0.01"
                                    className="w-full mt-1 border border-gray-300 rounded px-3 py-3 text-2xl font-bold font-mono text-primaryDark focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    value={valor} onChange={(e) => setValor(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Validade da cobrança</label>
                                <div className="flex gap-2 mt-1.5 flex-wrap">
                                    {VALIDADES.map(v => (
                                        <button key={v.dias} onClick={() => setValidade(v.dias)}
                                            className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${validade === v.dias ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:border-primary'}`}>
                                            {v.rotulo}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-1.5">O QR e o link valem até o fim do dia escolhido. Venceu? Gere outro em 2 toques.</p>
                            </div>
                            <button
                                onClick={handleGerar}
                                disabled={gerando || (pedido.especial && !cienteConversao)}
                                className={`w-full py-4 text-white rounded-full shadow-sm font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50 ${pedido.especial ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primaryDark'}`}
                            >
                                {gerando ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                                {gerando ? 'Gerando...' : pedido.especial ? 'Entendi, gerar PIX' : 'Gerar PIX'}
                            </button>
                        </>
                    )}

                    {cobranca && !recebido && (
                        <div className="text-center space-y-3">
                            <p className="text-3xl font-black text-gray-900 font-mono">R$ {Number(cobranca.valor).toFixed(2)}</p>
                            {cobranca.pixQrCodeBase64 && (
                                <img src={`data:image/png;base64,${cobranca.pixQrCodeBase64}`} alt="QR Code PIX"
                                    className="mx-auto w-56 h-56 max-w-full border border-gray-200 rounded-xl" />
                            )}
                            <div className="flex items-center justify-center gap-2 text-primaryDark">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm font-semibold">Aguardando pagamento...</span>
                            </div>
                            {cobranca.vencimento && (
                                <p className="text-xs text-gray-500">Válido até {new Date(cobranca.vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · baixa automática ao pagar</p>
                            )}
                            <button onClick={handleCopiar}
                                className="w-full py-3 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm flex items-center justify-center gap-2">
                                {copiado ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copiado ? 'Copiado!' : 'Copiar código PIX (copia e cola)'}
                            </button>
                            <button onClick={handleWhatsapp} disabled={enviando}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Enviar link por WhatsApp
                            </button>
                        </div>
                    )}

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
                                <p className="text-sm text-gray-500 mt-2">
                                    Baixa automática feita.{pedido.especial ? ' O pedido foi convertido — o faturamento será avisado para emitir a NF-e.' : ''}
                                </p>
                            </div>
                            <button onClick={onClose}
                                className="w-full py-4 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-base">
                                Concluir
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PixAvulsoModal;
