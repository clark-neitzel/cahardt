import { useEffect, useState } from 'react';
import comoFazerService, { lerSessaoTablet, gravarSessaoTablet, limparSessaoTablet } from '../../../services/comoFazerService';

const INATIVIDADE_MS = 2 * 60 * 1000;   // 2 min sem tocar → volta para a grade de fotos
const RENOVAR_A_CADA_MS = 30 * 1000;    // no máximo 1 renovação do token a cada 30 s de atividade

/** Sessão do tablet (token curto em sessionStorage). Só é montado em /setor/:slug. */
export function useSessaoTablet() {
    const [sessao, setSessao] = useState(lerSessaoTablet);
    const ativa = !!sessao;

    useEffect(() => {
        const atualizar = () => setSessao(lerSessaoTablet());
        window.addEventListener('cf:sessao', atualizar);
        return () => window.removeEventListener('cf:sessao', atualizar);
    }, []);

    useEffect(() => {
        if (!ativa) return undefined;
        let timer = null;
        let ultimaRenovacao = Date.now();
        let renovando = false;

        const aoAtividade = () => {
            clearTimeout(timer);
            timer = setTimeout(() => limparSessaoTablet(), INATIVIDADE_MS);
            if (!renovando && Date.now() - ultimaRenovacao > RENOVAR_A_CADA_MS) {
                renovando = true;
                ultimaRenovacao = Date.now();
                comoFazerService.renovar()
                    .then((r) => {
                        const atual = lerSessaoTablet();
                        if (atual && r?.token) gravarSessaoTablet({ ...atual, token: r.token, expiraEm: r.expiraEm });
                    })
                    .catch(() => { /* 401 já derruba a sessão no interceptor; rede ruim tenta de novo no próximo toque */ })
                    .finally(() => { renovando = false; });
            }
        };

        const eventos = ['pointerdown', 'keydown', 'touchstart', 'touchmove', 'scroll'];
        eventos.forEach((ev) => window.addEventListener(ev, aoAtividade, { passive: true, capture: true }));
        aoAtividade();
        return () => {
            clearTimeout(timer);
            eventos.forEach((ev) => window.removeEventListener(ev, aoAtividade, { capture: true }));
        };
    }, [ativa]);

    return sessao;
}
