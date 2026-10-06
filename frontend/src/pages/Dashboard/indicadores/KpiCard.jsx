import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Selo } from './Bloco';
import Sparkline from './Sparkline';
import { useTooltip } from './useTooltip';

// Cartão de KPI: rótulo + selo com PALAVRA + valor + variação + sparkline + "?" com o guia de leitura.
// `tom` define a cor da variação (bom = verde, ruim = vermelho, neutro = cinza) — sempre acompanhada de seta.
const BASE_SEMAFORO = { media3m: 'vs média de 3 meses', meta: 'vs meta', faixa: 'pela alta em 8 semanas' };

export default function KpiCard({ rotulo, ajuda, semaforo, valor, unidade, variacao, variacaoRef, tom = 'neutro', detalhe, spark }) {
    const { alvo, Tip } = useTooltip();
    const cor = tom === 'bom' ? 'text-green-700' : tom === 'ruim' ? 'text-red-700' : 'text-gray-600';
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5 min-w-0">
            <div className="flex items-start justify-between gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 leading-tight">{rotulo}</span>
                {ajuda && (
                    <button type="button" aria-label={`Como ler: ${rotulo}`} className="-mt-3 -mr-3 w-11 h-11 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 flex-none" {...alvo(ajuda)}>
                        <HelpCircle className="h-4 w-4" />
                    </button>
                )}
            </div>
            {semaforo && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Selo status={semaforo.status} palavra={semaforo.palavra} />
                    {BASE_SEMAFORO[semaforo.base] && <span className="text-[11px] text-gray-500">{BASE_SEMAFORO[semaforo.base]}</span>}
                </div>
            )}
            <div className="text-xl md:text-2xl font-extrabold text-gray-900 mt-1 leading-tight tabular-nums break-words">
                {valor}{unidade && <small className="text-sm font-bold text-gray-600 ml-1">{unidade}</small>}
            </div>
            {variacao && <div className={`text-xs font-bold mt-1 ${cor}`}>{variacao}{variacaoRef && <span className="font-medium text-gray-500"> {variacaoRef}</span>}</div>}
            {detalhe && <div className="text-xs text-gray-600 font-medium mt-0.5">{detalhe}</div>}
            {spark && <Sparkline valores={spark} className="mt-2" />}
            {Tip}
        </div>
    );
}
