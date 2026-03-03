import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MapPin, Phone, MessageCircle, User, Plus, ChevronRight,
    Clock, Calendar, Tag, CheckCircle, ClipboardList, Star,
    Package, X, Navigation, Loader
} from 'lucide-react';
import leadService from '../../services/leadService';
import clienteService from '../../services/clienteService';
import atendimentoService from '../../services/atendimentoService';
import entregasService from '../../services/entregasService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import ModalAtendimento from './ModalAtendimento';
import ModalNovoLead from './ModalNovoLead';
import CheckoutEntregaModal from '../Motorista/Entregas/CheckoutEntregaModal';

const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const ETAPA_COLORS = {
    NOVO: 'bg-blue-100 text-blue-700',
    AMOSTRA: 'bg-yellow-100 text-yellow-800',
    VISITA: 'bg-purple-100 text-purple-700',
    PEDIDO: 'bg-green-100 text-green-700',
    FINALIZADO: 'bg-gray-100 text-gray-500',
};

// Retorna o índice do dia "base" (seg-sex = hoje, sáb/dom = seg)
const getDiaBase = () => {
    const d = new Date().getDay(); // 0=dom, 6=sáb
    if (d === 0 || d === 6) return 1; // segunda
    return d;
};

const getDiaSigla = (idx) => DIAS_SIGLA[idx];

const itemTemDiaBase = (diasStr) => {
    if (!diasStr) return false;
    const base = getDiaSigla(getDiaBase());
    return diasStr.toUpperCase().split(',').map(d => d.trim()).includes(base);
};

const getAtendimentoHoje = (atendimentos) => {
    if (!atendimentos || atendimentos.length === 0) return null;
    const hoje = new Date().toDateString();
    return atendimentos.find(a => new Date(a.criadoEm).toDateString() === hoje);
};

const getPedidoHoje = (pedidos) => {
    if (!pedidos || pedidos.length === 0) return null;
    const hoje = new Date().toDateString();
    return pedidos.find(p => p.createdAt && new Date(p.createdAt).toDateString() === hoje);
};

const isAtendidoHoje = (item) => {
    return !!getAtendimentoHoje(item._atendimentos || item.atendimentos) || !!getPedidoHoje(item._pedidos || item.pedidos);
};

const isProximaVisitaHoje = (proximaVisita) => {
    if (!proximaVisita) return false;
    return new Date(proximaVisita).toDateString() === new Date().toDateString();
};

const abrirMapa = (gps) => {
    if (!gps) return;
    const [lat, lng] = gps.split(',');
    window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
};

// ================================================
// Card de Cliente
// ================================================
const CardCliente = ({ cliente, onAtendimento, onNovoPedido, mostrarAcoes = true }) => {
    const atendHoje = getAtendimentoHoje(cliente._atendimentos);
    const doDia = itemTemDiaBase(cliente.Dia_de_venda); // Cliente do dia

    return (
        <div className={`bg-white rounded-xl border shadow-sm overflow-hidden mb-3 ${doDia ? 'border-green-500/50 ring-1 ring-green-500/20' : 'border-gray-200'}`}>
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Cliente</span>
                            {atendHoje && (
                                <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={atendHoje.vendedor?.nome ? `Atendido por ${atendHoje.vendedor.nome}` : ''}>
                                    <CheckCircle className="h-3 w-3" /> Atendido {atendHoje.vendedor?.nome && `por ${atendHoje.vendedor.nome.split(' ')[0]}`}
                                </span>
                            )}
                            {!atendHoje && getPedidoHoje(cliente._pedidos) && (
                                <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    <CheckCircle className="h-3 w-3" /> Com Pedido Hoje
                                </span>
                            )}
                        </div>
                        <p className="font-bold text-[15px] text-gray-900 leading-tight truncate">{cliente.NomeFantasia || cliente.Nome}</p>
                        {cliente.End_Cidade && <p className="text-[12px] text-gray-500 mt-0.5">{cliente.End_Cidade}</p>}
                    </div>
                    {cliente.Ponto_GPS && (
                        <button onClick={() => abrirMapa(cliente.Ponto_GPS)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg shrink-0">
                            <MapPin className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Informações de atendimento */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {cliente.Dia_de_venda && (
                        <span className="text-[12px] text-gray-600 flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-gray-400" />
                            {cliente.Dia_de_venda}
                            {cliente.Horario_Atendimento && ` · ${cliente.Horario_Atendimento}`}
                        </span>
                    )}
                    {cliente.Dia_de_entrega && (
                        <span className="text-[12px] text-gray-600 flex items-center gap-1">
                            <Package className="h-3 w-3 text-gray-400" />
                            Entrega: {cliente.Dia_de_entrega}
                            {cliente.Horario_Entrega && ` · ${cliente.Horario_Entrega}`}
                        </span>
                    )}
                </div>

                {/* Canais de atendimento */}
                {cliente.Formas_Atendimento?.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                        {cliente.Formas_Atendimento.some(f => f.toUpperCase() === 'PRESENCIAL') && <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><User className="h-3 w-3" />Presencial</span>}
                        {cliente.Formas_Atendimento.some(f => f.toUpperCase() === 'WHATSAPP') && <span className="text-[11px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />WhatsApp</span>}
                        {cliente.Formas_Atendimento.some(f => f.toUpperCase() === 'TELEFONE') && <span className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><Phone className="h-3 w-3" />Telefone</span>}
                    </div>
                )}

                {/* Exibir observação se já atendido */}
                {atendHoje?.observacao && (
                    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="text-[12px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" />
                            Observação do Atendimento
                        </p>
                        <p className="text-[13px] text-gray-600 line-clamp-3">{atendHoje.observacao}</p>
                    </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    {mostrarAcoes && (
                        <button
                            onClick={() => onAtendimento({ tipo: 'cliente', item: cliente })}
                            className="flex-1 bg-blue-600 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 active:opacity-80"
                        >
                            <ClipboardList className="h-4 w-4" /> Registrar Atendimento
                        </button>
                    )}
                    <button
                        onClick={() => onNovoPedido(cliente.UUID)}
                        className={`${mostrarAcoes ? 'bg-gray-100 text-gray-700 w-auto' : 'bg-gray-100 text-gray-700 w-full justify-center'} text-[13px] font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 active:opacity-80`}
                    >
                        <Package className="h-4 w-4" /> Pedido
                    </button>
                </div>
            </div>
        </div>
    );
};

// ================================================
// Card de Lead
// ================================================
const CardLead = ({ lead, onAtendimento, mostrarAcoes = true }) => {
    const atendHoje = getAtendimentoHoje(lead.atendimentos);
    const proxHoje = isProximaVisitaHoje(lead.proximaVisita);

    // Prospectos/Leads ficam com destaque laranja
    return (
        <div className="bg-white rounded-xl border border-orange-400/50 ring-1 ring-orange-500/20 shadow-sm overflow-hidden mb-3">
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Lead #{lead.numero || '?'}</span>
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-600'}`}>{lead.etapa}</span>
                            {atendHoje && (
                                <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={atendHoje.vendedor?.nome ? `Atendido por ${atendHoje.vendedor.nome}` : ''}>
                                    <CheckCircle className="h-3 w-3" /> Atendido {atendHoje.vendedor?.nome && `por ${atendHoje.vendedor.nome.split(' ')[0]}`}
                                </span>
                            )}
                            {proxHoje && !atendHoje && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Star className="h-3 w-3" /> Visita Hoje!</span>}
                        </div>
                        <p className="font-bold text-[15px] text-gray-900 leading-tight truncate">{lead.nomeEstabelecimento}</p>
                        {lead.contato && <p className="text-[12px] text-gray-500 mt-0.5">{lead.contato}</p>}
                    </div>
                    {lead.pontoGps && (
                        <button onClick={() => abrirMapa(lead.pontoGps)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg shrink-0">
                            <MapPin className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {lead.diasVisita && (
                    <div className="flex items-center gap-1 mt-2">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span className="text-[12px] text-gray-600">{lead.diasVisita}
                            {lead.horarioAtendimento && ` · ${lead.horarioAtendimento}`}
                        </span>
                    </div>
                )}

                {lead.proximaVisita && (
                    <div className={`mt-2 inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded ${proxHoje ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                        <Clock className="h-3 w-3" />
                        Próx. visita: {new Date(lead.proximaVisita).toLocaleDateString('pt-BR')}
                    </div>
                )}

                {lead.formasAtendimento?.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                        {lead.formasAtendimento.includes('PRESENCIAL') && <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><User className="h-3 w-3" />Presencial</span>}
                        {lead.formasAtendimento.includes('WHATSAPP') && <span className="text-[11px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />WhatsApp</span>}
                        {lead.formasAtendimento.includes('TELEFONE') && <span className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><Phone className="h-3 w-3" />Telefone</span>}
                    </div>
                )}

                {/* Exibir observação se já atendido */}
                {atendHoje?.observacao && (
                    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="text-[12px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" />
                            Observação do Atendimento
                        </p>
                        <p className="text-[13px] text-gray-600 line-clamp-3">{atendHoje.observacao}</p>
                    </div>
                )}

                {mostrarAcoes && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button
                            onClick={() => onAtendimento({ tipo: 'lead', item: lead })}
                            className="flex-1 bg-orange-500 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 active:opacity-80"
                        >
                            <ClipboardList className="h-4 w-4" /> Registrar Atendimento
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ================================================
// Card de Entrega Pendente (Motorista)
// ================================================
const STATUS_ENTREGA_CORES = {
    ENTREGUE: 'bg-green-100 text-green-700',
    ENTREGUE_PARCIAL: 'bg-yellow-100 text-yellow-700',
    DEVOLVIDO: 'bg-red-100 text-red-700',
};

const CardEntregaPendente = ({ pedido, onCheckout, podeCheckout }) => {
    const totalValor = pedido.itens?.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade)), 0) || 0;
    const abrirMaps = () => {
        if (!pedido.cliente?.Ponto_GPS) {
            const addr = `${pedido.cliente?.End_Logradouro || ''} ${pedido.cliente?.End_Numero || ''} ${pedido.cliente?.End_Cidade || ''}`;
            window.open(`https://maps.google.com/?q=${encodeURIComponent(addr)}`);
            return;
        }
        const [lat, lng] = pedido.cliente.Ponto_GPS.split(',');
        window.open(`https://maps.google.com/?q=${lat},${lng}`);
    };
    return (
        <div className="bg-white rounded-xl border border-sky-400/50 ring-1 ring-sky-500/20 shadow-sm overflow-hidden mb-3">
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded uppercase">Carga #{pedido.embarque?.numero}</span>
                        <p className="font-bold text-[15px] text-gray-900 leading-tight truncate mt-1">{pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}</p>
                        {pedido.cliente?.End_Cidade && (
                            <p className="text-[12px] text-gray-500">{pedido.cliente.End_Logradouro} {pedido.cliente.End_Numero} · {pedido.cliente.End_Cidade}</p>
                        )}
                    </div>
                    <button onClick={abrirMaps} className="p-2 text-sky-500 hover:bg-sky-50 rounded-lg shrink-0">
                        <Navigation className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[12px] text-gray-600">
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" />{pedido.itens?.length || 0} produto(s)</span>
                    <span className="font-bold text-gray-900">R$ {totalValor.toFixed(2)}</span>
                </div>
                {podeCheckout && (
                    <button
                        onClick={() => onCheckout(pedido)}
                        className="w-full mt-3 bg-sky-600 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 active:opacity-80"
                    >
                        <CheckCircle className="h-4 w-4" /> Dar Baixa na Entrega
                    </button>
                )}
            </div>
        </div>
    );
};

// ================================================
// Card de Entrega Concluída
// ================================================
const CardEntregaConcluida = ({ pedido, podeAjustar, onEstornar }) => {
    const cls = STATUS_ENTREGA_CORES[pedido.statusEntrega] || 'bg-gray-100 text-gray-600';
    const labels = { ENTREGUE: 'Entregue', ENTREGUE_PARCIAL: 'Parcial', DEVOLVIDO: 'Devolvido' };
    const totalRecebido = pedido.pagamentosReais?.reduce((s, p) => s + Number(p.valor), 0) || 0;
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-3">
            <div className="p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{labels[pedido.statusEntrega] || pedido.statusEntrega}</span>
                        {pedido.embarque?.numero && <span className="text-[11px] text-gray-400">Carga #{pedido.embarque.numero}</span>}
                    </div>
                    {podeAjustar && (
                        <button
                            onClick={() => onEstornar(pedido)}
                            className="text-[11px] font-semibold text-red-500 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 transition-colors"
                        >
                            Estornar
                        </button>
                    )}
                </div>
                <p className="font-bold text-[15px] text-gray-900 leading-tight truncate">{pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}</p>
                {pedido.dataEntrega && (
                    <p className="text-[12px] text-gray-500 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(pedido.dataEntrega).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
                {totalRecebido > 0 && (
                    <p className="text-[13px] font-bold text-green-700 mt-1">R$ {totalRecebido.toFixed(2)} recebido</p>
                )}
                {pedido.pagamentosReais?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {pedido.pagamentosReais.map((p, i) => (
                            <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                                {p.formaPagamentoNome}: R$ {Number(p.valor).toFixed(2)}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ================================================
// Componente principal: Rota / Leads
// ================================================
const RotaLeads = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();

    const [aba, setAba] = useState('atendimento');
    const [leads, setLeads] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modais
    const [modalAtendimento, setModalAtendimento] = useState(null); // { tipo: 'lead'|'cliente', item }
    const [modalNovoLead, setModalNovoLead] = useState(false);

    // Entregas (Motorista)
    const [entregasPendentes, setEntregasPendentes] = useState([]);
    const [entregasConcluidas, setEntregasConcluidas] = useState([]);
    const [loadingEntregas, setLoadingEntregas] = useState(false);
    const [checkoutPedido, setCheckoutPedido] = useState(null);

    useEffect(() => { refreshUser(); }, []); // garante permissões frescas do banco

    const vendedorId = user?.id;
    const podeEscolherVendedor = user?.permissoes?.pedidos?.clientes === 'todos';
    const podeEntregas = !!(user?.permissoes?.admin) || !!(user?.permissoes?.Pode_Executar_Entregas);
    const podeAjustar = !!(user?.permissoes?.admin) || !!(user?.permissoes?.Pode_Ajustar_Entregas);

    // Filtro mantido no localStorage para não resetar ao voltar pra tela
    const [vendedorFiltro, setVendedorFiltro] = useState(() => {
        return localStorage.getItem('rota_vendedorFiltro') || 'todos';
    });
    const [vendedores, setVendedores] = useState([]);

    // Se admin, carrega vendedores para o select
    useEffect(() => {
        if (podeEscolherVendedor) {
            import('../../services/vendedorService').then(module => {
                module.default.listar().then(vends => {
                    setVendedores(vends.filter(v => v.ativo));
                }).catch(console.error);
            });
        }
    }, [podeEscolherVendedor]);

    const handleFiltroVendedor = (e) => {
        const val = e.target.value;
        setVendedorFiltro(val);
        localStorage.setItem('rota_vendedorFiltro', val);
    };

    const carregar = useCallback(async () => {
        try {
            setLoading(true);

            // define quem será o alvo das queries
            let idBusca = vendedorId;
            if (podeEscolherVendedor) {
                idBusca = vendedorFiltro === 'todos' ? null : vendedorFiltro;
            }

            const [leadsData, clientesData, atendHojeData] = await Promise.all([
                leadService.listar(idBusca), // se null, traz de todos no backend
                clienteService.listar({ limit: 2000 }), // cliente traz tudo, filtraremos depois
                idBusca ? atendimentoService.listarHoje(idBusca) : atendimentoService.listarHoje()
            ]);

            // Se quisermos ver pedidos do dia para abater da rota, precisamos buscar do pedidoService
            // Aqui eu faço lazy load do módulo de pedidos para evitar import cíclico se houver, ou apenas import global
            const pedidoService = (await import('../../services/pedidoService')).default;
            const pedidosDeHojeData = await pedidoService.listar({ statusEnvio: undefined, vendedorId: idBusca || undefined });

            // Normaliza resposta — pode vir como array ou { data: [] }
            const listaLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data || []);
            let listaClientesRaw = Array.isArray(clientesData) ? clientesData : (clientesData?.data || []);
            let listaPedidos = Array.isArray(pedidosDeHojeData) ? pedidosDeHojeData : [];
            const hojeDataRaw = new Date().toDateString();
            listaPedidos = listaPedidos.filter(p => p.createdAt && new Date(p.createdAt).toDateString() === hojeDataRaw);

            // Filtra clientes caso precise (ContaAzul/Prisma)
            if (idBusca) {
                listaClientesRaw = listaClientesRaw.filter(c =>
                    c.idVendedor === idBusca ||
                    c.vendedor?.id === idBusca ||
                    c.VendedorUUID === idBusca
                );
            }
            const listaClientes = listaClientesRaw;
            const listaAtendHoje = Array.isArray(atendHojeData) ? atendHojeData : [];

            // Mapas: clienteId → [atendimentos hoje], leadId → [atendimentos hoje]
            const mapClienteAtend = {};
            const mapLeadAtend = {};
            const mapClientePedidos = {};

            listaAtendHoje.forEach(a => {
                if (a.clienteId) {
                    if (!mapClienteAtend[a.clienteId]) mapClienteAtend[a.clienteId] = [];
                    mapClienteAtend[a.clienteId].push(a);
                }
                if (a.leadId) {
                    if (!mapLeadAtend[a.leadId]) mapLeadAtend[a.leadId] = [];
                    mapLeadAtend[a.leadId].push(a);
                }
            });

            listaPedidos.forEach(p => {
                if (p.clienteId || p.cliente?.UUID) {
                    const cid = p.clienteId || p.cliente?.UUID;
                    if (!mapClientePedidos[cid]) mapClientePedidos[cid] = [];
                    mapClientePedidos[cid].push(p);
                }
            });

            // Injetar atendimentos e pedidos de hoje nos clientes
            const clientesComAtend = listaClientes.map(c => ({
                ...c,
                _atendimentos: mapClienteAtend[c.UUID] || [],
                _pedidos: mapClientePedidos[c.UUID] || []
            }));

            // Injetar atendimentos de hoje nos leads
            const leadsComAtend = listaLeads
                .filter(l => l.etapa !== 'FINALIZADO')
                .map(l => ({
                    ...l,
                    atendimentos: mapLeadAtend[l.id] || l.atendimentos || []
                }));

            setLeads(leadsComAtend);
            setClientes(clientesComAtend);
        } catch (e) {
            console.error(e);
            toast.error('Erro ao carregar dados da rota.', { duration: 5000 });
        } finally {
            setLoading(false);
        }
    }, [vendedorId, podeEscolherVendedor, vendedorFiltro]);

    useEffect(() => { carregar(); }, [carregar]);

    // Filtra clientes com rota definida (atendimentos já injetados no carregar)
    const clientesComAtendimento = useMemo(() => {
        return clientes.filter(c => c.Dia_de_venda || c.Dia_de_entrega);
    }, [clientes]);

    // Ordenar itens da aba "Atendimento" (não atendidos hoje)
    const itensParaAtender = useMemo(() => {
        const todos = [
            ...clientesComAtendimento.map(c => ({ _tipo: 'cliente', ...c })),
            ...leads.map(l => ({ _tipo: 'lead', ...l }))
        ].filter(i => !isAtendidoHoje(i));

        const prioridade1 = todos.filter(i => i._tipo === 'cliente' && itemTemDiaBase(i.Dia_de_venda));
        const prioridade2 = todos.filter(i => i._tipo === 'lead' && itemTemDiaBase(i.diasVisita) && !isProximaVisitaHoje(i.proximaVisita));
        const prioridade3 = todos.filter(i => i._tipo === 'lead' && isProximaVisitaHoje(i.proximaVisita));
        const demais = todos.filter(i =>
            !prioridade1.includes(i) && !prioridade2.includes(i) && !prioridade3.includes(i)
        );

        return [...prioridade1, ...prioridade2, ...prioridade3, ...demais];
    }, [clientesComAtendimento, leads]);

    // Itens atendidos hoje
    const itensAtendidos = useMemo(() => {
        const todos = [
            ...clientesComAtendimento.map(c => ({ _tipo: 'cliente', ...c })),
            ...leads.map(l => ({ _tipo: 'lead', ...l }))
        ];
        return todos.filter(i => isAtendidoHoje(i));
    }, [clientesComAtendimento, leads]);

    const handleAtendimentoSalvo = () => {
        setModalAtendimento(null);
        carregar();
        toast.success('Atendimento registrado!', { duration: 3000 });
    };

    const handleNovoLeadSalvo = () => {
        setModalNovoLead(false);
        carregar();
        toast.success('Lead criado!', { duration: 3000 });
    };

    const handleNovoPedido = (clienteUUID) => {
        navigate(`/pedidos/novo?clienteId=${clienteUUID}`);
    };

    const carregarEntregas = useCallback(async (tipo) => {
        try {
            setLoadingEntregas(true);
            if (tipo === 'pendentes') {
                const data = await entregasService.getPendentes();
                setEntregasPendentes(data);
            } else {
                const data = await entregasService.getConcluidas();
                setEntregasConcluidas(data);
            }
        } catch (e) {
            // 403 = sem permissão (usuário sem entregas atribuídas); silencia, mostra vazio
            if (e?.response?.status !== 403) {
                toast.error('Erro ao carregar entregas.');
            }
        } finally {
            setLoadingEntregas(false);
        }
    }, []);

    const handleEstornar = async (pedido) => {
        if (!window.confirm(`Estornar a entrega de "${pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}"? O pedido voltará ao status PENDENTE.`)) return;
        try {
            await entregasService.estornar(pedido.id);
            toast.success('Entrega estornada. Pedido voltou para PENDENTE.');
            carregarEntregas('concluidas');
            carregarEntregas('pendentes');
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Erro ao estornar entrega.');
        }
    };

    useEffect(() => {
        if (aba === 'entregas') carregarEntregas('pendentes');
        if (aba === 'entregues') carregarEntregas('concluidas');
    }, [aba, carregarEntregas]);

    const renderItem = (item) => {
        const mostrarAcoes = aba === 'atendimento';

        if (item._tipo === 'cliente') {
            return <CardCliente key={item.UUID} cliente={item} onAtendimento={setModalAtendimento} onNovoPedido={handleNovoPedido} mostrarAcoes={mostrarAcoes} />;
        }
        return <CardLead key={item.id} lead={item} onAtendimento={setModalAtendimento} mostrarAcoes={mostrarAcoes} />;
    };

    const diaBase = getDiaSigla(getDiaBase());

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="px-4 pt-4 pb-3 flex justify-between items-start gap-4">
                    <div>
                        <h1 className="text-[18px] font-bold text-gray-900">Rota / Leads</h1>
                        <p className="text-[12px] text-gray-500 mt-1">Dia base: {diaBase} · {new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    {podeEscolherVendedor && (
                        <select
                            value={vendedorFiltro}
                            onChange={handleFiltroVendedor}
                            className="text-[13px] border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-blue-500 focus:border-blue-500 outline-none max-w-[150px] truncate"
                        >
                            <option value="todos">Todos Vendedores</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>{v.nome.split(' ')[0]}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Abas */}
                <div className="flex border-t border-gray-100 overflow-x-auto">
                    <button
                        onClick={() => setAba('atendimento')}
                        className={`flex-1 py-3 text-[13px] font-semibold transition-colors border-b-2 whitespace-nowrap px-2 min-w-[90px] ${aba === 'atendimento' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                    >
                        Atendimento ({itensParaAtender.length})
                    </button>
                    <button
                        onClick={() => setAba('atendidos')}
                        className={`flex-1 py-3 text-[13px] font-semibold transition-colors border-b-2 whitespace-nowrap px-2 min-w-[80px] ${aba === 'atendidos' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500'}`}
                    >
                        Atendidos ({itensAtendidos.length})
                    </button>
                    <button
                        onClick={() => setAba('entregas')}
                        className={`flex-1 py-3 text-[13px] font-semibold transition-colors border-b-2 whitespace-nowrap px-2 min-w-[80px] ${aba === 'entregas' ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500'}`}
                    >
                        Entregas ({entregasPendentes.length})
                    </button>
                    <button
                        onClick={() => setAba('entregues')}
                        className={`flex-1 py-3 text-[13px] font-semibold transition-colors border-b-2 whitespace-nowrap px-2 min-w-[80px] ${aba === 'entregues' ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500'}`}
                    >
                        Entregues ({entregasConcluidas.length})
                    </button>
                </div>
            </div>

            {/* Conteúdo */}
            <div className="px-3 pt-3 pb-28 max-w-6xl mx-auto">
                {(loading && (aba === 'atendimento' || aba === 'atendidos')) ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                ) : (loadingEntregas && (aba === 'entregas' || aba === 'entregues')) ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader className="h-6 w-6 animate-spin text-sky-600" />
                    </div>
                ) : (
                    <>
                        {aba === 'atendimento' && (
                            itensParaAtender.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Tudo atendido hoje!</p>
                                    <p className="text-[13px]">Nenhum item pendente na sua rota.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                    {itensParaAtender.map(renderItem)}
                                </div>
                            )
                        )}

                        {aba === 'atendidos' && (
                            itensAtendidos.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Nenhum atendimento hoje ainda.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                    {itensAtendidos.map(renderItem)}
                                </div>
                            )
                        )}

                        {aba === 'entregas' && (
                            entregasPendentes.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <CheckCircle className="h-10 w-10 text-sky-400 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Nenhuma entrega pendente.</p>
                                    <p className="text-[13px]">Todas as entregas do seu roteiro estão concluídas.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                    {entregasPendentes.map(p => (
                                        <CardEntregaPendente
                                            key={p.id}
                                            pedido={p}
                                            onCheckout={setCheckoutPedido}
                                            podeCheckout={podeEntregas}
                                        />
                                    ))}
                                </div>
                            )
                        )}

                        {aba === 'entregues' && (
                            entregasConcluidas.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Nenhuma entrega finalizada ainda.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                    {entregasConcluidas.map(p => (
                                        <CardEntregaConcluida
                                            key={p.id}
                                            pedido={p}
                                            podeAjustar={podeAjustar}
                                            onEstornar={handleEstornar}
                                        />
                                    ))}
                                </div>
                            )
                        )}
                    </>
                )}
            </div>

            {/* Botão flutuante */}
            <button
                onClick={() => setModalNovoLead(true)}
                className="fixed bottom-6 right-4 bg-orange-500 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center z-30 active:scale-95 transition-transform"
            >
                <Plus className="h-7 w-7" />
            </button>

            {/* Modal de Atendimento */}
            {modalAtendimento && (
                <ModalAtendimento
                    dados={modalAtendimento}
                    onClose={() => setModalAtendimento(null)}
                    onSalvo={handleAtendimentoSalvo}
                    vendedorId={vendedorId}
                />
            )}

            {/* Modal Novo Lead */}
            {modalNovoLead && (
                <ModalNovoLead
                    onClose={() => setModalNovoLead(false)}
                    onSalvo={handleNovoLeadSalvo}
                    user={user}
                />
            )}

            {/* Modal Checkout Entrega (Motorista) */}
            {checkoutPedido && (
                <CheckoutEntregaModal
                    pedido={checkoutPedido}
                    onClose={() => setCheckoutPedido(null)}
                    onSuccess={() => {
                        setCheckoutPedido(null);
                        carregarEntregas('pendentes');
                        carregarEntregas('concluidas');
                        toast.success('Entrega registrada com sucesso!');
                    }}
                />
            )}
        </div>
    );
};

export default RotaLeads;
