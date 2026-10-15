import { useEffect, useMemo, useState } from 'react';
import clienteService from '../services/clienteService';

// Cache em memória (30 s) + deduplicação: várias telas/renders pedindo os mesmos
// clientes geram uma chamada só. O front NUNCA recalcula inadimplência — só mostra o que o back mandou.
const TTL_MS = 30000;
const MAX_LOTE = 500;
const cache = new Map();      // id -> { em, dado }
const emVoo = new Map();      // id -> Promise

const valido = (id) => {
    const c = cache.get(id);
    return c && Date.now() - c.em < TTL_MS;
};

async function buscar(ids) {
    const faltam = ids.filter(id => !valido(id) && !emVoo.has(id));
    for (let i = 0; i < faltam.length; i += MAX_LOTE) {
        const parte = faltam.slice(i, i + MAX_LOTE);
        const p = clienteService.inadimplenciaLote(parte)
            .then(res => {
                const mapa = res?.data || res || {};
                parte.forEach(id => cache.set(id, { em: Date.now(), dado: mapa[id] || null }));
            })
            .catch(() => {
                // falha de rede: sem selo (nunca derruba a tela); tenta de novo mais tarde
                parte.forEach(id => cache.set(id, { em: Date.now() - TTL_MS + 5000, dado: null }));
            })
            .finally(() => parte.forEach(id => emVoo.delete(id)));
        parte.forEach(id => emVoo.set(id, p));
    }
    await Promise.all(ids.filter(id => emVoo.has(id)).map(id => emVoo.get(id)));
}

/**
 * useInadimplenciaLote(ids) -> { [clienteId]: situacao | null }
 * situacao = { inadimplente, totalVencido, parcelasVencidas, diasMaisAntiga, aConfirmar, bloqueiaVenda }
 */
export default function useInadimplenciaLote(ids) {
    const chave = useMemo(
        () => [...new Set((ids || []).filter(Boolean).map(String))].sort().join(','),
        [ids]
    );
    const [mapa, setMapa] = useState({});

    useEffect(() => {
        if (!chave) { setMapa({}); return undefined; }
        const lista = chave.split(',');
        let vivo = true;
        const montar = () => {
            const m = {};
            lista.forEach(id => { const c = cache.get(id); if (c && c.dado) m[id] = c.dado; });
            return m;
        };
        setMapa(montar());
        buscar(lista).then(() => { if (vivo) setMapa(montar()); });
        return () => { vivo = false; };
    }, [chave]);

    return mapa;
}

export { useInadimplenciaLote };
