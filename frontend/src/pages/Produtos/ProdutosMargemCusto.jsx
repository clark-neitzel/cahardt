import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Tag, TrendingUp, TrendingDown, AlertTriangle, Loader2, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { useAtualizaAoVoltar } from '../../hooks/useAtualizaAoVoltar';
import { Card, Kpi, Carregando, fmtRS, fmtRS0, fmtBR, fmtInt } from '../Dashboard/dashUi';

const MESES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (ym) => MESES_LABEL[Number(ym.slice(5, 7)) - 1] || ym.slice(5, 7);

/* ── mini-gráficos ── */
// Sparkline do custo (aceita nulos)
const Sparkline = ({ dados, subiu }) => {
    const pts = dados.map((v, i) => ({ v, i })).filter((p) => p.v != null);
    if (pts.length < 2) return <span className="text-gray-300">—</span>;
    const vals = pts.map((p) => p.v);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const w = 60, h = 20;
    const x = (i) => (i / (dados.length - 1)) * w;
    const y = (v) => h - 3 - ((v - min) / span) * (h - 6);
    const poly = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const cor = subiu == null ? '#78716c' : subiu ? '#b91c1c' : '#166534';
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="align-middle">
            <polyline points={poly} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
};

// Gráfico de linha preço × custo do detalhe
const GraficoPrecoCusto = ({ serie }) => {
    const precos = serie.map((s) => s.precoReferencia).filter((v) => v != null);
    const custos = serie.map((s) => s.custo).filter((v) => v != null);
    const max = Math.max(1, ...precos, ...custos);
    const W = 340, H = 150, padL = 40, padB = 24, padT = 10, padR = 10;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x = (i) => padL + (serie.length <= 1 ? plotW / 2 : (i / (serie.length - 1)) * plotW);
    const y = (v) => padT + plotH - (v / max) * plotH;
    const linha = (campo) => serie.map((s, i) => (s[campo] != null ? `${x(i).toFixed(1)},${y(s[campo]).toFixed(1)}` : null)).filter(Boolean).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 460 }}>
            <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#e3e0d8" />
            <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#e3e0d8" />
            {[0, 0.5, 1].map((f) => (
                <text key={f} x={padL - 6} y={padT + plotH - f * plotH + 3} textAnchor="end" fontSize="9" fill="#78716c" fontFamily="Manrope">{fmtBR(max * f, max < 5 ? 2 : 0)}</text>
            ))}
            <polyline points={linha('precoReferencia')} fill="none" stroke="#00754A" strokeWidth="2.5" strokeLinejoin="round" />
            <polyline points={linha('custo')} fill="none" stroke="#cba258" strokeWidth="2.5" strokeLinejoin="round" />
            {serie.map((s, i) => (
                <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#78716c" fontFamily="Manrope">{rotuloMes(s.mes)}</text>
            ))}
        </svg>
    );
};

const OrigemBadge = ({ origem, fonteCusto }) => {
    if (origem === 'propria') return <span className="px-2 py-1 text-xs font-bold rounded-full bg-mint text-primaryDark whitespace-nowrap">🏭 própria</span>;
    if (origem === 'revenda') return <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">📦 revenda</span>;
    return <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">sem custo</span>;
};

const MargemBadge = ({ pct }) => {
    if (pct == null) return <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700">cadastrar</span>;
    let cls = 'bg-red-100 text-red-700';
    if (pct >= 50) cls = 'bg-green-100 text-green-800';
    else if (pct >= 35) cls = 'bg-yellow-100 text-yellow-800';
    return <span className={`px-2 py-1 text-xs font-extrabold rounded-full ${cls}`}>{fmtBR(pct, 0)}%</span>;
};

// Tendência do custo (subir custo = ruim = vermelho)
const TendenciaCusto = ({ pct, spark }) => (
    <span className="inline-flex items-center gap-1.5 justify-end">
        {pct != null && (
            <span className={`font-bold text-xs whitespace-nowrap ${pct > 0.5 ? 'text-red-700' : pct < -0.5 ? 'text-green-700' : 'text-gray-500'}`}>
                {pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '▬'} {fmtBR(Math.abs(pct), 0)}%
            </span>
        )}
        <Sparkline dados={spark || []} subiu={pct == null ? null : pct > 0.5 ? true : pct < -0.5 ? false : null} />
    </span>
);

const ProdutosMargemCusto = () => {
    const [filtros, setFiltros] = useFiltrosSalvos('produtos-margem', { categoria: 'Produto Acabado', origem: 'propria', meses: 6 });
    const [categorias, setCategorias] = useState([]);
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [expandido, setExpandido] = useState(null);       // produtoId aberto
    const [detalhes, setDetalhes] = useState({});           // cache { produtoId: detalhe }
    const [loadingDet, setLoadingDet] = useState(null);

    useEffect(() => {
        api.get('/produtos-margem/categorias').then((r) => setCategorias(Array.isArray(r.data) ? r.data : [])).catch(() => { });
    }, []);

    const carregar = useCallback(async () => {
        if (!dados) setLoading(true);
        try {
            const params = { origem: filtros.origem, meses: filtros.meses };
            if (filtros.categoria) params.categoria = filtros.categoria;
            const r = await api.get('/produtos-margem', { params });
            setDados(r.data);
        } catch {
            toast.error('Não foi possível carregar os produtos.');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtros.categoria, filtros.origem, filtros.meses]);

    useEffect(() => { carregar(); }, [carregar]);
    useAtualizaAoVoltar(carregar);

    const abrirDetalhe = async (produtoId) => {
        if (expandido === produtoId) { setExpandido(null); return; }
        setExpandido(produtoId);
        if (!detalhes[produtoId]) {
            setLoadingDet(produtoId);
            try {
                const r = await api.get(`/produtos-margem/${produtoId}`, { params: { meses: filtros.meses } });
                setDetalhes((d) => ({ ...d, [produtoId]: r.data }));
            } catch {
                toast.error('Não foi possível carregar o detalhe.');
                setExpandido(null);
            } finally {
                setLoadingDet(null);
            }
        }
    };

    const setFiltro = (patch) => { setDados(null); setExpandido(null); setFiltros({ ...filtros, ...patch }); };

    if (loading && !dados) return <Carregando />;
    const resumo = dados?.resumo || {};
    const linhas = (dados?.linhas || []).filter((l) => !busca.trim() || `${l.nome} ${l.codigo}`.toLowerCase().includes(busca.trim().toLowerCase()));

    // destaques (client-side)
    const espremida = (dados?.linhas || [])
        .filter((l) => l.margemPct != null && l.variacaoCustoPct != null && l.variacaoCustoPct > 3)
        .sort((a, b) => b.variacaoCustoPct - a.variacaoCustoPct).slice(0, 4);
    const custoSubiu = (dados?.linhas || [])
        .filter((l) => l.variacaoCustoPct != null && l.variacaoCustoPct > 0.5)
        .sort((a, b) => b.variacaoCustoPct - a.variacaoCustoPct).slice(0, 4);

    return (
        <div className="max-w-full overflow-x-hidden">
            {/* Topbar */}
            <div className="bg-white border-b border-gray-200 p-3 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-purple-100 p-1.5 md:p-2 rounded-lg flex-none"><Tag className="h-4 w-4 md:h-5 md:w-5 text-purple-600" /></div>
                        <div className="min-w-0">
                            <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Produtos · Margem, Custo &amp; Markup</h1>
                            <p className="text-xs md:text-sm text-gray-500 font-medium">custo, preço e rentabilidade — foco em produção própria</p>
                        </div>
                    </div>
                    <div className="md:ml-auto flex flex-wrap items-center gap-2">
                        <SelectBusca value={filtros.categoria} onChange={(e) => setFiltro({ categoria: e.target.value })} className="w-full md:w-52">
                            <option value="">Todas as categorias</option>
                            {categorias.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria}</option>)}
                        </SelectBusca>
                        <SelectBusca value={String(filtros.meses)} onChange={(e) => setFiltro({ meses: Number(e.target.value) })} className="w-full md:w-40">
                            <option value="6">Últimos 6 meses</option>
                            <option value="12">Últimos 12 meses</option>
                            <option value="3">Últimos 3 meses</option>
                        </SelectBusca>
                    </div>
                </div>
                {/* Segmented */}
                <div className="inline-flex bg-gray-100 rounded-full p-0.5 gap-0.5 mt-3">
                    {[['propria', '🏭 Produção própria'], ['revenda', '📦 Revenda'], ['todos', 'Todos']].map(([k, lbl]) => (
                        <button key={k} onClick={() => setFiltro({ origem: k })}
                            className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-bold min-h-[38px] transition-colors ${filtros.origem === k ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600'}`}>
                            {lbl}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-3 md:space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Kpi label="Margem média" valor={resumo.margemMedia != null ? `${fmtBR(resumo.margemMedia, 1)}%` : '—'} />
                    <Kpi label="Markup médio" valor={resumo.markupMedio != null ? `${fmtBR(resumo.markupMedio, 2)}×` : '—'} sub="preço ÷ custo" />
                    <Kpi label="Produção própria" valor={fmtInt(resumo.producaoPropria)} sub="com ficha técnica" />
                    <Kpi label="Sem custo cadastrado" valor={fmtInt(resumo.semCusto)} sub="não entram na margem" subClasse={resumo.semCusto > 0 ? 'text-red-700' : 'text-gray-500'} />
                    <Kpi label="Margem em queda" valor={fmtInt(resumo.margemEmQueda)} sub="custo subiu no período" subClasse={resumo.margemEmQueda > 0 ? 'text-red-700' : 'text-gray-500'} />
                </div>

                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto por nome ou código…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />

                {/* Tabela / cards */}
                <Card icon={TrendingUp} titulo={`Meus produtos${filtros.origem === 'propria' ? ' — produção própria' : filtros.origem === 'revenda' ? ' — revenda' : ''}`} direita={`${fmtInt(linhas.length)} · ordenado por margem`} semPadding>
                    {/* Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Origem</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo un.</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Preço</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Markup</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Margem</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo ({filtros.meses}m)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {linhas.map((l) => (
                                    <React.Fragment key={l.produtoId}>
                                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => abrirDetalhe(l.produtoId)}>
                                            <td className="px-5 py-3"><div className="font-bold text-gray-900">{l.nome}</div><div className="text-xs text-gray-500 font-semibold">cód. {l.codigo}{l.unidade ? ` · ${l.unidade}` : ''}</div></td>
                                            <td className="px-5 py-3"><OrigemBadge origem={l.origem} fonteCusto={l.fonteCusto} /></td>
                                            <td className="px-5 py-3 text-right font-bold tabular-nums text-gray-900">{l.custoUnitario != null ? fmtRS(l.custoUnitario) : <span className="text-amber-700">—</span>}</td>
                                            <td className="px-5 py-3 text-right font-bold tabular-nums text-gray-900">{fmtRS(l.precoVenda)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums text-gray-700">{l.markup != null ? `${fmtBR(l.markup, 2)}×` : '—'}</td>
                                            <td className="px-5 py-3 text-right"><MargemBadge pct={l.margemPct} /></td>
                                            <td className="px-5 py-3 text-right"><TendenciaCusto pct={l.variacaoCustoPct} spark={l.sparkCusto} /></td>
                                        </tr>
                                        {expandido === l.produtoId && (
                                            <tr className="bg-gray-50"><td colSpan={7} className="p-0">
                                                <DetalheProduto det={detalhes[l.produtoId]} carregando={loadingDet === l.produtoId} />
                                            </td></tr>
                                        )}
                                    </React.Fragment>
                                ))}
                                {linhas.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-500">Nenhum produto encontrado.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    {/* Mobile: cards */}
                    <div className="md:hidden divide-y divide-gray-100">
                        {linhas.map((l) => (
                            <div key={l.produtoId}>
                                <button onClick={() => abrirDetalhe(l.produtoId)} className="w-full text-left p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-bold text-gray-900 truncate">{l.nome}</div>
                                            <div className="text-xs text-gray-500 font-semibold mt-0.5">cód. {l.codigo}{l.unidade ? ` · ${l.unidade}` : ''}</div>
                                        </div>
                                        <OrigemBadge origem={l.origem} fonteCusto={l.fonteCusto} />
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        <span className="text-sm font-bold tabular-nums">Custo {l.custoUnitario != null ? fmtRS(l.custoUnitario) : '—'}</span>
                                        <span className="text-sm font-bold tabular-nums">Preço {fmtRS(l.precoVenda)}</span>
                                        <span className="text-sm tabular-nums text-gray-600">{l.markup != null ? `${fmtBR(l.markup, 2)}×` : ''}</span>
                                        <MargemBadge pct={l.margemPct} />
                                        <TendenciaCusto pct={l.variacaoCustoPct} spark={l.sparkCusto} />
                                    </div>
                                </button>
                                {expandido === l.produtoId && <DetalheProduto det={detalhes[l.produtoId]} carregando={loadingDet === l.produtoId} />}
                            </div>
                        ))}
                        {linhas.length === 0 && <div className="p-8 text-center text-gray-500">Nenhum produto encontrado.</div>}
                    </div>
                    <div className="p-3 md:px-5 md:py-3"><p className="text-xs text-gray-500 font-medium">Toque em um produto para ver a variação de preço × custo e a composição do custo. Custo pela ficha técnica ativa do PCP (produção própria) ou custo de compra (revenda).</p></div>
                </Card>

                {/* Destaques */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <Card icon={AlertTriangle} titulo="Margem espremida — agir no preço ou no custo">
                        <div className="divide-y divide-gray-100">
                            {espremida.map((l) => (
                                <div key={l.produtoId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                                    <div className="flex-1 min-w-0"><div className="text-sm font-bold text-gray-900 truncate">{l.nome}</div><div className="text-xs text-gray-500 font-medium">custo +{fmtBR(l.variacaoCustoPct, 0)}% no período · margem {l.margemPct != null ? `${fmtBR(l.margemPct, 0)}%` : '—'}</div></div>
                                    <span className="text-sm font-extrabold text-red-700 whitespace-nowrap">▲ {fmtBR(l.variacaoCustoPct, 0)}%</span>
                                </div>
                            ))}
                            {espremida.length === 0 && <p className="text-sm text-gray-500">Nenhuma margem sob pressão no período. 👏</p>}
                        </div>
                    </Card>
                    <Card icon={TrendingUp} titulo="Custo que mais subiu no período">
                        <div className="divide-y divide-gray-100">
                            {custoSubiu.map((l) => (
                                <div key={l.produtoId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                                    <div className="flex-1 min-w-0"><div className="text-sm font-bold text-gray-900 truncate">{l.nome}</div><div className="text-xs text-gray-500 font-medium">custo hoje {l.custoUnitario != null ? fmtRS(l.custoUnitario) : '—'}</div></div>
                                    <span className="text-sm font-extrabold text-red-700 whitespace-nowrap">▲ {fmtBR(l.variacaoCustoPct, 0)}%</span>
                                </div>
                            ))}
                            {custoSubiu.length === 0 && <p className="text-sm text-gray-500">Custos estáveis no período. Assim que a captura mensal rodar, as variações aparecem aqui.</p>}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

/* ── Detalhe expandido de um produto ── */
const DetalheProduto = ({ det, carregando }) => {
    if (carregando || !det) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    const v = det.variacao || {};
    const comp = det.composicao;
    const algumEstimado = (det.serie || []).some((s) => s.estimado);
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 p-4 md:p-5">
            {/* Gráfico */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Preço × Custo — {det.serie?.length || 0} meses</div>
                <GraficoPrecoCusto serie={det.serie || []} />
                <div className="flex gap-4 flex-wrap mt-2 text-xs font-semibold text-gray-600">
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-[3px] rounded" style={{ background: '#00754A' }} /> Preço praticado</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-[3px] rounded" style={{ background: '#cba258' }} /> Custo</span>
                </div>
                {v.custoPct != null && (
                    <div className={`rounded-lg px-3.5 py-2.5 text-sm font-semibold mt-3 ${v.custoPct > 3 ? 'bg-amber-100 text-amber-700' : 'bg-mint text-primaryDark'}`}>
                        {v.custoPct > 0.5
                            ? <>O custo subiu <b>{fmtBR(v.custoPct, 0)}%</b> no período{v.margemPts != null && v.margemPts < 0 ? <> e a margem caiu <b>{fmtBR(Math.abs(v.margemPts), 1)} ponto{Math.abs(v.margemPts) === 1 ? '' : 's'}</b></> : ''}. Revisar preço ou custo.</>
                            : v.custoPct < -0.5
                                ? <>O custo <b>caiu {fmtBR(Math.abs(v.custoPct), 0)}%</b> no período — margem melhorou. 👏</>
                                : <>Custo estável no período.</>}
                    </div>
                )}
                {algumEstimado && <p className="text-xs text-gray-500 font-medium mt-2">Custo de meses anteriores é estimado (custo atual). A partir de agora o sistema grava o custo real de cada mês — o histórico se enche sozinho.</p>}
            </div>
            {/* Composição */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Composição do custo — o que mais pesa</div>
                {comp && comp.itens?.length > 0 ? (
                    <>
                        <div className="space-y-2.5">
                            {comp.itens.slice(0, 6).map((it, i) => (
                                <div key={i} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                                    <span className="text-sm font-semibold text-gray-800 truncate">{it.nome}</span>
                                    <span className="text-sm font-bold text-gray-900 text-right whitespace-nowrap tabular-nums">{fmtRS(it.custoPorUnidade)} · {fmtBR(it.pct, 0)}%</span>
                                    <span className="col-span-2 h-2 bg-gray-100 rounded overflow-hidden"><i className="block h-full rounded" style={{ width: `${Math.min(100, it.pct)}%`, background: it.tipo === 'MP' ? '#cba258' : '#00754A' }} /></span>
                                </div>
                            ))}
                        </div>
                        {comp.itens[0] && (
                            <div className="bg-mint text-primaryDark rounded-lg px-3.5 py-2.5 text-sm font-semibold mt-3">
                                <b>{comp.itens[0].nome}</b> é {fmtBR(comp.itens[0].pct, 0)}% do custo. Vem da ficha técnica ativa do PCP.
                            </div>
                        )}
                        {comp.temCustoFaltando && <p className="text-xs text-amber-700 font-semibold mt-2">Alguns ingredientes estão sem custo cadastrado — o custo pode estar subestimado.</p>}
                    </>
                ) : (
                    <p className="text-sm text-gray-500">Este produto não tem ficha técnica no PCP (é revenda ou custo de compra). A composição aparece só para produção própria.</p>
                )}
            </div>
        </div>
    );
};

export default ProdutosMargemCusto;
