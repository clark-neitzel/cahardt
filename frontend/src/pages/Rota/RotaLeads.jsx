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
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import ModalAtendimento from './ModalAtendimento';
import ModalNovoLead from './ModalNovoLead';

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

const isAtendidoHoje = (atendimentos) => {
    if (!atendimentos || atendimentos.length === 0) return false;
    const hoje = new Date().toDateString();
    return atendimentos.some(a => new Date(a.criadoEm).toDateString() === hoje);
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
const CardCliente = ({ cliente, onAtendimento, onNovoPedido }) => {
    const atendidoHoje = isAtendidoHoje(cliente._atendimentos);

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-3">
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Cliente</span>
                            {atendidoHoje && <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CheckCircle className="h-3 w-3" /> Atendido</span>}
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
                        {cliente.Formas_Atendimento.includes('PRESENCIAL') && <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><User className="h-3 w-3" />Presencial</span>}
                        {cliente.Formas_Atendimento.includes('WHATSAPP') && <span className="text-[11px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />WhatsApp</span>}
                        {cliente.Formas_Atendimento.includes('TELEFONE') && <span className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><Phone className="h-3 w-3" />Telefone</span>}
                    </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                        onClick={() => onAtendimento({ tipo: 'cliente', item: cliente })}
                        className="flex-1 bg-blue-600 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 active:opacity-80"
                    >
                        <ClipboardList className="h-4 w-4" /> Registrar Atendimento
                    </button>
                    <button
                        onClick={() => onNovoPedido(cliente.UUID)}
                        className="bg-gray-100 text-gray-700 text-[13px] font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 active:opacity-80"
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
const CardLead = ({ lead, onAtendimento }) => {
    const atendidoHoje = isAtendidoHoje(lead.atendimentos);
    const proxHoje = isProximaVisitaHoje(lead.proximaVisita);

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-3">
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Lead #{lead.numero || '?'}</span>
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-600'}`}>{lead.etapa}</span>
                            {atendidoHoje && <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CheckCircle className="h-3 w-3" /> Atendido</span>}
                            {proxHoje && !atendidoHoje && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Star className="h-3 w-3" /> Visita Hoje!</span>}
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

                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                        onClick={() => onAtendimento({ tipo: 'lead', item: lead })}
                        className="flex-1 bg-orange-500 text-white text-[13px] font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 active:opacity-80"
                    >
                        <ClipboardList className="h-4 w-4" /> Registrar Atendimento
                    </button>
                </div>
            </div>
        </div>
    );
};

// ================================================
// Componente principal: Rota / Leads
// ================================================
const RotaLeads = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [aba, setAba] = useState('atendimento');
    const [leads, setLeads] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modais
    const [modalAtendimento, setModalAtendimento] = useState(null); // { tipo: 'lead'|'cliente', item }
    const [modalNovoLead, setModalNovoLead] = useState(false);

    const vendedorId = user?.id;

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const [leadsData, clientesData] = await Promise.all([
                leadService.listar(vendedorId),
                clienteService.listar({ limit: 2000 })
            ]);

            // Para cada cliente, buscar atendimentos de hoje
            setLeads(leadsData.filter(l => l.etapa !== 'FINALIZADO'));
            setClientes(clientesData);
        } catch (e) {
            console.error(e);
            toast.error('Erro ao carregar dados da rota.', { duration: 5000 });
        } finally {
            setLoading(false);
        }
    }, [vendedorId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Classifica clientes com os atendimentos recentes
    const clientesComAtendimento = useMemo(() => {
        return clientes
            .filter(c => c.Dia_de_venda || c.Dia_de_entrega) // só quem tem rota definida
            .map(c => ({ ...c, _atendimentos: [] }));
    }, [clientes]);

    // Ordenar itens da aba "Atendimento" (não atendidos hoje)
    const itensParaAtender = useMemo(() => {
        const todos = [
            ...clientesComAtendimento.map(c => ({ _tipo: 'cliente', ...c })),
            ...leads.map(l => ({ _tipo: 'lead', ...l }))
        ].filter(i => !isAtendidoHoje(i._atendimentos || i.atendimentos));

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
        return todos.filter(i => isAtendidoHoje(i._atendimentos || i.atendimentos));
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

    const renderItem = (item) => {
        if (item._tipo === 'cliente') {
            return <CardCliente key={item.UUID} cliente={item} onAtendimento={setModalAtendimento} onNovoPedido={handleNovoPedido} />;
        }
        return <CardLead key={item.id} lead={item} onAtendimento={setModalAtendimento} />;
    };

    const diaBase = getDiaSigla(getDiaBase());

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="px-4 pt-4 pb-0">
                    <h1 className="text-[18px] font-bold text-gray-900">Rota / Leads</h1>
                    <p className="text-[12px] text-gray-500 mb-3">Dia base: {diaBase} · {new Date().toLocaleDateString('pt-BR')}</p>
                </div>

                {/* Abas */}
                <div className="flex border-t border-gray-100">
                    <button
                        onClick={() => setAba('atendimento')}
                        className={`flex-1 py-3 text-[14px] font-semibold transition-colors border-b-2 ${aba === 'atendimento' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                    >
                        Atendimento ({itensParaAtender.length})
                    </button>
                    <button
                        onClick={() => setAba('atendidos')}
                        className={`flex-1 py-3 text-[14px] font-semibold transition-colors border-b-2 ${aba === 'atendidos' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500'}`}
                    >
                        Atendidos ({itensAtendidos.length})
                    </button>
                </div>
            </div>

            {/* Conteúdo */}
            <div className="px-3 pt-3 pb-28">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <>
                        {aba === 'atendimento' && (
                            <>
                                {itensParaAtender.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                                        <p className="font-bold text-gray-700">Tudo atendido hoje!</p>
                                        <p className="text-[13px]">Nenhum item pendente na sua rota.</p>
                                    </div>
                                ) : (
                                    itensParaAtender.map(renderItem)
                                )}
                            </>
                        )}

                        {aba === 'atendidos' && (
                            <>
                                {itensAtendidos.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                        <p className="font-bold text-gray-700">Nenhum atendimento hoje ainda.</p>
                                    </div>
                                ) : (
                                    itensAtendidos.map(renderItem)
                                )}
                            </>
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
                    vendedorId={vendedorId}
                />
            )}
        </div>
    );
};

export default RotaLeads;
