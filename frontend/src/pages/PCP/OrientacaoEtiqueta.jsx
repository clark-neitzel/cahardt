import { useLayoutEffect, useRef, useState } from 'react';
import { ORIENTACOES, orientacaoValida } from './etiquetaModelos';

// ─── Orientação da etiqueta (em pé / deitada) — controles compartilhados ──────
// Usado na lista "Dados das Etiquetas" (botão que alterna) e no formulário
// (botão duplo). Ícone = retângulo na posição da etiqueta.

export function IconeOrientacao({ orientacao, className = 'h-4 w-4' }) {
    const deitada = orientacaoValida(orientacao) === 'DEITADA';
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" className={className} aria-hidden="true">
            {deitada
                ? <rect x="3" y="6" width="18" height="12" rx="2" />
                : <rect x="6" y="3" width="12" height="18" rx="2" />}
        </svg>
    );
}

// Botão único que mostra a orientação atual e alterna ao clicar (lista).
export function BotaoOrientacao({ orientacao, onToggle, salvando = false, className = '' }) {
    const o = orientacaoValida(orientacao);
    const deitada = o === 'DEITADA';
    const proxima = deitada ? ORIENTACOES.EM_PE : ORIENTACOES.DEITADA;
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={salvando}
            title={`${ORIENTACOES[o].label} (${ORIENTACOES[o].descricao}). Clique para deixar ${proxima.label.toLowerCase()}.`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border min-h-[36px] transition-colors disabled:opacity-60 ${
                deitada
                    ? 'bg-mint text-primaryDark border-primary'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'
            } ${className}`}
        >
            <IconeOrientacao orientacao={o} />
            <span>{ORIENTACOES[o].label}</span>
        </button>
    );
}

// Botão duplo (segmentado) para o formulário.
export function SeletorOrientacao({ value, onChange }) {
    const atual = orientacaoValida(value);
    return (
        <div>
            <div className="inline-flex rounded-full border border-gray-300 overflow-hidden">
                {Object.values(ORIENTACOES).map((o, i) => {
                    const on = o.id === atual;
                    return (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => onChange(o.id)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold min-h-[44px] transition-colors ${i > 0 ? 'border-l border-gray-300' : ''} ${
                                on ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-mint/40'
                            }`}
                        >
                            <IconeOrientacao orientacao={o.id} />
                            <span>{o.label}</span>
                        </button>
                    );
                })}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
                {atual === 'DEITADA'
                    ? 'Deitada: 120 mm na horizontal × 100 mm na vertical, layout de mercado. Use nos pacotes pequenos.'
                    : 'Em pé: 100 mm de largura × 120 mm de altura. É a etiqueta de sempre.'}
            </p>
        </div>
    );
}

// Escala do preview: amplia até `maximo`, mas nunca mais que a largura disponível
// do container (no celular a etiqueta ampliada saía cortada dos dois lados).
// `larguraMM` é a largura do rótulo desenhado. Devolve [ref do container, escala].
export function useEscalaPreview(larguraMM, maximo = 1.5) {
    const ref = useRef(null);
    const [escala, setEscala] = useState(maximo);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const PX_POR_MM = 96 / 25.4;
        const calcular = () => {
            const disponivel = el.clientWidth - 16; // folga p/ a borda
            const largura = larguraMM * PX_POR_MM;
            if (!disponivel || !largura) return;
            setEscala(Math.max(0.3, Math.min(maximo, disponivel / largura)));
        };
        calcular();
        const ro = new ResizeObserver(calcular);
        ro.observe(el);
        return () => ro.disconnect();
    }, [larguraMM, maximo]);
    return [ref, escala];
}
