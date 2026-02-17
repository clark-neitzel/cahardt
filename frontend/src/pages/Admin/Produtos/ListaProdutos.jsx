
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import configService from '../../../services/configService';
import { Search, Edit, ArrowLeft, Filter } from 'lucide-react';
import MultiSelect from '../../../components/MultiSelect'; // Custom MultiSelect

const ListaProdutos = () => {
    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Filtros
    const [statusFilter, setStatusFilter] = useState('ativo'); // 'ativo', 'inativo', 'todos'
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [availableCategories, setAvailableCategories] = useState([]);

    const navigate = useNavigate();

    // Load Categories
    useEffect(() => {
        configService.getCategorias()
            .then(cats => setAvailableCategories(cats || []))
            .catch(err => console.error(err));
    }, []);

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
            // if 'todos', send nothing or 'all' (backend handles it)

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

    useEffect(() => {
        setPage(1); // Reset page when filters change
        fetchProdutos();
    }, [search, statusFilter, selectedCategories]);

    useEffect(() => {
        fetchProdutos();
    }, [page]);

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
                                onClick={() => setStatusFilter(status)}
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
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 w-full border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary py-2 shadow-sm"
                            />
                        </div>

                        <div className="w-full md:w-64 z-20">
                            <MultiSelect
                                options={availableCategories}
                                selected={selectedCategories}
                                onChange={setSelectedCategories}
                                placeholder="Filtrar por Categoria"
                            />
                        </div>
                    </div>
                </div>

                {/* Tabela */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Produto
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Categoria / Preço
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Estoque
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">Ações</span>
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
                                    <tr key={produto.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden border border-gray-200">
                                                    {produto.imagens && produto.imagens.length > 0 ? (
                                                        <img className="h-full w-full object-cover" src={`https://api-contaazul-jbv8.onrender.com${produto.imagens[0].url}`} alt="" />
                                                    ) : (
                                                        <div className="h-full w-full flex items-center justify-center text-gray-400">
                                                            <div className="text-xs">Sem foto</div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900 line-clamp-1 max-w-xs" title={produto.nome}>
                                                        {produto.nome}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Cód: {produto.codigo}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-bold text-gray-900">
                                                R$ {Number(produto.valorVenda || 0).toFixed(2).replace('.', ',')}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {produto.categoria || 'Sem categoria'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm">
                                                <span className={`font-semibold ${produto.estoqueDisponivel > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {produto.estoqueDisponivel} unid.
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                Total: {produto.estoqueTotal}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${produto.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {produto.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Link
                                                to={`/admin/produtos/${produto.id}`}
                                                className="text-primary hover:text-blue-900 flex items-center justify-end"
                                            >
                                                <Edit className="h-4 w-4 mr-1" /> Editar
                                            </Link>
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

