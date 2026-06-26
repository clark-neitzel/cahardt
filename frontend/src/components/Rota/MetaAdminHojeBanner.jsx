import React, { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';

const fmtK = (v) => {
    const n = Number(v);
    if (n >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`;
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const STORAGE_KEY = 'meta_admin_hoje_banner_open';

const MetaAdminHojeBanner = ({ cidadesHoje }) => {
    const [open, setOpen] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === null ? true : saved === 'true';
    });
    const [expandedCidade, setExpandedCidade] = useState(null);

    const toggle = () => {
        setOpen(v => {
            localStorage.setItem(STORAGE_KEY, String(!v));
            return !v;
        });
    };

    if (!cidadesHoje?.length) return null;

    const superou = cidadesHoje.filter(c => c.totalVendidoSemana >= c.totalMetaSemana).length;
    const semVenda = cidadesHoje.filter(c => c.totalVendidoSemana === 0).length;
    const emAndamento = cidadesHoje.length - superou - semVenda;

    return (
        <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
            <button
                type="button"
                onClick={toggle}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-orange-100 transition-colors"
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <MapPin size={16} className="text-orange-500 shrink-0" />
                    <span className="text-sm font-bold text-orange-800">Meta da semana — cidades de hoje</span>
                    <div className="flex items-center gap-1.5">
                        {superou > 0 && (
                            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                                ✅ {superou} superou
                            </span>
                        )}
                        {emAndamento > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                                ⚡ {emAndamento} em andamento
                            </span>
                        )}
                        {semVenda > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                                🔴 {semVenda} sem venda
                            </span>
                        )}
                    </div>
                </div>
                {open ? <ChevronUp size={15} className="text-orange-400 shrink-0" /> : <ChevronDown size={15} className="text-orange-400 shrink-0" />}
            </button>

            {open && (
                <div className="px-4 pb-3 space-y-2">
                    {cidadesHoje.map(c => {
                        const jaFez = c.totalVendidoSemana >= c.totalMetaSemana;
                        const semV = c.totalVendidoSemana === 0;
                        const faltaSemana = Math.max(c.totalMetaSemana - c.totalVendidoSemana, 0);
                        const pctSemana = c.totalMetaSemana > 0 ? Math.min((c.totalVendidoSemana / c.totalMetaSemana) * 100, 100) : 0;
                        const pctMes = c.totalMetaMensal > 0 ? Math.min((c.totalVendidoMes / c.totalMetaMensal) * 100, 100) : 0;
                        const isExpanded = expandedCidade === c.cidade;

                        return (
                            <div key={c.cidade} className="bg-white rounded-xl px-3 py-2.5 border border-orange-100">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            {jaFez
                                                ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                                                : semV
                                                    ? <AlertTriangle size={13} className="text-red-400 shrink-0" />
                                                    : <TrendingUp size={13} className="text-amber-500 shrink-0" />}
                                            <span className="text-sm font-semibold text-gray-800 truncate">{c.cidade}</span>
                                            {c.vendedores?.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedCidade(isExpanded ? null : c.cidade)}
                                                    className="ml-auto text-xs text-gray-400 flex items-center gap-0.5 hover:text-gray-600"
                                                >
                                                    {c.vendedores.length} vend.
                                                    <ChevronRight size={11} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Barra semana */}
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs text-gray-400 w-6 shrink-0">sem</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className={`h-1.5 rounded-full transition-all ${jaFez ? 'bg-green-500' : semV ? 'bg-red-300' : 'bg-amber-400'}`}
                                                    style={{ width: `${pctSemana}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-gray-400 tabular-nums w-8 text-right shrink-0">{pctSemana.toFixed(0)}%</span>
                                        </div>

                                        {/* Barra mês */}
                                        {c.totalMetaMensal > 0 && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400 w-6 shrink-0">mês</span>
                                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className="h-1.5 rounded-full transition-all bg-blue-400"
                                                        style={{ width: `${pctMes}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-gray-400 tabular-nums w-8 text-right shrink-0">{pctMes.toFixed(0)}%</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-right shrink-0 ml-2">
                                        <p className="text-sm font-bold text-gray-800">{fmtK(c.totalVendidoSemana)}</p>
                                        <p className="text-xs text-gray-400">sem / {fmtK(c.totalMetaSemana)}</p>
                                        {c.totalMetaMensal > 0 && (
                                            <p className="text-xs text-gray-400 mt-0.5">{fmtK(c.totalVendidoMes)} / {fmtK(c.totalMetaMensal)} mês</p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                    <div>
                                        {jaFez ? (
                                            <p className="text-xs text-green-600 font-medium">Meta da semana batida! 🎉</p>
                                        ) : semV ? (
                                            <p className="text-xs text-red-500">Nenhuma venda esta semana</p>
                                        ) : (
                                            <p className="text-xs text-amber-600">Faltam <span className="font-semibold">{fmtK(faltaSemana)}</span> para a meta</p>
                                        )}
                                    </div>
                                    {c.totalVendidoHoje > 0 && (
                                        <span className="text-xs text-gray-400 shrink-0">hoje: {fmtK(c.totalVendidoHoje)}</span>
                                    )}
                                </div>

                                {/* Vendedores expandidos */}
                                {isExpanded && c.vendedores?.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-orange-100 space-y-1">
                                        {c.vendedores.map(v => {
                                            const vPct = v.metaSemana > 0 ? Math.min((v.vendidoSemana / v.metaSemana) * 100, 100) : 0;
                                            return (
                                                <div key={v.vendedorId} className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500 flex-1 truncate">{v.nome}</span>
                                                    <div className="w-16 bg-gray-100 rounded-full h-1 overflow-hidden">
                                                        <div
                                                            className={`h-1 rounded-full ${v.vendidoSemana >= v.metaSemana ? 'bg-green-500' : v.vendidoSemana === 0 ? 'bg-red-300' : 'bg-amber-400'}`}
                                                            style={{ width: `${vPct}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-400 tabular-nums shrink-0">{fmtK(v.vendidoSemana)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MetaAdminHojeBanner;
