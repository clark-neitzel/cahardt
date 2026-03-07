import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Filter, RefreshCw, X, Truck, Calendar, User, UserCheck, AlertTriangle } from 'lucide-react';
import entregasService from '../../../services/entregasService';
import vendedorService from '../../../services/vendedorService';

const ListaEntregasGerencial = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Helpers LocalStorage
    const getSaved = (key, defaultVal) => {
        const saved = localStorage.getItem(`entregasFiltro_${key}`);
        return saved !== null ? saved : defaultVal;
    };
    const saveToLocal = (key, val) => {
        if (val) localStorage.setItem(`entregasFiltro_${key}`, val);
        else localStorage.removeItem(`entregasFiltro_${key}`);
    };

    // Filtros Estado Inicial
    const initialSearch = searchParams.get('search') !== null ? searchParams.get('search') : getSaved('search', '');
    const initialDataInicio = searchParams.get('dataInicio') !== null ? searchParams.get('dataInicio') : getSaved('dataInicio', '');
    const initialDataFim = searchParams.get('dataFim') !== null ? searchParams.get('dataFim') : getSaved('dataFim', '');
    const initialVendedor = searchParams.get('vendedorId') !== null ? searchParams.get('vendedorId') : getSaved('vendedorId', '');
    const initialEntregador = searchParams.get('entregadorId') !== null ? searchParams.get('entregadorId') : getSaved('entregadorId', '');
    const initialStatus = searchParams.get('status') !== null ? searchParams.get('status') : getSaved('status', '');
    const initialPage = parseInt(searchParams.get('page')) || 1;
    const initialLimit = parseInt(searchParams.get('limit')) || parseInt(getSaved('limit', '20'));

    const [entregas, setEntregas] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [entregadores, setEntregadores] = useState([]); // Podemos pegar os usuarios se houver um service, ou extraimos dos vendedores
    const [loading, setLoading] = useState(true);
    const [totalRegistros, setTotalRegistros] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    // Filter states
    const [search, setSearch] = useState(initialSearch);
    const [dataInicio, setDataInicio] = useState(initialDataInicio);
    const [dataFim, setDataFim] = useState(initialDataFim);
    const [vendedorId, setVendedorId] = useState(initialVendedor);
    const [entregadorId, setEntregadorId] = useState(initialEntregador);
    const [status, setStatus] = useState(initialStatus);
    const [page, setPage] = useState(initialPage);
    const [limit, setLimit] = useState(initialLimit);
    const [showFilters, setShowFilters] = useState(false);

    // Carregar vendedores ao montar
    useEffect(() => {
        const fetchVendedores = async () => {
            try {
                const dados = await vendedorService.listar();
                setVendedores(dados);
                // Temporário: Usar os mesmos na lista de entregadores caso haja coincidencia,
                // Idealmente teríamos usuarioService.listarEntregadores()
                setEntregadores(dados);
            } catch (error) {
                console.error("Erro ao carregar vendedores", error);
            }
        };
        fetchVendedores();
    }, []);

    // Atualiza URl e LocalStorage
    useEffect(() => {
        const params = {};
        if (search) params.search = search;
        if (dataInicio) params.dataInicio = dataInicio;
        if (dataFim) params.dataFim = dataFim;
        if (vendedorId) params.vendedorId = vendedorId;
        if (entregadorId) params.entregadorId = entregadorId;
        if (status) params.status = status;
        if (page > 1) params.page = page;
        if (limit !== 20) params.limit = limit;
        setSearchParams(params, { replace: true });

        saveToLocal('search', search);
        saveToLocal('dataInicio', dataInicio);
        saveToLocal('dataFim', dataFim);
        saveToLocal('vendedorId', vendedorId);
        saveToLocal('entregadorId', entregadorId);
        saveToLocal('status', status);
        saveToLocal('limit', limit !== 20 ? limit.toString() : '');
    }, [search, dataInicio, dataFim, vendedorId, entregadorId, status, page, limit, setSearchParams]);

    const fetchEntregas = async () => {
        setLoading(true);
        try {
            const result = await entregasService.getGerencial({
                search, dataInicio, dataFim, vendedorId, entregadorId, status, page, limit
            });
            setEntregas(result.data || []);
            setTotalRegistros(result.meta?.total || 0);
            setTotalPages(result.meta?.totalPages || 1);
        } catch (error) {
            console.error('Erro ao buscar entregas', error);
        } finally {
            setLoading(false);
        }
    };

    // Debounce
    useEffect(() => {
        const timeout = setTimeout(() => {
            fetchEntregas();
        }, 400);
        return () => clearTimeout(timeout);
    }, [search, dataInicio, dataFim, vendedorId, entregadorId, status, page, limit]);

    const handleClearFilters = () => {
        setSearch('');
        setDataInicio('');
        setDataFim('');
        setVendedorId('');
        setEntregadorId('');
        setStatus('');
        setPage(1);
    };

    const getStatusStyle = (st) => {
        switch (st) {
            case 'ENTREGUE': return 'bg-green-100 text-green-800';
            case 'ENTREGUE_PARCIAL': return 'bg-amber-100 text-amber-800';
            case 'DEVOLVIDO': return 'bg-red-100 text-red-800';
            case 'PENDENTE': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="container mx-auto px-4 py-4 md:py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Truck className="h-6 w-6 text-primary" />
                        Histórico de Entregas
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Visão gerencial de todas as viagens e baixas logísticas.</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 space-y-4 sticky top-16 z-40">
                <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary focus:border-primary"
                            placeholder="Buscar cliente, CNPJ/CPF..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="md:hidden p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center"
                    >
                        <Filter className="h-5 w-5" />
                    </button>
                </div>

                <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 xl:grid-cols-6 gap-4 ${showFilters ? 'block' : 'hidden md:grid'}`}>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                        <select
                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-primary focus:border-primary"
                            value={status}
                            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                        >
                            <option value="">Apenas Finalizadas</option>
                            <option value="ENTREGUE">Entregue</option>
                            <option value="ENTREGUE_PARCIAL">Entregue Parcial</option>
                            <option value="DEVOLVIDO">Devolvido Total</option>
                            <option value="PENDENTE">Apenas Pendentes</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Data Início</label>
                        <input
                            type="date"
                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-primary focus:border-primary"
                            value={dataInicio}
                            onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Data Fim</label>
                        <input
                            type="date"
                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-primary focus:border-primary"
                            value={dataFim}
                            onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Vendedor</label>
                        <select
                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-primary focus:border-primary"
                            value={vendedorId}
                            onChange={(e) => { setVendedorId(e.target.value); setPage(1); }}
                        >
                            <option value="">Todos</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Entregador</label>
                        <select
                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-primary focus:border-primary"
                            value={entregadorId}
                            onChange={(e) => { setEntregadorId(e.target.value); setPage(1); }}
                        >
                            <option value="">Todos</option>
                            {entregadores.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={handleClearFilters}
                            className="w-full py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md bg-white hover:bg-gray-50 flex items-center justify-center gap-2"
                        >
                            <RefreshCw className="h-4 w-4" /> Limpar
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabela Desktop */}
            <div className="hidden md:block bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Fechamento</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente / Local</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Resp. Entrega / Embarque</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ação</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="6" className="text-center py-10 text-gray-500">Buscando histórico...</td></tr>
                        ) : entregas.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-10 text-gray-500">Nenhuma entrega encontrada para estes filtros.</td></tr>
                        ) : (
                            entregas.map((entrega) => (
                                <tr key={entrega.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {entrega.dataEntrega ? new Date(entrega.dataEntrega).toLocaleString('pt-BR') : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-gray-900">{entrega.cliente?.NomeFantasia || entrega.cliente?.Nome}</div>
                                        <div className="flex gap-2 items-center mt-1">
                                            <span className="text-[11px] font-mono bg-gray-100 px-1 rounded text-gray-500">{entrega.cliente?.Documento || 'Sem Documento'}</span>
                                            {entrega.cliente?.End_Cidade && <span className="text-[11px] text-gray-500">{entrega.cliente.End_Cidade}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                                            <Truck className="h-4 w-4 text-gray-400" />
                                            {entrega.embarque?.responsavel?.nome || 'Sem Responsável'}
                                        </div>
                                        <div className="text-xs text-gray-500 font-mono mt-1">EMB #{entrega.embarque?.numero || 'Avulso'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-1">
                                            <User className="h-4 w-4 text-gray-400" />
                                            {entrega.vendedor?.nome || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${getStatusStyle(entrega.statusEntrega)}`}>
                                            {entrega.statusEntrega}
                                        </span>
                                        {entrega.divergenciaPagamento && (
                                            <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-amber-600 font-bold" title="Divergência Financeira">
                                                <AlertTriangle className="h-3 w-3" /> FIADO / EXCEÇÃO
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            // Ao clicar, podemos ir pros detalhes do pedido! Já que a viagem é por pedido.
                                            onClick={() => navigate(`/pedidos/editar/${entrega.id}`)}
                                            className="text-primary hover:text-blue-900 font-semibold"
                                        >
                                            Ver Pedido
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
                {loading && <div className="text-center py-10 text-gray-500">Buscando histórico...</div>}
                {!loading && entregas.length === 0 && <div className="text-center py-10 text-gray-500">Nenhuma entrega encontrada.</div>}

                {entregas.map((entrega) => (
                    <div key={entrega.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${getStatusStyle(entrega.statusEntrega)}`}>
                                {entrega.statusEntrega}
                            </span>
                            <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {entrega.dataEntrega ? new Date(entrega.dataEntrega).toLocaleDateString('pt-BR') : '-'}
                            </span>
                        </div>

                        <h3 className="font-bold text-gray-900 text-[15px] leading-tight mb-1">
                            {entrega.cliente?.NomeFantasia || entrega.cliente?.Nome}
                        </h3>
                        {entrega.cliente?.End_Cidade && (
                            <p className="text-[11px] text-gray-500 mb-2.5">{entrega.cliente.End_Cidade}</p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                            <span className="flex items-center gap-1 text-[11px] text-gray-600 bg-gray-50 p-1 rounded">
                                <Truck className="h-3.5 w-3.5 text-gray-400" /> {entrega.embarque?.responsavel?.nome?.split(' ')[0] || 'N/A'}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600 bg-gray-50 p-1 rounded">
                                <User className="h-3.5 w-3.5 text-gray-400" /> {entrega.vendedor?.nome?.split(' ')[0] || 'N/A'}
                            </span>
                        </div>

                        <button
                            onClick={() => navigate(`/pedidos/editar/${entrega.id}`)}
                            className="mt-3 w-full bg-blue-50 text-blue-700 py-1.5 rounded-lg text-xs font-bold border border-blue-100"
                        >
                            Ver Pedido
                        </button>
                    </div>
                ))}
            </div>

            {/* Paginação */}
            <div className="flex flex-col md:flex-row justify-between items-center mt-6 gap-4">
                <p className="text-sm text-gray-600">Mostrando {entregas.length} de {totalRegistros}</p>

                <div className="flex items-center gap-2">
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                        className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <span className="text-sm px-2">Página {page} de {totalPages || 1}</span>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                        className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Próxima
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ListaEntregasGerencial;
