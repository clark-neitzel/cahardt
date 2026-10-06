import React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { SEMAFORO } from './formatos';

// Cartão de bloco da tela, com os estados de carregamento/erro (cada bloco se vira sozinho).
// `estado` = retorno do useIndicador. 403 (proibido) => não renderiza nada.
export default function Bloco({ titulo, icon: Icon, direita, estado, children, className = '', semPadding = false }) {
    if (estado?.proibido) return null;
    return (
        <section className={`bg-white rounded-xl border border-gray-200 shadow-sm min-w-0 ${className}`}>
            <div className="flex flex-wrap items-center gap-2 px-4 md:px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                    {Icon && <Icon className="h-4 w-4 text-primary flex-none" />}
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</h2>
                </div>
                {direita && <div className="ml-auto flex flex-wrap items-center gap-1.5">{direita}</div>}
            </div>
            <div className={semPadding ? '' : 'p-4 md:p-5'}>
                {estado?.carregando && !estado?.dados ? (
                    <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-10">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                ) : estado?.erro ? (
                    <div className="flex flex-col items-center text-center gap-3 py-8 px-4">
                        <AlertTriangle className="h-6 w-6 text-amber-600" />
                        <p className="text-sm text-gray-700">{estado.erro}</p>
                        <button
                            type="button"
                            onClick={estado.recarregar}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-semibold"
                        >
                            <RefreshCw className="h-4 w-4" /> Tentar de novo
                        </button>
                    </div>
                ) : children}
            </div>
        </section>
    );
}

// Selo de status com a PALAVRA (nunca só cor): no alvo / atenção / agir.
export function Selo({ status, palavra, className = '' }) {
    const def = SEMAFORO[status] || SEMAFORO.sem_dado;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${def.cls} ${className}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
            {palavra || def.palavra}
        </span>
    );
}

export function Chip({ children, cls = 'bg-mint text-primaryDark', className = '' }) {
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${cls} ${className}`}>{children}</span>;
}
