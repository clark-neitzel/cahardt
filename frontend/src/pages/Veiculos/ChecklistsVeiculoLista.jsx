import React, { useState, useEffect } from 'react';
import ImgComFalha, { } from '../../components/Diario/ImgComFalha';
import { Loader2, ClipboardCheck } from 'lucide-react';
import checklistVeiculoService, { urlImagem } from '../../services/checklistVeiculoService';

const VEREDITO = {
    APROVADO: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
    ATENCAO: { label: 'Atenção', cls: 'bg-amber-100 text-amber-700' },
    REPROVADO: { label: 'Reprovado', cls: 'bg-red-100 text-red-700' },
    IA_INDISPONIVEL: { label: 'Sem análise', cls: 'bg-gray-100 text-gray-700' },
};
const DECISAO = {
    CORRIGIU: 'Corrigiu',
    SEGUIU_TESTE: 'Seguiu mesmo assim (teste)',
};

const fmtData = (d) => {
    if (!d) return '';
    const p = String(d).split('T')[0].split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};
const fmtKm = (n) => (n != null ? `${Number(n).toLocaleString('pt-BR')} km` : '—');

/** Aba "Checklists" da ficha do veículo: lista simples por dia (Dia 1, sem modal de detalhe). */
const ChecklistsVeiculoLista = ({ veiculoId }) => {
    const [lista, setLista] = useState(null);
    const [erro, setErro] = useState(false);
    const [foto, setFoto] = useState(null); // miniatura ampliada

    const carregar = async () => {
        try {
            setErro(false);
            const r = await checklistVeiculoService.listarDoVeiculo(veiculoId, { limit: 30 });
            setLista(Array.isArray(r) ? r : []);
        } catch {
            setErro(true);
        }
    };
    useEffect(() => { carregar(); }, [veiculoId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (erro) {
        return (
            <div className="text-center py-10 text-sm text-gray-600">
                Não consegui carregar os checklists.
                <button type="button" onClick={carregar} className="block mx-auto mt-3 min-h-[44px] px-4 border border-primary text-primary rounded-full font-medium">Tentar de novo</button>
            </div>
        );
    }
    if (!lista) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (lista.length === 0) {
        return (
            <div className="text-center text-gray-500 py-10">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum checklist por foto registrado ainda.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {lista.map(c => {
                const v = VEREDITO[c.veredito] || { label: c.veredito || 'Sem veredito', cls: 'bg-gray-100 text-gray-700' };
                const problemas = Array.isArray(c.problemas) ? c.problemas : [];
                const fotos = Array.isArray(c.fotos) ? c.fotos : [];
                const kmDiverge = c.kmLido != null && c.kmDigitado != null && c.kmLido !== c.kmDigitado;
                return (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">{fmtData(c.dataReferencia)}{c.momento === 'VOLTA' ? ' · Volta' : ''}</p>
                                <p className="text-xs text-gray-500 truncate">{c.vendedor?.nome || '—'}</p>
                            </div>
                            <span className={`shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${v.cls}`}>{v.label}</span>
                        </div>
                        <div className="text-xs text-gray-600 space-y-0.5 mb-2">
                            <p>Decisão: <span className="font-semibold text-gray-800">{c.decisao ? (DECISAO[c.decisao] || c.decisao) : '—'}</span></p>
                            <p>
                                KM lido pela IA: <span className="font-mono font-semibold text-gray-800">{fmtKm(c.kmLido)}</span>
                                {' · '}digitado: <span className={`font-mono font-semibold ${kmDiverge ? 'text-amber-700' : 'text-gray-800'}`}>{fmtKm(c.kmDigitado)}</span>
                            </p>
                        </div>
                        {fotos.length > 0 && (
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                                {fotos.map(f => (
                                    <button key={f.id} type="button" onClick={() => setFoto(f)} className="shrink-0 text-left" title={f.rotulo || f.angulo}>
                                        <ImgComFalha compacto src={urlImagem(f.url)} alt={f.rotulo || f.angulo} loading="lazy"
                                            className="h-14 w-14 object-cover rounded-lg border border-gray-200" />
                                    </button>
                                ))}
                            </div>
                        )}
                        {problemas.length > 0 && (
                            <ul className="mt-2 space-y-1">
                                {problemas.map((p, i) => (
                                    <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                                        <span className={`shrink-0 font-bold ${p.gravidade === 'REPROVA' ? 'text-red-600' : 'text-amber-600'}`}>{p.gravidade === 'REPROVA' ? 'Grave' : 'Atenção'}:</span>
                                        <span>{p.descricao}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}

            {foto && (
                <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4" onClick={() => setFoto(null)}>
                    <div className="max-w-full" onClick={e => e.stopPropagation()}>
                        <ImgComFalha src={urlImagem(foto.url)} alt={foto.rotulo || foto.angulo} className="min-h-[120px] min-w-[220px] max-h-[80vh] max-w-full rounded-lg" />
                        <p className="text-white text-sm text-center mt-2">{foto.rotulo || foto.angulo}</p>
                        <button type="button" onClick={() => setFoto(null)} className="block mx-auto mt-2 min-h-[44px] px-5 bg-white text-gray-800 rounded-full text-sm font-semibold">Fechar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChecklistsVeiculoLista;
