import React from 'react';
import { Chip } from './Bloco';
import { fmtNum, fmtData, fmtInt, fmtPct, temValor } from './formatos';
import EstadoVazio from '../../../components/EstadoVazio';
import { Inbox } from 'lucide-react';

const Var = ({ v }) => {
    if (!temValor(v)) return <span className="text-gray-600">—</span>;
    const n = Number(v);
    // custo SUBIR é ruim (vermelho), cair é bom (verde); a seta e o sinal acompanham a cor
    if (n === 0) return <span className="text-gray-600">= 0,0%</span>;
    return <span className={`font-bold ${n > 0 ? 'text-red-700' : 'text-green-700'}`}>{n > 0 ? '▲' : '▼'} {fmtPct(Math.abs(n))}</span>;
};
const sub = (e) => [e.fornecedor, fmtData(e.dataCompra), temValor(e.quantidade) ? `${fmtInt(e.quantidade)}${e.unidade ? ` ${e.unidade}` : ''}` : ''].filter(Boolean).join(' · ');
const pago = (e) => (temValor(e.custoPago) ? `${fmtNum(e.custoPago)}${e.unidade ? `/${e.unidade}` : ''}` : '—');

export default function EntradasSemana({ d }) {
    const entradas = Array.isArray(d?.entradas) ? d.entradas : [];
    const efeitos = Array.isArray(d?.efeitoFichas) ? d.efeitoFichas : [];
    if (!entradas.length) return <EstadoVazio icon={Inbox} titulo="Nenhuma entrada de mercadoria nesta semana" descricao="Quando uma nota de compra for conferida, ela aparece aqui com o preço pago e o efeito nas fichas." />;
    return (
        <div>
            <div className="md:hidden space-y-2.5 p-3">
                {entradas.map((e) => (
                    <div key={e.compraItemId} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-sm text-gray-900 min-w-0">{e.nome}{e.eFabricacao === false && <Chip cls="bg-gray-100 text-gray-700" className="ml-1.5">fora de ficha</Chip>}</div>
                            <Var v={e.variacaoPct} />
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">{sub(e)}</div>
                        <div className="text-xs text-gray-700 mt-1.5">Pago <b>{pago(e)}</b> · anterior {fmtNum(e.custoAnterior)}</div>
                    </div>
                ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <th className="px-4 py-3 text-left">Insumo</th><th className="px-3 py-3 text-right">Pago</th><th className="px-3 py-3 text-right">Anterior</th><th className="px-3 py-3 text-right">Variação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {entradas.map((e) => (
                            <tr key={e.compraItemId} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 font-bold text-gray-900">{e.nome}{e.eFabricacao === false && <Chip cls="bg-gray-100 text-gray-700" className="ml-1.5">fora de ficha</Chip>}<span className="block text-xs font-medium text-gray-600">{sub(e)}</span></td>
                                <td className="px-3 py-2.5 text-right tabular-nums"><b>{pago(e)}</b></td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(e.custoAnterior)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums"><Var v={e.variacaoPct} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {efeitos.length > 0 && (
                <div className="px-4 md:px-5 py-3 text-xs text-gray-700 border-t border-gray-100">
                    Efeito nas fichas técnicas:{' '}
                    {efeitos.map((f, i) => (
                        <span key={f.produtoId}>
                            {i > 0 && ', '}
                            <b className={Number(f.deltaCustoUn) > 0 ? 'text-red-700' : 'text-green-700'}>{Number(f.deltaCustoUn) > 0 ? '+' : '−'}R$ {fmtNum(Math.abs(f.deltaCustoUn))}/un {f.nome ? `na ${f.nome}` : ''}</b>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
