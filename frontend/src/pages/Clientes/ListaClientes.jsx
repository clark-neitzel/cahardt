import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import { Search, MapPin, Phone, Truck, Building, User } from 'lucide-react';

const ListaClientes = () => {
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchClientes = async () => {
        setLoading(true);
        try {
            const data = await clienteService.listar({ page, limit: 12, search });
            setClientes(data.data);
            setTotalPages(data.meta.totalPages);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClientes();
    }, [page, search]);

    // Helper para formatar Perfis (assumindo string ou array)
    const formatarPerfis = (perfis) => {
        if (!perfis) return [];
        let lista = [];
        if (Array.isArray(perfis)) lista = perfis;
        if (typeof perfis === 'string') {
            try {
                lista = JSON.parse(perfis);
            } catch {
                lista = perfis.split(',').map(p => p.trim());
            }
        }
        return Array.isArray(lista) ? lista : [String(lista)];
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
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Tabela de Clientes */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                                Identificação
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Contato & Localização
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Perfis
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="4" className="px-6 py-10 text-center text-gray-500">Carregando clientes...</td></tr>
                        ) : clientes.length === 0 ? (
                            <tr><td colSpan="4" className="px-6 py-10 text-center text-gray-500">Nenhum cliente encontrado.</td></tr>
                        ) : (
                            clientes.map((cliente) => (
                                <tr key={cliente.UUID} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-start">
                                            <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                                {cliente.Tipo_Pessoa === 'JURIDICA' ? <Building className="h-5 w-5" /> : <User className="h-5 w-5" />}
                                            </div>
                                            <div className="ml-4">
                                                <Link to={`/clientes/${cliente.UUID}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-900 hover:underline block">
                                                    {cliente.Nome}
                                                </Link>
                                                {cliente.NomeFantasia && (
                                                    <div className="text-sm text-gray-500">{cliente.NomeFantasia}</div>
                                                )}
                                                <div className="text-xs text-gray-400 mt-1 font-mono">
                                                    {cliente.Tipo_Pessoa === 'JURIDICA' ? 'CNPJ' : 'CPF'}: {cliente.Documento || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-sm text-gray-500 space-y-1">
                                        <div className="flex items-center">
                                            <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                                            <span>
                                                {cliente.End_Cidade ? `${cliente.End_Cidade}/${cliente.End_Estado}` : 'Localização não definida'}
                                            </span>
                                        </div>
                                        <div className="flex items-center">
                                            <Phone className="h-4 w-4 mr-2 text-gray-400" />
                                            <span>{cliente.Telefone_Celular || cliente.Telefone || 'Sem telefone'}</span>
                                        </div>
                                        {cliente.Dia_de_entrega && (
                                            <div className="flex items-center text-orange-600">
                                                <Truck className="h-4 w-4 mr-2" />
                                                <span className="text-xs font-semibold">Entrega: {cliente.Dia_de_entrega}</span>
                                            </div>
                                        )}
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {formatarPerfis(cliente.Perfis).map((perfil, idx) => (
                                                <span key={idx} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(perfil)}`}>
                                                    {perfil}
                                                </span>
                                            ))}
                                            {formatarPerfis(cliente.Perfis).length === 0 && (
                                                <span className="text-xs text-gray-400 italic">Sem perfil</span>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                        <span className={`inline-flex px-2 text-xs leading-5 font-semibold rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="mt-6 flex justify-between items-center bg-white px-4 py-3 border border-gray-200 rounded-lg sm:px-6">
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
            )}
        </div>
    );
};

export default ListaClientes;
