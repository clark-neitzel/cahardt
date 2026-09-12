import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import gpsClientesService from '../../services/gpsClientesService';
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

export default function QualidadeGps({
    clienteUuid,
    clienteNome = '',
    pontoGps,          // "lat,lng" | null — controlado; omitido = busca sozinho
    gps,               // { balcao, selo, sugestao, balcaoPorNome } — controlado
    podeEditar = false,
    onAtualizado,       // () => void — chamado após salvar/mover o ponto
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

    // Mini-mapa só-leitura (sem arrastar/zoom) — some se não houver ponto
    useEffect(() => {
        if (!ponto || !mapRef.current || mapObj.current) return;
        const map = L.map(mapRef.current, {
            zoomControl: false, dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, boxZoom: false, keyboard: false,
            attributionControl: false, tap: false,
        }).setView([ponto.lat, ponto.lng], 15);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        L.circleMarker([ponto.lat, ponto.lng], {
            radius: 8, color: '#00754A', fillColor: '#00754A', fillOpacity: 0.6, weight: 2
        }).addTo(map);
        mapObj.current = map;
    }, [ponto?.lat, ponto?.lng]);

    // Desmonta o mini-mapa quando o ponto some/troca de cliente
    useEffect(() => () => {
        if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
    }, [clienteUuid]);

    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
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
                        {ponto ? (
                            <div ref={mapRef} className="h-32 w-full rounded-lg overflow-hidden border border-gray-100 pointer-events-none" />
                        ) : (
                            <div className="h-32 w-full rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-400">
                                <MapPin className="h-6 w-6" />
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
