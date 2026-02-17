
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import configService from '../../../services/configService'; // Import Config Service
import { API_URL } from '../../../services/api';
import StatusBadge from '../../../components/StatusBadge';
import { Edit, Eye, Search, Filter } from 'lucide-react';

const ListaProdutos = () => {
    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Filters
    const [statusFilter, setStatusFilter] = useState('true'); // 'true' (Ativos), 'false' (Inativos), 'all' (Todos)
    const [selectedCategorias, setSelectedCategorias] = useState([]);
    const [allCategorias, setAllCategorias] = useState([]);

    const navigate = useNavigate();

    // Load Categories on mount
    useEffect(() => {
        configService.getCategorias().then(setAllCategorias).catch(console.error);
    }, []);

    const fetchProdutos = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                limit: 10,
                search,
                ativo: statusFilter
            };

            if (selectedCategorias.length > 0) {
                params.categorias = selectedCategorias.join(',');
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

    const handleToggleStatus = async (e, produto) => {
        e.stopPropagation();
        if (!window.confirm(`Deseja ${produto.ativo ? 'inativar' : 'ativar'} este produto ? `)) return;
        try {
            await produtoService.alterarStatus(produto.id, !produto.ativo);
            fetchProdutos();
        } catch (error) {
            alert('Erro ao alterar status');
        }
    };

    useEffect(() => {
        fetchProdutos();
    }, [page, search, statusFilter, selectedCategorias]);

    // Tabs Components
    const Tab = ({ label, value, current }) => (
        <button
            onClick={() => { setStatusFilter(value); setPage(1); }}
            className={`flex - 1 py - 4 px - 4 text - center border - b - 2 font - medium text - sm focus: outline - none transition - colors
                ${current === value
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } `}
        >
            {label}
        </button>
    );

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Gerenciar Produtos</h1>
                <Link to="/admin/sync" className="text-sm font-medium text-primary hover:text-blue-700 transition-colors">
                    Ir para Sincronização
                </Link>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden mb-6">
                {/* Status Tabs */}
                <div className="flex border-b border-gray-200">
                    <Tab label="Ativos" value="true" current={statusFilter} />
                    <Tab label="Inativos" value="false" current={statusFilter} />
                    <Tab label="Todos" value="all" current={statusFilter} />
                </div>

                {/* Filters Toolbar */}
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
                    {/* Search */}
                    <div className="relative flex-grow">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                            placeholder="Buscar por nome, código ou EAN..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Category Filter */}
                    <div className="w-full sm:w-64">
                        <select
                            multiple
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md"
                            value={selectedCategorias}
                            onChange={(e) => {
                                const options = e.target.options;
                                const value = [];
                                for (let i = 0, l = options.length; i < l; i++) {
                                    if (options[i].selected) {
                                        value.push(options[i].value);
                                    }
                                }
                                setSelectedCategorias(value);
                                setPage(1);
                            }}
                            style={{ height: '42px' }} // Quick fix for single line
                        >
                            <option value="" disabled className="text-gray-400">Filtrar por Categoria (Ctrl+Click)</option>
                            {allCategorias.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">Segure Ctrl (Win) ou Cmd (Mac) para selecionar várias.</p>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria / Preço</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estoque</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                                        Carregando produtos...
                                    </td>
                                </tr>
                            ) : produtos.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                                        Nenhum produto encontrado com os filtros atuais.
                                    </td>
                                </tr>
                            ) : (
                                produtos.map((produto) => (
                                    <tr key={produto.id} className={`hover: bg - gray - 50 ${!produto.ativo ? 'bg-gray-50 opacity-75' : ''} `}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 flex-shrink-0">
                                                    <img
                                                        className="h-10 w-10 rounded bg-gray-100 object-cover"
                                                        src={produto.imagens.length > 0 ? `${API_URL}${produto.imagens[0].url} ` : 'https://via.placeholder.com/40?text=IMG'}
                                                        alt=""
                                                    />
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900 line-clamp-1" title={produto.nome}>{produto.nome}</div>
                                                    <div className="text-xs text-gray-500">Cod: {produto.codigo}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900 font-medium">R$ {Number(produto.valorVenda).toFixed(2)}</div>
                                            <div className="text-xs text-gray-500">{produto.categoria || 'Sem Categoria'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className={produto.estoqueDisponivel > 0 ? 'text-green-600 font-bold' : 'text-red-500'}>
                                                {Number(produto.estoqueDisponivel)} unid.
                                            </div>
                                            <div className="text-xs text-gray-400">Total: {Number(produto.estoqueTotal)}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={(e) => handleToggleStatus(e, produto)}
                                                className={`px - 2 py - 1 inline - flex text - xs leading - 5 font - semibold rounded - full cursor - pointer transition - colors
                                                ${produto.ativo
                                                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                        : 'bg-red-100 text-red-800 hover:bg-red-200'
                                                    } `}
                                            >
                                                {produto.ativo ? 'Ativo' : 'Inativo'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end space-x-3">
                                                <Link to={`/ admin / produtos / ${produto.id} `} className="text-primary hover:text-blue-900 flex items-center">
                                                    <Edit className="h-4 w-4 mr-1" /> Editar
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                    <div className="flex-1 flex justify-between sm:hidden">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                            Anterior
                        </button>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                            Próxima
                        </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-gray-700">
                                Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
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

