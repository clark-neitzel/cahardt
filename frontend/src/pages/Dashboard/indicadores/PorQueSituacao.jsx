import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, TrendingDown, TrendingUp, AlertTriangle, Info } from 'lucide-react';
import { Selo } from './Bloco';
import { fmtNum, fmtPct, fmtInt, fmtData, temValor } from './formatos';

const ICONE_MOTIVO = {
    custo_faltando: AlertTriangle, ficha_desatualizada: AlertTriangle,
    estavel: Info, sem_comparacao: Info,
};

// Ícone dos motivos preco/custo pela direção REAL (anterior × atual); sem comparação = Info.
const CAMPO_MOTIVO = { preco: ['precoMedio', 'sobe'], custo: ['custoVariavelUn', 'desce'] };
function iconeMotivo(m, atual, anterior) {
    const c = CAMPO_MOTIVO[m.tipo];
    if (!c) return { Ic: ICONE_MOTIVO[m.tipo] || Info, cor: 'text-gray-600' };
    const a = atual?.[c[0]], b = anterior?.[c[0]];
    if (!temValor(a) || !temValor(b) || Number(a) === Number(b)) return { Ic: Info, cor: 'text-gray-600' };
    const sobe = Number(a) > Number(b);
    return { Ic: sobe ? TrendingUp : TrendingDown, cor: sobe === (c[1] === 'sobe') ? 'text-green-700' : 'text-red-700' };
}

// Δ da célula "este período". bom = 'sobe' (subir melhora a margem), 'desce' (subir piora) ou null (neutro).
function Variacao({ atual, anterior, bom, pontos }) {
    if (!temValor(atual) || !temValor(anterior)) return null;
    const a = Number(atual), b = Number(anterior);
    const d = pontos ? a - b : (b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);
    if (d === null || Math.abs(d) < 0.05) return null;
    const sobe = d > 0;
    let cor = 'text-gray-600';
    if (bom) cor = (sobe === (bom === 'sobe')) ? 'text-green-700' : 'text-red-700';
    return (
        <span className={`block text-xs font-bold ${cor}`}>
            {sobe ? '▲' : '▼'} {fmtNum(Math.abs(d), 1)}{pontos ? ' pp' : '%'}
        </span>
    );
}

const periodoTxt = (p) => (p ? `${fmtData(p.de)}–${fmtData(p.ate)}` : '—');

export default function PorQueSituacao({ linha, onFechar }) {
    const sit = linha.situacao || {};
    const det = sit.detalhe || {};
    const { atual, anterior, motivos = [], regra, variacaoRelativaPct: v } = det;
    const TITULO = { ok: 'Por que está no alvo?', atencao: 'Por que está em atenção?', agir: 'Por que precisa agir?', sem_dado: 'Por que está sem dado?' };
    const titulo = TITULO[sit.status] || 'Por que está nesta situação?';
    // onFechar em ref: o listener é instalado uma vez só, mesmo que o pai recrie a função a cada render
    const fecharRef = useRef(onFechar);
    fecharRef.current = onFechar;

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') fecharRef.current(); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, []);

    let resumo;
    if (!anterior) {
        resumo = 'Sem comparação: não houve venda no período anterior.';
    } else if (!temValor(v) || sit.status === 'sem_dado') {
        resumo = 'Sem comparação com o período anterior. Veja o motivo abaixo.';
    } else {
        const abaixo = Number(v) > 0;
        resumo = (
            <>A margem de contribuição (MC %) ficou <b className="text-gray-900">{fmtNum(Math.abs(Number(v)), 1)}% {abaixo ? 'abaixo' : 'acima'}</b> da do período anterior.</>
        );
    }

    const linhasTab = [
        { t: 'Qtde vendida', f: fmtInt, k: 'quantidadeVendida' },
        { t: 'Preço médio', f: (x) => fmtNum(x), k: 'precoMedio', bom: 'sobe' },
        { t: 'Custo variável/un', f: (x) => fmtNum(x), k: 'custoVariavelUn', bom: 'desce' },
        { t: 'MC %', f: (x) => fmtPct(x), k: 'mcPct', bom: 'sobe', pontos: true },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={titulo}>
            <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
            <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-gray-100 sticky top-0 bg-white">
                    <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="font-bold text-gray-900 text-sm">{linha.nome}</span>
                            <Selo status={sit.status} />
                        </div>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2.5 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <p className="text-sm text-gray-700">{resumo}</p>

                    {anterior && atual && (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left"></th>
                                        <th className="px-3 py-2 text-right">Período anterior<span className="block font-medium">{periodoTxt(anterior)}</span></th>
                                        <th className="px-3 py-2 text-right">Este período<span className="block font-medium">{periodoTxt(atual)}</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {linhasTab.map((r) => (
                                        <tr key={r.k}>
                                            <td className="px-3 py-2 text-gray-700">{r.t}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.f(anterior[r.k])}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">
                                                {r.f(atual[r.k])}
                                                <Variacao atual={atual[r.k]} anterior={anterior[r.k]} bom={r.bom} pontos={r.pontos} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {motivos.length > 0 && (
                        <div>
                            <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">O que pesou</div>
                            <ul className="space-y-2">
                                {motivos.map((m, i) => {
                                    const { Ic, cor } = iconeMotivo(m, atual, anterior);
                                    return (
                                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                            <Ic className={`h-4 w-4 mt-0.5 shrink-0 ${cor}`} aria-hidden="true" />
                                            <span>{m.texto}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {regra && (
                        <p className="text-xs text-gray-600 border-t border-gray-100 pt-3">
                            Regra: atenção quando a MC % piora mais de {regra.atencaoPct}% em relação ao período anterior; agir acima de {regra.agirPct}%.
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
