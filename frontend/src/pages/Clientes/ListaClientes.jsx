
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import { Search, MapPin, Phone, Truck, Building, User } from 'lucide-react';

const ListaClientes = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const initialSearch = searchParams.get('search') || '';
    const initialPage = parseInt(searchParams.get('page')) || 1;

    const navigate = useNavigate();
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(initialSearch);
    const [page, setPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(1);
    const [activeTab, setActiveTab] = useState('ativos'); // 'ativos' ou 'inativos'

    // Sync State -> URL
    useEffect(() => {
        const params = {};
        if (search) params.search = search;
        if (page > 1) params.page = page;
        setSearchParams(params, { replace: true });
    }, [search, page, setSearchParams]);

    const fetchClientes = async () => {
        setLoading(true);
        try {
            const ativo = activeTab === 'ativos';
            const data = await clienteService.listar({ page, limit: 12, search, ativo });
            setClientes(data.data);
            setTotalPages(data.meta.totalPages);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Debounce search
        const timeoutId = setTimeout(() => {
            fetchClientes();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [page, search, activeTab]);

    const handleSearch = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    // Helper para formatar Perfis (assumindo string ou array)
    const formatarPerfis = (perfis) => {
        if (!perfis) return [];
        let lista = [];

        // 1. Normalizar entrada para Array
        if (Array.isArray(perfis)) {
            lista = perfis;
        } else if (typeof perfis === 'string') {
            try {
                const parsed = JSON.parse(perfis);
                lista = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                lista = perfis.split(',').map(p => p.trim());
            }
        } else {
            lista = [String(perfis)];
        }

        // 2. Extrair string "tipo_perfil" se for objeto
        return lista.map(item => {
            if (typeof item === 'object' && item !== null) {
                return item.tipo_perfil || item.nome || JSON.stringify(item);
            }
            return String(item);
        }).filter(Boolean); // Remove vazios
    };

    // Helper para cores de badges
    const getBadgeColor = (perfil) => {
        const p = perfil.toLowerCase();
        if (p.includes('cliente')) return 'bg-blue-100 text-blue-800';
        if (p.includes('fornecedor')) return 'bg-purple-100 text-purple-800';
        if (p.includes('transportadora')) return 'bg-orange-100 text-orange-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Meus Clientes</h1>
                    <p className="mt-1 text-sm text-gray-500">Gerencie sua base de clientes, fornecedores e transportadoras</p>
                </div>
            </div>

            {/* Tabs Ativos/Inativos */}
            <div className="flex border-b border-gray-200 mb-6">
                <button
                    onClick={() => { setActiveTab('ativos'); setPage(1); }}
                    className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'ativos'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Ativos
                </button>
                <button
                    onClick={() => { setActiveTab('inativos'); setPage(1); }}
                    className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'inativos'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    Inativos
                </button>
            </div>

            {/* Barra de Busca */}
            <div className="mb-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm shadow-sm"
                    placeholder="Buscar por nome, fantasia, documento ou código..."
                    value={search}
                    onChange={handleSearch}
                />
            </div>

            {/* Tabela de Clientes (Desktop) */}
            <div className="hidden md:block bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Identificação
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Vendedor
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Dia de Entrega
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Dia de Venda
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                CNPJ/CPF
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                    <div className="flex justify-center items-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                                        Carregando clientes...
                                    </div>
                                </td>
                            </tr>
                        ) : clientes.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                    Nenhum cliente encontrado.
                                </td>
                            </tr>
                        ) : (
                            clientes.map((cliente) => (
                                <tr
                                    key={cliente.id || cliente.UUID}
                                    onClick={() => navigate(`/clientes/${cliente.UUID}`)}
                                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                    {/* Identificação */}
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                                                    {(cliente.Nome || '').charAt(0).match(/[a-z]/i) ? (
                                                        (cliente.Nome || '').charAt(0).toUpperCase()
                                                    ) : (
                                                        <User className="h-5 w-5" />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {cliente.Nome || 'N/A'}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {cliente.NomeFantasia || '-'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Vendedor */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {cliente.vendedor?.nome || '-'}
                                    </td>

                                    {/* Dia de Entrega */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {cliente.Dia_de_entrega || '-'}
                                    </td>

                                    {/* Dia de Venda */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {cliente.Dia_de_venda || '-'}
                                    </td>

                                    {/* CNPJ/CPF */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {cliente.Documento ? (
                                            cliente.Documento.length === 14 ? (
                                                // CNPJ: 00.000.000/0000-00
                                                cliente.Documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                                            ) : (
                                                // CPF: 000.000.000-00
                                                cliente.Documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                                            )
                                        ) : '-'}
                                    </td>

                                    {/* Status */}
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div >

            {/* Lista Mobile */}
            <div className="md:hidden mt-4 space-y-4">
                {
                    loading ? (
                        <div className="text-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                        </div>
                    ) : clientes.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                            Nenhum cliente encontrado.
                        </div>
                    ) : (
                        clientes.map((cliente) => (
                            <div
                                key={cliente.id || cliente.UUID}
                                onClick={() => navigate(`/clientes/${cliente.UUID}`)}
                                className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 space-y-3 cursor-pointer hover:shadow-md transition-shadow"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900">{cliente.Nome || 'N/A'}</h3>
                                        <p className="text-xs text-gray-500">{cliente.NomeFantasia || '-'}</p>
                                    </div>
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>

                                <div className="text-sm text-gray-600 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <User className="h-3 w-3" />
                                        <span className="truncate">{cliente.vendedor?.nome || 'Sem vendedor'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Truck className="h-3 w-3" />
                                        <span>Entrega: {cliente.Dia_de_entrega || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-3 w-3" />
                                        <span>{cliente.Documento || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
            </div >

            {/* Paginação */}
            {
                totalPages > 1 && (
                    <div className="flex justify-center mt-8">
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Anterior
                            </button>
                            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Próxima
                            </button>
                        </nav>
                    </div>
                )
            }
        </div >
    );
};

export default ListaClientes;
