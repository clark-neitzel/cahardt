import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import {
    TrendingUp, Calendar, Target, AlertTriangle,
    Map as MapIcon, ShoppingCart, Wallet, CheckCircle2, Users,
    Package, MapPin, Tag, ChevronDown, ChevronUp, ChevronRight, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DashboardAdminSection from './DashboardAdminSection';

dayjs.locale('pt-br');

const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (v) => {
    const n = Number(v);
    if (n >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`;
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
const fmtQtd = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const ProgressBar = ({ percent, size = 'md' }) => {
    let color = 'bg-red-500';
    if (percent >= 100) color = 'bg-green-500';
    else if (percent >= 80) color = 'bg-yellow-400';
    else if (percent >= 50) color = 'bg-blue-500';
    const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
    return (
        <div className={`w-full bg-gray-100 rounded-full ${h} overflow-hidden`}>
            <div className={`${h} rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
    );
};

const PercentBadge = ({ percent }) => {
    let cls = 'bg-red-50 text-red-600';
    if (percent >= 100) cls = 'bg-green-50 text-green-700';
    else if (percent >= 80) cls = 'bg-yellow-50 text-yellow-700';
    else if (percent >= 50) cls = 'bg-blue-50 text-blue-700';
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${cls}`}>{percent.toFixed(0)}%</span>;
};

const StatusProgressBar = ({ current, target, label, hidePercent = false }) => {
    const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    return (
        <div className="mb-4">
            <div className="flex justify-between items-end mb-1">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-sm font-bold text-gray-900">
                    {fmt(current)} <span className="text-xs text-gray-400 font-normal">/ {fmt(target)}</span>
                </span>
            </div>
            <ProgressBar percent={percent} />
            {!hidePercent && <p className="text-xs text-right mt-1 text-gray-400">{percent.toFixed(1)}% atingido</p>}
        </div>
    );
};

// Linha com colunas alinhadas: Nome | Realizado | Meta | Projeção | %
const MetaRow = ({ label, sublabel, realizado, meta, projecao, formatFn, unidade = '' }) => {
    const percent = meta > 0 ? (realizado / meta) * 100 : 0;
    const projPercent = meta > 0 ? (projecao / meta) * 100 : 0;
    const projOk = projecao >= meta;

    return (
        <div className="py-3 border-b border-gray-50 last:border-0">
            <div className="grid items-center gap-x-3" style={{ gridTemplateColumns: '1fr 7rem 7rem 6rem 3rem' }}>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
                    {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
                </div>
                <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{formatFn(realizado)}{unidade}</p>
                    <p className="text-xs text-gray-400">realizado</p>
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-500 tabular-nums">{formatFn(meta)}{unidade}</p>
                    <p className="text-xs text-gray-400">meta</p>
                </div>
                <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${projOk ? 'text-green-600' : 'text-amber-600'}`}>
                        {formatFn(projecao)}{unidade}
                    </p>
                    <p className="text-xs text-gray-400">projeção</p>
                </div>
                <div className="flex justify-end">
                    <PercentBadge percent={percent} />
                </div>
            </div>
            <div className="mt-2 relative">
                <ProgressBar percent={percent} size="sm" />
                {/* marcador de projeção */}
                {projPercent > 0 && projPercent <= 110 && (
                    <div
                        className="absolute top-0 h-1.5 w-0.5 bg-gray-500 opacity-60 rounded"
                        style={{ left: `${Math.min(projPercent, 100)}%` }}
                        title={`Projeção: ${projPercent.toFixed(0)}%`}
                    />
                )}
            </div>
            {projecao > 0 && (
                <p className="text-xs text-right mt-1">
                    {projOk
                        ? <span className="text-green-600 font-medium">✓ No ritmo para bater a meta</span>
                        : <span className="text-amber-600">Projeção {projPercent.toFixed(0)}% da meta</span>
                    }
                </p>
            )}
        </div>
    );
};

// Cabeçalho das colunas
const MetaTableHeader = () => (
    <div className="grid gap-x-3 pb-2 mb-1 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide"
        style={{ gridTemplateColumns: '1fr 7rem 7rem 6rem 3rem' }}>
        <span>Item</span>
        <span className="text-right">Realizado</span>
        <span className="text-right">Meta</span>
        <span className="text-right">Projeção</span>
        <span className="text-right">%</span>
    </div>
);

const ColapsableCard = ({ title, icon: Icon, iconColor, count, extra, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <button type="button" onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 flex-wrap">
                    <Icon size={18} className={iconColor} />
                    <span className="font-bold text-gray-800">{title}</span>
                    {count > 0 && (
                        <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">{count} itens</span>
                    )}
                    {extra}
                </div>
                {open ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
            </button>
            {open && <div className="px-5 pb-5">{children}</div>}
        </div>
    );
};

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const SIGLA_TO_DOW = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6 };

const CidadeDetalheDrawer = ({ cidade: cidadeData, totalDias, diasTrabalhados, onClose }) => {
    if (!cidadeData) return null;
    const { cidade, meta, realizado, proximosDias, mediasPorDiaSemana } = cidadeData;
    const faltam = Math.max(meta - realizado, 0);
    const percent = meta > 0 ? Math.min((realizado / meta) * 100, 100) : 0;
    const projecao = diasTrabalhados > 0 ? (realizado / diasTrabalhados) * totalDias : 0;
    const projOk = projecao >= meta;

    // Remaining visit days from today to end of month, filtered by diasSemana config
    const diasSemanaConfig = cidadeData.diasSemana || [];
    const visitDaysSet = new Set(diasSemanaConfig.map(s => SIGLA_TO_DOW[s]).filter(d => d !== undefined));
    const temDiasConfig = visitDaysSet.size > 0;
    let visitasRestantesMes = 0;
    const proximasVisitas = [];
    const hoje = dayjs();
    const fimMes = hoje.endOf('month');
    let dCursor = hoje;
    while (!dCursor.isAfter(fimMes)) {
        const dow = dCursor.day();
        if (temDiasConfig ? visitDaysSet.has(dow) : (dow >= 1 && dow <= 5)) {
            visitasRestantesMes++;
            if (proximasVisitas.length < 5) proximasVisitas.push(dCursor.format('YYYY-MM-DD'));
        }
        dCursor = dCursor.add(1, 'day');
    }
    const porVisita = visitasRestantesMes > 0 ? faltam / visitasRestantesMes : 0;

    const diasComVenda = (mediasPorDiaSemana || []).filter(d => d.pedidos > 0).sort((a, b) => b.media - a.media);
    const maxMedia = diasComVenda[0]?.media || 1;

    return (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div
                className="relative bg-white w-full max-w-sm h-full overflow-y-auto shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-2">
                        <MapPin size={18} className="text-orange-500" />
                        <h2 className="font-bold text-gray-800 text-lg">{cidade}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-5">
                    {/* Progresso mensal */}
                    <div>
                        <div className="flex items-end justify-between mb-2">
                            <div>
                                <p className="text-2xl font-bold text-gray-800">{fmtK(realizado)}</p>
                                <p className="text-xs text-gray-400">realizados no mês</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-semibold text-gray-600">{fmtK(meta)}</p>
                                <p className="text-xs text-gray-400">meta mensal</p>
                            </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div
                                className={`h-3 rounded-full transition-all ${percent >= 100 ? 'bg-green-500' : percent >= 80 ? 'bg-yellow-400' : percent >= 50 ? 'bg-blue-500' : 'bg-red-400'}`}
                                style={{ width: `${percent}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1.5 text-xs text-gray-400">
                            <span>{percent.toFixed(0)}% atingido</span>
                            {faltam > 0 && <span className="text-orange-600 font-medium">Faltam {fmtK(faltam)}</span>}
                        </div>
                    </div>

                    {/* Projeção */}
                    <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${projOk ? 'bg-green-50' : 'bg-amber-50'}`}>
                        {projOk
                            ? <CheckCircle2 size={20} className="text-green-600 shrink-0" />
                            : <AlertTriangle size={20} className="text-amber-600 shrink-0" />}
                        <div>
                            <p className={`text-sm font-semibold ${projOk ? 'text-green-700' : 'text-amber-700'}`}>
                                Projeção: {fmtK(projecao)}
                            </p>
                            <p className={`text-xs ${projOk ? 'text-green-600' : 'text-amber-600'}`}>
                                {projOk ? 'No ritmo para bater a meta' : 'Abaixo do ritmo necessário'}
                            </p>
                        </div>
                    </div>

                    {/* Para bater a meta */}
                    {faltam > 0 && visitasRestantesMes > 0 && (
                        <div className="bg-blue-50 rounded-xl px-4 py-3">
                            <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide mb-1">Para bater a meta</p>
                            <p className="text-lg font-bold text-blue-700">
                                {fmtK(porVisita)}
                                <span className="text-sm font-normal text-blue-500"> / visita</span>
                            </p>
                            {temDiasConfig ? (
                                <p className="text-xs text-blue-500 mt-0.5">
                                    {visitasRestantesMes} visita{visitasRestantesMes !== 1 ? 's' : ''} restantes ({diasSemanaConfig.join(', ')})
                                </p>
                            ) : (
                                <p className="text-xs text-blue-500 mt-0.5">
                                    {visitasRestantesMes} dia{visitasRestantesMes !== 1 ? 's' : ''} úteis restantes
                                </p>
                            )}
                        </div>
                    )}

                    {/* Próximas visitas */}
                    {proximasVisitas.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                {temDiasConfig ? 'Próximas visitas' : 'Próximos dias na rota'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {proximasVisitas.map(d => (
                                    <span key={d} className="text-xs bg-gray-100 text-gray-700 font-medium px-2.5 py-1 rounded-lg">
                                        {dayjs(d).format('ddd DD/MM')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Dia da semana com mais venda */}
                    {diasComVenda.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Dia da semana com mais venda</p>
                            <div className="space-y-2">
                                {diasComVenda.map(d => (
                                    <div key={d.dia} className="flex items-center gap-3">
                                        <span className="text-xs font-medium text-gray-500 w-8 shrink-0">{NOMES_DIA[d.dia]}</span>
                                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                            <div
                                                className="h-2 bg-orange-400 rounded-full"
                                                style={{ width: `${Math.round((d.media / maxMedia) * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-semibold text-gray-700 tabular-nums w-20 text-right">{fmtK(d.media)}/pedido</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const DashboardVendedor = () => {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [vendedores, setVendedores] = useState([]);
    const [vendedorSelecionado, setVendedorSelecionado] = useState('');
    const [cidadeDetalhe, setCidadeDetalhe] = useState(null);
    const [cidadesHojeAdmin, setCidadesHojeAdmin] = useState([]);
    const [loadingCidadesAdmin, setLoadingCidadesAdmin] = useState(false);
    const [mostrarTodasCidades, setMostrarTodasCidades] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') setCidadeDetalhe(null); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const isAdmin = user?.permissoes?.admin ||
        user?.permissoes?.Pode_Gerenciar_Metas ||
        user?.permissoes?.pedidos?.clientes === 'todos' ||
        user?.login?.toLowerCase().includes('clark') ||
        user?.email === 'clarksonneitzel@gmail.com';

    const podeVerDashboardAdmin = !!user?.permissoes?.admin
        || !!user?.permissoes?.Pode_Ver_Dashboard_Admin
        || user?.login?.toLowerCase().includes('clark')
        || user?.email === 'clarksonneitzel@gmail.com';

    useEffect(() => {
        if (isAdmin) {
            api.get('/vendedores', { params: { ativo: 'true' } }).then(res => {
                setVendedores(Array.isArray(res.data) ? res.data : []);
            }).catch(() => { });
        }
    }, [isAdmin]);

    useEffect(() => {
        if (!podeVerDashboardAdmin || vendedorSelecionado) return;
        setLoadingCidadesAdmin(true);
        api.get('/metas/cidades-hoje-todos').then(res => {
            setCidadesHojeAdmin(Array.isArray(res.data) ? res.data : []);
        }).catch(() => {}).finally(() => setLoadingCidadesAdmin(false));
    }, [podeVerDashboardAdmin, vendedorSelecionado]);

    useEffect(() => {
        const fetchDashboard = async () => {
            setLoading(true);
            try {
                const params = {};
                if (isAdmin && vendedorSelecionado) params.vendedorId = vendedorSelecionado;
                const res = await api.get('/metas/dashboard', { params });
                setData(res.data);
            } catch (error) {
                toast.error("Não foi possível carregar as informações do dashboard.");
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
    }, [vendedorSelecionado]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    const diasTrabalhados = data?.resumoCalendario?.diasTrabalhadosMesAteHoje || 1;
    const totalDias = data?.resumoCalendario?.totalDiasMes || 1;
    const fatorProjecao = totalDias / Math.max(diasTrabalhados, 1);
    const percMesDecorrido = totalDias > 0 ? diasTrabalhados / totalDias : 0;

    const progressoProdutos = (data?.progressoProdutos || []).map(p => ({
        ...p,
        projecao: Math.round(p.realizado * fatorProjecao * 100) / 100
    }));

    const todasCidades = (data?.progressoCidades || []).map(c => ({
        ...c,
        projecao: Math.round(c.realizado * fatorProjecao)
    }));

    // Filtra para cidades do dia (exceto quando admin visualizando outro vendedor)
    const cidadesDeHoje = data?.cidadesDeHoje || [];
    const mostrarSoCidadesDeHoje = !vendedorSelecionado && cidadesDeHoje.length > 0 && !mostrarTodasCidades;
    const progressoCidades = mostrarSoCidadesDeHoje
        ? todasCidades.filter(c => cidadesDeHoje.includes(c.cidade))
        : todasCidades;

    const progressoPromocoes = data?.progressoPromocoes || [];

    const nomeVendedor = vendedorSelecionado
        ? vendedores.find(v => v.id === vendedorSelecionado)?.nome || ''
        : user?.nome?.split(' ')[0];

    return (
        <div className="max-w-4xl mx-auto py-6 px-4">
            {/* Cabeçalho */}
            <div className="mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">
                            Olá, {user?.nome?.split(' ')[0]}!
                        </h1>
                        <p className="text-gray-500 text-sm mt-0.5">
                            {vendedorSelecionado
                                ? `Vendo dashboard de ${nomeVendedor} — ${dayjs().format('MMMM/YYYY')}`
                                : `Acompanhe seu desempenho e metas de ${dayjs().format('MMMM/YYYY')}.`}
                        </p>
                    </div>
                    {isAdmin && vendedores.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Users size={18} className="text-gray-400" />
                            <select
                                value={vendedorSelecionado}
                                onChange={(e) => setVendedorSelecionado(e.target.value)}
                                className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Meu Dashboard</option>
                                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Painel Admin — só mostra quando não está visualizando um vendedor específico */}
            {podeVerDashboardAdmin && !vendedorSelecionado && <DashboardAdminSection />}

            {/* Cidades de hoje — admin view */}
            {podeVerDashboardAdmin && !vendedorSelecionado && (cidadesHojeAdmin.length > 0 || loadingCidadesAdmin) && (
                <div className="mb-6">
                    <h2 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3 flex items-center gap-2">
                        <MapPin size={13} className="text-orange-500" /> Cidades de hoje
                    </h2>
                    {loadingCidadesAdmin ? (
                        <div className="bg-white rounded-xl border p-4 text-center text-gray-400 text-sm">Carregando...</div>
                    ) : (
                        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            {cidadesHojeAdmin.map((c, idx) => {
                                const pctSem = c.totalMetaSemana > 0 ? Math.min((c.totalVendidoSemana / c.totalMetaSemana) * 100, 100) : 0;
                                const pctMes = c.totalMetaMensal > 0 ? Math.min((c.totalVendidoMes / c.totalMetaMensal) * 100, 100) : 0;
                                const superouSem = c.totalVendidoSemana >= c.totalMetaSemana;
                                return (
                                    <div key={c.cidade} className={`px-5 py-3.5 ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-sm font-semibold text-gray-800 flex-1">{c.cidade}</span>
                                            <div className="text-right shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400">sem</span>
                                                    <span className={`text-xs font-bold tabular-nums ${superouSem ? 'text-green-600' : 'text-amber-600'}`}>{pctSem.toFixed(0)}%</span>
                                                    <span className="text-xs text-gray-500 tabular-nums">{fmtK(c.totalVendidoSemana)} / {fmtK(c.totalMetaSemana)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 justify-end mt-0.5">
                                                    <span className="text-xs text-gray-400">mês</span>
                                                    <span className="text-xs font-semibold tabular-nums text-gray-500">{pctMes.toFixed(0)}%</span>
                                                    <span className="text-xs text-gray-400 tabular-nums">{fmtK(c.totalVendidoMes)} / {fmtK(c.totalMetaMensal)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {c.totalVendidoHoje > 0 && (
                                            <p className="text-xs text-gray-400 mb-1">hoje: {fmtK(c.totalVendidoHoje)}</p>
                                        )}
                                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden mb-2">
                                            <div
                                                className={`h-1.5 rounded-full ${superouSem ? 'bg-green-500' : pctSem >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                                style={{ width: `${pctSem}%` }}
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {c.vendedores.map(v => {
                                                const vPctSem = v.metaSemana > 0 ? Math.min((v.vendidoSemana / v.metaSemana) * 100, 100) : 0;
                                                const vPctMes = v.metaMensal > 0 ? Math.min((v.vendidoMes / v.metaMensal) * 100, 100) : 0;
                                                const vOk = v.vendidoSemana >= v.metaSemana;
                                                return (
                                                    <button
                                                        key={v.vendedorId}
                                                        type="button"
                                                        onClick={() => setVendedorSelecionado(v.vendedorId)}
                                                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors hover:shadow-sm ${vOk ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700'}`}
                                                        title={`Semana: ${vPctSem.toFixed(0)}% | Mês: ${vPctMes.toFixed(0)}%`}
                                                    >
                                                        {vOk ? '✅' : '⚡'} {v.nome.split(' ')[0]}
                                                        <span className="tabular-nums opacity-70">{vPctSem.toFixed(0)}%</span>
                                                        <span className="tabular-nums opacity-40 text-xs">{vPctMes.toFixed(0)}%m</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Painel de Metas */}
            <h2 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Painel de Metas</h2>

            {!data?.temMeta ? (
                <div className="bg-white rounded-xl border p-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <Target size={32} className="text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-700 mb-1">Sem metas para este mês</h3>
                    <p className="text-gray-400 text-sm">
                        {vendedorSelecionado
                            ? `Nenhuma meta definida para ${nomeVendedor} em ${dayjs().format('MMMM/YYYY')}.`
                            : 'O administrador ainda não configurou as suas metas para o mês atual.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">

                    {/* Hero: Média diária */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-blue-200 text-sm font-medium mb-1">Média Diária de Vendas Atual</p>
                                <h2 className="text-3xl font-bold">{fmt(data.realizado.mediaDiariaAtual)}</h2>
                                <p className="text-sm text-blue-200 mt-2 flex items-center gap-1">
                                    <Calendar size={13} /> Baseado em {diasTrabalhados} de {totalDias} dias trabalhados
                                </p>
                            </div>
                            <TrendingUp size={44} className="text-white/20 hidden sm:block" />
                        </div>
                    </div>

                    {/* Progresso por Cidade — logo abaixo do hero */}
                    {todasCidades.length > 0 && (() => {
                        const noRitmo = mostrarSoCidadesDeHoje
                            ? progressoCidades.filter(c => (c.metaSemana > 0 ? c.realizadoSemana >= c.metaSemana : c.projecao >= c.meta)).length
                            : progressoCidades.filter(c => c.projecao >= c.meta).length;
                        const atrasadas = progressoCidades.length - noRitmo;
                        const titulo = mostrarSoCidadesDeHoje
                            ? `Cidades de Hoje (${progressoCidades.length})`
                            : `Meta por Cidade`;

                        return (
                            <ColapsableCard
                                title={titulo}
                                icon={MapPin}
                                iconColor="text-orange-500"
                                count={mostrarSoCidadesDeHoje ? 0 : progressoCidades.length}
                                extra={mostrarSoCidadesDeHoje ? (
                                    <div className="flex gap-2">
                                        {noRitmo > 0 && <span className="text-xs bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded-full">🟢 {noRitmo} no ritmo</span>}
                                        {atrasadas > 0 && <span className="text-xs bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded-full">🔴 {atrasadas} atrasada{atrasadas !== 1 ? 's' : ''}</span>}
                                    </div>
                                ) : null}
                            >
                                {progressoCidades.length === 0 ? (
                                    <p className="text-sm text-gray-400 py-2">Nenhuma cidade com meta configurada para hoje.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {progressoCidades.slice().sort((a, b) =>
                                            mostrarSoCidadesDeHoje ? b.metaSemana - a.metaSemana : b.meta - a.meta
                                        ).map(c => {
                                            const usarSemana = mostrarSoCidadesDeHoje && c.metaSemana > 0;
                                            const valorRef = usarSemana ? c.realizadoSemana : c.realizado;
                                            const metaRef = usarSemana ? c.metaSemana : c.meta;
                                            const pct = metaRef > 0 ? Math.min((valorRef / metaRef) * 100, 100) : 0;
                                            const onRitmo = usarSemana ? valorRef >= metaRef : c.projecao >= c.meta;
                                            return (
                                                <button
                                                    key={c.cidade}
                                                    type="button"
                                                    onClick={() => setCidadeDetalhe(c)}
                                                    className="w-full text-left py-3 border-b border-gray-50 last:border-0 hover:bg-orange-50 -mx-5 px-5 transition-colors rounded"
                                                >
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{c.cidade}</span>
                                                        <span className={`text-xs font-bold tabular-nums ${onRitmo ? 'text-green-600' : 'text-amber-600'}`}>{pct.toFixed(0)}%</span>
                                                        <ChevronRight size={14} className="text-gray-300 shrink-0" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                            <div
                                                                className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 80 ? 'bg-yellow-400' : pct >= 50 ? 'bg-blue-400' : 'bg-red-400'}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-gray-400 tabular-nums shrink-0">
                                                            {fmtK(valorRef)} / {fmtK(metaRef)}
                                                            {usarSemana && <span className="ml-1 opacity-60">sem</span>}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {!vendedorSelecionado && cidadesDeHoje.length > 0 && (
                                    mostrarTodasCidades ? (
                                        <button
                                            type="button"
                                            onClick={() => setMostrarTodasCidades(false)}
                                            className="mt-3 text-xs text-gray-400 hover:text-orange-600 hover:underline"
                                        >
                                            ← Ver só as cidades de hoje ({cidadesDeHoje.length})
                                        </button>
                                    ) : todasCidades.length > progressoCidades.length ? (
                                        <button
                                            type="button"
                                            onClick={() => setMostrarTodasCidades(true)}
                                            className="mt-3 text-xs text-orange-600 hover:underline"
                                        >
                                            Ver todas as {todasCidades.length} cidades →
                                        </button>
                                    ) : null
                                )}
                            </ColapsableCard>
                        );
                    })()}

                    {/* Mensal + Semanal */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <Target className="text-blue-500" size={18} />
                                <h3 className="font-bold text-gray-800">Objetivo Mensal</h3>
                            </div>
                            <StatusProgressBar label="Acumulado no Mês" current={data.realizado.totalVendidoMes} target={data.metasAlvo.mensal} />
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-xs text-gray-400 mb-1">PROJEÇÃO FINAL DO MÊS:</p>
                                <div className="flex items-center justify-between">
                                    <span className={`font-bold text-lg ${data.projecoes.mensal >= data.metasAlvo.mensal ? 'text-green-600' : 'text-amber-600'}`}>
                                        {fmt(data.projecoes.mensal)}
                                    </span>
                                    {data.projecoes.mensal >= data.metasAlvo.mensal
                                        ? <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full flex gap-1 items-center"><CheckCircle2 size={12} /> No Ritmo</span>
                                        : <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full flex gap-1 items-center"><AlertTriangle size={12} /> Acelere</span>
                                    }
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border p-5 shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <Calendar className="text-indigo-500" size={18} />
                                    <h3 className="font-bold text-gray-800">Corte da Semana</h3>
                                </div>
                                <StatusProgressBar label="Acumulado na Semana" current={data.realizado.totalVendidoSemana} target={data.metasAlvo.semanal} />
                                <div className="mt-3">
                                    <p className="text-xs text-gray-400 mb-1">PROJEÇÃO DA SEMANA:</p>
                                    <span className="font-bold text-gray-700">{fmt(data.projecoes.semanal)}</span>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2.5">
                                    <span className="text-sm font-medium text-gray-600">Meta Padrão do Dia</span>
                                    <span className="font-bold text-gray-800">{fmt(data.metasAlvo.diaria)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Flex */}
                    {data.metasAlvo.flexMensal > 0 && (
                        <div className="bg-white rounded-xl border p-5 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-4">Orçamento de Flex (Descontos)</h3>
                            <StatusProgressBar label="Flex Utilizado" current={data.realizado.flexUtilizadoMes} target={data.metasAlvo.flexMensal} />
                            <p className="text-xs text-gray-400">
                                Saldo restante: <span className="font-semibold text-gray-700">{fmt(data.metasAlvo.flexMensal - data.realizado.flexUtilizadoMes)}</span>
                            </p>
                        </div>
                    )}

                    {/* Progresso por Produto */}
                    {progressoProdutos.length > 0 && (
                        <ColapsableCard title="Meta por Produto" icon={Package} iconColor="text-green-600" count={progressoProdutos.length}>
                            <MetaTableHeader />
                            {progressoProdutos.map(p => (
                                <MetaRow
                                    key={p.produtoId}
                                    label={p.nome}
                                    sublabel={p.codigo}
                                    realizado={p.realizado}
                                    meta={p.meta}
                                    projecao={p.projecao}
                                    formatFn={fmtQtd}
                                    unidade=" un"
                                />
                            ))}
                        </ColapsableCard>
                    )}

                    {/* Promoções */}
                    {progressoPromocoes.length > 0 && (
                        <ColapsableCard title="Meta de Promoções" icon={Tag} iconColor="text-purple-600" count={progressoPromocoes.length} defaultOpen={false}>
                            <div className="space-y-2">
                                {progressoPromocoes.map(p => (
                                    <div key={p.promocaoId} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                                        <span className="text-sm text-gray-700">{p.nome}</span>
                                        <span className="text-sm font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                                            Meta: {p.meta} pedidos
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </ColapsableCard>
                    )}

                </div>
            )}

            {/* Atalhos — no final da página */}
            <h2 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3 mt-8">Ações Rápidas</h2>
            <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                    { to: '/rota', icon: MapIcon, label: 'Rotas e Leads', bg: 'bg-blue-50', color: 'text-blue-600', hover: 'hover:border-blue-400' },
                    { to: '/pedidos', icon: ShoppingCart, label: 'Pedidos', bg: 'bg-green-50', color: 'text-green-600', hover: 'hover:border-green-400' },
                    { to: '/caixa', icon: Wallet, label: 'Caixa Diário', bg: 'bg-amber-50', color: 'text-amber-600', hover: 'hover:border-amber-400' },
                ].map(({ to, icon: Icon, label, bg, color, hover }) => (
                    <Link key={to} to={to} className={`bg-white border ${hover} hover:shadow-sm transition-all rounded-xl p-4 flex flex-col items-center gap-2`}>
                        <div className={`${bg} ${color} p-3 rounded-full`}><Icon size={22} /></div>
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                    </Link>
                ))}
            </div>

            {cidadeDetalhe && (
                <CidadeDetalheDrawer
                    cidade={cidadeDetalhe}
                    totalDias={totalDias}
                    diasTrabalhados={diasTrabalhados}
                    onClose={() => setCidadeDetalhe(null)}
                />
            )}
        </div>
    );
};

export default DashboardVendedor;
