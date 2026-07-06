import React, { useEffect, useMemo, useState, useCallback } from 'react';
import financeiroGerencialService from '../../services/financeiroGerencialService';
import { Landmark, Loader2, RefreshCw, ArrowDownLeft, ArrowUpRight, X, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ──
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hojeYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somaDiasYMD = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const fimDoMes = (ym) => {
    const [a, m] = ym.split('-').map(Number);
    const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    return somaDiasYMD(`${prox}-01`, -1);
};
const dataCurta = (iso) => {
    if (!iso) return '—';
    const s = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
};

const periodos = () => {
    const hoje = hojeYMD();
    const mes = hoje.slice(0, 7);
    const ano = hoje.slice(0, 4);
    return [
        { key: 'MES', label: 'Este mês', de: `${mes}-01`, ate: fimDoMes(mes) },
        { key: 'ULT30', label: 'Últimos 30 dias', de: somaDiasYMD(hoje, -29), ate: hoje },
        { key: 'ULT90', label: 'Últimos 90 dias', de: somaDiasYMD(hoje, -89), ate: hoje },
        { key: 'ANO', label: 'Este ano', de: `${ano}-01-01`, ate: `${ano}-12-31` }
    ];
};

const KpiCard = ({ titulo, valor, cor = 'text-gray-900', sub }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
        {sub && <div className="text-xs mt-0.5 text-gray-400">{sub}</div>}
    </div>
);

const ContasBancosPage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    const [periodo, setPeriodo] = useState(opcoesPeriodo[0]);
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [comSaldoCA, setComSaldoCA] = useState(false);

    // Extrato (drill-down) da conta selecionada
    const [contaSel, setContaSel] = useState(null); // { id, nome }
    const [extrato, setExtrato] = useState(null);
    const [loadingExtrato, setLoadingExtrato] = useState(false);

    const carregar = useCallback(async (p, saldoCA) => {
        setLoading(true);
        try {
            const d = await financeiroGerencialService.porConta(p.de, p.ate, saldoCA);
            setDados(d);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar o resumo por conta');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(periodo, comSaldoCA); }, [periodo, comSaldoCA, carregar]);

    const abrirExtrato = useCallback(async (conta) => {
        setContaSel(conta);
        setExtrato(null);
        setLoadingExtrato(true);
        try {
            const d = await financeiroGerencialService.extratoPorConta(conta.id, periodo.de, periodo.ate);
            setExtrato(d);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar o extrato');
            setContaSel(null);
        } finally {
            setLoadingExtrato(false);
        }
    }, [periodo]);

    const contas = dados?.contas || [];
    const totais = dados?.totais;

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <Landmark className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Saldos por Conta</h1>
                </div>
                <button
                    onClick={() => carregar(periodo, comSaldoCA)}
                    disabled={loading}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Chips de período + toggle saldo CA */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
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
                    <button
                        onClick={() => setComSaldoCA(v => !v)}
                        className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-medium border transition-colors ${
                            comSaldoCA ? 'bg-mint/50 border-primary text-primaryDark' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                        title="Consulta o saldo atual de cada conta direto no Conta Azul (pode demorar alguns segundos)"
                    >
                        {comSaldoCA ? '✓ ' : ''}Saldo atual no Conta Azul
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-3 gap-3">
                    <KpiCard titulo="Entradas" valor={`R$ ${fmt(totais?.entradas)}`} cor="text-green-700" sub="recebimentos no período" />
                    <KpiCard titulo="Saídas" valor={`R$ ${fmt(totais?.saidas)}`} cor="text-red-700" sub="pagamentos no período" />
                    <KpiCard
                        titulo="Resultado"
                        valor={`${Number(totais?.resultado) < 0 ? '−' : '+'} R$ ${fmt(Math.abs(totais?.resultado || 0))}`}
                        cor={Number(totais?.resultado) < 0 ? 'text-red-700' : 'text-green-700'}
                        sub="entradas − saídas"
                    />
                </div>

                {loading && (
                    <div className="text-center text-gray-400 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {!loading && contas.length === 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-500 text-sm">
                        Nenhuma movimentação por conta neste período.
                    </div>
                )}

                {/* Tabela desktop */}
                {contas.length > 0 && (
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Por banco / caixa</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Conta</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Entradas</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Saídas</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Resultado</th>
                                        {comSaldoCA && <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo atual (CA)</th>}
                                        <th className="px-5 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {contas.map(c => (
                                        <tr key={c.id || 'sem'} className="hover:bg-gray-50 cursor-pointer" onClick={() => abrirExtrato({ id: c.id, nome: c.nome })}>
                                            <td className="px-5 py-3 text-gray-900 font-medium">
                                                {c.nome}
                                                {!c.id && <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-600">sem banco</span>}
                                                <div className="text-xs text-gray-400 font-normal">{c.qtdEntradas + c.qtdSaidas} lançamento(s)</div>
                                            </td>
                                            <td className="px-5 py-3 text-right font-medium text-green-700">{c.entradas ? fmt(c.entradas) : <span className="text-gray-300 font-normal">—</span>}</td>
                                            <td className="px-5 py-3 text-right font-medium text-red-700">{c.saidas ? fmt(c.saidas) : <span className="text-gray-300 font-normal">—</span>}</td>
                                            <td className={`px-5 py-3 text-right font-semibold ${c.resultado < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                                                {c.resultado < 0 ? '−' : '+'}{fmt(Math.abs(c.resultado))}
                                            </td>
                                            {comSaldoCA && (
                                                <td className="px-5 py-3 text-right font-medium text-gray-700">
                                                    {c.saldoCA == null ? <span className="text-gray-300 font-normal">—</span> : `R$ ${fmt(c.saldoCA)}`}
                                                </td>
                                            )}
                                            <td className="px-5 py-3 text-right text-gray-300"><ChevronRight className="h-4 w-4 inline" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Cards mobile */}
                {contas.length > 0 && (
                    <div className="md:hidden space-y-3">
                        {contas.map(c => (
                            <button key={c.id || 'sem'} onClick={() => abrirExtrato({ id: c.id, nome: c.nome })} className="w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4 active:bg-gray-50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-gray-900">{c.nome}{!c.id && <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-600">sem banco</span>}</span>
                                    <ChevronRight className="h-4 w-4 text-gray-300" />
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div>
                                        <div className="text-xs text-gray-500">Entradas</div>
                                        <div className="font-medium text-green-700">{fmt(c.entradas)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500">Saídas</div>
                                        <div className="font-medium text-red-700">{fmt(c.saidas)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500">Resultado</div>
                                        <div className={`font-semibold ${c.resultado < 0 ? 'text-red-700' : 'text-gray-900'}`}>{c.resultado < 0 ? '−' : '+'}{fmt(Math.abs(c.resultado))}</div>
                                    </div>
                                </div>
                                {comSaldoCA && (
                                    <div className="mt-2 pt-2 border-t border-gray-100 text-sm flex items-center justify-between">
                                        <span className="text-xs text-gray-500">Saldo atual no CA</span>
                                        <span className="font-semibold text-gray-800">{c.saldoCA == null ? '—' : `R$ ${fmt(c.saldoCA)}`}</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">Como ler:</span>{' '}
                    <span className="font-semibold text-green-700">Entradas</span> = recebimentos e{' '}
                    <span className="font-semibold text-red-700">Saídas</span> = pagamentos, agrupados pela conta (banco/caixa) usada, no período.
                    Lançamentos antigos importados podem aparecer em <span className="font-semibold">“Não informado”</span> (o Conta Azul não guardava o banco). Clique numa conta para ver o extrato.
                </div>
            </div>

            {/* Modal de extrato */}
            {contaSel && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setContaSel(null)}>
                    <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 md:px-5 py-3.5 border-b border-gray-100">
                            <div className="min-w-0">
                                <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Extrato · {periodo.label}</div>
                                <div className="text-base font-bold text-gray-900 truncate">{contaSel.nome}</div>
                            </div>
                            <button onClick={() => setContaSel(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {extrato && (
                            <div className="grid grid-cols-3 gap-2 px-4 md:px-5 py-3 border-b border-gray-100 text-center">
                                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">Entradas</div><div className="font-bold text-green-700">{fmt(extrato.totalEntradas)}</div></div>
                                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">Saídas</div><div className="font-bold text-red-700">{fmt(extrato.totalSaidas)}</div></div>
                                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">Resultado</div><div className={`font-bold ${extrato.resultado < 0 ? 'text-red-700' : 'text-gray-900'}`}>{extrato.resultado < 0 ? '−' : '+'}{fmt(Math.abs(extrato.resultado))}</div></div>
                            </div>
                        )}

                        <div className="overflow-y-auto flex-1">
                            {loadingExtrato && (
                                <div className="text-center text-gray-400 text-sm py-10 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando extrato…
                                </div>
                            )}
                            {extrato && extrato.lancamentos.length === 0 && !loadingExtrato && (
                                <div className="text-center text-gray-500 text-sm py-10">Nenhum lançamento no período.</div>
                            )}
                            {extrato && extrato.lancamentos.length > 0 && (
                                <div className="divide-y divide-gray-100">
                                    {extrato.lancamentos.map((l, i) => (
                                        <div key={i} className="flex items-center gap-3 px-4 md:px-5 py-3">
                                            <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${l.tipo === 'ENTRADA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {l.tipo === 'ENTRADA' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-gray-900 truncate">{l.quem}</div>
                                                <div className="text-xs text-gray-500 truncate">{l.descricao}{l.formaPagamento ? ` · ${l.formaPagamento}` : ''}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className={`text-sm font-semibold ${l.tipo === 'ENTRADA' ? 'text-green-700' : 'text-red-700'}`}>
                                                    {l.tipo === 'ENTRADA' ? '+' : '−'} {fmt(l.valor)}
                                                </div>
                                                <div className="text-[11px] text-gray-400">{dataCurta(l.data)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContasBancosPage;
