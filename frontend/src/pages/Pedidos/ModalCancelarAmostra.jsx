import React, { useState } from 'react';
import { X, Ban, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import amostraService from '../../services/amostraService';

// Cancelar amostra COM motivo (≠ excluir): a amostra continua na lista como "Cancelada", com o
// motivo, quem cancelou e quando. Se estava numa carga, o servidor a tira da carga.
// Usado na faixa "Amostras fora de carga" (Expedição → Cargas) e em Pedidos → Amostras.
// Quem pode cancelar é decidido pelo servidor (403 vira toast) — o botão não é escondido no front.

const MIN = 3;
const MAX = 500;

export default function ModalCancelarAmostra({ amostra, onClose, onCancelada }) {
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);

    if (!amostra) return null;

    const rotulo = amostra.etiqueta || (amostra.numero != null ? `AM#${amostra.numero}` : 'Amostra');
    const destinatario = amostra.destinatario
        || amostra.cliente?.NomeFantasia || amostra.cliente?.Nome
        || amostra.lead?.nomeEstabelecimento || '';
    const ehLead = amostra.tipoDestino === 'lead' || (!amostra.cliente && !!amostra.lead);
    const cargaNumero = amostra.embarque?.numero ?? amostra.cargaNumero ?? null;
    const naCarga = !!amostra.embarqueId;

    const motivoLimpo = motivo.trim();
    const podeConfirmar = motivoLimpo.length >= MIN && !salvando;

    const confirmar = async () => {
        if (!podeConfirmar) return;
        setSalvando(true);
        try {
            const resp = await amostraService.cancelar(amostra.id, motivoLimpo);
            const sufixo = resp?.removidaDaCarga && resp?.cargaNumero != null ? `, removida da carga #${resp.cargaNumero}` : '';
            toast.success(`Amostra ${rotulo} cancelada${sufixo}`);
            onCancelada?.(resp);
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Não foi possível cancelar a amostra.');
        } finally {
            // Sempre solta o botão: se o pai não desmontar o modal, ele não fica preso em "Cancelando…"
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={salvando ? undefined : onClose} data-modal-cancelar-amostra>
            <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Cancelar amostra {rotulo}</p>
                        <p className="text-sm text-gray-600 truncate">
                            {destinatario || 'Destinatário'}{ehLead ? ' · lead' : ''}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        A amostra continua na lista como <b className="text-red-700">Cancelada</b>, com o motivo e quem cancelou. Ela não vai mais para a expedição.
                    </p>
                    {naCarga && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                            Esta amostra está na carga{cargaNumero != null ? ` #${cargaNumero}` : ''} — ao cancelar ela sai da carga.
                        </p>
                    )}
                    <div>
                        <label htmlFor="motivo-cancelar-amostra" className="block text-sm font-medium text-gray-700 mb-1">
                            Motivo <span className="text-red-600">*</span>
                        </label>
                        <textarea
                            id="motivo-cancelar-amostra"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value.slice(0, MAX))}
                            rows={3}
                            maxLength={MAX}
                            autoFocus
                            disabled={salvando}
                            placeholder="Ex.: cliente não aceitou / amostra esquecida, não vai mais"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none resize-y"
                        />
                        <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                            <span>{motivoLimpo.length < MIN ? `Mínimo ${MIN} caracteres` : ''}</span>
                            <span>{motivo.length}/{MAX}</span>
                        </div>
                    </div>
                    <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={salvando}
                            className="px-4 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">
                            Voltar
                        </button>
                        <button type="button" onClick={confirmar} disabled={!podeConfirmar} data-confirmar-cancelamento
                            className="px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:hover:bg-red-600 text-white rounded-full shadow-sm font-semibold text-sm flex items-center justify-center gap-2">
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                            {salvando ? 'Cancelando…' : 'Cancelar amostra'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
