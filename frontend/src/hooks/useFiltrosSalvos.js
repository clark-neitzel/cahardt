import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * useState que LEMBRA a escolha do usuário entre sessões (localStorage,
 * por usuário e por tela). Padrão do sistema para TODO filtro de tela:
 *
 *   const [filtros, setFiltros] = useFiltrosSalvos('contas-receber', { status: 'ABERTO', ... });
 *   const [soAtivos, setSoAtivos] = useFiltroSalvo('produtos:soAtivos', true);
 *
 * - Objeto: o salvo é mesclado sobre o padrão ({ ...inicial, ...salvo }) —
 *   campos de filtro novos criados depois entram com o valor padrão.
 * - NÃO usar para campo de busca por texto livre (busca/pesquisa) nem para
 *   estado que não é filtro — só para escolhas que o usuário quer manter.
 */
export function useFiltrosSalvos(chave, inicial) {
    const { user } = useAuth();
    const storageKey = `filtros:${user?.id || 'anon'}:${chave}`;

    const [valor, setValor] = useState(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw == null) return inicial;
            const salvo = JSON.parse(raw);
            if (inicial && typeof inicial === 'object' && !Array.isArray(inicial) &&
                salvo && typeof salvo === 'object' && !Array.isArray(salvo)) {
                return { ...inicial, ...salvo };
            }
            return salvo == null ? inicial : salvo;
        } catch (e) {
            return inicial;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(valor));
        } catch (e) { /* armazenamento cheio/indisponível — segue sem salvar */ }
    }, [storageKey, valor]);

    return [valor, setValor];
}

// Mesmo hook para valor único (select, toggle, data) — só um nome mais claro
export const useFiltroSalvo = useFiltrosSalvos;

export default useFiltrosSalvos;
