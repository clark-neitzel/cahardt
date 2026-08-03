import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import toast from 'react-hot-toast';
import {
    Home, BarChart3, Repeat, MessageCircle, DollarSign, AlertTriangle,
    CreditCard, Clock, Users, Tag, TrendingDown, TrendingUp, MapPin, CalendarDays,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import api from '../../services/api';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import {
    Card, Kpi, BarraMeta, LinhaBarra, BarrasVerticais, Gauge,
    BadgeRecompra, ItemAlerta, Carregando, fmtRS, fmtRS0, fmtK, fmtBR, fmtInt,
    useAtualizaAoVoltar
} from './dashUi';

dayjs.locale('pt-br');

const ABAS = [
    { key: 'visao', label: 'Visão Geral', icon: Home },
    { key: 'vendas', label: 'Vendas & Pedidos', icon: BarChart3 },
    { key: 'recorrencia', label: 'Recorrência', icon: Repeat },
    { key: 'atendimentos', label: 'Atendimentos', icon: MessageCircle },
    { key: 'resultado', label: 'Resultado & Margem', icon: DollarSign },
];

// Abas cujos dados mudam quando o filtro de categoria muda
const ABAS_COM_CATEGORIA = ['visao', 'vendas', 'resultado'];
// Abas que respondem ao mês selecionado (recorrência é sempre a foto atual da carteira)
const ABAS_COM_MES = ['visao', 'vendas', 'atendimentos', 'resultado'];

const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesAtualSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const rotuloMesLongo = (ym) => `${MESES_LONGO[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
const somaMesYM = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const ultimoDiaMes = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

const DashboardGeral = () => {
    const [filtros, setFiltros] = useFiltrosSalvos('dashboard-geral', { categoria: 'Produto Acabado', aba: 'visao' });
    // Mês selecionado NÃO é persistido: sempre abre no mês corrente (regra do projeto)
    const [mes, setMes] = useState(mesAtualSP());
    const [categorias, setCategorias] = useState([]);
    const [dados, setDados] = useState({});     // { [aba]: payload }
    const [carregando, setCarregando] = useState({});
    const [atualizadoEm, setAtualizadoEm] = useState(null);
    const [tick, setTick] = useState(0);        // gatilho de recarga (voltar ao app, aba re-clicada, 5min)

    const aba = ABAS.some((a) => a.key === filtros.aba) ? filtros.aba : 'visao';
    const categoria = filtros.categoria || '';
    const hoje = mesAtualSP();
    const ehAtual = mes === hoje;
    const mesMinimo = somaMesYM(hoje, -11); // navega até 12 meses atrás

    // Dado vivo: rebusca ao voltar para o app (PWA em segundo plano) e a cada 5 min
    const marcarAtualizado = useAtualizaAoVoltar(() => setTick((t) => t + 1));

    useEffect(() => {
        api.get('/dashboards/geral/categorias')
            .then((res) => setCategorias(Array.isArray(res.data) ? res.data : []))
            .catch(() => { });
    }, []);

    const buscarAba = useCallback(async (chave, cat, mesSel) => {
        setCarregando((c) => ({ ...c, [chave]: true }));
        try {
            const params = {};
            if (ABAS_COM_CATEGORIA.includes(chave) && cat) params.categoria = cat;
            if (ABAS_COM_MES.includes(chave)) {
                if (chave === 'atendimentos') { params.de = `${mesSel}-01`; params.ate = ultimoDiaMes(mesSel); }
                else params.mes = mesSel;
            }
            const res = await api.get(`/dashboards/geral/${chave === 'visao' ? 'visao-geral' : chave}`, { params });
            setDados((d) => ({ ...d, [chave]: res.data }));
            setAtualizadoEm(new Date());
            marcarAtualizado();
        } catch (e) {
            toast.error('Não foi possível carregar esta aba do dashboard.');
        } finally {
            setCarregando((c) => ({ ...c, [chave]: false }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Busca sempre que troca de aba, muda o filtro/mês ou o gatilho de recarga dispara.
    // O dado anterior continua na tela durante a rebusca (sem "piscar").
    useEffect(() => {
        buscarAba(aba, categoria, mes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aba, categoria, mes, tick]);

    const trocarCategoria = (valor) => {
        setDados((d) => {
            const novo = { ...d };
            ABAS_COM_CATEGORIA.forEach((k) => delete novo[k]);
            return novo;
        });
        setFiltros({ ...filtros, categoria: valor });
    };

    const irParaMes = (alvo) => {
        if (alvo > hoje || alvo < mesMinimo || alvo === mes) return;
        setDados((d) => {
            const novo = { ...d };
            ABAS_COM_MES.forEach((k) => delete novo[k]); // recarrega as abas sensíveis ao mês
            return novo;
        });
        setMes(alvo);
    };
    const irMes = (n) => irParaMes(somaMesYM(mes, n));

    const d = dados[aba];
    const ocupado = carregando[aba] && !d;

    return (
        <div className="max-w-full overflow-x-hidden">
            {/* Topbar */}
            <div className="bg-white border-b border-gray-200 p-3 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-red-100 p-1.5 md:p-2 rounded-lg flex-none">
                            <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-red-600" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Dashboard Gerencial</h1>
                            <p className="text-xs md:text-sm text-gray-500 font-medium capitalize">{rotuloMesLongo(mes)}</p>
                        </div>
                    </div>
                    <div className="md:ml-auto flex flex-wrap items-center gap-2">
                        {/* Navegador de mês */}
                        <div className="flex items-center bg-white border border-gray-300 rounded-full">
                            <button onClick={() => irMes(-1)} disabled={mes <= mesMinimo}
                                className="p-2 rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent min-h-[40px]" aria-label="Mês anterior">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="px-2 text-sm font-bold text-gray-800 capitalize whitespace-nowrap select-none">{rotuloMesLongo(mes)}</span>
                            <button onClick={() => irMes(1)} disabled={ehAtual}
                                className="p-2 rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent min-h-[40px]" aria-label="Próximo mês">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-gray-500 flex-none" />
                            <SelectBusca value={categoria} onChange={(e) => trocarCategoria(e.target.value)} className="w-full md:w-56">
                                <option value="">Todas as categorias</option>
                                {categorias.map((c) => (
                                    <option key={c.categoria} value={c.categoria}>{c.categoria}</option>
                                ))}
                            </SelectBusca>
                        </div>
                    </div>
                </div>
                {!ehAtual && (
                    <div className="mt-3">
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-3 py-1.5">
                            📅 vendo {rotuloMesLongo(mes)} (mês fechado)
                            <button onClick={() => irParaMes(hoje)} className="underline">voltar ao mês atual</button>
                        </span>
                    </div>
                )}
                {/* Abas */}
                <div className="flex gap-2 mt-3 md:mt-4 overflow-x-auto hide-scrollbar -mx-3 px-3 md:mx-0 md:px-0">
                    {ABAS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => (key === aba ? setTick((t) => t + 1) : setFiltros({ ...filtros, aba: key }))}
                            className={`flex-none flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold min-h-[40px] border transition-colors ${aba === key
                                ? 'bg-primary border-primary text-white shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </button>
                    ))}
                    {atualizadoEm && (
                        <span className="flex-none self-center ml-1 text-[11px] font-semibold text-gray-500 whitespace-nowrap">
                            atualizado {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-3 md:space-y-4">
                {ocupado && <Carregando />}
                {!ocupado && aba === 'visao' && d && <AbaVisaoGeral d={d} irPara={(k) => setFiltros({ ...filtros, aba: k })} />}
                {!ocupado && aba === 'vendas' && d && <AbaVendas d={d} />}
                {!ocupado && aba === 'recorrencia' && d && <>
                    {!ehAtual && <p className="text-sm text-gray-600 font-medium px-1">A recorrência mostra a <b>situação atual da carteira</b> (não muda por mês) — mesmo vendo {rotuloMesLongo(mes)}.</p>}
                    <AbaRecorrencia d={d} />
                </>}
                {!ocupado && aba === 'atendimentos' && d && <AbaAtendimentos d={d} />}
                {!ocupado && aba === 'resultado' && d && <AbaResultado d={d} />}
            </div>
        </div>
    );
};

/* ══════════════ ABA 1 · VISÃO GERAL ══════════════ */
const AbaVisaoGeral = ({ d, irPara }) => {
    const v = d.vendasMes || {};
    const ehAtual = d.ehAtual !== false;
    const h = d.hoje || {};
    const a = d.alertas || {};
    const c = d.caixa || {};
    const pctComPedido = h.atendimentos > 0 ? Math.round((h.atendimentosComPedido / h.atendimentos) * 100) : null;

    return (
        <>
            <Card
                icon={Clock}
                titulo={`${ehAtual ? 'O mês até agora' : 'Resultado do mês'}${d.categoria ? ` — ${d.categoria}` : ''}`}
                direita={ehAtual ? `dia ${v.diaAtual} de ${v.totalDias}` : `mês fechado`}
            >
                <div className="flex flex-wrap items-center gap-4 md:gap-6">
                    <Gauge percent={v.pctMeta ?? 0} />
                    <div className="flex-1 min-w-[220px] grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div><p className="text-xs font-bold text-gray-500">Vendas líquidas</p><p className="text-base md:text-lg font-extrabold text-gray-900 tabular-nums">{fmtRS0(v.liquida)}</p></div>
                        <div><p className="text-xs font-bold text-gray-500">Meta do mês</p><p className="text-base md:text-lg font-extrabold text-gray-900 tabular-nums">{v.meta > 0 ? fmtRS0(v.meta) : '—'}</p></div>
                        <div>
                            <p className="text-xs font-bold text-gray-500">{ehAtual ? 'Projeção*' : 'Atingimento'}</p>
                            <p className={`text-base md:text-lg font-extrabold tabular-nums ${v.projecaoBateMeta == null ? 'text-gray-900' : v.projecaoBateMeta ? 'text-green-700' : 'text-red-700'}`}>
                                {ehAtual ? fmtRS0(v.projecao) : (v.pctMeta != null ? `${fmtBR(v.pctMeta, 0)}%` : '—')}{v.projecaoBateMeta ? ' ✓' : ''}
                            </p>
                        </div>
                        <div><p className="text-xs font-bold text-gray-500">Ticket médio</p><p className="text-base md:text-lg font-extrabold text-gray-900 tabular-nums">{fmtRS0(v.ticketMedio)}</p></div>
                        <div><p className="text-xs font-bold text-gray-500">Margem bruta</p><p className="text-base md:text-lg font-extrabold text-gray-900 tabular-nums">{v.margemBrutaPct != null ? `${fmtBR(v.margemBrutaPct, 1)}%` : '—'}</p></div>
                        <div><p className="text-xs font-bold text-gray-500">Devoluções</p><p className="text-base md:text-lg font-extrabold text-gray-900 tabular-nums">{fmtRS0(v.devolucoes)}</p></div>
                    </div>
                </div>
                <div className="mt-4">
                    <BarraMeta percent={v.pctMeta ?? 0} />
                    <p className="text-xs text-gray-500 font-medium mt-1.5">
                        {ehAtual ? '*Projeção = ritmo atual mantido até o fim do mês. ' : ''}{v.pedidos ? `${fmtInt(v.pedidos)} pedidos no mês.` : ''}
                    </p>
                </div>
            </Card>

            {!ehAtual && (
                <p className="text-sm text-gray-600 font-medium px-1">
                    Indicadores de <b>hoje</b>, <b>alertas</b> e <b>saúde do caixa</b> aparecem só no mês atual (são do momento). Para o mês fechado, veja as vendas acima e as abas <b>Vendas</b>, <b>Atendimentos</b> e <b>Resultado &amp; Margem</b>.
                </p>
            )}

            {ehAtual && <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Vendas hoje" valor={fmtRS0(h.vendas)} sub={`${fmtInt(h.pedidos)} pedidos lançados`} />
                <Kpi label="Pedidos hoje" valor={fmtInt(h.pedidos)} />
                <Kpi label="Atendimentos hoje" valor={fmtInt(h.atendimentos)} sub={pctComPedido != null ? `${pctComPedido}% viraram pedido` : null} subClasse={pctComPedido >= 50 ? 'text-green-700' : 'text-gray-500'} />
                <Kpi label="Clientes atendidos" valor={fmtInt(h.clientesAtendidos)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <Card icon={AlertTriangle} titulo="Precisa de atenção" direita="agir hoje">
                    <div className="space-y-2">
                        <ItemAlerta
                            numero={fmtInt(a.recompraCritica)}
                            titulo="Clientes em recompra crítica"
                            sub="passaram do dobro do ciclo normal de compra"
                            acao={<button onClick={() => irPara('recorrencia')} className="text-primary text-xs font-bold whitespace-nowrap">ver Recorrência →</button>}
                        />
                        <ItemAlerta
                            numero={fmtInt(a.retornosVencidos)}
                            cor="bg-amber-100 text-amber-700"
                            titulo="Retornos agendados vencidos"
                            sub="o vendedor prometeu voltar e a data passou"
                            acao={<Link to="/atendimentos" className="text-primary text-xs font-bold whitespace-nowrap">ver →</Link>}
                        />
                        <ItemAlerta
                            numero={fmtInt(a.clientesVencidos)}
                            cor="bg-amber-100 text-amber-700"
                            titulo="Clientes com parcela vencida"
                            sub={`${fmtRS(a.valorVencido)} em aberto vencido`}
                            acao={<Link to="/financeiro/contas-receber" className="text-primary text-xs font-bold whitespace-nowrap">cobrança →</Link>}
                        />
                        {a.pedidosErroEnvio > 0 && (
                            <ItemAlerta
                                numero={fmtInt(a.pedidosErroEnvio)}
                                cor="bg-gray-200 text-gray-700"
                                titulo="Pedidos com erro de envio ao Conta Azul"
                                sub="reenviar para não travar o faturamento"
                                acao={<Link to="/pedidos" className="text-primary text-xs font-bold whitespace-nowrap">resolver →</Link>}
                            />
                        )}
                    </div>
                </Card>

                <Card icon={CreditCard} titulo="Saúde do caixa" direita={<Link to="/financeiro/fluxo-caixa" className="text-primary font-bold">fluxo completo →</Link>}>
                    <div className="grid grid-cols-3 gap-3">
                        <div><p className="text-xs font-bold text-gray-500">A receber vencido</p><p className="text-base md:text-xl font-extrabold text-red-700 tabular-nums">{fmtK(c.aReceberVencido)}</p></div>
                        <div><p className="text-xs font-bold text-gray-500">A pagar (7 dias)</p><p className="text-base md:text-xl font-extrabold text-gray-900 tabular-nums">{fmtK(c.aPagar7dias)}</p></div>
                        <div>
                            <p className="text-xs font-bold text-gray-500">Saldo previsto 30d</p>
                            <p className={`text-base md:text-xl font-extrabold tabular-nums ${Number(c.saldoPrevisto30) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {c.saldoPrevisto30 != null ? fmtK(c.saldoPrevisto30) : '—'}
                            </p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-3">
                        Próximos 30 dias — entradas previstas <b className="text-gray-700">{fmtK(c.entradasPrevistas30)}</b> · saídas previstas <b className="text-gray-700">{fmtK(c.saidasPrevistas30)}</b>
                    </p>
                </Card>
            </div>
            </>}
        </>
    );
};

/* ══════════════ ABA 2 · VENDAS & PEDIDOS ══════════════ */
const AbaVendas = ({ d }) => (
    <>
        <Card icon={BarChart3} titulo="Vendas por semana" direita="semana atual em dourado">
            <BarrasVerticais serie={d.serieSemanal || []} />
            <p className="text-xs text-gray-500 font-medium mt-2">Valores em R$ mil, vendas líquidas (já descontadas devoluções). No celular, deslize o gráfico para o lado.</p>
        </Card>

        <Card icon={Users} titulo="Vendedores × meta do mês" direita={<Link to="/dashboard-vendedor" className="text-primary font-bold">ver como vendedor →</Link>} semPadding>
            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Meta</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Realizado</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Atingimento</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Projeção</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {(d.vendedores || []).map((v) => (
                            <tr key={v.vendedorId} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-semibold text-gray-900">{v.nome}</td>
                                <td className="px-5 py-3 text-right text-gray-700 tabular-nums">{v.meta > 0 ? fmtRS0(v.meta) : '—'}</td>
                                <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">{fmtRS0(v.realizado)}</td>
                                <td className="px-5 py-3"><BarraMeta percent={v.meta > 0 ? (v.realizado / v.meta) * 100 : 0} /></td>
                                <td className="px-5 py-3 text-right text-gray-700 tabular-nums">{fmtRS0(v.projecao)}{v.pctProjecao != null ? ` (${Math.round(v.pctProjecao)}%)` : ''}</td>
                                <td className="px-5 py-3"><SituacaoVendedor pct={v.pctProjecao} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {/* Mobile: cards */}
            <div className="md:hidden space-y-3 p-3">
                {(d.vendedores || []).map((v) => (
                    <div key={v.vendedorId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-gray-900">{v.nome}</span>
                            <SituacaoVendedor pct={v.pctProjecao} />
                        </div>
                        <BarraMeta percent={v.meta > 0 ? (v.realizado / v.meta) * 100 : 0} />
                        <div className="flex justify-between mt-1.5 text-xs font-semibold text-gray-600 tabular-nums">
                            <span>{fmtRS0(v.realizado)} de {v.meta > 0 ? fmtRS0(v.meta) : '—'}</span>
                            <span>projeção {fmtRS0(v.projecao)}{v.pctProjecao != null ? ` (${Math.round(v.pctProjecao)}%)` : ''}</span>
                        </div>
                    </div>
                ))}
            </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <Card icon={Tag} titulo="Top produtos — últimos 30 dias">
                {(d.topProdutos || []).map((p, i, arr) => (
                    <LinhaBarra key={p.produtoId} nome={p.nome} valor={fmtRS0(p.total)} percent={(p.total / Math.max(1, arr[0]?.total)) * 100} />
                ))}
                {(d.topProdutos || []).length === 0 && <p className="text-sm text-gray-500">Sem vendas no período.</p>}
            </Card>
            <div className="space-y-3 md:space-y-4">
                <Card icon={TrendingDown} titulo="Produtos em queda" direita="30d vs 30 anteriores">
                    {(d.produtosQueda || []).map((p) => (
                        <LinhaBarra key={p.produtoId} nome={p.nome} valor={`−${fmtBR(p.quedaPct, 0)}%`} percent={p.quedaPct} cor="bg-red-500" />
                    ))}
                    {(d.produtosQueda || []).length === 0 && <p className="text-sm text-gray-500">Nenhuma queda relevante. 👏</p>}
                </Card>
                <Card icon={MapPin} titulo="Vendas por cidade — mês">
                    {(d.cidades || []).map((c, i, arr) => (
                        <LinhaBarra key={c.cidade} nome={c.cidade} sub={`${fmtInt(c.clientes)} cli.`} valor={fmtRS0(c.total)} percent={(c.total / Math.max(1, arr[0]?.total)) * 100} />
                    ))}
                </Card>
            </div>
        </div>
    </>
);

const SituacaoVendedor = ({ pct }) => {
    if (pct == null) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">sem meta</span>;
    if (pct >= 100) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">acima da meta</span>;
    if (pct >= 85) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">quase lá</span>;
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">precisa reagir</span>;
};

/* ══════════════ ABA 3 · RECORRÊNCIA ══════════════ */
const AbaRecorrencia = ({ d }) => {
    const f = d.funil || {};
    const cart = d.carteira || {};
    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <FunilCard n={f.NO_PRAZO} rotulo="No prazo" sub="comprando dentro do ciclo" cls="bg-green-100 text-green-800" />
                <FunilCard n={f.ATENCAO} rotulo="Atenção" sub="passou um pouco do ciclo" cls="bg-yellow-100 text-yellow-800" />
                <FunilCard n={f.ATRASADO} rotulo="Atrasado" sub="1,5× o ciclo sem comprar" cls="bg-amber-100 text-amber-700" />
                <FunilCard n={f.CRITICO} rotulo="Crítico" sub="2× o ciclo — risco de perder" cls="bg-red-100 text-red-700" />
            </div>
            <p className="text-sm text-gray-600 font-medium px-1">
                Os <b className="text-gray-900">{fmtInt(d.emRisco?.clientes)}</b> clientes em atrasado + crítico compravam juntos cerca de{' '}
                <b className="text-gray-900">{fmtRS0(d.emRisco?.valorMensalEstimado)}/mês</b> — é essa venda que está em risco.
            </p>

            <Card icon={Clock} titulo="Clientes críticos — agir primeiro" direita="ordenado por venda em risco" semPadding>
                {/* Desktop */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ciclo normal</th>
                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Sem comprar há</th>
                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Compra média/mês</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {(d.criticos || []).map((c) => (
                                <tr key={c.clienteId} className="hover:bg-gray-50">
                                    <td className="px-5 py-3">
                                        <Link to={`/clientes/${c.clienteId}`} className="font-semibold text-gray-900 hover:text-primary">{c.nome}</Link>
                                        {c.cidade && <p className="text-xs text-gray-500 font-medium">{c.cidade}</p>}
                                    </td>
                                    <td className="px-5 py-3 text-gray-700">{c.vendedor || '—'}</td>
                                    <td className="px-5 py-3 text-right text-gray-700 tabular-nums">{c.cicloDias != null ? `${c.cicloDias} dias` : '—'}</td>
                                    <td className="px-5 py-3 text-right font-bold text-red-700 tabular-nums">{c.diasSemComprar != null ? `${c.diasSemComprar} dias` : '—'}</td>
                                    <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">{fmtRS0(c.compraMensalEstimada)}</td>
                                    <td className="px-5 py-3"><BadgeRecompra status={c.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Mobile */}
                <div className="md:hidden space-y-3 p-3">
                    {(d.criticos || []).map((c) => (
                        <Link key={c.clienteId} to={`/clientes/${c.clienteId}`} className="block bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-gray-900 truncate">{c.nome}</span>
                                <BadgeRecompra status={c.status} />
                            </div>
                            <p className="text-xs text-gray-500 font-medium">
                                {c.cidade || ''}{c.vendedor ? ` · ${c.vendedor}` : ''}
                            </p>
                            <p className="text-sm text-gray-700 font-medium mt-1.5">
                                <span className="text-red-700 font-bold">{c.diasSemComprar != null ? `${c.diasSemComprar} dias sem comprar` : ''}</span>
                                {c.cicloDias != null ? ` · ciclo ${c.cicloDias}d` : ''} · <b>{fmtRS0(c.compraMensalEstimada)}/mês</b>
                            </p>
                        </Link>
                    ))}
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <Card icon={TrendingDown} titulo="Sinais de enfraquecimento" direita="ainda compra, mas menos">
                    <div className="space-y-2">
                        {(d.enfraquecendo || []).map((c) => (
                            <ItemAlerta
                                key={c.clienteId}
                                numero="↓"
                                cor="bg-amber-100 text-amber-700"
                                titulo={c.nome}
                                sub={`ticket caiu ${fmtBR(Math.abs(c.variacaoTicketPct), 0)}%${c.produtoAusente ? ` · sumiu da cesta: ${c.produtoAusente}` : ''}`}
                                acao={<Link to={`/clientes/${c.clienteId}`} className="text-primary text-xs font-bold whitespace-nowrap">ver cliente →</Link>}
                            />
                        ))}
                        {(d.enfraquecendo || []).length === 0 && <p className="text-sm text-gray-500">Nenhum sinal forte de queda. 👏</p>}
                    </div>
                </Card>
                <Card icon={Users} titulo="Movimento da carteira — mês">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        <div><p className="text-2xl font-extrabold text-green-700 tabular-nums">+{fmtInt(cart.novosNoMes)}</p><p className="text-xs font-bold text-gray-500">novos</p></div>
                        <div><p className="text-2xl font-extrabold text-green-700 tabular-nums">+{fmtInt(cart.reativadosNoMes)}</p><p className="text-xs font-bold text-gray-500">reativados</p></div>
                        <div><p className="text-2xl font-extrabold text-red-700 tabular-nums">{fmtInt(cart.semCompra90d)}</p><p className="text-xs font-bold text-gray-500">sem compra +90d</p></div>
                        <div><p className="text-2xl font-extrabold text-amber-700 tabular-nums">{fmtInt(cart.primeiraCompraSemRecompra)}</p><p className="text-xs font-bold text-gray-500">1ª compra s/ recompra</p></div>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-3 text-center">Carteira ativa acompanhada: <b className="text-gray-700">{fmtInt(d.totalAtivos)} clientes</b>. A 2ª compra é o que fideliza — acompanhar de perto quem fez só uma.</p>
                </Card>
            </div>
        </>
    );
};

const FunilCard = ({ n, rotulo, sub, cls }) => {
    const [bg, texto] = cls.split(' ');
    return (
        <div className={`rounded-xl p-4 ${bg}`}>
            <p className={`text-2xl md:text-3xl font-extrabold tabular-nums ${texto}`}>{fmtInt(n)}</p>
            <p className={`text-sm font-bold ${texto}`}>{rotulo}</p>
            <p className={`text-xs font-semibold mt-1 opacity-80 ${texto}`}>{sub}</p>
        </div>
    );
};

/* ══════════════ ABA 4 · ATENDIMENTOS ══════════════ */
const AbaAtendimentos = ({ d }) => (
    <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Atendimentos no mês" valor={fmtInt(d.total)} />
            <Kpi label="Viraram pedido" valor={d.conversaoPct != null ? `${fmtBR(d.conversaoPct, 0)}%` : '—'} sub={`${fmtInt(d.comPedido)} com venda`} subClasse="text-green-700" />
            <Kpi label="Sem venda" valor={fmtInt(d.semPedido)} sub="motivos ao lado" />
            <Kpi label="Leads novos" valor={fmtInt(d.leadsNovos)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <Card icon={BarChart3} titulo="Atendimentos por tipo — mês">
                {(d.porTipo || []).map((t, i, arr) => (
                    <LinhaBarra key={t.tipo} nome={t.tipo} valor={fmtInt(t.qtd)} percent={(t.qtd / Math.max(1, arr[0]?.qtd)) * 100} />
                ))}
                {(d.porTipo || []).length === 0 && <p className="text-sm text-gray-500">Sem atendimentos no período.</p>}
            </Card>
            <Card icon={MessageCircle} titulo="Por que não vendeu — motivos" direita={`${fmtInt(d.semPedido)} sem venda`}>
                {(d.motivosSemVenda || []).map((m, i, arr) => (
                    <LinhaBarra key={m.motivo} nome={m.motivo} valor={fmtInt(m.qtd)} percent={(m.qtd / Math.max(1, arr[0]?.qtd)) * 100} cor="bg-[#cba258]" />
                ))}
                {(d.motivosSemVenda || []).length === 0 && <p className="text-sm text-gray-500">Nenhum motivo registrado no período.</p>}
                <p className="text-xs text-gray-500 font-medium mt-2">"Ainda tem estoque" alto pode indicar visita fora do ciclo — cruze com a aba Recorrência.</p>
            </Card>
        </div>

        <Card icon={Users} titulo="Aproveitamento por vendedor" direita="% que vira pedido" semPadding>
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Atendimentos</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Com pedido</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Conversão</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Retornos vencidos</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {(d.porVendedor || []).map((v) => (
                            <tr key={v.vendedorId} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-semibold text-gray-900">{v.nome}</td>
                                <td className="px-5 py-3 text-right tabular-nums text-gray-700">{fmtInt(v.atendimentos)}</td>
                                <td className="px-5 py-3 text-right tabular-nums text-gray-700">{fmtInt(v.comPedido)}</td>
                                <td className="px-5 py-3"><BarraMeta percent={v.conversaoPct ?? 0} /></td>
                                <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900">{fmtInt(v.retornosVencidos)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="md:hidden space-y-3 p-3">
                {(d.porVendedor || []).map((v) => (
                    <div key={v.vendedorId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-gray-900">{v.nome}</span>
                            <span className="text-sm font-bold text-gray-900 tabular-nums">{v.conversaoPct != null ? `${fmtBR(v.conversaoPct, 0)}%` : '—'}</span>
                        </div>
                        <BarraMeta percent={v.conversaoPct ?? 0} />
                        <p className="text-xs font-semibold text-gray-600 mt-1.5 tabular-nums">
                            {fmtInt(v.comPedido)} pedidos em {fmtInt(v.atendimentos)} atendimentos{v.retornosVencidos > 0 ? ` · ${fmtInt(v.retornosVencidos)} retornos vencidos` : ''}
                        </p>
                    </div>
                ))}
            </div>
        </Card>
    </>
);

/* ══════════════ ABA 5 · RESULTADO & MARGEM ══════════════ */
const AbaResultado = ({ d }) => {
    const dre = d.dre || {};
    const mp = d.margemProdutos || {};
    const aging = d.aging || {};
    const pctSobreReceita = (v) => (dre.receitaLiquida > 0 ? `${fmtBR((v / dre.receitaLiquida) * 100, 1)}%` : '—');
    const deltaMargem = dre.margemPct != null && dre.anterior?.margemPct != null
        ? Math.round((dre.margemPct - dre.anterior.margemPct) * 10) / 10 : null;

    const LinhaDre = ({ rotulo, valor, negativo, forte, destaque, pct }) => (
        <div className={`flex items-center justify-between gap-3 px-4 md:px-5 py-2.5 border-b border-gray-100 last:border-0 ${destaque ? 'bg-mint' : forte ? 'bg-gray-50' : ''}`}>
            <span className={`text-sm ${forte || destaque ? 'font-extrabold text-gray-900' : 'font-medium text-gray-700'}`}>{rotulo}</span>
            <span className="flex items-baseline gap-3">
                {pct != null && <span className="text-xs font-semibold text-gray-500 tabular-nums">{pct}</span>}
                <span className={`text-sm tabular-nums ${negativo ? 'font-semibold text-red-700' : forte || destaque ? 'font-extrabold text-gray-900' : 'font-semibold text-gray-800'}`}>
                    {negativo ? `− ${fmtRS(Math.abs(valor))}` : fmtRS(valor)}
                </span>
            </span>
        </div>
    );

    return (
        <>
            <Card icon={DollarSign} titulo={`Resultado do mês — ${dayjs(`${d.mes}-01`).format('MMMM/YYYY')}`} direita={<Link to="/financeiro/dre" className="text-primary font-bold">DRE completa →</Link>} semPadding>
                <LinhaDre rotulo="Receita bruta" valor={dre.receitaBruta} />
                <LinhaDre rotulo="(−) Devoluções" valor={dre.devolucoes} negativo pct={pctSobreReceita(dre.devolucoes)} />
                <LinhaDre rotulo="Receita líquida" valor={dre.receitaLiquida} forte pct="100%" />
                <LinhaDre rotulo="(−) Despesas operacionais" valor={dre.despesasOperacional} negativo pct={pctSobreReceita(dre.despesasOperacional)} />
                <LinhaDre rotulo="(−) Financeiro (juros, tarifas)" valor={dre.despesasFinanceiro} negativo pct={pctSobreReceita(dre.despesasFinanceiro)} />
                {dre.despesasAClassificar > 0 && (
                    <LinhaDre rotulo="(−) Despesas a classificar" valor={dre.despesasAClassificar} negativo pct={pctSobreReceita(dre.despesasAClassificar)} />
                )}
                <LinhaDre rotulo="Resultado do mês" valor={dre.resultado} destaque pct={dre.margemPct != null ? `${fmtBR(dre.margemPct, 1)}%` : '—'} />
                <div className="px-4 md:px-5 py-3 text-xs text-gray-500 font-medium">
                    Mês anterior: resultado <b className="text-gray-700">{fmtRS0(dre.anterior?.resultado)}</b>
                    {dre.anterior?.margemPct != null ? ` (${fmtBR(dre.anterior.margemPct, 1)}%)` : ''}
                    {deltaMargem != null && (
                        <> — {deltaMargem >= 0 ? 'melhora' : 'piora'} de <b className={deltaMargem >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtBR(Math.abs(deltaMargem), 1)} ponto{Math.abs(deltaMargem) === 1 ? '' : 's'}</b></>
                    )}
                    . Retiradas e empréstimos ficam fora desta conta{dre.foraDre > 0 ? ` (${fmtRS0(dre.foraDre)} no mês)` : ''}.
                    {dre.temAClassificar && <> Há despesas <Link to="/financeiro/categorias-despesa" className="text-primary font-bold">a classificar →</Link></>}
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <Card icon={TrendingUp} titulo="Melhores margens" direita={mp.margemPctGeral != null ? `média ${fmtBR(mp.margemPctGeral, 1)}%` : null}>
                    {(mp.melhores || []).map((p, i, arr) => (
                        <LinhaBarra key={p.nome} nome={p.nome} valor={`${fmtBR(p.margemPct, 0)}%`} percent={p.margemPct} />
                    ))}
                    {(mp.melhores || []).length === 0 && <p className="text-sm text-gray-500">Sem dados de margem no mês.</p>}
                </Card>
                <Card icon={TrendingDown} titulo="Piores margens — atenção no preço ou custo" direita={<Link to="/financeiro/margem-produtos" className="text-primary font-bold">completo →</Link>}>
                    {(mp.piores || []).map((p) => (
                        <LinhaBarra key={p.nome} nome={p.nome} valor={`${fmtBR(p.margemPct, 0)}%`} percent={Math.max(5, p.margemPct)} cor="bg-red-500" />
                    ))}
                    <p className="text-xs text-gray-500 font-medium mt-2">Margem = preço de venda − custo (ficha técnica do PCP ou custo de compra).{mp.semCusto > 0 ? ` ${fmtInt(mp.semCusto)} produtos sem custo cadastrado.` : ''}</p>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <Card icon={Clock} titulo="Recebíveis por idade" direita={`${fmtRS0(aging.totalAberto)} em aberto`}>
                    {(aging.faixas || []).map((f, i, arr) => {
                        const maior = Math.max(1, ...arr.map((x) => x.valor));
                        return (
                            <LinhaBarra
                                key={f.key}
                                nome={f.label}
                                sub={`${fmtInt(f.qtd)} parc.`}
                                valor={fmtRS0(f.valor)}
                                percent={(f.valor / maior) * 100}
                                cor={f.key === 'aVencer' ? 'bg-primary' : 'bg-red-500'}
                            />
                        );
                    })}
                    <p className="text-xs text-gray-500 font-medium mt-2">Vencido: <b className="text-red-700">{fmtRS0(aging.totalVencido)}</b> — a Régua de Cobrança age automaticamente nos vencidos.</p>
                </Card>
                <Card icon={CreditCard} titulo="Custos que mais pesaram" direita="no mês">
                    {(d.custosTop || []).map((c, i, arr) => (
                        <LinhaBarra key={c.nome} nome={c.nome} valor={fmtRS0(c.valor)} percent={(c.valor / Math.max(1, arr[0]?.valor)) * 100} />
                    ))}
                    {(d.custosTop || []).length === 0 && <p className="text-sm text-gray-500">Sem despesas lançadas no mês.</p>}
                </Card>
            </div>
        </>
    );
};

export default DashboardGeral;
