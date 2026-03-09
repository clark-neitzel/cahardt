import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, UserCheck, Phone, Image, ChevronLeft, ChevronRight } from 'lucide-react';
import leadService from '../../services/leadService';
import vendedorService from '../../services/vendedorService';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../services/api';
import toast from 'react-hot-toast';
import ModalNovoLead from '../Rota/ModalNovoLead';
import ModalReferenciarCliente from './ModalReferenciarCliente';

const ETAPA_COLORS = {
    NOVO: 'bg-blue-100 text-blue-700',
    AMOSTRA: 'bg-yellow-100 text-yellow-700',
    VISITA: 'bg-purple-100 text-purple-700',
    PEDIDO: 'bg-green-100 text-green-700',
    CONVERTIDO: 'bg-emerald-100 text-emerald-700',
    FINALIZADO: 'bg-gray-100 text-gray-500',
};

const ETAPAS = ['', 'NOVO', 'AMOSTRA', 'VISITA', 'PEDIDO', 'CONVERTIDO', 'FINALIZADO'];
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
    const [fotoPreview, setFotoPreview] = useState(null);

    // Carregar vendedores para o filtro
    useEffect(() => {
        if (podeEscolherVendedor) {
            vendedorService.listar().then(setVendedores).catch(() => {});
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

    return (
        <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-2">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">Leads</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500">
                        {total} lead{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setModalNovoLead(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
                >
                    <Plus className="h-4 w-4" /> Novo Lead
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2 mb-4">
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
                <select
                    value={etapa}
                    onChange={e => handleEtapaChange(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
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
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
                    >
                        <option value="">Todos vendedores</option>
                        {vendedores.map(v => (
                            <option key={v.id} value={v.id}>{v.nome}</option>
                        ))}
                    </select>
                )}
                <select
                    value={limit}
                    onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none"
                >
                    {LIMITS.map(l => <option key={l} value={l}>{l} por página</option>)}
                </select>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow overflow-hidden rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Foto</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estabelecimento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contato</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Etapa</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">Carregando...</td></tr>
                        ) : leads.length === 0 ? (
                            <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">Nenhum lead encontrado.</td></tr>
                        ) : leads.map(lead => (
                            <tr key={lead.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{lead.numero}</td>
                                <td className="px-4 py-3">
                                    {lead.fotoFachada ? (
                                        <img
                                            src={`${API_URL}${lead.fotoFachada}`}
                                            alt="Fachada"
                                            className="h-10 w-10 rounded-md object-cover cursor-pointer border border-gray-200"
                                            onClick={() => setFotoPreview(`${API_URL}${lead.fotoFachada}`)}
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
                                <td className="px-4 py-3 text-sm text-gray-500">{lead.vendedor?.nome || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-400">{formatDate(lead.createdAt)}</td>
                                <td className="px-4 py-3 text-right">
                                    {lead.etapa !== 'CONVERTIDO' && lead.etapa !== 'FINALIZADO' && (
                                        <button
                                            onClick={() => setModalReferenciar(lead)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                                            title="Vincular a Cliente"
                                        >
                                            <UserCheck className="h-3.5 w-3.5" /> Vincular
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden space-y-2">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Carregando...</div>
                ) : leads.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">Nenhum lead encontrado.</div>
                ) : leads.map(lead => (
                    <div key={lead.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <div className="flex gap-3">
                            {lead.fotoFachada ? (
                                <img
                                    src={`${API_URL}${lead.fotoFachada}`}
                                    alt="Fachada"
                                    className="h-14 w-14 rounded-lg object-cover border border-gray-200 flex-shrink-0 cursor-pointer"
                                    onClick={() => setFotoPreview(`${API_URL}${lead.fotoFachada}`)}
                                />
                            ) : (
                                <div className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                    <Image className="h-5 w-5 text-gray-300" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="font-bold text-[14px] text-gray-900 truncate">{lead.nomeEstabelecimento}</p>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-500'}`}>
                                        {lead.etapa}
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-400 font-mono">#{lead.numero}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                                    {lead.contato && <span>{lead.contato}</span>}
                                    {lead.whatsapp && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" /> {lead.whatsapp}</span>}
                                    {lead.vendedor && <span>Vend: {lead.vendedor.nome}</span>}
                                </div>
                                {lead.cliente && (
                                    <p className="text-[11px] text-emerald-600 mt-0.5 font-semibold">Vinculado: {lead.cliente.NomeFantasia || lead.cliente.Nome}</p>
                                )}
                            </div>
                        </div>
                        {lead.etapa !== 'CONVERTIDO' && lead.etapa !== 'FINALIZADO' && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                                <button
                                    onClick={() => setModalReferenciar(lead)}
                                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg"
                                >
                                    <UserCheck className="h-3.5 w-3.5" /> Vincular a Cliente
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                    <span>Página {page} de {totalPages} ({total} leads)</span>
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

            {/* Preview da foto em fullscreen */}
            {fotoPreview && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setFotoPreview(null)}
                >
                    <img src={fotoPreview} alt="Fachada" className="max-w-full max-h-full rounded-lg object-contain" />
                </div>
            )}
        </div>
    );
};

export default ListaLeads;
