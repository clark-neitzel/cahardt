import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle, AlertTriangle, CheckSquare, TrendingUp, TrendingDown,
    Lock, Users, ShoppingCart, Package, UserX, Wallet, ArrowDownRight,
    Target, Calendar, Activity
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const fmtBRL = (v) =>
    `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (v) => Number(v || 0).toLocaleString('pt-BR');
const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const COLORS = {
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  badge: 'bg-indigo-500' },
    red:     { bg: 'bg-red-50',     text: 'text-red-600',     badge: 'bg-red-500' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   badge: 'bg-amber-500' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-600',   badge: 'bg-slate-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'bg-emerald-500' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    badge: 'bg-blue-500' },
    orange:  { bg: 'bg-orange-50',  text: 'text-orange-600',  badge: 'bg-orange-500' },
    gray:    { bg: 'bg-gray-50',    text: 'text-gray-600',    badge: 'bg-gray-500' },
};

const Card = ({ icon: Icon, color = 'gray', label, value, sub, to, badge }) => {
    const c = COLORS[color] || COLORS.gray;
    const body = (
        <div className="bg-white border rounded-xl p-4 shadow-sm flex items-start gap-4 relative h-full">
            <div className={`${c.bg} ${c.text} p-3 rounded-lg`}>
                <Icon size={22} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <h4 className="text-lg font-bold text-gray-900 truncate">{value}</h4>
                {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
            </div>
            {badge > 0 && (
                <span className={`absolute -top-2 -right-2 inline-flex h-5 min-w-5 px-1 rounded-full ${c.badge} text-white text-[10px] items-center justify-center font-bold`}>{badge}</span>
            )}
        </div>
    );
    return to ? <Link to={to} className="hover:opacity-90 transition">{body}</Link> : body;
};

const SectionTitle = ({ icon: Icon, children }) => (
    <h3 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-2 mt-6 flex items-center gap-2">
        <Icon size={14} /> {children}
    </h3>
);

const DashboardAdminSection = () => {
    const { user } = useAuth();
    const [d, setD] = useState(null);
    const [loading, setLoading] = useState(true);
    const podeVerVendas = !!user?.permissoes?.admin
        || !!user?.permissoes?.Pode_Ver_Dashboard_Admin
        || !!user?.permissoes?.Pode_Ver_Dashboard_Vendas;

    useEffect(() => {
        api.get('/admin-dashboard')
            .then(res => setD(res.data))
            .catch(err => console.error('Erro admin-dashboard', err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className="animate-pulse grid grid-cols-4 gap-4 my-8">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
        </div>;
    }
    if (!d) return null;

    const v = d.vendas || {};
    const op = d.operacaoDia || {};
    const inad = d.inadimplencia || { total: 0, parcelas: 0 };
    const inativos = d.clientesInativos || { total: 0, top: [] };
    const variacaoCor = v.variacaoMesPct == null ? 'gray' : (v.variacaoMesPct >= 0 ? 'emerald' : 'red');

    return (
        <div className="mb-8">
            <h2 className="text-sm uppercase font-bold text-gray-500 tracking-wider mb-3 flex items-center gap-2">
                <Lock size={16} /> Painel Administrativo
            </h2>

            {/* === OPERACIONAL === */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card icon={CheckSquare} color="indigo" label="Caixas a Conferir" value={fmtNum(d.caixasAConferir)} to="/caixa" badge={d.caixasAConferir} />
                <Card icon={AlertCircle} color="red" label="Falhas / Erros ERP" value={fmtNum(d.pedidosComErro)} to="/pedidos?statusEnvio=ERRO" badge={d.pedidosComErro} />
                <Card icon={AlertTriangle} color="amber" label="Notas Pendentes (Especial)" value={fmtNum(d.pedidosEspeciais)} to="/pedidos?especial=true" />
                <Card icon={Wallet} color="slate" label="Recebido em entregas (hoje)" value={fmtBRL(d.valorEntregueHoje)} />
            </div>

            {podeVerVendas && (
                <>
                    {/* === VENDAS & PROJEÇÃO === */}
                    <SectionTitle icon={TrendingUp}>Vendas & Projeção</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card icon={TrendingUp} color="emerald" label="Vendas (Hoje)" value={fmtBRL(v.hoje)} sub={`${op.pedidosHoje || 0} pedidos`} />
                        <Card icon={Calendar} color="emerald" label="Vendas (Semana)" value={fmtBRL(v.semana)} />
                        <Card icon={Calendar} color="emerald" label={`Vendas Líq. (Mês — dia ${v.diaAtualMes}/${v.diasNoMes})`} value={fmtBRL(v.mes)} sub={`Bruto ${fmtBRL(v.mesBruto)} − Devol. ${fmtBRL(v.devolucaoMes)}`} />
                        <Card icon={Target} color="blue" label="Projeção do mês (linear)" value={fmtBRL(v.projecaoMes)} sub={`Ticket médio ${fmtBRL(v.ticketMedio)} · ${v.qtdPedidosMes} pedidos`} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <Card
                            icon={v.variacaoMesPct >= 0 ? TrendingUp : TrendingDown}
                            color={variacaoCor}
                            label={`vs Mês Anterior (mesmo período: dia 1–${v.diaAtualMes})`}
                            value={fmtPct(v.variacaoMesPct)}
                            sub={`Atual ${fmtBRL(v.mes)} · Anterior ${fmtBRL(v.mesAnteriorMesmoPeriodo)}`}
                        />
                        <Card
                            icon={ArrowDownRight}
                            color={inad.total > 0 ? 'red' : 'gray'}
                            label="Inadimplência (parcelas vencidas)"
                            value={fmtBRL(inad.total)}
                            sub={`${inad.parcelas} parcela(s) em aberto`}
                            to="/financeiro"
                        />
                    </div>
                </>
            )}

            {/* === OPERAÇÃO DO DIA === */}
            <SectionTitle icon={Activity}>Operação do Dia</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <Card icon={Users} color="blue" label="Clientes atendidos" value={fmtNum(op.clientesAtendidos)} sub={`${op.totalAtendimentos} atendimentos`} />
                <Card icon={ShoppingCart} color="emerald" label="Atend. com pedido" value={fmtNum(op.atendimentosComPedido)} />
                <Card icon={ShoppingCart} color="amber" label="Atend. sem pedido" value={fmtNum(op.atendimentosSemPedido)} />
                <Card icon={AlertTriangle} color="orange" label="Transferências pendentes" value={fmtNum(op.transferenciasPendentes)} sub="não finalizadas" />
                <Card icon={ShoppingCart} color="indigo" label="Pedidos lançados hoje" value={fmtNum(op.pedidosHoje)} />
            </div>

            {podeVerVendas && (
                <>
                    {/* === RANKINGS === */}
                    <SectionTitle icon={Package}>Top 10 Produtos (30d, líquido)</SectionTitle>
                    <div className="bg-white border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                                <tr>
                                    <th className="text-left p-2">#</th>
                                    <th className="text-left p-2">Produto</th>
                                    <th className="text-right p-2">Qtd</th>
                                    <th className="text-right p-2">Vendas Líq.</th>
                                    <th className="text-right p-2">Margem</th>
                                    <th className="text-center p-2">Estoque</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(d.topProdutos || []).map((p, i) => (
                                    <tr key={p.produtoId} className="border-t">
                                        <td className="p-2 text-gray-400">{i + 1}</td>
                                        <td className="p-2">
                                            <div className="font-medium text-gray-900">{p.nome}</div>
                                            <div className="text-xs text-gray-500">{p.codigo}</div>
                                        </td>
                                        <td className="p-2 text-right">{fmtNum(p.quantidade)}</td>
                                        <td className="p-2 text-right font-semibold">{fmtBRL(p.valorLiquido)}</td>
                                        <td className="p-2 text-right">
                                            {p.margemPct == null ? '—' : (
                                                <span className={p.margemPct < 15 ? 'text-red-600' : 'text-gray-700'}>
                                                    {fmtPct(p.margemPct)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-2 text-center">
                                            {p.rupturaRisco
                                                ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">RUPTURA</span>
                                                : <span className="text-xs text-gray-500">{fmtNum(p.estoqueDisponivel)}</span>}
                                        </td>
                                    </tr>
                                ))}
                                {(!d.topProdutos || d.topProdutos.length === 0) && (
                                    <tr><td colSpan={6} className="p-4 text-center text-gray-400">Sem vendas nos últimos 30 dias</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <SectionTitle icon={Users}>Top 10 Clientes (30d, líquido)</SectionTitle>
                    <div className="bg-white border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                                <tr>
                                    <th className="text-left p-2">#</th>
                                    <th className="text-left p-2">Cliente</th>
                                    <th className="text-right p-2">Pedidos</th>
                                    <th className="text-right p-2">Total Líq.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(d.topClientes || []).map((c, i) => (
                                    <tr key={c.clienteId} className="border-t">
                                        <td className="p-2 text-gray-400">{i + 1}</td>
                                        <td className="p-2">
                                            <div className="font-medium text-gray-900">{c.nome}</div>
                                            <div className="text-xs text-gray-500">{c.codigo}</div>
                                        </td>
                                        <td className="p-2 text-right">{fmtNum(c.pedidos)}</td>
                                        <td className="p-2 text-right font-semibold">{fmtBRL(c.valor)}</td>
                                    </tr>
                                ))}
                                {(!d.topClientes || d.topClientes.length === 0) && (
                                    <tr><td colSpan={4} className="p-4 text-center text-gray-400">Sem vendas nos últimos 30 dias</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* === RISCOS / OPORTUNIDADES === */}
                    <SectionTitle icon={UserX}>Clientes Inativos ({inativos.total} ativos sem pedido há mais de 45 dias)</SectionTitle>
                    {inativos.top.length === 0 ? (
                        <div className="bg-white border rounded-xl p-4 text-sm text-gray-500">Nenhum cliente inativo no critério.</div>
                    ) : (
                        <div className="bg-white border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                                    <tr>
                                        <th className="text-left p-2">Cliente</th>
                                        <th className="text-left p-2">Código</th>
                                        <th className="text-right p-2">Último pedido</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inativos.top.map(c => (
                                        <tr key={c.clienteId} className="border-t">
                                            <td className="p-2 font-medium text-gray-900">{c.nome}</td>
                                            <td className="p-2 text-gray-500">{c.codigo}</td>
                                            <td className="p-2 text-right">{fmtDate(c.ultimoPedido)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <SectionTitle icon={TrendingDown}>Produtos em Queda (30d vs 30–60d)</SectionTitle>
                    {(!d.produtosEmQueda || d.produtosEmQueda.length === 0) ? (
                        <div className="bg-white border rounded-xl p-4 text-sm text-gray-500">Nenhum produto com queda relevante.</div>
                    ) : (
                        <div className="bg-white border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                                    <tr>
                                        <th className="text-left p-2">Produto</th>
                                        <th className="text-right p-2">Período anterior</th>
                                        <th className="text-right p-2">Atual</th>
                                        <th className="text-right p-2">Variação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.produtosEmQueda.map(p => (
                                        <tr key={p.produtoId} className="border-t">
                                            <td className="p-2 font-medium text-gray-900">{p.nome}</td>
                                            <td className="p-2 text-right">{fmtBRL(p.vendas30dAnterior)}</td>
                                            <td className="p-2 text-right">{fmtBRL(p.vendas30dAtual)}</td>
                                            <td className="p-2 text-right text-red-600 font-semibold">{fmtPct(p.variacaoPct)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DashboardAdminSection;
