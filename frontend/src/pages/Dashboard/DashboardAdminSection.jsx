import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle, AlertTriangle, CheckSquare, TrendingUp, TrendingDown,
    Lock, Users, ShoppingCart, Package, UserX, Wallet, ArrowDownRight,
    Target, Activity, ArrowUpRight, Crown, Zap, Flame
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
const fmtPct = (v, signed = true) => v == null ? '—' : `${signed && v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const diasSem = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;

const SectionTitle = ({ icon: Icon, children, right }) => (
    <div className="flex items-center justify-between mb-3 mt-8">
        <h3 className="text-xs uppercase font-bold text-gray-500 tracking-wider flex items-center gap-2">
            <Icon size={14} /> {children}
        </h3>
        {right}
    </div>
);

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

const AlertaPill = ({ icon: Icon, label, value, sub, tone, to }) => {
    const tones = {
        red: 'border-red-300 bg-red-50 text-red-700',
        amber: 'border-amber-300 bg-amber-50 text-amber-700',
        gray: 'border-gray-200 bg-white text-gray-500',
        emerald: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    };
    const body = (
        <div className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${tones[tone]} h-full`}>
            <Icon size={20} className="shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-wider font-bold opacity-80">{label}</div>
                <div className="font-bold text-lg truncate">{value}</div>
                {sub && <div className="text-[11px] opacity-70 truncate">{sub}</div>}
            </div>
        </div>
    );
    return to ? <Link to={to} className="block">{body}</Link> : body;
};

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
        return (
            <div className="animate-pulse my-8 space-y-4">
                <div className="h-48 bg-gray-200 rounded-2xl" />
                <div className="grid grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
                </div>
            </div>
        );
    }
    if (!d) return null;

    const v = d.vendas || {};
    const op = d.operacaoDia || {};
    const inad = d.inadimplencia || { total: 0, parcelas: 0 };
    const inativos = d.clientesInativos || { total: 0, top: [] };
    const rupturaCount = (d.topProdutos || []).filter(p => p.rupturaRisco).length;

    const variacaoUp = (v.variacaoMesPct || 0) >= 0;
    const VarIcon = variacaoUp ? ArrowUpRight : ArrowDownRight;

    const pctMesDecorrido = v.diasNoMes ? (v.diaAtualMes / v.diasNoMes) * 100 : 0;
    const pctRealizadoVsProj = v.projecaoMes > 0 ? (v.mes / v.projecaoMes) * 100 : 0;

    const maxProd = (d.topProdutos?.[0]?.valorLiquido) || 1;
    const maxCli = (d.topClientes?.[0]?.valor) || 1;

    return (
        <div className="mb-8">
            <h2 className="text-sm uppercase font-bold text-gray-500 tracking-wider mb-4 flex items-center gap-2">
                <Lock size={16} /> Painel Administrativo
            </h2>

            {/* ═══════════ HERO: VENDAS DO MÊS ═══════════ */}
            {podeVerVendas && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white p-6 lg:p-8 shadow-xl mb-6">
                    <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
                    <div className="absolute -left-10 -bottom-10 w-60 h-60 rounded-full bg-emerald-500/10 blur-3xl" />

                    <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Bloco principal - Vendas Líquidas */}
                        <div className="lg:col-span-2">
                            <div className="text-[11px] uppercase tracking-widest font-bold text-emerald-300/80 mb-1">
                                Vendas Líquidas · Mês
                            </div>
                            <div className="flex items-baseline gap-3 flex-wrap">
                                <h3 className="text-4xl lg:text-5xl font-black tracking-tight">{fmtBRL(v.mes)}</h3>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${variacaoUp ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                    <VarIcon size={16} />
                                    {fmtPct(v.variacaoMesPct)}
                                </span>
                            </div>
                            <div className="text-sm text-slate-300 mt-1">
                                vs mesmo período do mês passado: <span className="text-slate-100 font-semibold">{fmtBRL(v.mesAnteriorMesmoPeriodo)}</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                                Bruto {fmtBRL(v.mesBruto)} − Devoluções {fmtBRL(v.devolucaoMes)} · {v.qtdPedidosMes} pedidos · ticket {fmtBRL(v.ticketMedio)}
                            </div>

                            {/* Barras de progresso */}
                            <div className="mt-6 space-y-3">
                                <div>
                                    <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                                        <span>Mês decorrido — dia {v.diaAtualMes}/{v.diasNoMes}</span>
                                        <span className="font-bold">{pctMesDecorrido.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-300/70 rounded-full" style={{ width: `${pctMesDecorrido}%` }} />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                                        <span>Realizado / Projeção</span>
                                        <span className="font-bold">{pctRealizadoVsProj.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full" style={{ width: `${Math.min(100, pctRealizadoVsProj)}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Projeção */}
                        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-indigo-300/80 mb-1">
                                    <Target size={12} /> Projeção (linear)
                                </div>
                                <div className="text-3xl font-black tracking-tight">{fmtBRL(v.projecaoMes)}</div>
                                <div className="text-xs text-slate-400 mt-1">se mantiver o ritmo atual até o fim do mês</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
                                <div>
                                    <div className="text-[10px] uppercase text-slate-400 font-semibold">Hoje</div>
                                    <div className="text-base font-bold">{fmtBRLcompact(v.hoje)}</div>
                                    <div className="text-[10px] text-slate-400">{op.pedidosHoje || 0} pedidos</div>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase text-slate-400 font-semibold">Semana</div>
                                    <div className="text-base font-bold">{fmtBRLcompact(v.semana)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ STRIP DE ALERTAS ═══════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                <AlertaPill
                    icon={Wallet}
                    label="Inadimplência"
                    value={fmtBRL(inad.total)}
                    sub={`${inad.parcelas} parcela(s) vencidas`}
                    tone={inad.total > 0 ? 'red' : 'emerald'}
                    to="/financeiro"
                />
                <AlertaPill
                    icon={Flame}
                    label="Ruptura no Top 10"
                    value={`${rupturaCount} produto(s)`}
                    sub="abaixo do estoque mínimo"
                    tone={rupturaCount > 0 ? 'amber' : 'emerald'}
                />
                <AlertaPill
                    icon={UserX}
                    label="Clientes Inativos"
                    value={`${inativos.total}`}
                    sub="sem pedido há +45 dias"
                    tone={inativos.total > 5 ? 'amber' : 'gray'}
                />
                <AlertaPill
                    icon={AlertCircle}
                    label="Erros ERP"
                    value={`${d.pedidosComErro}`}
                    sub="pedidos não sincronizados"
                    tone={d.pedidosComErro > 0 ? 'red' : 'emerald'}
                    to="/pedidos?statusEnvio=ERRO"
                />
            </div>

            {/* ═══════════ OPERACIONAL ═══════════ */}
            <SectionTitle icon={Activity}>Operação de Hoje</SectionTitle>
            <div className="bg-white border rounded-xl p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <StatPill label="Clientes atendidos" value={fmtNum(op.clientesAtendidos)} sub={`${op.totalAtendimentos} atendimentos`} color="blue" />
                    <StatPill label="Atend. com pedido" value={fmtNum(op.atendimentosComPedido)} color="emerald" />
                    <StatPill label="Atend. sem pedido" value={fmtNum(op.atendimentosSemPedido)} color="amber" />
                    <StatPill label="Transf. pendentes" value={fmtNum(op.transferenciasPendentes)} sub="não finalizadas" color="red" />
                    <StatPill label="Pedidos lançados" value={fmtNum(op.pedidosHoje)} color="indigo" />
                    <Link to="/caixa" className="flex flex-col items-start gap-0.5 hover:opacity-80">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1"><CheckSquare size={11} /> Caixas a conferir</span>
                        <span className={`text-xl font-bold ${d.caixasAConferir > 0 ? 'text-indigo-700' : 'text-gray-900'}`}>{fmtNum(d.caixasAConferir)}</span>
                        <span className="text-[11px] text-gray-500">recebido hoje {fmtBRLcompact(d.valorEntregueHoje)}</span>
                    </Link>
                </div>
            </div>

            {podeVerVendas && (
                <>
                    {/* ═══════════ RANKINGS LADO A LADO ═══════════ */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {/* Top Produtos */}
                        <div>
                            <SectionTitle
                                icon={Package}
                                right={<span className="text-[11px] text-gray-400">últimos 30 dias · líquido</span>}
                            >
                                Top 10 Produtos
                            </SectionTitle>
                            <div className="bg-gradient-to-br from-emerald-50/30 to-white border rounded-xl overflow-hidden">
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
                                    <div className="p-8 text-center text-gray-400 text-sm">Sem vendas nos últimos 30 dias</div>
                                )}
                            </div>
                        </div>

                        {/* Top Clientes */}
                        <div>
                            <SectionTitle
                                icon={Crown}
                                right={<span className="text-[11px] text-gray-400">últimos 30 dias · líquido</span>}
                            >
                                Top 10 Clientes
                            </SectionTitle>
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
                                            right={<span className="text-gray-500">{c.pedidos} ped</span>}
                                        />
                                    );
                                })}
                                {(!d.topClientes || d.topClientes.length === 0) && (
                                    <div className="p-8 text-center text-gray-400 text-sm">Sem vendas nos últimos 30 dias</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ═══════════ INATIVOS + EM QUEDA ═══════════ */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div>
                            <SectionTitle
                                icon={UserX}
                                right={<span className="text-[11px] text-gray-400">{inativos.total} clientes ativos sem pedido +45d</span>}
                            >
                                Clientes Inativos — recuperar
                            </SectionTitle>
                            {inativos.top.length === 0 ? (
                                <div className="bg-white border rounded-xl p-6 text-center text-sm text-emerald-600">
                                    🎉 Nenhum cliente inativo no critério.
                                </div>
                            ) : (
                                <div className="bg-white border rounded-xl overflow-hidden">
                                    {inativos.top.map(c => {
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
                                    })}
                                </div>
                            )}
                        </div>

                        <div>
                            <SectionTitle
                                icon={TrendingDown}
                                right={<span className="text-[11px] text-gray-400">30d vs 30–60d · queda &gt; 30%</span>}
                            >
                                Produtos em Queda — investigar
                            </SectionTitle>
                            {(!d.produtosEmQueda || d.produtosEmQueda.length === 0) ? (
                                <div className="bg-white border rounded-xl p-6 text-center text-sm text-emerald-600">
                                    ✓ Nenhum produto em queda relevante.
                                </div>
                            ) : (
                                <div className="bg-white border rounded-xl overflow-hidden">
                                    {d.produtosEmQueda.map(p => (
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
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ═══════════ FOOTER: NOTAS PENDENTES ═══════════ */}
                    {d.pedidosEspeciais > 0 && (
                        <div className="mt-6">
                            <Link to="/pedidos?especial=true" className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition">
                                <AlertTriangle size={20} className="text-amber-600" />
                                <div className="flex-1">
                                    <div className="font-semibold text-amber-900 text-sm">{d.pedidosEspeciais} pedido(s) especial(is) com nota pendente</div>
                                    <div className="text-[11px] text-amber-700">clique para revisar</div>
                                </div>
                                <Zap size={16} className="text-amber-600" />
                            </Link>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DashboardAdminSection;
