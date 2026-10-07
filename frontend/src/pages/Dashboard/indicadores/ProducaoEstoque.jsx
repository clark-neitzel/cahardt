import React from 'react';
import { Selo, Chip } from './Bloco';
import BarrasPerda from './BarrasPerda';
import { textoMeta } from './KpiCard';
import { fmtPct, fmtInt, fmtRS, fmtRSk, temValor } from './formatos';

const rot = 'text-[11px] font-bold uppercase tracking-wider text-gray-600';
const SemOrdens = ({ motivo }) => <div className="mt-1 text-xs text-gray-600 leading-snug">{motivo || 'sem ordens finalizadas no período'}</div>;
const sinalPct = (v) => (temValor(v) ? `${Number(v) > 0 ? '+' : ''}${fmtPct(v)}` : '—');

// Selo do servidor (nunca calculado aqui) + "meta X" quando o semáforo veio da meta cadastrada.
function SeloMeta({ s }) {
    if (!s || s.status === 'sem_dado') return null;
    const m = s.base === 'meta' ? textoMeta(s.meta) : null;
    return (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Selo status={s.status} palavra={s.palavra} />
            {m && <span className="text-xs text-gray-600">meta {m}</span>}
        </div>
    );
}

// Perdas / custo real × padrão / rendimento. Sem ordem apurada: texto simples, NUNCA número inventado.
// Semáforo e metas vêm prontos do servidor; aqui só desenha.
export default function ProducaoEstoque({ d }) {
    if (!d) return null;
    const p = d.perdas || {}, c = d.custoRealXPadrao || {}, r = d.rendimentoLote || {}, e = d.estoque || {};
    const nEst = Number(p.ordensEstimadas) || 0;
    const nPend = Number(d.ordensPendentesApuracao) || 0;
    return (
        <div>
            <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                    <div className={rot}>Perdas no período</div>
                    {p.disponivel ? (
                        <>
                            <div className="text-xl font-extrabold text-gray-900 tabular-nums break-words">{fmtRSk(p.valorMes)}</div>
                            <div className="text-xs text-gray-600 font-medium break-words">
                                {temValor(p.pctProduzido) ? `${fmtPct(p.pctProduzido)} do consumo` : null}
                                {temValor(p.pctCpv) ? `${temValor(p.pctProduzido) ? ' · ' : ''}${fmtPct(p.pctCpv)} do CPV` : null}
                            </div>
                            <SeloMeta s={p.semaforo} />
                            {temValor(p.perdaTotalValor) && Number(p.perdaTotalValor) > Number(p.valorMes) + 0.005 && <div className="text-[11px] text-gray-500 mt-0.5">com a perda normal da ficha: {fmtRSk(p.perdaTotalValor)}</div>}
                        </>
                    ) : <SemOrdens motivo={p.motivo} />}
                </div>
                <div className="min-w-0">
                    <div className={rot}>Custo real × padrão</div>
                    {c.disponivel ? (
                        <>
                            <div className="text-xl font-extrabold text-gray-900 tabular-nums break-words">{sinalPct(c.desvioPct)}</div>
                            {temValor(c.valorDesvio) && <div className="text-xs text-gray-600 font-medium">{Number(c.valorDesvio) > 0 ? '+' : ''}{fmtRS(c.valorDesvio, 0)} no período</div>}
                            <SeloMeta s={c.semaforo} />
                        </>
                    ) : <SemOrdens />}
                </div>
                <div className="min-w-0">
                    <div className={rot}>Rendimento do lote</div>
                    {r.disponivel ? (
                        <>
                            <div className="text-xl font-extrabold text-gray-900 tabular-nums">{fmtPct(r.realPct)}</div>
                            {temValor(r.fichaPct) && <div className="text-xs text-gray-600">ficha prevê {fmtPct(r.fichaPct, 0)}</div>}
                            <SeloMeta s={r.semaforo} />
                        </>
                    ) : <SemOrdens />}
                </div>
                <div className="min-w-0">
                    <div className={rot}>Dias de estoque (produto acabado)</div>
                    <div className="text-xl font-extrabold text-gray-900">{temValor(e.diasEstoqueProdutoAcabado) ? <>{fmtInt(e.diasEstoqueProdutoAcabado)}<small className="text-xs font-bold text-gray-600 ml-1">dias</small></> : '—'}</div>
                    {temValor(e.diasEstoqueInsumos) && <div className="text-xs text-gray-600">insumos: {fmtInt(e.diasEstoqueInsumos)} dias</div>}
                    <SeloMeta s={e.semaforoDiasPA || e.semaforo} />
                </div>
            </div>
            {(nEst > 0 || nPend > 0 || Number(p.ordensSemPreco) > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {nEst > 0 && <Chip cls="bg-gray-100 text-gray-700">inclui {nEst} {nEst > 1 ? 'ordens estimadas' : 'ordem estimada'}</Chip>}
                    {nPend > 0 && <Chip cls="bg-gray-100 text-gray-700">{nPend} {nPend > 1 ? 'ordens ainda sem custo apurado' : 'ordem ainda sem custo apurado'}</Chip>}
                    {Number(p.ordensSemPreco) > 0 && <Chip cls="bg-amber-100 text-amber-700">{p.ordensSemPreco} com insumo sem preço</Chip>}
                </div>
            )}
            {p.disponivel && Array.isArray(p.semanal) && p.semanal.length > 0 && (
                <div className="mt-4">
                    <div className={`${rot} mb-1`}>Perda por semana (além da ficha)</div>
                    <BarrasPerda semanal={p.semanal} metaPct={p.metaPct} />
                </div>
            )}
        </div>
    );
}
