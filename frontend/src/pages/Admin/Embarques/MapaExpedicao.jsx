import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, Loader2, Wand2, Route as RouteIcon, X, Truck, Printer, MapPinOff, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import mapaExpedicaoService from '../../../services/mapaExpedicaoService';
import SelectBusca from '../../../components/SelectBusca';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de divisão de cargas: a expedição vê as entregas do dia no mapa e decide
// QUEM leva o quê (a ORDEM continua sendo do motorista, no painel dele).
// Modelo rascunho: mover pino/pedido só recolore localmente; nada grava até o
// operador clicar em "Confirmar". 16:30 é referência visual, nunca trava.
// A sugestão e o mapa NUNCA dependem do OSRM — sem ele, os números saem
// aproximados (haversine local) com o selo "≈".
// ─────────────────────────────────────────────────────────────────────────────

const CORES = ['#00754A', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#65a30d', '#9333ea', '#0d9488'];
const COR_SEM_CARGA = '#6b7280';
const REF_RETORNO = '16:30';
const SEM_CARGA = 'SEM_CARGA'; // valor do SelectBusca para "tirar da carga"

const temChave = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataBR = (s) => s ? s.split('-').reverse().join('/') : '';

const hhmmParaMin = (s) => {
    const [h, m] = String(s || '').split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const minParaHHMM = (min) => {
    const m = Math.max(0, Math.round(min));
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const distM = (a, b) => {
    const R = 6371000, toRad = (g) => (g * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// Estimativa local (sem rede): vizinho mais próximo a partir da base, ida e
// volta, × 1,3 de fator de estrada, 40 km/h + tempo de parada por pedido.
function estimativaLocal(base, pontos, nParadas, horaSaida, tempoParadaMin) {
    let dist = 0;
    if (base && pontos.length) {
        let atual = base;
        const resto = [...pontos];
        while (resto.length) {
            let melhor = 0, melhorD = Infinity;
            resto.forEach((p, i) => { const d = distM(atual, p); if (d < melhorD) { melhorD = d; melhor = i; } });
            dist += melhorD;
            atual = resto.splice(melhor, 1)[0];
        }
        dist += distM(atual, base);
    }
    const km = (dist / 1000) * 1.3;
    const duracaoMin = Math.round((km / 40) * 60 + nParadas * tempoParadaMin);
    return {
        distanciaKm: Math.round(km * 10) / 10,
        duracaoMin,
        previsaoRetorno: minParaHHMM(hhmmParaMin(horaSaida) + duracaoMin),
        precisao: 'aproximada'
    };
}

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtKm = (v) => (v == null ? null : (Math.round(Number(v) * 10) / 10).toLocaleString('pt-BR'));
const fmtDur = (min) => {
    if (min == null) return null;
    const m = Math.round(Number(min));
    const h = Math.floor(m / 60);
    return h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

const mensagemErro = (e, fallback) => {
    const data = e.response?.data;
    if (e.response?.status === 400) {
        const detalhe = data?.erro || data?.error || data?.message || data?.mensagem;
        if (detalhe) return `Confira os dados: ${String(detalhe)}`;
    }
    return fallback;
};

export default function MapaExpedicao() {
    const [data, setData] = useState(hojeISO); // padrão calculado (hoje) — NÃO persiste
    const [periodoEntrega, periodoEntregaCtl] = usePeriodoSalvo('mapa-expedicao:entrega', 'hoje');
    const [params, setParams] = useFiltrosSalvos('mapa-expedicao', { horaSaida: '08:00', tempoParadaMin: 10 });
    const [dados, setDados] = useState(null);           // { cargas, entregas, semGps, base }
    const [carregando, setCarregando] = useState(true);
    const [erroCarregamento, setErroCarregamento] = useState(null);
    const [rascunho, setRascunho] = useState({});        // pedidoId -> embarqueId | null
    const [estimApi, setEstimApi] = useState(null);      // { chave, grupos: { [embarqueId]: {...} } }
    const [avisos, setAvisos] = useState([]);
    const [criterioSugestao, setCriterioSugestao] = useState(null);
    const [sugerindo, setSugerindo] = useState(false);
    const [recalculando, setRecalculando] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const [selecionado, setSelecionado] = useState(null); // pedidoId do pino clicado
    const [sheetAberta, setSheetAberta] = useState(false); // bottom-sheet no celular
    const requisicaoMapa = useRef(0);

    const tempoParadaMin = Math.max(0, Number(params.tempoParadaMin) || 0);

    // ── Carregar o dia ──
    const carregar = useCallback(async () => {
        const requisicao = ++requisicaoMapa.current;
        setCarregando(true);
        setErroCarregamento(null);
        try {
            const r = await mapaExpedicaoService.mapa({
                data,
                entregaDe: periodoEntrega.de,
                entregaAte: periodoEntrega.ate
            });
            if (requisicao !== requisicaoMapa.current) return;
            setDados(r);
            setRascunho({});
            setEstimApi(null);
            setAvisos([]);
            setSelecionado(null);
        } catch (e) {
            if (requisicao !== requisicaoMapa.current) return;
            setDados(null);
            setErroCarregamento('Não deu para carregar o mapa das entregas. Verifique a conexão e tente de novo.');
        } finally {
            if (requisicao === requisicaoMapa.current) setCarregando(false);
        }
    }, [data, periodoEntrega.de, periodoEntrega.ate]);
    useEffect(() => { carregar(); }, [carregar]);

    // ── Entregas do dia (dedup por pedidoId, caso semGps repita itens de entregas) ──
    const todas = useMemo(() => {
        const m = new Map();
        (dados?.entregas || []).forEach(e => m.set(e.pedidoId, e));
        (dados?.semGps || []).forEach(e => { if (!m.has(e.pedidoId)) m.set(e.pedidoId, e); });
        return [...m.values()];
    }, [dados]);
    const comGps = useMemo(() => todas.filter(e => e.gps), [todas]);
    const semLocalizacao = useMemo(() => todas.filter(e => !e.gps), [todas]);

    // ── Rascunho: onde cada pedido está AGORA na tela ──
    const embarqueEfetivo = useCallback(
        (p) => (temChave(rascunho, p.pedidoId) ? rascunho[p.pedidoId] : (p.embarqueId ?? null)),
        [rascunho]
    );
    const mudancas = useMemo(
        () => todas.filter(p => temChave(rascunho, p.pedidoId) && rascunho[p.pedidoId] !== (p.embarqueId ?? null)),
        [todas, rascunho]
    );

    // O app usa BrowserRouter (roteador declarativo), no qual useBlocker não é
    // suportado. Protegemos os links desta tela e o fechamento/reload do navegador
    // sem depender do Data Router.
    const confirmarSaida = useCallback((e) => {
        if (!mudancas.length) return;
        if (!window.confirm('Há alterações de carga ainda não aplicadas. Deseja sair e descartar o rascunho?')) {
            e.preventDefault();
        }
    }, [mudancas.length]);
    useEffect(() => {
        const avisarSaida = (e) => {
            if (!mudancas.length) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', avisarSaida);
        return () => window.removeEventListener('beforeunload', avisarSaida);
    }, [mudancas.length]);

    const trocarData = (proximaData) => {
        const novaData = proximaData || hojeISO();
        if (novaData === data) return;
        if (mudancas.length && !window.confirm('Há alterações de carga ainda não aplicadas. Deseja mudar o dia e descartar o rascunho?')) return;
        setData(novaData);
    };

    const grupos = useMemo(() => {
        const porCarga = {};
        (dados?.cargas || []).forEach(c => { porCarga[c.id] = []; });
        const semCarga = [];
        todas.forEach(p => {
            const eid = embarqueEfetivo(p);
            if (eid != null && porCarga[eid]) porCarga[eid].push(p);
            else semCarga.push(p);
        });
        return { porCarga, semCarga };
    }, [dados, todas, embarqueEfetivo]);

    const corDaCarga = useCallback((eid) => {
        if (eid == null) return COR_SEM_CARGA;
        const i = (dados?.cargas || []).findIndex(c => c.id === eid);
        return i >= 0 ? CORES[i % CORES.length] : COR_SEM_CARGA;
    }, [dados]);

    // ── Estimativas: locais (≈) sempre; as da API valem enquanto o arranjo não mudar ──
    const montarChave = useCallback((porCargaIds) => JSON.stringify({
        g: (dados?.cargas || []).map(c => [String(c.id), (porCargaIds[c.id] || []).map(String).sort()]),
        h: params.horaSaida,
        t: String(tempoParadaMin)
    }), [dados, params.horaSaida, tempoParadaMin]);

    const chaveEstim = useMemo(() => {
        const ids = {};
        Object.entries(grupos.porCarga).forEach(([eid, ps]) => { ids[eid] = ps.map(p => p.pedidoId); });
        return montarChave(ids);
    }, [grupos, montarChave]);

    const estimativas = useMemo(() => {
        if (estimApi && estimApi.chave === chaveEstim) return estimApi.grupos;
        const out = {};
        (dados?.cargas || []).forEach(c => {
            const ps = grupos.porCarga[c.id] || [];
            if (!ps.length) return;
            out[c.id] = estimativaLocal(
                dados?.base,
                ps.filter(p => p.gps).map(p => p.gps),
                ps.length,
                params.horaSaida,
                tempoParadaMin
            );
        });
        return out;
    }, [estimApi, chaveEstim, dados, grupos, params.horaSaida, tempoParadaMin]);

    // ── Mover pedido (só rascunho — nada grava) ──
    const mover = useCallback((pedido, valorSel) => {
        if (pedido.travado) {
            toast('Este pedido já saiu para entrega — não pode mais trocar de carga.', { icon: '🔒' });
            return;
        }
        const destino = valorSel === SEM_CARGA
            ? null
            : ((dados?.cargas || []).find(c => String(c.id) === String(valorSel))?.id ?? null);
        setRascunho(prev => {
            const nx = { ...prev };
            if (destino === (pedido.embarqueId ?? null)) delete nx[pedido.pedidoId];
            else nx[pedido.pedidoId] = destino;
            return nx;
        });
    }, [dados]);

    // ── Sugerir divisão (carrega a proposta como rascunho) ──
    const sugerir = async () => {
        if (!dados?.cargas?.length) {
            toast('Monte as cargas do dia no Painel de Expedição antes de pedir a sugestão.', { icon: '🚚' });
            return;
        }
        setSugerindo(true);
        try {
            const r = await mapaExpedicaoService.sugerirDivisao({
                data,
                entregaDe: periodoEntrega.de,
                entregaAte: periodoEntrega.ate,
                embarqueIds: dados.cargas.map(c => c.id),
                horaSaida: params.horaSaida,
                tempoParadaMin
            });
            const nx = {};
            (r.grupos || []).forEach(g => (g.pedidoIds || []).forEach(pid => {
                const p = todas.find(t => t.pedidoId === pid);
                if (!p || p.travado) return; // travado fica onde está
                if ((p.embarqueId ?? null) !== g.embarqueId) nx[pid] = g.embarqueId;
            }));
            setRascunho(nx);
            setAvisos(r.avisos || []);
            // guarda os números da sugestão presos a este arranjo
            const porCargaIds = {};
            todas.forEach(p => {
                const eid = temChave(nx, p.pedidoId) ? nx[p.pedidoId] : (p.embarqueId ?? null);
                if (eid != null) (porCargaIds[eid] = porCargaIds[eid] || []).push(p.pedidoId);
            });
            const gm = {};
            (r.grupos || []).forEach(g => {
                gm[g.embarqueId] = {
                    distanciaKm: g.distanciaKm, duracaoMin: g.duracaoMin,
                    previsaoRetorno: g.previsaoRetorno, precisao: g.precisao || 'aproximada',
                    trajeto: g.trajeto || []
                };
            });
            setEstimApi({ chave: montarChave(porCargaIds), grupos: gm });
            setCriterioSugestao(r.criterio || null);
            toast.success('Sugestão pronta — confira as linhas das rotas antes de confirmar.');
        } catch (e) {
            if (e.response?.status === 423) toast('Outro cálculo de rota está em andamento — aguarde um instante e tente de novo.', { icon: '⏳', duration: 6000 });
            else toast.error(mensagemErro(e, 'Não deu para montar a sugestão agora. Tente de novo.'));
        } finally {
            setSugerindo(false);
        }
    };

    // ── Recalcular preciso (uma chamada, nunca a cada arrasto) ──
    const recalcular = async () => {
        const gruposPayload = (dados?.cargas || [])
            .map(c => ({ embarqueId: c.id, pedidoIds: (grupos.porCarga[c.id] || []).map(p => p.pedidoId) }))
            .filter(g => g.pedidoIds.length);
        if (!gruposPayload.length) {
            toast('Nenhum pedido dentro das cargas para calcular.', { icon: 'ℹ️' });
            return;
        }
        setRecalculando(true);
        try {
            const r = await mapaExpedicaoService.estimarRotas({
                grupos: gruposPayload,
                horaSaida: params.horaSaida,
                tempoParadaMin
            });
            const gm = {};
            (r.grupos || []).forEach(g => {
                gm[g.embarqueId] = {
                    distanciaKm: g.distanciaKm, duracaoMin: g.duracaoMin,
                    previsaoRetorno: g.previsaoRetorno, precisao: g.precisao || 'aproximada',
                    trajeto: g.trajeto || []
                };
            });
            setEstimApi({ chave: chaveEstim, grupos: gm });
            setAvisos(r.avisos || []);
            if (r.avisos?.length) toast('Cálculo concluído com avisos — confira o painel.', { icon: '⚠️' });
        } catch (e) {
            if (e.response?.status === 423) toast('Outro cálculo de rota está em andamento — aguarde um instante e tente de novo.', { icon: '⏳', duration: 6000 });
            else toast.error(mensagemErro(e, 'Não deu para calcular as rotas precisas agora — os números aproximados (≈) continuam valendo.'));
        } finally {
            setRecalculando(false);
        }
    };

    // ── Confirmar / Descartar ──
    const confirmar = async () => {
        if (!mudancas.length || aplicando) return;
        setAplicando(true);
        try {
            await mapaExpedicaoService.aplicarDivisao({
                atribuicoes: mudancas.map(p => ({ pedidoId: p.pedidoId, embarqueId: rascunho[p.pedidoId] })),
                esperado: mudancas.map(p => ({ pedidoId: p.pedidoId, embarqueIdAtual: p.embarqueId ?? null }))
            });
            toast.success('Divisão aplicada nas cargas.');
            await carregar();
        } catch (e) {
            if (e.response?.status === 409) {
                const conflitos = e.response.data?.conflitos || [];
                const nomes = conflitos
                    .map(c => todas.find(t => t.pedidoId === (c?.pedidoId ?? c))?.clienteNome)
                    .filter(Boolean);
                toast.error(
                    nomes.length
                        ? `Nada foi aplicado: ${nomes.join(', ')} ${nomes.length === 1 ? 'foi movido' : 'foram movidos'} por outro operador. O mapa foi recarregado — confira e confirme de novo.`
                        : 'Nada foi aplicado: pedidos mudaram de carga por outro operador. O mapa foi recarregado — confira e confirme de novo.',
                    { duration: 9000 }
                );
                await carregar();
            } else {
                toast.error(mensagemErro(e, 'Não deu para aplicar a divisão. Nada foi alterado — tente de novo.'));
            }
        } finally {
            setAplicando(false);
        }
    };
    const descartar = () => {
        setRascunho({});
        setEstimApi(null);
        setAvisos([]);
        setCriterioSugestao(null);
        toast('Alterações descartadas — o mapa voltou ao que está salvo.', { icon: '↩️' });
    };

    // ── Leaflet ──
    const mapRef = useRef(null);
    const mapObj = useRef(null);
    const marcadores = useRef({});
    const baseMarker = useRef(null);
    const linhasRotas = useRef([]);
    const ajustouPara = useRef(null);

    useEffect(() => {
        if (!mapRef.current || mapObj.current) return;
        const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
            .setView([-25.9, -49.2], 8);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        map.on('click', () => setSelecionado(null));
        mapObj.current = map;
        return () => {
            map.remove();
            mapObj.current = null;
            marcadores.current = {};
            baseMarker.current = null;
            linhasRotas.current = [];
        };
    }, []);

    // Pinos (recriados a cada mudança de dados/rascunho — poucos por dia, é barato)
    useEffect(() => {
        const map = mapObj.current;
        if (!map || !dados) return;

        if (baseMarker.current) { baseMarker.current.remove(); baseMarker.current = null; }
        if (dados.base?.lat != null) {
            baseMarker.current = L.marker([dados.base.lat, dados.base.lng], {
                icon: L.divIcon({
                    className: '',
                    html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">⭐</div>',
                    iconSize: [26, 26], iconAnchor: [13, 13]
                }),
                zIndexOffset: 500
            }).addTo(map).bindTooltip('Hardt Salgados — saída das cargas');
        }

        Object.values(marcadores.current).forEach(m => m.remove());
        marcadores.current = {};
        comGps.forEach(p => {
            const cor = corDaCarga(embarqueEfetivo(p));
            const mudou = temChave(rascunho, p.pedidoId) && rascunho[p.pedidoId] !== (p.embarqueId ?? null);
            const aproximado = p.origemGps === 'endereco';
            // bolinha cheia = ponto GPS confirmado; anel tracejado com "≈" = posição pelo endereço
            const estilo = aproximado
                ? `background:#fff;border:2.5px dashed ${cor};color:${cor};`
                : `background:${cor};border:2.5px solid #fff;color:#fff;`;
            const html = `<div style="width:26px;height:26px;border-radius:50%;${estilo}` +
                `box-shadow:0 1px 4px rgba(0,0,0,.45);${p.travado ? 'opacity:.55;' : ''}` +
                `${mudou ? 'outline:3px solid #cba258;outline-offset:1px;' : ''}` +
                `display:flex;align-items:center;justify-content:center;font-size:${p.travado ? '12px' : '13px'};font-weight:800;line-height:1">` +
                `${p.travado ? '🔒' : (aproximado ? '≈' : '')}</div>`;
            const mk = L.marker([p.gps.lat, p.gps.lng], {
                icon: L.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 13] }),
                keyboard: false
            }).addTo(map).on('click', () => setSelecionado(p.pedidoId));
            marcadores.current[p.pedidoId] = mk;
        });
    }, [dados, comGps, rascunho, corDaCarga, embarqueEfetivo]);

    // Trajetos devolvidos pelo roteirizador: tornam visível por que um ponto
    // pertence a uma carga, em vez de mostrar apenas cores soltas no mapa.
    useEffect(() => {
        const map = mapObj.current;
        if (!map) return;
        linhasRotas.current.forEach(linha => linha.remove());
        linhasRotas.current = [];
        if (!estimApi || estimApi.chave !== chaveEstim) return;
        (dados?.cargas || []).forEach((c, i) => {
            const trajeto = estimApi.grupos?.[c.id]?.trajeto || [];
            if (trajeto.length < 2) return;
            linhasRotas.current.push(L.polyline(
                trajeto.map(p => [p.lat, p.lng]),
                { color: CORES[i % CORES.length], weight: 4, opacity: 0.72 }
            ).addTo(map));
        });
    }, [estimApi, chaveEstim, dados]);

    // Enquadrar o dia uma vez por carga de dados
    useEffect(() => {
        const map = mapObj.current;
        if (!map || !dados || ajustouPara.current === data) return;
        const pts = comGps.map(p => [p.gps.lat, p.gps.lng]);
        if (dados.base?.lat != null) pts.push([dados.base.lat, dados.base.lng]);
        if (pts.length) {
            map.fitBounds(L.latLngBounds(pts).pad(0.15));
            ajustouPara.current = data;
        }
    }, [dados, comGps, data]);

    // ── Peças de UI ──
    const sel = selecionado != null ? todas.find(p => p.pedidoId === selecionado) : null;
    const focarEntrega = useCallback((p) => {
        setSelecionado(p.pedidoId);
        if (p.gps && mapObj.current) mapObj.current.flyTo([p.gps.lat, p.gps.lng], Math.max(mapObj.current.getZoom(), 14));
    }, []);

    // options inline: o SelectBusca só lê <option>/<optgroup> direto nos children
    const seletorMover = (p, larga = 'w-full') => (
        <SelectBusca
            value={embarqueEfetivo(p) == null ? SEM_CARGA : String(embarqueEfetivo(p))}
            onChange={e => mover(p, e.target.value)}
            className={larga}
        >
            {(dados?.cargas || []).map(c => (
                <option key={c.id} value={String(c.id)}>
                    Carga #{c.numero}{c.responsavel?.nome ? ` — ${c.responsavel.nome}` : ''}
                </option>
            ))}
            <option value={SEM_CARGA}>Tirar da carga (sem carga)</option>
        </SelectBusca>
    );

    const linhaEstimativa = (est) => {
        if (!est) return null;
        const atrasada = est.previsaoRetorno && hhmmParaMin(est.previsaoRetorno) > hhmmParaMin(REF_RETORNO);
        return (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-gray-600">
                    {fmtKm(est.distanciaKm) != null ? `${fmtKm(est.distanciaKm)} km` : '— km'} · {fmtDur(est.duracaoMin) || '—'}
                </span>
                {est.previsaoRetorno && (
                    atrasada
                        ? <span className="font-semibold text-amber-700">volta prevista {est.previsaoRetorno} · ref. {REF_RETORNO}</span>
                        : <span className="text-gray-600">volta prevista {est.previsaoRetorno}</span>
                )}
                {est.precisao === 'osrm'
                    ? <span className="px-1.5 py-0.5 rounded-full bg-mint text-primaryDark font-semibold">preciso</span>
                    : <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">≈ aproximado</span>}
            </div>
        );
    };

    // Painel lateral (desktop) / bottom-sheet (celular) — renderizado uma vez só
    const toqueY = useRef(null);
    const suprimirClique = useRef(false);

    return (
        <div className="relative z-0 isolate w-full max-w-full px-3 md:px-0 py-3 md:py-6 overflow-x-hidden">
            {/* Topbar */}
            <div className="flex items-center justify-between gap-2 bg-white p-3 md:p-4 rounded-t-xl shadow-sm border border-gray-200 border-b-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-sky-100 p-1.5 md:p-2 rounded-lg shrink-0">
                        <MapIcon className="h-4 w-4 md:h-5 md:w-5 text-sky-600" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Mapa das entregas</h1>
                        <p className="text-xs text-gray-500 hidden sm:block">
                            Embarque {dataBR(data)} · pedidos com entrega de {dataBR(periodoEntrega.de)} até {dataBR(periodoEntrega.ate)}
                        </p>
                    </div>
                </div>
                <Link
                    to="/admin/embarques"
                    onClick={confirmarSaida}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 md:px-4 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm min-h-[44px]"
                >
                    <Truck className="h-4 w-4" />
                    <span className="hidden sm:inline">Painel de expedição</span>
                    <span className="sm:hidden">Painel</span>
                </Link>
            </div>

            {/* Corpo: mapa + painel */}
            <div className="relative flex flex-col md:flex-row bg-white border border-gray-200 rounded-b-xl shadow-sm overflow-hidden h-[calc(100dvh-170px)] min-h-[440px]">
                {/* Mapa */}
                <div className="relative flex-1 min-w-0">
                    <div ref={mapRef} className="absolute inset-0" />

                    {carregando && (
                        <div className="absolute inset-0 z-[1060] bg-white/70 flex items-center justify-center">
                            <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando as entregas do dia…
                            </div>
                        </div>
                    )}

                    {erroCarregamento && !carregando && (
                        <div className="absolute inset-0 z-[1060] bg-white/90 flex items-center justify-center p-6" role="alert">
                            <div className="max-w-sm text-center">
                                <p className="text-sm text-gray-700 mb-3">{erroCarregamento}</p>
                                <button type="button" onClick={carregar} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm min-h-[44px]">
                                    Tentar novamente
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Banner do rascunho */}
                    {mudancas.length > 0 && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1040] flex items-center gap-1.5 bg-white rounded-full border border-amber-300 shadow-lg pl-3 pr-1.5 py-1 max-w-[calc(100%-16px)]">
                            <span className="text-xs font-semibold text-amber-800 whitespace-nowrap">
                                {mudancas.length === 1 ? '1 alteração não aplicada' : `${mudancas.length} alterações não aplicadas`}
                            </span>
                            <button
                                onClick={confirmar}
                                disabled={aplicando}
                                className="px-3 py-2 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold min-h-[40px] flex items-center gap-1.5 disabled:opacity-60"
                            >
                                {aplicando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Confirmar
                            </button>
                            <button
                                onClick={descartar}
                                disabled={aplicando}
                                className="px-2.5 py-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 text-xs font-medium min-h-[40px] disabled:opacity-60"
                            >
                                Descartar
                            </button>
                        </div>
                    )}

                    {/* Legenda */}
                    <div className="absolute bottom-6 left-2 z-[1000] bg-white/95 rounded-lg border border-gray-200 shadow-sm px-2.5 py-2 space-y-1 text-[10px] leading-tight text-gray-700">
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#00754A', border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.15)' }} />
                            ponto GPS confirmado
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0 bg-white" style={{ border: '1.5px dashed #00754A' }} />
                            pelo endereço (aproximado)
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COR_SEM_CARGA, border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.15)' }} />
                            sem carga
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Lock className="w-3 h-3 text-gray-500 shrink-0" />
                            já saiu — não move
                        </div>
                    </div>

                    {/* Cartão do pino selecionado */}
                    {sel && (
                        <div className="absolute bottom-16 left-3 right-3 md:bottom-auto md:top-3 md:right-3 md:left-auto md:w-80 z-[1050] bg-white rounded-xl border border-gray-200 shadow-lg p-3">
                            <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 text-sm truncate">{sel.clienteNome || 'Cliente'}</p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {sel.etiqueta || sel.numero || ''}{sel.cidade ? ` · ${sel.cidade}` : ''}
                                    </p>
                                </div>
                                <button aria-label="Fechar detalhes da entrega" onClick={() => setSelecionado(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-700 font-semibold mb-1">{fmtBRL(sel.valorTotal)}</p>
                            {sel.endereco && <p className="text-xs text-gray-500 mb-2">{sel.endereco}</p>}
                            {sel.origemGps === 'endereco' && (
                                <p className="text-[11px] text-gray-500 mb-2">
                                    📍 posição pelo endereço do cadastro (aproximada) — o ponto GPS ainda não foi confirmado
                                </p>
                            )}
                            {sel.travado ? (
                                <div className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-lg px-3 py-2 flex items-start gap-1.5">
                                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>Este pedido já saiu para entrega{sel.statusEntrega ? ` (${sel.statusEntrega})` : ''} — ele fica na carga onde está.</span>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-1">Mover para…</p>
                                    {seletorMover(sel)}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Painel lateral (desktop) / bottom-sheet (celular) */}
                <div
                    className={`absolute md:static bottom-0 left-0 right-0 z-[1100] md:z-auto md:w-[380px] md:shrink-0 md:h-full
                        bg-white md:border-l md:border-gray-200 rounded-t-2xl md:rounded-none
                        shadow-[0_-8px_24px_rgba(0,0,0,.18)] md:shadow-none flex flex-col
                        max-h-[75%] md:max-h-none transition-transform duration-200 will-change-transform
                        ${sheetAberta ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'} md:translate-y-0`}
                >
                    {/* Alça (só celular): toque abre/fecha; arrastar também funciona */}
                    <button
                        type="button"
                        className="md:hidden w-full flex flex-col items-center gap-1 pt-2 pb-1.5 min-h-[44px] touch-none"
                        onTouchStart={e => { toqueY.current = e.touches[0].clientY; }}
                        onTouchEnd={e => {
                            if (toqueY.current == null) return;
                            const dy = e.changedTouches[0].clientY - toqueY.current;
                            toqueY.current = null;
                            if (Math.abs(dy) > 30) { setSheetAberta(dy < 0); suprimirClique.current = true; }
                        }}
                        onClick={() => {
                            if (suprimirClique.current) { suprimirClique.current = false; return; }
                            setSheetAberta(v => !v);
                        }}
                    >
                        <span className="w-10 h-1.5 rounded-full bg-gray-300" />
                        <span className="text-xs font-semibold text-gray-600">
                            {sheetAberta ? 'Fechar painel' : `Cargas e ajustes${mudancas.length ? ` · ${mudancas.length} pendente${mudancas.length > 1 ? 's' : ''}` : ''}`}
                        </span>
                    </button>

                    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
                        {/* Dia + parâmetros */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Embarque e pedidos</p>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="col-span-2 text-sm font-medium text-gray-700">
                                    Data do embarque
                                    <input
                                        type="date"
                                        value={data}
                                        onChange={e => trocarData(e.target.value)}
                                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    />
                                </label>
                                <div className="col-span-2">
                                    <p className="text-sm font-medium text-gray-700 mb-1">Período de entrega dos pedidos</p>
                                    <FiltroPeriodo
                                        periodo={periodoEntrega}
                                        controle={periodoEntregaCtl}
                                        rotulo="Entrega"
                                        ocultarPresets={['todo']}
                                        className="w-full"
                                    />
                                    <p className="mt-1.5 text-xs text-gray-600">
                                        Mostra pedidos livres com entrega nesse período e os que já estão nas cargas deste embarque.
                                    </p>
                                </div>
                                <label className="text-sm font-medium text-gray-700">
                                    Hora de saída
                                    <input
                                        type="time"
                                        value={params.horaSaida}
                                        onChange={e => setParams({ ...params, horaSaida: e.target.value || '08:00' })}
                                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    />
                                </label>
                                <label className="text-sm font-medium text-gray-700">
                                    Min por parada
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={params.tempoParadaMin}
                                        onChange={e => setParams({ ...params, tempoParadaMin: e.target.value })}
                                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    />
                                </label>
                            </div>
                            <div className="mt-3 space-y-2">
                                <button
                                    onClick={sugerir}
                                    disabled={sugerindo || carregando}
                                    className="w-full px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-60"
                                >
                                    {sugerindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                    {sugerindo ? 'Montando sugestão…' : 'Sugerir divisão'}
                                </button>
                                <button
                                    onClick={recalcular}
                                    disabled={recalculando || carregando}
                                    className="w-full px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-60"
                                >
                                    {recalculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RouteIcon className="h-4 w-4" />}
                                    {recalculando ? 'Calculando rotas…' : 'Recalcular preciso'}
                                </button>
                            </div>
                        </div>

                        {/* Avisos da sugestão */}
                        {avisos.length > 0 && (
                            <div className="text-[13px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5 space-y-1">
                                {avisos.map((a, i) => <p key={i} className="m-0">⚠️ {String(a)}</p>)}
                            </div>
                        )}

                        {criterioSugestao && estimApi?.chave === chaveEstim && (
                            <div className="text-[13px] bg-blue-50 border border-blue-200 text-blue-950 rounded-lg px-3 py-2.5 space-y-1.5">
                                <p className="font-semibold m-0">Como a sugestão foi montada</p>
                                <p className="m-0">{criterioSugestao.principal}.</p>
                                <p className="m-0 text-blue-900">
                                    Considera: {(criterioSugestao.considera || []).join(', ')}.
                                </p>
                                <p className="m-0 text-blue-900">
                                    Não considera: {(criterioSugestao.naoConsidera || []).join(', ')}.
                                </p>
                                <p className="m-0 font-medium">As linhas coloridas mostram o trajeto calculado de cada carga.</p>
                            </div>
                        )}

                        {/* Cartões por carga */}
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1">Cargas do dia</p>
                            {(dados?.cargas || []).length === 0 && !carregando && (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-sm text-gray-500">
                                    Nenhuma carga montada para este dia.{' '}
                                    <Link to="/admin/embarques" onClick={confirmarSaida} className="text-primary font-semibold">Montar cargas no painel</Link>.
                                </div>
                            )}
                            {(dados?.cargas || []).map((c, i) => {
                                const ps = grupos.porCarga[c.id] || [];
                                const est = ps.length ? estimativas[c.id] : null;
                                const foiImpressa = Number(c.ultimaImpressaoVersao) > 0;
                                const reimprimir = foiImpressa && Number(c.versao) > Number(c.ultimaImpressaoVersao);
                                return (
                                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: CORES[i % CORES.length] }} />
                                            <span className="font-semibold text-gray-900 text-sm truncate flex-1">
                                                Carga #{c.numero}{c.responsavel?.nome ? ` · ${c.responsavel.nome}` : ''}
                                            </span>
                                            <span className="text-xs text-gray-500 shrink-0">
                                                {ps.length} {ps.length === 1 ? 'pedido' : 'pedidos'}
                                            </span>
                                        </div>
                                        {linhaEstimativa(est)}
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            {reimprimir && (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                                                    <Printer className="h-3 w-3" />
                                                    impressa na v{c.ultimaImpressaoVersao ?? 0} — reimprimir
                                                </span>
                                            )}
                                            {!foiImpressa && (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                                                    <Printer className="h-3 w-3" /> ainda não impressa
                                                </span>
                                            )}
                                            <Link to="/admin/embarques" onClick={confirmarSaida} className="text-xs text-primary font-semibold hover:underline py-1.5">
                                                abrir carga
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Sem carga */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-2">
                                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: COR_SEM_CARGA }} />
                                <span className="font-semibold text-gray-700 text-sm flex-1">Sem carga</span>
                                <span className="text-xs text-gray-500">
                                    {grupos.semCarga.length} {grupos.semCarga.length === 1 ? 'pedido' : 'pedidos'}
                                </span>
                            </div>
                        </div>

                        {/* Alternativa navegável aos marcadores do Leaflet. */}
                        {comGps.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1">Entregas no mapa</p>
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                                    {comGps.map(p => (
                                        <button
                                            key={p.pedidoId}
                                            type="button"
                                            onClick={() => focarEntrega(p)}
                                            aria-label={`Ver no mapa: ${p.clienteNome || 'Cliente'}${p.cidade ? `, ${p.cidade}` : ''}`}
                                            className="w-full min-h-[44px] px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                                        >
                                            <span aria-hidden="true" className="w-3 h-3 rounded-full shrink-0" style={{ background: corDaCarga(embarqueEfetivo(p)) }} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-gray-800 truncate">{p.clienteNome || 'Cliente'}</span>
                                                <span className="block text-xs text-gray-500 truncate">{p.etiqueta || p.numero || ''}{p.cidade ? ` · ${p.cidade}` : ''}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sem localização (falhou GPS e endereço) — esses pedidos nunca somem da divisão */}
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1 flex items-center gap-1.5">
                                <MapPinOff className="h-3.5 w-3.5" /> Sem localização
                            </p>
                            {semLocalizacao.length === 0 ? (
                                <p className="text-xs text-gray-500 px-1">
                                    Todos os pedidos do dia têm posição no mapa (por GPS ou pelo endereço do cadastro).
                                </p>
                            ) : (
                                <>
                                    <p className="text-xs text-gray-500 px-1">
                                        Sem ponto GPS e sem endereço localizável — atribua a carga aqui (eles entram na divisão normalmente).
                                    </p>
                                    {semLocalizacao.map(p => (
                                        <div key={p.pedidoId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                            <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                                <span className="font-semibold text-gray-900 text-sm truncate">{p.clienteNome || 'Cliente'}</span>
                                                <span className="text-xs text-gray-500 shrink-0">{fmtBRL(p.valorTotal)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-2 truncate">
                                                {p.etiqueta || p.numero || ''}{p.cidade ? ` · ${p.cidade}` : ''}
                                            </p>
                                            {p.travado ? (
                                                <div className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-lg px-3 py-2 flex items-start gap-1.5">
                                                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                    <span>Já saiu para entrega — fica na carga onde está.</span>
                                                </div>
                                            ) : seletorMover(p)}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
