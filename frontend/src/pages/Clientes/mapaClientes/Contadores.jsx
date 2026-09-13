import React from 'react';
import { DIAS_SEMANA } from '../../../components/DayPicker';
import { COR_DIA } from './coresMapa';

// Cartões de contagem do filtro atual + faixa por dia de entrega (chips).
// O cartão "Sem GPS" é clicável: leva à aba que lista esses clientes.
export default function Contadores({ contadores, onVerSemGps, onVerParadas }) {
    const c = contadores;
    const cards = [
        { rotulo: 'Clientes no filtro', valor: c.total },
        { rotulo: 'Com ponto GPS', valor: c.comGps, cor: 'text-primaryDark' },
        { rotulo: 'Sem ponto GPS', valor: c.semGps, cor: c.semGps ? 'text-amber-700' : 'text-gray-900', onClick: onVerSemGps },
        { rotulo: 'Com WhatsApp', valor: c.comWhatsapp, sub: `${c.semWhatsapp} sem` },
    ];
    return (
        <div className="bg-white border-x border-gray-200 px-2 md:px-3 py-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {cards.map(k => {
                    const Tag = k.onClick ? 'button' : 'div';
                    return (
                        <Tag
                            key={k.rotulo}
                            type={k.onClick ? 'button' : undefined}
                            onClick={k.onClick}
                            className={`rounded-lg border border-gray-200 px-3 py-1.5 text-left ${k.onClick ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                        >
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 truncate">{k.rotulo}</p>
                            <p className={`text-lg font-bold leading-tight tabular-nums ${k.cor || 'text-gray-900'}`}>
                                {k.valor}{k.sub ? <span className="ml-1.5 text-xs font-medium text-gray-500">{k.sub}</span> : null}
                            </p>
                        </Tag>
                    );
                })}
            </div>
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-500 mr-1">Entrega</span>
                {DIAS_SEMANA.filter(d => d !== 'N/D').map(d => (
                    <button
                        key={d}
                        type="button"
                        onClick={onVerParadas}
                        title={`${c.porDiaEntrega[d] || 0} cliente(s) com entrega ${d}`}
                        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-200 pl-1.5 pr-2 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_DIA[d] }} />
                        {d} <span className="tabular-nums text-gray-500">{c.porDiaEntrega[d] || 0}</span>
                    </button>
                ))}
                {c.semDiaEntrega > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-semibold">{c.semDiaEntrega} sem dia</span>
                )}
            </div>
        </div>
    );
}
