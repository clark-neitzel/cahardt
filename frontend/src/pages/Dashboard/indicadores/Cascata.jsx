import React from 'react';
import { useTooltip } from './useTooltip';
import { fmtNum, fmtPct, fmtRS } from './formatos';

// Cascata: da receita bruta até o resultado. Barras em HTML (não SVG) para o texto não
// encolher no celular: no mobile o rótulo fica em cima da barra; no desktop, ao lado.
// valor de dedução vem NEGATIVO; total/resultado vêm positivos (resultado pode ser negativo).
export default function Cascata({ linhas }) {
    const { alvo, Tip } = useTooltip();
    const L = Array.isArray(linhas) ? linhas : [];
    // posições acumuladas
    let corrente = 0;
    const pos = L.map((l) => {
        const v = Number(l.valor) || 0;
        let a, b;
        if (l.tipo === 'deducao') { b = corrente; corrente += v; a = corrente; }
        else { a = 0; b = v; corrente = v; }
        return { ...l, ini: Math.min(a, b), fim: Math.max(a, b) };
    });
    const min = Math.min(0, ...pos.map((p) => p.ini));
    const max = Math.max(1, ...pos.map((p) => p.fim));
    const faixa = max - min || 1;
    const cor = (t) => (t === 'total' ? 'bg-primary' : t === 'resultado' ? 'bg-[#cba258]' : 'bg-[#b8b2a6]');

    return (
        <div>
            <div className="space-y-1.5">
                {pos.map((p) => {
                    const ded = p.tipo === 'deducao';
                    const forte = !ded;
                    const rotulo = p.pctReceitaLiquida != null && forte && p.chave !== 'receitaBruta' && p.chave !== 'receitaLiquida'
                        ? `${p.rotulo} · ${fmtPct(p.pctReceitaLiquida)}` : p.rotulo;
                    return (
                        <div key={p.chave} className="md:grid md:grid-cols-[210px_1fr] md:items-center md:gap-3" {...alvo(
                            <><b className="text-[#cba258]">{p.rotulo}</b><br />{fmtRS(Math.abs(p.valor))}{p.pctReceitaLiquida != null && <><br />{fmtPct(p.pctReceitaLiquida)} da receita líquida</>}</>
                        )}>
                            <div className={`text-xs md:text-right leading-tight ${forte ? 'font-extrabold text-house' : 'font-semibold text-gray-600'}`}>{rotulo}</div>
                            <div className="relative h-6 mt-0.5 md:mt-0">
                                <div
                                    className={`absolute top-0.5 bottom-0.5 rounded ${cor(p.tipo)}`}
                                    style={{ left: `${((p.ini - min) / faixa) * 78}%`, width: `${Math.max(0.6, ((p.fim - p.ini) / faixa) * 78)}%` }}
                                />
                                <span
                                    className="absolute top-1/2 -translate-y-1/2 text-xs font-bold text-gray-800 tabular-nums whitespace-nowrap"
                                    style={{ left: `calc(${((p.fim - min) / faixa) * 78}% + 6px)` }}
                                >
                                    {Number(p.valor) < 0 ? '− ' : ''}{fmtNum(Math.abs(p.valor) / 1000, 1)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs font-bold text-gray-700">
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-primary inline-block" />Totais</span>
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-[#b8b2a6] inline-block" />Deduções</span>
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-[#cba258] inline-block" />Resultado</span>
            </div>
            {Tip}
        </div>
    );
}
