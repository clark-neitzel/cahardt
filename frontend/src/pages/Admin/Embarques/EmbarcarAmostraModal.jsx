import React, { useMemo, useState } from 'react';
import { X, Truck, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import SelectBusca from '../../../components/SelectBusca';

// "Em qual carga?" — leva uma amostra que ainda está fora de carga para uma carga já montada.
// Grava por POST /embarques/:id/amostras com liberar:true (libera e embarca de uma vez; se a
// amostra já está LIBERADA, só embarca). Não mexe no AdicionarPedidosModal.

const fmtDia = (dia) => (/^\d{4}-\d{2}-\d{2}$/.test(dia || '') ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : '');

export default function EmbarcarAmostraModal({ amostra, embarques, hoje, onClose, onEmbarcada, onNovaCarga }) {
    // Cargas de hoje em diante (a data de saída vem como ISO; o dia é a fatia da string)
    const cargas = useMemo(() => (embarques || [])
        .filter((e) => { const d = String(e.dataSaida || '').slice(0, 10); return d && (!hoje || d >= hoje); })
        .sort((a, b) => String(a.dataSaida).localeCompare(String(b.dataSaida)) || (a.numero - b.numero)),
    [embarques, hoje]);

    // Pré-seleção: a carga do dia da entrega; senão a mais próxima
    const [cargaId, setCargaId] = useState(() => {
        const dia = amostra?.dataEntregaDia;
        const doDia = dia ? cargas.find((c) => String(c.dataSaida).slice(0, 10) === dia) : null;
        return (doDia || cargas[0])?.id || '';
    });
    const [salvando, setSalvando] = useState(false);

    const precisaLiberar = amostra?.status !== 'LIBERADO';
    const rotulo = precisaLiberar ? 'Liberar e embarcar' : 'Embarcar';

    const confirmar = async () => {
        if (!cargaId || salvando) return;
        setSalvando(true);
        try {
            await embarqueService.inserirAmostras(cargaId, [amostra.id], { liberar: true });
            const c = cargas.find((x) => x.id === cargaId);
            toast.success(`${amostra.etiqueta || 'Amostra'} ${precisaLiberar ? 'liberada e ' : ''}embarcada${c ? ` na carga #${c.numero}` : ''}.`);
            onEmbarcada?.();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Não foi possível embarcar a amostra.');
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end md:items-center justify-center p-0 md:p-4" onClick={salvando ? undefined : onClose}>
            <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Em qual carga?</p>
                        <p className="text-sm text-gray-600 truncate">{amostra.etiqueta || 'Amostra'}{amostra.destinatario ? ` — ${amostra.destinatario}` : ''}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-4 space-y-4">
                    {cargas.length === 0 ? (
                        <>
                            <p className="text-sm text-gray-700">Não há carga montada para hoje ou para os próximos dias. Monte uma carga e depois embarque a amostra.</p>
                            <button type="button" onClick={onNovaCarga}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">
                                <Truck className="h-4 w-4" /> Montar Nova Carga
                            </button>
                        </>
                    ) : (
                        <>
                            {amostra.dataEntregaDia && <p className="text-xs text-gray-500">Entrega da amostra: {fmtDia(amostra.dataEntregaDia)}</p>}
                            <SelectBusca value={cargaId} onChange={(e) => setCargaId(e.target.value)} className="w-full h-11">
                                {cargas.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {`Carga #${c.numero} · ${fmtDia(String(c.dataSaida).slice(0, 10))}${c.responsavel?.nome ? ` · ${c.responsavel.nome}` : ''}`}
                                    </option>
                                ))}
                            </SelectBusca>
                            {precisaLiberar && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">Esta amostra ainda não foi liberada. Ao confirmar, ela é liberada e entra na carga.</p>}
                            <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                                <button type="button" onClick={onClose} disabled={salvando}
                                    className="px-4 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                                <button type="button" onClick={confirmar} disabled={!cargaId || salvando}
                                    className="px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark disabled:opacity-60 text-white rounded-full shadow-sm font-semibold text-sm flex items-center justify-center gap-2">
                                    {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {rotulo}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
