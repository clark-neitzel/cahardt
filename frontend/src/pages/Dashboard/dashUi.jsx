import React from 'react';

/**
 * Componentes visuais compartilhados dos dashboards (Geral, Vendedor, Entregador).
 * Seguem o design system do app (cards rounded-xl, headers uppercase, barras por %).
 */

export const fmtBR = (v, casas = 2) =>
    Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const fmtRS = (v) => `R$ ${fmtBR(v, 2)}`;
export const fmtRS0 = (v) => `R$ ${fmtBR(v, 0)}`;
export const fmtK = (v) => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
    return fmtRS0(n);
};
export const fmtInt = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/** Card padrão com cabeçalho de seção. */
export const Card = ({ icon: Icon, titulo, direita, children, className = '', semPadding = false }) => (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
        {titulo && (
            <div className="flex items-center gap-2 px-4 md:px-5 py-3 md:py-3.5 border-b border-gray-100">
                {Icon && <Icon className="h-4 w-4 text-blue-600 flex-none" />}
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</span>
                {direita && <span className="ml-auto text-xs font-semibold text-gray-500 text-right">{direita}</span>}
            </div>
        )}
        <div className={semPadding ? '' : 'p-4 md:p-5'}>{children}</div>
    </div>
);

/** Cartão de KPI simples. */
export const Kpi = ({ label, valor, sub, subClasse = 'text-gray-500' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5">
        <p className="text-xs font-bold text-gray-500">{label}</p>
        <p className="text-lg md:text-2xl font-extrabold text-gray-900 mt-0.5 whitespace-nowrap tabular-nums">{valor}</p>
        {sub != null && <p className={`text-xs font-semibold mt-0.5 ${subClasse}`}>{sub}</p>}
    </div>
);

/** Barra de progresso com a cor padrão por % (vermelho→azul→amarelo→verde). */
export const BarraMeta = ({ percent, altura = 'h-2.5' }) => {
    const p = Number(percent || 0);
    let cor = 'bg-red-500';
    if (p >= 100) cor = 'bg-green-500';
    else if (p >= 80) cor = 'bg-yellow-400';
    else if (p >= 50) cor = 'bg-blue-500';
    return (
        <div className={`w-full bg-gray-100 rounded-full ${altura} overflow-hidden`}>
            <div className={`${altura} rounded-full ${cor}`} style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
        </div>
    );
};

/**
 * Linha de ranking com barra horizontal.
 * Desktop: nome | barra | valor na mesma linha. Mobile: nome+valor em cima, barra embaixo.
 */
export const LinhaBarra = ({ nome, sub, valor, percent, cor = 'bg-primary' }) => (
    <div className="py-1.5 md:flex md:items-center md:gap-3">
        <div className="flex items-baseline justify-between gap-2 md:contents">
            <span className="text-[13px] font-semibold text-gray-800 truncate md:w-44 md:flex-none md:order-1">
                {nome}
                {sub != null && <span className="text-gray-500 font-medium"> · {sub}</span>}
            </span>
            <span className="text-[13px] font-bold text-gray-900 whitespace-nowrap tabular-nums md:order-3 md:w-24 md:text-right md:flex-none">{valor}</span>
        </div>
        <div className="mt-1 md:mt-0 md:order-2 md:flex-1 h-3 md:h-4 bg-gray-100 rounded-md overflow-hidden">
            <div className={`h-full rounded-md ${cor}`} style={{ width: `${Math.min(100, Math.max(2, Number(percent || 0)))}%` }} />
        </div>
    </div>
);

/** Gráfico de barras verticais (série semanal). Desliza para o lado no celular. */
export const BarrasVerticais = ({ serie, formatoValor = (v) => Math.round(v / 1000), formatoLabel }) => {
    const max = Math.max(1, ...serie.map((s) => Number(s.total || 0)));
    return (
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <div className="flex items-end gap-1.5 h-36" style={{ minWidth: serie.length > 8 ? `${serie.length * 48}px` : undefined }}>
                {serie.map((s) => (
                    <div key={s.semana} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                        <span className="text-[11px] font-bold text-gray-700 tabular-nums">{formatoValor(Number(s.total || 0))}</span>
                        <div
                            className={`w-full max-w-[38px] rounded-t-md ${s.atual ? 'bg-[#cba258]' : 'bg-primary opacity-85'}`}
                            style={{ height: `${Math.max(2, (Number(s.total || 0) / max) * 100)}%` }}
                        />
                        <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">
                            {formatoLabel ? formatoLabel(s) : s.semana?.slice(8, 10) + '/' + s.semana?.slice(5, 7)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Anel de progresso (gauge) com % no centro. */
export const Gauge = ({ percent, label = 'da meta', tamanho = 120 }) => {
    const p = Math.min(100, Math.max(0, Number(percent || 0)));
    const r = tamanho * 0.42;
    const c = 2 * Math.PI * r;
    const meio = tamanho / 2;
    return (
        <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} className="flex-none">
            <circle cx={meio} cy={meio} r={r} fill="none" stroke="#eceae5" strokeWidth={tamanho * 0.1} />
            <circle
                cx={meio} cy={meio} r={r} fill="none" stroke="#00754A" strokeWidth={tamanho * 0.1}
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
                transform={`rotate(-90 ${meio} ${meio})`}
            />
            <text x={meio} y={meio - 2} textAnchor="middle" className="fill-gray-900" fontSize={tamanho * 0.19} fontWeight="800">
                {`${fmtBR(percent, percent < 10 ? 1 : 0)}%`}
            </text>
            <text x={meio} y={meio + tamanho * 0.15} textAnchor="middle" className="fill-gray-500" fontSize={tamanho * 0.085} fontWeight="700">
                {label}
            </text>
        </svg>
    );
};

/** Badge de status de recompra (cores fixas do sistema). */
export const BadgeRecompra = ({ status }) => {
    const mapa = {
        NO_PRAZO: ['bg-green-100 text-green-800', 'No prazo'],
        ATENCAO: ['bg-yellow-100 text-yellow-800', 'Atenção'],
        ATRASADO: ['bg-amber-100 text-amber-700', 'Atrasado'],
        CRITICO: ['bg-red-100 text-red-700', 'Crítico'],
        SEM_HISTORICO: ['bg-gray-100 text-gray-700', 'Sem histórico']
    };
    const [cls, rotulo] = mapa[status] || mapa.SEM_HISTORICO;
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${cls}`}>{rotulo}</span>;
};

/** Item de alerta (lista "precisa de atenção"). */
export const ItemAlerta = ({ numero, cor = 'bg-red-100 text-red-700', titulo, sub, acao }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-2.5">
        <span className={`flex-none w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-sm ${cor}`}>{numero}</span>
        <div className="flex-1 min-w-[180px]">
            <p className="text-[13px] font-semibold text-gray-900">{titulo}</p>
            {sub && <p className="text-xs font-medium text-gray-500">{sub}</p>}
        </div>
        {acao}
    </div>
);

export const Carregando = () => (
    <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
);
