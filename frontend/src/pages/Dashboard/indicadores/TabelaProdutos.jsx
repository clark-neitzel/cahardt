import React, { useMemo, useState } from 'react';
import { Chip, Selo } from './Bloco';
import { fmtNum, fmtPct, fmtInt, fmtRSk, temValor, SEMAFORO } from './formatos';

// rótulo de apoio sob o nome — some quando só repete a palavra do selo ("no alvo" duas vezes)
const rotuloExtra = (l) => {
    const r = l.situacao?.rotulo;
    if (!r) return null;
    const pal = SEMAFORO[l.situacao.status]?.palavra;
    return String(r).trim().toLowerCase() === String(pal || '').toLowerCase() ? null : r;
};
import EstadoVazio from '../../../components/EstadoVazio';
import { Package } from 'lucide-react';

const LIMITE = 12;

export const ORDENS_DONO = [
    { v: 'mcTotal', t: 'MC total' }, { v: 'mcPct', t: 'MC %' }, { v: 'quantidadeVendida', t: 'Qtde vendida' },
    { v: 'variacaoCusto4sPct', t: 'Δ custo 4 sem.' }, { v: 'markup', t: 'Markup (menor primeiro)' }, { v: 'nome', t: 'Nome' },
];
export const ORDENS_PROD = [
    { v: 'quantidadeVendida', t: 'Qtde vendida' }, { v: 'variacaoCusto4sPct', t: 'Δ custo 4 sem.' }, { v: 'custoFichaUn', t: 'Custo da ficha' }, { v: 'nome', t: 'Nome' },
];

function ordenar(linhas, ordem) {
    const l = [...linhas];
    if (ordem === 'nome') return l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const asc = ordem === 'markup';
    // valor ausente vai sempre para o fim
    return l.sort((a, b) => {
        const x = a[ordem], y = b[ordem];
        if (!temValor(x) && !temValor(y)) return 0;
        if (!temValor(x)) return 1;
        if (!temValor(y)) return -1;
        return asc ? x - y : y - x;
    });
}

const Delta = ({ v }) => {
    if (!temValor(v)) return <span className="text-gray-600">—</span>;
    const n = Number(v);
    return <span className={n > 3 ? 'font-bold text-red-700' : n < 0 ? 'font-bold text-green-700' : 'text-gray-700'}>{n > 0 ? '▲ ' : n < 0 ? '▼ ' : ''}{fmtNum(Math.abs(n), 1)}%</span>;
};

const Etiquetas = ({ l }) => (
    <>
        {l.classe === 'REVENDA' && <Chip cls="bg-purple-100 text-purple-700" className="ml-1.5">revenda</Chip>}
        {l.classe === 'SEM_CLASSE' && <Chip cls="bg-gray-100 text-gray-700" className="ml-1.5">sem ficha</Chip>}
        {l.custoFonte === 'FICHA_REF' && <Chip cls="bg-blue-100 text-blue-800" className="ml-1.5">ficha de referência</Chip>}
        {l.temCustoFaltando && <Chip cls="bg-red-100 text-red-700" className="ml-1.5">custo faltando</Chip>}
        {l.fichaDesatualizada && <Chip cls="bg-amber-100 text-amber-700" className="ml-1.5">ficha desatualizada</Chip>}
    </>
);

// completa=true => visão Dono (colunas financeiras); false => visão produção (só custo/ficha).
export default function TabelaProdutos({ linhas, completa, ordem }) {
    const [todos, setTodos] = useState(false);
    const ord = useMemo(() => ordenar(Array.isArray(linhas) ? linhas : [], ordem), [linhas, ordem]);
    const vis = todos ? ord : ord.slice(0, LIMITE);
    const maxMC = Math.max(1, ...ord.map((l) => Number(l.mcTotal) || 0));
    if (!ord.length) return <EstadoVazio icon={Package} titulo="Nenhum produto no período" descricao="Não há venda de produto com ficha neste período." />;

    return (
        <div>
            {/* Mobile: cards */}
            <div className="md:hidden space-y-3 p-3">
                {vis.map((l) => (
                    <div key={l.produtoId} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-gray-900 text-sm min-w-0">{l.nome}<Etiquetas l={l} /></div>
                            {completa && l.situacao && <Selo status={l.situacao.status} />}
                        </div>
                        {completa && rotuloExtra(l) && <div className="text-xs text-gray-600 mt-0.5">{rotuloExtra(l)}</div>}
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-xs">
                            <div><dt className="text-gray-600">Qtde vendida</dt><dd className="font-bold text-gray-900">{fmtInt(l.quantidadeVendida)}</dd></div>
                            <div><dt className="text-gray-600">Custo ficha/un</dt><dd className="font-bold text-gray-900">{fmtNum(l.custoFichaUn)}</dd></div>
                            <div><dt className="text-gray-600">Δ custo 4 sem.</dt><dd className="font-bold"><Delta v={l.variacaoCusto4sPct} /></dd></div>
                            {completa && <>
                                <div><dt className="text-gray-600">Preço médio</dt><dd className="font-bold text-gray-900">{fmtNum(l.precoMedio)}</dd></div>
                                <div><dt className="text-gray-600">Markup</dt><dd className="font-bold text-gray-900">{temValor(l.markup) ? `${fmtNum(l.markup)}×` : '—'}</dd></div>
                                <div><dt className="text-gray-600">MC %</dt><dd className="font-bold text-gray-900">{fmtPct(l.mcPct)}</dd></div>
                                <div className="col-span-2"><dt className="text-gray-600">MC total</dt><dd className="font-bold text-gray-900">{fmtRSk(l.mcTotal)}</dd></div>
                            </>}
                        </dl>
                    </div>
                ))}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <th className="px-4 py-3">Produto</th>
                            <th className="px-3 py-3 text-right">Qtde vendida</th>
                            {completa && <th className="px-3 py-3 text-right">Preço médio</th>}
                            <th className="px-3 py-3 text-right">Custo ficha/un</th>
                            <th className="px-3 py-3 text-right">Δ custo 4 sem.</th>
                            {completa && <>
                                <th className="px-3 py-3 text-right">Custo variável/un</th>
                                <th className="px-3 py-3 text-right">Markup</th>
                                <th className="px-3 py-3 text-right">MC/un</th>
                                <th className="px-3 py-3 text-right">MC %</th>
                                <th className="px-3 py-3 text-right">MC total</th>
                            </>}
                            {completa && <th className="px-3 py-3">Situação</th>}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {vis.map((l) => (
                            <tr key={l.produtoId} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-gray-900 font-bold">
                                    {l.nome}<Etiquetas l={l} />
                                    {completa && rotuloExtra(l) && <span className="block text-xs font-medium text-gray-600">{rotuloExtra(l)}</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(l.quantidadeVendida)}</td>
                                {completa && <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(l.precoMedio)}</td>}
                                <td className="px-3 py-2.5 text-right tabular-nums font-bold">{fmtNum(l.custoFichaUn)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums"><Delta v={l.variacaoCusto4sPct} /></td>
                                {completa && <>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(l.custoVariavelUn)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums font-bold">{temValor(l.markup) ? `${fmtNum(l.markup)}×` : '—'}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(l.mcUn)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(l.mcPct)}</td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-2 justify-end">
                                            <div className="w-16 h-1.5 rounded bg-gray-100 overflow-hidden"><i className="block h-full bg-primary rounded" style={{ width: `${Math.max(0, ((Number(l.mcTotal) || 0) / maxMC) * 100)}%` }} /></div>
                                            <b className="tabular-nums whitespace-nowrap">{fmtRSk(l.mcTotal)}</b>
                                        </div>
                                    </td>
                                </>}
                                {completa && <td className="px-3 py-2.5">{l.situacao ? <Selo status={l.situacao.status} /> : <span className="text-gray-600">—</span>}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {ord.length > LIMITE && (
                <div className="p-3 border-t border-gray-100 text-center">
                    <button type="button" onClick={() => setTodos((t) => !t)} className="px-5 py-2.5 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-semibold">
                        {todos ? 'Mostrar menos' : `Mostrar todos (${ord.length})`}
                    </button>
                </div>
            )}
        </div>
    );
}
