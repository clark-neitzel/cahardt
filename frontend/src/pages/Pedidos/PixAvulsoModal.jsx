import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, Copy, Send, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import asaasService from '../../services/asaasService';
import CampoNumero from '../../components/CampoNumero';
import ConfirmarCancelarQr from '../../components/ConfirmarCancelarQr';
import { quandoGerado } from '../../utils/horaQrPix';

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

const brl = (v) => Number(v || 0).toFixed(2).replace('.', ',');

const PixAvulsoModal = ({ pedido, cobrancaId = null, onClose }) => {
    // pedido: { id, numero, especial, clienteNome, valorSugerido }
    // cobrancaId (opcional): abre direto nesse QR (vindo do histórico do pedido)
    const [valor, setValor] = useState(Number(pedido.valorSugerido || 0).toFixed(2));
    const [validade, setValidade] = useState(1);
    const [cienteConversao, setCienteConversao] = useState(false);
    const [cobranca, setCobranca] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const [msgCopiada, setMsgCopiada] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [jaExistia, setJaExistia] = useState(false);
    const [podeCancelar, setPodeCancelar] = useState(false);
    const [conflito, setConflito] = useState(null);
    const [confirmaCancelar, setConfirmaCancelar] = useState(false);
    const [cancelando, setCancelando] = useState(false);
    const pollRef = useRef(null);

    // Validade pré-selecionada vem de Configurações → Asaas (padrão do sistema)
    useEffect(() => {
        (async () => {
            try {
                const { config } = await asaasService.config();
                if ([0, 1, 3, 7].includes(Number(config?.pixValidadePadraoDias))) {
                    setValidade(Number(config.pixValidadePadraoDias));
                }
            } catch (_) { /* mantém o padrão local */ }
        })();
    }, []);

    // Ao abrir: mostra o QR que já existe (o do histórico, ou o vivo do pedido) em vez de criar outro
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await asaasService.pixAtivoDoPedido(pedido.id);
                if (!vivo) return;
                setPodeCancelar(!!r?.podeCancelar);
                if (cobrancaId) {
                    const c = (r?.cobranca && r.cobranca.id === cobrancaId) ? r.cobranca : await asaasService.consultar(cobrancaId);
                    if (vivo && c) { setCobranca(c); setJaExistia(true); }
                } else if (r?.cobranca) {
                    setCobranca(r.cobranca); setJaExistia(true);
                }
            } catch (_) { /* sem QR para mostrar: segue para o formulário */ }
            finally { if (vivo) setCarregando(false); }
        })();
        return () => { vivo = false; };
    }, [pedido.id, cobrancaId]);

    // Poll de status enquanto pendente (o backend confere direto no Asaas)
    useEffect(() => {
        if (!cobranca || !['PENDENTE', 'EXPIRADO'].includes(cobranca.status)) return undefined;
        pollRef.current = setInterval(async () => {
            try {
                const atual = await asaasService.consultar(cobranca.id);
                if (atual.status !== cobranca.status) setCobranca(atual);
            } catch (_) { /* tenta no próximo ciclo */ }
        }, 4000);
        return () => clearInterval(pollRef.current);
    }, [cobranca]);

    const handleGerar = async (substituirPendente = false) => {
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
                descricao: `Pedido ${pedido.especial ? 'ZZ#' : '#'}${pedido.numero || 's/n'} - cobrança`,
                ...(substituirPendente ? { substituirPendente: true } : {})
            });
            setConflito(null);
            setJaExistia(false);
            if (nova?.status === 'RECEBIDO') toast.success('Este PIX já estava pago.');
            setCobranca(nova);
        } catch (error) {
            const d = error.response?.data;
            if (error.response?.status === 409 && (d?.codigo === 'PIX_PENDENTE_VALOR_DIFERENTE' || d?.codigo === 'PIX_FLUXO_DIFERENTE')) {
                setConflito({ ...(d.pendente || {}), _mensagem: d.codigo === 'PIX_FLUXO_DIFERENTE' ? (d.error || 'Já existe um QR deste pedido gerado por outro fluxo.') : null, _fluxo: d.codigo === 'PIX_FLUXO_DIFERENTE' });
                try { const r = await asaasService.pixAtivoDoPedido(pedido.id); setPodeCancelar(!!r?.podeCancelar); } catch (_) { /* mantém */ }
            } else {
                toast.error(d?.error || 'Erro ao gerar o PIX.');
            }
        } finally {
            setGerando(false);
        }
    };

    const handleUsarExistente = async () => {
        try {
            const r = await asaasService.pixAtivoDoPedido(pedido.id);
            setCobranca(r?.cobranca || conflito);
        } catch (_) { setCobranca(conflito); }
        setJaExistia(true);
        setConflito(null);
    };

    const handleCancelarQr = async () => {
        try {
            setCancelando(true);
            const r = await asaasService.cancelarPix(cobranca.id);
            toast.success('QR cancelado.');
            setCobranca(r);
            setJaExistia(false);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Não consegui cancelar o QR.');
        } finally {
            setConfirmaCancelar(false);
            setCancelando(false);
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

    // Copia a MENSAGEM inteira (mesmo texto do envio automático) para colar
    // em qualquer conversa — útil quando o telefone cadastrado não é o do contato.
    const handleCopiarMensagem = async () => {
        if (!cobranca) return;
        const nome = pedido.clienteNome || 'Cliente';
        const numeroPedido = `${pedido.especial ? 'ZZ#' : '#'}${pedido.numero || 's/n'}`;
        const vencStr = cobranca.vencimento
            ? new Date(cobranca.vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : '';
        const msg = `Olá, *${nome}*! 😊\n\nSegue o PIX do pedido *${numeroPedido}*:\n\n💰 Valor: *R$ ${Number(cobranca.valor).toFixed(2).replace('.', ',')}*${vencStr ? `\n📅 Válido até: *${vencStr}*` : ''}${cobranca.linkPagamento ? `\n\n🔗 Link para pagar: ${cobranca.linkPagamento}` : ''}${cobranca.pixPayload ? `\n\n*PIX copia e cola:*\n${cobranca.pixPayload}` : ''}\n\nQualquer dúvida, estamos à disposição!\n_Hardt Doces e Salgados_`;
        try {
            await navigator.clipboard.writeText(msg);
            setMsgCopiada(true);
            toast.success('Mensagem copiada! É só colar no WhatsApp.');
            setTimeout(() => setMsgCopiada(false), 3000);
        } catch (_) {
            toast.error('Não consegui copiar automaticamente.');
        }
    };

    const recebido = cobranca?.status === 'RECEBIDO';
    const cancelada = cobranca?.status === 'CANCELADO';
    const mostraQr = cobranca && !recebido && !cancelada;

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end md:items-center justify-center" role="dialog">
            <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-2 rounded-lg shrink-0"><QrCode className="h-5 w-5 text-primary" /></div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 leading-tight">{jaExistia && cobranca ? 'QR PIX do pedido' : 'Gerar PIX'}</h3>
                            <p className="text-xs text-gray-500 truncate">
                                Pedido {pedido.especial ? 'ZZ#' : '#'}{pedido.numero || 's/n'}{pedido.clienteNome ? ` · ${pedido.clienteNome}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="p-2 text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 flex-1 space-y-4">
                    {/* Aviso de conversão do pedido especial */}
                    {pedido.especial && !cobranca && !carregando && !conflito && (
                        <div className="bg-red-50 border-2 border-red-600 rounded-xl p-4">
                            <p className="flex items-center gap-2 font-bold text-red-800 text-sm">
                                <AlertTriangle className="h-5 w-5 shrink-0" /> Este pedido vai virar NOTA FISCAL
                            </p>
                            <p className="text-[13px] text-red-900 mt-2">
                                O pedido <b>ZZ#{pedido.numero}</b> é ESPECIAL (sem nota). PIX é pagamento rastreado —
                                ao receber qualquer valor, ele será <b>convertido em pedido normal</b>: ganha número
                                novo na sequência e a <b>NF-e deverá ser emitida</b>.
                            </p>
                            <label className="flex items-start gap-2 mt-3 cursor-pointer">
                                <input type="checkbox" checked={cienteConversao} onChange={e => setCienteConversao(e.target.checked)}
                                    className="mt-0.5 h-5 w-5 text-red-600 rounded border-red-400 focus:ring-red-500" />
                                <span className="text-[13px] font-bold text-red-800">Entendi — pode converter ao receber</span>
                            </label>
                        </div>
                    )}

                    {carregando && !cobranca && (
                        <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
                            <Loader2 className="h-5 w-5 animate-spin" /> Verificando se já existe QR...
                        </div>
                    )}

                    {!cobranca && conflito && (
                        <div className="space-y-4 text-center py-2">
                            <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                                <AlertTriangle className="h-8 w-8 text-amber-600" />
                            </div>
                            <p className="text-lg font-bold text-gray-900">
                                Já existe QR{conflito.valor != null ? ` de R$ ${brl(conflito.valor)}` : ''} neste pedido
                            </p>
                            <p className="text-sm text-gray-600 break-words">
                                {conflito._mensagem || `Cada QR custa R$ 1,90 e o cliente pode pagar por qualquer um deles. Use o que já existe${podeCancelar ? ' ou cancele-o para criar outro com o novo valor' : ''}.`}
                            </p>
                            <button onClick={handleUsarExistente}
                                className="w-full py-3 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">
                                Usar este QR
                            </button>
                            {podeCancelar && !conflito._fluxo && (
                                <button onClick={() => handleGerar(true)} disabled={gerando}
                                    className="w-full py-3 min-h-[44px] bg-white border border-red-600 text-red-700 hover:bg-red-50 rounded-full font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                                    {gerando && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Cancelar e criar com o novo valor
                                </button>
                            )}
                            <button onClick={() => setConflito(null)}
                                className="w-full py-3 min-h-[44px] text-gray-600 hover:bg-gray-100 rounded-full font-medium text-sm">
                                Voltar
                            </button>
                        </div>
                    )}

                    {cancelada && (
                        <div className="text-center space-y-4 py-4">
                            <p className="text-sm text-gray-600 break-words">Este QR foi cancelado e não recebe mais pagamento.</p>
                            <button onClick={() => { setCobranca(null); setJaExistia(false); }}
                                className="w-full py-3 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">
                                Gerar novo PIX
                            </button>
                        </div>
                    )}

                    {!cobranca && !carregando && !conflito && (
                        <>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Valor do PIX (R$)</label>
                                <CampoNumero
 step="0.01" min="0.01"
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
                                onClick={() => handleGerar(false)}
                                disabled={gerando || (pedido.especial && !cienteConversao)}
                                className={`w-full py-4 text-white rounded-full shadow-sm font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50 ${pedido.especial ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primaryDark'}`}
                            >
                                {gerando ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                                {gerando ? 'Gerando...' : pedido.especial ? 'Entendi, gerar PIX' : 'Gerar PIX'}
                            </button>
                        </>
                    )}

                    {mostraQr && (
                        <div className="text-center space-y-3">
                            {jaExistia && (
                                <div className="text-left text-xs text-primaryDark bg-mint/60 border border-mint rounded-lg px-3 py-2 break-words">
                                    <b>Já existe:</b> este é o mesmo QR, nenhum novo foi criado{quandoGerado(cobranca.createdAt) ? ` · gerado ${quandoGerado(cobranca.createdAt)}` : ''}.
                                </div>
                            )}
                            <p className="text-3xl font-black text-gray-900 font-mono">R$ {brl(cobranca.valor)}</p>
                            {cobranca.pixQrCodeBase64 && (
                                <img src={`data:image/png;base64,${cobranca.pixQrCodeBase64}`} alt="QR Code PIX"
                                    className="mx-auto w-56 h-56 max-w-full border border-gray-200 rounded-xl" />
                            )}
                            <div className="flex items-center justify-center gap-2 text-primaryDark">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm font-semibold">{cobranca.status === 'EXPIRADO' ? 'Vencido, mas ainda pode ser pago...' : 'Aguardando pagamento...'}</span>
                            </div>
                            {cobranca.vencimento && (
                                <p className="text-xs text-gray-500">Válido até {new Date(cobranca.vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {cobranca.vinculadaParcela ? 'baixa automática ao pagar' : 'a baixa será feita pelo Caixa'}</p>
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
                            <button onClick={handleCopiarMensagem}
                                className="w-full py-3 bg-white border border-green-600 text-green-700 hover:bg-green-50 rounded-full font-medium text-sm flex items-center justify-center gap-2">
                                {msgCopiada ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {msgCopiada ? 'Mensagem copiada!' : 'Copiar mensagem (colar no WhatsApp)'}
                            </button>
                            {podeCancelar && (
                                <button onClick={() => setConfirmaCancelar(true)}
                                    className="w-full py-3 min-h-[44px] text-red-700 hover:bg-red-50 rounded-full font-medium text-sm">
                                    Cancelar este QR
                                </button>
                            )}
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
                                    R$ {brl(cobranca.valorRecebido ?? cobranca.valor)}
                                </p>
                                <p className="text-sm text-gray-500 mt-2">
                                    {cobranca.vinculadaParcela ? 'Baixa automática feita.' : 'A baixa será feita pelo Caixa.'}{pedido.especial ? ' O pedido foi convertido — o faturamento será avisado para emitir a NF-e.' : ''}
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
            {confirmaCancelar && cobranca && (
                <ConfirmarCancelarQr valor={cobranca.valor} cancelando={cancelando}
                    onConfirmar={handleCancelarQr} onVoltar={() => setConfirmaCancelar(false)} />
            )}
        </div>
    );
};

export default PixAvulsoModal;
