// Padroniza "depois de uma ação em série, o cursor volta ao campo óbvio" (pedido do dono, 09/2026).
// Uso: const { ref, voltarFoco } = useFocoInicial(); <input ref={ref} ... />; após sucesso: voltarFoco().
// voltarFoco({ selecionar: false }) só foca, sem selecionar o conteúdo.
// manterFoco (opcional): para campo de leitor de código/bipe, refoca sozinho ao perder o foco enquanto ativo
// — chame ref.current?.blur() (ou desative) quando quiser realmente liberar o campo.
import { useRef, useCallback } from 'react';

export function useFocoInicial() {
    const ref = useRef(null);

    const voltarFoco = useCallback(({ selecionar = true } = {}) => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        if (selecionar && typeof el.select === 'function') el.select();
    }, []);

    const manterFoco = useCallback((ativo = true) => (e) => {
        if (!ativo) return;
        const el = ref.current;
        if (!el) return;
        // pequeno delay: evita brigar com o clique que tirou o foco de propósito (ex.: outro botão)
        setTimeout(() => { if (ativo) el.focus(); }, 0);
    }, []);

    return { ref, voltarFoco, manterFoco };
}

export default useFocoInicial;
