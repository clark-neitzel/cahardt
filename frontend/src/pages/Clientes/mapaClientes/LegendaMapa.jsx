import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { OPCOES_COLORIR } from './coresMapa';

// Legenda flutuante sobre o mapa: "SEG · 84 clientes". Clique liga/desliga o
// valor (aria-pressed); item desligado fica esmaecido. Recolhível no celular.
export default function LegendaMapa({ itens, colorirPor, onToggle, onMostrarTodos, className = '' }) {
    // No celular começa recolhida (o mapa é pequeno); no desktop, aberta.
    const [recolhida, setRecolhida] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
    const titulo = OPCOES_COLORIR.find(o => o.valor === colorirPor)?.label || 'Legenda';
    const ocultos = itens.filter(i => !i.ligado).length;

    return (
        <div className={`bg-white/95 backdrop-blur rounded-xl border border-gray-200 shadow-lg ${className}`}>
            <button
                type="button"
                onClick={() => setRecolhida(v => !v)}
                aria-expanded={!recolhida}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 min-h-[40px]"
            >
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-600 truncate">{titulo}</span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                    {itens.length} {itens.length === 1 ? 'valor' : 'valores'}
                    {recolhida ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
            </button>
            {!recolhida && (
                <div className="px-2 pb-2 max-h-[38vh] md:max-h-[50vh] overflow-y-auto">
                    <ul className="space-y-0.5">
                        {itens.map(it => (
                            <li key={it.chave}>
                                <button
                                    type="button"
                                    aria-pressed={it.ligado}
                                    onClick={() => onToggle(it.chave)}
                                    title={it.ligado ? 'Toque para esconder estes pinos' : 'Toque para mostrar de novo'}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 min-h-[36px] rounded-lg text-left text-sm hover:bg-gray-50 ${it.ligado ? 'text-gray-800' : 'text-gray-400'}`}
                                >
                                    <span className="h-3.5 w-3.5 rounded-full border border-white shadow-sm shrink-0" style={{ background: it.ligado ? it.cor : '#d1d5db' }} />
                                    <span className={`flex-1 truncate ${it.ligado ? '' : 'line-through'}`}>{it.rotulo}</span>
                                    <span className={`text-xs tabular-nums whitespace-nowrap ${it.ligado ? 'text-gray-500' : 'text-gray-400'}`}>· {it.qtd} {it.qtd === 1 ? 'cliente' : 'clientes'}</span>
                                </button>
                            </li>
                        ))}
                        {!itens.length && <li className="px-2 py-2 text-xs text-gray-500">Nenhum cliente no filtro.</li>}
                    </ul>
                    {ocultos > 0 && (
                        <button type="button" onClick={onMostrarTodos} className="mt-1 w-full px-3 py-2 min-h-[36px] rounded-full text-xs font-semibold text-primary hover:bg-mint/40">
                            Mostrar todos
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
