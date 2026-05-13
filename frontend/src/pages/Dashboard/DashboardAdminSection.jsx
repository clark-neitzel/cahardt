import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart2,
    Calendar,
    CheckSquare,
    Crown,
    Flame,
    Lock,
    Package,
    PieChart,
    ShieldCheck,
    ShieldX,
    Target,
    TrendingDown,
    Trophy,
    UserX,
    Users,
    Wallet,
    Printer,
    Zap,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const fmtBRL = (v) =>
    `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBRLcompact = (v) => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
    return fmtBRL(n);
};
const fmtNum = (v) => Number(v || 0).toLocaleString('pt-BR');
const fmtPct = (v, signed = true) => (v == null ? '—' : `${signed && v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const fmtDateISO = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');
const clamp = (v, min = 0, max = 100) => Math.min(max, Math.max(min, Number(v || 0)));
const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const diasSem = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
const semaforoAtingimento = (pct) => {
    if (pct == null) return { texto: 'Sem meta', className: 'bg-gray-100 text-gray-600' };
    if (pct >= 90) return { texto: 'Verde', className: 'bg-emerald-100 text-emerald-700' };
    if (pct >= 70) return { texto: 'Amarelo', className: 'bg-amber-100 text-amber-700' };
    return { texto: 'Vermelho', className: 'bg-red-100 text-red-700' };
};

const WEEKLY_PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  body * { visibility: hidden !important; }
  #weekly-brief-print, #weekly-brief-print * { visibility: visible !important; }
  #weekly-brief-print {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    color: #0f172a !important;
    font-family: Inter, Arial, sans-serif !important;
  }
}
`;

const corPct = (pct) => {
    if (pct == null) return 'bg-gray-300';
    if (pct >= 100) return 'bg-emerald-500';
    if (pct >= 80) return 'bg-emerald-400';
    if (pct >= 60) return 'bg-amber-400';
    return 'bg-red-400';
};

const corText = (pct) => {
    if (pct == null) return 'text-gray-500';
    if (pct >= 100) return 'text-emerald-700';
    if (pct >= 80) return 'text-emerald-600';
    if (pct >= 60) return 'text-amber-600';
    return 'text-red-600';
};

const parsePermissoes = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
};

const SectionHeader = ({ icon, title, right }) => (
    <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase font-bold text-gray-500 tracking-wider flex items-center gap-2">
            {React.createElement(icon, { size: 14 })} {title}
        </h3>
        {right}
    </div>
);

const StatPill = ({ label, value, sub, color = 'gray' }) => {
    const colors = {
        gray: 'text-gray-900',
        emerald: 'text-emerald-700',
        red: 'text-red-700',
        blue: 'text-blue-700',
        amber: 'text-amber-700',
        indigo: 'text-indigo-700',
    };
    return (
        <div className="flex flex-col items-start gap-0.5">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{label}</span>
            <span className={`text-xl font-bold ${colors[color]}`}>{value}</span>
            {sub && <span className="text-[11px] text-gray-500">{sub}</span>}
        </div>
    );
};

const TabButton = ({ active, icon, label, onClick, badge }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${active
            ? 'bg-slate-900 text-white shadow'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
    >
        {React.createElement(icon, { size: 15 })}
        {label}
        {badge != null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-200 text-slate-700'}`}>
                {badge}
            </span>
        )}
    </button>
);

const MeterBar = ({ value, color = 'bg-indigo-500' }) => (
    <div className="h-2 bg-slate-200/70 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${clamp(value)}%` }} />
    </div>
);

const RingGauge = ({ value, title, subtitle, color = '#22c55e' }) => {
    const pct = clamp(value);
    const size = 96;
    const stroke = 9;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (pct / 100) * circumference;

    return (
        <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="relative shrink-0" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(148,163,184,0.35)" strokeWidth={stroke} fill="transparent" />
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={color}
                        strokeWidth={stroke}
                        fill="transparent"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{pct.toFixed(0)}%</div>
            </div>
            <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-slate-300 font-semibold">{title}</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{subtitle}</p>
            </div>
        </div>
    );
};

const RankingRow = ({ rank, title, subtitle, value, pct, accent, right }) => (
    <div className="relative px-3 py-2.5 hover:bg-white/50 transition border-b last:border-0">
        <div className={`absolute inset-y-0 left-0 ${accent} opacity-40`} style={{ width: `${Math.max(2, pct)}%` }} />
        <div className="relative flex items-center gap-3">
            <span className={`w-6 text-center text-xs font-bold ${rank <= 3 ? 'text-amber-600' : 'text-gray-400'}`}>
                {rank}
            </span>
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate text-sm">{title}</div>
                {subtitle && <div className="text-[11px] text-gray-500 truncate">{subtitle}</div>}
            </div>
            <div className="text-right">
                <div className="font-bold text-gray-900 text-sm">{value}</div>
                {right && <div className="text-[11px] mt-0.5">{right}</div>}
            </div>
        </div>
    </div>
);

const DashboardAdminSection = () => {
    const { user } = useAuth();
    const [d, setD] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dataRef, setDataRef] = useState(hojeISO());
    const [abaAtiva, setAbaAtiva] = useState('cockpit');
    const [acessosDashboard, setAcessosDashboard] = useState([]);
    const [loadingAcessos, setLoadingAcessos] = useState(false);
    const [acessosCarregados, setAcessosCarregados] = useState(false);
    const [weeklyData, setWeeklyData] = useState(null);
    const [weeklyLoading, setWeeklyLoading] = useState(false);
    const [weeklyError, setWeeklyError] = useState('');
    const [weeklyBaseDate, setWeeklyBaseDate] = useState(hojeISO());
    const [weeklyVendedorId, setWeeklyVendedorId] = useState('');
    const [weeklyVendedores, setWeeklyVendedores] = useState([]);
    const [weeklyVendedoresCarregados, setWeeklyVendedoresCarregados] = useState(false);

    const podeVerVendas = !!user?.permissoes?.admin
        || !!user?.permissoes?.Pode_Ver_Dashboard_Admin
        || !!user?.permissoes?.Pode_Ver_Dashboard_Vendas;

    const acessoResumo = useMemo(() => {
        const total = acessosDashboard.length;
        const ativos = acessosDashboard.filter(item => item.ativo).length;
        const admin = acessosDashboard.filter(item => item.podeAdmin).length;
        const vendas = acessosDashboard.filter(item => item.podeVendas).length;
        return { total, ativos, admin, vendas };
    }, [acessosDashboard]);

    const acessoPorVendedorId = useMemo(
        () => new Map(acessosDashboard.map(item => [item.id, item])),
        [acessosDashboard],
    );

    const handleTrocaData = (novaData) => {
        setLoading(true);
        setDataRef(novaData || hojeISO());
    };

    const handleTrocaAba = (aba) => {
        setAbaAtiva(aba);
        if (aba === 'vendedores' && !acessosCarregados) setLoadingAcessos(true);
        if (aba === 'reuniao') setWeeklyLoading(true);
    };

    const handleTrocaDataSemanal = (novaData) => {
        setWeeklyLoading(true);
        setWeeklyBaseDate(novaData || hojeISO());
    };

    const handleTrocaVendedorSemanal = (novoVendedorId) => {
        setWeeklyLoading(true);
        setWeeklyVendedorId(novoVendedorId || '');
    };

    useEffect(() => {
        const params = dataRef && dataRef !== hojeISO() ? { data: dataRef } : {};
        api.get('/admin-dashboard', { params })
            .then(res => setD(res.data))
            .catch(err => console.error('Erro admin-dashboard', err))
            .finally(() => setLoading(false));
    }, [dataRef]);

    useEffect(() => {
        if (abaAtiva !== 'vendedores' || acessosCarregados) return;
        api.get('/vendedores')
            .then((res) => {
                const lista = Array.isArray(res.data) ? res.data : (res.data?.vendedores || []);
                const mapeados = lista
                    .map((vend) => {
                        const perms = parsePermissoes(vend.permissoes);
                        const podeAdmin = !!perms.admin || !!perms.Pode_Ver_Dashboard_Admin;
                        const podeVendas = podeAdmin || !!perms.Pode_Ver_Dashboard_Vendas;
                        return {
                            id: vend.id,
                            nome: vend.nome,
                            ativo: vend.ativo !== false,
                            podeAdmin,
                            podeVendas,
                        };
                    })
                    .sort((a, b) => {
                        if (Number(b.podeAdmin) !== Number(a.podeAdmin)) return Number(b.podeAdmin) - Number(a.podeAdmin);
                        if (Number(b.podeVendas) !== Number(a.podeVendas)) return Number(b.podeVendas) - Number(a.podeVendas);
                        if (Number(b.ativo) !== Number(a.ativo)) return Number(b.ativo) - Number(a.ativo);
                        return a.nome.localeCompare(b.nome, 'pt-BR');
                    });
                setAcessosDashboard(mapeados);
            })
            .catch((err) => {
                console.error('Erro ao carregar acessos do dashboard:', err);
                setAcessosDashboard([]);
            })
            .finally(() => {
                setAcessosCarregados(true);
                setLoadingAcessos(false);
            });
    }, [abaAtiva, acessosCarregados]);

    useEffect(() => {
        if (abaAtiva !== 'reuniao') return;
        const params = { dataBase: weeklyBaseDate || hojeISO() };
        if (weeklyVendedorId) params.vendedorId = weeklyVendedorId;
        api.get('/admin-dashboard/weekly-brief', { params })
            .then((res) => {
                setWeeklyData(res.data || null);
                setWeeklyError('');
            })
            .catch((err) => {
                console.error('Erro weekly-brief', err);
                setWeeklyData(null);
                setWeeklyError('Não foi possível carregar o resumo semanal.');
            })
            .finally(() => setWeeklyLoading(false));
    }, [abaAtiva, weeklyBaseDate, weeklyVendedorId]);

    useEffect(() => {
        if (abaAtiva !== 'reuniao' || weeklyVendedoresCarregados) return;
        api.get('/vendedores', { params: { ativo: 'true' } })
            .then((res) => {
                const lista = Array.isArray(res.data) ? res.data : (res.data?.vendedores || []);
                const normalizados = lista
                    .map((vendedor) => ({ id: vendedor.id, nome: vendedor.nome }))
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
                setWeeklyVendedores(normalizados);
            })
            .catch((err) => {
                console.error('Erro ao carregar vendedores para weekly-brief:', err);
                setWeeklyVendedores([]);
            })
            .finally(() => setWeeklyVendedoresCarregados(true));
    }, [abaAtiva, weeklyVendedoresCarregados]);

    if (loading) {
        return (
            <div className="animate-pulse my-6 space-y-4">
                <div className="h-44 bg-gray-200 rounded-2xl" />
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (!d) return null;

    const v = d.vendas || {};
    const op = d.operacaoDia || {};
    const metas = d.metas || {};
    const vendedoresMeta = metas.vendedores || [];
    const inad = d.inadimplencia || { total: 0, parcelas: 0 };
    const inativos = d.clientesInativos || { total: 0, top: [] };
    const fec = d.fechamentoOntem || {};
    const pri = d.prioridadesHoje || {};
    const qual = d.qualidadeAtendimento || {};

    const variacaoUp = (v.variacaoMesPct || 0) >= 0;
    const VarIcon = variacaoUp ? ArrowUpRight : ArrowDownRight;

    const pctMesDecorrido = v.diasNoMes ? (v.diaAtualMes / v.diasNoMes) * 100 : 0;
    const pctRealizadoVsProj = v.projecaoMes > 0 ? (v.mes / v.projecaoMes) * 100 : 0;
    const pctAtingimentoMeta = metas.metaTotalMes > 0 ? (metas.realizadoTotal / metas.metaTotalMes) * 100 : 0;

    const maxProd = (d.topProdutos?.[0]?.valorLiquido) || 1;
    const maxCli = (d.topClientes?.[0]?.valor) || 1;
    const maxRealizado = Math.max(1, ...vendedoresMeta.map((item) => Math.max(item.meta || 0, item.realizado || 0)));

    const fecData = (fec.data || d.dataReferencia)
        ? new Date((fec.data || d.dataReferencia) + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })
        : 'hoje';
    const resumoSemanal = weeklyData?.resumoEquipe || {};
    const rankingSemanal = weeklyData?.rankingVendedores || [];
    const insightsSemanal = weeklyData?.insights || {};
    const alertasSemanal = insightsSemanal.alertas || {};
    const topProdutosSemanal = insightsSemanal.topProdutos || [];
    const produtosQuedaSemanal = insightsSemanal.produtosEmQueda || [];
    const topClientesSemanal = insightsSemanal.topClientes || [];
    const topProdutosPositivos = [...topProdutosSemanal]
        .sort((a, b) => Number(b.valorLiquido || 0) - Number(a.valorLiquido || 0))
        .slice(0, 3);
    const topRiscosSemana = [...produtosQuedaSemanal].slice(0, 3);
    const periodoAtualSemanal = weeklyData?.periodoAtual || null;
    const periodoAnteriorSemanal = weeklyData?.periodoAnterior || null;

    return (
        <div className="mb-8 w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-sm uppercase font-bold text-gray-500 tracking-wider flex items-center gap-2">
                    <Lock size={16} /> Painel Administrativo
                    {d.isHistorico && (
                        <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold normal-case tracking-normal">
                            Visualizando {new Date(d.dataReferencia + 'T12:00').toLocaleDateString('pt-BR')}
                        </span>
                    )}
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                    <label htmlFor="dashDataRef" className="font-semibold">Dia:</label>
                    <input
                        id="dashDataRef"
                        type="date"
                        value={dataRef}
                        max={hojeISO()}
                        onChange={(e) => handleTrocaData(e.target.value)}
                        className="border rounded px-2 py-1 text-xs"
                    />
                    {dataRef !== hojeISO() && (
                        <button onClick={() => handleTrocaData(hojeISO())} className="text-indigo-600 hover:underline font-semibold">hoje</button>
                    )}
                </div>
            </div>

            <div className="bg-white border rounded-xl p-1 inline-flex flex-wrap gap-1 mb-6">
                <TabButton
                    active={abaAtiva === 'cockpit'}
                    icon={Activity}
                    label="Cockpit"
                    onClick={() => handleTrocaAba('cockpit')}
                />
                <TabButton
                    active={abaAtiva === 'graficos'}
                    icon={BarChart2}
                    label="Gráficos"
                    onClick={() => handleTrocaAba('graficos')}
                    badge={(d.topProdutos || []).length}
                />
                <TabButton
                    active={abaAtiva === 'vendedores'}
                    icon={Users}
                    label="Vendedores"
                    onClick={() => handleTrocaAba('vendedores')}
                    badge={vendedoresMeta.length || null}
                />
                <TabButton
                    active={abaAtiva === 'reuniao'}
                    icon={Calendar}
                    label="Reunião Semanal"
                    onClick={() => handleTrocaAba('reuniao')}
                    badge={rankingSemanal.length || null}
                />
            </div>

            {abaAtiva === 'cockpit' && (
                <div className="space-y-6">
                    {podeVerVendas && (
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-white p-6 lg:p-7 shadow-xl">
                            <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
                            <div className="absolute -left-10 -bottom-10 w-60 h-60 rounded-full bg-emerald-500/10 blur-3xl" />

                            <div className="relative grid grid-cols-1 xl:grid-cols-3 gap-5">
                                <div className="xl:col-span-2">
                                    <div className="text-[11px] uppercase tracking-widest font-bold text-emerald-300/80 mb-1">Cockpit de Vendas · Mês</div>
                                    <div className="flex items-end gap-3 flex-wrap">
                                        <h3 className="text-4xl xl:text-5xl font-black tracking-tight">{fmtBRL(v.mes)}</h3>
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${variacaoUp ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                            <VarIcon size={16} />
                                            {fmtPct(v.variacaoMesPct)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-300 mt-1">
                                        versus mesmo período: <span className="font-semibold text-slate-100">{fmtBRL(v.mesAnteriorMesmoPeriodo)}</span>
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Bruto {fmtBRL(v.mesBruto)} · Devoluções {fmtBRL(v.devolucaoMes)} · {fmtNum(v.qtdPedidosMes)} pedidos · ticket {fmtBRL(v.ticketMedio)}
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                                        <RingGauge
                                            value={pctMesDecorrido}
                                            title="Mês decorrido"
                                            subtitle={`Dia ${v.diaAtualMes || 0}/${v.diasNoMes || 0}`}
                                            color="#cbd5e1"
                                        />
                                        <RingGauge
                                            value={pctRealizadoVsProj}
                                            title="Realizado / projeção"
                                            subtitle="Quanto do ritmo projetado já foi entregue"
                                            color="#34d399"
                                        />
                                    </div>
                                </div>

                                <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-indigo-300/80 mb-1">
                                            <Target size={12} /> Projeção linear
                                        </div>
                                        <div className="text-3xl font-black tracking-tight">{fmtBRL(v.projecaoMes)}</div>
                                        <div className="text-xs text-slate-400 mt-1">se mantiver o ritmo atual até o fim do mês</div>
                                    </div>

                                    <div className="space-y-3 mt-5">
                                        <div>
                                            <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                                                <span>Meta da equipe</span>
                                                <span className="font-bold">{metas.metaTotalMes > 0 ? fmtPct(pctAtingimentoMeta, false) : '—'}</span>
                                            </div>
                                            <MeterBar value={pctAtingimentoMeta} color={corPct(pctAtingimentoMeta)} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-400 font-semibold">Hoje</div>
                                                <div className="text-base font-bold">{fmtBRLcompact(v.hoje)}</div>
                                                <div className="text-[10px] text-slate-400">{fmtNum(op.pedidosHoje || 0)} pedidos</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-400 font-semibold">Semana</div>
                                                <div className="text-base font-bold">{fmtBRLcompact(v.semana)}</div>
                                                <div className="text-[10px] text-slate-400">ritmo semanal</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                        <div className="bg-white border rounded-xl p-4">
                            <StatPill label="Clientes Atendidos" value={fmtNum(op.clientesAtendidos)} sub="hoje" color="blue" />
                        </div>
                        <div className="bg-white border rounded-xl p-4">
                            <StatPill label="Atendimentos" value={fmtNum(op.totalAtendimentos)} sub={`${fmtNum(op.atendimentosSemPedido)} sem venda`} color="indigo" />
                        </div>
                        <div className="bg-white border rounded-xl p-4">
                            <StatPill label="Transferências Pendentes" value={fmtNum(op.transferenciasPendentes)} sub="no dia" color={op.transferenciasPendentes > 0 ? 'amber' : 'gray'} />
                        </div>
                        <div className="bg-white border rounded-xl p-4">
                            <StatPill label="Leads Novos" value={fmtNum(op.leadsNovosHoje)} sub={`${fmtNum(op.leadsNaoAtendidos)} para atender`} color={op.leadsNaoAtendidos > 0 ? 'amber' : 'gray'} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <div className="bg-white border rounded-xl p-5">
                            <SectionHeader icon={Activity} title="Operação & Alertas" />
                            <div className="grid grid-cols-2 gap-4">
                                <StatPill label="Dinheiro no Caixa" value={fmtBRL(op.dinheiroRecebidoHoje)} sub="recebido hoje" color="emerald" />
                                <StatPill label="Recebido Entregas" value={fmtBRL(d.valorEntregueHoje)} color="blue" />
                                <StatPill label="Pedidos Lançados" value={fmtNum(op.pedidosHoje)} color="indigo" />
                                <Link to="/caixa" className="hover:opacity-80">
                                    <StatPill label="Caixas a Conferir" value={fmtNum(d.caixasAConferir)} color={d.caixasAConferir > 0 ? 'indigo' : 'gray'} />
                                </Link>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-4">
                                <Link to="/financeiro" className="hover:opacity-80">
                                    <StatPill
                                        label="Inadimplência"
                                        value={fmtBRLcompact(inad.total)}
                                        sub={inad.parcelas > 0 ? `${fmtNum(inad.parcelas)} parcela(s)` : null}
                                        color={inad.total > 0 ? 'red' : 'gray'}
                                    />
                                </Link>
                                <Link to="/pedidos?statusEnvio=ERRO" className="hover:opacity-80">
                                    <StatPill label="Erros ERP" value={fmtNum(d.pedidosComErro)} sub={d.pedidosComErro > 0 ? 'não sincronizados' : null} color={d.pedidosComErro > 0 ? 'red' : 'gray'} />
                                </Link>
                                <StatPill label="Nota Pendente" value={fmtNum(d.pedidosEspeciais)} sub="pedidos especiais" color={d.pedidosEspeciais > 0 ? 'amber' : 'gray'} />
                                <StatPill label="Clientes em Risco" value={fmtNum(pri.clientesEmRisco)} sub="30-44 dias" color={pri.clientesEmRisco > 0 ? 'red' : 'gray'} />
                            </div>
                        </div>

                        <div className="bg-white border rounded-xl p-5">
                            <SectionHeader icon={Zap} title="Prioridades de Hoje" />
                            <div className="grid grid-cols-2 gap-4">
                                <Link to="/atendimentos" className="hover:opacity-80">
                                    <StatPill label="Reagendados" value={fmtNum(pri.reagendadosHoje)} sub="visitas" color={pri.reagendadosHoje > 0 ? 'indigo' : 'gray'} />
                                </Link>
                                <Link to="/atendimentos" className="hover:opacity-80">
                                    <StatPill label="Transf. p/ Concluir" value={fmtNum(pri.transferenciasParaConcluir)} sub="pendentes" color={pri.transferenciasParaConcluir > 0 ? 'amber' : 'gray'} />
                                </Link>
                                <Link to="/caixa" className="hover:opacity-80">
                                    <StatPill label="Amostras p/ Entregar" value={fmtNum(pri.amostrasParaEntregar)} sub="não entregues" color={pri.amostrasParaEntregar > 0 ? 'amber' : 'gray'} />
                                </Link>
                                <StatPill label="1 Compra s/ Recompra" value={fmtNum(pri.clientesUmaCompra)} sub="clientes" color={pri.clientesUmaCompra > 0 ? 'amber' : 'gray'} />
                            </div>
                        </div>

                        <div className="bg-white border rounded-xl p-5">
                            <SectionHeader icon={Calendar} title="Fechamento Comercial" right={<span className="text-[11px] text-gray-400 capitalize">{fecData}</span>} />
                            <div className="grid grid-cols-2 gap-4">
                                <StatPill label="Programados" value={fmtNum(fec.clientesProgramados)} />
                                <StatPill label="Atendidos" value={fmtNum(fec.clientesAtendidos)} color="blue" />
                                <StatPill label="Não Atendidos" value={fmtNum(fec.clientesNaoAtendidos)} color={fec.clientesNaoAtendidos > 0 ? 'red' : 'gray'} />
                                <StatPill label="Pedidos Gerados" value={fmtNum(fec.pedidosGerados)} color="emerald" />
                            </div>
                            <div className="grid grid-cols-3 gap-3 border-t pt-3 mt-3">
                                <StatPill label="Transf. Abertas" value={fmtNum(fec.transferenciasAbertas)} color={fec.transferenciasAbertas > 0 ? 'amber' : 'gray'} />
                                <StatPill label="Amostras" value={fmtNum(fec.amostrasAbertas)} color={fec.amostrasAbertas > 0 ? 'amber' : 'gray'} />
                                <StatPill label="Pendências" value={fmtNum(fec.pendenciasAbertas)} color={fec.pendenciasAbertas > 0 ? 'red' : 'gray'} />
                            </div>
                        </div>

                        <div className="bg-white border rounded-xl p-5">
                            <SectionHeader icon={PieChart} title="Qualidade do Atendimento" right={<span className="text-[11px] text-gray-400 capitalize">{fecData}</span>} />
                            {qual.objecoesOntem?.length > 0 ? (
                                <div className="space-y-2">
                                    {qual.objecoesOntem.slice(0, 5).map((o, i) => {
                                        const maxCount = qual.objecoesOntem[0]?.count || 1;
                                        return (
                                            <div key={`${o.label}-${i}`}>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-600 truncate">{o.label}</span>
                                                    <span className="font-bold text-red-700">{fmtNum(o.count)}x</span>
                                                </div>
                                                <MeterBar value={(o.count / maxCount) * 100} color="bg-red-300" />
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-sm text-gray-400 py-3">Sem atendimentos sem venda registrados.</div>
                            )}
                            <Link to="/atendimentos" className="block mt-4 border-t pt-4 hover:opacity-80">
                                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Presencial via WhatsApp</div>
                                <div className={`text-3xl font-black mt-1 ${qual.clientesPresencialNoWhatsApp > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                                    {fmtNum(qual.clientesPresencialNoWhatsApp)}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">cliente(s) ontem</div>
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {abaAtiva === 'graficos' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                        <div className="bg-white border rounded-xl p-5 xl:col-span-2">
                            <SectionHeader icon={BarChart2} title="Ritmo do Mês" right={<span className="text-[11px] text-gray-400">acompanhamento</span>} />
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>Mês decorrido</span>
                                        <span className="font-bold text-gray-900">{clamp(pctMesDecorrido).toFixed(0)}%</span>
                                    </div>
                                    <MeterBar value={pctMesDecorrido} color="bg-slate-400" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>Realizado / projeção</span>
                                        <span className="font-bold text-gray-900">{clamp(pctRealizadoVsProj).toFixed(0)}%</span>
                                    </div>
                                    <MeterBar value={pctRealizadoVsProj} color="bg-emerald-500" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>Meta da equipe (realizado)</span>
                                        <span className="font-bold text-gray-900">{metas.metaTotalMes > 0 ? fmtPct(metas.pctTotal, false) : '—'}</span>
                                    </div>
                                    <MeterBar value={metas.pctTotal || 0} color={corPct(metas.pctTotal)} />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>Meta da equipe (projeção)</span>
                                        <span className="font-bold text-gray-900">{metas.metaTotalMes > 0 ? fmtPct(metas.pctProjecao, false) : '—'}</span>
                                    </div>
                                    <MeterBar value={metas.pctProjecao || 0} color="bg-indigo-500" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border rounded-xl p-5">
                            <SectionHeader icon={Flame} title="Indicadores Críticos" />
                            <div className="space-y-3">
                                <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                                    <div className="text-[11px] uppercase tracking-wide text-red-500 font-semibold">Inadimplência</div>
                                    <div className="text-xl font-bold text-red-700">{fmtBRLcompact(inad.total)}</div>
                                    <div className="text-xs text-red-500">{fmtNum(inad.parcelas)} parcela(s)</div>
                                </div>
                                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                                    <div className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">Notas Pendentes</div>
                                    <div className="text-xl font-bold text-amber-700">{fmtNum(d.pedidosEspeciais)}</div>
                                    <div className="text-xs text-amber-600">pedidos especiais</div>
                                </div>
                                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                                    <div className="text-[11px] uppercase tracking-wide text-indigo-600 font-semibold">Caixas a Conferir</div>
                                    <div className="text-xl font-bold text-indigo-700">{fmtNum(d.caixasAConferir)}</div>
                                    <div className="text-xs text-indigo-500">pendentes</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <div>
                            <SectionHeader icon={Package} title="Top 10 Produtos" right={<span className="text-[11px] text-gray-400">30 dias · líquido</span>} />
                            <div className="bg-gradient-to-br from-emerald-50/40 to-white border rounded-xl overflow-hidden">
                                {(d.topProdutos || []).map((p, i) => {
                                    const pct = (p.valorLiquido / maxProd) * 100;
                                    const margemTone = p.margemPct == null
                                        ? 'text-gray-400'
                                        : p.margemPct < 15 ? 'text-red-600 font-semibold' : p.margemPct > 35 ? 'text-emerald-600 font-semibold' : 'text-gray-500';
                                    return (
                                        <RankingRow
                                            key={p.produtoId}
                                            rank={i + 1}
                                            title={p.nome}
                                            subtitle={`${p.codigo} · ${fmtNum(p.quantidade)} un`}
                                            value={fmtBRL(p.valorLiquido)}
                                            pct={pct}
                                            accent="bg-emerald-200"
                                            right={
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className={margemTone}>marg {fmtPct(p.margemPct, false)}</span>
                                                    {p.rupturaRisco && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">RUPTURA</span>}
                                                </div>
                                            }
                                        />
                                    );
                                })}
                                {(!d.topProdutos || d.topProdutos.length === 0) && (
                                    <div className="p-8 text-center text-gray-400 text-sm">Sem vendas nos últimos 30 dias.</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <SectionHeader icon={Crown} title="Top 10 Clientes" right={<span className="text-[11px] text-gray-400">30 dias · líquido</span>} />
                            <div className="bg-gradient-to-br from-amber-50/30 to-white border rounded-xl overflow-hidden">
                                {(d.topClientes || []).map((c, i) => {
                                    const pct = (c.valor / maxCli) * 100;
                                    return (
                                        <RankingRow
                                            key={c.clienteId}
                                            rank={i + 1}
                                            title={c.nome}
                                            subtitle={c.codigo ? `cód ${c.codigo}` : null}
                                            value={fmtBRL(c.valor)}
                                            pct={pct}
                                            accent="bg-amber-200"
                                            right={<span className="text-gray-500">{fmtNum(c.pedidos)} ped</span>}
                                        />
                                    );
                                })}
                                {(!d.topClientes || d.topClientes.length === 0) && (
                                    <div className="p-8 text-center text-gray-400 text-sm">Sem vendas nos últimos 30 dias.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <div>
                            <SectionHeader
                                icon={UserX}
                                title="Clientes Inativos — Recuperar"
                                right={<span className="text-[11px] text-gray-400">{fmtNum(inativos.total)} sem pedido +45d</span>}
                            />
                            <div className="bg-white border rounded-xl overflow-hidden min-h-20">
                                {inativos.top?.length > 0 ? inativos.top.map((c) => {
                                    const dias = diasSem(c.ultimoPedido);
                                    return (
                                        <div key={c.clienteId} className="px-4 py-2.5 border-b last:border-0 flex items-center justify-between hover:bg-gray-50">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-gray-900 text-sm truncate">{c.nome}</div>
                                                <div className="text-[11px] text-gray-500">cód {c.codigo || '—'} · último em {fmtDate(c.ultimoPedido)}</div>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${dias > 90 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {dias}d
                                            </span>
                                        </div>
                                    );
                                }) : (
                                    <div className="p-6 text-center text-sm text-gray-400">Sem clientes inativos relevantes.</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <SectionHeader
                                icon={TrendingDown}
                                title="Produtos em Queda — Investigar"
                                right={<span className="text-[11px] text-gray-400">30d vs 30-60d</span>}
                            />
                            <div className="bg-white border rounded-xl overflow-hidden min-h-20">
                                {d.produtosEmQueda?.length > 0 ? d.produtosEmQueda.map((p) => (
                                    <div key={p.produtoId} className="px-4 py-2.5 border-b last:border-0 flex items-center justify-between hover:bg-gray-50">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-gray-900 text-sm truncate">{p.nome}</div>
                                            <div className="text-[11px] text-gray-500">{fmtBRL(p.vendas30dAnterior)} → {fmtBRL(p.vendas30dAtual)}</div>
                                        </div>
                                        <span className="text-sm font-bold px-2 py-1 rounded bg-red-100 text-red-700 flex items-center gap-1">
                                            <ArrowDownRight size={12} />
                                            {fmtPct(p.variacaoPct)}
                                        </span>
                                    </div>
                                )) : (
                                    <div className="p-6 text-center text-sm text-gray-400">Sem produtos com queda relevante.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {abaAtiva === 'vendedores' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                        <div className="bg-white border rounded-xl p-5 xl:col-span-2">
                            <SectionHeader icon={Users} title="Acesso ao Dashboard Administrativo" right={<span className="text-[11px] text-gray-400">perfis da equipe</span>} />
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                <div className="rounded-lg bg-gray-50 border px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Usuários</div>
                                    <div className="text-xl font-bold text-gray-900">{fmtNum(acessoResumo.total)}</div>
                                </div>
                                <div className="rounded-lg bg-gray-50 border px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Ativos</div>
                                    <div className="text-xl font-bold text-gray-900">{fmtNum(acessoResumo.ativos)}</div>
                                </div>
                                <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-indigo-600 font-semibold">Acesso Admin</div>
                                    <div className="text-xl font-bold text-indigo-700">{fmtNum(acessoResumo.admin)}</div>
                                </div>
                                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">Acesso Vendas</div>
                                    <div className="text-xl font-bold text-emerald-700">{fmtNum(acessoResumo.vendas)}</div>
                                </div>
                            </div>

                            {loadingAcessos ? (
                                <div className="text-sm text-gray-400 py-3">Carregando permissões de acesso...</div>
                            ) : (
                                <div className="max-h-80 overflow-auto border rounded-xl">
                                    {acessosDashboard.map((item) => (
                                        <div key={item.id} className="px-4 py-2.5 border-b last:border-0 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-sm text-gray-900 truncate">{item.nome}</div>
                                                {!item.ativo && <div className="text-[11px] text-red-500">inativo</div>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold ${item.podeAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {item.podeAdmin ? <ShieldCheck size={11} /> : <ShieldX size={11} />}
                                                    Admin
                                                </span>
                                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold ${item.podeVendas ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {item.podeVendas ? <ShieldCheck size={11} /> : <ShieldX size={11} />}
                                                    Vendas
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {!loadingAcessos && acessosDashboard.length === 0 && (
                                        <div className="p-4 text-sm text-gray-400">Não foi possível carregar os acessos dos vendedores.</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="bg-gradient-to-b from-indigo-50 to-white border rounded-xl p-5">
                            <SectionHeader icon={Trophy} title="Meta da Equipe" right={<span className="text-[11px] text-gray-400">mês corrente</span>} />
                            <div className="space-y-3">
                                <StatPill label="Meta Total" value={fmtBRL(metas.metaTotalMes)} color="indigo" />
                                <StatPill label="Realizado" value={fmtBRL(metas.realizadoTotal)} sub={fmtPct(metas.pctTotal, false)} color={metas.pctTotal >= 80 ? 'emerald' : 'amber'} />
                                <StatPill label="Projeção" value={fmtBRL(metas.projecaoTotal)} sub={fmtPct(metas.pctProjecao, false)} color={metas.pctProjecao >= 100 ? 'emerald' : 'red'} />
                                <StatPill label="Com Meta" value={`${vendedoresMeta.filter(vend => vend.meta > 0).length}/${vendedoresMeta.length}`} />
                            </div>
                            <div className="mt-4">
                                <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                                    <span>Atingimento total</span>
                                    <span className={`font-bold ${corText(metas.pctTotal)}`}>{fmtPct(metas.pctTotal, false)}</span>
                                </div>
                                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden relative">
                                    <div className={`h-full ${corPct(metas.pctTotal)} rounded-full`} style={{ width: `${Math.min(100, metas.pctTotal || 0)}%` }} />
                                    {metas.pctProjecao != null && (
                                        <div className="absolute top-0 h-full w-px bg-indigo-700" style={{ left: `${Math.min(100, metas.pctProjecao)}%` }} title={`Projeção: ${fmtPct(metas.pctProjecao, false)}`} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <SectionHeader icon={Trophy} title="Metas por Vendedor" right={<span className="text-[11px] text-gray-400">com projeção e acesso</span>} />
                        <div className="bg-white border rounded-xl overflow-x-auto">
                            <div className="grid grid-cols-14 gap-3 px-4 py-2 bg-gray-50 text-[10px] uppercase tracking-wider font-bold text-gray-500 min-w-[980px]">
                                <div className="col-span-4">Vendedor</div>
                                <div className="col-span-2 text-right">Meta</div>
                                <div className="col-span-2 text-right">Realizado</div>
                                <div className="col-span-3">Atingimento</div>
                                <div className="col-span-1 text-right">Proj.</div>
                                <div className="col-span-2">Acesso</div>
                            </div>
                            {vendedoresMeta.map((vend) => {
                                const widthBar = vend.meta > 0 ? Math.min(100, vend.pctMeta || 0) : (vend.realizado / maxRealizado) * 100;
                                const acesso = acessoPorVendedorId.get(vend.vendedorId);
                                return (
                                    <div key={vend.vendedorId} className="grid grid-cols-14 gap-3 px-4 py-3 border-t items-center hover:bg-gray-50 min-w-[980px]">
                                        <div className="col-span-4">
                                            <div className="font-semibold text-gray-900 text-sm truncate">{vend.nome}</div>
                                            {vend.totalDias && (
                                                <div className="text-[11px] text-gray-500">{vend.diasDecorridos}/{vend.totalDias} dias úteis</div>
                                            )}
                                        </div>
                                        <div className="col-span-2 text-right text-sm">
                                            {vend.meta > 0 ? fmtBRL(vend.meta) : <span className="text-gray-400 text-xs italic">sem meta</span>}
                                        </div>
                                        <div className="col-span-2 text-right text-sm font-semibold text-gray-900">{fmtBRL(vend.realizado)}</div>
                                        <div className="col-span-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className={`h-full ${corPct(vend.pctMeta)} rounded-full`} style={{ width: `${widthBar}%` }} />
                                                </div>
                                                <span className={`text-xs font-bold w-12 text-right ${corText(vend.pctMeta)}`}>
                                                    {vend.pctMeta != null ? `${vend.pctMeta.toFixed(0)}%` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="col-span-1 text-right text-xs">
                                            {vend.pctProjecao != null ? (
                                                <span className={`font-semibold ${corText(vend.pctProjecao)}`}>{vend.pctProjecao.toFixed(0)}%</span>
                                            ) : '—'}
                                        </div>
                                        <div className="col-span-2 flex items-center gap-1 flex-wrap">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${acesso?.podeAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>Admin</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${acesso?.podeVendas ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>Vendas</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {vendedoresMeta.length === 0 && (
                                <div className="p-6 text-center text-sm text-gray-400">Nenhum vendedor com meta ou venda no mês.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {abaAtiva === 'reuniao' && (
                <div className="space-y-6">
                    <style>{WEEKLY_PRINT_CSS}</style>

                    <div className="bg-white border rounded-xl p-4">
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
                                <div>
                                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Semana de referência</label>
                                    <input
                                        type="date"
                                        value={weeklyBaseDate}
                                        max={hojeISO()}
                                        onChange={(e) => handleTrocaDataSemanal(e.target.value)}
                                        className="mt-1 w-full border rounded px-2 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Vendedor (opcional)</label>
                                    <select
                                        value={weeklyVendedorId}
                                        onChange={(e) => handleTrocaVendedorSemanal(e.target.value)}
                                        className="mt-1 w-full border rounded px-2 py-2 text-sm"
                                    >
                                        <option value="">Todos da equipe</option>
                                        {weeklyVendedores.map((vendedor) => (
                                            <option key={vendedor.id} value={vendedor.id}>{vendedor.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-2 lg:col-span-1">
                                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Período</label>
                                    <div className="mt-1 border rounded px-3 py-2 text-sm bg-gray-50 text-gray-700">
                                        {periodoAtualSemanal
                                            ? `${fmtDateISO(periodoAtualSemanal.inicio)} a ${fmtDateISO(periodoAtualSemanal.janelaFim)}`
                                            : 'Carregando...'}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => window.print()}
                                disabled={!weeklyData || weeklyLoading}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Printer size={16} />
                                Gerar PDF da Reunião
                            </button>
                        </div>
                    </div>

                    {weeklyLoading && (
                        <div className="bg-white border rounded-xl p-8 text-center text-sm text-gray-500">
                            Carregando resumo semanal...
                        </div>
                    )}

                    {!weeklyLoading && weeklyError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
                            {weeklyError}
                        </div>
                    )}

                    {!weeklyLoading && !weeklyError && weeklyData && (
                        <>
                            <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
                                <div className="bg-white border rounded-xl p-4">
                                    <StatPill label="Vendas Líquidas" value={fmtBRL(resumoSemanal.vendasLiquidas)} color="indigo" />
                                </div>
                                <div className="bg-white border rounded-xl p-4">
                                    <StatPill label="Variação" value={fmtPct(resumoSemanal.variacaoPct)} sub="vs semana anterior" color={resumoSemanal.variacaoPct >= 0 ? 'emerald' : 'red'} />
                                </div>
                                <div className="bg-white border rounded-xl p-4">
                                    <StatPill label="Pedidos" value={fmtNum(resumoSemanal.pedidos)} color="blue" />
                                </div>
                                <div className="bg-white border rounded-xl p-4">
                                    <StatPill label="Ticket Médio" value={fmtBRL(resumoSemanal.ticketMedio)} color="gray" />
                                </div>
                                <div className="bg-white border rounded-xl p-4">
                                    <StatPill label="Meta Semanal" value={fmtBRL(resumoSemanal.metaSemanal)} color="amber" />
                                </div>
                                <div className="bg-white border rounded-xl p-4">
                                    <StatPill
                                        label="Atingimento"
                                        value={fmtPct(resumoSemanal.atingimentoPct, false)}
                                        sub={`proj. ${fmtPct(resumoSemanal.projecaoSemanal && resumoSemanal.metaSemanal > 0 ? (resumoSemanal.projecaoSemanal / resumoSemanal.metaSemanal) * 100 : null, false)}`}
                                        color={resumoSemanal.atingimentoPct >= 90 ? 'emerald' : resumoSemanal.atingimentoPct >= 70 ? 'amber' : 'red'}
                                    />
                                </div>
                            </div>

                            <div className="bg-white border rounded-xl overflow-hidden">
                                <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-gray-50 text-[10px] uppercase tracking-wider font-bold text-gray-500">
                                    <div className="col-span-3">Vendedor</div>
                                    <div className="col-span-2 text-right">Meta semana</div>
                                    <div className="col-span-2 text-right">Realizado</div>
                                    <div className="col-span-2 text-right">Proj. semana</div>
                                    <div className="col-span-1 text-right">Δ Anterior</div>
                                    <div className="col-span-1 text-right">Pedidos</div>
                                    <div className="col-span-1 text-right">Semáforo</div>
                                </div>
                                {rankingSemanal.map((linha) => {
                                    const semaforo = semaforoAtingimento(linha.pctAtingimento);
                                    return (
                                        <div key={linha.vendedorId} className="grid grid-cols-12 gap-3 px-4 py-3 border-t items-center text-sm">
                                            <div className="col-span-3 font-semibold text-gray-900 truncate">{linha.nome}</div>
                                            <div className="col-span-2 text-right">{fmtBRL(linha.metaSemanal)}</div>
                                            <div className="col-span-2 text-right font-semibold">{fmtBRL(linha.realizado)}</div>
                                            <div className="col-span-2 text-right">{fmtBRL(linha.projecaoSemanal)}</div>
                                            <div className={`col-span-1 text-right font-semibold ${linha.deltaSemanaAnteriorPct >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {fmtPct(linha.deltaSemanaAnteriorPct)}
                                            </div>
                                            <div className="col-span-1 text-right">{fmtNum(linha.pedidos)}</div>
                                            <div className="col-span-1 text-right">
                                                <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[10px] font-bold ${semaforo.className}`}>
                                                    {semaforo.texto}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {rankingSemanal.length === 0 && (
                                    <div className="p-6 text-center text-sm text-gray-400">Sem dados de vendas para a semana selecionada.</div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                                <div className="bg-white border rounded-xl p-5">
                                    <SectionHeader icon={Package} title="Top Ganhos (Produtos)" />
                                    <div className="space-y-2">
                                        {topProdutosPositivos.map((produto) => (
                                            <div key={produto.produtoId} className="flex items-center justify-between gap-3 py-1 border-b last:border-0">
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-sm text-gray-900 truncate">{produto.nome}</div>
                                                    <div className="text-[11px] text-gray-500">{fmtNum(produto.quantidade)} un</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-bold text-gray-900">{fmtBRL(produto.valorLiquido)}</div>
                                                    <div className={`text-[11px] ${produto.variacaoPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtPct(produto.variacaoPct)}</div>
                                                </div>
                                            </div>
                                        ))}
                                        {topProdutosPositivos.length === 0 && <div className="text-sm text-gray-400">Sem produtos com ganho na semana.</div>}
                                    </div>
                                </div>

                                <div className="bg-white border rounded-xl p-5">
                                    <SectionHeader icon={TrendingDown} title="Top Riscos (Queda)" />
                                    <div className="space-y-2">
                                        {topRiscosSemana.map((produto) => (
                                            <div key={produto.produtoId} className="flex items-center justify-between gap-3 py-1 border-b last:border-0">
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-sm text-gray-900 truncate">{produto.nome}</div>
                                                    <div className="text-[11px] text-gray-500">{fmtBRL(produto.vendasSemanaAnterior)} → {fmtBRL(produto.vendasSemanaAtual)}</div>
                                                </div>
                                                <div className="text-sm font-bold text-red-700">{fmtPct(produto.variacaoPct)}</div>
                                            </div>
                                        ))}
                                        {topRiscosSemana.length === 0 && <div className="text-sm text-gray-400">Sem quedas relevantes na semana.</div>}
                                    </div>
                                </div>

                                <div className="bg-white border rounded-xl p-5">
                                    <SectionHeader icon={AlertTriangle} title="Alertas Críticos" />
                                    <div className="space-y-2 text-sm">
                                        <div className="flex items-center justify-between"><span>Inadimplência</span><strong>{fmtBRLcompact(alertasSemanal.inadimplencia?.total)}</strong></div>
                                        <div className="flex items-center justify-between"><span>Erros ERP</span><strong>{fmtNum(alertasSemanal.errosErp?.total)}</strong></div>
                                        <div className="flex items-center justify-between"><span>Especiais pendentes</span><strong>{fmtNum(alertasSemanal.pedidosEspeciais?.total)}</strong></div>
                                        <div className="flex items-center justify-between"><span>Transferências pendentes</span><strong>{fmtNum(alertasSemanal.transferenciasPendentes?.total)}</strong></div>
                                        <div className="flex items-center justify-between"><span>Pendências abertas</span><strong>{fmtNum(alertasSemanal.pendenciasAbertas?.total)}</strong></div>
                                        <div className="flex items-center justify-between"><span>Caixas a conferir</span><strong>{fmtNum(alertasSemanal.caixasAConferir?.total)}</strong></div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white border rounded-xl p-5">
                                <SectionHeader icon={Crown} title="Top Clientes da Semana" />
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {topClientesSemanal.slice(0, 6).map((cliente) => (
                                        <div key={cliente.clienteId} className="border rounded-lg p-3">
                                            <div className="font-semibold text-sm text-gray-900 truncate">{cliente.nome}</div>
                                            <div className="text-xs text-gray-500 mt-1">{fmtNum(cliente.pedidos)} pedidos</div>
                                            <div className="text-sm font-bold text-amber-700 mt-1">{fmtBRL(cliente.valor)}</div>
                                        </div>
                                    ))}
                                </div>
                                {topClientesSemanal.length === 0 && (
                                    <div className="text-sm text-gray-400">Sem clientes relevantes na semana.</div>
                                )}
                            </div>

                            <div id="weekly-brief-print" className="hidden print:block">
                                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Resumo Semanal — Reunião de Vendas</h1>
                                <p style={{ margin: '6px 0 10px', fontSize: 12, color: '#475569' }}>
                                    Período atual: {periodoAtualSemanal ? `${fmtDateISO(periodoAtualSemanal.inicio)} a ${fmtDateISO(periodoAtualSemanal.janelaFim)}` : '—'} | Semana anterior: {periodoAnteriorSemanal ? `${fmtDateISO(periodoAnteriorSemanal.inicio)} a ${fmtDateISO(periodoAnteriorSemanal.janelaFim)}` : '—'}
                                </p>
                                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#475569' }}>
                                    Gerado em: {fmtDateTime(weeklyData.geradoEm)} | Responsável: {weeklyData.responsavel?.nome || '—'}
                                </p>

                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ border: '1px solid #cbd5e1', padding: 6, fontSize: 11 }}><strong>Vendas líquidas</strong><br />{fmtBRL(resumoSemanal.vendasLiquidas)}</td>
                                            <td style={{ border: '1px solid #cbd5e1', padding: 6, fontSize: 11 }}><strong>Variação</strong><br />{fmtPct(resumoSemanal.variacaoPct)}</td>
                                            <td style={{ border: '1px solid #cbd5e1', padding: 6, fontSize: 11 }}><strong>Pedidos</strong><br />{fmtNum(resumoSemanal.pedidos)}</td>
                                            <td style={{ border: '1px solid #cbd5e1', padding: 6, fontSize: 11 }}><strong>Ticket</strong><br />{fmtBRL(resumoSemanal.ticketMedio)}</td>
                                            <td style={{ border: '1px solid #cbd5e1', padding: 6, fontSize: 11 }}><strong>Meta</strong><br />{fmtBRL(resumoSemanal.metaSemanal)}</td>
                                            <td style={{ border: '1px solid #cbd5e1', padding: 6, fontSize: 11 }}><strong>Atingimento</strong><br />{fmtPct(resumoSemanal.atingimentoPct, false)}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                <h2 style={{ margin: '4px 0', fontSize: 13, fontWeight: 700 }}>Ranking (resumido)</h2>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10, textAlign: 'left' }}>Vendedor</th>
                                            <th style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10, textAlign: 'right' }}>Realizado</th>
                                            <th style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10, textAlign: 'right' }}>% Meta</th>
                                            <th style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10, textAlign: 'right' }}>Δ Anterior</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rankingSemanal.slice(0, 8).map((linha) => (
                                            <tr key={`print-${linha.vendedorId}`}>
                                                <td style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10 }}>{linha.nome}</td>
                                                <td style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10, textAlign: 'right' }}>{fmtBRL(linha.realizado)}</td>
                                                <td style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10, textAlign: 'right' }}>{fmtPct(linha.pctAtingimento, false)}</td>
                                                <td style={{ border: '1px solid #cbd5e1', padding: 5, fontSize: 10, textAlign: 'right' }}>{fmtPct(linha.deltaSemanaAnteriorPct)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700 }}>Top 3 positivos</h3>
                                        {(topProdutosPositivos || []).map((produto) => (
                                            <div key={`print-pos-${produto.produtoId}`} style={{ fontSize: 10, marginBottom: 3 }}>
                                                {produto.nome} — {fmtBRL(produto.valorLiquido)}
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700 }}>Top 3 riscos</h3>
                                        {(topRiscosSemana || []).map((produto) => (
                                            <div key={`print-risk-${produto.produtoId}`} style={{ fontSize: 10, marginBottom: 3 }}>
                                                {produto.nome} — {fmtPct(produto.variacaoPct)}
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700 }}>Alertas</h3>
                                        <div style={{ fontSize: 10, marginBottom: 3 }}>Inadimplência: {fmtBRLcompact(alertasSemanal.inadimplencia?.total)}</div>
                                        <div style={{ fontSize: 10, marginBottom: 3 }}>Erros ERP: {fmtNum(alertasSemanal.errosErp?.total)}</div>
                                        <div style={{ fontSize: 10, marginBottom: 3 }}>Pendências: {fmtNum(alertasSemanal.pendenciasAbertas?.total)}</div>
                                        <div style={{ fontSize: 10, marginBottom: 3 }}>Transferências: {fmtNum(alertasSemanal.transferenciasPendentes?.total)}</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default DashboardAdminSection;
