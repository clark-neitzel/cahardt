import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageCircle, X, AlertTriangle, Loader2, Smartphone, Phone } from 'lucide-react';
import deliveryService from '../../services/deliveryService';

// Renderiza o texto da mensagem no estilo WhatsApp:
// *negrito* -> <strong>, `monoespaçado` -> <code>, \n -> quebra de linha.
// Escapa HTML antes de aplicar as marcações, para não injetar tag nenhuma vinda do backend.
function renderizarTextoWhatsapp(texto) {
    const escapado = String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const comCodigo = escapado.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-black/10 font-mono text-[13px]">$1</code>');
    const comNegrito = comCodigo.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    const comQuebras = comNegrito.replace(/\n/g, '<br/>');
    return comQuebras;
}

const badgeOrigemTelefone = (origem) => {
    if (origem === 'celular') return { texto: 'celular', icone: Smartphone };
    if (origem === 'telefone') return { texto: 'telefone', icone: Phone };
    return null;
};

export default function ModalPreviaWhatsapp({ pedidoId, onClose, onConfirmar }) {
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [previa, setPrevia] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const enviandoRef = useRef(false); // trava síncrona extra contra clique duplo
    const modalRef = useRef(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const data = await deliveryService.previaMensagem(pedidoId);
            setPrevia(data);
        } catch (e) {
            setErro(e.response?.data?.error || 'Não foi possível carregar a prévia da mensagem.');
        } finally {
            setCarregando(false);
        }
    }, [pedidoId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Fechar com Esc (não fecha se estiver enviando)
    useEffect(() => {
        const aoTeclar = (e) => {
            if (e.key === 'Escape' && !enviandoRef.current) onClose();
        };
        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [onClose]);

    const fecharPorFora = (e) => {
        if (enviandoRef.current) return;
        if (e.target === e.currentTarget) onClose();
    };

    const handleConfirmar = async () => {
        if (enviandoRef.current) return; // anti-clique-duplo: única trava real contra mensagem em dobro
        enviandoRef.current = true;
        setEnviando(true);
        try {
            await onConfirmar();
            // sucesso: quem chamou fecha o modal
        } catch (e) {
            // erro: destrava para permitir nova tentativa
            enviandoRef.current = false;
            setEnviando(false);
        }
    };

    const badgeOrigem = previa?.cliente?.telefoneOrigem ? badgeOrigemTelefone(previa.cliente.telefoneOrigem) : null;

    return (
        <div
            onMouseDown={fecharPorFora}
            className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center"
        >
            <div
                ref={modalRef}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-white w-full md:max-w-md md:mx-4 rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[92vh] md:max-h-[85vh]"
            >
                {/* Cabeçalho */}
                <div className="flex items-start gap-3 px-4 md:px-5 py-4 border-b border-gray-100 shrink-0">
                    <div className="bg-primary/10 p-2 rounded-full shrink-0">
                        <MessageCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-bold text-gray-900">Enviar WhatsApp</h2>
                        {previa?.cliente && (
                            <div className="mt-0.5">
                                <p className="text-sm font-semibold text-gray-800 truncate">{previa.cliente.nome}</p>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {previa.cliente.telefone && (
                                        <span className="text-xs text-gray-500">{previa.cliente.telefone}</span>
                                    )}
                                    {badgeOrigem && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-mint text-primaryDark">
                                            <badgeOrigem.icone className="h-3 w-3" />
                                            {badgeOrigem.texto}
                                        </span>
                                    )}
                                    {previa.etapaLabel && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                                            {previa.etapaLabel}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => !enviando && onClose()}
                        disabled={enviando}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 disabled:opacity-40 shrink-0"
                        title="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Corpo */}
                <div className="flex-1 overflow-y-auto p-3 md:p-4" style={{ background: '#efeae2' }}>
                    {carregando && (
                        <div className="animate-pulse">
                            <div className="bg-white/80 rounded-2xl rounded-tl-sm p-3 space-y-2 max-w-[90%]">
                                <div className="h-3 bg-gray-300/70 rounded w-4/5" />
                                <div className="h-3 bg-gray-300/70 rounded w-3/5" />
                                <div className="h-3 bg-gray-300/70 rounded w-2/3" />
                            </div>
                        </div>
                    )}

                    {!carregando && erro && (
                        <div className="bg-white rounded-xl p-4 text-sm text-red-700 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{erro}</span>
                        </div>
                    )}

                    {!carregando && !erro && previa && (
                        <>
                            <div
                                className="rounded-2xl rounded-tl-sm p-3 max-w-[92%] shadow-sm text-sm text-gray-900 whitespace-pre-wrap break-words"
                                style={{ background: '#d9fdd3' }}
                                dangerouslySetInnerHTML={{ __html: renderizarTextoWhatsapp(previa.texto) }}
                            />
                            {previa.podeEnviar === false && previa.motivoBloqueio && (
                                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{previa.motivoBloqueio}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Rodapé */}
                <div className="px-4 md:px-5 py-3 border-t border-gray-100 flex gap-3 shrink-0 bg-white rounded-b-2xl">
                    <button
                        onClick={() => !enviando && onClose()}
                        disabled={enviando}
                        className="flex-1 md:flex-none px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] disabled:opacity-40"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmar}
                        disabled={carregando || !!erro || enviando || (previa && previa.podeEnviar === false)}
                        className="flex-1 px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm min-h-[44px] disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {enviando ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Enviando…
                            </>
                        ) : (
                            <>
                                <MessageCircle className="h-4 w-4" />
                                Enviar WhatsApp
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
