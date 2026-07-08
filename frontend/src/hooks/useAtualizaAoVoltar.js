import { useEffect, useRef } from 'react';

/**
 * Recarrega dados "vivos" quando o usuário VOLTA para o app (PWA que ficou em
 * segundo plano no celular/iPad) e periodicamente com a tela aberta.
 *
 * Por que existe: no iOS o app instalado na tela inicial mantém o estado do
 * React vivo quando vai para segundo plano — ao reabrir, os componentes NÃO
 * remontam e o `useEffect` de carregamento não roda de novo, então a tela
 * "congela" no dado da última vez. Este hook rebusca em `visibilitychange`,
 * `focus` e a cada 5 min (útil em telas deixadas abertas no balcão/fábrica).
 *
 * @param {Function} recarregar função que dispara a nova busca (a mais recente
 *        é sempre chamada, então closures com filtros atuais funcionam)
 * @param {number} ttlMs idade mínima do dado antes de rebuscar ao voltar (padrão 60s)
 * @returns {Function} marcarAtualizado — chame ao terminar uma busca com sucesso,
 *          para o TTL contar a partir dali (evita rebusca dupla logo após carregar)
 */
export function useAtualizaAoVoltar(recarregar, ttlMs = 60 * 1000) {
    const ultimaRef = useRef(Date.now());
    const cbRef = useRef(recarregar);
    cbRef.current = recarregar;

    useEffect(() => {
        const revalidar = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            if (Date.now() - ultimaRef.current >= ttlMs) {
                ultimaRef.current = Date.now();
                cbRef.current && cbRef.current();
            }
        };
        document.addEventListener('visibilitychange', revalidar);
        window.addEventListener('focus', revalidar);
        const timer = setInterval(revalidar, 5 * 60 * 1000);
        return () => {
            document.removeEventListener('visibilitychange', revalidar);
            window.removeEventListener('focus', revalidar);
            clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ttlMs]);

    return () => { ultimaRef.current = Date.now(); };
}

export default useAtualizaAoVoltar;
