import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Package, Tag, CheckCircle2, Truck, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import amostraService from '../../../services/amostraService';
import { useFiltroSalvo } from '../../../hooks/useFiltrosSalvos';
import EtiquetaPedidoModal from '../../Pedidos/EtiquetaPedidoModal';
import EmbarcarAmostraModal from './EmbarcarAmostraModal';

// Faixa "Amostras fora de carga" no topo do Painel de Expedição: amostras abertas
// (Solicitada / Preparação / Liberado) que ainda NÃO estão em nenhuma carga. Some quando vazia.
// Urgência e datas vêm prontas do backend (urgencia, dataEntregaDia) — o front não recalcula fuso.

const STATUS_LABEL = { SOLICITADA: 'Solicitada', PREPARACAO: 'Preparação', LIBERADO: 'Liberado' };
const STATUS_COR = {
    SOLICITADA: 'bg-blue-100 text-blue-800',
    PREPARACAO: 'bg-yellow-100 text-yellow-800',
    LIBERADO: 'bg-emerald-100 text-emerald-800',
};
const BARRA = { vermelho: 'border-l-red-500', ambar: 'border-l-amber-400', cinza: 'border-l-gray-300' };

const diaCurto = (dia) => (/^\d{4}-\d{2}-\d{2}$/.test(dia || '') ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : '');
const amanha = (hoje) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje || '')) return null;
    const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};
const textoEntrega = (a, hoje) => {
    if (!a.dataEntregaDia) return 'sem data';
    if (a.dataEntregaDia === hoje) return `HOJE ${diaCurto(a.dataEntregaDia)}`;
    if (a.dataEntregaDia === amanha(hoje)) return `amanhã ${diaCurto(a.dataEntregaDia)}`;
    if (hoje && a.dataEntregaDia < hoje) return `ATRASADA ${diaCurto(a.dataEntregaDia)}`;
    return diaCurto(a.dataEntregaDia);
};

export default function AmostrasForaDeCarga({ embarques, onMudou, onNovaCarga, recarregarKey }) {
    const [dados, setDados] = useState(null); // { hoje, total, vermelhas, amostras }
    const [aberta, setAberta] = useFiltroSalvo('embarques:faixaAmostrasAberta', true);
    const [liberandoId, setLiberandoId] = useState(null);
    const liberandoRef = useRef(false); // trava síncrona: o estado só atualiza no próximo render e o duplo clique passava
    const [etiqueta, setEtiqueta] = useState(null);
    const [embarcando, setEmbarcando] = useState(null);

    const carregar = useCallback(async () => {
        try {
            const r = await embarqueService.listarAmostrasAbertas();
            setDados({
                hoje: r?.hoje || null,
                total: Number(r?.total) || 0,
                vermelhas: Number(r?.vermelhas) || 0,
                amostras: Array.isArray(r?.amostras) ? r.amostras : [],
            });
        } catch (e) {
            // faixa é um aviso a mais: se falhar, o painel de cargas continua normal
            console.error('Erro ao carregar amostras fora de carga:', e);
        }
    }, []);
    useEffect(() => { carregar(); }, [carregar, recarregarKey]);

    const liberar = async (a) => {
        if (liberandoRef.current) return;
        liberandoRef.current = true;
        setLiberandoId(a.id);
        try {
            await amostraService.liberar(a.id);
            setDados((d) => d && { ...d, amostras: d.amostras.map((x) => (x.id === a.id ? { ...x, status: 'LIBERADO' } : x)) });
            toast.success(`${a.etiqueta || 'Amostra'} liberada.`);
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Não foi possível liberar a amostra.');
        } finally {
            liberandoRef.current = false;
            setLiberandoId(null);
        }
    };

    if (!dados || dados.total <= 0) return null; // sem amostra fora de carga, a faixa não existe

    const hoje = dados.hoje;
    return (
        <div className="mb-3 bg-amber-50 rounded-xl border border-amber-200 shadow-sm overflow-hidden" data-faixa-amostras>
            <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={!!aberta}
                className="w-full flex items-center gap-2 px-3 md:px-4 py-3 min-h-[44px] text-left">
                <Package className="h-4 w-4 text-amber-700 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-900 flex-1">
                    Amostras fora de carga <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 normal-case tracking-normal">{dados.total}</span>
                </span>
                {dados.vermelhas > 0 && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                        {dados.vermelhas} para hoje/atrasada{dados.vermelhas > 1 ? 's' : ''}
                    </span>
                )}
                {aberta ? <ChevronUp className="h-4 w-4 text-amber-700 shrink-0" /> : <ChevronDown className="h-4 w-4 text-amber-700 shrink-0" />}
            </button>

            {aberta && (
                <div className="px-3 md:px-4 pb-3 space-y-2">
                    {dados.amostras.map((a) => (
                        <div key={a.id} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${BARRA[a.urgencia] || BARRA.cinza} p-3`}>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border text-orange-700 bg-orange-50 border-orange-200 shrink-0">{a.etiqueta || `AM#${a.numero}`}</span>
                                <span className="text-sm font-bold text-gray-900 truncate min-w-0 flex-1 basis-40">{a.destinatario || 'Destinatário'}</span>
                                {a.tipoDestino === 'lead' && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700">Lead</span>}
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${STATUS_COR[a.status] || 'bg-gray-100 text-gray-700'}`}>{STATUS_LABEL[a.status] || a.status}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
                                {a.cidade && <span>{a.cidade}</span>}
                                <span className={a.urgencia === 'vermelho' ? 'font-bold text-red-700' : a.urgencia === 'ambar' ? 'font-semibold text-amber-700' : ''}>
                                    Entrega {textoEntrega(a, hoje)}
                                </span>
                                {a.vendedor && <span>vend. {a.vendedor}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" onClick={() => setEtiqueta(a)}
                                    className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs">
                                    <Tag className="h-3.5 w-3.5" /> Etiqueta
                                </button>
                                {a.status !== 'LIBERADO' && (
                                    <button type="button" onClick={() => liberar(a)} disabled={liberandoId === a.id}
                                        className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 rounded-full font-medium text-xs">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> {liberandoId === a.id ? 'Liberando…' : 'Liberar'}
                                    </button>
                                )}
                                <button type="button" onClick={() => setEmbarcando(a)}
                                    className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs">
                                    <Truck className="h-3.5 w-3.5" /> Embarcar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {etiqueta && (
                <EtiquetaPedidoModal
                    amostra={{
                        id: etiqueta.id, numero: etiqueta.numero, status: etiqueta.status,
                        cliente: etiqueta.tipoDestino === 'lead' ? null : { NomeFantasia: etiqueta.destinatario || '', End_Cidade: etiqueta.cidade || '' },
                        lead: etiqueta.tipoDestino === 'lead' ? { nomeEstabelecimento: etiqueta.destinatario || '', cidade: etiqueta.cidade || '' } : null,
                    }}
                    onClose={() => setEtiqueta(null)}
                    onStatus={(novo) => setDados((d) => d && { ...d, amostras: d.amostras.map((x) => (x.id === etiqueta.id ? { ...x, status: novo } : x)) })}
                />
            )}
            {embarcando && (
                <EmbarcarAmostraModal
                    amostra={embarcando}
                    embarques={embarques}
                    hoje={hoje}
                    onClose={() => setEmbarcando(null)}
                    onNovaCarga={() => { setEmbarcando(null); onNovaCarga?.(); }}
                    onEmbarcada={() => { setEmbarcando(null); carregar(); onMudou?.(); }}
                />
            )}
        </div>
    );
}
