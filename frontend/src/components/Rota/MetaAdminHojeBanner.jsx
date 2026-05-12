import React, { useState, useMemo } from 'react';
import { BarChart2, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';

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

    const toggle = () => {
        setOpen(v => {
            localStorage.setItem(STORAGE_KEY, String(!v));
            return !v;
        });
    };

    // Agrega por vendedor a partir do array de cidades
    const vendedores = useMemo(() => {
        const map = {};
        for (const cidade of (cidadesHoje || [])) {
            for (const v of (cidade.vendedores || [])) {
                if (!map[v.vendedorId]) {
                    map[v.vendedorId] = {
                        vendedorId: v.vendedorId,
                        nome: v.nome,
                        metaSemana: 0, vendidoSemana: 0,
                        metaMensal: 0, vendidoMes: 0,
                        vendidoHoje: 0,
                        cidades: []
                    };
                }
                map[v.vendedorId].metaSemana += v.metaSemana;
                map[v.vendedorId].vendidoSemana += v.vendidoSemana;
                map[v.vendedorId].metaMensal += v.metaMensal;
                map[v.vendedorId].vendidoMes += v.vendidoMes;
                map[v.vendedorId].vendidoHoje += v.vendidoHoje;
                map[v.vendedorId].cidades.push({
                    cidade: cidade.cidade,
                    metaSemana: v.metaSemana,
                    vendidoSemana: v.vendidoSemana,
                    metaMensal: v.metaMensal,
                    vendidoMes: v.vendidoMes,
                    vendidoHoje: v.vendidoHoje
                });
            }
        }
        return Object.values(map).sort((a, b) => b.metaSemana - a.metaSemana);
    }, [cidadesHoje]);

    if (!vendedores.length) return null;

    const superou = vendedores.filter(v => v.vendidoSemana >= v.metaSemana).length;
    const semVenda = vendedores.filter(v => v.vendidoSemana === 0).length;
    const emAndamento = vendedores.length - superou - semVenda;

    return (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
            <button
                type="button"
                onClick={toggle}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-100 transition-colors"
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <BarChart2 size={16} className="text-blue-500 shrink-0" />
                    <span className="text-sm font-bold text-blue-800">Vendedores hoje — meta da semana</span>
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
                {open ? <ChevronUp size={15} className="text-blue-400 shrink-0" /> : <ChevronDown size={15} className="text-blue-400 shrink-0" />}
            </button>

            {open && (
                <div className="px-4 pb-3 space-y-2">
                    {vendedores.map(v => {
                        const jaFez = v.vendidoSemana >= v.metaSemana;
                        const semV = v.vendidoSemana === 0;
                        const faltaSemana = Math.max(v.metaSemana - v.vendidoSemana, 0);
                        const pctSemana = v.metaSemana > 0 ? Math.min((v.vendidoSemana / v.metaSemana) * 100, 100) : 0;
                        const pctMes = v.metaMensal > 0 ? Math.min((v.vendidoMes / v.metaMensal) * 100, 100) : 0;

                        return (
                            <div key={v.vendedorId} className="bg-white rounded-lg px-3 py-2.5 border border-blue-100">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            {jaFez
                                                ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                                                : semV
                                                    ? <AlertTriangle size={13} className="text-red-400 shrink-0" />
                                                    : <TrendingUp size={13} className="text-amber-500 shrink-0" />}
                                            <span className="text-sm font-semibold text-gray-800 truncate">{v.nome}</span>
                                            {v.cidades.length > 0 && (
                                                <span className="text-xs text-gray-400 truncate">
                                                    · {v.cidades.map(c => c.cidade).join(', ')}
                                                </span>
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
                                        {v.metaMensal > 0 && (
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
                                        <p className="text-sm font-bold text-gray-800">{fmtK(v.vendidoSemana)}</p>
                                        <p className="text-xs text-gray-400">sem / {fmtK(v.metaSemana)}</p>
                                        {v.metaMensal > 0 && (
                                            <p className="text-xs text-gray-400 mt-0.5">{fmtK(v.vendidoMes)} / {fmtK(v.metaMensal)} mês</p>
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
                                    {v.vendidoHoje > 0 && (
                                        <span className="text-xs text-gray-400 shrink-0">hoje: {fmtK(v.vendidoHoje)}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MetaAdminHojeBanner;
