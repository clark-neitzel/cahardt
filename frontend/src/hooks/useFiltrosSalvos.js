import { useState, useEffect, useRef } from 'react';
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
 *
 * CUIDADO (bug real, corrigido 09/2026): no 1º render, o `AuthContext` ainda
 * está validando o token (`loading=true`) — `user` é `null` por enquanto,
 * não porque a pessoa está deslogada. Se a chave do localStorage usasse
 * `user?.id || 'anon'` direto, o hook lia/gravava em `filtros:anon:<chave>`
 * nesse instante, e quando o usuário de verdade chegava alguns ms depois, o
 * valor (ainda o padrão, resolvido com a chave errada) era GRAVADO por cima
 * da chave real — apagando a escolha salva do usuário a cada recarregar a
 * página. Por isso aqui:
 *  1. Enquanto `loading` é `true`, a chave fica `null` — não lê nem grava em
 *     `anon` nesse meio-tempo (não existe migração `anon → id do usuário`).
 *  2. Quando a chave passa a existir (ou muda — troca de usuário na mesma
 *     aba), o valor é LIDO de novo da chave nova e adotado via `setValor`,
 *     nunca escrito por cima com o `valor` (state) da chave anterior.
 */
export function useFiltrosSalvos(chave, inicial) {
    const { user, loading } = useAuth();
    // `null` enquanto a sessão ainda está sendo validada — só sabemos a
    // chave de verdade depois que `loading` resolve (signed ou deslogado).
    const storageKey = loading ? null : `filtros:${user?.id || 'anon'}:${chave}`;

    const lerValorSalvo = (key) => {
        try {
            const raw = localStorage.getItem(key);
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
    };

    const [valor, setValor] = useState(() => (storageKey ? lerValorSalvo(storageKey) : inicial));
    // Guarda a última chave já "assumida" — enquanto for diferente da atual,
    // o efeito abaixo só LÊ e adota (nunca persiste o valor da chave velha).
    const chaveAdotadaRef = useRef(storageKey);

    useEffect(() => {
        if (!storageKey) return; // ainda carregando a sessão — não lê nem grava
        if (chaveAdotadaRef.current !== storageKey) {
            // Chave mudou de verdade (1ª vez que a sessão resolveu, ou troca de
            // usuário) — adota o que já estava salvo NA CHAVE NOVA, ignorando o
            // `valor` atual em memória (que pode ser só o padrão, resolvido
            // ainda com a chave anterior/nenhuma).
            chaveAdotadaRef.current = storageKey;
            setValor(lerValorSalvo(storageKey));
            return; // não persiste neste ciclo; o valor recém-lido dispara o efeito de novo, já estável
        }
        try {
            localStorage.setItem(storageKey, JSON.stringify(valor));
        } catch (e) { /* armazenamento cheio/indisponível — segue sem salvar */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, valor]);

    return [valor, setValor];
}

// Mesmo hook para valor único (select, toggle, data) — só um nome mais claro
export const useFiltroSalvo = useFiltrosSalvos;

export default useFiltrosSalvos;
