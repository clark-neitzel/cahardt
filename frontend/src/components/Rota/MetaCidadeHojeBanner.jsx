import React, { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';

const fmtK = (v) => {
    const n = Number(v);
    if (n >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`;
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const STORAGE_KEY = 'meta_cidade_hoje_banner_open';

const MetaCidadeHojeBanner = ({ cidadesDeHoje }) => {
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

    if (!cidadesDeHoje?.length) return null;

    const superou = cidadesDeHoje.filter(c => c.vendidoHoje >= c.metaDia).length;
    const semVenda = cidadesDeHoje.filter(c => c.vendidoHoje === 0).length;
    const emAndamento = cidadesDeHoje.length - superou - semVenda;

    return (
        <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
            {/* Header colapsável */}
            <button
                type="button"
                onClick={toggle}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-orange-100 transition-colors"
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <MapPin size={16} className="text-orange-500 shrink-0" />
                    <span className="text-sm font-bold text-orange-800">Metas de hoje</span>
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
                    {cidadesDeHoje.map(c => {
                        const jaFez = c.vendidoHoje >= c.metaDia;
                        const semV = c.vendidoHoje === 0;
                        const falta = Math.max(c.metaDia - c.vendidoHoje, 0);
                        const pct = c.metaDia > 0 ? Math.min((c.vendidoHoje / c.metaDia) * 100, 100) : 0;

                        return (
                            <div key={c.cidade} className="bg-white rounded-lg px-3 py-2.5 border border-orange-100">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            {jaFez
                                                ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                                                : semV
                                                    ? <AlertTriangle size={13} className="text-red-400 shrink-0" />
                                                    : <TrendingUp size={13} className="text-amber-500 shrink-0" />}
                                            <span className="text-sm font-semibold text-gray-800 truncate">{c.cidade}</span>
                                        </div>

                                        {/* Barra de progresso */}
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className={`h-1.5 rounded-full transition-all ${jaFez ? 'bg-green-500' : semV ? 'bg-red-300' : 'bg-amber-400'}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-gray-400 tabular-nums shrink-0">{pct.toFixed(0)}%</span>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0 ml-1">
                                        <p className="text-sm font-bold text-gray-800">{fmtK(c.vendidoHoje)}</p>
                                        <p className="text-xs text-gray-400">meta {fmtK(c.metaDia)}</p>
                                    </div>
                                </div>

                                <div className="mt-1.5">
                                    {jaFez ? (
                                        <p className="text-xs text-green-600 font-medium">Superou a meta do dia! 🎉</p>
                                    ) : semV ? (
                                        <p className="text-xs text-red-500">Nenhuma venda ainda — meta {fmtK(c.metaDia)}</p>
                                    ) : (
                                        <p className="text-xs text-amber-600">Faltam <span className="font-semibold">{fmtK(falta)}</span> para a meta do dia</p>
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

export default MetaCidadeHojeBanner;
