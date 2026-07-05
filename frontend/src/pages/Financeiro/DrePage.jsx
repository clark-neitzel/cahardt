import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import financeiroGerencialService from '../../services/financeiroGerencialService';
import { BarChart3, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ──
const fmt0 = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtPct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const labelMes = (ym) => `${MESES_CURTO[Number(ym.slice(5)) - 1]}/${ym.slice(2, 4)}`;
const hojeYM = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const somaMesesYM = (ym, n) => {
    const [a, m] = ym.split('-').map(Number);
    const total = a * 12 + (m - 1) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

const periodos = () => {
    const mes = hojeYM();
    const ano = mes.slice(0, 4);
    return [
        { key: 'ANO', label: ano, de: `${ano}-01`, ate: mes },
        { key: 'ULT12', label: 'Últimos 12 meses', de: somaMesesYM(mes, -11), ate: mes },
        { key: 'ANO_ANT', label: String(Number(ano) - 1), de: `${Number(ano) - 1}-01`, ate: `${Number(ano) - 1}-12` }
    ];
};

const KpiCard = ({ titulo, valor, cor = 'text-gray-900' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
    </div>
);

const DrePage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    const [periodo, setPeriodo] = useState(opcoesPeriodo[0]);
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [mesMobile, setMesMobile] = useState(null); // 'YYYY-MM' selecionado na visão mobile

    const carregar = useCallback(async (p) => {
        setLoading(true);
        try {
            const d = await financeiroGerencialService.dre(p.de, p.ate);
            setDados(d);
            setMesMobile((atual) => (d.meses.includes(atual) ? atual : d.meses[d.meses.length - 1]));
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar a DRE');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(periodo); }, [periodo, carregar]);

    const meses = dados?.meses || [];
    const iMobile = Math.max(0, meses.indexOf(mesMobile));
    const resultadoTotal = Number(dados?.resultado?.total || 0);

    // célula numérica da matriz
    const Cel = ({ v, className = '', prefixoSinal = false }) => (
        <td className={`px-4 py-2.5 text-right whitespace-nowrap ${className}`}>
            {v === 0 ? <span className="text-gray-400">—</span> : `${prefixoSinal && v > 0 ? '+' : ''}${fmt0(v)}`}
        </td>
    );

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">DRE — Resultado</h1>
                </div>
                <button
                    onClick={() => carregar(periodo)}
                    disabled={loading}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Chips de período */}
                <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    {opcoesPeriodo.map(p => (
                        <button
                            key={p.key}
                            onClick={() => setPeriodo(p)}
                            className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs transition-colors ${
                                periodo.key === p.key
                                    ? 'bg-primary text-white font-semibold'
                                    : 'bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* KPIs do período */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard titulo="Receita líquida" valor={`R$ ${fmt0(dados?.receita?.liquida?.total)}`} />
                    <KpiCard titulo="Despesas" valor={`R$ ${fmt0(dados?.despesas?.total?.total)}`} cor="text-red-700" />
                    <KpiCard
                        titulo="Resultado"
                        valor={`${resultadoTotal < 0 ? '−' : ''}R$ ${fmt0(Math.abs(resultadoTotal))}`}
                        cor={resultadoTotal < 0 ? 'text-red-700' : 'text-green-700'}
                    />
                    <KpiCard
                        titulo="Margem"
                        valor={fmtPct(dados?.margem?.total)}
                        cor={resultadoTotal < 0 ? 'text-red-700' : 'text-green-700'}
                    />
                </div>

                {loading && (
                    <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {/* Matriz desktop */}
                {dados && meses.length > 0 && (
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Resultado mês a mês</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 z-10">&nbsp;</th>
                                        {meses.map(m => (
                                            <th key={m} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{labelMes(m)}</th>
                                        ))}
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase bg-gray-100">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    <tr>
                                        <td className="px-5 py-2.5 text-gray-700 sticky left-0 bg-white whitespace-nowrap">Vendas faturadas</td>
                                        {dados.receita.faturada.valores.map((v, i) => <Cel key={i} v={v} />)}
                                        <Cel v={dados.receita.faturada.total} className="font-medium bg-gray-50" />
                                    </tr>
                                    <tr>
                                        <td className="px-5 py-2.5 text-gray-700 sticky left-0 bg-white whitespace-nowrap">Vendas especiais (sem NF)</td>
                                        {dados.receita.especial.valores.map((v, i) => <Cel key={i} v={v} />)}
                                        <Cel v={dados.receita.especial.total} className="font-medium bg-gray-50" />
                                    </tr>
                                    <tr>
                                        <td className="px-5 py-2.5 text-gray-500 sticky left-0 bg-white whitespace-nowrap">(−) Devoluções</td>
                                        {dados.receita.devolucoes.valores.map((v, i) => <Cel key={i} v={-v} className="text-red-600" />)}
                                        <Cel v={-dados.receita.devolucoes.total} className="text-red-600 font-medium bg-gray-50" />
                                    </tr>
                                    <tr className="bg-blue-50/50 font-semibold">
                                        <td className="px-5 py-2.5 text-gray-900 sticky left-0 bg-blue-50/50 whitespace-nowrap">= Receita líquida</td>
                                        {dados.receita.liquida.valores.map((v, i) => <Cel key={i} v={v} />)}
                                        <Cel v={dados.receita.liquida.total} className="bg-blue-50" />
                                    </tr>
                                    {dados.despesas.categorias.map(cat => (
                                        <tr key={cat.nome}>
                                            <td className="px-5 py-2.5 pl-8 text-gray-600 sticky left-0 bg-white whitespace-nowrap max-w-[260px] truncate" title={cat.nome}>{cat.nome}</td>
                                            {cat.valores.map((v, i) => <Cel key={i} v={v} className="text-gray-600" />)}
                                            <Cel v={cat.total} className="bg-gray-50" />
                                        </tr>
                                    ))}
                                    <tr className="bg-red-50/40 font-semibold">
                                        <td className="px-5 py-2.5 text-gray-900 sticky left-0 bg-red-50/40 whitespace-nowrap">= Total de despesas</td>
                                        {dados.despesas.total.valores.map((v, i) => <Cel key={i} v={v} className="text-red-700" />)}
                                        <Cel v={dados.despesas.total.total} className="text-red-700 bg-red-50" />
                                    </tr>
                                    <tr className="bg-green-50/60 font-bold">
                                        <td className="px-5 py-3 text-gray-900 sticky left-0 bg-green-50/60 whitespace-nowrap">= Resultado</td>
                                        {dados.resultado.valores.map((v, i) => (
                                            <td key={i} className={`px-4 py-3 text-right whitespace-nowrap ${v < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                                {v < 0 ? '−' : '+'}{fmt0(Math.abs(v))}
                                            </td>
                                        ))}
                                        <td className={`px-4 py-3 text-right whitespace-nowrap ${resultadoTotal < 0 ? 'text-red-700 bg-red-50' : 'text-green-700 bg-green-50'}`}>
                                            {resultadoTotal < 0 ? '−' : '+'}{fmt0(Math.abs(resultadoTotal))}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="px-5 py-2.5 text-gray-500 sticky left-0 bg-white whitespace-nowrap">Margem</td>
                                        {dados.margem.valores.map((v, i) => (
                                            <td key={i} className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap">{fmtPct(v)}</td>
                                        ))}
                                        <td className="px-4 py-2.5 text-right font-medium bg-gray-50 whitespace-nowrap">{fmtPct(dados.margem.total)}</td>
                                    </tr>
                                    {Number(dados.foraDre?.total || 0) !== 0 && (
                                        <tr className="text-gray-500 italic border-t border-gray-100">
                                            <td className="px-5 py-2 sticky left-0 bg-white whitespace-nowrap" title="Retirada de lucros, empréstimos e compra de bens — não é resultado, só sai do caixa.">Fora da DRE (não é resultado)</td>
                                            {dados.foraDre.valores.map((v, i) => <td key={i} className="px-4 py-2 text-right whitespace-nowrap">{v ? fmt0(v) : '—'}</td>)}
                                            <td className="px-4 py-2 text-right bg-gray-50 whitespace-nowrap">{fmt0(dados.foraDre.total)}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Mobile: um mês por vez */}
                {dados && meses.length > 0 && (
                    <div className="md:hidden space-y-3">
                        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                            {meses.map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMesMobile(m)}
                                    className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs ${
                                        m === meses[iMobile]
                                            ? 'bg-primary text-white font-semibold'
                                            : 'bg-white border border-gray-300 text-gray-700 font-medium'
                                    }`}
                                >
                                    {labelMes(m)}
                                </button>
                            ))}
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                            <div className="flex justify-between px-4 py-2.5 text-sm">
                                <span className="text-gray-700">Vendas faturadas</span>
                                <span>{fmt0(dados.receita.faturada.valores[iMobile])}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2.5 text-sm">
                                <span className="text-gray-700">Vendas especiais (sem NF)</span>
                                <span>{fmt0(dados.receita.especial.valores[iMobile])}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2.5 text-sm">
                                <span className="text-gray-500">(−) Devoluções</span>
                                <span className="text-red-600">−{fmt0(dados.receita.devolucoes.valores[iMobile])}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2.5 text-sm font-semibold bg-blue-50/50">
                                <span>= Receita líquida</span>
                                <span>{fmt0(dados.receita.liquida.valores[iMobile])}</span>
                            </div>
                            {dados.despesas.categorias.filter(c => c.valores[iMobile] > 0).map(cat => (
                                <div key={cat.nome} className="flex justify-between px-4 py-2.5 text-sm gap-3">
                                    <span className="text-gray-600 pl-3 truncate">{cat.nome}</span>
                                    <span className="text-gray-600 shrink-0">{fmt0(cat.valores[iMobile])}</span>
                                </div>
                            ))}
                            <div className="flex justify-between px-4 py-2.5 text-sm font-semibold bg-red-50/40">
                                <span>= Total de despesas</span>
                                <span className="text-red-700">{fmt0(dados.despesas.total.valores[iMobile])}</span>
                            </div>
                            <div className="flex justify-between px-4 py-3 text-sm font-bold bg-green-50/60">
                                <span>= Resultado</span>
                                <span className={dados.resultado.valores[iMobile] < 0 ? 'text-red-700' : 'text-green-700'}>
                                    {dados.resultado.valores[iMobile] < 0 ? '−' : '+'}{fmt0(Math.abs(dados.resultado.valores[iMobile]))}
                                    {dados.margem.valores[iMobile] != null ? ` (${fmtPct(dados.margem.valores[iMobile])})` : ''}
                                </span>
                            </div>
                            {Number(dados.foraDre?.valores?.[iMobile] || 0) !== 0 && (
                                <div className="flex justify-between px-4 py-2.5 text-xs text-gray-500 italic">
                                    <span>Fora da DRE (não é resultado)</span>
                                    <span>{fmt0(dados.foraDre.valores[iMobile])}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {dados?.temAClassificar && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            Há categorias sem "balde" definido — estão contando como despesa de operação por enquanto.
                            Ajuste em <Link to="/financeiro/categorias-despesa" className="underline font-semibold">Categorias de Despesa</Link> para o resultado ficar certinho.
                        </span>
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">De onde vêm os números:</span>{' '}
                    receita = pedidos <span className="font-semibold">faturados</span> + <span className="font-semibold">especiais</span> (mesma regra do Dashboard), menos devoluções;
                    despesas = <span className="font-semibold">Contas a Pagar por competência</span>, separadas pelas categorias do Conta Azul (o rateio da nota divide sozinho).
                    Despesa que ainda não está no app não aparece — quanto mais contas entrarem pelo app, mais completa fica a DRE.
                </div>
            </div>
        </div>
    );
};

export default DrePage;
