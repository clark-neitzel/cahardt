import React from 'react';
import { DIAS_SEMANA } from '../../../components/DayPicker';
import { COR_DIA } from './coresMapa';

// Paradas por dia: quantos clientes do filtro caem em cada dia (entrega e venda).
// Cliente com 2 dias conta nos 2 — igual aos chips e à legenda.
// 'N/D' não é linha: conta como "Sem dia" (mesma régua dos chips e da legenda).
function Tabela({ titulo, porDia, semDia }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</span>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dia</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Clientes</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                    {DIAS_SEMANA.filter(d => d !== 'N/D').map(d => (
                        <tr key={d} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900 flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COR_DIA[d] }} />{d}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-900">{porDia[d] || 0}</td>
                        </tr>
                    ))}
                    <tr className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full shrink-0 bg-gray-400" />Sem dia</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-600">{semDia || 0}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export default function PainelParadas({ contadores }) {
    return (
        <div className="space-y-3">
            <Tabela titulo="Entrega por dia" porDia={contadores.porDiaEntrega} semDia={contadores.semDiaEntrega} />
            <Tabela titulo="Venda por dia" porDia={contadores.porDiaVenda} semDia={contadores.semDiaVenda} />
            <p className="text-xs text-gray-500 px-1">Cliente com dois dias conta nos dois. Km rodados por dia chega na fase 2.</p>
        </div>
    );
}
