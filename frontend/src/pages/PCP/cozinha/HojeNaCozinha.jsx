import { Printer, Loader2 } from 'lucide-react';
import { CORES_DIA, diaSemana, dm, hojeIso, pesoTexto, TAMANHOS_COZINHA } from './util';

const STATUS = {
    IMPRESSO: { txt: 'saiu', cls: 'bg-green-100 text-green-800' },
    PENDENTE: { txt: 'na fila', cls: 'bg-amber-100 text-amber-700' },
    ENVIANDO: { txt: 'imprimindo', cls: 'bg-blue-100 text-blue-800' },
    ERRO: { txt: 'não saiu', cls: 'bg-red-100 text-red-700' },
    EXPIRADO: { txt: 'não saiu', cls: 'bg-red-100 text-red-700' },
    CANCELADO: { txt: 'cancelada', cls: 'bg-gray-100 text-gray-700' },
};

function hora(createdAt) {
    if (!createdAt) return '';
    try {
        return new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    } catch { return ''; }
}

export default function HojeNaCozinha({ lotes, carregando, onReimprimir, bloqueado }) {
    return (
        <div className="px-3 md:px-0 mt-2 mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600 my-3 flex items-center gap-2">
                Hoje na cozinha
                <span className="bg-[#cba258] text-[#2b230f] rounded-full px-2 text-[10px] leading-5">{lotes.length}</span>
            </h2>
            {carregando && lotes.length === 0 ? (
                <div className="text-sm text-gray-600 py-4 text-center"><Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Carregando…</div>
            ) : lotes.length === 0 ? (
                <div className="text-sm text-gray-600 text-center py-4 border border-dashed border-gray-300 rounded-xl">Nada etiquetado ainda hoje. Toque num item acima.</div>
            ) : (
                <ul className="space-y-2">
                    {lotes.map(l => {
                        const st = STATUS[l.statusImpressao] || null;
                        const cor = CORES_DIA[diaSemana(l.fabricacao || hojeIso())];
                        const tam = TAMANHOS_COZINHA[l.tamanho]?.curto || l.tamanho || '';
                        const peso = pesoTexto(l.pesoGramas);
                        const detalhes = [
                            l.quantidade != null ? `${l.quantidade}×${tam ? ' ' + tam : ''}` : tam,
                            peso,
                            l.validade ? `val ${dm(l.validade)}` : '',
                            hora(l.createdAt),
                            l.responsavelNome || '',
                        ].filter(Boolean).join(' · ');
                        return (
                            <li key={l.id} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
                                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: cor }} aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <b className="text-sm text-gray-900 break-words">{l.nomeImpresso}</b>
                                        <span className="text-xs font-mono text-gray-600">{l.lote}</span>
                                        {st && <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${st.cls}`}>{st.txt}</span>}
                                    </div>
                                    <div className="text-xs text-gray-600 mt-0.5 break-words">{detalhes}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onReimprimir(l)}
                                    disabled={bloqueado(l)}
                                    className="shrink-0 min-h-[44px] px-4 rounded-full bg-white border border-primary text-primary hover:bg-mint/40 font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <Printer className="h-4 w-4" /> Reimprimir
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
