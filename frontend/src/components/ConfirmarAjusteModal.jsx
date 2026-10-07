import { useEffect, useRef } from 'react';
import { Plus, Minus, AlertTriangle, Loader2 } from 'lucide-react';

// Janela de confirmação do ajuste de estoque: VERDE para ENTRADA, VERMELHA para SAÍDA.
// Enter confirma, Esc cancela, foco inicial no botão Confirmar. A tela decide o que fazer em
// onConfirmar (e é ela que tem a guarda contra clique duplo).
export default function ConfirmarAjusteModal({ tipo, produto, quantidade, observacao, salvando, onConfirmar, onCancelar }) {
    const confirmarRef = useRef(null);
    const cancelarRef = useRef(null);
    const callbacks = useRef({ onConfirmar, onCancelar });
    callbacks.current = { onConfirmar, onCancelar };

    const entrada = tipo === 'ENTRADA';
    const unidade = produto?.unidade || 'un';
    const disponivel = Number(produto?.estoqueDisponivel || 0);
    const novo = entrada ? disponivel + quantidade : disponivel - quantidade;
    const motivo = String(observacao || '').trim();
    const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

    useEffect(() => {
        const t = setTimeout(() => confirmarRef.current?.focus(), 30);
        let ultimoChar = 0;   // instante da última tecla imprimível (dupla proteção contra o Enter do leitor)
        const aoTeclar = (e) => {
            if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); return; }   // espaço de código de barras não aciona o botão focado
            if (e.key.length === 1) { ultimoChar = performance.now(); return; }
            if (e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                callbacks.current.onCancelar();
            } else if (e.key === 'Enter') {
                if (e.repeat) { e.preventDefault(); return; }        // tecla segurada não confirma sem querer
                // Enter colado a um caractere (< 80 ms) é o final de um bipe de leitor, nunca um humano
                if (performance.now() - ultimoChar < 80) { e.preventDefault(); e.stopPropagation(); return; }
                if (document.activeElement === cancelarRef.current) return;   // Enter no "Cancelar" cancela (clique nativo)
                e.preventDefault(); e.stopPropagation();
                callbacks.current.onConfirmar();
            } else if (e.key === 'Tab') {
                // mantém o foco dentro da janela
                e.preventDefault();
                const alvo = document.activeElement === confirmarRef.current ? cancelarRef.current : confirmarRef.current;
                alvo?.focus();
            }
        };
        document.addEventListener('keydown', aoTeclar, true);
        return () => { clearTimeout(t); document.removeEventListener('keydown', aoTeclar, true); };
    }, []);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
            role="dialog"
            aria-modal="true"
            aria-label={entrada ? 'Confirmar entrada no estoque' : 'Confirmar saída do estoque'}
        >
            <div className={`w-full max-w-md max-h-full overflow-y-auto bg-white rounded-2xl shadow-xl border-2 ${entrada ? 'border-primary' : 'border-red-500'}`}>
                <div className={`flex items-center gap-2 px-5 py-3 text-white font-bold rounded-t-2xl ${entrada ? 'bg-primary' : 'bg-red-600'}`}>
                    {entrada ? <Plus className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    {entrada ? 'Confirmar ENTRADA no estoque' : 'Confirmar SAÍDA do estoque'}
                </div>
                <div className="p-5 space-y-3">
                    <div className="min-w-0">
                        <span className="inline-block text-xs font-mono font-bold text-white bg-house px-2 py-0.5 rounded-full mb-1">
                            {produto?.codigo || 'sem código'}
                        </span>
                        <p className="font-semibold text-gray-900 leading-snug break-words">{produto?.nome}</p>
                    </div>
                    <p className={`text-4xl font-extrabold text-center py-2 rounded-xl ${entrada ? 'text-primaryDark bg-mint/60' : 'text-red-700 bg-red-50'}`}>
                        {entrada ? '+' : '−'}{fmt(quantidade)} <span className="text-lg font-bold">{unidade}</span>
                    </p>
                    <p className="text-sm text-gray-700 text-center">
                        Disponível: <b>{fmt(disponivel)}</b> → <b className={novo < 0 ? 'text-red-700' : ''}>{fmt(novo)}</b> {unidade}
                        {novo < 0 && <span className="block text-red-700 font-bold text-xs mt-0.5">Vai ficar negativo!</span>}
                    </p>
                    <p className="text-sm text-gray-600 text-center break-words">
                        {motivo ? <>Motivo: <b className="text-gray-900">{motivo}</b></> : <span className="text-gray-500">Sem motivo (opcional na entrada)</span>}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3 px-5 pb-5">
                    <button
                        ref={cancelarRef}
                        type="button"
                        onClick={onCancelar}
                        disabled={salvando}
                        className="min-h-[48px] rounded-full border border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancelar <span className="text-xs text-gray-500 font-normal">(Esc)</span>
                    </button>
                    <button
                        ref={confirmarRef}
                        type="button"
                        onClick={onConfirmar}
                        disabled={salvando}
                        className={`min-h-[48px] rounded-full text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${entrada ? 'bg-primary hover:bg-primaryDark' : 'bg-red-600 hover:bg-red-700'}`}
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : (entrada ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />)}
                        Confirmar <span className="text-xs font-normal opacity-90">(Enter)</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
