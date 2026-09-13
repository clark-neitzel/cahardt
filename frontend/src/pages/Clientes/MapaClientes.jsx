import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinned, Loader2, ArrowLeft, User, Users, CalendarDays, MapPinOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import PageHeader from '../../components/PageHeader';
import vendedorService from '../../services/vendedorService';
import categoriaClienteService from '../../services/categoriaClienteService';
import mapaClientesService from '../../services/mapaClientesService';
import { opcoesVendedorMulti, somenteAtivos } from '../../utils/vendedoresFiltro';
import useDadosMapa, { FILTROS_PADRAO } from './mapaClientes/useDadosMapa';
import FiltrosMapa from './mapaClientes/FiltrosMapa';
import LegendaMapa from './mapaClientes/LegendaMapa';
import Contadores from './mapaClientes/Contadores';
import DrawerCliente from './mapaClientes/DrawerCliente';
import PainelVizinhos from './mapaClientes/PainelVizinhos';
import PainelParadas from './mapaClientes/PainelParadas';
import ListaSemGps from './mapaClientes/ListaSemGps';
import { criarIconeFatias } from './mapaClientes/marcador';

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de Clientes (Clientes → Mapa). Plano: docs/mapa-clientes/PLANO.md.
// Todos os clientes com Ponto_GPS num mapa Leaflet, coloridos por dia de
// entrega / venda / categoria / vendedor / WhatsApp / cidade; painel lateral
// (bottom-sheet no celular) com a ficha + edição rápida, vizinhos atendidos em
// dias diferentes, paradas por dia e a lista de quem ficou fora por não ter GPS.
// Uma carga só (GET /mapa-clientes); filtros, contagens e legenda rodam no
// navegador. Sem km/OSRM/IA nesta fase.
// ─────────────────────────────────────────────────────────────────────────────

const ABAS = [
    { id: 'cliente', label: 'Cliente', icon: User },
    { id: 'vizinhos', label: 'Vizinhos', icon: Users },
    { id: 'paradas', label: 'Paradas', icon: CalendarDays },
    { id: 'semgps', label: 'Sem GPS', icon: MapPinOff },
];

const ATIVO_API = { ativos: 'true', inativos: 'false', todos: 'todos' };

export default function MapaClientes() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const perms = user?.permissoes || {};
    // Espelho exato do gate do PUT /mapa-clientes/config
    const podeSalvarPadrao = !!(perms.admin || perms.clientes?.edit);

    const [filtros, setFiltros] = useFiltrosSalvos('mapa-clientes', FILTROS_PADRAO);
    const dm = useDadosMapa(filtros);

    const [selecionado, setSelecionado] = useState(null);       // uuid
    const [aba, setAba] = useState('cliente');
    const [sheetAberta, setSheetAberta] = useState(false);
    const toqueY = useRef(null);
    // Instante do último arraste da alça: o click que vem logo depois (< 300 ms) é o
    // eco do gesto e deve ser ignorado; um toque posterior tem de funcionar normalmente
    // (o navegador nem sempre dispara click após drag — uma flag fixa engolia o toque seguinte).
    const ultimoArraste = useRef(0);

    // Listas auxiliares (filtro = inclui inativos; formulário = só ativos)
    const [vendedores, setVendedores] = useState([]);
    const [categoriasCadastro, setCategoriasCadastro] = useState([]);
    useEffect(() => {
        vendedorService.listarParaFiltro().then(l => setVendedores(Array.isArray(l) ? l : [])).catch(() => setVendedores([]));
        categoriaClienteService.listar().then(l => setCategoriasCadastro(Array.isArray(l) ? l : [])).catch(() => setCategoriasCadastro([]));
    }, []);
    const opVendedoresFiltro = useMemo(() => opcoesVendedorMulti(vendedores), [vendedores]);
    const vendedoresAtivos = useMemo(() => somenteAtivos(vendedores), [vendedores]);
    // Categorias: cadastro ∪ as que aparecem em algum cliente (nenhuma some do menu)
    const categorias = useMemo(() => {
        const m = new Map();
        categoriasCadastro.forEach(c => c?.id && m.set(c.id, { id: c.id, nome: c.nome }));
        (dm.dados?.opcoes?.categorias || []).forEach(c => { if (c?.id && !m.has(c.id)) m.set(c.id, { id: c.id, nome: c.nome }); });
        return [...m.values()].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    }, [categoriasCadastro, dm.dados]);

    const porUuid = useMemo(() => {
        const m = new Map();
        dm.clientes.forEach(c => m.set(c.uuid, c));
        return m;
    }, [dm.clientes]);
    const clienteSel = selecionado ? porUuid.get(selecionado) : null;
    const uuidsFiltrados = useMemo(() => new Set(dm.filtrados.map(c => c.uuid)), [dm.filtrados]);

    // ── Vizinhos ────────────────────────────────────────────────────────────
    const [raio, setRaio] = useState('');              // valor do campo (string)
    const [raioAplicado, setRaioAplicado] = useState(null); // null = padrão do servidor
    const [viz, setViz] = useState({ resultado: null, carregando: false, erro: null });
    const [parSelecionado, setParSelecionado] = useState(null);
    const [destaque, setDestaque] = useState(() => new Set());
    const [salvandoPadrao, setSalvandoPadrao] = useState(false);
    const ativoApi = ATIVO_API[filtros.ativo] || 'true';
    // Parâmetros via ref: o efeito abaixo dispara só quando a BASE chega (dm.dados já
    // reflete o filtro ativo/inativo) ou quando o raio é aplicado — não 2× por troca de filtro.
    const paramsViz = useRef({ raioAplicado, ativoApi });
    paramsViz.current = { raioAplicado, ativoApi };
    const pedidoViz = useRef(0);

    const carregarVizinhos = useCallback(async () => {
        const id = ++pedidoViz.current;
        setViz(v => ({ ...v, carregando: true, erro: null }));
        try {
            const r = await mapaClientesService.vizinhos({ raio: paramsViz.current.raioAplicado, ativo: paramsViz.current.ativoApi });
            if (id !== pedidoViz.current) return; // resposta velha
            setViz({ resultado: r, carregando: false, erro: null });
            setRaio(prev => (prev === '' && r?.raioMetros != null ? String(r.raioMetros) : prev));
        } catch (e) {
            if (id !== pedidoViz.current) return;
            console.error('[MapaClientes] vizinhos', e);
            setViz({ resultado: null, carregando: false, erro: e?.response?.data?.error || 'Não foi possível calcular os vizinhos.' });
        }
    }, []);
    useEffect(() => { if (dm.dados) carregarVizinhos(); }, [dm.dados, raioAplicado, carregarVizinhos]);

    const salvarPadrao = async (n) => {
        if (!Number.isFinite(n) || n < 100 || n > 20000) { toast.error('Raio entre 100 e 20.000 metros.'); return; }
        setSalvandoPadrao(true);
        try {
            await mapaClientesService.salvarConfig({ raioMetros: n });
            toast.success(`Raio padrão salvo: ${n} m`);
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Não foi possível salvar o raio padrão.');
        } finally { setSalvandoPadrao(false); }
    };

    // ── Mapa Leaflet ────────────────────────────────────────────────────────
    const mapRef = useRef(null);
    const mapObj = useRef(null);
    const camada = useRef(null);
    const enquadrou = useRef(false);

    useEffect(() => {
        if (!mapRef.current || mapObj.current) return;
        const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
            .setView([-25.9, -49.2], 8);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
        map.on('click', () => setSelecionado(null));
        mapObj.current = map;
        // A sidebar muda a largura: o Leaflet precisa ser avisado para redesenhar
        const observarTamanho = new ResizeObserver(() => map.invalidateSize({ animate: false }));
        observarTamanho.observe(mapRef.current);
        return () => {
            observarTamanho.disconnect();
            map.remove();
            mapObj.current = null;
            camada.current = null;
        };
    }, []);

    const enquadrar = useCallback((lista) => {
        const map = mapObj.current;
        const pts = (lista || dm.visiveisNoMapa.map(v => v.cliente)).filter(c => c?.gps).map(c => [c.gps.lat, c.gps.lng]);
        if (!map || !pts.length) return;
        map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 16 });
    }, [dm.visiveisNoMapa]);

    // Marcadores: a camada inteira é recriada quando muda o conjunto/cor/seleção
    // (< 100 ms para ~1.200 pinos) — nunca a cada moveend.
    useEffect(() => {
        const map = mapObj.current;
        if (!map) return;
        if (camada.current) { camada.current.remove(); camada.current = null; }
        const grupo = L.layerGroup();
        for (const { cliente: c, cores } of dm.visiveisNoMapa) {
            const mk = L.marker([c.gps.lat, c.gps.lng], {
                icon: criarIconeFatias(cores, { selecionado: c.uuid === selecionado, destaque: destaque.has(c.uuid) }),
                keyboard: false,
                title: c.fantasia || c.nome || '',
            }).on('click', () => { setSelecionado(c.uuid); setAba('cliente'); setSheetAberta(true); });
            grupo.addLayer(mk);
        }
        grupo.addTo(map);
        camada.current = grupo;
        if (!enquadrou.current && dm.visiveisNoMapa.length) { enquadrou.current = true; enquadrar(); }
    }, [dm.visiveisNoMapa, selecionado, destaque, enquadrar]);

    // ── Ações ───────────────────────────────────────────────────────────────
    const abrirCliente = (uuid) => {
        setSelecionado(uuid);
        setAba('cliente');
        setSheetAberta(true);
        const c = porUuid.get(uuid);
        if (c?.gps && mapObj.current) mapObj.current.panTo([c.gps.lat, c.gps.lng]);
    };

    const selecionarPar = (p) => {
        const chave = `${p.a.uuid}|${p.b.uuid}`;
        setParSelecionado(chave);
        setDestaque(new Set([p.a.uuid, p.b.uuid]));
        const map = mapObj.current;
        if (map && p.a.gps && p.b.gps) {
            map.fitBounds(L.latLngBounds([[p.a.gps.lat, p.a.gps.lng], [p.b.gps.lat, p.b.gps.lng]]).pad(0.3), { maxZoom: 18 });
        }
    };

    // Atualização otimista resolve a tela; ela muda dm.dados, e o efeito dos
    // vizinhos já refaz a consulta sozinho (1 chamada — não chamar aqui de novo).
    const aoSalvar = (uuid, patch) => dm.atualizarLocal(uuid, patch);

    const irPara = (id) => { setAba(id); setSheetAberta(true); };

    const tituloSheet = aba === 'cliente'
        ? (clienteSel ? (clienteSel.fantasia || clienteSel.nome) : 'Toque num pino')
        : ABAS.find(a => a.id === aba)?.label;

    return (
        <div className="max-w-full overflow-x-hidden">
            <PageHeader
                icon={MapPinned}
                cor="green"
                titulo="Mapa de Clientes"
                subtitulo="Dias de entrega e venda por região — corrija na hora"
                acoes={(
                    <>
                        <button type="button" onClick={() => dm.recarregar()} title="Recarregar" className="p-2 min-h-[40px] min-w-[40px] text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100">
                            <RefreshCw className={`h-4 w-4 ${dm.carregando ? 'animate-spin' : ''}`} />
                        </button>
                        <button type="button" onClick={() => navigate('/clientes')} className="px-4 py-2 min-h-[40px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm inline-flex items-center gap-1.5">
                            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Voltar para</span> Clientes
                        </button>
                    </>
                )}
            />

            <div className="px-3 md:px-6 pb-3 md:pb-6">
                <FiltrosMapa
                    filtros={filtros}
                    setFiltros={setFiltros}
                    opcoes={dm.dados?.opcoes}
                    vendedores={opVendedoresFiltro}
                    categorias={categorias}
                    onEnquadrar={() => enquadrar()}
                />
                <Contadores contadores={dm.contadores} onVerSemGps={() => irPara('semgps')} onVerParadas={() => irPara('paradas')} />

                {/* z-0 + isolate: prende os z-index do Leaflet e dos overlays desta tela
                    abaixo do menu lateral (z-50) — ver MapaExpedicao.jsx. */}
                <div className="relative z-0 isolate flex flex-col md:flex-row bg-white border border-gray-200 rounded-b-xl shadow-sm overflow-hidden h-[calc(100dvh-360px)] md:h-[calc(100dvh-300px)] min-h-[420px]">
                    <div className="relative flex-1 min-w-0">
                        <div ref={mapRef} className="absolute inset-0" />

                        {dm.carregando && (
                            <div className="absolute inset-0 z-[1060] bg-white/70 flex items-center justify-center">
                                <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando os clientes…
                                </div>
                            </div>
                        )}
                        {dm.erro && !dm.carregando && (
                            <div className="absolute inset-x-3 top-3 z-[1060] bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-center justify-between gap-2">
                                <span>{dm.erro}</span>
                                <button type="button" onClick={() => dm.recarregar()} className="px-3 py-1.5 min-h-[36px] bg-white border border-red-300 rounded-full text-xs font-semibold">Tentar de novo</button>
                            </div>
                        )}

                        <LegendaMapa
                            itens={dm.legenda}
                            colorirPor={filtros.colorirPor}
                            onToggle={dm.toggleValor}
                            onMostrarTodos={dm.mostrarTodos}
                            className="absolute bottom-16 left-3 right-3 md:bottom-auto md:top-3 md:right-3 md:left-auto md:w-64 z-[1050]"
                        />
                    </div>

                    {/* Painel lateral (desktop) / bottom-sheet (celular) */}
                    <div
                        className={`absolute md:static bottom-0 left-0 right-0 z-[1100] md:z-auto md:w-[380px] md:shrink-0 md:h-full
                            bg-white md:border-l md:border-gray-200 rounded-t-2xl md:rounded-none
                            shadow-[0_-8px_24px_rgba(0,0,0,.18)] md:shadow-none flex flex-col
                            max-h-[78%] md:max-h-none transition-transform duration-200 will-change-transform
                            ${sheetAberta ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'} md:translate-y-0`}
                    >
                        <button
                            type="button"
                            className="md:hidden w-full flex flex-col items-center gap-1 pt-2 pb-1.5 min-h-[44px] touch-none"
                            onTouchStart={e => { toqueY.current = e.touches[0].clientY; }}
                            onTouchEnd={e => {
                                if (toqueY.current == null) return;
                                const dy = e.changedTouches[0].clientY - toqueY.current;
                                toqueY.current = null;
                                if (Math.abs(dy) > 30) { setSheetAberta(dy < 0); ultimoArraste.current = Date.now(); }
                            }}
                            onClick={() => {
                                if (Date.now() - ultimoArraste.current < 300) return;
                                setSheetAberta(v => !v);
                            }}
                        >
                            <span className="w-10 h-1.5 rounded-full bg-gray-300" />
                            <span className="text-xs font-semibold text-gray-600 truncate max-w-full px-4">
                                {sheetAberta ? 'Fechar painel' : tituloSheet}
                            </span>
                        </button>

                        <div className="px-3 md:px-4 pt-1 md:pt-3 pb-2 flex gap-1.5 overflow-x-auto hide-scrollbar border-b border-gray-100">
                            {ABAS.map(a => {
                                const Icon = a.icon;
                                const badge = a.id === 'semgps' && dm.contadores.semGps ? dm.contadores.semGps : null;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        aria-pressed={aba === a.id}
                                        onClick={() => setAba(a.id)}
                                        className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-full text-xs font-semibold border ${aba === a.id ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        <Icon className="h-3.5 w-3.5" /> {a.label}
                                        {badge != null && <span className={`ml-0.5 rounded-full px-1.5 text-[10px] ${aba === a.id ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>{badge}</span>}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 md:p-4">
                            {aba === 'cliente' && (
                                clienteSel
                                    ? <DrawerCliente cliente={clienteSel} categorias={categorias} vendedoresAtivos={vendedoresAtivos} onSalvo={aoSalvar} onFechar={() => setSelecionado(null)} />
                                    : (
                                        <div className="text-center py-8 px-4">
                                            <div className="bg-mint w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"><MapPinned className="h-6 w-6 text-primary" /></div>
                                            <p className="text-sm font-bold text-gray-700">Toque num pino do mapa</p>
                                            <p className="text-xs text-gray-500 mt-1">A ficha resumida aparece aqui, com dia de entrega, dia de venda, categoria e vendedor para corrigir na hora.</p>
                                        </div>
                                    )
                            )}
                            {aba === 'vizinhos' && (
                                <PainelVizinhos
                                    resultado={viz.resultado}
                                    carregando={viz.carregando}
                                    erro={viz.erro}
                                    uuidsFiltrados={uuidsFiltrados}
                                    raio={raio}
                                    setRaio={setRaio}
                                    onAplicar={(n) => setRaioAplicado(n)}
                                    onSalvarPadrao={salvarPadrao}
                                    podeSalvarPadrao={podeSalvarPadrao}
                                    salvandoPadrao={salvandoPadrao}
                                    parSelecionado={parSelecionado}
                                    onSelecionarPar={selecionarPar}
                                    onEditarCliente={abrirCliente}
                                />
                            )}
                            {aba === 'paradas' && <PainelParadas contadores={dm.contadores} />}
                            {aba === 'semgps' && <ListaSemGps clientes={dm.semGps} onSelecionar={abrirCliente} />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
