import React from 'react';
import { X } from 'lucide-react';

export const btnPrim = 'px-4 py-2 min-h-[44px] md:min-h-0 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
export const btnSec = 'px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
export const btnPerigo = 'px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-full font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
export const btnGhost = 'px-4 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full';
export const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] md:min-h-0 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';
export const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

export const erroDe = (e, padrao) => e?.response?.data?.error || e?.response?.data?.erro || e?.response?.data?.message || padrao;

export const Card = ({ icone: Icone, titulo, acoes, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
                <Icone className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</span>
            </div>
            {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
        <div className="p-3 md:p-5">{children}</div>
    </div>
);

export const Modal = ({ titulo, onFechar, children, rodape, largura = 'md:max-w-lg' }) => (
    <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
        <div className={`bg-white w-full ${largura} rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-900 truncate">{titulo}</p>
                <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">{children}</div>
            {rodape && <div className="px-4 py-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">{rodape}</div>}
        </div>
    </div>
);

// Bolinha de estado do agente (ONLINE / INSTAVEL / OFFLINE)
const ESTADOS = {
    ONLINE: { cor: 'bg-green-500', badge: 'bg-green-100 text-green-800', texto: 'Online' },
    INSTAVEL: { cor: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-800', texto: 'Instável' },
    OFFLINE: { cor: 'bg-red-500', badge: 'bg-red-100 text-red-700', texto: 'Offline' },
};
export const EstadoAgente = ({ estado }) => {
    const e = ESTADOS[estado] || ESTADOS.OFFLINE;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-full ${e.badge}`}>
            <span className={`h-2 w-2 rounded-full ${e.cor}`} />{e.texto}
        </span>
    );
};

export const STATUS_TRABALHO = {
    PENDENTE: { badge: 'bg-gray-100 text-gray-700', texto: 'Aguardando' },
    ENVIANDO: { badge: 'bg-blue-100 text-blue-800', texto: 'Enviando' },
    IMPRESSO: { badge: 'bg-green-100 text-green-800', texto: 'Impresso' },
    ERRO: { badge: 'bg-red-100 text-red-700', texto: 'Erro' },
    EXPIRADO: { badge: 'bg-amber-100 text-amber-700', texto: 'Expirado' },
    CANCELADO: { badge: 'bg-gray-100 text-gray-700', texto: 'Cancelado' },
};
export const BadgeTrabalho = ({ status }) => {
    const s = STATUS_TRABALHO[status] || { badge: 'bg-gray-100 text-gray-700', texto: status || '—' };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${s.badge}`}>{s.texto}</span>;
};

// "há 12 s", "há 3 min", "há 2 h", "nunca"
export function haQuanto(iso) {
    if (!iso) return 'nunca';
    const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seg < 60) return `há ${seg} s`;
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
    return `há ${Math.floor(seg / 86400)} d`;
}

export function formatarDataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
