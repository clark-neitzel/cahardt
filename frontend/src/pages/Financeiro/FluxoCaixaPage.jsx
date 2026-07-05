import React, { useEffect, useMemo, useState, useCallback } from 'react';
import financeiroGerencialService from '../../services/financeiroGerencialService';
import { TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ──
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtCompacto = (v) => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};
const hojeYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somaDiasYMD = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// chave 'YYYY-MM-DD' → "seg, 01/07" | 'YYYY-MM' → "jul/26"
const labelChave = (chave) => {
    if (chave.length === 7) {
        const [a, m] = chave.split('-');
        return `${MESES_CURTO[Number(m) - 1]}/${a.slice(2)}`;
    }
    const d = new Date(`${chave}T12:00:00-03:00`);
    return `${DIAS_SEMANA[d.getDay()]}, ${chave.slice(8)}/${chave.slice(5, 7)}`;
};

// Último dia do mês 'YYYY-MM'
const fimDoMes = (ym) => {
    const [a, m] = ym.split('-').map(Number);
    const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    return somaDiasYMD(`${prox}-01`, -1);
};

// Períodos pré-definidos
const periodos = () => {
    const hoje = hojeYMD();
    const mes = hoje.slice(0, 7);
    const ano = hoje.slice(0, 4);
    return [
        { key: 'MES', label: 'Este mês (por dia)', de: `${mes}-01`, ate: fimDoMes(mes), granularidade: 'dia' },
        { key: 'ULT30', label: 'Últimos 30 dias', de: somaDiasYMD(hoje, -29), ate: hoje, granularidade: 'dia' },
        { key: 'PROX30', label: 'Próximos 30 dias', de: hoje, ate: somaDiasYMD(hoje, 29), granularidade: 'dia' },
        { key: 'ANO', label: 'Este ano (por mês)', de: `${ano}-01-01`, ate: `${ano}-12-31`, granularidade: 'mes' },
        { key: 'ULT12M', label: 'Últimos 12 meses', de: somaDiasYMD(hoje, -365).slice(0, 7) + '-01', ate: hoje, granularidade: 'mes' }
    ];
};

const KpiCard = ({ titulo, valor, cor = 'text-gray-900', sub, subCor = 'text-gray-400' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
        {sub && <div className={`text-xs mt-0.5 ${subCor}`}>{sub}</div>}
    </div>
);

// Barra dupla (previsto atrás em cinza, realizado na frente colorido)
const BarraDupla = ({ prev, real, max, corReal }) => {
    const hPrev = max > 0 ? Math.min(100, (prev / max) * 100) : 0;
    const hReal = max > 0 ? Math.min(100, (real / max) * 100) : 0;
    return (
        <div className="flex-1 relative h-full flex items-end min-w-0">
            {hPrev > 0 && <div className="absolute bottom-0 left-0 right-0 bg-gray-200 rounded-t-sm" style={{ height: `${Math.max(2, hPrev)}%` }} />}
            {hReal > 0 && <div className={`absolute bottom-0 left-0 right-0 ${corReal} rounded-t-sm`} style={{ height: `${Math.max(2, hReal)}%` }} />}
        </div>
    );
};

const FluxoCaixaPage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    const [periodo, setPeriodo] = useState(opcoesPeriodo[0]);
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);

    const carregar = useCallback(async (p) => {
        setLoading(true);
        try {
            const d = await financeiroGerencialService.fluxoCaixa(p.de, p.ate, p.granularidade);
            setDados(d);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar o fluxo de caixa');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(periodo); }, [periodo, carregar]);

    const linhas = dados?.linhas || [];
    const hoje = hojeYMD();
    const maxBarra = useMemo(
        () => Math.max(1, ...linhas.flatMap(l => [l.entradasPrevistas, l.entradasRealizadas, l.saidasPrevistas, l.saidasRealizadas])),
        [linhas]
    );
    // dia futuro (só previsto) → mostra acumulado previsto em cinza
    const ehFuturo = (chave) => (chave.length === 7 ? chave > hoje.slice(0, 7) : chave > hoje);
    const ehHoje = (chave) => (chave.length === 7 ? chave === hoje.slice(0, 7) : chave === hoje);

    const kpis = dados?.kpis;

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Fluxo de Caixa</h1>
                </div>
                <button
                    onClick={() => carregar(periodo)}
                    disabled={loading}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
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

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard
                        titulo="A receber em aberto"
                        valor={`R$ ${fmt(kpis?.aReceberAberto)}`}
                        cor="text-green-700"
                        sub={Number(kpis?.aReceberVencido) > 0 ? `R$ ${fmt(kpis.aReceberVencido)} vencido` : 'nada vencido'}
                        subCor={Number(kpis?.aReceberVencido) > 0 ? 'text-red-600' : 'text-gray-400'}
                    />
                    <KpiCard
                        titulo="A pagar em aberto"
                        valor={`R$ ${fmt(kpis?.aPagarAberto)}`}
                        cor="text-red-700"
                        sub={Number(kpis?.aPagarVencido) > 0 ? `R$ ${fmt(kpis.aPagarVencido)} vencido` : 'nada vencido'}
                        subCor={Number(kpis?.aPagarVencido) > 0 ? 'text-red-600' : 'text-gray-400'}
                    />
                    <KpiCard
                        titulo="Saldo previsto (período)"
                        valor={`${Number(kpis?.saldoPrevistoPeriodo) < 0 ? '−' : '+'} R$ ${fmt(Math.abs(kpis?.saldoPrevistoPeriodo || 0))}`}
                        cor={Number(kpis?.saldoPrevistoPeriodo) < 0 ? 'text-red-700' : 'text-gray-900'}
                        sub="entradas − saídas que vencem"
                    />
                    <KpiCard
                        titulo="Saldo realizado (período)"
                        valor={`${Number(kpis?.saldoRealizadoPeriodo) < 0 ? '−' : '+'} R$ ${fmt(Math.abs(kpis?.saldoRealizadoPeriodo || 0))}`}
                        cor={Number(kpis?.saldoRealizadoPeriodo) < 0 ? 'text-red-700' : 'text-green-700'}
                        sub="o que de fato entrou − saiu"
                    />
                </div>

                {loading && (
                    <div className="text-center text-gray-400 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {/* Gráfico */}
                {linhas.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between px-4 md:px-5 py-3.5 border-b border-gray-100 gap-2 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                                Entradas × Saídas {periodo.granularidade === 'mes' ? 'por mês' : 'por dia'}
                            </span>
                            <div className="flex items-center gap-3 text-[11px] text-gray-500">
                                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500"></span>Entrada</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400"></span>Saída</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-200 border border-gray-300"></span>Previsto</span>
                            </div>
                        </div>
                        <div className="p-3 md:p-4">
                            <div className="flex items-end gap-[3px] h-36 md:h-44">
                                {linhas.map(l => (
                                    <div key={l.chave} className="flex-1 flex items-end gap-[1px] h-full min-w-0" title={`${labelChave(l.chave)} · entradas ${fmtCompacto(l.entradasRealizadas)}/${fmtCompacto(l.entradasPrevistas)} · saídas ${fmtCompacto(l.saidasRealizadas)}/${fmtCompacto(l.saidasPrevistas)}`}>
                                        <BarraDupla prev={l.entradasPrevistas} real={l.entradasRealizadas} max={maxBarra} corReal="bg-green-500" />
                                        <BarraDupla prev={l.saidasPrevistas} real={l.saidasRealizadas} max={maxBarra} corReal="bg-red-400" />
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                <span>{labelChave(linhas[0].chave)}</span>
                                {linhas.length > 2 && <span>{labelChave(linhas[Math.floor(linhas.length / 2)].chave)}</span>}
                                <span>{labelChave(linhas[linhas.length - 1].chave)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabela desktop */}
                {linhas.length > 0 && (
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                                {periodo.granularidade === 'mes' ? 'Mês a mês' : 'Dia a dia'}
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{periodo.granularidade === 'mes' ? 'Mês' : 'Dia'}</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Entradas previstas</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Entradas realizadas</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Saídas previstas</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Saídas realizadas</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Acumulado</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {linhas.map(l => {
                                        const futuro = ehFuturo(l.chave);
                                        const saldo = futuro ? l.saldoPrevisto : l.saldoRealizado;
                                        const acumulado = futuro ? l.acumuladoPrevisto : l.acumuladoRealizado;
                                        const semMovimento = !l.entradasPrevistas && !l.saidasPrevistas && !l.entradasRealizadas && !l.saidasRealizadas;
                                        if (semMovimento && periodo.granularidade === 'dia') return null;
                                        return (
                                            <tr key={l.chave} className={`hover:bg-gray-50 ${ehHoje(l.chave) ? 'bg-blue-50/40' : ''}`}>
                                                <td className="px-5 py-3 text-gray-900 font-medium whitespace-nowrap">
                                                    {labelChave(l.chave)}
                                                    {ehHoje(l.chave) && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-800">hoje</span>}
                                                </td>
                                                <td className="px-5 py-3 text-right text-gray-500">{l.entradasPrevistas ? fmt(l.entradasPrevistas) : '—'}</td>
                                                <td className="px-5 py-3 text-right font-medium text-green-700">{l.entradasRealizadas ? fmt(l.entradasRealizadas) : <span className="text-gray-300 font-normal">—</span>}</td>
                                                <td className="px-5 py-3 text-right text-gray-500">{l.saidasPrevistas ? fmt(l.saidasPrevistas) : '—'}</td>
                                                <td className="px-5 py-3 text-right font-medium text-red-700">{l.saidasRealizadas ? fmt(l.saidasRealizadas) : <span className="text-gray-300 font-normal">—</span>}</td>
                                                <td className={`px-5 py-3 text-right font-semibold ${futuro ? 'text-gray-400' : saldo < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                                                    {saldo < 0 ? '−' : '+'}{fmt(Math.abs(saldo))}{futuro ? ' prev.' : ''}
                                                </td>
                                                <td className={`px-5 py-3 text-right ${futuro ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    {acumulado < 0 ? '−' : ''}{fmt(Math.abs(acumulado))}{futuro ? ' prev.' : ''}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Cards mobile */}
                {linhas.length > 0 && (
                    <div className="md:hidden space-y-3">
                        {linhas.filter(l => l.entradasPrevistas || l.saidasPrevistas || l.entradasRealizadas || l.saidasRealizadas).map(l => {
                            const futuro = ehFuturo(l.chave);
                            const saldo = futuro ? l.saldoPrevisto : l.saldoRealizado;
                            const acumulado = futuro ? l.acumuladoPrevisto : l.acumuladoRealizado;
                            return (
                                <div key={l.chave} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-semibold text-gray-900">{labelChave(l.chave)}</span>
                                        {ehHoje(l.chave) && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">hoje</span>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <div className="text-xs text-gray-500">Entradas (real / prev)</div>
                                            <div className="font-medium text-green-700">{fmt(l.entradasRealizadas)} <span className="text-gray-400 font-normal">/ {fmt(l.entradasPrevistas)}</span></div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500">Saídas (real / prev)</div>
                                            <div className="font-medium text-red-700">{fmt(l.saidasRealizadas)} <span className="text-gray-400 font-normal">/ {fmt(l.saidasPrevistas)}</span></div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500">Saldo{futuro ? ' previsto' : ''}</div>
                                            <div className={`font-semibold ${saldo < 0 ? 'text-red-700' : 'text-gray-900'}`}>{saldo < 0 ? '−' : '+'}{fmt(Math.abs(saldo))}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500">Acumulado</div>
                                            <div className="font-semibold text-gray-900">{acumulado < 0 ? '−' : ''}{fmt(Math.abs(acumulado))}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">Como ler:</span>{' '}
                    <span className="font-semibold">previsto</span> = parcelas de contas a receber/pagar pelo <span className="font-semibold">vencimento</span>;{' '}
                    <span className="font-semibold">realizado</span> = pagamentos registrados pela <span className="font-semibold">data em que aconteceram</span> (incluindo as baixas vindas do Conta Azul). Dias futuros mostram só o previsto.
                </div>
            </div>
        </div>
    );
};

export default FluxoCaixaPage;
