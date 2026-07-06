import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import financeiroGerencialService from '../../services/financeiroGerencialService';
import { Wallet, Loader2, RefreshCw, ArrowRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v, casas = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtCompacto = (v) => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};
const MESES_LABEL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const KpiCard = ({ titulo, valor, cor = 'text-gray-900', sub, subCor = 'text-gray-500' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
        {sub && <div className={`text-xs mt-0.5 ${subCor}`}>{sub}</div>}
    </div>
);

const CardSecao = ({ titulo, linkTo, linkLabel, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1">{titulo}</span>
            {linkTo && (
                <Link to={linkTo} className="text-xs font-semibold text-primary hover:text-primaryDark inline-flex items-center gap-1">
                    {linkLabel || 'Ver tudo'} <ArrowRight className="h-3 w-3" />
                </Link>
            )}
        </div>
        <div className="p-5 flex-1">{children}</div>
    </div>
);

const DashboardFinanceiroPage = () => {
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(true);

    const carregar = useCallback(async () => {
        setLoading(true);
        try {
            setDados(await financeiroGerencialService.dashboard());
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar o dashboard financeiro');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const kpis = dados?.kpis;
    const dre = dados?.dreMes;
    const margem = dados?.margemMes;
    const aging = dados?.aging;
    const fluxo = dados?.fluxo30;
    const contas = dados?.contas30;
    const nomeMes = dre?.mes ? MESES_LABEL[Number(dre.mes.slice(5)) - 1] : '';

    const maxFluxo = Math.max(1, ...((fluxo?.linhas || []).flatMap(l => [l.entradasPrevistas, l.saidasPrevistas])));
    const maxAging = Math.max(1, ...((aging?.faixas || []).map(f => f.valor)));

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <Wallet className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Financeiro — Visão Geral</h1>
                </div>
                <button
                    onClick={carregar}
                    disabled={loading}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {loading && !dados && (
                    <div className="text-center text-gray-500 text-sm py-8 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {dados && (
                    <>
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <KpiCard
                                titulo="A receber em aberto"
                                valor={`R$ ${fmt(kpis?.aReceberAberto)}`}
                                cor="text-green-700"
                                sub={Number(kpis?.aReceberVencido) > 0 ? `R$ ${fmt(kpis.aReceberVencido)} vencido` : 'nada vencido'}
                                subCor={Number(kpis?.aReceberVencido) > 0 ? 'text-red-600' : 'text-gray-500'}
                            />
                            <KpiCard
                                titulo="A pagar em aberto"
                                valor={`R$ ${fmt(kpis?.aPagarAberto)}`}
                                cor="text-red-700"
                                sub={Number(kpis?.aPagarVencido) > 0 ? `R$ ${fmt(kpis.aPagarVencido)} vencido` : 'nada vencido'}
                                subCor={Number(kpis?.aPagarVencido) > 0 ? 'text-red-600' : 'text-gray-500'}
                            />
                            <KpiCard
                                titulo={`Resultado de ${nomeMes}`}
                                valor={dre?.resultado != null ? `R$ ${fmt(dre.resultado)}` : '—'}
                                cor={Number(dre?.resultado) < 0 ? 'text-red-700' : 'text-green-700'}
                                sub={dre?.margemPct != null ? `margem ${fmt(dre.margemPct, 1)}% (DRE)` : 'DRE do mês'}
                            />
                            <KpiCard
                                titulo="Margem dos produtos"
                                valor={margem?.pct != null ? `${fmt(margem.pct, 1)}%` : '—'}
                                cor={margem?.pct != null && margem.pct < 15 ? 'text-amber-700' : 'text-gray-900'}
                                sub={Number(margem?.semCusto) > 0 ? `${margem.semCusto} produto(s) sem custo` : `sobre R$ ${fmtCompacto(margem?.receita)} no mês`}
                                subCor={Number(margem?.semCusto) > 0 ? 'text-amber-700' : 'text-gray-500'}
                            />
                        </div>

                        {dre?.temAClassificar && (
                            <Link to="/financeiro/categorias-despesa" className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800 hover:bg-amber-100">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Há categorias de despesa sem classificação — o resultado do mês pode mudar. Clique para classificar.
                            </Link>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Próximos 30 dias */}
                            <CardSecao titulo="Próximos 30 dias (previsto)" linkTo="/financeiro/fluxo-caixa" linkLabel="Fluxo completo">
                                <div className="flex items-end gap-[2px] h-24 mb-3">
                                    {(fluxo?.linhas || []).map(l => (
                                        <div key={l.chave} className="flex-1 flex items-end gap-[1px] min-w-0" title={`${l.chave}: entra R$ ${fmt(l.entradasPrevistas)} · sai R$ ${fmt(l.saidasPrevistas)}`}>
                                            <div className="flex-1 bg-green-500/80 rounded-t-sm" style={{ height: `${Math.max(l.entradasPrevistas > 0 ? 4 : 0, (l.entradasPrevistas / maxFluxo) * 100)}%` }} />
                                            <div className="flex-1 bg-red-400/80 rounded-t-sm" style={{ height: `${Math.max(l.saidasPrevistas > 0 ? 4 : 0, (l.saidasPrevistas / maxFluxo) * 100)}%` }} />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">
                                        <span className="inline-block w-2.5 h-2.5 bg-green-500/80 rounded-sm mr-1" />entra
                                        <span className="inline-block w-2.5 h-2.5 bg-red-400/80 rounded-sm ml-3 mr-1" />sai
                                    </span>
                                    <span className={`font-bold ${Number(fluxo?.saldoPrevisto) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                        saldo previsto {Number(fluxo?.saldoPrevisto) < 0 ? '−' : '+'} R$ {fmt(Math.abs(fluxo?.saldoPrevisto || 0))}
                                    </span>
                                </div>
                            </CardSecao>

                            {/* Inadimplência por idade */}
                            <CardSecao titulo="Recebíveis por idade (inadimplência)" linkTo="/financeiro/contas-receber/tabela" linkLabel="Contas a Receber">
                                <div className="space-y-2">
                                    {(aging?.faixas || []).map(f => (
                                        <div key={f.key} className="flex items-center gap-2 text-sm">
                                            <span className="w-28 shrink-0 text-gray-600">{f.label}</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${f.key === 'aVencer' ? 'bg-green-500' : f.key === 'd1_7' ? 'bg-yellow-400' : f.key === 'd8_30' ? 'bg-amber-500' : 'bg-red-500'}`}
                                                    style={{ width: `${Math.max(f.valor > 0 ? 3 : 0, (f.valor / maxAging) * 100)}%` }}
                                                />
                                            </div>
                                            <span className="w-28 shrink-0 text-right font-medium text-gray-900">R$ {fmtCompacto(f.valor)}</span>
                                            <span className="w-10 shrink-0 text-right text-xs text-gray-500">{f.qtd}×</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Total vencido ({aging?.qtdVencidas || 0} parcela{(aging?.qtdVencidas || 0) === 1 ? '' : 's'})</span>
                                    <span className={`font-bold ${Number(aging?.totalVencido) > 0 ? 'text-red-700' : 'text-green-700'}`}>R$ {fmt(aging?.totalVencido)}</span>
                                </div>
                            </CardSecao>

                            {/* Movimento por conta */}
                            <CardSecao titulo="Movimento por conta (últimos 30 dias)" linkTo="/financeiro/por-conta" linkLabel="Saldos por Conta">
                                {(contas?.contas || []).length === 0 && <p className="text-sm text-gray-500">Nenhum movimento com conta informada no período.</p>}
                                <div className="space-y-2">
                                    {(contas?.contas || []).map(c => (
                                        <div key={c.id || 'sem'} className="flex items-center gap-2 text-sm">
                                            <span className="flex-1 min-w-0 truncate text-gray-800">{c.nome}</span>
                                            <span className="text-green-700 whitespace-nowrap">+ {fmtCompacto(c.entradas)}</span>
                                            <span className="text-red-700 whitespace-nowrap">− {fmtCompacto(c.saidas)}</span>
                                            <span className={`w-24 text-right font-semibold whitespace-nowrap ${c.resultado < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                                                {c.resultado < 0 ? '−' : '+'} R$ {fmtCompacto(Math.abs(c.resultado))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {Number(contas?.outras) > 0 && <p className="text-xs text-gray-500 mt-2">+ {contas.outras} outra(s) conta(s) na tela completa</p>}
                                {(contas?.contas || []).length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                                        <span className="text-gray-600">Resultado do período</span>
                                        <span className={`font-bold ${Number(contas?.totais?.resultado) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {Number(contas?.totais?.resultado) < 0 ? '−' : '+'} R$ {fmt(Math.abs(contas?.totais?.resultado || 0))}
                                        </span>
                                    </div>
                                )}
                            </CardSecao>

                            {/* Margens + conciliação */}
                            <CardSecao titulo="Atenção do mês" linkTo="/financeiro/margem-produtos" linkLabel="Margem por Produto">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Piores margens</p>
                                {(margem?.piores || []).length === 0 && <p className="text-sm text-gray-500">Sem vendas com custo conhecido neste mês.</p>}
                                <div className="space-y-1.5">
                                    {(margem?.piores || []).map(p => (
                                        <div key={p.nome} className="flex items-center justify-between gap-2 text-sm">
                                            <span className="truncate text-gray-800">{p.nome}</span>
                                            <span className={`font-bold whitespace-nowrap ${p.margemPct < 0 ? 'text-red-700' : p.margemPct < 15 ? 'text-amber-700' : 'text-green-700'}`}>
                                                {fmt(p.margemPct, 1)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Conciliação bancária pendente</span>
                                    <Link to="/financeiro/conciliacao" className={`font-bold ${Number(dados?.conciliacaoPendentes) > 0 ? 'text-amber-700 hover:text-amber-800' : 'text-green-700'}`}>
                                        {dados?.conciliacaoPendentes || 0} lançamento{(dados?.conciliacaoPendentes || 0) === 1 ? '' : 's'}
                                    </Link>
                                </div>
                            </CardSecao>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DashboardFinanceiroPage;
