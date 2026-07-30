import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin, LocateFixed, Check, Loader2, ShieldCheck, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import gpsClientesService from '../services/gpsClientesService';
import SelectBusca from './SelectBusca';

// ─────────────────────────────────────────────────────────────────────────────
// Escolher o ponto GPS do cliente NO MAPA (OpenStreetMap, sem chave de API).
// O alfinete fica fixo no centro; a pessoa arrasta o MAPA até a porta do
// cliente. A bolinha azul mostra onde o celular está agora (funciona offline).
//
// Modos:
//  - com `clienteUuid`: salva direto no backend (validação de duplicado/empresa/
//    próximo + auditoria). Sem internet, guarda no aparelho e envia depois.
//  - com `onEscolher` (sem uuid): só devolve o "lat,lng" escolhido (cadastro novo).
// ─────────────────────────────────────────────────────────────────────────────

const parseLatLng = (s) => {
    if (!s) return null;
    const [lat, lng] = String(s).split(',').map(x => parseFloat(String(x).trim()));
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
};
const fmt = (c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;

export default function ModalPontoGps({
    aberto,
    onFechar,
    clienteUuid = null,
    clienteNome = '',
    pontoAtual = null,     // "lat,lng" já cadastrado (mostrado apagado, para comparar)
    sugestao = null,       // "lat,lng" sugerido (centro dos sinais) — abre centrado nele
    origem = 'CADASTRO',   // CADASTRO | ROTA | SAUDE | PEDIDO | MOTORISTA
    onEscolher = null,     // (ponto) => void — modo "só devolver o valor"
    onSalvo = null,        // (ponto, resultado) => void — após salvar no backend
}) {
    const mapRef = useRef(null);
    const mapObj = useRef(null);
    const marcadorAntigo = useRef(null);
    const marcadorPos = useRef(null);
    const circuloPos = useRef(null);
    const debounceRef = useRef(null);
    const watchRef = useRef(null);

    const [posAtual, setPosAtual] = useState(null);       // { lat, lng, accuracy }
    const [problema, setProblema] = useState(null);        // resultado da validação prévia
    const [validando, setValidando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [distDoAntigo, setDistDoAntigo] = useState(null);
    const [autorizar, setAutorizar] = useState(null);      // { mensagem, clienteConflito }
    const [autorizadores, setAutorizadores] = useState([]);
    const [autorizadorId, setAutorizadorId] = useState('');
    const [senhaAutorizador, setSenhaAutorizador] = useState('');
    const [avisoFinal, setAvisoFinal] = useState(null);    // { tipo: 'pendente'|'offline', texto }
    const [buscandoPos, setBuscandoPos] = useState(false); // "Usar minha posição" em andamento

    // Endereço do cadastro localizado no mapa (marcador laranja + botão "Ir para o endereço")
    const marcadorEnd = useRef(null);
    const endGeoRef = useRef(null);                        // {lat,lng} | 'FALHOU' | null (ainda não buscou)
    const [buscandoEnd, setBuscandoEnd] = useState(false); // "Ir para o endereço" em andamento

    const distanciaM = (a, b) => {
        const R = 6371000, toRad = (g) => (g * Math.PI) / 180;
        const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
    };

    const centradoNoEndereco = useRef(false); // impede a bolinha azul de "roubar" o centro do endereço

    // Ponto GPS já cadastrado (bolinha cinza) — atalho para voltar até ele
    const pontoSalvo = parseLatLng(pontoAtual);
    const irParaPontoSalvo = () => {
        if (pontoSalvo && mapObj.current) mapObj.current.setView([pontoSalvo.lat, pontoSalvo.lng], 18);
    };

    // Localiza o endereço do cadastro (geocodificado no backend, com cache) uma vez por abertura
    const obterEnderecoGeo = async () => {
        if (!clienteUuid) return null;
        if (endGeoRef.current) return endGeoRef.current === 'FALHOU' ? null : endGeoRef.current;
        try {
            const r = await gpsClientesService.geocodeEndereco(clienteUuid);
            const geo = parseLatLng(r?.geo);
            endGeoRef.current = geo ? { ...geo, precisao: r.precisao } : 'FALHOU';
        } catch {
            endGeoRef.current = 'FALHOU'; // sem internet/serviço fora: botão avisa, nada quebra
        }
        return endGeoRef.current === 'FALHOU' ? null : endGeoRef.current;
    };

    const marcarEndereco = (geo) => {
        if (!mapObj.current || !geo) return;
        if (!marcadorEnd.current) {
            marcadorEnd.current = L.circleMarker([geo.lat, geo.lng], {
                radius: 8, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.4, weight: 2
            }).addTo(mapObj.current).bindTooltip('Endereço do cadastro (aproximado)');
        } else {
            marcadorEnd.current.setLatLng([geo.lat, geo.lng]);
        }
    };

    const irParaEndereco = async () => {
        setBuscandoEnd(true);
        try {
            const geo = await obterEnderecoGeo();
            if (!geo) {
                toast('Não deu para localizar o endereço do cadastro no mapa — arraste até a porta do cliente.', { icon: '🗺️', duration: 6000 });
                return;
            }
            marcarEndereco(geo);
            centradoNoEndereco.current = true;
            mapObj.current?.setView([geo.lat, geo.lng], geo.precisao === 'cep' ? 15 : 17);
            if (geo.precisao === 'cep') toast('Endereço localizado só pelo CEP — posição aproximada.', { icon: '📍', duration: 5000 });
        } finally {
            setBuscandoEnd(false);
        }
    };

    const validarCentro = useCallback((centro) => {
        clearTimeout(debounceRef.current);
        const antigo = parseLatLng(pontoAtual);
        setDistDoAntigo(antigo ? distanciaM(antigo, centro) : null);
        debounceRef.current = setTimeout(async () => {
            setValidando(true);
            try {
                const r = await gpsClientesService.validar(fmt(centro), clienteUuid);
                setProblema(r.problema || null);
            } catch {
                setProblema(null); // sem internet: valida na hora de salvar (ou na fila)
            } finally {
                setValidando(false);
            }
        }, 500);
    }, [clienteUuid, pontoAtual]);

    // Montar o mapa quando abre
    useEffect(() => {
        if (!aberto || !mapRef.current || mapObj.current) return;

        const inicial = parseLatLng(sugestao) || parseLatLng(pontoAtual) || { lat: -14.235, lng: -51.925 };
        const zoomInicial = (sugestao || pontoAtual) ? 17 : 4;

        const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
            .setView([inicial.lat, inicial.lng], zoomInicial);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        const antigo = parseLatLng(pontoAtual);
        if (antigo) {
            marcadorAntigo.current = L.circleMarker([antigo.lat, antigo.lng], {
                radius: 9, color: '#9ca3af', fillColor: '#9ca3af', fillOpacity: 0.5, weight: 2
            }).addTo(map).bindTooltip('Ponto atual do cadastro');
        }

        map.on('moveend', () => validarCentro(map.getCenter()));
        mapObj.current = map;
        validarCentro(map.getCenter());

        // Endereço do cadastro: marca no mapa e, se o cliente ainda não tem ponto,
        // já abre centrado no endereço (em vez do Brasil inteiro / posição da pessoa)
        obterEnderecoGeo().then(geo => {
            if (!geo || !mapObj.current) return;
            marcarEndereco(geo);
            if (!pontoAtual && !sugestao) {
                centradoNoEndereco.current = true;
                mapObj.current.setView([geo.lat, geo.lng], geo.precisao === 'cep' ? 15 : 17);
            }
        });

        // Bolinha azul: posição do aparelho (GPS no celular; Wi-Fi no computador)
        if (navigator.geolocation) {
            const aplicarPos = (pos) => {
                const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
                setPosAtual(p);
                if (!marcadorPos.current) {
                    circuloPos.current = L.circle([p.lat, p.lng], {
                        radius: Math.min(p.accuracy || 30, 150), color: '#3b82f6', weight: 1, fillOpacity: 0.1
                    }).addTo(map);
                    marcadorPos.current = L.circleMarker([p.lat, p.lng], {
                        radius: 7, color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2
                    }).addTo(map).bindTooltip('Você está aqui');
                    // Sem ponto cadastrado nem sugestão (e sem já ter centrado no
                    // endereço do cadastro): centraliza na posição da pessoa
                    if (!pontoAtual && !sugestao && !centradoNoEndereco.current) map.setView([p.lat, p.lng], 17);
                } else {
                    marcadorPos.current.setLatLng([p.lat, p.lng]);
                    circuloPos.current.setLatLng([p.lat, p.lng]);
                }
            };
            watchRef.current = navigator.geolocation.watchPosition(
                aplicarPos,
                (errW) => {
                    // Desktop: alta precisão pode falhar — tenta 1x em modo compatível (Wi-Fi)
                    if (!marcadorPos.current && errW.code !== 1) {
                        navigator.geolocation.getCurrentPosition(aplicarPos, () => { }, {
                            enableHighAccuracy: false, timeout: 15000, maximumAge: 120000
                        });
                    }
                },
                { enableHighAccuracy: true, maximumAge: 10000 }
            );
        }

        return () => { };
    }, [aberto, pontoAtual, sugestao, validarCentro]);

    // Desmontar ao fechar
    useEffect(() => {
        if (aberto) return;
        if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
        if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
        marcadorAntigo.current = null; marcadorPos.current = null; circuloPos.current = null;
        marcadorEnd.current = null; endGeoRef.current = null; centradoNoEndereco.current = false;
        setProblema(null); setAutorizar(null); setAvisoFinal(null); setBuscandoEnd(false);
        setAutorizadorId(''); setSenhaAutorizador(''); setDistDoAntigo(null);
    }, [aberto]);

    const usarMinhaPosicao = async () => {
        if (posAtual && mapObj.current) {
            mapObj.current.setView([posAtual.lat, posAtual.lng], 18);
            return;
        }
        const ehMac = /Macintosh/i.test(navigator.userAgent);
        if (!navigator.geolocation) {
            toast('Este navegador não informa localização — arraste o mapa até a porta do cliente.', { icon: '🗺️', duration: 6000 });
            return;
        }

        const obter = (highAcc, timeout) => new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: highAcc, timeout, maximumAge: 120000
            }));

        setBuscandoPos(true);
        try {
            // 1ª tentativa: precisão alta (GPS). Desktop localiza por Wi-Fi — se
            // falhar, tenta de novo em modo compatível (precisão baixa).
            let pos;
            try {
                pos = await obter(true, 10000);
            } catch (e1) {
                if (e1.code === 1) throw e1; // permissão negada: repetir não adianta
                pos = await obter(false, 15000);
            }
            mapObj.current?.setView([pos.coords.latitude, pos.coords.longitude], 18);
            setPosAtual({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        } catch (err) {
            // Diagnóstico preciso: permissão do SITE × serviço de localização do SISTEMA
            let estadoPermissao = null;
            try {
                estadoPermissao = (await navigator.permissions?.query({ name: 'geolocation' }))?.state || null;
            } catch { /* navegador sem Permissions API */ }

            if (err.code === 1 || estadoPermissao === 'denied') {
                toast('O NAVEGADOR está bloqueando a localização deste site. Clique no cadeado 🔒 na barra de endereço → Localização → Permitir, e tente de novo.', { icon: '🔒', duration: 9000 });
            } else if (ehMac) {
                toast('O site tem permissão, mas o macOS não devolveu a posição. Confira: Ajustes do Sistema → Privacidade e Segurança → Serviços de Localização → ligado, e o seu navegador (Chrome/Safari) marcado na lista. Depois tente de novo — ou arraste o mapa até a porta do cliente.', { icon: '🖥️', duration: 10000 });
            } else {
                toast.error('Não foi possível obter sua localização. Verifique o GPS/serviço de localização do aparelho e tente de novo — ou arraste o mapa até o lugar certo.', { duration: 7000 });
            }
        } finally {
            setBuscandoPos(false);
        }
    };

    const abrirAutorizacao = async (resp) => {
        setAutorizar({ mensagem: resp.error || resp.mensagem, clienteConflito: resp.clienteConflito });
        try { setAutorizadores(await gpsClientesService.autorizadores()); } catch { setAutorizadores([]); }
    };

    const salvar = async (comAutorizacao = null) => {
        if (!mapObj.current) return;
        const centro = mapObj.current.getCenter();
        const ponto = fmt({ lat: centro.lat, lng: centro.lng });

        // Modo "só devolver o valor" (cadastro novo, cliente ainda sem UUID)
        if (!clienteUuid && onEscolher) {
            if (problema && problema.codigo !== 'PROXIMO') { return; }
            onEscolher(ponto);
            onFechar();
            return;
        }

        setSalvando(true);
        const dados = {
            ponto,
            posicaoAutor: posAtual ? fmt(posAtual) : null,
            origem,
            autorizacao: comAutorizacao || null
        };
        try {
            const r = await gpsClientesService.salvarPonto(clienteUuid, dados);
            if (r.pendente) {
                setAvisoFinal({
                    tipo: 'pendente',
                    texto: 'Este cliente tem ponto CONFIRMADO e a mudança é grande. A alteração foi registrada e espera aprovação da logística — o ponto antigo continua valendo até lá.'
                });
                if (onSalvo) onSalvo(null, r);
            } else {
                if (onSalvo) onSalvo(ponto, r);
                onFechar();
            }
        } catch (e) {
            const resp = e.response?.data;
            if (resp?.codigo === 'PROXIMO') {
                abrirAutorizacao(resp);
            } else if (resp?.codigo) {
                setProblema(resp); // DUPLICADO / EMPRESA / INVALIDO — segue bloqueado
            } else if (!e.response) {
                // Sem internet: guarda no aparelho e envia quando o sinal voltar
                gpsClientesService.enfileirarOffline(clienteUuid, dados);
                setAvisoFinal({
                    tipo: 'offline',
                    texto: 'Sem internet agora — o ponto ficou guardado no aparelho e será enviado sozinho quando o sinal voltar.'
                });
                if (onSalvo) onSalvo(ponto, { offline: true });
            } else {
                alert(resp?.error || 'Erro ao salvar o ponto.');
            }
        } finally {
            setSalvando(false);
        }
    };

    const confirmarAutorizacao = () => {
        if (!autorizadorId || !senhaAutorizador) return;
        setAutorizar(null);
        salvar({ vendedorId: autorizadorId, senha: senhaAutorizador });
    };

    if (!aberto) return null;

    const bloqueado = problema && problema.codigo !== 'PROXIMO';

    return (
        <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
            <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-1.5 rounded-lg"><MapPin className="h-4 w-4 text-primary" /></div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">Ponto GPS{clienteNome ? ` — ${clienteNome}` : ''}</p>
                            <p className="text-[11px] text-gray-500">Arraste o mapa até a porta do cliente</p>
                        </div>
                    </div>
                    <button onClick={onFechar} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Mapa com alfinete fixo no centro */}
                <div className="relative">
                    <div ref={mapRef} className="h-72 md:h-80 w-full" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full z-[500] pointer-events-none text-3xl drop-shadow-md select-none">📍</div>
                    {validando && (
                        <div className="absolute top-2 right-2 z-[500] bg-white/90 rounded-full p-1.5 shadow">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                    )}
                </div>

                {/* Avisos + ações */}
                <div className="p-4 space-y-2 overflow-y-auto">
                    {avisoFinal ? (
                        <>
                            <div className={`text-[13px] rounded-lg px-3 py-2.5 border ${avisoFinal.tipo === 'pendente' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                                {avisoFinal.texto}
                            </div>
                            <button onClick={onFechar} className="w-full px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">
                                Entendi
                            </button>
                        </>
                    ) : autorizar ? (
                        <>
                            <div className="text-[13px] bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5">
                                🚫 {autorizar.mensagem}
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 flex items-center gap-1.5">
                                    <ShieldCheck className="h-3.5 w-3.5" /> Autorização da logística
                                </p>
                                <SelectBusca value={autorizadorId} onChange={e => setAutorizadorId(e.target.value)} className="w-full">
                                    <option value="">Quem autoriza?</option>
                                    {autorizadores.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                                </SelectBusca>
                                <input
                                    type="password"
                                    value={senhaAutorizador}
                                    onChange={e => setSenhaAutorizador(e.target.value)}
                                    placeholder="Senha do autorizador"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setAutorizar(null)} className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm">
                                        Voltar
                                    </button>
                                    <button
                                        onClick={confirmarAutorizacao}
                                        disabled={!autorizadorId || !senhaAutorizador || salvando}
                                        className="flex-1 px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm disabled:opacity-50"
                                    >
                                        Liberar e salvar
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {problema && (
                                <div className={`text-[13px] rounded-lg px-3 py-2.5 border ${problema.codigo === 'PROXIMO' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                    {problema.codigo === 'PROXIMO' ? '⚠️' : '🚫'} {problema.mensagem || problema.error}
                                </div>
                            )}
                            {!problema && distDoAntigo != null && distDoAntigo > 30 && (
                                <div className="text-[13px] bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2.5">
                                    📏 O alfinete está a <b>{distDoAntigo >= 1000 ? `${(distDoAntigo / 1000).toFixed(1)} km` : `${distDoAntigo} m`}</b> do ponto atual do cadastro (bolinha cinza).
                                </div>
                            )}
                            {/* Atalhos de navegação: endereço do cadastro · ponto salvo · minha posição */}
                            <div className={`grid gap-2 ${clienteUuid ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                {clienteUuid && (
                                    <button onClick={irParaEndereco} disabled={buscandoEnd} title="Centraliza no endereço escrito do cadastro (bolinha laranja)" className="px-2 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-[12px] flex items-center justify-center gap-1.5 min-h-[44px] disabled:opacity-60">
                                        {buscandoEnd ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Home className="h-4 w-4 shrink-0" />}
                                        Endereço
                                    </button>
                                )}
                                {pontoSalvo ? (
                                    <button onClick={irParaPontoSalvo} title="Centraliza no ponto GPS cadastrado (bolinha cinza)" className="px-2 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-[12px] flex items-center justify-center gap-1.5 min-h-[44px]">
                                        <MapPin className="h-4 w-4 shrink-0" />
                                        Ponto salvo
                                    </button>
                                ) : (
                                    <button disabled title="Este cliente ainda não tem ponto GPS cadastrado" className="px-2 py-2 bg-gray-50 border border-gray-200 text-gray-400 rounded-full font-medium text-[12px] flex items-center justify-center gap-1.5 min-h-[44px] cursor-not-allowed">
                                        <MapPin className="h-4 w-4 shrink-0" />
                                        Sem ponto
                                    </button>
                                )}
                                <button onClick={usarMinhaPosicao} disabled={buscandoPos} title="Centraliza onde você está agora (bolinha azul)" className="px-2 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-[12px] flex items-center justify-center gap-1.5 min-h-[44px] disabled:opacity-60">
                                    {buscandoPos ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <LocateFixed className="h-4 w-4 shrink-0" />}
                                    Minha posição
                                </button>
                            </div>
                            <button
                                onClick={() => salvar()}
                                disabled={salvando || bloqueado}
                                className="w-full px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                            >
                                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                {salvando ? 'Salvando…' : 'Salvar este ponto'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
