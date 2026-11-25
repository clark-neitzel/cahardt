import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, BellOff, Info } from 'lucide-react';
import deliveryService from '../../services/deliveryService';

const { ETAPAS, LABELS } = deliveryService;

/**
 * Janela "Mover pedido" do Delivery — por cima de tudo (portal, z-[60]), celular sobe de
 * baixo e computador centraliza. Sempre pergunta se avisa o cliente: DOIS botões explícitos,
 * sem padrão escondido.
 *
 * Props:
 *   card         o card ATUAL (o pai deriva dos buckets a cada render — polling não deixa dado velho)
 *   perm         { admin, etapasPermitidas }
 *   onConfirmar  async (destino, avisar:boolean) => void — lança Error(mensagem) se falhar
 *                (a janela fica aberta, mostra o erro e reabilita os botões)
 *   onFechar     () => void
 */
export default function JanelaMoverEtapa({ card, perm, onConfirmar, onFechar }) {
    const permitida = (et) => !!(perm?.admin || perm?.etapasPermitidas?.includes(et));
    const idxAtual = ETAPAS.indexOf(card.etapa);
    const outras = ETAPAS.filter((e) => e !== card.etapa);

    const proxima = ETAPAS[idxAtual + 1];
    const [destinoEscolhido, setDestino] = useState(() => (proxima && permitida(proxima) ? proxima : null));
    // Se alguém moveu o pedido enquanto a janela estava aberta e o destino virou a etapa atual, vale como "nada marcado"
    const destino = destinoEscolhido === card.etapa ? null : destinoEscolhido;
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState('');
    const travaRef = useRef(false); // trava síncrona contra duplo clique (o estado só atualiza no render seguinte)

    useEffect(() => {
        const tecla = (e) => { if (e.key === 'Escape' && !travaRef.current) onFechar(); };
        document.addEventListener('keydown', tecla);
        return () => document.removeEventListener('keydown', tecla);
    }, [onFechar]);

    const nome = card.cliente?.NomeFantasia || card.cliente?.Nome || 'Pedido';
    const silenciado = !!card.silenciarWhatsapp;
    const destinoValido = !!destino && destino !== card.etapa && permitida(destino);
    const semDestino = !destinoValido;

    const subtitulo = (et) => {
        const d = ETAPAS.indexOf(et) - idxAtual;
        if (d < 0) return 'voltar';
        if (d === 1) return 'próximo passo';
        return 'pular etapa';
    };

    const confirmar = async (avisar) => {
        if (travaRef.current || !destinoValido) return;
        travaRef.current = true;
        setEnviando(true);
        setErro('');
        try {
            await onConfirmar(destino, avisar);
            // sucesso: o pai fecha a janela; nada a fazer aqui
        } catch (e) {
            setErro(e?.message || 'Não foi possível mover o pedido.');
            travaRef.current = false;
            setEnviando(false);
        }
    };

    return createPortal(
        <div
            onClick={() => { if (!travaRef.current) onFechar(); }}
            className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Mover pedido"
                onClick={(e) => e.stopPropagation()}
                className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
                <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3 md:hidden" />
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-gray-900 truncate">{nome}</h3>
                        <p className="text-xs text-gray-500">
                            {card.numero ? `Pedido #${card.numero} · ` : ''}agora em <b>{LABELS[card.etapa]}</b>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onFechar}
                        disabled={enviando}
                        aria-label="Fechar"
                        className="text-gray-500 hover:text-gray-700 min-h-[44px] min-w-[44px] -m-2 inline-flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Mover para</p>
                <div role="radiogroup" aria-label="Etapa de destino" className="space-y-2">
                    {outras.map((et) => {
                        const liberado = permitida(et);
                        const marcado = destino === et;
                        return (
                            <button
                                key={et}
                                type="button"
                                role="radio"
                                aria-checked={marcado}
                                disabled={!liberado || enviando}
                                onClick={() => setDestino(et)}
                                className={`w-full flex items-center gap-3 text-left min-h-[48px] px-3 py-2 rounded-xl border-2 ${
                                    !liberado
                                        ? 'border-gray-200 opacity-40 cursor-not-allowed'
                                        : marcado
                                            ? 'border-primary bg-[#ecf7f2]'
                                            : 'border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                <span className={`h-[18px] w-[18px] rounded-full border-2 shrink-0 ${marcado ? 'border-primary bg-primary ring-2 ring-inset ring-white' : 'border-gray-400'}`} />
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold text-gray-900">{LABELS[et]}</span>
                                    <span className="block text-[11px] text-gray-500 font-medium">
                                        {liberado ? subtitulo(et) : 'sem permissão para esta etapa'}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-3 space-y-1.5">
                    {silenciado && (
                        <div className="flex items-start gap-2 text-xs bg-gray-100 border border-gray-300 text-gray-700 rounded-lg px-2.5 py-1.5">
                            <BellOff className="h-4 w-4 shrink-0 mt-px" />
                            <span><b>WhatsApp silenciado neste pedido.</b> Escolher "Mover e avisar o cliente" manda o aviso mesmo assim.</span>
                        </div>
                    )}
                    {destino === 'PEDIDO' && (
                        <div className="flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-2.5 py-1.5">
                            <Info className="h-4 w-4 shrink-0 mt-px" />
                            <span>Nesta etapa o sistema <b>não manda mensagem</b> ao cliente.</span>
                        </div>
                    )}
                    <p className="text-[11px] text-gray-500 px-0.5">A equipe interna continua sendo avisada.</p>
                </div>

                {erro && (
                    <div role="alert" className="mt-3 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">
                        {erro}
                    </div>
                )}

                {/* Pergunta explícita: nenhum dos dois botões é "o padrão" (mesmo peso visual, mesma altura e largura) */}
                {/* Para a etapa Pedido o quadro azul já diz que não há mensagem — a pergunta laranja se contradiria */}
                {destino !== 'PEDIDO' && (
                    <div className="mt-4 bg-orange-50 border border-orange-300 rounded-xl px-3 py-2 text-xs leading-snug">
                        <p className="font-bold text-gray-900">💬 Avisar o cliente no WhatsApp?</p>
                        <p className="text-gray-600 mt-0.5">Pedido parado há dias? Escolha "sem avisar" e só o quadro muda.</p>
                    </div>
                )}

                <div className={`${destino === 'PEDIDO' ? 'mt-4' : 'mt-3'} grid gap-2`}>
                    <button
                        type="button"
                        onClick={() => confirmar(true)}
                        disabled={semDestino || enviando}
                        className="w-full min-h-[46px] rounded-full text-sm font-extrabold text-white bg-primary hover:bg-primaryDark shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {enviando ? 'Movendo…' : 'Mover e avisar o cliente'}
                    </button>
                    <button
                        type="button"
                        onClick={() => confirmar(false)}
                        disabled={semDestino || enviando}
                        className={`w-full min-h-[46px] rounded-full text-sm font-extrabold text-white bg-gray-700 hover:bg-gray-800 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${silenciado ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                    >
                        {enviando ? 'Movendo…' : 'Mover sem avisar'}
                    </button>
                    <button
                        type="button"
                        onClick={onFechar}
                        disabled={enviando}
                        className="min-h-[44px] rounded-full text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
