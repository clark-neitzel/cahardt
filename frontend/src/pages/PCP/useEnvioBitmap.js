import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import impressaoEtiquetasService from '../../services/impressaoEtiquetasService';
import impressaoService from '../../services/impressaoService';

// Envio de etiqueta-IMAGEM para a fila (E3). Cópia enxuta do hook da cozinha — NÃO altera o da cozinha.
//
// fase: 'ocioso' | 'preparando' | 'enviando' | 'fila' | 'imprimindo' | 'saiu' | 'erro'
//   preparando = rasterizando no aparelho; enviando = POST; fila = na fila do PC da cozinha;
//   imprimindo = o agente já pegou; saiu = IMPRESSO.
// Retry: se o POST NÃO chegou a responder (rede), repete com a MESMA requisicaoId (o servidor é
// idempotente). Se o trabalho foi criado e falhou/expirou/foi cancelado, a tentativa nova usa
// requisicaoId NOVO — repetir o mesmo devolveria o trabalho antigo (CONTRATO-E3: "cancelar + reenviar").

const novoId = () => {
    try { if (window.crypto?.randomUUID) return window.crypto.randomUUID(); } catch { /* segue */ }
    return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
};

const POLL_RAPIDO_MS = 1500;
const POLL_LENTO_MS = 5000;
const POLL_MAX_MS = 17 * 60 * 1000; // a fila expira em 15 min
const MSG_ERRO_PADRAO = 'Não foi possível imprimir. Confira se a impressora está ligada com etiquetas e tente de novo.';

export default function useEnvioBitmap({ onTerminou } = {}) {
    const [fase, setFase] = useState('ocioso');
    const [info, setInfo] = useState({});
    const [erro, setErro] = useState('');
    const [semRetentativa, setSemRetentativa] = useState(false);
    const atual = useRef(0);
    const vivo = useRef(true);
    const timers = useRef(new Set());
    const postando = useRef(false);    // trava síncrona contra toque duplo
    const ultimo = useRef(null);       // { montar, nome, requisicaoId, payload, criou, trabalhoIds }
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

    // Acompanha TODOS os trabalhos devolvidos; o pior estado vale.
    const acompanhar = useCallback(async (ids, meuEnvio, nome) => {
        const inicio = Date.now();
        let falhasRede = 0;
        const estados = {};
        while (vivo.current && Date.now() - inicio < POLL_MAX_MS) {
            for (const id of ids) {
                if (estados[id]?.final) continue;
                try {
                    const t = await impressaoService.obterTrabalho(id);
                    falhasRede = 0;
                    estados[id] = { status: t.status, erro: t.erro, agenteOnline: t.agenteOnline, final: ['IMPRESSO', 'ERRO', 'EXPIRADO', 'CANCELADO'].includes(t.status) };
                } catch (e) {
                    falhasRede += 1;
                    if (e?.response?.status === 404) estados[id] = { status: 'ERRO', erro: 'A impressão não foi encontrada na fila.', final: true };
                    else if (falhasRede >= 4 && meuEnvio === atual.current) setInfo((i) => ({ ...i, semRede: true }));
                }
            }
            const lista = ids.map((id) => estados[id]).filter(Boolean);
            const eAtual = meuEnvio === atual.current;
            const ruim = lista.find((e) => ['ERRO', 'EXPIRADO', 'CANCELADO'].includes(e.status));
            if (ruim) {
                // envio obsoleto cancelado por quem pediu ("Cancelar e imprimir pelo navegador"): silencioso
                if (!eAtual && ruim.status === 'CANCELADO') return;
                const msg = ruim.status === 'EXPIRADO'
                    ? 'A etiqueta ficou muito tempo na fila e foi descartada. O computador da cozinha estava desligado ou sem resposta.'
                    : ruim.status === 'CANCELADO' ? 'A impressão foi cancelada.' : (ruim.erro || MSG_ERRO_PADRAO);
                if (eAtual) { setErro(msg); setFase('erro'); setInfo({}); } else toast.error(`${nome}: ${msg}`, { duration: 8000 });
                if (eAtual) cb.current?.('erro');
                return;
            }
            if (lista.length === ids.length && lista.every((e) => e.status === 'IMPRESSO')) {
                if (eAtual) { setFase('saiu'); setInfo({}); } else toast.success(`Saiu: ${nome}`);
                if (eAtual) cb.current?.('saiu');
                return;
            }
            if (eAtual && lista.length) {
                if (lista.some((e) => e.status === 'ENVIANDO' || e.status === 'IMPRESSO')) { setFase('imprimindo'); setInfo({}); }
                else {
                    setFase('fila');
                    setInfo((i) => ({ ...i, agenteOffline: lista.some((e) => e.agenteOnline === false), tentandoDeNovo: lista.some((e) => !!e.erro), aviso: lista.find((e) => e.erro)?.erro || i.aviso || '' }));
                }
            }
            await dormir(Date.now() - inicio > 60000 ? POLL_LENTO_MS : POLL_RAPIDO_MS);
        }
        if (vivo.current && meuEnvio === atual.current) {
            setErro('Não recebemos a confirmação da impressora. Confira se a etiqueta saiu antes de imprimir de novo.');
            setFase('erro');
        }
    }, []);

    // dados = { montar: async () => ({ bitmaps, sequencia? }), origem, impressoraId, referencia, copias, nome }
    const executar = useCallback(async (u) => {
        if (postando.current) return;
        postando.current = true;
        const meuEnvio = ++atual.current;
        setErro(''); setInfo({}); setSemRetentativa(false);
        try {
            if (!u.payload) {
                setFase('preparando');
                const { bitmaps, sequencia } = await u.montar();
                if (!vivo.current || meuEnvio !== atual.current) { postando.current = false; return; }
                u.payload = {
                    origem: u.origem, requisicaoId: u.requisicaoId,
                    ...(u.impressoraId ? { impressoraId: u.impressoraId } : {}),
                    ...(u.referencia ? { referencia: u.referencia } : {}),
                    ...(u.copias ? { copias: u.copias } : {}),
                    bitmaps, ...(sequencia ? { sequencia } : {}),
                };
            }
            setFase('enviando');
            const resp = await impressaoEtiquetasService.enviar({ ...u.payload, requisicaoId: u.requisicaoId });
            postando.current = false;
            u.criou = true;
            const ids = (resp?.trabalhos || []).map((t) => t.id).filter(Boolean);
            u.trabalhoIds = ids;
            if (!vivo.current) return;
            if (meuEnvio === atual.current) setInfo({ agenteOffline: resp?.agente?.estado === 'OFFLINE', aviso: resp?.aviso || '' });
            if (!ids.length) {
                if (meuEnvio === atual.current) { setErro('A etiqueta não entrou na fila. Toque em "Tentar de novo".'); setFase('erro'); }
                return;
            }
            setFase('fila');
            await acompanhar(ids, meuEnvio, u.nome);
        } catch (e) {
            postando.current = false;
            if (!vivo.current || meuEnvio !== atual.current) return;
            const d = e?.response?.data;
            const st = e?.response?.status;
            const falhaDeChunk = !e?.response && /dynamically imported|Importing a module script failed|Failed to fetch dynamically/i.test(String(e?.message));
            setSemRetentativa(!!e?.semRetentativa || (!!st && st >= 400 && st < 500 && st !== 408 && st !== 429));
            setErro(falhaDeChunk
                ? 'O app foi atualizado. Atualize a página (puxe para recarregar) e tente de novo.'
                : !e?.response && u.payload ? 'Sem conexão com o servidor. Nada foi enviado ainda — toque em "Tentar de novo".'
                : (d?.error || d?.message || (e?.response ? MSG_ERRO_PADRAO : (e?.message || MSG_ERRO_PADRAO))));
            setFase('erro');
        }
    }, [acompanhar]);

    const enviar = useCallback((dados) => {
        if (postando.current) return undefined;
        const u = { ...dados, requisicaoId: novoId(), payload: null, criou: false, trabalhoIds: [] };
        ultimo.current = u;
        return executar(u);
    }, [executar]);

    // "Tentar de novo": POST que não respondeu → mesma requisicaoId (idempotente); trabalho que
    // já existiu e falhou → requisicaoId NOVO (senão devolveria o trabalho antigo).
    const tentarDeNovo = useCallback(() => {
        const u = ultimo.current;
        if (!u || postando.current) return undefined;
        if (u.criou) { u.requisicaoId = novoId(); u.criou = false; u.trabalhoIds = []; }
        return executar(u);
    }, [executar]);

    // Cancela o que estiver PENDENTE na fila (evita etiqueta em dobro quando o PC voltar). 409 = já não está pendente.
    const cancelarPendentes = useCallback(async () => {
        const u = ultimo.current;
        const ids = u?.trabalhoIds || [];
        let falhou = false;
        for (const id of ids) {
            try { await impressaoEtiquetasService.cancelar(id); }
            catch (e) { if (e?.response?.status !== 409 && e?.response?.status !== 404) falhou = true; }
        }
        if (u) { u.requisicaoId = novoId(); u.criou = false; u.trabalhoIds = []; u.payload = u.payload ? { ...u.payload } : null; }
        atual.current += 1;
        postando.current = false;
        setFase('ocioso'); setInfo({}); setErro(''); setSemRetentativa(false);
        return !falhou;
    }, []);

    const limpar = useCallback(() => { atual.current += 1; postando.current = false; setFase('ocioso'); setInfo({}); setErro(''); setSemRetentativa(false); }, []);

    return { fase, info, erro, semRetentativa, enviar, tentarDeNovo, cancelarPendentes, limpar, ocupado: ['preparando', 'enviando'].includes(fase) };
}
