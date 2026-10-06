import React from 'react';
import { Selo, Chip } from './Bloco';
import BarrasPerda from './BarrasPerda';
import { fmtPct, fmtInt, fmtRSk, temValor } from './formatos';

const rot = 'text-[11px] font-bold uppercase tracking-wider text-gray-600';
const Prox = () => <Chip cls="bg-amber-100 text-amber-700">disponível na próxima fase</Chip>;

// Perdas / custo real × padrão / rendimento: enquanto `disponivel:false`, mostra o selo —
// NUNCA número inventado.
export default function ProducaoEstoque({ d }) {
    if (!d) return null;
    const p = d.perdas || {}, c = d.custoRealXPadrao || {}, r = d.rendimentoLote || {}, e = d.estoque || {};
    const stPerda = !p.disponivel || !temValor(p.pctCpv) || !temValor(p.metaPct) ? 'sem_dado' : p.pctCpv <= p.metaPct ? 'ok' : p.pctCpv <= p.metaPct * 1.3 ? 'atencao' : 'agir';
    return (
        <div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className={rot}>Perdas do mês</div>
                    {p.disponivel ? (
                        <>
                            <div className="text-xl font-extrabold text-gray-900">{fmtRSk(p.valorMes)}<small className="text-xs font-bold text-gray-600 ml-1">{fmtPct(p.pctCpv)} do CPV</small></div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap"><Selo status={stPerda} />{temValor(p.metaPct) && <span className="text-xs text-gray-600">meta ≤ {fmtPct(p.metaPct)}</span>}</div>
                        </>
                    ) : <div className="mt-1"><Prox /></div>}
                </div>
                <div>
                    <div className={rot}>Custo real × padrão</div>
                    {c.disponivel ? <div className="text-xl font-extrabold text-gray-900">{temValor(c.desvioPct) ? `${c.desvioPct > 0 ? '+' : ''}${fmtPct(c.desvioPct)}` : '—'}</div> : <div className="mt-1"><Prox /></div>}
                </div>
                <div>
                    <div className={rot}>Rendimento do lote</div>
                    {r.disponivel ? (
                        <>
                            <div className="text-xl font-extrabold text-gray-900">{fmtPct(r.realPct)}</div>
                            {temValor(r.fichaPct) && <div className="text-xs text-gray-600">ficha prevê {fmtPct(r.fichaPct, 0)}</div>}
                        </>
                    ) : <div className="mt-1"><Prox /></div>}
                </div>
                <div>
                    <div className={rot}>Dias de estoque (produto acabado)</div>
                    <div className="text-xl font-extrabold text-gray-900">{temValor(e.diasEstoqueProdutoAcabado) ? <>{fmtInt(e.diasEstoqueProdutoAcabado)}<small className="text-xs font-bold text-gray-600 ml-1">dias</small></> : '—'}</div>
                    {temValor(e.diasEstoqueInsumos) && <div className="text-xs text-gray-600">insumos: {fmtInt(e.diasEstoqueInsumos)} dias</div>}
                </div>
            </div>
            {p.disponivel && Array.isArray(p.semanal) && p.semanal.length > 0 && <div className="mt-4"><BarrasPerda semanal={p.semanal} metaPct={p.metaPct} /></div>}
        </div>
    );
}
