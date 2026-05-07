import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import {
    TrendingUp, Calendar, Target, AlertTriangle,
    Map as MapIcon, ShoppingCart, Wallet, CheckCircle2, Users,
    Package, MapPin, Tag, ChevronDown, ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DashboardAdminSection from './DashboardAdminSection';

dayjs.locale('pt-br');

const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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

const StatusProgressBar = ({ current, target, label, suffix = '', hidePercent = false, formatFn = fmt }) => {
    const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    return (
        <div className="mb-4">
            <div className="flex justify-between items-end mb-1">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-sm font-bold text-gray-900">
                    {formatFn(current)} <span className="text-xs text-gray-400 font-normal">/ {formatFn(target)} {suffix}</span>
                </span>
            </div>
            <ProgressBar percent={percent} />
            {!hidePercent && <p className="text-xs text-right mt-1 text-gray-400">{percent.toFixed(1)}% atingido</p>}
        </div>
    );
};

// Linha individual de produto/cidade com barra compacta
const MetaRow = ({ label, sublabel, realizado, meta, formatFn = fmtInt, unidade = '' }) => {
    const percent = meta > 0 ? (realizado / meta) * 100 : 0;
    let statusColor = 'text-red-600 bg-red-50';
    if (percent >= 100) statusColor = 'text-green-700 bg-green-50';
    else if (percent >= 80) statusColor = 'text-yellow-700 bg-yellow-50';
    else if (percent >= 50) statusColor = 'text-blue-700 bg-blue-50';

    return (
        <div className="py-3 border-b border-gray-50 last:border-0">
            <div className="flex items-center justify-between mb-1.5">
                <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-800 truncate block">{label}</span>
                    {sublabel && <span className="text-xs text-gray-400">{sublabel}</span>}
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className="text-sm text-gray-600">
                        {formatFn(realizado)}{unidade} <span className="text-gray-400">/ {formatFn(meta)}{unidade}</span>
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                        {percent.toFixed(0)}%
                    </span>
                </div>
            </div>
            <ProgressBar percent={percent} size="sm" />
        </div>
    );
};

const ColapsableCard = ({ title, icon: Icon, iconColor, count, children, defaultOpen = false }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Icon size={18} className={iconColor} />
                    <span className="font-bold text-gray-800">{title}</span>
                    {count > 0 && (
                        <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">{count} itens</span>
                    )}
                </div>
                {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {open && <div className="px-5 pb-4">{children}</div>}
        </div>
    );
};

const DashboardVendedor = () => {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [vendedores, setVendedores] = useState([]);
    const [vendedorSelecionado, setVendedorSelecionado] = useState('');

    const isAdmin = user?.permissoes?.admin ||
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

    const progressoProdutos = data?.progressoProdutos || [];
    const progressoCidades = data?.progressoCidades || [];
    const progressoPromocoes = data?.progressoPromocoes || [];

    return (
        <div className="max-w-4xl mx-auto py-6 px-4">
            {/* Cabeçalho */}
            <div className="mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Olá, {user?.nome?.split(' ')[0]}!</h1>
                        <p className="text-gray-500 text-sm mt-0.5">
                            Acompanhe {isAdmin && vendedorSelecionado ? 'o desempenho' : 'seu desempenho'} e metas de {dayjs().format('MMMM/YYYY')}.
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

            {podeVerDashboardAdmin && <DashboardAdminSection />}

            {/* Atalhos */}
            <h2 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Ações Rápidas</h2>
            <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                    { to: '/rota', icon: MapIcon, label: 'Rotas e Leads', bg: 'bg-blue-50', color: 'text-blue-600', hover: 'hover:border-blue-400' },
                    { to: '/pedidos', icon: ShoppingCart, label: 'Pedidos', bg: 'bg-green-50', color: 'text-green-600', hover: 'hover:border-green-400' },
                    { to: '/caixa', icon: Wallet, label: 'Caixa Diário', bg: 'bg-amber-50', color: 'text-amber-600', hover: 'hover:border-amber-400' },
                ].map(({ to, icon: Icon, label, bg, color, hover }) => (
                    <Link key={to} to={to} className={`bg-white border ${hover} hover:shadow-sm transition-all rounded-xl p-4 flex flex-col items-center gap-2 group`}>
                        <div className={`${bg} ${color} p-3 rounded-full`}><Icon size={22} /></div>
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                    </Link>
                ))}
            </div>

            {/* Painel de Metas */}
            <h2 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Painel de Metas</h2>

            {!data?.temMeta ? (
                <div className="bg-white rounded-xl border p-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <Target size={32} className="text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-700 mb-1">Sem metas para este mês</h3>
                    <p className="text-gray-400 text-sm">O administrador ainda não configurou as suas metas para o mês atual.</p>
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
                                    <Calendar size={13} /> Baseado em {data.resumoCalendario.diasTrabalhadosMesAteHoje} dias trabalhados
                                </p>
                            </div>
                            <TrendingUp size={44} className="text-white/20 hidden sm:block" />
                        </div>
                    </div>

                    {/* Objetivo Mensal + Semana */}
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
                                <div className="flex justify-between items-center bg-gray-50 rounded-lg p-2.5">
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
                        <ColapsableCard
                            title="Meta por Produto"
                            icon={Package}
                            iconColor="text-green-600"
                            count={progressoProdutos.length}
                            defaultOpen={true}
                        >
                            <div>
                                {progressoProdutos.map(p => (
                                    <MetaRow
                                        key={p.produtoId}
                                        label={p.nome}
                                        sublabel={p.codigo}
                                        realizado={p.realizado}
                                        meta={p.meta}
                                        formatFn={fmtInt}
                                        unidade=" un"
                                    />
                                ))}
                            </div>
                        </ColapsableCard>
                    )}

                    {/* Progresso por Cidade */}
                    {progressoCidades.length > 0 && (
                        <ColapsableCard
                            title="Meta por Cidade"
                            icon={MapPin}
                            iconColor="text-orange-500"
                            count={progressoCidades.length}
                            defaultOpen={true}
                        >
                            <div>
                                {progressoCidades
                                    .slice()
                                    .sort((a, b) => b.meta - a.meta)
                                    .map(c => (
                                        <MetaRow
                                            key={c.cidade}
                                            label={c.cidade}
                                            realizado={c.realizado}
                                            meta={c.meta}
                                            formatFn={(v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                                        />
                                    ))}
                            </div>
                        </ColapsableCard>
                    )}

                    {/* Promoções (só meta, sem progresso ainda) */}
                    {progressoPromocoes.length > 0 && (
                        <ColapsableCard
                            title="Meta de Promoções"
                            icon={Tag}
                            iconColor="text-purple-600"
                            count={progressoPromocoes.length}
                            defaultOpen={false}
                        >
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
        </div>
    );
};

export default DashboardVendedor;
