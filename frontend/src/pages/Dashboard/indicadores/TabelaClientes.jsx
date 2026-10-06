import React from 'react';
import { Chip } from './Bloco';
import { fmtPct, fmtInt, fmtRSk, fmtRS, temValor } from './formatos';
import EstadoVazio from '../../../components/EstadoVazio';
import { Users } from 'lucide-react';

const BAIXA = 25; // MC% abaixo disso é marcada (palavra + cor), igual à regra do alerta
const Mc = ({ v }) => (!temValor(v) ? <span className="text-gray-600">—</span>
    : Number(v) < BAIXA ? <span className="font-extrabold text-red-700">{fmtPct(v, 0)} <span className="text-[10px] uppercase">baixa</span></span>
        : <span>{fmtPct(v, 0)}</span>);

export default function TabelaClientes({ d }) {
    const linhas = Array.isArray(d?.linhas) ? d.linhas : [];
    if (!linhas.length) return <EstadoVazio icon={Users} titulo="Sem vendas a clientes no período" />;
    const maxMC = Math.max(1, ...linhas.map((l) => Number(l.mcTotal) || 0));
    const est = d.custoEntregaOrigem === 'ESTIMADO';
    return (
        <div>
            <div className="md:hidden space-y-2.5 p-3">
                {linhas.map((l) => (
                    <div key={l.clienteId} className="rounded-xl border border-gray-200 p-3">
                        <div className="font-bold text-sm text-gray-900">{l.nome}</div>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-xs">
                            <div><dt className="text-gray-600">Receita</dt><dd className="font-bold">{fmtRSk(l.receita)}</dd></div>
                            <div><dt className="text-gray-600">Desconto médio</dt><dd className="font-bold">{fmtPct(l.descontoMedioPct, 0)}</dd></div>
                            <div><dt className="text-gray-600">Entregas</dt><dd className="font-bold">{fmtInt(l.entregas)}</dd></div>
                            <div><dt className="text-gray-600">Custo entrega{est ? ' (estimado)' : ''}</dt><dd className="font-bold">{fmtRS(l.custoEntrega, 0)}</dd></div>
                            <div><dt className="text-gray-600">MC %</dt><dd className="font-bold"><Mc v={l.mcPct} /></dd></div>
                            <div><dt className="text-gray-600">MC total</dt><dd className="font-bold">{fmtRSk(l.mcTotal)}</dd></div>
                        </dl>
                    </div>
                ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <th className="px-4 py-3 text-left">Cliente</th><th className="px-3 py-3 text-right">Receita</th><th className="px-3 py-3 text-right">Desconto médio</th>
                            <th className="px-3 py-3 text-right">Entregas</th>
                            <th className="px-3 py-3 text-right">Custo entrega {est && <Chip cls="bg-gray-100 text-gray-700">estimado</Chip>}</th>
                            <th className="px-3 py-3 text-right">MC %</th><th className="px-3 py-3 text-right">MC total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {linhas.map((l) => (
                            <tr key={l.clienteId} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 font-bold text-gray-900">{l.nome}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtRSk(l.receita)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(l.descontoMedioPct, 0)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(l.entregas)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtRS(l.custoEntrega, 0)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums"><Mc v={l.mcPct} /></td>
                                <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-2 justify-end">
                                        <div className="w-16 h-1.5 rounded bg-gray-100 overflow-hidden"><i className={`block h-full rounded ${Number(l.mcPct) < BAIXA ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.max(0, ((Number(l.mcTotal) || 0) / maxMC) * 100)}%` }} /></div>
                                        <b className="tabular-nums whitespace-nowrap">{fmtRSk(l.mcTotal)}</b>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
