import { useEffect, useState } from 'react';
import comoFazerService, { mensagemErro, naRotaTablet } from '../../../services/comoFazerService';

// Quem sou eu no módulo (funcionário, setores e o que posso fazer). Vem do servidor — o front só espelha.
export function useComoFazerMe() {
    const [me, setMe] = useState(null);
    const [erro, setErro] = useState('');
    useEffect(() => {
        let vivo = true;
        comoFazerService.me()
            .then((d) => { if (vivo) setMe(d); })
            .catch((e) => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, []);
    const pode = me?.pode || {};
    return { me, erro, pode: { confirmar: pode.confirmar === true, editar: pode.editar === true, painel: pode.painel === true, ver: pode.ver === true }, semCadastro: me?.semCadastro === true };
}

// Menu: o usuário pode ver o Como Fazer? Pergunta ao servidor 1x por usuário logado (cache de módulo) e
// relê ao voltar o foco da aba (no máx. a cada 5 min). Carregando ou falhou => false (item escondido);
// FALHA nunca é gravada no cache (tenta de novo 1x após 5s). Nunca roda no tablet (/setor/*) nem sem usuário.
const REVALIDAR_MS = 5 * 60 * 1000;
const cacheVer = new Map(); // chave do usuário -> { ver: boolean, ts: number } | { carregando: true }
export function usePodeVerComoFazer(chaveUsuario) {
    const [, forcar] = useState(0);
    useEffect(() => {
        if (chaveUsuario == null) { cacheVer.clear(); return undefined; } // logout: login novo não herda
        if (naRotaTablet()) return undefined;
        let vivo = true;
        let timer = 0;
        const buscar = (tentativa = 0) => {
            const atual = cacheVer.get(chaveUsuario);
            if (atual?.carregando) return;
            cacheVer.set(chaveUsuario, { ...(atual || {}), carregando: true });
            comoFazerService.me()
                .then((d) => { cacheVer.set(chaveUsuario, { ver: d?.pode?.ver === true, ts: Date.now() }); })
                .catch(() => {
                    // falha: mantém o último valor bom (ou nada) — sem gravar false
                    if (atual?.ts) cacheVer.set(chaveUsuario, { ver: atual.ver, ts: atual.ts });
                    else cacheVer.delete(chaveUsuario);
                    if (tentativa < 1 && vivo) timer = setTimeout(() => buscar(tentativa + 1), 5000);
                })
                .finally(() => forcar((n) => n + 1));
        };
        const e = cacheVer.get(chaveUsuario);
        if (!e || (!e.carregando && Date.now() - (e.ts || 0) > REVALIDAR_MS)) buscar();
        const aoVoltar = () => {
            if (document.visibilityState !== 'visible') return;
            const c = cacheVer.get(chaveUsuario);
            if (!c?.carregando && Date.now() - (c?.ts || 0) > REVALIDAR_MS) buscar();
        };
        document.addEventListener('visibilitychange', aoVoltar);
        return () => { vivo = false; clearTimeout(timer); document.removeEventListener('visibilitychange', aoVoltar); };
    }, [chaveUsuario]);
    return cacheVer.get(chaveUsuario)?.ver === true;
}
