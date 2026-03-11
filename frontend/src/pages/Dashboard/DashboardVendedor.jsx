import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    TrendingUp, Calendar, Target, AlertTriangle,
    Map as MapIcon, ShoppingCart, Wallet, CheckCircle2, Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DashboardAdminSection from './DashboardAdminSection';

const DashboardVendedor = () => {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [vendedores, setVendedores] = useState([]);
    const [vendedorSelecionado, setVendedorSelecionado] = useState('');

    const isAdmin = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';

    useEffect(() => {
        if (isAdmin) {
            api.get('/vendedores').then(res => {
                setVendedores(Array.isArray(res.data) ? res.data : []);
            }).catch(() => { });
        }
    }, [isAdmin]);

    useEffect(() => {
        const fetchDashboard = async () => {
            setLoading(true);
            try {
                const params = {};
                if (isAdmin && vendedorSelecionado) {
                    params.vendedorId = vendedorSelecionado;
                }
                const res = await api.get('/metas/dashboard', { params });
                setData(res.data);
            } catch (error) {
                console.error("Erro ao carregar metas", error);
                toast.error("Não foi possível carregar as informações do dashboard.");
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
    }, [vendedorSelecionado]);

    const formatCurrency = (value) => {
        return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const StatusProgressBar = ({ current, target, label, suffix = '', hidePercent = false }) => {
        const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
        let colorClass = "bg-blue-600";
        if (percent >= 100) colorClass = "bg-green-500";
        else if (percent >= 80) colorClass = "bg-yellow-400";
        else if (percent < 50) colorClass = "bg-red-500";

        return (
            <div className="mb-4">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                    <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(current)} <span className="text-xs text-gray-500 font-normal">/ {formatCurrency(target)} {suffix}</span>
                    </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full ${colorClass}`} style={{ width: `${percent}%` }}></div>
                </div>
                {!hidePercent && (
                    <p className="text-xs text-right mt-1 text-gray-500">{percent.toFixed(1)}% atingido</p>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-6 px-4">
            {/* Cabecalho e Saudacao */}
            <div className="mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Olá, {user?.nome?.split(' ')[0]}!</h1>
                        <p className="text-gray-600">Acompanhe {isAdmin && vendedorSelecionado ? 'o desempenho' : 'seu desempenho'} e metas de {dayjs().format('MMMM/YYYY')}.</p>
                    </div>
                    {isAdmin && vendedores.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Users size={18} className="text-gray-500" />
                            <select
                                value={vendedorSelecionado}
                                onChange={(e) => setVendedorSelecionado(e.target.value)}
                                className="border p-2 rounded shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">Meu Dashboard</option>
                                {vendedores.map(v => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Seção Administrador */}
            {isAdmin && <DashboardAdminSection />}

            {/* Atalhos Rápidos */}
            <h2 className="text-sm uppercase font-bold text-gray-500 tracking-wider mb-3">Ações Rápidas</h2>
            <div className="grid grid-cols-3 gap-3 mb-8">
                <Link to="/rota" className="bg-white border hover:border-blue-500 hover:shadow-md transition-all rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center group">
                    <div className="bg-blue-50 text-blue-600 p-3 rounded-full group-hover:bg-blue-100">
                        <MapIcon size={24} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Rotas e Leads</span>
                </Link>

                <Link to="/pedidos" className="bg-white border hover:border-green-500 hover:shadow-md transition-all rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center group">
                    <div className="bg-green-50 text-green-600 p-3 rounded-full group-hover:bg-green-100">
                        <ShoppingCart size={24} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Pedidos</span>
                </Link>

                <Link to="/caixa" className="bg-white border hover:border-amber-500 hover:shadow-md transition-all rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center group">
                    <div className="bg-amber-50 text-amber-600 p-3 rounded-full group-hover:bg-amber-100">
                        <Wallet size={24} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Caixa Diário</span>
                </Link>
            </div>

            {/* Area de Metas Inteligentes */}
            <h2 className="text-sm uppercase font-bold text-gray-500 tracking-wider mb-3">Painel de Metas</h2>

            {!data?.temMeta ? (
                <div className="bg-white rounded-xl border p-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <Target size={32} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">Sem metas para este mês</h3>
                    <p className="text-gray-500">O administrador ainda não configurou as suas metas para o mês atual.</p>
                </div>
            ) : (
                <div className="space-y-4">

                    {/* Resumo da Media */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <p className="text-blue-100 text-sm font-medium mb-1">Média Diária de Vendas Atual</p>
                                <h2 className="text-3xl font-bold">{formatCurrency(data.realizado.mediaDiariaAtual)}</h2>
                                <p className="text-sm text-blue-100 mt-2 flex items-center gap-1">
                                    <Calendar size={14} /> Baseado em {data.resumoCalendario.diasTrabalhadosMesAteHoje} dias trabalhados
                                </p>
                            </div>
                            <div className="hidden sm:block">
                                <TrendingUp size={48} className="text-white/20" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Meta do Mes */}
                        <div className="bg-white rounded-xl border p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <Target className="text-blue-500" size={20} />
                                <h3 className="font-bold text-gray-800">Objetivo Mensal</h3>
                            </div>

                            <StatusProgressBar
                                label="Acumulado no Mês"
                                current={data.realizado.totalVendidoMes}
                                target={data.metasAlvo.mensal}
                            />

                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-xs text-gray-500 mb-1">PROJEÇÃO FINAL DO MÊS:</p>
                                <div className="flex items-center justify-between">
                                    <span className={`font-bold ${data.projecoes.mensal >= data.metasAlvo.mensal ? 'text-green-600' : 'text-amber-600'}`}>
                                        {formatCurrency(data.projecoes.mensal)}
                                    </span>
                                    {data.projecoes.mensal >= data.metasAlvo.mensal ?
                                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded flex gap-1 items-center"><CheckCircle2 size={12} /> No Ritmo</span> :
                                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded flex gap-1 items-center"><AlertTriangle size={12} /> Acelere</span>
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Meta da Semana e Dia */}
                        <div className="bg-white rounded-xl border p-5 shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <Calendar className="text-indigo-500" size={20} />
                                    <h3 className="font-bold text-gray-800">Corte da Semana</h3>
                                </div>
                                <StatusProgressBar
                                    label="Acumulado na Semana"
                                    current={data.realizado.totalVendidoSemana}
                                    target={data.metasAlvo.semanal}
                                />

                                <div className="mt-3">
                                    <p className="text-xs text-gray-500 mb-1">PROJEÇÃO DA SEMANA:</p>
                                    <span className="font-bold text-gray-700">{formatCurrency(data.projecoes.semanal)}</span>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex justify-between items-center bg-gray-50 rounded p-2">
                                    <span className="text-sm font-medium text-gray-600">Meta Padrão do Dia</span>
                                    <span className="font-bold text-gray-800">{formatCurrency(data.metasAlvo.diaria)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Flex Mensal */}
                        {data.metasAlvo.flexMensal > 0 && (
                            <div className="bg-white rounded-xl border p-5 shadow-sm md:col-span-2">
                                <h3 className="font-bold text-gray-800 mb-4">Orçamento de Flex (Descontos)</h3>
                                <StatusProgressBar
                                    label="Flex Utilizado"
                                    current={data.realizado.flexUtilizadoMes}
                                    target={data.metasAlvo.flexMensal}
                                    hidePercent={false}
                                />
                                <p className="text-xs text-gray-500">Saldo restante: <span className="font-medium text-gray-700">{formatCurrency(data.metasAlvo.flexMensal - data.realizado.flexUtilizadoMes)}</span></p>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardVendedor;
