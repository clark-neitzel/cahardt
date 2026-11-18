// Separação de Carga — orquestra TUDO que não é desenho: estado, toques, gravação no aparelho a cada toque,
// fila de envio ao servidor, fila de etiquetas, internet de verdade, relógio corrigido e "A carga mudou".
// Regras (PLANO seções 2 e 4):
//  • cada toque grava no localStorage de forma SÍNCRONA, antes de qualquer rede;
//  • valor ABSOLUTO por linha + carimbo `c`; o servidor deixa valer o último toque por linha;
//  • envio single-flight, em lotes de 200, backoff 5 s → 60 s; reenviar é seguro (idempotente);
//  • etiqueta guardada offline só sai com UM toque em "Imprimir agora" — nunca automático.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import separacaoCargaService from '../../../services/separacaoCargaService';
import impressaoEtiquetasService from '../../../services/impressaoEtiquetasService';
import {
    celula, chaveCarga, chavePedido, diffCarga, estadoVazio, indexarCarga, mesclarEstado, MOTIVO_NAO_TEM,
} from './separacaoCalculo';
import {
    dadosVazios, gravarCarga, gravarDados, gravarUltima, lerCarga, lerDados, lerUltima, limparAntigas, listarCargasBaixadas,
} from './separacaoStorage';

const TAM_LOTE = 200;
const MAX_BOLSAS = 20;

const novoId = () => {
    try { if (window.crypto?.randomUUID) return window.crypto.randomUUID(); } catch { /* segue */ }
    return 'sep-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
};

// id fixo deste aparelho (8..80, [A-Za-z0-9-]) — o servidor só usa para log
function idDoAparelho() {
    const k = 'separacao_carga_v1:aparelho';
    try {
        let v = localStorage.getItem(k);
        if (!v || !/^[A-Za-z0-9-]{8,80}$/.test(v)) { v = novoId().replace(/[^A-Za-z0-9-]/g, '').slice(0, 60); if (v.length < 8) v = `apar-${Date.now()}`; localStorage.setItem(k, v); }
        return v;
    } catch { return `apar-${Date.now().toString(36)}`; }
}
function nomeDoAparelho() {
    const ua = navigator.userAgent || '';
    const tipo = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? (navigator.maxTouchPoints > 1 ? 'iPad' : 'Mac') : /Windows/.test(ua) ? 'Windows' : 'Aparelho';
    return tipo.slice(0, 60);
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const arred = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Re-busca os arquivos da casca do app para o service worker guardá-los (abrir sem sinal depois). */
function aquecerCache() {
    try {
        import('../../PCP/etiquetaRaster').catch(() => { });
        import('./etiquetaBolsa').catch(() => { });
        import('html2canvas').catch(() => { });
        import('../../RH/etiquetasFuncionario').then((m) => m.carregarFontesFuncionario?.()).catch(() => { });
        const urls = new Set();
        performance.getEntriesByType('resource').forEach((r) => urls.add(r.name));
        document.querySelectorAll('link[rel="modulepreload"],link[rel="stylesheet"],script[src]').forEach((el) => urls.add(el.href || el.src));
        urls.forEach((u) => {
            try {
                const url = new URL(u, location.href);
                if (url.origin === location.origin && url.pathname.startsWith('/assets/')) fetch(url.href).catch(() => { });
            } catch { /* url inválida */ }
        });
    } catch { /* aquecimento é secundário */ }
}

export default function useSeparacaoCarga({ impressoraId, impressorasProntas = false, precisaEscolherImpressora = false } = {}) {
    const { user } = useAuth();
    const uid = user?.id || null;
    const nomeUser = user?.nome || null;

    const [info, setInfo] = useState(null);           // { carga, baixadoEm, desvioRelogioMs }
    const [dados, setDados] = useState(dadosVazios);
    const [navOnline, setNavOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    const [semRede, setSemRede] = useState(false);
    const [sincronizando, setSincronizando] = useState(false);
    const [cargas, setCargas] = useState(null);       // lista do servidor (null = ainda não veio)
    const [erroLista, setErroLista] = useState('');
    const [baixadas, setBaixadas] = useState([]);
    const [abrindo, setAbrindo] = useState(false);
    const [erroServidor, setErroServidor] = useState(''); // o envio está parado por um motivo que NÃO é falta de internet (o aparelho guarda tudo)
    const [memoriaCheia, setMemoriaCheia] = useState(false);
    const [semControladorSW, setSemControladorSW] = useState(false);
    const [prontoParaCamara, setProntoParaCamara] = useState(false);

    const refs = useRef({ info: null, dados: dadosVazios(), desvio: 0, embarqueId: null, falhas: 0, voando: false, etqVoando: false, parado: false, impressoraId, impressorasProntas, precisaEscolher: precisaEscolherImpressora });
    refs.current.impressoraId = impressoraId;
    refs.current.impressorasProntas = impressorasProntas;
    refs.current.precisaEscolher = precisaEscolherImpressora;
    const R = refs.current;

    // ───────────── gravação ─────────────
    const persistir = useCallback((novos) => {
        R.dados = novos;
        if (R.embarqueId && uid) {
            const ok = gravarDados(uid, R.embarqueId, novos);
            setMemoriaCheia(!ok);
        }
        setDados(novos);
    }, [uid, R]);

    // altera uma cópia, grava NA HORA (síncrono) e só então devolve — nada de rede aqui
    const mutar = useCallback((fn) => {
        // Instância já desmontada (o envio do unmount terminou depois): a memória dela está VELHA — a tela pode ter sido
        // remontada e a pessoa tocado de novo. Relê o que está guardado no aparelho (sempre o mais novo) e aplica a
        // resposta em cima; as regras por carimbo (`c`) de quem chama garantem que o toque mais novo vence.
        if (R.morto && R.embarqueId && uid) R.dados = lerDados(uid, R.embarqueId);
        const d = clone(R.dados);
        fn(d);
        persistir(d);
        return d;
    }, [persistir, R, uid]);

    const agoraMs = () => Date.now() + (R.desvio || 0);
    const carimbo = (anterior) => {
        const ant = anterior ? Date.parse(anterior) : 0;
        return new Date(Math.max(agoraMs(), (Number.isFinite(ant) ? ant : 0) + 1)).toISOString();
    };

    const idx = useMemo(() => indexarCarga(info?.carga), [info]);
    const idxRef = useRef(idx); idxRef.current = idx;

    // ───────────── ativar uma carga neste aparelho ─────────────
    const ativar = useCallback((infoNova, dadosNovos) => {
        const id = infoNova.carga.id;
        R.embarqueId = id;
        R.info = infoNova;
        R.desvio = infoNova.desvioRelogioMs || 0;
        R.falhas = 0;
        R.parado = false;
        // etiqueta que ficou "ENVIANDO" quando a tela fechou volta para a fila (o servidor é idempotente por requisicaoId)
        const d = { ...dadosNovos, etiquetas: (dadosNovos.etiquetas || []).map((e) => (e.status === 'ENVIANDO' ? { ...e, status: 'AGUARDANDO' } : e)) };
        setInfo(infoNova);
        setErroServidor('');
        persistir(d);
        if (uid) gravarUltima(uid, id);
    }, [persistir, R, uid]);

    // ───────────── aviso "A carga mudou" ─────────────
    const registrarMudanca = useCallback((nova) => {
        const antiga = R.info?.carga;
        const diff = diffCarga(antiga, nova.carga);
        if (!diff.mudou) {
            // só a assinatura/ordem mudou: adota sem incomodar
            const novaInfo = { carga: nova.carga, baixadoEm: new Date().toISOString(), desvioRelogioMs: R.desvio };
            if (uid) gravarCarga(uid, nova.carga.id, novaInfo);
            R.info = novaInfo; setInfo(novaInfo);
            return;
        }
        const idxNovo = indexarCarga(nova.carga);
        const descartados = (R.dados.sujo.linhas || []).filter((k) => !idxNovo.pedir.has(k)).length
            + (R.dados.sujo.pedidos || []).filter((p) => !idxNovo.pedidos.has(p)).length;
        mutar((d) => { d.mudou = { nova: { carga: nova.carga, estado: nova.estado, agora: nova.agora }, diff, descartados }; });
    }, [mutar, uid, R]);

    const conferirAssinatura = useCallback(async (assinaturaServidor) => {
        const atual = R.info?.carga;
        if (!atual || !assinaturaServidor || assinaturaServidor === atual.assinatura || R.dados.mudou) return;
        try {
            const nova = await separacaoCargaService.baixar(atual.id);
            if (nova?.carga && nova.carga.assinatura !== atual.assinatura) registrarMudanca(nova);
        } catch { /* sem sinal: confere na próxima */ }
    }, [registrarMudanca, R]);

    const confirmarMudanca = useCallback(() => {
        const m = R.dados.mudou;
        if (!m) return;
        const novaInfo = { carga: m.nova.carga, baixadoEm: new Date().toISOString(), desvioRelogioMs: R.desvio };
        if (uid) gravarCarga(uid, m.nova.carga.id, novaInfo);
        const idxNovo = indexarCarga(m.nova.carga);
        R.info = novaInfo; setInfo(novaInfo);
        mutar((d) => {
            // toque de pedido/produto que saiu da carga: some da fila (o servidor guarda o que já recebeu)
            d.sujo.linhas = d.sujo.linhas.filter((k) => idxNovo.pedir.has(k));
            d.sujo.pedidos = d.sujo.pedidos.filter((p) => idxNovo.pedidos.has(p));
            d.etiquetas = d.etiquetas.filter((e) => idxNovo.pedidos.has(e.pedidoId));
            if (d.estado.ordem?.manual) d.estado.ordem.manual = d.estado.ordem.manual.filter((p) => idxNovo.pedidos.has(p));
            d.estado = mesclarEstado(d.estado, m.nova.estado);
            d.mudou = null;
        });
    }, [mutar, uid, R]);

    // ───────────── envio ao servidor ─────────────
    const montarOps = (d) => {
        const ops = [];
        d.sujo.linhas.forEach((k) => {
            const l = d.estado.linhas[k];
            if (l) ops.push({ t: 'L', k, q: arred(l.q), tocada: !!l.t, m: l.m || null, c: l.c });
        });
        d.sujo.pedidos.forEach((p) => {
            const x = d.estado.pedidos[p];
            if (x) ops.push({ t: 'P', p, b: x.b || 0, c: x.c });
        });
        if (d.sujo.ordem && d.estado.ordem?.c) {
            ops.push({ t: 'O', regra: d.estado.ordem.regra, manual: d.estado.ordem.manual || [], c: d.estado.ordem.c });
        }
        d.concluir.forEach((x) => ops.push({ t: 'X', requisicaoId: x.requisicaoId, modo: x.modo, c: x.c }));
        return ops;
    };

    // `manual` = botão "Tentar de novo": ignora a parada automática (403/404) e tenta mesmo com o aviso de "sem internet".
    const sincronizar = useCallback(async ({ manual = false } = {}) => {
        const embarqueId = R.embarqueId;
        if (!embarqueId || R.voando) return;
        if (R.parado && !manual) return;
        if (!manual && typeof navigator !== 'undefined' && navigator.onLine === false) return;
        R.voando = true; setSincronizando(true);
        try {
            const ops = montarOps(R.dados);
            const lotes = [];
            for (let i = 0; i < ops.length; i += TAM_LOTE) lotes.push(ops.slice(i, i + TAM_LOTE));
            if (!lotes.length) lotes.push([]);   // "puxar" o que os outros aparelhos fizeram
            let ultimaResp = null;
            for (const lote of lotes) {
                if (R.embarqueId !== embarqueId) return;   // trocou de carga no meio: este laço morre aqui
                const resp = await separacaoCargaService.sincronizar(embarqueId, { loteId: idDoAparelho(), aparelho: nomeDoAparelho(), ops: lote });
                // a resposta é da carga ANTIGA: não pode ser aplicada na que está aberta agora
                if (R.embarqueId !== embarqueId) return;
                ultimaResp = resp;
                if (resp?.agora) { const dv = Date.parse(resp.agora) - Date.now(); if (Number.isFinite(dv)) R.desvio = dv; }
                mutar((d) => {
                    // 1) tira da fila só o que foi enviado COM O MESMO carimbo (se a pessoa tocou de novo no meio do voo, continua sujo)
                    lote.forEach((op) => {
                        if (op.t === 'L' && d.estado.linhas[op.k]?.c === op.c) d.sujo.linhas = d.sujo.linhas.filter((k) => k !== op.k);
                        if (op.t === 'P' && d.estado.pedidos[op.p]?.c === op.c) d.sujo.pedidos = d.sujo.pedidos.filter((p) => p !== op.p);
                        if (op.t === 'O' && d.estado.ordem?.c === op.c) d.sujo.ordem = false;
                        if (op.t === 'X') d.concluir = d.concluir.filter((x) => x.requisicaoId !== op.requisicaoId);
                    });
                    // 2) adota o que o servidor devolveu (vence o carimbo maior; normalização do servidor entra aqui)
                    if (resp?.estado) {
                        const srv = resp.estado;
                        const loc = d.estado;
                        const resultado = mesclarEstado(loc, srv);
                        // conclusão local ainda não confirmada continua valendo se for mais nova
                        if (loc.conclusao?.local && d.concluir.some((x) => x.requisicaoId === loc.conclusao.id)) resultado.conclusao = loc.conclusao;
                        d.estado = resultado;
                    }
                });
            }
            R.falhas = 0;
            R.parado = false;
            setSemRede(false);
            setErroServidor('');
            if (ultimaResp?.assinatura) conferirAssinatura(ultimaResp.assinatura);
        } catch (e) {
            if (R.embarqueId !== embarqueId) return;
            const status = e?.response?.status;
            // NUNCA descarta toque: o que não saiu continua na fila do aparelho.
            if (status === 404) {
                R.parado = true;   // não adianta insistir sozinho; o botão "Tentar de novo" tenta
                setErroServidor('Esta carga não existe mais no sistema.');
            } else if (status === 403) {
                R.parado = true;
                setErroServidor('Você não tem permissão para separar cargas.');
            } else if (status === 400) {
                R.falhas += 1;     // volta a tentar com espera crescente (pode ser um lote com problema que o escritório conserta)
                setErroServidor(e?.response?.data?.error || 'O sistema recusou o envio.');
            } else if (status) {
                R.falhas += 1;     // 5xx: o servidor está com problema agora — tenta de novo com espera crescente
                setErroServidor('O sistema está com problema neste momento.');
            } else {
                // sem resposta (rede): fila mantida, tenta de novo com espera crescente
                R.falhas += 1;
                setSemRede(true);
            }
        } finally {
            R.voando = false; setSincronizando(false);
        }
    }, [mutar, conferirAssinatura, R]);

    const sincRef = useRef(sincronizar); sincRef.current = sincronizar;
    const tentarDeNovo = useCallback(() => { R.parado = false; R.falhas = 0; return sincRef.current({ manual: true }); }, [R]);
    const timerToque = useRef(null);
    const agendarEnvio = useCallback(() => {
        clearTimeout(timerToque.current);
        timerToque.current = setTimeout(() => sincRef.current(), 1500);
    }, []);

    // laço: a cada 30 s (ou com backoff 5 s → 60 s se estiver falhando) envia o que está sujo / puxa dos outros aparelhos
    useEffect(() => {
        if (!info?.carga?.id) return undefined;
        let vivo = true;   // um por carga: o laço antigo nunca "ressuscita" quando a carga troca
        let t;
        const volta = () => {
            const f = R.falhas;
            const espera = f ? Math.min(60000, 5000 * 2 ** (f - 1)) : 30000;
            t = setTimeout(async () => {
                if (!vivo) return;
                await sincRef.current();
                if (!vivo) return;
                etqRef.current({ manual: false });
                volta();
            }, espera);
        };
        volta();
        return () => { vivo = false; clearTimeout(t); clearTimeout(timerToque.current); };
    }, [info?.carga?.id, R]);

    // internet: eventos do navegador + tentativa ao voltar para a tela; e ENVIO ao sair (best-effort: fechar a aba,
    // esconder o app, trocar de tela) — toque pendente não deve esperar a tela voltar a abrir.
    useEffect(() => {
        R.morto = false;   // (remontagem do StrictMode reaproveita a ref)
        const on = () => { setNavOnline(true); R.falhas = 0; sincRef.current(); etqRef.current({ manual: false }); listarRef.current(); };
        const off = () => setNavOnline(false);
        const vis = () => {
            if (document.visibilityState === 'visible') { sincRef.current(); etqRef.current({ manual: false }); }
            else sincRef.current();
        };
        const sair = () => { sincRef.current(); };
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        window.addEventListener('pagehide', sair);
        document.addEventListener('visibilitychange', vis);
        return () => {
            window.removeEventListener('online', on); window.removeEventListener('offline', off);
            window.removeEventListener('pagehide', sair); document.removeEventListener('visibilitychange', vis);
            R.morto = true;
            sair();   // desmontou (saiu da tela): dispara o envio do que ficou pendente, sem esperar
        };
    }, [R]);

    // ───────────── cargas disponíveis ─────────────
    const listar = useCallback(async () => {
        if (uid) setBaixadas(listarCargasBaixadas(uid));
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        try {
            const r = await separacaoCargaService.listar();
            setCargas(Array.isArray(r?.cargas) ? r.cargas : []);
            setErroLista('');
            setSemRede(false);
        } catch (e) {
            const s = e?.response?.status;
            if (s === 403) setErroLista('Você não tem permissão para separar cargas.');
            else if (!e?.response) setSemRede(true);
            else setErroLista(e?.response?.data?.error || 'Não foi possível carregar as cargas.');
        }
    }, [uid]);
    const listarRef = useRef(listar); listarRef.current = listar;

    // abrir/baixar uma carga (precisa de sinal)
    const abrirCarga = useCallback(async (id) => {
        if (!uid || abrindo) return false;
        setAbrindo(true);
        try {
            const r = await separacaoCargaService.baixar(id);
            const desvio = r?.agora ? Date.parse(r.agora) - Date.now() : 0;
            const baixada = { carga: r.carga, baixadoEm: new Date().toISOString(), desvioRelogioMs: Number.isFinite(desvio) ? desvio : 0 };
            const local = lerDados(uid, id);
            const antiga = lerCarga(uid, id);
            // "trabalho local" = qualquer coisa que a pessoa fez nesta carga, mesmo já enviada (fila vazia não quer dizer sem trabalho)
            const temTrabalho = Object.keys(local.estado?.linhas || {}).length > 0
                || Object.values(local.estado?.pedidos || {}).some((x) => (x?.b || 0) > 0)
                || !!local.estado?.conclusao
                || local.sujo.linhas.length > 0 || local.sujo.pedidos.length > 0 || !!local.sujo.ordem
                || local.concluir.length > 0 || local.etiquetas.length > 0;
            const mudou = antiga?.carga && antiga.carga.assinatura !== r.carga.assinatura;
            if (mudou && temTrabalho) {
                // há trabalho no aparelho e a carga é outra: mostra o aviso ANTES de trocar
                ativar(antiga, { ...local, estado: mesclarEstado(local.estado, r.estado) });
                R.info = antiga;
                registrarMudanca(r);
            } else {
                gravarCarga(uid, id, baixada);
                ativar(baixada, { ...local, estado: mesclarEstado(local.estado, r.estado), mudou: null });
            }
            setProntoParaCamara(true);
            setSemControladorSW(import.meta.env.PROD && 'serviceWorker' in navigator && !navigator.serviceWorker.controller);
            aquecerCache();
            limparAntigas(uid);
            setBaixadas(listarCargasBaixadas(uid));
            setSemRede(false);
            return true;
        } catch (e) {
            const s = e?.response?.status;
            toast.error(s === 404 ? 'Esta carga não está mais disponível.' : s === 403 ? 'Você não tem permissão para separar cargas.' : !e?.response ? 'Sem sinal para baixar a carga. Tente com internet.' : (e?.response?.data?.error || 'Não foi possível baixar a carga.'));
            if (!e?.response) setSemRede(true);
            return false;
        } finally { setAbrindo(false); }
    }, [uid, abrindo, ativar, registrarMudanca, R]);

    // carga baixada antes (funciona sem internet)
    const abrirBaixada = useCallback((id) => {
        if (!uid) return false;
        const c = lerCarga(uid, id);
        if (!c?.carga) { toast.error('Esta carga não está guardada neste aparelho.'); return false; }
        ativar(c, lerDados(uid, id));
        setProntoParaCamara(true);
        return true;
    }, [uid, ativar]);

    const trocarCarga = useCallback((id) => {
        if (R.embarqueId === id) return true;
        // sem sinal só dá para abrir as que já estão no aparelho
        if (navigator.onLine === false) return abrirBaixada(id);
        return abrirCarga(id);
    }, [abrirBaixada, abrirCarga, R]);

    // ao entrar: reabre a carga em andamento (a que estava aberta) direto do aparelho
    const iniciou = useRef(false);
    useEffect(() => {
        if (!uid || iniciou.current) return;
        iniciou.current = true;
        setBaixadas(listarCargasBaixadas(uid));
        const ult = lerUltima(uid);
        if (ult && abrirBaixada(ult)) {
            setSemControladorSW(import.meta.env.PROD && 'serviceWorker' in navigator && !navigator.serviceWorker.controller);
            setTimeout(() => sincRef.current(), 400);
        }
        listar();
    }, [uid, abrirBaixada, listar]);

    // ───────────── toques ─────────────
    const tocarLinha = useCallback((k, mudar) => {
        const q = idxRef.current.pedir.get(k);
        if (q == null) return;
        mutar((d) => {
            const l = d.estado.linhas[k] ? { ...d.estado.linhas[k] } : { q: 0, t: false, m: null, c: null };
            mudar(l, q);
            if (!l.t) { l.q = 0; l.m = null; }
            l.q = arred(Math.max(0, Math.min(q, l.q)));
            if (l.q >= q) l.m = null;
            l.c = carimbo(l.c);
            l.por = nomeUser;
            d.estado.linhas[k] = l;
            if (!d.sujo.linhas.includes(k)) d.sujo.linhas.push(k);
        });
        agendarEnvio();
    }, [mutar, agendarEnvio, nomeUser]); // eslint-disable-line react-hooks/exhaustive-deps

    const mais = (k) => tocarLinha(k, (l, q) => { l.q = Math.min(q, arred(l.q) + 1); l.t = true; });
    const menos = (k) => tocarLinha(k, (l) => { l.q = Math.max(0, arred(l.q) - 1); l.t = true; });
    const tudo = (k) => tocarLinha(k, (l, q) => {
        if (arred(l.q) >= q && l.t) { l.q = 0; l.t = false; } else { l.q = q; l.t = true; }
        l.m = null;
    });
    const digitar = (k, valor) => tocarLinha(k, (l) => { l.q = Math.max(0, Number(valor) || 0); l.t = true; });
    const motivo = (k, m) => tocarLinha(k, (l) => { l.m = l.m === m ? null : m; l.t = true; });

    const mudarBolsas = useCallback((pedidoId, valor) => {
        const b = Math.max(0, Math.min(MAX_BOLSAS, Math.round(Number(valor) || 0)));
        mutar((d) => {
            // a fila de etiquetas acompanha a tela: pedido ainda esperando (AGUARDANDO/ERRO) com outra quantidade → atualiza
            // (id novo, senão o servidor acha repetido); 0 bolsas → sai da fila. Item ENVIANDO não muda.
            const i = d.etiquetas.findIndex((e) => e.pedidoId === pedidoId && e.status !== 'ENVIANDO');
            if (i >= 0) {
                if (b === 0) d.etiquetas.splice(i, 1);
                else if (d.etiquetas[i].bolsas !== b) d.etiquetas[i] = { ...d.etiquetas[i], bolsas: b, requisicaoId: novoId(), status: 'AGUARDANDO', erro: null, exigeToque: d.etiquetas[i].exigeToque || d.etiquetas[i].status === 'ERRO' }; // etiqueta nunca sai sozinha após erro/offline
            }
            const x = d.estado.pedidos[pedidoId] || { b: 0, c: null };
            d.estado.pedidos[pedidoId] = { b, c: carimbo(x.c) };
            if (!d.sujo.pedidos.includes(pedidoId)) d.sujo.pedidos.push(pedidoId);
        });
        agendarEnvio();
    }, [mutar, agendarEnvio]); // eslint-disable-line react-hooks/exhaustive-deps

    const gravarOrdem = useCallback((regra, manual) => {
        mutar((d) => {
            d.estado.ordem = { regra, manual: manual || [], c: carimbo(d.estado.ordem?.c) };
            d.sujo.ordem = true;
        });
        agendarEnvio();
    }, [mutar, agendarEnvio]); // eslint-disable-line react-hooks/exhaustive-deps
    const trocarRegra = (regra) => gravarOrdem(regra, R.dados.estado.ordem?.manual || []);
    const numerar = (pedidoId) => {
        const man = [...(R.dados.estado.ordem?.manual || [])];
        const i = man.indexOf(pedidoId);
        if (i >= 0) man.splice(i, 1); else man.push(pedidoId);
        gravarOrdem('MANUAL', man);
    };
    const limparOrdem = () => gravarOrdem('MANUAL', []);

    const concluir = useCallback((modo) => {
        const requisicaoId = novoId();
        const c = carimbo(null);
        mutar((d) => {
            d.concluir.push({ requisicaoId, modo, c });
            d.estado.conclusao = { id: requisicaoId, modo, em: c, porNome: nomeUser, resumo: null, local: true };
        });
        setTimeout(() => sincRef.current(), 200);
    }, [mutar, nomeUser]); // eslint-disable-line react-hooks/exhaustive-deps

    // ───────────── etiquetas (bolsas) ─────────────
    const enviarEtiquetas = useCallback(async ({ manual }) => {
        if (R.etqVoando || !R.embarqueId) return;
        const online = navigator.onLine !== false;
        if (!online) return;
        // só envia com a lista de impressoras carregada; com mais de uma e nenhuma escolhida, espera a escolha (item fica AGUARDANDO)
        if (!R.impressorasProntas) { if (manual) toast('Aguarde: carregando a lista de impressoras…'); return; }
        if (R.precisaEscolher) { if (manual) toast('Escolha a impressora na faixa de etiquetas.'); return; }
        const alvo = (e) => e.status !== 'ENVIANDO' && (manual || !e.exigeToque) && (manual || e.status !== 'ERRO');
        if (!R.dados.etiquetas.some(alvo)) return;
        R.etqVoando = true;
        try {
            if (manual) mutar((d) => { d.etiquetas.forEach((e) => { e.exigeToque = false; if (e.status === 'ERRO') e.status = 'AGUARDANDO'; }); });
            let enviadas = 0;
            const ordem = [...R.dados.etiquetas].filter(alvo).sort((a, b) => a.ordem - b.ordem);
            for (const it of ordem) {
                mutar((d) => { const x = d.etiquetas.find((e) => e.pedidoId === it.pedidoId); if (x) { x.status = 'ENVIANDO'; x.erro = null; } });
                try {
                    const { prepararEtiquetasBolsas } = await import('./etiquetaBolsa');
                    const { bitmaps, sequencia } = await prepararEtiquetasBolsas(it.dados, it.bolsas);
                    await impressaoEtiquetasService.enviar({
                        origem: 'SEPARACAO', requisicaoId: it.requisicaoId,
                        ...(R.impressoraId ? { impressoraId: R.impressoraId } : {}),
                        referencia: { tipo: 'PEDIDO', id: it.pedidoId, rotulo: `Bolsas Carga #${it.dados.cargaNumero} · ${it.dados.etiqueta} — ${it.dados.cliente}`.slice(0, 200) },
                        bitmaps, sequencia,
                    });
                    mutar((d) => { d.etiquetas = d.etiquetas.filter((e) => !(e.pedidoId === it.pedidoId && e.requisicaoId === it.requisicaoId)); });
                    enviadas += 1;
                } catch (e) {
                    if (!e?.response && !e?.semRetentativa) {
                        // sem rede: volta para a fila com a MESMA requisicaoId e para por aqui
                        mutar((d) => { const x = d.etiquetas.find((z) => z.pedidoId === it.pedidoId); if (x) x.status = 'AGUARDANDO'; });
                        setSemRede(true);
                        break;
                    }
                    const msg = e?.response?.data?.error || e?.message || 'Não foi possível imprimir.';
                    mutar((d) => { const x = d.etiquetas.find((z) => z.pedidoId === it.pedidoId); if (x) { x.status = 'ERRO'; x.erro = msg; } });
                }
            }
            if (enviadas && manual) toast.success(`${enviadas} pedido${enviadas > 1 ? 's' : ''} enviado${enviadas > 1 ? 's' : ''} para a impressora, na ordem em que você separou.`);
        } finally { R.etqVoando = false; }
    }, [mutar, R]);
    const etqRef = useRef(enviarEtiquetas); etqRef.current = enviarEtiquetas;
    // lista de impressoras chegou / impressora escolhida: libera o que estava esperando (itens "exigeToque" continuam esperando o toque)
    useEffect(() => {
        if (impressorasProntas && !precisaEscolherImpressora) etqRef.current({ manual: false });
    }, [impressorasProntas, precisaEscolherImpressora, impressoraId]);

    /** "Imprimir N etiquetas" do pedido aberto. Online: sai na hora (o toque é o ato do usuário). Offline: fica guardada. */
    const imprimirBolsas = useCallback((ped) => {
        const b = R.dados.estado.pedidos[ped.id]?.b || 0;
        if (b < 1) return;
        const online = navigator.onLine !== false && !semRede;
        const existente = R.dados.etiquetas.find((e) => e.pedidoId === ped.id);
        if (existente?.status === 'ENVIANDO') { toast('Estas etiquetas já estão sendo enviadas.'); return; }
        mutar((d) => {
            const dadosEtq = { etiqueta: ped.etiqueta, cliente: ped.cliente, cidade: ped.cidade, cargaNumero: R.info.carga.numero, dataSaida: R.info.carga.dataSaida, motorista: R.info.carga.motorista || '' };
            const i = d.etiquetas.findIndex((e) => e.pedidoId === ped.id);
            if (i >= 0) {
                // quantidade mudou com o item ainda na fila: id NOVO (senão o servidor acha que é repetido e imprime a quantidade antiga);
                // mesma quantidade = retry do mesmo pedido, mantém o id
                const requisicaoId = d.etiquetas[i].bolsas !== b ? novoId() : d.etiquetas[i].requisicaoId;
                d.etiquetas[i] = { ...d.etiquetas[i], bolsas: b, requisicaoId, dados: dadosEtq, status: 'AGUARDANDO', erro: null, exigeToque: !online };
            }
            else { d.etqSeq = (d.etqSeq || 0) + 1; d.etiquetas.push({ pedidoId: ped.id, ordem: d.etqSeq, bolsas: b, requisicaoId: novoId(), exigeToque: !online, dados: dadosEtq, status: 'AGUARDANDO', erro: null }); }
        });
        if (online) enviarEtiquetas({ manual: false });
        else toast(`Sem internet: ${b} etiqueta${b > 1 ? 's' : ''} guardada${b > 1 ? 's' : ''} — você imprime ao sair da câmara.`, { icon: '🖨' });
    }, [mutar, enviarEtiquetas, semRede, R]);

    const imprimirAgora = useCallback(() => enviarEtiquetas({ manual: true }), [enviarEtiquetas]);

    const online = navOnline && !semRede;
    const pendentes = dados.sujo.linhas.length + dados.sujo.pedidos.length + (dados.sujo.ordem ? 1 : 0) + dados.concluir.length;

    return {
        uid, info, carga: info?.carga || null, idx, dados, estado: dados.estado || estadoVazio(),
        online, navOnline, semRede, sincronizando, pendentes, erroServidor, tentarDeNovo, memoriaCheia, semControladorSW, prontoParaCamara,
        cargas, erroLista, baixadas, abrindo,
        listar, abrirCarga, abrirBaixada, trocarCarga, sincronizar,
        mais, menos, tudo, digitar, motivo, mudarBolsas, trocarRegra, numerar, limparOrdem, concluir,
        imprimirBolsas, imprimirAgora, confirmarMudanca,
        etiquetas: dados.etiquetas || [],
        celula: (k) => celula(dados.estado, k),
        chaveCarga, chavePedido, MOTIVO_NAO_TEM,
    };
}
