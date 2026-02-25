
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService'; // Import Service
import { Search, MapPin, Phone, Truck, Building, User, Filter, CheckSquare, Settings, X, Save, AlertTriangle, MessageCircle } from 'lucide-react';
import { cn } from '../../lib/utils'; // Assumindo utils (se não existir, criar inline)

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];

const ListaClientes = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Filtros Estado Inicial
    const initialSearch = searchParams.get('search') || '';
    const initialPage = parseInt(searchParams.get('page')) || 1;
    const initialLimit = parseInt(searchParams.get('limit')) || 12;
    const initialVendedor = searchParams.get('idVendedor') || '';
    const initialDiaEntrega = searchParams.get('diaEntrega') || '';
    const initialDiaVenda = searchParams.get('diaVenda') || '';

    // Estados de Dados
    const [clientes, setClientes] = useState([]);
    const [vendedores, setVendedores] = useState([]); // Lista para select
    const [loading, setLoading] = useState(true);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRegistros, setTotalRegistros] = useState(0);

    // Estados de Controle
    const [search, setSearch] = useState(initialSearch);
    const [page, setPage] = useState(initialPage);
    const [limit, setLimit] = useState(initialLimit);
    const [activeTab, setActiveTab] = useState('ativos'); // 'ativos' ou 'inativos'

    // Filtros Avançados
    const [idVendedor, setIdVendedor] = useState(initialVendedor);
    const [diaEntrega, setDiaEntrega] = useState(initialDiaEntrega);
    const [diaVenda, setDiaVenda] = useState(initialDiaVenda);
    const [showFilters, setShowFilters] = useState(false); // Toggle filtros no mobile

    // Seleção em Lote
    const [selectedIds, setSelectedIds] = useState([]);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchData, setBatchData] = useState({
        idVendedor: '',
        Dia_de_entrega: '',
        Dia_de_venda: ''
    });

    // Carregar Vendedores ao montar
    useEffect(() => {
        const loadVendedores = async () => {
            try {
                const data = await vendedorService.listar();
                setVendedores(data);
            } catch (error) {
                console.error("Erro ao carregar vendedores", error);
            }
        };
        loadVendedores();
    }, []);

    // Sync State -> URL
    useEffect(() => {
        const params = {};
        if (search) params.search = search;
        if (page > 1) params.page = page;
        if (limit !== 12) params.limit = limit;
        if (idVendedor) params.idVendedor = idVendedor;
        if (diaEntrega) params.diaEntrega = diaEntrega;
        if (diaVenda) params.diaVenda = diaVenda;
        setSearchParams(params, { replace: true });
    }, [search, page, limit, idVendedor, diaEntrega, diaVenda, setSearchParams]);

    // Fetch Clientes
    const fetchClientes = async () => {
        setLoading(true);
        try {
            const ativo = activeTab === 'ativos';
            const data = await clienteService.listar({
                page,
                limit,
                search,
                ativo,
                idVendedor,
                diaEntrega,
                diaVenda
            });
            setClientes(data.data);
            setTotalPages(data.meta.totalPages);
            setTotalRegistros(data.meta.total);

            // Limpar seleção ao mudar página/filtros se necessário (opção de UX)
            // setSelectedIds([]); 
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Trigger Fetch (Debounce Search)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchClientes();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [page, limit, search, activeTab, idVendedor, diaEntrega, diaVenda]);

    // Handlers
    const handleSearch = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allIds = clientes.map(c => c.UUID);
            setSelectedIds(allIds);
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (uuid) => {
        setSelectedIds(prev =>
            prev.includes(uuid) ? prev.filter(id => id !== uuid) : [...prev, uuid]
        );
    };

    const handleBatchSubmit = async () => {
        if (selectedIds.length === 0) return;

        // Filtrar apenas campos preenchidos
        const dadosParaEnviar = {};
        if (batchData.idVendedor) dadosParaEnviar.idVendedor = batchData.idVendedor;
        if (batchData.Dia_de_entrega) dadosParaEnviar.Dia_de_entrega = batchData.Dia_de_entrega;
        if (batchData.Dia_de_venda) dadosParaEnviar.Dia_de_venda = batchData.Dia_de_venda;
        if (batchData.Formas_Atendimento && batchData.Formas_Atendimento.length > 0) {
            dadosParaEnviar.Formas_Atendimento = batchData.Formas_Atendimento;
        }

        if (Object.keys(dadosParaEnviar).length === 0) {
            alert("Selecione pelo menos um campo para alterar.");
            return;
        }

        if (!window.confirm(`Tem certeza que deseja alterar ${selectedIds.length} clientes?`)) return;

        try {
            // Chamada direta ao endpoint de lote (precisa ser criado no service ou chamar api.put)
            // Assumindo que clienteService será atualizado ou usando api diretamente aqui para agilizar
            // Idealmente: clienteService.atualizarLote(selectedIds, dadosParaEnviar)

            // Simulação da chamada do service (preciso adicionar no service também)
            // await clienteService.atualizarLote({ ids: selectedIds, dados: dadosParaEnviar });

            // Como ainda não adicionei no service frontend, vou fazer fetch direto ou adicionar no próximo passo.
            // Para não quebrar, vou assumir que o service TEM o método atualizarLote (vou adicionar a seguir).
            await clienteService.atualizarLote({ ids: selectedIds, dados: dadosParaEnviar });

            alert("Atualização em lote realizada com sucesso!");
            setIsBatchModalOpen(false);
            setSelectedIds([]);
            setBatchData({ idVendedor: '', Dia_de_entrega: '', Dia_de_venda: '' });
            fetchClientes(); // Atualizar lista
        } catch (error) {
            console.error("Erro na atualização em lote", error);
            alert("Erro ao atualizar clientes.");
        }
    };

    // Helpers UI
    const getBadgeColor = (perfil) => {
        const p = (perfil || '').toLowerCase();
        if (p.includes('cliente')) return 'bg-blue-100 text-blue-800';
        if (p.includes('fornecedor')) return 'bg-purple-100 text-purple-800';
        return 'bg-gray-100 text-gray-800';
    };

    // Render
    return (
        <div className="container mx-auto px-4 py-8 relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Meus Clientes</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {totalRegistros} registros encontrados | Página {page} de {totalPages}
                    </p>
                </div>

                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-4 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 animate-in fade-in slide-in-from-top-2">
                        <span className="text-sm font-medium text-blue-700">{selectedIds.length} selecionados</span>
                        <button
                            onClick={() => setIsBatchModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Settings className="h-4 w-4" />
                            Alterar em Lote
                        </button>
                        <button onClick={() => setSelectedIds([])} className="text-blue-500 hover:text-blue-700">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* Abas */}
            <div className="flex border-b border-gray-200 mb-6">
                <button
                    onClick={() => { setActiveTab('ativos'); setPage(1); }}
                    className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'ativos' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Ativos
                </button>
                <button
                    onClick={() => { setActiveTab('inativos'); setPage(1); }}
                    className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'inativos' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Inativos
                </button>
            </div>

            {/* Filtros e Busca */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 space-y-4">
                {/* Linha de Busca + Toggle Filtros Mobile */}
                <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm"
                            placeholder="Buscar por nome, documento, código, cidade, bairro, telefone..."
                            value={search}
                            onChange={handleSearch}
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="md:hidden p-2.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
                    >
                        <Filter className="h-5 w-5" />
                    </button>
                </div>

                {/* Filtros Avançados (Grid) */}
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${showFilters ? 'block' : 'hidden md:grid'}`}>
                    {/* Filtro Vendedor */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Vendedor</label>
                        <select
                            className="block w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 text-sm focus:ring-primary focus:border-primary"
                            value={idVendedor}
                            onChange={(e) => { setIdVendedor(e.target.value); setPage(1); }}
                        >
                            <option value="">Todos os Vendedores</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>{v.nome}</option>
                            ))}
                        </select>
                    </div>

                    {/* Filtro Dia Entrega */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Dia de Entrega</label>
                        <select
                            className="block w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 text-sm focus:ring-primary focus:border-primary"
                            value={diaEntrega}
                            onChange={(e) => { setDiaEntrega(e.target.value); setPage(1); }}
                        >
                            <option value="">Qualquer Dia</option>
                            {DIAS_SEMANA.map(dia => (
                                <option key={dia} value={dia}>{dia}</option>
                            ))}
                        </select>
                    </div>

                    {/* Filtro Dia Venda */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Dia de Venda</label>
                        <select
                            className="block w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 text-sm focus:ring-primary focus:border-primary"
                            value={diaVenda}
                            onChange={(e) => { setDiaVenda(e.target.value); setPage(1); }}
                        >
                            <option value="">Qualquer Dia</option>
                            {DIAS_SEMANA.map(dia => (
                                <option key={dia} value={dia}>{dia}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Tabela de Clientes */}
            <div className="hidden md:block bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                    checked={clientes.length > 0 && selectedIds.length === clientes.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identificação</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendedor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dia Entrega</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dia Venda</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNPJ/CPF</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="7" className="text-center py-10">Carregando...</td></tr>
                        ) : clientes.length === 0 ? (
                            <tr><td colSpan="7" className="text-center py-10 text-gray-500">Nenhum cliente encontrado.</td></tr>
                        ) : (
                            clientes.map((cliente) => (
                                <tr
                                    key={cliente.UUID}
                                    onClick={(e) => {
                                        // Não navega se clicar no checkbox
                                        if (e.target.type !== 'checkbox') {
                                            navigate(`/clientes/${cliente.UUID}`);
                                        }
                                    }}
                                    className={`cursor-pointer transition-colors ${selectedIds.includes(cliente.UUID) ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                                >
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                            checked={selectedIds.includes(cliente.UUID)}
                                            onChange={() => handleSelectOne(cliente.UUID)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-gray-900">
                                            <span className="text-gray-400 font-normal text-xs block mb-0.5">Razão Social:</span>
                                            {cliente.Nome}
                                        </div>
                                        <div className="text-xs text-gray-600 font-medium mt-1.5 whitespace-normal border-t border-gray-100 pt-1.5">
                                            <span className="text-gray-400 font-normal">Fantasia:</span> {cliente.NomeFantasia || cliente.Nome}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {cliente.End_Cidade}/{cliente.End_Estado}
                                        </div>
                                        <div className="flex gap-1 mt-1">
                                            {(cliente.Formas_Atendimento || []).map(forma => (
                                                <span key={forma} title={forma} className="p-0.5 bg-gray-50 rounded text-gray-500 border border-gray-100">
                                                    {forma === 'Presencial' && <User className="h-3 w-3" />}
                                                    {forma === 'Whatsapp' && <MessageCircle className="h-3 w-3" />}
                                                    {forma === 'Telefone' && <Phone className="h-3 w-3" />}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {cliente.vendedor?.nome || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {cliente.Dia_de_entrega || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {cliente.Dia_de_venda || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                                        {cliente.Documento}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile List (Simplificada) */}
            <div className="md:hidden mt-4 space-y-4">
                {clientes.map((cliente) => (
                    <div
                        key={cliente.UUID}
                        className={`bg-white p-4 rounded-lg shadow-sm border ${selectedIds.includes(cliente.UUID) ? 'border-primary bg-blue-50' : 'border-gray-100'} space-y-2`}
                    >
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                className="mt-1 rounded border-gray-300 text-primary focus:ring-primary h-5 w-5"
                                checked={selectedIds.includes(cliente.UUID)}
                                onChange={() => handleSelectOne(cliente.UUID)}
                            />
                            <div className="flex-1" onClick={() => navigate(`/clientes/${cliente.UUID}`)}>
                                <div className="flex justify-between items-start">
                                    <div className="pr-2">
                                        <p className="text-xs text-gray-400 mb-0.5">Razão Social:</p>
                                        <h3 className="font-bold text-gray-900 text-sm leading-tight">
                                            {cliente.Nome}
                                        </h3>
                                    </div>
                                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-2 border-t border-gray-100 pt-2">
                                    <span className="text-gray-400 inline-block w-16">Fantasia:</span>
                                    <span className="font-medium">{cliente.NomeFantasia || cliente.Nome}</span>
                                </p>
                                <div className="flex gap-1 mt-2">
                                    {(cliente.Formas_Atendimento || []).map(forma => (
                                        <span key={forma} title={forma} className="p-1 bg-gray-100 rounded text-gray-600">
                                            {forma === 'Presencial' && <User className="h-3 w-3" />}
                                            {forma === 'Whatsapp' && <MessageCircle className="h-3 w-3" />}
                                            {forma === 'Telefone' && <Phone className="h-3 w-3" />}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Paginação e Limite */}
            <div className="flex flex-col md:flex-row justify-between items-center mt-6 gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Exibir</span>
                    <select
                        className="border border-gray-300 rounded text-sm p-1.5 focus:ring-primary bg-white text-gray-900"
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                    >
                        <option value="12">12</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                    <span className="text-sm text-gray-600">por página</span>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-700 font-medium bg-white border border-gray-200 rounded-md">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Próximo
                    </button>
                </div>
            </div>

            {/* Modal de Edição em Lote */}
            {
                isBatchModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <Settings className="h-5 w-5 text-primary" />
                                    Edição em Lote
                                </h3>
                                <button onClick={() => setIsBatchModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <AlertTriangle className="h-5 w-5 text-yellow-500" />
                                        </div>
                                        <div className="ml-3">
                                            <p className="text-sm text-yellow-700">
                                                Você está alterando <strong>{selectedIds.length}</strong> clientes.
                                                Preencha apenas os campos que deseja modificar. Campos vazios não serão alterados.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Novo Vendedor</label>
                                    <select
                                        className="block w-full border border-gray-300 rounded-md p-2.5 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                        value={batchData.idVendedor}
                                        onChange={(e) => setBatchData({ ...batchData, idVendedor: e.target.value })}
                                    >
                                        <option value="">Não alterar</option>
                                        {vendedores.map(v => (
                                            <option key={v.id} value={v.id}>{v.nome}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Novo Dia de Entrega</label>
                                    <select
                                        className="block w-full border border-gray-300 rounded-md p-2.5 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                        value={batchData.Dia_de_entrega}
                                        onChange={(e) => setBatchData({ ...batchData, Dia_de_entrega: e.target.value })}
                                    >
                                        <option value="">Não alterar</option>
                                        {DIAS_SEMANA.map(dia => (
                                            <option key={dia} value={dia}>{dia}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Novo Dia de Venda</label>
                                    <select
                                        className="block w-full border border-gray-300 rounded-md p-2.5 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                        value={batchData.Dia_de_venda}
                                        onChange={(e) => setBatchData({ ...batchData, Dia_de_venda: e.target.value })}
                                    >
                                        <option value="">Não alterar</option>
                                        {DIAS_SEMANA.map(dia => (
                                            <option key={dia} value={dia}>{dia}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Canais de Atendimento</label>
                                    <p className="text-xs text-gray-500 mb-2">Selecione para <strong>adicionar/sobrescrever</strong> a lista atual.</p>
                                    <div className="flex gap-2">
                                        {['Presencial', 'Whatsapp', 'Telefone'].map(canal => (
                                            <button
                                                key={canal}
                                                type="button"
                                                onClick={() => {
                                                    const atuais = batchData.Formas_Atendimento || [];
                                                    const novo = atuais.includes(canal)
                                                        ? atuais.filter(c => c !== canal)
                                                        : [...atuais, canal];
                                                    setBatchData({ ...batchData, Formas_Atendimento: novo });
                                                }}
                                                className={`px-3 py-1.5 rounded text-sm border flex items-center gap-1.5 transition-colors ${(batchData.Formas_Atendimento || []).includes(canal)
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {canal === 'Presencial' && <User className="h-3.5 w-3.5" />}
                                                {canal === 'Whatsapp' && <MessageCircle className="h-3.5 w-3.5" />}
                                                {canal === 'Telefone' && <Phone className="h-3.5 w-3.5" />}
                                                {canal}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                                <button
                                    onClick={() => setIsBatchModalOpen(false)}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleBatchSubmit}
                                    className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                                >
                                    <Save className="h-4 w-4" />
                                    Aplicar Alterações
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default ListaClientes;
