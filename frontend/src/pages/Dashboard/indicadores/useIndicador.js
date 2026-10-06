import { useCallback, useEffect, useState } from 'react';
import { buscarIndicador } from '../../../services/indicadoresGestaoApi';

// Carrega UM bloco da tela, de forma independente dos outros (um erro/403 não derruba a página).
//   proibido=true  -> 403: o bloco some, sem mensagem de erro
//   exemplo=true   -> a rota ainda não existe no servidor (404) e veio dado de exemplo
export function useIndicador(rota, params, ativo = true) {
    const [estado, setEstado] = useState({ dados: null, erro: null, carregando: ativo, exemplo: false, proibido: false });
    const [tentativa, setTentativa] = useState(0);
    const chave = JSON.stringify([rota, params]);

    useEffect(() => {
        if (!ativo) { setEstado({ dados: null, erro: null, carregando: false, exemplo: false, proibido: false }); return undefined; }
        let vivo = true;
        setEstado((e) => ({ ...e, carregando: true, erro: null, proibido: false }));
        buscarIndicador(rota, params)
            .then(({ dados, exemplo }) => { if (vivo) setEstado({ dados, erro: null, carregando: false, exemplo, proibido: false }); })
            .catch((e) => {
                if (!vivo) return;
                const status = e?.response?.status;
                setEstado({
                    dados: null, carregando: false, exemplo: false, proibido: status === 403,
                    erro: status === 403 ? null : (status === 404 ? 'Não foi possível carregar; tente de novo.' : (e?.response?.data?.error || 'Não foi possível carregar; tente de novo.')),
                });
            });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave, ativo, tentativa]);

    const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
    return { ...estado, recarregar };
}
