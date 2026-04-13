import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, UserCheck, Phone, Image, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Clock, Calendar, MessageSquare, Loader2, X, Camera, Upload } from 'lucide-react';
import leadService from '../../services/leadService';
import vendedorService from '../../services/vendedorService';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../services/api';
import toast from 'react-hot-toast';
import ModalNovoLead from '../Rota/ModalNovoLead';
import ModalReferenciarCliente from './ModalReferenciarCliente';
import ModalEditarLead from './ModalEditarLead';

const ETAPA_COLORS = {
    NOVO: 'bg-blue-100 text-blue-700',
    VISITA: 'bg-purple-100 text-purple-700',
    PEDIDO: 'bg-green-100 text-green-700',
    CONVERTIDO: 'bg-emerald-100 text-emerald-700',
    FINALIZADO: 'bg-gray-100 text-gray-500',
};

const ETAPAS = ['', 'NOVO', 'VISITA', 'PEDIDO', 'CONVERTIDO', 'FINALIZADO'];
const LIMITS = [12, 25, 50, 100];
const LS_KEY = 'leads_filters';

const ListaLeads = () => {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const podeEscolherVendedor = user?.permissoes?.pedidos?.clientes === 'todos';

    // Recuperar filtros salvos
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const initialSearch = searchParams.get('search') || saved.search || '';
    const initialEtapa = searchParams.get('etapa') || saved.etapa || '';
    const initialVendedor = searchParams.get('vendedorId') || saved.vendedorId || '';
    const initialPage = parseInt(searchParams.get('page')) || 1;
    const initialLimit = parseInt(searchParams.get('limit')) || saved.limit || 25;

    const [leads, setLeads] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [vendedores, setVendedores] = useState([]);

    const [search, setSearch] = useState(initialSearch);
    const [etapa, setEtapa] = useState(initialEtapa);
    const [vendedorId, setVendedorId] = useState(initialVendedor);
    const [page, setPage] = useState(initialPage);
    const [limit, setLimit] = useState(initialLimit);

    const [modalNovoLead, setModalNovoLead] = useState(false);
    const [modalReferenciar, setModalReferenciar] = useState(null);
    const [modalEditar, setModalEditar] = useState(null);
    const [fotoPreview, setFotoPreview] = useState(null);

    // Lead expandido para ver detalhes
    const [expandedLeadId, setExpandedLeadId] = useState(null);
    const [expandedLeadData, setExpandedLeadData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Carregar vendedores para o filtro
    useEffect(() => {
        if (podeEscolherVendedor) {
            vendedorService.listarAtivos().then(setVendedores).catch(() => { });
        }
    }, [podeEscolherVendedor]);

    // Salvar filtros e sincronizar URL
    const saveFilters = useCallback((s, e, v, p, l) => {
        const params = {};
        if (s) params.search = s;
        if (e) params.etapa = e;
        if (v) params.vendedorId = v;
        if (p > 1) params.page = String(p);
        if (l !== 25) params.limit = String(l);
        setSearchParams(params, { replace: true });
        localStorage.setItem(LS_KEY, JSON.stringify({ search: s, etapa: e, vendedorId: v, limit: l }));
    }, [setSearchParams]);

    // Fetch leads
    const fetchLeads = useCallback(async () => {
        try {
            setLoading(true);
            const params = { page, limit };
            if (search) params.search = search;
            if (etapa) params.etapa = etapa;
            if (vendedorId) params.vendedorId = vendedorId;

            const result = await leadService.listar(params);
            setLeads(result.data);
            setTotal(result.total);
            setTotalPages(result.totalPages);
        } catch (error) {
            console.error('Erro ao buscar leads:', error);
            toast.error('Erro ao carregar leads');
        } finally {
            setLoading(false);
        }
    }, [search, etapa, vendedorId, page, limit]);

    useEffect(() => {
        const timer = setTimeout(() => {
            saveFilters(search, etapa, vendedorId, page, limit);
            fetchLeads();
        }, 300);
        return () => clearTimeout(timer);
    }, [search, etapa, vendedorId, page, limit, fetchLeads, saveFilters]);

    const handleSearchChange = (val) => {
        setSearch(val);
        setPage(1);
    };

    const handleEtapaChange = (val) => {
        setEtapa(val);
        setPage(1);
    };

    const handleVendedorChange = (val) => {
        setVendedorId(val);
        setPage(1);
    };

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

    // Toggle detalhes do lead
    const toggleLeadDetail = async (leadId) => {
        if (expandedLeadId === leadId) {
            setExpandedLeadId(null);
            setExpandedLeadData(null);
            return;
        }
        setExpandedLeadId(leadId);
        setExpandedLeadData(null);
        try {
            setLoadingDetail(true);
            const data = await leadService.buscarPorId(leadId);
            setExpandedLeadData(data);
        } catch (error) {
            console.error('Erro ao buscar detalhes:', error);
            toast.error('Erro ao carregar detalhes do lead');
            setExpandedLeadId(null);
        } finally {
            setLoadingDetail(false);
        }
    };

    // Componente de detalhes expandido
    const LeadDetail = ({ lead, onRefresh }) => {
        const fotoInputRef = useRef(null);
        const fotoGaleriaInputRef = useRef(null);
        const [uploadingFoto, setUploadingFoto] = useState(false);

        const handleFotoChange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                setUploadingFoto(true);
                const fd = new FormData();
                fd.append('foto', file);
                await leadService.uploadFoto(lead.id, fd);
                toast.success('Foto salva!');
                onRefresh && onRefresh(lead.id);
            } catch (err) {
                console.error(err);
                toast.error('Erro ao salvar foto');
            } finally {
                setUploadingFoto(false);
                e.target.value = '';
            }
        };

        if (!lead) return null;

        return (
            <div className="bg-gray-50 border-t border-gray-100">
                {/* Info do Lead */}
                <div className="p-4 space-y-3">
                    {/* Foto grande + botão upload */}
                    <div className="flex flex-col items-center gap-2">
                        <input
                            ref={fotoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleFotoChange}
                        />
                        <input
                            ref={fotoGaleriaInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFotoChange}
                        />
                        {lead.fotoFachada ? (
                            <div className="relative">
                                <img
                                    src={`${API_URL}${lead.fotoFachada}`}
                                    alt="Fachada"
                                    className="h-40 md:h-52 rounded-xl object-cover cursor-pointer border border-gray-200 shadow-sm"
                                    onClick={(e) => { e.stopPropagation(); setFotoPreview(`${API_URL}${lead.fotoFachada}`); }}
                                />
                                <div className="absolute bottom-2 right-2 flex gap-1.5">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); fotoGaleriaInputRef.current?.click(); }}
                                        disabled={uploadingFoto}
                                        className="p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80"
                                        title="Enviar da galeria"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); fotoInputRef.current?.click(); }}
                                        disabled={uploadingFoto}
                                        className="p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80"
                                        title="Tirar foto"
                                    >
                                        {uploadingFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); fotoInputRef.current?.click(); }}
                                    disabled={uploadingFoto}
                                    className="flex flex-col items-center gap-1.5 px-6 py-4 border-2 border-dashed border-orange-300 rounded-xl text-orange-500 hover:bg-orange-50 transition-colors"
                                >
                                    {uploadingFoto ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                                    <span className="text-xs font-medium">{uploadingFoto ? 'Salvando...' : 'Tirar Foto'}</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); fotoGaleriaInputRef.current?.click(); }}
                                    disabled={uploadingFoto}
                                    className="flex flex-col items-center gap-1.5 px-6 py-4 border-2 border-dashed border-blue-300 rounded-xl text-blue-500 hover:bg-blue-50 transition-colors"
                                >
                                    <Upload className="h-6 w-6" />
                                    <span className="text-xs font-medium">Galeria</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Dados do lead em grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {lead.contato && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Contato</p>
                                <p className="text-gray-800 font-medium">{lead.contato}</p>
                            </div>
                        )}
                        {lead.whatsapp && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">WhatsApp</p>
                                <p className="text-gray-800 font-medium flex items-center gap-1"><Phone className="h-3 w-3 text-green-500" />{lead.whatsapp}</p>
                            </div>
                        )}
                        {lead.diasVisita && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Dias de Visita</p>
                                <p className="text-gray-800 font-medium">{lead.diasVisita}</p>
                            </div>
                        )}
                        {lead.horarioAtendimento && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Horário Atend.</p>
                                <p className="text-gray-800 font-medium flex items-center gap-1"><Clock className="h-3 w-3 text-blue-400" />{lead.horarioAtendimento}</p>
                            </div>
                        )}
                        {lead.horarioEntrega && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Horário Entrega</p>
                                <p className="text-gray-800 font-medium">{lead.horarioEntrega}</p>
                            </div>
                        )}
                        {lead.vendedor && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Vendedor</p>
                                <p className="text-gray-800 font-medium">{lead.vendedor.nome}</p>
                            </div>
                        )}
                        {lead.cidade && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Cidade</p>
                                <p className="text-gray-800 font-medium">{lead.cidade}</p>
                            </div>
                        )}
                        {lead.origemLead && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Origem</p>
                                <p className="text-gray-800 font-medium">{lead.origemLead}</p>
                            </div>
                        )}
                        {lead.categoriaCliente && (
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase font-medium">Categoria</p>
                                <p className="text-gray-800 font-medium">{lead.categoriaCliente.nome}</p>
                            </div>
                        )}
                    </div>

                    {lead.formasAtendimento?.length > 0 && (
                        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Formas de Atendimento</p>
                            <div className="flex flex-wrap gap-1">
                                {lead.formasAtendimento.map((f, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[11px] rounded-full font-medium">{f}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {lead.observacoes && (
                        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Observações</p>
                            <p className="text-sm text-gray-700">{lead.observacoes}</p>
                        </div>
                    )}

                    {lead.pontoGps && (
                        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Localização</p>
                            <a
                                href={`https://www.google.com/maps?q=${lead.pontoGps}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 flex items-center gap-1"
                                onClick={e => e.stopPropagation()}
                            >
                                <MapPin className="h-3.5 w-3.5" /> Ver no mapa
                            </a>
                        </div>
                    )}

                    {lead.cliente && (
                        <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-200">
                            <p className="text-[10px] text-emerald-600 uppercase font-medium">Cliente Vinculado</p>
                            <p className="text-emerald-800 font-semibold">{lead.cliente.NomeFantasia || lead.cliente.Nome}</p>
                        </div>
                    )}
                </div>

                {/* Histórico de atendimentos */}
                {lead.atendimentos && lead.atendimentos.length > 0 && (
                    <div className="px-4 pb-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5" /> Histórico ({lead.atendimentos.length})
                        </h4>
                        <div className="space-y-2">
                            {lead.atendimentos.map((at, i) => (
                                <div key={at.id || i} className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] font-semibold text-orange-600">
                                            {at.tipo || at.etapaNoMomento || 'Atendimento'}
                                        </span>
                                        <span className="text-[10px] text-gray-400">
                                            {formatDateTime(at.criadoEm)}
                                        </span>
                                    </div>
                                    {at.descricao && <p className="text-sm text-gray-700">{at.descricao}</p>}
                                    {at.vendedor?.nome && (
                                        <p className="text-[10px] text-gray-400 mt-1">por {at.vendedor.nome}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(!lead.atendimentos || lead.atendimentos.length === 0) && (
                    <div className="px-4 pb-4">
                        <p className="text-xs text-gray-400 text-center py-3">Nenhum atendimento registrado.</p>
                    </div>
                )}

                {/* Ações */}
                <div className="px-4 pb-4 flex flex-col gap-2">
                    {(user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Lead) && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setModalEditar(lead); }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors"
                        >
                            ✏️ Editar Lead
                        </button>
                    )}
                    {lead.etapa !== 'CONVERTIDO' && lead.etapa !== 'FINALIZADO' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setModalReferenciar(lead); }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                        >
                            <UserCheck className="h-4 w-4" /> Vincular a Cliente
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 md:mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">Leads</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500">
                        {total} lead{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setModalNovoLead(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm"
                >
                    <Plus className="h-4 w-4" /> Novo Lead
                </button>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4 space-y-2 md:space-y-0 md:flex md:flex-wrap md:gap-2">
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome..."
                        value={search}
                        onChange={e => handleSearchChange(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={etapa}
                        onChange={e => handleEtapaChange(e.target.value)}
                        className="flex-1 md:flex-none px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
                    >
                        <option value="">Todas etapas</option>
                        {ETAPAS.filter(Boolean).map(e => (
                            <option key={e} value={e}>{e}</option>
                        ))}
                    </select>
                    {podeEscolherVendedor && (
                        <select
                            value={vendedorId}
                            onChange={e => handleVendedorChange(e.target.value)}
                            className="flex-1 md:flex-none px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
                        >
                            <option value="">Todos vend.</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>{v.nome}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={limit}
                        onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                        className="hidden md:block px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none"
                    >
                        {LIMITS.map(l => <option key={l} value={l}>{l} por pág.</option>)}
                    </select>
                </div>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow overflow-hidden rounded-xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Foto</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estabelecimento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contato</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Etapa</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cidade</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origem</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-500">Carregando...</td></tr>
                        ) : leads.length === 0 ? (
                            <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-500">Nenhum lead encontrado.</td></tr>
                        ) : leads.map(lead => (
                            <React.Fragment key={lead.id}>
                                <tr
                                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${expandedLeadId === lead.id ? 'bg-orange-50' : ''}`}
                                    onClick={() => toggleLeadDetail(lead.id)}
                                >
                                    <td className="px-4 py-3 text-sm text-gray-400 font-mono">{lead.numero}</td>
                                    <td className="px-4 py-3">
                                        {lead.fotoFachada ? (
                                            <img
                                                src={`${API_URL}${lead.fotoFachada}`}
                                                alt="Fachada"
                                                className="h-10 w-10 rounded-md object-cover border border-gray-200"
                                            />
                                        ) : (
                                            <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center">
                                                <Image className="h-4 w-4 text-gray-300" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium text-gray-900">{lead.nomeEstabelecimento}</p>
                                        {lead.cliente && (
                                            <p className="text-xs text-emerald-600 mt-0.5">Vinculado: {lead.cliente.NomeFantasia || lead.cliente.Nome}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-sm text-gray-700">{lead.contato || '-'}</p>
                                        {lead.whatsapp && (
                                            <p className="text-xs text-gray-400 flex items-center gap-0.5"><Phone className="h-3 w-3" /> {lead.whatsapp}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-500'}`}>
                                            {lead.etapa}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{lead.cidade || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{lead.origemLead || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{lead.categoriaCliente?.nome || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{lead.vendedor?.nome || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-400">{formatDate(lead.createdAt)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {lead.etapa !== 'CONVERTIDO' && lead.etapa !== 'FINALIZADO' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setModalReferenciar(lead); }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                                                    title="Vincular a Cliente"
                                                >
                                                    <UserCheck className="h-3.5 w-3.5" /> Vincular
                                                </button>
                                            )}
                                            {expandedLeadId === lead.id ? (
                                                <ChevronUp className="h-4 w-4 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-gray-400" />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                {expandedLeadId === lead.id && (
                                    <tr>
                                        <td colSpan="11" className="p-0">
                                            {loadingDetail ? (
                                                <div className="flex items-center justify-center py-6 text-gray-400">
                                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando detalhes...
                                                </div>
                                            ) : (
                                                <LeadDetail lead={expandedLeadData} onRefresh={toggleLeadDetail} />
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
                    </div>
                ) : leads.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <Image className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">Nenhum lead encontrado.</p>
                    </div>
                ) : leads.map(lead => (
                    <div key={lead.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Card header - clicável */}
                        <div
                            className={`p-3.5 cursor-pointer active:bg-gray-50 transition-colors ${expandedLeadId === lead.id ? 'bg-orange-50/50' : ''}`}
                            onClick={() => toggleLeadDetail(lead.id)}
                        >
                            <div className="flex gap-3">
                                {/* Foto */}
                                {lead.fotoFachada ? (
                                    <img
                                        src={`${API_URL}${lead.fotoFachada}`}
                                        alt="Fachada"
                                        className="h-16 w-16 rounded-xl object-cover border border-gray-200 flex-shrink-0"
                                    />
                                ) : (
                                    <div className="h-16 w-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                                        <Image className="h-6 w-6 text-gray-300" />
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-bold text-[15px] text-gray-900 truncate leading-tight">{lead.nomeEstabelecimento}</p>
                                            <p className="text-[11px] text-gray-400 font-mono mt-0.5">#{lead.numero}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-500'}`}>
                                                {lead.etapa}
                                            </span>
                                            {expandedLeadId === lead.id ? (
                                                <ChevronUp className="h-4 w-4 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-gray-400" />
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-x-3 mt-1.5 text-[12px] text-gray-500">
                                        {lead.contato && <span>{lead.contato}</span>}
                                        {lead.whatsapp && (
                                            <a
                                                href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}`}
                                                onClick={e => e.stopPropagation()}
                                                className="flex items-center gap-0.5 text-green-600 font-medium"
                                            >
                                                <Phone className="h-3 w-3" /> {lead.whatsapp}
                                            </a>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-x-2 mt-1 text-[11px] text-gray-400">
                                        {lead.cidade && <span>{lead.cidade}</span>}
                                        {lead.origemLead && <span>· {lead.origemLead}</span>}
                                        {lead.categoriaCliente?.nome && <span>· {lead.categoriaCliente.nome}</span>}
                                    </div>

                                    {lead.vendedor && (
                                        <p className="text-[11px] text-gray-400 mt-0.5">Vend: {lead.vendedor.nome}</p>
                                    )}

                                    {lead.cliente && (
                                        <p className="text-[11px] text-emerald-600 mt-0.5 font-semibold flex items-center gap-0.5">
                                            <UserCheck className="h-3 w-3" /> {lead.cliente.NomeFantasia || lead.cliente.Nome}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Data e último atendimento */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-400">
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> Criado: {formatDate(lead.createdAt)}
                                </span>
                                {lead.atendimentos?.[0] && (
                                    <span>Último atend: {formatDate(lead.atendimentos[0].criadoEm)}</span>
                                )}
                            </div>
                        </div>

                        {/* Detalhes expandidos */}
                        {expandedLeadId === lead.id && (
                            loadingDetail ? (
                                <div className="flex items-center justify-center py-6 text-gray-400 border-t border-gray-100">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
                                </div>
                            ) : (
                                <LeadDetail lead={expandedLeadData} onRefresh={toggleLeadDetail} />
                            )
                        )}
                    </div>
                ))}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                    <span className="text-xs">Pág. {page}/{totalPages} ({total})</span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Modal Novo Lead */}
            {modalNovoLead && (
                <ModalNovoLead
                    onClose={() => setModalNovoLead(false)}
                    onCriado={() => { setModalNovoLead(false); fetchLeads(); }}
                    podeEscolherVendedor={podeEscolherVendedor}
                    vendedores={vendedores}
                    vendedorId={user?.id}
                />
            )}

            {/* Modal Referenciar Cliente */}
            {modalReferenciar && (
                <ModalReferenciarCliente
                    lead={modalReferenciar}
                    onClose={() => setModalReferenciar(null)}
                    onVinculado={() => { setModalReferenciar(null); fetchLeads(); }}
                />
            )}

            {/* Modal Editar Lead */}
            {modalEditar && (
                <ModalEditarLead
                    lead={modalEditar}
                    user={user}
                    onClose={() => setModalEditar(null)}
                    onSalvo={() => {
                        setModalEditar(null);
                        fetchLeads();
                        // Recarregar detalhes do lead expandido
                        if (expandedLeadId === modalEditar.id) {
                            toggleLeadDetail(modalEditar.id);
                            setTimeout(() => toggleLeadDetail(modalEditar.id), 100);
                        }
                    }}
                />
            )}

            {/* Preview da foto em fullscreen */}
            {fotoPreview && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setFotoPreview(null)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white"
                        onClick={() => setFotoPreview(null)}
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <img src={fotoPreview} alt="Fachada" className="max-w-full max-h-full rounded-lg object-contain" />
                </div>
            )}
        </div>
    );
};

export default ListaLeads;
