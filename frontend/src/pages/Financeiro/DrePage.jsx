import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import financeiroGerencialService from '../../services/financeiroGerencialService';
import { BarChart3, Loader2, RefreshCw, AlertTriangle, ChevronRight, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

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

// Etiqueta de natureza da categoria (V = variável, F = fixa)
const TagNatureza = ({ natureza }) => {
    if (natureza === 'VARIAVEL') return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 shrink-0" title="Variável: cresce junto com a venda">V</span>;
    if (natureza === 'FIXA') return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-mint text-primaryDark shrink-0" title="Fixa: paga vendendo ou não">F</span>;
    return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 shrink-0" title="Sem definição fixa/variável">?</span>;
};

const DrePage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    // Do período persiste só a CHAVE ('ANO' etc.) — os meses são recalculados a
    // partir de hoje a cada visita (senão o usuário ficaria preso num período velho).
    const [periodoKey, setPeriodoKey] = useFiltroSalvo('dre:periodoKey', 'ANO');
    const periodo = useMemo(
        () => opcoesPeriodo.find(p => p.key === periodoKey) || opcoesPeriodo[0],
        [opcoesPeriodo, periodoKey]
    );
    const setPeriodo = (p) => setPeriodoKey(p.key);
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [mesMobile, setMesMobile] = useState(null); // 'YYYY-MM' selecionado na visão mobile
    const [abertos, setAbertos] = useState(() => new Set()); // blocos expandidos (por id/nome)

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
    // Blocos vindos do backend; se a resposta for antiga (sem grupos), cai num bloco único
    const grupos = useMemo(() => {
        if (!dados) return [];
        if (Array.isArray(dados.despesas?.grupos)) return dados.despesas.grupos;
        return [{ id: null, nome: 'Despesas', categorias: dados.despesas?.categorias || [], valores: dados.despesas?.total?.valores || [], total: dados.despesas?.total?.total || 0 }];
    }, [dados]);
    const fv = dados?.fixoVariavel || null;
    const temPendencia = !!dados?.temAClassificar
        || grupos.some((g) => g.id === null && g.nome === 'Sem bloco')
        || Number(fv?.indefinidas?.total || 0) !== 0;

    const chaveGrupo = (g) => g.id || `__${g.nome}`;
    const alternar = (g) => setAbertos((prev) => {
        const novo = new Set(prev);
        const k = chaveGrupo(g);
        if (novo.has(k)) novo.delete(k); else novo.add(k);
        return novo;
    });

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
                <div className="flex items-center gap-2 shrink-0">
                    <Link
                        to="/financeiro/categorias-despesa"
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs md:text-sm font-medium inline-flex items-center gap-1.5"
                        title="Blocos da DRE e classificação fixa/variável"
                    >
                        <Settings2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Blocos e categorias</span><span className="sm:hidden">Blocos</span>
                    </Link>
                    <button
                        onClick={() => carregar(periodo)}
                        disabled={loading}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Atualizar</span>
                    </button>
                </div>
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
                    <KpiCard
                        titulo="Margem de contribuição"
                        valor={fv ? `R$ ${fmt0(fv.margemContribuicao.total)}` : '—'}
                        cor="text-primaryDark"
                    />
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
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Resultado mês a mês</span>
                            <span className="text-xs text-gray-500">Clique num bloco para abrir as categorias</span>
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
                                    {grupos.map((g) => {
                                        const aberto = abertos.has(chaveGrupo(g));
                                        return (
                                            <React.Fragment key={chaveGrupo(g)}>
                                                <tr
                                                    className={`font-semibold cursor-pointer hover:bg-gray-100 ${g.id === null && g.nome === 'Sem bloco' ? 'bg-amber-50/60' : 'bg-gray-50'}`}
                                                    onClick={() => alternar(g)}
                                                >
                                                    <td className={`px-5 py-2.5 text-gray-800 sticky left-0 whitespace-nowrap ${g.id === null && g.nome === 'Sem bloco' ? 'bg-amber-50/60' : 'bg-gray-50'}`}>
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <ChevronRight className={`h-3.5 w-3.5 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                                                            (−) {g.nome}
                                                            <span className="text-xs font-normal text-gray-500">({g.categorias.length})</span>
                                                        </span>
                                                    </td>
                                                    {g.valores.map((v, i) => <Cel key={i} v={v} className="text-gray-800" />)}
                                                    <Cel v={g.total} className="bg-gray-100" />
                                                </tr>
                                                {aberto && g.categorias.map((cat) => (
                                                    <tr key={cat.nome} className="bg-white">
                                                        <td className="px-5 py-2 pl-12 text-gray-600 sticky left-0 bg-white whitespace-nowrap max-w-[280px]" title={cat.nome}>
                                                            <span className="inline-flex items-center gap-1.5 max-w-full">
                                                                <span className="truncate">{cat.nome}</span>
                                                                <TagNatureza natureza={cat.natureza} />
                                                            </span>
                                                        </td>
                                                        {cat.valores.map((v, i) => <Cel key={i} v={v} className="text-gray-600" />)}
                                                        <Cel v={cat.total} className="bg-gray-50" />
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
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

                {/* Fixo × Variável (Margem de Contribuição) — desktop */}
                {dados && meses.length > 0 && fv && (
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-gray-100">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Fixo × Variável — Margem de Contribuição</span>
                            <p className="text-xs text-gray-500 mt-0.5">O que sobra da venda depois dos gastos que crescem com ela — é daí que a estrutura fixa é paga.</p>
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
                                        <td className="px-5 py-2.5 text-gray-700 sticky left-0 bg-white whitespace-nowrap">Receita líquida</td>
                                        {dados.receita.liquida.valores.map((v, i) => <Cel key={i} v={v} />)}
                                        <Cel v={dados.receita.liquida.total} className="font-medium bg-gray-50" />
                                    </tr>
                                    <tr>
                                        <td className="px-5 py-2.5 text-gray-600 sticky left-0 bg-white whitespace-nowrap">(−) Despesas variáveis</td>
                                        {fv.variaveis.valores.map((v, i) => <Cel key={i} v={v} className="text-gray-600" />)}
                                        <Cel v={fv.variaveis.total} className="bg-gray-50" />
                                    </tr>
                                    <tr className="bg-mint/40 font-semibold">
                                        <td className="px-5 py-2.5 text-primaryDark sticky left-0 bg-mint/40 whitespace-nowrap">= Margem de contribuição</td>
                                        {fv.margemContribuicao.valores.map((v, i) => (
                                            <td key={i} className={`px-4 py-2.5 text-right whitespace-nowrap ${v < 0 ? 'text-red-700' : 'text-primaryDark'}`}>{fmt0(v)}</td>
                                        ))}
                                        <td className="px-4 py-2.5 text-right text-primaryDark bg-mint/60 whitespace-nowrap">{fmt0(fv.margemContribuicao.total)}</td>
                                    </tr>
                                    <tr>
                                        <td className="px-5 py-2 text-gray-500 text-xs sticky left-0 bg-white whitespace-nowrap">% da receita</td>
                                        {fv.margemContribuicao.pctValores.map((v, i) => (
                                            <td key={i} className="px-4 py-2 text-right text-xs text-gray-500 whitespace-nowrap">{fmtPct(v)}</td>
                                        ))}
                                        <td className="px-4 py-2 text-right text-xs font-medium text-gray-600 bg-gray-50 whitespace-nowrap">{fmtPct(fv.margemContribuicao.pctTotal)}</td>
                                    </tr>
                                    <tr>
                                        <td className="px-5 py-2.5 text-gray-600 sticky left-0 bg-white whitespace-nowrap">(−) Despesas fixas</td>
                                        {fv.fixas.valores.map((v, i) => <Cel key={i} v={v} className="text-gray-600" />)}
                                        <Cel v={fv.fixas.total} className="bg-gray-50" />
                                    </tr>
                                    {Number(fv.indefinidas.total) !== 0 && (
                                        <tr>
                                            <td className="px-5 py-2.5 text-amber-700 sticky left-0 bg-white whitespace-nowrap">(−) Sem definição (fixa ou variável?)</td>
                                            {fv.indefinidas.valores.map((v, i) => <Cel key={i} v={v} className="text-amber-700" />)}
                                            <Cel v={fv.indefinidas.total} className="text-amber-700 bg-gray-50" />
                                        </tr>
                                    )}
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
                            {grupos.filter((g) => g.valores[iMobile] !== 0).map((g) => {
                                const aberto = abertos.has(chaveGrupo(g));
                                return (
                                    <React.Fragment key={chaveGrupo(g)}>
                                        <button
                                            onClick={() => alternar(g)}
                                            className={`w-full flex justify-between items-center px-4 py-2.5 text-sm font-semibold text-left min-h-[44px] ${g.id === null && g.nome === 'Sem bloco' ? 'bg-amber-50/60' : 'bg-gray-50'}`}
                                        >
                                            <span className="inline-flex items-center gap-1.5 text-gray-800">
                                                <ChevronRight className={`h-3.5 w-3.5 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                                                (−) {g.nome}
                                            </span>
                                            <span className="text-gray-800">{fmt0(g.valores[iMobile])}</span>
                                        </button>
                                        {aberto && g.categorias.filter((c) => c.valores[iMobile] !== 0).map((cat) => (
                                            <div key={cat.nome} className="flex justify-between px-4 py-2.5 text-sm gap-3">
                                                <span className="text-gray-600 pl-6 truncate inline-flex items-center gap-1.5 min-w-0">
                                                    <span className="truncate">{cat.nome}</span>
                                                    <TagNatureza natureza={cat.natureza} />
                                                </span>
                                                <span className="text-gray-600 shrink-0">{fmt0(cat.valores[iMobile])}</span>
                                            </div>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                            <div className="flex justify-between px-4 py-2.5 text-sm font-semibold bg-red-50/40">
                                <span>= Total de despesas</span>
                                <span className="text-red-700">{fmt0(dados.despesas.total.valores[iMobile])}</span>
                            </div>
                            {fv && (
                                <div className="flex justify-between px-4 py-2.5 text-sm font-semibold bg-mint/40">
                                    <span className="text-primaryDark">Margem de contribuição</span>
                                    <span className="text-primaryDark">
                                        {fmt0(fv.margemContribuicao.valores[iMobile])}
                                        {fv.margemContribuicao.pctValores[iMobile] != null ? ` (${fmtPct(fv.margemContribuicao.pctValores[iMobile])})` : ''}
                                    </span>
                                </div>
                            )}
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

                {temPendencia && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            Há categorias sem bloco ou sem fixa/variável definidos — elas aparecem em "Sem bloco" e com a etiqueta "?".
                            Ajuste em <Link to="/financeiro/categorias-despesa" className="underline font-semibold">Categorias de Despesa</Link> para o resultado ficar certinho.
                        </span>
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">De onde vêm os números:</span>{' '}
                    receita = pedidos <span className="font-semibold">faturados</span> + <span className="font-semibold">especiais</span> (mesma regra do Dashboard), menos devoluções;
                    despesas = <span className="font-semibold">Contas a Pagar por competência</span>, agrupadas nos blocos que você define em Categorias de Despesa (o rateio da nota divide sozinho).
                    Despesa que ainda não está no app não aparece — quanto mais contas entrarem pelo app, mais completa fica a DRE.
                </div>
            </div>
        </div>
    );
};

export default DrePage;
