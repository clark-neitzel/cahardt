import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import { API_URL } from '../../../services/api';
import StatusBadge from '../../../components/StatusBadge';
import { Edit, Eye, Search, MoreVertical } from 'lucide-react';

const ListaProdutos = () => {
    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const navigate = useNavigate();

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

    const handleToggleStatus = async (e, produto) => {
        e.stopPropagation(); // Prevent card click
        if (!window.confirm(`Deseja ${produto.ativo ? 'inativar' : 'ativar'} este produto?`)) return;
        try {
            await produtoService.alterarStatus(produto.id, !produto.ativo);
            fetchProdutos();
        } catch (error) {
            alert('Erro ao alterar status');
        }
    };

    useEffect(() => {
        fetchProdutos();
    }, [page, search]);

    return (
        <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-xl font-bold text-gray-800">Gerenciar Produtos</h1>
                <Link to="/admin/sync" className="text-sm text-primary font-medium hover:underline">
                    Ir para Sync
                </Link>
            </div>

            {/* Search */}
            <div className="mb-4">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm shadow-sm"
                        placeholder="Buscar por nome, código..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Loading */}
            {loading && <div className="text-center py-8 text-gray-500 text-sm">Carregando...</div>}

            {/* Desktop Table (Hidden on Mobile) */}
            <div className="hidden sm:block bg-white shadow overflow-hidden rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preço</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estoque</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {produtos.map((produto) => (
                            <tr key={produto.id} className="hover:bg-gray-50">
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">R$ {Number(produto.valorVenda).toFixed(2)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{produto.estoqueDisponivel} {produto.unidade}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button onClick={(e) => handleToggleStatus(e, produto)}>
                                        <StatusBadge ativo={produto.ativo} estoque={produto.estoqueDisponivel} />
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

            {/* Mobile Cards (Visible only on Mobile) */}
            <div className="sm:hidden space-y-3">
                {produtos.map((produto) => (
                    <div
                        key={produto.id}
                        onClick={() => navigate(`/admin/produtos/${produto.id}`)} // Mudei para EDITAR direto ao clicar
                        className="bg-white p-3 rounded-lg shadow flex items-center space-x-3 cursor-pointer active:bg-gray-50 border border-gray-100"
                    >
                        {/* Imagem Pequena */}
                        <div className="flex-shrink-0">
                            <img
                                className="h-12 w-12 rounded-md object-cover bg-gray-100 border border-gray-200"
                                src={produto.imagens.length > 0 ? `${API_URL}${produto.imagens[0].url}` : 'https://via.placeholder.com/40?text=S'}
                                alt=""
                            />
                        </div>

                        {/* Conteúdo Compacto */}
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <p className="text-xs font-bold text-gray-900 truncate pr-2 leading-tight">
                                    {produto.nome}
                                </p>
                                {/* Status Compacto */}
                                <div onClick={(e) => handleToggleStatus(e, produto)}>
                                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${produto.ativo ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Cod: {produto.codigo}</p>

                            <div className="flex justify-between items-end mt-1">
                                <p className="text-sm font-bold text-primary">R$ {Number(produto.valorVenda).toFixed(2)}</p>
                                <p className="text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                                    Est: {produto.estoqueDisponivel}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Paginação Simplificada Mobile */}
            <div className="py-4 flex justify-between items-center text-sm">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 border rounded bg-white disabled:opacity-50 text-gray-700"
                >
                    Anterior
                </button>
                <span className="text-gray-600">Pág {page} de {totalPages}</span>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 border rounded bg-white disabled:opacity-50 text-gray-700"
                >
                    Próxima
                </button>
            </div>
        </div>
    );
};

export default ListaProdutos;
