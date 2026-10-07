import React from 'react';
import { useTooltip } from './useTooltip';
import { fmtPct, fmtRS, temValor } from './formatos';

// Perda % por semana contra a meta. Só é desenhado quando a API manda dados reais.
export default function BarrasPerda({ semanal, metaPct }) {
    const { alvo, Tip } = useTooltip();
    const v = Array.isArray(semanal) ? semanal : [];
    if (!v.length) return null;
    const meta = temValor(metaPct) ? Number(metaPct) : null;
    const max = Math.max(1, meta || 0, ...v.map((x) => Number(x.pct) || 0)) * 1.2;
    const W = 360, H = 130, pL = 34, pB = 24, pT = 14;
    const bw = (W - pL - 8) / v.length;
    const Y = (x) => pT + (1 - x / max) * (H - pT - pB);
    const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
    return (
        <div>
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label="Perda percentual por semana">
                {meta != null && (
                    <>
                        <line x1={pL} x2={W - 8} y1={Y(meta)} y2={Y(meta)} stroke="#b45309" strokeWidth="2" />
                        <text x={pL - 4} y={Y(meta) + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="#b45309">{fmtPct(meta)}</text>
                    </>
                )}
                {v.map((p, i) => {
                    const x = pL + i * bw + bw * 0.2, w = bw * 0.6, pct = Number(p.pct) || 0;
                    const acima = meta != null && pct > meta;
                    return (
                        <g key={p.inicio || i} {...alvo(<><b className="text-[#cba258]">Semana de {dm(p.inicio)}</b><br />Perda {fmtPct(pct)} do consumo{temValor(p.valor) && <> ({fmtRS(p.valor, 0)})</>}<br />{Number(p.ordens) > 0 && <>{p.ordens} {Number(p.ordens) > 1 ? 'ordens' : 'ordem'}<br /></>}{meta == null ? '' : acima ? 'acima da meta' : 'dentro da meta'}</>)}>
                            <rect x={x} y={Y(pct)} width={w} height={Math.max(1, Y(0) - Y(pct))} rx="4" fill={acima ? '#b45309' : '#00754A'} />
                            <text x={x + w / 2} y={Y(pct) - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#3d4744">{fmtPct(pct)}</text>
                            <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#5f6b66">{dm(p.inicio)}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs font-bold text-gray-700">
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-primary inline-block" />Perda % por semana</span>
                {meta != null && <span className="inline-flex items-center gap-1.5"><i className="w-3 h-[3px] bg-[#b45309] inline-block" />Meta {fmtPct(meta)}</span>}
            </div>
            {Tip}
        </div>
    );
}
