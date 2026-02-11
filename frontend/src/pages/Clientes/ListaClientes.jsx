import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clienteService from '../../../services/clienteService';
import { Search, MapPin, Phone, Truck } from 'lucide-react';

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

    return (
        <div className="container mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Meus Clientes</h1>

            {/* Barra de Busca */}
            <div className="mb-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm shadow-sm"
                    placeholder="Buscar por nome, documento ou código..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Grid de Clientes */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-full text-center py-10 text-gray-500">Carregando clientes...</div>
                ) : clientes.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-gray-500">Nenhum cliente encontrado.</div>
                ) : (
                    clientes.map((cliente) => (
                        <Link
                            key={cliente.UUID}
                            to={`/clientes/${cliente.UUID}`}
                            className="bg-white rounded-lg shadow hover:shadow-md transition-shadow duration-200 overflow-hidden border border-gray-100"
                        >
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-lg font-bold text-gray-900 line-clamp-1">{cliente.Nome}</h3>
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>

                                <p className="text-sm text-gray-500 mb-4">{cliente.Tipo_Pessoa === 'JURIDICA' ? 'CNPJ' : 'CPF'}: {cliente.Documento}</p>

                                <div className="space-y-2 text-sm text-gray-600">
                                    <div className="flex items-center">
                                        <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                                        <span className="truncate">
                                            {cliente.End_Cidade}/{cliente.End_Estado} - {cliente.End_Bairro}
                                        </span>
                                    </div>
                                    <div className="flex items-center">
                                        <Truck className="h-4 w-4 mr-2 text-gray-400" />
                                        <span>Entrega: {cliente.Dia_de_entrega || 'Não definido'}</span>
                                    </div>
                                    <div className="flex items-center">
                                        <Phone className="h-4 w-4 mr-2 text-gray-400" />
                                        <span>{cliente.Telefone_Celular || cliente.Telefone || 'Sem telefone'}</span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))
                )}
            </div>

            {/* Paginação Simples */}
            {totalPages > 1 && (
                <div className="mt-8 flex justify-center space-x-4">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 border border-gray-300 rounded-md bg-white text-sm disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <span className="flex items-center text-gray-600">
                        Página {page} de {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 border border-gray-300 rounded-md bg-white text-sm disabled:opacity-50"
                    >
                        Próxima
                    </button>
                </div>
            )}
        </div>
    );
};

export default ListaClientes;
