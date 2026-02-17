
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import configService from '../../../services/configService';
import { Search, Edit, ArrowLeft, Filter } from 'lucide-react';
import MultiSelect from '../../../components/MultiSelect'; // Custom MultiSelect

const ListaProdutos = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Initial State from URL
    const initialSearch = searchParams.get('search') || '';
    const initialPage = parseInt(searchParams.get('page')) || 1;
    const initialStatus = searchParams.get('ativo') || 'ativo'; // 'ativo' | 'inativo' | 'todos'
    const initialCategoriaStr = searchParams.get('categorias') || '';
    const initialCategories = initialCategoriaStr ? initialCategoriaStr.split(',') : [];

    // Local State
    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalPages, setTotalPages] = useState(1);

    // Controlled Inputs
    const [search, setSearch] = useState(initialSearch);
    const [page, setPage] = useState(initialPage);
    const [statusFilter, setStatusFilter] = useState(initialStatus);
    const [selectedCategories, setSelectedCategories] = useState(initialCategories);
    const [availableCategories, setAvailableCategories] = useState([]);

    // Load Categories
    useEffect(() => {
        configService.getCategorias()
            .then(cats => setAvailableCategories(cats || []))
            .catch(err => console.error(err));
    }, []);

    // Sync State -> URL
    useEffect(() => {
        const params = {};
        if (search) params.search = search;
        if (page > 1) params.page = page;
        if (statusFilter !== 'ativo') params.ativo = statusFilter;
        if (selectedCategories.length > 0) params.categorias = selectedCategories.join(',');

        setSearchParams(params, { replace: true });
    }, [search, page, statusFilter, selectedCategories, setSearchParams]);

    // Fetch on State Change
    useEffect(() => {
        const fetchProdutos = async () => {
            setLoading(true);
            try {
                const params = {
                    page,
                    limit: 10,
                    search
                };

                // Status Filter Logic
                if (statusFilter === 'ativo') params.ativo = true;
                if (statusFilter === 'inativo') params.ativo = false;
                // if 'todos', backend handles it

                // Category Filter
                if (selectedCategories.length > 0) {
                    params.categorias = selectedCategories.join(',');
                }

                const data = await produtoService.listar(params);
                setProdutos(data.data);
                setTotalPages(data.meta.totalPages);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        // Debounce search slightly to avoid excessive calls while typing
        const timeoutId = setTimeout(() => {
            fetchProdutos();
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [page, search, statusFilter, selectedCategories]);

    // Handle Search Input Change
    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(1); // Reset page on search
    };

    // Handle Filter Changes
    const handleStatusChange = (status) => {
        setStatusFilter(status);
        setPage(1);
    };

    const handleCategoryChange = (cats) => {
        setSelectedCategories(cats);
        setPage(1);
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Gerenciar Produtos</h1>
                <Link
                    to="/admin/sync"
                    className="text-primary hover:text-blue-700 text-sm font-medium flex items-center"
                >
                    ir para Sincronização <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                </Link>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Header de Filtros */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row gap-4 items-center justify-between">
                    {/* Tabs de Status */}
                    <div className="flex space-x-1 bg-gray-200 p-1 rounded-lg self-start md:self-auto">
                        {['ativo', 'inativo', 'todos'].map((status) => (
                            <button
                                key={status}
                                onClick={() => handleStatusChange(status)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${statusFilter === status
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                    }`}
                            >
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Filtros de Busca e Categoria */}
                    <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                        <div className="relative w-full md:w-64">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar por nome, código ou EAN..."
                                value={search}
                                onChange={handleSearchChange}
                                className="pl-9 w-full border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary py-2 shadow-sm text-gray-900 bg-white"
                            />
                        </div>

                        <div className="w-full md:w-64 z-20">
                            <MultiSelect
                                options={availableCategories}
                                selected={selectedCategories}
                                onChange={handleCategoryChange}
                                placeholder="Filtrar por Categoria"
                            />
                        </div>
                    </div>
                </div>

                {/* Lista de Produtos (Mobile) */}
                <div className="md:hidden divide-y divide-gray-200">
                    {loading ? (
                        <div className="p-4 text-center text-gray-500">
                            <div className="flex justify-center items-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                                Carregando...
                            </div>
                        </div>
                    ) : produtos.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                            Nenhum produto encontrado.
                        </div>
                    ) : (
                        produtos.map((produto) => (
                            <div
                                key={produto.id || produto.uuid}
                                onClick={() => navigate(`/admin/produtos/editar/${produto.id || produto.uuid}`, {
                                    state: { search, page, statusFilter, selectedCategories }
                                })}
                                className="p-4 active:bg-gray-50 flex items-center justify-between cursor-pointer"
                            >
                                <div className="flex items-center flex-1 min-w-0">
                                    <div className="h-10 w-10 flex-shrink-0">
                                        {produto.imagens && produto.imagens.length > 0 ? (
                                            <img className="h-10 w-10 rounded object-cover" src={`https://api-contaazul-jbv8.onrender.com${produto.imagens[0].url}`} alt="" />
                                        ) : (
                                            <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                                                Sem foto
                                            </div>
                                        )}
                                    </div>
                                    <div className="ml-3 flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">
                                            {produto.nome}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {produto.codigo} • {produto.categoria || 'Sem Cat.'}
                                        </div>
                                        <div className="flex mt-1 space-x-3 text-xs">
                                            <span className={Number(produto.estoqueDisponivel) > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                                {Number(produto.estoqueDisponivel)} {produto.unidade}
                                            </span>
                                            <span className="text-gray-900">
                                                Venda: R$ {Number(produto.valorVenda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Tabela de Produtos (Desktop) */}
                <div className="hidden md:block bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                                    Produto
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Classificação
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Custos & Preços
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Estoque
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                                        <div className="flex justify-center items-center">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                                            Carregando produtos...
                                        </div>
                                    </td>
                                </tr>
                            ) : produtos.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                                        Nenhum produto encontrado.
                                    </td>
                                </tr>
                            ) : (
                                produtos.map((produto) => (
                                    <tr
                                        key={produto.id || produto.uuid}
                                        onClick={() => navigate(`/admin/produtos/editar/${produto.id || produto.uuid}`, {
                                            state: { search, page, statusFilter, selectedCategories }
                                        })}
                                        className="hover:bg-gray-50 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 flex-shrink-0">
                                                    {produto.imagens && produto.imagens.length > 0 ? (
                                                        <img className="h-10 w-10 rounded object-cover" src={`https://api-contaazul-jbv8.onrender.com${produto.imagens[0].url}`} alt="" />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                                                            Sem foto
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900 group-hover:text-primary transition-colors">
                                                        {produto.nome}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Cód: {produto.codigo}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{produto.categoria || 'Sem Categoria'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-900">
                                                    Venda: R$ {Number(produto.valorVenda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    Custo: R$ {Number(produto.custoMedio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col">
                                                <span className={`text-sm font-bold ${Number(produto.estoqueDisponivel) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {Number(produto.estoqueDisponivel).toLocaleString('pt-BR')} {produto.unidade}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    Total: {Number(produto.estoqueTotal).toLocaleString('pt-BR')}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Paginação */}
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-gray-700">
                                Mostrando página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
                            </p>
                        </div>
                        <div>
                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Próxima
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ListaProdutos;
