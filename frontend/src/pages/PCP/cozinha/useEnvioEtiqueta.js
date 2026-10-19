import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import etiquetaCozinhaService from '../../../services/etiquetaCozinhaService';
import impressaoService from '../../../services/impressaoService';

// Envio de uma etiqueta: POST /imprimir (idempotente por requisicaoId) + acompanhamento do
// trabalho da fila até IMPRESSO / ERRO / EXPIRADO. Nunca abre diálogo de impressão do navegador.
//
// fase: 'ocioso' | 'enviando' | 'fila' | 'imprimindo' | 'saiu' | 'erro'
// info: { agenteOffline, tentandoDeNovo, aviso }  (detalhes da fase 'fila')
// erro: mensagem humana (fase 'erro')

const novoId = () => {
    try { if (window.crypto?.randomUUID) return window.crypto.randomUUID(); } catch { /* segue */ }
    return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
};

const POLL_RAPIDO_MS = 1500;
const POLL_LENTO_MS = 5000;
const POLL_MAX_MS = 17 * 60 * 1000; // a fila expira em 15 min

const MSG_ERRO_PADRAO = 'Não foi possível imprimir. Confira se a impressora está ligada com etiquetas e tente de novo.';

export default function useEnvioEtiqueta({ onTerminou } = {}) {
    const [fase, setFase] = useState('ocioso');
    const [info, setInfo] = useState({});
    const [erro, setErro] = useState('');
    const [lote, setLote] = useState(null);
    const [semRetentativa, setSemRetentativa] = useState(false); // erro de validação (4xx): repetir o mesmo POST falharia igual
    const atual = useRef(0);          // identifica o envio "da tela" (os antigos continuam avisando por toast)
    const vivo = useRef(true);
    const timers = useRef(new Set());
    const postando = useRef(false);   // trava síncrona contra toque duplo (antes mesmo do re-render)
    const ultimo = useRef(null);      // { payload, requisicaoId, lote, quantidade }
    const cb = useRef(onTerminou);
    cb.current = onTerminou;

    useEffect(() => {
        vivo.current = true;
        const t = timers.current;
        return () => { vivo.current = false; t.forEach(clearTimeout); t.clear(); };
    }, []);

    const dormir = (ms) => new Promise((resolve) => {
        const t = setTimeout(() => { timers.current.delete(t); resolve(); }, ms);
        timers.current.add(t);
    });

    const acompanhar = useCallback(async (trabalhoId, meuEnvio, nome) => {
        const inicio = Date.now();
        let falhasRede = 0;
        while (vivo.current && Date.now() - inicio < POLL_MAX_MS) {
            let t = null;
            try {
                t = await impressaoService.obterTrabalho(trabalhoId);
                falhasRede = 0;
            } catch (e) {
                falhasRede += 1;
                if (e?.response?.status === 404) { t = { status: 'ERRO', erro: 'A impressão não foi encontrada na fila.' }; }
                else if (falhasRede >= 4 && meuEnvio === atual.current) {
                    setInfo(i => ({ ...i, semRede: true }));
                }
            }
            if (t) {
                const eAtual = meuEnvio === atual.current;
                if (t.status === 'IMPRESSO') {
                    if (eAtual) setFase('saiu'); else toast.success(`Saiu: ${nome}`);
                    cb.current?.('saiu');
                    return;
                }
                if (t.status === 'ERRO' || t.status === 'EXPIRADO' || t.status === 'CANCELADO') {
                    const msg = t.status === 'EXPIRADO'
                        ? 'A etiqueta ficou muito tempo na fila e foi descartada. O computador da cozinha estava desligado ou sem resposta.'
                        : (t.erro || MSG_ERRO_PADRAO);
                    if (eAtual) { setErro(msg); setFase('erro'); } else toast.error(`${nome}: ${msg}`, { duration: 8000 });
                    cb.current?.('erro');
                    return;
                }
                if (eAtual) {
                    if (t.status === 'ENVIANDO') { setFase('imprimindo'); setInfo({}); }
                    else {
                        setFase('fila');
                        setInfo({ agenteOffline: t.agenteOnline === false, tentandoDeNovo: !!t.erro, aviso: t.erro || '' });
                    }
                }
            }
            await dormir(Date.now() - inicio > 60000 ? POLL_LENTO_MS : POLL_RAPIDO_MS);
        }
        if (vivo.current && meuEnvio === atual.current) {
            setErro('Não recebemos a confirmação da impressora. Veja em "Hoje na cozinha" se a etiqueta saiu antes de imprimir de novo.');
            setFase('erro');
        }
    }, []);

    const iniciar = useCallback(async (execucao, nome, quantidade) => {
        if (postando.current) return;
        postando.current = true;
        const meuEnvio = ++atual.current;
        setFase('enviando'); setErro(''); setInfo({}); setSemRetentativa(false);
        try {
            const resp = await execucao();
            postando.current = false;
            const l = resp?.lote || null;
            if (!vivo.current) return;
            if (meuEnvio === atual.current) {
                setLote(l);
                setInfo({ agenteOffline: resp?.agente?.estado === 'OFFLINE', aviso: resp?.aviso || '' });
            }
            ultimo.current = { ...(ultimo.current || {}), lote: l, quantidade, nome };
            cb.current?.('criado');
            const tid = resp?.trabalho?.id;
            if (!tid) {
                // Lote ficou registrado mas não entrou na fila: avisar e oferecer "Tentar de novo" (reimprime o mesmo lote)
                if (meuEnvio === atual.current) {
                    setErro(resp?.aviso || 'O lote foi registrado, mas a etiqueta não entrou na fila. Toque em "Tentar de novo".');
                    setFase('erro');
                }
                return;
            }
            setFase(resp?.trabalho?.status === 'IMPRESSO' ? 'saiu' : 'fila');
            await acompanhar(tid, meuEnvio, nome);
        } catch (e) {
            postando.current = false;
            if (!vivo.current || meuEnvio !== atual.current) return;
            const d = e?.response?.data;
            const semResposta = !e?.response;
            const st = e?.response?.status;
            setSemRetentativa(!!st && st >= 400 && st < 500 && st !== 408 && st !== 429);
            setErro(semResposta
                ? 'Sem conexão com o servidor. Nada foi enviado ainda — toque em "Tentar de novo".'
                : (d?.error || d?.message || MSG_ERRO_PADRAO));
            setFase('erro');
        }
    }, [acompanhar]);

    // payload = corpo do POST /imprimir (sem requisicaoId)
    const enviar = useCallback((payload, nome) => {
        if (postando.current) return undefined;
        const requisicaoId = novoId();
        ultimo.current = { payload, requisicaoId, nome, quantidade: payload.quantidade, lote: null };
        setLote(null);
        return iniciar(() => etiquetaCozinhaService.imprimir({ ...payload, requisicaoId }), nome, payload.quantidade);
    }, [iniciar]);

    // Reimprime um lote que já existe (mesmo lote, trabalho novo)
    const reimprimir = useCallback((loteExistente, quantidade, nome) => {
        if (postando.current) return undefined;
        ultimo.current = { payload: null, requisicaoId: null, nome, quantidade, lote: loteExistente };
        setLote(loteExistente);
        return iniciar(() => etiquetaCozinhaService.reimprimir(loteExistente.id, { quantidade, requisicaoId: novoId() }), nome, quantidade);
    }, [iniciar]);

    // "Tentar de novo": se o lote já foi criado -> trabalho novo do MESMO lote; senão repete
    // o POST com o MESMO requisicaoId (a rede pode ter falhado depois do servidor gravar).
    const tentarDeNovo = useCallback(() => {
        const u = ultimo.current;
        if (!u) return;
        if (u.lote?.id) {
            return iniciar(() => etiquetaCozinhaService.reimprimir(u.lote.id, { quantidade: u.quantidade, requisicaoId: novoId() }), u.nome, u.quantidade);
        }
        if (u.payload) {
            return iniciar(() => etiquetaCozinhaService.imprimir({ ...u.payload, requisicaoId: u.requisicaoId }), u.nome, u.quantidade);
        }
    }, [iniciar]);

    const limpar = useCallback(() => { atual.current += 1; setFase('ocioso'); setInfo({}); setErro(''); setSemRetentativa(false); }, []);

    return { fase, info, erro, lote, semRetentativa, enviar, reimprimir, tentarDeNovo, limpar, ocupado: fase === 'enviando' };
}
