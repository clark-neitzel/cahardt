import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import { API_URL } from '../../../services/api';
import StatusBadge from '../../../components/StatusBadge';
import { Edit, Eye, Search } from 'lucide-react';

const ListaProdutos = () => {
    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchProdutos = async () => {
        setLoading(true);
        try {
            const data = await produtoService.listar({ page, limit: 10, search });
            setProdutos(data.data);
            setTotalPages(data.meta.totalPages);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (produto) => {
        if (!window.confirm(`Deseja ${produto.ativo ? 'inativar' : 'ativar'} este produto?`)) return;
        try {
            await produtoService.alterarStatus(produto.id, !produto.ativo);
            fetchProdutos(); // Recarrega lista
        } catch (error) {
            alert('Erro ao alterar status');
        }
    };

    useEffect(() => {
        fetchProdutos();
    }, [page, search]);

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Gerenciar Produtos</h1>
                <Link to="/admin/sync">
                    <button className="text-primary hover:underline">Ir para Sync</button>
                </Link>
            </div>

            <div className="mb-4">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                        placeholder="Buscar por nome, código..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Produto
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Preço
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
                            <tr><td colSpan="5" className="text-center py-4">Carregando...</td></tr>
                        ) : produtos.map((produto) => (
                            <tr key={produto.id}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0">
                                            <img
                                                className="h-10 w-10 rounded-full object-cover bg-gray-100"
                                                src={produto.imagens.length > 0 ? `${API_URL}${produto.imagens[0].url}` : 'https://via.placeholder.com/40?text=S'}
                                                alt=""
                                            />
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{produto.nome}</div>
                                            <div className="text-sm text-gray-500">{produto.codigo}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">R$ {Number(produto.precoVenda).toFixed(2)}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{produto.saldoEstoque} {produto.unidade}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button onClick={() => handleToggleStatus(produto)}>
                                        <StatusBadge ativo={produto.ativo} estoque={produto.saldoEstoque} />
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Link to={`/admin/produtos/${produto.id}`} className="text-indigo-600 hover:text-indigo-900 mr-4 inline-flex items-center">
                                        <Edit className="h-4 w-4 mr-1" /> Editar
                                    </Link>
                                    <Link to={`/produto/${produto.id}`} className="text-gray-600 hover:text-gray-900 inline-flex items-center">
                                        <Eye className="h-4 w-4 mr-1" /> Ver
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Paginação */}
            <div className="py-3 flex items-center justify-between border-t border-gray-200">
                <div className="flex-1 flex justify-between sm:hidden">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                        Anterior
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
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
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                                Anterior
                            </button>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                                Próxima
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ListaProdutos;
