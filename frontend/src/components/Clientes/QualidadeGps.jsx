import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import gpsClientesService from '../../services/gpsClientesService';
import clienteService from '../../services/clienteService';
import { distanciaMetros, formatarDistancia } from '../../utils/gpsQuemAtualizou';
import ModalPontoGps from '../ModalPontoGps';

// ─────────────────────────────────────────────────────────────────────────────
// Situação do ponto GPS de 1 CLIENTE — card com mini-mapa (só leitura) + selo +
// botão "Ajustar no mapa" (abre o `ModalPontoGps` já usado em Saúde dos Pontos
// GPS, Rota e no cadastro — nenhuma lógica de salvar/validar é duplicada aqui).
//
// Uso CONTROLADO (a ficha do cliente já tem os dados carregados — evita 2ª
// chamada): passe `pontoGps` + `gps`. Uso AUTÔNOMO (só `clienteUuid`): o
// componente busca sozinho em `gpsClientesService.cliente(uuid)`.
//
// "Repetido"/"na empresa" (as outras 2 situações da tela em lote) dependem de
// cruzar TODOS os clientes de uma vez — por isso continuam exclusivas da
// varredura em `SaudePontosGps.jsx`; aqui mostramos o que dá para saber de 1
// cliente só: sem ponto, aguardando confirmação, confirmado, suspeito, balcão.
// ─────────────────────────────────────────────────────────────────────────────

const parseLatLng = (s) => {
    if (!s) return null;
    const [lat, lng] = String(s).split(',').map(x => parseFloat(String(x).trim()));
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
};

// Exportada para quem precisa só do veredito (ex.: badge de pendências e o
// "tudo certo" da aba Qualidade dos Dados) sem duplicar a regra.
// `chave` é o discriminante estável para quem só precisa decidir o que mostrar
// (ex.: o card do Cadastro que só reage a CONFIRMADO/SUSPEITO) — usar `chave`
// em vez de voltar a comparar `gps.selo`/`gps.balcao` na tela chamadora, senão
// a classificação vira duas fontes de verdade de novo.
export const avaliarGps = (pontoGps, gps) => {
    const ponto = parseLatLng(pontoGps);
    if (gps?.balcao) {
        return { chave: 'BALCAO', rotulo: 'Cliente balcão', classe: 'bg-purple-100 text-purple-700', desc: 'Compra e retira na empresa — dispensado de ponto GPS.', ok: true, balcaoPorNome: gps?.balcaoPorNome || null };
    }
    if (!ponto) {
        return { chave: 'SEM_PONTO', rotulo: 'Sem ponto GPS', classe: 'bg-gray-100 text-gray-700', desc: 'Este cliente ainda não tem um ponto cadastrado no mapa.', ok: false, balcaoPorNome: null };
    }
    if (gps?.selo === 'CONFIRMADO') {
        return { chave: 'CONFIRMADO', rotulo: 'Confirmado', classe: 'bg-green-100 text-green-800', desc: 'Ponto conferido pelas entregas reais — dentro do esperado.', ok: true, balcaoPorNome: null };
    }
    if (gps?.selo === 'SUSPEITO') {
        return { chave: 'SUSPEITO', rotulo: 'Suspeito', classe: 'bg-yellow-100 text-yellow-800', desc: 'As entregas estão acontecendo longe do ponto cadastrado — vale corrigir.', ok: false, balcaoPorNome: null };
    }
    return { chave: 'AGUARDANDO', rotulo: 'Aguardando confirmação', classe: 'bg-blue-100 text-blue-800', desc: 'Tem ponto cadastrado, ainda sem sinais suficientes (entregas/atendimentos) para confirmar.', ok: true, balcaoPorNome: null };
};

// Cache em memória das posições estimadas (eventoId+lado) — o geocode é lento (1 req/s)
const cacheGeocode = new Map();

export default function QualidadeGps({
    clienteUuid,
    clienteNome = '',
    pontoGps,          // "lat,lng" | null — controlado; omitido = busca sozinho
    gps,               // { balcao, selo, sugestao, balcaoPorNome } — controlado
    podeEditar = false,
    onAtualizado,       // () => void — chamado após salvar/mover o ponto
    versaoEmFoco = null, // { eventoId, lado, snapshot, rotulo } — versão antiga escolhida no histórico
    onVoltarAtual,       // () => void — limpa a versão em foco
    className = '',
}) {
    const autonomo = pontoGps === undefined && gps === undefined;
    const [carregando, setCarregando] = useState(autonomo);
    const [dados, setDados] = useState(autonomo ? null : { Ponto_GPS: pontoGps, gps: gps || {} });
    const [mostrarMapa, setMostrarMapa] = useState(false);
    const mapRef = useRef(null);
    const mapObj = useRef(null);

    const carregar = async () => {
        if (!clienteUuid) return;
        setCarregando(true);
        try {
            const r = await gpsClientesService.cliente(clienteUuid);
            setDados(r?.cliente || null);
        } catch {
            setDados(null);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        if (autonomo) { carregar(); }
        else { setDados({ Ponto_GPS: pontoGps, gps: gps || {} }); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteUuid, autonomo, pontoGps, gps?.selo, gps?.balcao, gps?.sugestao]);

    const ponto = parseLatLng(dados?.Ponto_GPS);
    const infoGps = dados?.gps || {};
    const situacao = avaliarGps(dados?.Ponto_GPS, infoGps);

    // ── Versão antiga escolhida no histórico: ponto dela (ou estimado pelo endereço) ──
    const focoPontoReal = parseLatLng(versaoEmFoco?.snapshot?.Ponto_GPS);
    const focoChave = versaoEmFoco ? `${versaoEmFoco.eventoId}|${versaoEmFoco.lado}` : null;
    const [geo, setGeo] = useState(null); // { carregando, geo, precisao, motivo, chave }

    useEffect(() => {
        setGeo(null);
        if (!versaoEmFoco || focoPontoReal) return undefined;
        const chave = focoChave;
        if (cacheGeocode.has(chave)) { setGeo({ ...cacheGeocode.get(chave), chave }); return undefined; }
        let cancelado = false;
        setGeo({ carregando: true, chave });
        clienteService.enderecoHistoricoGeocode(clienteUuid, versaoEmFoco.eventoId, versaoEmFoco.lado)
            .then(r => {
                const v = { geo: r?.geo || null, precisao: r?.precisao || null, motivo: r?.motivo || null };
                if (v.geo) cacheGeocode.set(chave, v);
                if (!cancelado) setGeo({ ...v, chave });
            })
            .catch(() => { if (!cancelado) setGeo({ geo: null, motivo: 'GEOCODE_FALHOU', chave }); });
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focoChave, clienteUuid]);

    const focoEstimado = !focoPontoReal && geo && geo.chave === focoChave ? parseLatLng(geo.geo) : null;
    const focoPos = focoPontoReal || focoEstimado;
    const comparando = !!versaoEmFoco;
    const distFoco = ponto && focoPos ? distanciaMetros(ponto, focoPos) : null;
    const carregandoGeo = !!(comparando && !focoPontoReal && geo?.carregando && geo.chave === focoChave);
    const falhouGeo = !!(comparando && !focoPontoReal && geo && !geo.carregando && geo.chave === focoChave && !geo.geo);

    // Mini-mapa: RECRIADO a cada troca de versão (altura e marcadores mudam); destruído no cleanup.
    useEffect(() => {
        const alvo = ponto || focoPos;
        if (!alvo || !mapRef.current) return undefined;
        const touch = L.Browser.mobile;
        const map = L.map(mapRef.current, comparando ? {
            zoomControl: true, dragging: !touch, scrollWheelZoom: false, touchZoom: true,
            doubleClickZoom: true, boxZoom: false, keyboard: false, attributionControl: false, tap: false,
        } : {
            zoomControl: false, dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, boxZoom: false, keyboard: false,
            attributionControl: false, tap: false,
        }).setView([alvo.lat, alvo.lng], 15);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        if (ponto) {
            L.circleMarker([ponto.lat, ponto.lng], {
                radius: 8, color: '#00754A', fillColor: '#00754A', fillOpacity: 0.6, weight: 2
            }).addTo(map);
        }
        if (comparando && focoPos) {
            L.circleMarker([focoPos.lat, focoPos.lng], {
                radius: 8, color: '#6B7280', fillColor: '#9CA3AF',
                fillOpacity: focoEstimado ? 0 : 0.8, weight: 3, dashArray: focoEstimado ? '4 4' : null,
            }).addTo(map);
            if (ponto) {
                L.polyline([[ponto.lat, ponto.lng], [focoPos.lat, focoPos.lng]], { color: '#6B7280', weight: 2, dashArray: '6 6' })
                    .bindTooltip(`${formatarDistancia(distFoco) || '0 m'} de diferença`, { permanent: true, direction: 'center', className: 'text-xs font-semibold' })
                    .addTo(map);
                if (distFoco != null && distFoco > 3) {
                    map.fitBounds([[ponto.lat, ponto.lng], [focoPos.lat, focoPos.lng]], { padding: [40, 40], maxZoom: 18 });
                } else {
                    map.setView([ponto.lat, ponto.lng], 17);
                }
            }
        }
        mapObj.current = map;
        const t = setTimeout(() => map.invalidateSize(), 50);
        return () => { clearTimeout(t); map.remove(); mapObj.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ponto?.lat, ponto?.lng, focoPos?.lat, focoPos?.lng, comparando, !!focoEstimado, carregando]);

    // No celular o mapa fica abaixo da tela: rola até ele ao escolher uma versão
    const cardRef = useRef(null);
    useEffect(() => {
        if (focoChave && cardRef.current && window.innerWidth < 768) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [focoChave]);

    return (
        <div ref={cardRef} className={`scroll-mt-16 bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <MapPin className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Localização</span>
            </div>
            <div className="p-4 space-y-3">
                {carregando ? (
                    <div className="flex items-center justify-center py-8 text-gray-500 gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                ) : (
                    <>
                        {(ponto || focoPos) ? (
                            <div className="relative">
                                <div ref={mapRef} className={`w-full rounded-lg overflow-hidden border border-gray-100 ${comparando ? 'h-56 md:h-64' : 'h-32 pointer-events-none'}`} />
                                {carregandoGeo && (
                                    <div className="absolute top-2 right-2 z-[500] bg-white/90 rounded-full px-2.5 py-1.5 shadow text-xs text-gray-600 flex items-center gap-1.5">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Estimando posição…
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={`${comparando ? 'h-24' : 'h-32'} w-full rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-500`}>
                                {carregandoGeo ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-6 w-6" />}
                            </div>
                        )}
                        {comparando && (
                            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5 text-xs text-gray-700">
                                <p><span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400 mr-1.5 align-middle" /><b>Cinza:</b> {versaoEmFoco.rotulo || 'versão escolhida'}</p>
                                {ponto && <p><span className="inline-block w-2.5 h-2.5 rounded-full bg-primary mr-1.5 align-middle" /><b>Verde:</b> ponto atual</p>}
                                {focoEstimado && (
                                    <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                        Posição estimada pelo endereço ({geo?.precisao === 'cep' ? 'só pelo CEP' : 'rua'}) — essa versão não tinha ponto no mapa.
                                    </p>
                                )}
                                {falhouGeo && (
                                    <p className="text-gray-700 bg-white border border-gray-200 rounded px-2 py-1">
                                        {geo?.motivo === 'SEM_ENDERECO'
                                            ? 'Essa versão não tem ponto nem endereço para mostrar no mapa.'
                                            : 'Não foi possível estimar a posição deste endereço.'}
                                    </p>
                                )}
                                {!ponto && focoPos && <p>O cliente não tem ponto atual no mapa.</p>}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <button type="button" onClick={() => onVoltarAtual?.()}
                                        className="min-h-[44px] px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm flex items-center gap-1.5">
                                        <Undo2 className="h-4 w-4" /> Voltar ao ponto atual
                                    </button>
                                    {focoPos && (
                                        <a href={`https://www.google.com/maps?q=${focoPos.lat},${focoPos.lng}`} target="_blank" rel="noopener noreferrer"
                                            className="min-h-[44px] px-2 flex items-center text-xs font-semibold text-primary hover:text-primaryDark">
                                            Abrir no Google Maps
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                        <div>
                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${situacao.classe}`}>{situacao.rotulo}</span>
                            <p className="text-xs text-gray-500 mt-1.5">{situacao.desc}</p>
                            {situacao.balcaoPorNome && (
                                <p className="text-[11px] text-gray-500 mt-0.5">Marcado por {situacao.balcaoPorNome}</p>
                            )}
                        </div>
                        {podeEditar && (
                            <button type="button" onClick={() => setMostrarMapa(true)}
                                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs flex items-center gap-1.5 min-h-[44px]">
                                <MapPin className="h-3.5 w-3.5" /> Ajustar no mapa
                            </button>
                        )}
                    </>
                )}
            </div>

            <ModalPontoGps
                aberto={mostrarMapa}
                onFechar={() => setMostrarMapa(false)}
                clienteUuid={clienteUuid}
                clienteNome={clienteNome}
                pontoAtual={dados?.Ponto_GPS || null}
                sugestao={infoGps.sugestao || null}
                origem="CADASTRO"
                onSalvo={(pontoNovo, r) => {
                    if (r?.pendente) toast('Mudança registrada — espera aprovação da logística.', { icon: '🕓' });
                    else if (pontoNovo) toast.success('Ponto GPS salvo!');
                    if (autonomo) carregar();
                    onAtualizado?.();
                }}
            />
        </div>
    );
}
