import React from 'react';
import { useTooltip } from './useTooltip';
import { fmtRSk, fmtPct, fmtInt, temValor } from './formatos';
import { Selo } from './Bloco';

// Ponto de equilíbrio: barra com acumulado (cheia), projeção (hachurada) e a linha do equilíbrio.
export default function Equilibrio({ d }) {
    const { alvo, Tip } = useTooltip();
    if (!d) return null;
    const W = 360, H = 70, pad = 8;
    const eq = temValor(d.pontoEquilibrio) ? Number(d.pontoEquilibrio) : null;
    const acu = Number(d.acumulado) || 0;
    const proj = temValor(d.projecaoFechamento) ? Number(d.projecaoFechamento) : null;
    const max = Math.max(acu, proj || 0, eq || 0, 1) * 1.08;
    const sx = (W - 2 * pad) / max;
    const xe = eq != null ? pad + eq * sx : null;
    const seg = d.margemSegurancaPct;
    const segSt = !temValor(seg) ? 'sem_dado' : seg >= 15 ? 'ok' : seg >= 0 ? 'atencao' : 'agir';
    const mini = 'text-[11px] font-bold uppercase tracking-wider text-gray-600';
    return (
        <div>
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label="Acumulado, projeção e ponto de equilíbrio do mês">
                <defs>
                    <pattern id="hat-eq" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="6" height="6" fill="#d4e9e2" /><line x1="0" y1="0" x2="0" y2="6" stroke="#00754A" strokeWidth="2" />
                    </pattern>
                </defs>
                <rect x={pad} y="30" width={W - 2 * pad} height="20" rx="10" fill="#eceae4" />
                {proj != null && <rect x={pad} y="30" width={Math.max(4, proj * sx)} height="20" rx="10" fill="url(#hat-eq)" {...alvo(<><b className="text-[#cba258]">Projeção de fechamento</b><br />{fmtRSk(proj)}</>)} />}
                <rect x={pad} y="30" width={Math.max(4, acu * sx)} height="20" rx="10" fill="#00754A" {...alvo(<><b className="text-[#cba258]">Acumulado no mês</b><br />{fmtRSk(acu)}</>)} />
                {xe != null && (
                    <>
                        <line x1={xe} x2={xe} y1="22" y2="58" stroke="#b45309" strokeWidth="2.5" />
                        <text x={xe} y="14" textAnchor={xe > W - 90 ? 'end' : xe < 90 ? 'start' : 'middle'} fontSize="12" fontWeight="800" fill="#b45309">Equilíbrio {fmtRSk(eq)}</text>
                    </>
                )}
            </svg>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-bold text-gray-700">
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-primary inline-block" />Acumulado</span>
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm inline-block border border-primary" style={{ background: '#d4e9e2' }} />Projeção</span>
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-1 bg-[#b45309] inline-block" />Equilíbrio</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                    <div className={mini}>Ponto de equilíbrio</div>
                    <div className="text-xl font-extrabold text-gray-900">{fmtRSk(eq)}</div>
                    <div className="text-xs text-gray-600">fixos {fmtRSk(d.fixos)} ÷ MC {fmtPct(d.mcPct)}</div>
                </div>
                <div>
                    <div className={mini}>Margem de segurança</div>
                    <div className="text-xl font-extrabold text-gray-900 flex items-center gap-1.5 flex-wrap">{fmtPct(seg)} <Selo status={segSt} /></div>
                    <div className="text-xs text-gray-600">{d.mesReferenciaEquilibrio ? `base: ${d.mesReferenciaEquilibrio} · ` : ''}quanto a venda pode cair antes do prejuízo</div>
                </div>
                <div>
                    <div className={mini}>Acumulado</div>
                    <div className="text-xl font-extrabold text-gray-900">{fmtRSk(acu)}</div>
                    <div className="text-xs text-gray-600">{temValor(d.diasUteisDecorridos) ? `${fmtInt(d.diasUteisDecorridos)} de ${fmtInt(d.diasUteisTotais)} dias úteis` : ''}</div>
                </div>
                <div>
                    <div className={mini}>Projeção de fechamento</div>
                    <div className="text-xl font-extrabold text-gray-900">{fmtRSk(proj)}</div>
                    <div className="text-xs text-gray-600">{d.mesFechado ? 'mês fechado' : d.projecaoMetodo === 'dias_trabalho' ? 'pelos dias de trabalho' : 'ritmo atual × dias restantes'}</div>
                </div>
            </div>
            {Tip}
        </div>
    );
}
